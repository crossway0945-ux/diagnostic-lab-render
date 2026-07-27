// Async-render job timing/limits (brief §6, §7, §35). Every value is env-configurable and read
// through a helper so nothing is hardcoded across the codebase. Defaults match the brief's
// recommended initial production values.

function posInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const JOB_DEFAULTS = Object.freeze({
  leaseMs: 120000, // DIAGNOSTIC_JOB_LEASE_MS
  timeoutMs: 900000, // DIAGNOSTIC_JOB_TIMEOUT_MS (whole job)
  staleMs: 1200000, // DIAGNOSTIC_JOB_STALE_MS (unrecoverable)
  retentionMs: 86400000, // DIAGNOSTIC_JOB_RETENTION_MS (prune terminal jobs after 24h)
  concurrency: 1, // DIAGNOSTIC_JOB_CONCURRENCY
  pollIntervalMs: 2500, // DIAGNOSTIC_JOB_POLL_INTERVAL_MS (frontend + worker tick)
  workerTickMs: 1000, // worker idle poll interval
  providerMaxAttempts: 2 // bounded provider attempts across restarts (crash recovery)
});

export const jobLeaseMs = () => posInt(process.env.DIAGNOSTIC_JOB_LEASE_MS, JOB_DEFAULTS.leaseMs);
export const jobTimeoutMs = () => posInt(process.env.DIAGNOSTIC_JOB_TIMEOUT_MS, JOB_DEFAULTS.timeoutMs);
export const jobStaleMs = () => posInt(process.env.DIAGNOSTIC_JOB_STALE_MS, JOB_DEFAULTS.staleMs);
export const jobRetentionMs = () => posInt(process.env.DIAGNOSTIC_JOB_RETENTION_MS, JOB_DEFAULTS.retentionMs);
export const jobConcurrency = () => Math.max(1, posInt(process.env.DIAGNOSTIC_JOB_CONCURRENCY, JOB_DEFAULTS.concurrency));
export const jobPollIntervalMs = () => posInt(process.env.DIAGNOSTIC_JOB_POLL_INTERVAL_MS, JOB_DEFAULTS.pollIntervalMs);
export const jobWorkerTickMs = () => posInt(process.env.DIAGNOSTIC_JOB_WORKER_TICK_MS, JOB_DEFAULTS.workerTickMs);
export const providerMaxAttempts = () => Math.max(1, posInt(process.env.DIAGNOSTIC_PROVIDER_MAX_ATTEMPTS, JOB_DEFAULTS.providerMaxAttempts));

export function jobConfigSnapshot() {
  return {
    leaseMs: jobLeaseMs(),
    timeoutMs: jobTimeoutMs(),
    staleMs: jobStaleMs(),
    retentionMs: jobRetentionMs(),
    concurrency: jobConcurrency(),
    pollIntervalMs: jobPollIntervalMs(),
    providerMaxAttempts: providerMaxAttempts()
  };
}
