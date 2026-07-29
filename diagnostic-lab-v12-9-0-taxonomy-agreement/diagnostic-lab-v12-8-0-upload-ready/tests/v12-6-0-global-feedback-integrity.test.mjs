import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildEvidenceAssertion,
  detectAgreementDefects,
  detectArticleDefects,
  detectCountabilityDefects,
  detectPunctuationSpacingDefects,
  repairDeterministicEvidenceDefects
} from "../domain/evidenceAssertions.js";
import {
  buildSpecificStudentAction,
  mergeDuplicateIssues,
  selectPrimaryIssueCategory,
  validateLexicalReplacement,
  validatedDimensionMapping
} from "../domain/issueGraph.js";
import { classifySentenceRole } from "../domain/sentenceRoles.js";
import { assessThesisDimensions, inferTask2RouteFamily } from "../domain/thesisDimensions.js";
import {
  buildEvidenceBasedRepairPlan,
  paragraphDimensionStatus,
  unsupportedSummaryClaims
} from "../domain/reportConsistency.js";
import { checkRevisionTypeFidelity } from "../domain/revisionQuality.js";
import { assertPdfTextIntegrity, pdfTextIntegrityIssues, textParity } from "../domain/pdfTextIntegrity.js";
import { buildFeedbackIntegrityModel, validateFeedbackIntegrity } from "../domain/feedbackIntegrity.js";
import { segmentStudentResponse } from "../domain/paragraphEvidence.js";
import { buildStudentReportViewModel } from "../domain/reportViewModels.js";
import { validateCanonicalIssueShape } from "../schemas/canonicalIssueSchema.js";
import { task1Schema } from "../schemas/task1Schema.js";
import { task2Schema } from "../schemas/task2Schema.js";
import { ANALYSIS_VERSIONS, ORCHESTRATION_VERSION } from "../services/analysisVersions.js";

const corpus = JSON.parse(await readFile(new URL("../fixtures/v12-6-regression-corpus.json", import.meta.url), "utf8"));
assert.equal(corpus.corpusVersion, "v12.6.0");
assert.ok(corpus.task2.length >= 20);
assert.ok(corpus.task1.length >= 20);
assert.ok(corpus.providerCases.length >= 2);

assert.equal(ANALYSIS_VERSIONS.appVersion, "12.9.7");
assert.equal(ANALYSIS_VERSIONS.engineVersion, "ielts-diagnostic-engine-v12.9.7");
assert.equal(ANALYSIS_VERSIONS.rubricVersion, "kru-pom-ielts-writing-v12.3.0");
assert.equal(ANALYSIS_VERSIONS.promptVersion, "ielts-diagnostic-prompt-v12.8.0");
assert.equal(ANALYSIS_VERSIONS.reportSchemaVersion, "ielts-diagnostic-report-v12.9.7");
assert.equal(ANALYSIS_VERSIONS.feedbackSchemaVersion, "feedback-integrity-v12.9.7");
assert.equal(ANALYSIS_VERSIONS.issueTaxonomyVersion, "issue-taxonomy-v12.9.7");
assert.equal(ANALYSIS_VERSIONS.evidenceValidatorVersion, "framework-evidence-contract-v12.9.7");
assert.equal(ANALYSIS_VERSIONS.revisionValidatorVersion, "revision-alignment-v12.8.0");
assert.equal(ANALYSIS_VERSIONS.pdfTextIntegrityVersion, "pdf-text-integrity-v12.9.7");
assert.equal(ORCHESTRATION_VERSION, "async-render-v12.5.0");

for (const schema of [task1Schema, task2Schema]) {
  for (const field of ["issueId", "sourceParagraphId", "sentenceRole", "exactEvidence", "targetSpan", "evidenceAssertionType", "issueCategory", "criteriaAffected", "repairTargets", "revisionAlignmentStatus", "studentAction"]) {
    assert.ok(schema.canonicalFeedbackCardFields.includes(field), `${schema.taskType} canonical schema must include ${field}`);
  }
}

const cleanSentence = "The policy is clear and complete.";
const falsePunctuation = buildEvidenceAssertion({
  card: {
    issueType: "Punctuation",
    targetedRevision: cleanSentence,
    whyItLimitsBand: "The sentence has a punctuation error."
  },
  issueCategory: "Punctuation",
  evidence: cleanSentence,
  writing: cleanSentence
});
assert.equal(falsePunctuation.demonstrated, false);
assert.equal(falsePunctuation.rejectionCode, "PUNCTUATION_ASSERTION_UNPROVEN");

