import { applyLockedRevision, validateRevision } from "./revisionValidation.js";
import { sanitizeReportText } from "./textSanitization.js";

const CRITERIA = Object.freeze({
  "Task 1": ["Task Achievement", "Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"],
  "Task 2": ["Task Response", "Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"]
});

const FRAMEWORK = Object.freeze({
  "Task 1": ["Overview Quality", "Data Selection", "Grouping Logic", "Data Accuracy", "Comparison Precision", "Report Tone Control", "LFC CPC Control"],
  "Task 2": ["Position Clarity", "Thesis Route Clarity", "Body Paragraph Route Alignment", "Explanation Depth", "SAR Example Quality", "Link Back Control", "Conclusion Closure", "LFC CPC Control"]
});

const THAI_DISCLAIMER = "รายงานนี้เป็นการประเมินเชิง Diagnostic ตามเกณฑ์ IELTS Writing และกรอบการสอนของ Kru Pom IELTS ไม่ใช่คะแนนทางการจาก IELTS examiner";
const ENGLISH_DISCLAIMER = "This diagnostic report provides an estimated band range based on IELTS Writing criteria and the Kru Pom IELTS writing framework. It is not an official IELTS score and does not replace assessment by certified IELTS examiners.";

const FORBIDDEN_KEYS = Object.freeze([
  "submissionGroupId", "reportVersionId", "parentReportId", "inputFingerprint", "studentWorkFingerprint",
  "submissionHash", "promptFingerprint", "responseFingerprint", "engineVersion", "rubricVersion",
  "reportSchemaVersion", "pdfProjectionId", "rawJson", "databaseKey", "debug"
]);

const FORBIDDEN_TEXT = Object.freeze([
  /Ctrl\s*\+\s*M/i,
  /submissionGroupId/i,
  /reportVersionId/i,
  /parentReportId/i,
  /response fingerprint/i,
  /prompt fingerprint/i,
  /engine version/i,
  /rubric version/i,
  /report schema version/i,
  /legacy-[a-f0-9]/i,
  /progress representative/i,
  /engine\/report rerun excluded/i,
  /Progress policy/i,
  /migration status/i,
  /internal QA/i,
  /raw JSON/i,
  /database key/i,
  /implementation proof/i
]);

export function buildStudentReportViewModel(analysis = {}, options = {}) {
  const language = normalizeLanguage(analysis.reportLanguage || options.reportLanguage);
  const copy = reportCopy(language);
  const taskType = analysis.taskType === "Task 1" ? "Task 1" : "Task 2";
  const subtype = taskType === "Task 1"
    ? first(analysis.visualType, analysis.publicVisualType, "Not Sure")
    : first(analysis.task2EssayTypeLabel, analysis.essayType, analysis.publicTaskType, "Not Sure");
  const feedbackCards = toArray(analysis.feedbackCards).map((card) => projectFeedbackCard(card, language));
  const topIssueLimit = taskType === "Task 2" ? 5 : 3;
  const topIssues = toArray(analysis.top3Issues).slice(0, topIssueLimit).map((issue, index) => projectTopIssue(issue, feedbackCards[index], index));
  const criteria = CRITERIA[taskType].map((name) => projectCriterion(name, analysis.criteriaScores?.[name], analysis.estimatedBandRange));
  const framework = FRAMEWORK[taskType].map((name) => projectFramework(name, analysis.kruPomScores?.[name]));
  const route = taskType === "Task 2" ? projectRoute(analysis, copy) : null;
  const progressSummary = projectProgressSummary(options.progressSummary, analysis, taskType, copy);

  const model = {
    schema: "StudentReportViewModel.v12",
    language,
    copy,
    reportHeader: {
      eyebrow: copy.productEyebrow,
      title: copy.reportTitle
    },
    studentMetadata: {
      student: clean(first(analysis.studentDisplayNameSnapshot, options.studentDisplayName, "-")),
      date: formatDate(first(analysis.generatedAt, options.generatedAt), language),
      taskType,
      subtypeLabel: taskType === "Task 1" ? copy.visualType : copy.essayType,
      subtype: clean(subtype),
      wordCount: clean(analysis.wordCount ?? "-"),
      reportLanguage: copy.languageName
    },
    estimatedBandRange: clean(first(analysis.estimatedBandRange, "-")),
    executiveSummary: {
      mainScoreLimitingFactor: clean(first(analysis.mainScoreLimitingFactor, "-")),
      mostUrgentRepair: clean(first(analysis.mostUrgentRepair, "-"))
    },
    completionStatus: projectCompletionStatus(analysis, taskType, language),
    positionAndRoute: route,
    criteriaBreakdown: criteria,
    frameworkBreakdown: framework,
    topIssues,
    detailedFeedback: feedbackCards,
    repairPlan: toArray(analysis.practicePlan).slice(0, 7).map((item, index) => ({
      day: clean(item.day || index + 1),
      title: clean(first(item.title, copy.repairFocus)),
      task: clean(first(item.task, item.action, "-"))
    })),
    progressSummary,
    disclaimer: language === "th" ? THAI_DISCLAIMER : ENGLISH_DISCLAIMER,
    footer: copy.footer
  };

  assertStudentReportViewModel(model);
  return deepFreeze(model);
}

