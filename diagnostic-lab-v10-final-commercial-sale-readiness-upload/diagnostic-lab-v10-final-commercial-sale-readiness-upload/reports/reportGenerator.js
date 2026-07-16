export function buildPrintReportMetadata(analysis) {
  return {
    productName: "IELTS Writing 7+ Diagnostic Lab",
    generatedDate: new Date(analysis.generatedAt || Date.now()).toLocaleDateString("en-GB"),
    taskType: analysis.taskType,
    estimatedBandRange: analysis.estimatedBandRange,
    topIssues: (analysis.top3Issues || []).map((issue) => issue.summary || issue.issueType),
    disclaimer: analysis.disclaimer
  };
}
