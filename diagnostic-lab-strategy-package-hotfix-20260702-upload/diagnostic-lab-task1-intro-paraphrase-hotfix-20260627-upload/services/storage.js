import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_USERS_FILE = "users.json";
const DEFAULT_HISTORY_FILE = "submission-history.json";
const DEFAULT_AUDIT_FILE = "usage-audit.json";

export function createStorage(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const dataDir = process.env.DIAGNOSTIC_DATA_DIR || rootDir;
  const serverlessRuntime = isServerlessRuntime();
  const requestedAdapter = options.adapter || process.env.DIAGNOSTIC_STORAGE_ADAPTER || "";
  const allowServerlessJson = process.env.ALLOW_NETLIFY_LOCAL_JSON === "true";
  let adapter = requestedAdapter || (serverlessRuntime ? "memory" : "local-json");
  let storageName = adapter;

  if (serverlessRuntime && adapter === "local-json" && !allowServerlessJson) {
    adapter = "memory";
    storageName = "netlify-memory";
  } else if (serverlessRuntime && adapter === "memory" && !requestedAdapter) {
    storageName = "netlify-memory";
  } else if (serverlessRuntime && adapter === "netlify-blobs") {
    adapter = "memory";
    storageName = "netlify-memory";
  }

  if (adapter === "local-json") {
    return new JsonFileStorage({ dataDir, seedDir: rootDir, runtime: serverlessRuntime ? "serverless" : "node" });
  }

  if (adapter === "memory") {
    return new MemoryStorage({ dataDir, name: storageName, runtime: serverlessRuntime ? "serverless" : "node" });
  }

  if (adapter === "netlify-blobs") {
    return new BlobJsonStorage({ dataDir, runtime: serverlessRuntime ? "serverless" : "node" });
  }

  throw new Error(`Unsupported storage adapter: ${adapter}`);
}

export function isServerlessRuntime() {
  return Boolean(
    process.env.NETLIFY ||
    process.env.LAMBDA_TASK_ROOT ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV
  );
}

export function sanitizeUserForClient(user) {
  const normalized = normalizeUserAccount(user);
  return {
    username: normalized.username,
    displayName: normalized.displayName,
    plan: normalized.plan,
    role: normalized.role,
    quotaMode: normalized.quotaMode,
    quota: normalized.quota,
    used: normalized.used,
    totalQuota: normalized.totalQuota,
    usedQuota: normalized.usedQuota,
    remaining: normalized.remainingQuota,
    remainingQuota: normalized.remainingQuota,
    expiryDate: normalized.expiryDate,
    expiresAt: normalized.expiresAt,
    status: normalized.status,
    isActive: normalized.status === "active",
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    lastLoginAt: normalized.lastLoginAt,
    dailyUsage: normalized.dailyUsage,
    isExpired: false,
    accessExpired: false
  };
}

export function sanitizeUserForAdmin(user) {
  const normalized = normalizeUserAccount(user);
  const safe = sanitizeUserForClient(normalized);
  return {
    ...safe,
    quotaLimit: normalized.quotaLimit,
    quotaUsed: normalized.quotaUsed,
    submissionCount: Number(normalized.submissionCount || 0),
    createdAt: normalized.createdAt
  };
}

