import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  analyzeTask2Safety,
  classifyTask2Prompt,
  deriveDeterministicTask2CriterionRanges,
  isTask2PublicEssayType,
  reconcileTask2CanonicalAnalysis,
  REVISION_TYPES,
  TASK2_INTERNAL_SUBTYPES,
  TASK2_PUBLIC_TYPES
} from "../domain/task2Safety.js";
import {
  classifyTask1Visual,
  TASK1_PUBLIC_VISUAL_TYPES
} from "../domain/task1Classification.js";
import { validateCanonicalAnalysis } from "../domain/canonicalAnalysis.js";
import {
  applyTask1ClassificationGuard,
  applyTask2ClassificationGuard,
  createSubmissionHash
} from "../services/apiRouter.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";
import { countWords } from "../wordCount.js";

const expectedTask2 = [
  "Opinion Essay",
  "Discuss Both Views",
  "Problem & Solution",
  "Advantages & Disadvantages",
  "Direct Question",
  "Not Sure / Auto-detect"
];
const expectedTask1 = [
  "Line Graph",
  "Bar Chart",
  "Pie Chart",
  "Table",
  "Map",
  "Diagram",
  "Mixed / Combination Visuals",
  "Not Sure / Auto-detect"
];
const negativeSpacePrompt = "Some people believe that the amount of money spent on technology for space exploration is not justified, and there are more beneficial ways to spend this money. To what extent do you agree or disagree?";
const sunSpaceWriting = [
  "Some people believe that the amount of money spent on the development of technology for space exploration is not justified, and there are more beneficial ways to spend this money. However, I heavily disagree with this view, since it can provide numerous benefits for humans.",
  "On one hand, investing money in developing technology for space exploration is advantageous in various aspects. For example, satellites play a pivotal role in communication, navigation, and disaster monitoring. Furthermore, it can encourage the young majority to study subjects like astrology, math, and physics. This can provide more opportunities for occupations, which increases the number of employees, reducing financial issues. In addition, there are still many undiscovered secrets in space, which might create a significant impact in the future. These discoveries can create innovations and knowledge that may help societies respond to future challenges.",
  "On the other hand, there are several areas that need financial support. For example, many countries still struggle with poverty, inadequate healthcare, and insufficient food supply, which cannot be overlooked. Some people might also think that the government should invest money in hospitals, schools, water, food, and shelters. Furthermore, problems like global warming cannot be overlooked and can cause significant impacts in the future, such as melting ice caps and floods.",
  "In conclusion, even though the government should address issues that need large financial support, I believe that money spent on developing technology for space exploration is justified, since it can provide many long-term direct and indirect benefits for humans."
].join("\n\n");
const evaWriting = [
  "While the costs used for space exploration could be diverted into healthcare or education, I firmly agree that space exploration spending is justified due to technological benefits and future security.",
  "Space technologies support communication, weather forecasting and environmental monitoring. These practical benefits improve life on Earth and justify continued public investment.",
  "In addition, space programmes support economic growth and future security by creating specialist jobs and developing technologies that address long-term risks.",
  "In conclusion, I firmly agree that the costs of space exploration are justified because of long-term benefits and future economic security."
].join("\n\n");
const poonWriting = [
  "Access to clean water is very important for everyone. Thus, many people believe that every household should provide water for free. This essay will discuss about agree or disagree for this idea.",
  "Firstly, clean water is a basic right in human life. It can help people to have a good cleanliness because people always use water in their daily activities such as drinking, washing or house cleaning. If water is not clean, humans can get some bacterias or diseases when they use some water; therefore, they can get an illness. Subsequently, if people can use clean water with charging, they would have a good quality of life. For instance, if people can drink taps water, they could safe their money because they do not have to pay money for buying pure water.",
  "On the other hand, this idea should be disagrees because this might used a lot of money. The government budget might be not enough, so the tax must be increase; Therefore, all citizens have to pay money same with before water supply free to charge.",
  "For conclusion, I consequently agree with this idea. Due to the fact that I"
].join("\n\n");
const zoningPrompt = "Some people think that towns and cities should be divided into separate zones for schools, shops, offices and homes. To what extent do you agree or disagree?";
const zoningWriting = [
  "Some people think that towns and cities should divide facilities into separate zones. However, I strongly disagree with the statement due to the lack of travel accessibility and traffic congestion.",
  "First of all, the clusterization of a specific place could lead to the difficulty of traveling. For instance, a student's house may be very far away from his school, and it can take three hours to arrive there, so he needs to wake up early every morning, which lowers his energy and concentration in class. Therefore, when a certain place is clustered in one area, some people might encounter an issue of traveling.",
  "Secondly, separating the same facilities can increase traffic congestion. For example, restaurants or shopping malls attract more people at breakfast, lunch, and dinner time; hence, people will be moving in the same direction at the same time, resulting in a large traffic congestion. This creates longer journeys and pressure on the roads.",
  "In conclusion, I firmly believe that towns and cities should not be divided into zones with all the same places in one area, since this could contribute to difficulty in traveling and traffic congestion."
].join("\n\n");

