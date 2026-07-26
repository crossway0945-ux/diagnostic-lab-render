import { classifySentenceRole } from "./sentenceRoles.js";

export const THESIS_ROUTE_STATUSES = Object.freeze([
  "Structurally Clear - Lexical Precision Repair Needed",
  "Route Established - Cause Hierarchy Needs Clarification",
  "Route Established",
  "Route Incomplete",
  "Route Conflicted",
  "Route Not Traceable",
  "Not Applicable"
]);

const ROUTE_CATEGORIES = new Set([
  "Position Clarity",
  "Thesis Route Clarity",
  "Cause Route Clarity",
  "Solution Route Clarity",
  "Prompt Coverage",
  "Body Route Alignment"
]);

const LANGUAGE_CATEGORIES = new Set([
  "Lexical Precision",
  "Word Choice",
  "Meaning Control",
  "Collocation",
  "Word Form"
]);

/**
 * Freeze independently auditable thesis dimensions before any student-facing projection.
 * Language precision can qualify a structurally present route, but it cannot erase that route.
 */
export function assessThesisDimensions({
  taskType = "Task 2",
  essayType = "",
  prompt = "",
  paragraphs = [],
  canonicalIssues = []
} = {}) {
  if (String(taskType) === "Task 1") {
    return {
      applicable: false,
      status: "Not Applicable",
      taskFamily: "Task 1",
      routeRequired: [],
      routePresent: {},
      routeOrderClear: true,
      causalHierarchyClear: true,
      lexicalNamingAccurate: true,
      bodyRouteTraceable: true,
      positionRequired: false,
      positionPresent: false,
      evidenceIssueIds: []
    };
  }

  const taskFamily = inferTask2RouteFamily(essayType, prompt);
  const required = requiredRoutes(taskFamily, prompt);
  const introduction = paragraphs.find((paragraph) => paragraph.role === "Introduction");
  const bodyParagraphs = paragraphs.filter((paragraph) => /^Body Paragraph/i.test(paragraph.role));
  const introRoles = (introduction?.sentences || []).map((sentence, index, sentences) => ({
    sentence,
    role: classifySentenceRole({
      taskType,
      paragraphRole: "Introduction",
      sentenceIndex: index,
      sentenceCount: sentences.length,
      sentence: sentence.exactText,
      previousSentence: sentences[index - 1]?.exactText || "",
      nextSentence: sentences[index + 1]?.exactText || ""
    })
  }));
  const present = Object.fromEntries(required.map((route) => [
    route,
    routePresentInIntroduction(route, introRoles, introduction?.exactText || "")
  ]));
  const routeIssues = canonicalIssues.filter((issue) => ROUTE_CATEGORIES.has(issue.issueCategory));
  const lexicalIssues = canonicalIssues.filter((issue) =>
    issue.paragraphLabel === "Introduction" &&
    LANGUAGE_CATEGORIES.has(issue.issueCategory) &&
    ["position", "thesis_route", "cause_route", "solution_route", "view_route", "answer_to_question_1", "answer_to_question_2"].includes(issue.sentenceRole)
  );
  const routeOrderClear = routeOrderingIsClear(required, introRoles);
  const causalHierarchyClear = !canonicalIssues.some((issue) =>
    issue.paragraphLabel === "Introduction" &&
    /\b(?:hierarch|underlying|immediate cause|cause layer|causal layer)\b/i.test(`${issue.diagnosis} ${issue.whyItLimitsBand}`)
  );
  const bodyRouteTraceable = bodyRoutesTraceable(required, bodyParagraphs, canonicalIssues);
  const positionRequired = required.includes("position");
  const positionPresent = positionRequired ? Boolean(present.position) : false;
  const routeConflict = canonicalIssues.some((issue) =>
    issue.issueCategory === "Position Clarity" &&
    /\b(?:conflict|contradict|opposite|inconsistent)\b/i.test(`${issue.diagnosis} ${issue.whyItLimitsBand}`)
  );
  const allRequiredPresent = required.every((route) => present[route]);
  const structurallyClear = allRequiredPresent && routeOrderClear && bodyRouteTraceable && !routeConflict;

  let status = "Route Established";
  if (routeConflict) status = "Route Conflicted";
  else if (!required.some((route) => present[route])) status = "Route Not Traceable";
  else if (!allRequiredPresent || !bodyRouteTraceable) status = "Route Incomplete";
  else if (!causalHierarchyClear) status = "Route Established - Cause Hierarchy Needs Clarification";
  else if (lexicalIssues.length) status = "Structurally Clear - Lexical Precision Repair Needed";

  return {
    applicable: true,
    status,
    taskFamily,
    routeRequired: required,
    routePresent: present,
    routeOrderClear,
    causalHierarchyClear,
    lexicalNamingAccurate: lexicalIssues.length === 0,
    bodyRouteTraceable,
    positionRequired,
    positionPresent,
    structurallyClear,
    evidenceIssueIds: [...new Set([...routeIssues, ...lexicalIssues].map((issue) => issue.issueId))]
  };
}

