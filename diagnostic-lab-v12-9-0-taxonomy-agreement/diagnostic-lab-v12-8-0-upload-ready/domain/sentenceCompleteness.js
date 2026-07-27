const TERMINAL_PUNCTUATION = /[.!?]["')\]]*$/u;
const DANGLING_ENDING = /[,;:]\s*$/u;
const LEADING_EXAMPLE = /^(?:(?:for example|for instance|as an example|to illustrate)\s*,\s*)/i;
const LEADING_DISCOURSE = /^(?:(?:however|therefore|moreover|furthermore|consequently|overall|in conclusion)\s*,\s*)/i;
const DEPENDENT_OPENING = /^(?:because|although|though|while|whereas|if|when|whenever|unless|since)\b/i;
const COORDINATOR_OPENING = /^(?:and|but|so)\b/i;
const INFINITIVE_OR_GERUND_OPENING = /^(?:to\s+[a-z]+|[a-z]+ing)\b/i;
const RELATIVE_MARKER = /\b(?:who|which|that|whose|whom)\b/i;
const AUXILIARY_FINITE = /\b(?:am|is|are|was|were|has|have|had|do|does|did|can|could|will|would|shall|should|may|might|must)\b/gi;
const IRREGULAR_FINITE = /\b(?:became|began|brought|built|came|cost|cut|drove|fell|felt|found|gave|grew|kept|knew|led|left|lost|made|meant|met|paid|put|ran|rose|said|saw|sent|set|showed|spent|stood|taught|thought|took|went|won|wrote)\b/gi;
const LEXICAL_FINITE = /\b[\p{L}][\p{L}'-]*(?:s|ed)\b/giu;
const BASE_FINITE_VERBS = "(?:agree|disagree|believe|think|argue|claim|support|oppose|prefer|need|want|consider|live|work|learn|study|travel|use|make|take|provide|show|cause|lead|help|allow|reduce|increase|improve|affect|create|move|spend|face|receive|become|remain|lack|offer|develop|pay|drive|write|read|report|compare|describe|grow|rise|fall)";
const PRONOUN_BASE_FINITE = new RegExp(`\\b(?:i|we|you|they)\\s+(?:(?:[\\p{L}'-]+ly)\\s+){0,3}${BASE_FINITE_VERBS}\\b`, "giu");
const PLURAL_SUBJECT_BASE_FINITE = new RegExp(`\\b(?:people|families|parents|students|residents|workers|commuters|shoppers|drivers|households|communities|citizens|children|companies|governments|schools|businesses|countries|cities|towns|figures|rates|calls|maps|stages)\\s+(?:(?:[\\p{L}'-]+ly)\\s+){0,2}${BASE_FINITE_VERBS}\\b`, "giu");

export const SENTENCE_COMPLETENESS_VALIDATOR_VERSION = "independent-clause-validator-v12.8.0";

export function validateSentenceCompleteness(value = "") {
  const original = String(value || "").trim();
  const text = stripLeadingMarkers(original);
  const reasons = [];
  if (!original) reasons.push("empty");
  if (original && !TERMINAL_PUNCTUATION.test(original)) reasons.push("missing-terminal-punctuation");
  if (DANGLING_ENDING.test(original)) reasons.push("dangling-ending");
  if (!text) reasons.push("missing-clause");

  const finiteVerbs = finiteVerbMatches(text);
  if (!finiteVerbs.length) reasons.push("missing-finite-verb");
  if (COORDINATOR_OPENING.test(text)) reasons.push("coordinator-dependent-opening");
  if (DEPENDENT_OPENING.test(text) && !hasIndependentClauseAfterDependentOpening(text)) {
    reasons.push("subordinate-clause-without-main-clause");
  }
  if (INFINITIVE_OR_GERUND_OPENING.test(text) &&
    !hasFiniteMainClauseAfterOpeningPhrase(text) &&
    !hasGerundSubjectPredicate(text)) {
    reasons.push("non-finite-phrase-without-main-clause");
  }
  if (isNounPhraseRelativeFragment(text, finiteVerbs)) {
    reasons.push("noun-phrase-relative-clause-without-main-clause");
  }

  return {
    complete: reasons.length === 0,
    independentClausePresent: reasons.length === 0,
    reasons: [...new Set(reasons)],
    finiteVerbCount: finiteVerbs.length,
    validatorVersion: SENTENCE_COMPLETENESS_VALIDATOR_VERSION
  };
}

export function buildRoutePreservingFragmentRevision(value = "") {
  const original = String(value || "").trim();
  const marker = original.match(LEADING_EXAMPLE)?.[0] || "";
  const body = stripTerminal(original.slice(marker.length).trim());
  const relative = body.match(/^(?<subject>(?:(?:a|an|the|this|that|these|those|some|many|each|every)\s+)?[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,8})\s+(?:who|which|that)\s+(?<verb>[\p{L}][\p{L}'-]*)\s+(?<rest>.+)$/iu);
  if (!relative?.groups) return "";
  const baseVerb = toBaseVerb(relative.groups.verb);
  if (!baseVerb || !relative.groups.rest.trim()) return "";
  const candidate = `${marker}${relative.groups.subject} can ${baseVerb} ${relative.groups.rest.trim()}.`;
  return validateSentenceCompleteness(candidate).complete ? candidate : "";
}

function stripLeadingMarkers(value) {
  return String(value || "")
    .replace(LEADING_EXAMPLE, "")
    .replace(LEADING_DISCOURSE, "")
    .trim();
}

function stripTerminal(value) {
  return String(value || "").replace(/[.!?]["')\]]*$/u, "").trim();
}

function finiteVerbMatches(value) {
  const text = String(value || "");
  const matches = [
    ...(text.match(AUXILIARY_FINITE) || []),
    ...(text.match(IRREGULAR_FINITE) || []),
    ...(text.match(LEXICAL_FINITE) || []),
    ...(text.match(PRONOUN_BASE_FINITE) || []),
    ...(text.match(PLURAL_SUBJECT_BASE_FINITE) || [])
  ];
  return matches.filter((token) => !/^(?:this|his|thus|news|means)$/i.test(token));
}

function hasIndependentClauseAfterDependentOpening(value) {
  const comma = String(value || "").indexOf(",");
  if (comma < 0) return false;
  const mainClause = String(value).slice(comma + 1).trim();
  return hasSubjectPredicate(mainClause);
}

function hasFiniteMainClauseAfterOpeningPhrase(value) {
  const comma = String(value || "").indexOf(",");
  if (comma < 0) return false;
  return hasSubjectPredicate(String(value).slice(comma + 1));
}

function hasGerundSubjectPredicate(value) {
  const text = String(value || "").trim();
  if (!/^[\p{L}'-]+ing\b/iu.test(text)) return false;
  if ((text.match(AUXILIARY_FINITE) || []).length || (text.match(IRREGULAR_FINITE) || []).length) return true;
  return /\b(?:benefits|benefited|improves|improved|reduces|reduced|increases|increased|decreases|decreased|causes|caused|creates|created|helps|helped|makes|made|allows|allowed|provides|provided|shows|showed|affects|affected|requires|required|supports|supported|limits|limited|weakens|weakened|strengthens|strengthened|intensifies|intensified|remains|remained|rises|rose|falls|fell)\b/i.test(text);
}

function hasSubjectPredicate(value) {
  const text = String(value || "").trim();
  if (!text || !finiteVerbMatches(text).length) return false;
  return /^(?:there|it|this|that|these|those|[a-z][\w'-]*(?:\s+[a-z][\w'-]*){0,8})\s+/i.test(text);
}

function isNounPhraseRelativeFragment(value, finiteVerbs) {
  const text = String(value || "").trim();
  const relative = RELATIVE_MARKER.exec(text);
  if (!relative) return false;
  const before = text.slice(0, relative.index).trim();
  if (!/^(?:(?:a|an|the|this|that|these|those|some|many|each|every)\s+)?[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,8}$/iu.test(before)) {
    return false;
  }
  const clause = text.slice(relative.index).match(/^(?:who|which|that|whose|whom)\s+[\p{L}][\p{L}'-]*\s+(?<tail>.+)$/iu);
  if (!clause?.groups?.tail) return finiteVerbs.length <= 1;
  // Remove the first object before an infinitive or adjunct. This prevents a plural object such as
  // "drivers" from being mistaken for a third-person finite verb.
  const tail = clause.groups.tail
    .replace(/^(?:[a-z][\w'-]*)(?:\s+[a-z][\w'-]*){0,3}\s+(?=to\b|away\b|from\b|into\b|through\b|while\b|during\b)/i, "")
    .trim();
  // A noun phrase followed by a relative clause needs another finite verb for its main predicate.
  // "A law that restricts phones." has none in the tail; "... restricts phones and reduces crashes"
  // has "reduces" and is complete.
  return finiteVerbMatches(tail).length === 0;
}

function toBaseVerb(value) {
  const verb = String(value || "").toLowerCase();
  if (!verb) return "";
  if (/ies$/.test(verb)) return `${verb.slice(0, -3)}y`;
  if (/(?:ches|shes|xes|zes|ses|oes)$/.test(verb)) return verb.slice(0, -2);
  if (/ces$/.test(verb)) return verb.slice(0, -1);
  if (/s$/.test(verb) && !/ss$/.test(verb)) return verb.slice(0, -1);
  return verb;
}
