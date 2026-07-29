// V12.9.3 — report integrity: one canonical order, one projection, honest withholding, semantic
// reference control.
//
// Grounded in the production artifact `IELTS Writing 7+ Diagnostic Lab (Eva) 3.pdf` /
// `diagnostic-qa-Eva-dbcbeccf08e85b8d71455b35.json`, in which:
//   * the Executive Summary correctly led with two Major task-level defects while Top Issues opened
//     with "Lexical Precision [Moderate]" — four sections, four different orders;
//   * a Lexical Precision top issue rendered the Subject-Verb Agreement Student Action, because
//     sections joined issue content by shared sentence rather than by issue identity;
//   * a card marked "Revision Unavailable" still claimed "The revision removes the diagnosed
//     language-control problem…" — prose about a revision that does not exist;
//   * "…businesses are forced into bankruptcy. This leads to immediate local job losses…" was flagged
//     as a Moderate Reference Control defect purely because the previous sentence had two clauses.
import assert from "node:assert/strict";
import {
  buildProjectionConsistencyAudit,
  categoryTier,
  compareCanonicalIssues,
  finaliseCanonicalIssueGraph,
  orderCanonicalIssues,
  projectionAuditFailures
} from "../domain/canonicalIssueGraph.js";
import {
  applyRevisionWithholdingContract,
  projectCanonicalIssueForDisplay,
  withholdingReasonFor
} from "../domain/canonicalIntegrity.js";
import { classifyDemonstrativeReference } from "../domain/canonicalDevelopmentEvidence.js";

// ---------------------------------------------------------------------------
// DEFECT 1 — one deterministic canonical priority order.
// ---------------------------------------------------------------------------
const evaShaped = [
  { issueId: "lex-1", primaryCategory: "Lexical Precision", severity: "Moderate", criteria: ["Lexical Resource"] },
  { issueId: "sva-1", primaryCategory: "Subject-Verb Agreement", severity: "Moderate", criteria: ["Grammatical Range & Accuracy"] },
  { issueId: "lex-2", primaryCategory: "Lexical Precision", severity: "Minor Repair", criteria: ["Lexical Resource"] },
  { issueId: "cmp-1", primaryCategory: "Comparative Judgement", severity: "Major", criteria: ["Task Response"] },
  { issueId: "promise-1", primaryCategory: "Thesis-to-Body Promise", severity: "Major", criteria: ["Task Response"] },
  { issueId: "mech-1", primaryCategory: "Causal Mechanism", severity: "Moderate", criteria: ["Coherence & Cohesion"] },
  { issueId: "punct-1", primaryCategory: "Punctuation", severity: "Minor Repair", criteria: ["Grammatical Range & Accuracy"] }
];
const ordered = orderCanonicalIssues(evaShaped).map((issue) => issue.issueId);
assert.deepEqual(ordered.slice(0, 3), ["cmp-1", "promise-1", "mech-1"], "Major task-level defects lead, then development");
assert.ok(ordered.indexOf("cmp-1") < ordered.indexOf("lex-1"), "a Major task defect outranks a Moderate local repair");
assert.ok(ordered.indexOf("sva-1") < ordered.indexOf("punct-1"), "grammar outranks local mechanics at equal severity");
assert.equal(ordered.at(-1), "punct-1", "local mechanical repair sorts last");

// Card creation order must not influence the result.
const shuffled = orderCanonicalIssues([...evaShaped].reverse()).map((issue) => issue.issueId);
assert.deepEqual(shuffled.slice(0, 2), ["cmp-1", "promise-1"], "order is independent of card creation order");

// Every required signal participates.
assert.ok(categoryTier("Comparative Judgement") < categoryTier("Lexical Precision"));
assert.ok(categoryTier("Meaning Control") < categoryTier("Punctuation"));
assert.ok(compareCanonicalIssues(
  { severity: "Moderate", primaryCategory: "Collocation", affectsMeaning: true },
  { severity: "Moderate", primaryCategory: "Collocation", affectsMeaning: false }
) < 0, "meaning impairment breaks a tie");
assert.ok(compareCanonicalIssues(
  { severity: "Moderate", primaryCategory: "Collocation", recurrenceCount: 3 },
  { severity: "Moderate", primaryCategory: "Collocation" }
) < 0, "recurrence breaks a tie");
assert.ok(compareCanonicalIssues(
  { severity: "Moderate", primaryCategory: "Collocation", criteria: ["Lexical Resource", "Coherence & Cohesion"] },
  { severity: "Moderate", primaryCategory: "Collocation", criteria: ["Lexical Resource"] }
) < 0, "score impact breaks a tie");
assert.ok(compareCanonicalIssues(
  { severity: "Moderate", primaryCategory: "Collocation", evidenceLocations: [1, 2, 3] },
  { severity: "Moderate", primaryCategory: "Collocation", evidenceLocations: [1] }
) < 0, "paragraph coverage breaks a tie");

