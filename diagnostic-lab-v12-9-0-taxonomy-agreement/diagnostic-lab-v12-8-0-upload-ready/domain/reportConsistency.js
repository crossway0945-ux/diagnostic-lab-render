import { validateCanonicalIssueAlignment } from "./issueContract.js";

const CATEGORY_CLAIMS = Object.freeze({
  spelling: ["Spelling"],
  punctuation: ["Punctuation"],
  article: ["Article Control", "Countability"],
  articles: ["Article Control", "Countability"],
  agreement: ["Subject-Verb Agreement", "Agreement"],
  grammar: ["Grammar and Sentence Control", "Sentence Completion", "Subject-Verb Agreement", "Agreement", "Article Control", "Countability", "Preposition Control", "Tense Control", "Punctuation"],
  vocabulary: ["Lexical Precision", "Word Choice", "Word Form", "Collocation", "Meaning Control"],
  lexical: ["Lexical Precision", "Word Choice", "Word Form", "Collocation", "Meaning Control"],
  collocation: ["Collocation"],
  countability: ["Countability"],
  mechanism: ["Causal Mechanism", "Solution Mechanism"],
  example: ["Example Development", "SAR Example Quality"],
  closure: ["Paragraph Closure", "Conclusion Closure", "Sentence Completion"],
  thesis: ["Thesis Route Clarity", "Cause Route Clarity", "Solution Route Clarity", "Position Clarity"],
  route: ["Thesis Route Clarity", "Cause Route Clarity", "Solution Route Clarity", "Body Route Alignment", "Prompt Coverage"],
  overview: ["Overview Quality", "Overview Accuracy"],
  data: ["Data Accuracy", "Data Selection", "Comparison Precision", "Magnitude Precision"]
});

// Shared canonical repair priority (V12.9.1). Task-level defects — a comparative judgement that was
// never demonstrated, a thesis promise no body develops — outrank every local language repair, so a
// single agreement correction can never lead the Repair Plan or the Most Urgent Repair.
const PRIORITY_ORDER = Object.freeze([
  "Visual Understanding", "Sentence Completion", "Prompt Coverage", "Overview Accuracy", "Overview Quality", "Data Accuracy",
  "Position Clarity", "Thesis Route Clarity", "Cause Route Clarity", "Solution Route Clarity",
  "Body Route Alignment", "Comparative Judgement", "Thesis-to-Body Promise",
  "Causal Mechanism", "Solution Mechanism", "Explanation Depth",
  "Example Development", "SAR Example Quality", "Meaning Control", "Lexical Precision",
  "Reference Control", "Pronoun Control",
  "Grammar and Sentence Control", "Countability", "Article Control",
  "Subject-Verb Agreement", "Agreement", "Collocation", "Word Choice", "Punctuation"
]);

export function reconcileExecutiveSummary({
  mainScoreLimitingFactor = "",
  mostUrgentRepair = "",
  issues = [],
  topIssueIds = []
} = {}) {
  const byId = new Map(issues.map((issue) => [issue.issueId, issue]));
  const top = topIssueIds.map((id) => byId.get(id)).filter(Boolean);
  const ranked = rankIssues(top.length ? top : issues);
  const unsupportedMain = unsupportedSummaryClaims(mainScoreLimitingFactor, issues);
  const unsupportedUrgent = unsupportedSummaryClaims(mostUrgentRepair, issues);
  const main = unsupportedMain.length || !String(mainScoreLimitingFactor || "").trim()
    ? buildMainScoreLimiter(ranked)
    : String(mainScoreLimitingFactor).trim();
  const urgent = unsupportedUrgent.length || !String(mostUrgentRepair || "").trim()
    ? buildUrgentRepair(ranked)
    : String(mostUrgentRepair).trim();
  return {
    mainScoreLimitingFactor: main,
    mostUrgentRepair: urgent,
    mainIssueIds: ranked.slice(0, 3).map((issue) => issue.issueId),
    urgentIssueIds: ranked.slice(0, 2).map((issue) => issue.issueId),
    repairedClaims: [
      ...unsupportedMain.map((claim) => ({ section: "mainScoreLimitingFactor", claim })),
      ...unsupportedUrgent.map((claim) => ({ section: "mostUrgentRepair", claim }))
    ]
  };
}

export function unsupportedSummaryClaims(text = "", issues = []) {
  const value = normalize(text);
  if (!value) return [];
  const categories = new Set(issues.flatMap((issue) => [issue.issueCategory, ...(issue.secondaryIssueCategories || [])]));
  const unsupported = [];
  for (const [claim, supportedCategories] of Object.entries(CATEGORY_CLAIMS)) {
    const pattern = new RegExp(`\\b${escapeRegExp(claim)}(?:s|ing)?\\b`, "i");
    const match = pattern.exec(value);
    if (!match) continue;
    const context = value.slice(Math.max(0, match.index - 55), Math.min(value.length, match.index + match[0].length + 55));
    if (/\b(?:controlled|aligned|clear|strong|present|secure|preserv(?:e|ed)|maintain|keep|same|existing|not (?:a |an )?(?:problem|issue|limiter|weakness)|no (?:serious|material|major))\b/.test(context)) continue;
    if (!supportedCategories.some((category) => categories.has(category))) unsupported.push(claim);
  }
  if (/\brecurr(?:ing|ent|ence)|repeated|throughout\b/i.test(text) && !issues.some((issue) => Number(issue.evidenceCount || 1) > 1)) {
    unsupported.push("recurring");
  }
  return [...new Set(unsupported)];
}

export function auditReportConsistency(model = {}) {
  const findings = [];
  const issues = Array.isArray(model.issues) ? model.issues : [];
  const byId = new Map(issues.map((issue) => [issue.issueId, issue]));
  for (const claim of unsupportedSummaryClaims(model.linkage?.mainScoreLimitingFactor, issues)) {
    findings.push(repairable("SUMMARY_CLAIM_UNSUPPORTED", `Main Score-Limiting Factor names unsupported claim "${claim}".`));
  }
  for (const claim of unsupportedSummaryClaims(model.linkage?.mostUrgentRepair, issues)) {
    findings.push(repairable("URGENT_REPAIR_UNSUPPORTED", `Most Urgent Repair names unsupported claim "${claim}".`));
  }
  for (const topIssue of model.topIssues || []) {
    if (!byId.has(topIssue.issueId)) findings.push(fatal("TOP_ISSUE_UNLINKED", `Top issue ${topIssue.issueId} is not present in Detailed Feedback.`));
  }
  for (const paragraph of model.paragraphCoverage || []) {
    const paragraphIssues = (paragraph.issueIds || []).map((id) => byId.get(id)).filter(Boolean);
    if (paragraph.priorityIssueId && !paragraphIssues.some((issue) => issue.issueId === paragraph.priorityIssueId)) {
      findings.push(fatal("PARAGRAPH_PRIORITY_UNLINKED", `${paragraph.paragraphLabel} priority repair is not linked to a paragraph issue.`));
    }
    if (!paragraphIssues.length && /repair needed|critical|weak|incomplete/i.test(String(paragraph.status || ""))) {
      findings.push(repairable("PARAGRAPH_STATUS_UNSUPPORTED", `${paragraph.paragraphLabel} has a negative status without a canonical issue.`));
    }
  }
  for (const issue of issues) {
    if (issue.evidenceValidationStatus !== "validated") findings.push(fatal("ISSUE_EVIDENCE_UNVALIDATED", `Issue ${issue.issueId} has no validated evidence assertion.`));
    if (!issue.studentActionValidation?.pass) findings.push(repairable("STUDENT_ACTION_UNSPECIFIC", `Issue ${issue.issueId} Student Action does not match its local diagnosis.`));
    const alignment = validateCanonicalIssueAlignment(issue);
    for (const problem of alignment.problems) {
      findings.push(fatal("ISSUE_CONTRACT_MISMATCH", `Issue ${issue.issueId}: ${problem}`));
    }
  }
  for (const [name, item] of Object.entries(model.frameworkScores || {})) {
    const compatibility = validateStatusExplanationCompatibility({
      name,
      status: item?.status,
      explanation: item?.diagnosis || item?.explanation
    });
    for (const problem of compatibility.problems) {
      findings.push(fatal("STATUS_EXPLANATION_CONTRADICTION", problem));
    }
  }
  const route = model.routeAssessment || {};
  const routeFailed = ["absent", "contradicted"].includes(String(route.status || route.overallRouteStatus || ""));
  const routeControlled = ["adequately_developed", "fully_extended"].includes(String(route.status || route.overallRouteStatus || ""));
  const trHigh = bandHigh(model.criteriaScores?.["Task Response"]?.range);
  if (routeFailed && Number.isFinite(trHigh) && trHigh > 5.5) {
    findings.push(fatal("ROUTE_SCORE_CONTRADICTION", "Task Response exceeds the route-failure ceiling recorded by the canonical route assessment."));
  }
  if (routeControlled && Number.isFinite(trHigh) && trHigh <= 5.5 && !(route.missingRequirements || []).length) {
    findings.push(repairable("CONTROLLED_ROUTE_SCORE_UNEXPLAINED", "Task Response is at or below 5.5 even though the canonical route is controlled and no missing requirement is recorded."));
  }
  const bodyRouteStatus = String(model.frameworkScores?.["Body Paragraph Route Alignment"]?.status || model.frameworkScores?.bodyRouteAlignment?.status || "");
  if (routeFailed && /strong/i.test(bodyRouteStatus)) {
    findings.push(fatal("ROUTE_FRAMEWORK_CONTRADICTION", "Body Route Alignment is Strong while the canonical route assessment is failed."));
  }
  const conclusionStatus = String(model.frameworkScores?.["Conclusion Closure"]?.status || model.frameworkScores?.conclusionClosure?.status || "");
  if (routeFailed && /strong/i.test(conclusionStatus)) {
    findings.push(fatal("ROUTE_CONCLUSION_CONTRADICTION", "Conclusion Closure is Strong while a required canonical route is absent or contradicted."));
  }
  return findings;
}

