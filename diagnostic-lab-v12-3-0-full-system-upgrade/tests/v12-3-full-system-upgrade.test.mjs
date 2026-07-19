import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";
import { classifyTask1Visual } from "../domain/task1Classification.js";
import { analyzeTask2Safety } from "../domain/task2Safety.js";
import { buildSentenceCoverageAudit } from "../domain/paragraphEvidence.js";
import {
  STUDENT_REPORT_ALLOWLIST,
  assertStudentReportViewModel,
  buildAdminReportQAViewModel,
  buildStudentReportViewModel
} from "../domain/reportViewModels.js";
import { unicodeIntegrityIssues } from "../domain/textIntegrity.js";

assert.deepEqual(ANALYSIS_VERSIONS, {
  appVersion: "12.3.0",
  engineVersion: "ielts-diagnostic-engine-v12.3.0",
  rubricVersion: "kru-pom-ielts-writing-v12.3.0",
  promptVersion: "ielts-diagnostic-prompt-v12.3.0",
  reportSchemaVersion: "ielts-diagnostic-report-v12.3.0"
});

const visualCases = [
  ["The line graph shows changes in commuter numbers from 2000 to 2020.", "Line Graph"],
  ["The bar chart compares five product categories.", "Bar Chart"],
  ["The pie charts show the distribution of household spending.", "Pie Chart"],
  ["The table presents figures for six regions.", "Table"],
  ["The maps compare a town plan in 1990 and 2020.", "Map"],
  ["The diagram shows the process by which paper is recycled.", "Diagram"],
  ["The pie chart shows proportions while the bar chart compares totals.", "Mixed / Combination Visuals"]
];
for (const [prompt, expected] of visualCases) {
  assert.equal(classifyTask1Visual({ prompt }).publicVisualType, expected);
}

const sunPrompt = "Towns and cities should be divided into zones so that all the schools are in one area, all the shopping malls are located together and all the industrial sites are situated close to each other. To what extent do you agree that urban areas should be split into distinct zones?";
const sunWriting = [
  "Some people may argue that towns and cities should be separated into zones, so all the same places are in the same area. However, I strongly disagree with the statement due to the lack of travel accessibility and traffic congestion.",
  "First of all, the clusterization of a specific place could lead to the difficulty of traveling. Every family is living in different places and distances, which could be very far away from their house, so it would be very difficult to travel through long distance. For instance, a student's house is very far away from his school, and it takes 3 hours to arrive there, so he needs to wake up at 5AM every morning, which lowers his energy and concentration in the class, resulting in bad grades. Therefore, when a certain place is clustered in one area, some people might encounter an issue of traveling,",
  "Furthermore, there would be more traffic congestion when a specific place is divided into a zone. Some places attract more people in some period of time, which could create a heavy traffic jam. For example, restaurants or shopping malls attract more people at breakfast, lunch, and dinner time; hence, people will be moving in the same direction at the same time, resulting in a large traffic congestion.",
  "In conclusion, I firmly believe that specific places like towns and cities should not be divided into zones, thus all the same places are in one area, since this could contribute to the difficulty in traveling and the congestion of traffic."
].join("\n\n");
const sunSafety = analyzeTask2Safety({ taskType: "Task 2", essayType: "Opinion Essay", prompt: sunPrompt, writing: sunWriting });
assert.equal(sunSafety.detectedPosition, "strongly disagree");
assert.equal(sunSafety.positionConfidence, "high");
assert.equal(sunSafety.concessionStatus, "No concession");
assert.equal(sunSafety.canonicalAnalysis.frameworkAssessment.conclusionClosure.status, "Moderate");
assert.equal(sunSafety.canonicalAnalysis.frameworkAssessment.explanationDepth.status, "Moderate");
assert.equal(sunSafety.canonicalAnalysis.frameworkAssessment.sarExampleQuality.status, "Moderate");
const sunCoverage = buildSentenceCoverageAudit(sunWriting, "Task 2");
const sunBody2Sentence2 = sunCoverage.sentences.find((item) => item.location === "Body Paragraph 2, Sentence 2");
assert.ok(sunBody2Sentence2?.considered);
assert.match(sunBody2Sentence2.exactText, /^Some places attract more people/);

