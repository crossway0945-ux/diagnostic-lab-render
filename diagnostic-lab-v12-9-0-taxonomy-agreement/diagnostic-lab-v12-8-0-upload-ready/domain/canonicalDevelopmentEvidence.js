// Canonical development evidence (V12.9.1).
//
// The language profile answers "is the English accurate?". It cannot answer the questions IELTS
// Task Response and Coherence actually ask: was the comparative judgement DEMONSTRATED, was every
// route the thesis PROMISED actually developed, does each consequence name who it affects and how,
// and does local reference stay traceable.
//
// This module derives those answers from canonical objects (segmented paragraphs, prompt
// obligations, body routes) using structural tests only. No topic, no wording and no score is
// hard-coded: every finding carries the exact sentence it was derived from, so the caller can prove
// it. The output feeds three consumers — criterion scoring, canonical issue promotion and the
// cross-section consistency gate.

export const DEVELOPMENT_EVIDENCE_VERSION = "canonical-development-evidence-v12.9.1";

// A judgement is ASSERTED by these operators.
const JUDGEMENT_ASSERTION = /\b(?:outweighs?|outweighed|far\s+(?:more|greater|outweigh)|more\s+(?:important|significant|beneficial|harmful|serious)\b|greater\s+than|exceeds?\b|prevail\w*|dominates?)\b/i;
// A judgement is DEMONSTRATED only by an explicit comparison operator inside a body paragraph.
const COMPARISON_OPERATOR = /\b(?:outweighs?|more\s+\w+\s+than|less\s+\w+\s+than|greater\s+than|smaller\s+than|compared\s+(?:with|to)\b|in\s+contrast\b|by\s+contrast\b|whereas\b|exceeds?\b|offsets?\b|counterbalances?\b|far\s+more\b|far\s+less\b|only\s+marginal\w*|outstrips?\b)\b/i;
// Causation, expressed by a connective or by a participial clause.
// Causation, expressed by a connective, a participial clause, or a causative verb. A causative verb
// ("help children become", "trains students to manage") states the mechanism directly, so a sentence
// that uses one is not missing its mechanism.
const CAUSAL_LINK = /\b(?:because|since|as\s+a\s+result\s+of|due\s+to|thereby|through|when|if|whenever|therefore|thus|hence|consequently|so\s+that|which\s+(?:means|causes|leads|forces))\b|\b(?:leading|leaving|forcing|causing|making|creating|pushing|driving|preventing|allowing|enabling|resulting)\b|\b(?:leads?|results?)\s+(?:to|in)\b|\b(?:helps?|enables?|allows?|trains?|teach(?:es)?|encourages?|ensures?|prepares?|equips?)\b/i;
// A group of people or organisations affected by the claim.
const AFFECTED_GROUP = /\b(?:people|persons?|population|residents?|consumers?|customers?|shoppers?|families|households?|communities|community|citizens?|workers?|employees?|employers?|students?|parents?|children|elderly|pensioners?|commuters?|passengers?|drivers?|businesses|business|shops?|retailers?|firms?|companies|farmers?|groups?|neighbourhoods?|neighborhoods?|districts?|villages?|towns?|cities)\b/i;
// A state or outcome predicated of that group.
const STATE_PREDICATE = /\b(?:are|is|were|was|become[sd]?|remain[s]?|stay[s]?|end\s+up|face[sd]?|suffer[s]?|lose[s]?|lost|left|forced|pushed|excluded|isolated|deprived|unable|struggle[sd]?)\b/i;
// A bare demonstrative subject followed straight by an inflected verb ("This leads to …").
const BARE_DEMONSTRATIVE_SUBJECT = /^(?:\s*(?:however|therefore|moreover|thus|consequently|furthermore|in addition|as a result|finally|overall)\s*,?\s*)?(this|these|that|it)\s+(?:also\s+|often\s+|then\s+|clearly\s+|simply\s+)?([a-z]+(?:s|ed))\b/i;
const FINITE_VERB_HINT = /\b(?:is|are|was|were|has|have|had|can|could|will|would|should|must|may|might|do|does|did|provides?|offers?|creates?|causes?|leads?|makes?|takes?|gives?|reduces?|increases?|forces?|inflicts?|contains?|finds?|eliminates?|divert\w*|abandon\w*|prevent\w*)\b/gi;

