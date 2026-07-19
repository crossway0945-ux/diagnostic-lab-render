import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeStudentFacingText } from "../domain/canonicalAnalysis.js";
import {
  analyzeTask2Safety,
  validateTask2RevisionIntegrity
} from "../domain/task2Safety.js";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import {
  buildServerProgressSummary,
  createStudentWorkFingerprint
} from "../services/apiRouter.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";
import { countWords } from "../wordCount.js";

const prompt = [
  "Towns and cities should be divided into zones so that all the schools are in one area, all the shopping malls are located together and all the industrial sites are situated close to each other.",
  "To what extent do you agree that urban areas should be split into distinct zones?"
].join("\n\n");

const introduction = "Some people may argue that towns and cities should be separated into zones, so all the same places are in the same area. However, I strongly disagree with the statement due to the lack of travel accessibility and traffic congestion.";
const body1 = "First of all, the clusterization of a specific place could lead to the difficulty of traveling. Every family is living in different places and distances, which could be very far away from their house, so it would be very difficult to travel through long distance. For instance, a student's house is very far away from his school, and it takes 3 hours to arrive there, so he needs to wake up at 5AM every morning, which lowers his energy and concentration in the class, resulting in bad grades. Therefore, when a certain place is clustered in one area, some people might encounter an issue of traveling,";
const body2 = "Furthermore, there would be more traffic congestion when a specific place is divided into a zone. Some places attract more people in some period of time, which could create a heavy traffic jam. For example, restaurants or shopping malls attract more people at breakfast, lunch, and dinner time; hence, people will be moving in the same direction at the same time, resulting in a large traffic congestion.";
const conclusion = "In conclusion, I firmly believe that specific places like towns and cities should not be divided into zones, thus all the same places are in one area, since this could contribute to the difficulty in traveling and the congestion of traffic.";
const writing = [introduction, body1, body2, conclusion].join("\n\n");

const report = await analyzeWriting({
  taskType: "Task 2",
  essayType: "Opinion Essay",
  prompt,
  writing,
  targetBand: "7.0",
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
});
const safety = analyzeTask2Safety({ taskType: "Task 2", essayType: "Opinion Essay", prompt, writing });

assert.equal(countWords(writing), 254);
assert.equal(report.estimatedBandRange, "6.0-6.5");
assert.equal(report.criteriaScores["Task Response"].range, "6.5");
assert.equal(report.criteriaScores["Coherence & Cohesion"].range, "6.0-6.5");
assert.equal(report.criteriaScores["Lexical Resource"].range, "6.0");
assert.equal(report.criteriaScores["Grammatical Range & Accuracy"].range, "6.0");
assert.equal(safety.detectedPosition, "strongly disagree");
assert.equal(safety.concessionStatus, "No concession");

assert.deepEqual(
  Object.fromEntries(Object.entries(report.kruPomScores).map(([key, value]) => [key, value.status])),
  {
    "Essay Type Recognition": "Strong",
    "Prompt Coverage": "Strong",
    "Position Clarity": "Strong",
    "Thesis Route Clarity": "Strong",
    "Body Paragraph Route Alignment": "Strong",
    "Explanation Depth": "Moderate",
    "SAR Example Quality": "Moderate",
    "Link Back Control": "Moderate",
    "Conclusion Closure": "Strong",
    "LFC CPC Control": "Moderate"
  }
);
assert.equal(
  report.kruPomScores["Body Paragraph Route Alignment"].diagnosis,
  "Body Paragraph 1 develops the accessibility reason stated in the thesis. Body Paragraph 2 develops the traffic-congestion reason stated in the thesis."
);
assert.doesNotMatch(report.kruPomScores["Body Paragraph Route Alignment"].diagnosis, /adequately developed|partially developed/i);

assert.equal(report.practicePlan.length, 7);
assert.deepEqual(report.practicePlan.map((item) => item.day), [1, 2, 3, 4, 5, 6, 7]);
assert.match(`${report.practicePlan[0].title} ${report.practicePlan[0].task}`, /causal mechanism|wider consequence/i);
assert.doesNotMatch(`${report.practicePlan[0].title} ${report.practicePlan[0].task}`, /map the task routes|check the conclusion/i);

