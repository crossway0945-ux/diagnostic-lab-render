// Fixtures are VERBATIM strings from a production PDF report (engine 12.3.4). They exist because
// every earlier detector regression was caused by tuning against hand-written prose instead of the
// prose the live provider actually produces. Do not paraphrase them.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  categoryAllowedForTask,
  detectDevelopmentSignal,
  detectLanguageSignal,
  detectTask2StructureSignal,
  ISSUE_TAXONOMY,
  TASK1_ONLY_CATEGORIES,
  TASK2_ONLY_CATEGORIES,
  buildFeedbackIntegrityModel,
  validateFeedbackIntegrity
} from "../domain/feedbackIntegrity.js";
import {
  checkRevisionGrammar,
  checkRevisionLanguageSafety,
  checkRevisionReference,
  checkRevisionTaskFidelity,
  checkRevisionTypeFidelity,
  hasGroupScope,
  validateRevisionQuality
} from "../domain/revisionQuality.js";
import { normalizeStudentFacingText } from "../domain/canonicalAnalysis.js";
import { segmentStudentResponse } from "../domain/paragraphEvidence.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";

assert.equal(ANALYSIS_VERSIONS.appVersion, "12.4.1");
assert.equal(ANALYSIS_VERSIONS.revisionValidatorVersion, "revision-alignment-v12.4.0");

const norm = (value) => String(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, " ").trim();
const primaryOf = (text) => detectDevelopmentSignal(norm(text)) || detectTask2StructureSignal(norm(text)) || detectLanguageSignal(norm(text)) || "";

// ---------------------------------------------------------------------------
// R-1 A statement about how a mechanism is WORDED is not a missing mechanism.
// ---------------------------------------------------------------------------
assert.equal(
  primaryOf("The route is relevant, but clusterization and a specific place are unnatural and imprecise for an urban-planning argument. The topic sentence has the right function but weak LFC-CPC precision; the examiner can understand the idea, but the policy mechanism is not expressed naturally."),
  "Topic Sentence Precision"
);
// A genuinely absent mechanism must still be caught.
assert.equal(primaryOf("The causal mechanism is missing, so the example does not prove the claim."), "Causal Mechanism");
assert.equal(primaryOf("The example does not explain how the action creates the stated consequence."), "Causal Mechanism");

// ---------------------------------------------------------------------------
// R-2 A visibly incomplete sentence is a completion defect, not a collocation defect.
// ---------------------------------------------------------------------------
assert.equal(
  primaryOf("The comma ending makes the sentence incomplete, and encounter an issue of traveling is an unnatural collocation."),
  "Sentence Completion"
);
assert.equal(primaryOf("The sentence ends with a comma and does not form a complete paragraph close."), "Sentence Completion");
// A genuine collocation defect with no completion problem keeps its own category.
assert.equal(primaryOf("The noun and preposition combination is unnatural."), "Collocation");

// ---------------------------------------------------------------------------
// R-3 Task 1 logic categories may never head a Task 2 card, and vice versa.
// ---------------------------------------------------------------------------
assert.ok(ISSUE_TAXONOMY.includes("Topic Sentence Precision"));
assert.ok(ISSUE_TAXONOMY.includes("Policy Mechanism Accuracy"));
assert.equal(categoryAllowedForTask("Grouping Logic", "Task 2"), false);
assert.equal(categoryAllowedForTask("Grouping Logic", "Task 1"), true);
assert.equal(categoryAllowedForTask("Causal Mechanism", "Task 1"), false);
assert.equal(categoryAllowedForTask("Causal Mechanism", "Task 2"), true);
for (const category of TASK1_ONLY_CATEGORIES) assert.ok(!TASK2_ONLY_CATEGORIES.includes(category));
assert.equal(
  primaryOf("The idea is relevant, but a specific place is divided into a zone does not accurately describe the prompt, which is about grouping similar facilities into separate zones."),
  "Policy Mechanism Accuracy"
);

// ---------------------------------------------------------------------------
// R-4 / R-5 / R-6 Revision quality validator.
// ---------------------------------------------------------------------------

// Broken clause shipped in production: "...in one area this could contribute..."
const brokenConclusion = checkRevisionGrammar("In conclusion, I firmly believe that facilities in towns and cities should not be divided into zones because grouping facilities of the same type in one area this could contribute to the difficulty in traveling and the traffic congestion.");
assert.equal(brokenConclusion.status, "fail");
assert.ok(brokenConclusion.problems.some((problem) => /demonstrative pronoun/i.test(problem)));
// A clean conclusion revision passes.
assert.equal(checkRevisionGrammar("In conclusion, I firmly believe that urban areas should not be divided into separate zones that concentrate similar facilities in one location, because this could make daily travel less convenient and worsen traffic congestion.").status, "pass");

