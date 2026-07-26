import { validateCanonicalIssueAlignment } from "./issueContract.js";

const CATEGORY_CLAIMS = Object.freeze({
  spelling: ["Spelling"],
  punctuation: ["Punctuation"],
  article: ["Article Control", "Countability"],
  articles: ["Article Control", "Countability"],
  agreement: ["Subject-Verb Agreement", "Agreement"],
  grammar: ["Grammar and Sentence Control", "Sentence Completion", "Subject-Verb Agreement", "Agreement", "Article Control", "Countability", "Preposition Control", "Tense Control", "Punctuation"],
  vocabulary: ["Lexical Precision", "Word Choice", "Word Form", "Collocation", "Meaning Control"],
  lexical: ["Lexical Precision", "Word Choice", "Word Form", "Collocation", "Meaning Control"],
  collocation: ["Collocation"],
  countability: ["Countability"],
  mechanism: ["Causal Mechanism", "Solution Mechanism"],
  example: ["Example Development", "SAR Example Quality"],
  closure: ["Paragraph Closure", "Conclusion Closure", "Sentence Completion"],
  thesis: ["Thesis Route Clarity", "Cause Route Clarity", "Solution Route Clarity", "Position Clarity"],
  route: ["Thesis Route Clarity", "Cause Route Clarity", "Solution Route Clarity", "Body Route Alignment", "Prompt Coverage"],
  overview: ["Overview Quality", "Overview Accuracy"],
  data: ["Data Accuracy", "Data Selection", "Comparison Precision", "Magnitude Precision"]
});

const PRIORITY_ORDER = Object.freeze([
  "Visual Understanding", "Sentence Completion", "Prompt Coverage", "Overview Accuracy", "Overview Quality", "Data Accuracy",
  "Position Clarity", "Thesis Route Clarity", "Cause Route Clarity", "Solution Route Clarity",
  "Body Route Alignment", "Causal Mechanism", "Solution Mechanism", "Explanation Depth",
  "Example Development", "SAR Example Quality", "Meaning Control", "Lexical Precision",
  "Grammar and Sentence Control", "Countability", "Article Control",
  "Subject-Verb Agreement", "Agreement", "Collocation", "Word Choice", "Punctuation"
]);

export function reconcileExecutiveSummary({
  mainScoreLimitingFactor = "",
  mostUrgentRepair = "",
  issues = [],
  topIssueIds = []
} = {}) {
  const byId = new Map(issues.map((issue) => [issue.issueId, issue]));
  const top = topIssueIds.map((id) => byId.get(id)).filter(Boolean);
  const ranked = rankIssues(top.length ? top : issues);
  const unsupportedMain = unsupportedSummaryClaims(mainScoreLimitingFactor, issues);
  const unsupportedUrgent = unsupportedSummaryClaims(mostUrgentRepair, issues);
  const main = unsupportedMain.length || !String(mainScoreLimitingFactor || "").trim()
    ? buildMainScoreLimiter(ranked)
    : String(mainScoreLimitingFactor).trim();
  const urgent = unsupportedUrgent.length || !String(mostUrgentRepair || "").trim()
    ? buildUrgentRepair(ranked)
    : String(mostUrgentRepair).trim();
  return {
    mainScoreLimitingFactor: main,
    mostUrgentRepair: urgent,
    mainIssueIds: ranked.slice(0, 3).map((issue) => issue.issueId),
    urgentIssueIds: ranked.slice(0, 2).map((issue) => issue.issueId),
    repairedClaims: [
      ...unsupportedMain.map((claim) => ({ section: "mainScoreLimitingFactor", claim })),
      ...unsupportedUrgent.map((claim) => ({ section: "mostUrgentRepair", claim }))
    ]
  };
}

