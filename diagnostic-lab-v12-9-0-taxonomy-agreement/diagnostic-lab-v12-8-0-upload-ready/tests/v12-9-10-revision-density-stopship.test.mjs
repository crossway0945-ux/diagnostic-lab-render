import assert from "node:assert/strict";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import {
  analyzeTask2Safety,
  deriveDeterministicTask2CriterionRanges,
  validateTask2RevisionIntegrity
} from "../services/task2Safety.js";
import { buildStudentReportViewModel } from "../domain/reportViewModels.js";
import { classifyTask1Visual } from "../domain/task1Classification.js";

process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE = "false";
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;

const prompt = [
  "Towns and cities should be divided into zones so that all the schools are in one area, all the shopping malls are located together and all the industrial sites are situated close to each other.",
  "To what extent do you agree that urban areas should be split into distinct zones?"
].join("\n\n");
const writing = [
  "Some people think that towns and cities should divide into separate areas, where is schools, shopping malls, and industrial sites are kept in their specific own zones. While this type of planning city can help to make easier for city management. I believe that this integrate is far more beneficial for modern society because this will bring too many problems for people.",
  "Firstly, dividing a city to specific zones offer significantly advantages for public safety and traffic management, if many industrials are moved to placed far from residential and schools, their won't have effect with public health from pollution. For example, the chemist from chemical factory can only in special industrial areas so the smoke won't be hurt people in the residential area. Consequently, implementing a level of targeted zoning essentially for preserving environmental safety and traffic.",
  "On the other hand, integrating everyday amenities such as schools and residential spaces fosters significantly much more convenience and lively communities. When people are not forced to commute long distances for basic daily requirements, cities experience a dramatic reduction in automobile dependency, traffic congestion, and carbon emissions. For instance, local neighborhoods that include schools allow residents for walk or useing public transport easily instead of relying constantly on cars. Therefore, having mixed areas helps to reduce traffic and makes neighborhoods much better to live in.",
  "In conclusion, I completely disagree with putting every school and shop into separate zones. While some areas like factories need to stay far away for safety, dividing normal places like schools and houses causes too many problems with traffic and travel. Therefore, mixing homes, schools, and shops together makes cities much better and easier for everyone."
].join("\n\n");
const payload = {
  taskType: "Task 2", essayType: "Opinion Essay", visualType: "", targetBand: "7.0",
  reportLanguage: "en", clientSubmissionId: "v12-9-10-stopship", prompt, writing,
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
};

const report = await analyzeWriting(payload);
const view = buildStudentReportViewModel(report);
const publicTypes = new Set(["Minimal Correction", "Route-Preserving Revised Version", "Teacher-Guided Revised Version"]);
assert.ok(view.detailedFeedback.length >= 8);
assert.ok(view.detailedFeedback.every((card) => publicTypes.has(card.revisionType)));
assert.ok(view.detailedFeedback.every((card) => card.targetedRevision.trim().length > 12 && card.whyRevisionIsStronger.trim().length > 20));
assert.ok(!JSON.stringify(view).includes("Revision Unavailable"));
assert.ok(report.feedbackCards.every((card) => card.revisionIntegrity?.pass === true));
assert.equal(new Set(report.feedbackCards.map((card) => card.issueId)).size, report.feedbackCards.length);

const visible = (pattern, location) => view.detailedFeedback.find((card) => pattern.test(card.targetedRevision) && (!location || location.test(card.paragraphLocation)));
assert.ok(visible(/should be divided.*where schools.*are kept/i, /Introduction/));
assert.ok(visible(/^This type of city planning can make city management easier\.$/i, /Introduction/));
assert.ok(visible(/Although industrial sites.*I disagree.*schools, homes and shops/i, /Introduction/));
assert.ok(visible(/Although blanket zoning is unnecessary.*limited exception.*public health.*pollution/i, /Body Paragraph 1/));
assert.ok(visible(/chemical factory can only be located.*emissions will not harm/i, /Body Paragraph 1/));
assert.ok(visible(/implementing.*is essential for preserving/i, /Body Paragraph 1/));
assert.ok(visible(/provides much greater convenience/i, /Body Paragraph 2/));
assert.ok(visible(/allow residents to walk or use public transport/i, /Body Paragraph 2/));
assert.ok(view.detailedFeedback.filter((card) => card.revisionType === "Teacher-Guided Revised Version")
  .every((card) => card.whyRevisionIsStronger.includes("Teacher guidance: this model makes the implied relationship explicit; it does not introduce a new argument.")));

assert.deepEqual(Object.fromEntries(Object.entries(report.criteriaScores).map(([key, value]) => [key, value.range])), {
  "Task Response": "5.0-5.5", "Coherence & Cohesion": "5.0-5.5",
  "Lexical Resource": "5.0", "Grammatical Range & Accuracy": "4.5-5.0"
});
assert.equal(report.estimatedBandRange, "5.0-5.5");
const density = report.languageProfile.languageControlDensity;
assert.equal(density.totalSentences, 13);
assert.equal(density.sentenceFragmentCount, 2);
assert.ok(density.severeClauseControlFailureCount >= 6);
assert.ok(density.readerReconstructionRatio >= 0.5);
assert.ok(density.recurringErrorFamilies.length >= 4);
assert.ok(report.feedbackIntegrity.scoreCalculationTrace.positiveEvidenceForScoreAboveFive.qualifiedPositionRecoverable);

