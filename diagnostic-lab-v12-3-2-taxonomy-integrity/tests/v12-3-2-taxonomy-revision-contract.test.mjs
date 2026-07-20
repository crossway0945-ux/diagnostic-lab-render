import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ISSUE_TAXONOMY,
  DEVELOPMENT_ISSUE_CATEGORIES,
  LANGUAGE_ISSUE_CATEGORIES,
  ROUTE_ALIGNMENT_SCOPE_NOTE,
  ROUTE_ALIGNMENT_SCOPE_NOTE_TH,
  assessConclusionFunction,
  buildFeedbackIntegrityModel,
  detectDevelopmentSignal,
  detectLanguageSignal,
  evaluateRevisionAlignment,
  projectRouteAlignmentDisplay,
  validateFeedbackIntegrity
} from "../domain/feedbackIntegrity.js";
import { projectCanonicalTask2Framework } from "../domain/canonicalAnalysis.js";
import { segmentStudentResponse } from "../domain/paragraphEvidence.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";

assert.equal(ANALYSIS_VERSIONS.appVersion, "12.3.2");
assert.equal(ANALYSIS_VERSIONS.issueTaxonomyVersion, "issue-taxonomy-v12.3.2");
assert.equal(ANALYSIS_VERSIONS.revisionValidatorVersion, "revision-alignment-v12.3.2");
assert.equal(ANALYSIS_VERSIONS.feedbackSchemaVersion, "feedback-integrity-v12.3.2");

// --- Single authoritative taxonomy contract ---
for (const category of ["Tense Control", "Causal Mechanism", "Word Choice", "Subject–Verb Agreement", "Modal + Base Verb", "Pronoun Control", "Topic Sentence Strength", "Paragraph Closure", "Introduction Precision", "Mixed-Visual Coverage"]) {
  assert.ok(ISSUE_TAXONOMY.includes(category), `${category} must exist in the shared taxonomy`);
}
for (const category of DEVELOPMENT_ISSUE_CATEGORIES) {
  assert.ok(ISSUE_TAXONOMY.includes(category));
  assert.ok(!LANGUAGE_ISSUE_CATEGORIES.includes(category), `${category} must not be both development and language`);
}
for (const category of LANGUAGE_ISSUE_CATEGORIES) {
  assert.ok(ISSUE_TAXONOMY.includes(category));
}

// --- Deterministic signal detectors ---
assert.equal(detectLanguageSignal("the progressive tense is not controlled in this general statement"), "Tense Control");
assert.equal(detectLanguageSignal("the article is missing before a singular noun"), "Article Control");
assert.equal(detectDevelopmentSignal("the causal mechanism and the affected group are unclear"), "Causal Mechanism");
assert.equal(detectDevelopmentSignal("the sar development is incomplete and the bridge to the policy is weak"), "SAR Example Quality");
assert.equal(detectDevelopmentSignal("a countable noun is used without the plural form"), "");

const task2Writing = [
  "Urban zoning is often presented as an efficient planning policy. However, I strongly disagree because it creates longer journeys and concentrated traffic.",
  "First, strict zoning can make essential journeys unnecessarily long. Families may live far from schools and workplaces because these services are concentrated elsewhere. For example, students may travel for hours, so they arrive tired and learn less effectively. Therefore, this arrangement imposes avoidable travel costs on families.",
  "Furthermore, putting similar destinations in one district can intensify congestion. Restaurants and shopping centres attract visitors at similar times. For example, commuters converge on the same roads during meal periods, so junctions become overloaded and delays spread to nearby neighbourhoods. Therefore, concentrated destinations can disrupt movement across the wider city.",
  "In conclusion, I firmly disagree because strict zoning creates longer journeys and wider traffic congestion."
].join("\n\n");

const paragraphs = segmentStudentResponse(task2Writing, "Task 2");
assert.deepEqual(paragraphs.map((item) => item.role), ["Introduction", "Body Paragraph 1", "Body Paragraph 2", "Conclusion"]);
assert.equal(assessConclusionFunction(paragraphs, "Task 2").status, "Strong");

const body1 = paragraphs[1].sentences.map((item) => item.exactText);
const body2 = paragraphs[2].sentences.map((item) => item.exactText);

// --- Classification fixture matrix ---
const tenseUnderArticleHeading = {
  issueType: "Article Control",
  severity: "Minor Repair",
  criteria: ["Grammatical Range & Accuracy"],
  framework: ["LFC CPC Control"],
  paragraphLocation: "Body Paragraph 1, Sentence 2",
  exactSentence: body1[1],
  whyItLimitsBand: "The progressive tense is not controlled in this general statement, which weakens grammatical accuracy.",
  kruPomDiagnosis: "Use the present simple for general statements instead of the progressive form.",
  targetedRevision: "Families often live far from schools and workplaces because these services are concentrated elsewhere.",
  revisionType: "Minimal Correction",
  studentAction: "Check every general statement and keep it in the present simple."
};