export function unsupportedSummaryClaims(text = "", issues = []) {
  const value = normalize(text);
  if (!value) return [];
  const categories = new Set(issues.flatMap((issue) => [issue.issueCategory, ...(issue.secondaryIssueCategories || [])]));
  const unsupported = [];
  for (const [claim, supportedCategories] of Object.entries(CATEGORY_CLAIMS)) {
    const pattern = new RegExp(`\\b${escapeRegExp(claim)}(?:s|ing)?\\b`, "i");
    const match = pattern.exec(value);
    if (!match) continue;
    const context = value.slice(Math.max(0, match.index - 55), Math.min(value.length, match.index + match[0].length + 55));
    if (/\b(?:controlled|aligned|clear|strong|present|secure|preserv(?:e|ed)|maintain|keep|same|existing|not (?:a |an )?(?:problem|issue|limiter|weakness)|no (?:serious|material|major))\b/.test(context)) continue;
    if (!supportedCategories.some((category) => categories.has(category))) unsupported.push(claim);
  }
  if (/\brecurr(?:ing|ent|ence)|repeated|throughout\b/i.test(text) && !issues.some((issue) => Number(issue.evidenceCount || 1) > 1)) {
    unsupported.push("recurring");
  }
  return [...new Set(unsupported)];
}

export function auditReportConsistency(model = {}) {
  const findings = [];
  const issues = Array.isArray(model.issues) ? model.issues : [];
  const byId = new Map(issues.map((issue) => [issue.issueId, issue]));
  for (const claim of unsupportedSummaryClaims(model.linkage?.mainScoreLimitingFactor, issues)) {
    findings.push(repairable("SUMMARY_CLAIM_UNSUPPORTED", `Main Score-Limiting Factor names unsupported claim "${claim}".`));
  }
  for (const claim of unsupportedSummaryClaims(model.linkage?.mostUrgentRepair, issues)) {
    findings.push(repairable("URGENT_REPAIR_UNSUPPORTED", `Most Urgent Repair names unsupported claim "${claim}".`));
  }
  for (const topIssue of model.topIssues || []) {
    if (!byId.has(topIssue.issueId)) findings.push(fatal("TOP_ISSUE_UNLINKED", `Top issue ${topIssue.issueId} is not present in Detailed Feedback.`));
  }
  for (const paragraph of model.paragraphCoverage || []) {
    const paragraphIssues = (paragraph.issueIds || []).map((id) => byId.get(id)).filter(Boolean);
    if (paragraph.priorityIssueId && !paragraphIssues.some((issue) => issue.issueId === paragraph.priorityIssueId)) {
      findings.push(fatal("PARAGRAPH_PRIORITY_UNLINKED", `${paragraph.paragraphLabel} priority repair is not linked to a paragraph issue.`));
    }
    if (!paragraphIssues.length && /repair needed|critical|weak|incomplete/i.test(String(paragraph.status || ""))) {
      findings.push(repairable("PARAGRAPH_STATUS_UNSUPPORTED", `${paragraph.paragraphLabel} has a negative status without a canonical issue.`));
    }
  }
  for (const issue of issues) {
    if (issue.evidenceValidationStatus !== "validated") findings.push(fatal("ISSUE_EVIDENCE_UNVALIDATED", `Issue ${issue.issueId} has no validated evidence assertion.`));
    if (!issue.studentActionValidation?.pass) findings.push(repairable("STUDENT_ACTION_UNSPECIFIC", `Issue ${issue.issueId} Student Action does not match its local diagnosis.`));
    const alignment = validateCanonicalIssueAlignment(issue);
    for (const problem of alignment.problems) {
      findings.push(fatal("ISSUE_CONTRACT_MISMATCH", `Issue ${issue.issueId}: ${problem}`));
    }
  }
  for (const [name, item] of Object.entries(model.frameworkScores || {})) {
    const compatibility = validateStatusExplanationCompatibility({
      name,
      status: item?.status,
      explanation: item?.diagnosis || item?.explanation
    });
    for (const problem of compatibility.problems) {
      findings.push(fatal("STATUS_EXPLANATION_CONTRADICTION", problem));
    }
  }
  const route = model.routeAssessment || {};
  const routeFailed = ["absent", "contradicted"].includes(String(route.status || route.overallRouteStatus || ""));
  const routeControlled = ["adequately_developed", "fully_extended"].includes(String(route.status || route.overallRouteStatus || ""));
  const trHigh = bandHigh(model.criteriaScores?.["Task Response"]?.range);
  if (routeFailed && Number.isFinite(trHigh) && trHigh > 5.5) {
    findings.push(fatal("ROUTE_SCORE_CONTRADICTION", "Task Response exceeds the route-failure ceiling recorded by the canonical route assessment."));
  }
  if (routeControlled && Number.isFinite(trHigh) && trHigh <= 5.5 && !(route.missingRequirements || []).length) {
    findings.push(repairable("CONTROLLED_ROUTE_SCORE_UNEXPLAINED", "Task Response is at or below 5.5 even though the canonical route is controlled and no missing requirement is recorded."));
  }
  const bodyRouteStatus = String(model.frameworkScores?.["Body Paragraph Route Alignment"]?.status || model.frameworkScores?.bodyRouteAlignment?.status || "");
  if (routeFailed && /strong/i.test(bodyRouteStatus)) {
    findings.push(fatal("ROUTE_FRAMEWORK_CONTRADICTION", "Body Route Alignment is Strong while the canonical route assessment is failed."));
  }
  const conclusionStatus = String(model.frameworkScores?.["Conclusion Closure"]?.status || model.frameworkScores?.conclusionClosure?.status || "");
  if (routeFailed && /strong/i.test(conclusionStatus)) {
    findings.push(fatal("ROUTE_CONCLUSION_CONTRADICTION", "Conclusion Closure is Strong while a required canonical route is absent or contradicted."));
  }
  return findings;
}

