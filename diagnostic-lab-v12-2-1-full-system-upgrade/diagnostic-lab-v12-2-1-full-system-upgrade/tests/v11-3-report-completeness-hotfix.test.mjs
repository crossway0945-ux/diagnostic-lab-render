import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { buildServerProgressSummary, createStudentWorkFingerprint } from "../services/apiRouter.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";
import { countWords } from "../wordCount.js";

const prompt = [
  "Towns and cities should be divided into zones so that all the schools are in one area, all the shopping malls are located together and all the industrial sites are situated close to each other.",
  "To what extent do you agree that urban areas should be split into distinct zones?"
].join("\n\n");

const writing = [
  "Some people may argue that towns and cities should be separated into zones, so all the same places are in the same area. However, I strongly disagree with the statement due to the lack of travel accessibility and traffic congestion.",
  "First of all, the clusterization of a specific place could lead to the difficulty of traveling. Every family is living in different places and distances, which could be very far away from their house, so it would be very difficult to travel through long distance. For instance, a student's house is very far away from his school, and it takes 3 hours to arrive there, so he needs to wake up at 5AM every morning, which lowers his energy and concentration in the class, resulting in bad grades. Therefore, when a certain place is clustered in one area, some people might encounter an issue of traveling,",
  "Furthermore, there would be more traffic congestion when a specific place is divided into a zone. Some places attract more people in some period of time, which could create a heavy traffic jam. For example, restaurants or shopping malls attract more people at breakfast, lunch, and dinner time; hence, people will be moving in the same direction at the same time, resulting in a large traffic congestion.",
  "In conclusion, I firmly believe that specific places like towns and cities should not be divided into zones, thus all the same places are in one area, since this could contribute to the difficulty in traveling and the congestion of traffic."
].join("\n\n");

const report = await analyzeWriting({
  taskType: "Task 2",
  essayType: "Opinion Essay",
  prompt,
  writing,
  targetBand: "7.0",
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
});

assert.equal(countWords(writing), 254);
assert.equal(report.estimatedBandRange, "6.0");
assert.equal(report.criteriaScores["Task Response"].range, "6.0-6.5");
assert.equal(report.criteriaScores["Coherence & Cohesion"].range, "6.0");
assert.equal(report.criteriaScores["Lexical Resource"].range, "6.0");
assert.equal(report.criteriaScores["Grammatical Range & Accuracy"].range, "6.0");
assert.equal(report.detectedPosition, "strongly disagree");
assert.equal(report.positionConfidence, "high");
assert.equal(report.kruPomScores["Conclusion Closure"].status, "Moderate");

const requiredLocations = [
  "Introduction, Sentence 1",
  "Introduction, Sentence 2",
  "Body Paragraph 1, Sentence 1",
  "Body Paragraph 1, Sentence 2",
  "Body Paragraph 1, Sentence 3",
  "Body Paragraph 1, Sentence 4",
  "Body Paragraph 2, Sentence 1",
  "Body Paragraph 2, Sentence 2",
  "Body Paragraph 2, Sentence 3",
  "Conclusion, Sentence 1"
];
assert.deepEqual(report.feedbackCards.map((card) => card.paragraphLocation), requiredLocations);
assert.equal(report.feedbackCards.length, 10);
assert.ok(report.feedbackCards.some((card) => card.paragraphLocation === "Body Paragraph 2, Sentence 2" && /Explanation and Mechanism/.test(card.issueType)));
assert.ok(report.feedbackCards.some((card) => card.paragraphLocation === "Conclusion, Sentence 1" && /Conclusion Precision/.test(card.issueType)));
assert.ok(report.feedbackCards.every((card) => card.revisionIntegrity?.pass));
assert.ok(report.feedbackCards.every((card) => ["Route-Preserving Revision", "Teacher-Guided Expansion", "Minimal Correction", "High-Band Refinement"].includes(card.revisionType)));
assert.ok(report.feedbackCards.every((card) => writing.includes(card.exactSentence)));
assert.ok(report.feedbackCards.every((card) => !/\b(?:serious|severe|significant|essential facilities|many residents)\b/i.test(card.revisionType === "Route-Preserving Revision" ? card.targetedRevision : "")));
assert.match(report.feedbackCards.find((card) => card.paragraphLocation === "Body Paragraph 2, Sentence 2").targetedRevision, /same roads|traffic congestion/i);
assert.match(report.feedbackCards.find((card) => card.paragraphLocation === "Conclusion, Sentence 1").targetedRevision, /strongly disagree.*urban areas should be divided.*travel difficulties.*traffic congestion/i);
assert.ok(!report.feedbackCards.some((card) => /restaurants.*not in the prompt|restaurants.*outside the prompt/i.test(`${card.whyItLimitsBand} ${card.kruPomDiagnosis}`)));

const fingerprint = createStudentWorkFingerprint("teacher", {
  taskType: "Task 2",
  publicEssayType: "Opinion Essay",
  internalEssaySubtype: "opinion",
  studentProfileId: "sun",
  prompt,
  writing
});
const versions = Array.from({ length: 5 }, (_, index) => ({
  submissionId: `sun-version-${index + 1}`,
  parentReportId: index ? `sun-version-${index}` : "",
  dateTime: `2026-07-17T${String(index + 8).padStart(2, "0")}:00:00.000Z`,
  taskType: "Task 2",
  studentProfileId: "sun",
  studentWorkFingerprint: fingerprint,
  estimatedBandRange: report.estimatedBandRange,
  top3Issues: report.top3Issues,
  mostUrgentRepair: report.mostUrgentRepair,
  analysisValidity: "valid",
  progressEligible: index === 0,
  analysisReason: index ? "engine-upgrade" : "first-analysis",
  appVersion: `12.${index}.0`,
  engineVersion: `engine-${index + 1}`
}));
const progress = buildServerProgressSummary(versions, null, "Task 2");
assert.equal(progress.reportCount, 1);
assert.equal(progress.previousSubmissionCount, 0);
assert.equal(progress.reportVersionCount, 5);
assert.equal(progress.currentReportVersion, 5);
assert.equal(progress.reportVersions.length, 5);
assert.equal(progress.repeatedIssue, "");

assert.deepEqual(ANALYSIS_VERSIONS, {
  appVersion: "12.2.1",
  engineVersion: "ielts-diagnostic-engine-v12.2.1",
  rubricVersion: "kru-pom-ielts-writing-v12.2.1",
  promptVersion: "ielts-diagnostic-prompt-v12.2.1",
  reportSchemaVersion: "ielts-diagnostic-report-v12.2.1"
});

const [script, template, viewModel, fonts, integrityModule] = await Promise.all([
  readFile(new URL("../script.js", import.meta.url), "utf8"),
  readFile(new URL("../reports/studentReportTemplate.js", import.meta.url), "utf8"),
  readFile(new URL("../reports/studentReportViewModel.js", import.meta.url), "utf8"),
  readFile(new URL("../reports/reportFonts.js", import.meta.url), "utf8"),
  readFile(new URL("../domain/task2DiagnosticIntegrity.js", import.meta.url), "utf8")
]);
assert.match(script, /Latest Essay Report Version History/);
assert.match(template, /route-card/);
assert.match(viewModel, /sameGroupVersions/);
assert.match(fonts, /Noto Sans Thai/);
assert.doesNotMatch(integrityModule, /localizeUrbanZoningCard|isZoningOpinion/);

console.log("V12.2 full-system report integrity: calibrated scoring, paragraph matching, revision fidelity, conclusion control and progress grouping passed.");