export function assertStudentReportViewModel(model) {
  const findings = [];
  walk(model, [], findings);
  const serialized = JSON.stringify(model);
  for (const pattern of FORBIDDEN_TEXT) {
    if (pattern.test(serialized)) findings.push(`Forbidden student-report text matched ${pattern}`);
  }
  if (findings.length) {
    const error = new Error(`Student report data boundary failed: ${findings.join("; ")}`);
    error.errorCode = "STUDENT_REPORT_BOUNDARY_FAILED";
    throw error;
  }
  return true;
}

export function getStudentReportForbiddenPatterns() {
  return [...FORBIDDEN_TEXT];
}

export function getThaiDisclaimer() {
  return THAI_DISCLAIMER;
}

function projectCriterion(name, value, fallbackRange) {
  const record = value && typeof value === "object" ? value : {};
  return {
    name,
    range: clean(first(typeof value === "string" ? value : record.range, fallbackRange, "-")),
    diagnosis: clean(first(record.diagnosis, "No diagnosis available for this criterion.")),
    evidence: clean(first(record.evidence, ""), { preserveStudentText: true })
  };
}

function projectFramework(name, value) {
  const record = value && typeof value === "object" ? value : {};
  return {
    name,
    status: clean(first(record.status, "Needs Work")),
    diagnosis: clean(first(record.diagnosis, record.explanation, "-"))
  };
}

function projectTopIssue(issue = {}, fallbackCard = {}, index = 0) {
  const allEvidenceItems = toArray(issue.evidenceItems).map((item) => ({
    paragraphLocation: clean(first(item.paragraphLocation, item.location, "Evidence")),
    evidenceRole: clean(first(item.evidenceRole, "")),
    exactSentence: clean(first(item.exactSentence, item.evidence, "-"), { preserveStudentText: true })
  }));
  if (!allEvidenceItems.length) {
    const exact = first(issue.exactSentence, fallbackCard?.exactSentence);
    if (exact) allEvidenceItems.push({
      paragraphLocation: clean(first(issue.paragraphLocations?.[0], fallbackCard?.paragraphLocation, "Evidence")),
      evidenceRole: "",
      exactSentence: clean(exact, { preserveStudentText: true })
    });
  }
  const title = clean(first(issue.title, issue.issueType, "Evidence-Based Issue"));
  const scope = clean(first(issue.scope, allEvidenceItems.length > 1 ? "multi-location" : "single-location"));
  const needsTwoLocations = /development depth in both examples|introduction.*conclusion/i.test(title);
  const representativeEvidence = /full-response/i.test(scope) || /full-response/i.test(title);
  const evidenceLimit = needsTwoLocations ? 2 : representativeEvidence ? 1 : 2;
  const evidenceItems = allEvidenceItems.slice(0, evidenceLimit);
  return {
    number: index + 1,
    title,
    severity: clean(first(issue.severity, fallbackCard?.severity, "Needs Work")),
    criteria: toArray(issue.criteria).map(clean).filter(Boolean),
    framework: toArray(first(issue.kruPomFramework, issue.framework)).map(clean).filter(Boolean),
    scope,
    paragraphLocations: [...new Set(toArray(issue.paragraphLocations).map(clean).filter(Boolean).concat(allEvidenceItems.map((item) => item.paragraphLocation)))],
    evidenceItems,
    representativeEvidence,
    additionalEvidence: allEvidenceItems.length > evidenceItems.length,
    diagnosis: clean(first(issue.diagnosis, issue.summary, fallbackCard?.whyItLimitsBand, "-")),
    studentAction: clean(first(issue.studentAction, fallbackCard?.studentAction, "-"))
  };
}

