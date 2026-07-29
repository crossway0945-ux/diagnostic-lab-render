import { normalizeVisibleText } from "./textIntegrity.js";
import { validateSentenceCompleteness } from "./sentenceCompleteness.js";

export const EVIDENCE_ASSERTION_TYPES = Object.freeze([
  "punctuation_spacing",
  "sentence_fragment",
  "countability",
  "article",
  "lexical_meaning",
  "collocation",
  "word_form",
  "reference",
  "tense",
  "agreement",
  "preposition",
  "grammar",
  "causal_gap",
  "example_scope",
  "route_gap",
  "task_coverage",
  "data_error",
  "overview_error",
  "comparison_error",
  "process_sequence",
  "map_change",
  "visual_type_mismatch"
]);

const UNCOUNTABLE_PATTERNS = Object.freeze([
  "advice",
  "equipment",
  "evidence",
  "furniture",
  "homework",
  "information",
  "knowledge",
  "luggage",
  "pollution",
  "research",
  "traffic",
  "congestion",
  "transport",
  "transportation",
  "work"
]);

const ASSERTION_CATEGORY = Object.freeze({
  punctuation_spacing: "Punctuation",
  sentence_fragment: "Sentence Completion",
  countability: "Countability",
  article: "Article Control",
  lexical_meaning: "Lexical Precision",
  collocation: "Collocation",
  word_form: "Word Form",
  reference: "Reference Control",
  tense: "Tense Control",
  agreement: "Subject-Verb Agreement",
  preposition: "Preposition Control",
  grammar: "Grammar and Sentence Control",
  causal_gap: "Causal Mechanism",
  example_scope: "Example Development",
  route_gap: "Body Route Alignment",
  task_coverage: "Prompt Coverage",
  data_error: "Data Accuracy",
  overview_error: "Overview Accuracy",
  comparison_error: "Comparison Precision",
  process_sequence: "Process Sequence",
  map_change: "Map Change Accuracy"
  ,
  visual_type_mismatch: "Visual Understanding"
});

const ARTICLE_DETERMINERS = Object.freeze([
  "a", "an", "the", "this", "that", "each", "every", "one", "another"
]);

// A deliberately conservative, topic-neutral set of ordinary singular count-noun heads and
// adjective modifiers common in academic writing. The rule only fires when an adjective + singular
// head has no determiner; it does not attempt broad part-of-speech guessing.
const ARTICLE_COUNT_HEADS = Object.freeze([
  "approach", "burden", "chart", "city", "country", "crisis", "economy", "factor",
  "facility", "figure", "generation", "graph", "industry", "market", "measure", "method",
  "percentage", "policy", "problem", "proportion", "reason", "service", "solution", "system",
  "trend", "village", "workforce"
]);

const ARTICLE_MODIFIERS = Object.freeze([
  "central", "clear", "current", "economic", "educational", "effective", "environmental",
  "financial", "future", "global", "growing", "immediate", "key", "large", "local", "long-term",
  "main", "major", "medical", "modern", "national", "new", "old", "possible", "potential",
  "practical", "primary", "private", "public", "secondary", "severe", "short-term", "shrinking",
  "significant", "social", "sudden", "traditional", "young"
]);