assert.equal(report.detectedPosition, "qualified disagreement");
assert.deepEqual(report.routeAssessment.bodyRoutes.map((item) => item.routeRole), ["exception-concession", "main-position-support"]);
assert.doesNotMatch(report.routeAssessment.status, /contradicted|absent/i);
assert.match(report.kruPomScores["Position Clarity"].status, /Needs Work in Thesis.*Clarified by Conclusion/i);
assert.match(report.kruPomScores["Thesis Route Clarity"].status, /Needs Work/i);
assert.match(report.kruPomScores["Body Paragraph Route Alignment"].status, /Mixed|Mostly Controlled/i);
assert.match(report.kruPomScores["SAR Example Quality"].status, /Mixed|Moderate/i);
assert.match(report.kruPomScores["Link Back Control"].status, /Mixed|Moderate/i);
assert.match(report.kruPomScores["Conclusion Closure"].status, /Functionally Strong.*Language.*Repair Needed/i);
const coverage = Object.fromEntries(report.feedbackIntegrity.paragraphCoverage.map((item) => [item.paragraphLabel, item]));
assert.match(coverage["Body Paragraph 1"].status, /^Exception\/Concession Route Repair Needed/);
assert.match(coverage["Body Paragraph 2"].status, /^Main-Position Route Aligned/);
assert.match(coverage.Conclusion.priorityRepair, /too many problems.*traffic-and-travel consequence/i);
assert.equal(report.practicePlan.length, 7);
for (const [index, pattern] of [
  /qualified judgement/i, /limited safety exception/i, /blanket rule/i, /two validated fragments/i,
  /structurally damaged Body Paragraph 1/i, /verb-complement.*word-form.*spelling.*collocation/i, /new qualified Opinion response/i
].entries()) assert.match(`${report.practicePlan[index].title} ${report.practicePlan[index].task}`, pattern);

const revisionFixtures = [
  ["Cities should divide into zones.", "Cities should be divided into zones.", "Minimal Correction"],
  ["Places where is schools are kept.", "Places where schools are kept.", "Minimal Correction"],
  ["While this plan can help city management.", "This plan can help city management.", "Minimal Correction"],
  ["Consequently, implementing zoning for preserving safety.", "Consequently, implementing zoning is necessary for preserving safety.", "Minimal Correction"],
  ["Schools allow residents for walk.", "Schools allow residents to walk.", "Minimal Correction"],
  ["A factory can only in industrial areas.", "A factory can only be located in industrial areas.", "Minimal Correction"],
  ["This fosters significantly much more convenience.", "This provides much greater convenience.", "Minimal Correction"],
  ["This plan is beneficial but causes problems.", "Although industrial separation is useful for safety, I disagree with applying zoning as a blanket rule.", "Teacher-Guided Expansion"]
];
assert.equal(revisionFixtures.length, 8);
for (const [exactSentence, targetedRevision, revisionType] of revisionFixtures) {
  assert.equal(validateTask2RevisionIntegrity({ exactSentence, targetedRevision, revisionType }).pass, true);
}

const scoreFixtures = [
  { control: "belowBand6", expectedLexical: "5.0", expectedGrammar: "4.5-5.0" },
  { control: "band6", expectedLexical: "6.0", expectedGrammar: "6.0" },
  { control: "insufficientEvidence", expectedLexical: "6.0-6.5", expectedGrammar: "6.0-6.5" },
  { control: "band6Point5", expectedLexical: "6.5-7.0", expectedGrammar: "6.5-7.0" },
  { control: "secureBand7", expectedLexical: "6.5-7.0", expectedGrammar: "6.5-7.0" },
  { control: "secureBand75", expectedLexical: "7.0", expectedGrammar: "7.0" },
  { control: "secureBand75", uneven: true, expectedLexical: "6.5-7.0", expectedGrammar: "6.5-7.0" },
  { control: "band6", serious: true, expectedLexical: "5.5-6.0", expectedGrammar: "5.5-6.0" },
  { control: "band6", critical: true, expectedLexical: "5.5-6.0", expectedGrammar: "5.5-6.0" }
];
assert.equal(scoreFixtures.length, 9);
for (const item of scoreFixtures) {
  const ranges = deriveDeterministicTask2CriterionRanges({
    seriousInteraction: item.serious, criticalInteraction: item.critical,
    languageProfile: { overallLexicalControl: item.control, overallGrammarControl: item.control },
    developmentRisk: { unevenDevelopment: item.uneven }, routeAssessment: {}, canonicalDevelopmentEvidence: {}
  });
  assert.equal(ranges["Lexical Resource"], item.expectedLexical);
  assert.equal(ranges["Grammatical Range & Accuracy"], item.expectedGrammar);
}

for (const [visualType, expected] of [["Bar Chart", "Bar Chart"], ["Map", "Map"], ["Process Diagram", "Diagram"], ["Mixed Graph", "Mixed / Combination Visuals"]]) {
  assert.equal(classifyTask1Visual({ taskType: "Task 1", visualType, prompt: "" }).publicVisualType, expected);
}
assert.equal(analyzeTask2Safety(payload).routeAssessment.qualifiedPositionState.qualified, true);

console.log("V12.9.10 revision completeness, route consistency and language-density stop-ship test passed.");
