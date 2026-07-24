export const ANALYSIS_VERSIONS = Object.freeze({
  // V12.3.6 is a frontend-bootstrap/asset-delivery hotfix only. The scoring engine, rubric, prompt,
  // report schema, feedback schema, taxonomy and revision validator logic are unchanged, so their
  // versions stay at 12.3.5 by design.
  appVersion: "12.4.0",
  engineVersion: "ielts-diagnostic-engine-v12.4.0",
  rubricVersion: "kru-pom-ielts-writing-v12.3.0",
  promptVersion: "ielts-diagnostic-prompt-v12.3.1",
  reportSchemaVersion: "ielts-diagnostic-report-v12.4.0",
  feedbackSchemaVersion: "feedback-integrity-v12.4.0",
  issueTaxonomyVersion: "issue-taxonomy-v12.3.5",
  revisionValidatorVersion: "revision-alignment-v12.4.0"
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