export function inferEvidenceAssertionType(card = {}, issueCategory = "") {
  if (EVIDENCE_ASSERTION_TYPES.includes(String(card.evidenceAssertionType || ""))) {
    return String(card.evidenceAssertionType);
  }
  const explicit = String(issueCategory || "").trim();
  const explicitType = {
    Punctuation: "punctuation_spacing",
    "Sentence Completion": "sentence_fragment",
    Countability: "countability",
    "Article Control": "article",
    "Lexical Precision": "lexical_meaning",
    "Link Back Control": "lexical_meaning",
    Collocation: "collocation",
    "Word Form": "word_form",
    "Reference Control": "reference",
    "Tense Control": "tense",
    "Grammar and Sentence Control": "grammar",
    "Subject-Verb Agreement": "agreement",
    Agreement: "agreement",
    "Causal Mechanism": "causal_gap",
    "Solution Mechanism": "causal_gap",
    "Example Development": "example_scope",
    "SAR Example Quality": "example_scope",
    "Thesis Route Clarity": "route_gap",
    "Cause Route Clarity": "route_gap",
    "Solution Route Clarity": "route_gap",
    "Body Route Alignment": "route_gap",
    "Prompt Coverage": "task_coverage",
    "Overview Quality": "overview_error",
    "Overview Accuracy": "overview_error",
    "Data Accuracy": "data_error",
    "Comparison Precision": "comparison_error",
    "Process Sequence": "process_sequence",
    "Process Endpoint": "process_sequence",
    "Map Change Accuracy": "map_change"
  }[explicit];
  if (explicitType) return explicitType;
  const text = normalizeForComparison([
    issueCategory,
    card.issueCategory,
    card.issueType,
    card.issueSubtype,
    card.diagnosis,
    card.kruPomDiagnosis,
    card.whyItLimitsBand,
    card.studentAction
  ].filter(Boolean).join(" "));
  const rules = [
    [/punctuation|spacing after|spacing before|full stop|period|comma/, "punctuation_spacing"],
    [/fragment|sentence completion|unfinished sentence|incomplete sentence/, "sentence_fragment"],
    [/countab|uncountable/, "countability"],
    [/\barticle\b|\ba\/an\b/, "article"],
    [/word form|derivation/, "word_form"],
    [/collocat/, "collocation"],
    [/reference|pronoun|referent/, "reference"],
    [/\btense\b|progressive|continuous/, "tense"],
    [/subject verb agreement|\bagreement\b/, "agreement"],
    [/preposition/, "preposition"],
    [/lexical|word choice|meaning|vocabulary|imprecise noun|wrong word/, "lexical_meaning"],
    [/grammar|grammatical|sentence control/, "grammar"],
    [/causal mechanism|causal chain|solution mechanism|mechanism gap/, "causal_gap"],
    [/example|sar|scope|affected group/, "example_scope"],
    [/body route|route gap|route alignment|thesis route/, "route_gap"],
    [/prompt coverage|task coverage|missing question/, "task_coverage"],
    [/data accuracy|wrong figure|wrong unit|fabricated data/, "data_error"],
    [/overview/, "overview_error"],
    [/comparison/, "comparison_error"],
    [/process sequence|process endpoint/, "process_sequence"],
    [/map change/, "map_change"]
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] || "";
}

