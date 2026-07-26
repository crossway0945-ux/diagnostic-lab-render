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
  }
  return findings;
}

export function paragraphDimensionStatus(issues = [], paragraphRole = "", conclusionFunction = null) {
  const categories = new Set(issues.map((issue) => issue.issueCategory));
  const route = categories.has("Body Route Alignment") || categories.has("Thesis Route Clarity")
    ? "Route Repair Needed"
    : "Route Aligned";
  const development = [...categories].some((category) => ["Causal Mechanism", "Solution Mechanism", "Explanation Depth"].includes(category))
    ? "Development Repair Needed"
    : "Development Controlled";
  const example = [...categories].some((category) => ["Example Development", "SAR Example Quality"].includes(category))
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
  const phases = [
    ["Locate", (issue) => {
      const focus = ["Example Development", "SAR Example Quality"].includes(issue.issueCategory)
        ? "the missing affected group or wider consequence"
        : ["Causal Mechanism", "Solution Mechanism"].includes(issue.issueCategory)
          ? "the missing causal mechanism and wider consequence"
          : `the validated ${issue.issueCategory} defect`;
      return `Locate "${issue.targetSpan || issue.exactEvidence}" in ${issue.paragraphLabel} and identify ${focus}.`;
    }],
    ["Repair", (issue) => `${issue.paragraphLabel}: ${issue.studentAction}`],
    ["Compare", (issue) => `Compare the original and targeted revision for ${issue.issueCategory}; verify that the original route and meaning are preserved.`],
    ["Transfer", (issue) => `Write one new sentence that applies the same ${issue.issueCategory} repair without copying the report wording.`],
    ["Paragraph check", (issue) => `Re-read ${issue.paragraphLabel} and confirm that the repaired sentence still performs its ${issue.sentenceRole || "paragraph"} function.`],
    ["Evidence check", (issue) => issue.revisionWithheld
      ? `Use the exact source span in ${issue.paragraphLabel}, follow the Student Action, and resubmit before treating any rewrite as a model sentence.`
      : `Verify the repair against the exact source span and the expected correction: "${issue.expectedCorrection || issue.targetedRevision}".`],
    ["Final proof", (issue) => `Complete a final proofread focused on the validated ${issue.issueCategory} issue in ${issue.paragraphLabel}.`]
  ];
  return Array.from({ length: requiredDays }, (_, index) => {
    const issue = unique[index % unique.length];
    const [phase, taskBuilder] = phases[index % phases.length];
    return {
      day: index + 1,
      issueId: issue.issueId,
      title: thai ? `${phase}: ${issue.issueCategory}` : `${phase}: ${issue.issueCategory}`,
      task: taskBuilder(issue),
      source: "canonical-issue-graph"
    };
  });
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
  if (!text) return "repair the validated issue.";
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

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
