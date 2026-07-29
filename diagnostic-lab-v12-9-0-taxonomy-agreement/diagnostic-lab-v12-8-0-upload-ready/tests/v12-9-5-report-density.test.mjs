// V12.9.5 — report density and the page budget.
//
// Production defect: a Task 2 export rendered one full Detailed Feedback card per issue, one card
// per printed page, and discarded the `refinements` the canonical layer had already computed. Eva's
// report ran to 21+ pages, the last third of which was low-value mechanical repetition.
//
// These checks fail if one-card-per-page behaviour returns, if `refinements` stops being consumed,
// or if compaction ever starts editing canonical data (scoring, issues, order, actions, revisions).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DETAILED_FEEDBACK_MAX,
  estimateDetailedPrintUnits,
  groupCardsBySharedSentence,
  mustStayDetailed,
  planReportDensity,
  recurrenceCounts
} from "../domain/reportDensity.js";
import { promoteLanguageCandidates } from "../domain/canonicalIntegrity.js";
import { buildStudentReportViewModel } from "../domain/reportViewModels.js";

const issue = (overrides = {}) => ({
  issueId: `issue-${Math.random().toString(16).slice(2, 8)}`,
  issueCategory: "Punctuation",
  severity: "Minor Repair",
  paragraphLocation: "Body Paragraph 1",
  exactSentence: "A neutral sentence used as evidence.",
  targetSpan: "neutral",
  kruPomDiagnosis: "A short diagnosis.",
  studentAction: "Do the thing.",
  revisionType: "Minimal Correction",
  ...overrides
});

// ---------------------------------------------------------------------------
// 1. The Detailed Feedback cap, and the refusal to pad it.
// ---------------------------------------------------------------------------
const many = Array.from({ length: 14 }, (_, index) => issue({ issueId: `i${index}`, exactSentence: `Sentence number ${index}.` }));
const plan = planReportDensity({ issues: many, refinements: [] });
assert.equal(plan.detailedIssueIds.length, DETAILED_FEEDBACK_MAX, "detailed feedback is capped");
assert.equal(plan.demotedIssueIds.length, 14 - DETAILED_FEEDBACK_MAX, "every remaining issue is accounted for");
assert.equal(
  plan.detailedIssueIds.length + plan.demotedIssueIds.length,
  many.length,
  "compaction never drops an issue: detailed + demoted equals the canonical set"
);
assert.deepEqual(plan.detailedIssueIds, many.slice(0, DETAILED_FEEDBACK_MAX).map((item) => item.issueId),
  "the cap keeps the top of the canonical priority order, unchanged");

// A short report is not padded up to the cap.
const few = Array.from({ length: 3 }, (_, index) => issue({ issueId: `s${index}`, exactSentence: `Short ${index}.` }));
assert.equal(planReportDensity({ issues: few }).detailedIssueIds.length, 3, "a 3-issue report renders 3 cards, not a quota");

// Refinements are summary rows only — they can never be promoted into a full card.
const withRefinements = planReportDensity({
  issues: few,
  refinements: [{ category: "Article Control", exactSentence: "A refinement sentence.", exactProblemSpan: "a", score: 1, paragraphLocation: "Introduction", explanation: "Optional polish." }]
});
assert.equal(withRefinements.detailedIssueIds.length, 3, "a refinement never takes a Detailed Feedback slot");
assert.equal(withRefinements.summaryRows.length, 1, "the refinement is consumed as a summary row");
assert.equal(withRefinements.summaryRows[0].source, "refinement");
assert.equal(withRefinements.summaryRows[0].paragraphLocation, "Introduction", "a summary row keeps its paragraph location");