export function buildEvidenceAssertion({
  card = {},
  issueCategory = "",
  evidence = "",
  writing = "",
  sentenceRole = "unknown",
  taskType = "Task 2",
  visualType = "",
  hasVisualEvidence = false
} = {}) {
  const exactEvidence = String(evidence || "").trim();
  const sourceLocation = locateEvidenceSpan(writing, exactEvidence);
  let assertionType = inferEvidenceAssertionType(card, issueCategory);
  const diagnosisCorpus = normalizeForComparison([
    issueCategory,
    card.issueType,
    card.diagnosis,
    card.kruPomDiagnosis,
    card.whyItLimitsBand
  ].filter(Boolean).join(" "));
  if (String(taskType) === "Task 1") {
    if (sentenceRole === "map_change" && /\b(?:map|change|purpose|replace|convert|demolish|construct|build)\b/.test(diagnosisCorpus)) assertionType = "map_change";
    else if (["process_stage", "process_endpoint"].includes(sentenceRole) && /\b(?:process|stage|sequence|endpoint|input|output)\b/.test(diagnosisCorpus)) assertionType = "process_sequence";
    else if (sentenceRole === "overview" && /\boverview\b/.test(diagnosisCorpus)) assertionType = "overview_error";
    else if (sentenceRole === "comparison" && /\bcompar/.test(diagnosisCorpus)) assertionType = "comparison_error";
    else if (["introduction_paraphrase", "introduction_background"].includes(sentenceRole) && /\b(?:visual|chart|graph|table|map|diagram|process)\b/.test(diagnosisCorpus)) {
      const expectedVisual = visualNounForType(visualType);
      const reportedVisual = exactEvidence.match(/\b(?:line graph|bar chart|pie chart|table|map|plan|diagram|process|cycle|mixed graph|combination graph)\b/i)?.[0]?.toLowerCase() || "";
      if (expectedVisual && reportedVisual && !visualNounsCompatible(expectedVisual, reportedVisual)) assertionType = "visual_type_mismatch";
    }
  }
  const revision = String(card.targetedRevision || "").trim();
  let diff = minimalTextDiff(exactEvidence, revision);
  // Provider evidence may name the exact faulty span. When that span is truly present and the
  // revision preserves the text before and after it, prefer the explicit semantic boundary over a
  // character diff. This is essential for insertions such as
  // "lower prices than small vendors" -> "lower prices than those charged by small vendors":
  // a raw common-prefix diff otherwise produces the meaningless target "small".
  const explicitTarget = String(card.exactProblemSpan || card.targetSpan || "").trim();
  const explicitStart = explicitTarget ? exactEvidence.indexOf(explicitTarget) : -1;
  if (explicitStart >= 0) {
    const before = exactEvidence.slice(0, explicitStart);
    const after = exactEvidence.slice(explicitStart + explicitTarget.length);
    if (revision.startsWith(before) && revision.endsWith(after) && revision.length >= before.length + after.length) {
      const revisedEnd = revision.length - after.length;
      const explicitCorrection = revision.slice(before.length, revisedEnd).trim();
      if (explicitCorrection && explicitCorrection !== explicitTarget) {
        diff = {
          changed: true,
          originalStart: explicitStart,
          originalEnd: explicitStart + explicitTarget.length,
          revisedStart: before.length,
          revisedEnd,
          originalSpan: explicitTarget,
          revisedSpan: explicitCorrection
        };
      }
    }
  }
  const base = {
    assertionType,
    sourceOffsetStart: sourceLocation.start,
    sourceOffsetEnd: sourceLocation.end,
    offsetBasis: sourceLocation.offsetBasis,
    exactEvidence,
    targetSpan: diff.originalSpan,
    targetOffsetStart: diff.originalStart >= 0 && sourceLocation.start >= 0 ? sourceLocation.start + diff.originalStart : -1,
    targetOffsetEnd: diff.originalEnd >= 0 && sourceLocation.start >= 0 ? sourceLocation.start + diff.originalEnd : -1,
    surroundingText: sourceLocation.surroundingText,
    expectedCorrection: diff.revisedSpan,
    correctedSpan: diff.revisedSpan,
    proof: "",
    demonstrated: false,
    rejectionCode: "",
    rejectionReason: ""
  };

  if (!sourceLocation.found) {
    return reject(base, "EVIDENCE_NOT_IN_WRITING", "The quoted evidence does not exist in the submitted writing.");
  }

  if (assertionType === "punctuation_spacing" || issueCategory === "Punctuation") {
    const punctuation = detectPunctuationSpacingDefects(exactEvidence, sourceLocation.start);
    if (!punctuation.length) {
      return reject(base, "PUNCTUATION_ASSERTION_UNPROVEN", "The exact evidence contains no demonstrable punctuation-spacing defect.");
    }
    const selected = selectPunctuationDefect(punctuation, revision);
    return {
      ...base,
      assertionType: "punctuation_spacing",
      targetSpan: selected.targetSpan,
      targetOffsetStart: selected.sourceOffsetStart,
      targetOffsetEnd: selected.sourceOffsetEnd,
      punctuationCharacter: selected.punctuationCharacter,
      surroundingText: selected.surroundingText,
      expectedCorrection: selected.expectedCorrection,
      correctedSpan: selected.correctedSpan,
      proof: selected.proof,
      demonstrated: true
    };
  }

  if (assertionType === "countability" || issueCategory === "Countability") {
    const defects = detectCountabilityDefects(exactEvidence, sourceLocation.start);
    if (!defects.length) {
      return reject(base, "COUNTABILITY_ASSERTION_UNPROVEN", "The exact evidence contains no controlled countability pattern that proves this diagnosis.");
    }
    const selected = defects[0];
    return { ...base, ...selected, assertionType: "countability", demonstrated: true };
  }

  if (assertionType === "article" || issueCategory === "Article Control") {
    const defects = detectArticleDefects(exactEvidence, sourceLocation.start);
    const revisionDefect = detectArticleCorrectionFromRevision(exactEvidence, revision, sourceLocation.start);
    if (!defects.length && !revisionDefect) {
      return reject(base, "ARTICLE_ASSERTION_UNPROVEN", "The exact evidence contains no controlled article defect that proves this diagnosis.");
    }
    const selected = defects[0] || revisionDefect;
    return { ...base, ...selected, assertionType: selected.assertionType, demonstrated: true };
  }

  if (assertionType === "sentence_fragment" || issueCategory === "Sentence Completion") {
    const fragment = detectSentenceFragment(exactEvidence);
    if (!fragment.demonstrated) return reject(base, "FRAGMENT_ASSERTION_UNPROVEN", fragment.reason);
    return {
      ...base,
      assertionType: "sentence_fragment",
      targetSpan: exactEvidence,
      targetOffsetStart: sourceLocation.start,
      targetOffsetEnd: sourceLocation.end,
      expectedCorrection: revision,
      correctedSpan: revision,
      proof: fragment.proof,
      demonstrated: true
    };
  }

  if (assertionType === "agreement" || ["Subject-Verb Agreement", "Subject–Verb Agreement", "Agreement"].includes(issueCategory)) {
    const defects = detectAgreementDefects(exactEvidence, sourceLocation.start);
    if (!defects.length) {
      return reject(base, "AGREEMENT_ASSERTION_UNPROVEN", "The exact evidence contains no controlled subject-verb agreement defect.");
    }
    const selected = defects.find((item) => revision.includes(item.correctedSpan)) || defects[0];
    return { ...base, ...selected, assertionType: "agreement", demonstrated: true };
  }

  if (assertionType === "tense") {
    const localTense = detectGeneralStatementProgressive(exactEvidence, sourceLocation.start, diagnosisCorpus);
    if (localTense) {
      return { ...base, ...localTense, assertionType: "tense", demonstrated: true, localCorrectionProven: true };
    }
  }

  if (isTaskOrVisualAssertion(assertionType, issueCategory)) {
    const roleSupported = taskAssertionSupported({
      assertionType,
      issueCategory,
      sentenceRole,
      taskType,
      visualType,
      exactEvidence
    });
    if (!roleSupported || (String(taskType) === "Task 1" && ["data_error", "overview_error", "comparison_error", "process_sequence", "map_change", "visual_type_mismatch"].includes(assertionType) && !hasVisualEvidence)) {
      return reject(base, "TASK_ASSERTION_UNPROVEN", "The issue is not supported by the validated task/visual context and sentence role.");
    }
    return {
      ...base,
      targetSpan: exactEvidence,
      targetOffsetStart: sourceLocation.start,
      targetOffsetEnd: sourceLocation.end,
      proof: `The exact evidence is a validated ${sentenceRole} span for ${taskType}.`,
      demonstrated: true
    };
  }

  // Language assertions that cannot be proven by punctuation/article/countability rules must at
  // least identify a real changed source span and a non-empty correction. This blocks cards whose
  // diagnosis and displayed repair are unrelated while allowing the semantic validator to perform
  // the stronger meaning/frame check later.
  if (!diff.changed || !diff.originalSpan || !diff.revisedSpan) {
    return reject(base, "LANGUAGE_ASSERTION_UNPROVEN", "The proposed revision does not identify a changed source span that demonstrates the language diagnosis.");
  }
  return {
    ...base,
    assertionType: assertionType || "grammar",
    proof: `The source span "${diff.originalSpan}" is changed to "${diff.revisedSpan}" in the targeted revision.`,
    demonstrated: true
  };
}

