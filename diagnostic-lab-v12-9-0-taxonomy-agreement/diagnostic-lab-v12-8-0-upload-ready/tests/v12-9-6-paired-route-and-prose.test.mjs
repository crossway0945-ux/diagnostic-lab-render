// V12.9.6 — paired Eva/Evin route generalisation, and student-facing prose cleanup.
//
// Eva states her judgement with the prompt's own nouns ("its disadvantages ... far outweigh the
// advantages"). Evin states the same judgement with referring phrases ("...significantly outweigh
// these privileges", "The negative ramifications ... outweigh its initial conveniences"). The
// engine used to read Evin as having NO position and NO route, which applied an absent-route Task
// Response penalty to a response that in fact argues its case.
//
// These are permanent regression tests. They also prove the fix is a GENERAL rule: the synthetic
// cases below use vocabulary that appears in neither essay.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeTask2Safety } from "../services/task2Safety.js";
import { analyzeWriting } from "../services/aiAnalyzer.js";

const PROMPT = "Small town center shops are running out of business because rural residents tend to go shopping in big cities store. \n\nTo what extent do the disadvantages of this development outweigh the advantages?";

const EVA_WRITING = [
  "In recent years, an increasing number of rural residents have bypassed their local town centers to shop at large commercial hubs in major cities. While this trend offers consumers greater product variety and competitive pricing, I firmly believe that its disadvantages, rural economic decline  and environmental degradation, far outweigh the advantages. ",
  "\tOn one hand, shopping in big cities provides diverse product choices and offers undeniable benefits for individual consumers, primarily driven by cost-efficiency and product availability. Large metropolitan retailers provide bulk discounts, competitive pricing, and frequent promotions which independent rural shops cannot offer. Furthermore, urban commercial hubs contain an unparalleled variety of goods in one place, making the shopping experience more convenient. For example, a rural resident visiting a major city retail park can find global supermarket chains and clothing departments within the same area, allowing them to complete a month of diverse shopping in a single afternoon. Therefore, this eliminates the need to visit multiple scattered shops while providing items with greater deals. ",
  "However, the widespread abandonment of local shops inflicts severe and lasting damage on the economic stability of rural communities. When residents divert their choices  to metropolitan centers, small-town businesses are forced into bankruptcy. This leads to immediate local job losses and sharply reduces the local tax revenue needed to fund essential public infrastructure. Without interested consumers, vulnerable groups and bankrupted people are left isolated. Therefore, the promotion of small town center shops are vital to prevent economic decline. ",
  "In conclusion, although shopping in metropolitan centers provide product variety and competitive pricing, the small independent shops are forced into an economic instability. The resulting economic decline of small center shops demonstrates that the disadvantages of this development far outweigh the advantages."
].join("\n\n");

const EVIN_WRITING = [
  "\tIn recent times, an increasing number of rural residents prefer traveling to a metropolis to purchase goods, leading to bankruptcy of local business establishments in small town centers. While this trend offers economic and logistical benefits to individuals, I firmly believe that its community-wide and environmental disadvantages significantly outweigh these privileges.",
  "\tShopping in big cities has considerable personal advantages for citizens, primarily cost-efficiency and product variety. Large big cities' stores benefit from economies of scale allowing them to offer commodities at significantly lower prices than small vendors. Furthermore, these centers act as commercial hubs where consumers can access a range of international brands and specialized products. For example, a rural family traveling to a metropolitan hypermarket can purchase bulk groceries and international clothing brands in a single trip, saving money that would otherwise be spent on inflated local prices. Therefore, rural residents can reduce their financial expenditure on basic necessities and the time spent visiting local shops.",
  "\tHowever, the consequence of this behavior shift inflicts severe damage on rural communities. The primary drawback is the erosion of the local economy and social cohesion. When town shops close permanently, it triggers immediate job losses for local residents, trapping rural communities in economic slump. Moreover, traditional town squares have functioned as vital social arenas, their decline isolates vulnerable populations such as the elderly and those without private vehicles. Therefore, the collapse of small-town retail not only destabilizes the local economy but also shatters the networks that protect the most vulnerable residents.",
  "\tIn conclusion, although traveling to big cities provides consumers with broader choices and cheaper prices, it threatens the survival of rural communities. The resulting socio-economic decline of small towns and the heightened toll of increased car dependency clearly demonstrate that the negative ramifications of this trend far outweigh its initial conveniences."
].join("\n\n");

