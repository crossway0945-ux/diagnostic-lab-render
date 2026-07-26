export const ANALYSIS_VERSIONS = Object.freeze({
  // V12.7.0 replaces keyword-only route classification and nearest-noun agreement matching with
  // canonical task-aware and syntactic-head validators. The IELTS/Kru Pom rubric remains frozen.
  appVersion: "12.7.0",
  engineVersion: "ielts-diagnostic-engine-v12.7.0",
  rubricVersion: "kru-pom-ielts-writing-v12.3.0",
  promptVersion: "ielts-diagnostic-prompt-v12.7.0",
  reportSchemaVersion: "ielts-diagnostic-report-v12.7.0",
  feedbackSchemaVersion: "feedback-integrity-v12.7.0",
  issueTaxonomyVersion: "issue-taxonomy-v12.7.0",
  evidenceValidatorVersion: "evidence-assertion-v12.7.0",
  revisionValidatorVersion: "revision-alignment-v12.7.0",
  pdfTextIntegrityVersion: "pdf-text-integrity-v12.7.0",
  routeClassifierVersion: "task-aware-route-model-v12.7.0",
  grammarValidatorVersion: "syntactic-head-agreement-v12.7.0",
  scoringOrchestrationVersion: "score-freeze-v12.7.0",
  studentViewContractVersion: "student-report-allowlist-v12.7.0"
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
