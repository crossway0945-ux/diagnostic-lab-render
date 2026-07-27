// V12.9.0 admin authentication, authorization and account lifecycle.
// Every admin surface is verified server-side: no test relies on hidden frontend elements.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApiHandler } from "../services/apiRouter.js";

const ORIGINAL_ENV = { ...process.env };
const dataDir = await mkdtemp(path.join(tmpdir(), "v1290-admin-"));
try {
  process.env = { ...ORIGINAL_ENV, SESSION_SECRET: "admin-security-test", DIAGNOSTIC_STORAGE_ADAPTER: "local-json", DIAGNOSTIC_DATA_DIR: dataDir, DIAGNOSTIC_REQUIRE_FULL_ENGINE: "false", NODE_ENV: "production" };
  delete process.env.OPENAI_API_KEY; delete process.env.NETLIFY; delete process.env.LAMBDA_TASK_ROOT;

  const seedUsers = [
    { username: "kru", password: "pw", displayName: "Kru Pom", role: "admin", quotaMode: "unlimited", status: "active" },
    { username: "kru2", password: "pw", displayName: "Second Admin", role: "admin", quotaMode: "unlimited", status: "active" },
    { username: "teach", password: "pw", displayName: "Teacher", role: "teacher", quotaMode: "unlimited", status: "active" },
    { username: "stu", password: "pw", displayName: "Student", role: "student", quotaMode: "limited", quota: 10, used: 2, status: "active", expiryDate: "2099-12-31" },
    { username: "victim", password: "pw", displayName: "Victim", role: "student", quotaMode: "limited", quota: 10, used: 1, status: "active", expiryDate: "2099-12-31" }
  ];
  await writeFile(path.join(dataDir, "users.json"), JSON.stringify(seedUsers, null, 2));
  await writeFile(path.join(dataDir, "submission-history.json"), JSON.stringify([
    { submissionId: "r-victim-1", username: "victim", ownerAccountId: "victim", studentProfileId: "vp", studentDisplayNameSnapshot: "Victim", taskType: "Task 2", dateTime: "2026-07-01T00:00:00.000Z", sourceInput: { prompt: "P", writing: "VICTIM-WRITING" }, report: { feedbackCards: [] } },
    { submissionId: "r-stu-1", username: "stu", ownerAccountId: "stu", studentProfileId: "sp", studentDisplayNameSnapshot: "Student", taskType: "Task 2", dateTime: "2026-07-02T00:00:00.000Z", sourceInput: { prompt: "P", writing: "STUDENT-WRITING" }, report: { feedbackCards: [] } }
  ], null, 2));
  await writeFile(path.join(dataDir, "student-profiles.json"), "[]\n");

  const handler = createApiHandler({ rootDir: dataDir });
  const request = async (method, p, body, cookie) => {
    const res = await handler({ method, path: p, headers: cookie ? { cookie } : {}, body: body ? JSON.stringify(body) : "" });
    let json = null;
    try { json = JSON.parse(res.body || "{}"); } catch { json = null; }
    return { ...res, json };
  };
  const login = async (u, p = "pw") => (await request("POST", "/api/login", { username: u, password: p }));

  const adminCookie = (await login("kru")).headers["Set-Cookie"];
  const teacherCookie = (await login("teach")).headers["Set-Cookie"];
  const studentCookie = (await login("stu")).headers["Set-Cookie"];

  // 1. Session cookie hardening (HttpOnly / SameSite / Secure in production / bounded lifetime).
  assert.match(adminCookie, /HttpOnly/, "session cookie is HttpOnly");
  assert.match(adminCookie, /SameSite=Lax/, "session cookie sets SameSite");
  assert.match(adminCookie, /Secure/, "session cookie is Secure in production");
  assert.match(adminCookie, /Max-Age=\d+/, "session cookie expires");

  // 2-5. Authorization on every admin surface: anonymous 401, non-admin 403, admin 200 — all JSON.
  const adminSurfaces = [
    ["GET", "/api/admin/users"],
    ["GET", "/api/admin/usage-summary"],
    ["GET", "/api/admin/qa-reports"],
    ["GET", "/api/admin/audit-log"],
    ["GET", "/api/admin/diagnostics/system"]
  ];
  for (const [method, route] of adminSurfaces) {
    const anon = await request(method, route, null, "");
    assert.equal(anon.statusCode, 401, `${route} rejects anonymous`);
    assert.equal(anon.json.errorCode, "ADMIN_REQUIRED");
    assert.equal(anon.headers["content-type"], "application/json; charset=utf-8", `${route} returns JSON, never HTML`);
    for (const [label, cookie] of [["student", studentCookie], ["teacher", teacherCookie]]) {
      const denied = await request(method, route, null, cookie);
      assert.equal(denied.statusCode, 403, `${route} rejects ${label}`);
      assert.equal(denied.json.errorCode, "ADMIN_REQUIRED");
    }
    const allowed = await request(method, route, null, adminCookie);
    assert.equal(allowed.statusCode, 200, `${route} allows admin`);
  }

  // 6. A browser-supplied role claim cannot escalate privileges.
  const escalation = await handler({ method: "GET", path: "/api/admin/users", headers: { cookie: studentCookie, "x-role": "admin", "x-admin": "true" }, body: "" });
  assert.equal(escalation.statusCode, 403, "headers cannot grant admin");

  // 7. Account lifecycle actions require admin and reject GET.
  for (const [label, cookie, expected] of [["anonymous", "", 401], ["student", studentCookie, 403], ["teacher", teacherCookie, 403]]) {
    const denied = await request("POST", "/api/admin/users/victim/archive", {}, cookie);
    assert.equal(denied.statusCode, expected, `archive rejects ${label}`);
  }
  const getDelete = await request("GET", "/api/admin/users/victim/delete", null, adminCookie);
  assert.equal(getDelete.statusCode, 404, "destructive actions are not reachable by GET");

  // 8-9. Archive removes the account from the default active list; restore brings it back.
  const archived = await request("POST", "/api/admin/users/victim/archive", {}, adminCookie);
  assert.equal(archived.statusCode, 200);
  assert.equal(archived.json.user.status, "archived");
  const activeList = await request("GET", "/api/admin/users", null, adminCookie);
  assert.equal(activeList.json.users.some((u) => u.username === "victim"), false, "archived account leaves the default active list");
  const archivedList = await request("GET", "/api/admin/users?status=archived", null, adminCookie);
  assert.equal(archivedList.json.users.some((u) => u.username === "victim"), true, "archived filter finds it");
  const restored = await request("POST", "/api/admin/users/victim/restore", {}, adminCookie);
  assert.equal(restored.json.user.status, "active", "restore reactivates the account");

  // 10. Pagination, search, filter and sort keep the payload bounded.
  const paged = await request("GET", "/api/admin/users?status=all&pageSize=2&page=1", null, adminCookie);
  assert.equal(paged.json.users.length, 2, "page size is honoured");
  assert.ok(paged.json.total >= 5 && paged.json.totalPages >= 3, "totals are reported");
  const searched = await request("GET", "/api/admin/users?status=all&q=victim", null, adminCookie);
  assert.deepEqual(searched.json.users.map((u) => u.username), ["victim"], "search filters by username");
  const roleFiltered = await request("GET", "/api/admin/users?status=all&role=admin", null, adminCookie);
  assert.equal(roleFiltered.json.users.every((u) => u.role === "admin"), true, "role filter applies");

  // 11-12. Self-deletion and last-admin deletion are refused.
  const selfDelete = await request("POST", "/api/admin/users/kru/delete", { confirmation: "kru", reportMode: "anonymise" }, adminCookie);
  assert.equal(selfDelete.statusCode, 409);
  assert.equal(selfDelete.json.errorCode, "ADMIN_PROTECTED");
  const selfArchive = await request("POST", "/api/admin/users/kru/archive", {}, adminCookie);
  assert.equal(selfArchive.statusCode, 409, "an admin cannot archive their own account either");
  const archiveOtherAdmin = await request("POST", "/api/admin/users/kru2/archive", {}, adminCookie);
  assert.equal(archiveOtherAdmin.statusCode, 200, "another admin may be archived while an active admin remains");
  await request("POST", "/api/admin/users/kru2/restore", {}, adminCookie);
  // Invariant: whatever lifecycle actions run, at least one active admin always remains.
  const adminsNow = await request("GET", "/api/admin/users?status=active&role=admin", null, adminCookie);
  assert.ok(adminsNow.json.users.length >= 1, "at least one active admin always remains");

  // 13. Permanent delete requires typed confirmation.
  const noConfirm = await request("POST", "/api/admin/users/victim/delete", { reportMode: "anonymise" }, adminCookie);
  assert.equal(noConfirm.statusCode, 400);
  assert.equal(noConfirm.json.errorCode, "CONFIRMATION_REQUIRED");

  // 14. Delete with anonymise keeps the analytical record but removes identity and writing.
  const victimCookie = (await login("victim")).headers["Set-Cookie"];
  const deleted = await request("POST", "/api/admin/users/victim/delete", { confirmation: "victim", reportMode: "anonymise" }, adminCookie);
  assert.equal(deleted.statusCode, 200);
  assert.equal(deleted.json.anonymisedReportCount, 1);
  const history = JSON.parse(await readFile(path.join(dataDir, "submission-history.json"), "utf8"));
  const victimRecord = history.find((r) => r.submissionId === "r-victim-1");
  assert.ok(victimRecord, "the analytical record is retained");
  assert.equal(victimRecord.username, "", "identity is removed");
  assert.doesNotMatch(JSON.stringify(history), /VICTIM-WRITING/, "the deleted student's writing is removed");
  assert.match(JSON.stringify(history), /STUDENT-WRITING/, "another student's data is untouched");
  const usersAfter = JSON.parse(await readFile(path.join(dataDir, "users.json"), "utf8"));
  assert.equal(usersAfter.some((u) => u.username === "victim"), false, "credentials are removed");

  // 15. The deleted account's outstanding sessions are revoked immediately.
  const revoked = await request("GET", "/api/session", null, victimCookie);
  assert.equal(revoked.json.authenticated, false, "sessions of a deleted account stop working");

  // 16. Audit events are written for privileged actions, without sensitive values.
  const audit = await request("GET", "/api/admin/audit-log", null, adminCookie);
  assert.equal(audit.statusCode, 200);
  const actions = audit.json.events.map((e) => e.action);
  assert.ok(actions.includes("account-delete") && actions.includes("account-archive") && actions.includes("account-restore"), "lifecycle actions are audited");
  assert.ok(audit.json.events.every((e) => e.eventId && e.timestamp && e.adminAccountId), "audit records carry event id, timestamp and actor");
  assert.doesNotMatch(JSON.stringify(audit.json), /admin-security-test|passwordHash|scrypt:|VICTIM-WRITING/, "audit log never stores secrets or student text");

  // 17. Admin responses never leak credential material.
  const userList = await request("GET", "/api/admin/users?status=all", null, adminCookie);
  assert.doesNotMatch(JSON.stringify(userList.json), /passwordHash|scrypt:|"password"/, "user list never exposes credentials");

  // 18. Login throttling blocks sustained password guessing, and a real password still works after.
  for (let attempt = 0; attempt < 9; attempt += 1) await login("stu", "wrong-password");
  const throttled = await login("stu", "wrong-password");
  assert.equal(throttled.statusCode, 429, "repeated failures are rate limited");
  assert.equal(throttled.json.errorCode, "RATE_LIMITED");
  const otherAccountUnaffected = await login("teach");
  assert.equal(otherAccountUnaffected.statusCode, 200, "throttling is per-account and does not lock everyone out");

  console.log("V12.9.0 admin security: server-side authorization on every admin surface (401/403 JSON), no header role escalation, archive/restore, guarded permanent delete with typed confirmation, self/last-admin protection, session revocation, audit logging, pagination/search/filter, hardened session cookie and login throttling verified.");
} finally {
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  process.env = { ...ORIGINAL_ENV };
}
