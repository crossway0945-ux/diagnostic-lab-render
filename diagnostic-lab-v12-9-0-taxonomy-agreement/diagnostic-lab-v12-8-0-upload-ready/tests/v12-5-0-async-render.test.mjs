// V12.5.0 async-render architecture: durable jobs, 202 submission, polling, ownership, restart
// recovery, lease/heartbeat, provider + job timeouts, and exactly-once quota / teacher usage.
//
// Full-success paths use the deterministic local engine (no OpenAI key). Provider-error paths mock
// globalThis.fetch (no real key). No test performs a real provider call.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApiHandler, processAnalyzeJob } from "../services/apiRouter.js";
import { createStorage } from "../services/storage.js";
import { createAnalysisJobStore } from "../services/analysisJobStore.js";
import { createAnalysisFailureLog } from "../services/analysisFailureLog.js";
import { startAnalysisWorker } from "../services/analysisWorker.js";
import { createRenderJobStore } from "../services/renderJobStore.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";

assert.equal(ANALYSIS_VERSIONS.appVersion, "12.9.7");

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

const OPINION = {
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
  reportLanguage: "en",
  options: { essayTypeConfirmed: true, visualTypeConfirmed: true }
};

function baseEnv(dataDir, { mode = "async-render", localEngine = true } = {}) {
  process.env = { ...ORIGINAL_ENV };
  process.env.SESSION_SECRET = "v1250-async-secret";
  process.env.DIAGNOSTIC_STORAGE_ADAPTER = "local-json";
  process.env.DIAGNOSTIC_DATA_DIR = dataDir;
  process.env.DIAGNOSTIC_ANALYSIS_MODE = mode;
  delete process.env.NETLIFY;
  delete process.env.LAMBDA_TASK_ROOT;
  delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  delete process.env.AWS_EXECUTION_ENV;
  if (localEngine) {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE = "false";
  }
}

function restoreEnv() {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
}

function mockResponse({ ok = true, status = 200, json = {}, text = "" }) {
  return { ok, status, headers: { get: () => "application/json" }, async json() { return json; }, async text() { return text || JSON.stringify(json); } };
}

async function seedUsers(dataDir) {
  await writeFile(path.join(dataDir, "users.json"), JSON.stringify([
    { username: "stu", password: "pw", displayName: "Student", role: "student", quotaMode: "limited", quota: 10, used: 0, status: "active", expiryDate: "2099-12-31" },
    { username: "stu2", password: "pw", displayName: "Student Two", role: "student", quotaMode: "limited", quota: 10, used: 0, status: "active", expiryDate: "2099-12-31" },
    { username: "teach", password: "pw", displayName: "Teacher", role: "teacher", quotaMode: "unlimited", used: 0, status: "active" }
  ], null, 2));
}

async function request(handler, method, requestPath, body = null, cookie = "") {
  const response = await handler({ method, path: requestPath, headers: cookie ? { cookie } : {}, body: body ? JSON.stringify(body) : "" });
  return { ...response, json: JSON.parse(response.body || "{}") };
}

async function login(handler, username) {
  const res = await request(handler, "POST", "/api/login", { username, password: "pw" });
  assert.equal(res.statusCode, 200, `${username} login`);
  return res.headers["Set-Cookie"];
}

function makeStores(dataDir) {
  const storage = createStorage({ rootDir: dataDir });
  const jobStore = createAnalysisJobStore({ rootDir: dataDir });
  const failureLog = createAnalysisFailureLog({ rootDir: dataDir });
  const handler = createApiHandler({ rootDir: dataDir, storage, jobStore, failureLog });
  return { storage, jobStore, failureLog, handler };
}

async function withTemp(name, fn) {
  const dataDir = await mkdtemp(path.join(tmpdir(), `v1250-${name}-`));
  try {
    await fn(dataDir);
  } finally {
    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
    restoreEnv();
  }
}