// ---------------------------------------------------------------------------
// DEFECT 2 — projection by stable issueId; two issues on ONE sentence stay independent.
// ---------------------------------------------------------------------------
const SHARED_SENTENCE = "Therefore, the promotion of small town center shops are vital to prevent economic decline.";
const lexical = {
  issueId: "eva-lexical",
  primaryCategory: "Lexical Precision",
  issueCategory: "Lexical Precision",
  severity: "Moderate",
  exactSentence: SHARED_SENTENCE,
  exactEvidence: SHARED_SENTENCE,
  paragraphLabel: "Body Paragraph 2",
  targetSpan: "the promotion of small town center shops",
  studentAction: 'Replace "the promotion of small town center shops" with wording that names what you actually mean.',
  revisionType: "Revision Unavailable",
  revisionWithheld: true,
  targetedRevision: "Revision unavailable."
};
const agreement = {
  issueId: "eva-sva",
  primaryCategory: "Subject-Verb Agreement",
  issueCategory: "Subject-Verb Agreement",
  severity: "Moderate",
  exactSentence: SHARED_SENTENCE,
  exactEvidence: SHARED_SENTENCE,
  paragraphLabel: "Body Paragraph 2",
  targetSpan: "are",
  studentAction: 'In Body Paragraph 2, Sentence 5, change "are" to "is".',
  revisionType: "Minimal Correction",
  targetedRevision: "Therefore, the promotion of small town center shops is vital to prevent economic decline.",
  whyRevisionIsStronger: 'The revision changes "are" to "is" so the verb agrees with the singular head "promotion".'
};

const graph = finaliseCanonicalIssueGraph([lexical, agreement]);
const lexicalCard = projectCanonicalIssueForDisplay(graph.get("eva-lexical"));
const agreementCard = projectCanonicalIssueForDisplay(graph.get("eva-sva"));

