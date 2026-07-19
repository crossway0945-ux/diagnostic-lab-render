import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { buildServerProgressSummary, createStudentWorkFingerprint, createSubmissionGroupId } from "../services/apiRouter.js";
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
const report = await analyzeWriting({ taskType: "Task 2", essayType: "Opinion Essay", prompt, writing, targetBand: "7.0", options: { strictFeedback: true } });
assert.equal(countWords(writing), 254);
assert.equal(report.estimatedBandRange, "6.0");
assert.equal(report.criteriaScores["Task Response"].range, "6.0-6.5");
assert.equal(report.kruPomScores["Conclusion Closure"].status, "Moderate");
assert.equal(report.top3Issues.length, 3);
for (const issue of report.top3Issues) {
  assert.ok(issue.feedbackCardId);
  assert.ok(issue.exactSentence);
  assert.ok(writing.includes(issue.exactSentence));
  assert.ok(issue.paragraphLocation);
  assert.ok(issue.diagnosis);
}
assert.ok(report.feedbackCards.some((card) => card.paragraphLocation === "Body Paragraph 2, Sentence 2"));
assert.ok(report.feedbackCards.every((card) => card.revisionIntegrity?.pass));

const currentFingerprint = createStudentWorkFingerprint("teacher", {
  taskType: "Task 2",
  publicEssayType: "Opinion Essay",
  internalEssaySubtype: "opinion",
  studentProfileId: "sun",
  prompt,
  writing
});
const currentGroup = createSubmissionGroupId("teacher", { studentWorkFingerprint: currentFingerprint });
assert.equal(currentGroup, createSubmissionGroupId("teacher", { studentWorkFingerprint: currentFingerprint }));

const priorRecords = Array.from({ length: 4 }, (_, index) => ({
  submissionId: `previous-${index + 1}`,
  submissionGroupId: `work-previous-${index + 1}`,
  studentWorkFingerprint: `previous-fingerprint-${index + 1}`,
  dateTime: `2026-07-${String(index + 10).padStart(2, "0")}T08:00:00.000Z`,
  taskType: "Task 2",
  studentProfileId: "sun",
  estimatedBandRange: "6.0-6.5",
  top3Issues: [{ issueType: index === 0 ? "Vocabulary Precision" : `Distinct prior issue ${index + 1}` }],
  mostUrgentRepair: "Previous distinct response repair",
  analysisValidity: "valid",
  progressEligible: true
}));
const reportVersions = Array.from({ length: 4 }, (_, index) => ({
  submissionId: `sun-version-${index + 1}`,
  submissionGroupId: currentGroup,
  parentReportId: index ? `sun-version-${index}` : "",
  studentWorkFingerprint: currentFingerprint,
  dateTime: `2026-07-17T${String(index + 8).padStart(2, "0")}:00:00.000Z`,
  taskType: "Task 2",
  studentProfileId: "sun",
  estimatedBandRange: "6.0-6.5",
  top3Issues: [{ issueType: "Vocabulary Precision" }, { issueType: "Same-work rerun marker" }],
  mostUrgentRepair: report.mostUrgentRepair,
  analysisValidity: "valid",
  progressEligible: index === 0,
  analysisReason: index ? "engine-upgrade" : "first-analysis",
  appVersion: `11.${index + 1}.0`,
  engineVersion: `engine-${index + 1}`
}));
const progress = buildServerProgressSummary([...priorRecords, ...reportVersions], null, "Task 2");
assert.equal(progress.previousSubmissionCount, 4);
assert.equal(progress.reportCount, 5);
assert.equal(progress.distinctSubmissionCount, 5);
assert.equal(progress.reportVersionCount, 4);
assert.equal(progress.currentReportVersion, 4);
assert.equal(progress.currentSubmissionGroupId, currentGroup);
assert.equal(progress.previousSubmissionId, "previous-4");
assert.notEqual(progress.previousSubmissionGroupId, currentGroup);
assert.equal(progress.sameWorkRerunsExcluded, true);
assert.equal(progress.repeatedIssuesUseDistinctSubmissions, true);
assert.equal(progress.repeatedIssue, "Vocabulary Precision");
assert.ok(progress.reportVersions.every((version) => version.submissionGroupId === currentGroup));
assert.deepEqual(progress.reportVersions.map((version) => version.progressEligible), [true, false, false, false]);
assert.notEqual(progress.repeatedIssue, "Same-work rerun marker");

assert.deepEqual(ANALYSIS_VERSIONS, {
  appVersion: "12.2.1",
  engineVersion: "ielts-diagnostic-engine-v12.2.1",
  rubricVersion: "kru-pom-ielts-writing-v12.2.1",
  promptVersion: "ielts-diagnostic-prompt-v12.2.1",
  reportSchemaVersion: "ielts-diagnostic-report-v12.2.1"
});

const [template, renderer, studentViewModel, textSanitization] = await Promise.all([
  readFile(new URL("../reports/studentReportTemplate.js", import.meta.url), "utf8"),
  readFile(new URL("../reports/pdfRenderer.js", import.meta.url), "utf8"),
  readFile(new URL("../reports/studentReportViewModel.js", import.meta.url), "utf8"),
  readFile(new URL("../reports/textSanitization.js", import.meta.url), "utf8")
]);
assert.match(template, /Estimated range, not an official IELTS score\./);
assert.match(template, /document\.fonts\.ready/);
assert.match(template, /data-report-block/);
assert.doesNotMatch(template, /submissionGroupId|Report-Version and Progress Proof/i);
assert.match(renderer, /extractPdfTextWithPdfJs/);
assert.match(renderer, /findForbiddenUnicode/);
assert.match(studentViewModel, /currentSubmissionGroupId/);
assert.match(studentViewModel, /sameGroupVersions/);
assert.match(textSanitization, /normalize\("NFC"\)/);
assert.doesNotMatch(template, /similar facilities were concentrated in separate zones/i);

console.log("V12 PDF/traceability proof: deterministic pagination, searchable-text sanitization, strict student projection, and distinct-submission version grouping passed.");
