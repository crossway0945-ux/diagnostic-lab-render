import assert from "node:assert/strict";
import {
  auditFeedbackIntegrity,
  buildFeedbackIntegrityModel,
  validateFeedbackIntegrity
} from "../domain/feedbackIntegrity.js";
import { validateCanonicalIssueAlignment } from "../domain/issueContract.js";
import { analyzeWriting } from "../services/aiAnalyzer.js";

process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE = "false";
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;

const prompt = [
  "Towns and cities should be divided into zones so that all the schools are in one area, all the shopping malls are located together and all the industrial sites are situated close to each other.",
  "To what extent do you agree that urban areas should be split into distinct zones?"
].join("\n\n");

const body1TopicSentence = "Firstly, dividing a city to specific zones offer significantly advantages for public safety and traffic management, if many industrials are moved to placed far from residential and schools, their won’t have effect with public health from pollution.";
const body1ExampleSentence = "For example, the chemist from chemical factory can only in special industrial areas so the smoke won’t be hurt people in the residential area.";

const writing = [
  "Some people think that towns and cities should divide into separate areas, where is schools, shopping malls, and industrial sites are kept in their specific own zones. While this type of planning city can help to make easier for city management. I believe that this integrate is far more beneficial for modern society because this will bring too many problems for people.",
  `${body1TopicSentence} ${body1ExampleSentence} Consequently, implementing a level of targeted zoning essentially for preserving environmental safety and traffic.`,
  "On the other hand, integrating everyday amenities such as schools and residential spaces fosters significantly much more convenience and lively communities. When people are not forced to commute long distances for basic daily requirements, cities experience a dramatic reduction in automobile dependency, traffic congestion, and carbon emissions. For instance, local neighborhoods that include schools allow residents for walk or useing public transport easily instead of relying constantly on cars. Therefore, having mixed areas helps to reduce traffic and makes neighborhoods much better to live in.",
  "In conclusion, I completely disagree with putting every school and shop into separate zones. While some areas like factories need to stay far away for safety, dividing normal places like schools and houses causes too many problems with traffic and travel. Therefore, mixing homes, schools, and shops together makes cities much better and easier for everyone."
].join("\n\n");

// These two provider cards reproduce reference analysis-ms76jbwb-cfb0e76cc1:
// a Task 1-only assertion attached to a Task 2 Prompt Coverage card, and a development
// assertion attached to a diagnosis that the canonical layer correctly recognises as language-only.
const malformedProviderCards = [
  {
    issueCategory: "Prompt Coverage",
    issueType: "Prompt Coverage",
    severity: "Major",
    exactSentence: body1TopicSentence,
    diagnosis: "The topic sentence does not accurately cover the zoning policy stated in the prompt.",
    whyItLimitsBand: "The policy wording is inaccurate, so the paragraph route does not answer the prompt precisely.",
    studentAction: "Restate the zoning policy accurately before developing the paragraph reason.",
    targetedRevision: body1TopicSentence,
    revisionType: "Revision Unavailable",
    evidenceAssertionType: "process_sequence"
  },
  {
    issueCategory: "Example Development",
    issueType: "Example Development",
    severity: "Moderate",
    exactSentence: body1ExampleSentence,
    diagnosis: "The phrase “can only in” is awkward wording and needs a precise verb.",
    whyItLimitsBand: "This is a local word-choice problem rather than missing example development.",
    studentAction: "Replace “can only in” with a precise verb phrase while preserving the example.",
    targetedRevision: "For example, the chemist from chemical factory can only operate in special industrial areas so the smoke won’t be hurt people in the residential area.",
    revisionType: "Minimal Correction",
    exactProblemSpan: "can only in",
    evidenceAssertionType: "example_scope"
  }
];

const model = buildFeedbackIntegrityModel({
  writing,
  taskType: "Task 2",
  essayType: "Opinion Essay",
  prompt,
  feedbackCards: malformedProviderCards,
  topIssues: []
});

assert.equal(
  model.issues.some((issue) => issue.exactEvidence === body1TopicSentence && issue.evidenceAssertion?.assertionType === "process_sequence"),
  false,
  "a Task 1 process assertion must not survive on a Task 2 Prompt Coverage card"
);

const languageIssue = model.issues.find((issue) => issue.exactEvidence === body1ExampleSentence);
assert.ok(languageIssue, "the supported local language repair should remain reportable");
assert.equal(languageIssue.issueCategory, "Lexical Precision");
assert.equal(languageIssue.evidenceAssertion.assertionType, "lexical_meaning");

const fatalFindings = auditFeedbackIntegrity(model, writing).filter((finding) => finding.severity === "fatal");
assert.deepEqual(fatalFindings, [], "the repaired canonical model must pass the output-quality gate");
assert.deepEqual(validateFeedbackIntegrity(model, writing), []);

for (const invalidIssue of [
  {
    issueCategory: "Prompt Coverage",
    evidenceAssertion: { assertionType: "process_sequence" },
    diagnosis: "The policy wording does not accurately cover the prompt.",
    studentAction: "Restate the prompt requirement accurately.",
    revisionType: "Revision Unavailable"
  },
  {
    issueCategory: "Example Development",
    evidenceAssertion: { assertionType: "example_scope" },
    diagnosis: "The wording is awkward and the collocation is unnatural.",
    studentAction: "Complete the example as Situation, Action and Result.",
    revisionType: "Revision Unavailable"
  }
]) {
  assert.equal(validateCanonicalIssueAlignment(invalidIssue).pass, false, "the final gate must continue to block malformed output");
}

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

assert.ok(report.estimatedBandRange, "the exact Poon Poon submission must finalise");
assert.doesNotMatch(JSON.stringify(report), /\bcan helps\b|\bto makes\b/);

console.log("Poon output-validation regression: incompatible provider assertions are canonicalised upstream, malformed output still blocks, and the exact submission finalises.");
