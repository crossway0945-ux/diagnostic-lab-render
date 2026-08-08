import { categoryForAssertion, minimalTextDiff } from "./evidenceAssertions.js";

const SEVERITY_RANK = Object.freeze({
  "Pass / Strong": 0,
  Strong: 0,
  "High-Band Refinement": 1,
  "Minor Repair": 2,
  "Mostly Controlled": 2,
  Moderate: 3,
  "Needs Work": 4,
  Serious: 4,
  Major: 4,
  Critical: 5
});

const ISSUE_PRIORITY = Object.freeze({
  "Task Understanding": 100,
  "Visual Understanding": 100,
  "Sentence Completion": 99,
  "Prompt Coverage": 98,
  "Overview Quality": 97,
  "Overview Accuracy": 97,
  "Data Accuracy": 96,
  "Position Clarity": 95,
  "Thesis Route Clarity": 94,
  "Cause Route Clarity": 93,
  "Solution Route Clarity": 93,
  "Body Route Alignment": 92,
  "Causal Mechanism": 88,
  "Solution Mechanism": 88,
  "Explanation Depth": 86,
  "Example Development": 84,
  "SAR Example Quality": 84,
  "Meaning Control": 82,
  "Lexical Precision": 78,
  "Word Choice": 77,
  "Grammar and Sentence Control": 72,
  Countability: 70,
  "Article Control": 69,
  "Reference Control": 68,
  Collocation: 67,
  Punctuation: 60
});

const CATEGORY_DIMENSIONS = Object.freeze({
  Punctuation: {
    criteria: ["Grammatical Range & Accuracy"],
    framework: ["LFC-CPC Clear", "LFC-CPC Precise"]
  },
  Countability: {
    criteria: ["Grammatical Range & Accuracy"],
    framework: ["Grammar and Sentence Control", "LFC-CPC Precise"]
  },
  "Article Control": {
    criteria: ["Grammatical Range & Accuracy"],
    framework: ["Grammar and Sentence Control", "LFC-CPC Precise"]
  },
  "Preposition Control": {
    criteria: ["Grammatical Range & Accuracy"],
    framework: ["Grammar and Sentence Control", "LFC-CPC Precise"]
  },
  "Subject-Verb Agreement": {
    criteria: ["Grammatical Range & Accuracy"],
    framework: ["Grammar and Sentence Control", "LFC-CPC Clear"]
  },
  "Grammar and Sentence Control": {
    criteria: ["Grammatical Range & Accuracy"],
    framework: ["Grammar and Sentence Control", "LFC-CPC Clear"]
  },
  "Sentence Completion": {
    criteria: ["Grammatical Range & Accuracy"],
    framework: ["Grammar and Sentence Control", "LFC-CPC Clear"]
  },
  "Lexical Precision": {
    criteria: ["Lexical Resource"],
    framework: ["Vocabulary Precision", "LFC-CPC Precise"]
  },
  "Word Choice": {
    criteria: ["Lexical Resource"],
    framework: ["Vocabulary Precision", "LFC-CPC Precise"]
  },
  Collocation: {
    criteria: ["Lexical Resource"],
    framework: ["Vocabulary Precision", "LFC-CPC Precise"]
  },
  "Meaning Control": {
    criteria: ["Lexical Resource"],
    framework: ["Vocabulary Precision", "LFC-CPC Clear", "LFC-CPC Precise"]
  },
  "Causal Mechanism": {
    criteria: ["Task Response", "Coherence & Cohesion"],
    framework: ["Explanation Depth", "LFC-CPC Link", "LFC-CPC Flow", "LFC-CPC Comprehensive"]
  },
  "Solution Mechanism": {
    criteria: ["Task Response", "Coherence & Cohesion"],
    framework: ["Explanation Depth", "LFC-CPC Link", "LFC-CPC Flow", "LFC-CPC Comprehensive"]
  },
  "Example Development": {
    criteria: ["Task Response", "Coherence & Cohesion"],
    framework: ["SAR Example Quality", "LFC-CPC Comprehensive"]
  },
  "SAR Example Quality": {
    criteria: ["Task Response", "Coherence & Cohesion"],
    framework: ["SAR Example Quality", "LFC-CPC Comprehensive"]
  },
  "Thesis Route Clarity": {
    criteria: ["Task Response", "Coherence & Cohesion"],
    framework: ["Thesis Route Clarity", "Golden Thread"]
  },
  "Cause Route Clarity": {
    criteria: ["Task Response", "Coherence & Cohesion"],
    framework: ["Thesis Route Clarity", "Golden Thread"]
  },
  "Solution Route Clarity": {
    criteria: ["Task Response", "Coherence & Cohesion"],
    framework: ["Thesis Route Clarity", "Golden Thread"]
  },
  "Body Route Alignment": {
    criteria: ["Task Response", "Coherence & Cohesion"],
    framework: ["Body Paragraph Route Alignment", "Golden Thread"]
  },
  "Prompt Coverage": {
    criteria: ["Task Response"],
    framework: ["Task Understanding", "Thesis Route Clarity"]
  },
  "Overview Quality": {
    criteria: ["Task Achievement"],
    framework: ["Overview Quality"]
  },
  "Overview Accuracy": {
    criteria: ["Task Achievement"],
    framework: ["Overview Quality", "Visual Understanding"]
  },
  "Data Accuracy": {
    criteria: ["Task Achievement"],
    framework: ["Visual Understanding", "Data Selection"]
  },
  "Comparison Precision": {
    criteria: ["Task Achievement", "Coherence & Cohesion"],
    framework: ["Grouping Logic", "LFC-CPC Precise"]
  },
  "Process Sequence": {
    criteria: ["Task Achievement", "Coherence & Cohesion"],
    framework: ["Process Sequence", "LFC-CPC Flow"]
  },
  "Map Change Accuracy": {
    criteria: ["Task Achievement"],
    framework: ["Visual Understanding", "Map Change Accuracy"]
  }
});

