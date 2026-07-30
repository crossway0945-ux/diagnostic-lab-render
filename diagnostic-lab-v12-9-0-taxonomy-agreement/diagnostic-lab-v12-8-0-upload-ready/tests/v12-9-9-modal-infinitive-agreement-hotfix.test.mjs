import assert from "node:assert/strict";
import { detectSyntacticHeadAgreementDefects } from "../domain/agreementValidator.js";
import { deriveDeterministicCorrection } from "../domain/deterministicCorrections.js";
import { analyzeWriting } from "../services/aiAnalyzer.js";

const sentence = "While this type of planning city can help to make easier for city management.";
assert.deepEqual(
  detectSyntacticHeadAgreementDefects(sentence),
  [],
  "modal-governed and infinitive verbs must not be treated as finite agreement targets"
);
assert.equal(
  deriveDeterministicCorrection({ sentence, targetSpan: "help", category: "Subject-Verb Agreement" }),
  null,
  "the engine must never generate 'can helps'"
);
assert.equal(
  deriveDeterministicCorrection({ sentence, targetSpan: "make", category: "Subject-Verb Agreement" }),
  null,
  "the engine must never generate 'to makes'"
);

for (const example of [
  "This policy can significantly reduce congestion.",
  "The plan should also provide safer routes.",
  "The system does not make travel easier.",
  "The proposal aims to substantially increase access."
]) {
  assert.deepEqual(detectSyntacticHeadAgreementDefects(example), [], `non-finite guard: ${example}`);
}

const prompt = [
  "Towns and cities should be divided into zones so that all the schools are in one area, all the shopping malls are located together and all the industrial sites are situated close to each other.",
  "To what extent do you agree that urban areas should be split into distinct zones?"
].join("\n\n");
const writing = [
  "Some people think that towns and cities should divide into separate areas, where is schools, shopping malls, and industrial sites are kept in their specific own zones. While this type of planning city can help to make easier for city management. I believe that this integrate is far more beneficial for modern society because this will bring too many problems for people.",
  "Firstly, dividing a city to specific zones offer significantly advantages for public safety and traffic management, if many industrials are moved to placed far from residential and schools, their won’t have effect with public health from pollution. For example, the chemist from chemical factory can only in special industrial areas so the smoke won’t be hurt people in the residential area. Consequently, implementing a level of targeted zoning essentially for preserving environmental safety and traffic.",
  "On the other hand, integrating everyday amenities such as schools and residential spaces fosters significantly much more convenience and lively communities. When people are not forced to commute long distances for basic daily requirements, cities experience a dramatic reduction in automobile dependency, traffic congestion, and carbon emissions. For instance, local neighborhoods that include schools allow residents for walk or useing public transport easily instead of relying constantly on cars. Therefore, having mixed areas helps to reduce traffic and makes neighborhoods much better to live in.",
  "In conclusion, I completely disagree with putting every school and shop into separate zones. While some areas like factories need to stay far away for safety, dividing normal places like schools and houses causes too many problems with traffic and travel. Therefore, mixing homes, schools, and shops together makes cities much better and easier for everyone."
].join("\n\n");

const report = await analyzeWriting({
  taskType: "Task 2",
  essayType: "Opinion Essay",
  visualType: "",
  targetBand: "7.0",
  prompt,
  writing,
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true },
  reportLanguage: "en"
});
assert.ok(report.estimatedBandRange, "the exact Poon zoning submission must finalise");
assert.ok(!JSON.stringify(report).includes("can helps"));
assert.ok(!JSON.stringify(report).includes("to makes"));

console.log("V12.9.9 modal/infinitive agreement hotfix: non-finite verbs are not falsely corrected and the exact Poon zoning submission finalises.");