// Self-contradicting reference shipped in production.
assert.equal(checkRevisionReference("Families live in different locations, which could be very far away from their homes, so it would be very difficult to travel long distances.").status, "fail");
assert.equal(checkRevisionReference("Families live in different parts of a city, and some may be far from the schools concentrated in a single zone, which makes daily travel harder.").status, "pass");

// AI meta-language shipped in production.
assert.equal(checkRevisionLanguageSafety("This affects the wider group named in the prompt because the same mechanism operates beyond the single example.").status, "fail");
assert.equal(checkRevisionLanguageSafety("Residents travelling to the same district at peak times increase traffic volumes on the surrounding roads.").status, "pass");

// A fabricated figure is never acceptable.
const fabricated = checkRevisionTaskFidelity({
  original: "Commuters travel to the same area at similar times.",
  revision: "Around 5000 commuters travel to the same area at similar times.",
  prompt: "Towns should be divided into zones."
});
assert.equal(fabricated.status, "fail");
// A figure taken from the student's own sentence is fine.
assert.equal(checkRevisionTaskFidelity({
  original: "It takes 3 hours to arrive there.",
  revision: "The journey takes 3 hours each way.",
  prompt: ""
}).status, "pass");

// ---------------------------------------------------------------------------
// Revision-type fidelity: rewording vs genuine expansion.
// ---------------------------------------------------------------------------
assert.equal(hasGroupScope("Every family is living in different places and distances"), true, "a universal quantifier already denotes a population");
assert.equal(hasGroupScope("For instance, a student's house is very far away from his school"), false, "one indefinite case is not a population");
assert.equal(hasGroupScope("students living on the opposite side of the city"), true);

// Singular-to-plural grammar repair is a Minimal Correction, not teacher guidance.
assert.equal(checkRevisionTypeFidelity({
  original: "Every family is living in different places and distances, which could be very far away from their house, so it would be very difficult to travel through long distance.",
  revision: "Families live in different locations, which could be very far away from their homes, so it would be very difficult to travel long distances.",
  revisionType: "Minimal Correction"
}).status, "pass");

// Synonym replacement is a Minimal Correction.
assert.equal(checkRevisionTypeFidelity({
  original: "Therefore, when a certain place is clustered in one area, some people might encounter an issue of traveling,",
  revision: "Therefore, when essential facilities are concentrated in one area, some residents may face serious travel difficulties.",
  revisionType: "Minimal Correction"
}).status, "pass");

// Escalating one case to a population IS teacher guidance and must be labelled.
const scopeExpansion = checkRevisionTypeFidelity({
  original: "For instance, a student's house is very far away from his school, and it takes 3 hours to arrive there, so he needs to wake up at 5AM every morning, which lowers his energy and concentration in the class, resulting in bad grades.",
  revision: "For example, if all schools were placed in one district, students living on the opposite side of the city might spend several hours commuting each day, which could reduce their rest time, concentration and academic performance.",
  revisionType: "Route-Preserving Revision"
});
assert.equal(scopeExpansion.status, "fail");
assert.ok(scopeExpansion.addedElements.includes("affected group"));
// The same revision labelled correctly passes.
assert.equal(checkRevisionTypeFidelity({
  original: "For instance, a student's house is very far away from his school, and it takes 3 hours to arrive there, so he needs to wake up at 5AM every morning, which lowers his energy and concentration in the class, resulting in bad grades.",
  revision: "For example, if all schools were placed in one district, students living on the opposite side of the city might spend several hours commuting each day, which could reduce their rest time, concentration and academic performance.",
  revisionType: "Teacher-Guided Expansion"
}).status, "pass");

// ---------------------------------------------------------------------------
// Every revision-quality failure is REPAIRABLE and must never block a report.
// ---------------------------------------------------------------------------
const unsafe = validateRevisionQuality({
  original: "For example, restaurants attract more people at dinner time, resulting in a large traffic congestion.",
  revision: "For example, restaurants attract more people at dinner time, resulting in severe traffic congestion. This affects the wider group named in the prompt because the same mechanism operates beyond the single example.",
  revisionType: "Teacher-Guided Expansion"
});
assert.equal(unsafe.severity, "repairable");
assert.equal(unsafe.pass, false);
assert.equal(unsafe.languageSafetyStatus, "fail");

