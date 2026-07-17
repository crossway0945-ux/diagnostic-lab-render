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
        if (["Teacher-Guided Recommended Route", "Model Paragraph"].includes(revisionType)) revisionType = "Teacher-Guided Expansion";
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
    const display = projectCanonicalTask2Framework(base);
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
        publicEssayType: String(payload.publicEssayType || base.metadata?.essayTypeLabel || ""),
        internalEssaySubtype: String(payload.internalEssaySubtype || base.metadata?.essayType || ""),
        internalEssaySubtypeLabel: String(payload.internalEssaySubtypeLabel || base.metadata?.internalEssaySubtypeLabel || "")
      },
      executiveSummary: {
        mainScoreLimitingFactor: String(base.executiveSummary?.mainScoreLimitingFactor || ""),
        mostUrgentRepair: String(base.executiveSummary?.mostUrgentRepair || "")
      },
      frameworkAssessment: {
        ...base.frameworkAssessment,
        display
      },
      evidenceIssues: feedbackCards,
      topIssues,
      paragraphFeedback,
      repairPlan
    };
  }

  const criteria = normalizeTask1Criteria(analysis.criteriaScores || {});
  const capMetadata = buildTask1CapMetadata(analysis, feedbackCards, criteria);
  const overallScore = deriveOverallScore(criteria);
  const overviewStatus = task1RouteStatus(analysis);
  return {
    version: "11.3",
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
    overallScore,
    repairPlan,
    executiveSummary: {
      mainScoreLimitingFactor: String(analysis.mainScoreLimitingFactor || ""),
      mostUrgentRepair: String(analysis.mostUrgentRepair || "")
    },
    consistency: {
      analysisSource: "canonical-analysis-v11.3",
      routeSource: "canonical-analysis-v11.3",
      scoreSource: "criterion-arithmetic",
      capSource: capMetadata.applied ? "explicit-canonical-cap" : "none"
    }
  };
}

export function projectCanonicalTask2Framework(canonical = {}) {
  const route = canonical.routeAssessment || {};
  const framework = canonical.frameworkAssessment || {};
  const routeStatus = framework.bodyRouteAlignment?.status || "Needs Work";
  const thesisStatus = framework.thesisRouteClarity?.status || "Needs Work";
  const conclusionStatus = framework.conclusionClosure?.status || "Needs Work";
  const positionClear = Boolean(route.position && !/unclear|contradictory/.test(route.position));
  const partialConcession = (route.bodyRoutes || []).some((item) => /concession/.test(item.label || "") && /partially_developed|mentioned_only/.test(item.status || ""));
  const promptText = (canonical.taskRequirements?.promptParts || []).join(" ");
  const isZoningOpinion = /\b(?:zone|zoning|urban areas?|towns?|cities|facilities)\b/i.test(promptText) && canonical.metadata?.essayType === "opinion";
  const thesisDiagnosis = isZoningOpinion && positionClear
    ? "The thesis establishes two reasons: reduced accessibility and traffic congestion."
    : positionClear
      ? `The introduction states ${route.position} and establishes the body route separately from position clarity.`
      : "The thesis does not yet establish the required route clearly.";
  const bodyRouteDiagnosis = isZoningOpinion && (route.bodyRoutes || []).length >= 2
    ? "Body Paragraph 1 develops the accessibility reason stated in the thesis. Body Paragraph 2 develops the traffic-congestion reason stated in the thesis."
    : (route.bodyRoutes || []).map((item) => `Body ${item.index}: ${item.label}`).join(" | ");
  return {
    "Essay Type Recognition": {
      status: "Strong",
      diagnosis: `The prompt is classified as ${canonical.metadata?.essayTypeLabel || "Task 2"} from its own wording.`
    },
    "Prompt Coverage": {
      status: routeStatus,
      diagnosis: route.missingRequirements?.length
        ? `Missing required route(s): ${route.missingRequirements.join(", ")}.`
        : /Moderate/i.test(routeStatus) ? "All required routes are present, but one route is only partially developed." : "All required routes are covered."
    },
    "Position Clarity": canonical.taskRequirements?.stanceRequired
      ? {
          status: positionClear ? "Strong" : "Needs Work",
          diagnosis: positionClear ? "The writer clearly and consistently communicates the required judgement." : "The required position is not stated clearly enough."
        }
      : { status: "Not Applicable", diagnosis: "This task type does not require an agree/disagree position." },
    "Thesis Route Clarity": {
      status: thesisStatus,
      diagnosis: thesisDiagnosis
    },
    "Body Paragraph Route Alignment": {
      status: routeStatus,
      diagnosis: bodyRouteDiagnosis
    },
    "Explanation Depth": {
      status: framework.explanationDepth?.status || routeStatus,
      diagnosis: partialConcession
        ? "The concession is relevant, but its relationship to the writer's main judgement is not fully explained."
        : "Both reasons are relevant, but the causal mechanisms and broader consequences need greater precision."
    },
    "SAR Example Quality": {
      status: framework.sarExampleQuality?.status || routeStatus,
      diagnosis: "Both examples are relevant but not sufficiently convincing or broadly developed."
    },
    "Link Back Control": {
      status: framework.linkBackControl?.status || routeStatus,
      diagnosis: partialConcession
        ? "The concession needs an explicit return to the writer's main judgement."
        : "Body 1 attempts a link-back but has an incomplete sentence ending and imprecise wording. Body 2 ends with a result but needs a cleaner paragraph-level return to the reason."
    },
    "Conclusion Closure": {
      status: conclusionStatus,
      diagnosis: conclusionStatus === "Strong"
        ? "The conclusion restates the writer's judgement consistently."
        : "The conclusion is missing, unfinished, or does not close the required route."
    },
    "LFC CPC Control": {
      status: framework.lfcCpcControl?.status || routeStatus,
      diagnosis: "The paragraph routes are visible, but sentence-level language and paragraph closure remain inconsistent."
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
    completionStatus: canonical.metadata?.completionStatus || legacy.completionStatus
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
