import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assessConclusionFunction,
  buildFeedbackIntegrityModel,
  detectSentenceRole,
  evaluateRevisionAlignment,
  validateFeedbackIntegrity
} from "../domain/feedbackIntegrity.js";
import { segmentStudentResponse } from "../domain/paragraphEvidence.js";
import { isTransientPdfError, runWithSingleTransientPdfRetry } from "../domain/pdfRetry.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";

assert.equal(ANALYSIS_VERSIONS.appVersion, "12.3.2");
assert.equal(ANALYSIS_VERSIONS.rubricVersion, "kru-pom-ielts-writing-v12.3.0");
assert.equal(ANALYSIS_VERSIONS.feedbackSchemaVersion, "feedback-integrity-v12.3.2");
assert.equal(ANALYSIS_VERSIONS.issueTaxonomyVersion, "issue-taxonomy-v12.3.2");
assert.equal(ANALYSIS_VERSIONS.revisionValidatorVersion, "revision-alignment-v12.3.2");

const task2Writing = [
  "Urban zoning is often presented as an efficient planning policy. However, I strongly disagree because it creates longer journeys and concentrated traffic.",
  "First, strict zoning can make essential journeys unnecessarily long. Families may live far from schools and workplaces because these services are concentrated elsewhere. For example, students may travel for hours, so they arrive tired and learn less effectively. Therefore, this arrangement imposes avoidable travel costs on families.",
  "Furthermore, putting similar destinations in one district can intensify congestion. Restaurants and shopping centres attract visitors at similar times. For example, commuters converge on the same roads during meal periods, so junctions become overloaded and delays spread to nearby neighbourhoods. Therefore, concentrated destinations can disrupt movement across the wider city.",
  "In conclusion, I firmly disagree because strict zoning creates longer journeys and wider traffic congestion."
].join("\n\n");

const paragraphs = segmentStudentResponse(task2Writing, "Task 2");
assert.deepEqual(paragraphs.map((item) => item.role), ["Introduction", "Body Paragraph 1", "Body Paragraph 2", "Conclusion"]);
assert.equal(detectSentenceRole({ taskType: "Task 2", paragraphRole: "Body Paragraph 2", sentenceIndex: 0, sentenceCount: 4, sentence: paragraphs[2].sentences[0].exactText }), "body_topic_sentence");
assert.equal(detectSentenceRole({ taskType: "Task 2", paragraphRole: "Body Paragraph 2", sentenceIndex: 1, sentenceCount: 4, sentence: paragraphs[2].sentences[1].exactText }), "explanation");
assert.equal(detectSentenceRole({ taskType: "Task 2", paragraphRole: "Body Paragraph 2", sentenceIndex: 2, sentenceCount: 4, sentence: paragraphs[2].sentences[2].exactText }), "example");
assert.equal(detectSentenceRole({ taskType: "Task 2", paragraphRole: "Body Paragraph 2", sentenceIndex: 3, sentenceCount: 4, sentence: paragraphs[2].sentences[3].exactText }), "link_back");
assert.notEqual(detectSentenceRole({ taskType: "Task 2", paragraphRole: "Body Paragraph 2", sentenceIndex: 3, sentenceCount: 4, sentence: "Furthermore, another problem affects public health." }), "link_back");
assert.equal(assessConclusionFunction(paragraphs, "Task 2").status, "Strong");

