import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { assertStudentReportViewModel, buildStudentReportViewModel } from "../domain/reportViewModels.js";
import { assertPrintableTextIntegrity, unicodeIntegrityIssues } from "../domain/textIntegrity.js";
import { buildQaSnapshot, redactForQa } from "../services/qaCanonicalExport.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const separator = item.indexOf("=");
  return separator < 0
    ? [item.replace(/^--/, ""), true]
    : [item.slice(0, separator).replace(/^--/, ""), item.slice(separator + 1)];
}));
if (!args.output || !args.source) {
  throw new Error("Usage: node qa/build-poon-stopship-artifacts.mjs --output=<dir> --source=<Poon exact submission.txt>");
}

const outputDir = path.resolve(args.output);
await mkdir(outputDir, { recursive: true });
process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE = "false";
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;

const raw = (await readFile(path.resolve(args.source), "utf8")).replace(/\r\n?/g, "\n");
const essayStart = raw.indexOf("Some people think");
if (essayStart < 0) throw new Error("The exact Poon essay boundary was not found.");
const prompt = raw.slice(0, essayStart).trim();
const writing = raw.slice(essayStart).trim();
const payload = {
  taskType: "Task 2",
  essayType: "Opinion Essay",
  visualType: "",
  targetBand: "7.0",
  reportLanguage: "en",
  clientSubmissionId: "poon-v12-9-11-final-canonical-acceptance",
  prompt,
  writing,
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
};

// Generate the public artifact through the same provider path that failed in production. The
// saved replay intentionally reports both thesis dimensions as Strong; the final canonical state
// must overwrite those stale provider values before any Student View or PDF projection is built.
const deterministicAnalysis = await analyzeWriting(payload);
const replayFixture = JSON.parse(await readFile(
  new URL("../tests/fixtures/poon-qualified-provider-strong-replay.json", import.meta.url),
  "utf8"
));
const rawProviderAnalysis = structuredClone(deterministicAnalysis);
rawProviderAnalysis.kruPomScores["Position Clarity"] = structuredClone(replayFixture.frameworkRatings["Position Clarity"]);
rawProviderAnalysis.kruPomScores["Thesis Route Clarity"] = structuredClone(replayFixture.frameworkRatings["Thesis Route Clarity"]);
if (rawProviderAnalysis.feedbackIntegrity?.frameworkScores) {
  rawProviderAnalysis.feedbackIntegrity.frameworkScores["Position Clarity"] = structuredClone(rawProviderAnalysis.kruPomScores["Position Clarity"]);
  rawProviderAnalysis.feedbackIntegrity.frameworkScores["Thesis Route Clarity"] = structuredClone(rawProviderAnalysis.kruPomScores["Thesis Route Clarity"]);
}
if (rawProviderAnalysis.canonicalTask2Analysis?.frameworkAssessment?.thesisRouteClarity) {
  rawProviderAnalysis.canonicalTask2Analysis.frameworkAssessment.thesisRouteClarity.status = "Strong";
}

process.env.OPENAI_API_KEY = "saved-provider-replay-not-real";
process.env.OPENAI_MODEL = "saved-provider-replay";
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ output_text: JSON.stringify(rawProviderAnalysis) })
});
let replayedAnalysis;
try {
  replayedAnalysis = await analyzeWriting({ ...payload, clientSubmissionId: "poon-v12-9-11-provider-replay" });
} finally {
  globalThis.fetch = originalFetch;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
}
// The printable acceptance artifact remains the deterministic exact-submission projection. The
// provider replay is a deliberately adversarial internal fixture and is recorded separately in
// POON-FINAL-STATE-TRACE.json; it must never leak internal replay language into Student View.
const analysis = deterministicAnalysis;
analysis.studentDisplayNameSnapshot = "Poon Poon";
const studentView = buildStudentReportViewModel(analysis);
assertStudentReportViewModel(studentView);
assertPrintableTextIntegrity(JSON.stringify(studentView));
const studentUnicodeIssues = unicodeIntegrityIssues(JSON.stringify(studentView), { studentFacing: true });
if (studentUnicodeIssues.length) throw new Error(`Student View Unicode integrity failed: ${studentUnicodeIssues.join(", ")}`);