export function validateStatusExplanationCompatibility({ name = "", status = "", explanation = "" } = {}) {
  const state = normalize(status);
  const text = normalize(explanation)
    .replace(/\bit does not mean that [^.]+/g, " ")
    .replace(/\bthis rating assesses route alignment only\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const problems = [];
  if (!state || !text) return { pass: true, problems };
  const negativeRoute =
    /\b(?:route|position|thesis|prompt|requirement|coverage)\b.{0,55}\b(?:missing|absent|unclear|contradict(?:ory|ed)?|not shown|incomplete|repair needed|needs? work)\b/.test(text) ||
    /\b(?:missing|absent|unclear|contradict(?:ory|ed)?|not shown|incomplete)\b.{0,55}\b(?:route|position|thesis|prompt|requirement|coverage)\b/.test(text) ||
    // Allow up to two adverbs between the negation and the verb, so "does not YET establish",
    // "does not CLEARLY establish", "fails to FULLY cover" are all caught (they slipped past before).
    /\b(?:does not|doesn t|fails? to)\s+(?:\w+\s+){0,2}(?:establish|state|cover|align|trace|present|include)\b.{0,55}\b(?:route|position|thesis|prompt|requirement|judgement)\b/.test(text);
  const languageDefect = /\b(?:fragment|grammar|lexical|collocation|reference|pronoun|agreement|punctuation|countability|language repair)\b/.test(text);
  if (/\bstrong\b/.test(state) && negativeRoute) {
    problems.push(`${name || "Framework status"} is Strong but its explanation describes a missing, unclear or contradictory requirement.`);
  }
  if (/\b(?:aligned|controlled)\b/.test(state) && negativeRoute) {
    problems.push(`${name || "Framework status"} is ${status} but its explanation describes a missing or uncontrolled requirement.`);
  }
  if (/\blanguage controlled\b/.test(state) && languageDefect) {
    problems.push(`${name || "Framework status"} says Language Controlled while its explanation names a language defect.`);
  }
  if (/\bno priority repair\b/.test(state) && /\b(?:repair|error|inaccurate|imprecise|weak)\b/.test(text)) {
    problems.push(`${name || "Framework status"} says No Priority Repair while its explanation names a repair need.`);
  }
  return { pass: problems.length === 0, problems };
}

// A status-consistent explanation used to repair a contradictory framework diagnosis. The status is
// authoritative (brief §5, §8: do not change scores to fix feedback), so a positive status whose
// explanation describes a missing/uncontrolled requirement gets a status-appropriate, non-fabricating
// replacement that points the student to the detailed feedback for any specifics.
function statusCompatibleExplanation(name, status) {
  const s = normalize(status);
  const dim = String(name || "This dimension");
  if (/\bstrong\b/.test(s)) return `${dim} meets the required standard for this task; any remaining refinement is shown in the detailed feedback below.`;
  if (/\baligned\b/.test(s)) return `${dim} is present and correctly ordered; development, examples and language are assessed separately in the detailed feedback below.`;
  if (/\bcontrolled\b/.test(s)) return `${dim} is controlled; any specific refinement appears in the detailed feedback below.`;
  if (/\bno priority repair\b/.test(s)) return `${dim} has no priority repair; minor polish, if any, is noted in the detailed feedback below.`;
  return "";
}

// Enforced final cross-section consistency gate over the fully assembled student view model (brief §4,
// §5). Deterministic, local repairs from the frozen statuses — never rerun scoring. Currently repairs
// framework status↔explanation contradictions in place (keeps the {status, diagnosis} shape). Returns
// the repaired view model and the list of repairs applied (for the safe operational log).
export function enforceViewModelConsistency(viewModel = {}) {
  const repairs = [];
  const framework = viewModel.frameworkBreakdown;
  if (framework && typeof framework === "object") {
    for (const [name, item] of Object.entries(framework)) {
      if (!item || typeof item !== "object") continue;
      const check = validateStatusExplanationCompatibility({ name, status: item.status, explanation: item.diagnosis });
      if (check.pass) continue;
      const replacement = statusCompatibleExplanation(name, item.status);
      if (!replacement) continue;
      repairs.push({ section: "frameworkBreakdown", name, code: "STATUS_EXPLANATION_CONTRADICTION" });
      item.diagnosis = replacement;
    }
  }
  // Paragraph Coverage: the multi-dimension status string and the structured `dimensions` object must
  // agree (brief §13). If either says a dimension needs repair, the conservative reading wins — a
  // "Development Controlled" label must never hide a "development: repair-needed" dimension.
  for (const paragraph of Array.isArray(viewModel.paragraphCoverage) ? viewModel.paragraphCoverage : []) {
    const reconciled = reconcileParagraphCoverage(paragraph);
    if (reconciled) repairs.push({ section: "paragraphCoverage", name: paragraph.paragraphLabel, code: "PARAGRAPH_STATUS_DIMENSION_CONTRADICTION" });
  }
  return { viewModel, repairs };
}

// Rebuild a paragraph's multi-dimension status string from the conservative union of its status string
// and its dimensions object, and sync `dimensions` to match. Only touches the dash-format Body status
// (never the "Strong"/"Functionally Strong" Introduction/Conclusion form). Returns true if it changed.
function reconcileParagraphCoverage(paragraph) {
  if (!paragraph || typeof paragraph !== "object") return false;
  const dims = paragraph.dimensions;
  const status = String(paragraph.status || "");
  if (!dims || typeof dims !== "object" || !status.includes(" - ")) return false;
  const needs = (dimKey, label) => dims[dimKey] === "repair-needed" || new RegExp(`${label} Repair Needed`).test(status);
  const flags = {
    route: needs("route", "Route"),
    development: needs("development", "Development"),
    example: needs("example", "Example/SAR"),
    language: needs("language", "Language")
  };
  const rebuilt = [
    flags.route ? "Route Repair Needed" : "Route Aligned",
    flags.development ? "Development Repair Needed" : "Development Controlled",
    flags.example ? "Example/SAR Repair Needed" : "Example/SAR Controlled",
    flags.language ? "Language Repair Needed" : "Language Controlled"
  ].join(" - ");
  const dimsAgree = ["route", "development", "example", "language"].every((k) => dims[k] === (flags[k] ? "repair-needed" : "controlled"));
  if (rebuilt === status && dimsAgree) return false;
  paragraph.status = rebuilt;
  for (const k of ["route", "development", "example", "language"]) dims[k] = flags[k] ? "repair-needed" : "controlled";
  return true;
}

export function paragraphDimensionStatus(issues = [], paragraphRole = "", conclusionFunction = null) {
  const categories = new Set(issues.flatMap((issue) => [
    issue.issueCategory,
    ...(issue.secondaryIssueCategories || []),
    ...(issue.secondaryCategories || [])
  ].filter(Boolean)));
  const route = categories.has("Body Route Alignment") || categories.has("Thesis Route Clarity")
    ? "Route Repair Needed"
    : "Route Aligned";
  const development = [...categories].some((category) => ["Causal Mechanism", "Solution Mechanism", "Explanation Depth"].includes(category))
    ? "Development Repair Needed"
    : "Development Controlled";
  const example = [...categories].some((category) => ["Example Development", "SAR Example Quality"].includes(category)) ||
    issues.some((issue) => issue.sentenceRole === "example" && ["Causal Mechanism", "Solution Mechanism", "Sentence Completion"].includes(issue.issueCategory))
    ? "Example/SAR Repair Needed"
    : "Example/SAR Controlled";
  const language = [...categories].some((category) => /Lexical|Word|Collocation|Meaning|Grammar|Sentence|Agreement|Article|Countability|Reference|Pronoun|Tense|Preposition|Punctuation|Modal/.test(category))
    ? "Language Repair Needed"
    : "Language Controlled";
  if (/Conclusion/.test(paragraphRole) && conclusionFunction?.complete) {
    return language === "Language Repair Needed"
      ? "Functionally Strong — Language Repair Needed"
      : "Functionally Strong";
  }
  return `${route} - ${development} - ${example} - ${language}`;
}

export function buildEvidenceBasedRepairPlan(issues = [], reportLanguage = "en", requiredDays = 7, context = {}) {
  const ranked = rankIssues(issues).filter((issue) => issue.severity !== "Pass / Strong");
  const unique = [];
  const seen = new Set();
  for (const issue of ranked) {
    const key = `${issue.issueCategory}|${issue.paragraphId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(issue);
    if (unique.length >= 7) break;
  }
  const thai = String(reportLanguage).toLowerCase() === "th";
  if (!unique.length) {
    const checks = controlledReviewChecks(context);
    return checks.slice(0, requiredDays).map((task, index) => ({
      day: index + 1,
      issueId: "",
      title: thai ? `ตรวจสอบงานที่ผ่านเกณฑ์ วันที่ ${index + 1}` : `Controlled review ${index + 1}`,
      task,
      source: "canonical-no-defect-review"
    }));
  }
  return Array.from({ length: requiredDays }, (_, index) => {
    const issue = unique[index % unique.length];
    const activity = repairActivityForIssue(issue, index % requiredDays, context);
    return {
      day: index + 1,
      issueId: issue.issueId,
      title: thai ? `${activity.phase}: ${issue.issueCategory}` : `${activity.phase}: ${issue.issueCategory}`,
      task: activity.task,
      source: "canonical-issue-graph"
    };
  });
}

function repairActivityForIssue(issue = {}, phaseIndex = 0, context = {}) {
  const category = String(issue.issueCategory || "");
  const location = String(issue.paragraphLabel || issue.paragraphLocation || "the quoted sentence");
  const action = String(issue.studentAction || "Repair the identified point in the quoted sentence.");
  const family = repairActivityFamily(category);
  const tasks = {
    punctuation: [
      ["Notice the pattern", `Read the quoted sentence from ${location}. Circle the punctuation mark where spacing is missing.`],
      ["Practise the rule", "Write three sentence pairs with a full stop followed by one space and a capital letter."],
      ["Repair the sentence", action],
      ["Check the same pattern", `Scan ${location} only for missing or extra spaces around punctuation marks; do not add new ideas.`],
      ["Transfer the rule", "Write two new sentences on another topic and check punctuation spacing before reading them aloud."],
      ["Proofread boundaries", `Re-read ${location} and mark each sentence boundary with a slash to confirm the spacing is visible.`],
      ["Final learner checklist", "Check every full stop, comma and following space; tick only the corrected punctuation pattern."]
    ],
    countability: [
      ["Notice the noun frame", `Read the quoted sentence from ${location}. Underline the article and the uncountable noun phrase it modifies.`],
      ["Practise the rule", "Write three uncountable-noun frames without an unsupported singular article."],
      ["Repair the noun phrase", action],
      ["Contrast the forms", "Write one correct uncountable form and one countable alternative with a unit noun, then explain the difference."],
      ["Transfer the rule", "Use the same uncountable noun correctly in two new IELTS sentences."],
      ["Check the paragraph", `Proofread ${location} for article-plus-uncountable-noun combinations only.`],
      ["Final learner checklist", "Check each repaired noun phrase for article, number and meaning."]
    ],
    lexical: [
      ["Notice the meaning", `Read the quoted sentence from ${location}. Contrast the source word's dictionary meaning with the meaning intended in context.`],
      ["Practise precise wording", "Write three short sentences using the corrected term in the same grammatical frame."],
      ["Repair the wording", action],
      ["Check the meaning", "Explain in one sentence why the replacement is more accurate and does not change the original claim."],
      ["Transfer the wording", "Use the corrected term in a different IELTS topic without copying the original sentence."],
      ["Check the paragraph function", paragraphFunctionCheck(location, category)],
      ["Final learner checklist", "Check that every corrected word is precise, natural and grammatically compatible with its sentence."]
    ],
    fragment: [
      ["Find the missing clause", `Read the fragment from ${location}. Underline its dependent clause and identify the missing independent main clause.`],
      ["Practise sentence completion", "Turn three noun-phrase or subordinate-clause fragments into complete sentences with a subject and finite main verb."],
      ["Repair the fragment", action],
      ["Check the proposition", "Confirm that the repaired sentence states one complete claim and retains the original idea."],
      ["Transfer the structure", "Write one complete example sentence on another topic using the same grammatical pattern."],
      ["Check the paragraph function", `Re-read ${location}. Confirm that the repaired sentence now performs its example or explanation function.`],
      ["Final learner checklist", "For every sentence, identify the independent subject and finite main verb before ticking it as complete."]
    ],
    development: [
      ["Map the missing link", `Read the evidence from ${location}. Write the incomplete chain and mark the missing mechanism or result.`],
      ["Practise the chain", developmentPractice(category)],
      ["Repair the development", action],
      ["Check the mechanism", "Underline the implementation or causal step, the behavioural response and the outcome in the repaired version."],
      ["Transfer the chain", "Build one new cause-to-result or solution-to-outcome chain on another IELTS topic."],
      ["Rebuild the paragraph", paragraphFunctionCheck(location, category)],
      ["Final learner checklist", "Check that each developed point shows how the claim leads to a clear result without adding an unrelated route."]
    ],
    reference: [
      ["Find the unclear reference", `Read the quoted sentence from ${location}. Circle the pronoun or vague reference and identify the exact noun it should name.`],
      ["Practise explicit reference", "Rewrite three short sentences by replacing an unclear pronoun with a precise noun phrase."],
      ["Repair the reference", action],
      ["Check the antecedent", "Confirm that every pronoun has one clear antecedent and agrees in number."],
      ["Transfer the rule", "Write two new sentences with explicit reference chains."],
      ["Check the paragraph", `Re-read ${location} and trace each pronoun back to one named noun.`],
      ["Final learner checklist", "Tick each pronoun only after its antecedent is explicit and unambiguous."]
    ],
    thesis: [
      ["Map the task routes", "List every route required by the prompt before revising the thesis."],
      ["Practise route order", "Write two thesis plans that present the required routes in the same order as the body paragraphs."],
      ["Repair the thesis", action],
      ["Check route coverage", "Match each thesis route to one body paragraph and remove any route that is not developed."],
      ["Transfer the structure", "Plan a thesis for a different prompt of the same essay family."],
      ["Check the introduction", `Re-read ${location}. Check only prompt paraphrase, required routes and position where required; do not force body-paragraph examples into the introduction.`],
      ["Final learner checklist", "Confirm task coverage, route order and position consistency before finalising the thesis."]
    ],
    task1Overview: [
      ["Select dominant features", "List the largest, smallest or most important overall patterns; exclude minor data."],
      ["Practise overview selection", `Write two overview sentences appropriate to the ${context.visualType || "visual"} without detailed figures.`],
      ["Repair the overview", action],
      ["Check visual coverage", "Confirm that the overview covers the dominant pattern from every supplied visual."],
      ["Transfer the skill", "Write an overview for a different chart, map or process using only dominant features."],
      ["Check the overview function", "Re-read the overview and remove detailed evidence, explanation and conclusions."],
      ["Final learner checklist", "Check accuracy, dominant-feature selection and full visual coverage."]
    ],
    general: [
      ["Notice the issue", `Read the quoted evidence from ${location} and explain the validated ${category} problem in your own words.`],
      ["Practise the rule", `Write three short examples that demonstrate accurate ${category}.`],
      ["Repair the sentence", action],
      ["Check the repair", "Confirm that the repair addresses the diagnosis without changing the original route or factual claim."],
      ["Transfer the rule", `Use the same ${category} skill in one new sentence on another topic.`],
      ["Check the paragraph function", paragraphFunctionCheck(location, category)],
      ["Final learner checklist", `Proofread the response once for ${category} and tick only evidence-based corrections.`]
    ]
  };
  const [phase, task] = tasks[family][phaseIndex % tasks[family].length];
  return { phase, task };
}