assert.equal(agreementCard.targetSpan, "are", "the SVA card keeps its own target span");
assert.match(agreementCard.studentAction, /change "are" to "is"/, "the SVA card shows the SVA action");
assert.doesNotMatch(agreementCard.studentAction, /promotion of small town center shops/, "the SVA card never shows the Lexical action");
assert.equal(agreementCard.revisionType, "Minimal Correction");
assert.equal(lexicalCard.targetSpan, "the promotion of small town center shops", "the Lexical card keeps its own target span");
assert.match(lexicalCard.studentAction, /Replace "the promotion/, "the Lexical card shows the Lexical action");
assert.doesNotMatch(lexicalCard.studentAction, /change "are" to "is"/, "the Lexical card never shows the SVA action");
assert.equal(lexicalCard.revisionType, "Revision Unavailable");
assert.equal(lexicalCard.exactSentence, agreementCard.exactSentence, "the two issues legitimately share one sentence");

// The graph is immutable: a later stage cannot overwrite an issue another section already rendered.
assert.throws(() => { graph.get("eva-sva").studentAction = "tampered"; }, TypeError, "the canonical graph is frozen");

// The projection audit passes when every section projects from canonical…
const goodAudit = buildProjectionConsistencyAudit(graph, {
  topIssues: [agreementCard, lexicalCard].sort((a, b) => graph.get(a.issueId).canonicalRank - graph.get(b.issueId).canonicalRank),
  detailedFeedback: [lexicalCard, agreementCard].sort((a, b) => graph.get(a.issueId).canonicalRank - graph.get(b.issueId).canonicalRank)
});
assert.equal(projectionAuditFailures(goodAudit).length, 0, "a consistent projection audits clean");
for (const record of goodAudit) {
  for (const field of ["issueId", "sectionsRendered", "categoryConsistency", "severityConsistency", "actionConsistency", "revisionConsistency", "priorityConsistency", "pass", "repairPerformed"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(record, field), `audit record carries ${field}`);
  }
}

// …and fails closed when a section renders another issue's Student Action.
const contaminated = buildProjectionConsistencyAudit(graph, {
  topIssues: [{ ...agreementCard, studentAction: lexical.studentAction }]
});
const contaminationFailures = projectionAuditFailures(contaminated);
assert.equal(contaminationFailures.length, 1, "a cross-contaminated action is detected");
assert.equal(contaminationFailures[0].actionConsistency, "fail");
assert.equal(contaminationFailures[0].issueId, "eva-sva");

// A section presenting issues out of canonical order also fails.
const misordered = buildProjectionConsistencyAudit(graph, {
  topIssues: [projectCanonicalIssueForDisplay(graph.get(graph.orderedIds[1])), projectCanonicalIssueForDisplay(graph.get(graph.orderedIds[0]))]
});
assert.ok(projectionAuditFailures(misordered).some((record) => record.priorityConsistency === "fail"), "out-of-order sections fail priority consistency");

// ---------------------------------------------------------------------------
// DEFECT 4 — a withheld card never claims a revision it does not have.
// ---------------------------------------------------------------------------
const withheld = applyRevisionWithholdingContract({
  issueId: "w1",
  primaryCategory: "Lexical Precision",
  revisionType: "Revision Unavailable",
  revisionWithheld: true,
  targetSpan: "the promotion of small town center shops",
  targetedRevision: "Revision unavailable: a safe rewrite could not be verified.",
  whyRevisionIsStronger: "The revision removes the diagnosed language-control problem, remains accurate and keeps the claim.",
  sentenceFunction: "-",
  studentAction: "Replace the imprecise wording."
}).issue;
assert.equal(withheld.whyRevisionIsStronger, "", "no successful-revision rationale survives on a withheld card");
assert.ok(withheld.whyRevisionIsNotShown.length > 40, "a withholding-specific explanation is supplied");
assert.doesNotMatch(withheld.whyRevisionIsNotShown, /revision (?:removes|is stronger|fixes)/i, "it does not claim the issue was fixed");
assert.equal(withheld.sentenceFunction, "", "placeholder hyphens are cleared, not rendered");
assert.ok(withheld.studentAction, "the Student Action is preserved");
assert.equal(withheld.revisionWithholdingReasonCode, "meaning-not-recoverable");

// The reason is specific to the defect class, not one generic string.
assert.equal(withholdingReasonFor({ primaryCategory: "Comparative Judgement" }).code, "requires-learner-content");
assert.equal(withholdingReasonFor({ primaryCategory: "Reference Control" }).code, "multiple-plausible-repairs");
assert.equal(withholdingReasonFor({ primaryCategory: "Punctuation", targetSpan: "" }).code, "insufficient-evidence-span");

// A card that DOES carry a revision must not advertise a withholding reason.
const kept = applyRevisionWithholdingContract({ ...agreement, whyRevisionIsNotShown: "leftover" }).issue;
assert.equal(kept.whyRevisionIsNotShown, undefined, "a successful revision carries no withholding reason");
assert.match(kept.whyRevisionIsStronger, /agrees with the singular head/, "its rationale is untouched");

// ---------------------------------------------------------------------------
// DEFECT 5 — semantic reference control, not clause counting.
// ---------------------------------------------------------------------------
// Negative fixtures: a dominant antecedent makes the demonstrative recoverable.
assert.equal(
  classifyDemonstrativeReference(
    "When residents divert their choices to metropolitan centers, small-town businesses are forced into bankruptcy.",
    "This leads to immediate local job losses and sharply reduces the local tax revenue needed to fund essential public infrastructure.",
    "leads"
  ),
  "clear",
  "a leading subordinate clause does not compete to be the antecedent"
);
assert.equal(
  classifyDemonstrativeReference("Businesses are forced into bankruptcy.", "This leads to job losses.", "leads"),
  "clear",
  "a single-proposition antecedent is clear"
);

// Positive fixtures: rival propositions at the same level, or a self-unanchored adjunct.
assert.equal(
  classifyDemonstrativeReference(
    "For example, a rural resident visiting a major city retail park can find global supermarket chains and clothing departments within the same area, allowing them to complete a month of diverse shopping in a single afternoon.",
    "Therefore, this eliminates the need to visit multiple scattered shops while providing items with greater deals.",
    "eliminates"
  ),
  "ambiguous",
  "a trailing participial result creates a genuine rival antecedent"
);
assert.equal(
  classifyDemonstrativeReference(
    "The council raised parking charges, and local shops cut their opening hours.",
    "This reduced footfall in the town centre.",
    "reduced"
  ),
  "ambiguous",
  "two coordinated main clauses are genuinely ambiguous"
);

console.log("V12.9.3 report integrity: one deterministic canonical order drives every section and is independent of card creation order; two issues sharing one sentence keep independent target spans, Student Actions and revision states; the frozen graph rejects mutation and the projection audit fails closed on cross-contaminated actions and out-of-order sections; a withheld card carries a defect-specific reason instead of successful-revision prose or placeholder hyphens; and demonstrative reference is judged by antecedent dominance rather than clause count.");