export function inferTask2RouteFamily(essayType = "", prompt = "") {
  const text = `${essayType} ${prompt}`.normalize("NFKC").toLowerCase();
  if (/problem.+solution|solution.+problem|cause.+solution|causes?.+measures?|reasons?.+solutions?/.test(text)) return "Problem and Solution";
  if (/cause.+effect|reasons?.+effects?|causes?.+consequences?/.test(text)) return "Cause and Effect";
  if (/discuss both views|discuss (?:these|the) views|both views/.test(text)) return "Discuss Both Views";
  if (/outweigh/.test(text)) return "Outweigh";
  if (/advantages?.+disadvantages?|disadvantages?.+advantages?/.test(text)) return "Advantages and Disadvantages";
  if (/positive or negative|positive development|negative development/.test(text)) return "Positive or Negative Development";
  if (/to what extent|agree or disagree|do you agree|opinion/.test(text)) return "Opinion";
  const questionMarks = (String(prompt).match(/\?/g) || []).length;
  if (questionMarks >= 2 || /two-part|direct questions?/.test(text)) return "Direct Questions";
  return "Hybrid";
}

function requiredRoutes(family, prompt) {
  const directQuestionCount = Math.max(0, (String(prompt).match(/\?/g) || []).length);
  const rules = {
    "Problem and Solution": ["cause", "solution"],
    "Cause and Effect": ["cause", "effect"],
    "Discuss Both Views": ["view", "position"],
    Outweigh: ["advantage", "disadvantage", "position"],
    "Advantages and Disadvantages": ["advantage", "disadvantage"],
    "Positive or Negative Development": ["position"],
    Opinion: ["position", "reason"],
    "Direct Questions": directQuestionCount >= 2 ? ["answer_1", "answer_2"] : ["answer_1"],
    Hybrid: ["answer_1"]
  };
  return rules[family] || ["answer_1"];
}

function routePresentInIntroduction(route, roleRecords, introductionText) {
  const primaryRoles = roleRecords.map((item) => item.role.primaryRole);
  const text = String(introductionText || "");
  const roleMap = {
    cause: ["cause_route", "thesis_route"],
    solution: ["solution_route", "thesis_route"],
    view: ["view_route", "thesis_route"],
    position: ["position", "thesis_route"],
    answer_1: ["answer_to_question_1", "thesis_route"],
    answer_2: ["answer_to_question_2", "thesis_route"],
    reason: ["thesis_route", "cause_route"],
    advantage: ["thesis_route"],
    disadvantage: ["thesis_route"],
    effect: ["thesis_route", "consequence", "cause_route"]
  };
  const lexicalMap = {
    cause: /\b(?:causes?|reasons?|drivers?|factors?|due to|because of)\b/i,
    solution: /\b(?:solution|measure|address|tackle|solve|should|must)\b/i,
    view: /\b(?:view|argue|believe|supporters|opponents)\b/i,
    position: /\b(?:agree|disagree|believe|opinion|view|outweigh|positive|negative)\b/i,
    answer_1: /\b(?:first|one reason|main reason|because|is that)\b/i,
    answer_2: /\b(?:second|another|whereas|while|also)\b/i,
    reason: /\b(?:reason|because|since|due to)\b/i,
    advantage: /\b(?:advantage|benefit|positive)\b/i,
    disadvantage: /\b(?:disadvantage|drawback|negative)\b/i,
    effect: /\b(?:effect|result|consequence|lead to)\b/i
  };
  return (roleMap[route] || []).some((role) => primaryRoles.includes(role)) && (lexicalMap[route]?.test(text) ?? true);
}

function routeOrderingIsClear(required, roleRecords) {
  const order = roleRecords.map((item) => item.role.primaryRole);
  if (required.includes("cause") && required.includes("solution")) {
    const cause = order.indexOf("cause_route");
    const solution = order.indexOf("solution_route");
    return cause < 0 || solution < 0 || cause <= solution;
  }
  if (required.includes("answer_1") && required.includes("answer_2")) {
    const first = order.indexOf("answer_to_question_1");
    const second = order.indexOf("answer_to_question_2");
    return first < 0 || second < 0 || first <= second;
  }
  return true;
}

function bodyRoutesTraceable(required, bodyParagraphs, issues) {
  if (!bodyParagraphs.length) return false;
  if (issues.some((issue) => issue.issueCategory === "Body Route Alignment" && /not trace|misalign|unrelated|off-topic/i.test(`${issue.diagnosis} ${issue.whyItLimitsBand}`))) {
    return false;
  }
  if (required.includes("cause") && required.includes("solution") && bodyParagraphs.length < 2) return false;
  if (required.includes("view") && bodyParagraphs.length < 2) return false;
  if (required.includes("answer_1") && required.includes("answer_2") && bodyParagraphs.length < 2) return false;
  return true;
}