export function detectPunctuationSpacingDefects(evidence = "", absoluteStart = 0) {
  const text = String(evidence || "");
  const defects = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1] || "";
    const previous = text[index - 1] || "";
    if (/[.!?]/.test(char) && /[\p{L}]/u.test(next) && !isInternalAbbreviationPoint(text, index)) {
      const targetSpan = `${char}${next}`;
      defects.push({
        assertionType: "punctuation_spacing",
        targetSpan,
        sourceOffsetStart: absoluteStart + index,
        sourceOffsetEnd: absoluteStart + index + 2,
        punctuationCharacter: char,
        surroundingText: contextWindow(text, index, index + 2),
        expectedCorrection: `${char} ${next}`,
        correctedSpan: `${char} ${next}`,
        proof: `A ${punctuationName(char)} at source offset ${absoluteStart + index} is immediately followed by a letter with no space.`
      });
    }
    if (/\s/u.test(previous) && /[,.;:!?]/.test(char)) {
      defects.push({
        assertionType: "punctuation_spacing",
        targetSpan: `${previous}${char}`,
        sourceOffsetStart: absoluteStart + index - 1,
        sourceOffsetEnd: absoluteStart + index + 1,
        punctuationCharacter: char,
        surroundingText: contextWindow(text, index - 1, index + 1),
        expectedCorrection: char,
        correctedSpan: char,
        proof: `There is an unnecessary space before ${punctuationName(char)} at source offset ${absoluteStart + index}.`
      });
    }
  }
  return uniqueAssertions(defects);
}

export function detectCountabilityDefects(evidence = "", absoluteStart = 0) {
  const text = String(evidence || "");
  const defects = [];
  const uncountable = UNCOUNTABLE_PATTERNS
    .slice()
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join("|");
  const pattern = new RegExp(`\\b(a|an)\\s+((?:[a-z-]+\\s+){0,2}(?:${uncountable}))\\b`, "giu");
  for (const match of text.matchAll(pattern)) {
    const matchEnd = (match.index ?? 0) + match[0].length;
    const followingWord = text.slice(matchEnd).match(/^\s+([a-z-]+)/iu)?.[1]?.toLowerCase() || "";
    if (followingWord && ![
      "of", "for", "in", "on", "at", "to", "with", "from", "by", "and", "or",
      "that", "which", "who", "when", "where", "because", "while", "if", "as"
    ].includes(followingWord)) continue;
    const article = match[1];
    const nounPhrase = match[2];
    const targetSpan = match[0];
    const relativeStart = match.index ?? -1;
    defects.push({
      targetSpan,
      targetOffsetStart: absoluteStart + relativeStart,
      targetOffsetEnd: absoluteStart + relativeStart + targetSpan.length,
      surroundingText: contextWindow(text, relativeStart, relativeStart + targetSpan.length),
      expectedCorrection: nounPhrase,
      correctedSpan: nounPhrase,
      proof: `"${nounPhrase}" is used as an uncountable noun phrase in this meaning, so the singular article "${article}" is unsupported.`
    });
  }
  return defects;
}

