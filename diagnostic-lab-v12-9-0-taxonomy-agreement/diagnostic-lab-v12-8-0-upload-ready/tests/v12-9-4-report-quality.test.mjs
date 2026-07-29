// V12.9.4 — deterministic corrections, taxonomy, issue-selection threshold, repair-plan specificity,
// Paragraph Coverage reconciliation and PDF text integrity.
//
// Grounded in the production artifact `diagnostic-qa-Eva-dbcbeccf08e85b8d71455b35.json`, where:
//   * "On one hand" and "shopping … provide" shipped as Revision Unavailable with an instruction to
//     rebuild the sentence, though each repair is a single token the engine had already located;
//   * "The resulting economic decline of small center shops" was filed as Grammar and Sentence
//     Control although its grammar is well formed and the defect is the relation it asserts;
//   * "same area" occupied a Moderate slot while meaning-impairing evidence sat lower;
//   * Repair Plan day 2 taught "route order" for a thesis-promise defect;
//   * the Introduction read "Development Repair Needed" beside "No priority structural repair";
//   * extracted PDF text contained `cost<U+FFFE>efficiency`.
import assert from "node:assert/strict";
import { deriveDeterministicCorrection, isAutoCorrectableCategory } from "../domain/deterministicCorrections.js";
import { detectSyntacticHeadAgreementDefects } from "../domain/agreementValidator.js";
import {
  canonicalCategoryForLanguage,
  candidateValueScore,
  classifyCandidateValue,
  isSemanticNounPhraseDefect,
  MINIMUM_VISIBLE_VALUE
} from "../domain/canonicalIntegrity.js";
import {
  assertPrintableTextIntegrity,
  printableTextViolations,
  sanitizePrintableText
} from "../domain/textIntegrity.js";

// ---------------------------------------------------------------------------
// DEFECT 6 — safe deterministic corrections, including for provider-promoted issues.
// ---------------------------------------------------------------------------
const CONCLUSION = "In conclusion, although shopping in metropolitan centers provide product variety and competitive pricing, the small independent shops are forced into an economic instability.";

const fixedExpression = deriveDeterministicCorrection({
  sentence: "On one hand, shopping in big cities provides diverse product choices and offers undeniable benefits.",
  targetSpan: "On one hand",
  category: "Grammar and Sentence Control"
});
assert.ok(fixedExpression, "a fixed-expression defect is correctable");
assert.equal(fixedExpression.revisionType, "Minimal Correction");
assert.match(fixedExpression.revised, /^On the one hand, /);

const gerundAgreement = deriveDeterministicCorrection({
  sentence: CONCLUSION,
  targetSpan: "shopping in metropolitan centers provide",
  category: "Subject-Verb Agreement"
});
assert.ok(gerundAgreement, "a gerund-subject agreement defect is correctable");
assert.equal(gerundAgreement.operation, "subject-verb-agreement");
assert.match(gerundAgreement.revised, /shopping in metropolitan centers provides/);
// The gerund head is what makes this possible; without it the clause was skipped entirely.
assert.equal(detectSyntacticHeadAgreementDefects(CONCLUSION)[0].subjectHead, "shopping");

const article = deriveDeterministicCorrection({ sentence: CONCLUSION, targetSpan: "an economic instability", category: "Countability" });
assert.ok(article, "an article before an uncountable abstract noun is correctable");
assert.match(article.revised, /forced into economic instability/);

const simpleAgreement = deriveDeterministicCorrection({
  sentence: "Therefore, the promotion of small town center shops are vital to prevent economic decline.",
  targetSpan: "are",
  category: "Subject-Verb Agreement"
});
assert.match(simpleAgreement.revised, /shops is vital/);

// Two defects in ONE sentence each get their own repair, scoped by the issue's own category.
assert.notEqual(gerundAgreement.revised, article.revised, "each issue repairs its own defect");

// Guards. A meaning-dependent replacement is never auto-corrected, however local it looks.
assert.equal(isAutoCorrectableCategory("Word Form"), false);
assert.equal(isAutoCorrectableCategory("Comparative Judgement"), false);
assert.equal(isAutoCorrectableCategory("Reference Control"), false);
assert.equal(isAutoCorrectableCategory("Subject-Verb Agreement"), true);
// The V12.9.0 false-SVA protection must survive: "an increasing number of X have" is correct.
assert.equal(
  deriveDeterministicCorrection({
    sentence: "In recent years, an increasing number of rural residents have bypassed their local town centers.",
    targetSpan: "have",
    category: "Subject-Verb Agreement"
  }),
  null,
  "a correct quantifier construction is never 'repaired'"
);
// A repair that would change a content word is refused.
assert.equal(
  deriveDeterministicCorrection({ sentence: "The shops closed.", targetSpan: "shops", category: "Lexical Precision" }),
  null
);

