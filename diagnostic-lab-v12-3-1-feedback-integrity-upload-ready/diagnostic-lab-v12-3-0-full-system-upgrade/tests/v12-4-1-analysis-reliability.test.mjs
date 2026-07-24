// V12.4.1 analysis reliability, provider observability and safe failure surfacing.
//
// Provider-dependent behaviour is exercised with a mocked global fetch (no real OpenAI key), so the
// truncation/refusal/schema paths are verified deterministically. Health semantics and admin gating
// are verified against the REAL server.
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeWriting,
  getAnalyzerHealth,
  runProductionContractCheck,
  runProviderHealthCheck
} from "../services/aiAnalyzer.js";
import {
  createAnalysisFailureLog,
  runStorageSelfTest,
  toSafeFailureRecord
} from "../services/analysisFailureLog.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
assert.equal(ANALYSIS_VERSIONS.appVersion, "12.4.1");

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

function mockResponse({ ok = true, status = 200, json = {}, text = "" }) {
  return {
    ok,
    status,
    headers: { get: () => "application/json" },
    async json() { return json; },
    async text() { return text || JSON.stringify(json); }
  };
}

function installProviderMock(handler) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const body = options?.body ? JSON.parse(options.body) : null;
    calls.push({ url: String(url), body });
    return handler(calls.length, body);
  };
  return calls;
}

function restore() {
  globalThis.fetch = ORIGINAL_FETCH;
  for (const key of ["OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_REASONING_EFFORT", "OPENAI_MAX_OUTPUT_TOKENS", "OPENAI_RETRY_MAX_OUTPUT_TOKENS"]) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
}

const TASK2_PAYLOAD = {
  taskType: "Task 2",
  essayType: "Opinion Essay",
  prompt: "Some people think that public libraries are no longer necessary because information is now available online. To what extent do you agree or disagree?",
  writing: [
    "Some people believe public libraries are outdated, but I strongly disagree because they guarantee fair access to information and a focused place to study.",
    "The first reason is fair access, because not every family can afford a fast internet connection, so free libraries let low-income students research and finish their assignments.",
    "The second reason is the quality of the study environment, because a quiet library supports concentration and trained librarians guide readers towards reliable sources.",
    "In conclusion, although the internet is convenient, public libraries remain essential because they protect equal access and offer a calm, guided place for serious study."
  ].join("\n\n"),
  targetBand: "7.0",
  reportLanguage: "en"
};

// ---------------------------------------------------------------------------
// 1. Token truncation: max_output_tokens -> exactly one larger retry -> safe failure.
// ---------------------------------------------------------------------------
try {
  process.env.OPENAI_API_KEY = "test-key-not-real";
  process.env.OPENAI_MODEL = "gpt-test";
  delete process.env.OPENAI_MAX_OUTPUT_TOKENS;
  delete process.env.OPENAI_RETRY_MAX_OUTPUT_TOKENS; // default 24000
  const incompletePayload = {
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    usage: { input_tokens: 900, output_tokens: 6000, output_tokens_details: { reasoning_tokens: 5800 } }
  };
  const calls = installProviderMock(() => mockResponse({ json: incompletePayload }));
  await assert.rejects(
    () => analyzeWriting({ ...TASK2_PAYLOAD }),
    (error) => {
      assert.equal(error.errorCode, "PROVIDER_MAX_OUTPUT_TOKENS", "a token-budget truncation gets its own code");
      assert.equal(error.retryAttempted, true, "exactly one retry must have been attempted");
      assert.equal(error.incompleteReason, "max_output_tokens");
      // The student-facing message is safe and never the bare generic text.
      assert.match(error.message, /too long|No credit was used/i);
      return true;
    }
  );
  assert.equal(calls.length, 2, "one first attempt + one retry = two provider calls");
  assert.equal(calls[0].body.max_output_tokens, getAnalyzerHealth().maxOutputTokens, "first attempt uses the base ceiling");
  assert.equal(calls[1].body.max_output_tokens, getAnalyzerHealth().retryMaxOutputTokens, "retry uses the larger OPENAI_RETRY_MAX_OUTPUT_TOKENS ceiling");
  assert.ok(calls[1].body.max_output_tokens > calls[0].body.max_output_tokens, "the retry ceiling must exceed the first");
} finally {
  restore();
}

