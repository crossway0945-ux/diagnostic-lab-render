// Deterministic minimal corrections (V12.9.4).
//
// A provider-promoted issue used to ship as "Revision Unavailable" with a Student Action telling the
// learner to rebuild the whole sentence — even when the repair was a single token the engine had
// already identified exactly ("On one hand" → "On the one hand"). Native issues went through a safe
// correction path; promoted ones did not. This module is that path, shared by both.
//
// A correction is emitted ONLY when all five conditions hold:
//   1. the exact target span exists verbatim in the sentence,
//   2. exactly one correction is possible for that span,
//   3. the edit changes no content word (meaning and route are untouched),
//   4. an independent validator confirms the repair,
//   5. the corrected sentence introduces no new defect.
// Anything needing a learner decision — comparative weighing, an undeveloped promise, an unclear
// affected group, a meaning-dependent word choice — is deliberately NOT correctable here.

import { detectSyntacticHeadAgreementDefects } from "./agreementValidator.js";

export const DETERMINISTIC_CORRECTION_VERSION = "deterministic-corrections-v12.9.4";

// Fixed expressions have one accepted academic form. The table stays small and is limited to
// idioms whose repair cannot change meaning.
const FIXED_EXPRESSIONS = Object.freeze([
  { wrong: /\bOn one hand\b/, right: "On the one hand", note: "the fixed expression is \"on the one hand\"" },
  { wrong: /\bon one hand\b/, right: "on the one hand", note: "the fixed expression is \"on the one hand\"" },
  { wrong: /\bIn the other hand\b/, right: "On the other hand", note: "the fixed expression is \"on the other hand\"" },
  { wrong: /\bin the other hand\b/, right: "on the other hand", note: "the fixed expression is \"on the other hand\"" },
  { wrong: /\bIn nowadays\b/, right: "Nowadays", note: "\"nowadays\" is already adverbial and takes no preposition" },
  { wrong: /\bin nowadays\b/, right: "nowadays", note: "\"nowadays\" is already adverbial and takes no preposition" },
  { wrong: /\baccording to me\b/i, right: "in my view", note: "\"according to\" introduces another source, not the writer" }
]);

// Abstract nouns that are uncountable in the sense student essays use them. Adding an article in
// front of these is a defect with exactly one repair: delete the article.
const UNCOUNTABLE_ABSTRACT = "instability|stability|poverty|pollution|unemployment|employment|congestion|information|equipment|advice|research|homework|progress|knowledge|evidence|guidance|awareness|isolation|deprivation|degradation|infrastructure|transportation|machinery|violence|wealth|access|funding";
const ARTICLE_BEFORE_UNCOUNTABLE = new RegExp(`\\b(an?)\\s+((?:[a-z]+(?:ly)?\\s+){0,2}(?:${UNCOUNTABLE_ABSTRACT}))\\b`, "i");

// Mechanical spacing defects: a missing space after terminal punctuation, or a doubled space.
const MISSING_SPACE_AFTER_STOP = /([.!?])([A-Z])/;
const DOUBLE_SPACE = /(\S) {2,}(\S)/;

function applyOnce(sentence, pattern, replacement) {
  if (!pattern.test(sentence)) return null;
  return sentence.replace(pattern, replacement);
}

// Content words must be identical before and after. This is what proves the edit did not change the
// claim: only function words, inflections or spacing may differ.
function contentWords(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .filter((word) => !/^(?:the|a|an|is|are|was|were|has|have|and|or|but|of|to|in|on|at|for|with|by|from)$/.test(word));
}

// Symmetric inflection test. A regex stemmer is not safe here: `/(?:s|es|ed|ing)$/` matches leftmost,
// so "provides" stems to "provid" while "provide" stems to "provide", and an agreement repair looks
// like a meaning change. Comparing the two surface forms directly cannot drift.
const INFLECTIONS = ["s", "es", "d", "ed", "ing"];

function sameLemma(left = "", right = "") {
  if (left === right) return true;
  return INFLECTIONS.some((suffix) => left === `${right}${suffix}` || right === `${left}${suffix}`);
}

function meaningPreserved(original, revised) {
  const before = contentWords(original);
  const after = contentWords(revised);
  if (before.length !== after.length) return false;
  // Allow a single inflectional change (provide → provides) but nothing else.
  let differences = 0;
  for (let index = 0; index < before.length; index += 1) {
    if (before[index] === after[index]) continue;
    if (!sameLemma(before[index], after[index])) return false;
    differences += 1;
  }
  return differences <= 1;
}

/**
 * Attempts a safe one-edit repair of `sentence`.
 * Returns { revised, revisionType, operation, proof } or null when no unambiguous repair exists.
 */