export function normalizeUserAccount(user = {}) {
  const role = normalizeRole(user.role);
  const quotaMode = normalizeQuotaMode(user.quotaMode || (["teacher", "admin"].includes(role) ? "unlimited" : "limited"));
  const quota = numberOr(user.quotaLimit, user.totalQuota, user.quota, quotaMode === "unlimited" ? 0 : 0);
  const used = Math.max(0, numberOr(user.quotaUsed, user.usedQuota, user.used, 0));
  const status = normalizeStatus(user.status || (user.isActive === false ? "inactive" : "active"));
  const expiryDate = String(user.expiresAt || user.expiryDate || "").trim();
  const now = new Date().toISOString();

  return {
    username: String(user.username || "").trim(),
    password: String(user.password || ""),
    passwordHash: String(user.passwordHash || ""),
    displayName: String(user.displayName || user.username || "").trim(),
    plan: String(user.plan || "Early Access"),
    role,
    quotaMode,
    quota,
    used,
    quotaLimit: quota,
    quotaUsed: used,
    totalQuota: quota,
    usedQuota: used,
    remainingQuota: quotaMode === "unlimited" ? null : Math.max(0, quota - used),
    expiryDate,
    expiresAt: expiryDate,
    status,
    isActive: status === "active",
    dailyUsage: normalizeDailyUsage(user.dailyUsage),
    createdAt: String(user.createdAt || now.slice(0, 10)),
    updatedAt: String(user.updatedAt || user.createdAt || now),
    lastLoginAt: String(user.lastLoginAt || "")
  };
}

export function normalizeStatus(value) {
  const normalized = String(value || "active").toLowerCase();
  return ["inactive", "disabled", "false"].includes(normalized) ? "inactive" : "active";
}

export function normalizeRole(value) {
  const normalized = String(value || "student").toLowerCase();
  return ["teacher", "admin"].includes(normalized) ? normalized : "student";
}

export function normalizeQuotaMode(value) {
  return String(value || "limited").toLowerCase() === "unlimited" ? "unlimited" : "limited";
}

function normalizeDailyUsage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([date, count]) => [
    String(date),
    Math.max(0, Number(count) || 0)
  ]));
}

class JsonFileStorage {
  constructor({ dataDir, seedDir = dataDir, runtime = "node" }) {
    this.name = "local-json";
    this.runtime = runtime;
    this.isDurable = true;
    this.usersPath = path.join(dataDir, DEFAULT_USERS_FILE);
    this.historyPath = path.join(dataDir, DEFAULT_HISTORY_FILE);
    this.auditPath = path.join(dataDir, DEFAULT_AUDIT_FILE);
    this.seedUsersPath = path.join(seedDir, DEFAULT_USERS_FILE);
    this.seedHistoryPath = path.join(seedDir, DEFAULT_HISTORY_FILE);
    this.queue = Promise.resolve();
  }

  async getUserByUsername(username) {
    const users = await this.readUsers();
    return users.find((user) => user.username === username) || null;
  }

  async listUsers() {
    return this.readUsers();
  }

  async createUser(input) {
    return this.withLock(async () => {
      const users = await this.readUsers();
      const next = normalizeUserAccount(input);
      if (!next.username) throw statusError("Username is required.", 400);
      if (!next.password && !next.passwordHash) throw statusError("Password is required.", 400);
      if (users.some((user) => user.username === next.username)) {
        throw statusError("This username already exists.", 409);
      }
      users.push(next);
      await this.writeUsers(users);
      return next;
    });
  }

  async updateUser(username, patch) {
    return this.withLock(async () => {
      const users = await this.readUsers();
      const index = users.findIndex((user) => user.username === username);
      if (index === -1) throw statusError("Student account was not found.", 404);
      users[index] = applyUserPatch(users[index], patch);
      await this.writeUsers(users);
      return users[index];
    });
  }

  async disableUser(username) {
    return this.updateUser(username, { status: "disabled" });
  }

  async enableUser(username) {
    return this.updateUser(username, { status: "active" });
  }

  async incrementUsage(username) {
    return this.withLock(async () => {
      const users = await this.readUsers();
      const index = users.findIndex((user) => user.username === username);
      if (index === -1) throw statusError("Session user was not found. Please log in again.", 401);
      users[index] = incrementUserUsage(users[index]);
      await this.writeUsers(users);
      return users[index];
    });
  }

  async appendAuditLog(entry) {
    return this.withLock(async () => {
      const records = await this.readAudit();
      const next = normalizeAuditEntry(entry);
      records.push(next);
      await this.writeAudit(records);
      return next;
    });
  }

