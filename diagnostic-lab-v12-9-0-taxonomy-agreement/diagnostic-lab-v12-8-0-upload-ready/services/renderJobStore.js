import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, rename, unlink, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { resolveDataDir } from "./storage.js";

// Durable, Render-native analysis job store (brief §6.2). Every job is one file under
// <DATA_DIR>/analysis-jobs/<jobId>.json, written atomically (temp + rename on the same filesystem)
// so a process restart mid-write can never corrupt the store — a reader sees the old or the new file,
// never a truncated one. Reads always hit disk (no stale in-memory shadow), which is what makes the
// lease/heartbeat and restart-recovery logic correct on a single Render instance and safe to move to
// a separate Background Worker later without changing the diagnostic engine.

export const JOB_SCHEMA_VERSION = "analysis-job-v12.5.0";

// Full lifecycle (brief §6.3). `status` holds the fine-grained state so the status API can report
// e.g. "provider_request" directly; helpers below classify terminal vs active.
export const JOB_STATES = Object.freeze([
  "queued",
  "leased",
  "preprocessing",
  "provider_request",
  "provider_retry",
  "response_extraction",
  "json_parse",
  "schema_validation",
  "scoring_validation",
  "canonical_analysis",
  "feedback_generation",
  "revision_validation",
  "revision_repair",
  "student_view_projection",
  "saving",
  "complete",
  "failed",
  "cancelled",
  "expired"
]);

const TERMINAL_STATES = new Set(["complete", "failed", "cancelled", "expired"]);

// Safe, non-numeric stage labels the frontend may show (brief §6.3). Never a fake percentage.
const STAGE_MESSAGE_KEYS = Object.freeze({
  queued: "Preparing submission",
  leased: "Preparing submission",
  preprocessing: "Preparing submission",
  provider_request: "Analysing writing",
  provider_retry: "Analysing writing",
  response_extraction: "Analysing writing",
  json_parse: "Validating criteria",
  schema_validation: "Validating criteria",
  scoring_validation: "Validating criteria",
  canonical_analysis: "Validating criteria",
  feedback_generation: "Preparing feedback",
  revision_validation: "Preparing feedback",
  revision_repair: "Preparing feedback",
  student_view_projection: "Preparing feedback",
  saving: "Saving report",
  complete: "Report ready",
  failed: "Analysis failed",
  cancelled: "Analysis cancelled",
  expired: "Analysis expired"
});

export function isTerminalJobState(status) {
  return TERMINAL_STATES.has(String(status || ""));
}

export function isActiveJobState(status) {
  return JOB_STATES.includes(String(status || "")) && !TERMINAL_STATES.has(String(status || ""));
}

export function stageMessageForStatus(status) {
  return STAGE_MESSAGE_KEYS[String(status || "")] || "Analysing writing";
}

export function createRenderJobStore(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const dataDir = options.dataDir || resolveDataDir(rootDir);
  return new RenderJobStore({ dir: path.join(dataDir, "analysis-jobs") });
}

class RenderJobStore {
  constructor({ dir }) {
    this.name = "render-durable";
    this.dir = dir;
    this.isDurable = true;
    // In-process serialization so a claim's read-decide-write cannot interleave with another claim
    // in the same worker. Cross-instance safety additionally relies on the lease fields on disk.
    this.queue = Promise.resolve();
  }

  jobPath(jobId) {
    return path.join(this.dir, `${sanitizeJobId(jobId)}.json`);
  }

  async get(jobId) {
    if (!jobId) return null;
    const filePath = this.jobPath(jobId);
    if (!existsSync(filePath)) return null;
    try {
      const text = await readFile(filePath, "utf8");
      return JSON.parse(text || "null");
    } catch {
      return null;
    }
  }