function projectFeedbackCard(card = {}, language = "en") {
  let projected = applyLockedRevision({
    issueType: clean(first(card.issueType, "Diagnostic Issue")),
    severity: clean(first(card.severity, "Needs Work")),
    paragraphLocation: clean(first(card.paragraphLocation, "Paragraph")),
    exactSentence: clean(first(card.exactSentence, "-"), { preserveStudentText: true }),
    sentenceFunction: clean(first(card.sentenceFunction, "-")),
    whyItLimitsBand: clean(first(card.whyItLimitsBand, "-")),
    kruPomDiagnosis: clean(first(card.kruPomDiagnosis, card.diagnosis, "-")),
    revisionType: clean(first(card.revisionType, "Route-Preserving Revision")),
    targetedRevision: clean(first(card.targetedRevision, "-")),
    whyRevisionIsStronger: clean(first(card.whyRevisionIsStronger, "-")),
    studentAction: clean(first(card.studentAction, "-"))
  });

  if (!projected.revisionIntegrity.pass && projected.revisionIntegrity.introducedIssues.length && /route-preserving/i.test(projected.revisionType)) {
    projected = {
      ...projected,
      revisionType: language === "th" ? "Teacher-Guided Expansion" : "Teacher-Guided Expansion"
    };
    projected.revisionIntegrity = validateRevision({
      original: projected.exactSentence,
      revised: projected.targetedRevision,
      revisionType: projected.revisionType,
      diagnosedIssues: projected.issueType
    });
  }

  if (!projected.revisionIntegrity.pass) {
    const error = new Error(`Unsafe targeted revision blocked for ${projected.paragraphLocation}: ${projected.revisionIntegrity.introducedIssues.join(", ") || "validation failed"}`);
    error.errorCode = "REVISION_FIDELITY_FAILED";
    throw error;
  }

  return {
    issueType: projected.issueType,
    severity: projected.severity,
    paragraphLocation: projected.paragraphLocation,
    exactSentence: projected.exactSentence,
    sentenceFunction: projected.sentenceFunction,
    whyItLimitsBand: projected.whyItLimitsBand,
    kruPomDiagnosis: projected.kruPomDiagnosis,
    revisionType: projected.revisionType,
    targetedRevision: projected.targetedRevision,
    whyRevisionIsStronger: projected.whyRevisionIsStronger,
    studentAction: projected.studentAction
  };
}

function projectRoute(analysis, copy) {
  const position = first(analysis.detectedPosition, analysis.writerPosition, "unclear");
  const confidence = first(analysis.positionConfidence, "low");
  return {
    heading: copy.positionAndRoute,
    position: clean(`${position} (${confidence} ${copy.confidence})`),
    summary: clean(first(analysis.bodyRouteSummary, analysis.routeSummary, "-"))
  };
}