const spacingText = "The first stage is complete.The next stage begins.";
const spacingDefects = detectPunctuationSpacingDefects(spacingText, 200);
assert.equal(spacingDefects.length, 1);
assert.equal(spacingDefects[0].targetSpan, ".T");
assert.equal(spacingDefects[0].sourceOffsetStart, 227);
assert.equal(spacingDefects[0].correctedSpan, ". T");

assert.equal(detectCountabilityDefects("The system requires an equipment.", 0).length, 1);
assert.equal(detectCountabilityDefects("The system creates a heavy traffic jam.", 0).length, 0);
assert.equal(detectCountabilityDefects("The system creates a severe congestion.", 0).length, 1);
assert.equal(detectArticleDefects("It is an efficient planning policy.", 0).length, 0);
assert.equal(detectAgreementDefects("It is important to solve the problems we have on Earth.", 0).length, 0);
const controlledAgreementDefects = detectAgreementDefects("Each team have a separate responsibility.", 0);
assert.equal(controlledAgreementDefects.length, 1);
assert.equal(controlledAgreementDefects[0].targetSpan, "have");
assert.equal(controlledAgreementDefects[0].expectedCorrection, "has");

const multiDefect = "The process requires an equipment.It then continues.";
const countabilityDefect = detectCountabilityDefects(multiDefect, 0)[0];
const punctuationDefect = detectPunctuationSpacingDefects(multiDefect, 0)[0];
assert.ok(countabilityDefect.targetOffsetEnd <= punctuationDefect.sourceOffsetStart);
assert.equal(repairDeterministicEvidenceDefects(multiDefect), "The process requires equipment. It then continues.");

const duplicateBase = {
  taskType: "Task 2",
  paragraphId: "paragraph-2",
  sentenceIndex: 1,
  paragraphLocation: "Body Paragraph 1, Sentence 1",
  exactEvidence: multiDefect,
  issueCategory: "Countability",
  severity: "Moderate",
  targetedRevision: "The process requires equipment.It then continues.",
  diagnosis: "A singular article is unsupported.",
  evidenceLocations: [{ paragraphLocation: "Body Paragraph 1, Sentence 1", exactEvidence: multiDefect }],
  evidenceAssertion: {
    assertionType: "countability",
    targetSpan: countabilityDefect.targetSpan,
    targetOffsetStart: countabilityDefect.targetOffsetStart,
    targetOffsetEnd: countabilityDefect.targetOffsetEnd,
    correctedSpan: countabilityDefect.correctedSpan
  }
};
const independentPunctuation = {
  ...duplicateBase,
  issueCategory: "Punctuation",
  targetedRevision: "The process requires an equipment. It then continues.",
  diagnosis: "Terminal punctuation is followed by no space.",
  evidenceAssertion: {
    assertionType: "punctuation_spacing",
    targetSpan: punctuationDefect.targetSpan,
    targetOffsetStart: punctuationDefect.sourceOffsetStart,
    targetOffsetEnd: punctuationDefect.sourceOffsetEnd,
    correctedSpan: punctuationDefect.correctedSpan
  }
};
const deduplicated = mergeDuplicateIssues([
  { ...duplicateBase, feedbackCardId: "card-a" },
  { ...duplicateBase, feedbackCardId: "card-b" },
  { ...independentPunctuation, feedbackCardId: "card-c" }
]);
assert.equal(deduplicated.length, 2);
assert.equal(deduplicated.find((issue) => issue.issueCategory === "Countability")?.mergedCandidateIds.length, 2);

const taxonomy = selectPrimaryIssueCategory({
  issue: {
    issueCategory: "Thesis Route Clarity",
    diagnosis: "The cause route is structurally clear, but its main noun is lexically inaccurate."
  },
  assertion: { assertionType: "lexical_meaning" },
  taskType: "Task 2",
  sentenceRole: "cause_route"
});
assert.equal(taxonomy.primaryCategory, "Lexical Precision");
assert.ok(taxonomy.secondaryCategories.includes("Thesis Route Clarity"));
assert.deepEqual(validatedDimensionMapping("Punctuation", "Task 2").criteria, ["Grammatical Range & Accuracy"]);

