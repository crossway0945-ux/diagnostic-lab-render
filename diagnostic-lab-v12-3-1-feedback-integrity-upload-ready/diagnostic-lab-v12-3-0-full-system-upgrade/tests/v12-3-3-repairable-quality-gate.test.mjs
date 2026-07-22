import assert from "node:assert/strict";
import {
  auditFeedbackIntegrity,
  buildFeedbackIntegrityModel,
  validateFeedbackIntegrity
} from "../domain/feedbackIntegrity.js";
import { segmentStudentResponse } from "../domain/paragraphEvidence.js";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";

assert.equal(ANALYSIS_VERSIONS.appVersion, "12.3.6");

const zoningPrompt = [
  "Towns and cities should be divided into zones so that all the schools are in one area, all the shopping malls are located together and all the industrial sites are situated close to each other.",
  "To what extent do you agree that urban areas should be split into distinct zones?"
].join("\n\n");

const zoningWriting = [
  "Some people may argue that towns and cities should be separated into zones, so all the same places are in the same area. However, I strongly disagree with the statement due to the lack of travel accessibility and traffic congestion.",
  "First of all, the clusterization of a specific place could lead to the difficulty of traveling. Every family is living in different places and distances, which could be very far away from their house, so it would be very difficult to travel through long distance. For instance, a student's house is very far away from his school, and it takes 3 hours to arrive there, so he needs to wake up at 5AM every morning, which lowers his energy and concentration in the class, resulting in bad grades. Therefore, when a certain place is clustered in one area, some people might encounter an issue of traveling,",
  "Furthermore, there would be more traffic congestion when a specific place is divided into a zone. Some places attract more people in some period of time, which could create a heavy traffic jam. For example, restaurants or shopping malls attract more people at breakfast, lunch, and dinner time; hence, people will be moving in the same direction at the same time, resulting in a large traffic congestion.",
  "In conclusion, I firmly believe that specific places like towns and cities should not be divided into zones, thus all the same places are in one area, since this could contribute to the difficulty in traveling and the congestion of traffic."
].join("\n\n");

const paragraphs = segmentStudentResponse(zoningWriting, "Task 2");
const body1 = paragraphs[1].sentences.map((item) => item.exactText);
const body2 = paragraphs[2].sentences.map((item) => item.exactText);

// --- Provider-shaped cards that previously made the whole report fatal ---
// 1. Development diagnosis delivered under a language heading with a language-only revision.
const developmentUnderLanguageHeading = {
  issueType: "Countability",
  issueCategory: "Countability",
  severity: "Moderate",
  criteria: ["Task Response"],
  framework: ["SAR Example Quality"],
  paragraphLocation: "Body Paragraph 2, Sentence 3",
  exactSentence: body2[2],
  whyItLimitsBand: "The causal mechanism is incomplete and the affected group is unclear, so the example does not prove the congestion claim.",
  kruPomDiagnosis: "Complete the causal chain from concentrated destinations to congestion.",
  targetedRevision: body2[2].replace("a large traffic congestion", "severe traffic congestion"),
  revisionType: "Minimal Correction",
  whyRevisionIsStronger: "The collocation is now natural.",
  studentAction: "Fix the collocation."
};

// 2. A real analytical expansion mislabelled as a route-preserving revision.
const expansionMislabelled = {
  issueType: "Example Development",
  issueCategory: "Example Development",
  severity: "Moderate",
  criteria: ["Task Response"],
  framework: ["SAR Example Quality"],
  paragraphLocation: "Body Paragraph 1, Sentence 3",
  exactSentence: body1[2],
  whyItLimitsBand: "The example is too narrow and the wider consequence is not stated.",
  kruPomDiagnosis: "Broaden the affected group and show the consequence.",
  targetedRevision: `${body1[2]} This matters because zoning places schools far from many homes, so students across the city lose rest and study time while parents lose productive hours.`,
  revisionType: "Route-Preserving Revision",
  whyRevisionIsStronger: "It shows the wider group and the consequence.",
  studentAction: "Broaden the affected group."
};

// 3. A primary category duplicated into the secondary list.
const duplicatedSecondary = {
  issueType: "Collocation",
  issueCategory: "Collocation",
  secondaryIssueCategories: ["Collocation"],
  severity: "Minor Repair",
  criteria: ["Lexical Resource"],
  framework: ["Vocabulary Precision"],
  paragraphLocation: "Body Paragraph 1, Sentence 1",
  exactSentence: body1[0],
  whyItLimitsBand: "The noun and preposition combination is unnatural.",
  kruPomDiagnosis: "Use a natural noun-preposition pairing.",
  targetedRevision: "First of all, the concentration of a particular facility could lead to difficulty travelling.",
  revisionType: "Minimal Correction",
  whyRevisionIsStronger: "The pairing is now natural.",
  studentAction: "Check noun-preposition pairings."
};

const model = buildFeedbackIntegrityModel({
  writing: zoningWriting,
  taskType: "Task 2",
  feedbackCards: [developmentUnderLanguageHeading, expansionMislabelled, duplicatedSecondary],
  topIssues: [developmentUnderLanguageHeading]
});

// The gate must let the report through: no fatal findings at all.
assert.deepEqual(validateFeedbackIntegrity(model, zoningWriting), [], "repairable defects must never block a report");

const audit = auditFeedbackIntegrity(model, zoningWriting);
assert.equal(audit.filter((finding) => finding.severity === "fatal").length, 0);

