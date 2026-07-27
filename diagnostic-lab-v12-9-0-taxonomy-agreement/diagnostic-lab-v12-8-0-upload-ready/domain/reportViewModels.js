import { assertUnicodeIntegrity, normalizeVisibleTree } from "./textIntegrity.js";
import { enforceViewModelConsistency } from "./reportConsistency.js";

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
  "paragraphCoverage",
  "detailedFeedback",
  "repairPlan",
  "progressSummary",
  "disclaimer",
  "footer"
]);

const STUDENT_SECTION_FIELDS = Object.freeze({
  reportHeader: ["productName", "reportTitle", "reportLanguage", "generatedAt"],
  studentMetadata: ["studentName", "taskType", "taskSubtype", "wordCount", "minimumWordCount", "wordCountStatus"],
  executiveSummary: ["mainScoreLimitingFactor", "mostUrgentRepair"],
  completionStatus: ["status", "evidence", "wordShortfall"],
  positionAndRoute: ["label", "position", "confidence", "summary", "thesisDimensions"],
  thesisDimensions: ["applicable", "status", "taskFamily", "routeRequired", "routePresent", "routeOrderClear", "causalHierarchyClear", "lexicalNamingAccurate", "bodyRouteTraceable", "positionRequired", "positionPresent"],
  criterion: ["range", "diagnosis", "evidence"],
  framework: ["status", "diagnosis"],
  topIssue: ["issueCategory", "secondaryCategories", "issueType", "title", "severity", "criteria", "framework", "summary", "exactSentence", "paragraphLocation", "whyItLimitsBand"],
  paragraphCoverage: ["paragraphLabel", "paragraphFunction", "status", "diagnosis", "priorityRepair", "dimensions"],
  detailedFeedback: [
    "issueCategory", "primaryCategory", "secondaryCategories", "issueType", "severity",
    "criteria", "framework", "paragraphLocation", "exactSentence", "targetSpan",
    "detectedDefect", "expectedCorrection", "sentenceFunction", "whyItLimitsBand",
    "kruPomDiagnosis", "revisionType", "targetedRevision", "whyRevisionIsStronger",
    "studentAction", "evidenceScope", "evidenceCount", "evidenceLocations"
  ],
  evidenceLocation: ["paragraphLocation", "exactEvidence"],
  repairPlan: ["day", "title", "task"],
  progressSummary: ["previousSubmissionCount", "previousEstimatedRange", "latestEstimatedRange", "currentMainRepair", "repeatedIssue", "validatedReportVersionCount"]
});

const INTERNAL_STUDENT_TEXT_PATTERN = /\b(?:source|target|evidence)\s+offsets?\b|\bexact source span\b|\bvalidated (?:span|occurrence|issue)\b|\b(?:body_topic_sentence|thesis_route|cause_route|solution_route|view_route|paragraph_closing_sentence|evidence_assertion|repair_targets?)\b|\bcanonical(?:ized)?\b/i;