export function selectPrimaryIssueCategory({ issue = {}, assertion = {}, taskType = "Task 2", sentenceRole = "unknown" } = {}) {
  const explicit = String(issue.issueCategory || issue.issueType || "").trim();
  const diagnosis = normalizeText([issue.diagnosis, issue.kruPomDiagnosis, issue.whyItLimitsBand].filter(Boolean).join(" "));
  const asserted = categoryForAssertion(assertion.assertionType);
  let primary = asserted || explicit || "Lexical Precision";
  const secondary = [];

  if (assertion.assertionType === "lexical_meaning") {
    primary = /\bmeaning (?:change|control|reversal)|reverses? meaning|wrong meaning\b/.test(diagnosis)
      ? "Meaning Control"
      : "Lexical Precision";
  }
  if (assertion.assertionType === "causal_gap") {
    primary = /\bsolution\b|enforcement|implementation|deterr/.test(diagnosis) ? "Solution Mechanism" : "Causal Mechanism";
  }
  if (assertion.assertionType === "route_gap") {
    primary = routeCategoryForRole(sentenceRole, diagnosis);
  }
  if (["cause_route", "solution_route", "thesis_route"].includes(sentenceRole) &&
    /structurally clear|route (?:is|remains) (?:clear|traceable|established)/.test(diagnosis) &&
    /lexical|word|term|noun|precision|meaning|inaccurate/.test(diagnosis)) {
    primary = /meaning|inaccurate/.test(diagnosis) ? "Lexical Precision" : (asserted || "Lexical Precision");
    secondary.push("Thesis Route Clarity");
  }
  if (String(taskType) === "Task 1" && /Thesis|Position|Cause Route|Solution Route|Body Route/.test(primary)) {
    primary = asserted && !/Route/.test(asserted) ? asserted : "Prompt Coverage";
  }
  if (String(taskType) !== "Task 1" && /Overview|Data Accuracy|Comparison Precision|Process Sequence|Map Change/.test(primary)) {
    primary = asserted && !/Overview|Data|Comparison|Process|Map/.test(asserted) ? asserted : "Prompt Coverage";
  }
  if (explicit && explicit !== primary && categoryRelevantAsSecondary(explicit, primary, sentenceRole, taskType)) secondary.push(explicit);
  for (const item of Array.isArray(issue.secondaryIssueCategories) ? issue.secondaryIssueCategories : []) {
    if (item && item !== primary && categoryRelevantAsSecondary(item, primary, sentenceRole, taskType)) secondary.push(item);
  }
  return { primaryCategory: primary, secondaryCategories: [...new Set(secondary)].filter((item) => item !== primary) };
}