// 1. Submission returns 202 quickly with a durable job; NO credit is deducted at submission.
await withTemp("submit", async (dataDir) => {
  baseEnv(dataDir);
  await seedUsers(dataDir);
  const { handler, jobStore } = makeStores(dataDir);
  const cookie = await login(handler, "stu");
  const res = await request(handler, "POST", "/api/analyze", { ...OPINION, clientSubmissionId: "sub-1" }, cookie);
  assert.equal(res.statusCode, 202, "submission returns 202");
  assert.equal(res.json.accepted, true);
  assert.ok(res.json.jobId, "202 carries a jobId");
  assert.ok(res.json.requestId, "202 carries a requestId");
  assert.equal(res.json.statusUrl, `/api/analyze-status/${encodeURIComponent(res.json.jobId)}`);
  const job = await jobStore.get(res.json.jobId);
  assert.ok(job, "the job is durably persisted");
  assert.equal(job.status, "queued");
  assert.equal(job.quotaCommitted, false, "no credit committed at submission");
  const session = await request(handler, "GET", "/api/session", null, cookie);
  assert.equal(session.json.user.used, 0, "student quota is untouched until the report saves");
});

// 2. Worker completes the job; status returns the report; quota is deducted EXACTLY once.
await withTemp("complete", async (dataDir) => {
  baseEnv(dataDir);
  await seedUsers(dataDir);
  const { handler, storage, jobStore, failureLog } = makeStores(dataDir);
  const cookie = await login(handler, "stu");
  const submit = await request(handler, "POST", "/api/analyze", { ...OPINION, clientSubmissionId: "sub-2" }, cookie);
  const jobId = submit.json.jobId;

  // Active poll returns a safe stage label (never a fake percentage).
  const active = await request(handler, "GET", `/api/analyze-status/${jobId}`, null, cookie);
  assert.equal(active.json.status, "queued");
  assert.match(active.json.message, /Preparing|Analysing|Validating|Saving/);

  await processAnalyzeJob({ jobId, rootDir: dataDir, storage, jobStore, failureLog });

  const done = await request(handler, "GET", `/api/analyze-status/${jobId}`, null, cookie);
  assert.equal(done.json.status, "complete", "job completes");
  assert.ok(done.json.analysis, "the saved report is returned on completion");
  assert.equal(done.json.analysis.taskType, "Task 2");
  const user = await storage.getUserByUsername("stu");
  assert.equal(user.used, 1, "exactly one credit deducted after a successful save");
  const finalJob = await jobStore.get(jobId);
  assert.equal(finalJob.quotaCommitted, true, "commit marker set");
  assert.ok(finalJob.reportId, "reportId recorded on the job");
});

// 3. Duplicate content does not call the provider again and does not deduct a second credit.
await withTemp("duplicate", async (dataDir) => {
  baseEnv(dataDir);
  await seedUsers(dataDir);
  const { handler, storage, jobStore, failureLog } = makeStores(dataDir);
  const cookie = await login(handler, "stu");
  const first = await request(handler, "POST", "/api/analyze", { ...OPINION, clientSubmissionId: "dup-a" }, cookie);
  await processAnalyzeJob({ jobId: first.json.jobId, rootDir: dataDir, storage, jobStore, failureLog });
  assert.equal((await storage.getUserByUsername("stu")).used, 1);

  // Same content, new clientSubmissionId → completed-duplicate short-circuit at submission (200, no job).
  const again = await request(handler, "POST", "/api/analyze", { ...OPINION, clientSubmissionId: "dup-b" }, cookie);
  assert.equal(again.statusCode, 200, "an already-analyzed submission returns the saved report immediately");
  assert.equal((await storage.getUserByUsername("stu")).used, 1, "no second credit for a duplicate");
});