const savedRecord = {
  ...ANALYSIS_VERSIONS,
  submissionId: "poon-v12-9-11-final-canonical-acceptance",
  studentProfileId: "poon-qa-profile",
  studentDisplayNameSnapshot: "Poon Poon",
  taskType: payload.taskType,
  essayType: payload.essayType,
  visualType: "",
  wordCount: analysis.wordCount,
  sourceInput: { prompt, writing, diagnosticOptions: payload.options }
};
const canonicalQa = buildQaSnapshot({ analysis, savedRecord, payload });
canonicalQa.studentReportViewModel = studentView;
canonicalQa.exportedAt = new Date().toISOString();
canonicalQa.canonicalDataSource = "deterministic-current-engine-exact-submission-with-separate-saved-provider-replay-trace";
canonicalQa.releaseValidation = {
  appVersion: ANALYSIS_VERSIONS.appVersion,
  liveProvider: false,
  savedProviderReplay: true,
  paragraphMapPass: analysis.feedbackIntegrity?.paragraphMap?.audit?.pass === true,
  evidenceAuditPass: (analysis.feedbackIntegrity?.frameworkEvidence?.audit || []).every((item) => item.pass),
  projectionAuditPass: (analysis.feedbackIntegrity?.projectionConsistencyAudit || []).every((item) => item.pass),
  finalValidatedStateTerminal: analysis.feedbackIntegrity?.finalValidatedState?.terminal === true,
  studentBoundaryPass: true,
  unicodeIntegrityPass: true
};

const route = analysis.routeAssessment || {};
const qualified = route.qualifiedPositionState || route.semanticPosition?.finalPositionState || {};
const framework = analysis.kruPomScores || {};
const density = analysis.languageProfile?.languageControlDensity || {};
const revisionCards = studentView.detailedFeedback || [];
const compactRevisionRows = (studentView.languagePatternSummary || []).filter((row) => row.targetedRevision || row.revisionType);
const publicRevisionTypes = new Set([
  "Minimal Correction",
  "Route-Preserving Revised Version",
  "Teacher-Guided Revised Version"
]);
const teacherGuidanceDisclosure = "Teacher guidance: this model makes the implied relationship explicit; it does not introduce a new argument.";
const visibleRevision = (pattern, location) => revisionCards.some((card) =>
  pattern.test(String(card.targetedRevision || "")) && (!location || location.test(String(card.paragraphLocation || "")))
);
const coverage = Object.fromEntries((analysis.feedbackIntegrity?.paragraphCoverage || []).map((item) => [item.paragraphLabel, item]));
const scoreRanges = Object.fromEntries(Object.entries(analysis.criteriaScores || {}).map(([name, value]) => [name, value.range]));

function traceSnapshot(stage, value, { source = "", overwritten = false, final = false } = {}) {
  const stageRoute = value?.routeAssessment || {};
  const stageQualified = stageRoute.qualifiedPositionState || stageRoute.semanticPosition?.finalPositionState || {};
  const stageFramework = value?.kruPomScores || value?.frameworkScores || value?.feedbackIntegrity?.frameworkScores || {};
  return {
    stage,
    source,
    overwritten,
    final,
    qualified: stageQualified.qualified === true,
    thesisClarity: stageQualified.thesisClarity || "",
    detectedPosition: value?.detectedPosition || stageQualified.label || "",
    routeStatus: stageRoute.status || stageRoute.overallRouteStatus || "",
    positionClarity: stageFramework["Position Clarity"]?.status || "",
    thesisRouteClarity: stageFramework["Thesis Route Clarity"]?.status || "",
    terminal: value?.terminal === true || value?.feedbackIntegrity?.finalValidatedState?.terminal === true
  };
}

