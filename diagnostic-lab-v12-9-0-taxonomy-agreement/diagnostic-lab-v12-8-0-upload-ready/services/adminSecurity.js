// Admin security services (V12.9.1 — brief item I).
//
// Three concerns that must outlive a single process:
//   * CSRF — every privileged write proves it was issued by this origin for this session.
//   * Durable admin audit — a restart must not erase the record of a privileged action.
//   * Durable session revocation — a password reset, disable, archive or delete must keep old
//     sessions dead across a restart, without killing sessions issued after the event and without
//     reviving old tokens when the same username is recreated.
//
// State lives in JSON files inside the resolved data directory (the Render disk), written through
// atomic replace. Nothing secret is ever stored: no passwords, hashes, cookies, keys, essay text or
// environment values.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const ADMIN_SECURITY_VERSION = "admin-security-v12.9.1";

const AUDIT_FILE = "admin-audit-log.json";
const REVOCATION_FILE = "admin-session-revocations.json";
const AUDIT_LIMIT = 5000;
const CSRF_TTL_MS = 4 * 60 * 60 * 1000;

// Every privileged action that mutates data. A write route not listed here is not privileged.
export const PRIVILEGED_ADMIN_ACTIONS = Object.freeze([
  "user-create", "user-update", "role-change", "status-change", "password-reset", "quota-change",
  "expiry-change", "account-disable", "account-enable", "account-archive", "account-restore",
  "account-delete", "report-delete", "session-revoke", "qa-export", "diagnostics-mutate"
]);

// Audit actions that must be recorded even when they are not privileged writes.
export const AUDIT_ONLY_ACTIONS = Object.freeze(["admin-login", "admin-access-denied", "qa-export"]);

function secret() {
  return process.env.SESSION_SECRET || process.env.OPENAI_API_KEY || "change-this-session-secret";
}