  async set(jobId, job) {
    const filePath = this.jobPath(jobId);
    await mkdir(this.dir, { recursive: true });
    const next = { ...job, jobId, updatedAt: new Date().toISOString(), jobSchemaVersion: JOB_SCHEMA_VERSION };
    const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmpPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      await rename(tmpPath, filePath);
    } catch (error) {
      await unlink(tmpPath).catch(() => {});
      throw error;
    }
    return next;
  }

  async list() {
    if (!existsSync(this.dir)) return [];
    const names = await readdir(this.dir).catch(() => []);
    const jobs = [];
    for (const name of names) {
      if (!name.endsWith(".json") || name.endsWith(".tmp")) continue;
      const job = await this.get(name.slice(0, -".json".length));
      if (job) jobs.push(job);
    }
    return jobs;
  }

  // Atomically lease a specific job to `leaseOwner` if it is queued or its previous lease has
  // expired. Returns the leased job, or null if it is terminal or actively leased by someone else.
  async claim(jobId, leaseOwner, leaseMs) {
    return this.withLock(async () => {
      const job = await this.get(jobId);
      if (!job || isTerminalJobState(job.status)) return null;
      const now = Date.now();
      const leaseHeldByOther = job.leaseOwner &&
        job.leaseOwner !== leaseOwner &&
        job.leaseExpiresAt &&
        Date.parse(job.leaseExpiresAt) > now;
      if (leaseHeldByOther) return null;
      const nowIso = new Date(now).toISOString();
      const leased = {
        ...job,
        status: job.status === "queued" ? "leased" : job.status,
        leaseOwner,
        leaseExpiresAt: new Date(now + leaseMs).toISOString(),
        heartbeatAt: nowIso,
        startedAt: job.startedAt || nowIso,
        attempt: Number(job.attempt || 0) + 1
      };
      return this.set(jobId, leased);
    });
  }

  // Scan for the next claimable job (queued, or active with an expired lease) and lease it.
  async claimNext(leaseOwner, leaseMs) {
    return this.withLock(async () => {
      const now = Date.now();
      const jobs = (await this.list())
        .filter((job) => !isTerminalJobState(job.status))
        .filter((job) => {
          const leaseHeldByOther = job.leaseOwner &&
            job.leaseOwner !== leaseOwner &&
            job.leaseExpiresAt &&
            Date.parse(job.leaseExpiresAt) > now;
          return !leaseHeldByOther;
        })
        .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
      const target = jobs[0];
      if (!target) return null;
      const nowIso = new Date(now).toISOString();
      const leased = {
        ...target,
        status: target.status === "queued" ? "leased" : target.status,
        leaseOwner,
        leaseExpiresAt: new Date(now + leaseMs).toISOString(),
        heartbeatAt: nowIso,
        startedAt: target.startedAt || nowIso,
        attempt: Number(target.attempt || 0) + 1
      };
      return this.set(target.jobId, leased);
    });
  }

  // Renew the lease while a stage runs. No-op if we no longer own the lease (another worker took it).
  async heartbeat(jobId, leaseOwner, leaseMs, patch = {}) {
    return this.withLock(async () => {
      const job = await this.get(jobId);
      if (!job || job.leaseOwner !== leaseOwner || isTerminalJobState(job.status)) return job;
      const now = Date.now();
      return this.set(jobId, {
        ...job,
        ...patch,
        leaseExpiresAt: new Date(now + leaseMs).toISOString(),
        heartbeatAt: new Date(now).toISOString()
      });
    });
  }

  // Release the lease (graceful shutdown) so another worker/restart can pick the job up immediately
  // instead of waiting for the lease to expire. Only clears if we still own it.
  async releaseLease(jobId, leaseOwner) {
    return this.withLock(async () => {
      const job = await this.get(jobId);
      if (!job || job.leaseOwner !== leaseOwner || isTerminalJobState(job.status)) return job;
      return this.set(jobId, { ...job, leaseOwner: "", leaseExpiresAt: "" });
    });
  }

  async getDiagnosticResetManifest() {
    const jobs = await this.list();
    return {
      store: this.dir,
      dataType: "temporary analysis jobs and cached analysis artifacts",
      recordCount: jobs.length,
      willClear: true
    };
  }

  async clearDiagnosticData() {
    const jobs = await this.list();
    for (const job of jobs) {
      await unlink(this.jobPath(job.jobId)).catch(() => {});
    }
    return this.getDiagnosticResetManifest();
  }

  async deleteForStudent(ownerAccountId, studentProfileId) {
    const jobs = await this.list();
    let deleted = 0;
    for (const job of jobs) {
      if (!jobBelongsToStudent(job, ownerAccountId, studentProfileId)) continue;
      await unlink(this.jobPath(job.jobId)).catch(() => {});
      deleted += 1;
    }
    return deleted;
  }

  // Remove terminal jobs older than retentionMs so the store stays bounded (brief §6, §35).
  async prune(retentionMs) {
    const jobs = await this.list();
    const cutoff = Date.now() - Math.max(0, Number(retentionMs) || 0);
    let pruned = 0;
    for (const job of jobs) {
      if (!isTerminalJobState(job.status)) continue;
      const finishedAt = Date.parse(job.completedAt || job.failedAt || job.updatedAt || job.createdAt || "");
      if (Number.isFinite(finishedAt) && finishedAt < cutoff) {
        await unlink(this.jobPath(job.jobId)).catch(() => {});
        pruned += 1;
      }
    }
    return pruned;
  }

  async withLock(work) {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => null);
    return next;
  }
}

function sanitizeJobId(jobId) {
  return String(jobId || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 200) || "invalid-job-id";
}

function jobBelongsToStudent(job, ownerAccountId, studentProfileId) {
  return String(job?.username || job?.payload?.ownerAccountId || "") === String(ownerAccountId || "") &&
    String(job?.payload?.studentProfileId || "") === String(studentProfileId || "");
}
