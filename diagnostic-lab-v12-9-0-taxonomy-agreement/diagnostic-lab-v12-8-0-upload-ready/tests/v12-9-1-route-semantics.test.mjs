// V12.9.1 — semantic disadvantage-route recognition.
// Derived from the real Eva production QA snapshot (report 9d764231c465078ea3e25768), which recorded
// Body 2 as "solution / route unclear" and disadvantages as ABSENT, collapsing Task Response and
// Coherence to 5.0-5.5 with the diagnosis "the task route is absent".
// Structural rules only — no topic, wording or score is hardcoded in production logic.
import assert from "node:assert/strict";
import { classifyParagraphRoute } from "../domain/task2RouteModel.js";

const ADV_DIS = { family: "advantages-disadvantages", requirements: ["advantage", "disadvantage"], prompt: "" };
const route = (paragraph, options = ADV_DIS) => classifyParagraphRoute({ paragraph, index: 1, ...options }).primaryRoute;

// 1. A paragraph that develops harm is a disadvantage route even though it never says "disadvantage",
//    and even though its closing sentence is recommendation-shaped ("promoting X to prevent Y").
const harmParagraph = [
  "However, the widespread abandonment of local shops inflicts severe and lasting damage on the economic stability of rural communities.",
  "When residents divert their choices to metropolitan centers, small-town businesses are forced into bankruptcy.",
  "This leads to immediate local job losses and sharply reduces the local tax revenue needed to fund essential public infrastructure.",
  "Without interested consumers, vulnerable groups and bankrupted people are left isolated.",
  "Therefore, the promotion of small town center shops are vital to prevent economic decline."
].join(" ");
assert.equal(route(harmParagraph), "disadvantage", "developed harm is a disadvantage route, not a solution route");

// 2. The recommendation-style closure alone must not carry the paragraph.
const classified = classifyParagraphRoute({ paragraph: harmParagraph, index: 1, ...ADV_DIS });
assert.notEqual(classified.primaryRoute, "solution", "a closing recommendation cannot override the controlling route");
assert.ok(["high", "medium"].includes(classified.confidence), "the route is resolved with usable confidence");

// 3. Individual harm families are each recognised without the literal label.
const harmFamilies = [
  "The main effect is that local businesses are forced into bankruptcy and many close down permanently.",
  "This leads to immediate job losses and rising unemployment across the region.",
  "The change sharply reduces the local tax revenue that funds public services.",
  "Elderly residents are left isolated because they lose access to nearby shops.",
  "The trend inflicts lasting damage on community life and accelerates rural decline."
];
for (const sentence of harmFamilies) {
  const paragraph = `${sentence} This continues over several years. Families notice the change in daily life.`;
  assert.equal(route(paragraph), "disadvantage", `semantic harm recognised: ${sentence.slice(0, 45)}…`);
}

// 4. No over-reach: a genuine solution paragraph (real intervention with actor and action) still wins.
const solutionParagraph = [
  "The most effective solution is for governments to expand high-frequency public transport.",
  "Authorities should invest in reliable trains and buses so that commuters have a real alternative.",
  "This measure would reduce the number of private cars on the road."
].join(" ");
assert.equal(route(solutionParagraph, { family: "problem-solution", requirements: ["problem", "solution"], prompt: "" }), "solution", "a genuine intervention is still a solution route");

// 5. No over-reach: problem and advantage paragraphs are unaffected.
assert.equal(
  route("The main problem is severe traffic congestion in large cities. Commuters lose hours every day. Air quality worsens for everyone.", { family: "problem-solution", requirements: ["problem", "solution"], prompt: "" }),
  "problem",
  "a problem paragraph is unaffected"
);
assert.equal(
  route("On one hand, online shopping offers undeniable benefits for consumers. It provides lower prices and greater variety. Shoppers compare many retailers quickly."),
  "advantage",
  "an advantage paragraph is unaffected"
);

// 6. An advantage paragraph that merely mentions a cost in passing is not flipped to disadvantage.
assert.equal(
  route("On one hand, the trend offers clear benefits for consumers. Large retailers provide bulk discounts and competitive pricing driven by cost-efficiency. Shoppers gain greater product variety in one place."),
  "advantage",
  "an incidental cost mention does not flip an advantage paragraph"
);

console.log("V12.9.1 route semantics: developed harm is recognised as a disadvantage route without the literal label, a recommendation-style closure cannot override the controlling route, and solution/problem/advantage routes are unaffected.");