function hmac(value) {
  return createHmac("sha256", secret()).update(String(value)).digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// CSRF: a stateless token bound to the session subject, so it cannot be replayed for another user
// and cannot be minted by a third-party site (which cannot read the session cookie).
// ---------------------------------------------------------------------------
export function issueCsrfToken(sessionSubject) {
  const subject = String(sessionSubject || "");
  if (!subject) return "";
  const nonce = randomBytes(12).toString("base64url");
  const expiresAt = Date.now() + CSRF_TTL_MS;
  const payload = `${nonce}.${expiresAt}`;
  return `${payload}.${hmac(`csrf:${subject}:${payload}`)}`;
}

export function verifyCsrfToken(sessionSubject, token) {
  const subject = String(sessionSubject || "");
  const parts = String(token || "").split(".");
  if (!subject || parts.length !== 3) return { ok: false, reason: "CSRF token is missing or malformed." };
  const [nonce, expiresAt, signature] = parts;
  if (!safeEqual(signature, hmac(`csrf:${subject}:${nonce}.${expiresAt}`))) {
    return { ok: false, reason: "CSRF token signature does not match this session." };
  }
  if (!Number(expiresAt) || Date.now() > Number(expiresAt)) {
    return { ok: false, reason: "CSRF token has expired. Reload the admin console." };
  }
  return { ok: true };
}

// Same-origin defence in depth: a cross-site form post carries a foreign Origin (or, for older
// clients, a foreign Referer). A request with neither header and no CSRF token is refused.
export function checkSameOrigin(headers = {}, host = "") {
  const read = (name) => {
    const key = Object.keys(headers || {}).find((item) => item.toLowerCase() === name);
    return key ? String(headers[key] || "") : "";
  };
  const origin = read("origin");
  const referer = read("referer");
  const expectedHost = String(host || read("host") || "").toLowerCase();
  const hostOf = (value) => {
    try {
      return new URL(value).host.toLowerCase();
    } catch {
      return "";
    }
  };
  if (origin) return { ok: hostOf(origin) === expectedHost, reason: "Request origin does not match this site." };
  if (referer) return { ok: hostOf(referer) === expectedHost, reason: "Request referer does not match this site." };
  return { ok: false, reason: "Request carries no Origin or Referer header." };
}

// ---------------------------------------------------------------------------
// Durable JSON state.
// ---------------------------------------------------------------------------
async function readState(filePath, fallback) {
  try {
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeState(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), "utf8");
  await rename(temp, filePath);
}

const FORBIDDEN_METADATA_KEYS = /password|hash|secret|token|cookie|apikey|api_key|authorization|essay|writing|env/i;

// Metadata is operational only. Any key that could carry a credential, a cookie, a key, an essay or
// an environment value is dropped rather than truncated, and long values are clipped.
export function safeAuditMetadata(metadata = {}) {
  const out = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (FORBIDDEN_METADATA_KEYS.test(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "object") {
      const nested = safeAuditMetadata(value);
      if (Object.keys(nested).length) out[key] = nested;
      continue;
    }
    const text = String(value);
    if (FORBIDDEN_METADATA_KEYS.test(text) && text.length > 40) continue;
    out[key] = typeof value === "number" || typeof value === "boolean" ? value : text.slice(0, 160);
  }
  return out;
}

export function createAdminSecurity({ dataDir = "" } = {}) {
  const auditPath = path.join(dataDir || ".", AUDIT_FILE);
  const revocationPath = path.join(dataDir || ".", REVOCATION_FILE);
  let queue = Promise.resolve();
  const serialise = (work) => {
    const next = queue.then(work, work);
    queue = next.then(() => undefined, () => undefined);
    return next;
  };

  return {
    version: ADMIN_SECURITY_VERSION,
    auditPath,
    revocationPath,

    // ---- audit -----------------------------------------------------------------------------
    async appendAudit({ action = "", adminAccountId = "", targetId = "", result = "ok", metadata = {} } = {}) {
      const event = {
        eventId: `evt-${Date.now().toString(36)}-${randomBytes(5).toString("hex")}`,
        timestamp: new Date().toISOString(),
        action: String(action || ""),
        adminAccountId: String(adminAccountId || ""),
        targetId: String(targetId || ""),
        result: String(result || "ok"),
        metadata: safeAuditMetadata(metadata)
      };
      await serialise(async () => {
        const records = await readState(auditPath, []);
        const list = Array.isArray(records) ? records : [];
        list.push(event);
        while (list.length > AUDIT_LIMIT) list.shift();
        await writeState(auditPath, list);
      });
      return event;
    },

    async readAudit({ page = 1, pageSize = 50, q = "", action = "", result = "" } = {}) {
      const records = await readState(auditPath, []);
      const query = String(q || "").trim().toLowerCase();
      const actionFilter = String(action || "").trim().toLowerCase();
      const resultFilter = String(result || "").trim().toLowerCase();
      const filtered = (Array.isArray(records) ? records : []).filter((event) => {
        if (actionFilter && String(event.action || "").toLowerCase() !== actionFilter) return false;
        if (resultFilter && String(event.result || "").toLowerCase() !== resultFilter) return false;
        if (!query) return true;
        return [event.action, event.adminAccountId, event.targetId, event.result, event.timestamp, JSON.stringify(event.metadata || {})]
          .some((field) => String(field || "").toLowerCase().includes(query));
      }).reverse();
      const safePage = Math.max(1, Number(page) || 1);
      const safeSize = Math.min(200, Math.max(10, Number(pageSize) || 50));
      const start = (safePage - 1) * safeSize;
      return {
        events: filtered.slice(start, start + safeSize),
        page: safePage,
        pageSize: safeSize,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / safeSize)),
        actions: [...new Set((Array.isArray(records) ? records : []).map((event) => String(event.action || "")).filter(Boolean))].sort(),
        durable: true
      };
    },

    // ---- session revocation ----------------------------------------------------------------
    // Per username: `revokedBefore` (ms) kills every token issued at or before that instant, and
    // `sessionVersion` kills every token minted under an earlier version. Recreating a username
    // keeps the stored version, so an old token can never be revived; a session issued after the
    // event carries the current version and a later issuedAt, so it stays valid.
    async revokeSessions(username, { reason = "", bumpVersion = true } = {}) {
      const key = String(username || "");
      if (!key) return null;
      return serialise(async () => {
        const state = await readState(revocationPath, {});
        const current = (state && typeof state === "object" ? state : {})[key] || { sessionVersion: 0 };
        const next = {
          revokedBefore: Date.now(),
          sessionVersion: bumpVersion ? Number(current.sessionVersion || 0) + 1 : Number(current.sessionVersion || 0),
          reason: String(reason || "").slice(0, 80),
          at: new Date().toISOString()
        };
        await writeState(revocationPath, { ...(state && typeof state === "object" ? state : {}), [key]: next });
        return next;
      });
    },

    async getSessionVersion(username) {
      const state = await readState(revocationPath, {});
      return Number(state?.[String(username || "")]?.sessionVersion || 0);
    },

    async isSessionRevoked(username, issuedAtMs = 0, sessionVersion = 0) {
      const entry = (await readState(revocationPath, {}))?.[String(username || "")];
      if (!entry) return false;
      if (Number(sessionVersion || 0) < Number(entry.sessionVersion || 0)) return true;
      const revokedBefore = Number(entry.revokedBefore || 0);
      if (!revokedBefore) return false;
      // A token with no issuedAt predates versioned sessions and cannot be proven fresh.
      return !issuedAtMs || Number(issuedAtMs) <= revokedBefore;
    }
  };
}

