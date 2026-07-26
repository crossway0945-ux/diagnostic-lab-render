import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeWriting, runProductionContractCheck, runProviderHealthCheck } from "../services/aiAnalyzer.js";
import { buildStudentReportViewModel } from "../domain/reportViewModels.js";
import { assertPdfTextIntegrity } from "../domain/pdfTextIntegrity.js";
import { validateFeedbackIntegrity } from "../domain/feedbackIntegrity.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";

const requiredModel = "gpt-5.6-sol";
const apiKeyPresent = Boolean(String(process.env.OPENAI_API_KEY || "").trim());
const configuredModel = String(process.env.OPENAI_MODEL || "").trim();
const reasoningEffort = String(process.env.OPENAI_REASONING_EFFORT || "medium").trim();
const outputPath = path.resolve("qa", "output", "v12-7-real-provider-results.json");

if (!apiKeyPresent) {
  console.error("REAL PROVIDER REGRESSION PENDING: OPENAI_API_KEY is not set. No provider call was made and no result file was written.");
  process.exit(2);
}
if (configuredModel !== requiredModel) {
  console.error(`REAL PROVIDER REGRESSION BLOCKED: OPENAI_MODEL must be exactly ${requiredModel}; received ${configuredModel || "(empty)"}.`);
  process.exit(2);
}

process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE = "true";
const corpus = JSON.parse(await readFile(new URL("../fixtures/v12-7-regression-corpus.json", import.meta.url), "utf8"));
const startedAt = new Date().toISOString();
const healthStarted = Date.now();
const providerHealth = await runProviderHealthCheck();
const contractCheck = await runProductionContractCheck();
if (!providerHealth.ok || !contractCheck.ok) {
  console.error(JSON.stringify({
    status: "blocked",
    model: requiredModel,
    reasoningEffort,
    providerHealthOk: Boolean(providerHealth.ok),
    contractStage: contractCheck.stage,
    contractErrorCode: contractCheck.errorCode || ""
  }, null, 2));
  process.exit(1);
}

const results = [];
for (const fixture of corpus.providerCases || []) {
  for (const reportLanguage of fixture.reportLanguages || ["en"]) {
    const caseStarted = Date.now();
    try {
      const report = await analyzeWriting({
        taskType: fixture.taskType,
        essayType: fixture.essayType || "",
        visualType: fixture.visualType || "",
        prompt: fixture.prompt,
        writing: fixture.writing,
        targetBand: "7.0",
        reportLanguage
      });
      const studentView = buildStudentReportViewModel({
        ...report,
        studentDisplayNameSnapshot: "Provider Regression Student"
      }, {
        previousSubmissionCount: 0,
        latestEstimatedRange: report.estimatedBandRange
      });
      const serializedStudentReport = JSON.stringify(studentView);
      const pdfTextPreflight = assertPdfTextIntegrity({
        extractedText: serializedStudentReport,
        savedReportText: serializedStudentReport
      });
      const integrityProblems = validateFeedbackIntegrity(report.feedbackIntegrity || {}, fixture.writing);
      results.push({
        caseId: fixture.id,
        taskType: fixture.taskType,
        reportLanguage,
        status: integrityProblems.length ? "validator-failed" : "provider-pass",
        model: report.providerModel || requiredModel,
        reasoningEffort: report.providerReasoningEffort || reasoningEffort,
        latencyMs: Date.now() - caseStarted,
        retryAttempted: Boolean(report.providerRetryAttempted),
        repairCount: Array.isArray(report.feedbackIntegrityRepairs) ? report.feedbackIntegrityRepairs.length : 0,
        estimatedBandRange: report.estimatedBandRange,
        criterionScores: Object.fromEntries(Object.entries(report.criteriaScores || {}).map(([criterion, value]) => [
          criterion,
          value?.range || ""
        ])),
        validatorOutcome: integrityProblems.length ? "fail" : "pass",
        validatorProblemCount: integrityProblems.length,
        pdfTextPreflight: pdfTextPreflight.issues.length ? "fail" : "pass",
        pdfRenderOutcome: "pending-browser-render",
        teacherReviewStatus: "pending"
      });
    } catch (error) {
      results.push({
        caseId: fixture.id,
        taskType: fixture.taskType,
        reportLanguage,
        status: "provider-failed",
        model: requiredModel,
        reasoningEffort,
        latencyMs: Date.now() - caseStarted,
        retryAttempted: Boolean(error?.retryAttempted),
        repairCount: 0,
        estimatedBandRange: "",
        criterionScores: {},
        validatorOutcome: "not-run",
        validatorProblemCount: Array.isArray(error?.validationDetails) ? error.validationDetails.length : 0,
        pdfTextPreflight: "not-run",
        pdfRenderOutcome: "not-run",
        teacherReviewStatus: "pending",
        errorCode: String(error?.errorCode || "PROVIDER_ERROR"),
        providerStatus: Number(error?.providerStatus || 0) || null
      });
    }
  }
}

const output = {
  release: ANALYSIS_VERSIONS,
  corpusVersion: corpus.corpusVersion,
  startedAt,
  completedAt: new Date().toISOString(),
  provider: {
    model: requiredModel,
    reasoningEffort,
    healthLatencyMs: Date.now() - healthStarted,
    healthStatus: "pass",
    contractStatus: "pass"
  },
  acceptance: {
    providerCasesPassed: results.every((item) => item.status === "provider-pass"),
    validatorCasesPassed: results.every((item) => item.validatorOutcome === "pass"),
    pdfBrowserRenderPassed: false,
    teacherReviewPassed: false
  },
  results
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  outputPath,
  caseCount: results.length,
  providerCasesPassed: output.acceptance.providerCasesPassed,
  validatorCasesPassed: output.acceptance.validatorCasesPassed,
  pending: ["pdfBrowserRenderPassed", "teacherReviewPassed"]
}, null, 2));
process.exit(output.acceptance.providerCasesPassed && output.acceptance.validatorCasesPassed ? 0 : 1);