assert.equal(classifySentenceRole({
  taskType: "Task 2",
  paragraphRole: "Introduction",
  sentence: "The main causes are limited supply and rising demand.",
  sentenceIndex: 1,
  sentenceCount: 2
}).primaryRole, "cause_route");
assert.equal(classifySentenceRole({
  taskType: "Task 2",
  paragraphRole: "Introduction",
  sentence: "Governments should expand capacity and improve access.",
  sentenceIndex: 1,
  sentenceCount: 2
}).primaryRole, "solution_route");
assert.equal(classifySentenceRole({
  taskType: "Task 2",
  paragraphRole: "Introduction",
  sentence: "This essay will examine the two required routes.",
  sentenceIndex: 1,
  sentenceCount: 2
}).primaryRole, "thesis_route");
assert.equal(classifySentenceRole({
  taskType: "Task 1",
  visualType: "Map",
  paragraphRole: "Body Paragraph 1",
  sentence: "The warehouse was replaced by a park.",
  sentenceIndex: 1,
  sentenceCount: 2
}).primaryRole, "map_change");
assert.equal(classifySentenceRole({
  taskType: "Task 1",
  visualType: "Process Diagram",
  paragraphRole: "Body Paragraph 2",
  sentence: "Finally, the finished material is packaged.",
  sentenceIndex: 1,
  sentenceCount: 2
}).primaryRole, "process_endpoint");
assert.equal(classifySentenceRole({
  taskType: "Task 1",
  visualType: "Bar Chart",
  paragraphRole: "Body Paragraph 1",
  sentence: "City A was higher than City B at 60% and 40%, respectively.",
  sentenceIndex: 0,
  sentenceCount: 1
}).primaryRole, "comparison");

assert.equal(inferTask2RouteFamily("Opinion Essay", "To what extent do you agree?"), "Opinion");
assert.equal(inferTask2RouteFamily("", "What are the causes of this issue and what solutions should be introduced?"), "Problem and Solution");
assert.equal(inferTask2RouteFamily("", "Discuss both views and give your own opinion."), "Discuss Both Views");
assert.equal(inferTask2RouteFamily("", "Do the advantages outweigh the disadvantages?"), "Outweigh");
assert.equal(inferTask2RouteFamily("", "Why does this happen? What should individuals do?"), "Direct Questions");

const routeWriting = [
  "This response will examine the main causes and the solutions governments should adopt.",
  "The first cause is limited capacity because demand grows faster than supply.",
  "A practical solution is to expand capacity so that access improves.",
  "In conclusion, the causes are identifiable and targeted measures can address them."
].join("\n\n");
const routeParagraphs = segmentStudentResponse(routeWriting, "Task 2");
const thesisDimensions = assessThesisDimensions({
  taskType: "Task 2",
  essayType: "Problem & Solution",
  prompt: "What are the causes and what solutions can address them?",
  paragraphs: routeParagraphs,
  canonicalIssues: [{
    issueId: "issue-thesis-word",
    paragraphLabel: "Introduction",
    sentenceRole: "thesis_route",
    issueCategory: "Lexical Precision"
  }]
});
assert.equal(thesisDimensions.status, "Structurally Clear - Lexical Precision Repair Needed");
assert.equal(thesisDimensions.lexicalNamingAccurate, false);
assert.equal(thesisDimensions.bodyRouteTraceable, true);

assert.deepEqual(unsupportedSummaryClaims("Recurring spelling errors are the main limitation.", [{
  issueCategory: "Causal Mechanism",
  evidenceCount: 1
}]).sort(), ["recurring", "spelling"]);
assert.match(paragraphDimensionStatus([{ issueCategory: "Causal Mechanism" }], "Body Paragraph 1"), /Development Repair Needed/);

const unsafeCompliance = validateLexicalReplacement({
  evidence: "The report identifies the unconsciousness.",
  revision: "The report identifies the compliance.",
  assertion: { targetSpan: "unconsciousness", correctedSpan: "compliance" }
});
assert.equal(unsafeCompliance.pass, false);
const unsafeAdjective = validateLexicalReplacement({
  evidence: "The report identifies the unconsciousness.",
  revision: "The report identifies the inattentive.",
  assertion: { targetSpan: "unconsciousness", correctedSpan: "inattentive" }
});
assert.equal(unsafeAdjective.pass, false);
const safeReplacement = validateLexicalReplacement({
  evidence: "The report identifies the unconsciousness.",
  revision: "The report identifies inattentive driving.",
  assertion: { targetSpan: "the unconsciousness", correctedSpan: "inattentive driving" }
});
assert.equal(safeReplacement.pass, true);

const expansion = checkRevisionTypeFidelity({
  original: "Workers save time.",
  revision: "Workers save time. As a result, they arrive rested and can concentrate for longer.",
  revisionType: "Teacher-Guided Expansion"
});
assert.equal(expansion.status, "pass");
assert.equal(expansion.substantialAddition, true);
assert.equal(checkRevisionTypeFidelity({
  original: "Workers save time.",
  revision: "Workers save time. As a result, they arrive rested and can concentrate for longer.",
  revisionType: "Minimal Correction"
}).status, "fail");

