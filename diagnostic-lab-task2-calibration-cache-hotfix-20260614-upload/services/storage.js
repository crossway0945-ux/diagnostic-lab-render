import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_USERS_FILE = "users.json";
const DEFAULT_HISTORY_FILE = "submission-history.json";

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
    quota: normalized.quota,
    used: normalized.used,
    totalQuota: normalized.totalQuota,
    usedQuota: normalized.usedQuota,
    remaining: normalized.remainingQuota,
    remainingQuota: normalized.remainingQuota,
    expiryDate: normalized.expiryDate,
    role: normalized.role,
    status: normalized.status,
    isActive: normalized.status === "active",
    createdAt: normalized.createdAt,
    isExpired: false,
    accessExpired: false
  };
}

export function sanitizeUserForAdmin(user) {
  const safe = sanitizeUserForClient(user);
  return {
    ...safe,
    createdAt: normalizeUserAccount(user).createdAt
  };
}

export function normalizeUserAccount(user = {}) {
  const quota = numberOr(user.totalQuota, user.quota, 0);
  const used = numberOr(user.usedQuota, user.used, 0);
  const status = normalizeStatus(user.status || (user.isActive === false ? "disabled" : "active"));

  return {
    username: String(user.username || "").trim(),
    password: String(user.password || ""),
    passwordHash: String(user.passwordHash || ""),
    displayName: String(user.displayName || user.username || "").trim(),
    plan: String(user.plan || "Early Access"),
    quota,
    used,
    totalQuota: quota,
    usedQuota: used,
    remainingQuota: Math.max(0, quota - used),
    expiryDate: String(user.expiryDate || ""),
    role: String(user.role || "student"),
    status,
    isActive: status === "active",
    createdAt: String(user.createdAt || new Date().toISOString().slice(0, 10))
  };
}

export function normalizeStatus(value) {
  return String(value || "active").toLowerCase() === "disabled" ? "disabled" : "active";
}

class JsonFileStorage {
  constructor({ dataDir, seedDir = dataDir, runtime = "node" }) {
    this.name = "local-json";
    this.runtime = runtime;
    this.isDurable = true;
    this.usersPath = path.join(dataDir, DEFAULT_USERS_FILE);
    this.historyPath = path.join(dataDir, DEFAULT_HISTORY_FILE);
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
      users[index].used = Math.min(users[index].quota, Number(users[index].used || 0) + 1);
      users[index].usedQuota = users[index].used;
      users[index].remainingQuota = Math.max(0, users[index].quota - users[index].used);
      await this.writeUsers(users);
      return users[index];
    });
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
    this.users = null;
    this.history = null;
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
    users[index].used = Math.min(users[index].quota, Number(users[index].used || 0) + 1);
    users[index].usedQuota = users[index].used;
    users[index].remainingQuota = Math.max(0, users[index].quota - users[index].used);
    this.users = users;
    return users[index];
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
}

class BlobJsonStorage {
  constructor({ dataDir, runtime = "serverless" }) {
    this.name = "netlify-blobs";
    this.runtime = runtime;
    this.isDurable = true;
    this.usersPath = path.join(dataDir, DEFAULT_USERS_FILE);
    this.historyPath = path.join(dataDir, DEFAULT_HISTORY_FILE);
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
    users[index].used = Math.min(users[index].quota, Number(users[index].used || 0) + 1);
    users[index].usedQuota = users[index].used;
    users[index].remainingQuota = Math.max(0, users[index].quota - users[index].used);
    await this.writeUsers(users);
    return users[index];
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
  if ("password" in patch && String(patch.password || "")) next.password = String(patch.password);
  if ("passwordHash" in patch && String(patch.passwordHash || "")) next.passwordHash = String(patch.passwordHash);
  if ("quota" in patch || "totalQuota" in patch) {
    next.quota = numberOr(patch.totalQuota, patch.quota, next.quota);
    next.totalQuota = next.quota;
  }
  if ("used" in patch || "usedQuota" in patch) {
    next.used = Math.max(0, numberOr(patch.usedQuota, patch.used, next.used));
    next.usedQuota = next.used;
  }
  if ("expiryDate" in patch) next.expiryDate = String(patch.expiryDate || "");
  if ("role" in patch) next.role = String(patch.role || "student");
  if ("status" in patch || "isActive" in patch) next.status = normalizeStatus(patch.status || (patch.isActive === false ? "disabled" : "active"));

  next.isActive = next.status === "active";
  next.remainingQuota = Math.max(0, next.quota - next.used);
  return next;
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