function repairActivityFamily(category) {
  if (category === "Punctuation") return "punctuation";
  if (category === "Countability" || category === "Article Control") return "countability";
  if (category === "Sentence Completion") return "fragment";
  if (["Lexical Precision", "Meaning Control", "Word Choice", "Collocation", "Word Form"].includes(category)) return "lexical";
  if (["Reference Control", "Pronoun Control"].includes(category)) return "reference";
  if (["Causal Mechanism", "Solution Mechanism", "Explanation Depth", "Example Development", "SAR Example Quality"].includes(category)) return "development";
  if (["Thesis Route Clarity", "Cause Route Clarity", "Solution Route Clarity", "Position Clarity", "Prompt Coverage"].includes(category)) return "thesis";
  if (["Overview Quality", "Overview Accuracy", "Mixed-Visual Coverage"].includes(category)) return "task1Overview";
  return "general";
}

function developmentPractice(category) {
  if (category === "Solution Mechanism") {
    return "Write three chains in the form: solution -> implementation or enforcement -> behaviour change -> outcome.";
  }
  if (["Example Development", "SAR Example Quality"].includes(category)) {
    return "Write one complete Situation -> Action -> Result chain and state how the result supports the paragraph claim.";
  }
  return "Write three chains in the form: cause -> immediate effect -> wider consequence.";
}

