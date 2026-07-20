import { REVISION_TYPES, ROUTE_COVERAGE } from "./task2Safety.js";
import { analysisVersionMetadata } from "../services/analysisVersions.js";

export const SEVERITY_TAXONOMY = Object.freeze([
  "Pass / Strong",
  "High-Band Refinement",
  "Minor Repair",
  "Moderate",
  "Major",
  "Critical"
]);

const ROUTE_STATUSES = new Set(Object.values(ROUTE_COVERAGE));

export function normalizeFeedbackSeverity(card = {}) {
  const raw = String(card.severity || "").trim();
  const context = [
    card.issueType,
    card.whyItLimitsBand,
    card.kruPomDiagnosis,
    card.revisionType
  ].filter(Boolean).join(" ");
  if (SEVERITY_TAXONOMY.includes(raw)) return raw;
  if (/pass|strong/i.test(raw)) return "Pass / Strong";
  if (/refinement|optional|high[- ]band/i.test(`${raw} ${context}`)) return "High-Band Refinement";
  if (/minor/i.test(raw)) return "Minor Repair";
  if (/critical/i.test(raw)) return "Critical";
  if (/major/i.test(raw)) return "Major";
  if (/moderate/i.test(raw)) return "Moderate";
  if (/needs? work/i.test(raw)) {
    return /unfinished|missing (?:position|prompt|overview|answer)|meaning[- ]revers|several grammar|frequent error|contradict/i.test(context)
      ? "Major"
      : "Moderate";
  }
  return /correct|acceptable|functional/i.test(context) ? "High-Band Refinement" : "Moderate";
}