const GENERIC_PROMISE_WORDS = new Set([
  "advantage", "advantages", "disadvantage", "disadvantages", "benefit", "benefits", "drawback",
  "drawbacks", "problem", "problems", "solution", "solutions", "reason", "reasons", "cause",
  "causes", "effect", "effects", "view", "views", "opinion", "issue", "issues", "factor", "factors",
  "people", "society", "government", "world", "country", "countries", "development", "trend"
]);

const DISCOURSE_MARKERS = new Set([
  "however", "therefore", "moreover", "furthermore", "consequently", "nevertheless", "nonetheless",
  "additionally", "meanwhile", "similarly", "conversely", "overall", "finally", "firstly", "secondly",
  "thirdly", "personally", "generally", "obviously", "clearly", "indeed", "besides", "instead",
  "although", "whereas", "despite", "regarding", "concerning", "arguably", "admittedly"
]);

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "by", "from",
  "is", "are", "was", "were", "be", "been", "being", "it", "its", "this", "that", "these", "those",
  "their", "they", "them", "we", "our", "you", "i", "as", "into", "over", "under", "more", "most",
  "very", "much", "many", "some", "any", "such", "than", "then", "also", "not", "no", "which",
  "while", "when", "where", "who", "whom", "will", "would", "can", "could", "should", "may", "might"
]);

