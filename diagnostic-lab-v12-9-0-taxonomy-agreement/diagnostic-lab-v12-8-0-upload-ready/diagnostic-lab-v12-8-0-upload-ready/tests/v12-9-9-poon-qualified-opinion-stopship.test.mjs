import assert from "node:assert/strict";
import { analyzeTask2Safety } from "../services/task2Safety.js";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { pdfTextIntegrityIssues } from "../domain/pdfTextIntegrity.js";
import { sanitizePrintableText, unicodeIntegrityIssues } from "../domain/textIntegrity.js";

process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE = "false";
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;

const POON_PROMPT = [
  "Towns and cities should be divided into zones so that all the schools are in one area, all the shopping malls are located together and all the industrial sites are situated close to each other.",
  "To what extent do you agree that urban areas should be split into distinct zones?"
].join("\n\n");

const POON_WRITING = [
  "Some people think that towns and cities should divide into separate areas, where is schools, shopping malls, and industrial sites are kept in their specific own zones. While this type of planning city can help to make easier for city management. I believe that this integrate is far more beneficial for modern society because this will bring too many problems for people.",
  "Firstly, dividing a city to specific zones offer significantly advantages for public safety and traffic management, if many industrials are moved to placed far from residential and schools, their won't have effect with public health from pollution. For example, the chemist from chemical factory can only in special industrial areas so the smoke won't be hurt people in the residential area. Consequently, implementing a level of targeted zoning essentially for preserving environmental safety and traffic.",
  "On the other hand, integrating everyday amenities such as schools and residential spaces fosters significantly much more convenience and lively communities. When people are not forced to commute long distances for basic daily requirements, cities experience a dramatic reduction in automobile dependency, traffic congestion, and carbon emissions. For instance, local neighborhoods that include schools allow residents for walk or useing public transport easily instead of relying constantly on cars. Therefore, having mixed areas helps to reduce traffic and makes neighborhoods much better to live in.",
  "In conclusion, I completely disagree with putting every school and shop into separate zones. While some areas like factories need to stay far away for safety, dividing normal places like schools and houses causes too many problems with traffic and travel. Therefore, mixing homes, schools, and shops together makes cities much better and easier for everyone."
].join("\n\n");

const payload = (prompt, writing, id = "qualified-opinion-test") => ({
  taskType: "Task 2",
  essayType: "Opinion Essay",
  visualType: "",
  targetBand: "7.0",
  reportLanguage: "en",
  clientSubmissionId: id,
  prompt,
  writing,
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
});

const poonSafety = analyzeTask2Safety(payload(POON_PROMPT, POON_WRITING, "poon-safety"));
assert.equal(poonSafety.detectedPosition, "qualified disagreement");
assert.equal(poonSafety.routeAssessment.qualifiedPositionState.qualified, true);
assert.equal(poonSafety.routeAssessment.qualifiedPositionState.thesisClarity, "locally-contradictory");
assert.equal(poonSafety.routeAssessment.overallRouteLabel, "present but initially unclear");
assert.notEqual(poonSafety.routeAssessment.status, "contradicted");
assert.deepEqual(
  poonSafety.routeAssessment.bodyRoutes.map((route) => route.routeRole),
  ["exception-concession", "main-position-support"]
);
assert.deepEqual(
  poonSafety.routeAssessment.bodyRoutes.map((route) => route.supportAssessment.status),
  ["Development Repair Needed", "Controlled Support - Language Repair Needed"]
);

const poon = await analyzeWriting(payload(POON_PROMPT, POON_WRITING, "poon-full-report"));
assert.equal(poon.feedbackIntegrity.paragraphMap.audit.pass, true);
assert.equal(poon.feedbackIntegrity.paragraphMap.paragraphs.length, 4);
assert.equal(poon.kruPomScores["Position Clarity"].status, "Needs Work in Thesis - Clarified by Conclusion");
assert.match(poon.kruPomScores["Thesis Route Clarity"].status, /Needs Work/);
assert.equal(poon.kruPomScores["Body Paragraph Route Alignment"].status, "Aligned");
assert.equal(poon.kruPomScores["SAR Example Quality"].status, "Mixed");
assert.equal(poon.kruPomScores["Link Back Control"].status, "Mixed");
assert.match(poon.kruPomScores["Conclusion Closure"].status, /Functionally Strong/);
assert.deepEqual(Object.fromEntries(Object.entries(poon.criteriaScores).map(([name, value]) => [name, value.range])), {
  "Task Response": "5.5-6.0",
  "Coherence & Cohesion": "5.5",
  "Lexical Resource": "5.5",
  "Grammatical Range & Accuracy": "5.0-5.5"
});
assert.equal(poon.estimatedBandRange, "5.5");
assert.equal(poon.top3Issues[0].issueCategory, "Thesis Route Clarity");

