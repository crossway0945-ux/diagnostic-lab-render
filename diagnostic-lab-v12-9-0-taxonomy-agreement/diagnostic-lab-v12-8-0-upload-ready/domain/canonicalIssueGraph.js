// Canonical issue graph — the single source of truth for every visible report section (V12.9.3).
//
// Two production defects motivated this module.
//
//   1. Executive Summary, Top Issues, Detailed Feedback, Paragraph Coverage and the Repair Plan each
//      applied their own ordering, so the Executive Summary correctly led with two Major task-level
//      defects while Top Issues opened with a Moderate Lexical Precision repair.
//
//   2. Sections retrieved issue content by shared sentence or by carrying forward an earlier top-issue
//      object, so two issues on ONE sentence cross-contaminated: a Lexical Precision card rendered the
//      Subject-Verb Agreement Student Action.
//
// The fix is structural. `finaliseCanonicalIssueGraph()` produces ONE ordered, deep-frozen graph.
// Every section projects from it by stable `issueId` and never by sentence, location or list
// position. Because the graph is frozen, a later stage cannot mutate an issue another section has
// already rendered — the failure mode is now a thrown error rather than a silently wrong report.

export const CANONICAL_ISSUE_GRAPH_VERSION = "canonical-issue-graph-v12.9.3";

// ---------------------------------------------------------------------------
// Priority comparator.
//
// One deterministic order, shared by every section. Card creation order is never a factor; it is
// used only as the final tie-break so the sort is stable.
// ---------------------------------------------------------------------------

const SEVERITY_RANK = Object.freeze({
  critical: 0,
  major: 1,
  moderate: 2,
  "minor repair": 3,
  minor: 3,
  "high-band refinement": 4,
  "pass / strong": 5
});

// Category tiers express *repair leverage*: what a learner must understand to fix the defect, from
// "you answered a different question" down to "you missed a space".
const CATEGORY_TIER = Object.freeze([
  { tier: 0, test: /Task Understanding|Visual Understanding|Task Achievement/i },
  { tier: 1, test: /Overview|Position Clarity|Route Clarity|Route Alignment|Prompt Coverage/i },
  { tier: 2, test: /Comparative Judgement|Comparative Weighing/i },
  { tier: 3, test: /Thesis-to-Body Promise|Undeveloped Promise|Broken Promise/i },
  { tier: 4, test: /Incomplete|Underlength|Completion Status/i },
  { tier: 5, test: /Sentence Completion/i },
  { tier: 6, test: /Meaning Control/i },
  { tier: 7, test: /Causal Mechanism|Solution Mechanism|Explanation Depth|Affected-Group|SAR Example Quality|Example Development/i },
  { tier: 8, test: /Semantic Relationship|Noun-Phrase Precision/i },
  { tier: 9, test: /Reference|Pronoun|Sentence Structure|Modifier/i },
  { tier: 10, test: /Lexical Precision|Word Choice|Word Form|Collocation/i },
  { tier: 11, test: /Grammar|Agreement|Tense|Preposition|Modal|Article/i },
  { tier: 12, test: /Countability|Punctuation|Concision|Academic Tone|Spelling/i }
]);

export function categoryTier(category = "") {
  const name = String(category || "");
  return (CATEGORY_TIER.find((entry) => entry.test.test(name)) || { tier: 11 }).tier;
}

// A task obligation is something the prompt REQUIRES. Failing one costs more than any local repair.
function touchesTaskObligation(issue = {}) {
  if (issue.taskObligation === true) return true;
  return /Comparative Judgement|Thesis-to-Body Promise|Prompt Coverage|Route Clarity|Route Alignment|Position Clarity|Task Achievement|Task Understanding/i
    .test(String(issue.primaryCategory || issue.issueCategory || ""));
}

// How far the defect moves a band. Derived from the criteria the issue is filed against plus whether
// the engine recorded it as score-limiting — never from a hand-tuned number.
function scoreImpact(issue = {}) {
  if (issue.scoreLimiting === true) return 2;
  const criteria = Array.isArray(issue.criteria) ? issue.criteria : [];
  if (criteria.length >= 2) return 2;
  return criteria.length === 1 ? 1 : 0;
}

