import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildRoutePreservingFragmentRevision,
  SENTENCE_COMPLETENESS_VALIDATOR_VERSION,
  validateSentenceCompleteness
} from "../domain/sentenceCompleteness.js";
import {
  ISSUE_ALIGNMENT_VALIDATOR_VERSION,
  validateCanonicalIssueAlignment
} from "../domain/issueContract.js";
import {
  issuePriority,
  mergeDuplicateIssues
} from "../domain/issueGraph.js";
import {
  buildEvidenceBasedRepairPlan,
  paragraphDimensionStatus,
  validateStatusExplanationCompatibility
} from "../domain/reportConsistency.js";
import {
  buildFeedbackIntegrityModel,
  validateFeedbackIntegrity
} from "../domain/feedbackIntegrity.js";
import {
  TASK2_ROUTE_CLASSIFIER_VERSION,
  buildTaskAwareRouteModel
} from "../domain/task2RouteModel.js";
import { pdfTextIntegrityIssues } from "../domain/pdfTextIntegrity.js";
import { detectSyntacticHeadAgreementDefects } from "../domain/agreementValidator.js";
import { detectArticleDefects } from "../domain/evidenceAssertions.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";

const checks = [];
const check = (name, fn) => {
  fn();
  checks.push({ name, status: "PASS" });
};

check("release and validator versions", () => {
  assert.equal(ANALYSIS_VERSIONS.appVersion, "12.8.2");
  assert.equal(ANALYSIS_VERSIONS.routeClassifierVersion, TASK2_ROUTE_CLASSIFIER_VERSION);
  assert.equal(SENTENCE_COMPLETENESS_VALIDATOR_VERSION, "independent-clause-validator-v12.8.0");
  assert.equal(ISSUE_ALIGNMENT_VALIDATOR_VERSION, "canonical-issue-alignment-v12.8.0");
  assert.equal(ANALYSIS_VERSIONS.rubricVersion, "kru-pom-ielts-writing-v12.3.0");
});

const lawFragment = "A law that restricts phone use while driving.";
const lawRevision = buildRoutePreservingFragmentRevision(lawFragment);
check("fragment detection and safe independent-clause repair", () => {
  const result = validateSentenceCompleteness(lawFragment);
  assert.equal(result.complete, false);
  assert.ok(result.reasons.includes("noun-phrase-relative-clause-without-main-clause"));
  assert.equal(lawRevision, "A law can restrict phone use while driving.");
  assert.equal(validateSentenceCompleteness(lawRevision).complete, true);
  assert.equal(validateSentenceCompleteness("A law that restricts phone use can reduce preventable crashes.").complete, true);
});

check("fragment-priority", () => {
  const fragment = { issueCategory: "Sentence Completion", severity: "Major" };
  const punctuation = { issueCategory: "Punctuation", severity: "Moderate" };
  assert.ok(issuePriority(fragment) > issuePriority(punctuation));
});

const punctuationIssue = {
  taskType: "Task 2",
  issueCategory: "Punctuation",
  diagnosis: "A space is missing after the full stop.",
  studentAction: 'Replace ".T" with ". T" to insert the missing space after the punctuation mark.',
  targetedRevision: "The first stage ends. The next stage begins.",
  revisionType: "Minimal Correction",
  evidenceAssertion: {
    assertionType: "punctuation_spacing",
    targetSpan: ".T",
    correctedSpan: ". T"
  }
};
const countabilityIssue = {
  taskType: "Task 2",
  issueCategory: "Countability",
  diagnosis: "The singular article is unsupported before the uncountable noun.",
  studentAction: 'Remove the article "a" before the uncountable noun "congestion".',
  targetedRevision: "This creates severe congestion.",
  revisionType: "Minimal Correction",
  evidenceAssertion: {
    assertionType: "countability",
    targetSpan: "a severe congestion",
    correctedSpan: "severe congestion"
  }
};
const developmentIssue = {
  taskType: "Task 2",
  issueCategory: "Causal Mechanism",
  diagnosis: "The paragraph names congestion but does not explain the missing behavioural response and outcome.",
  studentAction: "Complete the cause-to-effect chain by adding the behavioural response and resulting outcome.",
  targetedRevision: "Demand rises at the same time, so more vehicles enter the same roads and queues become longer.",
  revisionType: "Teacher-Guided Expansion",
  evidenceAssertion: { assertionType: "causal_gap" }
};