export function validateStatusExplanationCompatibility({ name = "", status = "", explanation = "" } = {}) {
  const state = normalize(status);
  const text = normalize(explanation)
    .replace(/\bit does not mean that [^.]+/g, " ")
    .replace(/\bthis rating assesses route alignment only\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const problems = [];
  if (!state || !text) return { pass: true, problems };
  const negativeRoute =
    /\b(?:route|position|thesis|prompt|requirement|coverage)\b.{0,55}\b(?:missing|absent|unclear|contradict(?:ory|ed)?|not shown|incomplete|repair needed|needs? work)\b/.test(text) ||
    /\b(?:missing|absent|unclear|contradict(?:ory|ed)?|not shown|incomplete)\b.{0,55}\b(?:route|position|thesis|prompt|requirement|coverage)\b/.test(text) ||
    // Allow up to two adverbs between the negation and the verb, so "does not YET establish",
    // "does not CLEARLY establish", "fails to FULLY cover" are all caught (they slipped past before).
    /\b(?:does not|doesn t|fails? to)\s+(?:\w+\s+){0,2}(?:establish|state|cover|align|trace|present|include)\b.{0,55}\b(?:route|position|thesis|prompt|requirement|judgement)\b/.test(text);
  const languageDefect = /\b(?:fragment|grammar|lexical|collocation|reference|pronoun|agreement|punctuation|countability|language repair)\b/.test(text);
  if (/\bstrong\b/.test(state) && negativeRoute) {
    problems.push(`${name || "Framework status"} is Strong but its explanation describes a missing, unclear or contradictory requirement.`);
  }
  if (/\b(?:aligned|controlled)\b/.test(state) && negativeRoute) {
    problems.push(`${name || "Framework status"} is ${status} but its explanation describes a missing or uncontrolled requirement.`);
  }
  if (/\blanguage controlled\b/.test(state) && languageDefect) {
    problems.push(`${name || "Framework status"} says Language Controlled while its explanation names a language defect.`);
  }
  if (/\bno priority repair\b/.test(state) && /\b(?:repair|error|inaccurate|imprecise|weak)\b/.test(text)) {
    problems.push(`${name || "Framework status"} says No Priority Repair while its explanation names a repair need.`);
  }
  return { pass: problems.length === 0, problems };
}

// A status-consistent explanation used to repair a contradictory framework diagnosis. The status is
// authoritative (brief §5, §8: do not change scores to fix feedback), so a positive status whose
// explanation describes a missing/uncontrolled requirement gets a status-appropriate, non-fabricating
// replacement that points the student to the detailed feedback for any specifics.
function statusCompatibleExplanation(name, status) {
  const s = normalize(status);
  const dim = String(name || "This dimension");
  if (/\bstrong\b/.test(s)) return `${dim} meets the required standard for this task; any remaining refinement is shown in the detailed feedback below.`;
  if (/\baligned\b/.test(s)) return `${dim} is present and correctly ordered; development, examples and language are assessed separately in the detailed feedback below.`;
  if (/\bcontrolled\b/.test(s)) return `${dim} is controlled; any specific refinement appears in the detailed feedback below.`;
  if (/\bno priority repair\b/.test(s)) return `${dim} has no priority repair; minor polish, if any, is noted in the detailed feedback below.`;
  return "";
}

// Enforced final cross-section consistency gate over the fully assembled student view model (brief §4,
// §5). Deterministic, local repairs from the frozen statuses — never rerun scoring. Currently repairs
// framework status↔explanation contradictions in place (keeps the {status, diagnosis} shape). Returns
// the repaired view model and the list of repairs applied (for the safe operational log).
export function enforceViewModelConsistency(viewModel = {}) {
  const repairs = [];
  const framework = viewModel.frameworkBreakdown;
  if (framework && typeof framework === "object") {
    for (const [name, item] of Object.entries(framework)) {
      if (!item || typeof item !== "object") continue;
      const check = validateStatusExplanationCompatibility({ name, status: item.status, explanation: item.diagnosis });
      if (check.pass) continue;
      const replacement = statusCompatibleExplanation(name, item.status);
      if (!replacement) continue;
      repairs.push({ section: "frameworkBreakdown", name, code: "STATUS_EXPLANATION_CONTRADICTION" });
      item.diagnosis = replacement;
    }
  }
  // Cross-section route consistency (brief §5): a route-family framework dimension must not claim the
  // route is missing/absent when the canonical Body Route Alignment shows the route is present and
  // traceable. The route is authoritative; a false "missing route" explanation is repaired so it no
  // longer contradicts the other pages (the real defect — e.g. lexical naming — stays in the issues).
  if (framework && typeof framework === "object") {
    const bodyRoute = normalize(framework["Body Paragraph Route Alignment"]?.status || framework["Body Route Alignment"]?.status);
    const routePresent = /\b(?:aligned|controlled|strong|adequately)\b/.test(bodyRoute);
    if (routePresent) {
      for (const name of ["Thesis Route Clarity", "Prompt Coverage", "Introduction Route"]) {
        const item = framework[name];
        if (!item || typeof item !== "object") continue;
        const text = normalize(item.diagnosis || item.explanation);
        const claimsMissingRoute = /\b(?:missing|absent|not (?:present|traceable|shown))\b.{0,40}\broute\b|\broute\b.{0,40}\b(?:missing|absent|not (?:present|traceable|shown))\b|\bdoes not\b.{0,25}\b(?:establish|present|trace)\b.{0,40}\broute\b/.test(text);
        if (!claimsMissingRoute) continue;
        repairs.push({ section: "frameworkBreakdown", name, code: "ROUTE_CROSS_SECTION_CONTRADICTION" });
        item.diagnosis = `${name} sits over a route that the body paragraphs make present and traceable; the refinement needed here is wording and precision — see the detailed feedback below.`;
      }
    }
  }
  // Paragraph Coverage: the multi-dimension status string and the structured `dimensions` object must
  // agree (brief §13). If either says a dimension needs repair, the conservative reading wins — a
  // "Development Controlled" label must never hide a "development: repair-needed" dimension.
  for (const paragraph of Array.isArray(viewModel.paragraphCoverage) ? viewModel.paragraphCoverage : []) {
    const reconciled = reconcileParagraphCoverage(paragraph);
    if (reconciled) repairs.push({ section: "paragraphCoverage", name: paragraph.paragraphLabel, code: "PARAGRAPH_STATUS_DIMENSION_CONTRADICTION" });
  }
  // Duplicate canonical issues (brief §8): the same defect on the same evidence with the same repair
  // must appear once. Dedup Detailed Feedback and Top Issues by a content signature, keeping the first.
  if (Array.isArray(viewModel.detailedFeedback)) {
    const before = viewModel.detailedFeedback.length;
    viewModel.detailedFeedback = dedupBySignature(viewModel.detailedFeedback);
    if (viewModel.detailedFeedback.length !== before) repairs.push({ section: "detailedFeedback", code: "DUPLICATE_ISSUE_MERGED", removed: before - viewModel.detailedFeedback.length });
  }
  if (Array.isArray(viewModel.topIssues)) {
    const before = viewModel.topIssues.length;
    viewModel.topIssues = dedupBySignature(viewModel.topIssues);
    // Priority ordering (brief §10): most severe first, so a Major defect can never sit below a
    // Moderate/Minor one. Stable sort preserves the engine's tie order.
    viewModel.topIssues = stableSortBySeverity(viewModel.topIssues);
    if (viewModel.topIssues.length !== before) repairs.push({ section: "topIssues", code: "DUPLICATE_TOP_ISSUE_MERGED", removed: before - viewModel.topIssues.length });
  }
  return { viewModel, repairs };
}

function issueSignature(item = {}) {
  const norm = (v) => normalize(v).replace(/[^a-z0-9 ]/g, "").trim();
  const category = norm(item.issueCategory || item.primaryCategory || item.category);
  const evidence = norm(item.exactSentence || item.exactEvidence || item.targetSpan);
  const action = norm(item.studentAction || item.detectedDefect || item.summary);
  return `${category}|${evidence}|${action}`;
}

function dedupBySignature(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const sig = issueSignature(item);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(item);
  }
  return out;
}