const punctuationAction = buildSpecificStudentAction({
  issueCategory: "Punctuation",
  paragraphLocation: "Body Paragraph 1, Sentence 2",
  evidenceAssertion: punctuationDefect
});
assert.match(punctuationAction, /Body Paragraph 1, Sentence 2/);
assert.match(punctuationAction, /replace/i);

const mapReview = buildEvidenceBasedRepairPlan([], "en", 1, { taskType: "Task 1", visualType: "Map" });
assert.match(mapReview[0].task, /Old Feature -> New Feature/);

assert.deepEqual(pdfTextIntegrityIssues({
  extractedText: "Estimated Band 7.5. The report is complete.",
  savedReportText: "Estimated Band 7.5. The report is complete."
}).issues, []);
assert.ok(pdfTextIntegrityIssues({ extractedText: "Estimated Band 7. 5.", savedReportText: "" }).issues.includes("MALFORMED_DECIMAL_BAND"));
assert.ok(pdfTextIntegrityIssues({ extractedText: "The report ends.Next section.", savedReportText: "" }).issues.includes("MISSING_SPACE_AFTER_TERMINAL_PUNCTUATION"));
assert.ok(pdfTextIntegrityIssues({ extractedText: `Clean text\uFFFE`, savedReportText: "" }).issues.length > 0);
assert.ok(textParity("alpha beta gamma delta", "alpha beta").ratio < 0.96);
assert.throws(() => assertPdfTextIntegrity({
  extractedText: "alpha beta",
  savedReportText: "alpha beta gamma delta"
}), /PDF text integrity check failed/);

const canonicalWriting = [
  "Flexible schedules are now common. I agree because they can reduce wasted time and improve staff control.",
  "First, workers can avoid the busiest commuting periods. For example, an employee may begin earlier and finish before demand peaks.",
  "Second, organisations can coordinate shared office space more efficiently.",
  "In conclusion, flexible schedules can benefit both workers and organisations."
].join("\n\n");
const canonicalParagraphs = segmentStudentResponse(canonicalWriting, "Task 2");
const exampleSentence = canonicalParagraphs[1].sentences[1].exactText;
const canonicalModel = buildFeedbackIntegrityModel({
  writing: canonicalWriting,
  taskType: "Task 2",
  reportLanguage: "en",
  feedbackCards: [{
    issueType: "Example Development",
    issueCategory: "Example Development",
    severity: "Moderate",
    criteria: ["Task Response"],
    framework: ["SAR Example Quality"],
    paragraphLocation: "Body Paragraph 1, Sentence 2",
    exactSentence: exampleSentence,
    whyItLimitsBand: "The example does not yet state the result for the wider group.",
    kruPomDiagnosis: "Add the wider result while preserving the same example.",
    targetedRevision: `${exampleSentence} As a result, more workers can avoid peak demand and begin work with greater concentration.`,
    revisionType: "Teacher-Guided Expansion",
    studentAction: "Add the affected group and consequence."
  }],
  topIssues: []
});
assert.ok(canonicalModel.issues.length >= 1);
assert.deepEqual(validateFeedbackIntegrity(canonicalModel, canonicalWriting), []);
for (const issue of canonicalModel.issues) assert.deepEqual(validateCanonicalIssueShape(issue), []);
const thaiModel = buildFeedbackIntegrityModel({
  writing: canonicalWriting,
  taskType: "Task 2",
  reportLanguage: "th",
  feedbackCards: canonicalModel.issues,
  topIssues: []
});
assert.deepEqual(
  thaiModel.issues.map((issue) => [issue.issueId, issue.issueCategory]),
  canonicalModel.issues.map((issue) => [issue.issueId, issue.issueCategory])
);

const studentView = buildStudentReportViewModel({
  taskType: "Task 2",
  reportLanguage: "en",
  studentDisplayNameSnapshot: "Regression Student",
  wordCount: 250,
  estimatedBandRange: "6.5",
  feedbackCards: canonicalModel.issues,
  top3Issues: canonicalModel.topIssues,
  paragraphCoverage: canonicalModel.paragraphCoverage,
  practicePlan: buildEvidenceBasedRepairPlan(canonicalModel.issues, "en", 7),
  feedbackIntegrity: canonicalModel
});
const studentJson = JSON.stringify(studentView);
assert.doesNotMatch(studentJson, /revisionIntegrity|providerBodyPreview|inputFingerprint/);

console.log("V12.6.0 global feedback integrity: evidence assertions, issue graph, taxonomy, roles, thesis dimensions, revision fidelity, summary linkage, PDF text integrity, schemas and corpus matrix passed.");
