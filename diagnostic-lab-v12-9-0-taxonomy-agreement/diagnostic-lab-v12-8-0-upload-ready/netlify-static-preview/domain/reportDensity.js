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

export const REPORT_DENSITY_VERSION = "report-density-v12.9.7";

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
  "Thesis Route Clarity",
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
  if (/Body Paragraph\s+\d+,\s*Sentence\s+1/i.test(norm(issue.paragraphLocation)) &&
      categories.some((category) => /Collocation|Word Form|Lexical Precision/.test(category))) return "topic-sentence-language";
  if (/Conclusion/i.test(norm(issue.paragraphLocation)) &&
      categories.some((category) => /Lexical Precision|Grammar and Sentence Control|Sentence Completion/.test(category))) return "conclusion-language";
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

// Minimal-correction summary rows show the corrected target phrase, not a second copy of the full
// sentence already displayed in Detailed Feedback. The surrounding Target line supplies the source
// phrase, and the compact revision remains complete and copyable without inflating the PDF.
function compactRevisionForSummary(issue = {}) {
  const original = norm(issue.exactSentence || issue.exactEvidence);
  const target = norm(issue.targetSpan || issue.exactProblemSpan);
  const revision = norm(issue.targetedRevision);
  if (!original || !target || !revision || !/Minimal Correction/i.test(norm(issue.revisionType))) return revision;
  const originalLower = original.toLowerCase();
  const targetIndex = originalLower.indexOf(target.toLowerCase());
  if (targetIndex < 0) return revision;
  const prefixWords = original.slice(0, targetIndex).trim().split(/\s+/).filter(Boolean);
  const suffixWords = original.slice(targetIndex + target.length).trim().split(/\s+/).filter(Boolean);
  const revisionLower = revision.toLowerCase();
  let start = 0;
  for (let size = Math.min(6, prefixWords.length); size >= 1; size -= 1) {
    const phrase = prefixWords.slice(-size).join(" ").toLowerCase();
    const index = revisionLower.indexOf(phrase);
    if (index >= 0) {
      start = index + phrase.length;
      break;
    }
  }
  let end = revision.length;
  outer: for (let offset = 0; offset < Math.min(8, suffixWords.length); offset += 1) {
    for (let size = Math.min(4, suffixWords.length - offset); size >= 1; size -= 1) {
      const phrase = suffixWords.slice(offset, offset + size).join(" ").toLowerCase();
      const index = revisionLower.indexOf(phrase, start);
      if (index >= 0) {
        end = index;
        break outer;
      }
    }
  }
  let compact = revision.slice(start, end).replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, "").trim();
  if (/\bdesignated$/i.test(compact) && suffixWords[0]) {
    compact = `${compact} ${suffixWords[0].replace(/[^\p{L}\p{N}'-]/gu, "")}`.trim();
  }
  return compact && compact.length <= 180 ? compact : revision;
}

function compactRevisionWhy(issue = {}) {
  const target = shortText(issue.targetSpan || issue.exactProblemSpan || "the cited wording", 38);
  const category = norm(issue.issueCategory || issue.primaryCategory || issue.issueType || "language-control issue");
  return `Corrects "${target}" (${category.toLowerCase()}) without changing the claim or route.`;
}

function summaryRowFromIssue(issue = {}, { recurrence = new Map() } = {}) {
  const key = lower(issue.recurrenceKey || issue.recurringPatternKey);
  const occurrences = key ? recurrence.get(key) || 0 : 0;
  return {
    issueId: norm(issue.issueId),
    category: norm(issue.issueCategory || issue.primaryCategory || issue.issueType) || "Language pattern",
    paragraphLocation: norm(issue.paragraphLocation || issue.paragraphLabel),
    targetSpan: shortText(issue.targetSpan || issue.exactProblemSpan || issue.exactEvidence, 46),
    diagnosis: shortText(issue.kruPomDiagnosis || issue.diagnosis || issue.whyItLimitsBand || issue.explanation, 96),
    action: shortText(issue.studentAction, 82),
    revisionType: norm(issue.revisionType),
    targetedRevision: compactRevisionForSummary(issue),
    whyRevisionIsStronger: compactRevisionWhy(issue),
    recurrence: occurrences >= 2 ? `Occurs ${occurrences} times` : "",
    source: "issue"
  };
}

