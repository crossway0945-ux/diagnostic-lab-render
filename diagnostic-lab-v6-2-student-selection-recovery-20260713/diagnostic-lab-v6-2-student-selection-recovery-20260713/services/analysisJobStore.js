import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isServerlessRuntime } from "./storage.js";

const memoryJobs = new Map();

export function createAnalysisJobStore(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const dataDir = process.env.DIAGNOSTIC_DATA_DIR || rootDir;
  if (isServerlessRuntime()) {
    if (
      process.env.DIAGNOSTIC_ANALYSIS_MODE === "async" &&
      process.env.DIAGNOSTIC_ENABLE_NETLIFY_BLOBS === "true"
    ) {
      return new BlobJobStore();
    }
    return new DisabledJobStore();
  }
  return new LocalJobStore({ rootDir: dataDir });
}

class DisabledJobStore {
  constructor() {
    this.name = "disabled";
  }

  async get() {
    return null;
  }

  async set() {
    throw new Error("Analysis job storage is disabled.");
  }

  async getDiagnosticResetManifest() {
    return { store: "disabled", dataType: "temporary analysis jobs", recordCount: 0, willClear: true };
  }

  async clearDiagnosticData() {
    return this.getDiagnosticResetManifest();
  }
}

class BlobJobStore {
  constructor() {
    this.name = "netlify-blobs";
    this.storePromise = null;
  }

  async get(jobId) {
    const store = await this.getStore();
    return await store.get(jobKey(jobId), { type: "json", consistency: "strong" });
  }

  async set(jobId, job) {
    const store = await this.getStore();
    await store.setJSON(jobKey(jobId), job);
    return job;
  }

  async getDiagnosticResetManifest() {
    const store = await this.getStore();
    const result = await store.list({ prefix: "jobs/" });
    return {
      store: "netlify-blobs:ielts-diagnostic-analysis-jobs/jobs/",
      dataType: "temporary analysis jobs and cached analysis artifacts",
      recordCount: Array.isArray(result?.blobs) ? result.blobs.length : 0,
      willClear: true
    };
  }

  async clearDiagnosticData() {
    const store = await this.getStore();
    const result = await store.list({ prefix: "jobs/" });
    for (const blob of result?.blobs || []) {
      await store.delete(blob.key);
    }
    return this.getDiagnosticResetManifest();
  }

  async getStore() {
    if (!this.storePromise) {
      this.storePromise = import("@netlify/blobs").then(({ getStore }) => getStore({
        name: "ielts-diagnostic-analysis-jobs",
        consistency: "strong"
      }));
    }
    return this.storePromise;
  }
}

class LocalJobStore {
  constructor({ rootDir }) {
    this.name = "local-json";
    this.jobsPath = path.join(rootDir, ".diagnostic-jobs.json");
  }

  async get(jobId) {
    const jobs = await this.readJobs();
    return jobs[jobId] || null;
  }

  async set(jobId, job) {
    const jobs = await this.readJobs();
    jobs[jobId] = job;
    await mkdir(path.dirname(this.jobsPath), { recursive: true });
    await writeFile(this.jobsPath, `${JSON.stringify(jobs, null, 2)}\n`, "utf8");
    memoryJobs.set(jobId, job);
    return job;
  }

  async getDiagnosticResetManifest() {
    const jobs = await this.readJobs();
    return {
      store: this.jobsPath,
      dataType: "temporary analysis jobs and cached analysis artifacts",
      recordCount: Object.keys(jobs).length,
      willClear: true
    };
  }

  async clearDiagnosticData() {
    memoryJobs.clear();
    await mkdir(path.dirname(this.jobsPath), { recursive: true });
    await writeFile(this.jobsPath, "{}\n", "utf8");
    return this.getDiagnosticResetManifest();
  }

  async readJobs() {
    if (memoryJobs.size) return Object.fromEntries(memoryJobs.entries());
    try {
      const text = await readFile(this.jobsPath, "utf8");
      const parsed = JSON.parse(text || "{}");
      Object.entries(parsed).forEach(([key, value]) => memoryJobs.set(key, value));
      return parsed;
    } catch {
      return {};
    }
  }
}

function jobKey(jobId) {
  return `jobs/${String(jobId || "").replace(/[^a-zA-Z0-9._-]/g, "")}.json`;
}