function meaningImpaired(issue = {}) {
  if (issue.affectsMeaning === true) return true;
  return /meaning|unclear|ambiguous|does not identify|cannot tell/i.test(String(issue.diagnosis || issue.whyItLimitsBand || ""));
}

function recurrenceWeight(issue = {}) {
  const count = Number(issue.recurrenceCount || issue.occurrenceCount || 0);
  if (count >= 3) return 2;
  if (count >= 2) return 1;
  return issue.recurringPattern === true || issue.recurrenceKey ? 1 : 0;
}

// Breadth: a defect spanning several paragraphs is a pattern, not a slip.
function coverageWeight(issue = {}) {
  const paragraphs = Array.isArray(issue.affectedParagraphLabels) ? issue.affectedParagraphLabels.length : 0;
  const locations = Array.isArray(issue.evidenceLocations) ? issue.evidenceLocations.length : 0;
  return Math.min(2, Math.max(paragraphs, locations) > 1 ? Math.max(paragraphs, locations) - 1 : 0);
}

// A repair the learner can actually perform and check outranks one that only says "be clearer".
function repairLeverage(issue = {}) {
  if (issue.revisionType === "Minimal Correction") return 1;
  if (issue.revisionWithheld === true && touchesTaskObligation(issue)) return 2;
  return issue.targetSpan ? 1 : 0;
}

// Ordered, weighted key. Lower sorts first. Severity dominates, then task obligation, then the
// remaining signals, so a Major task-level defect can never sit below a Moderate local repair.
export function canonicalPriorityKey(issue = {}) {
  const severity = SEVERITY_RANK[String(issue.severity || "moderate").toLowerCase()] ?? 2;
  const obligation = touchesTaskObligation(issue) ? 0 : 1;
  const tier = categoryTier(issue.primaryCategory || issue.issueCategory);
  return [
    severity,
    obligation,
    tier,
    2 - scoreImpact(issue),
    meaningImpaired(issue) ? 0 : 1,
    2 - recurrenceWeight(issue),
    2 - coverageWeight(issue),
    2 - repairLeverage(issue)
  ];
}