function paragraphFunctionCheck(location, category) {
  if (/Introduction/i.test(location)) {
    return "Re-read the Introduction. Check only accurate prompt paraphrase, required route and position where required; do not add body-paragraph explanation or examples.";
  }
  if (/Conclusion/i.test(location)) {
    return "Re-read the Conclusion. Check that it closes the established route without adding a new idea, while preserving the repaired language.";
  }
  return `Re-read ${location}. Check that its controlling claim, ${category} repair and supporting evidence remain on one route.`;
}

function controlledReviewChecks({ taskType = "Task 2", visualType = "" } = {}) {
  if (String(taskType) !== "Task 1") {
    return [
      "Confirm every task requirement is answered.",
      "Check that each paragraph opening states its controlling route.",
      "Check each explanation for an explicit cause-and-effect link.",
      "Verify that each example contains a clear result.",
      "Check lexical choices against their grammatical frames.",
      "Proofread sentence endings, articles and agreement.",
      "Read the full response once for route and conclusion consistency."
    ];
  }
  if (/map|plan/i.test(visualType)) {
    return [
      "Verify every reported change against the map using Old Feature -> New Feature, then group changes by location or function.",
      "Check that purpose language appears only where the map explicitly provides a purpose.",
      "Confirm the overview reports the dominant transformation rather than isolated details."
    ];
  }
  if (/process|cycle|diagram|mechanism/i.test(visualType)) {
    return [
      "Verify the first stage, sequence, transformations and final endpoint against the diagram.",
      "Check that every stage names its input and output without inventing a cause or purpose.",
      "Confirm the overview states whether the process is linear, cyclical or branching."
    ];
  }
  if (/mixed|combination/i.test(visualType)) {
    return [
      "Verify that the overview covers the dominant feature from every supplied visual.",
      "Group comparable figures across visuals using the correct measure, unit and time reference.",
      "Check that no visual is described with an unsupported relationship."
    ];
  }
  return [
    "Verify the overview against the dominant visual features without adding unsupported detail.",
    "Check every selected figure, unit, category and time point against the visual.",
    "Use direct comparisons and group details by the most meaningful visual pattern."
  ];
}