// ---------------------------------------------------------------------------
// 2. A non-token incomplete reason is NOT retried with more tokens (it would not help).
// ---------------------------------------------------------------------------
try {
  process.env.OPENAI_API_KEY = "test-key-not-real";
  process.env.OPENAI_MODEL = "gpt-test";
  const calls = installProviderMock(() => mockResponse({
    json: { status: "incomplete", incomplete_details: { reason: "content_filter" } }
  }));
  await assert.rejects(
    () => analyzeWriting({ ...TASK2_PAYLOAD }),
    (error) => {
      assert.equal(error.errorCode, "PROVIDER_INCOMPLETE_RESPONSE");
      assert.equal(error.incompleteReason, "content_filter");
      return true;
    }
  );
  assert.equal(calls.length, 1, "a non-token incomplete reason must not trigger a token-boosting retry");
} finally {
  restore();
}

// ---------------------------------------------------------------------------
// 3. Refusal and schema errors get distinct, safe codes.
// ---------------------------------------------------------------------------
try {
  process.env.OPENAI_API_KEY = "test-key-not-real";
  process.env.OPENAI_MODEL = "gpt-test";
  installProviderMock(() => mockResponse({
    json: { status: "completed", output: [{ content: [{ type: "refusal", refusal: "I can't help with that." }] }] }
  }));
  await assert.rejects(() => analyzeWriting({ ...TASK2_PAYLOAD }), (error) => {
    assert.equal(error.errorCode, "PROVIDER_REFUSAL");
    return true;
  });
} finally {
  restore();
}

try {
  process.env.OPENAI_API_KEY = "test-key-not-real";
  process.env.OPENAI_MODEL = "gpt-test";
  installProviderMock(() => mockResponse({
    ok: false,
    status: 400,
    json: { error: { message: "Invalid schema for response_format 'json_schema': unsupported keyword." } }
  }));
  await assert.rejects(() => analyzeWriting({ ...TASK2_PAYLOAD }), (error) => {
    assert.equal(error.errorCode, "PROVIDER_SCHEMA_ERROR");
    // The safe message must never contain the raw provider body.
    assert.doesNotMatch(error.message, /unsupported keyword/);
    return true;
  });
} finally {
  restore();
}

// ---------------------------------------------------------------------------
// 4. Provider connectivity (Level 1) and production-contract (Level 2) self-tests.
// ---------------------------------------------------------------------------
try {
  process.env.OPENAI_API_KEY = "test-key-not-real";
  process.env.OPENAI_MODEL = "gpt-test";
  // Level 1: a valid {"ok":true} health payload.
  installProviderMock(() => mockResponse({
    json: { status: "completed", output: [{ content: [{ type: "output_text", text: '{"ok":true}' }] }] }
  }));
  const level1 = await runProviderHealthCheck();
  assert.equal(level1.ok, true);
  assert.equal(level1.modelName, "gpt-test");
} finally {
  restore();
}

try {
  process.env.OPENAI_API_KEY = "test-key-not-real";
  process.env.OPENAI_MODEL = "gpt-test";
  // Level 2 failing at the provider stage: an auth rejection.
  installProviderMock(() => mockResponse({ ok: false, status: 401, json: { error: { message: "invalid api key" } } }));
  const contract = await runProductionContractCheck();
  assert.equal(contract.ok, false);
  assert.equal(contract.stage, "provider_request", "an auth failure is reported at the provider_request stage");
  assert.equal(contract.errorCode, "PROVIDER_AUTH_ERROR");
  assert.equal(contract.modelName, "gpt-test");
  // The contract result must not leak the raw provider body.
  assert.doesNotMatch(JSON.stringify(contract), /invalid api key/);
} finally {
  restore();
}

try {
  process.env.OPENAI_API_KEY = "test-key-not-real";
  process.env.OPENAI_MODEL = "gpt-test";
  // Level 2 failing at the incomplete stage.
  installProviderMock(() => mockResponse({ json: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } } }));
  const contract = await runProductionContractCheck();
  assert.equal(contract.ok, false);
  assert.equal(contract.stage, "provider_incomplete");
  assert.equal(contract.errorCode, "PROVIDER_MAX_OUTPUT_TOKENS");
} finally {
  restore();
}