export function compareCanonicalIssues(left = {}, right = {}) {
  const a = canonicalPriorityKey(left);
  const b = canonicalPriorityKey(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

// Stable: equal-priority issues keep their document order, so the report never reshuffles between runs.
export function orderCanonicalIssues(issues = []) {
  return (Array.isArray(issues) ? issues : [])
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => compareCanonicalIssues(a.issue, b.issue) || a.index - b.index)
    .map((entry) => entry.issue);
}

// ---------------------------------------------------------------------------
// The frozen graph.
// ---------------------------------------------------------------------------

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

// Guarantees every issue carries a stable, unique id BEFORE any section projects from it. An issue
// without an id cannot be projected safely, because every consumer would have to fall back to
// matching on sentence — which is the defect this module exists to prevent.
function assignStableIds(issues = []) {
  const seen = new Set();
  return issues.map((issue, index) => {
    let id = String(issue.issueId || "").trim();
    if (!id) id = `issue-${index + 1}-${String(issue.primaryCategory || issue.issueCategory || "issue").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`;
    while (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    return issue.issueId === id ? issue : { ...issue, issueId: id };
  });
}

/**
 * Finalises the canonical issue layer. After this call the issues are immutable and every section
 * must project from `byId` / `ordered`.
 */
export function finaliseCanonicalIssueGraph(issues = []) {
  const withIds = assignStableIds(Array.isArray(issues) ? issues : []);
  const ordered = orderCanonicalIssues(withIds).map((issue, index) => ({ ...issue, canonicalRank: index + 1 }));
  const frozen = ordered.map((issue) => deepFreeze({ ...issue }));
  const byId = new Map(frozen.map((issue) => [issue.issueId, issue]));
  return Object.freeze({
    version: CANONICAL_ISSUE_GRAPH_VERSION,
    ordered: Object.freeze(frozen),
    orderedIds: Object.freeze(frozen.map((issue) => issue.issueId)),
    byId,
    get(issueId) {
      return byId.get(String(issueId)) || null;
    },
    // Highest-priority ids, used identically by the Executive Summary, Top Issues and the Repair Plan.
    leadIds(limit = 3) {
      return frozen.slice(0, Math.max(0, limit)).map((issue) => issue.issueId);
    },
    forParagraph(paragraphLabel = "", paragraphId = "") {
      const label = String(paragraphLabel || "").toLowerCase().replace(/,.*$/, "").trim();
      return frozen.filter((issue) => {
        if (paragraphId && issue.paragraphId && String(issue.paragraphId) === String(paragraphId)) return true;
        const issueLabel = String(issue.paragraphLabel || issue.paragraphLocation || "").toLowerCase().replace(/,.*$/, "").trim();
        return Boolean(label) && Boolean(issueLabel) && (issueLabel.startsWith(label) || label.startsWith(issueLabel));
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Projection integrity.
//
// The contract every section must satisfy: for one issueId, all sections agree on category,
// severity, target span, diagnosis, Student Action, revision type, targeted revision and withholding
// state. A disagreement is a defect, not a rendering preference, so the audit fails closed.
// ---------------------------------------------------------------------------

const PROJECTED_FIELDS = Object.freeze([
  ["categoryConsistency", (item) => String(item.issueCategory || item.primaryCategory || "")],
  ["severityConsistency", (item) => String(item.severity || "")],
  ["targetConsistency", (item) => String(item.targetSpan || "")],
  ["diagnosisConsistency", (item) => String(item.kruPomDiagnosis || item.diagnosis || "")],
  ["actionConsistency", (item) => String(item.studentAction || "")],
  ["revisionConsistency", (item) => `${item.revisionType || ""}|${item.targetedRevision || ""}|${item.revisionWithheld === true}`]
]);

/**
 * @param graph  the frozen canonical graph
 * @param sections  { [sectionName]: Array<projected item carrying issueId> }
 * Returns one record per issueId with a pass/fail per dimension.
 */
export function buildProjectionConsistencyAudit(graph, sections = {}) {
  const records = [];
  const byIssue = new Map();
  for (const [sectionName, items] of Object.entries(sections || {})) {
    for (const item of Array.isArray(items) ? items : []) {
      const id = String(item?.issueId || "");
      if (!id) continue;
      if (!byIssue.has(id)) byIssue.set(id, []);
      byIssue.get(id).push({ sectionName, item });
    }
  }

  for (const issueId of graph.orderedIds) {
    const rendered = byIssue.get(issueId) || [];
    if (!rendered.length) continue;
    const canonical = graph.get(issueId);
    const record = {
      issueId,
      sectionsRendered: rendered.map((entry) => entry.sectionName),
      canonicalRank: canonical?.canonicalRank ?? 0,
      priorityConsistency: "pass",
      pass: true,
      repairPerformed: ""
    };
    for (const [name, read] of PROJECTED_FIELDS) {
      const expected = read(canonical || {});
      // A section may legitimately omit a field; only a CONFLICTING value is a defect.
      const conflict = rendered.find((entry) => {
        const actual = read(entry.item);
        return actual && expected && actual !== expected;
      });
      record[name] = conflict ? "fail" : "pass";
      if (conflict) {
        record.pass = false;
        record.conflicts = [...(record.conflicts || []), {
          field: name,
          section: conflict.sectionName,
          expected: expected.slice(0, 160),
          actual: read(conflict.item).slice(0, 160)
        }];
      }
    }
    records.push(record);
  }

  // Priority consistency: any section that presents an ordered subset must follow the canonical order.
  for (const [sectionName, items] of Object.entries(sections || {})) {
    const ids = (Array.isArray(items) ? items : []).map((item) => String(item?.issueId || "")).filter(Boolean);
    const ranks = ids.map((id) => graph.get(id)?.canonicalRank ?? Number.MAX_SAFE_INTEGER);
    const sorted = [...ranks].sort((a, b) => a - b);
    if (JSON.stringify(ranks) === JSON.stringify(sorted)) continue;
    for (const id of ids) {
      const record = records.find((item) => item.issueId === id);
      if (!record) continue;
      record.priorityConsistency = "fail";
      record.pass = false;
      record.conflicts = [...(record.conflicts || []), { field: "priorityConsistency", section: sectionName, expected: JSON.stringify(sorted), actual: JSON.stringify(ranks) }];
    }
  }

  return records;
}

export function projectionAuditFailures(records = []) {
  return (Array.isArray(records) ? records : []).filter((record) => record.pass === false);
}