// ---------------------------------------------------------------------------
// 2. The protection contract: these are never demoted to save a page.
// ---------------------------------------------------------------------------
const recurrence = recurrenceCounts([issue({ recurrenceKey: "comma-splice" }), issue({ recurrenceKey: "comma-splice" })]);
assert.equal(mustStayDetailed(issue({ severity: "Major", issueCategory: "Comparative Judgement" })), "major-task-development");
assert.equal(mustStayDetailed(issue({ severity: "Major", promotionSource: "canonical-development-evidence", issueCategory: "Something New" })), "major-task-development");
assert.equal(mustStayDetailed(issue({ affectsMeaning: true })), "meaning-impaired");
assert.equal(mustStayDetailed(issue({ issueCategory: "Sentence Completion" })), "sentence-construction");
assert.equal(mustStayDetailed(issue({ recurrenceKey: "comma-splice" }), { recurrence }), "recurring-pattern");
assert.equal(mustStayDetailed(issue()), "", "an ordinary minor repair carries no protection");

// A protected issue sitting far down the priority order still keeps its card.
const buried = [
  ...Array.from({ length: 12 }, (_, index) => issue({ issueId: `f${index}`, exactSentence: `Filler ${index}.` })),
  issue({ issueId: "protected-major", severity: "Major", issueCategory: "Thesis-to-Body Promise", exactSentence: "The protected one." })
];
const buriedPlan = planReportDensity({ issues: buried });
assert.ok(buriedPlan.detailedIssueIds.includes("protected-major"), "a Major task-development issue is never demoted for page count");
assert.equal(buriedPlan.protectionReasons["protected-major"], "major-task-development");

// ---------------------------------------------------------------------------
// 3. Shared-sentence grouping keeps every issue independent.
// ---------------------------------------------------------------------------
const shared = "While this trend offers consumers greater product variety, I firmly believe that its disadvantages far outweigh the advantages.";
const groups = groupCardsBySharedSentence([
  issue({ issueId: "a", issueCategory: "Comparative Judgement", exactSentence: shared, studentAction: "Weigh the two sides directly.", revisionType: "Revision Unavailable" }),
  issue({ issueId: "b", issueCategory: "Thesis-to-Body Promise", exactSentence: shared, studentAction: "Develop the promised route.", revisionType: "Revision Unavailable" }),
  issue({ issueId: "c", issueCategory: "Punctuation", exactSentence: `  ${shared}  `, studentAction: "Remove the double space.", revisionType: "Minimal Correction" }),
  issue({ issueId: "d", issueCategory: "Word Form", exactSentence: "A different sentence entirely." })
]);
assert.equal(groups.length, 2, "three issues on one sentence form one evidence group");
assert.equal(groups[0].cards.length, 3, "the group keeps all three issues");
assert.deepEqual(groups[0].cards.map((card) => card.issueId), ["a", "b", "c"], "each issue keeps its own canonical id");
assert.equal(new Set(groups[0].cards.map((card) => card.issueCategory)).size, 3, "separate categories are preserved");
assert.equal(new Set(groups[0].cards.map((card) => card.studentAction)).size, 3, "Student Actions are not merged or cross-contaminated");
assert.equal(new Set(groups[0].cards.map((card) => card.revisionType)).size, 2, "separate revision states are preserved");
assert.equal(groups[0].exactSentence, shared, "the exact sentence is retained once, in full");

// ---------------------------------------------------------------------------
// 4. The page budget: the printable projection must not go back to one unit per card.
// ---------------------------------------------------------------------------
const eightCards = Array.from({ length: 8 }, (_, index) => issue({ issueId: `p${index}`, exactSentence: `Distinct sentence ${index}.` }));
const units = estimateDetailedPrintUnits(eightCards, { groupSize: 2 });
assert.equal(units, 4, "eight distinct cards pack into four print fragments, not eight");
assert.ok(units < eightCards.length, "REGRESSION GUARD: one print unit per card is one page per card");
// Shared evidence compacts further, because the quotation is rendered once.
assert.equal(estimateDetailedPrintUnits([...eightCards.slice(0, 6), issue({ issueId: "x", exactSentence: shared }), issue({ issueId: "y", exactSentence: shared })], { groupSize: 2 }), 4);

