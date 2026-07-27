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
const CATEGORY_TIER = [
  { tier: 0, test: (c) => /Task Understanding|Visual Understanding|Task Achievement/i.test(c) },
  { tier: 1, test: (c) => /Overview|Position Clarity|Route Clarity|Route Alignment|Prompt Coverage/i.test(c) },
  { tier: 2, test: (c) => /Incomplete|Underlength|Completion Status/i.test(c) },
  { tier: 3, test: (c) => /Sentence Completion/i.test(c) },
  { tier: 4, test: (c) => /Causal Mechanism|Solution Mechanism|Explanation Depth/i.test(c) },
  { tier: 5, test: (c) => /Meaning Control|Lexical Precision|Word Choice|Word Form|Collocation/i.test(c) },
  { tier: 6, test: (c) => /Grammar|Agreement|Tense|Reference|Pronoun|Preposition|Modal|Article/i.test(c) },
  { tier: 7, test: (c) => /Countability|Punctuation|Concision|Academic Tone/i.test(c) }
];

export function issuePriorityScore(issue = {}) {
  const category = String(issue.primaryCategory || issue.issueCategory || "");
  const severity = SEVERITY_WEIGHT[String(issue.severity || "moderate").toLowerCase()] ?? 2;
  const tier = (CATEGORY_TIER.find((entry) => entry.test(category)) || { tier: 6 }).tier;
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
export function applyCanonicalIntegrity({ issues = [], topIssues = [], executiveSummary = {}, routePresent = true } = {}) {
  const corrections = [];
  // Defensive: never throw into an analysis. A non-array (or absent) issue list is returned untouched.
  if (!Array.isArray(issues)) {
    return { issues: [], prioritised: [], topIssues: [], executiveSummary: { ...executiveSummary }, corrections, version: CANONICAL_INTEGRITY_VERSION };
  }
  const originalCards = issues;
  // 6. Taxonomy alignment + evidence assertion
  let working = issues.map((issue) => {
    const { issue: taxo, changed, reason } = correctIssueTaxonomy(issue, { routePresent });
    if (changed) corrections.push({ issueId: issue.issueId, code: "TAXONOMY_CORRECTED", reason });
    return taxo;
  });
  // 8. Revision validation (false new-affected-group)
  working = working.map((issue) => {
    const { issue: rev, changed } = correctRevisionType(issue);
    if (changed) corrections.push({ issueId: issue.issueId, code: "REVISION_TYPE_CORRECTED" });
    return rev;
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
