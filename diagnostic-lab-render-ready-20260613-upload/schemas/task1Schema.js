export const task1Schema = {
  taskType: "Task 1",
  requiredCriteria: [
    "Task Achievement",
    "Coherence & Cohesion",
    "Lexical Resource",
    "Grammatical Range & Accuracy"
  ],
  requiredFramework: [
    "Visual Understanding",
    "Prompt Coverage",
    "Overview Quality",
    "Data Selection",
    "Grouping Logic",
    "Data Accuracy",
    "Comparison Precision",
    "Report Tone Control",
    "Task 1 Objective Reporting",
    "LFC CPC Control",
    "Vocabulary Precision",
    "Grammar Risk"
  ],
  feedbackCardFields: [
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
  ],
  strictGuardrailFields: [
    "taskAchievementCapReason",
    "overviewAccuracyStatus",
    "criticalOverviewError",
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
  ]
};
