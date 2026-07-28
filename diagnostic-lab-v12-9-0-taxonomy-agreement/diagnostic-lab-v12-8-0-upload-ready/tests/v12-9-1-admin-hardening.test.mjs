// V12.9.1 — admin hardening (brief item I).
//
// Proves the hardening that V12.9.0 left open: CSRF on every privileged write, lifecycle guards on
// EVERY route including the generic PATCH, honest `archived` semantics, a durable audit log, correct
// permanent-deletion ordering, deep anonymisation of nested identity, durable session revocation that
// survives a restart, a server-verified `next=/admin` redirect, and the Permanent Delete UI gate.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApiHandler, safeNextPath } from "../services/apiRouter.js";
import { anonymiseSubmissionRecord } from "../services/storage.js";
import {
  checkAdminLifecycleGuard,
  checkSameOrigin,
  describeLifecycleIntent,
  issueCsrfToken,
  normalizeAccountStatus,
  safeAuditMetadata,
  verifyCsrfToken
} from "../services/adminSecurity.js";

const ORIGINAL_ENV = { ...process.env };
const dataDir = await mkdtemp(path.join(tmpdir(), "v1291-admin-"));
try {
  process.env = {
    ...ORIGINAL_ENV,
    SESSION_SECRET: "admin-hardening-test",
    DIAGNOSTIC_STORAGE_ADAPTER: "local-json",
    DIAGNOSTIC_DATA_DIR: dataDir,
    DIAGNOSTIC_REQUIRE_FULL_ENGINE: "false",
    NODE_ENV: "production"
  };
  delete process.env.OPENAI_API_KEY;
  delete process.env.NETLIFY;
  delete process.env.LAMBDA_TASK_ROOT;

  await writeFile(path.join(dataDir, "users.json"), JSON.stringify([
    { username: "kru", password: "pw", displayName: "Kru Pom", role: "admin", quotaMode: "unlimited", status: "active" },
    { username: "kru2", password: "pw", displayName: "Second Admin", role: "admin", quotaMode: "unlimited", status: "active" },
    { username: "stu", password: "pw", displayName: "Student", role: "student", quotaMode: "limited", quota: 10, status: "active", expiryDate: "2099-12-31" },
    { username: "target", password: "pw", displayName: "Target", role: "student", quotaMode: "limited", quota: 10, status: "active", expiryDate: "2099-12-31" },
    { username: "keeper", password: "pw", displayName: "Keeper", role: "student", quotaMode: "limited", quota: 10, status: "active", expiryDate: "2099-12-31" }
  ], null, 2));

  // A production-shaped record: identity appears at the top level, inside the report, inside
  // canonicalAnalysis metadata, in a student-profile snapshot and in the source input.
  const productionShapedRecord = {
    submissionId: "sub-target-1",
    reportId: "rep-target-1",
    username: "target",
    ownerAccountId: "target",
    studentProfileId: "profile-target",
    studentDisplayNameSnapshot: "Target Learner",
    taskType: "Task 2",
    dateTime: "2026-07-10T00:00:00.000Z",
    sourceInput: { prompt: "P", writing: "TARGET-RAW-WRITING" },
    report: {
      estimatedBandRange: "6.0",
      studentName: "Target Learner",
      feedbackCards: [{ issueCategory: "Punctuation", exactSentence: "TARGET-EVIDENCE-SENTENCE." }],
      canonicalAnalysis: {
        metadata: {
          reportId: "rep-target-1",
          ownerAccountId: "target",
          studentProfileId: "profile-target",
          studentDisplayNameSnapshot: "Target Learner"
        },
        studentProfile: { id: "profile-target", displayName: "Target Learner" }
      },
      exportMetadata: { exportedBy: "kru", studentName: "Target Learner" }
    }
  };
  await writeFile(path.join(dataDir, "submission-history.json"), JSON.stringify([
    productionShapedRecord,
    { submissionId: "sub-keeper-1", reportId: "rep-keeper-1", username: "keeper", ownerAccountId: "keeper", studentProfileId: "profile-keeper", studentDisplayNameSnapshot: "Keeper", taskType: "Task 2", dateTime: "2026-07-11T00:00:00.000Z", sourceInput: { prompt: "P", writing: "KEEPER-RAW-WRITING" }, report: { feedbackCards: [] } }
  ], null, 2));
  await writeFile(path.join(dataDir, "student-profiles.json"), JSON.stringify([
    { id: "profile-target", ownerAccountId: "target", displayName: "Target Learner", normalizedName: "target learner", active: true },
    { id: "profile-keeper", ownerAccountId: "keeper", displayName: "Keeper", normalizedName: "keeper", active: true }
  ], null, 2));

  let handler = createApiHandler({ rootDir: dataDir });
  const raw = async (method, p, body, headers = {}) => {
    const res = await handler({ method, path: p, headers, body: body ? JSON.stringify(body) : "" });
    let json = null;
    try { json = JSON.parse(res.body || "{}"); } catch { json = null; }
    return { ...res, json };
  };
  const login = async (u, p = "pw", extra = {}) => raw("POST", "/api/login", { username: u, password: p, ...extra });
  const csrfFor = async (cookie) => (await raw("GET", "/api/admin/csrf-token", null, { cookie })).json.csrfToken;
  const write = async (method, p, body, cookie, token) => raw(method, p, body, { cookie, "x-csrf-token": token ?? await csrfFor(cookie) });

  const adminLogin = await login("kru");
  const adminCookie = adminLogin.headers["Set-Cookie"];
  const studentCookie = (await login("stu")).headers["Set-Cookie"];

  // ---- A. CSRF -------------------------------------------------------------------------------
  // 1. A privileged write with no token and no same-origin proof is rejected.
  const noToken = await raw("POST", "/api/admin/users", { username: "csrf-none", displayName: "X" }, { cookie: adminCookie });
  assert.equal(noToken.statusCode, 403, "a privileged write without CSRF proof is rejected");
  assert.equal(noToken.json.errorCode, "CSRF_REJECTED");

  // 2. A forged/garbage token is rejected even when the request looks same-origin.
  const badToken = await raw("POST", "/api/admin/users", { username: "csrf-bad", displayName: "X" }, {
    cookie: adminCookie, "x-csrf-token": "not.a.token", origin: "https://diagnostic.wonderbloom.co", host: "diagnostic.wonderbloom.co"
  });
  assert.equal(badToken.statusCode, 403, "an invalid CSRF token is rejected even from a same-origin request");
  assert.equal(badToken.json.errorCode, "CSRF_REJECTED");

  // 3. A token minted for ANOTHER session cannot be replayed.
  const studentToken = issueCsrfToken("stu:whatever");
  const replay = await raw("POST", "/api/admin/users", { username: "csrf-replay", displayName: "X" }, { cookie: adminCookie, "x-csrf-token": studentToken });
  assert.equal(replay.statusCode, 403, "a CSRF token bound to another session is rejected");

  // 4. The correct token is accepted. Read-only GETs never need one.
  const created = await write("POST", "/api/admin/users", { username: "csrf-ok", displayName: "CSRF OK", quotaLimit: 3, expiryDate: "2099-12-31" }, adminCookie);
  assert.equal(created.statusCode, 201, "a valid CSRF token allows the write");
  assert.equal((await raw("GET", "/api/admin/users", null, { cookie: adminCookie })).statusCode, 200, "read-only admin GETs need no token");

  // 5. Every privileged write path is gated, not just account creation.
  for (const [method, route, body] of [
    ["PATCH", "/api/admin/users/target", { quotaLimit: 5 }],
    ["POST", "/api/admin/users/target/reset-password", {}],
    ["POST", "/api/admin/users/target/disable", {}],
    ["POST", "/api/admin/users/target/enable", {}],
    ["POST", "/api/admin/users/target/archive", {}],
    ["POST", "/api/admin/users/target/restore", {}],
    ["POST", "/api/admin/users/target/delete", { confirmation: "target" }],
    ["POST", "/api/admin/diagnostics/clear-failures", {}]
  ]) {
    const denied = await raw(method, route, body, { cookie: adminCookie });
    assert.equal(denied.statusCode, 403, `${method} ${route} requires CSRF proof`);
    assert.equal(denied.json.errorCode, "CSRF_REJECTED");
  }

  // 6. The same-origin fallback is genuinely equivalent, and a foreign origin is refused.
  assert.equal(checkSameOrigin({ origin: "https://diagnostic.wonderbloom.co" }, "diagnostic.wonderbloom.co").ok, true);
  assert.equal(checkSameOrigin({ origin: "https://evil.example" }, "diagnostic.wonderbloom.co").ok, false);
  assert.equal(checkSameOrigin({}, "diagnostic.wonderbloom.co").ok, false, "a request with no Origin or Referer is not trusted");
  assert.equal(verifyCsrfToken("kru:abc", issueCsrfToken("kru:abc")).ok, true);
  assert.equal(verifyCsrfToken("kru:abc", issueCsrfToken("kru:def")).ok, false);

  // ---- B. Lifecycle guards on EVERY route, including generic PATCH --------------------------
  const selfPatches = [
    { role: "student" },
    { status: "inactive" }
  ];
  for (const patch of selfPatches) {
    const blocked = await write("PATCH", "/api/admin/users/kru", patch, adminCookie);
    assert.equal(blocked.statusCode, 409, `generic PATCH cannot ${JSON.stringify(patch)} the signed-in admin`);
    assert.equal(blocked.json.errorCode, "ADMIN_PROTECTED_SELF");
  }
  const selfDisable = await write("POST", "/api/admin/users/kru/disable", {}, adminCookie);
  assert.equal(selfDisable.statusCode, 409, "an admin cannot disable their own account");
  assert.equal(selfDisable.json.errorCode, "ADMIN_PROTECTED_SELF");

  // Last-active-admin protection, on both the generic PATCH and the dedicated actions.
  await write("POST", "/api/admin/users/kru2/disable", {}, adminCookie); // now kru is the only active admin
  for (const [method, route, body, label] of [
    ["PATCH", "/api/admin/users/kru", { role: "teacher" }, "demote"],
    ["PATCH", "/api/admin/users/kru", { status: "inactive" }, "deactivate"],
    ["POST", "/api/admin/users/kru/archive", {}, "archive"],
    ["POST", "/api/admin/users/kru/delete", { confirmation: "kru" }, "delete"]
  ]) {
    const blocked = await write(method, route, body, adminCookie);
    assert.equal(blocked.statusCode, 409, `the last active admin cannot be ${label}d`);
    assert.match(blocked.json.errorCode, /^ADMIN_PROTECTED/);
  }
  await write("POST", "/api/admin/users/kru2/enable", {}, adminCookie);

  // The guard is a pure function of canonical inputs, so the same decision holds off the wire.
  assert.equal(describeLifecycleIntent({ role: "student" }).demotes, true);
  assert.equal(describeLifecycleIntent({ status: "archived" }).deactivates, true);
  assert.equal(describeLifecycleIntent({ status: "active" }).deactivates, false);
  assert.equal(describeLifecycleIntent({ displayName: "x" }).demotes, false);
  assert.equal(
    checkAdminLifecycleGuard({
      target: { username: "only", role: "admin", status: "active" },
      actorUsername: "someone-else",
      activeAdmins: [{ username: "only", role: "admin", status: "active" }],
      intent: { demotes: true }
    })?.code,
    "ADMIN_PROTECTED_LAST"
  );
  assert.equal(
    checkAdminLifecycleGuard({
      target: { username: "student", role: "student", status: "active" },
      actorUsername: "kru",
      activeAdmins: [{ username: "kru", role: "admin", status: "active" }],
      intent: { deactivates: true }
    }),
    null,
    "a non-admin target is not blocked by the admin floor"
  );

  // ---- C. Status semantics: `archived` is never silently mapped to `active` ------------------
  assert.equal(normalizeAccountStatus("archived"), "archived");
  assert.equal(normalizeAccountStatus("disabled"), "inactive");
  assert.throws(() => normalizeAccountStatus("archived", { allowArchived: false }), /Archive action/, "the generic status field refuses `archived`");
  const patchArchived = await write("PATCH", "/api/admin/users/target", { status: "archived" }, adminCookie);
  assert.equal(patchArchived.statusCode, 400, "the generic PATCH does not accept `archived`");
  assert.equal(patchArchived.json.errorCode, "ARCHIVE_ACTION_REQUIRED");
  const archivedByAction = await write("POST", "/api/admin/users/target/archive", {}, adminCookie);
  assert.equal(archivedByAction.json.user.status, "archived", "the Archive action really archives");
  // A generic update to an archived account must not resurrect it.
  const patchedWhileArchived = await write("PATCH", "/api/admin/users/target", { displayName: "Renamed" }, adminCookie);
  assert.equal(patchedWhileArchived.json.user.status, "archived", "an unrelated update leaves `archived` intact");
  await write("POST", "/api/admin/users/target/restore", {}, adminCookie);

  // ---- E. Durable audit log ------------------------------------------------------------------
  // A refused privileged access is itself an auditable security event.
  assert.equal((await raw("GET", "/api/admin/users", null, { cookie: studentCookie })).statusCode, 403);
  assert.equal((await raw("GET", "/api/admin/users", null, {})).statusCode, 401);
  // Allowed changes, so the audit has a successful record of each action class to show.
  const promoted = await write("PATCH", "/api/admin/users/csrf-ok", { role: "teacher", status: "inactive", quotaLimit: 7, expiryDate: "2098-01-01" }, adminCookie);
  assert.equal(promoted.statusCode, 200, "a permitted role/status/quota/expiry change succeeds");
  assert.equal(promoted.json.user.role, "teacher");
  await write("POST", "/api/admin/users/csrf-ok/enable", {}, adminCookie);
  await write("POST", "/api/admin/users/csrf-ok/disable", {}, adminCookie);
  await write("POST", "/api/admin/users/csrf-ok/enable", {}, adminCookie);
  assert.equal((await write("POST", "/api/admin/users/csrf-ok/reset-password", {}, adminCookie)).statusCode, 200);
  const auditFile = path.join(dataDir, "admin-audit-log.json");
  assert.ok(existsSync(auditFile), "the audit log is written to disk, not held in memory");
  const auditView = await raw("GET", "/api/admin/audit-log?pageSize=200", null, { cookie: adminCookie });
  const auditActions = new Set(auditView.json.events.map((event) => event.action));
  for (const expected of [
    "admin-login", "admin-access-denied", "admin-csrf-rejected", "user-create", "user-update",
    "role-change", "status-change", "quota-change", "password-reset", "session-revoke",
    "account-disable", "account-enable", "account-archive", "account-restore"
  ]) {
    assert.ok(auditActions.has(expected), `the audit log records ${expected}`);
  }
  assert.ok(auditView.json.events.every((event) => event.eventId && event.timestamp && typeof event.adminAccountId === "string" && typeof event.targetId === "string"), "every record carries id, timestamp, administrator id and target id");
  assert.equal(auditView.json.durable, true);
  assert.ok(Array.isArray(auditView.json.actions) && auditView.json.actions.length > 0, "the action filter is populated from real data");
  const filteredAudit = await raw("GET", "/api/admin/audit-log?action=account-archive", null, { cookie: adminCookie });
  assert.ok(filteredAudit.json.events.length >= 1 && filteredAudit.json.events.every((event) => event.action === "account-archive"), "the action filter applies");
  const blockedAudit = await raw("GET", "/api/admin/audit-log?result=blocked", null, { cookie: adminCookie });
  assert.ok(blockedAudit.json.events.length >= 1 && blockedAudit.json.events.every((event) => event.result === "blocked"), "the result filter applies");
  const searchedAudit = await raw("GET", "/api/admin/audit-log?q=csrf-ok", null, { cookie: adminCookie });
  assert.ok(searchedAudit.json.events.length >= 1, "audit search matches safe metadata");
  const auditText = JSON.stringify(auditView.json);
  assert.doesNotMatch(auditText, /admin-hardening-test|passwordHash|scrypt:|ielts_session|TARGET-RAW-WRITING|TARGET-EVIDENCE/, "the audit never stores secrets, cookies or student text");
  assert.deepEqual(safeAuditMetadata({ password: "x", passwordHash: "y", sessionCookie: "z", apiKey: "k", essay: "e", role: "admin" }), { role: "admin" }, "forbidden metadata keys are dropped");

  // ---- G. Deep anonymisation on a production-shaped record ----------------------------------
  const anonymised = anonymiseSubmissionRecord(productionShapedRecord);
  const anonymisedText = JSON.stringify(anonymised);
  assert.doesNotMatch(anonymisedText, /Target Learner/, "nested name snapshots are removed");
  assert.doesNotMatch(anonymisedText, /profile-target/, "student profile ids are removed");
  assert.doesNotMatch(anonymisedText, /TARGET-RAW-WRITING/, "the raw writing is removed");
  assert.equal(anonymised.username, "");
  assert.equal(anonymised.report.canonicalAnalysis.metadata.ownerAccountId, "");
  assert.equal(anonymised.report.canonicalAnalysis.metadata.reportId, "rep-target-1", "the analytical identifier is retained");
  assert.equal(anonymised.report.estimatedBandRange, "6.0", "the analytical record survives");
  assert.match(JSON.stringify(anonymised.report.feedbackCards), /TARGET-EVIDENCE-SENTENCE/, "identity-only mode keeps the diagnostic evidence");
  const strict = anonymiseSubmissionRecord(productionShapedRecord, { deleteEvidenceText: true });
  assert.doesNotMatch(JSON.stringify(strict), /TARGET-EVIDENCE-SENTENCE/, "the selected mode can also remove embedded evidence text");
  assert.equal(strict.anonymisationMode, "identity-and-evidence", "the mode stays explicit on the record");

  // ---- F. Permanent-deletion ordering, and no silent cascade --------------------------------
  const targetCookie = (await login("target")).headers["Set-Cookie"];
  const deleted = await write("POST", "/api/admin/users/target/delete", { confirmation: "target", reportMode: "anonymise" }, adminCookie);
  assert.equal(deleted.statusCode, 200);
  assert.deepEqual(deleted.json.deletionOrder, [
    "collect-report-ids", "collect-qa-snapshot-ids", "revoke-sessions", "mutate-history", "remove-qa-snapshots", "verify-no-orphans"
  ], "ids are collected before history is mutated");
  assert.deepEqual(deleted.json.reportIds, ["rep-target-1"], "the report id was captured while ownership still existed");
  assert.deepEqual(deleted.json.qaSnapshotIds, ["sub-target-1"], "the QA snapshot id was captured while ownership still existed");
  assert.deepEqual(deleted.json.orphanedRecords, [], "no orphan remains after deletion");
  assert.equal(deleted.json.reportMode, "anonymise", "the selected mode is echoed, never inferred");

  const historyAfter = JSON.parse(await readFile(path.join(dataDir, "submission-history.json"), "utf8"));
  assert.doesNotMatch(JSON.stringify(historyAfter), /Target Learner|profile-target|TARGET-RAW-WRITING/, "nested identity is gone from stored history");
  assert.match(JSON.stringify(historyAfter), /KEEPER-RAW-WRITING/, "an unrelated account's reports are untouched");
  const profilesAfter = JSON.parse(await readFile(path.join(dataDir, "student-profiles.json"), "utf8"));
  assert.deepEqual(profilesAfter.map((p) => p.id), ["profile-keeper"], "only the deleted account's profiles are removed");

  // ---- H. Durable session revocation --------------------------------------------------------
  assert.ok(existsSync(path.join(dataDir, "admin-session-revocations.json")), "revocations are persisted");
  assert.equal((await raw("GET", "/api/session", null, { cookie: targetCookie })).json.authenticated, false, "the deleted account's session stops working");

  // Password reset invalidates existing sessions, and the new password issues a working one.
  const keeperCookie = (await login("keeper")).headers["Set-Cookie"];
  assert.equal((await raw("GET", "/api/session", null, { cookie: keeperCookie })).json.authenticated, true);
  const resetResult = await write("POST", "/api/admin/users/keeper/reset-password", {}, adminCookie);
  assert.equal(resetResult.statusCode, 200);
  assert.equal((await raw("GET", "/api/session", null, { cookie: keeperCookie })).json.authenticated, false, "a password reset revokes existing sessions");
  const keeperReloginCookie = (await login("keeper", resetResult.json.generatedPassword)).headers["Set-Cookie"];
  assert.equal((await raw("GET", "/api/session", null, { cookie: keeperReloginCookie })).json.authenticated, true, "a session issued after the reset is valid");

  // A RESTART must not resurrect a revoked session, and must not invalidate the valid new one.
  handler = createApiHandler({ rootDir: dataDir });
  assert.equal((await raw("GET", "/api/session", null, { cookie: keeperCookie })).json.authenticated, false, "revocation survives a restart");
  assert.equal((await raw("GET", "/api/session", null, { cookie: targetCookie })).json.authenticated, false, "a deleted account's session cannot return after a restart");
  assert.equal((await raw("GET", "/api/session", null, { cookie: keeperReloginCookie })).json.authenticated, true, "a valid post-event session still works after a restart");

  // Recreating the same username does not revive an old token, and does not break a new one.
  const recreated = await write("POST", "/api/admin/users", { username: "target", displayName: "Target Again", quotaLimit: 5, expiryDate: "2099-12-31" }, adminCookie);
  assert.equal(recreated.statusCode, 201);
  assert.equal((await raw("GET", "/api/session", null, { cookie: targetCookie })).json.authenticated, false, "the old token stays dead after the username is recreated");
  const recreatedCookie = (await login("target", recreated.json.generatedPassword)).headers["Set-Cookie"];
  assert.equal((await raw("GET", "/api/session", null, { cookie: recreatedCookie })).json.authenticated, true, "the recreated account's own session works");

  // The durable audit still shows the pre-restart history.
  const auditAfterRestart = await raw("GET", "/api/admin/audit-log?pageSize=200", null, { cookie: adminCookie });
  assert.ok(auditAfterRestart.json.events.some((event) => event.action === "account-delete"), "the audit log survives a restart");

  // ---- I. Login redirect: honoured, but only after the server verifies the role --------------
  assert.equal(safeNextPath("/admin"), "/admin");
  assert.equal(safeNextPath("//evil.example/admin"), "", "a protocol-relative target is refused");
  assert.equal(safeNextPath("https://evil.example/admin"), "", "an absolute URL is refused");
  assert.equal(safeNextPath("/admin\\evil"), "", "a backslash target is refused");
  const adminNext = await login("kru", "pw", { next: "/admin" });
  assert.equal(adminNext.json.redirectTo, "/admin", "an admin is redirected to /admin");
  const studentNext = await login("stu", "pw", { next: "/admin" });
  assert.equal(studentNext.json.redirectTo, "", "a non-admin is never redirected to /admin");
  const studentSafeNext = await login("stu", "pw", { next: "/progress" });
  assert.equal(studentSafeNext.json.redirectTo, "/progress", "a non-admin destination is still honoured");

  // ---- J. Permanent Delete UI gate ----------------------------------------------------------
  const adminScript = await readFile(new URL("../admin.js", import.meta.url), "utf8");
  assert.match(adminScript, /PERMANENT_DELETE_ENABLED = false/, "Permanent Delete is gated closed in the shipped console");
  assert.match(adminScript, /Permanent Delete is unavailable in this release/, "the gate explains itself and points to Archive");
  const adminMarkup = await readFile(new URL("../admin.html", import.meta.url), "utf8");
  for (const id of [
    "user-search", "user-status-filter", "user-role-filter", "user-sort", "user-page-size",
    "user-prev-page", "user-next-page", "user-page-indicator", "user-result-count",
    "admin-audit-body", "audit-search", "audit-action-filter", "audit-result-filter",
    "audit-prev-page", "audit-next-page", "audit-page-indicator", "audit-result-count"
  ]) {
    assert.match(adminMarkup, new RegExp(`id="${id}"`), `the admin console renders the ${id} control`);
  }
  assert.match(adminMarkup, /<option value="active" selected>Active only<\/option>/, "the default user view is active accounts only");
  assert.match(adminScript, /x-csrf-token/, "the console attaches a CSRF token to privileged writes");

  console.log("V12.9.1 admin hardening: CSRF is required and verified on every privileged write (missing, forged and cross-session tokens all rejected); lifecycle guards protect the current and last active admin on the generic PATCH as well as every dedicated action; `archived` is a real state the generic status field refuses; the audit log is durable on disk, filterable and free of secrets; permanent deletion collects report and QA ids before mutating history and leaves no orphan; deep anonymisation clears nested identity while retaining the analytical record; session revocation survives a restart, is not defeated by recreating a username, and does not invalidate later sessions; next=/admin is honoured only for a verified admin; and Permanent Delete stays gated in the console.");
} finally {
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  process.env = { ...ORIGINAL_ENV };
}