// ---------------------------------------------------------------------------
// Account status semantics. `archived` is a real lifecycle state and must never be silently mapped
// to `active` — doing so would restore an account an admin archived.
// ---------------------------------------------------------------------------
export const ACCOUNT_STATUSES = Object.freeze(["active", "inactive", "archived"]);

export function normalizeAccountStatus(value, { allowArchived = true } = {}) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "archived") {
    if (allowArchived) return "archived";
    throw Object.assign(new Error("Use the Archive action to archive an account."), { statusCode: 400, errorCode: "ARCHIVE_ACTION_REQUIRED" });
  }
  if (["inactive", "disabled", "suspended"].includes(status)) return "inactive";
  if (status === "active" || !status) return "active";
  return "active";
}

// ---------------------------------------------------------------------------
// Lifecycle guards. Applied to EVERY route that can disable, demote, archive or delete an admin —
// including the generic PATCH path, which previously bypassed them.
// ---------------------------------------------------------------------------
const DEACTIVATING_STATUSES = new Set(["inactive", "archived"]);

export function describeLifecycleIntent(patch = {}, { action = "" } = {}) {
  const intent = { demotes: false, deactivates: false, deletes: false, action: String(action || "") };
  if (action === "account-delete") intent.deletes = true;
  if (action === "account-disable") intent.deactivates = true;
  if (action === "account-archive") intent.deactivates = true;
  if (Object.prototype.hasOwnProperty.call(patch, "role") && String(patch.role || "").toLowerCase() !== "admin") intent.demotes = true;
  if (Object.prototype.hasOwnProperty.call(patch, "status") && DEACTIVATING_STATUSES.has(String(patch.status || "").toLowerCase())) intent.deactivates = true;
  return intent;
}

// Returns null when the change is allowed, or { code, message } when a guard blocks it.
export function checkAdminLifecycleGuard({ target = {}, actorUsername = "", activeAdmins = [], intent = {} } = {}) {
  const touchesLifecycle = intent.demotes || intent.deactivates || intent.deletes;
  if (!touchesLifecycle) return null;
  const targetName = String(target.username || "");
  const isSelf = targetName && targetName === String(actorUsername || "");
  if (isSelf) {
    return {
      code: "ADMIN_PROTECTED_SELF",
      message: "You cannot disable, demote, archive or delete the administrator account you are signed in with."
    };
  }
  if (String(target.role || "").toLowerCase() !== "admin") return null;
  const remaining = activeAdmins.filter((user) =>
    String(user.username || "") !== targetName &&
    String(user.role || "").toLowerCase() === "admin" &&
    String(user.status || "active").toLowerCase() === "active"
  );
  if (!remaining.length) {
    return {
      code: "ADMIN_PROTECTED_LAST",
      message: "This is the last active administrator account. Promote another administrator before disabling, demoting, archiving or deleting it."
    };
  }
  return null;
}