const coverage = Object.fromEntries(poon.feedbackIntegrity.paragraphCoverage.map((item) => [item.paragraphLabel, item]));
assert.match(coverage.Introduction.status, /^Route Repair Needed/);
assert.match(coverage["Body Paragraph 1"].status, /^Exception\/Concession Route Aligned - Development Repair Needed/);
assert.match(coverage["Body Paragraph 2"].status, /^Main-Position Route Aligned - Development Controlled/);
assert.equal(coverage.Conclusion.status, "Functionally Strong — Language Repair Needed");
assert.match(coverage.Conclusion.priorityRepair, /too many problems/i);

const issueAt = (span) => poon.feedbackCards.find((item) => item.targetSpan === span);
assert.equal(issueAt("where is schools, shopping malls, and industrial sites are kept")?.issueCategory, "Grammar and Sentence Control");
assert.match(issueAt("where is schools, shopping malls, and industrial sites are kept")?.diagnosis || "", /relative clause.*incompatible finite structures/i);
assert.equal(issueAt("allow residents for walk")?.issueCategory, "Grammar and Sentence Control");
assert.match(issueAt("allow residents for walk")?.diagnosis || "", /object followed by a to-infinitive/i);
assert.equal(issueAt("useing")?.issueCategory, "Word Form");
assert.match(issueAt("useing")?.diagnosis || "", /misspelled/i);
assert.equal(issueAt("significantly much more")?.issueCategory, "Collocation");
assert.equal(poon.feedbackCards.filter((item) => item.exactSentence.startsWith("Consequently, implementing") && item.issueCategory === "Sentence Completion").length, 1);
assert.equal(poon.feedbackCards.filter((item) => item.exactSentence.startsWith("Consequently, implementing") && /Lexical Precision/.test(item.issueCategory)).length, 0);

assert.equal(poon.practicePlan.length, 7);
assert.match(poon.practicePlan[0].title, /Thesis Route Clarity/);
assert.match(poon.practicePlan[0].task, /qualified judgement/i);
assert.match(poon.practicePlan[1].task, /limited safety exception/i);
assert.match(poon.practicePlan[2].task, /blanket rule/i);
assert.match(poon.practicePlan[3].task, /two validated fragments/i);
assert.match(poon.practicePlan[4].task, /structurally damaged Body Paragraph 1/i);
assert.match(poon.practicePlan[5].task, /verb-complement, word-form, spelling and modifier\/collocation/i);
assert.match(poon.practicePlan[6].task, /new qualified Opinion response/i);
assert.ok(poon.feedbackIntegrity.projectionConsistencyAudit.every((item) => item.pass !== false));
assert.equal(poon.feedbackIntegrity.finalValidatedState.terminal, true);

const safetyFor = (prompt, paragraphs, id) => analyzeTask2Safety(payload(prompt, paragraphs.join("\n\n"), id));
const remotePrompt = "All employees should work from home permanently.";
const qualifiedDisagree = safetyFor(remotePrompt, [
  "This arrangement has value, but applying it to every employee would create serious problems.",
  "For some disabled employees, home working is beneficial because it removes difficult travel and improves access to work.",
  "However, imposing remote work on every employee damages collaboration and practical training.",
  "In conclusion, I disagree with applying this rule to all jobs, although it is useful for employees with specific access needs."
], "qualified-disagree-different-vocabulary");
assert.equal(qualifiedDisagree.detectedPosition, "qualified disagreement");
assert.deepEqual(qualifiedDisagree.routeAssessment.bodyRoutes.map((route) => route.routeRole), ["exception-concession", "main-position-support"]);