const genuineArticleError = {
  issueType: "Article Control",
  severity: "Minor Repair",
  criteria: ["Grammatical Range & Accuracy"],
  framework: ["LFC CPC Control"],
  paragraphLocation: "Body Paragraph 2, Sentence 2",
  exactSentence: body2[1],
  whyItLimitsBand: "The article is missing before the singular countable noun in this comparison.",
  kruPomDiagnosis: "Add the required article without changing the sentence's reporting function.",
  targetedRevision: "Restaurants and shopping centres attract a wide range of visitors at similar times.",
  revisionType: "Minimal Correction",
  studentAction: "Check singular countable nouns for a required article."
};

const genuineWordFormError = {
  issueType: "Word Form",
  severity: "Minor Repair",
  criteria: ["Lexical Resource"],
  framework: ["Vocabulary Precision"],
  paragraphLocation: "Body Paragraph 2, Sentence 1",
  exactSentence: body2[0],
  whyItLimitsBand: "The word form is wrong: the noun derivation should be used instead of the verb in this position.",
  kruPomDiagnosis: "Repair the word formation while keeping the topic-sentence claim unchanged.",
  targetedRevision: "Furthermore, the placement of similar destinations in one district can intensify congestion.",
  revisionType: "Minimal Correction",
  studentAction: "Check derived noun forms in topic sentences."
};

const lexicalNotWordForm = {
  issueType: "Word Form",
  severity: "Moderate",
  criteria: ["Lexical Resource"],
  framework: ["Vocabulary Precision"],
  paragraphLocation: "Body Paragraph 1, Sentence 1",
  exactSentence: body1[0],
  whyItLimitsBand: "Invented wording such as 'clusterization' and the vague phrase 'a specific place' make the meaning imprecise, so word choice needs control.",
  kruPomDiagnosis: "Replace invented and vague wording with natural, precise vocabulary.",
  targetedRevision: "First, strict zoning can make everyday journeys unnecessarily long.",
  revisionType: "Minimal Correction",
  studentAction: "Replace invented words with standard vocabulary before submitting."
};

const genuineCountability = {
  issueType: "Countability",
  severity: "Minor Repair",
  criteria: ["Grammatical Range & Accuracy"],
  framework: ["LFC CPC Control"],
  paragraphLocation: "Body Paragraph 1, Sentence 4",
  exactSentence: body1[3],
  whyItLimitsBand: "A countable noun is used without the plural form.",
  kruPomDiagnosis: "Repair only the countability slip and keep the link-back function unchanged.",
  targetedRevision: "Therefore, this arrangement imposes avoidable travel costs on families across the city.",
  revisionType: "Minimal Correction",
  revisionIntegrity: { diagnosedCategories: ["countability"], originalIssueCategories: ["countability"] },
  studentAction: "Check countable nouns for the plural form."
};

const mechanismUnderCountabilityHeading = {
  issueType: "Countability",
  severity: "Moderate",
  criteria: ["Task Response", "Coherence & Cohesion"],
  framework: ["Explanation Depth", "SAR Example Quality"],
  paragraphLocation: "Body Paragraph 2, Sentence 3",
  exactSentence: body2[2],
  whyItLimitsBand: "The causal mechanism and the affected group are unclear, so the example does not yet prove the congestion claim. A countability slip also appears in this sentence.",
  kruPomDiagnosis: "Complete the causal chain from concentrated destinations to congestion and name who is affected.",
  targetedRevision: `${body2[2]} This happens because journeys concentrate at the same peak periods, so traffic volume rises on surrounding roads and commuters across the district face longer delays.`,
  revisionType: "Route-Preserving Revision",
  revisionIntegrity: { diagnosedCategories: ["countability"], originalIssueCategories: ["countability"] },
  studentAction: "Complete the causal chain and name the affected group before polishing single words."
};

const sarUnderCollocationHeading = {
  issueType: "Collocation",
  severity: "Moderate",
  criteria: ["Task Response"],
  framework: ["SAR Example Quality"],
  paragraphLocation: "Body Paragraph 1, Sentence 3",
  exactSentence: body1[2],
  whyItLimitsBand: "The SAR development is incomplete and the bridge to the zoning policy is weak, so the example does not connect back to the claim.",
  kruPomDiagnosis: "Show the situation, action and result, then connect the result to the zoning claim.",
  targetedRevision: `${body1[2]} This matters because zoning concentrates schools far from many homes, so students across the city lose rest and study time, which directly supports the accessibility reason in the thesis.`,
  revisionType: "Teacher-Guided Expansion",
  studentAction: "Complete the situation-action-result chain and connect it back to the thesis reason."
};