const SEVERITY_RANK = { critical: 0, major: 1, moderate: 2, "minor repair": 3, minor: 3, "pass / strong": 4 };
function stableSortBySeverity(items = []) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ra = SEVERITY_RANK[normalize(a.item.severity)] ?? 2;
      const rb = SEVERITY_RANK[normalize(b.item.severity)] ?? 2;
      return ra === rb ? a.index - b.index : ra - rb;
    })
    .map((entry) => entry.item);
}

// Rebuild a paragraph's multi-dimension status string from the conservative union of its status string
// and its dimensions object, and sync `dimensions` to match. Only touches the dash-format Body status
// (never the "Strong"/"Functionally Strong" Introduction/Conclusion form). Returns true if it changed.
function reconcileParagraphCoverage(paragraph) {
  if (!paragraph || typeof paragraph !== "object") return false;
  const dims = paragraph.dimensions;
  const status = String(paragraph.status || "");
  if (!dims || typeof dims !== "object" || !status.includes(" - ")) return false;
  const needs = (dimKey, label) => dims[dimKey] === "repair-needed" || new RegExp(`${label} Repair Needed`).test(status);
  const flags = {
    route: needs("route", "Route"),
    development: needs("development", "Development"),
    example: needs("example", "Example/SAR"),
    language: needs("language", "Language")
  };
  const rebuilt = [
    flags.route ? "Route Repair Needed" : "Route Aligned",
    flags.development ? "Development Repair Needed" : "Development Controlled",
    flags.example ? "Example/SAR Repair Needed" : "Example/SAR Controlled",
    flags.language ? "Language Repair Needed" : "Language Controlled"
  ].join(" - ");
  const dimsAgree = ["route", "development", "example", "language"].every((k) => dims[k] === (flags[k] ? "repair-needed" : "controlled"));
  if (rebuilt === status && dimsAgree) return false;
  paragraph.status = rebuilt;
  for (const k of ["route", "development", "example", "language"]) dims[k] = flags[k] ? "repair-needed" : "controlled";
  return true;
}

// ---------------------------------------------------------------------------
// C. Canonical cross-section consistency gate.
//
// Operates on CANONICAL OBJECTS (route assessment, framework statuses, paragraph coverage, canonical
// issues, scoring snapshot) — never on visible strings — and records every deterministic repair as a
// structured audit entry so an empty audit can no longer hide a repair that actually happened.
// ---------------------------------------------------------------------------

export const CONSISTENCY_AUDIT_VERSION = "canonical-consistency-gate-v12.9.1";

// One structured audit record. `at` is a deterministic processing marker rather than a wall-clock
// timestamp so two runs over the same canonical objects produce byte-identical audits (the gate is
// re-run inside the idempotency tests, and a clock would make it non-reproducible).
function auditRecord({
  ruleId,
  affectedObject,
  affectedPath,
  previousValue,
  correctedValue,
  evidenceSource,
  exactEvidence = "",
  repairAction,
  repairStatus,
  sequence = 0
}) {
  return {
    ruleId,
    affectedObject,
    affectedPath: affectedPath || affectedObject,
    previousValue: previousValue === undefined ? null : previousValue,
    correctedValue: correctedValue === undefined ? null : correctedValue,
    evidenceSource,
    // Only evidence taken verbatim from the student's own response or from a canonical status value
    // is recorded; nothing is paraphrased into the audit.
    exactEvidence: String(exactEvidence || "").slice(0, 400),
    repairAction,
    repairStatus,
    at: `${CONSISTENCY_AUDIT_VERSION}#${sequence}`,
    // Retained for compatibility with the earlier record shape read by existing consumers.
    rule: ruleId
  };
}

const MECHANISM_CATEGORIES = /Causal Mechanism|Solution Mechanism|Explanation Depth|Affected-Group/i;
const EXAMPLE_CATEGORIES = /Example Development|SAR Example Quality/i;
const LANGUAGE_CATEGORIES = /Lexical|Word|Collocation|Meaning|Grammar|Sentence|Agreement|Article|Countability|Reference|Pronoun|Tense|Preposition|Punctuation|Modal/i;
const ABSENT_ROUTE_CLAIM = /\broute is absent\b|\babsent route\b|\bno (?:traceable )?route\b|\btask route (?:is )?missing\b/i;
const ABSENT_PROGRESSION_CLAIM = /\bprogression is absent\b|\bno paragraph progression\b|\bparagraph progression (?:is )?missing\b/i;
const MISSING_EVERY_ROUTE_CLAIM = /\bmissing (?:at least one|every|all)\b[^.]{0,40}\broute\b|\bnot traceable\b|\bno traceable\b/i;
const CONCLUSION_DOES_NOT_CLOSE = /\bdoes not close\b|\bfails to close\b|\bdoes not restate\b|\bleaves .{0,30}open\b|\bnew (?:route|idea) in the conclusion\b/i;

function statusText(entry) {
  return normalize(entry?.status);
}

function diagnosisText(entry) {
  return String(entry?.diagnosis || entry?.explanation || entry?.note || "");
}

// A framework dimension can be held under its canonical camelCase key, under its display label, and
// inside the display projection at the same time. Every occurrence must be repaired: repairing only
// the first one leaves a stale twin that the visible report may render instead.
function frameworkEntries(framework, displayName, canonicalKey) {
  const found = [];
  if (framework?.display && framework.display[displayName]) found.push({ container: framework.display, key: displayName, path: `frameworkScores.display["${displayName}"]` });
  if (framework && framework[displayName]) found.push({ container: framework, key: displayName, path: `frameworkScores["${displayName}"]` });
  if (canonicalKey && framework && framework[canonicalKey]) found.push({ container: framework, key: canonicalKey, path: `frameworkScores.${canonicalKey}` });
  return found;
}

function frameworkEntry(framework, displayName, canonicalKey) {
  return frameworkEntries(framework, displayName, canonicalKey)[0] || null;
}

// Earlier stages record their own consistency findings in a lighter shape ({ code, message, … }).
// Persisting two shapes in one list makes the audit unreadable, so a legacy finding is lifted into
// the full record contract without inventing values it never had.
export function normalizeConsistencyAuditRecord(entry, sequence = 0) {
  if (!entry || typeof entry !== "object") return null;
  if (entry.ruleId && entry.repairAction) return entry;
  return auditRecord({
    ruleId: String(entry.ruleId || entry.rule || entry.code || "LEGACY_CONSISTENCY_FINDING"),
    affectedObject: String(entry.affectedObject || entry.section || entry.target || "report"),
    affectedPath: String(entry.affectedPath || entry.path || entry.section || entry.target || "report"),
    previousValue: entry.previousValue ?? entry.previous ?? entry.message ?? null,
    correctedValue: entry.correctedValue ?? entry.corrected ?? null,
    evidenceSource: String(entry.evidenceSource || entry.source || "auditReportConsistency"),
    exactEvidence: String(entry.exactEvidence || entry.evidence || ""),
    repairAction: String(entry.repairAction || entry.action || "record-upstream-consistency-finding"),
    repairStatus: String(entry.repairStatus || entry.status || "flagged"),
    sequence
  });
}

