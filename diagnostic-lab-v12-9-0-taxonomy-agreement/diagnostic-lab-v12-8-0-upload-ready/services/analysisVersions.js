export const ANALYSIS_VERSIONS = Object.freeze({
  // V12.9.7 adds evidence-backed framework ratings, final issue/action projection parity,
  // post-merge thresholding and all-plane PDF text integrity. The IELTS/Kru Pom rubric is frozen.
  appVersion: "12.9.7",
  engineVersion: "ielts-diagnostic-engine-v12.9.7",
  rubricVersion: "kru-pom-ielts-writing-v12.3.0",
  promptVersion: "ielts-diagnostic-prompt-v12.8.0",
  reportSchemaVersion: "ielts-diagnostic-report-v12.9.7",
  feedbackSchemaVersion: "feedback-integrity-v12.9.7",
  issueTaxonomyVersion: "issue-taxonomy-v12.9.7",
  evidenceValidatorVersion: "framework-evidence-contract-v12.9.7",
  revisionValidatorVersion: "revision-alignment-v12.8.0",
  pdfTextIntegrityVersion: "pdf-text-integrity-v12.9.7",
  routeClassifierVersion: "task-aware-route-model-v12.8.0",
  grammarValidatorVersion: "syntactic-head-agreement-v12.9.0",
  scoringOrchestrationVersion: "score-freeze-v12.8.0",
  studentViewContractVersion: "student-report-allowlist-v12.9.7"
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
