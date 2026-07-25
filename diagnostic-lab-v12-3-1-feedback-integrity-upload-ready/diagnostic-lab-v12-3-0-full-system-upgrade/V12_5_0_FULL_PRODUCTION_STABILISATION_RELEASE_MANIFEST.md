# V12.5.0 — Global Diagnostic Engine Stabilisation, Render Async Analysis & Production Readiness

Minor release. Introduces a durable, Render-native **asynchronous analysis architecture** with
provider lifecycle management, lease/heartbeat, restart recovery, idempotency and distinct timeout
handling. It changes **transport, orchestration, durability and observability** — **not** scoring,
rubric, prompt, report/feedback schema, taxonomy or revision-validation logic. **Do not deploy
automatically.** Commercial readiness is **not** claimed from mocked tests alone — see §11.

---

## 1. Confirmed starting point (from the supplied V12.4.1 ZIP)

| Item | Value |
|---|---|
| package.json version / appVersion | **12.4.1** |
| engineVersion | ielts-diagnostic-engine-v12.4.0 (unchanged) |
| rubricVersion | kru-pom-ielts-writing-v12.3.0 (unchanged) |
| promptVersion | ielts-diagnostic-prompt-v12.3.1 (unchanged) |
| reportSchemaVersion / feedbackSchemaVersion | v12.4.0 (unchanged) |
| issueTaxonomyVersion | issue-taxonomy-v12.3.5 (unchanged) |
| revisionValidatorVersion | revision-alignment-v12.4.0 (unchanged) |
| Application root | ZIP root (package.json, server.js, index.html at top) |
| Render Root Directory (unchanged) | `diagnostic-lab-v12-3-1-feedback-integrity-upload-ready/diagnostic-lab-v12-3-0-full-system-upgrade` |

## 2. Confirmed root cause of the production `PROVIDER_TIMEOUT`

Not "increase the timeout" — a **synchronous-lifecycle** defect:

- `render.yaml` had `DIAGNOSTIC_ANALYSIS_MODE=sync` → `shouldUseAsyncAnalysis()` returned false →
  `handleAnalyze` ran `analyzeWriting()` **inside the one `POST /api/analyze` request**.
- The single provider call aborts on `OPENAI_TIMEOUT_MS` (AbortController in `aiAnalyzer.js`), which
  was `240000`. gpt-5.6-sol at `reasoning: high` with a 16000-token ceiling exceeds that →
  `PROVIDER_TIMEOUT` / stage `provider_timeout` (exactly the reported failure).
- The only pre-existing async path was **Netlify-bound** (`invokeAnalyzeWorker` → a Netlify
  background function; requires Netlify Blobs) and does not function on Render.

Two data-integrity gaps were also fixed: non-atomic `writeJson` (crash mid-write could corrupt
users/history/audit/jobs) and a job model with no lease/recovery.

## 3. Version bump

- package + appVersion → **12.5.0**. The 8-key `ANALYSIS_VERSIONS` contract is otherwise unchanged
  (engine/rubric/prompt/schema/taxonomy/revision), so saved reports and duplicate hashing stay stable.
- New: `ORCHESTRATION_VERSION = async-render-v12.5.0`, `JOB_SCHEMA_VERSION = analysis-job-v12.5.0`
  (surfaced on `/api/health` and recorded on every durable job; **not** added to the report metadata
  contract).
- Frontend cache token → `diagnostic-v12-5-0-async-render`; asset manifest → `frontend-bootstrap-v12.5.0`.

## 4. Async-Render architecture

`DIAGNOSTIC_ANALYSIS_MODE=async-render`. `POST /api/analyze` verifies auth/enabled/expiry/ownership,
validates, deterministically preprocesses, computes the submission hash, short-circuits completed and
active duplicates, **checks** quota + teacher limit (no deduction), creates a durable queued job, and
returns **HTTP 202** in milliseconds. No provider call happens before the 202.

- **Durable job store** (`services/renderJobStore.js`): one atomic file per job under
  `${DATA_DIR}/analysis-jobs/<jobId>.json` (temp + rename). Reads are disk-authoritative (no stale
  cache). Full state list, `claim`/`claimNext`/`heartbeat`/`releaseLease`/`prune`.
- **Worker loop** (`services/analysisWorker.js`): leases one job, heartbeats/renews the lease as
  stages advance, bounded by `DIAGNOSTIC_JOB_CONCURRENCY` (default 1), recovers expired-lease jobs on
  start, expires over-stale jobs, prunes terminal jobs, and drains on SIGTERM. Isolated from the
  engine so it can later move to a separate Render Background Worker unchanged.
- **Status API** `GET /api/analyze-status/:jobId`: ownership-scoped; safe non-numeric stage labels;
  report only when complete; specific error codes when failed; never another user's job or raw
  provider data.
- **Frontend** (`script.js`): submits once, persists the active jobId locally, resumes polling after
  a refresh, shows safe stage labels (no fake %), copies the reference id, stops on terminal, never
  clears the essay on failure.