export function detectArticleDefects(evidence = "", absoluteStart = 0) {
  const countability = detectCountabilityDefects(evidence, absoluteStart);
  if (countability.length) return countability.map((item) => ({ ...item, assertionType: "countability" }));
  const text = String(evidence || "");
  const defects = [];
  for (const match of text.matchAll(/\b(a)\s+([aeiou][a-z-]*)\b/giu)) {
    if (match[1] === "A" && /^(?:and|or|versus|vs)$/i.test(match[2])) continue;
    if (/^(?:uni(?:vers|form|que)|use|user|usual|euro|one)/i.test(match[2])) continue;
    const relativeStart = match.index ?? -1;
    const replacement = `an ${match[2]}`;
    defects.push({
      assertionType: "article",
      targetSpan: match[0],
      targetOffsetStart: absoluteStart + relativeStart,
      targetOffsetEnd: absoluteStart + relativeStart + match[0].length,
      surroundingText: contextWindow(text, relativeStart, relativeStart + match[0].length),
      expectedCorrection: replacement,
      correctedSpan: replacement,
      proof: `The article "a" precedes a written vowel sound in "${match[0]}".`
    });
  }
  for (const match of text.matchAll(/\b(an)\s+([bcdfgjklmnpqrstvwxyz][a-z-]*)\b/giu)) {
    if (/^(?:honest|honour|honor|hour|heir)/i.test(match[2])) continue;
    const relativeStart = match.index ?? -1;
    const replacement = `a ${match[2]}`;
    defects.push({
      assertionType: "article",
      targetSpan: match[0],
      targetOffsetStart: absoluteStart + relativeStart,
      targetOffsetEnd: absoluteStart + relativeStart + match[0].length,
      surroundingText: contextWindow(text, relativeStart, relativeStart + match[0].length),
      expectedCorrection: replacement,
      correctedSpan: replacement,
      proof: `The article "an" precedes a written consonant sound in "${match[0]}".`
    });
  }
  const determiners = ARTICLE_DETERMINERS.map(escapeRegExp).join("|");
  const modifiers = ARTICLE_MODIFIERS.map(escapeRegExp).join("|");
  const heads = ARTICLE_COUNT_HEADS.map(escapeRegExp).join("|");
  const modifierToken = `(?:${modifiers}|[a-z][a-z-]*(?:ing|ed))`;
  const missingDeterminer = new RegExp(
    `\\b(?:(${determiners})\\s+)?((?:${modifierToken}\\s+){1,3}(?:${heads}))\\b`,
    "giu"
  );
  for (const match of text.matchAll(missingDeterminer)) {
    if (match[1]) continue;
    const nounPhrase = match[2];
    const relativeStart = match.index ?? -1;
    const precedingText = text.slice(0, relativeStart);
    if (/\b(?:a|an|the|this|that|each|every|one|another|my|your|his|her|its|our|their)\s+(?:[a-z][a-z-]*\s+){0,3}$/iu.test(precedingText)) continue;
    const article = /^(?:economic|educational|effective|environmental|immediate|old)\b/i.test(nounPhrase)
      ? "an"
      : "a";
    const replacement = `${article} ${nounPhrase}`;
    defects.push({
      assertionType: "article",
      targetSpan: nounPhrase,
      targetOffsetStart: absoluteStart + relativeStart,
      targetOffsetEnd: absoluteStart + relativeStart + nounPhrase.length,
      surroundingText: contextWindow(text, relativeStart, relativeStart + nounPhrase.length),
      expectedCorrection: replacement,
      correctedSpan: replacement,
      proof: `The singular count noun phrase "${nounPhrase}" has no determiner.`
    });
  }
  return defects;
}