const model = buildFeedbackIntegrityModel({
  writing: task2Writing,
  taskType: "Task 2",
  feedbackCards: [
    tenseUnderArticleHeading,
    genuineArticleError,
    genuineWordFormError,
    lexicalNotWordForm,
    genuineCountability,
    mechanismUnderCountabilityHeading,
    sarUnderCollocationHeading
  ],
  topIssues: [mechanismUnderCountabilityHeading, sarUnderCollocationHeading, tenseUnderArticleHeading]
});

const byEvidence = (evidence) => model.issues.find((issue) => issue.exactEvidence === evidence);

// 1. Tense error under an Article Control heading must be reclassified as Tense Control.
assert.equal(byEvidence(body1[1]).issueCategory, "Tense Control");
// 2. A genuine article error stays Article Control.
assert.equal(byEvidence(body2[1]).issueCategory, "Article Control");
// 3. A genuine word-form error stays Word Form.
assert.equal(byEvidence(body2[0]).issueCategory, "Word Form");
// 4. A lexical precision problem must not be reduced to Word Form.
assert.equal(byEvidence(body1[0]).issueCategory, "Lexical Precision");
// 5. A genuine countability-only error stays Countability.
assert.equal(byEvidence(body1[3]).issueCategory, "Countability");
assert.deepEqual(byEvidence(body1[3]).secondaryIssueCategories, []);
// 6. An incomplete causal mechanism must not hide behind a Countability heading.
const mechanismIssue = byEvidence(body2[2]);
assert.equal(mechanismIssue.issueCategory, "Causal Mechanism");
assert.ok(mechanismIssue.secondaryIssueCategories.includes("Countability"), "countability must remain a separate secondary issue");
assert.ok(mechanismIssue.repairTargets.includes("mechanism"));
assert.equal(mechanismIssue.revisionType, "Teacher-Guided Expansion", "material analytical expansion must be labelled as teacher guidance");
assert.equal(mechanismIssue.revisionAlignmentStatus, "aligned");
assert.match(mechanismIssue.whyItLimitsBand, /countability slip/i, "secondary language wording must not be overwritten by the primary label");
// 7. An incomplete SAR example must not hide behind a Collocation heading.
const sarIssue = byEvidence(body1[2]);
assert.ok(["SAR Example Quality", "Example Development"].includes(sarIssue.issueCategory));
assert.equal(sarIssue.revisionType, "Teacher-Guided Expansion");
assert.equal(sarIssue.revisionAlignmentStatus, "aligned");
// The complete model must satisfy the validation contract.
assert.deepEqual(validateFeedbackIntegrity(model, task2Writing), []);

// --- Development diagnosis must reject a language-only revision ---
const languageOnlyRevisionForDevelopment = {
  ...mechanismUnderCountabilityHeading,
  targetedRevision: body2[2].replace("delays spread", "the delays spread"),
  revisionType: "Minimal Correction"
};
const failingModel = buildFeedbackIntegrityModel({
  writing: task2Writing,
  taskType: "Task 2",
  feedbackCards: [languageOnlyRevisionForDevelopment],
  topIssues: []
});
assert.equal(failingModel.issues[0].revisionAlignmentStatus, "requires-regeneration");
const failingFlags = validateFeedbackIntegrity(failingModel, task2Writing);
assert.ok(failingFlags.some((flag) => /unresolved/.test(flag)), "a development diagnosis with a language-only revision must be rejected");

// --- evaluateRevisionAlignment contract ---
const wordSwapOnly = evaluateRevisionAlignment({
  exactSentence: "For example, commuters gather at the same time, resulting in a large traffic congestion.",
  targetedRevision: "For example, commuters gather at the same time, resulting in severe traffic congestion.",
  revisionType: "Minimal Correction",
  repairTargets: ["mechanism", "affected group", "consequence"]
});
assert.equal(wordSwapOnly.pass, false);
assert.ok(wordSwapOnly.unresolvedTargets.includes("mechanism"));

const mislabelledExpansion = evaluateRevisionAlignment({
  exactSentence: "For example, commuters gather at the same time, resulting in a large traffic congestion.",
  targetedRevision: "For example, workers and shoppers converge on the same roads at peak times because destinations are concentrated, so junctions become overloaded and delays spread across the city.",
  revisionType: "Route-Preserving Revision",
  repairTargets: ["mechanism", "affected group", "consequence"]
});
assert.equal(mislabelledExpansion.pass, false);
assert.equal(mislabelledExpansion.revisionAlignmentStatus, "revision-type-mismatch");

const correctlyLabelledExpansion = evaluateRevisionAlignment({
  exactSentence: "For example, commuters gather at the same time, resulting in a large traffic congestion.",
  targetedRevision: "For example, workers and shoppers converge on the same roads at peak times because destinations are concentrated, so junctions become overloaded and delays spread across the city.",
  revisionType: "Teacher-Guided Expansion",
  repairTargets: ["mechanism", "affected group", "consequence"]
});
assert.equal(correctlyLabelledExpansion.pass, true);