export function validatedDimensionMapping(category = "", taskType = "Task 2", existingCriteria = [], existingFramework = []) {
  const canonical = CATEGORY_DIMENSIONS[category] || languageFallback(category);
  const criteria = [...new Set(canonical.criteria || [])]
    .map((item) => String(taskType) === "Task 1" && item === "Task Response" ? "Task Achievement" : item)
    .filter((item) => String(taskType) === "Task 1" || item !== "Task Achievement");
  const framework = [...new Set(canonical.framework || [])];
  // Existing dimensions survive only when they are semantically adjacent to the selected category.
  for (const item of normalizeArray(existingCriteria)) {
    if (criterionCompatible(item, category, taskType)) criteria.push(item);
  }
  for (const item of normalizeArray(existingFramework)) {
    if (frameworkCompatible(item, category)) framework.push(item);
  }
  return { criteria: [...new Set(criteria)], framework: [...new Set(framework)] };
}

export function buildSpecificStudentAction(issue = {}) {
  const assertion = issue.evidenceAssertion || {};
  const category = String(issue.issueCategory || "");
  const location = String(issue.paragraphLocation || issue.paragraphLabel || "the quoted location");
  if (assertion.assertionType === "visual_type_mismatch" && /\bintro checklist\b/i.test(String(issue.studentAction || ""))) {
    return String(issue.studentAction).trim();
  }
  if (assertion.assertionType === "punctuation_spacing") {
    return `In ${location}, replace "${assertion.targetSpan}" with "${assertion.correctedSpan}" to insert the missing space after the punctuation mark.`;
  }
  if (assertion.assertionType === "countability") {
    return `In ${location}, remove the unsupported singular article in "${assertion.targetSpan}" and write "${assertion.correctedSpan}".`;
  }
  if (assertion.assertionType === "article") {
    return `In ${location}, change "${assertion.targetSpan}" to "${assertion.correctedSpan}".`;
  }
  if (assertion.assertionType === "sentence_fragment" || category === "Sentence Completion") {
    return `In ${location}, turn the fragment into a complete sentence with an independent subject and finite main verb while preserving the original idea.`;
  }
  if (["Lexical Precision", "Word Choice", "Meaning Control", "Collocation", "Word Form"].includes(category) &&
    assertion.targetSpan && assertion.correctedSpan) {
    if (assertion.targetSpan.length <= 60 && assertion.correctedSpan.length <= 60) {
      return `Replace "${assertion.targetSpan}" with "${assertion.correctedSpan}" in this sentence; keep the original claim and grammatical frame.`;
    }
    const quotedTerm = firstQuotedSourceTerm(issue);
    if (quotedTerm) {
      return `Replace "${quotedTerm}" with a precise term that expresses the intended meaning, then keep the sentence's original claim and route.`;
    }
    return `Replace the inaccurate wording with a precise term that preserves the sentence's original claim and route.`;
  }
  if (["Lexical Precision", "Word Choice", "Meaning Control", "Collocation", "Word Form"].includes(category)) {
    return `In ${location}, replace the imprecise word or phrase named in the diagnosis with a precise term that preserves the original claim and grammatical frame.`;
  }
  if (["Reference Control", "Pronoun Control"].includes(category) && assertion.targetSpan && assertion.correctedSpan) {
    return `Replace "${assertion.targetSpan}" with "${assertion.correctedSpan}" so the reference points to one explicit noun and preserves the original meaning.`;
  }
  if (category === "Causal Mechanism") {
    return "Write the missing cause-and-effect chain explicitly: cause -> immediate effect -> wider consequence.";
  }
  if (category === "Solution Mechanism") {
    return "Show how the proposed measure is implemented, how it changes behaviour, and how that result addresses the stated problem.";
  }
  if (["Example Development", "SAR Example Quality"].includes(category)) {
    return "Complete the example as Situation -> Action -> Result, then state how the result supports the paragraph's controlling claim.";
  }
  if (category === "Thesis Route Clarity") {
    return "State the required answer routes in the thesis in the same order that the body paragraphs develop them.";
  }
  if (category === "Introduction Precision") {
    return "Rewrite the introduction as an accurate neutral paraphrase of the visual subject, measure, groups and time period.";
  }
  if (["Overview Quality", "Overview Accuracy"].includes(category)) {
    return "Write one overview sentence that reports only the dominant visual features and contains no unsupported detail.";
  }
  if (["Data Accuracy", "Magnitude Precision"].includes(category)) {
    return "Check the quoted figure, unit, category and time point against the visual, then correct only the unsupported value.";
  }
  if (category === "Comparison Precision") {
    return "Compare the two named visual items directly using the correct measure, direction and time reference.";
  }
  if (category === "Map Change Accuracy") {
    return "Use visible old-to-new evidence: Old Feature -> New Feature. Group related changes by location/function. Avoid purpose phrases unless the map explicitly gives the reason.";
  }
  if (["Process Sequence", "Process Endpoint"].includes(category)) {
    return "Place this stage in the verified process order and name its input, transformation and output accurately.";
  }
  if (category === "Prompt Coverage") {
    return "Add the missing task requirement to the appropriate route while preserving the response's existing position and paragraph order.";
  }
  if (["Visual Understanding", "Data Selection", "Grouping Logic", "Objective Reporting", "Mixed-Visual Coverage"].includes(category)) {
    if (issue.sentenceRole === "introduction_paraphrase") {
      return "Use the intro checklist: verify the visual type, subject, measurement, groups and time period before rewriting the neutral paraphrase.";
    }
      return "Recheck this reporting sentence against the supplied visual and rewrite only the unsupported visual claim.";
  }
  const taskAssertion = ["causal_gap", "example_scope", "route_gap", "task_coverage", "data_error", "overview_error", "comparison_error", "process_sequence", "map_change"]
    .includes(assertion.assertionType);
  if (!taskAssertion && assertion.targetSpan && assertion.correctedSpan &&
    assertion.targetSpan.length <= 60 && assertion.correctedSpan.length <= 60) {
      return `In ${location}, change "${assertion.targetSpan}" to "${assertion.correctedSpan}".`;
    }
  return `Revise the quoted sentence for ${category || "this issue"}, then check that it still performs the same paragraph function.`;
}