function buildMainScoreLimiter(ranked) {
  if (!ranked.length) return "No validated score-limiting issue was identified.";
  return ranked.slice(0, 2).map((issue) =>
    `${issue.issueCategory} in ${issue.paragraphLabel || issue.paragraphLocation}: ${trimSentence(issue.diagnosis || issue.whyItLimitsBand)}`
  ).join(" ");
}

function buildUrgentRepair(ranked) {
  if (!ranked.length) return "Maintain the current structure and complete a final evidence-based proofread.";
  const issue = ranked[0];
  return `${issue.paragraphLabel || issue.paragraphLocation}: ${trimSentence(issue.studentAction)}`;
}

function rankIssues(issues) {
  return [...issues].sort((left, right) => {
    const category = PRIORITY_ORDER.indexOf(left.issueCategory) - PRIORITY_ORDER.indexOf(right.issueCategory);
    if (category !== 0) {
      if (PRIORITY_ORDER.indexOf(left.issueCategory) < 0) return 1;
      if (PRIORITY_ORDER.indexOf(right.issueCategory) < 0) return -1;
      return category;
    }
    return severityRank(right.severity) - severityRank(left.severity);
  });
}

function trimSentence(value) {
  const text = String(value || "").trim();
  if (!text) return "repair the identified point.";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function severityRank(value) {
  return { "Pass / Strong": 0, "High-Band Refinement": 1, "Minor Repair": 2, Moderate: 3, Major: 4, Critical: 5 }[value] ?? 3;
}

function fatal(code, message) {
  return { severity: "fatal", code, message };
}

function repairable(code, message) {
  return { severity: "repairable", code, message };
}

function normalize(value) {
  return String(value || "").normalize("NFKC").toLowerCase();
}

function bandHigh(value) {
  const values = String(value || "").match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return values.length ? Math.max(...values) : Number.NaN;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