const payload = (writing, id) => ({
  taskType: "Task 2",
  essayType: "Advantages & Disadvantages",
  visualType: "",
  targetBand: "7.0",
  reportLanguage: "en",
  clientSubmissionId: id,
  prompt: PROMPT,
  writing,
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
});

const eva = analyzeTask2Safety(payload(EVA_WRITING, "paired-eva"));
const evin = analyzeTask2Safety(payload(EVIN_WRITING, "paired-evin"));

// ---------------------------------------------------------------------------
// 1-10. The paired route contract. Both responses must be read the same way.
// ---------------------------------------------------------------------------
for (const [name, safety] of [["Eva", eva], ["Evin", evin]]) {
  assert.equal(safety.detectedPosition, "disadvantages outweigh the advantages", `${name}: position is clear`);
  assert.equal(safety.positionConfidence, "high", `${name}: position confidence is high`);
  assert.equal(safety.routeConflict, false, `${name}: no route conflict`);
  assert.deepEqual(safety.bodyRoutes, ["advantage route", "disadvantage route"], `${name}: Body 1 advantage, Body 2 disadvantage`);
  assert.match(safety.bodyRouteSummary, /Body 1 route: presents an advantage/, `${name}: Body 1 is an advantage route`);
  assert.match(safety.bodyRouteSummary, /Body 2 route: presents a disadvantage/, `${name}: Body 2 is a disadvantage route`);
  assert.match(safety.bodyRouteSummary, /Conclusion route: clearly restates that the disadvantages outweigh the advantages/, `${name}: the conclusion preserves the judgement`);
  assert.deepEqual(safety.routeAssessment.missingRequirements, [], `${name}: no requirement is reported missing`);
  assert.notEqual(safety.routeAssessment.status, "absent", `${name}: the route is present`);
  assert.notEqual(safety.routeAssessment.status, "contradicted", `${name}: the route is not contradicted`);
  const judgement = safety.routeAssessment.requirements.find((item) => item.id === "judgement");
  const conclusion = safety.routeAssessment.requirements.find((item) => item.id === "conclusion");
  assert.notEqual(judgement?.status, "absent", `${name}: REGRESSION GUARD - no absent-judgement penalty`);
  assert.notEqual(conclusion?.status, "absent", `${name}: REGRESSION GUARD - no absent-conclusion penalty`);
  // Advantages & Disadvantages stays the top-level family; outweigh stays an internal subtype.
  const subtype = safety.internalSubtype || safety.canonicalAnalysis?.taskRequirements?.internalSubtype;
  assert.equal(subtype, "outweigh", `${name}: outweigh is an internal subtype`);
}

// Both must reach the comparative-judgement finding: the judgement is asserted, not demonstrated.
for (const [name, safety] of [["Eva", eva], ["Evin", evin]]) {
  const comparison = safety.canonicalDevelopmentEvidence.comparativeJudgement;
  assert.equal(comparison.required, true, `${name}: an outweigh prompt requires a comparative judgement`);
  assert.equal(comparison.asserted, true, `${name}: the judgement is asserted`);
  assert.equal(comparison.demonstrated, false, `${name}: it is not demonstrated by direct weighing`);
  assert.equal(comparison.favouredSide, "disadvantage", `${name}: the favoured side is resolved`);
}

// ---------------------------------------------------------------------------
// 11. Semantic referents resolve WITHOUT literal repetition — and generally.
// These sentences use vocabulary from neither essay, so passing them cannot be
// satisfied by an essay-specific string exception.
// ---------------------------------------------------------------------------
const syntheticPosition = (sentence) => analyzeTask2Safety(payload([
  `Some people shop online rather than locally. ${sentence}`,
  "On one hand, online shopping offers lower prices and a wider selection for individual buyers. Shoppers can compare many retailers at once and have goods delivered to their door, which saves both money and travelling time for families in remote areas.",
  "However, the closure of neighbourhood stores removes jobs and weakens the social fabric of small communities. When a high street empties, elderly residents lose the informal contact that local shopping provided, and the remaining businesses lose the passing trade they depend on.",
  `In conclusion, ${sentence}`
].join("\n\n"), "synthetic")).detectedPosition;

assert.equal(
  syntheticPosition("I believe that its downsides clearly outweigh these perks."),
  "disadvantages outweigh the advantages",
  "a referring phrase ('these perks') resolves as the benefit side"
);
assert.equal(
  syntheticPosition("I believe that the harmful repercussions far outweigh its initial merits."),
  "disadvantages outweigh the advantages",
  "an adjective-driven neutral head noun ('harmful repercussions') resolves as the harm side"
);
assert.equal(
  syntheticPosition("I believe that these rewards clearly outweigh those detriments."),
  "advantages outweigh the disadvantages",
  "the same rules resolve the opposite judgement, so they are not biased toward one answer"
);