export function validateLexicalReplacement({ evidence = "", revision = "", assertion = {} } = {}) {
  const problems = [];
  const target = String(assertion.targetSpan || "");
  const replacement = String(assertion.correctedSpan || "");
  const fullRevision = String(revision || "");
  if (!target || !replacement) return { pass: false, problems: ["A lexical replacement must identify both the source span and the replacement span."] };
  if (!fullRevision.includes(replacement)) problems.push("The displayed revision does not contain the claimed replacement span.");

  const sourceIndex = String(evidence || "").indexOf(target);
  const before = sourceIndex >= 0 ? String(evidence).slice(Math.max(0, sourceIndex - 12), sourceIndex) : "";
  const nounFrame = /\b(?:the|a|an|this|that|their|his|her|of)\s*$/i.test(before);
  if (nounFrame && isBareAdjective(replacement)) {
    problems.push(`"${replacement}" is an adjective but the source frame requires a noun or noun phrase.`);
  }
  if (/\bcompliance\b/i.test(replacement) && !/\bcompliance with\b|\bregulatory compliance\b/i.test(fullRevision)) {
    problems.push(`"compliance" requires a compatible frame such as "compliance with regulations".`);
  }
  if (/\binattentive\b/i.test(replacement) && nounFrame && !/\binattentive (?:driver|driving|behavio(?:u)?r)\b/i.test(replacement)) {
    problems.push(`"inattentive" cannot replace a noun directly without a noun such as "driving" or "drivers".`);
  }
  return { pass: problems.length === 0, problems };
}

export function mergeDuplicateIssues(issues = []) {
  const merged = [];
  for (const issue of issues) {
    const duplicateIndex = merged.findIndex((candidate) => issuesAreDuplicates(candidate, issue));
    if (duplicateIndex < 0) {
      merged.push(finalizeIssueIdentity({ ...issue, mergedCandidateIds: [issue.feedbackCardId || issue.issueId].filter(Boolean) }));
      continue;
    }
    const current = merged[duplicateIndex];
    const severity = severityRank(issue.severity) > severityRank(current.severity) ? issue.severity : current.severity;
    const primary = issuePriority(issue) > issuePriority(current) ? issue : current;
    const secondaryCategories = [...new Set([
      ...(current.secondaryIssueCategories || []),
      ...(issue.secondaryIssueCategories || []),
      current.issueCategory,
      issue.issueCategory
    ])].filter((item) => item && item !== primary.issueCategory);
    const evidenceLocations = uniqueEvidenceLocations([...(current.evidenceLocations || []), ...(issue.evidenceLocations || [])]);
    merged[duplicateIndex] = finalizeIssueIdentity({
      ...current,
      ...primary,
      severity,
      secondaryIssueCategories: secondaryCategories,
      secondaryCategories,
      criteriaAffected: [...new Set([...(current.criteriaAffected || []), ...(issue.criteriaAffected || [])])],
      criteria: [...new Set([...(current.criteria || []), ...(issue.criteria || [])])],
      frameworkComponents: [...new Set([...(current.frameworkComponents || []), ...(issue.frameworkComponents || [])])],
      framework: [...new Set([...(current.framework || []), ...(issue.framework || [])])],
      evidenceLocations,
      evidenceCount: evidenceLocations.length,
      evidenceScope: evidenceLocations.length > 1 ? "multi-location" : "single-location",
      additionalEvidenceLocations: evidenceLocations.slice(1),
      displayedEvidenceCount: evidenceLocations.length,
      mergedCandidateIds: [...new Set([...(current.mergedCandidateIds || []), issue.feedbackCardId || issue.issueId].filter(Boolean))]
    });
  }
  return merged;
}