// 4. A second submission of identical content while the first job is still active returns the SAME job.
await withTemp("active-dup", async (dataDir) => {
  baseEnv(dataDir);
  await seedUsers(dataDir);
  const { handler, jobStore } = makeStores(dataDir);
  const cookie = await login(handler, "stu");
  const a = await request(handler, "POST", "/api/analyze", { ...OPINION, clientSubmissionId: "active-1" }, cookie);
  const b = await request(handler, "POST", "/api/analyze", { ...OPINION, clientSubmissionId: "active-2" }, cookie);
  assert.equal(b.statusCode, 202);
  assert.equal(b.json.jobId, a.json.jobId, "identical content collapses onto the existing active job");
  assert.equal(b.json.duplicate, true);
  assert.equal((await jobStore.list()).length, 1, "only one job exists for identical active content");
});

// 5. Ownership: another account cannot read someone else's job.
await withTemp("ownership", async (dataDir) => {
  baseEnv(dataDir);
  await seedUsers(dataDir);
  const { handler } = makeStores(dataDir);
  const cookieA = await login(handler, "stu");
  const submit = await request(handler, "POST", "/api/analyze", { ...OPINION, clientSubmissionId: "own-1" }, cookieA);
  const cookieB = await login(handler, "stu2");
  const cross = await request(handler, "GET", `/api/analyze-status/${submit.json.jobId}`, null, cookieB);
  assert.equal(cross.statusCode, 404, "a job is invisible to a different account");
});

// 6. Provider timeout → failed job with PROVIDER_TIMEOUT, retryable, and ZERO credit used.
await withTemp("provider-timeout", async (dataDir) => {
  baseEnv(dataDir, { localEngine: false });
  process.env.OPENAI_API_KEY = "test-key-not-real";
  process.env.OPENAI_MODEL = "gpt-test";
  await seedUsers(dataDir);
  const { handler, storage, jobStore, failureLog } = makeStores(dataDir);
  const cookie = await login(handler, "stu");
  const submit = await request(handler, "POST", "/api/analyze", { ...OPINION, clientSubmissionId: "to-1" }, cookie);
  globalThis.fetch = async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; };
  await processAnalyzeJob({ jobId: submit.json.jobId, rootDir: dataDir, storage, jobStore, failureLog });
  globalThis.fetch = ORIGINAL_FETCH;

  const status = await request(handler, "GET", `/api/analyze-status/${submit.json.jobId}`, null, cookie);
  assert.equal(status.json.status, "failed");
  assert.equal(status.json.errorCode, "PROVIDER_TIMEOUT", "provider timeout classified precisely");
  assert.equal(status.json.retryable, true);
  assert.equal((await storage.getUserByUsername("stu")).used, 0, "a failed analysis deducts zero credit");
  const failures = await failureLog.list();
  assert.ok(failures.length >= 1, "a safe failure record is written");
  assert.doesNotMatch(JSON.stringify(failures), /public libraries|test-key-not-real/, "failure log never stores the essay or key");
});

// 7. Provider auth error stays specific (PROVIDER_AUTH_ERROR), zero credit.
await withTemp("provider-auth", async (dataDir) => {
  baseEnv(dataDir, { localEngine: false });
  process.env.OPENAI_API_KEY = "test-key-not-real";
  process.env.OPENAI_MODEL = "gpt-test";
  await seedUsers(dataDir);
  const { handler, storage, jobStore, failureLog } = makeStores(dataDir);
  const cookie = await login(handler, "stu");
  const submit = await request(handler, "POST", "/api/analyze", { ...OPINION, clientSubmissionId: "auth-1" }, cookie);
  globalThis.fetch = async () => mockResponse({ ok: false, status: 401, text: "unauthorized" });
  await processAnalyzeJob({ jobId: submit.json.jobId, rootDir: dataDir, storage, jobStore, failureLog });
  globalThis.fetch = ORIGINAL_FETCH;
  const status = await request(handler, "GET", `/api/analyze-status/${submit.json.jobId}`, null, cookie);
  assert.equal(status.json.errorCode, "PROVIDER_AUTH_ERROR");
  assert.equal((await storage.getUserByUsername("stu")).used, 0);
});