// ---------------------------------------------------------------------------
// R-7 Report copy.
// ---------------------------------------------------------------------------
assert.equal(normalizeStudentFacingText("it is not a clean TESL closing sentence"), "it is not a clean TEEL closing sentence");
assert.equal(normalizeStudentFacingText('such as "facilities","schools","shopping centres"'), 'such as "facilities", "schools", "shopping centres"');
assert.equal(normalizeStudentFacingText("LFC CPC Control"), "LFC-CPC Control");
assert.equal(normalizeStudentFacingText('say "traffic jam. "'), 'say "traffic jam."');

const scriptSource = await readFile(new URL("../script.js", import.meta.url), "utf8");
assert.match(scriptSource, /\\bTESL\\b/, "the print renderer must repair TESL as well");

// No AI meta-language may be generated anywhere in production code.
const analyzerSource = await readFile(new URL("../services/aiAnalyzer.js", import.meta.url), "utf8");
const emittedStrings = analyzerSource
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");
assert.doesNotMatch(emittedStrings, /wider group named in the prompt/i);
assert.doesNotMatch(emittedStrings, /same mechanism operates beyond/i);
assert.doesNotMatch(emittedStrings, /wider group or system named in the prompt/i);

// ---------------------------------------------------------------------------
// End-to-end: a report still builds, and every card carries the new status fields.
// ---------------------------------------------------------------------------
const writing = [
  "Some people may argue that towns and cities should be separated into zones, so all the same places are in the same area. However, I strongly disagree with the statement due to the lack of travel accessibility and traffic congestion.",
  "First of all, the clusterization of a specific place could lead to the difficulty of traveling. Every family is living in different places and distances, which could be very far away from their house, so it would be very difficult to travel through long distance. For instance, a student's house is very far away from his school, and it takes 3 hours to arrive there, so he needs to wake up at 5AM every morning, which lowers his energy and concentration in the class, resulting in bad grades. Therefore, when a certain place is clustered in one area, some people might encounter an issue of traveling,",
  "Furthermore, there would be more traffic congestion when a specific place is divided into a zone. Some places attract more people in some period of time, which could create a heavy traffic jam. For example, restaurants or shopping malls attract more people at breakfast, lunch, and dinner time; hence, people will be moving in the same direction at the same time, resulting in a large traffic congestion.",
  "In conclusion, I firmly believe that specific places like towns and cities should not be divided into zones, thus all the same places are in one area, since this could contribute to the difficulty in traveling and the congestion of traffic."
].join("\n\n");
const paragraphs = segmentStudentResponse(writing, "Task 2");
const body2 = paragraphs[2].sentences.map((item) => item.exactText);

const model = buildFeedbackIntegrityModel({
  writing,
  taskType: "Task 2",
  prompt: "Towns and cities should be divided into zones so that all the schools are in one area.",
  feedbackCards: [{
    // A Task 1 category on a Task 2 card, with an unsafe AI-meta revision.
    issueType: "Grouping Logic",
    issueCategory: "Grouping Logic",
    severity: "Moderate",
    criteria: ["Task Response"],
    framework: ["Explanation Depth"],
    paragraphLocation: "Body Paragraph 2, Sentence 1",
    exactSentence: body2[0],
    whyItLimitsBand: "The idea is relevant, but the sentence does not accurately describe the prompt, which is about grouping similar facilities into separate zones.",
    kruPomDiagnosis: "The body route is aligned, but the controlling sentence needs more precise cause wording.",
    targetedRevision: `${body2[0]} This affects the wider group named in the prompt because the same mechanism operates beyond the single example.`,
    revisionType: "Route-Preserving Revision",
    whyRevisionIsStronger: "It states the policy more accurately.",
    studentAction: "Describe the zoning policy accurately."
  }],
  topIssues: []
});

const card = model.issues[0];
assert.notEqual(card.issueCategory, "Grouping Logic", "a Task 1 category must not head a Task 2 card");
assert.ok(categoryAllowedForTask(card.issueCategory, "Task 2"));
assert.equal(card.languageSafetyStatus, "fail", "AI meta-language in the revision must be detected");
for (const field of ["grammarValidationStatus", "semanticValidationStatus", "taskFidelityStatus", "revisionTypeValidationStatus"]) {
  assert.ok(typeof card[field] === "string" && card[field], `${field} must be recorded on every canonical issue`);
}
assert.ok(model.repairs.some((repair) => repair.code === "REVISION_GENERIC_LANGUAGE"));
// The report is still deliverable: no fatal findings.
assert.deepEqual(validateFeedbackIntegrity(model, writing), []);

console.log("V12.3.5 revision safety: mechanism-wording precision, sentence-completion detection, task-scoped taxonomy, revision grammar/reference/fidelity validation, generic-language removal and report copy verified.");