export function repairDeterministicEvidenceDefects(evidence = "") {
  const text = String(evidence || "");
  const punctuation = detectPunctuationSpacingDefects(text, 0).map((defect) => ({
    ...defect,
    targetOffsetStart: defect.sourceOffsetStart,
    targetOffsetEnd: defect.sourceOffsetEnd
  }));
  const defects = [
    ...punctuation,
    ...detectCountabilityDefects(text, 0),
    ...detectArticleDefects(text, 0).filter((item) => item.assertionType !== "countability"),
    ...detectAgreementDefects(text, 0)
  ]
    .map((defect) => ({
      start: Number(defect.targetOffsetStart),
      end: Number(defect.targetOffsetEnd),
      replacement: String(defect.correctedSpan || "")
    }))
    .filter((operation) =>
      Number.isInteger(operation.start) &&
      Number.isInteger(operation.end) &&
      operation.start >= 0 &&
      operation.end >= operation.start &&
      operation.end <= text.length
    )
    .sort((left, right) => right.start - left.start || right.end - left.end);
  let corrected = text;
  let protectedStart = text.length + 1;
  for (const operation of defects) {
    if (operation.end > protectedStart) continue;
    corrected = `${corrected.slice(0, operation.start)}${operation.replacement}${corrected.slice(operation.end)}`;
    protectedStart = operation.start;
  }
  return corrected;
}

export function detectAgreementDefects(evidence = "", absoluteStart = 0) {
  return detectSyntacticHeadAgreementDefects(evidence, absoluteStart)
    .map((item) => ({
      ...item,
      surroundingText: contextWindow(
        String(evidence || ""),
        item.targetOffsetStart - absoluteStart,
        item.targetOffsetEnd - absoluteStart
      ),
      validatorVersion: AGREEMENT_VALIDATOR_VERSION
    }));
}


export function locateEvidenceSpan(writing = "", evidence = "") {
  const source = String(writing || "");
  const target = String(evidence || "");
  let start = source.indexOf(target);
  let offsetBasis = "raw-writing";
  let comparableSource = source;
  let comparableTarget = target;
  if (start < 0) {
    comparableSource = normalizeVisibleText(source);
    comparableTarget = normalizeVisibleText(target);
    start = comparableSource.indexOf(comparableTarget);
    offsetBasis = "normalized-visible-writing";
  }
  const end = start >= 0 ? start + comparableTarget.length : -1;
  return {
    found: start >= 0 && Boolean(comparableTarget),
    start,
    end,
    offsetBasis,
    surroundingText: start >= 0 ? contextWindow(comparableSource, start, end) : ""
  };
}