// 8. Whole-job timeout is distinct from a provider timeout (ASYNC_JOB_TIMEOUT), zero credit.
await withTemp("job-timeout", async (dataDir) => {
  baseEnv(dataDir);
  process.env.DIAGNOSTIC_JOB_TIMEOUT_MS = "1";
  await seedUsers(dataDir);
  const { handler, storage, jobStore, failureLog } = makeStores(dataDir);
  const cookie = await login(handler, "stu");
  const submit = await request(handler, "POST", "/api/analyze", { ...OPINION, clientSubmissionId: "jt-1" }, cookie);
  const job = await jobStore.get(submit.json.jobId);
  await jobStore.set(job.jobId, { ...job, createdAt: new Date(Date.now() - 60000).toISOString() });
  await processAnalyzeJob({ jobId: job.jobId, rootDir: dataDir, storage, jobStore, failureLog });
  const status = await request(handler, "GET", `/api/analyze-status/${job.jobId}`, null, cookie);
  assert.equal(status.json.errorCode, "ASYNC_JOB_TIMEOUT", "job timeout is not a provider timeout");
  assert.equal((await storage.getUserByUsername("stu")).used, 0);
});

// 9. Teacher/internal usage increments exactly once and never deducts student credit.
await withTemp("teacher-usage", async (dataDir) => {
  baseEnv(dataDir);
  await seedUsers(dataDir);
  const { handler, storage, jobStore, failureLog } = makeStores(dataDir);
  const cookie = await login(handler, "teach");
  const created = await request(handler, "POST", "/api/student-profiles", { displayName: "Sun" }, cookie);
  const token = created.json.profile.profileToken;
  const submit = await request(handler, "POST", "/api/analyze", { ...OPINION, studentProfileToken: token, clientSubmissionId: "teach-1" }, cookie);
  await processAnalyzeJob({ jobId: submit.json.jobId, rootDir: dataDir, storage, jobStore, failureLog });
  const today = new Date().toISOString().slice(0, 10);
  const teacher = await storage.getUserByUsername("teach");
  assert.equal(teacher.dailyUsage?.[today], 1, "teacher daily usage increments exactly once");
  // The teacher stays unlimited — the daily safety counter is the meter, not a depletable student credit.
  assert.equal(teacher.quotaMode, "unlimited");
  assert.equal(teacher.remainingQuota, null, "an internal account never depletes a limited credit");
  // Reprocessing the same job must not double-increment.
  await processAnalyzeJob({ jobId: submit.json.jobId, rootDir: dataDir, storage, jobStore, failureLog });
  assert.equal((await storage.getUserByUsername("teach")).dailyUsage?.[today], 1, "no double increment on reprocess");
});

// 10. Restart mid-provider (expired lease, no saved report) is reclaimed and completes — credit once.
await withTemp("restart-midprovider", async (dataDir) => {
  baseEnv(dataDir);
  await seedUsers(dataDir);
  const { handler, storage, jobStore, failureLog } = makeStores(dataDir);
  const cookie = await login(handler, "stu");
  const submit = await request(handler, "POST", "/api/analyze", { ...OPINION, clientSubmissionId: "restart-1" }, cookie);
  const job = await jobStore.get(submit.json.jobId);
  // Simulate a crash mid-provider: active status, a dead worker's expired lease.
  await jobStore.set(job.jobId, { ...job, status: "provider_request", stage: "provider_request", providerAttempt: 1, leaseOwner: "dead-worker", leaseExpiresAt: new Date(Date.now() - 60000).toISOString() });
  await processAnalyzeJob({ jobId: job.jobId, rootDir: dataDir, storage, jobStore, failureLog });
  const status = await request(handler, "GET", `/api/analyze-status/${job.jobId}`, null, cookie);
  assert.equal(status.json.status, "complete", "a reclaimed job finishes");
  assert.equal((await storage.getUserByUsername("stu")).used, 1, "exactly one credit after recovery");
});

