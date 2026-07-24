# V12.4.1 — Analysis Reliability, Provider Observability & Failure Diagnostics Hotfix

Scope: **Phase 1** of the reliability brief — the outage fix plus the visibility to
diagnose it. The Render-native async-render job system (brief §7) is intentionally
**deferred to 12.4.2**; it changes transport, not the provider/token/schema cause of
the current failure. Do **not** deploy automatically.

---

## 1. Confirmed root causes (from the shipped 12.4.0 code)

| # | Root cause | Evidence | Fix |
|---|---|---|---|
| A | `/api/health` equated configuration with connectivity | `apiRouter.js` set `diagnosticEngineConnected = configured && modelConfigured` — no real request | Health now reports `providerConnectivityStatus` (`unknown` until a real admin check runs); `diagnosticEngineConnected` reflects the cached real check only. |
| B | Every specific failure collapsed to one generic message | `PROVIDER_STUDENT_MESSAGES` lacked entries for incomplete/refusal/schema/validation codes → fell back to the exact "Analysis could not be completed" string in the screenshot; no `requestId` reached the UI | Complete message map; `requestId` on every response; teacher/admin also get `errorCode` + `failureStage`. |
| C | No working async path on Render | `shouldUseAsyncAnalysis()` requires Netlify blobs and `invokeAnalyzeWorker` calls a Netlify function URL | Left as sync for this phase (sync works; async-render is 12.4.2). Documented. |
| D | Thin token/truncation handling | single ceiling; retry bumped only `+2000`; incomplete never specialised | Separate `OPENAI_RETRY_MAX_OUTPUT_TOKENS`; `max_output_tokens` truncation → `PROVIDER_MAX_OUTPUT_TOKENS` → one larger retry; a non-token incomplete reason is not retried with more tokens. |

**Most-probable actual production failure (still to be confirmed by the owner):** health
showed `maxOutputTokens: 8000` with `reasoningEffort: high`. On GPT-5.6, high reasoning
consumes output budget as reasoning tokens before the JSON completes, so the report was
very likely truncated (`status: incomplete, reason: max_output_tokens`). This release both
**raises the ceilings** (16000 first / 24000 retry) and **makes the failure visible** via the
admin Production Output Contract check. The exact code could not be reproduced here (no
OpenAI key in the build environment); the admin check or Render logs will confirm it.

## 2. Versioning (patch)

- package + `appVersion` → **12.4.1**.
- `engineVersion` stays `ielts-diagnostic-engine-v12.4.0`, and rubric/prompt/taxonomy/
  revision-validator/report-schema/feedback-schema versions are **unchanged** — the
  diagnostic and scoring logic did not change; only orchestration, observability and
  provider handling did. This keeps existing reports and duplicate hashing stable.
- Frontend cache token → `diagnostic-v12-4-1-analysis-reliability`.

## 3. New observability

- **Honest `/api/health`**: `providerConnectivityStatus`, `lastProviderCheckAt/Model/ErrorCode`, `productionContractCheckStatus`, `retryMaxOutputTokens`. No OpenAI call on public health.
- **Admin-session-only diagnostics** (`/api/admin/diagnostics/*`): `provider-connectivity` (Level 1), `production-contract` (Level 2 — runs the real schema + full validation/projection pipeline on a synthetic essay and reports the exact failing stage: `provider_request` / `provider_incomplete` / `provider_refusal` / `response_extraction` / `json_parse` / `canonical_analysis` / `report_validation` / `student_view_projection`), `storage` self-test, `analysis-failures` (view), `clear-failures`, `system`.
- **Admin UI**: a "System Diagnostics" panel on `/admin` with one button per check.
- **Request IDs**: every analysis submission gets `analysis-<ts>-<rand>`; returned on success and failure and recorded in the failure log.
- **Safe bounded failure log** (`.diagnostic-analysis-failures.json` under `DATA_DIR`, last 50): only safe metadata — hashed owner id, task/essay type, model, effort, stage, error code, provider status, incomplete reason, retry, validator issue codes, duration, `quotaDeducted: false`. Never the essay, prompt, image, key, token or raw provider output.
- **Error codes**: `PROVIDER_AUTH_ERROR`, `PROVIDER_MODEL_ERROR`, `PROVIDER_RATE_LIMIT`, `PROVIDER_TIMEOUT`, `PROVIDER_NETWORK_ERROR`, `PROVIDER_INCOMPLETE_RESPONSE`, `PROVIDER_MAX_OUTPUT_TOKENS`, `PROVIDER_REFUSAL`, `PROVIDER_JSON_PARSE_ERROR`, `PROVIDER_SCHEMA_ERROR`, `REPORT_OUTPUT_VALIDATION_FAILED`, `STORAGE_COMMIT_FAILED`, `INTERNAL_ERROR` — each with a specific, safe student message.