function labelKey(value) {
  return normalize(value).replace(/,.*$/, "").trim();
}

function issuesForParagraph(issues, paragraph) {
  const label = labelKey(paragraph.paragraphLabel);
  return issues.filter((issue) => {
    if (paragraph.paragraphId && issue.paragraphId && paragraph.paragraphId === issue.paragraphId) return true;
    const issueLabel = labelKey(issue.paragraphLabel || issue.paragraphLocation);
    return Boolean(label) && Boolean(issueLabel) && (issueLabel.startsWith(label) || label.startsWith(issueLabel));
  });
}

// ---------------------------------------------------------------------------
// The canonical cross-section consistency gate.
//
// Runs AFTER canonical route and issue reconciliation and BEFORE the Student View and the PDF are
// rendered, so every visible section inherits one reconciled set of canonical objects. It compares
// canonical OBJECTS — route assessment, task-aware route model, thesis dimensions, framework
// statuses, frozen scoring, canonical issues, language profile, paragraph coverage, executive
// summary, repair plan and the Student View projection — and never repairs by string substitution:
// a contradiction is resolved by replacing the losing canonical value with the value the winning
// canonical object already holds, and every replacement is recorded.
//
// Returns { audit, frameworkScores, paragraphCoverage, criteriaScores, repairsApplied }.
// ---------------------------------------------------------------------------
export function buildCanonicalConsistencyAudit({
  taskRequirements = null,
  routeAssessment = {},
  taskAwareRouteModel = null,
  thesisDimensions = null,
  frozenScoring = null,
  frameworkScores = {},
  paragraphCoverage = [],
  issues = [],
  languageProfile = null,
  criteriaScores = {},
  executiveSummary = null,
  repairPlan = [],
  studentView = null,
  conclusionFunction = null,
  existingAudit = []
} = {}) {
  const audit = [];
  const record = (fields) => audit.push(auditRecord({ ...fields, sequence: audit.length + 1 }));
  const framework = { ...frameworkScores, ...(frameworkScores?.display ? { display: { ...frameworkScores.display } } : {}) };
  const coverage = Array.isArray(paragraphCoverage) ? paragraphCoverage.map((item) => ({ ...item, dimensions: { ...(item.dimensions || {}) } })) : [];
  const criteria = Object.fromEntries(Object.entries(criteriaScores || {}).map(([name, value]) => [name, { ...(value || {}) }]));
  const canonicalIssues = Array.isArray(issues) ? issues : [];
  const routeStatus = String(routeAssessment.overallRouteStatus || routeAssessment.status || "");
  const routePresent = Boolean(routeStatus) && !["absent", "contradicted", "failed", "not_traceable"].includes(routeStatus);
  const bodyRoutes = Array.isArray(routeAssessment.bodyRoutes) ? routeAssessment.bodyRoutes : [];
  const missingRequirements = Array.isArray(routeAssessment.missingRequirements) ? routeAssessment.missingRequirements : [];

  // Rule 1 — route present versus scoring text.
  // A frozen criterion range is never altered here; only a diagnosis that contradicts the canonical
  // route is replaced, with the canonical route status as the evidence.
  if (routePresent) {
    for (const [criterion, entry] of Object.entries(criteria)) {
      const text = String(entry?.diagnosis || "");
      if (!ABSENT_ROUTE_CLAIM.test(text)) continue;
      const corrected = `The required task routes are present (${routeStatus.replace(/_/g, " ")}); the remaining Task Response limitation is depth of development, not a missing route.`;
      criteria[criterion] = { ...entry, diagnosis: corrected };
      record({
        ruleId: "ROUTE_PRESENT_VS_SCORING_TEXT",
        affectedObject: "criteriaScores",
        affectedPath: `criteriaScores["${criterion}"].diagnosis`,
        previousValue: text,
        correctedValue: corrected,
        evidenceSource: `routeAssessment.overallRouteStatus=${routeStatus}; routeAssessment.missingRequirements=[${missingRequirements.join(",")}]`,
        exactEvidence: String(entry?.evidence || ""),
        repairAction: "replace-diagnosis-with-canonical-route-status",
        repairStatus: "repaired"
      });
    }
  }

  // Rule 2 — route present versus paragraph progression.
  if (routePresent && bodyRoutes.length >= 2) {
    const aligned = bodyRoutes.every((route) => !["absent", "contradicted", "unclear"].includes(String(route?.alignmentStatus || route?.status || "")));
    for (const [criterion, entry] of Object.entries(criteria)) {
      const text = String(entry?.diagnosis || "");
      if (!aligned || !ABSENT_PROGRESSION_CLAIM.test(text)) continue;
      const corrected = `Paragraph progression is traceable: ${bodyRoutes.map((route, index) => `Body ${index + 1} ${route?.label || route?.route || "aligned"}`).join("; ")}. The remaining Coherence limitation is local, not a missing progression.`;
      criteria[criterion] = { ...entry, diagnosis: corrected };
      record({
        ruleId: "ROUTE_PRESENT_VS_PARAGRAPH_PROGRESSION",
        affectedObject: "criteriaScores",
        affectedPath: `criteriaScores["${criterion}"].diagnosis`,
        previousValue: text,
        correctedValue: corrected,
        evidenceSource: `routeAssessment.bodyRoutes=[${bodyRoutes.map((route) => route?.label || route?.route).join(" | ")}]`,
        repairAction: "replace-diagnosis-with-canonical-body-routes",
        repairStatus: "repaired"
      });
    }
  }

  // Rule 3 — body route consistency. The route assessment is the single source of truth for what a
  // body paragraph does; a framework dimension or a canonical issue may not contradict it.
  for (const [index, route] of bodyRoutes.entries()) {
    const canonicalRoute = String(route?.route || route?.primaryRoute || route?.label || "");
    if (!canonicalRoute) continue;
    const entry = frameworkEntry(framework, "Body Paragraph Route Alignment", "bodyRouteAlignment");
    if (!entry) continue;
    const text = diagnosisText(entry.container[entry.key]);
    const claimsOther = /\bsolution\b/i.test(text) && /disadvantage/i.test(canonicalRoute);
    const claimsUnclear = /\broute unclear\b|\bunclear from the controlling sentences\b/i.test(text);
    if (!claimsOther && !claimsUnclear) continue;
    const corrected = bodyRoutes.map((item, position) => `Body ${position + 1}: ${item?.label || item?.route || "aligned"}`).join(" | ");
    const previous = text;
    entry.container[entry.key] = { ...entry.container[entry.key], diagnosis: `${corrected}. This rating assesses route alignment only.` };
    record({
      ruleId: "BODY_ROUTE_CONSISTENCY",
      affectedObject: "frameworkScores",
      affectedPath: `frameworkScores["Body Paragraph Route Alignment"].diagnosis`,
      previousValue: previous,
      correctedValue: entry.container[entry.key].diagnosis,
      evidenceSource: `routeAssessment.bodyRoutes[${index}]=${canonicalRoute}`,
      exactEvidence: String(route?.exactEvidence || route?.evidence || ""),
      repairAction: "restate-body-routes-from-route-assessment",
      repairStatus: "repaired"
    });
    break;
  }

  // Rule 4 — thesis consistency. A thesis whose canonical dimensions record both required routes and
  // an explicit position must not be described as missing a traceable route.
  if (thesisDimensions && thesisDimensions.applicable !== false) {
    const present = thesisDimensions.routePresent || {};
    const requiredRoutes = Array.isArray(thesisDimensions.routeRequired) ? thesisDimensions.routeRequired : [];
    const namedRoutes = requiredRoutes.filter((route) => present[route]);
    const allNamed = requiredRoutes.length > 0 && namedRoutes.length === requiredRoutes.length;
    const positionHeld = thesisDimensions.positionRequired ? Boolean(thesisDimensions.positionPresent) : true;
    if (allNamed && positionHeld) {
      const corrected = `The thesis names every required route (${namedRoutes.join(", ")}) and states an explicit position; lexical precision inside the thesis is assessed separately.`;
      for (const entry of frameworkEntries(framework, "Thesis Route Clarity", "thesisRouteClarity")) {
        const text = diagnosisText(entry.container[entry.key]);
        if (!MISSING_EVERY_ROUTE_CLAIM.test(text)) continue;
        entry.container[entry.key] = { ...entry.container[entry.key], diagnosis: corrected };
        record({
          ruleId: "THESIS_CONSISTENCY",
          affectedObject: "frameworkScores",
          affectedPath: `${entry.path}.diagnosis`,
          previousValue: text,
          correctedValue: corrected,
          evidenceSource: `thesisDimensions.routePresent=${JSON.stringify(present)}; thesisDimensions.positionPresent=${positionHeld}`,
          repairAction: "replace-diagnosis-with-canonical-thesis-dimensions",
          repairStatus: "repaired"
        });
      }
    }
    // The same contradiction can appear between the canonical dimension object and its display twin.
    const canonicalStatus = statusText(framework.thesisRouteClarity);
    const displayStatus = statusText(framework.display?.["Thesis Route Clarity"]);
    if (canonicalStatus && displayStatus && /strong/.test(canonicalStatus) && /needs work|weak|absent/.test(displayStatus)) {
      const previous = framework.display["Thesis Route Clarity"].status;
      framework.display["Thesis Route Clarity"] = {
        ...framework.display["Thesis Route Clarity"],
        status: framework.thesisRouteClarity.status
      };
      record({
        ruleId: "THESIS_CONSISTENCY",
        affectedObject: "frameworkScores.display",
        affectedPath: `frameworkScores.display["Thesis Route Clarity"].status`,
        previousValue: previous,
        correctedValue: framework.thesisRouteClarity.status,
        evidenceSource: `frameworkScores.thesisRouteClarity.status=${framework.thesisRouteClarity.status}`,
        repairAction: "align-display-status-with-canonical-dimension",
        repairStatus: "repaired"
      });
    }
  }

  // Rule 5 — conclusion consistency. Conclusion FUNCTION (does it close the established routes?) and
  // conclusion LANGUAGE ACCURACY are separate judgements: a conclusion may close correctly and still
  // need a language repair, and a language defect may not be reported as a closure failure.
  const conclusionLabel = String(routeAssessment.conclusionLabel || "");
  const conclusionCloses = Boolean(conclusionFunction?.complete) || /\brestates?\b|\bcloses?\b|\boutweigh/i.test(conclusionLabel);
  if (conclusionCloses) {
    const entry = frameworkEntry(framework, "Conclusion Closure", "conclusionClosure");
    if (entry) {
      const text = diagnosisText(entry.container[entry.key]);
      if (CONCLUSION_DOES_NOT_CLOSE.test(text)) {
        const corrected = `The conclusion performs its function: ${conclusionLabel || "it closes the established routes without opening a new one"}. Language accuracy inside the conclusion is reported separately as a language repair.`;
        entry.container[entry.key] = { ...entry.container[entry.key], diagnosis: corrected };
        record({
          ruleId: "CONCLUSION_FUNCTION_VS_LANGUAGE",
          affectedObject: "frameworkScores",
          affectedPath: `frameworkScores["Conclusion Closure"].diagnosis`,
          previousValue: text,
          correctedValue: corrected,
          evidenceSource: `routeAssessment.conclusionLabel=${conclusionLabel}; conclusionFunction.complete=${Boolean(conclusionFunction?.complete)}`,
          exactEvidence: String(conclusionFunction?.exactEvidence || ""),
          repairAction: "separate-conclusion-function-from-conclusion-language",
          repairStatus: "repaired"
        });
      }
    }
    // A conclusion paragraph carrying only language issues must read "functionally strong" rather
    // than as a closure failure.
    for (const paragraph of coverage) {
      if (!/Conclusion/i.test(String(paragraph.paragraphLabel || ""))) continue;
      const paragraphIssues = issuesForParagraph(canonicalIssues, paragraph);
      const onlyLanguage = paragraphIssues.length > 0 &&
        paragraphIssues.every((issue) => LANGUAGE_CATEGORIES.test(String(issue.primaryCategory || issue.issueCategory || "")));
      if (!onlyLanguage) continue;
      if (paragraph.dimensions?.route !== "repair-needed" && paragraph.dimensions?.development !== "repair-needed") continue;
      const previous = paragraph.status;
      paragraph.dimensions = { ...paragraph.dimensions, route: "controlled", development: "controlled" };
      paragraph.status = "Functionally Strong - Language Repair Needed";
      record({
        ruleId: "CONCLUSION_FUNCTION_VS_LANGUAGE",
        affectedObject: "paragraphCoverage",
        affectedPath: `paragraphCoverage["${paragraph.paragraphLabel}"].status`,
        previousValue: previous,
        correctedValue: paragraph.status,
        evidenceSource: `canonicalIssues[${paragraphIssues.map((issue) => issue.primaryCategory || issue.issueCategory).join(",")}] are all language categories`,
        repairAction: "reclassify-conclusion-as-functionally-strong-with-language-repair",
        repairStatus: "repaired"
      });
    }
  }

  // Rule 6 — Explanation Depth may not read Strong while a validated causal-mechanism gap survives.
  const mechanismIssues = canonicalIssues.filter((issue) => MECHANISM_CATEGORIES.test(String(issue.primaryCategory || issue.issueCategory || "")));
  if (mechanismIssues.length) {
    const diagnosis = `A validated development gap remains: ${mechanismIssues.map((issue) => `${issue.primaryCategory || issue.issueCategory} in ${issue.paragraphLabel || issue.paragraphLocation}`).join("; ")}.`;
    for (const entry of frameworkEntries(framework, "Explanation Depth", "explanationDepth")) {
      if (!/strong/.test(statusText(entry.container[entry.key]))) continue;
      const previous = entry.container[entry.key].status;
      entry.container[entry.key] = { ...entry.container[entry.key], status: "Moderate", diagnosis };
      record({
        ruleId: "EXPLANATION_DEPTH_CONSISTENCY",
        affectedObject: "frameworkScores",
        affectedPath: `${entry.path}.status`,
        previousValue: previous,
        correctedValue: "Moderate",
        evidenceSource: `canonicalIssues=[${mechanismIssues.map((issue) => issue.issueId).filter(Boolean).join(",")}]`,
        exactEvidence: String(mechanismIssues[0]?.exactSentence || mechanismIssues[0]?.exactEvidence || ""),
        repairAction: "downgrade-strong-status-to-match-validated-development-evidence",
        repairStatus: "repaired"
      });
    }
  }

  // Rule 7 — SAR Example Quality may not read Strong while an affected group, mechanism or observable
  // consequence remains incomplete inside an example.
  const exampleGapIssues = canonicalIssues.filter((issue) => {
    const category = String(issue.primaryCategory || issue.issueCategory || "");
    if (EXAMPLE_CATEGORIES.test(category)) return true;
    return MECHANISM_CATEGORIES.test(category) && /example/i.test(String(issue.sentenceRole || issue.sentenceFunction || ""));
  });
  if (exampleGapIssues.length) {
    for (const entry of frameworkEntries(framework, "SAR Example Quality", "sarExampleQuality")) {
      if (!/strong/.test(statusText(entry.container[entry.key]))) continue;
      const previous = entry.container[entry.key].status;
      entry.container[entry.key] = { ...entry.container[entry.key], status: "Moderate" };
      record({
        ruleId: "SAR_EXAMPLE_QUALITY_CONSISTENCY",
        affectedObject: "frameworkScores",
        affectedPath: `${entry.path}.status`,
        previousValue: previous,
        correctedValue: "Moderate",
        evidenceSource: `canonicalIssues=[${exampleGapIssues.map((issue) => issue.issueId).filter(Boolean).join(",")}]`,
        exactEvidence: String(exampleGapIssues[0]?.exactSentence || exampleGapIssues[0]?.exactEvidence || ""),
        repairAction: "downgrade-strong-status-to-match-validated-example-evidence",
        repairStatus: "repaired"
      });
    }
  }

  // Rule 8 — language-control consistency. A paragraph cannot read Language Controlled while a
  // validated language issue targets it. The validated language profile is also consulted, so an
  // issue that was capped out of the visible card set still blocks a "controlled" claim.
  const profileParagraphLabels = new Set(
    (Array.isArray(languageProfile?.validatedIssues) ? languageProfile.validatedIssues : [])
      .map((item) => labelKey(String(item.paragraphLocation || "")))
      .filter(Boolean)
  );
  for (const paragraph of coverage) {
    const label = labelKey(paragraph.paragraphLabel);
    const languageIssues = issuesForParagraph(canonicalIssues, paragraph)
      .filter((issue) => LANGUAGE_CATEGORIES.test(String(issue.primaryCategory || issue.issueCategory || "")));
    const profileEvidence = [...profileParagraphLabels].some((item) => item.startsWith(label) || label.startsWith(item));
    if (!languageIssues.length && !profileEvidence) continue;
    const saysControlled = String(paragraph.dimensions?.language || "") === "controlled" ||
      /language controlled/i.test(String(paragraph.status || "")) ||
      /^strong$/i.test(String(paragraph.status || ""));
    if (!saysControlled) continue;
    const previous = paragraph.status;
    paragraph.dimensions = { ...paragraph.dimensions, language: "repair-needed" };
    paragraph.status = /Conclusion/i.test(String(paragraph.paragraphLabel || "")) && conclusionCloses
      ? "Functionally Strong - Language Repair Needed"
      : paragraphDimensionStatus(
          languageIssues.length ? languageIssues : issuesForParagraph(canonicalIssues, paragraph),
          paragraph.paragraphLabel,
          paragraph.conclusionFunction || conclusionFunction
        );
    record({
      ruleId: "LANGUAGE_CONTROL_CONSISTENCY",
      affectedObject: "paragraphCoverage",
      affectedPath: `paragraphCoverage["${paragraph.paragraphLabel}"].status`,
      previousValue: previous,
      correctedValue: paragraph.status,
      evidenceSource: languageIssues.length
        ? `canonicalIssues=[${languageIssues.map((issue) => issue.issueId).filter(Boolean).join(",")}]`
        : `languageProfile.validatedIssues@${label}`,
      exactEvidence: String(languageIssues[0]?.exactSentence || languageIssues[0]?.exactEvidence || ""),
      repairAction: "mark-language-dimension-repair-needed",
      repairStatus: "repaired"
    });
  }

  // Rule 9 — revision consistency. A failed revision validator must never reach visible output. The
  // canonical layer withholds it; this gate proves the visible projections are clean too.
  const visibleSurfaces = [
    ["canonicalIssues", canonicalIssues],
    ["studentView.topIssues", Array.isArray(studentView?.topIssues) ? studentView.topIssues : []],
    ["studentView.feedbackCards", Array.isArray(studentView?.feedbackCards) ? studentView.feedbackCards : []],
    ["repairPlan", Array.isArray(repairPlan) ? repairPlan : []]
  ];
  for (const [surface, items] of visibleSurfaces) {
    for (const item of items) {
      if (String(item?.revisionTypeValidationStatus || "").toLowerCase() !== "fail") continue;
      record({
        ruleId: "REVISION_VALIDATION_CONSISTENCY",
        affectedObject: surface,
        affectedPath: `${surface}["${item.issueId || item.feedbackCardId || item.day || "?"}"].revisionType`,
        previousValue: item.revisionType,
        correctedValue: null,
        evidenceSource: "revisionTypeValidationStatus=fail",
        exactEvidence: String(item.exactSentence || item.exactEvidence || ""),
        repairAction: "reject-failed-revision-before-render",
        repairStatus: "rejected"
      });
    }
  }

  // Rule 10 — audit integrity. Nothing else in the report proves that a repair happened, so a repair
  // recorded by an upstream stage while this audit is empty is itself a defect and is recorded.
  const upstreamRepairs = [
    ...(Array.isArray(frozenScoring?.repairs) ? frozenScoring.repairs : []),
    ...canonicalIssues.flatMap((issue) => Array.isArray(issue.integrityRepairs) ? issue.integrityRepairs : [])
  ];
  const persistedAlready = Array.isArray(existingAudit) ? existingAudit.length : 0;
  if (!audit.length && !persistedAlready && upstreamRepairs.length) {
    record({
      ruleId: "AUDIT_INTEGRITY",
      affectedObject: "feedbackIntegrity.consistencyAudit",
      affectedPath: "feedbackIntegrity.consistencyAudit",
      previousValue: 0,
      correctedValue: upstreamRepairs.length,
      evidenceSource: `upstreamRepairs=[${upstreamRepairs.map((repair) => repair.code).filter(Boolean).join(",")}]`,
      repairAction: "record-upstream-repairs-so-an-empty-audit-cannot-hide-them",
      repairStatus: "recorded"
    });
  }

  const requirementCoverage = Array.isArray(taskRequirements?.requirementChecks) ? taskRequirements.requirementChecks.length : 0;
  return {
    version: CONSISTENCY_AUDIT_VERSION,
    audit,
    frameworkScores: framework,
    paragraphCoverage: coverage,
    criteriaScores: criteria,
    repairsApplied: audit.filter((item) => item.repairStatus === "repaired").length,
    inputsSeen: {
      taskRequirementChecks: requirementCoverage,
      routeAssessment: Boolean(routeStatus),
      taskAwareRouteModel: Boolean(taskAwareRouteModel),
      thesisDimensions: Boolean(thesisDimensions),
      frozenScoring: Boolean(frozenScoring),
      frameworkAssessment: Object.keys(frameworkScores || {}).length > 0,
      canonicalIssues: canonicalIssues.length,
      languageProfile: Boolean(languageProfile),
      paragraphCoverage: coverage.length,
      executiveSummary: Boolean(executiveSummary),
      repairPlan: Array.isArray(repairPlan) ? repairPlan.length : 0,
      studentView: Boolean(studentView)
    }
  };
}