const finalValidatedState = replayedAnalysis.feedbackIntegrity?.finalValidatedState || {};
const finalStateValue = {
  ...replayedAnalysis,
  kruPomScores: finalValidatedState.frameworkScores || replayedAnalysis.kruPomScores,
  terminal: finalValidatedState.terminal
};
const finalStateTrace = {
  version: "poon-final-state-trace-v12.9.11",
  savedProviderReplay: true,
  expectedConflict: "Provider replay reports Position Clarity and Thesis Route Clarity as Strong for a locally contradictory qualified thesis.",
  stages: [
    traceSnapshot("1.raw-provider", rawProviderAnalysis, { source: "tests/fixtures/poon-qualified-provider-strong-replay.json" }),
    traceSnapshot("2.post-strict-guardrail", deterministicAnalysis, { source: "deterministic strict guardrail", overwritten: true }),
    traceSnapshot("3.canonical-route", { ...replayedAnalysis, kruPomScores: deterministicAnalysis.kruPomScores }, { source: "routeAssessment.qualifiedPositionState", overwritten: true }),
    traceSnapshot("4.framework-reconciliation", replayedAnalysis, { source: "feedbackIntegrity.frameworkEvidence.frameworkScores", overwritten: true }),
    traceSnapshot("5.consistency-audit", replayedAnalysis, { source: "feedbackIntegrity.consistencyAudit", overwritten: true }),
    traceSnapshot("6.framework-evidence-contract", replayedAnalysis, { source: "feedbackIntegrity.frameworkEvidence", overwritten: true }),
    traceSnapshot("7.final-validated-state", finalStateValue, { source: "feedbackIntegrity.finalValidatedState", overwritten: true, final: true }),
    traceSnapshot("8.student-view", analysis, { source: "studentReportViewModel from the exact deterministic analysis; replay equivalence asserted separately", overwritten: true, final: true })
  ],
  assertions: {}
};
finalStateTrace.assertions = {
  rawProviderReportedStrong: rawProviderAnalysis.kruPomScores["Position Clarity"].status === "Strong" && rawProviderAnalysis.kruPomScores["Thesis Route Clarity"].status === "Strong",
  finalQualified: replayedAnalysis.routeAssessment?.qualifiedPositionState?.qualified === true,
  finalThesisLocallyContradictory: replayedAnalysis.routeAssessment?.qualifiedPositionState?.thesisClarity === "locally-contradictory",
  finalPositionNotStrong: !/^Strong$/i.test(String(finalValidatedState.frameworkScores?.["Position Clarity"]?.status || "")),
  finalThesisNotStrong: !/^Strong$/i.test(String(finalValidatedState.frameworkScores?.["Thesis Route Clarity"]?.status || "")),
  finalStateTerminal: finalValidatedState.terminal === true,
  studentProjectionMatchesFinal: ["Position Clarity", "Thesis Route Clarity"].every((name) =>
    JSON.stringify(replayedAnalysis.kruPomScores?.[name]) === JSON.stringify(finalValidatedState.frameworkScores?.[name]) &&
    JSON.stringify(replayedAnalysis.canonicalAnalysis.frameworkAssessment.display[name]) === JSON.stringify(finalValidatedState.frameworkScores?.[name])
  )
};
finalStateTrace.pass = Object.values(finalStateTrace.assertions).every(Boolean);
if (!finalStateTrace.pass) {
  throw new Error(`Poon final-state trace failed: ${Object.entries(finalStateTrace.assertions).filter(([, value]) => !value).map(([name]) => name).join(", ")}`);
}
const studentJson = JSON.stringify(studentView);
const planPatterns = [
  /qualified judgement/i,
  /limited safety exception/i,
  /blanket rule/i,
  /two validated fragments/i,
  /structurally damaged Body Paragraph 1/i,
  /verb-complement.*word-form.*spelling.*collocation/i,
  /new qualified Opinion response/i
];
const acceptance = {
  version: "poon-final-canonical-stopship-v12.9.11",
  generatedAt: new Date().toISOString(),
  exactSource: path.resolve(args.source),
  checks: {
    fourParagraphs: analysis.feedbackIntegrity?.paragraphMap?.paragraphs?.length === 4,
    paragraphMapAudit: analysis.feedbackIntegrity?.paragraphMap?.audit?.pass === true,
    qualifiedDisagreement: qualified.qualified === true && /qualified disagreement/i.test(String(qualified.label || analysis.detectedPosition || "")),
    body1Exception: qualified.bodyRoles?.find((item) => Number(item.index) === 1)?.role === "exception-concession",
    body2MainPosition: qualified.bodyRoles?.find((item) => Number(item.index) === 2)?.role === "main-position-support",
    conclusionResolvesPosition: qualified.conclusionResolvesPosition === true,
    routePresentNotContradicted: !/contradicted|absent/i.test(String(route.status || route.overallRouteStatus || "")),
    positionNeedsWorkThenClarified: /Needs Work in Thesis.*Clarified by Conclusion/i.test(String(framework["Position Clarity"]?.status || "")),
    thesisNotStrong: /Needs Work/i.test(String(framework["Thesis Route Clarity"]?.status || "")),
    bodyRouteMixed: /Mixed|Mostly Controlled/i.test(String(framework["Body Paragraph Route Alignment"]?.status || "")),
    sarMixed: /Mixed|Moderate/i.test(String(framework["SAR Example Quality"]?.status || "")),
    body1SupportNeedsRepair: /^Exception\/Concession Route Repair Needed/i.test(String(coverage["Body Paragraph 1"]?.status || "")),
    body2SupportControlled: /^Main-Position Route Aligned/i.test(String(coverage["Body Paragraph 2"]?.status || "")),
    linkBackMixed: /Mixed|Moderate/i.test(String(framework["Link Back Control"]?.status || "")),
    conclusionAssessed: /Functionally Strong.*Language.*Repair Needed/i.test(String(framework["Conclusion Closure"]?.status || "")),
    conclusionActionSpecific: /too many problems.*traffic-and-travel consequence/i.test(String(coverage.Conclusion?.priorityRepair || "")),
    everyVisibleIssueHasRevision: revisionCards.length >= 8 && revisionCards.every((card) => String(card.targetedRevision || "").trim().length > 12),
    noRevisionUnavailable: !/Revision Unavailable/i.test(studentJson),
    revisionTypesValid: revisionCards.every((card) => publicRevisionTypes.has(card.revisionType)),
    revisionWhyPopulated: revisionCards.every((card) => String(card.whyRevisionIsStronger || "").trim().length > 20),
    teacherGuidanceDisclosed: revisionCards.filter((card) => card.revisionType === "Teacher-Guided Revised Version")
      .every((card) => String(card.whyRevisionIsStronger || "").includes(teacherGuidanceDisclosure)),
    compactVisibleIssuesHaveRevision: compactRevisionRows.length > 0 && compactRevisionRows.every((row) =>
      publicRevisionTypes.has(row.revisionType) && String(row.targetedRevision || "").trim().length > 1 &&
      String(row.whyRevisionIsStronger || "").trim().length > 20
    ),
    introductionPassiveRelativeRevision: visibleRevision(/should be divided.*where schools.*are kept/i, /Introduction/),
    introductionFragmentRevision: visibleRevision(/^This type of city planning can make city management easier\.$/i, /Introduction/),
    qualifiedThesisRevision: visibleRevision(/Although industrial sites.*I disagree.*schools, homes and shops/i, /Introduction/),
    body1ExceptionRevision: visibleRevision(/Although blanket zoning is unnecessary.*limited exception.*public health.*pollution/i, /Body Paragraph 1/),
    body1FactoryRevision: visibleRevision(/chemical factory can only be located.*emissions will not harm/i, /Body Paragraph 1/),
    body1FragmentRevision: visibleRevision(/implementing.*is essential for preserving/i, /Body Paragraph 1/),
    body2CollocationRevision: visibleRevision(/provides much greater convenience/i, /Body Paragraph 2/),
    body2WalkingRevision: visibleRevision(/allow residents to walk or use public transport/i, /Body Paragraph 2/),
    criterionCalibration: JSON.stringify(scoreRanges) === JSON.stringify({
      "Task Response": "5.0-5.5",
      "Coherence & Cohesion": "5.0-5.5",
      "Lexical Resource": "5.0",
      "Grammatical Range & Accuracy": "4.5-5.0"
    }),
    overallCalibration: analysis.estimatedBandRange === "5.0-5.5",
    densityTotalSentences: density.totalSentences === 13,
    densityFragments: density.sentenceFragmentCount === 2,
    densitySevereClauseFailures: density.severeClauseControlFailureCount >= 6,
    densityReaderReconstruction: density.readerReconstructionRatio >= 0.5,
    densityRecurringFamilies: (density.recurringErrorFamilies || []).length >= 4,
    finalStateTerminal: analysis.feedbackIntegrity?.finalValidatedState?.terminal === true,
    executiveSummaryStartsWithRoute: /Thesis Route Clarity|Position Clarity/i.test(String(studentView.executiveSummary?.mainScoreLimitingFactor || "")),
    repairPlanPriority: analysis.practicePlan?.length === 7 && planPatterns.every((pattern, index) =>
      pattern.test(`${analysis.practicePlan[index]?.title || ""} ${analysis.practicePlan[index]?.task || ""}`)
    ),
    unicodeIntegrity: unicodeIntegrityIssues(JSON.stringify({ analysis, studentView, canonicalQa })).length === 0,
    projectionConsistency: (analysis.feedbackIntegrity?.projectionConsistencyAudit || []).every((item) => item.pass !== false),
    frameworkEvidence: (analysis.feedbackIntegrity?.frameworkEvidence?.audit || []).every((item) => item.pass !== false),
    finalStateTrace: finalStateTrace.pass
  }
};
acceptance.pass = Object.values(acceptance.checks).every(Boolean);
if (!acceptance.pass) {
  const failed = Object.entries(acceptance.checks).filter(([, value]) => !value).map(([name]) => name);
  throw new Error(`Poon stop-ship acceptance failed: ${failed.join(", ")}`);
}

