import { assertUnicodeIntegrity, normalizeVisibleTree } from "./textIntegrity.js";

export const STUDENT_REPORT_ALLOWLIST = Object.freeze([
  "reportHeader",
  "studentMetadata",
  "estimatedBandRange",
  "executiveSummary",
  "completionStatus",
  "positionAndRoute",
  "criteriaBreakdown",
  "frameworkBreakdown",
  "topIssues",
  "detailedFeedback",
  "repairPlan",
  "progressSummary",
  "disclaimer",
  "footer"
]);

export function buildStudentReportViewModel(analysis = {}, progressSummary = {}) {
  const taskType = String(analysis.taskType || "Task 2");
  const reportLanguage = String(analysis.reportLanguage || "en").toLowerCase() === "th" ? "th" : "en";
  const viewModel = normalizeVisibleTree({
    reportHeader: {
      productName: "IELTS Writing 7+ Diagnostic Lab",
      reportTitle: "IELTS Writing 7+ Diagnostic Report",
      reportLanguage,
      generatedAt: String(analysis.generatedAt || new Date().toISOString())
    },
    studentMetadata: {
      studentName: String(analysis.studentDisplayNameSnapshot || "-"),
      taskType,
      taskSubtype: taskType === "Task 1"
        ? String(analysis.visualType || "Not Sure")
        : String(analysis.task2EssayTypeLabel || analysis.essayType || "Not Sure"),
      wordCount: Number(analysis.wordCount || 0),
      minimumWordCount: Number(analysis.minimumWordCount || (taskType === "Task 1" ? 150 : 250)),
      wordCountStatus: String(analysis.wordCountStatus || "")
    },
    estimatedBandRange: String(analysis.estimatedBandRange || "-"),
    executiveSummary: {
      mainScoreLimitingFactor: String(analysis.mainScoreLimitingFactor || ""),
      mostUrgentRepair: String(analysis.mostUrgentRepair || "")
    },
    completionStatus: {
      status: String(analysis.completionStatus || (taskType === "Task 1" ? "complete" : "")),
      evidence: Array.isArray(analysis.completionEvidence) ? analysis.completionEvidence.map(String) : [],
      wordShortfall: Math.max(0, Number(analysis.wordShortfall || analysis.underLengthBy || 0))
    },
    positionAndRoute: {
      label: taskType === "Task 1" ? "Task 1 Data Route" : "Position and Route",
      position: String(analysis.detectedPosition || ""),
      confidence: String(analysis.positionConfidence || ""),
      summary: String(analysis.bodyRouteSummary || analysis.routeAssessment?.summary || "")
    },
    criteriaBreakdown: publicCriteria(analysis.criteriaScores),
    frameworkBreakdown: publicFramework(analysis.kruPomScores),
    topIssues: (Array.isArray(analysis.top3Issues) ? analysis.top3Issues : []).map(publicIssue),
    detailedFeedback: (Array.isArray(analysis.feedbackCards) ? analysis.feedbackCards : []).map(publicFeedback),
    repairPlan: (Array.isArray(analysis.practicePlan) ? analysis.practicePlan : []).map((item, index) => ({
      day: Number(item?.day || index + 1),
      title: String(item?.title || "Repair focus"),
      task: String(item?.task || item?.action || "")
    })),
    progressSummary: publicProgress(progressSummary),
    disclaimer: String(analysis.disclaimer || ""),
    footer: "Kru Pom IELTS | IELTS Writing 7+ Diagnostic Lab | Diagnostic estimate only"
  });
  assertStudentReportViewModel(viewModel);
  return viewModel;
}