  async getAuditSummary() {
    const records = await this.readAudit();
    return buildAuditSummary(records);
  }

  async getSubmissionHistory(username) {
    const records = await this.readHistory();
    return records
      .filter((record) => record.username === username)
      .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
  }

  async findSubmissionByKey(username, idempotencyKey) {
    if (!idempotencyKey) return null;
    const records = await this.readHistory();
    return records.find((record) => record.username === username && record.clientSubmissionId === idempotencyKey) || null;
  }

  async findSubmissionByHash(username, submissionHash) {
    if (!submissionHash) return null;
    const records = await this.readHistory();
    return records.find((record) => record.username === username && record.submissionHash === submissionHash) || null;
  }

  async appendSubmission(record) {
    return this.withLock(async () => {
      const records = await this.readHistory();
      if (record.clientSubmissionId) {
        const existing = records.find((item) => item.username === record.username && item.clientSubmissionId === record.clientSubmissionId);
        if (existing) return existing;
      }
      if (record.submissionHash) {
        const existing = records.find((item) => item.username === record.username && item.submissionHash === record.submissionHash);
        if (existing) return existing;
      }
      records.push(record);
      await this.writeHistory(records);
      return record;
    });
  }

  async readUsers() {
    const parsed = await readJsonWithSeed(this.usersPath, this.seedUsersPath, []);
    return Array.isArray(parsed) ? parsed.map(normalizeUserAccount) : [];
  }

  async writeUsers(users) {
    await writeJson(this.usersPath, users.map(normalizeUserAccount));
  }

  async readHistory() {
    const parsed = await readJsonWithSeed(this.historyPath, this.seedHistoryPath, []);
    return Array.isArray(parsed) ? parsed : [];
  }

  async writeHistory(records) {
    await writeJson(this.historyPath, records);
  }

  async readAudit() {
    const parsed = await readJson(this.auditPath, []);
    return Array.isArray(parsed) ? parsed : [];
  }

  async writeAudit(records) {
    await writeJson(this.auditPath, records);
  }

  async withLock(work) {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => null);
    return next;
  }
}

class MemoryStorage {
  constructor({ dataDir, name = "memory", runtime = "node" }) {
    this.name = name;
    this.runtime = runtime;
    this.isDurable = false;
    this.usersPath = path.join(dataDir, DEFAULT_USERS_FILE);
    this.historyPath = path.join(dataDir, DEFAULT_HISTORY_FILE);
    this.auditPath = path.join(dataDir, DEFAULT_AUDIT_FILE);
    this.users = null;
    this.history = null;
    this.audit = null;
  }

  async getUserByUsername(username) {
    const users = await this.readUsers();
    return users.find((user) => user.username === username) || null;
  }

  async listUsers() {
    return this.readUsers();
  }

  async createUser(input) {
    const users = await this.readUsers();
    const next = normalizeUserAccount(input);
    if (!next.username) throw statusError("Username is required.", 400);
    if (!next.password && !next.passwordHash) throw statusError("Password is required.", 400);
    if (users.some((user) => user.username === next.username)) {
      throw statusError("This username already exists.", 409);
    }
    users.push(next);
    this.users = users;
    return next;
  }

  async updateUser(username, patch) {
    const users = await this.readUsers();
    const index = users.findIndex((user) => user.username === username);
    if (index === -1) throw statusError("Student account was not found.", 404);
    users[index] = applyUserPatch(users[index], patch);
    this.users = users;
    return users[index];
  }

  async disableUser(username) {
    return this.updateUser(username, { status: "disabled" });
  }

  async enableUser(username) {
    return this.updateUser(username, { status: "active" });
  }