check("category-diagnosis-action-revision consistency", () => {
  assert.equal(validateCanonicalIssueAlignment(punctuationIssue).pass, true);
  assert.equal(validateCanonicalIssueAlignment(countabilityIssue).pass, true);
  assert.equal(validateCanonicalIssueAlignment(developmentIssue).pass, true);
  assert.equal(validateCanonicalIssueAlignment({
    ...countabilityIssue,
    diagnosis: "The response-to-behaviour mechanism is missing."
  }).pass, false);
  assert.equal(validateCanonicalIssueAlignment({
    ...developmentIssue,
    diagnosis: "The wording is awkward.",
    revisionType: "Minimal Correction"
  }).pass, false);
});

check("nominal subject is not misread as a finite verb", () => {
  assert.deepEqual(detectSyntacticHeadAgreementDefects("The main cause is over-reliance on private cars."), []);
  assert.deepEqual(detectSyntacticHeadAgreementDefects("The main solution is reliable public transport."), []);
  assert.deepEqual(detectSyntacticHeadAgreementDefects("The increase in City D was 20 percentage points."), []);
  assert.deepEqual(detectArticleDefects("The figures for Cities A and B had risen."), []);
  assert.equal(validateSentenceCompleteness("Overall, recycling rates increased in all four cities.").complete, true);
});