export function paragraphDimensionStatus(issues = [], paragraphRole = "", conclusionFunction = null) {
  const categories = new Set(issues.flatMap((issue) => [
    issue.issueCategory,
    ...(issue.secondaryIssueCategories || []),
    ...(issue.secondaryCategories || [])
  ].filter(Boolean)));
  const route = categories.has("Body Route Alignment") || categories.has("Thesis Route Clarity")
    ? "Route Repair Needed"
    : "Route Aligned";
  const development = [...categories].some((category) =>
    ["Causal Mechanism", "Solution Mechanism", "Explanation Depth", "Comparative Judgement", "Thesis-to-Body Promise", "Conclusion Closure"].includes(category))
    ? "Development Repair Needed"
    : "Development Controlled";
  const example = [...categories].some((category) => ["Example Development", "SAR Example Quality"].includes(category)) ||
    issues.some((issue) => issue.sentenceRole === "example" && ["Causal Mechanism", "Solution Mechanism", "Sentence Completion"].includes(issue.issueCategory))
    ? "Example/SAR Repair Needed"
    : "Example/SAR Controlled";
  const language = [...categories].some((category) => /Lexical|Word|Collocation|Meaning|Grammar|Sentence|Agreement|Article|Countability|Reference|Pronoun|Tense|Preposition|Punctuation|Modal/.test(category))
    ? "Language Repair Needed"
    : "Language Controlled";
  // A route-closing sentence can still fail conclusion fidelity by adding a new undeveloped reason.
  // "complete" only proves that a conclusion exists and closes grammatically; it must not erase a
  // canonical Conclusion Closure issue from Paragraph Coverage.
  const functionalConclusionGap = categories.has("Conclusion Closure") ||
    issues.some((issue) => /conclusion_new_idea/i.test(String(issue.sentenceRole || issue.sentenceFunction || "")));
  if (/Conclusion/.test(paragraphRole) && conclusionFunction?.complete && !functionalConclusionGap) {
    return language === "Language Repair Needed"
      ? "Functionally Strong — Language Repair Needed"
      : "Functionally Strong";
  }
  return `${route} - ${development} - ${example} - ${language}`;
}

