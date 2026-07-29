// Report density (V12.9.5).
//
// The canonical issue graph decides WHAT is true. This module decides only HOW MUCH of it is
// rendered as a full Detailed Feedback card and how much is rendered as a compact Language Pattern
// Summary row. It never edits an issue: no scoring, category, severity, priority order, Student
// Action or revision state is touched here. Every function is pure and deterministic, so the
// Student View and the printable/PDF projection make the identical split.
//
// The defect this fixes: a Task 2 export rendered one full card per issue and one card per page,
// producing 25+ page reports whose last third was low-value mechanical repetition, while the
// `refinements` the canonical layer already computed were discarded entirely.

export const REPORT_DENSITY_VERSION = "report-density-v12.9.5";

// A normal Task 2 report carries 5-8 full cards. The floor keeps a real report from being thinned
// into uselessness; the ceiling is what keeps the page budget in range. Neither is a quota to fill
// — a report with only four issues worth a full card renders four.
export const DETAILED_FEEDBACK_MIN = 5;
export const DETAILED_FEEDBACK_MAX = 8;

// Task-level development defects. A Major issue in this family is the reason the band is capped, so
// it can never be demoted to a summary row to save a page.
const DEVELOPMENT_CATEGORIES = new Set([
  "Comparative Judgement",
  "Thesis-to-Body Promise",
  "Causal Mechanism",
  "Example Development",
  "SAR Example Quality",
  "Position Clarity",
  "Conclusion Closure",
  "Task Response",
  "Development Depth",
  "Body Route Alignment",
  "Route Coverage"
]);

// Sentence-construction defects that change whether a sentence can be read as written.
const HIGH_IMPACT_CONSTRUCTION_CATEGORIES = new Set([
  "Sentence Completion",
  "Sentence Fragment",
  "Comma Splice",
  "Run-on Sentence",
  "Sentence Structure",
  "Sentence Boundary",
  "Grammar and Sentence Control"
]);

const norm = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const lower = (value) => norm(value).toLowerCase();

// Normalised sentence identity used to group issues that share one piece of evidence.
export function sharedSentenceKey(value) {
  return lower(value).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9' ]+/g, "");
}

function isMajor(issue) {
  return /^major$/i.test(norm(issue?.severity));
}

function categoriesOf(issue) {
  return [issue?.issueCategory, issue?.primaryCategory, ...(issue?.secondaryCategories || issue?.secondaryIssueCategories || [])]
    .map(norm)
    .filter(Boolean);
}

// Counts how often each recurrence key appears, so a pattern the student repeats can be recognised
// as score-limiting rather than incidental.
export function recurrenceCounts(issues = []) {
  const counts = new Map();
  for (const issue of issues) {
    const key = lower(issue?.recurrenceKey || issue?.recurringPatternKey);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

// The protection contract. An issue that answers true here keeps a full Detailed Feedback card even
// when that pushes the report to the top of its page budget.
export function mustStayDetailed(issue = {}, { recurrence = new Map() } = {}) {
  const categories = categoriesOf(issue);
  // 1. Major task-development issues.
  if (isMajor(issue) && categories.some((category) => DEVELOPMENT_CATEGORIES.has(category))) return "major-task-development";
  if (isMajor(issue) && String(issue.promotionSource || "") === "canonical-development-evidence") return "major-task-development";
  // 2. Meaning-impaired language.
  if (issue.affectsMeaning === true) return "meaning-impaired";
  // 3. High-impact sentence construction.
  if (categories.some((category) => HIGH_IMPACT_CONSTRUCTION_CATEGORIES.has(category))) return "sentence-construction";
  // 4. Recurring score-limiting patterns.
  const key = lower(issue.recurrenceKey || issue.recurringPatternKey);
  if (key && (recurrence.get(key) || 0) >= 2) return "recurring-pattern";
  return "";
}

function shortText(value, limit = 180) {
  const text = norm(value);
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit);
  const boundary = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("; "), clipped.lastIndexOf(", "), clipped.lastIndexOf(" "));
  return `${clipped.slice(0, boundary > 60 ? boundary : limit).trim()}...`;
}