  async incrementUsage(username) {
    const users = await this.readUsers();
    const index = users.findIndex((user) => user.username === username);
    if (index === -1) throw statusError("Session user was not found. Please log in again.", 401);
    users[index] = incrementUserUsage(users[index]);
    this.users = users;
    return users[index];
  }

  async appendAuditLog(entry) {
    const records = await this.readAudit();
    const next = normalizeAuditEntry(entry);
    records.push(next);
    this.audit = records;
    return next;
  }

  async getAuditSummary() {
    const records = await this.readAudit();
    return buildAuditSummary(records);
  }

  async getSubmissionHistory(username) {
    const records = await this.readHistory();
    return records
      .filter((record) => record.username === username)
      .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
  }

  async findSubmissionByKey(username, idempotencyKey) {
    if (!idempotencyKey) return null;
    const records = await this.readHistory();
    return records.find((record) => record.username === username && record.clientSubmissionId === idempotencyKey) || null;
  }

  async findSubmissionByHash(username, submissionHash) {
    if (!submissionHash) return null;
    const records = await this.readHistory();
    return records.find((record) => record.username === username && record.submissionHash === submissionHash) || null;
  }

  async appendSubmission(record) {
    const records = await this.readHistory();
    if (record.clientSubmissionId) {
      const existing = records.find((item) => item.username === record.username && item.clientSubmissionId === record.clientSubmissionId);
      if (existing) return existing;
    }
    if (record.submissionHash) {
      const existing = records.find((item) => item.username === record.username && item.submissionHash === record.submissionHash);
      if (existing) return existing;
    }
    records.push(record);
    this.history = records;
    return record;
  }

  async readUsers() {
    if (!this.users) {
      const parsed = await readJson(this.usersPath, []);
      this.users = Array.isArray(parsed) ? parsed.map(normalizeUserAccount) : [];
    }
    return this.users.map((user) => ({ ...user }));
  }

  async readHistory() {
    if (!this.history) {
      const parsed = await readJson(this.historyPath, []);
      this.history = Array.isArray(parsed) ? parsed : [];
    }
    return this.history.map((record) => ({ ...record }));
  }

  async readAudit() {
    if (!this.audit) {
      const parsed = await readJson(this.auditPath, []);
      this.audit = Array.isArray(parsed) ? parsed : [];
    }
    return this.audit.map((record) => ({ ...record }));
  }
}

class BlobJsonStorage {
  constructor({ dataDir, runtime = "serverless" }) {
    this.name = "netlify-blobs";
    this.runtime = runtime;
    this.isDurable = true;
    this.usersPath = path.join(dataDir, DEFAULT_USERS_FILE);
    this.historyPath = path.join(dataDir, DEFAULT_HISTORY_FILE);
    this.auditPath = path.join(dataDir, DEFAULT_AUDIT_FILE);
    this.storePromise = null;
  }

  async getUserByUsername(username) {
    const users = await this.readUsers();
    return users.find((user) => user.username === username) || null;
  }

  async listUsers() {
    return this.readUsers();
  }

  async createUser(input) {
    const users = await this.readUsers();
    const next = normalizeUserAccount(input);
    if (!next.username) throw statusError("Username is required.", 400);
    if (!next.password && !next.passwordHash) throw statusError("Password is required.", 400);
    if (users.some((user) => user.username === next.username)) {
      throw statusError("This username already exists.", 409);
    }
    users.push(next);
    await this.writeUsers(users);
    return next;
  }

  async updateUser(username, patch) {
    const users = await this.readUsers();
    const index = users.findIndex((user) => user.username === username);
    if (index === -1) throw statusError("Student account was not found.", 404);
    users[index] = applyUserPatch(users[index], patch);
    await this.writeUsers(users);
    return users[index];
  }

  async disableUser(username) {
    return this.updateUser(username, { status: "disabled" });
  }

  async enableUser(username) {
    return this.updateUser(username, { status: "active" });
  }