// --- Validation contract on stored reports ---
const storedContractModel = {
  issues: [{
    issueId: "issue-contract-1",
    sentenceRole: "explanation",
    issueCategory: "Countability",
    secondaryIssueCategories: [],
    exactEvidence: body1[1],
    paragraphLocation: "Body Paragraph 1, Sentence 2",
    evidenceScope: "single-location",
    evidenceCount: 1,
    evidenceLocations: [{ paragraphLocation: "Body Paragraph 1, Sentence 2", exactEvidence: body1[1] }],
    punctuationClaimValid: true,
    revisionAlignmentStatus: "aligned",
    unresolvedTargets: [],
    diagnosis: "The causal mechanism behind this claim is unclear and the chain is incomplete.",
    whyItLimitsBand: "The causal mechanism behind this claim is unclear and the chain is incomplete."
  }],
  topIssues: [],
  linkage: {}
};
const storedFlags = validateFeedbackIntegrity(storedContractModel, task2Writing);
assert.ok(storedFlags.some((flag) => /development problem/.test(flag)), "a language category with a development diagnosis must be rejected by the contract");

const typeMismatchModel = {
  issues: [{
    ...storedContractModel.issues[0],
    issueCategory: "Causal Mechanism",
    revisionAlignmentStatus: "revision-type-mismatch"
  }],
  topIssues: [],
  linkage: {}
};
assert.ok(validateFeedbackIntegrity(typeMismatchModel, task2Writing).some((flag) => /revision type does not match/.test(flag)));

// --- Body Paragraph Route Alignment display contract ---
const alignedDisplay = projectRouteAlignmentDisplay({
  status: "Strong",
  diagnosis: "Body 1: accessibility (controlled) | Body 2: congestion (controlled)"
});
assert.equal(alignedDisplay.status, "Aligned");
assert.ok(alignedDisplay.diagnosis.includes(ROUTE_ALIGNMENT_SCOPE_NOTE));

const thaiDisplay = projectRouteAlignmentDisplay({ status: "Strong", diagnosis: "Body 1 | Body 2", thai: true });
assert.equal(thaiDisplay.status, "Aligned");
assert.ok(thaiDisplay.diagnosis.includes(ROUTE_ALIGNMENT_SCOPE_NOTE_TH));

const deviatedDisplay = projectRouteAlignmentDisplay({ status: "Needs Work", diagnosis: "Body 2 develops a different reason from the thesis." });
assert.equal(deviatedDisplay.status, "Needs Work", "a real route deviation must not be relabelled as Aligned");

// Aligned route with weak development: alignment label must not imply strong development.
const canonicalDisplay = projectCanonicalTask2Framework({
  routeAssessment: {
    position: "strongly disagree",
    bodyRoutes: [{ index: 1, label: "accessibility" }, { index: 2, label: "congestion" }],
    missingRequirements: [],
    requirements: []
  },
  frameworkAssessment: {
    bodyRouteAlignment: { status: "Strong" },
    explanationDepth: { status: "Moderate" },
    sarExampleQuality: { status: "Moderate" },
    linkBackControl: { status: "Moderate" },
    conclusionClosure: { status: "Strong" },
    lfcCpcControl: { status: "Moderate" }
  },
  taskRequirements: { stanceRequired: true },
  metadata: { essayTypeLabel: "Opinion Essay" }
});
assert.equal(canonicalDisplay["Body Paragraph Route Alignment"].status, "Aligned");
assert.match(canonicalDisplay["Body Paragraph Route Alignment"].diagnosis, /route alignment only/i);
assert.equal(canonicalDisplay["Explanation Depth"].status, "Moderate");

const deviatedCanonical = projectCanonicalTask2Framework({
  routeAssessment: { position: "strongly disagree", bodyRoutes: [], missingRequirements: [], requirements: [] },
  frameworkAssessment: { bodyRouteAlignment: { status: "Needs Work" } },
  taskRequirements: { stanceRequired: true },
  metadata: { essayTypeLabel: "Opinion Essay" }
});
assert.equal(deviatedCanonical["Body Paragraph Route Alignment"].status, "Needs Work");

// --- Renderer keeps working layout and recognises the Aligned badge ---
const scriptSource = await readFile(new URL("../script.js", import.meta.url), "utf8");
assert.match(scriptSource, /Paragraph Coverage Summary/);
assert.match(scriptSource, /normalized === "aligned"/);
assert.match(scriptSource, /Aligned: "สอดคล้อง"/);

console.log("V12.3.2 taxonomy-diagnosis consistency, primary/secondary separation, revision-fidelity contract, and Aligned route-alignment display passed.");
