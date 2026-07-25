import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStorage } from "./storage.js";
import { createRenderJobStore, isActiveJobState, isTerminalJobState } from "./renderJobStore.js";
import { recoverStaleJobs } from "./analysisWorker.js";
import { jobConfigSnapshot, jobStaleMs, jobTimeoutMs } from "./jobConfig.js";

// Admin-only job diagnostics (brief §9). None of these expose student content, essays, prompts, keys,
// or raw provider output — only safe operational counts and synthetic self-test results. The stale
// recovery and idempotency checks run entirely in an isolated temp store so they never read or write
// the production /var/data data.

const iso = (ms) => new Date(ms).toISOString();

// Job Queue Status: a safe operational snapshot of the durable job store.
export async function runJobQueueStatus(jobStore) {
  if (typeof jobStore.list !== "function") {
    return { ok: true, supported: false, reason: "Active job store does not support listing (serverless).", store: jobStore.name };
  }
  const jobs = await jobStore.list();
  const now = Date.now();
  const byStatus = {};
  let active = 0;
  let oldestActiveAgeMs = 0;
  let leasedActive = 0;
  for (const job of jobs) {
    byStatus[job.status] = (byStatus[job.status] || 0) + 1;
    if (isActiveJobState(job.status)) {
      active += 1;
      const ageMs = now - Date.parse(job.createdAt || iso(now));
      if (Number.isFinite(ageMs)) oldestActiveAgeMs = Math.max(oldestActiveAgeMs, ageMs);
      if (job.leaseOwner && job.leaseExpiresAt && Date.parse(job.leaseExpiresAt) > now) leasedActive += 1;
    }
  }
  // A small, safe recent-jobs view: no payload, no essay/prompt — only opaque id + operational fields.
  const recent = [...jobs]
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .slice(0, 10)
    .map((job) => ({
      jobId: job.jobId,
      status: job.status,
      stage: job.stage || job.status,
      taskType: job.taskType || "",
      attempt: job.attempt || 0,
      providerAttempt: job.providerAttempt || 0,
      ageMs: Math.max(0, now - Date.parse(job.createdAt || iso(now))),
      hasLiveLease: Boolean(job.leaseOwner && job.leaseExpiresAt && Date.parse(job.leaseExpiresAt) > now),
      quotaCommitted: Boolean(job.quotaCommitted),
      teacherUsageCommitted: Boolean(job.teacherUsageCommitted)
    }));
  return {
    ok: true,
    supported: true,
    store: jobStore.name,
    total: jobs.length,
    active,
    leasedActive,
    oldestActiveAgeMs,
    byStatus,
    config: jobConfigSnapshot(),
    recent
  };
}

// Stale Job Recovery Test: seed synthetic jobs in an isolated store and prove that recovery re-queues
// an expired-lease job, expires an over-stale job, and does NOT steal a live-leased job.
export async function runStaleJobRecoveryTest() {
  const dir = await mkdtemp(path.join(tmpdir(), "diag-recovery-"));
  try {
    const store = createRenderJobStore({ dataDir: dir });
    const now = Date.now();

    // (a) active job whose lease has expired → reclaimable by a new owner.
    await store.set("expired-lease", {
      jobId: "expired-lease", username: "synthetic", status: "provider_request",
      createdAt: iso(now - 60000), leaseOwner: "dead-worker", leaseExpiresAt: iso(now - 30000)
    });
    // (b) live-leased active job → must NOT be stealable.
    await store.set("live-lease", {
      jobId: "live-lease", username: "synthetic", status: "provider_request",
      createdAt: iso(now - 5000), leaseOwner: "active-worker", leaseExpiresAt: iso(now + 120000)
    });
    // (c) over-stale active job → must be expired by recovery.
    await store.set("over-stale", {
      jobId: "over-stale", username: "synthetic", status: "queued",
      createdAt: iso(now - (jobStaleMs() + 60000)), leaseOwner: "", leaseExpiresAt: ""
    });

    const blocked = await store.claim("live-lease", "recovery-worker", 120000);
    const liveLeaseProtected = blocked === null;

    const recovery = await recoverStaleJobs(store, { staleMs: jobStaleMs() });

    const overStale = await store.get("over-stale");
    const overStaleExpired = overStale?.status === "expired" && overStale?.errorCode === "ASYNC_JOB_EXPIRED";

    const reclaimed = await store.claim("expired-lease", "recovery-worker", 120000);
    const expiredLeaseReclaimed = Boolean(reclaimed && reclaimed.leaseOwner === "recovery-worker" && !isTerminalJobState(reclaimed.status));

    const ok = liveLeaseProtected && overStaleExpired && expiredLeaseReclaimed;
    return {
      ok,
      ran: true,
      liveLeaseProtected,
      overStaleExpired,
      expiredLeaseReclaimed,
      recovery,
      staleMs: jobStaleMs(),
      jobTimeoutMs: jobTimeoutMs()
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Duplicate/Idempotency Test: prove that committing the same submission twice (same clientSubmissionId)
// deducts credit exactly once. Runs against an isolated temp storage with a synthetic limited user, so
// no production user, report or quota is ever touched.
export async function runDuplicateIdempotencyTest() {
  const dir = await mkdtemp(path.join(tmpdir(), "diag-idempotency-"));
  try {
    const storage = createStorage({ rootDir: dir, dataDir: dir, adapter: "local-json" });
    await storage.createUser({
      username: "synthetic-idempotency", passwordHash: "scrypt:synthetic", displayName: "Synthetic",
      role: "student", quotaMode: "limited", quota: 5, used: 0, status: "active", expiryDate: "2099-12-31"
    });
    const record = {
      username: "synthetic-idempotency",
      studentProfileId: "synthetic-profile",
      submissionId: "synthetic-submission-1",
      clientSubmissionId: "synthetic-key-1",
      submissionHash: "synthetic-hash-1",
      inputFingerprint: "synthetic-hash-1",
      taskType: "Task 2",
      report: { taskType: "Task 2" }
    };
    const audit = { username: "synthetic-idempotency", role: "student", taskType: "Task 2", openAiCalled: true, quotaDeducted: true };

    const first = await storage.commitAnalysis({ ...record }, { ...audit });
    const second = await storage.commitAnalysis({ ...record }, { ...audit });
    const userAfter = await storage.getUserByUsername("synthetic-idempotency");
    const history = await storage.getSubmissionHistory("synthetic-idempotency", "synthetic-profile", "Task 2");

    const firstCreated = first.created === true;
    const secondDeduped = second.created === false;
    const usedExactlyOnce = Number(userAfter?.used) === 1;
    const singleReport = Array.isArray(history) && history.length === 1;

    const ok = firstCreated && secondDeduped && usedExactlyOnce && singleReport;
    return { ok, ran: true, firstCreated, secondDeduped, usedExactlyOnce, singleReport, finalUsed: Number(userAfter?.used) };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
