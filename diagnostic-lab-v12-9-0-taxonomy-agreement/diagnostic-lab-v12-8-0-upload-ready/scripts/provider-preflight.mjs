// Provider access preflight for model migration (e.g. gpt-5.5 -> gpt-5.6-sol).
//
// Run this BEFORE changing the production OPENAI_MODEL on Render:
//
//   OPENAI_API_KEY=... OPENAI_MODEL=gpt-5.6-sol node scripts/provider-preflight.mjs
//
// Optional: OPENAI_REASONING_EFFORT=max to verify the effort level is accepted.
//
// It verifies, against the real OpenAI Responses API:
//   1. authentication succeeds
//   2. the organisation has access to the requested model
//   3. the model returns a completed (non-truncated, non-refused) response
//   4. strict JSON-schema output works
//   5. the reasoning configuration is accepted
// and prints the exact provider error if any step fails.
//
// It never falls back to another model, never fabricates a result, and never prints the API key.

import { runProviderHealthCheck, getAnalyzerHealth } from "../services/aiAnalyzer.js";

const model = String(process.env.OPENAI_MODEL || "").trim();
const effort = String(process.env.OPENAI_REASONING_EFFORT || "medium").trim();

if (!process.env.OPENAI_API_KEY) {
  console.error("PREFLIGHT FAIL: OPENAI_API_KEY is not set. Set the key and rerun.");
  process.exit(1);
}
if (!model) {
  console.error("PREFLIGHT FAIL: OPENAI_MODEL is not set. Example: OPENAI_MODEL=gpt-5.6-sol");
  process.exit(1);
}

console.log(`[preflight] model=${model} reasoningEffort=${effort}`);
const startedAt = Date.now();

try {
  const result = await runProviderHealthCheck();
  const latencyMs = Date.now() - startedAt;
  const health = getAnalyzerHealth();
  if (result.ok) {
    console.log("PREFLIGHT PASS");
    console.log(JSON.stringify({
      modelName: result.modelName,
      reasoningEffort: health.reasoningEffort,
      latencyMs,
      endpoint: result.endpoint
    }, null, 2));
    process.exit(0);
  }
  console.error("PREFLIGHT FAIL: provider responded but the strict-JSON health check did not validate.");
  console.error(JSON.stringify({ modelName: result.modelName, latencyMs }, null, 2));
  process.exit(1);
} catch (error) {
  const latencyMs = Date.now() - startedAt;
  console.error("PREFLIGHT FAIL: the provider rejected the request. Do not switch production to this model.");
  console.error(JSON.stringify({
    model,
    reasoningEffort: effort,
    latencyMs,
    errorCode: error?.errorCode || "PROVIDER_ERROR",
    providerStatus: error?.providerStatus ?? null,
    debugHint: error?.debugHint || error?.message || "unknown provider error"
  }, null, 2));
  process.exit(1);
}