check("issue-deduplication preserves independent defects", () => {
  const base = {
    paragraphLocation: "Body Paragraph 1, Sentence 2",
    sentenceIndex: 2,
    exactEvidence: "The process requires an equipment.It then continues.",
    severity: "Moderate",
    criteriaAffected: ["Grammatical Range & Accuracy"],
    evidenceLocations: [],
    diagnosis: "The singular article is unsupported before the uncountable noun.",
    targetedRevision: "The process requires equipment.It then continues."
  };
  const countability = {
    ...base,
    issueId: "count-a",
    feedbackCardId: "count-a",
    issueCategory: "Countability",
    evidenceAssertion: {
      assertionType: "countability",
      targetSpan: "an equipment",
      targetOffsetStart: 21,
      targetOffsetEnd: 33,
      correctedSpan: "equipment"
    }
  };
  const merged = mergeDuplicateIssues([
    countability,
    { ...countability, issueId: "count-b", feedbackCardId: "count-b" },
    {
      ...base,
      issueId: "punctuation-a",
      feedbackCardId: "punctuation-a",
      issueCategory: "Punctuation",
      evidenceAssertion: {
        assertionType: "punctuation_spacing",
        targetSpan: ".I",
        targetOffsetStart: 33,
        targetOffsetEnd: 35
      }
    }
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((item) => item.issueCategory === "Countability").mergedCandidateIds.length, 2);
});

check("status-explanation compatibility", () => {
  assert.equal(validateStatusExplanationCompatibility({
    name: "Thesis",
    status: "Strong",
    explanation: "The required route is unclear and needs repair."
  }).pass, false);
  assert.equal(validateStatusExplanationCompatibility({
    name: "Thesis",
    status: "Structurally Strong - Lexical Precision Repair Needed",
    explanation: "Both routes are present; one noun needs a lexical precision repair."
  }).pass, true);
  assert.equal(validateStatusExplanationCompatibility({
    name: "Conclusion",
    status: "Functionally Strong - Language Repair Needed",
    explanation: "The conclusion closes the route but contains a fragment."
  }).pass, true);
});

check("problem-solution explicit solution proposition", () => {
  const model = buildTaskAwareRouteModel({
    taskFamily: "problem-solution",
    internalSubtype: "causes-solutions",
    prompt: "What are the causes? What solutions can you suggest?",
    bodyParagraphs: [
      "The main cause is over-reliance on private cars. This places too many vehicles on limited road space. As a result, queues form at peak times.",
      "The most effective solution is to expand high-frequency public transport. Reliable services give commuters a practical alternative. This reduces the number of cars entering central roads."
    ]
  });
  assert.deepEqual(model.paragraphRoutes.map((item) => item.primaryRoute), ["cause", "solution"]);
  assert.equal(model.missingRouteTypes.length, 0);
});

const fragmentWriting = [
  "Road safety remains a serious public concern. This essay examines enforcement and driver behaviour.",
  `One useful response is stronger enforcement. ${lawFragment} This makes the rule visible to drivers.`,
  "Education can also change behaviour. Clear campaigns show why distraction is dangerous and encourage drivers to put phones away.",
  "In conclusion, enforcement and education can reduce distracted driving."
].join("\n\n");
const fragmentModel = buildFeedbackIntegrityModel({
  writing: fragmentWriting,
  taskType: "Task 2",
  essayType: "Problem and Solution",
  reportLanguage: "en",
  feedbackCards: [{
    issueType: "Sentence Completion",
    issueCategory: "Sentence Completion",
    severity: "Major",
    criteria: ["Grammatical Range & Accuracy"],
    framework: ["Clear"],
    paragraphLocation: "Body Paragraph 1, Sentence 2",
    exactSentence: lawFragment,
    whyItLimitsBand: "The evidence is a noun phrase followed by a relative clause, not an independent sentence.",
    kruPomDiagnosis: "Add a finite main clause while preserving the enforcement route.",
    targetedRevision: lawRevision,
    revisionType: "Minimal Correction",
    studentAction: "Rewrite it as a complete independent sentence with a subject and finite main verb."
  }],
  topIssues: [{ issueCategory: "Sentence Completion", exactEvidence: lawFragment }]
});

check("fragment cannot disappear from the report", () => {
  const issue = fragmentModel.issues.find((item) => item.exactEvidence === lawFragment);
  assert.ok(issue);
  assert.equal(issue.issueCategory, "Sentence Completion");
  assert.equal(issue.targetedRevision, lawRevision);
  assert.ok(fragmentModel.topIssues.some((item) => item.issueId === issue.issueId));
  assert.deepEqual(validateFeedbackIntegrity(fragmentModel, fragmentWriting), []);
});

check("Paragraph Coverage full-set and dimensional consistency", () => {
  assert.deepEqual(
    fragmentModel.paragraphCoverage.map((item) => item.paragraphLabel),
    ["Introduction", "Body Paragraph 1", "Body Paragraph 2", "Conclusion"]
  );
  const bodyOne = fragmentModel.paragraphCoverage.find((item) => item.paragraphLabel === "Body Paragraph 1");
  assert.match(bodyOne.status, /Language Repair Needed|Needs Work|Moderate/);
  assert.equal(
    paragraphDimensionStatus([{ issueCategory: "Sentence Completion", sentenceRole: "example" }], "Body Paragraph 1"),
    "Route Aligned - Development Controlled - Example/SAR Repair Needed - Language Repair Needed"
  );
  assert.equal(
    paragraphDimensionStatus([{ issueCategory: "Sentence Completion" }], "Conclusion", { complete: true }),
    "Functionally Strong — Language Repair Needed"
  );
});

check("Repair Plan semantic mapping", () => {
  const issues = [
    { ...countabilityIssue, issueId: "countability-1", paragraphId: "paragraph-2", paragraphLabel: "Body Paragraph 1", severity: "Moderate" },
    { ...developmentIssue, issueId: "development-1", paragraphId: "paragraph-3", paragraphLabel: "Body Paragraph 2", severity: "Major" },
    {
      issueId: "intro-1",
      paragraphId: "paragraph-1",
      paragraphLabel: "Introduction",
      issueCategory: "Thesis Route Clarity",
      severity: "Major",
      studentAction: "State the cause and solution routes in the same order as the body paragraphs."
    }
  ];
  const plan = buildEvidenceBasedRepairPlan(issues, "en", 7, { taskType: "Task 2" });
  assert.equal(plan.length, 7);
  assert.ok(plan.some((day) => /uncountable|countability|noun phrase/i.test(`${day.title} ${day.task}`)));
  assert.ok(plan.some((day) => /mechanism|chain|outcome/i.test(`${day.title} ${day.task}`)));
  assert.ok(plan.some((day) => /thesis|task routes|route order/i.test(`${day.title} ${day.task}`)));
});

check("PDF extracted-text forbidden patterns", () => {
  const clean = "Task type: Task 2. Estimated Band 6.5. Repair Plan.";
  assert.deepEqual(pdfTextIntegrityIssues({ extractedText: clean, savedReportText: clean }).issues, []);
  for (const malformed of [
    "Task\uFFFEtype: Task 2.",
    "Task\u2011type: Task 2.",
    "Estimated Band 6. 5.",
    "Clean text\uE000"
  ]) {
    assert.ok(pdfTextIntegrityIssues({ extractedText: malformed }).issues.length > 0, malformed);
  }
});

check("analysis wait-time copy", async () => {});
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
assert.match(html, /may take a few minutes/i);
assert.doesNotMatch(html, /take about 1 minute/i);

console.log(`V12.8.0 output-integrity matrix passed: ${checks.length} named checks.`);
console.log(checks.map((item) => `PASS | ${item.name}`).join("\n"));
