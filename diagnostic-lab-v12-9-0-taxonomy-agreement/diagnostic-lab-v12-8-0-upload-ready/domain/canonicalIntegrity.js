// Canonical diagnostic integrity (V12.8.3).
//
// Operates on the CANONICAL ISSUE LAYER before feedbackCards / topIssues / framework / paragraph
// coverage / executive summary / repair plan / student view are produced, so every downstream section
// inherits one corrected source of truth. All rules are derived from structure (sentence role, route
// presence, diagnosis semantics, target span, revision content) — never from fixture wording.
//
// Corrects: taxonomy (lexical meaning misfiled as a route gap), evidence assertion, canonical
// deduplication, priority ordering, sentence-function projection, revision-type fidelity
// (false "new affected group"), Student Action validation, and summary frequency claims.

import { canonicalPriorityKey, orderCanonicalIssues } from "./canonicalIssueGraph.js";
import { deriveDeterministicCorrection, isAutoCorrectableCategory } from "./deterministicCorrections.js";

export const CANONICAL_INTEGRITY_VERSION = "canonical-integrity-v12.8.3";

// Task 2 route categories only. "Prompt Coverage" is deliberately excluded: it is a genuine coverage
// dimension (and Task 1 introduction cards use it), so reclassifying it would disturb Task 1 visual
// logic, which this release must protect.
const ROUTE_CATEGORIES = new Set([
  "Cause Route Clarity", "Solution Route Clarity", "Thesis Route Clarity",
  "Body Route Alignment", "Route Clarity"
]);
const ROUTE_SENTENCE_ROLES = new Set([
  "cause_route", "solution_route", "thesis_route", "thesis", "body_topic_sentence", "view_route", "position"
]);
const LEXICAL_CATEGORIES = new Set([
  "Lexical Precision", "Meaning Control", "Word Choice", "Word Form", "Collocation"
]);

// ---------------------------------------------------------------------------
// A. Taxonomy: a lexical-meaning defect must not present as a missing route.
// ---------------------------------------------------------------------------

// True when a diagnosis is about the MEANING of a word/phrase rather than an absent route.
// Structural cues only: contrastive meaning language, dictionary-sense language, quoted target item.
export function diagnosisIsLexicalMeaning(text = "") {
  const t = String(text).toLowerCase();
  const meaningVerb = /\b(?:means?|meaning|suggests?|implies|denotes?|refers? to|is understood as|reads as)\b/.test(t);
  const contrast = /\brather than\b|\binstead of\b|\bnot\b[^.]{0,60}\bbut\b|\bwhereas\b/.test(t);
  const lexicalNoun = /\b(?:word|wording|term|phrase|expression|vocabulary|collocation|lexical)\b/.test(t);
  const quotedItem = /["“'][^"”']{2,60}["”']/.test(String(text));
  // Meaning-contrast ("X suggests A rather than B") or an explicit lexical complaint about a quoted item.
  return (meaningVerb && contrast) || (lexicalNoun && (meaningVerb || contrast)) || (quotedItem && meaningVerb && !/\broute is (?:missing|absent)\b/.test(t));
}

// True when the diagnosis actually claims a required route is missing/absent/untraceable.
export function diagnosisClaimsMissingRoute(text = "") {
  const t = String(text).toLowerCase();
  return /\broutes?\b[^.]{0,50}\b(?:missing|absent|not traceable|not present|cannot be traced|unclear)\b/.test(t) ||
    /\b(?:missing|absent|no)\b[^.]{0,30}\broutes?\b/.test(t) ||
    /\bdoes not\b[^.]{0,30}\b(?:establish|present|trace)\b[^.]{0,40}\broute\b/.test(t);
}

// Extracts the quoted lexical item a diagnosis is complaining about (used to build a repair target).
export function extractQuotedTarget(text = "") {
  const match = String(text).match(/["“']([^"”']{2,60})["”']/);
  return match ? match[1].trim() : "";
}

// Reclassify one canonical issue when a lexical-meaning defect was filed as a route defect.
// Returns { issue, changed, reason }.
export function correctIssueTaxonomy(issue = {}, { routePresent = true } = {}) {
  const primary = String(issue.primaryCategory || issue.issueCategory || "");
  // Route→lexical reclassification applies to Task 2 essay routes. Task 1 keeps its visual-specific
  // taxonomy untouched (protected system).
  if (String(issue.taskType || "Task 2") === "Task 1") return { issue, changed: false };
  if (!ROUTE_CATEGORIES.has(primary)) return { issue, changed: false };
  const diagnosis = String(issue.diagnosis || issue.coreDiagnosis || issue.kruPomDiagnosis || "");
  // Only reclassify when the route is genuinely present AND the complaint is lexical, not a route gap.
  if (!routePresent || diagnosisClaimsMissingRoute(diagnosis) || !diagnosisIsLexicalMeaning(diagnosis)) {
    return { issue, changed: false };
  }
  const roleIsRoute = ROUTE_SENTENCE_ROLES.has(String(issue.sentenceRole || ""));
  const target = extractQuotedTarget(diagnosis) || String(issue.targetSpan || "").trim();
  const corrected = {
    ...issue,
    primaryCategory: "Lexical Precision",
    issueCategory: "Lexical Precision",
    // The route label stays only as a secondary effect, and only when the wording sits on a route sentence.
    secondaryCategories: dedupeStrings([...(roleIsRoute ? [primary] : []), ...(issue.secondaryCategories || issue.secondaryIssueCategories || [])].filter((c) => c !== "Lexical Precision")),
    secondaryIssueCategories: undefined,
    evidenceAssertionType: "lexical_meaning",
    detectedDefect: target
      ? `The wording "${target}" does not carry the meaning the sentence requires.`
      : "The wording does not carry the meaning the sentence requires.",
    repairTargets: (issue.repairTargets || []).length
      ? issue.repairTargets
      : [{ type: "lexical_item", target, requirement: "Replace with a term whose ordinary meaning matches the intended idea." }],
    taxonomyCorrection: { from: primary, to: "Lexical Precision", reason: "lexical-meaning-not-route-gap", version: CANONICAL_INTEGRITY_VERSION }
  };
  delete corrected.secondaryIssueCategories;
  return { issue: corrected, changed: true, reason: "lexical-meaning-not-route-gap" };
}

// ---------------------------------------------------------------------------
// E. A revision whose type validator FAILED must never reach the student.
// Deterministically relabel when the revision is demonstrably a minimal local correction; otherwise
// withhold it. A withheld revision keeps its Student Action so the student still knows what to do.
// ---------------------------------------------------------------------------
export const WITHHELD_REVISION_NOTE = "Revision unavailable: a safe rewrite could not be verified for this issue. Follow the Student Action above instead.";

// ---------------------------------------------------------------------------
// Revision-withholding contract (V12.9.3).
//
// A withheld card has NO revision, so it must not render a rationale that describes one. Production
// shipped cards reading "Revision Type: Revision Unavailable" beside "The revision removes the
// diagnosed language-control problem…" — a statement about a revision that does not exist. It must
// also not fall back to placeholder hyphens for fields it cannot fill.
//
// `whyRevisionIsStronger` is cleared and replaced by `whyRevisionIsNotShown`, which states the real
// validator reason in language a learner can act on.
// ---------------------------------------------------------------------------

const WITHHOLDING_REASONS = Object.freeze({
  meaning: "A rewrite is not shown because the intended meaning cannot be recovered confidently from the sentence alone — only you know which idea you meant, so choosing for you could change your argument.",
  structural: "A rewrite is not shown because this repair is a writing decision rather than a wording fix: it needs new content that only you can choose.",
  ambiguous: "A rewrite is not shown because several different repairs would each be defensible here, and picking one would hide that choice from you.",
  evidence: "A rewrite is not shown because the quoted span is not sufficient on its own to guarantee a safe correction.",
  validator: "A rewrite is not shown because the proposed correction did not pass safety validation: it risked changing your meaning or introducing a new error."
});