export function buildEvidenceBasedRepairPlan(issues = [], reportLanguage = "en", requiredDays = 7, context = {}) {
  const ranked = rankIssues(issues).filter((issue) => issue.severity !== "Pass / Strong");
  const unique = [];
  const seen = new Set();
  for (const issue of ranked) {
    const key = `${issue.issueCategory}|${issue.paragraphId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(issue);
    if (unique.length >= 7) break;
  }
  const thai = String(reportLanguage).toLowerCase() === "th";
  if (!unique.length) {
    const checks = controlledReviewChecks(context);
    return checks.slice(0, requiredDays).map((task, index) => ({
      day: index + 1,
      issueId: "",
      title: thai ? `ตรวจสอบงานที่ผ่านเกณฑ์ วันที่ ${index + 1}` : `Controlled review ${index + 1}`,
      task,
      source: "canonical-no-defect-review"
    }));
  }
  return Array.from({ length: requiredDays }, (_, index) => {
    const issue = unique[index % unique.length];
    const activity = repairActivityForIssue(issue, index % requiredDays, context);
    return {
      day: index + 1,
      issueId: issue.issueId,
      title: thai ? `${activity.phase}: ${issue.issueCategory}` : `${activity.phase}: ${issue.issueCategory}`,
      task: activity.task,
      source: "canonical-issue-graph"
    };
  });
}

function repairActivityForIssue(issue = {}, phaseIndex = 0, context = {}) {
  const category = String(issue.issueCategory || "");
  const location = String(issue.paragraphLabel || issue.paragraphLocation || "the quoted sentence");
  const action = String(issue.studentAction || "Repair the identified point in the quoted sentence.");
  // The exact item the issue is about, so a plan day names the learner's own words rather than a
  // category. For a Thesis-to-Body Promise this is the promise the body never developed.
  const promisedItem = String(issue.targetSpan || "").trim().replace(/^["“']|["”']$/g, "").slice(0, 60);
  const family = repairActivityFamily(category);
  const tasks = {
    punctuation: [
      ["Notice the pattern", `Read the quoted sentence from ${location}. Circle the punctuation mark where spacing is missing.`],
      ["Practise the rule", "Write three sentence pairs with a full stop followed by one space and a capital letter."],
      ["Repair the sentence", action],
      ["Check the same pattern", `Scan ${location} only for missing or extra spaces around punctuation marks; do not add new ideas.`],
      ["Transfer the rule", "Write two new sentences on another topic and check punctuation spacing before reading them aloud."],
      ["Proofread boundaries", `Re-read ${location} and mark each sentence boundary with a slash to confirm the spacing is visible.`],
      ["Final learner checklist", "Check every full stop, comma and following space; tick only the corrected punctuation pattern."]
    ],
    countability: [
      ["Notice the noun frame", `Read the quoted sentence from ${location}. Underline the article and the uncountable noun phrase it modifies.`],
      ["Practise the rule", "Write three uncountable-noun frames without an unsupported singular article."],
      ["Repair the noun phrase", action],
      ["Contrast the forms", "Write one correct uncountable form and one countable alternative with a unit noun, then explain the difference."],
      ["Transfer the rule", "Use the same uncountable noun correctly in two new IELTS sentences."],
      ["Check the paragraph", `Proofread ${location} for article-plus-uncountable-noun combinations only.`],
      ["Final learner checklist", "Check each repaired noun phrase for article, number and meaning."]
    ],
    lexical: [
      ["Notice the meaning", `Read the quoted sentence from ${location}. Contrast the source word's dictionary meaning with the meaning intended in context.`],
      ["Practise precise wording", "Write three short sentences using the corrected term in the same grammatical frame."],
      ["Repair the wording", action],
      ["Check the meaning", "Explain in one sentence why the replacement is more accurate and does not change the original claim."],
      ["Transfer the wording", "Use the corrected term in a different IELTS topic without copying the original sentence."],
      ["Check the paragraph function", paragraphFunctionCheck(location, category)],
      ["Final learner checklist", "Check that every corrected word is precise, natural and grammatically compatible with its sentence."]
    ],
    fragment: [
      ["Find the missing clause", `Read the fragment from ${location}. Underline its dependent clause and identify the missing independent main clause.`],
      ["Practise sentence completion", "Turn three noun-phrase or subordinate-clause fragments into complete sentences with a subject and finite main verb."],
      ["Repair the fragment", action],
      ["Check the proposition", "Confirm that the repaired sentence states one complete claim and retains the original idea."],
      ["Transfer the structure", "Write one complete example sentence on another topic using the same grammatical pattern."],
      ["Check the paragraph function", `Re-read ${location}. Confirm that the repaired sentence now performs its example or explanation function.`],
      ["Final learner checklist", "For every sentence, identify the independent subject and finite main verb before ticking it as complete."]
    ],
    development: [
      ["Map the missing link", `Read the evidence from ${location}. Write the incomplete chain and mark the missing mechanism or result.`],
      ["Practise the chain", developmentPractice(category)],
      ["Repair the development", action],
      ["Check the mechanism", "Underline the implementation or causal step, the behavioural response and the outcome in the repaired version."],
      ["Transfer the chain", "Build one new cause-to-result or solution-to-outcome chain on another IELTS topic."],
      ["Rebuild the paragraph", paragraphFunctionCheck(location, category)],
      ["Final learner checklist", "Check that each developed point shows how the claim leads to a clear result without adding an unrelated route."]
    ],
    reference: [
      ["Find the unclear reference", `Read the quoted sentence from ${location}. Circle the pronoun or vague reference and identify the exact noun it should name.`],
      ["Practise explicit reference", "Rewrite three short sentences by replacing an unclear pronoun with a precise noun phrase."],
      ["Repair the reference", action],
      ["Check the antecedent", "Confirm that every pronoun has one clear antecedent and agrees in number."],
      ["Transfer the rule", "Write two new sentences with explicit reference chains."],
      ["Check the paragraph", `Re-read ${location} and trace each pronoun back to one named noun.`],
      ["Final learner checklist", "Tick each pronoun only after its antecedent is explicit and unambiguous."]
    ],
    comparison: [
      ["Map the two sides", `List, in two columns, exactly what each side of the question produces, using only claims already made in ${location} and the other body paragraph.`],
      ["Practise weighing", "Write three sentences of the form: X produces A, but Y produces B, which affects more people / lasts longer / is harder to reverse."],
      ["Write the comparison", action],
      ["Check the judgement", "Confirm that the new sentence states which side is stronger AND why, using a comparison rather than a repeated assertion."],
      ["Transfer the skill", "Take a different outweigh prompt and write one comparative sentence that weighs its two sides against each other."],
      ["Check the conclusion", "Re-read the conclusion and confirm it restates the same comparative judgement your body now demonstrates."],
      ["Final learner checklist", "Confirm the essay compares the two sides at least once in the body, not only in the introduction and conclusion."]
    ],
    promise: [
      ["Name the dropped promise", `Underline every route your thesis names. Mark the one the body never develops${promisedItem ? ` — here it is "${promisedItem}"` : ""}.`],
      ["Decide: develop or remove", `Choose one path for ${promisedItem ? `"${promisedItem}"` : "the dropped promise"} — either give it a body paragraph, or take it out of the thesis. Write one sentence saying which you chose and why.`],
      ["Do it", action],
      ["Check the promise is kept", `Re-read the thesis and each body topic sentence. Every route the thesis names must appear in a body paragraph${promisedItem ? `, including "${promisedItem}" if you kept it` : ""}.`],
      ["Build the missing mechanism", promisedItem
        ? `If you kept "${promisedItem}", write its chain: cause -> who or what is affected -> observable consequence. Three sentences, no new routes.`
        : "Write the missing route's chain: cause -> who is affected -> observable consequence."],
      ["Check the conclusion", "Confirm the conclusion closes only the routes the body actually developed — a promise you removed must not reappear there."],
      ["Final learner checklist", "For every noun phrase your thesis promises, point to the body paragraph that delivers it. Anything you cannot point to must be cut."]
    ],
    thesis: [
      ["Map the task routes", "List every route required by the prompt before revising the thesis."],
      ["Practise route order", "Write two thesis plans that present the required routes in the same order as the body paragraphs."],
      ["Repair the thesis", action],
      ["Check route coverage", "Match each thesis route to one body paragraph and remove any route that is not developed."],
      ["Transfer the structure", "Plan a thesis for a different prompt of the same essay family."],
      ["Check the introduction", `Re-read ${location}. Check only prompt paraphrase, required routes and position where required; do not force body-paragraph examples into the introduction.`],
      ["Final learner checklist", "Confirm task coverage, route order and position consistency before finalising the thesis."]
    ],
    task1Overview: [
      ["Select dominant features", "List the largest, smallest or most important overall patterns; exclude minor data."],
      ["Practise overview selection", `Write two overview sentences appropriate to the ${context.visualType || "visual"} without detailed figures.`],
      ["Repair the overview", action],
      ["Check visual coverage", "Confirm that the overview covers the dominant pattern from every supplied visual."],
      ["Transfer the skill", "Write an overview for a different chart, map or process using only dominant features."],
      ["Check the overview function", "Re-read the overview and remove detailed evidence, explanation and conclusions."],
      ["Final learner checklist", "Check accuracy, dominant-feature selection and full visual coverage."]
    ],
    general: [
      ["Notice the issue", `Read the quoted evidence from ${location} and explain the validated ${category} problem in your own words.`],
      ["Practise the rule", `Write three short examples that demonstrate accurate ${category}.`],
      ["Repair the sentence", action],
      ["Check the repair", "Confirm that the repair addresses the diagnosis without changing the original route or factual claim."],
      ["Transfer the rule", `Use the same ${category} skill in one new sentence on another topic.`],
      ["Check the paragraph function", paragraphFunctionCheck(location, category)],
      ["Final learner checklist", `Proofread the response once for ${category} and tick only evidence-based corrections.`]
    ]
  };
  const [phase, task] = tasks[family][phaseIndex % tasks[family].length];
  return { phase, task };
}

