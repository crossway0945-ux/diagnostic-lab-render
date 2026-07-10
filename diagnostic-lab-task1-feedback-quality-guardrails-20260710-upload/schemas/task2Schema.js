export const task2Schema = {
  taskType: "Task 2",
  requiredCriteria: [
    "Task Response",
    "Coherence & Cohesion",
    "Lexical Resource",
    "Grammatical Range & Accuracy"
  ],
  requiredFramework: [
    "Essay Type Recognition",
    "Prompt Coverage",
    "Thesis Route Clarity",
    "Body Paragraph Route Alignment",
    "Topic Sentence Strength",
    "Explanation Depth",
    "SAR Example Quality",
    "Link Back Control",
    "Conclusion Closure",
    "LFC CPC Control",
    "Template / Memorized Pattern Risk",
    "Vocabulary Precision",
    "Grammar Risk",
    "Paragraph Balance"
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
  ]
};
