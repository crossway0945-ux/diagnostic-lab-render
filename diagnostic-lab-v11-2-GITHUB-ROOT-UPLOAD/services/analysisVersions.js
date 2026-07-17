export const ANALYSIS_VERSIONS = Object.freeze({
  appVersion: "11.2.0",
  engineVersion: "ielts-diagnostic-engine-v11.2",
  rubricVersion: "kru-pom-ielts-writing-v11.2",
  promptVersion: "ielts-diagnostic-prompt-v11.2",
  reportSchemaVersion: "ielts-diagnostic-report-v11.2"
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
