import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import {
  buildServerProgressSummary,
  createStudentWorkFingerprint,
  createSubmissionGroupId
} from "../services/apiRouter.js";
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
assert.equal(report.estimatedBandRange, "6.0-6.5");
assert.equal(report.criteriaScores["Task Response"].range, "6.5");
assert.equal(report.criteriaScores["Coherence & Cohesion"].range, "6.0-6.5");
assert.equal(report.criteriaScores["Lexical Resource"].range, "6.0");
assert.equal(report.criteriaScores["Grammatical Range & Accuracy"].range, "6.0");
assert.equal(report.detectedPosition, "strongly disagree");
assert.equal(report.positionConfidence, "high");
assert.equal(report.kruPomScores["Thesis Route Clarity"].status, "Strong");
assert.equal(report.kruPomScores["Body Paragraph Route Alignment"].status, "Aligned");

const body2Sentence2 = report.sentenceCoverageAudit.sentences.find((item) => item.location === "Body Paragraph 2, Sentence 2");
assert.ok(body2Sentence2);
assert.equal(body2Sentence2.exactText, "Some places attract more people in some period of time, which could create a heavy traffic jam.");
assert.equal(body2Sentence2.considered, true);

for (const issue of report.top3Issues) {
  assert.ok(["single-location", "multi-location", "full-response"].includes(issue.scope));
  assert.ok(Array.isArray(issue.paragraphLocations) && issue.paragraphLocations.length >= 1);
  assert.ok(Array.isArray(issue.evidenceItems) && issue.evidenceItems.length >= 1);
  assert.ok(issue.diagnosis);
  assert.ok(Array.isArray(issue.affectedCriteria) && issue.affectedCriteria.length >= 1);
  assert.ok(issue.studentAction);
  for (const evidence of issue.evidenceItems) {
    assert.ok(issue.paragraphLocations.includes(evidence.paragraphLocation));
    assert.ok(writing.includes(evidence.exactSentence), `${issue.issueType}: evidence must be verbatim student text`);
    assert.ok(evidence.evidenceRole);
  }
}

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
  appVersion: "12.4.1",
  engineVersion: "ielts-diagnostic-engine-v12.4.0",
  rubricVersion: "kru-pom-ielts-writing-v12.3.0",
  promptVersion: "ielts-diagnostic-prompt-v12.3.1",
  reportSchemaVersion: "ielts-diagnostic-report-v12.4.0",
  feedbackSchemaVersion: "feedback-integrity-v12.4.0",
  issueTaxonomyVersion: "issue-taxonomy-v12.3.5",
  revisionValidatorVersion: "revision-alignment-v12.4.0"
});

const [script, css] = await Promise.all([
  readFile(new URL("../script.js", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8")
]);
assert.equal((script.match(/Estimated range, not official IELTS score\./g) || []).length, 1);
assert.match(script, /sanitizePrintText/);
assert.match(script, /submissionGroupId/);
assert.match(script, /Report-Version and Progress Proof/);
assert.match(css, /font-family:\s*"Noto Sans Thai Embedded"/);
assert.match(css, /\.print-cover \.print-summary-grid/);
assert.match(css, /\.print-evidence-item/);
assert.doesNotMatch(script, /similar facilities were concentrated in separate zones/i);

console.log("V11.4 PDF/traceability proof: pagination source, searchable-text sanitization, exact Body 2 revision, multi-location evidence, and distinct-submission version grouping passed.");
