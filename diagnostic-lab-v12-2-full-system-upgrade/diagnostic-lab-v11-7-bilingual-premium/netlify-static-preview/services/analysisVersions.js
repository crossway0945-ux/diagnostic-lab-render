export const ANALYSIS_VERSIONS = Object.freeze({
  appVersion: "12.2.0",
  engineVersion: "ielts-diagnostic-engine-v12.2",
  rubricVersion: "kru-pom-ielts-writing-v12.2",
  promptVersion: "ielts-diagnostic-prompt-v12.2",
  reportSchemaVersion: "ielts-diagnostic-report-v12.2"
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