export function buildAdminReportQAViewModel(analysis = {}, context = {}) {
  return {
    reportId: String(context.reportId || analysis.canonicalAnalysis?.metadata?.reportId || ""),
    submissionGroupId: String(context.submissionGroupId || ""),
    reportVersionId: String(context.reportVersionId || ""),
    fingerprints: clonePublicObject(context.fingerprints),
    engine: {
      appVersion: String(context.appVersion || analysis.appVersion || ""),
      engineVersion: String(context.engineVersion || analysis.engineVersion || ""),
      rubricVersion: String(context.rubricVersion || analysis.rubricVersion || ""),
      reportSchemaVersion: String(context.reportSchemaVersion || analysis.reportSchemaVersion || "")
    },
    validation: clonePublicObject(context.validation),
    migration: clonePublicObject(context.migration),
    progressTrace: clonePublicObject(context.progressTrace),
    pdfQA: clonePublicObject(context.pdfQA)
  };
}

export function assertStudentReportViewModel(viewModel) {
  const keys = Object.keys(viewModel || {});
  const extras = keys.filter((key) => !STUDENT_REPORT_ALLOWLIST.includes(key));
  const missing = STUDENT_REPORT_ALLOWLIST.filter((key) => !keys.includes(key));
  if (extras.length || missing.length) {
    throw new Error(`StudentReportViewModel allowlist mismatch. Extra: ${extras.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}.`);
  }
  assertUnicodeIntegrity(JSON.stringify(viewModel), { studentFacing: true });
  return true;
}

function publicIssue(issue = {}) {
  return {
    issueType: String(issue.issueType || issue.title || "Diagnostic Issue"),
    title: String(issue.title || issue.issueType || "Diagnostic Issue"),
    severity: String(issue.severity || "Moderate"),
    criteria: Array.isArray(issue.criteria) ? issue.criteria.map(String) : [],
    framework: Array.isArray(issue.framework) ? issue.framework.map(String) : [],
    summary: String(issue.summary || issue.whyItLimitsBand || ""),
    exactSentence: String(issue.exactSentence || ""),
    paragraphLocation: String(issue.paragraphLocation || ""),
    whyItLimitsBand: String(issue.whyItLimitsBand || "")
  };
}

function publicFeedback(card = {}) {
  return {
    issueType: String(card.issueType || "Diagnostic Issue"),
    severity: String(card.severity || "Moderate"),
    criteria: Array.isArray(card.criteria) ? card.criteria.map(String) : [],
    framework: Array.isArray(card.framework) ? card.framework.map(String) : [],
    paragraphLocation: String(card.paragraphLocation || ""),
    exactSentence: String(card.exactSentence || ""),
    sentenceFunction: String(card.sentenceFunction || ""),
    whyItLimitsBand: String(card.whyItLimitsBand || ""),
    kruPomDiagnosis: String(card.kruPomDiagnosis || ""),
    revisionType: String(card.revisionType || ""),
    targetedRevision: String(card.targetedRevision || ""),
    whyRevisionIsStronger: String(card.whyRevisionIsStronger || ""),
    studentAction: String(card.studentAction || "")
  };
}

function publicProgress(summary = {}) {
  return {
    previousSubmissionCount: Math.max(0, Number(summary.previousSubmissionCount || 0)),
    previousEstimatedRange: String(summary.previousEstimatedRange || ""),
    latestEstimatedRange: String(summary.latestEstimatedRange || ""),
    currentMainRepair: String(summary.currentMainRepair || ""),
    repeatedIssue: String(summary.repeatedIssue || ""),
    validatedReportVersionCount: Number.isInteger(summary.validatedReportVersionCount) && summary.validatedReportVersionCount > 0
      ? summary.validatedReportVersionCount
      : null
  };
}

function publicCriteria(scores = {}) {
  return Object.fromEntries(Object.entries(scores || {}).map(([name, item]) => [name, {
    range: String(item?.range || ""),
    diagnosis: String(item?.diagnosis || ""),
    evidence: String(item?.evidence || "")
  }]));
}

function publicFramework(scores = {}) {
  return Object.fromEntries(Object.entries(scores || {}).map(([name, item]) => [name, {
    status: String(item?.status || ""),
    diagnosis: String(item?.diagnosis || "")
  }]));
}

function clonePublicObject(value) {
  if (!value || typeof value !== "object") return {};
  return JSON.parse(JSON.stringify(value));
}