async function writeJson(name, value) {
  await writeFile(path.join(outputDir, name), `${JSON.stringify(redactForQa(value), null, 2)}\n`, "utf8");
}

analysis.studentReportViewModel = studentView;
const revisionGenerationAudit = {
  version: acceptance.version,
  pass: acceptance.checks.everyVisibleIssueHasRevision && acceptance.checks.noRevisionUnavailable &&
    acceptance.checks.revisionTypesValid && acceptance.checks.revisionWhyPopulated &&
    acceptance.checks.teacherGuidanceDisclosed && acceptance.checks.compactVisibleIssuesHaveRevision,
  teacherGuidanceDisclosure,
  visibleIssueCount: revisionCards.length + compactRevisionRows.length,
  revisions: [...revisionCards, ...compactRevisionRows].map((card) => ({
    paragraphLocation: card.paragraphLocation,
    issueCategory: card.issueCategory,
    exactSentence: card.exactSentence,
    targetedRevision: card.targetedRevision,
    revisionType: card.revisionType,
    whyRevisionIsStronger: card.whyRevisionIsStronger,
    pass: Boolean(String(card.targetedRevision || "").trim() && String(card.whyRevisionIsStronger || "").trim() && publicRevisionTypes.has(card.revisionType))
  }))
};
const languageDensityAudit = {
  version: acceptance.version,
  pass: acceptance.checks.densityTotalSentences && acceptance.checks.densityFragments &&
    acceptance.checks.densitySevereClauseFailures && acceptance.checks.densityReaderReconstruction && acceptance.checks.densityRecurringFamilies,
  density,
  scoreRanges,
  overall: analysis.estimatedBandRange
};
const scoreTrace = analysis.feedbackIntegrity?.scoreCalculationTrace || {};
await Promise.all([
  writeJson("Poon-final-analysis.json", analysis),
  writeJson("Poon-final-canonical-qa.json", canonicalQa),
  writeJson("Poon-final-student-view.json", studentView),
  writeJson("Poon-render-input.json", analysis),
  writeJson("Poon-paragraph-map-audit.json", analysis.feedbackIntegrity?.paragraphMap || {}),
  writeJson("Poon-route-position-audit.json", { routeAssessment: route, qualifiedPositionState: qualified }),
  writeJson("Poon-framework-evidence-audit.json", analysis.feedbackIntegrity?.frameworkEvidence || {}),
  writeJson("Poon-revision-generation-audit.json", revisionGenerationAudit),
  writeJson("Poon-language-control-density-audit.json", languageDensityAudit),
  writeJson("Poon-criterion-score-trace.json", { criteria: scoreTrace.finalCriteria || scoreRanges, density, scoreCalculationTrace: scoreTrace }),
  writeJson("Poon-overall-score-trace.json", { overall: analysis.estimatedBandRange, positiveEvidenceForScoreAboveFive: scoreTrace.positiveEvidenceForScoreAboveFive || {}, scoreCalculationTrace: scoreTrace }),
  writeJson("Poon-score-calculation-trace.json", scoreTrace),
  writeJson("POON-FINAL-STATE-TRACE.json", finalStateTrace),
  writeJson("Poon-stopship-acceptance.json", acceptance)
]);

console.log(JSON.stringify({
  pass: acceptance.pass,
  appVersion: ANALYSIS_VERSIONS.appVersion,
  detectedPosition: analysis.detectedPosition,
  overallRoute: route.status || route.overallRouteStatus,
  scores: Object.fromEntries(Object.entries(analysis.criteriaScores || {}).map(([name, value]) => [name, value.range])),
  overall: analysis.estimatedBandRange,
  framework: Object.fromEntries(Object.entries(framework).map(([name, value]) => [name, value.status])),
  artifacts: 14
}, null, 2));