  async incrementUsage(username) {
    const users = await this.readUsers();
    const index = users.findIndex((user) => user.username === username);
    if (index === -1) throw statusError("Session user was not found. Please log in again.", 401);
    users[index] = incrementUserUsage(users[index]);
    await this.writeUsers(users);
    return users[index];
  }

  async appendAuditLog(entry) {
    const records = await this.readAudit();
    const next = normalizeAuditEntry(entry);
    records.push(next);
    await this.writeAudit(records);
    return next;
  }

  async getAuditSummary() {
    const records = await this.readAudit();
    return buildAuditSummary(records);
  }

  async getSubmissionHistory(username) {
    const records = await this.readHistory();
    return records
      .filter((record) => record.username === username)
      .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
  }

  async findSubmissionByKey(username, idempotencyKey) {
    if (!idempotencyKey) return null;
    const records = await this.readHistory();
    return records.find((record) => record.username === username && record.clientSubmissionId === idempotencyKey) || null;
  }

  async findSubmissionByHash(username, submissionHash) {
    if (!submissionHash) return null;
    const records = await this.readHistory();
    return records.find((record) => record.username === username && record.submissionHash === submissionHash) || null;
  }

  async appendSubmission(record) {
    const records = await this.readHistory();
    if (record.clientSubmissionId) {
      const existing = records.find((item) => item.username === record.username && item.clientSubmissionId === record.clientSubmissionId);
      if (existing) return existing;
    }
    if (record.submissionHash) {
      const existing = records.find((item) => item.username === record.username && item.submissionHash === record.submissionHash);
      if (existing) return existing;
    }
    records.push(record);
    await this.writeHistory(records);
    return record;
  }

  async readUsers() {
    const seeded = await this.readSeededJson("users.json", this.usersPath, []);
    return Array.isArray(seeded) ? seeded.map(normalizeUserAccount) : [];
  }

  async writeUsers(users) {
    await this.writeBlobJson("users.json", users.map(normalizeUserAccount));
  }

  async readHistory() {
    const seeded = await this.readSeededJson("submission-history.json", this.historyPath, []);
    return Array.isArray(seeded) ? seeded : [];
  }

  async writeHistory(records) {
    await this.writeBlobJson("submission-history.json", records);
  }

  async readAudit() {
    const seeded = await this.readSeededJson("usage-audit.json", this.auditPath, []);
    return Array.isArray(seeded) ? seeded : [];
  }

  async writeAudit(records) {
    await this.writeBlobJson("usage-audit.json", records);
  }

  async readSeededJson(key, filePath, fallback) {
    const store = await this.getStore();
    const existing = await store.get(key, { type: "json", consistency: "strong" });
    if (existing !== null) return existing;

    const seeded = await readJson(filePath, fallback);
    await store.setJSON(key, seeded);
    return seeded;
  }

  async writeBlobJson(key, value) {
    const store = await this.getStore();
    await store.setJSON(key, value);
  }

  async getStore() {
    if (!this.storePromise) {
      this.storePromise = import("@netlify/blobs").then(({ getStore }) => getStore({
        name: "ielts-diagnostic-lab",
        consistency: "strong"
      }));
    }
    return this.storePromise;
  }
}

