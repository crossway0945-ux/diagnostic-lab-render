export const DEFAULT_ANALYSIS_VERSIONS = Object.freeze({
  canonicalEngineVersion: "10.0.0",
  rubricVersion: "2026.07.16",
  promptVersion: "10.0.0",
  reportSchemaVersion: "10.0.0"
});

export function resolveAnalysisVersions(overrides = {}) {
  return Object.freeze(Object.fromEntries(
    Object.entries(DEFAULT_ANALYSIS_VERSIONS).map(([key, fallback]) => [
      key,
      normalizeVersion(overrides?.[key]) || fallback
    ])
  ));
}

function normalizeVersion(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 80);
}
