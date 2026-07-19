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
assert.equal(report.estimatedBandRange, "6.0-6.5");
assert.equal(report.criteriaScores["Task Response"].range, "6.5");
assert.equal(report.criteriaScores["Coherence & Cohesion"].range, "6.0-6.5");
assert.equal(report.criteriaScores["Lexical Resource"].range, "6.0");
assert.equal(report.criteriaScores["Grammatical Range & Accuracy"].range, "6.0");
assert.equal(report.detectedPosition, "strongly disagree");
assert.equal(report.positionConfidence, "high");

assert.deepEqual(report.top3Issues.map((issue) => issue.issueType), [
  "Development Depth in Both Examples",
  "Full-Response Lexical Precision",
  "Full-Response Grammatical and Sentence Control",
  "Paragraph Closure and Link-Back",
  "Introduction, Thesis and Conclusion Precision"
]);
assert.match(report.top3Issues[0].summary, /Both body paragraphs|both examples/i);
assert.match(report.top3Issues[4].summary, /introduction,? thesis and conclusion/i);

const expectedCards = new Map([
  ["Introduction Paraphrase Precision", ["Route-Preserving Revision", "Some people argue that towns and cities should be divided into separate zones, with schools, shopping malls and industrial sites concentrated in designated areas."]],
  ["Thesis Language Precision", ["Route-Preserving Revision", "However, I strongly disagree because this arrangement could make travel less accessible and worsen traffic congestion."]],
  ["Lexical Precision and Word Formation", ["Route-Preserving Revision", "First of all, concentrating facilities of the same type in one designated zone could create commuting difficulties for some residents."]],
  ["Body 1 Explanation and Sentence Control", ["Route-Preserving Revision", "Families live in different parts of a city, so concentrating facilities of the same type in one designated zone could force some residents to travel long distances to reach them."]],
  ["Body 1 Example Development", ["Teacher-Guided Expansion", "For example, if all schools were concentrated in one education district, students living in outer parts of the city would have to travel farther each day, reducing their study time and placing additional pressure on public transport."]],
  ["Paragraph Closure and Link-Back", ["Route-Preserving Revision", "Therefore, concentrating similar facilities in one area could cause some residents to face travel difficulties."]],
  ["Vocabulary Precision", ["Route-Preserving Revision", "Furthermore, traffic congestion could increase if facilities of the same type were concentrated together within a single designated zone."]],
  ["Body 2 Example Development and Lexical Precision", ["Teacher-Guided Expansion", "For example, if all major shopping malls were concentrated in one district, large numbers of shoppers would use the same roads during peak periods, causing severe traffic congestion around that area."]],
  ["Conclusion Precision and Sentence Control", ["Route-Preserving Revision", "In conclusion, I firmly believe that urban areas should not be divided into separate zones for different types of facilities, because this would make travel less accessible and worsen traffic congestion."]]
]);

assert.deepEqual(report.feedbackCards.map((card) => card.issueType), [...expectedCards.keys()]);
assert.equal(report.feedbackCards.length, 9);
for (const card of report.feedbackCards) {
  const [revisionType, revision] = expectedCards.get(card.issueType);
  assert.equal(card.revisionType, revisionType);
  assert.equal(card.targetedRevision, revision);
  assert.deepEqual(Object.fromEntries([
    "exactOriginalFound",
    "diagnosedCategories",
    "remainingDiagnosedCategories",
    "newErrorCategories",
    "originalClaim",
    "revisedClaim",
    "routePreserved",
    "stancePreserved",
    "newPremiseIntroduced",
    "sentenceComplete",
    "naturalEnglish",
    "revisionType",
    "revisionTypeValid",
    "pass"
  ].map((key) => [key, card.revisionIntegrity[key]])), {
    exactOriginalFound: true,
    diagnosedCategories: card.revisionIntegrity.diagnosedCategories,
    remainingDiagnosedCategories: [],
    newErrorCategories: [],
    originalClaim: card.exactSentence,
    revisedClaim: revision,
    routePreserved: true,
    stancePreserved: true,
    newPremiseIntroduced: card.revisionIntegrity.newPremiseIntroduced,
    sentenceComplete: true,
    naturalEnglish: true,
    revisionType,
    revisionTypeValid: true,
    pass: true
  });
}

const fullReportText = JSON.stringify(report);
assert.doesNotMatch(fullReportText, /Band 8 development|several hours commuting|shopping malls and restaurants/i);
assert.match(fullReportText, /word formation/i);
assert.match(fullReportText, /vague noun phrase/i);

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
  estimatedBandRange: "6.0-6.5",
  top3Issues: report.top3Issues,
  mostUrgentRepair: report.mostUrgentRepair,
  analysisValidity: "valid",
  progressEligible: index === 0,
  analysisReason: index ? "engine-upgrade" : "first-analysis",
  appVersion: `11.${index}.0`,
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
  appVersion: "11.4.0",
  engineVersion: "ielts-diagnostic-engine-v11.4",
  rubricVersion: "kru-pom-ielts-writing-v11.4",
  promptVersion: "ielts-diagnostic-prompt-v11.4",
  reportSchemaVersion: "ielts-diagnostic-report-v11.4"
});

const [script, css] = await Promise.all([
  readFile(new URL("../script.js", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8")
]);
assert.match(script, /Latest Essay Report Version History/);
assert.match(script, /engine reruns are excluded from progress trends/);
assert.match(script, /print-route-section/);
assert.match(css, /font-family:\s*"Noto Sans Thai", Arial, sans-serif/);
assert.match(css, /\.print-route-section\s*\{\s*margin-top:\s*0/);

console.log("V11.3 report completeness hotfix: eight evidence cards, five priorities, revision fidelity, PDF layout/text and report-version grouping checks passed.");
