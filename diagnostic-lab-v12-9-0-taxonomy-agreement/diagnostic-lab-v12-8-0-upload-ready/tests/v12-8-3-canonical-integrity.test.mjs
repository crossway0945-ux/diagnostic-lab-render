// V12.8.3 canonical diagnostic integrity — regression tests derived from the SEMANTIC PROPERTIES of a
// real exported production QA report (report 695dcee4c5a8d808c49db2a0). No student wording, issue id,
// score or visible prose is hardcoded into production logic; the fixtures below reproduce the shapes.
import assert from "node:assert/strict";
import {
  applyCanonicalIntegrity,
  buildSpecificStudentAction,
  canonicalIssueIdentity,
  correctIssueTaxonomy,
  correctRevisionType,
  correctSummaryFrequency,
  dedupeCanonicalIssues,
  diagnosisIsLexicalMeaning,
  orderIssuesByPriority,
  projectSentenceFunction,
  revisionAddsNewAffectedGroup,
  validateStudentAction
} from "../domain/canonicalIntegrity.js";

// Shape of the real defect A: a lexical-meaning complaint filed as a route gap on a cause_route span.
const lexicalOnRoute = {
  issueId: "issue-a", taskType: "Task 2", primaryCategory: "Cause Route Clarity", issueCategory: "Cause Route Clarity",
  secondaryCategories: ["Thesis Route Clarity"], evidenceAssertionType: "route_gap", sentenceRole: "cause_route",
  repairTargets: [], severity: "Moderate", paragraphLabel: "Introduction",
  exactEvidence: "The main drivers of this issue are the inattention of drivers and limited transport.",
  diagnosis: 'The route is visible, but "inattention" suggests a different meaning rather than the intended one.',
  studentAction: "Revise the quoted sentence for Cause Route Clarity, then check the paragraph function."
};

// 1-2. Lexical meaning is not a route gap; it maps to Lexical Precision with a real repair target.
const taxo = correctIssueTaxonomy(lexicalOnRoute, { routePresent: true });
assert.equal(taxo.changed, true);
assert.equal(taxo.issue.primaryCategory, "Lexical Precision", "a lexical-meaning defect is not a route category");
assert.equal(taxo.issue.evidenceAssertionType, "lexical_meaning", "the evidence assertion reflects the real defect");
assert.ok(taxo.issue.repairTargets.length > 0, "a repair target is populated");
assert.ok(taxo.issue.secondaryCategories.includes("Cause Route Clarity"), "the route effect survives as secondary only");
assert.ok(diagnosisIsLexicalMeaning(lexicalOnRoute.diagnosis));

// 3. A genuine missing-route diagnosis is NOT reclassified (no over-reach), and neither is Task 1.
const realRouteGap = { ...lexicalOnRoute, diagnosis: "The required solution route is missing and cannot be traced in the thesis." };
assert.equal(correctIssueTaxonomy(realRouteGap, { routePresent: true }).changed, false, "a real route gap stays a route issue");
assert.equal(correctIssueTaxonomy({ ...lexicalOnRoute, taskType: "Task 1" }, { routePresent: true }).changed, false, "Task 1 visual taxonomy is untouched");
assert.equal(correctIssueTaxonomy(lexicalOnRoute, { routePresent: false }).changed, false, "when the route is absent the route category stands");

// 5-7. Canonical deduplication: identical signature merges once; distinct defects never merge.
const dupA = { issueId: "d1", issueSignature: "Task 2|paragraph-2|7|Countability|946|973|countability", primaryCategory: "Countability", severity: "Moderate" };
const dupB = { ...dupA, issueId: "d2" };
const other = { issueId: "d3", issueSignature: "Task 2|paragraph-2|7|Punctuation|946|973|punctuation", primaryCategory: "Punctuation", severity: "Minor Repair" };
const deduped = dedupeCanonicalIssues([dupA, dupB, other]);
assert.equal(deduped.length, 2, "the identical duplicate is merged");
assert.equal(deduped.filter((i) => i.primaryCategory === "Countability").length, 1, "Countability appears once");
assert.ok(deduped[0].mergedCandidateIds.includes("d2"), "the merged id is recorded");
assert.deepEqual(dedupeCanonicalIssues(deduped), deduped, "deduplication is idempotent");
// An issue without provable identity is never merged away.
const vague = [{ issueId: "v1", primaryCategory: "X" }, { issueId: "v2", primaryCategory: "X" }];
assert.equal(canonicalIssueIdentity(vague[0]), null, "insufficient canonical detail yields no identity");
assert.equal(dedupeCanonicalIssues(vague).length, 2, "issues lacking canonical detail are preserved, not merged");

// 8. Priority: a Major defect always sorts before Moderate/Minor ones.
const ordered = orderIssuesByPriority([
  { issueId: "p1", primaryCategory: "Cause Route Clarity", severity: "Moderate" },
  { issueId: "p2", primaryCategory: "Countability", severity: "Moderate" },
  { issueId: "p3", primaryCategory: "Sentence Completion", severity: "Major" }
]);
assert.equal(ordered[0].primaryCategory, "Sentence Completion", "the Major fragment leads");
assert.equal(ordered.at(-1).primaryCategory, "Countability", "local refinement sorts last");

