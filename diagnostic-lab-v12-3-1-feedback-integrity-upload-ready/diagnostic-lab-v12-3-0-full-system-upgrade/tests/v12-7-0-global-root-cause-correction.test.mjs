import assert from "node:assert/strict";
import {
  AGREEMENT_VALIDATOR_VERSION,
  detectSyntacticHeadAgreementDefects,
  validateAgreementRepair
} from "../domain/agreementValidator.js";
import {
  TASK2_ROUTE_CLASSIFIER_VERSION,
  buildTaskAwareRouteModel
} from "../domain/task2RouteModel.js";
import {
  analyzeTask2Safety,
  freezeTask2ScoringSnapshot,
  reconcileTask2CanonicalAnalysis
} from "../domain/task2Safety.js";
import {
  detectAgreementDefects,
  detectCountabilityDefects,
  detectPunctuationSpacingDefects
} from "../domain/evidenceAssertions.js";
import { buildFeedbackIntegrityModel } from "../domain/feedbackIntegrity.js";
import {
  assertStudentReportViewModel,
  buildStudentReportViewModel
} from "../domain/reportViewModels.js";
import {
  assertPdfTextIntegrity,
  pdfTextIntegrityIssues,
  semanticReportParity
} from "../domain/pdfTextIntegrity.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";

assert.equal(ANALYSIS_VERSIONS.appVersion, "12.8.2");
assert.equal(ANALYSIS_VERSIONS.routeClassifierVersion, TASK2_ROUTE_CLASSIFIER_VERSION);
assert.equal(ANALYSIS_VERSIONS.grammarValidatorVersion, AGREEMENT_VALIDATOR_VERSION);
assert.equal(ANALYSIS_VERSIONS.rubricVersion, "kru-pom-ielts-writing-v12.3.0");

const correctPluralHead = "The main drivers of this issue are driver inattention and limited public transport.";
assert.deepEqual(detectSyntacticHeadAgreementDefects(correctPluralHead), []);
assert.deepEqual(detectAgreementDefects(correctPluralHead), []);

const wrongPluralHead = "The main drivers of this issue is driver inattention and limited public transport.";
const pluralHeadDefect = detectSyntacticHeadAgreementDefects(wrongPluralHead)[0];
assert.equal(pluralHeadDefect.subjectHead, "drivers");
assert.equal(pluralHeadDefect.targetSpan, "is");
assert.equal(pluralHeadDefect.correctedSpan, "are");
assert.equal(validateAgreementRepair(wrongPluralHead, pluralHeadDefect).pass, true);

const wrongSingularHead = "The main driver of these issues are careless motorists.";
const singularHeadDefect = detectSyntacticHeadAgreementDefects(wrongSingularHead)[0];
assert.equal(singularHeadDefect.subjectHead, "driver");
assert.equal(singularHeadDefect.correctedSpan, "is");
assert.deepEqual(detectSyntacticHeadAgreementDefects("The problems we have are serious."), []);
assert.equal(detectSyntacticHeadAgreementDefects("The population of several cities continue to grow.")[0].correctedSpan, "continues");
assert.equal(detectSyntacticHeadAgreementDefects("A number of cars is increasing.")[0].correctedSpan, "are");
assert.equal(detectSyntacticHeadAgreementDefects("The number of cars are increasing.")[0].correctedSpan, "is");

const routeModel = buildTaskAwareRouteModel({
  taskFamily: "problem-solution",
  internalSubtype: "causes-solutions",
  requiredRoutes: ["cause", "solution"],
  prompt: "What causes traffic congestion, and what measures can address it?",
  introduction: "The main drivers are driver inattention and limited public transport. Investment and enforcement can address them.",
  bodyParagraphs: [
    "First of all, driver inattention plays a crucial role in increasing traffic congestion. Drivers often use mobile phones because they underestimate the danger. For example, public transportation is limited, so commuters may also rely on cars. This lack of alternatives adds vehicles to the same roads.",
    "Furthermore, city authorities should expand public transport and enforce distracted-driving laws. Reliable services would give commuters an alternative, while enforcement would deter phone use. As a result, fewer vehicles and safer driving would reduce congestion."
  ],
  conclusion: "In conclusion, inattention and limited transport cause congestion, while investment and enforcement can reduce it."
});
assert.deepEqual(routeModel.paragraphRoutes.map((item) => item.primaryRoute), ["cause", "solution"]);
assert.equal(routeModel.missingRouteTypes.length, 0);
assert.notEqual(routeModel.overallRouteStatus, "absent");
assert.match(routeModel.paragraphRoutes[0].controllingProposition, /driver inattention/i);

const familyMatrix = [
  {
    taskFamily: "advantages-disadvantages",
    internalSubtype: "standard",
    prompt: "What are the advantages and disadvantages?",
    paragraphs: [
      "One main advantage is that remote work reduces commuting time. This gives workers more time and can improve concentration.",
      "A major disadvantage is weaker informal communication. Teams may exchange fewer spontaneous ideas and some workers can feel isolated."
    ],
    expected: ["advantage", "disadvantage"]
  },
  {
    taskFamily: "causes-effects",
    internalSubtype: "causes-effects",
    prompt: "What are the causes and effects?",
    paragraphs: [
      "The main cause is weak enforcement. Because drivers expect no penalty, they continue the behaviour.",
      "The main effect is greater road danger. As a result, collisions and delays increase."
    ],
    expected: ["cause", "effect"]
  }
];
for (const fixture of familyMatrix) {
  const model = buildTaskAwareRouteModel({
    taskFamily: fixture.taskFamily,
    internalSubtype: fixture.internalSubtype,
    prompt: fixture.prompt,
    bodyParagraphs: fixture.paragraphs
  });
  assert.deepEqual(model.paragraphRoutes.map((item) => item.primaryRoute), fixture.expected);
}