// ---------------------------------------------------------------------------
// 5. Safe failure log: bounded, whitelisted, no essay/prompt/key.
// ---------------------------------------------------------------------------
const safe = toSafeFailureRecord({
  requestId: "analysis-abc",
  ownerAccountId: "teacher-sun",
  accountRole: "student",
  taskType: "Task 2",
  essayOrVisualType: "Opinion Essay",
  providerModel: "gpt-5.6-sol",
  reasoningEffort: "high",
  failureStage: "provider_incomplete",
  errorCode: "PROVIDER_MAX_OUTPUT_TOKENS",
  providerStatus: 502,
  incompleteReason: "max_output_tokens",
  retryAttempted: true,
  validatorIssueCodes: ["EVIDENCE_NOT_FOUND"],
  durationMs: 1234,
  // These must be dropped:
  writing: "SECRET ESSAY TEXT",
  prompt: "SECRET PROMPT",
  apiKey: "sk-should-not-appear",
  quotaDeducted: true
});
assert.equal(safe.quotaDeducted, false, "the failure log always records quotaDeducted: false");
assert.equal(safe.ownerHash.length, 12, "the owner id is hashed, not stored in the clear");
assert.notEqual(safe.ownerHash, "teacher-sun");
const safeJson = JSON.stringify(safe);
assert.doesNotMatch(safeJson, /SECRET ESSAY TEXT|SECRET PROMPT|sk-should-not-appear|teacher-sun/);
assert.ok(!("writing" in safe) && !("prompt" in safe) && !("apiKey" in safe));

const failureDir = await mkdtemp(path.join(os.tmpdir(), "diag-fail-"));
try {
  process.env.DIAGNOSTIC_DATA_DIR = failureDir;
  const log = createAnalysisFailureLog({ rootDir: failureDir, limit: 3 });
  for (let index = 0; index < 5; index += 1) {
    await log.append({ requestId: `r-${index}`, errorCode: "PROVIDER_TIMEOUT", taskType: "Task 2" });
  }
  const records = await log.list();
  assert.equal(records.length, 3, "the log is bounded to its limit");
  assert.equal(records[0].requestId, "r-4", "newest first");
  const storage = await runStorageSelfTest({ rootDir: failureDir });
  assert.equal(storage.ok, true);
  assert.equal(storage.write && storage.read && storage.verify && storage.delete, true);
  await log.clear();
  assert.deepEqual(await log.list(), []);
} finally {
  delete process.env.DIAGNOSTIC_DATA_DIR;
  await rm(failureDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 6. Real server: honest health semantics + admin gating + no HTML from /api.
// ---------------------------------------------------------------------------
process.env.PORT = "0";
process.env.HOST = "127.0.0.1";
process.env.DIAGNOSTIC_ALLOW_LOCAL_ENGINE = "true";
delete process.env.OPENAI_API_KEY;
const { server } = await import("../server.js");
if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.providerConnectivityStatus, "unknown", "connectivity is unknown until a real check runs");
  assert.equal(health.diagnosticEngineConnected, false, "health must not equate configuration with connectivity");
  assert.equal(health.appVersion, "12.4.1");
  assert.ok(Number(health.retryMaxOutputTokens) > 0);
  assert.equal(typeof health.productionContractCheckStatus, "string");

  // Admin diagnostics require an admin session.
  for (const route of [
    "/api/admin/diagnostics/provider-connectivity",
    "/api/admin/diagnostics/production-contract",
    "/api/admin/diagnostics/storage",
    "/api/admin/diagnostics/clear-failures"
  ]) {
    const response = await fetch(`${base}${route}`, { method: "POST" });
    assert.equal(response.status, 403, `${route} must require an admin session`);
    assert.match(response.headers.get("content-type") || "", /application\/json/);
  }
  for (const route of ["/api/admin/diagnostics/system", "/api/admin/diagnostics/analysis-failures"]) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 403, `${route} must require an admin session`);
  }
} finally {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

// ---------------------------------------------------------------------------
// 7. No secret literals appear anywhere in the changed backend source.
// ---------------------------------------------------------------------------
for (const file of ["services/aiAnalyzer.js", "services/apiRouter.js", "services/analysisFailureLog.js"]) {
  const source = await readFile(path.join(appRoot, file), "utf8");
  assert.doesNotMatch(source, /sk-[A-Za-z0-9]{20}/, `${file} must not contain an API key literal`);
}

console.log("V12.4.1 analysis reliability: token-truncation retry ceiling, non-token no-retry, refusal/schema codes, Level 1/2 provider checks with stage reporting, safe bounded failure log, honest health, admin gating verified.");