function projectCompletionStatus(analysis, taskType, language) {
  if (taskType !== "Task 2" && !analysis.completionStatus) return null;
  const evidence = toArray(analysis.completionEvidence).map(clean).filter(Boolean);
  const status = clean(first(analysis.completionStatus, language === "th" ? "ไม่ระบุ" : "Not specified"));
  return { status, evidence };
}

function projectProgressSummary(summary = {}, analysis = {}, taskType, copy) {
  if (!summary || typeof summary !== "object") return null;
  const versions = toArray(summary.reportVersions);
  const currentGroupId = String(summary.currentSubmissionGroupId || "").trim();
  const sameGroupVersions = currentGroupId ? versions.filter((item) => String(item.submissionGroupId || "").trim() === currentGroupId) : [];
  const versionCount = currentGroupId && sameGroupVersions.length === versions.length && versions.length
    ? sameGroupVersions.length
    : null;
  return {
    taskType,
    previousSubmissionCount: Math.max(0, Number(summary.previousSubmissionCount) || 0),
    previousEstimatedRange: clean(summary.previousEstimatedRange || copy.noPrevious),
    latestEstimatedRange: clean(summary.latestEstimatedRange || analysis.estimatedBandRange || "-"),
    currentMainRepair: clean(summary.currentMainRepair || analysis.mostUrgentRepair || "-"),
    repeatedIssue: clean(summary.repeatedIssue || copy.noRepeated),
    reportVersionCount: versionCount
  };
}

