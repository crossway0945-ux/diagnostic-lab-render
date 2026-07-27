// V12.9.0 — Outweigh prompt subtype + quantifier-aware subject–verb agreement.
// Derived from the Eva production fixture. Structural rules only: no student wording, score or
// issue id is hardcoded into production logic.
import assert from "node:assert/strict";
import { detectSyntacticHeadAgreementDefects, AGREEMENT_VALIDATOR_VERSION } from "../domain/agreementValidator.js";
import { classifyTask2Prompt } from "../domain/task2Safety.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";

assert.equal(ANALYSIS_VERSIONS.grammarValidatorVersion, AGREEMENT_VALIDATOR_VERSION, "grammar validator version is declared");

// ---------------------------------------------------------------------------
// 1. FATAL false positive: "a/an [adj] number of + plural noun" takes a PLURAL verb.
// Changing "an increasing number of residents have" to "has" is a harmful false correction.
// ---------------------------------------------------------------------------
const mustNotFlag = [
  "An increasing number of rural residents have bypassed their local town centers.",
  "A growing number of shops are closing.",
  "A large number of students have applied.",
  "A large number of consumers prefer online shopping.",
  "A percentage of respondents are satisfied.",
  // "the + quantifier of + plural noun" takes a singular verb — correct as written.
  "The number of residents has increased.",
  "The number of shops is declining.",
  "The percentage of respondents is high.",
  // Both agreements occur in accepted usage for these heads: never assert a defect either way.
  "A range of products is available.",
  "A range of products are available.",
  // Ordinary singular heads behind a prepositional phrase — correct as written.
  "The continued operation of shops is essential.",
  "The main cause is over-reliance on private cars."
];
for (const sentence of mustNotFlag) {
  assert.deepEqual(detectSyntacticHeadAgreementDefects(sentence), [], `must not flag: ${sentence}`);
}

// 2. A genuine agreement defect is still detected: the head is "promotion" (singular), not "shops".
const genuine = detectSyntacticHeadAgreementDefects("Therefore, the promotion of small town center shops are vital to prevent economic decline.");
assert.equal(genuine.length, 1, "a real singular-head agreement defect is still caught");
assert.equal(genuine[0].targetSpan, "are");
assert.equal(String(genuine[0].correction || genuine[0].expectedCorrection || "is"), "is");

// 3. "the number of" vs "a number of" must not be conflated.
assert.deepEqual(detectSyntacticHeadAgreementDefects("The number of shops are declining."), [
  ...detectSyntacticHeadAgreementDefects("The number of shops are declining.")
], "deterministic");
assert.equal(detectSyntacticHeadAgreementDefects("The number of shops are declining.").length, 1, "'the number of ... are' is a real defect");

// ---------------------------------------------------------------------------
// 4. Outweigh is a PROMPT SUBTYPE of Advantages & Disadvantages, never a top-level essay type.
// ---------------------------------------------------------------------------
const eva = classifyTask2Prompt({
  taskType: "Task 2",
  prompt: "Small town center shops are running out of business because rural residents tend to go shopping in big cities store. To what extent do the disadvantages of this development outweigh the advantages?"
});
assert.equal(eva.essayType, "advantages-disadvantages", "Outweigh classifies as Advantages & Disadvantages");
assert.equal(eva.publicEssayType, "Advantages & Disadvantages", "the displayed essay type is the family, not the subtype");
assert.equal(eva.promptSubtype, "outweigh");
assert.equal(eva.outweighDirection, "disadvantages", "the weighed side is recorded");
assert.equal(eva.comparisonRequired, true, "an explicit comparative judgement is required");
// The subtype label must read as a qualifier, never as a standalone essay type name.
assert.doesNotMatch(String(eva.internalEssaySubtypeLabel || ""), /^Advantages Outweigh Disadvantages$|^Disadvantages Outweigh Advantages$|^Outweigh Essay$/);

// The reverse direction is detected, and a plain A&D prompt carries no subtype.
const advantagesOutweigh = classifyTask2Prompt({ taskType: "Task 2", prompt: "Do the advantages of this trend outweigh the disadvantages?" });
assert.equal(advantagesOutweigh.essayType, "advantages-disadvantages");
assert.equal(advantagesOutweigh.promptSubtype, "outweigh");
assert.equal(advantagesOutweigh.outweighDirection, "advantages");

const plainAdvDis = classifyTask2Prompt({ taskType: "Task 2", prompt: "What are the advantages and disadvantages of working from home?" });
assert.equal(plainAdvDis.essayType, "advantages-disadvantages");
assert.equal(plainAdvDis.promptSubtype, "", "a plain Advantages & Disadvantages prompt has no outweigh subtype");
assert.equal(plainAdvDis.comparisonRequired, false, "comparative weighing is only required for the outweigh subtype");

// 5. Other Task 2 families are unaffected by the subtype fields.
for (const [prompt, expected] of [
  ["To what extent do you agree or disagree?", "opinion"],
  ["Discuss both views and give your opinion.", "discuss-both-views"],
  ["What problems does this cause, and what solutions can governments introduce?", "problem-solution"]
]) {
  const classified = classifyTask2Prompt({ taskType: "Task 2", prompt });
  assert.equal(classified.essayType, expected, `${expected} classification is unaffected`);
  assert.equal(classified.promptSubtype, "", `${expected} carries no outweigh subtype`);
}

console.log("V12.9.0 taxonomy + agreement: quantifier-aware SVA (no false 'a/an increasing number of X have' -> 'has'), genuine singular-head defects still caught, and Outweigh retained as a prompt subtype of Advantages & Disadvantages.");