export function withholdingReasonFor(issue = {}) {
  const category = String(issue.primaryCategory || issue.issueCategory || "");
  if (/Comparative Judgement|Thesis-to-Body Promise|Causal Mechanism|Solution Mechanism|Explanation Depth|Example Development|SAR Example Quality/i.test(category)) {
    return { code: "requires-learner-content", text: WITHHOLDING_REASONS.structural };
  }
  if (/Reference|Pronoun/i.test(category)) return { code: "multiple-plausible-repairs", text: WITHHOLDING_REASONS.ambiguous };
  if (issue.affectsMeaning === true || /Meaning Control|Word Form|Lexical Precision|Collocation/i.test(category)) {
    return { code: "meaning-not-recoverable", text: WITHHOLDING_REASONS.meaning };
  }
  if (!String(issue.targetSpan || "").trim()) return { code: "insufficient-evidence-span", text: WITHHOLDING_REASONS.evidence };
  return { code: "validator-refused", text: WITHHOLDING_REASONS.validator };
}

// Applied to every canonical issue before projection, so a withheld card can never reach any section
// carrying successful-revision prose or an empty placeholder.
export function applyRevisionWithholdingContract(issue = {}) {
  const withheld = issue.revisionWithheld === true ||
    String(issue.revisionType || "") === "Revision Unavailable" ||
    String(issue.revisionTypeValidationStatus || "").toLowerCase() === "withheld";
  if (!withheld) {
    // A card that DOES carry a revision must not advertise a withholding reason.
    if (!issue.whyRevisionIsNotShown) return { issue, changed: false };
    const { whyRevisionIsNotShown, ...rest } = issue;
    return { issue: rest, changed: true };
  }
  const reason = withholdingReasonFor(issue);
  const next = {
    ...issue,
    revisionType: "Revision Unavailable",
    revisionWithheld: true,
    targetedRevision: String(issue.targetedRevision || "").trim() || WITHHELD_REVISION_NOTE,
    // No revision exists, so no claim may be made about one.
    whyRevisionIsStronger: "",
    whyRevisionIsNotShown: reason.text,
    revisionWithholdingReasonCode: reason.code
  };
  // Placeholder hyphens are worse than an absent field: they read as a rendering failure.
  for (const field of ["sentenceFunction", "whyItLimitsBand", "kruPomDiagnosis", "studentAction"]) {
    if (/^\s*[-–—]\s*$/.test(String(next[field] || ""))) next[field] = "";
  }
  const changed = next.whyRevisionIsStronger !== issue.whyRevisionIsStronger ||
    next.whyRevisionIsNotShown !== issue.whyRevisionIsNotShown ||
    next.targetedRevision !== issue.targetedRevision;
  return { issue: next, changed };
}

const FUNCTION_WORD_TARGET = /^(?:is|are|was|were|has|have|had|does|do|did|be|been|being|a|an|the|of|to|in|on|for|and|or|but)$/i;