// ---------------------------------------------------------------------------
// 12-13. Each essay keeps its OWN development gap.
// ---------------------------------------------------------------------------
const promiseSpans = (safety) => safety.canonicalDevelopmentEvidence.findings
  .filter((item) => item.category === "Thesis-to-Body Promise")
  .map((item) => item.exactProblemSpan);
assert.ok(promiseSpans(eva).some((span) => /environmental degradation/i.test(span)), "Eva: environmental degradation is the undeveloped promise");
assert.ok(
  eva.canonicalDevelopmentEvidence.findings.some((item) => item.category === "Reference Control"),
  "Eva keeps her own local reference defect"
);

// ---------------------------------------------------------------------------
// 16-18. Grammar precision must not regress in either direction.
// ---------------------------------------------------------------------------
const evaReport = await analyzeWriting(payload(EVA_WRITING, "paired-eva-report"));
const evaText = JSON.stringify(evaReport);
assert.doesNotMatch(evaText, /an increasing number of rural residents has/i, "Eva: the false 'have -> has' correction does not return");
assert.ok(
  evaReport.feedbackCards.some((card) => /Subject-Verb Agreement/i.test(card.issueCategory || "") && /promotion/i.test(card.exactSentence || "")),
  "Eva: the real 'the promotion ... are' agreement defect is still detected"
);

const evinReport = await analyzeWriting(payload(EVIN_WRITING, "paired-evin-report"));
const inflicts = (evinReport.feedbackCards || []).filter((card) => /inflicts severe damage/i.test(card.exactSentence || ""));
for (const card of inflicts) {
  assert.doesNotMatch(
    String(card.issueCategory || ""),
    /Subject-Verb Agreement/i,
    "Evin: 'the consequence ... inflicts' agrees, so it must never be filed as Subject-Verb Agreement"
  );
}
// Evin must not be scored as if the route were missing.
assert.ok(
  Number(String(evinReport.criteriaScores["Task Response"].range).split("-")[0]) >= 5.5,
  "Evin: Task Response is not depressed by a false absent-route penalty"
);
assert.equal(evinReport.detectedPosition, "disadvantages outweigh the advantages");
assert.deepEqual(evinReport.routeAssessment.missingRequirements, []);

// ---------------------------------------------------------------------------
// 20. Student-facing prose cleanup (V12.9.6): no duplicate rows, no placeholders.
// ---------------------------------------------------------------------------
const script = await readFile(new URL("../script.js", import.meta.url), "utf8");
assert.match(script, /function distinctDiagnosis\(/, "the framework diagnosis is suppressed when it duplicates the band explanation");
assert.match(script, /function hasPrintValue\(/, "empty fields are detected rather than printed");
assert.match(script, /function printRow\(/, "card rows are rendered through the omit-when-empty helper");
// The old unconditional placeholder rows must not come back.
assert.doesNotMatch(script, /copy\.sentenceFunction\)\}:<\/strong> \$\{escapePrintHtml\(normalizedCard\.sentenceFunction \|\| "-"\)/, "REGRESSION GUARD: 'What This Sentence Is Trying To Do: -' is never printed");
assert.doesNotMatch(script, /copy\.whyStronger\)\}:<\/strong> \$\{escapePrintHtml\(normalizedCard\.whyRevisionIsStronger \|\| "-"\)/, "REGRESSION GUARD: 'Why This Revision Is Stronger: -' is never printed");
assert.match(script, /function assertPrintPageGeometry\(/, "the export is gated on page geometry");
assert.match(script, /overflow:visible/, "a sheet bleeds into its reserved bottom margin instead of clipping text");

console.log("V12.9.6 paired route + prose: Eva and Evin are both read as a clear 'disadvantages outweigh the advantages' position with Body 1 advantage, Body 2 disadvantage, a conclusion that preserves the judgement, no missing route requirement and no absent-route or absent-conclusion penalty; semantic referents resolve through general polarity and complement rules proven on vocabulary from neither essay; each essay keeps its own development gap; Eva's false 'have -> has' stays suppressed while the real 'promotion ... are' defect is still caught; Evin's agreeing 'consequence ... inflicts' is never filed as Subject-Verb Agreement; and the printable report omits duplicate diagnoses, placeholder hyphens and un-gated page geometry.");