// ---------------------------------------------------------------------------
// 5. `refinements` is produced AND consumed.
// ---------------------------------------------------------------------------
const promotion = promoteLanguageCandidates([], {}, {});
assert.ok(Array.isArray(promotion.refinements), "promoteLanguageCandidates always returns a refinements array");

const languageProfile = {
  validatedIssues: [{
    exactSentence: "Urban commercial hubs contain an unparalleled variety of goods in one place.",
    exactProblemSpan: "one place",
    criterion: "Lexical Resource",
    category: "vague noun choice",
    classification: "high-band-refinement",
    severity: "minor",
    explanation: "Understandable, but a more precise noun would read better.",
    affectsMeaning: false,
    recurringPatternKey: "vague-noun-choice",
    paragraphLocation: "Body Paragraph 1"
  }]
};
const promoted = promoteLanguageCandidates([], languageProfile, { maxPromotions: 6 });
assert.equal(promoted.refinements.length, 1, "understandable wording is recorded as a refinement, not a card");
assert.equal(promoted.refinements[0].paragraphLocation, "Body Paragraph 1", "a refinement carries where it occurs");

// ---------------------------------------------------------------------------
// 6. The Student View exposes the Language Pattern Summary under its allowlist.
// ---------------------------------------------------------------------------
const analysis = {
  taskType: "Task 2",
  reportLanguage: "en",
  estimatedBandRange: "6.0",
  feedbackCards: many,
  feedbackIntegrity: {
    reportDensityPlan: plan,
    languagePatternSummary: plan.summaryRows
  }
};
const view = buildStudentReportViewModel(analysis, {});
assert.equal(view.detailedFeedback.length, DETAILED_FEEDBACK_MAX, "the Student View renders the capped detailed set");
assert.equal(view.languagePatternSummary.length, plan.summaryRows.length, "the Student View renders every summary row");
for (const row of view.languagePatternSummary) {
  assert.deepEqual(
    Object.keys(row).sort(),
    ["action", "category", "diagnosis", "paragraphLocation", "recurrence", "targetSpan"],
    "a summary row keeps category, location, target span, diagnosis, action and recurrence"
  );
}
// Without a plan every card is still rendered, so an older report never loses feedback.
const legacyView = buildStudentReportViewModel({ taskType: "Task 2", feedbackCards: many }, {});
assert.equal(legacyView.detailedFeedback.length, many.length, "a report with no density plan renders every card");
assert.deepEqual(legacyView.languagePatternSummary, []);

// ---------------------------------------------------------------------------
// 7. The printable projection is actually wired (not a dormant domain module).
// ---------------------------------------------------------------------------
const script = await readFile(new URL("../script.js", import.meta.url), "utf8");
assert.match(script, /import \{ groupCardsBySharedSentence \} from "\.\/domain\/reportDensity\.js"/, "the printable projection imports the grouping");
assert.match(script, /groupCardsBySharedSentence\(feedbackCards\)/, "Detailed Feedback is rendered through shared-sentence grouping");
assert.match(script, /renderPrintLanguagePatternRow/, "the Language Pattern Summary has a renderer");
assert.match(script, /languagePatternSummary/, "the printable projection consumes the summary");
assert.match(script, /print-feedback-list", 2\)/, "Detailed Feedback packs two evidence groups per print fragment");
assert.doesNotMatch(script, /print-feedback-list", 1\)/, "REGRESSION GUARD: a groupSize of 1 is one card per page");

const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
assert.match(css, /\.print-language-pattern-row/, "the Language Pattern Summary is styled for print");
assert.match(css, /\.print-feedback-shared-evidence/, "shared evidence is styled for print");

console.log("V12.9.5 report density: Detailed Feedback is capped without padding and without dropping an issue; Major task-development, meaning-impaired, sentence-construction and recurring defects are never demoted; issues sharing one sentence render the quotation once while keeping separate ids, categories, actions and revision states; refinements are produced and consumed as Language Pattern Summary rows in the Student View and the printable projection; and the print packing guard fails if one-card-per-page returns.");