export function issuePriority(issue = {}) {
  return (ISSUE_PRIORITY[issue.issueCategory] || 50) * 10 + severityRank(issue.severity);
}

export function validateStudentActionSpecificity(issue = {}) {
  const action = String(issue.studentAction || "");
  const problems = [];
  if (!action.trim()) problems.push("Student Action is empty.");
  if (/search the full response|check every recurrence|look for the same pattern/i.test(action) && Number(issue.evidenceCount || 1) < 2) {
    problems.push("Student Action claims recurrence without multi-location evidence.");
  }
  const assertion = issue.evidenceAssertion || {};
  if (assertion.targetSpan && assertion.correctedSpan &&
    !action.includes(assertion.targetSpan) && !action.includes(assertion.correctedSpan) &&
    ![
      "Causal Mechanism", "Solution Mechanism", "Example Development", "SAR Example Quality",
      "Visual Understanding", "Introduction Precision", "Overview Quality", "Overview Accuracy",
      "Data Accuracy", "Comparison Precision", "Process Sequence", "Process Endpoint", "Map Change Accuracy"
    ].includes(issue.issueCategory)) {
    problems.push("Student Action does not identify the local repair span or correction.");
  }
  return { pass: problems.length === 0, problems };
}

function issuesAreDuplicates(left, right) {
  const leftAssertion = left.evidenceAssertion || {};
  const rightAssertion = right.evidenceAssertion || {};
  const sameSource = normalizeText(left.paragraphLocation) === normalizeText(right.paragraphLocation) &&
    normalizeText(left.exactEvidence) === normalizeText(right.exactEvidence);
  if (!sameSource) return false;
  const sameOffsets = Number(leftAssertion.targetOffsetStart) >= 0 &&
    Number(leftAssertion.targetOffsetStart) === Number(rightAssertion.targetOffsetStart) &&
    Number(leftAssertion.targetOffsetEnd) === Number(rightAssertion.targetOffsetEnd);
  const sameTarget = normalizeText(leftAssertion.targetSpan) &&
    normalizeText(leftAssertion.targetSpan) === normalizeText(rightAssertion.targetSpan);
  if (!sameOffsets && !sameTarget) return false;
  const sameCorrection = normalizeText(leftAssertion.correctedSpan) === normalizeText(rightAssertion.correctedSpan);
  const sameRevision = normalizeText(left.targetedRevision) === normalizeText(right.targetedRevision);
  const sameAssertion = leftAssertion.assertionType === rightAssertion.assertionType;
  const diagnosisSimilarity = tokenSimilarity(left.diagnosis || left.whyItLimitsBand, right.diagnosis || right.whyItLimitsBand);
  const sameSentence = Number(left.sentenceIndex) === Number(right.sentenceIndex);
  return sameSentence && sameAssertion && (sameCorrection || sameRevision) && diagnosisSimilarity >= 0.55;
}

function finalizeIssueIdentity(issue) {
  const assertion = issue.evidenceAssertion || {};
  const signature = [
    issue.taskType,
    issue.paragraphId,
    issue.sentenceIndex,
    issue.issueCategory,
    assertion.targetOffsetStart,
    assertion.targetOffsetEnd,
    assertion.assertionType
  ].join("|");
  return { ...issue, issueSignature: signature, issueId: stableId(signature) };
}