function tokenize(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

// True when the revision differs from the original by at most a couple of tokens and introduces no new
// content words — i.e. a local grammar/mechanical repair rather than added analysis.
export function isMinimalCorrection(original = "", revision = "") {
  const a = tokenize(original);
  const b = tokenize(revision);
  if (!a.length || !b.length) return false;
  if (Math.abs(a.length - b.length) > 2) return false;
  const inA = new Set(a);
  const added = b.filter((token) => !inA.has(token));
  return added.length <= 2;
}

export function enforceRevisionValidation(issue = {}) {
  // Act only on an actual validator FAILURE. A card that merely carries an advisory note, or a
  // genuine Teacher-Guided Expansion that passed validation, must be left exactly as produced.
  if (String(issue.revisionTypeValidationStatus || "").toLowerCase() !== "fail") return { issue, changed: false };
  const original = String(issue.exactEvidence || issue.exactSentence || "");
  const revision = String(issue.targetedRevision || "");
  if (revision && isMinimalCorrection(original, revision)) {
    return {
      issue: {
        ...issue,
        revisionType: "Minimal Correction",
        revisionTypeValidationStatus: "pass",
        revisionQualityProblems: (issue.revisionQualityProblems || []).filter((problem) => !/REVISION_TYPE_FIDELITY/i.test(String(problem?.code || ""))),
        revisionTypeCorrection: { from: issue.revisionType, to: "Minimal Correction", reason: "relabelled-to-match-actual-edit", version: CANONICAL_INTEGRITY_VERSION }
      },
      changed: true,
      mode: "relabelled"
    };
  }
  return {
    issue: {
      ...issue,
      revisionType: "Revision Unavailable",
      // The report contract requires a withheld card to carry an explanatory message (never an empty
      // string) and to be marked withheld in the alignment status as well.
      targetedRevision: WITHHELD_REVISION_NOTE,
      revisionWithheld: true,
      revisionAlignmentStatus: "withheld",
      revisionTypeValidationStatus: "withheld",
      revisionLimitationNote: "A safe revision could not be verified for this issue, so it is withheld. Follow the Student Action instead.",
      revisionTypeCorrection: { from: issue.revisionType, to: "Revision Unavailable", reason: "revision-validator-failed", version: CANONICAL_INTEGRITY_VERSION }
    },
    changed: true,
    mode: "withheld"
  };
}

// ---------------------------------------------------------------------------
// D. A lexical issue must not carry a grammatical function-word target span, and its revision must
// repair the lexical defect — not a co-located agreement error.
// ---------------------------------------------------------------------------

// Recovers the subject noun phrase that sits immediately before a finite verb in the evidence.
export function subjectPhraseBefore(evidence = "", verb = "") {
  const text = String(evidence || "");
  const target = String(verb || "").trim();
  if (!text || !target) return "";
  const match = text.match(new RegExp(`((?:the|a|an)\\s+[^,;.]{3,80}?)\\s+\\b${target}\\b`, "i"));
  return match ? match[1].trim() : "";
}

export function correctLexicalTargetSpan(issue = {}) {
  const category = String(issue.primaryCategory || issue.issueCategory || "");
  if (!LEXICAL_CATEGORIES.has(category)) return { issue, changed: false };
  const target = String(issue.targetSpan || "").trim();
  if (!target || !FUNCTION_WORD_TARGET.test(target)) return { issue, changed: false };
  // The lexical claim is anchored to a function word: re-anchor it to the phrase it is really about.
  const quoted = extractQuotedTarget(issue.diagnosis || "");
  const subject = subjectPhraseBefore(issue.exactEvidence || issue.exactSentence, target);
  const replacement = quoted && !FUNCTION_WORD_TARGET.test(quoted) ? quoted : subject;
  if (!replacement) return { issue, changed: false };
  // Its revision only performed the co-located grammatical edit, so it does not repair this lexical
  // diagnosis: withhold it and state the lexical operation instead.
  const revisionOnlyFixesVerb = isMinimalCorrection(issue.exactEvidence || issue.exactSentence, issue.targetedRevision || "");
  const next = {
    ...issue,
    targetSpan: replacement,
    targetStartOffset: undefined,
    targetEndOffset: undefined,
    repairTargets: (issue.repairTargets || []).length
      ? issue.repairTargets
      : [{ type: "lexical_item", target: replacement, requirement: "Replace with wording whose ordinary meaning matches the intended idea." }],
    lexicalTargetCorrection: { from: target, to: replacement, reason: "lexical-issue-anchored-to-function-word", version: CANONICAL_INTEGRITY_VERSION }
  };
  if (revisionOnlyFixesVerb) {
    next.revisionType = "Revision Unavailable";
    next.targetedRevision = WITHHELD_REVISION_NOTE;
    next.revisionWithheld = true;
    next.revisionAlignmentStatus = "withheld";
    next.revisionTypeValidationStatus = "withheld";
    next.revisionLimitationNote = "The proposed revision repaired a different (grammatical) defect, so it is withheld for this lexical issue.";
    next.studentAction = `Replace "${replacement}" with wording that names what you actually mean, and keep the rest of the sentence unchanged.`;
  }
  return { issue: next, changed: true };
}

// ---------------------------------------------------------------------------
// F. Candidate promotion. Validated language evidence is produced by the analyser but was never
// turned into canonical issues, so a single local repair could dominate the whole report while
// meaning-affecting errors were dropped. Candidates are promoted BEFORE deduplication and priority
// selection, are capped, and never invent a revision: each is emitted with a controlled
// "Revision Unavailable" state plus a precise Student Action.
// ---------------------------------------------------------------------------

// Maps a validated language category onto the canonical issue taxonomy.
export function canonicalCategoryForLanguage(category = "", explanation = "") {
  const text = `${category} ${explanation}`.toLowerCase();
  if (/punctuation|spacing/.test(text)) return "Punctuation";
  if (/countab|uncountable|\barticle\b/.test(text)) return /article/.test(text) && !/countab/.test(text) ? "Article Control" : "Countability";
  if (/subject.?verb|agreement/.test(text)) return "Subject-Verb Agreement";
  if (/collocation/.test(text)) return "Collocation";
  if (/pronoun|reference|referent|antecedent/.test(text)) return "Reference Control";
  if (/tense/.test(text)) return "Tense Control";
  if (/preposition/.test(text)) return "Preposition Control";
  if (/fragment|incomplete sentence|main clause/.test(text)) return "Sentence Completion";
  if (/word form/.test(text)) return "Word Form";
  if (/vague|imprecise|noun choice|word choice|meaning|lexical/.test(text)) return "Lexical Precision";
  // A semantic or noun-phrase relation defect is NOT a grammar defect. "The resulting economic
  // decline of small center shops" is syntactically well formed; what is wrong is the relation the
  // noun phrase asserts (the decline belongs to the area, not to the shops). Falling through to the
  // generic grammar bucket produced a category, diagnosis and repair operation that disagreed.
  if (/\bof\b.*(?:belong|possess|relation)|relationship|does not describe|not what .* means|unnatural (?:combination|pairing)|noun phrase|modifier attaches/.test(text)) {
    return "Lexical Precision";
  }
  return "Grammar and Sentence Control";
}

// Structural test for the same defect class when only the sentence and target span are available:
// the span is a noun phrase built with "of", the grammar is valid, and no finite-verb defect exists.
export function isSemanticNounPhraseDefect(targetSpan = "", explanation = "") {
  const span = String(targetSpan || "").trim();
  const text = String(explanation || "").toLowerCase();
  if (!/^(?:the\s+|a\s+|an\s+)?[a-z][a-z\s-]{3,60}\s+of\s+[a-z][a-z\s-]{3,60}$/i.test(span)) return false;
  // Explicit syntax complaints stay with grammar.
  return !/\bverb\b|\bagreement\b|\btense\b|\bfragment\b|\bclause\b|\bpunctuation\b|\barticle\b/.test(text);
}

function normalizedSentenceKey(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function severityForCandidate(candidate = {}) {
  if (candidate.affectsMeaning) return "Major";
  const severity = String(candidate.severity || "").toLowerCase();
  if (severity === "major" || severity === "critical") return "Major";
  if (severity === "minor") return "Minor Repair";
  return "Moderate";
}

// Thai student-facing text for promoted evidence, so a Thai report never mixes in English guidance.
const THAI_ACTION_BY_CATEGORY = {
  Punctuation: "แก้เครื่องหมายวรรคตอนและการเว้นวรรคในประโยคนี้ แล้วตรวจหารูปแบบเดียวกันในย่อหน้า",
  Countability: "แก้คำนามและคำนำหน้านามให้ตรงกับว่าคำนามนี้นับได้หรือนับไม่ได้ในความหมายนี้",
  "Subject-Verb Agreement": "หาประธานหลักของประโยคนี้ แล้วทำให้กริยาสอดคล้องกับประธาน",
  "Reference Control": "แทนคำอ้างอิงที่ไม่ชัดเจนด้วยคำนามที่ระบุชัดว่าหมายถึงสิ่งใด",
  "Sentence Completion": "ทำให้เป็นประโยคสมบูรณ์ที่มีประธานและกริยาแท้ โดยคงความคิดเดิมไว้",
  Collocation: "เปลี่ยนคำที่ใช้คู่กันไม่เป็นธรรมชาติให้เป็นคำที่ผู้อ่านเชิงวิชาการคาดหวัง",
  "Lexical Precision": "เปลี่ยนคำที่ความหมายไม่ตรงให้เป็นคำที่ความหมายตรงกับสิ่งที่ต้องการสื่อ โดยไม่เปลี่ยนส่วนอื่นของประโยค"
};
const THAI_WITHHELD_NOTE = "ยังไม่มีประโยคตัวอย่างที่ตรวจสอบความปลอดภัยแล้วสำหรับจุดนี้ ให้ทำตามคำแนะนำสำหรับนักเรียนด้านบนแทน";

function studentActionForCandidate(category, candidate, location, thai = false) {
  if (thai) {
    const base = THAI_ACTION_BY_CATEGORY[category] || "เรียบเรียงประโยคนี้ใหม่ให้ประธาน กริยา และความหมายชัดเจน โดยไม่เปลี่ยนใจความเดิม";
    return location ? `ใน${location}: ${base}` : base;
  }
  const where = location ? `In ${location}, ` : "";
  const span = String(candidate.exactProblemSpan || "").trim();
  const quoted = span && span.length <= 60 ? `"${span}"` : "";
  switch (category) {
    case "Punctuation":
      return `${where}correct the punctuation and spacing in this sentence${quoted ? ` around ${quoted}` : ""}, then scan the paragraph for the same pattern.`;
    case "Countability":
      return `${where}correct the noun phrase${quoted ? ` ${quoted}` : ""} so the article matches whether the noun is countable in this meaning.`;
    case "Subject-Verb Agreement":
      return `${where}identify the subject head of this sentence and make the finite verb agree with it.`;
    case "Reference Control":
      return `${where}replace the unclear reference${quoted ? ` ${quoted}` : ""} with the explicit noun phrase you mean.`;
    case "Sentence Completion":
      return `${where}turn this into a complete sentence with an independent subject and a finite main verb, keeping the original idea.`;
    case "Collocation":
      return `${where}replace the unnatural word combination${quoted ? ` ${quoted}` : ""} with the collocation an academic reader expects.`;
    case "Lexical Precision":
      return `${where}replace${quoted ? ` ${quoted}` : " the imprecise wording"} with a term whose ordinary meaning matches the idea you intend, and keep the rest of the sentence unchanged.`;
    default:
      return `${where}rebuild this sentence so its subject, verb and meaning are clear, without changing the original claim.`;
  }
}

// Builds one canonical issue from a validated language candidate.
function buildPromotedIssue(candidate, index, thai = false) {
  let category = canonicalCategoryForLanguage(candidate.category, candidate.explanation);
  const sentence = String(candidate.exactSentence || "").trim();
  const location = String(candidate.paragraphLocation || "").trim();
  const severity = severityForCandidate(candidate);
  const span = String(candidate.exactProblemSpan || "").trim();
  const withheldNote = thai ? THAI_WITHHELD_NOTE : WITHHELD_REVISION_NOTE;
  // Taxonomy (defect 7): a well-formed noun phrase asserting the wrong relation is a lexical defect,
  // not a grammar one, whatever the provider called it.
  if (category === "Grammar and Sentence Control" && isSemanticNounPhraseDefect(span, candidate.explanation)) {
    category = "Lexical Precision";
  }
  // Deterministic correction (defect 6): a promoted issue now goes through the SAME safe correction
  // path as a native one. A one-token repair the engine can prove is shown as a Minimal Correction
  // instead of "Revision Unavailable" plus an instruction to rebuild the sentence.
  const correction = isAutoCorrectableCategory(category)
    ? deriveDeterministicCorrection({ sentence, targetSpan: span, category })
    : null;
  if (correction) {
    return {
      ...buildPromotedIssueBase(candidate, index, thai, category, sentence, location, severity, span, withheldNote),
      revisionType: "Minimal Correction",
      targetedRevision: correction.revised,
      revisionWithheld: false,
      revisionAlignmentStatus: "aligned",
      revisionTypeValidationStatus: "pass",
      whyRevisionIsStronger: `${correction.proof} The rest of the sentence, including its claim and route, is unchanged.`,
      deterministicCorrection: { operation: correction.operation, version: correction.version },
      studentAction: studentActionForCorrection(category, correction, span, location, thai),
      revisionIntegrity: {
        exactOriginalFound: true,
        originalClaim: sentence,
        pass: true,
        routePreserved: true,
        stancePreserved: true,
        sentenceComplete: true,
        revisionTypeValid: true
      },
      revisionQualityProblems: [],
      integrityRepairs: [{ code: "DETERMINISTIC_CORRECTION_APPLIED", message: `Safe ${correction.operation} repair generated for promoted evidence.` }]
    };
  }
  return buildPromotedIssueBase(candidate, index, thai, category, sentence, location, severity, span, withheldNote);
}

// A one-token repair deserves a one-token instruction, not "rebuild this sentence".
function studentActionForCorrection(category, correction, span, location, thai) {
  const where = location ? `In ${location}, ` : "";
  if (thai) return `${location ? `ใน${location}: ` : ""}แก้ตามฉบับแก้ไขที่แสดงไว้ ซึ่งเป็นการแก้จุดเดียวโดยไม่เปลี่ยนความหมายเดิม`;
  const operation = {
    "fixed-expression": "correct the fixed expression exactly as shown",
    "subject-verb-agreement": "make the finite verb agree with its subject head, exactly as shown",
    "article-before-uncountable": "delete the article before this uncountable noun, exactly as shown",
    "sentence-spacing": "add the missing space after the full stop",
    "internal-spacing": "remove the repeated space"
  }[correction.operation] || "apply the single-word correction shown";
  return `${where}${operation}${span && span.length <= 60 ? ` (${span})` : ""}. Nothing else in the sentence changes.`;
}

function buildPromotedIssueBase(candidate, index, thai, category, sentence, location, severity, span, withheldNote) {
  return {
    issueId: `promoted-${index}-${normalizedSentenceKey(sentence).slice(0, 24).replace(/\s+/g, "-")}`,
    taskType: "Task 2",
    promoted: true,
    promotionSource: String(candidate.source || "language-profile"),
    paragraphLabel: location,
    paragraphLocation: location,
    sentenceIndex: Number(candidate.sentenceIndex) || 0,
    paragraphId: candidate.paragraphIndex !== undefined ? `paragraph-${Number(candidate.paragraphIndex) + 1}` : "",
    issueCategory: category,
    primaryCategory: category,
    secondaryCategories: [],
    issueType: category,
    title: category,
    severity,
    criteria: [String(candidate.criterion || "Grammatical Range & Accuracy")],
    framework: [],
    exactSentence: sentence,
    exactEvidence: sentence,
    targetSpan: span || sentence,
    detectedDefect: String(candidate.explanation || "").slice(0, 240),
    diagnosis: String(candidate.explanation || "").slice(0, 240),
    kruPomDiagnosis: String(candidate.explanation || "").slice(0, 240),
    whyItLimitsBand: String(candidate.explanation || "").slice(0, 240),
    summary: String(candidate.explanation || "").slice(0, 240),
    affectsMeaning: Boolean(candidate.affectsMeaning),
    recurrenceKey: String(candidate.recurringPatternKey || ""),
    repairTargets: [{ type: "language_item", target: span || sentence, requirement: "Repair the validated defect without changing the original claim." }],
    studentAction: studentActionForCandidate(category, candidate, location, thai),
    // A promoted candidate never invents a rewrite: it ships in the controlled withheld state.
    revisionType: "Revision Unavailable",
    targetedRevision: withheldNote,
    revisionWithheld: true,
    revisionAlignmentStatus: "withheld",
    revisionTypeValidationStatus: "withheld",
    whyRevisionIsStronger: "",
    // A promoted candidate ships in the controlled withheld state, so its integrity record states
    // that the original was located but no verified rewrite exists (pass:false + a recorded reason).
    revisionIntegrity: {
      exactOriginalFound: true,
      originalClaim: sentence,
      pass: false,
      routePreserved: true,
      stancePreserved: true,
      sentenceComplete: false,
      revisionTypeValid: true
    },
    revisionQualityProblems: [{ code: "REVISION_WITHHELD", message: "No verified rewrite is available for this promoted evidence; the Student Action states the repair." }],
    integrityRepairs: [{ code: "REVISION_WITHHELD", message: "Promoted validated evidence shipped without a model rewrite." }],
    evidenceValidationStatus: "validated",
    evidenceScope: "single-location",
    evidenceCount: 1,
    evidenceLocations: location && sentence ? [{ paragraphLocation: location, exactEvidence: sentence }] : []
  };
}

// Thai student-facing text for promoted canonical development evidence.
const THAI_DEVELOPMENT_ACTION = {
  "Comparative Judgement": "เพิ่มประโยคเปรียบเทียบสองฝ่ายโดยตรงในย่อหน้าที่คุณเห็นว่าสำคัญกว่า ระบุว่าแต่ละฝ่ายทำให้เกิดอะไร และเหตุใดฝ่ายหนึ่งจึงสำคัญกว่า",
  "Thesis-to-Body Promise": "พัฒนาแนวทางที่ประกาศไว้ใน thesis ให้ครบในย่อหน้าเนื้อหา พร้อมกลไกและผลลัพธ์ หรือมิฉะนั้นให้ตัดออกจาก thesis",
  "Causal Mechanism": "อธิบายว่ากระบวนการที่ย่อหน้านี้พูดถึงส่งผลถึงกลุ่มคนกลุ่มนี้อย่างไร แล้วระบุผลที่สังเกตเห็นได้",
  "Reference Control": "แทนคำอ้างอิงที่ไม่ชัดเจนด้วยคำนามที่ระบุชัดว่าหมายถึงสิ่งใด เพื่อให้ผู้อ่านไม่ต้องเดา"
};

// Builds one canonical issue from a structural development finding. Like a promoted language
// candidate it never invents a rewrite: the repair is expressed as a Student Action and the revision
// ships in the controlled withheld state required by the report contract.
function buildDevelopmentIssue(finding, index, thai = false) {
  const category = String(finding.category || "Explanation Depth");
  const sentence = String(finding.exactSentence || "").trim();
  const location = String(finding.paragraphLocation || finding.paragraphLabel || "").trim();
  const diagnosis = String(finding.diagnosis || "").slice(0, 300);
  const withheldNote = thai ? THAI_WITHHELD_NOTE : WITHHELD_REVISION_NOTE;
  const action = thai
    ? (THAI_DEVELOPMENT_ACTION[category] || String(finding.studentAction || ""))
    : String(finding.studentAction || "");
  return {
    issueId: String(finding.findingId || `development-${index}`),
    taskType: "Task 2",
    promoted: true,
    promotionSource: "canonical-development-evidence",
    paragraphLabel: String(finding.paragraphLabel || ""),
    paragraphLocation: location,
    sentenceIndex: Number(finding.sentenceIndex) || 0,
    paragraphId: String(finding.paragraphId || ""),
    issueCategory: category,
    primaryCategory: category,
    secondaryCategories: [],
    issueType: category,
    title: category,
    severity: String(finding.severity || "Moderate"),
    criteria: [String(finding.criterion || "Task Response")],
    framework: [],
    exactSentence: sentence,
    exactEvidence: sentence,
    targetSpan: String(finding.exactProblemSpan || "").trim() || sentence,
    detectedDefect: diagnosis,
    diagnosis,
    kruPomDiagnosis: diagnosis,
    whyItLimitsBand: diagnosis,
    summary: diagnosis,
    affectsMeaning: false,
    recurrenceKey: category,
    repairTargets: [{ type: "development_item", target: String(finding.exactProblemSpan || sentence), requirement: "Develop the missing content without changing the essay's position." }],
    studentAction: action,
    revisionType: "Revision Unavailable",
    targetedRevision: withheldNote,
    revisionWithheld: true,
    revisionAlignmentStatus: "withheld",
    revisionTypeValidationStatus: "withheld",
    whyRevisionIsStronger: "",
    revisionIntegrity: {
      exactOriginalFound: true,
      originalClaim: sentence,
      pass: false,
      routePreserved: true,
      stancePreserved: true,
      sentenceComplete: false,
      revisionTypeValid: true
    },
    revisionQualityProblems: [{ code: "REVISION_WITHHELD", message: "A development gap is repaired by writing new content, so no single-sentence rewrite is offered; the Student Action states the repair." }],
    integrityRepairs: [{ code: "REVISION_WITHHELD", message: "Promoted canonical development evidence shipped without a model rewrite." }],
    evidenceValidationStatus: "validated",
    evidenceScope: "single-location",
    evidenceCount: 1,
    evidenceSource: String(finding.evidenceSource || ""),
    evidenceLocations: location && sentence ? [{ paragraphLocation: location, exactEvidence: sentence }] : []
  };
}

// Promotes canonical development evidence (comparison not demonstrated, undeveloped thesis promise,
// affected-group/mechanism gap, unclear local reference) into canonical issues. These outrank
// language repairs, so a single local correction can never own the report.
export function promoteDevelopmentEvidence(issues = [], developmentEvidence = null, { reportLanguage = "en" } = {}) {
  const findings = Array.isArray(developmentEvidence?.findings) ? developmentEvidence.findings : [];
  if (!findings.length) return { issues, promoted: [] };
  const thai = String(reportLanguage).toLowerCase() === "th";
  const existing = new Set(issues.map((issue) => String(issue.primaryCategory || issue.issueCategory || "").toLowerCase() + "|" + normalizedSentenceKey(issue.exactEvidence || issue.exactSentence)));
  const promoted = [];
  for (const finding of findings) {
    const key = String(finding.category || "").toLowerCase() + "|" + normalizedSentenceKey(finding.exactSentence);
    if (existing.has(key)) continue;
    existing.add(key);
    promoted.push(buildDevelopmentIssue(finding, promoted.length + 1, thai));
  }
  return { issues: [...issues, ...promoted], promoted };
}

// ---------------------------------------------------------------------------
// Minimum-value threshold for visible feedback (V12.9.4).
//
// The report used to fill its slots with whatever validated evidence existed, so "same area" — an
// understandable phrase referring to the retail park just named — shipped as a Moderate Lexical
// Precision card while a genuinely imprecise phrase sat lower or was cut. A visible card has to earn
// its place: it must impair meaning, recur, break a rule, or carry a repair the learner can act on.
// ---------------------------------------------------------------------------

export function candidateValueScore(candidate = {}) {
  let score = 0;
  // Meaning impairment is the strongest single signal.
  if (candidate.affectsMeaning === true) score += 3;
  // A clear error breaks a rule; an "awkward but understandable" item does not.
  if (String(candidate.classification || "") === "clear-error") score += 2;
  if (String(candidate.severity || "").toLowerCase() === "major") score += 2;
  // A repeated pattern is worth teaching even when each instance is small.
  if (Number(candidate.occurrenceCount || 0) >= 2 || candidate.recurringPattern === true) score += 2;
  // A defect the learner can locate and repair exactly.
  if (String(candidate.exactProblemSpan || "").trim()) score += 1;
  // Understandable-but-loose wording with no rule broken is a refinement — UNLESS it repeats. A
  // pattern the learner produces more than once is worth teaching even when each instance is minor,
  // so recurrence cancels the refinement penalty rather than merely offsetting it.
  const repeats = Number(candidate.occurrenceCount || 0) >= 2 || candidate.recurringPattern === true;
  if (!repeats && String(candidate.classification || "") === "awkward-but-understandable" && candidate.affectsMeaning !== true) score -= 2;
  if (String(candidate.classification || "") === "high-band-refinement") score -= 3;
  return score;
}

// At or above this, a candidate may become a visible card. Below it, the evidence is retained in the
// language profile and summarised, but it does not occupy a slot a stronger issue could use.
export const MINIMUM_VISIBLE_VALUE = 3;

export function classifyCandidateValue(candidate = {}) {
  const score = candidateValueScore(candidate);
  return { score, visible: score >= MINIMUM_VISIBLE_VALUE, tier: score >= MINIMUM_VISIBLE_VALUE ? "visible" : "refinement" };
}

// Selects which validated candidates deserve promotion. Meaning-affecting evidence is always
// considered; purely mechanical patterns are represented once rather than card-per-occurrence.
export function promoteLanguageCandidates(issues = [], languageProfile = {}, { maxPromotions = 6, reportLanguage = "en" } = {}) {
  const thai = String(reportLanguage).toLowerCase() === "th";
  const sources = [
    ...(Array.isArray(languageProfile.validatedIssues) ? languageProfile.validatedIssues : []),
    ...(Array.isArray(languageProfile.meaningImpairingErrors) ? languageProfile.meaningImpairingErrors : []),
    ...(Array.isArray(languageProfile.clearErrors) ? languageProfile.clearErrors : [])
  ];
  if (!sources.length) return { issues, promoted: [], refinements: [] };

  // A sentence already carrying a LANGUAGE issue is not promoted again. A development finding on the
  // same sentence is a different defect class (what the essay does, not how it is worded), so it must
  // not suppress the language evidence that also lives there.
  const coveredSentences = new Set(issues
    .filter((issue) => issue.promotionSource !== "canonical-development-evidence")
    .map((issue) => normalizedSentenceKey(issue.exactEvidence || issue.exactSentence)));
  const usedRecurrence = new Set();
  const promoted = [];
  // Paragraph-diverse ordering: the strongest candidate from each paragraph is considered before a
  // second candidate from any paragraph. Without this a paragraph rich in mechanical errors consumes
  // the whole budget and a paragraph with one real defect (typically the conclusion) shows none.
  const byParagraph = new Map();
  for (const candidate of sources) {
    const bucket = String(candidate?.paragraphIndex ?? candidate?.paragraphLocation ?? "");
    if (!byParagraph.has(bucket)) byParagraph.set(bucket, []);
    byParagraph.get(bucket).push(candidate);
  }
  const rank = (candidate) => (candidate?.affectsMeaning ? 0 : candidate?.classification === "clear-error" ? 1 : 2);
  const buckets = [...byParagraph.values()].map((items) => items.slice().sort((a, b) => rank(a) - rank(b)));
  const ordered = [];
  for (let round = 0; ordered.length < sources.length; round += 1) {
    let added = false;
    for (const bucket of buckets) {
      if (round < bucket.length) {
        ordered.push(bucket[round]);
        added = true;
      }
    }
    if (!added) break;
  }

  const refinements = [];
  for (const candidate of ordered) {
    if (promoted.length >= maxPromotions) break;
    const sentence = String(candidate?.exactSentence || "").trim();
    if (!sentence) continue;
    const key = normalizedSentenceKey(sentence);
    const category = canonicalCategoryForLanguage(candidate.category, candidate.explanation);
    // Minimum-value threshold: understandable wording that breaks no rule is recorded as a
    // refinement rather than taking a visible slot from a meaning-impairing or recurring defect.
    const value = classifyCandidateValue(candidate);
    if (!value.visible) {
      refinements.push({
        category,
        exactSentence: sentence,
        exactProblemSpan: candidate.exactProblemSpan || "",
        score: value.score,
        // Carried so the Language Pattern Summary can state where the pattern occurs and whether it
        // recurs, without re-deriving either from the essay text.
        paragraphLocation: candidate.paragraphLocation || "",
        explanation: candidate.explanation || "",
        recurrenceKey: candidate.recurringPatternKey || ""
      });
      continue;
    }
    // Already represented by an existing canonical issue on the same sentence — but only when that
    // issue targets the SAME span. Two distinct defects in one sentence are two distinct issues.
    if (coveredSentences.has(key)) continue;
    // A recurring mechanical pattern is represented once, not per occurrence.
    const recurrence = String(candidate.recurringPatternKey || "");
    const mechanical = ["Punctuation", "Article Control"].includes(category);
    if (mechanical && recurrence && usedRecurrence.has(recurrence)) continue;
    if (recurrence) usedRecurrence.add(recurrence);
    coveredSentences.add(key);
    promoted.push(buildPromotedIssue(candidate, promoted.length + 1, thai));
  }
  // Refinements are returned, not discarded: they feed the compact Language Pattern Summary so the
  // evidence is still visible to the learner without taking a Detailed Feedback slot.
  return { issues: [...issues, ...promoted], promoted, refinements };
}

// ---------------------------------------------------------------------------
// C. Canonical deduplication (stable identity, idempotent).
// ---------------------------------------------------------------------------
// Returns a stable identity ONLY when the issue carries enough canonical detail to prove two records
// are the same defect (a signature, or a category + exact target span + evidence). Otherwise returns
// null, meaning "not provably a duplicate" — such issues are never merged. Being conservative here is
// essential: collapsing two distinct issues would silently delete real feedback.
export function canonicalIssueIdentity(issue = {}) {
  const norm = (v) => String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (issue.issueSignature) return `sig:${norm(issue.issueSignature)}`;
  const category = norm(issue.primaryCategory || issue.issueCategory);
  const evidence = norm(issue.exactEvidence || issue.exactSentence);
  const start = issue.targetStartOffset;
  const end = issue.targetEndOffset;
  const hasSpan = Number.isFinite(Number(start)) && Number.isFinite(Number(end)) && String(start) !== "" && String(end) !== "";
  if (!category || !evidence || !hasSpan) return null;
  return ["k", norm(issue.taskType), norm(issue.paragraphId || issue.sourceParagraphId), norm(issue.sentenceIndex), category, norm(start), norm(end), norm(issue.evidenceAssertionType)].join("|");
}

// Merge exact duplicates only. Independent defects on the same sentence differ in category, target
// span or assertion, so their identities differ and they are preserved.
export function dedupeCanonicalIssues(issues = []) {
  const byIdentity = new Map();
  const out = [];
  for (const issue of issues) {
    const identity = canonicalIssueIdentity(issue);
    // No provable identity → never merged (keeps distinct defects that lack canonical detail).
    if (!identity) {
      out.push({ ...issue, mergedCandidateIds: dedupeStrings(issue.mergedCandidateIds || []) });
      continue;
    }
    const existing = byIdentity.get(identity);
    if (!existing) {
      const kept = { ...issue, mergedCandidateIds: dedupeStrings(issue.mergedCandidateIds || []) };
      byIdentity.set(identity, kept);
      out.push(kept);
      continue;
    }
    existing.mergedCandidateIds = dedupeStrings([...(existing.mergedCandidateIds || []), ...(issue.mergedCandidateIds || []), issue.issueId].filter(Boolean).filter((id) => id !== existing.issueId));
  }
  return out;
}

// ---------------------------------------------------------------------------
// D. Priority ordering (single algorithm shared by every section).
// ---------------------------------------------------------------------------
// The severity weights and category tiers now live in domain/canonicalIssueGraph.js, which owns the
// single comparator every section sorts by. Duplicating them here is what allowed the Executive
// Summary and Top Issues to disagree in production.

// Retained as a numeric convenience for callers that need a single sortable value. It is derived
// from the SHARED comparator in domain/canonicalIssueGraph.js so it can never disagree with the
// order the report actually renders.
export function issuePriorityScore(issue = {}) {
  // Base 16 with a 15 clamp: the category tier reaches 12, so a base-8 fold would collapse every
  // tier above 7 to the same value and silently lose the ordering the comparator computed.
  const key = canonicalPriorityKey(issue);
  return key.reduce((total, part) => total * 16 + Math.min(15, Math.max(0, part)), 0);
}

// Top issues reference their detailed card by a 1-based positional id ("card-N"). Correcting and
// deduplicating the canonical layer changes those positions, so every top issue must be re-linked to
// the index its card actually occupies, kept consistent with the corrected card, de-duplicated, and
// ordered by the shared priority algorithm. A top issue whose card was merged away is dropped.
export function relinkTopIssues(topIssues = [], originalCards = [], finalCards = []) {
  const locate = (card) => {
    if (!card) return -1;
    let index = finalCards.indexOf(card);
    if (index >= 0) return index;
    if (card.issueId) {
      index = finalCards.findIndex((item) => item.issueId && item.issueId === card.issueId);
      if (index >= 0) return index;
    }
    const identity = canonicalIssueIdentity(card);
    if (identity) {
      index = finalCards.findIndex((item) => canonicalIssueIdentity(item) === identity);
      if (index >= 0) return index;
    }
    // The card was merged into an earlier duplicate.
    return finalCards.findIndex((item) => (item.mergedCandidateIds || []).includes(card.issueId));
  };

  const linked = [];
  const seenCards = new Set();
  for (const top of Array.isArray(topIssues) ? topIssues : []) {
    const match = String(top?.feedbackCardId || "").match(/^card-(\d+)$/);
    const originalCard = match ? originalCards[Number(match[1]) - 1] : null;
    const index = locate(originalCard);
    if (index < 0) continue;
    if (seenCards.has(index)) continue;
    seenCards.add(index);
    const card = finalCards[index];
    // Project the CONTENT wholly from the canonical card, keyed by its identity. Carrying the old
    // top-issue object forward was the cause of the production cross-contamination: when two issues
    // share one sentence, re-linking kept the previous issue's Student Action while adopting the new
    // issue's category, so a Lexical Precision card rendered the Subject-Verb Agreement action.
    // Only presentation-level fields the engine chose (ordering hints) may survive.
    linked.push({
      ...projectCanonicalIssueForDisplay(card),
      feedbackCardId: `card-${index + 1}`
    });
  }
  return linked.sort((a, b) => {
    const cardA = finalCards[Number(String(a.feedbackCardId).slice(5)) - 1];
    const cardB = finalCards[Number(String(b.feedbackCardId).slice(5)) - 1];
    return issuePriorityScore(cardA) - issuePriorityScore(cardB);
  });
}

// Builds the visible Top Issues straight from the corrected canonical set, so promoted evidence can
// reach the summary and a single local repair cannot occupy every slot. Each entry is stamped with
// the positional card link the report validator requires.
// Every visible projection of a canonical issue is built HERE, from the issue itself. A section that
// needs a card must call this rather than assembling one from whatever object it happens to hold, so
// the category, target span, diagnosis, Student Action and revision state can never drift apart.
export function projectCanonicalIssueForDisplay(issue = {}) {
  const category = issue.issueCategory || issue.primaryCategory || "";
  const evidenceLocations = Array.isArray(issue.evidenceLocations) ? issue.evidenceLocations : [];
  const fallbackLocation = issue.paragraphLocation || issue.paragraphLabel || "";
  const fallbackEvidence = issue.exactEvidence || issue.exactSentence || "";
  // The traceability fields the report contract requires. Derived from the canonical issue's own
  // evidence so they can never point at another issue's sentence.
  const paragraphLocations = evidenceLocations.length
    ? [...new Set(evidenceLocations.map((item) => item.paragraphLocation).filter(Boolean))]
    : (fallbackLocation ? [fallbackLocation] : []);
  const evidenceItems = evidenceLocations.length
    ? evidenceLocations.map((item, index) => ({
        paragraphLocation: item.paragraphLocation,
        exactSentence: item.exactEvidence,
        evidenceRole: index === 0 ? "Primary evidence" : "Additional occurrence"
      }))
    : (fallbackEvidence ? [{ paragraphLocation: fallbackLocation, exactSentence: fallbackEvidence, evidenceRole: "Primary evidence" }] : []);
  return {
    scope: issue.evidenceScope || issue.scope || "single-location",
    paragraphLocations,
    evidenceItems,
    evidenceLocations,
    evidenceScope: issue.evidenceScope || issue.scope || "single-location",
    affectedCriteria: issue.criteriaAffected || issue.affectedCriteria || issue.criteria || [],
    criteriaAffected: issue.criteriaAffected || issue.affectedCriteria || issue.criteria || [],
    issueId: issue.issueId,
    issueCategory: category,
    primaryCategory: issue.primaryCategory || category,
    secondaryCategories: issue.secondaryCategories || [],
    issueType: issue.issueType || category,
    title: issue.title || category,
    severity: issue.severity,
    criteria: issue.criteria || [],
    framework: issue.framework || [],
    summary: issue.summary || issue.whyItLimitsBand || issue.diagnosis || "",
    exactSentence: issue.exactSentence || issue.exactEvidence || "",
    exactEvidence: issue.exactEvidence || issue.exactSentence || "",
    targetSpan: issue.targetSpan || "",
    paragraphLocation: issue.paragraphLocation || issue.paragraphLabel || "",
    paragraphLabel: issue.paragraphLabel || issue.paragraphLocation || "",
    sentenceFunction: issue.sentenceFunction || "",
    diagnosis: issue.diagnosis || "",
    kruPomDiagnosis: issue.kruPomDiagnosis || issue.diagnosis || "",
    whyItLimitsBand: issue.whyItLimitsBand || issue.diagnosis || "",
    // The four fields that were cross-contaminating in production.
    studentAction: issue.studentAction || "",
    revisionType: issue.revisionType || "",
    targetedRevision: issue.targetedRevision || "",
    revisionWithheld: issue.revisionWithheld === true,
    revisionAlignmentStatus: issue.revisionAlignmentStatus || "",
    revisionTypeValidationStatus: issue.revisionTypeValidationStatus || "",
    whyRevisionIsStronger: issue.whyRevisionIsStronger || "",
    whyRevisionIsNotShown: issue.whyRevisionIsNotShown || ""
  };
}

export function buildTopIssuesFromCanonical(finalCards = [], prioritised = [], limit = 3) {
  const out = [];
  for (const issue of prioritised) {
    if (out.length >= limit) break;
    const index = finalCards.indexOf(issue);
    if (index < 0) continue;
    out.push({
      ...projectCanonicalIssueForDisplay(issue),
      feedbackCardId: `card-${index + 1}`
    });
  }
  return out;
}

// One order for every section. Delegates to the shared comparator rather than re-implementing it.
export function orderIssuesByPriority(issues = []) {
  return orderCanonicalIssues(issues);
}

// ---------------------------------------------------------------------------
// E. Sentence-function projection + revision-type fidelity.
// ---------------------------------------------------------------------------
const ROLE_FUNCTION_TEXT = {
  cause_route: "introduces a cause that the paragraph goes on to explain",
  solution_route: "introduces a solution that the paragraph goes on to develop",
  thesis_route: "states the routes the essay will follow",
  thesis: "states the routes the essay will follow",
  position: "states the writer's position",
  body_topic_sentence: "states the paragraph's controlling idea",
  causal_mechanism: "explains how one step leads to the next",
  result: "states the result of the preceding step",
  consequence: "states the wider consequence of the preceding step",
  example: "gives a supporting example",
  evidence: "supplies supporting evidence",
  explanation: "explains the controlling idea",
  paragraph_closing_sentence: "closes the paragraph",
  link_back: "links the point back to the controlling idea",
  conclusion_summary: "summarises the established routes",
  conclusion_position: "restates the position",
  overview: "gives the overview of the visual",
  data_sentence: "reports data from the visual",
  fragment: "is incomplete and does not yet state a full idea"
};

// Student-facing sentence function derived from the validated canonical role. Never exposes enums.
export function projectSentenceFunction(issue = {}) {
  const roles = [issue.sentenceRole, ...(issue.secondarySentenceRoles || [])].filter(Boolean).map(String);
  const parts = dedupeStrings(roles.map((role) => ROLE_FUNCTION_TEXT[role]).filter(Boolean));
  if (!parts.length) return "";
  // Keep the projection readable: the primary role plus at most one supporting role.
  const shown = parts.slice(0, 2);
  return shown.length === 1 ? `This sentence ${shown[0]}.` : `This sentence ${shown[0]}, and ${shown[1]}.`;
}

// Builds a specific, teachable Student Action from the canonical repair target when the recorded one
// is too generic to pass validation. Derived from the issue's own data — never fixture wording.
// A target is only safe to quote back to the student when it is short and not repetitive: quoting a
// long or repeating span would produce guidance that reads as duplicated generated text.
function safeQuotableTarget(value) {
  const target = String(value || "").trim();
  if (!target || target.length > 60) return "";
  const tokens = target.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length > 8) return "";
  const stems = tokens.map((t) => t.replace(/\d+$/, ""));
  if (stems.length > 2 && new Set(stems).size < stems.length) return ""; // repeated/filler pattern
  return target;
}

export function buildSpecificStudentAction(issue = {}) {
  const location = String(issue.paragraphLabel || issue.paragraphLocation || "").trim();
  const where = location ? `In ${location}, ` : "";
  const target = safeQuotableTarget(issue.repairTargets?.[0]?.target || issue.targetSpan);
  const category = String(issue.primaryCategory || issue.issueCategory || "");
  if (LEXICAL_CATEGORIES.has(category) && target) {
    return `${where}replace "${target}" with a term whose ordinary meaning matches the idea you intend, and keep the rest of the sentence unchanged.`;
  }
  if (category === "Countability" && target) {
    return `${where}correct the noun phrase "${target}" so the article matches whether the noun is countable in this meaning.`;
  }
  return "";
}

// A revision only counts as adding a NEW affected group when it names a group/actor absent from the
// original. Rewording an existing referent ("ways to travel" → "public transport options") is a
// clarification, not a new group — the false positive that mislabelled Route-Preserving revisions.
export function revisionAddsNewAffectedGroup(original = "", revision = "") {
  const groupWords = /\b(?:students?|children|adults?|elderly|workers?|employees?|drivers?|commuters?|residents?|citizens?|families|parents?|women|men|patients?|farmers?|tourists?|governments?|companies|businesses)\b/gi;
  const inOriginal = new Set((String(original).match(groupWords) || []).map((w) => w.toLowerCase().replace(/s$/, "")));
  const inRevision = new Set((String(revision).match(groupWords) || []).map((w) => w.toLowerCase().replace(/s$/, "")));
  for (const group of inRevision) {
    if (!inOriginal.has(group)) return true;
  }
  return false;
}

// Re-decide revision type when the only recorded objection was a false new-affected-group claim.
export function correctRevisionType(issue = {}) {
  const problems = Array.isArray(issue.revisionQualityProblems) ? issue.revisionQualityProblems : [];
  const groupClaim = problems.find((p) => /new affected group/i.test(String(p?.message || "")));
  if (!groupClaim) return { issue, changed: false };
  const original = String(issue.exactEvidence || issue.exactSentence || "");
  const revision = String(issue.targetedRevision || "");
  if (revisionAddsNewAffectedGroup(original, revision)) return { issue, changed: false };
  const remaining = problems.filter((p) => p !== groupClaim);
  return {
    issue: {
      ...issue,
      revisionType: "Route-Preserving Revision",
      revisionQualityProblems: remaining,
      revisionTypeValidationStatus: remaining.length ? issue.revisionTypeValidationStatus : "pass",
      revisionTypeCorrection: { from: issue.revisionType, to: "Route-Preserving Revision", reason: "no-new-affected-group", version: CANONICAL_INTEGRITY_VERSION }
    },
    changed: true
  };
}

// ---------------------------------------------------------------------------
// F. Student Action validation: exact-repair mode OR precise-operation mode.
// ---------------------------------------------------------------------------
export function validateStudentAction(action = "", issue = {}) {
  const text = String(action || "").trim();
  if (!text) return { pass: false, mode: "none", problems: ["Student Action is missing."] };
  const lower = text.toLowerCase();
  // Mode A: names the exact repair (a quoted target, or an explicit replace/remove/insert instruction).
  const namesTarget = /["“'][^"”']{2,60}["”']/.test(text);
  const exactOperation = /\b(?:replace|remove|delete|insert|add|change)\b/.test(lower) && namesTarget;
  // Mode B: a precise learner operation anchored to a location AND a grammatical/semantic operation.
  const namesLocation = /\b(?:body paragraph|introduction|conclusion|paragraph|sentence)\s*\d*\b/.test(lower);
  const namesOperation = /\b(?:main clause|independent clause|finite (?:main )?verb|subject|complete sentence|cause|mechanism|result|consequence|chain|antecedent|article|uncountable)\b/.test(lower);
  const preservesIdea = /\b(?:preserv|keep|retain|same (?:idea|claim|route|meaning))/.test(lower);
  // Generic filler that names no target and no operation is never sufficient.
  const genericOnly = /\b(?:revise|improve|rewrite|fix|correct)\b/.test(lower) && !namesTarget && !namesOperation;
  if (exactOperation) return { pass: true, mode: "exact-repair", problems: [] };
  if (namesLocation && namesOperation && (preservesIdea || /\b(?:turn|build|complete|rewrite)\b/.test(lower))) {
    return { pass: true, mode: "precise-operation", problems: [] };
  }
  if (genericOnly) return { pass: false, mode: "generic", problems: ["Student Action is generic: it does not identify the target wording, the problem or an acceptable correction frame."] };
  return { pass: false, mode: "insufficient", problems: ["Student Action does not identify the local repair span or a precise learner operation."] };
}

// ---------------------------------------------------------------------------
// G. Executive Summary frequency claims must match validated evidence counts.
// ---------------------------------------------------------------------------
const FREQUENCY_TERMS = /\b(frequent|frequently|widespread|persistent|repeated|recurring|numerous|many|constant)\b/gi;

// Downgrades unsupported frequency language. A family needs >= 3 validated occurrences to be
// "recurring"; 2 is "several"; 1 is a single local issue.
export function correctSummaryFrequency(text = "", issues = []) {
  const source = String(text || "");
  if (!source) return { text: source, changed: false };
  const counts = new Map();
  for (const issue of issues) {
    const family = String(issue.primaryCategory || issue.issueCategory || "").toLowerCase();
    counts.set(family, (counts.get(family) || 0) + 1);
  }
  const maxFamily = Math.max(0, ...counts.values());
  if (maxFamily >= 3) return { text: source, changed: false };
  const replacement = maxFamily === 2 ? "several" : "a small number of";
  const corrected = source.replace(FREQUENCY_TERMS, replacement);
  return { text: corrected, changed: corrected !== source, maxFamilyOccurrences: maxFamily };
}

// ---------------------------------------------------------------------------
// Orchestration: one pass over the canonical layer, in the required pipeline order.
// ---------------------------------------------------------------------------
export function applyCanonicalIntegrity({ issues = [], topIssues = [], executiveSummary = {}, routePresent = true, languageProfile = null, developmentEvidence = null, maxPromotions = 6, reportLanguage = "en" } = {}) {
  const corrections = [];
  // Defensive: never throw into an analysis. A non-array (or absent) issue list is returned untouched.
  if (!Array.isArray(issues)) {
    return { issues: [], prioritised: [], topIssues: [], executiveSummary: { ...executiveSummary }, corrections, version: CANONICAL_INTEGRITY_VERSION };
  }
  const originalCards = issues;
  // 4a. Canonical development evidence is promoted FIRST, so a task-level gap is available to every
  // downstream section and outranks local language repairs in the shared priority algorithm.
  if (developmentEvidence) {
    const promotion = promoteDevelopmentEvidence(issues, developmentEvidence, { reportLanguage });
    if (promotion.promoted.length) {
      issues = promotion.issues;
      corrections.push({ code: "DEVELOPMENT_EVIDENCE_PROMOTED", count: promotion.promoted.length });
    }
  }
  // 4b. Candidate promotion (defect F) — before deduplication and priority selection, so promoted
  // evidence competes fairly and downstream sections (coverage, repair plan) see the full set.
  let promotedIssues = [];
  // Lower-value language evidence that did not earn a visible card. Returned to the caller so the
  // printable projection can render it as a compact Language Pattern Summary instead of discarding
  // it — see domain/reportDensity.js.
  let refinements = [];
  if (languageProfile) {
    const promotion = promoteLanguageCandidates(issues, languageProfile, { maxPromotions, reportLanguage });
    promotedIssues = promotion.promoted;
    refinements = promotion.refinements || [];
    if (promotedIssues.length) {
      issues = promotion.issues;
      corrections.push({ code: "LANGUAGE_CANDIDATES_PROMOTED", count: promotedIssues.length });
    }
  }
  // 6. Taxonomy alignment + evidence assertion
  let working = issues.map((issue) => {
    const { issue: taxo, changed, reason } = correctIssueTaxonomy(issue, { routePresent });
    if (changed) corrections.push({ issueId: issue.issueId, code: "TAXONOMY_CORRECTED", reason });
    return taxo;
  });
  // 6b. Lexical issues must not be anchored to a grammatical function word (defect D).
  working = working.map((issue) => {
    const { issue: retargeted, changed } = correctLexicalTargetSpan(issue);
    if (changed) corrections.push({ issueId: issue.issueId, code: "LEXICAL_TARGET_RETARGETED" });
    return retargeted;
  });
  // 8. Revision validation (false new-affected-group)
  working = working.map((issue) => {
    const { issue: rev, changed } = correctRevisionType(issue);
    if (changed) corrections.push({ issueId: issue.issueId, code: "REVISION_TYPE_CORRECTED" });
    return rev;
  });
  // 8b. A revision whose validator failed must never reach the student (defect E).
  working = working.map((issue) => {
    const { issue: enforced, changed, mode } = enforceRevisionValidation(issue);
    if (changed) corrections.push({ issueId: issue.issueId, code: mode === "withheld" ? "REVISION_WITHHELD" : "REVISION_RELABELLED" });
    return enforced;
  });
  // 7. Student Action validation (+ regeneration from canonical data) and sentence-function projection
  working = working.map((issue) => {
    let action = issue.studentAction;
    let validation = validateStudentAction(action, issue);
    if (!validation.pass) {
      // A generic action is replaced with a specific one built from this issue's own repair target,
      // so the corrected taxonomy produces guidance the student can actually act on.
      const rebuilt = buildSpecificStudentAction(issue);
      const rebuiltValidation = rebuilt ? validateStudentAction(rebuilt, issue) : null;
      if (rebuiltValidation?.pass) {
        corrections.push({ issueId: issue.issueId, code: "STUDENT_ACTION_REGENERATED" });
        action = rebuilt;
        validation = rebuiltValidation;
      }
    }
    const next = { ...issue, studentAction: action, studentActionValidation: validation };
    // Only fill the student-facing sentence function when it is missing or explicitly undetermined
    // (defect E). An existing, meaningful value is left exactly as the engine produced it.
    const current = String(issue.sentenceFunction || "").trim();
    const undetermined = !current || /could not be determined|not determined|unknown/i.test(current);
    if (undetermined) {
      const projected = projectSentenceFunction(issue);
      if (projected) {
        next.sentenceFunction = projected;
        if (current) corrections.push({ issueId: issue.issueId, code: "SENTENCE_FUNCTION_PROJECTED" });
      }
    }
    return next;
  });
  // 8c. Revision-withholding contract: a card with no revision must not carry prose describing one.
  working = working.map((issue) => {
    const { issue: contracted, changed } = applyRevisionWithholdingContract(issue);
    if (changed) corrections.push({ issueId: issue.issueId, code: "WITHHOLDING_CONTRACT_APPLIED" });
    return contracted;
  });
  // 9. Canonical deduplication
  const beforeDedupe = working.length;
  working = dedupeCanonicalIssues(working);
  if (working.length !== beforeDedupe) corrections.push({ code: "DUPLICATE_ISSUES_MERGED", removed: beforeDedupe - working.length });
  // 10. Priority ordering. Detailed feedback keeps DOCUMENT order (students read it against their
  // essay, and Task 1 report validation depends on that order); the priority order drives Top Issues,
  // Most Urgent Repair and the Repair Plan, which is where defect D actually appears.
  const prioritised = orderIssuesByPriority(working);
  // 13. Executive Summary
  const summary = { ...executiveSummary };
  const mainCorrection = correctSummaryFrequency(summary.mainScoreLimitingFactor, working);
  if (mainCorrection.changed) {
    summary.mainScoreLimitingFactor = mainCorrection.text;
    corrections.push({ code: "SUMMARY_FREQUENCY_CORRECTED" });
  }
  // Re-link Top Issues to the positions their cards actually occupy after correction/dedupe, keep them
  // consistent with those cards, and order them by the shared priority algorithm.
  const relinkedTopIssues = relinkTopIssues(topIssues, originalCards, working);
  return { issues: working, prioritised, topIssues: relinkedTopIssues, executiveSummary: summary, corrections, refinements, version: CANONICAL_INTEGRITY_VERSION };
}

function dedupeStrings(values = []) {
  return [...new Set(values.map((v) => String(v)).filter(Boolean))];
}
