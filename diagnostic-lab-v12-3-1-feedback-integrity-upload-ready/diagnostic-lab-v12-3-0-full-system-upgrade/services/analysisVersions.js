export const ANALYSIS_VERSIONS = Object.freeze({
  // V12.5.0 is the async-render orchestration/reliability release. It changes transport, provider
  // lifecycle, durable jobs and recovery — NOT scoring, rubric, prompt, report/feedback schema,
  // taxonomy or revision-validation logic — so those versions are unchanged by design. This keeps
  // existing saved reports and duplicate hashing stable. Only appVersion moves to 12.5.0.
  appVersion: "12.5.0",
  engineVersion: "ielts-diagnostic-engine-v12.4.0",
  rubricVersion: "kru-pom-ielts-writing-v12.3.0",
  promptVersion: "ielts-diagnostic-prompt-v12.3.1",
  reportSchemaVersion: "ielts-diagnostic-report-v12.4.0",
  feedbackSchemaVersion: "feedback-integrity-v12.4.0",
  issueTaxonomyVersion: "issue-taxonomy-v12.3.5",
  revisionValidatorVersion: "revision-alignment-v12.4.0"
});

// Orchestration/transport version for the async-render architecture. Deliberately kept OUT of
// ANALYSIS_VERSIONS so the saved-report metadata contract (and its deep-equality tests) stays stable;
// it is surfaced on /api/health and recorded on each durable job instead.
export const ORCHESTRATION_VERSION = "async-render-v12.5.0";

export function attachAnalysisVersions(payload = {}) {
  return Object.assign(payload, ANALYSIS_VERSIONS);
}

export function analysisVersionMetadata(source = {}) {
  return Object.fromEntries(Object.keys(ANALYSIS_VERSIONS).map((key) => [
    key,
    String(source[key] || ANALYSIS_VERSIONS[key])
  ]));
}