function words(text = "") {
  return String(text).toLowerCase().match(/[a-z]+(?:['’-][a-z]+)*/g) || [];
}

// Length-6 prefix stem: enough to bind "economic"/"economically" and to separate
// "environmental" from "economic" without a morphology table.
function stem(word = "") {
  return String(word).toLowerCase().slice(0, 6);
}

function contentStems(text = "", minLength = 6) {
  return new Set(words(text).filter((word) => word.length >= minLength && !STOP_WORDS.has(word)).map(stem));
}

function countFiniteVerbs(sentence = "") {
  return (String(sentence).match(FINITE_VERB_HINT) || []).length;
}

function bodyParagraphsOf(paragraphs = []) {
  return paragraphs.filter((paragraph) => /^Body Paragraph/i.test(String(paragraph.role || "")));
}

function paragraphOf(paragraphs = [], pattern) {
  return paragraphs.find((paragraph) => pattern.test(String(paragraph.role || "")));
}

function sentenceRecord(paragraph, sentence) {
  return {
    paragraphLabel: paragraph.role,
    paragraphId: paragraph.paragraphId,
    paragraphIndex: (paragraph.paragraphNumber || 1) - 1,
    sentenceIndex: sentence.sentenceNumber,
    exactSentence: sentence.exactText,
    paragraphLocation: sentence.location || `${paragraph.role}, Sentence ${sentence.sentenceNumber}`
  };
}

// ---------------------------------------------------------------------------
// 1. Comparative judgement: asserted vs demonstrated.
// ---------------------------------------------------------------------------
// Which side the stated position favours, read from the position text rather than from any score.
function favouredSideOf(positionText = "") {
  const text = String(positionText).toLowerCase();
  if (/\bdisadvantages?\b[^.]{0,40}\boutweigh/.test(text) || /\bnegative\b/.test(text)) return "disadvantage";
  if (/\badvantages?\b[^.]{0,40}\boutweigh/.test(text) || /\bbenefits?\b[^.]{0,40}\boutweigh/.test(text) || /\bpositive\b/.test(text)) return "advantage";
  return "";
}

// An outweigh judgement is also demonstrated STRUCTURALLY when the essay develops the favoured side
// in more body paragraphs than the other side. Equal development plus no explicit in-body comparison
// is the case where the judgement is asserted but never shown.
function structurallyWeighted(bodyRoutes = [], favouredSide = "") {
  if (!favouredSide || !Array.isArray(bodyRoutes) || bodyRoutes.length < 2) return false;
  // "disadvantage" contains "advantage", so the negative side is always tested first.
  const sideOf = (route) => {
    const value = String(route?.route || route?.primaryRoute || route?.label || route || "").toLowerCase();
    if (/disadvantage|drawback|negative|problem/.test(value)) return "disadvantage";
    if (/advantage|benefit|positive/.test(value)) return "advantage";
    return "";
  };
  const sides = bodyRoutes.map(sideOf).filter(Boolean);
  if (sides.length < 2) return false;
  const favoured = sides.filter((side) => side === favouredSide).length;
  const other = sides.length - favoured;
  return favoured > other;
}

function assessComparativeJudgement({ paragraphs, taskRequirements, prompt, bodyRoutes, detectedPosition }) {
  const obligations = Array.isArray(taskRequirements?.promptObligations) ? taskRequirements.promptObligations : [];
  const bodies = bodyParagraphsOf(paragraphs);
  // The rule applies only to a genuinely TWO-SIDED comparative task. An opinion prompt also carries a
  // judgement obligation ("to what extent do you agree"), but it asks the writer to support one
  // position, not to weigh two named sides against each other — asserting a comparison there is not a
  // task requirement, so this rule must not touch it.
  const sides = new Set((Array.isArray(bodyRoutes) ? bodyRoutes : []).map((route) => {
    const value = String(route?.route || route?.primaryRoute || route?.label || route || "").toLowerCase();
    if (/disadvantage|drawback/.test(value)) return "disadvantage";
    if (/advantage|benefit/.test(value)) return "advantage";
    return "";
  }).filter(Boolean));
  const twoSided = (sides.has("advantage") && sides.has("disadvantage")) || /\boutweigh/i.test(String(prompt || ""));
  const required = twoSided && (
    obligations.some((item) => item?.judgementRequired === true) ||
    /\boutweigh/i.test(String(prompt || ""))
  );
  if (!required || bodies.length < 2) {
    return { required: false, asserted: false, demonstrated: true, assertionEvidence: "", demonstrationEvidence: "" };
  }
  const introduction = paragraphOf(paragraphs, /^Introduction$/i);
  const conclusion = paragraphOf(paragraphs, /^Conclusion$/i);
  const assertionSentence = [introduction, conclusion]
    .filter(Boolean)
    .flatMap((paragraph) => paragraph.sentences.map((sentence) => ({ paragraph, sentence })))
    .find((item) => JUDGEMENT_ASSERTION.test(item.sentence.exactText));

  // Two sides are distinguishable when each body paragraph owns content the other does not.
  const [first, second] = bodies;
  const firstStems = contentStems(first.exactText);
  const secondStems = contentStems(second.exactText);
  const firstOnly = new Set([...firstStems].filter((token) => !secondStems.has(token)));
  const secondOnly = new Set([...secondStems].filter((token) => !firstStems.has(token)));

  let demonstration = null;
  for (const paragraph of bodies) {
    for (const sentence of paragraph.sentences) {
      if (!COMPARISON_OPERATOR.test(sentence.exactText)) continue;
      const sentenceStems = contentStems(sentence.exactText);
      const touchesFirst = [...sentenceStems].some((token) => firstOnly.has(token));
      const touchesSecond = [...sentenceStems].some((token) => secondOnly.has(token));
      if (touchesFirst && touchesSecond) {
        demonstration = { paragraph, sentence };
        break;
      }
    }
    if (demonstration) break;
  }

  const favouredSide = favouredSideOf(detectedPosition);
  const weighted = structurallyWeighted(bodyRoutes, favouredSide);

  return {
    required: true,
    asserted: Boolean(assertionSentence),
    demonstrated: Boolean(demonstration) || weighted,
    demonstrationMode: demonstration ? "explicit-body-comparison" : weighted ? "structural-weighting" : "",
    favouredSide,
    structurallyWeighted: weighted,
    assertionEvidence: assertionSentence?.sentence.exactText || "",
    assertionRecord: assertionSentence ? sentenceRecord(assertionSentence.paragraph, assertionSentence.sentence) : null,
    demonstrationEvidence: demonstration?.sentence.exactText || ""
  };
}

// ---------------------------------------------------------------------------
// 2. Thesis promises: every route the thesis names must be developed in a body.
// ---------------------------------------------------------------------------
function extractThesisPromises(thesisSentence = "", promptText = "") {
  const promptStems = contentStems(promptText, 5);
  const segments = String(thesisSentence)
    .split(/[,;:]/)
    .flatMap((part) => part.split(/\s+and\s+/i))
    .map((part) => part.trim())
    .filter(Boolean);
  const promises = [];
  for (const segment of segments) {
    const tokens = words(segment);
    // A route promise is a noun phrase of at least two words. A single word — especially a discourse
    // connective such as "However" — is never a promise the body has to develop.
    if (tokens.length < 2 || tokens.length > 5) continue;
    if (DISCOURSE_MARKERS.has(tokens[0])) continue;
    // A promise is a bare noun phrase: no finite verb, no clause marker.
    if (countFiniteVerbs(segment) > 0) continue;
    if (/\b(?:believe|think|argue|agree|disagree|outweigh|offers?|provides?|shows?)\b/i.test(segment)) continue;
    const distinctive = tokens.filter((token) =>
      token.length >= 6 && !STOP_WORDS.has(token) && !GENERIC_PROMISE_WORDS.has(token) && !promptStems.has(stem(token))
    );
    if (!distinctive.length) continue;
    promises.push({ phrase: segment, distinctiveStems: [...new Set(distinctive.map(stem))] });
  }
  return promises;
}

function assessThesisPromiseCoverage({ paragraphs, prompt }) {
  const introduction = paragraphOf(paragraphs, /^Introduction$/i);
  const bodies = bodyParagraphsOf(paragraphs);
  if (!introduction || !bodies.length) return { promises: [], undeveloped: [] };
  const thesis = introduction.sentences.at(-1);
  if (!thesis) return { promises: [], undeveloped: [] };
  const bodyStems = new Set(bodies.flatMap((paragraph) => [...contentStems(paragraph.exactText)]));
  const promises = extractThesisPromises(thesis.exactText, prompt).map((promise) => ({
    ...promise,
    developed: promise.distinctiveStems.some((token) => bodyStems.has(token))
  }));
  return {
    promises,
    undeveloped: promises.filter((promise) => !promise.developed),
    thesisRecord: sentenceRecord(introduction, thesis)
  };
}

// ---------------------------------------------------------------------------
// 3. Affected group introduced without a mechanism connecting it to the paragraph.
// ---------------------------------------------------------------------------
function assessAffectedGroupMechanism({ paragraphs }) {
  const findings = [];
  for (const paragraph of bodyParagraphsOf(paragraphs)) {
    const sentences = paragraph.sentences || [];
    if (sentences.length < 3) continue;
    const seenGroups = new Set(words(sentences[0].exactText).filter((word) => AFFECTED_GROUP.test(word)));
    for (let index = 1; index < sentences.length; index += 1) {
      const text = sentences[index].exactText;
      const groups = words(text).filter((word) => AFFECTED_GROUP.test(word));
      const newGroups = groups.filter((word) => !seenGroups.has(word));
      for (const word of groups) seenGroups.add(word);
      if (!newGroups.length) continue;
      if (CAUSAL_LINK.test(text)) continue;
      const predicate = STATE_PREDICATE.exec(text);
      if (!predicate) continue;
      // The affected group must be the SUBJECT of the state, not a modifier elsewhere in the
      // sentence ("group projects … help children become …" predicates nothing of a group).
      const subjectSpan = text.slice(0, predicate.index);
      if (!newGroups.some((word) => new RegExp(`\\b${word}\\b`, "i").test(subjectSpan))) continue;
      findings.push({
        ...sentenceRecord(paragraph, sentences[index]),
        newGroups: [...new Set(newGroups)],
        exactProblemSpan: newGroups[0]
      });
      break; // one mechanism finding per paragraph
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// 4. Local reference control: a bare demonstrative subject after a multi-clause sentence.
// ---------------------------------------------------------------------------
// A leading subordinate clause ("When residents divert …, small-town businesses are forced into
// bankruptcy.") does not compete to be the antecedent: the main clause it introduces dominates.
const LEADING_SUBORDINATE = /^\s*(?:when|if|although|though|because|while|whereas|since|as|after|before|unless|once|whenever)\b[^,]{0,160},\s*/i;
// A trailing participial result ("…, allowing them to complete a month of shopping") or a coordinated
// finite clause ("…, and shoppers save time") DOES compete — it adds a second proposition at the same
// level, so a following bare "this" has two plausible referents.
const TRAILING_PARTICIPIAL = /,\s*(?:thereby\s+|thus\s+)?(?:allowing|enabling|making|creating|leaving|forcing|causing|giving|helping|letting|resulting|meaning|producing)\b/gi;
const COORDINATED_CLAUSE = /,\s*(?:and|but|so|yet)\s+(?:the\s+|a\s+|an\s+|this\s+|these\s+|they\b|it\b|he\b|she\b|we\b)?[a-z]+\s+(?:is|are|was|were|has|have|can|could|will|would|may|might|do|does|did|[a-z]+s)\b/gi;
// A consequence predicate is what makes a demonstrative subject worth checking at all.
const CONSEQUENCE_PREDICATE = /^(?:leads?|causes?|results?|means?|creates?|produces?|eliminates?|removes?|reduces?|increases?|forces?|allows?|prevents?|makes?|explains?|shows?|demonstrates?|worsens?|improves?)/i;
// A dangling adjunct inside the referring sentence itself ("…while providing items with greater
// deals") means the sentence has a second, separate subject-control problem — a real reason to flag.
const UNANCHORED_ADJUNCT = /,?\s*(?:while|by|when|after|before|through)\s+[a-z]+ing\b/i;

/**
 * Semantic antecedent validation.
 *
 * The previous rule flagged a demonstrative whenever the preceding sentence had more than one finite
 * verb. That is a syntactic proxy, not a reading of the text, and it produced a false Moderate issue
 * for "…businesses are forced into bankruptcy. This leads to immediate local job losses…", where the
 * antecedent is plainly the bankruptcy.
 *
 * Returns "clear" | "refinable" | "ambiguous". Only "ambiguous" becomes a visible issue.
 */
export function classifyDemonstrativeReference(previousSentence = "", referringSentence = "", verb = "") {
  const previous = String(previousSentence || "");
  // Competing antecedents are counted AFTER removing a leading subordinate clause, because that
  // clause is subordinate to — not a rival of — the proposition that follows it.
  const core = previous.replace(LEADING_SUBORDINATE, "");
  const competing = 1 +
    (core.match(TRAILING_PARTICIPIAL) || []).length +
    (core.match(COORDINATED_CLAUSE) || []).length;

  const causallyCompatible = CONSEQUENCE_PREDICATE.test(String(verb || ""));
  const selfUnanchored = UNANCHORED_ADJUNCT.test(String(referringSentence || ""));

  // One dominant proposition, and the referring verb reads as its consequence: recoverable.
  if (competing <= 1 && causallyCompatible) return selfUnanchored ? "refinable" : "clear";
  // One proposition but no consequence reading: understandable, worth tightening, not a defect.
  if (competing <= 1) return "refinable";
  // Two or more rival propositions. Genuinely ambiguous when the sentence also carries its own
  // subject-control problem, or when the alternatives would change what the claim asserts.
  return selfUnanchored || causallyCompatible ? "ambiguous" : "refinable";
}

function assessReferenceControl({ paragraphs }) {
  const findings = [];
  for (const paragraph of paragraphs) {
    if (/^Introduction$/i.test(String(paragraph.role || ""))) continue;
    const sentences = paragraph.sentences || [];
    for (let index = 1; index < sentences.length; index += 1) {
      const text = sentences[index].exactText;
      const match = BARE_DEMONSTRATIVE_SUBJECT.exec(text);
      if (!match) continue;
      const previous = sentences[index - 1].exactText;
      const classification = classifyDemonstrativeReference(previous, text, match[2]);
      // Only genuine ambiguity is a visible Moderate issue. A refinable reference is recorded so the
      // language-pattern summary can mention it, but it never displaces a stronger issue.
      if (classification !== "ambiguous") continue;
      findings.push({
        ...sentenceRecord(paragraph, sentences[index]),
        exactProblemSpan: match[1],
        antecedentSentence: previous,
        referenceClassification: classification
      });
      break; // one reference finding per paragraph
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------
export function assessCanonicalDevelopmentEvidence({
  taskType = "Task 2",
  prompt = "",
  paragraphs = [],
  taskRequirements = null,
  bodyRoutes = [],
  detectedPosition = ""
} = {}) {
  const empty = {
    version: DEVELOPMENT_EVIDENCE_VERSION,
    applicable: false,
    comparativeJudgement: { required: false, asserted: false, demonstrated: true },
    thesisPromises: { promises: [], undeveloped: [] },
    affectedGroupGaps: [],
    referenceGaps: [],
    findings: [],
    taskResponseLimiters: [],
    coherenceLimiters: []
  };
  if (String(taskType) !== "Task 2" || !Array.isArray(paragraphs) || paragraphs.length < 3) return empty;

  const comparativeJudgement = assessComparativeJudgement({ paragraphs, taskRequirements, prompt, bodyRoutes, detectedPosition });
  const thesisPromises = assessThesisPromiseCoverage({ paragraphs, prompt });
  const affectedGroupGaps = assessAffectedGroupMechanism({ paragraphs });
  const referenceGaps = assessReferenceControl({ paragraphs });

  const findings = [];
  if (comparativeJudgement.required && comparativeJudgement.asserted && !comparativeJudgement.demonstrated) {
    const record = comparativeJudgement.assertionRecord || {};
    findings.push({
      findingId: "development-comparative-judgement",
      category: "Comparative Judgement",
      criterion: "Task Response",
      severity: "Major",
      priorityTier: 2,
      ...record,
      exactProblemSpan: "",
      diagnosis: "The comparative judgement the question asks for is asserted but never demonstrated: no body sentence weighs one side against the other using an explicit comparison.",
      studentAction: "Add one sentence to the stronger body paragraph that compares the two sides directly — name what each side produces and say why one matters more — instead of only restating the judgement.",
      evidenceSource: "taskRequirements.promptObligations[judgementRequired] + bodyParagraphs[comparisonOperator]"
    });
  }
  for (const promise of thesisPromises.undeveloped) {
    const record = thesisPromises.thesisRecord || {};
    findings.push({
      findingId: `development-thesis-promise-${promise.distinctiveStems.join("-")}`,
      category: "Thesis-to-Body Promise",
      criterion: "Task Response",
      severity: "Major",
      priorityTier: 3,
      ...record,
      exactProblemSpan: promise.phrase,
      diagnosis: `The thesis promises "${promise.phrase}" as a route the essay will take, but no body paragraph develops it.`,
      studentAction: `Either develop "${promise.phrase}" in a body paragraph with its own mechanism and consequence, or remove it from the thesis so the promise matches the essay.`,
      evidenceSource: "introduction.thesisSentence vs bodyParagraphs.contentStems"
    });
  }
  for (const gap of affectedGroupGaps) {
    findings.push({
      findingId: `development-affected-group-${gap.paragraphId}`,
      category: "Causal Mechanism",
      criterion: "Coherence & Cohesion",
      severity: "Moderate",
      priorityTier: 7,
      ...gap,
      diagnosis: `This sentence introduces a new affected group ("${gap.newGroups.join('", "')}") and states an outcome for it, but does not explain the mechanism that connects it to the cause the paragraph has been developing.`,
      studentAction: "State how the process already described in this paragraph reaches this group, then name the observable consequence for them.",
      evidenceSource: "paragraph.sentences[affectedGroup + statePredicate - causalLink]"
    });
  }
  for (const gap of referenceGaps) {
    findings.push({
      findingId: `development-reference-${gap.paragraphId}`,
      category: "Reference Control",
      criterion: "Coherence & Cohesion",
      severity: "Moderate",
      priorityTier: 8,
      ...gap,
      diagnosis: `"${gap.exactProblemSpan}" opens this sentence with no noun after it, and the previous sentence contains more than one clause it could refer to.`,
      studentAction: `Replace "${gap.exactProblemSpan}" with the exact noun phrase you mean, so the reader does not have to choose between two possible antecedents.`,
      evidenceSource: "paragraph.sentences[bareDemonstrativeSubject] + previousSentence.finiteClauses>=2"
    });
  }

  const taskResponseLimiters = [
    ...(comparativeJudgement.required && comparativeJudgement.asserted && !comparativeJudgement.demonstrated
      ? [{ code: "COMPARISON_ASSERTED_NOT_DEMONSTRATED", evidence: comparativeJudgement.assertionEvidence }]
      : []),
    ...thesisPromises.undeveloped.map((promise) => ({ code: "THESIS_PROMISE_UNDEVELOPED", evidence: promise.phrase }))
  ];
  const coherenceLimiters = [
    ...referenceGaps.map((gap) => ({ code: "LOCAL_REFERENCE_UNCLEAR", evidence: gap.exactSentence })),
    ...affectedGroupGaps.map((gap) => ({ code: "AFFECTED_GROUP_TRANSITION_UNCLEAR", evidence: gap.exactSentence }))
  ];

  return {
    version: DEVELOPMENT_EVIDENCE_VERSION,
    applicable: true,
    comparativeJudgement,
    thesisPromises,
    affectedGroupGaps,
    referenceGaps,
    findings,
    taskResponseLimiters,
    coherenceLimiters
  };
}