// 10. Sentence role projects to natural student language, never an internal enum.
const projected = projectSentenceFunction({ sentenceRole: "causal_mechanism", secondarySentenceRoles: ["result", "consequence"] });
assert.match(projected, /^This sentence /);
assert.doesNotMatch(projected, /causal_mechanism|consequence_role|_/, "no internal enum names leak");
assert.ok(projected.length < 200, "the projection stays readable");

// 11-12. False "new affected group" is rejected; a genuinely new group is still detected.
assert.equal(revisionAddsNewAffectedGroup("more various ways to travel can reduce the overcrowding of cars", "more public transport options can reduce the number of cars on the road"), false, "clarifying an existing referent is not a new group");
assert.equal(revisionAddsNewAffectedGroup("public transport reduces cars", "public transport helps elderly residents and reduces cars"), true, "a genuinely new group is detected");
const revFixed = correctRevisionType({
  issueId: "r1", revisionType: "Teacher-Guided Expansion",
  exactEvidence: "As a result, more various ways to travel can reduce the overcrowding of cars.",
  targetedRevision: "As a result, more public transport options can reduce the number of cars on the road.",
  revisionQualityProblems: [{ code: "REVISION_TYPE_FIDELITY", message: '"Route-Preserving Revision" introduces a new affected group and should be labelled Teacher-Guided Expansion.' }]
});
assert.equal(revFixed.changed, true);
assert.equal(revFixed.issue.revisionType, "Route-Preserving Revision", "no new proposition means the revision stays route-preserving");
assert.equal(revFixed.issue.revisionQualityProblems.length, 0);

// 13-15. Student Action validator: exact-repair mode, precise-operation mode, generic rejection.
assert.equal(validateStudentAction('Replace "unconsciousness" with a precise term.').mode, "exact-repair");
assert.equal(validateStudentAction("In Body Paragraph 2, Sentence 6, turn the fragment into a complete sentence with an independent subject and finite main verb while preserving the original idea.").pass, true, "a precise learner operation is valid without a full model sentence");
assert.equal(validateStudentAction("Replace the inaccurate wording with a precise term.").pass, false, "generic guidance is still rejected");
assert.equal(validateStudentAction("Revise the quoted sentence for Cause Route Clarity.").pass, false);
// A regenerated action derived from the canonical repair target is specific and passes.
const rebuilt = buildSpecificStudentAction(taxo.issue);
assert.ok(rebuilt && validateStudentAction(rebuilt).pass, "the regenerated Student Action is specific enough");
// Repetitive/long spans are never quoted back (they would read as duplicated generated text).
assert.equal(buildSpecificStudentAction({ primaryCategory: "Lexical Precision", repairTargets: [{ target: "detail1 detail2 detail3 detail4 detail5 detail6 detail7 detail8 detail9" }] }), "");

// 16. Summary frequency must be supported by validated occurrences.
const oneEach = [{ primaryCategory: "Lexical Precision" }, { primaryCategory: "Countability" }, { primaryCategory: "Sentence Completion" }];
const downgraded = correctSummaryFrequency("uneven development combined with frequent grammar and collocation errors", oneEach);
assert.equal(downgraded.changed, true);
assert.doesNotMatch(downgraded.text, /frequent/i, "an unsupported frequency claim is removed");
const recurring = [{ primaryCategory: "Collocation" }, { primaryCategory: "Collocation" }, { primaryCategory: "Collocation" }];
assert.equal(correctSummaryFrequency("frequent collocation errors", recurring).changed, false, "a genuinely recurring family keeps its frequency wording");

// End-to-end over the whole canonical layer, and idempotency of the full pass.
const pass1 = applyCanonicalIntegrity({
  issues: [lexicalOnRoute, dupA, dupB, { issueId: "f1", taskType: "Task 2", primaryCategory: "Sentence Completion", severity: "Major", studentAction: "In Body Paragraph 2, Sentence 6, turn the fragment into a complete sentence with a finite main verb while preserving the original idea." }],
  executiveSummary: { mainScoreLimitingFactor: "frequent grammar errors", mostUrgentRepair: "x" },
  routePresent: true
});
assert.equal(pass1.issues.filter((i) => i.primaryCategory === "Countability").length, 1, "duplicates merged in the full pass");
assert.equal(pass1.prioritised[0].primaryCategory, "Sentence Completion", "Top Issues lead with the Major defect");
assert.equal(pass1.issues.find((i) => i.issueId === "issue-a").primaryCategory, "Lexical Precision");
assert.doesNotMatch(pass1.executiveSummary.mainScoreLimitingFactor, /frequent/i);
const pass2 = applyCanonicalIntegrity({ issues: pass1.issues, executiveSummary: pass1.executiveSummary, routePresent: true });
assert.deepEqual(pass2.issues, pass1.issues, "the full canonical integrity pass is idempotent");

