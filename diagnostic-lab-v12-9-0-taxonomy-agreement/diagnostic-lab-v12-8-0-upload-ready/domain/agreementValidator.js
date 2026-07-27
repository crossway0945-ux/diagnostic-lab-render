const COPULA_EXPECTATIONS = Object.freeze({
  singular: Object.freeze({ are: "is", were: "was", have: "has" }),
  plural: Object.freeze({ is: "are", was: "were", has: "have" })
});

const BASE_TO_THIRD = Object.freeze({
  continue: "continues",
  cause: "causes",
  create: "creates",
  increase: "increases",
  reduce: "reduces",
  lead: "leads",
  result: "results",
  provide: "provides",
  support: "supports",
  drive: "drives",
  help: "helps",
  allow: "allows",
  make: "makes",
  need: "needs",
  do: "does"
});

const THIRD_TO_BASE = Object.freeze(Object.fromEntries(
  Object.entries(BASE_TO_THIRD).map(([base, third]) => [third, base])
));

const IRREGULAR_PLURALS = new Set([
  "people", "children", "men", "women", "data", "criteria", "media", "police",
  "cattle", "teeth", "feet", "mice", "geese"
]);

const SINGULAR_S_ENDINGS = new Set([
  "analysis", "basis", "business", "economics", "news", "physics", "politics",
  "progress", "research", "series", "species", "status"
]);

const EXPLICIT_SINGULAR_HEADS = new Set([
  "amount", "company", "country", "economy", "equipment", "generation", "government",
  "industry", "information", "issue", "market", "number", "population", "quality",
  "research", "supply", "technology", "traffic", "workforce"
]);

const SUBJECT_DETERMINERS = new Set([
  "a", "an", "the", "this", "that", "these", "those", "each", "every", "either",
  "neither", "one", "both", "many", "several", "few", "multiple", "various", "all"
]);

const PREPOSITION_BOUNDARIES = new Set([
  "of", "in", "on", "at", "for", "from", "with", "by", "among", "between",
  "through", "across", "under", "over", "within", "without"
]);

const FINITE_PATTERN = /\b(is|are|was|were|has|have|continue|continues|cause|causes|create|creates|increase|increases|reduce|reduces|lead|leads|result|results|provide|provides|support|supports|drive|drives|help|helps|allow|allows|make|makes|need|needs|do|does)\b/giu;

export const AGREEMENT_VALIDATOR_VERSION = "syntactic-head-agreement-v12.9.0";

// Quantifier heads whose determiner decides the verb number ("a number of X are" / "the number of X is").
const COUNT_QUANTIFIER_HEADS = new Set(["number", "percentage", "proportion", "majority", "minority"]);
// Quantifier heads where both singular and plural agreement occur in accepted usage. Never asserted.
const AMBIGUOUS_QUANTIFIER_HEADS = new Set(["range", "variety", "amount", "couple", "handful", "series", "total"]);

export function detectSyntacticHeadAgreementDefects(evidence = "", absoluteStart = 0) {
  const text = String(evidence || "");
  const defects = [];
  for (const match of text.matchAll(FINITE_PATTERN)) {
    const verb = match[0];
    const verbStart = match.index ?? -1;
    if (verbStart < 0) continue;
    // A lexical item such as "cause" can be the subject noun before a copula:
    // "The main cause is ...". It is not a finite verb in that frame.
    const following = text.slice(verbStart + verb.length);
    if ((BASE_TO_THIRD[verb.toLowerCase()] || THIRD_TO_BASE[verb.toLowerCase()]) &&
      /^\s+(?:is|are|was|were|has|have)\b/i.test(following)) {
      continue;
    }
    const subject = resolveFiniteVerbSubject(text, verbStart);
    if (!subject || !["singular", "plural"].includes(subject.number)) continue;
    if (SUBJECT_DETERMINERS.has(String(subject.head || "").toLowerCase())) continue;
    const correctedSpan = expectedVerb(subject.number, verb);
    if (!correctedSpan || correctedSpan.toLowerCase() === verb.toLowerCase()) continue;
    const defect = {
      assertionType: "agreement",
      targetSpan: verb,
      targetOffsetStart: absoluteStart + verbStart,
      targetOffsetEnd: absoluteStart + verbStart + verb.length,
      sourceOffsetStart: absoluteStart + verbStart,
      sourceOffsetEnd: absoluteStart + verbStart + verb.length,
      correctedSpan: preserveCase(verb, correctedSpan),
      expectedCorrection: preserveCase(verb, correctedSpan),
      subjectSpan: subject.span,
      subjectHead: subject.head,
      subjectNumber: subject.number,
      subjectStartOffset: absoluteStart + subject.start,
      subjectEndOffset: absoluteStart + subject.end,
      proof: `The finite verb is controlled by the ${subject.number} subject head "${subject.head}" in "${subject.span}", not by a noun inside a modifying phrase.`
    };
    if (validateAgreementRepair(text, {
      ...defect,
      targetOffsetStart: verbStart,
      targetOffsetEnd: verbStart + verb.length,
      subjectStartOffset: subject.start,
      subjectEndOffset: subject.end
    }).pass) defects.push(defect);
  }
  return uniqueDefects(defects);
}

