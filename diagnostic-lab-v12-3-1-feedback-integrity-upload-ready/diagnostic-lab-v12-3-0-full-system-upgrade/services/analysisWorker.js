import os from "node:os";
import { randomBytes } from "node:crypto";
import { createStorage } from "./storage.js";
import { createAnalysisJobStore } from "./analysisJobStore.js";
import { createAnalysisFailureLog } from "./analysisFailureLog.js";
import { processAnalyzeJob } from "./apiRouter.js";
import { isTerminalJobState, isActiveJobState } from "./renderJobStore.js";
import {
  jobConcurrency,
  jobLeaseMs,
  jobStaleMs,
  jobRetentionMs,
  jobWorkerTickMs
} from "./jobConfig.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Startup/periodic recovery (brief §6.5), extracted so the admin "Stale Job Recovery Test" exercises
// the exact code path. Jobs older than the stale ceiling are unrecoverable → marked expired (never
// reprocessed forever). Non-terminal jobs with an expired lease are simply reclaimable on the next
// tick. Returns { recovered, expired }.
export async function recoverStaleJobs(jobStore, { staleMs = jobStaleMs() } = {}) {
  const jobs = await jobStore.list().catch(() => []);
  const now = Date.now();
  let recovered = 0;
  let expired = 0;
  for (const job of jobs) {
    if (isTerminalJobState(job.status)) continue;
    const ageMs = now - Date.parse(job.createdAt || new Date().toISOString());
    const leaseLive = job.leaseOwner && job.leaseExpiresAt && Date.parse(job.leaseExpiresAt) > now;
    if (Number.isFinite(ageMs) && ageMs > staleMs) {
      await jobStore.set(job.jobId, {
        ...job,
        status: "expired",
        stage: "async_job_timeout",
        failureStage: "async_job_timeout",
        failedAt: new Date().toISOString(),
        leaseOwner: "",
        leaseExpiresAt: "",
        errorCode: "ASYNC_JOB_EXPIRED",
        retryable: true,
        message: "The analysis expired before it could finish. No credit was used. Please try again."
      }).catch(() => {});
      expired += 1;
    } else if (!leaseLive) {
      recovered += 1; // reclaimable on the next tick
    }
  }
  return { recovered, expired };
}

// Render-native in-process analysis worker (brief §6.4–§6.5). It leases queued/recoverable jobs from
// the durable store, runs the full diagnostic pipeline via processAnalyzeJob (heartbeating the lease
// as stages advance), bounds concurrency, recovers expired-lease jobs on start, and drains cleanly on
// SIGTERM. It is deliberately isolated from the diagnostic engine so it can later be moved to a
// separate Render Background Worker without touching scoring/feedback/revision logic.
export function startAnalysisWorker(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const storage = options.storage || createStorage({ rootDir });
  const jobStore = options.jobStore || createAnalysisJobStore({ rootDir });
  const failureLog = options.failureLog || createAnalysisFailureLog({ rootDir });
  const leaseOwner = options.leaseOwner ||
    `${process.env.RENDER_INSTANCE_ID || os.hostname() || "render"}:${process.pid}:${randomBytes(3).toString("hex")}`;

  if (typeof jobStore.claimNext !== "function") {
    // A store that cannot lease (e.g. Netlify disabled/blob) has no in-process worker.
    return {
      leaseOwner,
      isRunning: () => false,
      stop: async () => {},
      runRecovery: async () => ({ recovered: 0, expired: 0 }),
      tick: async () => null,
      supported: false
    };
  }

  const inFlight = new Set();
  let running = false;
  let loopPromise = null;
  let lastPruneAt = 0;

  // Startup recovery: a process restart can leave jobs "active" with a stale lease (brief §6.5).
  async function runRecovery() {
    const result = await recoverStaleJobs(jobStore, { staleMs: jobStaleMs() });
    if (result.recovered || result.expired) {
      console.log("[diagnostic-lab] analysis worker recovery", { ...result, leaseOwner });
    }
    return result;
  }

  // One scheduling iteration: fill spare concurrency with claimable jobs. Returns the number started.
  async function tick() {
    let started = 0;
    while (running && inFlight.size < jobConcurrency()) {
      const lease = jobLeaseMs();
      const job = await jobStore.claimNext(leaseOwner, lease).catch(() => null);
      if (!job) break;
      started += 1;
      const task = processAnalyzeJob({ jobId: job.jobId, rootDir, storage, jobStore, failureLog, leaseOwner, leaseMs: lease })
        .catch((error) => {
          console.error("[diagnostic-lab] analysis worker job error", {
            jobId: job.jobId,
            message: String(error?.message || "").slice(0, 200)
          });
        })
        .finally(() => inFlight.delete(task));
      inFlight.add(task);
    }
    // Bounded, opportunistic prune of old terminal jobs so the store stays small (brief §6, §35).
    if (Date.now() - lastPruneAt > 60000) {
      lastPruneAt = Date.now();
      await jobStore.prune?.(jobRetentionMs()).catch(() => {});
    }
    return started;
  }

  async function loop() {
    await runRecovery().catch(() => {});
    while (running) {
      try {
        await tick();
      } catch (error) {
        console.error("[diagnostic-lab] analysis worker tick error", { message: String(error?.message || "").slice(0, 200) });
      }
      await sleep(jobWorkerTickMs());
    }
  }

  running = true;
  loopPromise = loop();
  console.log("[diagnostic-lab] analysis worker started", { leaseOwner, concurrency: jobConcurrency() });

  async function stop({ graceMs = 10000 } = {}) {
    if (!running) return;
    running = false; // stop claiming new jobs
    const deadline = Date.now() + graceMs;
    // Let in-flight jobs finish their current work; each stage write is atomic, so anything not done
    // by the deadline is safely recoverable on the next start (its lease expires).
    while (inFlight.size && Date.now() < deadline) {
      await sleep(100);
    }
    await Promise.race([loopPromise, sleep(500)]).catch(() => {});
    console.log("[diagnostic-lab] analysis worker stopped", { leaseOwner, drained: inFlight.size === 0 });
  }

  return {
    leaseOwner,
    isRunning: () => running,
    inFlightCount: () => inFlight.size,
    runRecovery,
    tick,
    stop,
    supported: true
  };
}