function repairActivityFamily(category) {
  if (category === "Punctuation") return "punctuation";
  if (category === "Countability" || category === "Article Control") return "countability";
  if (category === "Sentence Completion") return "fragment";
  if (["Lexical Precision", "Meaning Control", "Word Choice", "Collocation", "Word Form"].includes(category)) return "lexical";
  if (["Reference Control", "Pronoun Control"].includes(category)) return "reference";
  if (category === "Comparative Judgement") return "comparison";
  // A declared-but-undeveloped promise is NOT a route-order problem. Sending it to the generic
  // `thesis` family produced "Practise route order" for an essay whose route order was already
  // correct — the actual defect was that "environmental degradation" was named and then dropped.
  if (category === "Thesis-to-Body Promise") return "promise";
  if (["Causal Mechanism", "Solution Mechanism", "Explanation Depth", "Example Development", "SAR Example Quality"].includes(category)) return "development";
  if (["Thesis Route Clarity", "Cause Route Clarity", "Solution Route Clarity", "Position Clarity", "Prompt Coverage", "Thesis-to-Body Promise"].includes(category)) return "thesis";
  if (["Overview Quality", "Overview Accuracy", "Mixed-Visual Coverage"].includes(category)) return "task1Overview";
  return "general";
}

function developmentPractice(category) {
  if (category === "Solution Mechanism") {
    return "Write three chains in the form: solution -> implementation or enforcement -> behaviour change -> outcome.";
  }
  if (["Example Development", "SAR Example Quality"].includes(category)) {
    return "Write one complete Situation -> Action -> Result chain and state how the result supports the paragraph claim.";
  }
  return "Write three chains in the form: cause -> immediate effect -> wider consequence.";
}