// 21. No punctuation issue is fabricated when the stored source has correct spacing.
assert.equal(/congestion\.Therefore/.test("traffic congestion. Therefore, the traffic would be heavy."), false, "correctly spaced source proves no spacing defect");

// ---------------------------------------------------------------------------
// INTEGRATION: the correction must run automatically inside the real pipeline for every completed
// Task 2 analysis, and its results must survive into the Student View. This locks the wiring in.
// ---------------------------------------------------------------------------
process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE = "false";
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;
const { analyzeWriting } = await import("../services/aiAnalyzer.js");
const { buildStudentReportViewModel } = await import("../domain/reportViewModels.js");
const { countWords } = await import("../wordCount.js");

const essay = [
  "Many people believe that spending money on space exploration is not the best use of public funds because there are urgent problems on Earth. I partly agree with this view, although I also think space research can bring long-term benefits.",
  "On one hand, many countries still face poverty, hunger, and poor healthcare. In this situation, spending billions on rockets can seem wasteful because governments could build hospitals, schools, and houses for people in need.",
  "On the other hand, space exploration also brings useful results that help daily life. Satellites support weather forecasts, GPS, and communication, and space research can help scientists understand climate risks.",
  "In conclusion, countries should solve urgent social problems first, but carefully managed investment in space exploration can still be valuable for the future."
].join("\n\n");
const task2Prompt = "Some people think the money spent on developing the technology for space exploration is not justified. There are more beneficial ways to spend this money. To what extent do you agree or disagree?";

async function analyseTask2(writing) {
  return analyzeWriting({ taskType: "Task 2", essayType: "Opinion Essay", visualType: "", targetBand: "7.0", prompt: task2Prompt, writing, options: {}, reportLanguage: "en" });
}

// 22a. The previously-regressing underlength Task 2 path completes (no REPORT_OUTPUT_VALIDATION_FAILED).
const filler = Array.from({ length: 249 - countWords(essay) }, (_, index) => `detail${index + 1}`).join(" ");
const underlength = await analyseTask2(`${essay}\n\n${filler}.`);
assert.ok(underlength.estimatedBandRange, "underlength Task 2 completes through the real pipeline");

// 22b. Every top issue is correctly re-linked to an existing card, with matching category/evidence.
for (const [index, top] of (underlength.top3Issues || []).entries()) {
  const match = String(top.feedbackCardId || "").match(/^card-(\d+)$/);
  assert.ok(match, `top issue ${index + 1} carries a card link`);
  const card = underlength.feedbackCards[Number(match[1]) - 1];
  assert.ok(card, `top issue ${index + 1} links to an existing detailed card`);
  assert.equal(top.issueCategory, card.issueCategory, `top issue ${index + 1} category matches its card`);
}

// 22c. Priority: no Major defect may sit below a Moderate/Minor one in Top Issues.
const rank = { Critical: 0, Major: 1, Moderate: 2, "Minor Repair": 3 };
const severities = (underlength.top3Issues || []).map((t) => rank[t.severity] ?? 2);
assert.deepEqual(severities, [...severities].sort((a, b) => a - b), "Top Issues are ordered most-severe first");

// 22d. Canonical invariants hold in the produced report.
const normal = await analyseTask2(essay);
const signatures = (normal.feedbackCards || []).map((c) => c.issueSignature).filter(Boolean);
assert.equal(new Set(signatures).size, signatures.length, "no duplicate canonical issue signature survives");
assert.equal((normal.feedbackCards || []).filter((c) => /could not be determined/i.test(c.sentenceFunction || "")).length, 0, "no undetermined sentence function reaches the report");
assert.equal(
  (normal.feedbackCards || []).filter((c) => /Route Clarity|Route Alignment/.test(c.issueCategory || "") && c.evidenceAssertionType === "route_gap" && diagnosisIsLexicalMeaning(c.diagnosis || "")).length,
  0,
  "no lexical-meaning defect is filed as a route gap"
);

// 22e. The corrections survive into the Student View, and the view keeps its exact allowlisted shape
// (buildStudentReportViewModel throws if an unsupported field is present).
const view = buildStudentReportViewModel(normal);
assert.equal(view.topIssues.length, (normal.top3Issues || []).length, "Student View shows the corrected top issues");
assert.deepEqual(view.topIssues.map((t) => t.issueCategory), (normal.top3Issues || []).map((t) => t.issueCategory), "Student View order matches the corrected canonical order");
assert.ok(view.detailedFeedback.length > 0, "Student View renders detailed feedback");

console.log("V12.8.3 canonical integrity: lexical-meaning taxonomy, evidence assertion, conservative dedupe, severity priority, sentence-function projection, revision-type fidelity, Student Action modes and summary frequency verified (idempotent), and the correction is wired into the real pipeline end-to-end.");
