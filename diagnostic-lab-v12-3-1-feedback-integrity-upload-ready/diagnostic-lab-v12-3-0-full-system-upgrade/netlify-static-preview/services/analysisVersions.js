export const ANALYSIS_VERSIONS = Object.freeze({
  appVersion: "12.3.4",
  engineVersion: "ielts-diagnostic-engine-v12.3.4",
  rubricVersion: "kru-pom-ielts-writing-v12.3.0",
  promptVersion: "ielts-diagnostic-prompt-v12.3.1",
  reportSchemaVersion: "ielts-diagnostic-report-v12.3.4",
  feedbackSchemaVersion: "feedback-integrity-v12.3.4",
  issueTaxonomyVersion: "issue-taxonomy-v12.3.4",
  revisionValidatorVersion: "revision-alignment-v12.3.4"
});

export function attachAnalysisVersions(payload = {}) {
  return Object.assign(payload, ANALYSIS_VERSIONS);
}

export function analysisVersionMetadata(source = {}) {
  return Object.fromEntries(Object.keys(ANALYSIS_VERSIONS).map((key) => [
    key,
    String(source[key] || ANALYSIS_VERSIONS[key])
  ]));
}
