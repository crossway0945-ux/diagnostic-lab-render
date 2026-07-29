import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, rename, unlink, readdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { resolveDataDir } from "./storage.js";

// Admin-only Canonical QA export (feature: "Export Canonical QA JSON").
// - A QA snapshot of the FULL canonical data (pre-projection) is written for FUTURE analyses under
//   <DATA_DIR>/qa-canonical/<reportId>.json, atomically, redacted of secrets.
// - Existing reports (no snapshot) still export a substantial QA JSON assembled from the persisted
//   record: sourceInput (prompt+writing), versions, feedbackCards (the per-issue canonical layer),
//   top issues, framework and criteria scores, and the student view model. Fields that were never
//   persisted for that report version are marked { available:false, reason:"NOT_PERSISTED..." }.
// Never writes or exports secrets, other students' data, prompts, or filesystem paths.

export const QA_EXPORT_VERSION = "canonical-qa-export-v12.9.7";
const NOT_PERSISTED = Object.freeze({ available: false, reason: "NOT_PERSISTED_IN_THIS_REPORT_VERSION" });

// Keys that must never appear in a snapshot or an export, at any depth.
const SECRET_KEY_PATTERN = /(?:^|_|-)(?:api[_-]?key|openai|authorization|auth[_-]?token|session[_-]?secret|admin[_-]?secret|secret|password|passwordhash|pwd|cookie|refresh[_-]?token|bearer|env|systemprompt|system[_-]?prompt|rawresponse|raw[_-]?provider|stack)(?:$|_|-)/i;
const SECRET_VALUE_PATTERN = /\bsk-[A-Za-z0-9]{16,}\b|Bearer\s+[A-Za-z0-9._-]{16,}/;

// Deep clone that drops secret-looking keys and scrubs secret-looking string values.
export function redactForQa(value, depth = 0) {
  if (depth > 40 || value == null) return value === undefined ? null : value;
  if (typeof value === "string") return SECRET_VALUE_PATTERN.test(value) ? "[redacted]" : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactForQa(item, depth + 1));
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    out[key] = redactForQa(val, depth + 1);
  }
  return out;
}

export function createQaCanonicalStore(options = {}) {
  const dataDir = options.dataDir || resolveDataDir(options.rootDir || process.cwd());
  return new QaCanonicalStore({ dir: path.join(dataDir, "qa-canonical") });
}

class QaCanonicalStore {
  constructor({ dir }) {
    this.dir = dir;
    this.name = "qa-canonical";
  }

  filePath(reportId) {
    return path.join(this.dir, `${sanitizeReportId(reportId)}.json`);
  }

  async write(reportId, snapshot) {
    const id = sanitizeReportId(reportId);
    if (id === "invalid-report-id") return false;
    await mkdir(this.dir, { recursive: true });
    const filePath = this.filePath(id);
    const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    const body = `${JSON.stringify(redactForQa(snapshot), null, 2)}\n`;
    try {
      await writeFile(tmp, body, "utf8");
      await rename(tmp, filePath);
      return true;
    } catch (error) {
      await unlink(tmp).catch(() => {});
      throw error;
    }
  }

  async read(reportId) {
    const filePath = this.filePath(reportId);
    if (!existsSync(filePath)) return null;
    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch {
      return null;
    }
  }

  async has(reportId) {
    return existsSync(this.filePath(reportId));
  }

  async delete(reportId) {
    await unlink(this.filePath(reportId)).catch(() => {});
    return true;
  }

  // Remove snapshots older than retentionDays (0/absent = keep all). Never touches student reports.
  async prune(retentionDays) {
    const days = Number(retentionDays);
    if (!Number.isFinite(days) || days <= 0 || !existsSync(this.dir)) return 0;
    const cutoff = Date.now() - days * 86400000;
    const names = await readdir(this.dir).catch(() => []);
    let pruned = 0;
    for (const name of names) {
      if (!name.endsWith(".json") || name.endsWith(".tmp")) continue;
      const info = await stat(path.join(this.dir, name)).catch(() => null);
      if (info && info.mtimeMs < cutoff) {
        await unlink(path.join(this.dir, name)).catch(() => {});
        pruned += 1;
      }
    }
    return pruned;
  }
}