function reportCopy(language) {
  if (language === "th") return {
    productEyebrow: "KRU POM IELTS | EVIDENCE-BASED WRITING DIAGNOSTIC",
    reportTitle: "รายงาน IELTS Writing 7+ Diagnostic",
    student: "นักเรียน", date: "วันที่", taskType: "ประเภทงาน", essayType: "ประเภทเรียงความ", visualType: "ประเภทกราฟ/ภาพ", wordCount: "จำนวนคำ",
    reportLanguage: "ภาษารายงาน", languageName: "ไทย", estimatedBandRange: "ช่วงคะแนนโดยประมาณ", executiveSummary: "สรุปผลการวิเคราะห์",
    mainLimiter: "ปัจจัยหลักที่จำกัดคะแนน", urgentRepair: "สิ่งที่ต้องแก้เร่งด่วน", completionStatus: "สถานะความสมบูรณ์",
    positionAndRoute: "จุดยืนและเส้นทางการพัฒนา", confidence: "ความมั่นใจ", criteriaBreakdown: "วิเคราะห์ตามเกณฑ์ IELTS",
    frameworkBreakdown: "วิเคราะห์ตามกรอบ Kru Pom", topIssues: "ปัญหาหลักจากหลักฐานจริง", detailedFeedback: "Feedback รายประโยคและรายย่อหน้า",
    repairPlan: "แผนซ่อม 7 วันเฉพาะบุคคล", progressSummary: "สรุปพัฒนาการ", disclaimer: "ข้อจำกัดของรายงาน",
    footer: "Kru Pom IELTS | IELTS Writing 7+ Diagnostic Lab | Diagnostic estimate only", repairFocus: "จุดฝึก", noPrevious: "ยังไม่มีงานก่อนหน้า", noRepeated: "ยังไม่พบปัญหาซ้ำ",
    exactSentence: "ประโยคจริงที่พบ", sentenceFunction: "ประโยคนี้กำลังทำหน้าที่อะไร", whyLimits: "เหตุใดจึงจำกัด Band", kruPomDiagnosis: "คำวินิจฉัย Kru Pom",
    revisionType: "ประเภทการแก้", targetedRevision: "Targeted Revision", whyStronger: "เหตุใดเวอร์ชันนี้จึงแข็งแรงกว่า", studentAction: "สิ่งที่นักเรียนต้องทำ",
    diagnosis: "คำวินิจฉัย", evidenceScope: "ขอบเขตหลักฐาน", paragraphLocations: "ตำแหน่งย่อหน้า", framework: "กรอบ Kru Pom",
    previousSubmissions: "จำนวนงานก่อนหน้า", previousRange: "ช่วงคะแนนก่อนหน้า", latestRange: "ช่วงคะแนนล่าสุด", currentRepair: "จุดซ่อมปัจจุบัน", repeatedIssue: "ปัญหาซ้ำ", reportVersions: "จำนวนเวอร์ชันของงานล่าสุด",
    representativeEvidence: "Representative Evidence", additionalEvidence: "พบตัวอย่างที่ผ่านการตรวจสอบเพิ่มเติมในส่วนอื่นของงาน", progressPolicy: "แนวโน้มพัฒนาการคำนวณจากงานนักเรียนคนละ submission เท่านั้น การรันรายงานซ้ำไม่นับเป็นความพยายามใหม่"
  };
  return {
    productEyebrow: "KRU POM IELTS | EVIDENCE-BASED WRITING DIAGNOSTIC",
    reportTitle: "IELTS Writing 7+ Diagnostic Report",
    student: "Student", date: "Date", taskType: "Task Type", essayType: "Essay Type", visualType: "Visual Type", wordCount: "Word Count",
    reportLanguage: "Report Language", languageName: "English", estimatedBandRange: "Estimated Band Range", executiveSummary: "Executive Summary",
    mainLimiter: "Main Score-Limiting Factor", urgentRepair: "Most Urgent Repair", completionStatus: "Completion Status",
    positionAndRoute: "Position and Route", confidence: "confidence", criteriaBreakdown: "IELTS Criteria Breakdown",
    frameworkBreakdown: "Kru Pom Framework Breakdown", topIssues: "Top Evidence-Based Issues", detailedFeedback: "Detailed Paragraph Feedback",
    repairPlan: "Personalized 7-Day Repair Plan", progressSummary: "Progress Summary", disclaimer: "Disclaimer",
    footer: "Kru Pom IELTS | IELTS Writing 7+ Diagnostic Lab | Diagnostic estimate only", repairFocus: "Repair focus", noPrevious: "No previous submission", noRepeated: "No repeated issue confirmed",
    exactSentence: "Exact Sentence Found", sentenceFunction: "What This Sentence Is Trying To Do", whyLimits: "Why This Limits the Band", kruPomDiagnosis: "Kru Pom Diagnosis",
    revisionType: "Revision Type", targetedRevision: "Targeted Revision", whyStronger: "Why This Revision Is Stronger", studentAction: "Student Action",
    diagnosis: "Diagnosis", evidenceScope: "Evidence Scope", paragraphLocations: "Paragraph Locations", framework: "Kru Pom Framework",
    previousSubmissions: "Previous Submissions", previousRange: "Previous Range", latestRange: "Latest Range", currentRepair: "Current Main Repair", repeatedIssue: "Repeated Issue", reportVersions: "Report Versions for Latest Essay",
    representativeEvidence: "Representative Evidence", additionalEvidence: "Additional validated examples occur across the response.", progressPolicy: "Student-progress trends use distinct student submissions; report reruns do not create a new progress attempt."
  };
}

function walk(value, path, findings) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.some((forbidden) => key.toLowerCase() === forbidden.toLowerCase())) findings.push(`Forbidden key ${[...path, key].join(".")}`);
    walk(child, [...path, key], findings);
  }
}

function normalizeLanguage(value) { return String(value || "en").toLowerCase().startsWith("th") ? "th" : "en"; }
function toArray(value) { return Array.isArray(value) ? value : value ? [value] : []; }
function clean(value, options = {}) { return sanitizeReportText(value, options).trim(); }
function first(...values) { return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") ?? ""; }
function formatDate(value, language) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(language === "th" ? "th-TH" : "en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
