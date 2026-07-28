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
  return "Grammar and Sentence Control";
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
  const category = canonicalCategoryForLanguage(candidate.category, candidate.explanation);
  const sentence = String(candidate.exactSentence || "").trim();
  const location = String(candidate.paragraphLocation || "").trim();
  const severity = severityForCandidate(candidate);
  const span = String(candidate.exactProblemSpan || "").trim();
  const withheldNote = thai ? THAI_WITHHELD_NOTE : WITHHELD_REVISION_NOTE;
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
    evidenceScope: "single",
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
    evidenceScope: "single",
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

// Selects which validated candidates deserve promotion. Meaning-affecting evidence is always
// considered; purely mechanical patterns are represented once rather than card-per-occurrence.
export function promoteLanguageCandidates(issues = [], languageProfile = {}, { maxPromotions = 6, reportLanguage = "en" } = {}) {
  const thai = String(reportLanguage).toLowerCase() === "th";
  const sources = [
    ...(Array.isArray(languageProfile.validatedIssues) ? languageProfile.validatedIssues : []),
    ...(Array.isArray(languageProfile.meaningImpairingErrors) ? languageProfile.meaningImpairingErrors : []),
    ...(Array.isArray(languageProfile.clearErrors) ? languageProfile.clearErrors : [])
  ];
  if (!sources.length) return { issues, promoted: [] };

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

  for (const candidate of ordered) {
    if (promoted.length >= maxPromotions) break;
    const sentence = String(candidate?.exactSentence || "").trim();
    if (!sentence) continue;
    const key = normalizedSentenceKey(sentence);
    const category = canonicalCategoryForLanguage(candidate.category, candidate.explanation);
    // Already represented by an existing canonical issue on the same sentence.
    if (coveredSentences.has(key)) continue;
    // A recurring mechanical pattern is represented once, not per occurrence.
    const recurrence = String(candidate.recurringPatternKey || "");
    const mechanical = ["Punctuation", "Article Control"].includes(category);
    if (mechanical && recurrence && usedRecurrence.has(recurrence)) continue;
    if (recurrence) usedRecurrence.add(recurrence);
    coveredSentences.add(key);
    promoted.push(buildPromotedIssue(candidate, promoted.length + 1, thai));
  }
  return { issues: [...issues, ...promoted], promoted };
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
const SEVERITY_WEIGHT = { critical: 0, major: 1, moderate: 2, "minor repair": 3, minor: 3, "pass / strong": 9 };
// Canonical repair priority (V12.9.1). The order is pedagogical, not alphabetical:
//   1 task misunderstanding / missing required function
//   2 missing or insufficient comparative judgement
//   3 declared but undeveloped thesis promise
//   4 meaning-impaired language
//   5 incomplete causal mechanism or affected group
//   6 reference or sentence-structure problem
//   7 recurring grammar or collocation pattern
//   8 local mechanical error
const CATEGORY_TIER = [
  { tier: 0, test: (c) => /Task Understanding|Visual Understanding|Task Achievement/i.test(c) },
  { tier: 1, test: (c) => /Overview|Position Clarity|Route Clarity|Route Alignment|Prompt Coverage/i.test(c) },
  { tier: 2, test: (c) => /Comparative Judgement|Comparative Weighing/i.test(c) },
  { tier: 3, test: (c) => /Thesis-to-Body Promise|Undeveloped Promise|Broken Promise/i.test(c) },
  { tier: 4, test: (c) => /Incomplete|Underlength|Completion Status/i.test(c) },
  { tier: 5, test: (c) => /Sentence Completion/i.test(c) },
  { tier: 6, test: (c) => /Meaning Control/i.test(c) },
  { tier: 7, test: (c) => /Causal Mechanism|Solution Mechanism|Explanation Depth|Affected-Group|SAR Example Quality|Example Development/i.test(c) },
  { tier: 8, test: (c) => /Reference|Pronoun|Sentence Structure|Modifier/i.test(c) },
  { tier: 9, test: (c) => /Lexical Precision|Word Choice|Word Form|Collocation/i.test(c) },
  { tier: 10, test: (c) => /Grammar|Agreement|Tense|Preposition|Modal|Article/i.test(c) },
  { tier: 11, test: (c) => /Countability|Punctuation|Concision|Academic Tone/i.test(c) }
];

export function issuePriorityScore(issue = {}) {
  const category = String(issue.primaryCategory || issue.issueCategory || "");
  const severity = SEVERITY_WEIGHT[String(issue.severity || "moderate").toLowerCase()] ?? 2;
  const tier = (CATEGORY_TIER.find((entry) => entry.test(category)) || { tier: 10 }).tier;
  // Severity dominates (a Major defect never sits below a Moderate one); the category tier breaks ties.
  return severity * 100 + tier;
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
    // Keep the top issue's own shape; only the link and the fields the validator compares are synced.
    linked.push({
      ...top,
      feedbackCardId: `card-${index + 1}`,
      issueCategory: card.issueCategory || top.issueCategory,
      severity: card.severity || top.severity
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
export function buildTopIssuesFromCanonical(finalCards = [], prioritised = [], limit = 3) {
  const out = [];
  for (const issue of prioritised) {
    if (out.length >= limit) break;
    const index = finalCards.indexOf(issue);
    if (index < 0) continue;
    out.push({
      feedbackCardId: `card-${index + 1}`,
      issueId: issue.issueId,
      issueCategory: issue.issueCategory || issue.primaryCategory,
      secondaryCategories: issue.secondaryCategories || [],
      issueType: issue.issueType || issue.issueCategory || issue.primaryCategory,
      title: issue.title || issue.issueCategory || issue.primaryCategory,
      severity: issue.severity,
      criteria: issue.criteria || [],
      framework: issue.framework || [],
      summary: issue.summary || issue.whyItLimitsBand || issue.diagnosis || "",
      exactSentence: issue.exactSentence || issue.exactEvidence || "",
      paragraphLocation: issue.paragraphLocation || issue.paragraphLabel || "",
      whyItLimitsBand: issue.whyItLimitsBand || issue.diagnosis || ""
    });
  }
  return out;
}

export function orderIssuesByPriority(issues = []) {
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => {
      const pa = issuePriorityScore(a.issue);
      const pb = issuePriorityScore(b.issue);
      return pa === pb ? a.index - b.index : pa - pb;
    })
    .map((entry) => entry.issue);
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
  if (languageProfile) {
    const promotion = promoteLanguageCandidates(issues, languageProfile, { maxPromotions, reportLanguage });
    promotedIssues = promotion.promoted;
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
  return { issues: working, prioritised, topIssues: relinkedTopIssues, executiveSummary: summary, corrections, version: CANONICAL_INTEGRITY_VERSION };
}

function dedupeStrings(values = []) {
  return [...new Set(values.map((v) => String(v)).filter(Boolean))];
}
