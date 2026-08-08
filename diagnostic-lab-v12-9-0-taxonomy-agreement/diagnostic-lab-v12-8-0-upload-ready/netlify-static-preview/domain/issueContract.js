import { validateSentenceCompleteness } from "./sentenceCompleteness.js";

const ASSERTION_CATEGORIES = Object.freeze({
  punctuation_spacing: new Set(["Punctuation"]),
  sentence_fragment: new Set(["Sentence Completion"]),
  countability: new Set(["Countability"]),
  article: new Set(["Article Control"]),
  lexical_meaning: new Set(["Lexical Precision", "Meaning Control", "Word Choice"]),
  collocation: new Set(["Collocation", "Lexical Precision"]),
  word_form: new Set(["Word Form"]),
  reference: new Set(["Reference Control", "Pronoun Control"]),
  tense: new Set(["Tense Control"]),
  agreement: new Set(["Subject-Verb Agreement", "Subject–Verb Agreement", "Agreement"]),
  preposition: new Set(["Preposition Control"]),
  grammar: new Set(["Grammar and Sentence Control"]),
  causal_gap: new Set(["Causal Mechanism", "Solution Mechanism"]),
  example_scope: new Set(["Example Development", "SAR Example Quality"]),
  route_gap: new Set(["Thesis Route Clarity", "Cause Route Clarity", "Solution Route Clarity", "Body Route Alignment"]),
  task_coverage: new Set(["Prompt Coverage"]),
  data_error: new Set(["Data Accuracy", "Magnitude Precision"]),
  overview_error: new Set(["Overview Quality", "Overview Accuracy"]),
  // Task 1 uses Comparison Precision for visual comparisons. In Task 2, an omitted or
  // underdeveloped outweigh judgement is a genuine Prompt Coverage defect, so the same
  // evidence assertion is valid under that task-level category as well.
  comparison_error: new Set(["Comparison Precision", "Prompt Coverage"]),
  process_sequence: new Set(["Process Sequence", "Process Endpoint"]),
  map_change: new Set(["Map Change Accuracy"]),
  visual_type_mismatch: new Set(["Visual Understanding", "Introduction Precision"])
});

const LOCAL_MINIMAL_ASSERTIONS = new Set([
  "punctuation_spacing", "countability", "article", "agreement"
]);
const DEVELOPMENT_CATEGORIES = new Set(["Causal Mechanism", "Solution Mechanism", "Explanation Depth", "Example Development", "SAR Example Quality"]);
const LANGUAGE_CATEGORIES = new Set([
  "Lexical Precision", "Meaning Control", "Word Choice", "Collocation", "Word Form", "Reference Control",
  "Pronoun Control", "Countability", "Article Control", "Preposition Control", "Tense Control",
  "Subject-Verb Agreement", "Subject–Verb Agreement", "Agreement", "Grammar and Sentence Control",
  "Sentence Completion", "Punctuation"
]);

export const ISSUE_ALIGNMENT_VALIDATOR_VERSION = "canonical-issue-alignment-v12.8.0";

