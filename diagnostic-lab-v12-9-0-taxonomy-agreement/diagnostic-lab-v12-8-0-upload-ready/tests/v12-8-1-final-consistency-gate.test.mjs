// V12.8.1 enforced final cross-section consistency gate.
// Reproduces (via semantic property, not exact student wording) the production defect where a Strong
// framework status carried a contradictory "does not yet establish the required route" explanation,
// and proves the enforced gate repairs it in place while preserving the frozen status.
import assert from "node:assert/strict";
import { validateStatusExplanationCompatibility, enforceViewModelConsistency } from "../domain/reportConsistency.js";

// 1. The validator now catches adverb-inserted negations that previously slipped through
//    ("does not YET establish", "does not CLEARLY cover"). This was the root cause: the real
//    production explanation used "does not yet establish" and passed the old regex.
assert.equal(
  validateStatusExplanationCompatibility({ name: "Thesis Route Clarity", status: "Strong", explanation: "The thesis does not yet establish the required route clearly." }).pass,
  false,
  "Strong + 'does not yet establish route' is a contradiction"
);
assert.equal(
  validateStatusExplanationCompatibility({ name: "Body Route Alignment", status: "Aligned", explanation: "The body does not clearly cover the required route." }).pass,
  false,
  "Aligned + 'does not clearly cover route' is a contradiction"
);
// A genuinely compatible Strong explanation must still pass (no over-reach).
assert.equal(
  validateStatusExplanationCompatibility({ name: "Conclusion Closure", status: "Strong", explanation: "The conclusion preserves the position and closes the established routes with control." }).pass,
  true,
  "a truly compatible Strong explanation is not flagged"
);

// 2. The enforced gate repairs only the contradictory dimension, preserves the frozen status, keeps
//    the {status, diagnosis} shape, and leaves compatible dimensions untouched.
const vm = {
  frameworkBreakdown: {
    "Thesis Route Clarity": { status: "Strong", diagnosis: "The thesis does not yet establish the required route clearly." },
    "Body Paragraph Route Alignment": { status: "Aligned", diagnosis: "Body 1 develops causes; Body 2 develops solutions." },
    "Conclusion Closure": { status: "Strong", diagnosis: "The conclusion preserves the position and closes the established routes." }
  }
};
const { repairs } = enforceViewModelConsistency(vm);
assert.equal(repairs.length, 1, "exactly one contradictory dimension is repaired");
assert.equal(repairs[0].name, "Thesis Route Clarity");
assert.equal(vm.frameworkBreakdown["Thesis Route Clarity"].status, "Strong", "status is preserved — scoring is never rerun to fix feedback");
assert.equal(
  validateStatusExplanationCompatibility({ name: "Thesis Route Clarity", status: "Strong", explanation: vm.frameworkBreakdown["Thesis Route Clarity"].diagnosis }).pass,
  true,
  "the repaired explanation is now status-compatible"
);
assert.deepEqual(Object.keys(vm.frameworkBreakdown["Thesis Route Clarity"]).sort(), ["diagnosis", "status"], "gate keeps the framework field allowlist");
assert.equal(vm.frameworkBreakdown["Conclusion Closure"].diagnosis, "The conclusion preserves the position and closes the established routes.", "a compatible dimension is left untouched");

// 3. No framework status-explanation contradiction survives the gate.
let remaining = 0;
for (const [name, item] of Object.entries(vm.frameworkBreakdown)) {
  if (!validateStatusExplanationCompatibility({ name, status: item.status, explanation: item.diagnosis }).pass) remaining += 1;
}
assert.equal(remaining, 0, "no status-explanation contradiction survives the enforced gate");

// 4. Cross-section route consistency: a route dimension must not claim a missing route while the
//    canonical Body Route Alignment shows the route is present (the p2-vs-p3/p7 contradiction).
const routeVm = {
  frameworkBreakdown: {
    "Body Paragraph Route Alignment": { status: "Aligned", diagnosis: "Body 1 develops causes; Body 2 develops solutions." },
    "Thesis Route Clarity": { status: "Needs Work", diagnosis: "The thesis is missing at least one traceable required route." }
  },
  paragraphCoverage: [],
  detailedFeedback: [],
  topIssues: []
};
const routeResult = enforceViewModelConsistency(routeVm);
assert.ok(routeResult.repairs.some((r) => r.code === "ROUTE_CROSS_SECTION_CONTRADICTION"), "route cross-section contradiction is caught");
assert.doesNotMatch(routeVm.frameworkBreakdown["Thesis Route Clarity"].diagnosis.toLowerCase(), /missing.{0,40}route|route.{0,40}missing/, "the repaired explanation no longer claims a missing route");

// 5. Duplicate issue merge (§8) and priority ordering (§10).
const dupVm = {
  frameworkBreakdown: {},
  paragraphCoverage: [],
  detailedFeedback: [
    { issueCategory: "Countability", exactSentence: "a severe traffic congestion is heavy", studentAction: "Remove the article a." },
    { issueCategory: "Lexical Precision", exactSentence: "the unconsciousness of drivers", studentAction: "Replace unconsciousness." },
    { issueCategory: "Countability", exactSentence: "a severe traffic congestion is heavy", studentAction: "Remove the article a." }
  ],
  topIssues: [
    { issueCategory: "Countability", severity: "Moderate", exactSentence: "a severe traffic congestion", studentAction: "Remove a." },
    { issueCategory: "Sentence Completion", severity: "Major", exactSentence: "For instance, a law that forces drivers.", studentAction: "Complete the sentence." }
  ]
};
enforceViewModelConsistency(dupVm);
assert.equal(dupVm.detailedFeedback.length, 2, "the duplicate Countability card is merged to one");
assert.equal(dupVm.topIssues[0].severity, "Major", "a Major issue is ordered before a Moderate one");

// 6. Idempotency: running the gate twice produces the same result (no self-triggering).
const first = JSON.stringify(routeVm);
enforceViewModelConsistency(routeVm);
assert.equal(JSON.stringify(routeVm), first, "the gate is idempotent — a second pass changes nothing");

console.log("V12.8.1 final consistency gate: status↔explanation, cross-section route, duplicate-merge, priority ordering and idempotency verified.");