### Job schema (per job)
`jobId, requestId, username/ownerId, role, status, stage, createdAt/updatedAt/startedAt/completedAt/
failedAt, attempt, providerAttempt, revisionRepairAttempt, leaseOwner, leaseExpiresAt, heartbeatAt,
progressMessageKey, errorCode, failureStage, retryable, reportId, quotaCommitted,
teacherUsageCommitted, providerModel, reasoningEffort, engineVersion, jobSchemaVersion, submissionHash,
clientSubmissionId, payload`. No keys/tokens/passwords are stored in jobs.

### Lifecycle states
`queued → leased → preprocessing → provider_request[/provider_retry] → response_extraction/json_parse/
schema_validation/scoring_validation/canonical_analysis/feedback_generation/revision_validation
[/revision_repair] → student_view_projection → saving → complete` (or `failed/cancelled/expired`).

### Idempotency, quota & teacher usage (exactly once)
Credit is committed **only** by `storage.commitAnalysis`, which dedupes by
clientSubmissionId/submissionHash before incrementing. Before any provider call the worker re-checks
for a saved report, so a restart mid-provider re-attempts (bounded by `DIAGNOSTIC_PROVIDER_MAX_ATTEMPTS`)
but a restart **after commit** projects the saved report with no second credit. Teacher/internal daily
usage increments exactly once via the same commit; failed jobs commit nothing. Commit markers
(`quotaCommitted`, `teacherUsageCommitted`, `reportId`) are recorded on the job.

### Timeout taxonomy (all configurable, distinct codes)
Provider abort → `PROVIDER_TIMEOUT`; whole-job over `DIAGNOSTIC_JOB_TIMEOUT_MS` → `ASYNC_JOB_TIMEOUT`;
stale/unrecoverable over `DIAGNOSTIC_JOB_STALE_MS` → `ASYNC_JOB_EXPIRED`. Never collapsed to
`INTERNAL_ERROR`.

## 5. Files changed / added / untouched

**Added:** `services/renderJobStore.js`, `services/analysisWorker.js`, `services/jobConfig.js`,
`services/jobDiagnostics.js`, `tests/v12-5-0-async-render.test.mjs`, `scripts/provider-matrix.mjs`,
this manifest, `UPLOAD_AND_RENDER_SETTINGS_V12_5_THAI.md`.

**Changed:** `services/apiRouter.js` (async-render mode, 202 submission, status API, rich
`processAnalyzeJob` state machine + idempotency + timeout codes, 3 new admin diagnostics, health
fields), `services/analysisJobStore.js` (route Node → render-durable), `services/storage.js` (atomic
`writeJson`, `DATA_DIR` alias, isolated-`dataDir` option), `server.js` (start worker + graceful
shutdown, shared store instances), `script.js`/`styles.css` (robust polling + refresh recovery),
`admin.html`/`admin.js` (3 new diagnostic buttons), `render.yaml` + `RENDER_ENV_TEMPLATE.txt`
(async-render env), `services/analysisVersions.js` + `package.json` + `package-lock.json` +
`index.html` (12.5.0 + cache token), **`domain/task2Safety.js` (classification accuracy fix — see
§12)**. Two historical tests (`v8-sale-readiness`, `diagnostic-api`) were **retargeted** from the
legacy single-file job store to the durable store **without weakening any assertion** (reset still
clears jobs + preserves protected data; deletion still isolates one student).

**Deliberately untouched:** scoring engine, `domain/*` (canonicalAnalysis, feedbackIntegrity,
revisionQuality, task1Classification, textIntegrity), `schemas/*`, prompt-builder logic,
rubric/prompt/taxonomy/revision-validator versions, PDF/print layout, pricing (2,999 THB / 10 / 60d),
auth/sessions/hashing, the V12.3.6 frontend bootstrap, Render service/domain/Root Directory/disk.

## 12. Task 2 classification accuracy fix (`domain/task2Safety.js`)

A production `ESSAY_TYPE_MISMATCH` wrongly rejected a correctly-selected **Problem & Solution** on a
prompt like *"What do you think the causes are? What solutions can you suggest?"*. Root cause: the
cause/problem→solution detectors use `[^?]*`, which stops at the first `?`, so a two-part prompt whose
two requests are split into separate questions matched no pattern and fell through to a generic
multi-question **Direct Question**. Fix: before that fall-through, a `!winner`-guarded rule reclassifies
a prompt that carries **both** a problem/cause signal **and** a solution signal to Problem & Solution
(causes-solutions subtype when a cause/reason signal is present, else standard). Because it is guarded
by `!winner`, it can never change a prompt that an explicit pattern already matched — verified: all 24
test files pass, the v8-2 genuine-mismatch case is preserved, and genuine two-question Direct Questions
(no solution requested) still classify as Direct Question. This is a bug fix, not a scoring change:
`engineVersion` is **deliberately kept at v12.4.0** so existing duplicate-hashes stay valid and students
are not re-charged for identical re-submissions across the release. Regression test:
`tests/v12-5-0-cause-solution-classification.test.mjs`.