## 4. Files changed

`services/aiAnalyzer.js` (retry ceiling, truncation/refusal/schema codes, safe usage, `runProductionContractCheck`, message map), `services/apiRouter.js` (honest health, admin diagnostics, requestId, role-aware error responses, failure persistence), **new** `services/analysisFailureLog.js`, `script.js` + `styles.css` (error reference id + copy), `admin.html` + `admin.js` (System Diagnostics panel), `render.yaml` + `RENDER_ENV_TEMPLATE.txt` (token/timeout values + retry key), `README.md`, `services/analysisVersions.js` + `package.json` + `package-lock.json` + `index.html` (version/cache token). **New test** `tests/v12-4-1-analysis-reliability.test.mjs`.

## 5. Files deliberately NOT touched

Pricing (2,999 THB / 10 analyses / 60 days), authentication, quota/credit accounting,
duplicate hashing, scoring engine, LFC-CPC / SAR / TEEL / taxonomy / revision-safety
logic, the V12.3.6 frontend bootstrap, and the premium PDF/print layout. Render service,
domain/DNS, Root Directory, Build/Start commands and the persistent disk are unchanged.

## 6. Tests

`node scripts/build-static-preview.mjs && node scripts/run-tests.mjs` → **Test suite passed: 22 files.**
New coverage (mocked provider — deterministic, no real key): token-truncation → `PROVIDER_MAX_OUTPUT_TOKENS` + exactly one larger retry at the 24000 ceiling; non-token incomplete → no token-boosting retry; refusal → `PROVIDER_REFUSAL`; schema 400 → `PROVIDER_SCHEMA_ERROR` (no raw body leak); Level 1 connectivity; Level 2 contract stage reporting; safe bounded failure log (hashed owner, no essay/key); storage self-test; real-server honest health; admin diagnostics 403 without a session.

## 7. NOT verified — owner action before calling this "fixed"

No OpenAI key exists in the build environment, so the following need the owner's account:
1. Deploy 12.4.1, then on `/admin` run **Test Provider Connectivity** and **Test Production Output Contract** — the contract check will name the exact failing stage if analysis is still broken.
2. If the stage is `provider_incomplete` with `PROVIDER_MAX_OUTPUT_TOKENS`, the raised ceilings (16000/24000) should resolve it; re-run the contract check to confirm `stage: complete`.
3. Run one real test-account analysis end-to-end; confirm the report saves, quota deducts exactly once, and the PDF matches.

## 8. Render environment (blueprint values updated; tune on the dashboard)

```
OPENAI_MODEL=gpt-5.6-sol          # only after provider-preflight passes
OPENAI_REASONING_EFFORT=high      # or max, per your benchmark
OPENAI_MAX_OUTPUT_TOKENS=16000    # first attempt
OPENAI_RETRY_MAX_OUTPUT_TOKENS=24000  # single larger retry
OPENAI_TIMEOUT_MS=240000
DATA_DIR=/var/data                # (DIAGNOSTIC_DATA_DIR on this service)
```

`render.yaml` now declares these values. If you prefer to manage them only on the Render
dashboard, note the blueprint will otherwise set them on deploy. `OPENAI_API_KEY` and
`OPENAI_MODEL` remain `sync: false` (dashboard-only; never committed).

## 9. GitHub upload (unchanged root)

Extract the ZIP → enter `diagnostic-lab-v12-3-1-feedback-integrity-upload-ready/diagnostic-lab-v12-3-0-full-system-upgrade` → upload the **contents**, overwrite matching files. Do not upload the ZIP, do not create a nested version folder, do not delete the parent, do not change the Render Root Directory. Commit to `main` after review.

## 10. Rollback

Keep the previous Render deploy. To revert code, redeploy the prior commit. To revert the
token/timeout change without code, set the values back on the dashboard. The model in use
always equals `OPENAI_MODEL` — there is no hidden fallback.
