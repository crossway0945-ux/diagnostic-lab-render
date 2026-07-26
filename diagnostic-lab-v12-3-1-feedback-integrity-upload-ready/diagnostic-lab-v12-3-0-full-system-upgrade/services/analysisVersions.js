export const ANALYSIS_VERSIONS = Object.freeze({
  // V12.6.0 upgrades canonical evidence, issue/report consistency, revision fidelity and PDF text
  // integrity. The IELTS/Kru Pom scoring rubric stays frozen at v12.3.0, while every contract changed
  // by this release gets its own v12.6.0 marker. Async transport remains the audited v12.5.0 layer.
  appVersion: "12.6.0",
  engineVersion: "ielts-diagnostic-engine-v12.6.0",
  rubricVersion: "kru-pom-ielts-writing-v12.3.0",
  promptVersion: "ielts-diagnostic-prompt-v12.6.0",
  reportSchemaVersion: "ielts-diagnostic-report-v12.6.0",
  feedbackSchemaVersion: "feedback-integrity-v12.6.0",
  issueTaxonomyVersion: "issue-taxonomy-v12.6.0",
  evidenceValidatorVersion: "evidence-assertion-v12.6.0",
  revisionValidatorVersion: "revision-alignment-v12.6.0",
  pdfTextIntegrityVersion: "pdf-text-integrity-v12.6.0"
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