// ---------------------------------------------------------------------------
// DEFECT 7 — taxonomy follows the diagnosed defect.
// ---------------------------------------------------------------------------
assert.equal(
  isSemanticNounPhraseDefect("economic decline of small center shops", "The phrase does not describe what the writer means."),
  true,
  "a well-formed noun phrase asserting the wrong relation is a semantic defect"
);
assert.equal(
  isSemanticNounPhraseDefect("economic decline of small center shops", "The finite verb does not agree with its subject."),
  false,
  "an explicit syntax complaint stays with grammar"
);
assert.equal(canonicalCategoryForLanguage("relationship", "The noun phrase asserts a relationship the writer does not mean."), "Lexical Precision");
assert.equal(canonicalCategoryForLanguage("subject-verb agreement", "The subject and verb do not agree."), "Subject-Verb Agreement");
assert.equal(canonicalCategoryForLanguage("punctuation spacing", "Spacing is not controlled."), "Punctuation");

// ---------------------------------------------------------------------------
// DEFECT 8 — minimum-value threshold for visible feedback.
// ---------------------------------------------------------------------------
const weak = { classification: "awkward-but-understandable", category: "vague noun choice", exactProblemSpan: "same area", severity: "moderate" };
const meaningImpairing = { classification: "clear-error", category: "word form", exactProblemSpan: "bankrupted people", severity: "major", affectsMeaning: true };
const collocation = { classification: "clear-error", category: "collocation", exactProblemSpan: "divert their choices", severity: "moderate" };
const countability = { classification: "clear-error", category: "countable/uncountable nouns", exactProblemSpan: "an economic instability", severity: "moderate" };
const recurring = { classification: "awkward-but-understandable", category: "collocation", exactProblemSpan: "a month of diverse shopping", severity: "moderate", occurrenceCount: 2 };

assert.equal(classifyCandidateValue(weak).visible, false, "understandable wording that breaks no rule is a refinement");
assert.equal(classifyCandidateValue(meaningImpairing).visible, true, "meaning-impairing evidence stays visible");
assert.equal(classifyCandidateValue(collocation).visible, true, "a clear collocation error stays visible");
assert.equal(classifyCandidateValue(countability).visible, true, "a validated countability error stays visible");
assert.equal(classifyCandidateValue(recurring).visible, true, "a recurring pattern earns its slot");
assert.ok(candidateValueScore(meaningImpairing) > candidateValueScore(weak), "meaning impairment outranks loose wording");
assert.ok(candidateValueScore(collocation) > candidateValueScore(weak), "a rule-breaking error outranks a refinement");
assert.equal(classifyCandidateValue({ classification: "high-band-refinement", exactProblemSpan: "x" }).visible, false);
assert.equal(typeof MINIMUM_VISIBLE_VALUE, "number");

// ---------------------------------------------------------------------------
// DEFECT 11 — PDF text-layer integrity.
// ---------------------------------------------------------------------------
const NONCHARACTERS = [0xFFFE, 0xFFFF, 0xFFFD, 0xFDD0, 0xFDEF];
for (const code of NONCHARACTERS) {
  const corrupted = `cost${String.fromCharCode(code)}efficiency`;
  assert.equal(sanitizePrintableText(corrupted), "cost-efficiency", `U+${code.toString(16).toUpperCase()} between letters is restored to the hyphen it displaced`);
  assert.ok(printableTextViolations(corrupted).length > 0, "the raw corruption is detected before repair");
}
// Every legitimate hyphen or dash survives untouched.
for (const [name, text] of [
  ["hyphen-minus", "cost-efficiency"],
  ["en dash", "2000–2020"],
  ["em dash", "shops—and their staff—closed"],
  ["non-breaking hyphen", "cost‑efficiency"]
]) {
  assert.equal(sanitizePrintableText(text), text, `${name} is preserved`);
  assert.deepEqual(printableTextViolations(text), [], `${name} is not a violation`);
}
// Invisible break characters are removed rather than rendered. A soft hyphen is DISCRETIONARY — it
// is only drawn when a line breaks there — so removing it restores the word, unlike a noncharacter,
// which destroyed a real character and is restored to the hyphen it displaced.
assert.equal(sanitizePrintableText("word­break"), "wordbreak", "a discretionary soft hyphen disappears");
assert.equal(sanitizePrintableText(`word${String.fromCharCode(0xFFFE)}break`), "word-break", "a noncharacter restores the hyphen it destroyed");
assert.equal(sanitizePrintableText("end​"), "end", "a trailing zero-width space is removed");
// An unpaired surrogate cannot reach the text layer.
assert.equal(sanitizePrintableText(`bad${String.fromCharCode(0xD800)}text`), "badtext");
// The export fails closed when anything forbidden survives.
assert.throws(
  () => assertPrintableTextIntegrity(`cost${String.fromCharCode(0xFFFE)}efficiency`),
  (error) => error.errorCode === "PDF_TEXT_INTEGRITY_FAILED",
  "a corrupt text layer blocks the export rather than shipping"
);
assert.equal(assertPrintableTextIntegrity("cost-efficiency is preserved — and so are dashes."), true);

console.log("V12.9.4 report quality: promoted provider issues now produce safe Minimal Corrections (fixed expression, gerund-subject agreement, article before an uncountable noun) while meaning-dependent and task-level repairs stay withheld and the false-SVA protection holds; a well-formed noun phrase asserting the wrong relation is classified lexically rather than as grammar; a minimum-value threshold demotes understandable wording to a refinement while meaning-impairing, rule-breaking and recurring evidence keeps its slot; and the PDF text layer restores hyphens destroyed by noncharacters, preserves every legitimate dash, and fails the export closed if anything forbidden survives.");