const cards = [{
  issueType: "Link Back Control",
  severity: "Moderate",
  criteria: ["Lexical Resource"],
  framework: ["Link Back Control"],
  paragraphLocation: "Body Paragraph 2, Sentence 1",
  exactSentence: paragraphs[2].sentences[0].exactText,
  sentenceFunction: "Closes the paragraph.",
  whyItLimitsBand: "The policy wording is vague and this sentence ends with a comma.",
  kruPomDiagnosis: "The paragraph does not close cleanly.",
  targetedRevision: "Furthermore, placing similar destinations in one district can intensify traffic congestion.",
  revisionType: "Route-Preserving Revision",
  whyRevisionIsStronger: "The policy wording is now precise.",
  studentAction: "Name the planning action precisely."
}, {
  issueType: "Example Development",
  severity: "Moderate",
  criteria: ["Task Response"],
  framework: ["SAR Example Quality"],
  paragraphLocation: "Body Paragraph 1, Sentence 3",
  exactSentence: paragraphs[1].sentences[2].exactText,
  whyItLimitsBand: "The example needs a wider affected group and consequence.",
  kruPomDiagnosis: "Body Paragraph 2, Sentence 4 contains a relevant example, but it is too narrow.",
  targetedRevision: "For example, families across the city may face longer school journeys, so students arrive tired and learn less effectively while parents lose productive time.",
  revisionType: "Teacher-Guided Expansion",
  whyRevisionIsStronger: "It makes the scope, affected group and consequence explicit.",
  studentAction: "Broaden the affected group and show the consequence."
}, {
  issueType: "Explanation and Example Development",
  severity: "Moderate",
  criteria: ["Lexical Resource"],
  framework: ["Explanation Depth", "SAR Example Quality", "Link Back Control"],
  paragraphLocation: "Body Paragraph 2, Sentence 3",
  exactSentence: paragraphs[2].sentences[2].exactText,
  whyItLimitsBand: "Explanation and Example Development is limited by a countability error.",
  kruPomDiagnosis: "Repair Explanation and Example Development without changing the example route.",
  targetedRevision: paragraphs[2].sentences[2].exactText.replace("nearby neighbourhoods", "the nearby neighbourhoods"),
  revisionType: "Minimal Correction",
  studentAction: "Repair Explanation and Example Development in this sentence.",
  revisionIntegrity: { diagnosedCategories: ["countability"], originalIssueCategories: ["countability"] }
}];
const model = buildFeedbackIntegrityModel({ writing: task2Writing, taskType: "Task 2", feedbackCards: cards, topIssues: cards });
assert.equal(model.issues[0].sentenceRole, "body_topic_sentence");
assert.equal(model.issues[0].issueCategory, "Lexical Precision");
assert.equal(model.issues[0].punctuationClaimCorrected, true);
assert.doesNotMatch(`${model.issues[0].diagnosis} ${model.issues[0].whyItLimitsBand}`, /ends with a comma|does not close cleanly/i);
assert.equal(model.issues[1].issueCategory, "Example Development");
assert.equal(model.issues[1].revisionAlignmentStatus, "aligned");
assert.match(model.issues[1].diagnosis, /Body Paragraph 1, Sentence 3/);
assert.doesNotMatch(model.issues[1].diagnosis, /Body Paragraph 2, Sentence 4/);
assert.equal(model.issues[2].issueCategory, "Countability");
assert.doesNotMatch(`${model.issues[2].whyItLimitsBand} ${model.issues[2].studentAction}`, /Explanation and Example Development/);
assert.match(`${model.issues[2].whyItLimitsBand} ${model.issues[2].studentAction}`, /Countability/);
assert.deepEqual(validateFeedbackIntegrity(model, task2Writing), []);
assert.equal(model.topIssues[0].issueId, model.issues[0].issueId);
assert.equal(model.topIssues[0].diagnosis, model.issues[0].diagnosis);
assert.equal(model.paragraphCoverage[0].paragraphLabel, "Introduction");
assert.equal(model.paragraphCoverage[0].status, "Strong");
assert.equal(model.paragraphCoverage[0].priorityRepair, "No priority repair");

