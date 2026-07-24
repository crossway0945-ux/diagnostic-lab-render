// Targeted Revision quality validator.
//
// A Targeted Revision is the one part of the report a student is invited to copy, so it must be a
// safe pattern to study. This module checks a revision on its own terms — grammar completeness,
// internal reference coherence, fidelity to the task, and freedom from AI meta-language — and
// reports every failure as REPAIRABLE. It never rewrites the revision and never blocks a report by
// itself; the caller decides whether to keep, repair or disclose.
//
// Nothing here is tied to a topic, student, essay type or visual type.

// Meta-language: sentences that talk *about* the task instead of stating content from it.
const GENERIC_META_PATTERNS = Object.freeze([
  /\bthe (?:wider |whole |same )?(?:group|system|issue|problem|mechanism|factor)s? (?:named|mentioned|described|identified) in the (?:prompt|task|question)\b/i,
  /\bthe same (?:mechanism|pattern|effect|principle) (?:operates|applies|works)\b/i,
  /\bthis (?:links?|relates?|connects?|applies) to the (?:prompt|task|question|topic)\b/i,
  /\bthis (?:example |sentence |revision )?shows the (?:issue|problem|point) (?:in|from) the (?:prompt|task)\b/i,
  /\bat a wider level\b/i,
  /\bbeyond the (?:single |one )?example\b/i,
  /\bthis would have an impact\b/i,
  /\bthe (?:visuals?|figures?|information|data) (?:show|shows|gives? details)\s*$/i
]);

// Vague placeholders that carry no reportable content unless immediately specified.
const VAGUE_NOUN_PATTERNS = Object.freeze([
  /\bvarious (?:people|things|factors|reasons|aspects)\b/i,
  /\bseveral factors\b/i,
  /\bdifferent things\b/i,
  /\bsome (?:places|things|stuff)\b/i,
  /\bmany aspects\b/i
]);

const SPECIFIER = /\b(?:because|since|when|if|so that|such as|for example|by|through|during|after|before|which|who|where)\b|\b\d/;

