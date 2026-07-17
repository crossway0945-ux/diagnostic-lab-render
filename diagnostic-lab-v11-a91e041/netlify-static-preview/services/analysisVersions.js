export const ANALYSIS_VERSIONS = Object.freeze({
  appVersion: "11.0.0",
  engineVersion: "ielts-diagnostic-engine-v11",
  rubricVersion: "kru-pom-ielts-writing-v11",
  promptVersion: "ielts-diagnostic-prompt-v11",
  reportSchemaVersion: "ielts-diagnostic-report-v11"
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