export function deriveDeterministicCorrection({ sentence = "", targetSpan = "", category = "" } = {}) {
  const original = String(sentence || "");
  if (!original.trim()) return null;
  const span = String(targetSpan || "").trim();
  // Condition 1: when a target span is supplied it must be present verbatim, so the repair is
  // anchored to the evidence the report shows rather than to a re-found approximation.
  if (span && !original.includes(span)) return null;
  const label = String(category || "");
  // The repair is scoped to THIS issue's defect class. One sentence can legitimately carry two
  // defects ("…although shopping … provide … forced into an economic instability"), each its own
  // canonical issue with its own target span; each must receive its own one-token repair rather than
  // being abandoned because the sentence as a whole offers two possible edits.
  const family = /subject.?verb|agreement/i.test(label) ? "agreement"
    : /countab|article/i.test(label) ? "article"
    : /punctuation|spacing/i.test(label) ? "punctuation"
    : "any";

  const candidates = [];

  // ---- fixed expression -----------------------------------------------------------------------
  if (family === "any" || family === "expression") for (const entry of FIXED_EXPRESSIONS) {
    const revised = applyOnce(original, entry.wrong, entry.right);
    if (revised && revised !== original) {
      candidates.push({ revised, operation: "fixed-expression", proof: `In this context ${entry.note}.` });
      break;
    }
  }

  // ---- subject-verb agreement -----------------------------------------------------------------
  // The independent syntactic-head validator supplies the offsets, the corrected token and its own
  // pass/fail, so the repair is never guessed from the surface string.
  if (family === "any" || family === "agreement") {
    const defects = detectSyntacticHeadAgreementDefects(original);
    if (defects.length === 1) {
      const defect = defects[0];
      const revised = `${original.slice(0, defect.targetOffsetStart)}${defect.correctedSpan}${original.slice(defect.targetOffsetEnd)}`;
      if (revised !== original) {
        candidates.push({
          revised,
          operation: "subject-verb-agreement",
          proof: defect.proof || `The finite verb is controlled by the ${defect.subjectNumber} subject head "${defect.subjectHead}".`
        });
      }
    }
  }

  // ---- article before an uncountable abstract noun ---------------------------------------------
  const article = (family === "any" || family === "article") ? original.match(ARTICLE_BEFORE_UNCOUNTABLE) : null;
  if (article) {
    const revised = original.replace(ARTICLE_BEFORE_UNCOUNTABLE, "$2");
    if (revised !== original) {
      candidates.push({
        revised,
        operation: "article-before-uncountable",
        proof: `"${article[2]}" is uncountable in this meaning, so it takes no indefinite article.`
      });
    }
  }

  // ---- mechanical spacing ----------------------------------------------------------------------
  if ((family === "any" || family === "punctuation") && MISSING_SPACE_AFTER_STOP.test(original)) {
    candidates.push({
      revised: original.replace(MISSING_SPACE_AFTER_STOP, "$1 $2"),
      operation: "sentence-spacing",
      proof: "A sentence-final punctuation mark is followed directly by the next sentence."
    });
  } else if ((family === "any" || family === "punctuation") && DOUBLE_SPACE.test(original)) {
    candidates.push({
      revised: original.replace(DOUBLE_SPACE, "$1 $2"),
      operation: "internal-spacing",
      proof: "The sentence contains a repeated space."
    });
  }

  // Condition 2: exactly one unambiguous repair. Two competing repairs is a learner decision.
  if (candidates.length !== 1) return null;
  const [candidate] = candidates;

  // Condition 3: no content word changed.
  if (!meaningPreserved(original, candidate.revised)) return null;

  // Condition 5: the repair must not leave a NEW agreement defect behind.
  const before = detectSyntacticHeadAgreementDefects(original).length;
  const after = detectSyntacticHeadAgreementDefects(candidate.revised).length;
  if (after > before) return null;

  return {
    revised: candidate.revised,
    revisionType: "Minimal Correction",
    operation: candidate.operation,
    proof: candidate.proof,
    version: DETERMINISTIC_CORRECTION_VERSION
  };
}

// Categories whose repair is always a learner decision: never auto-corrected, however local the span
// looks. This is the guard that keeps the module honest.
const NEVER_AUTO_CORRECT = /Comparative Judgement|Thesis-to-Body Promise|Causal Mechanism|Solution Mechanism|Explanation Depth|Example Development|SAR Example Quality|Reference Control|Pronoun Control|Meaning Control|Word Form/i;

export function isAutoCorrectableCategory(category = "") {
  return !NEVER_AUTO_CORRECT.test(String(category || ""));
}