function paragraphFunctionCheck(location, category) {
  if (/Introduction/i.test(location)) {
    return "Re-read the Introduction. Check only accurate prompt paraphrase, required route and position where required; do not add body-paragraph explanation or examples.";
  }
  if (/Conclusion/i.test(location)) {
    return "Re-read the Conclusion. Check that it closes the established route without adding a new idea, while preserving the repaired language.";
  }
  return `Re-read ${location}. Check that its controlling claim, ${category} repair and supporting evidence remain on one route.`;
}

function controlledReviewChecks({ taskType = "Task 2", visualType = "" } = {}) {
  if (String(taskType) !== "Task 1") {
    return [
      "Confirm every task requirement is answered.",
      "Check that each paragraph opening states its controlling route.",
      "Check each explanation for an explicit cause-and-effect link.",
      "Verify that each example contains a clear result.",
      "Check lexical choices against their grammatical frames.",
      "Proofread sentence endings, articles and agreement.",
      "Read the full response once for route and conclusion consistency."
    ];
  }
  if (/map|plan/i.test(visualType)) {
    return [
      "Verify every reported change against the map using Old Feature -> New Feature, then group changes by location or function.",
      "Check that purpose language appears only where the map explicitly provides a purpose.",
      "Confirm the overview reports the dominant transformation rather than isolated details."
    ];
  }
  if (/process|cycle|diagram|mechanism/i.test(visualType)) {
    return [
      "Verify the first stage, sequence, transformations and final endpoint against the diagram.",
      "Check that every stage names its input and output without inventing a cause or purpose.",
      "Confirm the overview states whether the process is linear, cyclical or branching."
    ];
  }
  if (/mixed|combination/i.test(visualType)) {
    return [
      "Verify that the overview covers the dominant feature from every supplied visual.",
      "Group comparable figures across visuals using the correct measure, unit and time reference.",
      "Check that no visual is described with an unsupported relationship."
    ];
  }
  return [
    "Verify the overview against the dominant visual features without adding unsupported detail.",
    "Check every selected figure, unit, category and time point against the visual.",
    "Use direct comparisons and group details by the most meaningful visual pattern."
  ];
}

// Rebuilds the two executive-summary lines from the CORRECTED canonical issue set, so the Most
// Urgent Repair can never name a local mechanical fix while a higher-priority task-level defect is
// present in the same report. Returns null when there is nothing to rank.
export function buildExecutiveSummaryFromIssues(issues = []) {
  const ranked = rankIssues((Array.isArray(issues) ? issues : []).filter((issue) => issue.severity !== "Pass / Strong"));
  if (!ranked.length) return null;
  return {
    mainScoreLimitingFactor: buildMainScoreLimiter(ranked),
    mostUrgentRepair: buildUrgentRepair(ranked),
    leadIssueId: ranked[0].issueId || "",
    leadIssueCategory: ranked[0].issueCategory || ranked[0].primaryCategory || ""
  };
}

// Semantic families used to decide whether an existing Executive Summary already addresses a
// defect. A summary that already names the same limitation in the engine's own words is kept, so
// promotion never rewrites prose that was already correct.
const SUMMARY_ADDRESSES = Object.freeze({
  "Comparative Judgement": /\bcompar|\bweigh|\boutweigh|relative importance/i,
  "Thesis-to-Body Promise": /\bthesis\b|\bpromise|declared|not developed|undeveloped/i,
  "Causal Mechanism": /\bmechanism|\bcausal\b|cause[- ]and[- ]effect/i,
  "Solution Mechanism": /\bmechanism|\bsolution\b/i,
  "Reference Control": /\breference|\bpronoun|antecedent/i,
  "Explanation Depth": /\bexplanation|\bdevelop|\bmechanism/i
});

export function summaryAlreadyAddresses(text = "", category = "") {
  const value = String(text || "");
  if (!value) return false;
  const pattern = SUMMARY_ADDRESSES[category];
  if (pattern) return pattern.test(value);
  const name = String(category || "").trim();
  return Boolean(name) && new RegExp(escapeRegExp(name), "i").test(value);
}

function buildMainScoreLimiter(ranked) {
  if (!ranked.length) return "No validated score-limiting issue was identified.";
  return ranked.slice(0, 2).map((issue) =>
    `${issue.issueCategory} in ${issue.paragraphLabel || issue.paragraphLocation}: ${trimSentence(issue.diagnosis || issue.whyItLimitsBand)}`
  ).join(" ");
}

function buildUrgentRepair(ranked) {
  if (!ranked.length) return "Maintain the current structure and complete a final evidence-based proofread.";
  const issue = ranked[0];
  return `${issue.paragraphLabel || issue.paragraphLocation}: ${trimSentence(issue.studentAction)}`;
}

function rankIssues(issues) {
  return [...issues].sort((left, right) => {
    const category = PRIORITY_ORDER.indexOf(left.issueCategory) - PRIORITY_ORDER.indexOf(right.issueCategory);
    if (category !== 0) {
      if (PRIORITY_ORDER.indexOf(left.issueCategory) < 0) return 1;
      if (PRIORITY_ORDER.indexOf(right.issueCategory) < 0) return -1;
      return category;
    }
    return severityRank(right.severity) - severityRank(left.severity);
  });
}

function trimSentence(value) {
  const text = String(value || "").trim();
  if (!text) return "repair the identified point.";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function severityRank(value) {
  return { "Pass / Strong": 0, "High-Band Refinement": 1, "Minor Repair": 2, Moderate: 3, Major: 4, Critical: 5 }[value] ?? 3;
}

function fatal(code, message) {
  return { severity: "fatal", code, message };
}

function repairable(code, message) {
  return { severity: "repairable", code, message };
}

function normalize(value) {
  return String(value || "").normalize("NFKC").toLowerCase();
}

function bandHigh(value) {
  const values = String(value || "").match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return values.length ? Math.max(...values) : Number.NaN;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