const results = [];
async function check(name, fn) {
  await fn();
  results.push(name);
}

await check("Task 2 public taxonomy is exact", () => assert.deepEqual([...TASK2_PUBLIC_TYPES], expectedTask2));
await check("Task 1 public taxonomy is exact", () => assert.deepEqual([...TASK1_PUBLIC_VISUAL_TYPES], expectedTask1));
await check("all Task 2 public labels validate", () => expectedTask2.forEach((item) => assert.equal(isTask2PublicEssayType(item), true)));
await check("internal Task 2 subtypes are absent from public labels", () => Object.values(TASK2_INTERNAL_SUBTYPES).forEach((item) => assert.equal(expectedTask2.includes(item), false)));
await check("revision taxonomy is exact", () => assert.deepEqual([...REVISION_TYPES], ["Minimal Correction", "Route-Preserving Revision", "Teacher-Guided Expansion", "High-Band Refinement"]));

const task2Matrix = [
  ["Opinion Essay", "Governments should fund rail. To what extent do you agree or disagree?", "Opinion Essay", "standard"],
  ["Discuss Both Views", "Some prefer cities and others villages. Discuss both views and give your opinion.", "Discuss Both Views", "standard"],
  ["Problem & Solution", "What are the causes of congestion and what solutions can be taken?", "Problem & Solution", "causes-solutions"],
  ["Problem & Solution", "What problems does congestion cause and what solutions can be taken?", "Problem & Solution", "standard"],
  ["Advantages & Disadvantages", "What are the advantages and disadvantages of remote work?", "Advantages & Disadvantages", "standard"],
  ["Advantages & Disadvantages", "Do the advantages of remote work outweigh the disadvantages?", "Advantages & Disadvantages", "outweigh"],
  ["Direct Question", "What are the causes and effects of migration?", "Direct Question", "causes-effects"],
  ["Direct Question", "Is this a positive or negative development?", "Direct Question", "positive-negative-development"],
  ["Direct Question", "Why do people move? What problems can this cause?", "Direct Question", "multi-question"]
];
for (const [selected, prompt, publicType, subtype] of task2Matrix) {
  await check(`Task 2 classification: ${subtype}`, () => {
    const value = classifyTask2Prompt({ essayType: selected, prompt });
    assert.equal(value.publicEssayType, publicType);
    assert.equal(value.internalSubtype, subtype);
    assert.ok(value.promptObligations.every((item) => item.id && item.label && item.questionText));
  });
}

const task1Matrix = [
  ["The line graph shows population growth.", "Line Graph", "line-graph"],
  ["The bar chart compares five cities.", "Bar Chart", "bar-chart"],
  ["The pie chart shows four categories.", "Pie Chart", "pie-chart"],
  ["The table gives data for six countries.", "Table", "table"],
  ["The maps show the town in 2000 and 2020.", "Map", "map"],
  ["The diagram shows the stages in recycling glass.", "Diagram", "process"],
  ["The diagram shows the components and how a solar panel works.", "Diagram", "structural-mechanism"],
  ["The pie chart shows locations while the bar chart compares attendance.", "Mixed / Combination Visuals", "mixed:bar-chart+pie-chart"]
];
for (const [prompt, type, subtype] of task1Matrix) {
  await check(`Task 1 classification: ${type} / ${subtype}`, () => {
    const value = classifyTask1Visual({ publicVisualType: "Not Sure / Auto-detect", prompt });
    assert.equal(value.publicVisualType, type);
    assert.equal(value.internalVisualSubtype, subtype);
  });
}

