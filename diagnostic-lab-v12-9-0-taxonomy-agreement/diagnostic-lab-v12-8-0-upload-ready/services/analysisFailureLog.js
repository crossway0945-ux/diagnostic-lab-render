// Safe, bounded failure log for analysis submissions.
//
// It records ONLY non-sensitive diagnostic metadata so an admin can see why analyses fail without
// opening Render logs. It must never store the essay, prompt, image, API key, session token, raw
// provider output, or any password data. Entries are capped and rotated.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { isServerlessRuntime } from "./storage.js";

const DEFAULT_LIMIT = 50;
const memoryByPath = new Map();

export function createAnalysisFailureLog(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const dataDir = process.env.DIAGNOSTIC_DATA_DIR || rootDir;
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : DEFAULT_LIMIT;
  if (isServerlessRuntime()) return new MemoryFailureLog({ limit });
  return new LocalFailureLog({ rootDir: dataDir, limit });
}

// Whitelist the exact safe fields. Anything not listed here is dropped, so a caller can never
// accidentally persist essay text or secrets by passing a larger object.
export function toSafeFailureRecord(input = {}) {
  const str = (value, max = 120) => (value == null ? "" : String(value).slice(0, max));
  const bool = (value) => Boolean(value);
  const arr = (value) => (Array.isArray(value) ? value.slice(0, 12).map((item) => str(item, 60)) : []);
  const owner = input.ownerAccountId ? createHash("sha256").update(String(input.ownerAccountId)).digest("hex").slice(0, 12) : "";
  return {
    requestId: str(input.requestId, 80),
    timestamp: str(input.timestamp || new Date().toISOString(), 40),
    accountRole: str(input.accountRole, 20),
    ownerHash: owner,
    taskType: str(input.taskType, 20),
    essayOrVisualType: str(input.essayOrVisualType, 60),
    providerModel: str(input.providerModel, 60),
    reasoningEffort: str(input.reasoningEffort, 20),
    failureStage: str(input.failureStage, 40),
    errorCode: str(input.errorCode, 60),
    providerStatus: input.providerStatus == null ? null : Number(input.providerStatus) || null,
    incompleteReason: str(input.incompleteReason, 60),
    retryAttempted: bool(input.retryAttempted),
    firstAttemptErrorCode: str(input.firstAttemptErrorCode, 60),
    validatorIssueCodes: arr(input.validatorIssueCodes),
    durationMs: Number.isFinite(Number(input.durationMs)) ? Number(input.durationMs) : null,
    quotaDeducted: false
  };
}

class MemoryFailureLog {
  constructor({ limit }) {
    this.name = "memory";
    this.limit = limit;
    this.records = memoryByPath.get("__memory__") || [];
    memoryByPath.set("__memory__", this.records);
  }

  async append(record) {
    this.records.unshift(toSafeFailureRecord(record));
    if (this.records.length > this.limit) this.records.length = this.limit;
    return this.records[0];
  }

  async list() {
    return [...this.records];
  }

  async clear() {
    this.records.length = 0;
    return { cleared: true, count: 0 };
  }
}

class LocalFailureLog {
  constructor({ rootDir, limit }) {
    this.name = "local-json";
    this.limit = limit;
    this.filePath = path.join(rootDir, ".diagnostic-analysis-failures.json");
  }

  async read() {
    if (memoryByPath.has(this.filePath)) return memoryByPath.get(this.filePath);
    try {
      const text = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(text || "[]");
      const records = Array.isArray(parsed) ? parsed : [];
      memoryByPath.set(this.filePath, records);
      return records;
    } catch {
      const empty = [];
      memoryByPath.set(this.filePath, empty);
      return empty;
    }
  }

  async write(records) {
    memoryByPath.set(this.filePath, records);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }

  async append(record) {
    const records = await this.read();
    const safe = toSafeFailureRecord(record);
    records.unshift(safe);
    if (records.length > this.limit) records.length = this.limit;
    await this.write(records);
    return safe;
  }

  async list() {
    return [...(await this.read())];
  }

  async clear() {
    await this.write([]);
    return { cleared: true, count: 0 };
  }
}

// Storage self-test: proves the durable data directory can be written, read back and deleted,
// without touching users, reports, quotas, progress or audit records. Uses a throwaway temp file.
export async function runStorageSelfTest(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const dataDir = process.env.DIAGNOSTIC_DATA_DIR || rootDir;
  const serverless = isServerlessRuntime();
  const result = {
    ran: true,
    adapter: serverless ? "memory" : "local-json",
    durable: !serverless,
    write: false,
    read: false,
    verify: false,
    delete: false,
    ok: false
  };
  if (serverless) {
    // On serverless the local disk is ephemeral; report the adapter without pretending durability.
    result.ok = true;
    result.write = true;
    result.read = true;
    result.verify = true;
    result.delete = true;
    return result;
  }
  const { mkdir: mkdirp, writeFile: write, readFile: read, rm } = await import("node:fs/promises");
  const token = `selftest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const filePath = path.join(dataDir, `.diagnostic-storage-selftest-${token}.json`);
  try {
    await mkdirp(dataDir, { recursive: true });
    await write(filePath, JSON.stringify({ token }), "utf8");
    result.write = true;
    const back = JSON.parse(await read(filePath, "utf8"));
    result.read = true;
    result.verify = back?.token === token;
    await rm(filePath, { force: true });
    result.delete = true;
    result.ok = result.write && result.read && result.verify && result.delete;
    return result;
  } catch (error) {
    result.errorCode = "STORAGE_SELFTEST_FAILED";
    result.debugHint = String(error?.message || "storage self-test failed").slice(0, 200);
    await rm(filePath, { force: true }).catch(() => {});
    return result;
  }
}