export function validateAgreementRepair(evidence = "", defect = {}) {
  const text = String(evidence || "");
  const start = Number(defect.targetOffsetStart);
  const end = Number(defect.targetOffsetEnd);
  const replacement = String(defect.correctedSpan || "");
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length || !replacement) {
    return { pass: false, reason: "The proposed agreement repair has invalid local offsets." };
  }
  const original = text.slice(start, end);
  const subject = resolveFiniteVerbSubject(text, start);
  if (!subject || subject.head !== defect.subjectHead || subject.number !== defect.subjectNumber) {
    return { pass: false, reason: "The subject head could not be reproduced independently." };
  }
  const expected = expectedVerb(subject.number, original);
  if (!expected || expected.toLowerCase() !== replacement.toLowerCase()) {
    return { pass: false, reason: "The proposed verb does not match the independently resolved subject number." };
  }
  const revised = `${text.slice(0, start)}${replacement}${text.slice(end)}`;
  const revisedSubject = resolveFiniteVerbSubject(revised, start);
  const revisedVerb = revised.slice(start, start + replacement.length);
  return revisedSubject &&
    revisedSubject.head === subject.head &&
    revisedSubject.number === subject.number &&
    !expectedVerb(revisedSubject.number, revisedVerb)
    ? { pass: true, reason: "The correction preserves the syntactic subject and resolves the local agreement defect." }
    : { pass: false, reason: "The revised sentence does not pass independent subject-head agreement validation." };
}