for (const card of report.feedbackCards) {
  assert.equal(card.revisionIntegrity?.pass, true, `${card.issueType} must pass revision integrity`);
}
const body1Card = report.feedbackCards.find((card) => /Every family is living/i.test(card.exactSentence));
assert.ok(body1Card);
assert.doesNotMatch(body1Card.targetedRevision, /is living|different places and distances|travel through long distance/i);
assert.match(body1Card.targetedRevision, /Families live in different parts of a city/i);

const revisionCases = [
  {
    exactSentence: "Some people may argue that towns and cities should be separated into zones, so all the same places are in the same area.",
    targetedRevision: "Some people argue that towns and cities should be divided into separate zones, with schools, shopping malls and industrial sites concentrated in designated areas.",
    revisionType: "Route-Preserving Revision"
  },
  {
    exactSentence: "Every family is living in different places and distances, which could be very far away from their house, so it would be very difficult to travel through long distance.",
    targetedRevision: "Families live in different parts of a city, and some may live far from essential facilities, making essential journeys more difficult.",
    revisionType: "Route-Preserving Revision"
  },
  {
    exactSentence: conclusion,
    targetedRevision: "In conclusion, I firmly believe that towns and cities should not concentrate similar facilities in separate zones, because this policy could make essential journeys more difficult and increase traffic congestion.",
    revisionType: "Route-Preserving Revision"
  }
];
for (const revision of revisionCases) {
  const integrity = validateTask2RevisionIntegrity(revision);
  assert.equal(integrity.pass, true, JSON.stringify(integrity));
  assert.deepEqual(integrity.revisionIssueCategoriesRemaining, []);
}
assert.doesNotMatch(revisionCases[2].targetedRevision, /specific places like towns and cities|all the same places|difficulty in traveling|congestion of traffic|thus/i);

const dirtyUnicode = "two–body route \uFFFD private:\uE000";
const cleanUnicode = normalizeStudentFacingText(dirtyUnicode);
assert.equal(cleanUnicode, "two-body route private:");
assert.doesNotMatch(cleanUnicode, /[\uFFFD\uFFFE\uFFFF\uE000-\uF8FF\u2013\u2014]/u);

const basePayload = {
  taskType: "Task 2",
  essayType: "Opinion Essay",
  publicEssayType: "Opinion Essay",
  studentProfileId: "sun",
  prompt,
  writing
};
const fingerprint = createStudentWorkFingerprint("teacher", basePayload);
const previous = {
  submissionId: "sun-v11-1",
  dateTime: "2026-07-17T08:00:00.000Z",
  taskType: "Task 2",
  studentProfileId: "sun",
  studentWorkFingerprint: fingerprint,
  estimatedBandRange: "6.5-7.0",
  top3Issues: [{ issueType: "Vocabulary Precision" }],
  analysisValidity: "valid",
  progressEligible: true
};
const current = {
  ...previous,
  submissionId: "sun-v11-2",
  dateTime: "2026-07-17T09:00:00.000Z",
  estimatedBandRange: "6.0-6.5",
  mostUrgentRepair: report.mostUrgentRepair,
  analysisReason: "engine-upgrade",
  progressEligible: false
};
const progress = buildServerProgressSummary([previous, current], current, "Task 2");
assert.equal(progress.previousSubmissionCount, 0);
assert.equal(progress.reportCount, 1);
assert.equal(progress.previousEstimatedRange, "");
assert.equal(progress.changeIndicator, "new");
assert.equal(progress.repeatedIssue, "");

assert.deepEqual(ANALYSIS_VERSIONS, {
  appVersion: "11.4.0",
  engineVersion: "ielts-diagnostic-engine-v11.4",
  rubricVersion: "kru-pom-ielts-writing-v11.4",
  promptVersion: "ielts-diagnostic-prompt-v11.4",
  reportSchemaVersion: "ielts-diagnostic-report-v11.4"
});

const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const printCardRule = css.match(/\.print-feedback-card\s*\{[^}]+\}/g)?.join("\n") || "";
assert.match(printCardRule, /break-inside:\s*auto/);
assert.doesNotMatch(printCardRule, /break-inside:\s*avoid/);

console.log("V11.2 report-integrity hotfix: frozen scoring, framework, full revisions, 7-day plan, progress versioning, Unicode, and print pagination checks passed.");