await check("high-confidence Task 2 mismatch blocks", () => assert.throws(
  () => applyTask2ClassificationGuard({ taskType: "Task 2", essayType: "Problem & Solution", prompt: "To what extent do you agree or disagree?", writing: evaWriting }),
  (error) => error.errorCode === "ESSAY_TYPE_MISMATCH"
));
await check("medium-confidence Task 2 requires confirmation", () => assert.throws(
  () => applyTask2ClassificationGuard({ taskType: "Task 2", essayType: "Opinion Essay", prompt: "Do you think governments should fund art?", writing: evaWriting, options: {} }),
  (error) => error.errorCode === "ESSAY_TYPE_CONFIRMATION_REQUIRED"
));
await check("low-confidence Task 2 accepts explicit selection", () => {
  const value = applyTask2ClassificationGuard({ taskType: "Task 2", essayType: "Opinion Essay", prompt: "What are your thoughts about technology?", writing: evaWriting, options: {} });
  assert.equal(value.publicEssayType, "Opinion Essay");
  assert.equal(value.promptClassificationConfidence, "low");
});
await check("low-confidence Task 2 auto-detect requires selection", () => assert.throws(
  () => applyTask2ClassificationGuard({ taskType: "Task 2", essayType: "Not Sure / Auto-detect", prompt: "Write about technology.", writing: evaWriting, options: {} }),
  (error) => error.errorCode === "ESSAY_TYPE_SELECTION_REQUIRED"
));
await check("high-confidence Task 1 mismatch blocks", () => assert.throws(
  () => applyTask1ClassificationGuard({ taskType: "Task 1", visualType: "Map", prompt: "The bar chart compares five cities.", writing: "Overall, one city was highest." }),
  (error) => error.errorCode === "VISUAL_TYPE_MISMATCH"
));
await check("medium-confidence Task 1 requires confirmation", () => assert.throws(
  () => applyTask1ClassificationGuard({ taskType: "Task 1", visualType: "Bar Chart", prompt: "Compare the information.", image: { dataUrl: "data:image/png;base64,AA==" }, options: {} }),
  (error) => error.errorCode === "VISUAL_TYPE_CONFIRMATION_REQUIRED"
));

const sun = analyzeTask2Safety({ taskType: "Task 2", essayType: "Opinion Essay", prompt: negativeSpacePrompt, writing: sunSpaceWriting });
const eva = analyzeTask2Safety({ taskType: "Task 2", essayType: "Opinion Essay", prompt: negativeSpacePrompt, writing: evaWriting });
const poon = analyzeTask2Safety({ taskType: "Task 2", essayType: "Opinion Essay", prompt: "Access to clean water is a basic human right. Therefore, every home should receive a water supply free of charge. To what extent do you agree or disagree?", writing: poonWriting });
const zoning = analyzeTask2Safety({ taskType: "Task 2", essayType: "Opinion Essay", prompt: zoningPrompt, writing: zoningWriting });
await check("Sun negative prompt resolves to disagreement", () => assert.equal(sun.semanticPosition.relationToPromptClaim, "disagreement"));
await check("Sun position is clear despite heavily disagree", () => assert.equal(sun.semanticPosition.positionClarity, "clear"));
await check("Sun vague thesis route remains separate", () => assert.equal(sun.routeAssessment.thesisRouteStatus, "mentioned_only"));
await check("Sun Body 1 aligns with disagreement", () => assert.match(sun.routeAssessment.bodyRoutes[0].label, /disagreement/));
await check("Sun Body 2 is an extended competing route", () => assert.equal(sun.concessionStatus, "Extended competing opposing route"));
await check("Sun conclusion maintains disagreement", () => assert.match(sun.routeAssessment.conclusionLabel, /disagree/));
await check("Sun has no missing-position cap", () => assert.equal(sun.capMetadata.caps.some((item) => item.reasonCode === "REQUIRED_POSITION_ABSENT"), false));
await check("Eva negative prompt resolves semantically", () => assert.equal(eva.semanticPosition.relationToPromptClaim, "disagreement"));
await check("Eva position is clear and consistent", () => {
  assert.equal(eva.semanticPosition.positionClarity, "clear");
  assert.equal(eva.semanticPosition.positionConsistency, "consistent");
});
await check("Eva integrated concession is controlled", () => assert.equal(eva.concessionStatus, "Controlled concession"));
await check("Eva routes align with her judgement", () => assert.ok(eva.routeAssessment.bodyRoutes.every((item) => /aligned with the writer/.test(item.label))));
await check("Eva conclusion closure is controlled", () => assert.match(eva.routeAssessment.conclusionLabel, /disagree|agreement|justified/i));
await check("Poon remains analysable while underlength", () => {
  assert.ok(poon.wordCount < 250);
  assert.equal(poon.underLength, true);
});
await check("Poon position is not invented", () => assert.equal(poon.detectedPosition, "unclear"));
await check("Poon body functions are identified", () => {
  assert.match(poon.routeAssessment.bodyRoutes[0].label, /supports free clean-water supply/);
  assert.match(poon.routeAssessment.bodyRoutes[1].label, /budget and tax counterargument/);
});
await check("Poon unfinished conclusion triggers exact cap", () => assert.equal(poon.capMetadata.caps[0]?.reasonCode, "INCOMPLETE_TASK_RESPONSE"));
await check("Sun zoning has a clear strong disagreement", () => assert.equal(zoning.detectedPosition, "strongly disagree"));
await check("Sun zoning routes align independently from development", () => {
  assert.ok(zoning.routeAssessment.bodyRoutes.every((item) => item.alignmentStatus === "adequately_developed"));
  assert.ok(zoning.routeAssessment.bodyRoutes.every((item) => item.developmentStatus === "partially_developed"));
});
await check("Sun zoning has no concession", () => assert.equal(zoning.concessionStatus, "No concession"));
await check("Sun zoning conclusion closes the disagreement", () => assert.match(zoning.routeAssessment.conclusionLabel, /disagree/));
await check("Sun legacy re-analysis equals the current Sun canonical route", () => {
  const legacy = analyzeTask2Safety({ taskType: "Task 2", essayType: "Opinion Essay", prompt: negativeSpacePrompt, writing: sunSpaceWriting, reportId: "legacy-reanalysis" });
  assert.deepEqual(legacy.routeAssessment, sun.routeAssessment);
  assert.deepEqual(legacy.semanticPosition, sun.semanticPosition);
  assert.deepEqual(deriveDeterministicTask2CriterionRanges(legacy), deriveDeterministicTask2CriterionRanges(sun));
});