export function resolveFiniteVerbSubject(text = "", verbStart = -1) {
  const source = String(text || "");
  if (!Number.isInteger(verbStart) || verbStart <= 0 || verbStart > source.length) return null;
  const clauseStart = findClauseStart(source, verbStart);
  let prefix = source.slice(clauseStart, verbStart);
  if (!prefix.trim() || /\bthere\s*$/i.test(prefix)) return null;

  // Remove a completed embedded relative clause before resolving the following matrix verb:
  // "The problems (that) we have are ..." -> subject head "problems", not "have".
  prefix = prefix.replace(
    /\s+(?:that\s+)?(?:i|you|we|they|he|she|it)\s+(?:is|are|was|were|has|have|continue|continues|cause|causes|create|creates|increase|increases|reduce|reduces|lead|leads|result|results|provide|provides|support|supports|drive|drives|help|helps|allow|allows|make|makes|need|needs|do|does)\s*$/i,
    ""
  );

  const relative = prefix.match(/\b(who|which|that|i|you|we|they|he|she|it)\s*$/i);
  if (relative) {
    const pronoun = relative[1];
    const number = pronounNumber(pronoun);
    if (!number) return null;
    const start = clauseStart + (relative.index ?? 0);
    return { span: pronoun, head: pronoun, number, start, end: start + pronoun.length, confidence: "high" };
  }

  prefix = prefix
    .replace(/^\s*(?:however|therefore|moreover|furthermore|consequently|first(?:ly)?|second(?:ly)?|in addition)\s*,?\s*/i, "")
    .replace(/^\s*(?:because|although|while|whereas|if|when|since)\s+/i, "");
  const leadingTrim = prefix.search(/\S/);
  if (leadingTrim < 0) return null;
  const normalizedStart = clauseStart + leadingTrim;
  const subjectText = prefix.slice(leadingTrim).trim();
  if (!subjectText || /[,;:!?]/.test(subjectText)) return null;
  if (/\b(?:and|but|or|so)\b/i.test(subjectText) && !/\band\b/i.test(subjectText.split(/\b(?:of|in|on|at|for|from|with|by)\b/i)[0])) {
    return null;
  }

  const tokens = Array.from(subjectText.matchAll(/[A-Za-z]+(?:-[A-Za-z]+)*/g))
    .map((item) => ({ value: item[0], lower: item[0].toLowerCase(), index: item.index ?? 0 }));
  if (!tokens.length) return null;
  const first = tokens[0].lower;
  const pronounNumberValue = pronounNumber(first);
  if (tokens.length === 1 && pronounNumberValue) {
    return {
      span: subjectText,
      head: tokens[0].value,
      number: pronounNumberValue,
      start: normalizedStart,
      end: normalizedStart + subjectText.length,
      confidence: "high"
    };
  }
  if (!SUBJECT_DETERMINERS.has(first) && !EXPLICIT_SINGULAR_HEADS.has(first) && !IRREGULAR_PLURALS.has(first)) return null;

  const prepositionIndex = tokens.findIndex((token, index) => index > 0 && PREPOSITION_BOUNDARIES.has(token.lower));
  const coreTokens = prepositionIndex > 0 ? tokens.slice(0, prepositionIndex) : tokens;
  if (!coreTokens.length) return null;
  const coreWords = coreTokens.map((token) => token.lower);
  let headToken = coreTokens.at(-1);
  let number = "";

  // Quantifier-construction agreement. English distinguishes:
  //   "a/an [adjective]* number of + plural noun"  -> PLURAL verb  ("a growing number of shops ARE")
  //   "the [adjective]* number of + plural noun"   -> SINGULAR verb ("the number of shops IS")
  // The quantifier head may sit behind modifiers ("an INCREASING number of"), so it is located by
  // scanning the core span rather than assuming index 1 — the previous assumption made
  // "an increasing number of residents have" look singular and produced a harmful false correction.
  const quantifierIndex = coreWords.findIndex((word) => COUNT_QUANTIFIER_HEADS.has(word));
  const ambiguousIndex = coreWords.findIndex((word) => AMBIGUOUS_QUANTIFIER_HEADS.has(word));
  if (quantifierIndex > 0 && ["a", "an", "the"].includes(coreWords[0])) {
    headToken = coreTokens[quantifierIndex];
    number = coreWords[0] === "the" ? "singular" : "plural";
  } else if (ambiguousIndex > 0) {
    // "a range of products is/are" is acceptable either way in real usage: never assert a defect.
    return null;
  } else if (["each", "every", "either", "neither", "one", "a", "an", "this", "that"].includes(first)) {
    number = "singular";
  } else if (["both", "many", "several", "few", "multiple", "various", "these", "those"].includes(first)) {
    number = "plural";
  } else if (coreWords.includes("and")) {
    number = "plural";
  } else {
    number = nounNumber(headToken.lower);
  }
  if (!number) return null;
  return {
    span: subjectText,
    head: headToken.value,
    number,
    start: normalizedStart,
    end: normalizedStart + subjectText.length,
    confidence: prepositionIndex > 0 ? "high" : "medium"
  };
}

function findClauseStart(text, verbStart) {
  const prefix = text.slice(0, verbStart);
  const punctuation = Math.max(prefix.lastIndexOf("."), prefix.lastIndexOf("?"), prefix.lastIndexOf("!"), prefix.lastIndexOf(";"), prefix.lastIndexOf(":"));
  const comma = prefix.lastIndexOf(",");
  return Math.max(punctuation, comma) + 1;
}

function pronounNumber(value) {
  const word = String(value || "").toLowerCase();
  if (["he", "she", "it"].includes(word)) return "singular";
  if (["we", "they", "you"].includes(word)) return "plural";
  if (word === "i") return "plural";
  return "";
}

function nounNumber(value) {
  const word = String(value || "").toLowerCase();
  if (IRREGULAR_PLURALS.has(word)) return "plural";
  if (EXPLICIT_SINGULAR_HEADS.has(word) || SINGULAR_S_ENDINGS.has(word)) return "singular";
  if (/[^s]s$/i.test(word)) return "plural";
  if (/^[a-z][a-z-]{2,}$/i.test(word)) return "singular";
  return "";
}

function expectedVerb(number, verb) {
  const lower = String(verb || "").toLowerCase();
  if (COPULA_EXPECTATIONS[number]?.[lower]) return COPULA_EXPECTATIONS[number][lower];
  if (number === "singular" && BASE_TO_THIRD[lower]) return BASE_TO_THIRD[lower];
  if (number === "plural" && THIRD_TO_BASE[lower]) return THIRD_TO_BASE[lower];
  return "";
}

function preserveCase(source, replacement) {
  return /^[A-Z]/.test(String(source || ""))
    ? `${replacement.charAt(0).toUpperCase()}${replacement.slice(1)}`
    : replacement;
}

function uniqueDefects(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.targetOffsetStart}:${item.targetOffsetEnd}:${item.subjectHead}:${item.correctedSpan}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