const weakRevision = evaluateRevisionAlignment({
  exactSentence: "For example, commuters gather at the same time, resulting in a large traffic congestion.",
  targetedRevision: "For example, commuters gather at the same time, resulting in severe traffic congestion.",
  revisionType: "Minimal Correction",
  repairTargets: ["mechanism", "affected group", "consequence"]
});
assert.equal(weakRevision.pass, false);
assert.ok(weakRevision.unresolvedTargets.includes("mechanism"));
const repairedRevision = evaluateRevisionAlignment({
  exactSentence: "For example, commuters gather at the same time, resulting in a large traffic congestion.",
  targetedRevision: "For example, workers and shoppers converge on the same roads at peak times, so junctions become overloaded and delays spread across the city.",
  revisionType: "Teacher-Guided Expansion",
  repairTargets: ["mechanism", "affected group", "consequence"]
});
assert.equal(repairedRevision.pass, true);

const task1Writing = [
  "The bar chart compares recycling rates in four cities in 2010 and 2020.",
  "Overall, recycling increased in three cities, while City D recorded a slight fall.",
  "In 2010, City A had the highest rate at 60%, whereas City D stood at 30%.",
  "By 2020, City B had risen to 70%, while City D had fallen to 25%."
].join("\n\n");
assert.deepEqual(segmentStudentResponse(task1Writing, "Task 1").map((item) => item.role), ["Introduction", "Overview", "Body Paragraph 1", "Body Paragraph 2"]);
assert.equal(detectSentenceRole({ taskType: "Task 1", visualType: "Bar Chart", paragraphRole: "Body Paragraph 1", sentenceIndex: 0, sentenceCount: 1, sentence: "City A was higher than City D at 60% and 30%, respectively." }), "body_topic_sentence");
assert.equal(detectSentenceRole({ taskType: "Task 1", visualType: "Map", paragraphRole: "Body Paragraph 1", sentenceIndex: 1, sentenceCount: 2, sentence: "The school was replaced by a park." }), "map_change_sentence");
assert.equal(detectSentenceRole({ taskType: "Task 1", visualType: "Manufacturing Process", paragraphRole: "Body Paragraph 1", sentenceIndex: 1, sentenceCount: 2, sentence: "Next, the material is heated and transported to storage." }), "process_stage");

let attempts = 0;
assert.deepEqual(await runWithSingleTransientPdfRetry(async () => ({ value: "pdf" })), { value: "pdf", attempts: 1 });
const disposedAttempts = [];
attempts = 0;
const retrySuccess = await runWithSingleTransientPdfRetry(async () => {
  attempts += 1;
  if (attempts === 1) throw new Error("Protocol error (Page.printToPDF): Target closed");
  return { value: "same-saved-report" };
}, { onAttemptDisposed: ({ attempt }) => disposedAttempts.push(attempt) });
assert.deepEqual(retrySuccess, { value: "same-saved-report", attempts: 2 });
assert.deepEqual(disposedAttempts, [1]);
attempts = 0;
await assert.rejects(() => runWithSingleTransientPdfRetry(async () => {
  attempts += 1;
  throw new Error("browser disconnected");
}), /browser disconnected/);
assert.equal(attempts, 2);
attempts = 0;
await assert.rejects(() => runWithSingleTransientPdfRetry(async () => {
  attempts += 1;
  throw new Error("Invalid report data");
}), /Invalid report data/);
assert.equal(attempts, 1);
assert.equal(isTransientPdfError(new Error("Session closed")), true);
assert.equal(isTransientPdfError(new Error("Authentication failure")), false);

const [pdfRetrySource, scriptSource, htmlSource] = await Promise.all([
  readFile(new URL("../domain/pdfRetry.js", import.meta.url), "utf8"),
  readFile(new URL("../script.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8")
]);
assert.doesNotMatch(pdfRetrySource, /fetch\(|analy[sz]eWriting|quota|credit/i);
assert.match(scriptSource, /Paragraph Coverage Summary/);
assert.match(scriptSource, /runWithSingleTransientPdfRetry/);
assert.match(htmlSource, /Diagnostic report ready/);
assert.match(htmlSource, /2,999/);
assert.match(htmlSource, /10 analyses/);
assert.match(htmlSource, /60 days/);

console.log("V12.3.1 feedback integrity, paragraph coverage, revision alignment, conclusion separation and bounded PDF retry passed.");