const byLocation = (location) => model.issues.find((issue) => issue.paragraphLocation === location);

// Repair 1: the development diagnosis wins the heading, the language label survives as secondary,
// and the shortfall is disclosed rather than silently claimed as repaired.
const developmentIssue = byLocation("Body Paragraph 2, Sentence 3");
assert.ok(["Causal Mechanism", "Example Development", "SAR Example Quality", "Explanation Depth"].includes(developmentIssue.issueCategory));
assert.ok(developmentIssue.secondaryIssueCategories.includes("Countability"));
assert.ok(!developmentIssue.secondaryIssueCategories.includes(developmentIssue.issueCategory));
assert.equal(developmentIssue.revisionAlignmentStatus, "partial-repair");
assert.ok(developmentIssue.unresolvedTargets.length > 0);
assert.match(developmentIssue.revisionLimitationNote, /still require your own rewrite/i);
assert.match(developmentIssue.whyRevisionIsStronger, /still require your own rewrite/i);
assert.ok(
  developmentIssue.integrityRepairs.some((repair) => repair.code === "REVISION_TARGETS_UNRESOLVED" && repair.disclosed === true),
  "an unresolved development target must be recorded as a disclosed repair"
);

// Repair 2: an analytical expansion is relabelled, not rejected, and the student-facing text is untouched.
const expansionIssue = byLocation("Body Paragraph 1, Sentence 3");
assert.equal(expansionIssue.revisionType, "Teacher-Guided Expansion");
assert.equal(expansionIssue.revisionAlignmentStatus, "aligned");
assert.equal(expansionIssue.targetedRevision, expansionMislabelled.targetedRevision, "relabelling must not rewrite the revision");

// Repair 3: the duplicated secondary category is removed.
const collocationIssue = byLocation("Body Paragraph 1, Sentence 1");
assert.ok(!collocationIssue.secondaryIssueCategories.includes(collocationIssue.issueCategory));

// The repair log is available for QA without being a blocking condition.
// Defects resolved at classification time are not logged as repairs, so the log records
// only what had to be corrected after the card was rendered.
assert.ok(model.repairs.length >= 1);
assert.ok(model.repairs.every((repair) => repair.issueId && repair.code));
assert.ok(model.repairs.some((repair) => repair.code === "REVISION_TARGETS_UNRESOLVED"));

// --- Fatal findings must still block ---
const fabricatedEvidenceModel = {
  issues: [{
    issueId: "issue-fabricated",
    sentenceRole: "explanation",
    issueCategory: "Collocation",
    secondaryIssueCategories: [],
    exactEvidence: "The student never wrote this sentence at all.",
    paragraphLocation: "Body Paragraph 1, Sentence 1",
    evidenceScope: "single-location",
    evidenceCount: 1,
    evidenceLocations: [{ paragraphLocation: "Body Paragraph 1, Sentence 1", exactEvidence: "The student never wrote this sentence at all." }],
    punctuationClaimValid: true,
    revisionAlignmentStatus: "aligned",
    unresolvedTargets: [],
    diagnosis: "The wording is unnatural.",
    whyItLimitsBand: "The wording is unnatural."
  }],
  topIssues: [],
  linkage: {}
};
const fabricatedFlags = validateFeedbackIntegrity(fabricatedEvidenceModel, zoningWriting);
assert.equal(fabricatedFlags.length, 1);
assert.match(fabricatedFlags[0], /evidence is not present in the writing/i);

const brokenSchemaModel = {
  issues: [{
    ...fabricatedEvidenceModel.issues[0],
    exactEvidence: body1[0],
    evidenceLocations: [{ paragraphLocation: "Body Paragraph 1, Sentence 1", exactEvidence: body1[0] }],
    issueCategory: "Not A Real Category",
    sentenceRole: "not_a_real_role"
  }],
  topIssues: [],
  linkage: {}
};
const schemaFlags = validateFeedbackIntegrity(brokenSchemaModel, zoningWriting);
assert.ok(schemaFlags.some((flag) => /invalid sentence role/i.test(flag)));
assert.ok(schemaFlags.some((flag) => /invalid issue category/i.test(flag)));

// --- End-to-end: a full analysis must produce a saved report, not a blocked one ---
const report = await analyzeWriting({
  taskType: "Task 2",
  essayType: "Opinion Essay",
  prompt: zoningPrompt,
  writing: zoningWriting,
  targetBand: "7.0",
  reportLanguage: "en"
});
assert.deepEqual(report.feedbackIntegrityValidationIssues, []);
assert.ok(report.feedbackCards.length > 0);
assert.equal(report.estimatedBandRange, "6.0-6.5", "the repairable gate must not change scoring");
assert.ok(Array.isArray(report.feedbackIntegrityRepairs));

// Thai reports must disclose the same limitation in Thai.
const thaiModel = buildFeedbackIntegrityModel({
  writing: zoningWriting,
  taskType: "Task 2",
  reportLanguage: "th",
  feedbackCards: [developmentUnderLanguageHeading],
  topIssues: []
});
assert.match(thaiModel.issues[0].revisionLimitationNote, /ยังต้องให้นักเรียนเขียนขยายเอง/);
assert.deepEqual(validateFeedbackIntegrity(thaiModel, zoningWriting), []);

console.log("V12.3.5 repairable quality gate: self-repairing canonical issues, honest revision disclosure, fatal-only blocking and end-to-end report delivery passed.");