function summaryRowFromIssue(issue = {}, { recurrence = new Map() } = {}) {
  const key = lower(issue.recurrenceKey || issue.recurringPatternKey);
  const occurrences = key ? recurrence.get(key) || 0 : 0;
  return {
    issueId: norm(issue.issueId),
    category: norm(issue.issueCategory || issue.primaryCategory || issue.issueType) || "Language pattern",
    paragraphLocation: norm(issue.paragraphLocation || issue.paragraphLabel),
    targetSpan: shortText(issue.targetSpan || issue.exactProblemSpan || issue.exactEvidence, 80),
    diagnosis: shortText(issue.kruPomDiagnosis || issue.diagnosis || issue.whyItLimitsBand || issue.explanation, 130),
    action: shortText(issue.studentAction, 110),
    recurrence: occurrences >= 2 ? `Occurs ${occurrences} times` : "",
    source: "issue"
  };
}

function summaryRowFromRefinement(refinement = {}) {
  return {
    issueId: "",
    category: norm(refinement.category) || "Language pattern",
    paragraphLocation: norm(refinement.paragraphLocation),
    targetSpan: shortText(refinement.exactProblemSpan || refinement.exactSentence, 90),
    diagnosis: shortText(refinement.explanation, 130),
    // A refinement is optional polish, so its action states that plainly rather than inventing a
    // repair instruction the canonical layer never validated.
    action: "Optional polish - review this wording when the higher-priority repairs are done.",
    recurrence: "",
    source: "refinement"
  };
}

// Decides the Detailed Feedback / Language Pattern Summary split for one report.
//
// `issues` must already be in canonical priority order (issueGraph.orderedIds). The split is a
// projection decision only: `detailedIssueIds` and `summaryRows` together account for every issue.
export function planReportDensity({ issues = [], refinements = [], maxDetailed = DETAILED_FEEDBACK_MAX } = {}) {
  const ordered = Array.isArray(issues) ? issues.filter(Boolean) : [];
  const recurrence = recurrenceCounts(ordered);
  const ceiling = Math.max(1, Number(maxDetailed) || DETAILED_FEEDBACK_MAX);

  const protectedIds = new Set();
  const protectionReasons = {};
  for (const issue of ordered) {
    const reason = mustStayDetailed(issue, { recurrence });
    if (reason) {
      protectedIds.add(norm(issue.issueId));
      protectionReasons[norm(issue.issueId)] = reason;
    }
  }

  // Protected issues always keep a card. Remaining slots are filled in canonical priority order,
  // never padded: if there is nothing left worth a full card, the report simply renders fewer.
  const detailed = new Set(protectedIds);
  for (const issue of ordered) {
    if (detailed.size >= ceiling) break;
    detailed.add(norm(issue.issueId));
  }

  const detailedIssueIds = ordered.map((issue) => norm(issue.issueId)).filter((id) => detailed.has(id));
  const demoted = ordered.filter((issue) => !detailed.has(norm(issue.issueId)));
  const summaryRows = [
    ...demoted.map((issue) => summaryRowFromIssue(issue, { recurrence })),
    ...(Array.isArray(refinements) ? refinements : []).map(summaryRowFromRefinement)
  ];

  return {
    version: REPORT_DENSITY_VERSION,
    detailedIssueIds,
    demotedIssueIds: demoted.map((issue) => norm(issue.issueId)),
    protectionReasons,
    summaryRows,
    // Reported so a regression that silently widens the cap is visible in the audit trail.
    ceiling,
    totalIssues: ordered.length
  };
}

// Groups Detailed Feedback cards that quote the SAME sentence so the evidence block is rendered
// once. Every issue keeps its own id, category, diagnosis, Student Action and revision state — the
// grouping is presentational only, which is exactly what the canonical independence guarantee in
// tests/v12-9-3-report-integrity.test.mjs exists to protect.
export function groupCardsBySharedSentence(cards = []) {
  const groups = [];
  const index = new Map();
  for (const card of Array.isArray(cards) ? cards.filter(Boolean) : []) {
    const key = sharedSentenceKey(card.exactSentence);
    if (!key) {
      groups.push({ key: `unique-${groups.length}`, exactSentence: norm(card.exactSentence), paragraphLocation: norm(card.paragraphLocation), cards: [card] });
      continue;
    }
    if (index.has(key)) {
      groups[index.get(key)].cards.push(card);
      continue;
    }
    index.set(key, groups.length);
    groups.push({
      key,
      exactSentence: norm(card.exactSentence),
      paragraphLocation: norm(card.paragraphLocation),
      cards: [card]
    });
  }
  return groups;
}

// Deterministic estimate of how many printable units a report will produce. Used by the page-budget
// test: it fails if the projection reverts to one unit (and therefore one page) per issue.
export function estimateDetailedPrintUnits(cards = [], { groupSize = 2 } = {}) {
  const groups = groupCardsBySharedSentence(cards);
  return Math.ceil(groups.length / Math.max(1, groupSize));
}
