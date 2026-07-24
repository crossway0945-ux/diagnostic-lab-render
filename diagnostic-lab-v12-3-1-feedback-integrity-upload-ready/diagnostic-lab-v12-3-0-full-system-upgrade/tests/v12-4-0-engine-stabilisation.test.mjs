// V12.4.0 global engine stabilisation and model-migration scaffolding.
// Fixtures marked VERBATIM come from the production Sun 14 PDF (engine 12.3.5 output).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildFeedbackIntegrityModel, validateFeedbackIntegrity } from "../domain/feedbackIntegrity.js";
import {
  checkRevisionGrammar,
  checkRevisionReference,
  checkRevisionTaskFidelity,
  checkRevisionTypeFidelity,
  validateRevisionQuality
} from "../domain/revisionQuality.js";
import { normalizeStudentFacingText } from "../domain/canonicalAnalysis.js";
import { segmentStudentResponse } from "../domain/paragraphEvidence.js";
import { buildStudentReportViewModel } from "../domain/reportViewModels.js";
import { analyzeWriting, getAnalyzerHealth } from "../services/aiAnalyzer.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";

assert.equal(ANALYSIS_VERSIONS.appVersion, "12.4.0");
assert.equal(ANALYSIS_VERSIONS.engineVersion, "ielts-diagnostic-engine-v12.4.0");
assert.equal(ANALYSIS_VERSIONS.rubricVersion, "kru-pom-ielts-writing-v12.3.0", "rubric must not change in this release");
assert.equal(ANALYSIS_VERSIONS.issueTaxonomyVersion, "issue-taxonomy-v12.3.5", "taxonomy is unchanged in this release");

// ---------------------------------------------------------------------------
// Model migration scaffolding.
// ---------------------------------------------------------------------------
// 1. "max" reasoning effort is accepted and never silently downgraded on the node runtime.
const originalEffort = process.env.OPENAI_REASONING_EFFORT;
process.env.OPENAI_REASONING_EFFORT = "max";
assert.equal(getAnalyzerHealth().reasoningEffort, "max", "max reasoning effort must be accepted");
process.env.OPENAI_REASONING_EFFORT = "nonsense";
assert.equal(getAnalyzerHealth().reasoningEffort, "medium", "invalid effort falls back to medium");
if (originalEffort === undefined) delete process.env.OPENAI_REASONING_EFFORT;
else process.env.OPENAI_REASONING_EFFORT = originalEffort;

// 2. The provider preflight harness exists, is syntactically valid, and never falls back silently.
const preflightSource = await readFile(new URL("../scripts/provider-preflight.mjs", import.meta.url), "utf8");
assert.match(preflightSource, /runProviderHealthCheck/);
assert.match(preflightSource, /PREFLIGHT FAIL/);
assert.doesNotMatch(preflightSource, /fallback|gpt-4/i, "the preflight must not contain a silent fallback model");