## 6. Admin diagnostics (preserved + extended)

Preserved: provider-connectivity, production-contract, storage, analysis-failures, clear-failures,
system. **Added:** `job-queue-status` (safe operational snapshot), `stale-job-recovery-test`
(isolated synthetic store — proves reclaim / expiry / live-lease protection), `duplicate-idempotency-test`
(isolated synthetic storage — proves commit-once). None expose student content, keys, prompts or raw
provider output.

## 7. Tests — actual commands and results (Node 22.16.0, matching production)

```
node scripts/build-static-preview.mjs && node scripts/run-tests.mjs
→ Test suite passed: 23 files.
```

Baseline before changes: 22 files passed. New file `tests/v12-5-0-async-render.test.mjs` (14
scenarios) covers: 202 shape + no early credit; durable job creation; polling + safe stage label;
completed-duplicate and active-duplicate collapse; ownership 404; provider timeout → `PROVIDER_TIMEOUT`
(zero credit) + safe failure log (no essay/key); provider auth error; whole-job timeout →
`ASYNC_JOB_TIMEOUT`; teacher usage exactly once (no double on reprocess); restart mid-provider recovery;
restart **after commit** (no second credit); lease/heartbeat/expiry; the in-process worker loop; JSON
404 for an unknown job. Provider-error paths use a mocked `globalThis.fetch` (no real key); success
paths use the deterministic local engine.

**Live HTTP integration smoke (real server.js + worker):** `POST /api/analyze` returned **202 in
~23 ms**, the in-process worker completed the job, `/api/analyze-status` returned the report, quota
deducted exactly once, `/api/health` reported `analysisMode: async-render`, and an unknown job
returned a JSON 404.

## 8. Render environment (blueprint updated; secrets stay dashboard-only)

```
DIAGNOSTIC_ANALYSIS_MODE=async-render     OPENAI_TIMEOUT_MS=600000
DIAGNOSTIC_JOB_CONCURRENCY=1              OPENAI_MAX_OUTPUT_TOKENS=16000
DIAGNOSTIC_JOB_TIMEOUT_MS=900000          OPENAI_RETRY_MAX_OUTPUT_TOKENS=24000
DIAGNOSTIC_JOB_LEASE_MS=120000            OPENAI_REASONING_EFFORT=high   # benchmark max separately
DIAGNOSTIC_JOB_STALE_MS=1200000           DATA_DIR=/var/data (alias of DIAGNOSTIC_DATA_DIR)
OPENAI_API_KEY, OPENAI_MODEL → sync:false (set on dashboard; OPENAI_MODEL=gpt-5.6-sol; no fallback)
```

## 9. GitHub upload (unchanged root)

Extract the ZIP → open `diagnostic-lab-v12-3-1-feedback-integrity-upload-ready/diagnostic-lab-v12-3-0-full-system-upgrade`
→ upload the **contents**, overwrite matching files. Do **not** upload the ZIP itself, do **not**
create a nested version folder, do **not** delete the parent, do **not** change the Render Root
Directory. Commit to `main` after review.

**Under GitHub's 100-file web-upload limit:** this ZIP ships **85 files**, so the whole extracted set
drags in one upload. Superseded historical release manifests (V11.7–V12.4.1) are intentionally **not**
in the ZIP — they already exist in the repo and a GitHub upload never deletes files it doesn't
include, so they remain. Only the current README, the V12.5.0 manifest, the V12.5 Thai guide,
`RENDER_ENV_TEMPLATE.txt`, `ROOT_DIRECTORY_V12_3.txt` and `SECURITY_CHECKLIST_THAI.md` ship as docs.

## 10. Rollback

Keep the previous Render deploy. To revert code: redeploy the prior commit. To revert transport
without code: set `DIAGNOSTIC_ANALYSIS_MODE=sync` on the dashboard (the sync path is retained). To
revert timeouts: reset the env values. The model in use always equals `OPENAI_MODEL` — no hidden
fallback. Durable jobs and reports remain readable across the change.

## 11. NOT verified here — required owner gates before selling

No OpenAI key exists in the build environment, so these need the owner's Render account/key and were
prepared, not executed:
1. `scripts/provider-preflight.mjs` then `scripts/provider-matrix.mjs` with `OPENAI_MODEL=gpt-5.6-sol`
   (real Task 1/Task 2 matrix + repeatability).
2. One real end-to-end analysis on production, confirming save + exactly-once quota + PDF parity.
3. PDF render + text inspection of the generated reports (`qa/render-release-pdfs.mjs`,
   `qa/verify-pdf-text.py`) — needs Chromium in the runtime.
4. The full production smoke test (brief §34).

**Commercial-readiness verdict: engineering-complete and fully green on the local + mocked + live-HTTP
suites, but NOT yet sale-ready** until gates 1–4 pass on the owner's account. Do not claim sale
readiness from mocks alone.