const qualifiedDisagreeReversed = safetyFor(remotePrompt, [
  "This arrangement has value, but applying it to every employee would create serious problems.",
  "Imposing remote work on every employee damages collaboration and practical training.",
  "For some disabled employees, however, home working is beneficial because it removes difficult travel and improves access to work.",
  "In conclusion, I disagree with applying this rule to all jobs, although it is useful for employees with specific access needs."
], "qualified-disagree-reversed");
assert.deepEqual(qualifiedDisagreeReversed.routeAssessment.bodyRoutes.map((route) => route.routeRole), ["main-position-support", "exception-concession"]);

const transportPrompt = "Public transport should be free for everyone.";
const qualifiedAgree = safetyFor(transportPrompt, [
  "Free public transport is generally beneficial, although a small exception may be necessary.",
  "Removing public transport fares improves access to work and education for most residents.",
  "However, premium public transport services may create high public costs and therefore need a limited charge.",
  "In conclusion, I agree that public transport should generally be free, except for a limited group of premium services."
], "qualified-agree-different-vocabulary");
assert.equal(qualifiedAgree.detectedPosition, "qualified agreement");
assert.deepEqual(qualifiedAgree.routeAssessment.bodyRoutes.map((route) => route.routeRole), ["main-position-support", "exception-concession"]);

const strongAgree = safetyFor(remotePrompt, [
  "I completely agree that permanent home working should be adopted because it improves autonomy and productivity.",
  "Working from home benefits employees by removing long commutes and improving concentration.",
  "The policy also helps companies reduce office costs and fund better digital tools.",
  "In conclusion, I completely agree that all employees should work from home permanently."
], "strong-agree-control");
assert.equal(strongAgree.routeAssessment.qualifiedPositionState, null);
assert.match(strongAgree.detectedPosition, /agree/);

const strongDisagree = safetyFor(remotePrompt, [
  "I completely disagree with permanent home working because many roles require direct contact.",
  "Remote-only work harms team coordination and makes practical supervision difficult.",
  "It also causes isolation and weakens informal training for new staff.",
  "In conclusion, I completely disagree with requiring all employees to work from home."
], "strong-disagree-control");
assert.equal(strongDisagree.routeAssessment.qualifiedPositionState, null);
assert.match(strongDisagree.detectedPosition, /disagree/);

const contradictory = safetyFor(remotePrompt, [
  "I completely agree that all employees should work from home.",
  "Remote work is beneficial because it saves commuting time.",
  "Permanent home working is harmful because it destroys teamwork.",
  "In conclusion, I completely disagree with requiring employees to work from home."
], "genuine-contradiction-control");
assert.equal(contradictory.routeAssessment.qualifiedPositionState, null);
assert.equal(contradictory.routeAssessment.status, "contradicted");

// Mojibake noncharacters must be restored only as inter-word hyphens and rejected everywhere else.
for (const corrupt of ["Subject\u00ef\u00bf\u00beVerb Agreement", "evidence\u00ef\u00bf\u00bdbased", "full\u00c3\u00af\u00c2\u00bf\u00c2\u00beresponse"]) {
  assert.ok(unicodeIntegrityIssues(corrupt).includes("MOJIBAKE_SEPARATOR_SEQUENCE"));
}
assert.equal(sanitizePrintableText("Subject\u00ef\u00bf\u00beVerb Agreement"), "Subject-Verb Agreement");
assert.equal(sanitizePrintableText("evidence\u00ef\u00bf\u00bdbased"), "evidence-based");
assert.equal(sanitizePrintableText("full\u00c3\u00af\u00c2\u00bf\u00c2\u00beresponse"), "full-response");
assert.ok(pdfTextIntegrityIssues({ extractedText: "Subject\u00ef\u00bf\u00beVerb Agreement" }).issues.includes("CORRUPTED_HYPHENATION"));
assert.equal(unicodeIntegrityIssues(JSON.stringify(poon)).length, 0);

console.log("V12.9.9 Poon qualified-position stop-ship regression test passed.");