function applyUserPatch(user, patch = {}) {
  const next = { ...normalizeUserAccount(user) };

  if ("displayName" in patch) next.displayName = String(patch.displayName || next.username).trim();
  if ("plan" in patch) next.plan = String(patch.plan || next.plan);
  if ("password" in patch) next.password = String(patch.password || "");
  if ("passwordHash" in patch) next.passwordHash = String(patch.passwordHash || "");
  if ("role" in patch) next.role = normalizeRole(patch.role);
  if ("quotaMode" in patch) next.quotaMode = normalizeQuotaMode(patch.quotaMode);
  if ("role" in patch && !("quotaMode" in patch)) {
    next.quotaMode = ["teacher", "admin"].includes(next.role) ? "unlimited" : "limited";
  }
  if ("quota" in patch || "totalQuota" in patch || "quotaLimit" in patch) {
    next.quota = numberOr(patch.quotaLimit, patch.totalQuota, patch.quota, next.quota);
    next.totalQuota = next.quota;
    next.quotaLimit = next.quota;
  }
  if ("used" in patch || "usedQuota" in patch || "quotaUsed" in patch) {
    next.used = Math.max(0, numberOr(patch.quotaUsed, patch.usedQuota, patch.used, next.used));
    next.usedQuota = next.used;
    next.quotaUsed = next.used;
  }
  if ("expiryDate" in patch || "expiresAt" in patch) {
    next.expiryDate = String(patch.expiresAt || patch.expiryDate || "");
    next.expiresAt = next.expiryDate;
  }
  if ("dailyUsage" in patch) next.dailyUsage = normalizeDailyUsage(patch.dailyUsage);
  if ("lastLoginAt" in patch) next.lastLoginAt = String(patch.lastLoginAt || "");
  if ("status" in patch || "isActive" in patch) next.status = normalizeStatus(patch.status || (patch.isActive === false ? "disabled" : "active"));

  next.isActive = next.status === "active";
  next.remainingQuota = next.quotaMode === "unlimited" ? null : Math.max(0, next.quota - next.used);
  next.updatedAt = new Date().toISOString();
  return next;
}

function incrementUserUsage(user) {
  const next = normalizeUserAccount(user);
  next.used += 1;
  next.usedQuota = next.used;
  next.quotaUsed = next.used;
  if (next.quotaMode === "limited") {
    next.used = Math.min(next.quota, next.used);
    next.usedQuota = next.used;
    next.quotaUsed = next.used;
    next.remainingQuota = Math.max(0, next.quota - next.used);
  } else {
    const today = usageDateKey();
    next.dailyUsage = {
      ...normalizeDailyUsage(next.dailyUsage),
      [today]: Math.max(0, Number(next.dailyUsage?.[today] || 0)) + 1
    };
    next.remainingQuota = null;
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

function normalizeAuditEntry(entry = {}) {
  return {
    timestamp: String(entry.timestamp || new Date().toISOString()),
    username: String(entry.username || ""),
    role: normalizeRole(entry.role),
    taskType: String(entry.taskType || ""),
    taskSubtype: String(entry.taskSubtype || ""),
    openAiCalled: Boolean(entry.openAiCalled),
    quotaDeducted: Boolean(entry.quotaDeducted),
    duplicateCacheUsed: Boolean(entry.duplicateCacheUsed),
    blocked: Boolean(entry.blocked),
    reason: String(entry.reason || "")
  };
}

function buildAuditSummary(records = []) {
  const summary = new Map();
  for (const record of records.map(normalizeAuditEntry)) {
    const current = summary.get(record.username) || {
      username: record.username,
      role: record.role,
      totalRequests: 0,
      openAiCalls: 0,
      quotaDeducted: 0,
      duplicates: 0,
      blocked: 0,
      lastActivityAt: ""
    };
    current.role = record.role || current.role;
    current.totalRequests += 1;
    if (record.openAiCalled) current.openAiCalls += 1;
    if (record.quotaDeducted) current.quotaDeducted += 1;
    if (record.duplicateCacheUsed) current.duplicates += 1;
    if (record.blocked) current.blocked += 1;
    current.lastActivityAt = record.timestamp || current.lastActivityAt;
    summary.set(record.username, current);
  }
  return Array.from(summary.values());
}

function usageDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text || "null") ?? fallback;
}

async function readJsonWithSeed(filePath, seedPath, fallback) {
  if (existsSync(filePath)) return readJson(filePath, fallback);
  if (seedPath && seedPath !== filePath && existsSync(seedPath)) {
    return readJson(seedPath, fallback);
  }
  return fallback;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function numberOr(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function statusError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