const yukiPrompt = "Some people think that spending money on space exploration is not worth it and should be used to solve problems on Earth instead. To what extent do you agree or disagree?";
const yukiWriting = [
  "Some people think that spending a lot of money on space exploration is not worth it, and that this money should be used to solve problems on Earth instead. While the opinion is valid, I partly disagree because space research also brings new technology, useful knowledge, and future opportunities that can help improve life on Earth in the long run.",
  "On one hand, it is true that many countries still face serious problems such as poverty, hunger, and poor healthcare. Millions of people do not have enough food, clean water, or proper education. In this situation, spending billions on rockets and satellites can seem wasteful. Governments could use that money to build hospitals, schools, and houses for people in need. These projects would make life better for people right away, instead of focusing on something far away in space.",
  "On the other hand, space exploration also brings useful results that help us in daily life. For example, satellites are used for weather forecasts, GPS, and communication, all of which come from space research. Studying space also helps scientists learn more about Earth's climate and how to protect it. Although it costs a lot of money, space technology can lead to new inventions and inspire young people to study science and technology, which helps society grow in the future.",
  "In conclusion, I believe that while it is important to solve the problems we have on Earth, investing in space exploration is still valuable. If countries spend money wisely, they can support both the needs of people today and the discoveries that will help us in the near future."
].join("\n\n");
const yukiSafety = analyzeTask2Safety({ taskType: "Task 2", essayType: "Opinion Essay", prompt: yukiPrompt, writing: yukiWriting });
assert.match(yukiSafety.detectedPosition, /partly|partial/i);
assert.ok(["medium", "high"].includes(yukiSafety.positionConfidence));
assert.match(yukiSafety.concessionStatus, /concession/i);
assert.equal(yukiSafety.routeAssessment.bodyRoutes.length, 2);
assert.match(yukiSafety.routeAssessment.bodyRoutes[0].label, /concession|opposing|concern/i);
assert.doesNotMatch(yukiSafety.canonicalAnalysis.frameworkAssessment.conclusionClosure.status, /Needs Work|Major|Critical/i);

const yukiReport = await analyzeWriting({
  taskType: "Task 2",
  essayType: "Opinion Essay",
  prompt: yukiPrompt,
  writing: yukiWriting,
  targetBand: "7.0",
  reportLanguage: "en",
  options: { strictFeedback: true }
});
assert.ok(yukiReport.practicePlan.length === 7);
assert.doesNotMatch(JSON.stringify(yukiReport.paragraphFeedback), /This paragraph performs its basic function/i);
assert.ok(yukiReport.feedbackCards.every((card) => card.revisionIntegrity.pass));

const studentView = buildStudentReportViewModel({
  ...yukiReport,
  studentDisplayNameSnapshot: "Regression Student",
  inputFingerprint: "must-not-leak",
  engineVersion: "must-not-leak",
  validationClassification: { internal: true }
}, {
  previousSubmissionCount: 2,
  latestEstimatedRange: yukiReport.estimatedBandRange,
  submissionGroupId: "must-not-leak",
  reportVersionId: "must-not-leak"
});
assert.deepEqual(Object.keys(studentView), STUDENT_REPORT_ALLOWLIST);
assert.equal(assertStudentReportViewModel(studentView), true);
assert.doesNotMatch(JSON.stringify(studentView), /must-not-leak|submissionGroupId|reportVersionId|engineVersion|validationClassification/i);
for (const criterion of Object.values(studentView.criteriaBreakdown)) {
  assert.deepEqual(Object.keys(criterion), ["range", "diagnosis", "evidence"]);
}
const adminView = buildAdminReportQAViewModel(yukiReport, { reportId: "qa-report", submissionGroupId: "qa-group", validation: { pass: true } });
assert.equal(adminView.reportId, "qa-report");
assert.equal(adminView.submissionGroupId, "qa-group");
assert.equal(adminView.validation.pass, true);

assert.deepEqual(unicodeIntegrityIssues("วันที่ตรวจรายงาน ภาษาไทยสมบูรณ์"), []);
assert.ok(unicodeIntegrityIssues("ข้อความ\u200Bแฝง").includes("FORBIDDEN_UNICODE_CODE_POINT"));

const [analyzerSource, scriptSource, cssSource, renderConfig] = await Promise.all([
  readFile(new URL("../services/aiAnalyzer.js", import.meta.url), "utf8"),
  readFile(new URL("../script.js", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8"),
  readFile(new URL("../render.yaml", import.meta.url), "utf8")
]);
assert.doesNotMatch(analyzerSource, /studentDisplayNameSnapshot\s*===?\s*["'](?:Sun|Yuki)["']/i);
assert.doesNotMatch(analyzerSource, /Some places attract more people in some period of time/i);
assert.match(scriptSource, /measureProtectedPrintBlocks/);
assert.match(scriptSource, /getBoundingClientRect/);
assert.equal((cssSource.match(/@media\s+print/g) || []).length, 1);
assert.match(cssSource, /@page\s*\{[\s\S]*?size:\s*A4/);
assert.match(cssSource, /NotoSansThai-Variable\.ttf/);
assert.match(cssSource, /break-inside:\s*avoid/);
assert.match(renderConfig, /rootDir:\s*diagnostic-lab-v12-3-0-full-system-upgrade/);
assert.match(renderConfig, /buildCommand:\s*npm install/);
assert.match(renderConfig, /startCommand:\s*npm start/);
assert.match(renderConfig, /healthCheckPath:\s*\/api\/health/);
assert.match(renderConfig, /NODE_VERSION[\s\S]*?22\.16\.0/);

console.log("V12.3 full-system upgrade: Task 1 matrix, Sun/Yuki evidence calibration, student/admin boundary, Unicode, print preflight, and Render contract passed.");