export function validateCanonicalIssueAlignment(issue = {}) {
  const problems = [];
  const assertion = issue.evidenceAssertion || {};
  const assertionType = String(assertion.assertionType || issue.evidenceAssertionType || "");
  const category = String(issue.issueCategory || issue.primaryCategory || "");
  const diagnosis = normalize([issue.diagnosis, issue.kruPomDiagnosis, issue.whyItLimitsBand].filter(Boolean).join(" "));
  const action = normalize(issue.studentAction);
  const revision = String(issue.targetedRevision || "");
  const revisionType = String(issue.revisionType || "");
  const allowedCategories = ASSERTION_CATEGORIES[assertionType];
  const localMinimalRepair = LOCAL_MINIMAL_ASSERTIONS.has(assertionType);

  if (allowedCategories && !allowedCategories.has(category)) {
    problems.push(`Assertion ${assertionType} is incompatible with category ${category}.`);
  }
  if (LANGUAGE_CATEGORIES.has(category) && describesMissingDevelopment(diagnosis)) {
    problems.push(`${category} diagnosis describes a missing development mechanism.`);
  }
  if (DEVELOPMENT_CATEGORIES.has(category) && describesOnlyLanguageRepair(diagnosis)) {
    problems.push(`${category} diagnosis describes only a language repair.`);
  }
  if (!actionMatchesCategory(category, action)) {
    problems.push(`Student Action does not teach the ${category} repair.`);
  }
  if (localMinimalRepair && !["Minimal Correction", "Revision Unavailable"].includes(revisionType)) {
    problems.push(`${assertionType} requires a Minimal Correction.`);
  }
  if (localMinimalRepair && revisionType !== "Revision Unavailable" && assertion.correctedSpan &&
    !normalize(revision).includes(normalize(assertion.correctedSpan))) {
    problems.push(`Targeted Revision does not contain the validated ${assertionType} correction.`);
  }
  if (assertionType === "sentence_fragment" && revisionType !== "Revision Unavailable" &&
    !validateSentenceCompleteness(revision).complete) {
    problems.push("Fragment revision is not a complete independent sentence.");
  }
  if (DEVELOPMENT_CATEGORIES.has(category) && revisionType === "Minimal Correction") {
    problems.push(`${category} cannot be repaired by a Minimal Correction.`);
  }

  return {
    pass: problems.length === 0,
    problems,
    validatorVersion: ISSUE_ALIGNMENT_VALIDATOR_VERSION
  };
}

function actionMatchesCategory(category, action) {
  if (!action) return false;
  if (category === "Punctuation") return /\bspace|punctuation|full stop|period|comma\b/.test(action);
  if (category === "Countability") return /\buncountable|countability|article|remove|singular\b/.test(action);
  if (category === "Article Control") return /\barticle|a an|determiner|change\b/.test(action);
  if (category === "Sentence Completion") return /\bcomplete sentence|independent|main clause|finite main verb\b/.test(action);
  if (["Lexical Precision", "Meaning Control", "Word Choice", "Collocation", "Word Form"].includes(category)) {
    return /\breplace|precise|meaning|word|term|collocation|form\b/.test(action);
  }
  if (["Reference Control", "Pronoun Control"].includes(category)) return /\breference|pronoun|explicit noun|replace\b/.test(action);
  if (["Causal Mechanism", "Solution Mechanism", "Explanation Depth"].includes(category)) {
    return /\bchain|mechanism|cause|effect|result|outcome|how|implementation|behavio/.test(action);
  }
  if (["Example Development", "SAR Example Quality"].includes(category)) {
    return /\bexample|situation|action|result|consequence|supports?\b/.test(action);
  }
  if (["Visual Understanding", "Introduction Precision"].includes(category)) {
    return /\bvisual|chart|graph|map|diagram|process|subject|metric|measurement|group|time period|timeframe|intro checklist\b/.test(action);
  }
  return action.length >= 12;
}

function describesMissingDevelopment(value) {
  return /\b(?:response|behavio(?:u)?r|mechanism|chain|consequence|result|outcome|intermediate step)\b.{0,70}\b(?:missing|absent|not shown|not explained|incomplete|unclear)\b|\b(?:missing|absent|incomplete)\b.{0,70}\b(?:mechanism|chain|consequence|result|outcome)\b/.test(value);
}

function describesOnlyLanguageRepair(value) {
  const language = /\b(?:awkward|wording|word choice|term|pronoun|reference|collocation|article|uncountable|punctuation|agreement|grammar)\b/.test(value);
  return language && !describesMissingDevelopment(value) &&
    !/\b(?:wider consequence|causal|implementation|behavio(?:u)?ral change|support the claim|development)\b/.test(value);
}

function normalize(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, " ").trim();
}