export function buildStudentReportViewModel(analysis = {}, progressSummary = {}) {
  const taskType = String(analysis.taskType || "Task 2");
  const reportLanguage = String(analysis.reportLanguage || "en").toLowerCase() === "th" ? "th" : "en";
  const viewModel = scrubStudentTree(normalizeVisibleTree({
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
      summary: String(analysis.bodyRouteSummary || analysis.routeAssessment?.summary || ""),
      thesisDimensions: publicThesisDimensions(analysis.thesisDimensions || analysis.feedbackIntegrity?.thesisDimensions)
    },
    criteriaBreakdown: publicCriteria(analysis.criteriaScores),
    frameworkBreakdown: publicFramework(analysis.kruPomScores),
    topIssues: (Array.isArray(analysis.top3Issues) ? analysis.top3Issues : []).map(publicIssue),
    paragraphCoverage: (Array.isArray(analysis.paragraphCoverage) ? analysis.paragraphCoverage : []).map(publicParagraphCoverage),
    detailedFeedback: (Array.isArray(analysis.feedbackCards) ? analysis.feedbackCards : []).map(publicFeedback),
    repairPlan: (Array.isArray(analysis.practicePlan) ? analysis.practicePlan : []).map((item, index) => ({
      day: Number(item?.day || index + 1),
      title: String(item?.title || "Repair focus"),
      task: String(item?.task || item?.action || "")
    })),
    progressSummary: publicProgress(progressSummary),
    disclaimer: String(analysis.disclaimer || ""),
    footer: "Kru Pom IELTS | IELTS Writing 7+ Diagnostic Lab | Diagnostic estimate only"
  }));
  // Enforced final cross-section consistency gate: repair contradictions in the fully assembled
  // report (e.g. a Strong framework status whose explanation says a route is missing) before it is
  // asserted, saved or rendered. Deterministic, from the frozen statuses — never reruns scoring.
  enforceViewModelConsistency(viewModel);
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
      reportSchemaVersion: String(context.reportSchemaVersion || analysis.reportSchemaVersion || ""),
      feedbackSchemaVersion: String(context.feedbackSchemaVersion || analysis.feedbackSchemaVersion || ""),
      issueTaxonomyVersion: String(context.issueTaxonomyVersion || analysis.issueTaxonomyVersion || ""),
      evidenceValidatorVersion: String(context.evidenceValidatorVersion || analysis.evidenceValidatorVersion || ""),
      revisionValidatorVersion: String(context.revisionValidatorVersion || analysis.revisionValidatorVersion || ""),
      pdfTextIntegrityVersion: String(context.pdfTextIntegrityVersion || analysis.pdfTextIntegrityVersion || "")
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
  assertKeys(viewModel.reportHeader, STUDENT_SECTION_FIELDS.reportHeader, "reportHeader");
  assertKeys(viewModel.studentMetadata, STUDENT_SECTION_FIELDS.studentMetadata, "studentMetadata");
  assertKeys(viewModel.executiveSummary, STUDENT_SECTION_FIELDS.executiveSummary, "executiveSummary");
  assertKeys(viewModel.completionStatus, STUDENT_SECTION_FIELDS.completionStatus, "completionStatus");
  assertKeys(viewModel.positionAndRoute, STUDENT_SECTION_FIELDS.positionAndRoute, "positionAndRoute");
  assertKeys(viewModel.positionAndRoute?.thesisDimensions, STUDENT_SECTION_FIELDS.thesisDimensions, "positionAndRoute.thesisDimensions");
  for (const [criterion, item] of Object.entries(viewModel.criteriaBreakdown || {})) {
    assertKeys(item, STUDENT_SECTION_FIELDS.criterion, `criteriaBreakdown.${criterion}`);
  }
  for (const [component, item] of Object.entries(viewModel.frameworkBreakdown || {})) {
    assertKeys(item, STUDENT_SECTION_FIELDS.framework, `frameworkBreakdown.${component}`);
  }
  for (const [index, issue] of (viewModel.topIssues || []).entries()) assertKeys(issue, STUDENT_SECTION_FIELDS.topIssue, `topIssues[${index}]`);
  for (const [index, paragraph] of (viewModel.paragraphCoverage || []).entries()) assertKeys(paragraph, STUDENT_SECTION_FIELDS.paragraphCoverage, `paragraphCoverage[${index}]`);
  for (const [index, card] of (viewModel.detailedFeedback || []).entries()) {
    assertKeys(card, STUDENT_SECTION_FIELDS.detailedFeedback, `detailedFeedback[${index}]`);
    for (const [locationIndex, location] of (card.evidenceLocations || []).entries()) {
      assertKeys(location, STUDENT_SECTION_FIELDS.evidenceLocation, `detailedFeedback[${index}].evidenceLocations[${locationIndex}]`);
    }
  }
  for (const [index, item] of (viewModel.repairPlan || []).entries()) assertKeys(item, STUDENT_SECTION_FIELDS.repairPlan, `repairPlan[${index}]`);
  assertKeys(viewModel.progressSummary, STUDENT_SECTION_FIELDS.progressSummary, "progressSummary");
  const serialized = JSON.stringify(viewModel);
  if (INTERNAL_STUDENT_TEXT_PATTERN.test(serialized)) {
    throw new Error("StudentReportViewModel contains internal validation or implementation language.");
  }
  assertUnicodeIntegrity(serialized, { studentFacing: true });
  return true;
}