// 11. Restart AFTER commit (report saved, job not marked complete) must not deduct twice.
await withTemp("restart-postcommit", async (dataDir) => {
  baseEnv(dataDir);
  await seedUsers(dataDir);
  const { handler, storage, jobStore, failureLog } = makeStores(dataDir);
  const cookie = await login(handler, "stu");
  const submit = await request(handler, "POST", "/api/analyze", { ...OPINION, clientSubmissionId: "restart-2" }, cookie);
  const jobId = submit.json.jobId;
  await processAnalyzeJob({ jobId, rootDir: dataDir, storage, jobStore, failureLog });
  assert.equal((await storage.getUserByUsername("stu")).used, 1);
  // Simulate a crash after commit but before the "complete" write: reset to active with an expired lease.
  const job = await jobStore.get(jobId);
  await jobStore.set(jobId, { ...job, status: "provider_request", stage: "provider_request", leaseOwner: "dead", leaseExpiresAt: new Date(Date.now() - 60000).toISOString() });
  await processAnalyzeJob({ jobId, rootDir: dataDir, storage, jobStore, failureLog });
  assert.equal((await storage.getUserByUsername("stu")).used, 1, "the idempotency checkpoint prevents a second credit");
  assert.equal((await jobStore.get(jobId)).status, "complete");
});

// 12. Lease/heartbeat semantics at the store level.
await withTemp("lease", async (dataDir) => {
  baseEnv(dataDir);
  const store = createRenderJobStore({ dataDir });
  await store.set("j1", { jobId: "j1", username: "stu", status: "queued", createdAt: new Date().toISOString() });
  const leased = await store.claim("j1", "owner-1", 120000);
  assert.equal(leased.leaseOwner, "owner-1", "first claim wins");
  const blocked = await store.claim("j1", "owner-2", 120000);
  assert.equal(blocked, null, "a live lease cannot be stolen");
  const beat = await store.heartbeat("j1", "owner-1", 120000, { status: "provider_request" });
  assert.equal(beat.status, "provider_request", "heartbeat advances stage and renews lease");
  // Force the lease to expire, then another owner may reclaim.
  const now = await store.get("j1");
  await store.set("j1", { ...now, leaseExpiresAt: new Date(Date.now() - 1000).toISOString() });
  const reclaimed = await store.claim("j1", "owner-2", 120000);
  assert.equal(reclaimed.leaseOwner, "owner-2", "an expired lease is reclaimable");
});

// 13. The in-process worker loop leases, processes and completes a queued job; then stops cleanly.
await withTemp("worker-loop", async (dataDir) => {
  baseEnv(dataDir);
  await seedUsers(dataDir);
  const { handler, storage, jobStore, failureLog } = makeStores(dataDir);
  const cookie = await login(handler, "stu");
  const submit = await request(handler, "POST", "/api/analyze", { ...OPINION, clientSubmissionId: "worker-1" }, cookie);
  const worker = startAnalysisWorker({ rootDir: dataDir, storage, jobStore, failureLog });
  assert.equal(worker.supported, true);
  // Drive one tick and wait for the in-flight job to finish.
  await worker.tick();
  const deadline = Date.now() + 8000;
  while (worker.inFlightCount() > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
  await worker.stop();
  const status = await request(handler, "GET", `/api/analyze-status/${submit.json.jobId}`, null, cookie);
  assert.equal(status.json.status, "complete", "the worker loop completed the job");
  assert.equal((await storage.getUserByUsername("stu")).used, 1);
});

// 14. Unknown job → JSON 404 (never an HTML fallback for an API route).
await withTemp("json-404", async (dataDir) => {
  baseEnv(dataDir);
  await seedUsers(dataDir);
  const { handler } = makeStores(dataDir);
  const cookie = await login(handler, "stu");
  const res = await request(handler, "GET", "/api/analyze-status/does-not-exist", null, cookie);
  assert.equal(res.statusCode, 404);
  assert.equal(res.headers["content-type"] || res.headers["Content-Type"], "application/json; charset=utf-8");
  assert.equal(res.json.ok, false);
});

console.log("V12.5.0 async-render: 202 submission, durable jobs, polling, ownership, duplicate collapse, provider + job timeouts, lease/heartbeat, restart recovery (pre/post-commit), worker loop, and exactly-once quota / teacher usage verified.");