const CLOSING = /[.!?]["'’”)\]]*$/u;
const DANGLING_DEMONSTRATIVE = /\b(?:in|on|at|of|for|with|from|into|within)\s+(?:the\s+)?[a-z][\w-]*(?:\s+[a-z][\w-]*){0,3}\s+(?:this|that|these|those)\s+(?:could|would|can|will|may|might|should|is|are|was|were|has|have)\b/i;
const DOUBLE_SUBJECT = /\b(?:it|they|he|she|this|that|there)\s+(?:it|they|he|she)\b/i;
const REPEATED_WORD = /\b([\w-]+)\s+\1\b/i;
// A clear subject pronoun directly after a comma (no coordinating conjunction between) begins a
// second independent clause, whatever verb follows — "..., they need to travel" is as much a splice
// as "..., they will travel". this/that/there can also be determiners or existential, so they are
// only treated as a splice subject when an unambiguous finite verb follows.
const COMMA_SPLICE = /,\s*(?:it|they|he|she|we|you)\s+[a-z][\w'-]*/i;
const COMMA_SPLICE_DEMONSTRATIVE = /,\s*(?:this|that|there)\s+(?:is|are|was|were|has|have|can|could|will|would|may|might|should|makes?|made|means?|leads?|causes?|creates?|increases?|reduces?|forces?|allows?)\b/i;
// A leading preposition or subordinator marks the left side as a non-clause (an introductory phrase
// or a dependent clause), so "In many cities, they build zones" and "If it is free, they use it" are
// not comma splices. Anchored at the start so a subordinator inside the main clause does not excuse a
// real splice.
const LEADING_NONCLAUSE = /^(?:in|on|at|for|with|from|by|to|of|during|after|before|since|although|though|while|because|if|when|whenever|as|through|within|without|despite|besides|among|between|over|under|near|unlike|whereas|once|unless)\b/i;
const CONJUNCTION_START = /^(?:and|but|so|because|which|that|although|though|while|whereas)\b/i;

const STOP_WORDS = new Set(
  "a an the and or but of to in on at for its it is are was were be been being this that these those their his her they them we you i as into over under more most very much many some any there here with from by not no than then so such which who whom whose what when where why how".split(" ")
);

function words(value) {
  return String(value || "").toLowerCase().match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu) || [];
}

// The noun phrase a modal policy claim is about: "X should (not) be <verb>..." -> X.
function policyClaimSubject(value) {
  const match = String(value || "").match(/(?:^|[.!?]\s+|\bthat\s+|\bbelieve\s+)([A-Za-z][A-Za-z' -]{2,80}?)\s+should\s+(?:not\s+)?(?:be\s+)?[a-z]+/i);
  return match ? match[1] : "";
}

function contentWords(value) {
  return words(value).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function hasFiniteVerb(value) {
  return /\b(?:is|are|was|were|be|been|being|has|have|had|do|does|did|can|could|will|would|shall|should|may|might|must)\b/i.test(value) ||
    /\b[\w-]+(?:s|ed|es)\b/i.test(value);
}

/**
 * Grammar completeness: the revision must read as one or more complete sentences.
 */
export function checkRevisionGrammar(revision = "") {
  const text = String(revision || "").trim();
  const problems = [];
  if (!text) return { status: "fail", problems: ["The revision is empty."] };
  if (!CLOSING.test(text)) problems.push("The revision does not end with terminal punctuation.");
  if (/[,;:]\s*$/u.test(text)) problems.push("The revision ends mid-clause.");
  if (!hasFiniteVerb(text)) problems.push("The revision has no finite verb.");
  // "Although A, B." / "While A, B." are complete sentences: a leading subordinator is only a
  // fragment when no main clause follows. Leading coordinators (and/but/so) stay flagged.
  const startsWithSubordinator = /^(?:because|which|that|although|though|while|whereas)\b/i.test(text);
  const startsWithCoordinator = /^(?:and|but|so)\b/i.test(text);
  if (startsWithCoordinator || (startsWithSubordinator && !/,/.test(text))) {
    problems.push("The revision opens with a conjunction and does not form a standalone sentence.");
  }
  if (DANGLING_DEMONSTRATIVE.test(text)) problems.push("A demonstrative pronoun follows a noun phrase without a connector, leaving a broken clause.");
  if (DOUBLE_SUBJECT.test(text)) problems.push("The revision repeats the subject.");
  // A comma splice needs an independent clause on BOTH sides. "For many students, it is hard..."
  // is an introductory phrase (fewer than two content words / leading preposition), not a splice.
  const spliceMatch = COMMA_SPLICE.exec(text) || COMMA_SPLICE_DEMONSTRATIVE.exec(text);
  if (spliceMatch) {
    const beforeComma = text.slice(0, spliceMatch.index);
    // Only the clause immediately before the pronoun comma decides a splice. "Subsequently, if X,
    // they would Y" ends in a dependent if-clause, so the pronoun clause is that conditional's main
    // clause, not a spliced second sentence; "In many cities, they build Z" ends in a prepositional
    // phrase. A leading subordinator or preposition on that immediate clause marks it non-independent.
    const immediateClause = beforeComma.slice(beforeComma.lastIndexOf(",") + 1).trim();
    const dependentClause = LEADING_NONCLAUSE.test(immediateClause);
    if (!dependentClause && hasFiniteVerb(immediateClause) && contentWords(immediateClause).length >= 2) {
      problems.push("The revision joins two independent clauses with a comma.");
    }
  }
  if (REPEATED_WORD.test(text)) problems.push("The revision repeats a word consecutively.");
  if (words(text).length < 5) problems.push("The revision is too short to model a full sentence.");
  return { status: problems.length ? "fail" : "pass", problems };
}

/**
 * Reference coherence: a relative clause must not contradict the noun it attaches to.
 * Generalised check — a place noun cannot be described as distant from itself.
 */
export function checkRevisionReference(revision = "") {
  const text = String(revision || "");
  const problems = [];
  const selfDistance = /\b(?:live|living|located|situated|based|reside|residing)\s+in\s+(?:different\s+|various\s+|several\s+)?([\w-]+)[^.]{0,60}?\bfar (?:away )?from their\s+([\w-]+)/i.exec(text);
  if (selfDistance) {
    const place = selfDistance[1].toLowerCase().replace(/s$/, "");
    const target = selfDistance[2].toLowerCase().replace(/s$/, "");
    const PLACE_NOUNS = new Set(["location", "place", "area", "district", "home", "house", "residence", "neighbourhood", "neighborhood", "zone"]);
    if (PLACE_NOUNS.has(place) && PLACE_NOUNS.has(target)) {
      problems.push(`"${selfDistance[1]}" cannot be described as far from "${selfDistance[2]}": the reference points at itself.`);
    }
  }
  // Note: a revision that replaces a mid-paragraph sentence may legitimately open with a pronoun
  // whose referent is the previous sentence, so a leading pronoun is not checked here.
  return { status: problems.length ? "fail" : "pass", problems };
}

/**
 * Task fidelity: the revision must stay inside the vocabulary of the student's own sentence and the
 * prompt. It may not silently swap the subject of the policy, and may not invent statistics.
 */
export function checkRevisionTaskFidelity({ original = "", revision = "", prompt = "", writing = "" } = {}) {
  const problems = [];
  const revisionText = String(revision || "");
  if (!revisionText.trim()) return { status: "fail", problems: ["The revision is empty."] };

  const known = new Set([...contentWords(original), ...contentWords(prompt)]);
  const introduced = [...new Set(contentWords(revisionText))].filter((word) => !known.has(word));

  // Policy-subject drift: when both sentences make a modal policy claim ("X should (not) be ..."),
  // the revision may not swap the subject to a noun the student never used for that claim. This
  // catches agent swaps such as "towns and cities should not be divided" becoming "facilities
  // should not be divided" — a different policy — while allowing synonyms already present in the
  // original subject or the prompt's own policy subject.
  const originalSubject = policyClaimSubject(original);
  const revisedSubject = policyClaimSubject(revisionText);
  if (originalSubject && revisedSubject) {
    const allowed = new Set([...contentWords(originalSubject), ...contentWords(policyClaimSubject(prompt) || "")]);
    const revisedHead = contentWords(revisedSubject);
    const headNoun = revisedHead[0];
    if (headNoun && allowed.size > 0 && !allowed.has(headNoun)) {
      problems.push(`The revision changes the policy subject from "${originalSubject.trim()}" to "${revisedSubject.trim()}", which alters what the task's policy applies to.`);
    }
  }

  // A fabricated figure is never acceptable: every number must already exist in the quoted sentence,
  // the prompt, or somewhere in the student's own full response (a Task 1 introduction repair may
  // legitimately pull an age range or year the student reported in another paragraph).
  const knownNumbers = new Set([
    ...(String(original).match(/\d[\d.,]*/g) || []),
    ...(String(prompt).match(/\d[\d.,]*/g) || []),
    ...(String(writing).match(/\d[\d.,]*/g) || [])
  ].map((value) => value.replace(/[.,]+$/, "")));
  for (const raw of revisionText.match(/\d[\d.,]*%?/g) || []) {
    const value = raw.replace(/[.,]+$/, "");
    // Only data-like figures count as fabrication: multi-digit numbers, decimals and percentages.
    // A bare single digit is almost always an ordinal or list marker, not invented visual data.
    const dataLike = /%$/.test(raw) || /\d[.,]\d/.test(value) || value.replace(/\D/g, "").length >= 2;
    if (dataLike && !knownNumbers.has(value.replace(/%$/, ""))) {
      problems.push(`The revision introduces the figure "${value}", which appears in neither the student's response nor the prompt.`);
    }
  }
  return {
    status: problems.length ? "fail" : "pass",
    problems,
    introducedContent: introduced
  };
}

/**
 * Pedagogical safety: no AI meta-language, no unspecified vague nouns.
 */
export function checkRevisionLanguageSafety(revision = "") {
  const text = String(revision || "");
  const problems = [];
  for (const pattern of GENERIC_META_PATTERNS) {
    if (pattern.test(text)) problems.push(`The revision contains meta-language about the task rather than content: ${pattern.source}`);
  }
  for (const pattern of VAGUE_NOUN_PATTERNS) {
    if (!pattern.test(text)) continue;
    // A vague noun is acceptable only when the same sentence immediately specifies it.
    const sentence = text.split(/(?<=[.!?])\s+/).find((part) => pattern.test(part)) || text;
    if (!SPECIFIER.test(sentence)) problems.push("The revision uses a vague noun phrase without specifying who, what, when or how.");
  }
  return { status: problems.length ? "fail" : "pass", problems };
}

// Analytical elements that make a revision an expansion rather than a rewording.
//
// Only countable, non-synonymous dimensions are used. Consequence and causal wording are excluded
// on purpose: swapping "encounter an issue" for "face difficulties" changes the words but adds no
// analysis, and treating that as an expansion would mislabel every ordinary rewording.
const GROUP_NOUN_STEM = "(?:people|public|famil(?:y|ies)|parents?|students?|residents?|workers?|commuters?|shoppers?|drivers?|households?|communit(?:y|ies)|citizens?|customers?|passengers?|employees?|business(?:es)?|neighbou?rhoods?|districts?|countr(?:y|ies)|cit(?:y|ies))";
const PLURAL_GROUP = new RegExp(`\\b(?:people|public|families|parents|students|residents|workers|commuters|shoppers|drivers|households|communities|citizens|customers|passengers|employees|businesses|neighbou?rhoods|districts|countries|cities)\\b`, "i");
const QUANTIFIED_GROUP = new RegExp(`\\b(?:every|all|each|most|many|numerous|several|some)\\s+(?:[a-z-]+\\s+){0,2}${GROUP_NOUN_STEM}\\b`, "i");

/**
 * Does the text already describe a population rather than one case?
 * "Every family" and "families" both do; "a student's house" does not. This keeps a singular-to-plural
 * grammar fix from being mistaken for genuine scope expansion.
 */
export function hasGroupScope(text = "") {
  const value = String(text || "");
  return PLURAL_GROUP.test(value) || QUANTIFIED_GROUP.test(value);
}

const ANALYTICAL_ELEMENTS = Object.freeze([
  // Scope escalation: the revision names a population where the original described one case.
  ["affected group", (text) => hasGroupScope(text)],
  // A stated condition or time frame the original never supplied.
  ["condition or timing", (text) => /\b(?:during|at peak|peak (?:hours?|periods?|times?)|each day|every day|rush hour|in the morning|at the same time|over time|throughout the day)\b/i.test(text)]
]);

/**
 * Revision-type fidelity: the label must describe what the revision actually did.
 *
 * Word counts cannot tell a rewording from an expansion — replacing "some people might encounter an
 * issue" with "some residents may face serious difficulties" introduces many new words but adds no
 * analysis, while a genuine expansion can be shorter than the original. The test is therefore
 * whether the revision introduces an analytical element the original did not have.
 */
export function checkRevisionTypeFidelity({ original = "", revision = "", revisionType = "" } = {}) {
  const problems = [];
  const type = String(revisionType || "").trim();
  const known = new Set(contentWords(original));
  const introduced = [...new Set(contentWords(revision))].filter((word) => !known.has(word));
  const addedElements = ANALYTICAL_ELEMENTS
    .filter(([, present]) => present(revision) && !present(original))
    .map(([name]) => name);
  const substantialAddition = addedElements.length > 0 && introduced.length >= 3;
  if (substantialAddition && ["Minimal Correction", "Route-Preserving Revision"].includes(type)) {
    problems.push(`"${type}" introduces a new ${addedElements.join(" and ")} and should be labelled Teacher-Guided Expansion.`);
  }
  if (!substantialAddition && type === "Teacher-Guided Expansion") {
    problems.push("Teacher-Guided Expansion is claimed but the revision adds no new analytical content.");
  }
  return { status: problems.length ? "fail" : "pass", problems, substantialAddition, addedElements, introducedContent: introduced };
}

/**
 * Full revision validation. Every failure is repairable: the caller keeps the diagnosis and the
 * score, and either repairs the revision or discloses the shortfall.
 */
export function validateRevisionQuality({
  original = "",
  revision = "",
  prompt = "",
  writing = "",
  revisionType = "",
  taskType = ""
} = {}) {
  const grammar = checkRevisionGrammar(revision);
  const reference = checkRevisionReference(revision);
  const taskFidelity = checkRevisionTaskFidelity({ original, revision, prompt, writing });
  const languageSafety = checkRevisionLanguageSafety(revision);
  const typeFidelity = checkRevisionTypeFidelity({ original, revision, revisionType });

  const problems = [
    ...grammar.problems.map((message) => ({ code: "REVISION_GRAMMAR", message })),
    ...reference.problems.map((message) => ({ code: "REVISION_REFERENCE", message })),
    ...taskFidelity.problems.map((message) => ({ code: "REVISION_TASK_FIDELITY", message })),
    ...languageSafety.problems.map((message) => ({ code: "REVISION_GENERIC_LANGUAGE", message })),
    ...typeFidelity.problems.map((message) => ({ code: "REVISION_TYPE_FIDELITY", message }))
  ];

  return {
    taskType: String(taskType || ""),
    grammarValidationStatus: grammar.status,
    semanticValidationStatus: reference.status,
    taskFidelityStatus: taskFidelity.status,
    languageSafetyStatus: languageSafety.status,
    revisionTypeValidationStatus: typeFidelity.status,
    substantialAddition: typeFidelity.substantialAddition,
    addedElements: typeFidelity.addedElements,
    introducedContent: typeFidelity.introducedContent,
    problems,
    // Every failure is repairable by contract: a defective revision must never destroy a report.
    severity: "repairable",
    pass: problems.length === 0
  };
}