function routeCategoryForRole(role, diagnosis) {
  if (role === "cause_route" || /\bcause route\b/.test(diagnosis)) return "Cause Route Clarity";
  if (role === "solution_route" || /\bsolution route\b/.test(diagnosis)) return "Solution Route Clarity";
  if (role === "body_topic_sentence") return "Body Route Alignment";
  return "Thesis Route Clarity";
}

function categoryRelevantAsSecondary(category, primary, sentenceRole, taskType) {
  if (!category || category === primary) return false;
  if (String(taskType) === "Task 1" && /Thesis|Position|Cause Route|Solution Route|Body Route/.test(category)) return false;
  if (String(taskType) !== "Task 1" && /Overview|Data Accuracy|Process Sequence|Map Change/.test(category)) return false;
  if (/Route/.test(category) && !["position", "thesis_route", "cause_route", "solution_route", "view_route", "body_topic_sentence"].includes(sentenceRole)) return false;
  return true;
}

function languageFallback(category) {
  if (/Lexical|Word|Collocation|Meaning|Tone|Concision/.test(category)) {
    return CATEGORY_DIMENSIONS["Lexical Precision"];
  }
  if (/Grammar|Sentence|Agreement|Article|Countability|Reference|Pronoun|Tense|Preposition|Punctuation|Modal/.test(category)) {
    return CATEGORY_DIMENSIONS["Grammar and Sentence Control"];
  }
  return { criteria: [], framework: [] };
}

function criterionCompatible(criterion, category, taskType) {
  const value = String(criterion || "");
  if (String(taskType) === "Task 1" && value === "Task Response") return false;
  if (String(taskType) !== "Task 1" && value === "Task Achievement") return false;
  if (category === "Punctuation" && /Lexical Resource|Task Response|Task Achievement/.test(value)) return false;
  if (/Lexical|Word|Collocation|Meaning/.test(category) && /Grammatical Range/.test(value)) return false;
  return ["Task Response", "Task Achievement", "Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"].includes(value);
}

function frameworkCompatible(framework, category) {
  const value = String(framework || "");
  if (category === "Punctuation" && /Vocabulary Precision|SAR|Thesis|Route/.test(value)) return false;
  if (/Lexical|Word|Collocation|Meaning/.test(category) && /Grammar Risk|Sentence Completion/.test(value)) return false;
  if (/Mechanism|Example|SAR/.test(category) && /Vocabulary Precision/.test(value)) return false;
  return Boolean(value);
}

function isGenericSearchAction(value, evidenceCount) {
  return /search the full response|correct every recurrence|check every occurrence/i.test(String(value || "")) && Number(evidenceCount || 1) < 2;
}

function dedupeGeneratedGuidance(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const seen = new Set();
  const unique = [];
  for (const sentence of sentences) {
    const clean = sentence.trim();
    const key = normalizeText(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(clean);
  }
  let output = unique.join(" ").trim();
  const words = output.split(/\s+/);
  if (words.length >= 16 && words.length % 2 === 0) {
    const midpoint = words.length / 2;
    if (normalizeText(words.slice(0, midpoint).join(" ")) === normalizeText(words.slice(midpoint).join(" "))) {
      output = words.slice(0, midpoint).join(" ");
    }
  }
  return output;
}

function isBareAdjective(value) {
  const text = String(value || "").trim().toLowerCase();
  return !/\s/.test(text) && /(?:ive|ous|ful|less|able|ible|al|ent|ant|ic|ary|ory)$/.test(text);
}

function firstQuotedSourceTerm(issue = {}) {
  const corpus = [issue.diagnosis, issue.kruPomDiagnosis, issue.whyItLimitsBand].filter(Boolean).join(" ");
  const quoted = corpus.match(/["“‘']([^"”’']{2,60})["”’']/u)?.[1]?.trim() || "";
  if (!quoted) return "";
  return normalizeText(issue.exactEvidence).includes(normalizeText(quoted)) ? quoted : "";
}

function uniqueEvidenceLocations(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${normalizeText(item?.paragraphLocation)}|${normalizeText(item?.exactEvidence)}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tokenSimilarity(left, right) {
  const a = new Set(normalizeText(left).split(" ").filter(Boolean));
  const b = new Set(normalizeText(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((item) => b.has(item)).length;
  return intersection / Math.max(a.size, b.size);
}

function severityRank(value) {
  return SEVERITY_RANK[String(value || "")] ?? 3;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "").trim() ? [String(value).trim()] : [];
}

function normalizeText(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, " ").trim();
}

function stableId(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `issue-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