await check("criterion scoring ignores provider ranges", () => {
  const lowProvider = { criteriaScores: Object.fromEntries(["Task Response", "Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"].map((name) => [name, { range: "4.0", diagnosis: "provider low" }])) };
  const highProvider = { criteriaScores: Object.fromEntries(["Task Response", "Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"].map((name) => [name, { range: "9.0", diagnosis: "provider high" }])) };
  const a = reconcileTask2CanonicalAnalysis({ taskType: "Task 2", essayType: "Opinion Essay", prompt: negativeSpacePrompt, writing: sunSpaceWriting }, lowProvider, sun);
  const b = reconcileTask2CanonicalAnalysis({ taskType: "Task 2", essayType: "Opinion Essay", prompt: negativeSpacePrompt, writing: sunSpaceWriting }, highProvider, sun);
  assert.deepEqual(a.criterionAssessment, b.criterionAssessment);
  assert.equal(a.overallScore.label, b.overallScore.label);
});
await check("deterministic criterion function is stable", () => assert.deepEqual(deriveDeterministicTask2CriterionRanges(sun), deriveDeterministicTask2CriterionRanges(sun)));
await check("canonical object validates", () => {
  const canonical = reconcileTask2CanonicalAnalysis({ taskType: "Task 2", essayType: "Opinion Essay", prompt: negativeSpacePrompt, writing: sunSpaceWriting }, {}, sun);
  assert.deepEqual(validateCanonicalAnalysis(canonical), []);
});
await check("V11 metadata is exact", () => assert.deepEqual(ANALYSIS_VERSIONS, {
  appVersion: "11.0.0",
  engineVersion: "ielts-diagnostic-engine-v11",
  rubricVersion: "kru-pom-ielts-writing-v11",
  promptVersion: "ielts-diagnostic-prompt-v11",
  reportSchemaVersion: "ielts-diagnostic-report-v11"
}));
await check("deterministic word count is stable", () => assert.equal(countWords(sunSpaceWriting), countWords(sunSpaceWriting)));
await check("fingerprint is student-scoped", () => {
  const payload = { taskType: "Task 2", essayType: "Opinion Essay", prompt: negativeSpacePrompt, writing: evaWriting, studentProfileId: "student-a" };
  assert.equal(createSubmissionHash("teacher", payload), createSubmissionHash("teacher", structuredClone(payload)));
  assert.notEqual(createSubmissionHash("teacher", payload), createSubmissionHash("teacher", { ...payload, studentProfileId: "student-b" }));
});
await check("meaningful revision changes fingerprint", () => {
  const payload = { taskType: "Task 2", essayType: "Opinion Essay", prompt: negativeSpacePrompt, writing: evaWriting, studentProfileId: "student-a" };
  assert.notEqual(createSubmissionHash("teacher", payload), createSubmissionHash("teacher", { ...payload, writing: `${evaWriting} This added sentence changes the submitted response.` }));
});
await check("service compatibility paths are re-exports only", async () => {
  const [task2, canonical] = await Promise.all([
    readFile(new URL("../services/task2Safety.js", import.meta.url), "utf8"),
    readFile(new URL("../services/canonicalAnalysis.js", import.meta.url), "utf8")
  ]);
  assert.equal(task2.trim(), 'export * from "../domain/task2Safety.js";');
  assert.equal(canonical.trim(), 'export * from "../domain/canonicalAnalysis.js";');
});
await check("static preview is generated from canonical domain files", async () => {
  const pairs = ["task1Classification.js", "task2Safety.js", "canonicalAnalysis.js", "index.js"];
  for (const file of pairs) {
    const [source, preview] = await Promise.all([
      readFile(new URL(`../domain/${file}`, import.meta.url), "utf8"),
      readFile(new URL(`../netlify-static-preview/domain/${file}`, import.meta.url), "utf8")
    ]);
    assert.equal(preview, source, file);
  }
});

assert.ok(results.length >= 45, `expected at least 45 consolidated V11 checks, received ${results.length}`);
console.log(`V11 final sale-readiness: ${results.length} consolidated deterministic checks passed.`);