const writing = [
  "Traffic congestion is caused by driver inattention and limited public transport. Practical investment and enforcement can address both causes.",
  "First, driver inattention plays a crucial role in increasing congestion. Drivers may use phones because they underestimate the danger. This slows traffic after avoidable collisions. The wider result is pressure across the road network.",
  "Second, city authorities should expand public transport and enforce strict distracted-driving laws. Better services give commuters alternatives, while penalties deter phone use. These measures reduce car dependence and prevent avoidable delays.",
  "In conclusion, inattention and limited transport cause congestion, while public investment and enforcement can address them."
].join("\n\n");
const safety = analyzeTask2Safety({
  taskType: "Task 2",
  essayType: "Problem & Solution",
  prompt: "What causes traffic congestion, and what measures can address it?",
  writing
});
assert.deepEqual(safety.routeAssessment.bodyRoutes.map((item) => item.primaryRoute), ["cause", "solution"]);
assert.equal(safety.routeAssessment.missingRequirements.length, 0);
assert.notEqual(safety.routeAssessment.status, "absent");

const canonical = reconcileTask2CanonicalAnalysis({
  taskType: "Task 2",
  essayType: "Problem & Solution",
  prompt: "What causes traffic congestion, and what measures can address it?",
  writing
}, {}, safety);
assert.equal(canonical.scoringSnapshot.frozen, true);
assert.equal(Object.isFrozen(canonical.scoringSnapshot), true);
assert.equal(Object.isFrozen(canonical.scoringSnapshot.criterionScores), true);
assert.equal(Object.isFrozen(canonical.scoringSnapshot.criterionScores["Task Response"]), true);

const explicitFreeze = freezeTask2ScoringSnapshot({
  criterionScores: { "Task Response": { range: "6.0-6.5" } },
  overallBandRange: { label: "6.0-6.5" },
  routeStatus: "partially_developed"
});
assert.equal(Object.isFrozen(explicitFreeze), true);

const mechanicalSentence = "Public transport is limited, resulting in a severe traffic congestion.Therefore, more commuters drive.";
assert.equal(detectCountabilityDefects(mechanicalSentence).length, 1);
assert.equal(detectPunctuationSpacingDefects(mechanicalSentence).length, 1);

const feedbackModel = buildFeedbackIntegrityModel({
  writing: `${correctPluralHead}\n\n${mechanicalSentence}`,
  taskType: "Task 2",
  essayType: "Problem & Solution",
  prompt: "What causes congestion and what measures can address it?",
  routeAssessment: safety.routeAssessment
});
assert.equal(feedbackModel.issues.some((item) => item.issueCategory === "Subject-Verb Agreement"), false);
assert.equal(feedbackModel.issues.some((item) => item.issueCategory === "Countability"), true);
assert.equal(feedbackModel.issues.some((item) => item.issueCategory === "Punctuation"), true);

const studentView = buildStudentReportViewModel({
  taskType: "Task 2",
  studentDisplayNameSnapshot: "Sun",
  wordCount: 322,
  minimumWordCount: 250,
  feedbackCards: [{
    issueId: "internal-issue-id",
    issueCategory: "Punctuation",
    paragraphLocation: "Body Paragraph 1, Sentence 7",
    sourceParagraphId: "paragraph-2",
    sourceSentenceId: "sentence-7",
    sentenceRole: "body_topic_sentence",
    exactSentence: mechanicalSentence,
    targetSpan: ".T",
    targetStartOffset: 69,
    targetEndOffset: 71,
    evidenceStartOffset: 0,
    evidenceEndOffset: mechanicalSentence.length,
    evidenceAssertionType: "punctuation_spacing",
    detectedDefect: "The full stop needs a following space.",
    expectedCorrection: ". T",
    sentenceFunction: "body_topic_sentence",
    whyItLimitsBand: "The sentence boundary is unclear.",
    kruPomDiagnosis: "Add a space after the full stop.",
    revisionType: "Minimal Correction",
    targetedRevision: mechanicalSentence.replace(".Therefore", ". Therefore"),
    whyRevisionIsStronger: "The sentence boundary is clear.",
    studentAction: "Add a space after the full stop at source offset 69.",
    repairTargets: ["punctuation_spacing"],
    evidenceLocations: []
  }],
  top3Issues: [],
  paragraphCoverage: [],
  practicePlan: [{ day: 1, title: "Practise punctuation", task: "Write three correctly spaced sentence pairs." }]
});
assert.equal(assertStudentReportViewModel(studentView), true);
const studentJson = JSON.stringify(studentView);
for (const forbidden of [
  "issueId", "sourceParagraphId", "sourceSentenceId", "sentenceRole",
  "targetStartOffset", "evidenceStartOffset", "evidenceAssertionType",
  "repairTargets", "body_topic_sentence", "source offset"
]) {
  assert.equal(studentJson.includes(forbidden), false, `student view leaked ${forbidden}`);
}

const webText = "Estimated Band Range 6.0-6.5 Executive Summary IELTS Criteria Breakdown Task Response Detailed Feedback Repair Plan";
assert.equal(semanticReportParity(webText, webText).pass, true);
assert.equal(assertPdfTextIntegrity({ extractedText: webText, savedReportText: webText }).issues.length, 0);
assert.ok(pdfTextIntegrityIssues({
  extractedText: `${webText} source offset 44`,
  savedReportText: `${webText} source offset 44`
}).issues.includes("PDF_INTERNAL_REPORT_LANGUAGE"));

console.log("V12.8.0 global root-cause correction: task-aware routes, syntactic-head agreement, frozen scoring, canonical independent defects, student allowlist and PDF semantic parity passed.");