// Build the FULL canonical QA snapshot for a freshly-completed analysis, from the pre-projection
// analysis object + the saved record. Called by the pipeline before internal objects are stripped.
export function buildQaSnapshot({ analysis = {}, savedRecord = {}, payload = {} }) {
  const versions = {
    appVersion: savedRecord.appVersion, engineVersion: savedRecord.engineVersion,
    promptVersion: savedRecord.promptVersion, rubricVersion: savedRecord.rubricVersion,
    reportSchemaVersion: savedRecord.reportSchemaVersion,
    feedbackSchemaVersion: analysis.feedbackSchemaVersion, issueTaxonomyVersion: analysis.issueTaxonomyVersion,
    evidenceValidatorVersion: analysis.evidenceValidatorVersion, revisionValidatorVersion: analysis.revisionValidatorVersion,
    providerModel: analysis.providerModel || "", reasoningEffort: analysis.providerReasoningEffort || ""
  };
  return {
    exportType: "canonical-qa-report",
    exportVersion: QA_EXPORT_VERSION,
    reportId: savedRecord.submissionId || "",
    requestId: payload.analysisRequestId || "",
    student: { studentId: savedRecord.studentProfileId || "", displayName: savedRecord.studentDisplayNameSnapshot || "" },
    taskInput: {
      taskType: savedRecord.taskType, essayType: savedRecord.essayType || "", visualType: savedRecord.visualType || "",
      prompt: payload.prompt || savedRecord.sourceInput?.prompt || "", studentWriting: payload.writing || savedRecord.sourceInput?.writing || "",
      wordCount: Number(savedRecord.wordCount || 0), diagnosticOptions: payload.options || {}
    },
    versions,
    canonicalAnalysis: analysis.canonicalAnalysis || analysis.canonicalTask2Analysis || NOT_PERSISTED,
    canonicalRoute: analysis.routeAssessment || analysis.canonicalAnalysis?.routeAssessment || NOT_PERSISTED,
    frozenScoring: { criteriaScores: analysis.criteriaScores || {}, kruPomScores: analysis.kruPomScores || {}, estimatedBandRange: analysis.estimatedBandRange || "" },
    canonicalIssues: Array.isArray(analysis.canonicalIssues) ? analysis.canonicalIssues : (Array.isArray(analysis.feedbackCards) ? analysis.feedbackCards : []),
    feedbackCards: Array.isArray(analysis.feedbackCards) ? analysis.feedbackCards : [],
    topIssues: Array.isArray(analysis.top3Issues) ? analysis.top3Issues : [],
    paragraphCoverage: Array.isArray(analysis.paragraphCoverage) ? analysis.paragraphCoverage : [],
    frameworkBreakdown: analysis.kruPomScores || {},
    executiveSummary: { mainScoreLimitingFactor: analysis.mainScoreLimitingFactor || "", mostUrgentRepair: analysis.mostUrgentRepair || "" },
    repairPlan: Array.isArray(analysis.practicePlan) ? analysis.practicePlan : [],
    revisionValidationResults: (Array.isArray(analysis.feedbackCards) ? analysis.feedbackCards : []).map((c) => ({
      issueId: c.issueId, revisionType: c.revisionType, revisionAlignmentStatus: c.revisionAlignmentStatus,
      grammarValidationStatus: c.grammarValidationStatus, semanticValidationStatus: c.semanticValidationStatus,
      taskFidelityStatus: c.taskFidelityStatus, revisionWithheld: c.revisionWithheld
    })),
    reportConsistencyAudit: analysis.consistencyAudit || analysis.feedbackIntegrity?.consistencyAudit || NOT_PERSISTED,
    providerMetadata: {
      responseStatus: analysis.providerResponseStatus || "", incompleteReason: analysis.incompleteReason || null,
      retryCount: Number(analysis.providerRetryCount || 0)
    }
  };
}

// Assemble a QA export for an EXISTING report from its persisted record (no snapshot). Substantial
// but partial: the per-issue canonical layer (feedbackCards) is present; top-level aggregates are not.
export function assembleQaExportFromRecord(record = {}) {
  const report = record.report || record.analysis || record;
  return redactForQa({
    exportType: "canonical-qa-report",
    exportVersion: QA_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    reportId: record.submissionId || "",
    requestId: record.analysisRequestId || "",
    canonicalDataSource: "persisted-record",
    student: { studentId: record.studentProfileId || "", displayName: record.studentDisplayNameSnapshot || "" },
    taskInput: {
      taskType: record.taskType, essayType: record.essayType || "", visualType: record.visualType || "",
      prompt: record.sourceInput?.prompt || "", studentWriting: record.sourceInput?.writing || "",
      wordCount: Number(record.wordCount || 0), diagnosticOptions: record.sourceInput?.diagnosticOptions || {}
    },
    versions: {
      appVersion: record.appVersion, engineVersion: record.engineVersion, promptVersion: record.promptVersion,
      rubricVersion: record.rubricVersion, reportSchemaVersion: record.reportSchemaVersion
    },
    canonicalAnalysis: NOT_PERSISTED,
    canonicalRoute: NOT_PERSISTED,
    frozenScoring: { criteriaScores: report.criteriaScores || record.criteriaScores || {}, kruPomScores: report.kruPomScores || record.kruPomScores || {}, estimatedBandRange: report.estimatedBandRange || record.estimatedBandRange || "" },
    canonicalIssues: Array.isArray(report.feedbackCards) ? report.feedbackCards : (Array.isArray(record.feedbackCards) ? record.feedbackCards : []),
    feedbackCards: Array.isArray(report.feedbackCards) ? report.feedbackCards : (Array.isArray(record.feedbackCards) ? record.feedbackCards : []),
    topIssues: Array.isArray(report.top3Issues) ? report.top3Issues : (Array.isArray(record.top3Issues) ? record.top3Issues : []),
    paragraphCoverage: report.studentReportViewModel?.paragraphCoverage || [],
    frameworkBreakdown: report.kruPomScores || record.kruPomScores || {},
    executiveSummary: { mainScoreLimitingFactor: report.mainScoreLimitingFactor || "", mostUrgentRepair: report.mostUrgentRepair || "" },
    repairPlan: Array.isArray(report.practicePlan) ? report.practicePlan : [],
    revisionValidationResults: (Array.isArray(report.feedbackCards) ? report.feedbackCards : []).map((c) => ({
      issueId: c.issueId, revisionType: c.revisionType, revisionAlignmentStatus: c.revisionAlignmentStatus, revisionWithheld: c.revisionWithheld
    })),
    studentReportViewModel: report.studentReportViewModel || {},
    reportConsistencyAudit: NOT_PERSISTED,
    providerMetadata: NOT_PERSISTED
  });
}

function sanitizeReportId(reportId) {
  return String(reportId || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 128) || "invalid-report-id";
}