function publicIssue(issue = {}) {
  return {
    issueCategory: String(issue.issueCategory || issue.issueType || issue.title || "Diagnostic Issue"),
    secondaryCategories: Array.isArray(issue.secondaryIssueCategories) ? issue.secondaryIssueCategories.map(String) : [],
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
  const revisionWithheld = Boolean(card.revisionWithheld) ||
    String(card.revisionAlignmentStatus || "") === "withheld" ||
    String(card.revisionType || "") === "Revision Unavailable";
  return {
    issueCategory: String(card.issueCategory || card.issueType || "Diagnostic Issue"),
    primaryCategory: String(card.primaryCategory || card.issueCategory || card.issueType || "Diagnostic Issue"),
    secondaryCategories: Array.isArray(card.secondaryCategories || card.secondaryIssueCategories)
      ? (card.secondaryCategories || card.secondaryIssueCategories).map(String)
      : [],
    issueType: String(card.issueType || "Diagnostic Issue"),
    severity: String(card.severity || "Moderate"),
    criteria: Array.isArray(card.criteria) ? card.criteria.map(String) : [],
    framework: Array.isArray(card.framework) ? card.framework.map(String) : [],
    paragraphLocation: String(card.paragraphLocation || ""),
    exactSentence: String(card.exactSentence || ""),
    targetSpan: String(card.targetSpan || ""),
    detectedDefect: revisionWithheld
      ? "The exact evidence was validated; the unverified correction was withheld."
      : String(card.detectedDefect || ""),
    expectedCorrection: revisionWithheld ? "" : String(card.expectedCorrection || ""),
    sentenceFunction: String(card.sentenceFunction || ""),
    whyItLimitsBand: String(card.whyItLimitsBand || ""),
    kruPomDiagnosis: String(card.kruPomDiagnosis || ""),
    revisionType: String(card.revisionType || ""),
    targetedRevision: String(card.targetedRevision || ""),
    whyRevisionIsStronger: String(card.whyRevisionIsStronger || ""),
    studentAction: String(card.studentAction || ""),
    evidenceScope: String(card.evidenceScope || "single-location"),
    evidenceCount: Number(card.evidenceCount || 1),
    evidenceLocations: Array.isArray(card.evidenceLocations) ? card.evidenceLocations.map((item) => ({
      paragraphLocation: String(item?.paragraphLocation || ""),
      exactEvidence: String(item?.exactEvidence || "")
    })) : []
  };
}

function publicParagraphCoverage(item = {}) {
  return {
    paragraphLabel: String(item.paragraphLabel || "Paragraph"),
    paragraphFunction: String(item.paragraphFunction || ""),
    status: String(item.status || "Strong"),
    diagnosis: String(item.diagnosis || ""),
    priorityRepair: String(item.priorityRepair || "No priority repair"),
    dimensions: clonePublicObject(item.dimensions)
  };
}

function publicThesisDimensions(value = {}) {
  return {
    applicable: Boolean(value?.applicable),
    status: String(value?.status || ""),
    taskFamily: String(value?.taskFamily || ""),
    routeRequired: Array.isArray(value?.routeRequired) ? value.routeRequired.map(String) : [],
    routePresent: clonePublicObject(value?.routePresent),
    routeOrderClear: Boolean(value?.routeOrderClear),
    causalHierarchyClear: Boolean(value?.causalHierarchyClear),
    lexicalNamingAccurate: Boolean(value?.lexicalNamingAccurate),
    bodyRouteTraceable: Boolean(value?.bodyRouteTraceable),
    positionRequired: Boolean(value?.positionRequired),
    positionPresent: Boolean(value?.positionPresent)
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

function scrubStudentTree(value) {
  if (Array.isArray(value)) return value.map(scrubStudentTree);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubStudentTree(item)]));
  }
  if (typeof value !== "string") return value;
  return value
    .replace(/\s+at source offsets?\s+\d+(?:-\d+)?/gi, "")
    .replace(/\bsource offsets?\s+\d+(?:-\d+)?\b/gi, "the highlighted wording")
    .replace(/\bexact source span\b/gi, "quoted wording")
    .replace(/\bvalidated (?:span|occurrence|issue)\b/gi, "identified point")
    .replace(/\bbody_topic_sentence\b/gi, "paragraph opening")
    .replace(/\b(?:thesis_route|cause_route|solution_route|view_route)\b/gi, "response route")
    .replace(/\bparagraph_closing_sentence\b/gi, "paragraph closing sentence")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function assertKeys(value, allowed, path) {
  const extras = Object.keys(value || {}).filter((key) => !allowed.includes(key));
  if (extras.length) throw new Error(`StudentReportViewModel field allowlist mismatch at ${path}. Extra: ${extras.join(", ")}.`);
}