export function normalizeCanonicalFeedbackCards(cards = [], taskType = "") {
  return (Array.isArray(cards) ? cards : [])
    .map((card) => {
      const severity = normalizeFeedbackSeverity(card);
      let revisionType = String(card.revisionType || "").trim();
      if (taskType === "Task 2") {
        if (revisionType === "Teacher-Guided Recommended Route") revisionType = "Teacher-Guided Expansion";
        if (!REVISION_TYPES.includes(revisionType)) {
          revisionType = severity === "High-Band Refinement" ? "High-Band Refinement" : "Route-Preserving Revision";
        }
      }
      return {
        ...card,
        severity,
        ...(taskType === "Task 2" ? { revisionType } : {})
      };
    })
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

export function buildCanonicalAnalysis({
  payload = {},
  analysis = {},
  feedbackCards = [],
  topIssues = [],
  paragraphFeedback = [],
  repairPlan = []
} = {}) {
  const taskType = payload.taskType || analysis.taskType || "Task 2";
  if (taskType === "Task 2" && analysis.canonicalTask2Analysis) {
    const base = analysis.canonicalTask2Analysis;
    const functionalConclusion = analysis.feedbackIntegrity?.conclusionFunction;
    const conclusionClosure = functionalConclusion?.status && functionalConclusion.status !== "Not Applicable"
      ? { status: functionalConclusion.status, diagnosis: functionalConclusion.reason }
      : base.frameworkAssessment?.conclusionClosure;
    const frameworkAssessment = { ...base.frameworkAssessment, conclusionClosure };
    const display = projectCanonicalTask2Framework({ ...base, frameworkAssessment }, payload.reportLanguage || base.metadata?.reportLanguage);
    return {
      ...base,
      metadata: {
        ...base.metadata,
        ...analysisVersionMetadata(payload),
        reportId: String(payload.reportId || payload.clientSubmissionId || base.metadata?.reportId || ""),
        ownerAccountId: String(payload.ownerAccountId || base.metadata?.ownerAccountId || ""),
        studentProfileId: String(payload.studentProfileId || base.metadata?.studentProfileId || ""),
        studentDisplayNameSnapshot: String(payload.studentDisplayNameSnapshot || base.metadata?.studentDisplayNameSnapshot || ""),
        inputFingerprint: String(payload.inputFingerprint || base.metadata?.inputFingerprint || ""),
        parentReportId: String(payload.parentReportId || base.metadata?.parentReportId || ""),
        analysisReason: String(payload.analysisReason || base.metadata?.analysisReason || "first-analysis"),
        reportLanguage: String(payload.reportLanguage || base.metadata?.reportLanguage || "en"),
        publicEssayType: String(payload.publicEssayType || base.metadata?.essayTypeLabel || ""),
        internalEssaySubtype: String(payload.internalEssaySubtype || base.metadata?.essayType || ""),
        internalEssaySubtypeLabel: String(payload.internalEssaySubtypeLabel || base.metadata?.internalEssaySubtypeLabel || "")
      },
      executiveSummary: {
        mainScoreLimitingFactor: String(analysis.mainScoreLimitingFactor || base.executiveSummary?.mainScoreLimitingFactor || ""),
        mostUrgentRepair: String(analysis.mostUrgentRepair || base.executiveSummary?.mostUrgentRepair || "")
      },
      frameworkAssessment: {
        ...frameworkAssessment,
        display
      },
      criterionAssessment: {
        ...base.criterionAssessment,
        taskResponseOrAchievement: {
          ...base.criterionAssessment?.taskResponseOrAchievement,
          diagnosis: analysis.criteriaScores?.["Task Response"]?.diagnosis || base.criterionAssessment?.taskResponseOrAchievement?.diagnosis || ""
        },
        coherenceCohesion: {
          ...base.criterionAssessment?.coherenceCohesion,
          diagnosis: analysis.criteriaScores?.["Coherence & Cohesion"]?.diagnosis || base.criterionAssessment?.coherenceCohesion?.diagnosis || ""
        },
        lexicalResource: {
          ...base.criterionAssessment?.lexicalResource,
          diagnosis: analysis.criteriaScores?.["Lexical Resource"]?.diagnosis || base.criterionAssessment?.lexicalResource?.diagnosis || ""
        },
        grammaticalRangeAccuracy: {
          ...base.criterionAssessment?.grammaticalRangeAccuracy,
          diagnosis: analysis.criteriaScores?.["Grammatical Range & Accuracy"]?.diagnosis || base.criterionAssessment?.grammaticalRangeAccuracy?.diagnosis || ""
        }
      },
      evidenceIssues: feedbackCards,
      topIssues,
      paragraphFeedback,
      paragraphCoverage: analysis.feedbackIntegrity?.paragraphCoverage || [],
      feedbackIntegrity: analysis.feedbackIntegrity || null,
      repairPlan
    };
  }

  const criteria = normalizeTask1Criteria(analysis.criteriaScores || {});
  const capMetadata = buildTask1CapMetadata(analysis, feedbackCards, criteria);
  const overallScore = deriveOverallScore(criteria);
  const overviewStatus = task1RouteStatus(analysis);
  return {
    version: "12.3.1",
    metadata: {
      ...analysisVersionMetadata(payload),
      reportId: String(payload.reportId || payload.clientSubmissionId || ""),
      ownerAccountId: String(payload.ownerAccountId || ""),
      studentProfileId: String(payload.studentProfileId || ""),
      studentDisplayNameSnapshot: String(payload.studentDisplayNameSnapshot || ""),
      taskType: "Task 1",
      essayType: "",
      visualType: String(payload.publicVisualType || analysis.visualType || payload.visualType || ""),
      publicVisualType: String(payload.publicVisualType || analysis.visualType || payload.visualType || ""),
      internalVisualSubtype: String(payload.internalVisualSubtype || ""),
      inputFingerprint: String(payload.inputFingerprint || ""),
      parentReportId: String(payload.parentReportId || ""),
      analysisReason: String(payload.analysisReason || "first-analysis"),
      reportLanguage: String(payload.reportLanguage || "en"),
      verifiedWordCount: Number(payload.wordCount || analysis.wordCount || 0),
      minimumWordCount: 150,
      wordShortfall: Math.max(0, 150 - Number(payload.wordCount || analysis.wordCount || 0)),
      completionStatus: Number(payload.wordCount || analysis.wordCount || 0) >= 150 ? "complete" : "underlength"
    },
    taskRequirements: {
      stanceRequired: false,
      requiredRoutes: ["accurate introduction", "overview", "key features", "grouping", "comparison", "data accuracy"],
      promptParts: [String(payload.prompt || "")].filter(Boolean),
      classificationConfidence: payload.image ? "high" : "medium",
      exactPromptSignals: [String(analysis.visualType || payload.visualType || "")].filter(Boolean),
      requirementChecks: []
    },
    routeAssessment: {
      schema: "task1-visual-report",
      routeFieldsByTaskType: {
        visualUnderstanding: String(analysis.dataAccuracyRisk || ""),
        overview: String(analysis.overviewAccuracyStatus || ""),
        grouping: String(analysis.groupingLogicStatus || ""),
        dataSelection: String(analysis.dataSelectionQuality || "")
      },
      overallRouteStatus: overviewStatus,
      status: overviewStatus,
      conclusionClosure: ROUTE_COVERAGE.NOT_APPLICABLE,
      summary: [analysis.overviewAccuracyStatus, analysis.groupingLogicStatus, analysis.dataSelectionQuality].filter(Boolean).join(" | ")
    },
    criterionAssessment: {
      taskResponseOrAchievement: criteria["Task Achievement"],
      coherenceCohesion: criteria["Coherence & Cohesion"],
      lexicalResource: criteria["Lexical Resource"],
      grammaticalRangeAccuracy: criteria["Grammatical Range & Accuracy"]
    },
    capMetadata,
    frameworkAssessment: {
      thesisRouteClarity: { status: "Not Applicable" },
      bodyRouteAlignment: analysis.kruPomScores?.["Grouping Logic"] || {},
      explanationDepth: analysis.kruPomScores?.["Data Selection"] || {},
      sarExampleQuality: { status: "Not Applicable" },
      linkBackControl: analysis.kruPomScores?.["Comparison Precision"] || {},
      conclusionClosure: { status: "Not Applicable" },
      lfcCpcControl: analysis.kruPomScores?.["LFC CPC Control"] || {},
      display: analysis.kruPomScores || {}
    },
    evidenceIssues: feedbackCards,
    topIssues,
    paragraphFeedback,
    paragraphCoverage: analysis.feedbackIntegrity?.paragraphCoverage || [],
    feedbackIntegrity: analysis.feedbackIntegrity || null,
    overallScore,
    repairPlan,
    executiveSummary: {
      mainScoreLimitingFactor: String(analysis.mainScoreLimitingFactor || ""),
      mostUrgentRepair: String(analysis.mostUrgentRepair || "")
    },
    consistency: {
      analysisSource: "canonical-analysis-v12.3.1",
      routeSource: "canonical-analysis-v12.3.1",
      scoreSource: "criterion-arithmetic",
      capSource: capMetadata.applied ? "explicit-canonical-cap" : "none"
    }
  };
}

export function projectCanonicalTask2Framework(canonical = {}, reportLanguage = "") {
  const route = canonical.routeAssessment || {};
  const framework = canonical.frameworkAssessment || {};
  const routeStatus = framework.bodyRouteAlignment?.status || "Needs Work";
  const thesisStatus = framework.thesisRouteClarity?.status || "Needs Work";
  const conclusionStatus = framework.conclusionClosure?.status || "Needs Work";
  const positionClear = Boolean(route.position && !/unclear|contradictory/.test(route.position));
  const thai = String(reportLanguage || canonical.metadata?.reportLanguage || "").toLowerCase() === "th";
  const bodySummary = (route.bodyRoutes || []).map((item) => `Body ${item.index}: ${item.label}`).join(" | ");
  const conclusionDiagnosis = conclusionStatus === "Strong"
    ? (thai ? "Conclusion รักษาจุดยืนและปิดเส้นทางเหตุผลเดิมได้อย่างสม่ำเสมอและควบคุมภาษาได้" : "The conclusion preserves the position and closes the established routes with controlled wording.")
    : conclusionStatus === "Moderate"
      ? (thai ? "Conclusion รักษา route หลักไว้ได้ แต่ยังมีปัญหาเรื่อง policy reference, clause control หรือ lexical precision ที่ต้องซ่อม" : "The conclusion preserves the main route but still needs a policy-reference, clause-control or lexical-precision repair.")
      : (thai ? "Conclusion ขาด ไม่สมบูรณ์ ขัดแย้ง หรือยังปิด route ที่โจทย์ต้องการไม่ได้" : "The conclusion is missing, unfinished, contradictory, or does not close the required route.");
  return {
    "Essay Type Recognition": {
      status: "Strong",
      diagnosis: thai
        ? `ระบบจำแนกโจทย์เป็น ${canonical.metadata?.essayTypeLabel || "Task 2"} จากถ้อยคำและโครงสร้างคำถาม`
        : `The prompt is classified as ${canonical.metadata?.essayTypeLabel || "Task 2"} from its wording and question structure.`
    },
    "Prompt Coverage": {
      status: routeStatus,
      diagnosis: route.missingRequirements?.length
        ? (thai ? `ยังขาด route ที่โจทย์กำหนด: ${route.missingRequirements.join(", ")}` : `Missing required route(s): ${route.missingRequirements.join(", ")}.`)
        : (thai ? "ครอบคลุม route ที่โจทย์กำหนด โดยระดับความลึกประเมินแยกจากความครบ" : "The required routes are covered; depth is evaluated separately from presence.")
    },
    "Position Clarity": canonical.taskRequirements?.stanceRequired
      ? {
          status: positionClear ? "Strong" : "Needs Work",
          diagnosis: positionClear
            ? (thai ? `ผู้เขียนสื่อ judgement ${route.position} ได้ชัดและสม่ำเสมอ` : `The writer communicates a clear and consistent ${route.position} judgement.`)
            : (thai ? "Position ที่โจทย์ต้องการยังไม่ชัดพอ" : "The required position is not stated clearly enough.")
        }
      : { status: "Not Applicable", diagnosis: thai ? "โจทย์ประเภทนี้ไม่ต้องการ agree/disagree position" : "This task type does not require an agree/disagree position." },
    "Thesis Route Clarity": {
      status: thesisStatus,
      diagnosis: positionClear
        ? (thai ? `Introduction วาง ${route.position} และกำหนด body route ที่ตรวจสอบได้` : `The introduction states ${route.position} and establishes a traceable body route.`)
        : (thai ? "Thesis ยังวางเส้นทางที่โจทย์ต้องการไม่ชัดพอ" : "The thesis does not yet establish the required route clearly.")
    },
    "Body Paragraph Route Alignment": {
      status: routeStatus,
      diagnosis: bodySummary || (thai ? "ยังไม่มีหลักฐาน body route ที่เพียงพอ" : "There is not enough evidence to map the body routes.")
    },
    "Explanation Depth": {
      status: framework.explanationDepth?.status || routeStatus,
      diagnosis: thai ? "ประเมินจาก claim, causal mechanism, example และผลที่ตามมา ไม่ได้ตัดสินจากการมี template phrase" : "Depth is judged from the claim, causal mechanism, example and consequence rather than from a template phrase."
    },
    "SAR Example Quality": {
      status: framework.sarExampleQuality?.status || routeStatus,
      diagnosis: thai ? "ประเมิน relevance, credibility, mechanism, result และ scope ของแต่ละตัวอย่าง" : "Each example is judged for relevance, credibility, mechanism, result and appropriate scope."
    },
    "Link Back Control": {
      status: framework.linkBackControl?.status || routeStatus,
      diagnosis: thai ? "ประเมินว่าปลายย่อหน้ายังคง controlling idea ได้หรือไม่ โดยไม่บังคับประโยค Link-Back แบบสูตร" : "Paragraph closure is judged by whether the controlling idea remains clear; a formulaic link-back sentence is not required."
    },
    "Conclusion Closure": { status: conclusionStatus, diagnosis: conclusionDiagnosis },
    "LFC CPC Control": {
      status: framework.lfcCpcControl?.status || routeStatus,
      diagnosis: thai ? "ประเมิน logic, flow, cohesion และ clear/concise/precise/comprehensive control จากงานจริง" : "Logic, flow, cohesion and clear/concise/precise/comprehensive control are judged from the response itself."
    }
  };
}
export function projectCanonicalAnalysis(canonical, legacy = {}) {
  if (!canonical) return legacy;
  const task1 = canonical.metadata?.taskType === "Task 1";
  const criteriaScores = task1
    ? {
        "Task Achievement": canonical.criterionAssessment.taskResponseOrAchievement,
        "Coherence & Cohesion": canonical.criterionAssessment.coherenceCohesion,
        "Lexical Resource": canonical.criterionAssessment.lexicalResource,
        "Grammatical Range & Accuracy": canonical.criterionAssessment.grammaticalRangeAccuracy
      }
    : {
        "Task Response": canonical.criterionAssessment.taskResponseOrAchievement,
        "Coherence & Cohesion": canonical.criterionAssessment.coherenceCohesion,
        "Lexical Resource": canonical.criterionAssessment.lexicalResource,
        "Grammatical Range & Accuracy": canonical.criterionAssessment.grammaticalRangeAccuracy
      };
  const projected = {
    ...legacy,
    canonicalAnalysis: canonical,
    criteriaScores: Object.fromEntries(Object.entries(criteriaScores).map(([name, score]) => [name, addNumericRange(score)])),
    estimatedBandRange: canonical.overallScore?.label || legacy.estimatedBandRange,
    mainScoreLimitingFactor: canonical.executiveSummary?.mainScoreLimitingFactor || legacy.mainScoreLimitingFactor,
    mostUrgentRepair: canonical.executiveSummary?.mostUrgentRepair || legacy.mostUrgentRepair,
    kruPomScores: canonical.frameworkAssessment?.display || legacy.kruPomScores || {},
    feedbackCards: canonical.evidenceIssues || [],
    top3Issues: canonical.topIssues || [],
    paragraphFeedback: canonical.paragraphFeedback || [],
    paragraphCoverage: canonical.paragraphCoverage || [],
    feedbackIntegrity: canonical.feedbackIntegrity || null,
    practicePlan: canonical.repairPlan || [],
    capMetadata: canonical.capMetadata,
    overallBandCap: Number.isFinite(canonical.capMetadata?.overallCap) ? Number(canonical.capMetadata.overallCap).toFixed(1) : "",
    routeAssessment: canonical.routeAssessment,
    taskRequirements: canonical.taskRequirements?.requirementChecks || [],
    stanceRequired: Boolean(canonical.taskRequirements?.stanceRequired),
    studentDisplayNameSnapshot: canonical.metadata?.studentDisplayNameSnapshot || legacy.studentDisplayNameSnapshot,
    wordCount: canonical.metadata?.verifiedWordCount ?? legacy.wordCount,
    minimumWordCount: canonical.metadata?.minimumWordCount ?? legacy.minimumWordCount,
    wordShortfall: canonical.metadata?.wordShortfall ?? legacy.wordShortfall,
    completionStatus: canonical.metadata?.completionStatus || legacy.completionStatus,
    reportLanguage: canonical.metadata?.reportLanguage || legacy.reportLanguage || "en"
  };
  return normalizeProjectedStudentFacingFields(projected);
}

export function normalizeStudentFacingText(value) {
  return String(value || "")
    .replace(/[\uFFFD\uFFFE\uFFFF\uE000-\uF8FF]+/gu, " ")
    .replace(/[‐‑‒–—−]/gu, "-")
    .replace(/\btwo\s+-\s+body\b/gi, "two-body")
    .replace(/ {2,}/g, " ")
    .trim();
}

function normalizeProjectedStudentFacingFields(report = {}) {
  return {
    ...report,
    mainScoreLimitingFactor: normalizeStudentFacingText(report.mainScoreLimitingFactor),
    mostUrgentRepair: normalizeStudentFacingText(report.mostUrgentRepair),
    kruPomScores: Object.fromEntries(Object.entries(report.kruPomScores || {}).map(([name, value]) => [name, {
      ...value,
      diagnosis: normalizeStudentFacingText(value?.diagnosis)
    }])),
    feedbackCards: (report.feedbackCards || []).map((card) => ({
      ...card,
      issueType: normalizeStudentFacingText(card.issueType),
      sentenceFunction: normalizeStudentFacingText(card.sentenceFunction),
      whyItLimitsBand: normalizeStudentFacingText(card.whyItLimitsBand),
      kruPomDiagnosis: normalizeStudentFacingText(card.kruPomDiagnosis),
      targetedRevision: normalizeStudentFacingText(card.targetedRevision),
      whyRevisionIsStronger: normalizeStudentFacingText(card.whyRevisionIsStronger),
      studentAction: normalizeStudentFacingText(card.studentAction)
    })),
    practicePlan: (report.practicePlan || []).map((item) => ({
      ...item,
      title: normalizeStudentFacingText(item.title),
      task: normalizeStudentFacingText(item.task)
    }))
  };
}

export function validateCanonicalAnalysis(canonical = {}) {
  const issues = [];
  const routeStatus = canonical.routeAssessment?.overallRouteStatus;
  if (!ROUTE_STATUSES.has(routeStatus)) issues.push("Canonical route status is outside the controlled taxonomy.");
  const criteria = canonical.criterionAssessment || {};
  const ranges = [
    criteria.taskResponseOrAchievement,
    criteria.coherenceCohesion,
    criteria.lexicalResource,
    criteria.grammaticalRangeAccuracy
  ].map((item) => parseBandRange(item?.range));
  if (ranges.some((range) => !range || !validBand(range.low) || !validBand(range.high))) {
    issues.push("Canonical criterion score is missing or is not a valid IELTS half-band range.");
  } else {
    const expected = deriveOverallScoreFromRanges(ranges);
    if (canonical.overallScore?.label !== expected.label) issues.push("Canonical overall score does not match criterion arithmetic.");
  }
  for (const [index, card] of (canonical.evidenceIssues || []).entries()) {
    if (!SEVERITY_TAXONOMY.includes(card.severity)) issues.push(`Evidence issue ${index + 1} uses an invalid severity.`);
    if (canonical.metadata?.taskType === "Task 2" && !REVISION_TYPES.includes(card.revisionType)) {
      issues.push(`Evidence issue ${index + 1} uses an invalid revision type.`);
    }
  }
  if (canonical.metadata?.ownerAccountId && (!canonical.metadata?.studentProfileId || !canonical.metadata?.studentDisplayNameSnapshot)) {
    issues.push("Canonical student identity metadata is incomplete.");
  }
  return issues;
}

function normalizeTask1Criteria(input) {
  const names = ["Task Achievement", "Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"];
  return Object.fromEntries(names.map((name) => {
    const source = input[name] || {};
    const range = parseBandRange(source.range) || { low: 6, high: 6.5 };
    return [name, { ...source, range: formatBandRange(range.low, range.high), numericRange: { low: range.low, high: range.high } }];
  }));
}

function addNumericRange(score = {}) {
  if (!score || typeof score !== "object") return score;
  const range = parseBandRange(score.range);
  return { ...score, numericRange: range ? { low: range.low, high: range.high } : { low: null, high: null } };
}

function buildTask1CapMetadata(analysis, cards, criteria) {
  if (!analysis.criticalOverviewError && !analysis.taskAchievementCapReason) {
    return { applied: false, criterion: "", value: null, reasonCode: "", exactEvidence: "", reason: "", caps: [], overallCap: null };
  }
  const value = parseBandRange(criteria["Task Achievement"]?.range)?.high ?? null;
  const exactEvidence = cards.find((card) => /overview|data accuracy|main trend/i.test(`${card.issueType} ${card.framework}`))?.exactSentence || "";
  const cap = {
    scope: "criterion",
    criterion: "Task Achievement",
    maximum: value,
    reasonCode: "TASK1_CRITICAL_OVERVIEW_OR_DATA_ERROR",
    exactEvidence,
    reason: String(analysis.taskAchievementCapReason || "A critical overview or data-accuracy error limits Task Achievement.")
  };
  return { applied: true, criterion: cap.criterion, value, reasonCode: cap.reasonCode, exactEvidence, reason: cap.reason, caps: [cap], overallCap: null };
}

function task1RouteStatus(analysis) {
  if (analysis.criticalOverviewError || /missing|unsafe|incorrect/i.test(analysis.overviewAccuracyStatus || "")) return ROUTE_COVERAGE.ABSENT;
  if (/mostly|adequate|mechanical|medium/i.test(`${analysis.overviewAccuracyStatus} ${analysis.groupingLogicStatus}`)) return ROUTE_COVERAGE.PARTIALLY_DEVELOPED;
  return ROUTE_COVERAGE.ADEQUATELY_DEVELOPED;
}

function deriveOverallScore(criteria) {
  const ranges = Object.values(criteria).map((item) => parseBandRange(item?.range));
  return deriveOverallScoreFromRanges(ranges);
}

function deriveOverallScoreFromRanges(ranges) {
  const low = roundToHalf(ranges.reduce((sum, range) => sum + range.low, 0) / ranges.length);
  const high = roundToHalf(ranges.reduce((sum, range) => sum + range.high, 0) / ranges.length);
  return { low, high, label: formatBandRange(low, high), confidence: "medium" };
}

function parseBandRange(value) {
  const values = String(value ?? "").replace(/[–—−]/g, "-").match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  if (!values.length) return null;
  return { low: values[0], high: values.length > 1 ? values[1] : values[0] };
}

function validBand(value) {
  return Number.isFinite(value) && value >= 0 && value <= 9 && Number.isInteger(value * 2);
}

function roundToHalf(value) {
  return Math.round(Number(value) * 2) / 2;
}

function formatBandRange(low, high) {
  const first = Number(low).toFixed(1);
  const second = Number(high).toFixed(1);
  return first === second ? first : `${first}-${second}`;
}

function severityRank(value) {
  return {
    "Pass / Strong": 0,
    "High-Band Refinement": 1,
    "Minor Repair": 2,
    Moderate: 3,
    Major: 4,
    Critical: 5
  }[value] ?? 3;
}