export function minimalTextDiff(original = "", revision = "") {
  const left = String(original || "");
  const right = String(revision || "");
  if (!left || !right || left === right) {
    return { changed: false, originalStart: -1, originalEnd: -1, revisedStart: -1, revisedEnd: -1, originalSpan: "", revisedSpan: "" };
  }
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let leftSuffix = left.length;
  let rightSuffix = right.length;
  while (leftSuffix > prefix && rightSuffix > prefix && left[leftSuffix - 1] === right[rightSuffix - 1]) {
    leftSuffix -= 1;
    rightSuffix -= 1;
  }
  let originalStart = prefix;
  let originalEnd = leftSuffix;
  let revisedStart = prefix;
  let revisedEnd = rightSuffix;
  // Character-level common prefixes/suffixes can stop inside a word ("privileges" ->
  // "personal advantages" used to become the nonsensical span "rivilege" -> "ersonal advantage").
  // Student actions and PDF target spans must always expose complete tokens, so widen each side to
  // its own word boundaries before extracting the visible diff.
  const tokenChar = /[\p{L}\p{N}'’-]/u;
  if (originalStart > 0 && tokenChar.test(left[originalStart - 1] || "") && tokenChar.test(left[originalStart] || "")) {
    while (originalStart > 0 && tokenChar.test(left[originalStart - 1])) originalStart -= 1;
  }
  if (revisedStart > 0 && tokenChar.test(right[revisedStart - 1] || "") && tokenChar.test(right[revisedStart] || "")) {
    while (revisedStart > 0 && tokenChar.test(right[revisedStart - 1])) revisedStart -= 1;
  }
  while (originalEnd < left.length && tokenChar.test(left[originalEnd] || "")) originalEnd += 1;
  while (revisedEnd < right.length && tokenChar.test(right[revisedEnd] || "")) revisedEnd += 1;
  let originalSpan = left.slice(originalStart, originalEnd).trim();
  let revisedSpan = right.slice(revisedStart, revisedEnd).trim();
  if (!originalSpan || !revisedSpan) {
    const preceding = left.slice(0, prefix).match(/[\p{L}\p{N}'-]+$/u);
    if (preceding) {
      originalStart = prefix - preceding[0].length;
      revisedStart = originalStart;
      originalSpan = left.slice(originalStart, originalEnd).trim();
      revisedSpan = right.slice(revisedStart, revisedEnd).trim();
    } else {
      const following = left.slice(leftSuffix).match(/^[^\p{L}\p{N}]*(?:[\p{L}\p{N}'-]+)/u)?.[0] || "";
      if (following) {
        originalEnd = leftSuffix + following.length;
        revisedEnd = rightSuffix + following.length;
        originalSpan = left.slice(originalStart, originalEnd).trim();
        revisedSpan = right.slice(revisedStart, revisedEnd).trim();
      }
    }
  }
  return {
    changed: true,
    originalStart,
    originalEnd,
    revisedStart,
    revisedEnd,
    originalSpan,
    revisedSpan
  };
}

export function categoryForAssertion(assertionType = "") {
  return ASSERTION_CATEGORY[String(assertionType || "")] || "";
}

function selectPunctuationDefect(defects, revision) {
  const revised = String(revision || "");
  return defects.find((defect) => revised.includes(defect.correctedSpan)) || defects[0];
}

function detectSentenceFragment(text) {
  const value = String(text || "").trim();
  if (!value) return { demonstrated: false, reason: "The evidence is empty." };
  const validation = validateSentenceCompleteness(value);
  if (!validation.complete) {
    return {
      demonstrated: true,
      proof: `The evidence has no complete independent main clause (${validation.reasons.join(", ")}).`,
      validatorVersion: validation.validatorVersion
    };
  }
  return {
    demonstrated: false,
    reason: "The exact evidence forms a complete independent sentence.",
    validatorVersion: validation.validatorVersion
  };
}

function isTaskOrVisualAssertion(assertionType, category) {
  return [
    "causal_gap", "example_scope", "route_gap", "task_coverage", "data_error",
    "overview_error", "comparison_error", "process_sequence", "map_change", "visual_type_mismatch"
  ].includes(assertionType) || /Route|Coverage|Overview|Data|Comparison|Process|Map|Mechanism|Example|SAR/.test(String(category || ""));
}

function taskAssertionSupported({ assertionType, issueCategory, sentenceRole, taskType, visualType, exactEvidence }) {
  const role = String(sentenceRole || "");
  if (String(taskType) === "Task 1") {
    if (["introduction_paraphrase", "introduction_background"].includes(role) &&
      (assertionType === "visual_type_mismatch" || /Visual Understanding|Introduction Precision/.test(String(issueCategory || "")))) {
      const expected = visualNounForType(visualType);
      const reported = String(exactEvidence || "").match(/\b(?:line graph|bar chart|pie chart|table|map|plan|diagram|process|cycle|mixed graph|combination graph)\b/i)?.[0]?.toLowerCase() || "";
      return Boolean(expected && reported && !visualNounsCompatible(expected, reported));
    }
    if (assertionType === "overview_error") return role === "overview";
    if (assertionType === "comparison_error") return ["comparison", "data_sentence", "dominant_feature"].includes(role);
    if (assertionType === "process_sequence") return ["process_stage", "process_endpoint"].includes(role);
    if (assertionType === "map_change") return role === "map_change";
    if (assertionType === "data_error") return ["data_sentence", "comparison", "dominant_feature"].includes(role);
    return true;
  }
  if (assertionType === "causal_gap") return ["body_topic_sentence", "explanation", "causal_mechanism", "example", "solution_route"].includes(role);
  if (assertionType === "example_scope") return role === "example";
  if (assertionType === "route_gap") return ["position", "thesis_route", "cause_route", "solution_route", "view_route", "body_topic_sentence"].includes(role);
  if (assertionType === "task_coverage") return ["position", "thesis_route", "cause_route", "solution_route", "view_route", "answer_to_question_1", "answer_to_question_2"].includes(role);
  return true;
}

function detectGeneralStatementProgressive(evidence, absoluteStart, diagnosisCorpus = "") {
  if (!/\b(?:general statement|progressive tense|simple present|present simple)\b/i.test(String(diagnosisCorpus || ""))) return null;
  const text = String(evidence || "");
  const match = /\b(?<subject>(?:every|each)\s+[\p{L}'-]+)\s+(?<aux>is)\s+(?<verb>[\p{L}'-]+ing)\b/iu.exec(text);
  if (!match?.groups) return null;
  const base = gerundToBaseVerb(match.groups.verb);
  if (!base) return null;
  const correctedVerb = thirdPersonSingular(base);
  const targetSpan = `${match.groups.aux} ${match.groups.verb}`;
  const localIndex = match.index + match[0].lastIndexOf(targetSpan);
  return {
    targetSpan,
    sourceOffsetStart: absoluteStart + localIndex,
    sourceOffsetEnd: absoluteStart + localIndex + targetSpan.length,
    surroundingText: contextWindow(text, localIndex, localIndex + targetSpan.length),
    expectedCorrection: correctedVerb,
    correctedSpan: correctedVerb,
    proof: `The general-statement subject "${match.groups.subject}" uses a progressive verb; the local simple-present correction is "${correctedVerb}".`
  };
}

function gerundToBaseVerb(value) {
  const verb = String(value || "").toLowerCase();
  if (!verb.endsWith("ing") || verb.length < 5) return "";
  const stem = verb.slice(0, -3);
  if (/v$/.test(stem)) return `${stem}e`;
  if (/(.)\1$/.test(stem) && !/(?:ss|ll)$/.test(stem)) return stem.slice(0, -1);
  return stem;
}

function thirdPersonSingular(value) {
  const verb = String(value || "").toLowerCase();
  if (!verb) return "";
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ies`;
  if (/(?:s|sh|ch|x|z|o)$/.test(verb)) return `${verb}es`;
  return `${verb}s`;
}

function detectArticleCorrectionFromRevision(evidence, revision, absoluteStart) {
  const diff = minimalTextDiff(evidence, revision);
  if (!diff.changed || !diff.originalSpan || !diff.revisedSpan) return null;
  const original = normalizeForComparison(diff.originalSpan);
  const revised = normalizeForComparison(diff.revisedSpan);
  const revisedWithoutArticle = revised.replace(/\b(?:a|an|the)\b/g, "").replace(/\s+/g, " ").trim();
  const originalWithoutArticle = original.replace(/\b(?:a|an|the)\b/g, "").replace(/\s+/g, " ").trim();
  if (original === revised || (revisedWithoutArticle !== original && originalWithoutArticle !== revised)) return null;
  return {
    assertionType: "article",
    targetSpan: diff.originalSpan,
    targetOffsetStart: absoluteStart + diff.originalStart,
    targetOffsetEnd: absoluteStart + diff.originalEnd,
    surroundingText: contextWindow(evidence, diff.originalStart, diff.originalEnd),
    expectedCorrection: diff.revisedSpan,
    correctedSpan: diff.revisedSpan,
    proof: `The targeted revision demonstrates a local article-only correction from "${diff.originalSpan}" to "${diff.revisedSpan}".`
  };
}

function visualNounForType(value) {
  const text = String(value || "").toLowerCase();
  if (/line/.test(text)) return "line graph";
  if (/bar/.test(text)) return "bar chart";
  if (/pie/.test(text)) return "pie chart";
  if (/table/.test(text)) return "table";
  if (/map/.test(text)) return "map";
  if (/plan/.test(text)) return "plan";
  if (/process|cycle/.test(text)) return /cycle/.test(text) ? "cycle" : "process";
  if (/mixed|combination|multiple/.test(text)) return "mixed graph";
  if (/diagram|structure|mechanism/.test(text)) return "diagram";
  return "";
}

function visualNounsCompatible(expected, reported) {
  if (expected === reported) return true;
  if (expected === "mixed graph") return /graph|chart|table/.test(reported);
  if (expected === "diagram") return /diagram|process/.test(reported);
  if (expected === "process") return /process|diagram/.test(reported);
  if (expected === "cycle") return /cycle|process|diagram/.test(reported);
  return false;
}

function reject(base, rejectionCode, rejectionReason) {
  return { ...base, demonstrated: false, rejectionCode, rejectionReason };
}

function isInternalAbbreviationPoint(text, index) {
  const before = text.slice(Math.max(0, index - 3), index + 2);
  return /(?:^|[^A-Za-z])[A-Za-z]\.[A-Za-z]$/u.test(before);
}

function punctuationName(char) {
  return ({ ".": "full stop", ",": "comma", ";": "semicolon", ":": "colon", "!": "exclamation mark", "?": "question mark" })[char] || "punctuation mark";
}

function contextWindow(text, start, end, radius = 28) {
  return String(text || "").slice(Math.max(0, start - radius), Math.min(String(text || "").length, end + radius));
}

function uniqueAssertions(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.sourceOffsetStart}|${item.sourceOffsetEnd}|${item.expectedCorrection}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeForComparison(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, " ").trim();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
import {
  AGREEMENT_VALIDATOR_VERSION,
  detectSyntacticHeadAgreementDefects
} from "./agreementValidator.js";