function summaryRowFromRefinement(refinement = {}) {
  return {
    issueId: "",
    category: norm(refinement.category) || "Language pattern",
    paragraphLocation: norm(refinement.paragraphLocation),
    targetSpan: shortText(refinement.exactProblemSpan || refinement.exactSentence, 70),
    diagnosis: shortText(refinement.explanation, 96),
    // A refinement is optional polish, so its action states that plainly rather than inventing a
    // repair instruction the canonical layer never validated.
    action: "Optional polish - review this wording when the higher-priority repairs are done.",
    revisionType: "",
    targetedRevision: "",
    whyRevisionIsStronger: "",
    recurrence: "",
    source: "refinement"
  };
}

function dedupeText(value) {
  return lower(value)
    .replace(/[â€˜â€™]/g, "'")
    .replace(/[â€œâ€]/g, '"')
    .replace(/[^\p{L}\p{N}' ]+/gu, " ");
}

// Final visible-value threshold. It is intentionally applied here, after provider promotion,
// candidate merging, canonical thresholding and refinement construction. A weak cosmetic point
// cannot re-enter the report through the late Language Pattern Summary projection.
export function refinementVisibleValue(refinement = {}) {
  const category = lower(refinement.category);
  const explanation = lower(refinement.explanation);
  const span = norm(refinement.exactProblemSpan);
  const recurrence = lower(refinement.recurringPatternKey || refinement.recurrenceKey);
  let score = 0;
  if (refinement.affectsMeaning === true) score += 5;
  if (recurrence) score += 3;
  if (span) score += 1;
  if (/subject.?verb|agreement|countab|article|sentence completion|fragment|word form/.test(category)) score += 4;
  if (/collocation|lexical precision|word choice/.test(category)) score += 2;
  if (/unnatural|changes? meaning|does not identify|not a natural collocation|word form/.test(explanation)) score += 2;
  if (/vague noun choice|too vague|understandable but|slightly imprecise|optional polish|cosmetic/.test(`${category} ${explanation}`) && refinement.affectsMeaning !== true && !recurrence) score -= 4;
  if (/punctuation|spacing/.test(category) && refinement.affectsMeaning !== true && !recurrence) score -= 3;
  return {
    score,
    pass: score >= 3,
    reason: score >= 3 ? "visible-value-threshold-met" : "below-final-visible-value-threshold"
  };
}

// Dedupe after every merge and threshold stage. Stable issueId wins when present; rows without an
// id are matched on the full category-location-target-diagnosis-action contract. Different targets
// or diagnoses in one sentence therefore remain separate.
export function deduplicateLanguagePatternSummary(rows = []) {
  const output = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows.filter(Boolean) : []) {
    const id = norm(row.issueId);
    const key = id
      ? `id:${id}`
      : [
          dedupeText(row.category),
          dedupeText(row.paragraphLocation),
          dedupeText(row.targetSpan),
          dedupeText(row.diagnosis),
          dedupeText(row.action)
        ].join("|");
    if (!key.replace(/[|]/g, "") || seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }
  return output;
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
  const taskLevelSentenceKeys = new Set(ordered
    .filter((issue) => mustStayDetailed(issue, { recurrence }) === "major-task-development")
    .map((issue) => sharedSentenceKey(issue.exactSentence))
    .filter(Boolean));
  for (const issue of ordered) {
    const reason = mustStayDetailed(issue, { recurrence });
    const shadowedByTaskLevelCard = reason !== "major-task-development" &&
      taskLevelSentenceKeys.has(sharedSentenceKey(issue.exactSentence)) &&
      issue.affectsMeaning !== true &&
      !categoriesOf(issue).some((category) => HIGH_IMPACT_CONSTRUCTION_CATEGORIES.has(category));
    if (shadowedByTaskLevelCard) continue;
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
  const visibleRefinements = (Array.isArray(refinements) ? refinements : [])
    .filter((refinement) => refinementVisibleValue(refinement).pass);
  const summaryRows = deduplicateLanguagePatternSummary([
    ...demoted.map((issue) => summaryRowFromIssue(issue, { recurrence })),
    ...visibleRefinements.map(summaryRowFromRefinement)
  ]);

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
