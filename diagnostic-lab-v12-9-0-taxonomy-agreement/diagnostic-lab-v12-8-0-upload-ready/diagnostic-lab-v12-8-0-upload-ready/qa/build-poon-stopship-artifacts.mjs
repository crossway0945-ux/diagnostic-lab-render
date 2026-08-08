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
  clientSubmissionId: "poon-v12-9-9-stopship-acceptance",
  prompt,
  writing,
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
};

const analysis = await analyzeWriting(payload);
analysis.studentDisplayNameSnapshot = "Poon Poon";
const studentView = buildStudentReportViewModel(analysis);
assertStudentReportViewModel(studentView);
assertPrintableTextIntegrity(JSON.stringify(studentView));
const studentUnicodeIssues = unicodeIntegrityIssues(JSON.stringify(studentView), { studentFacing: true });
if (studentUnicodeIssues.length) throw new Error(`Student View Unicode integrity failed: ${studentUnicodeIssues.join(", ")}`);

const savedRecord = {
  ...ANALYSIS_VERSIONS,
  submissionId: "poon-v12-9-9-stopship-acceptance",
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
canonicalQa.canonicalDataSource = "deterministic-current-engine-exact-submission";
canonicalQa.releaseValidation = {
  appVersion: ANALYSIS_VERSIONS.appVersion,
  liveProvider: false,
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
const support = (route.bodyRoutes || []).map((item) => item.supportAssessment?.status || "");
const acceptance = {
  version: "poon-qualified-opinion-stopship-v12.9.9",
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
    thesisNotStrong: !/^Strong$/i.test(String(framework["Thesis Route Clarity"]?.status || "")),
    sarMixed: /Mixed|Moderate/i.test(String(framework["SAR Example Quality"]?.status || "")),
    body1SupportNeedsRepair: /Development Repair Needed|Mixed/i.test(support[0] || ""),
    body2SupportControlled: /Controlled Support.*Language Repair Needed/i.test(support[1] || ""),
    linkBackNotStrong: !/^Strong$/i.test(String(framework["Link Back Control"]?.status || "")),
    conclusionAssessed: !/Not Assessed/i.test(String(framework["Conclusion Closure"]?.status || "")),
    finalStateTerminal: analysis.feedbackIntegrity?.finalValidatedState?.terminal === true,
    executiveSummaryStartsWithRoute: /Thesis Route Clarity|Position Clarity/i.test(String(studentView.executiveSummary?.mainScoreLimitingFactor || "")),
    repairPlanStartsWithRoute: /Thesis Route Clarity/i.test(String(analysis.practicePlan?.[0]?.title || "")),
    unicodeIntegrity: unicodeIntegrityIssues(JSON.stringify({ analysis, studentView, canonicalQa })).length === 0,
    projectionConsistency: (analysis.feedbackIntegrity?.projectionConsistencyAudit || []).every((item) => item.pass !== false),
    frameworkEvidence: (analysis.feedbackIntegrity?.frameworkEvidence?.audit || []).every((item) => item.pass !== false)
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
await Promise.all([
  writeJson("Poon-final-analysis.json", analysis),
  writeJson("Poon-final-canonical-qa.json", canonicalQa),
  writeJson("Poon-final-student-view.json", studentView),
  writeJson("Poon-render-input.json", analysis),
  writeJson("Poon-paragraph-map-audit.json", analysis.feedbackIntegrity?.paragraphMap || {}),
  writeJson("Poon-route-position-audit.json", { routeAssessment: route, qualifiedPositionState: qualified }),
  writeJson("Poon-framework-evidence-audit.json", analysis.feedbackIntegrity?.frameworkEvidence || {}),
  writeJson("Poon-score-calculation-trace.json", analysis.feedbackIntegrity?.scoreCalculationTrace || {}),
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
  artifacts: 9
}, null, 2));
