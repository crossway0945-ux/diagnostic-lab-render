import { task1Schema } from "../schemas/task1Schema.js";
import { task2Schema } from "../schemas/task2Schema.js";

const commonRequired = [
  "taskType",
  "essayType",
  "visualType",
  "targetBand",
  "estimatedBandRange",
  "mainScoreLimitingFactor",
  "mostUrgentRepair",
  "criteriaScores",
  "kruPomScores",
  "top3Issues",
  "feedbackCards",
  "paragraphFeedback",
  "revisedThesis",
  "revisedParagraphSuggestions",
  "practicePlan",
  "warnings",
  "disclaimer"
];

const task1Required = [
  "taskAchievementCapReason",
  "criticalOverviewError",
  "overviewAccuracyStatus",
  "mainTrendRecognition",
  "dataSelectionQuality",
  "unsafeGeneralisationDetected",
  "majorOmissionDetected",
  "contradictionDetected",
  "dataAccuracyRisk",
  "groupingLogicStatus",
  "recommendedTaskAchievementRange",
  "overallBandCap",
  "strictModeApplied"
];

const task2Required = [
  "promptCoverageStatus",
  "thesisRouteStatus",
  "brokenPromiseDetected",
  "bodyRouteAlignmentStatus",
  "SARExampleStatus",
  "intruderSentenceDetected",
  "conclusionClosureStatus",
  "taskResponseCapReason",
  "overallBandCap",
  "strictModeApplied"
];

export function buildDiagnosticResponseFormat(taskType) {
  return {
    type: "json_schema",
    name: taskType === "Task 1" ? "ielts_task1_diagnostic_report" : "ielts_task2_diagnostic_report",
    strict: true,
    schema: taskType === "Task 1" ? buildTask1ResponseSchema() : buildTask2ResponseSchema()
  };
}

function buildTask1ResponseSchema() {
  return objectSchema({
    ...commonProperties("Task 1"),
    ...task1Properties()
  }, [...commonRequired, ...task1Required]);
}

function buildTask2ResponseSchema() {
  return objectSchema({
    ...commonProperties("Task 2"),
    ...task2Properties()
  }, [...commonRequired, ...task2Required]);
}

function commonProperties(taskType) {
  return {
    taskType: stringSchema(),
    essayType: stringSchema(),
    visualType: stringSchema(),
    targetBand: stringSchema(),
    estimatedBandRange: stringSchema(),
    mainScoreLimitingFactor: stringSchema(),
    mostUrgentRepair: stringSchema(),
    criteriaScores: criteriaScoresSchema(taskType),
    kruPomScores: kruPomScoresSchema(taskType),
    top3Issues: arraySchema(topIssueSchema()),
    feedbackCards: arraySchema(feedbackCardSchema()),
    paragraphFeedback: arraySchema(paragraphFeedbackSchema()),
    revisedThesis: stringSchema(),
    revisedParagraphSuggestions: arraySchema(stringSchema()),
    practicePlan: arraySchema(practicePlanItemSchema()),
    warnings: arraySchema(stringSchema()),
    disclaimer: stringSchema()
  };
}

function task1Properties() {
  return {
    taskAchievementCapReason: stringSchema(),
    criticalOverviewError: booleanSchema(),
    overviewAccuracyStatus: stringSchema(),
    mainTrendRecognition: stringSchema(),
    dataSelectionQuality: stringSchema(),
    unsafeGeneralisationDetected: booleanSchema(),
    majorOmissionDetected: booleanSchema(),
    contradictionDetected: booleanSchema(),
    dataAccuracyRisk: stringSchema(),
    groupingLogicStatus: stringSchema(),
    recommendedTaskAchievementRange: stringSchema(),
    overallBandCap: stringSchema(),
    strictModeApplied: booleanSchema()
  };
}

function task2Properties() {
  return {
    promptCoverageStatus: stringSchema(),
    thesisRouteStatus: stringSchema(),
    brokenPromiseDetected: booleanSchema(),
    bodyRouteAlignmentStatus: stringSchema(),
    SARExampleStatus: stringSchema(),
    intruderSentenceDetected: booleanSchema(),
    conclusionClosureStatus: stringSchema(),
    taskResponseCapReason: stringSchema(),
    overallBandCap: stringSchema(),
    strictModeApplied: booleanSchema()
  };
}

function criteriaScoresSchema(taskType) {
  const criteria = taskType === "Task 1"
    ? task1Schema.requiredCriteria
    : task2Schema.requiredCriteria;

  return objectSchema(
    Object.fromEntries(criteria.map((name) => [name, criterionScoreSchema()])),
    criteria
  );
}

function kruPomScoresSchema(taskType) {
  const frameworks = taskType === "Task 1"
    ? task1Schema.requiredFramework
    : task2Schema.requiredFramework;

  return objectSchema(
    Object.fromEntries(frameworks.map((name) => [name, frameworkScoreSchema()])),
    frameworks
  );
}

function criterionScoreSchema() {
  return objectSchema({
    range: stringSchema(),
    diagnosis: stringSchema(),
    evidence: stringSchema()
  }, ["range", "diagnosis", "evidence"]);
}

function frameworkScoreSchema() {
  return objectSchema({
    status: stringSchema(),
    diagnosis: stringSchema()
  }, ["status", "diagnosis"]);
}

function topIssueSchema() {
  return objectSchema({
    issueType: stringSchema(),
    title: stringSchema(),
    severity: stringSchema(),
    criteria: arraySchema(stringSchema()),
    summary: stringSchema(),
    feedbackCardId: stringSchema(),
    exactSentence: stringSchema(),
    paragraphLocation: stringSchema(),
    whyItLimitsBand: stringSchema()
  }, [
    "issueType",
    "title",
    "severity",
    "criteria",
    "summary",
    "feedbackCardId",
    "exactSentence",
    "paragraphLocation",
    "whyItLimitsBand"
  ]);
}

function feedbackCardSchema() {
  return objectSchema({
    issueType: stringSchema(),
    severity: stringSchema(),
    criteria: arraySchema(stringSchema()),
    framework: arraySchema(stringSchema()),
    paragraphLocation: stringSchema(),
    exactSentence: stringSchema(),
    sentenceFunction: stringSchema(),
    whyItLimitsBand: stringSchema(),
    kruPomDiagnosis: stringSchema(),
    targetedRevision: stringSchema(),
    whyRevisionIsStronger: stringSchema(),
    studentAction: stringSchema()
  }, [
    "issueType",
    "severity",
    "criteria",
    "framework",
    "paragraphLocation",
    "exactSentence",
    "sentenceFunction",
    "whyItLimitsBand",
    "kruPomDiagnosis",
    "targetedRevision",
    "whyRevisionIsStronger",
    "studentAction"
  ]);
}

function paragraphFeedbackSchema() {
  return objectSchema({
    paragraphLocation: stringSchema(),
    exactEvidence: stringSchema(),
    diagnosis: stringSchema(),
    action: stringSchema()
  }, ["paragraphLocation", "exactEvidence", "diagnosis", "action"]);
}

function practicePlanItemSchema() {
  return objectSchema({
    day: integerSchema(),
    title: stringSchema(),
    task: stringSchema()
  }, ["day", "title", "task"]);
}

function objectSchema(properties, required) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}

function arraySchema(items) {
  return {
    type: "array",
    items
  };
}

function stringSchema() {
  return { type: "string" };
}

function booleanSchema() {
  return { type: "boolean" };
}

function integerSchema() {
  return { type: "integer" };
}