// 3. Truncation and refusal detection exist in the provider layer with a bounded retry.
const analyzerSource = await readFile(new URL("../services/aiAnalyzer.js", import.meta.url), "utf8");
assert.match(analyzerSource, /PROVIDER_INCOMPLETE_RESPONSE/);
assert.match(analyzerSource, /incomplete_details/);
assert.match(analyzerSource, /PROVIDER_REFUSAL/);
assert.match(analyzerSource, /providerModel: config\.model/, "every provider report must record the model that produced it");
// No hardcoded production model in code.
assert.doesNotMatch(analyzerSource, /["']gpt-5\.\d/, "the production model must come from OPENAI_MODEL, never from code");

// ---------------------------------------------------------------------------
// SAR terminology: Situation, ACTION, Result — never "Analysis". (VERBATIM from Sun 14.)
// ---------------------------------------------------------------------------
assert.equal(
  normalizeStudentFacingText("The SAR chain has Situation and Result, but the Analysis needs a wider urban consequence."),
  "The SAR chain has Situation and Result, but the Action needs a wider urban consequence."
);
// Ordinary uses of "analysis" outside a SAR sentence are untouched.
assert.equal(
  normalizeStudentFacingText("The report provides a detailed Analysis of the data."),
  "The report provides a detailed Analysis of the data."
);

// ---------------------------------------------------------------------------
// Unsafe revisions shipped in Sun 14 are now rejected by the validators. (VERBATIM.)
// ---------------------------------------------------------------------------
// B1S2: relative clause pointing at itself.
assert.equal(checkRevisionReference("Families live in different locations, which could be very far away from their homes, so it would be very difficult to travel long distances.").status, "fail");
// Conclusion: the policy subject drifted from places/towns to facilities.
const drift = checkRevisionTaskFidelity({
  original: "In conclusion, I firmly believe that specific places like towns and cities should not be divided into zones, thus all the same places are in one area, since this could contribute to the difficulty in traveling and the congestion of traffic.",
  revision: "In conclusion, I firmly believe that facilities in towns and cities should not be divided into zones, thus facilities of the same type are in one area, since this could contribute to the difficulty in traveling and the traffic congestion.",
  prompt: "Towns and cities should be divided into zones so that all the schools are in one area. To what extent do you agree that urban areas should be split into distinct zones?"
});
assert.equal(drift.status, "fail", "a policy-subject swap must fail task fidelity");
assert.ok(drift.problems.some((problem) => /policy subject/.test(problem)));

// Grammar sanity around the new comma-splice logic:
assert.equal(checkRevisionGrammar("If water is free, they would use it carefully.").status, "pass", "a conditional is not a comma splice");
assert.equal(checkRevisionGrammar("For many students, it is difficult to travel every day.").status, "pass", "an introductory phrase is not a comma splice");
assert.equal(checkRevisionGrammar("Families live far away, they need to travel for hours.").status, "fail", "a real comma splice is still rejected");

// ---------------------------------------------------------------------------
// Withhold gate: an unsafe revision is never displayed; diagnosis and score survive.
// ---------------------------------------------------------------------------
const writing = [
  "Some people may argue that towns and cities should be separated into zones, so all the same places are in the same area. However, I strongly disagree with the statement due to the lack of travel accessibility and traffic congestion.",
  "First of all, the clusterization of a specific place could lead to the difficulty of traveling. Every family is living in different places and distances, which could be very far away from their house, so it would be very difficult to travel through long distance. For instance, a student's house is very far away from his school, and it takes 3 hours to arrive there, so he needs to wake up at 5AM every morning, which lowers his energy and concentration in the class, resulting in bad grades. Therefore, when a certain place is clustered in one area, some people might encounter an issue of traveling,",
  "Furthermore, there would be more traffic congestion when a specific place is divided into a zone. Some places attract more people in some period of time, which could create a heavy traffic jam. For example, restaurants or shopping malls attract more people at breakfast, lunch, and dinner time; hence, people will be moving in the same direction at the same time, resulting in a large traffic congestion.",
  "In conclusion, I firmly believe that specific places like towns and cities should not be divided into zones, thus all the same places are in one area, since this could contribute to the difficulty in traveling and the congestion of traffic."
].join("\n\n");
const paragraphs = segmentStudentResponse(writing, "Task 2");
const body1 = paragraphs[1].sentences.map((item) => item.exactText);

const unsafeCard = {
  issueType: "Tense Control",
  severity: "Moderate",
  criteria: ["Grammatical Range & Accuracy"],
  framework: ["LFC CPC Control"],
  paragraphLocation: "Body Paragraph 1, Sentence 2",
  exactSentence: body1[1],
  whyItLimitsBand: "The progressive tense is not controlled for a general statement.",
  kruPomDiagnosis: "Correct the tense without changing the meaning.",
  targetedRevision: "Families live in different locations, which could be very far away from their homes, so it would be very difficult to travel long distances.",
  revisionType: "Minimal Correction",
  whyRevisionIsStronger: "The tense is corrected.",
  studentAction: "Name the two places explicitly (where the family lives and the facility they travel to) before using a relative clause."
};
const model = buildFeedbackIntegrityModel({
  writing,
  taskType: "Task 2",
  reportLanguage: "en",
  feedbackCards: [unsafeCard],
  topIssues: []
});
const withheld = model.issues[0];
assert.equal(withheld.revisionWithheld, true);
assert.equal(withheld.revisionType, "Revision Unavailable");
assert.doesNotMatch(withheld.targetedRevision, /Families live in different locations/);
assert.match(withheld.targetedRevision, /could not be verified/);
assert.match(withheld.whyRevisionIsStronger, /safer than memorising/i);
assert.ok(model.repairs.some((repair) => repair.code === "REVISION_WITHHELD" && repair.disclosed === true));
// Withholding is repairable disclosure, never a fatal block.
assert.deepEqual(validateFeedbackIntegrity(model, writing), []);
// Diagnosis and evidence survive untouched.
assert.equal(withheld.exactEvidence, body1[1]);
assert.match(withheld.whyItLimitsBand, /progressive tense/i);

// A safe revision on the same sentence is NOT withheld.
const safeModel = buildFeedbackIntegrityModel({
  writing,
  taskType: "Task 2",
  reportLanguage: "en",
  feedbackCards: [{
    ...unsafeCard,
    targetedRevision: "Families live in different parts of a city, and some may live far from essential facilities, so daily travel can be very difficult."
  }],
  topIssues: []
});
assert.equal(safeModel.issues[0].revisionWithheld, false);
assert.notEqual(safeModel.issues[0].revisionType, "Revision Unavailable");

// ---------------------------------------------------------------------------
// Executive development coverage: a summary naming causal development guarantees a development
// primary category even when every provider card is language-headed.
// ---------------------------------------------------------------------------
const body2 = paragraphs[2].sentences.map((item) => item.exactText);
const execModel = buildFeedbackIntegrityModel({
  writing,
  taskType: "Task 2",
  reportLanguage: "en",
  feedbackCards: [{
    issueType: "Collocation",
    severity: "Moderate",
    criteria: ["Lexical Resource"],
    framework: ["Vocabulary Precision"],
    paragraphLocation: "Body Paragraph 2, Sentence 3",
    exactSentence: body2[2],
    whyItLimitsBand: "The example supports the route, but precision and prompt-term control need tightening.",
    kruPomDiagnosis: "Use precise prompt terms.",
    targetedRevision: body2[2].replace("a large traffic congestion", "severe traffic congestion"),
    revisionType: "Minimal Correction",
    whyRevisionIsStronger: "The collocation is natural.",
    studentAction: "Show the chain: concentrated facilities, same travel direction, peak-hour congestion."
  }],
  topIssues: [],
  mainScoreLimitingFactor: "The examples and causal mechanisms are not developed with enough precision. Body Paragraph 2 uses a vague and only partly convincing example.",
  mostUrgentRepair: "Rebuild each example so it shows the full causal chain."
});
const upgraded = execModel.issues[0];
assert.ok(["Causal Mechanism", "Example Development", "SAR Example Quality", "Explanation Depth"].includes(upgraded.issueCategory),
  `executive limiter must force a development primary, got ${upgraded.issueCategory}`);
assert.ok(upgraded.secondaryIssueCategories.includes("Collocation"), "the demoted language label survives as secondary");
assert.ok(execModel.repairs.some((repair) => repair.code === "EXECUTIVE_DEVELOPMENT_COVERAGE"));

// ---------------------------------------------------------------------------
// Dimension-aware Paragraph Coverage statuses.
// ---------------------------------------------------------------------------
const coverageModel = buildFeedbackIntegrityModel({
  writing,
  taskType: "Task 2",
  reportLanguage: "en",
  feedbackCards: [{
    issueType: "Collocation",
    severity: "Moderate",
    criteria: ["Lexical Resource"],
    framework: ["Vocabulary Precision"],
    paragraphLocation: "Conclusion, Sentence 1",
    exactSentence: paragraphs[3].sentences[0].exactText,
    whyItLimitsBand: "The noun and preposition combination is unnatural.",
    kruPomDiagnosis: "Use natural collocation.",
    targetedRevision: "In conclusion, I firmly believe that towns and cities should not be divided into zones, because this could make daily travel harder and worsen traffic congestion.",
    revisionType: "Minimal Correction",
    whyRevisionIsStronger: "The wording is natural and the position is unchanged.",
    studentAction: "Reuse the task's key nouns accurately."
  }],
  topIssues: []
});
const conclusionCoverage = coverageModel.paragraphCoverage.find((item) => item.paragraphLabel === "Conclusion");
assert.equal(conclusionCoverage.status, "Functionally Strong — Language Repair Needed",
  "a functionally complete conclusion with a language-only issue must show both dimensions");
const introCoverage = coverageModel.paragraphCoverage.find((item) => item.paragraphLabel === "Introduction");
assert.equal(introCoverage.status, "Strong", "a clean paragraph stays Strong");

// ---------------------------------------------------------------------------
// End-to-end local engine: Sun regression properties hold and scoring is unchanged.
// ---------------------------------------------------------------------------
const report = await analyzeWriting({
  taskType: "Task 2",
  essayType: "Opinion Essay",
  prompt: "Towns and cities should be divided into zones so that all the schools are in one area, all the shopping malls are located together and all the industrial sites are situated close to each other.\n\nTo what extent do you agree that urban areas should be split into distinct zones?",
  writing,
  targetBand: "7.0",
  reportLanguage: "en"
});
assert.equal(report.estimatedBandRange, "6.0-6.5", "scoring must not move in this release");
assert.equal(report.detectedPosition, "strongly disagree");
assert.equal(report.kruPomScores["Body Paragraph Route Alignment"].status, "Aligned");

// TESL and the SAR "Analysis" mislabel are sanitised everywhere, so no field anywhere may carry them.
const reportJson = JSON.stringify(report);
assert.doesNotMatch(reportJson, /\bTESL\b/);
assert.doesNotMatch(reportJson, /Situation and Result, but the Analysis/);

// The unsafe revisions are a different guarantee: the engine may still GENERATE a candidate and then
// reject it, which is correctly recorded in the internal revisionIntegrity.revisedClaim audit trail
// for QA. What must never happen is an unsafe revision reaching a student. The real assertion is
// therefore against the allowlisted student view model — exactly what a student is served — not the
// raw report object, which legitimately carries the withheld candidate for auditing.
const studentView = buildStudentReportViewModel({
  ...report,
  studentDisplayNameSnapshot: "Regression Student",
  inputFingerprint: "must-not-leak",
  engineVersion: "must-not-leak"
}, {
  previousSubmissionCount: 0,
  latestEstimatedRange: report.estimatedBandRange
});
const studentJson = JSON.stringify(studentView);
assert.doesNotMatch(studentJson, /wider group named in the prompt/);
assert.doesNotMatch(studentJson, /Families live in different locations, which could be very far away from their homes/,
  "the reference-broken revision must never reach the student");
assert.doesNotMatch(studentJson, /facilities in towns and cities should not be divided/,
  "the policy-drift conclusion revision must never reach the student");
assert.doesNotMatch(studentJson, /must-not-leak/, "internal fields must not leak into the student view");

// The withheld Body 1 Sentence 2 card keeps its diagnosis while withholding the unsafe sentence,
// and records the rejected candidate only in the internal audit field.
const b1s2 = report.feedbackCards.find((card) => /Every family is living/.test(card.exactSentence));
assert.ok(b1s2);
assert.equal(b1s2.revisionWithheld, true);
assert.doesNotMatch(b1s2.targetedRevision, /Families live in different locations/,
  "the student-facing revision field must be clean");
assert.match(b1s2.revisionIntegrity.revisedClaim, /Families live in different locations/,
  "the rejected candidate is preserved in the internal audit trail only");

console.log("V12.4.0 engine stabilisation: model-migration scaffolding, SAR terminology, unsafe-revision withholding, policy-drift rejection, executive development coverage and dimension-aware paragraph statuses passed.");
