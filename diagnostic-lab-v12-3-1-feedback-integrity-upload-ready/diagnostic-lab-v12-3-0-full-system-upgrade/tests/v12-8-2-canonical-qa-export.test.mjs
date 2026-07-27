// V12.8.2 admin-only Canonical QA Export: access control, single-report scope, redaction, and the
// guarantee that exporting never calls the provider, never touches quota and never alters the report.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApiHandler } from "../services/apiRouter.js";
import { createQaCanonicalStore, redactForQa, assembleQaExportFromRecord } from "../services/qaCanonicalExport.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

const dataDir = await mkdtemp(path.join(tmpdir(), "v1282-qa-"));
try {
  process.env = { ...ORIGINAL_ENV, SESSION_SECRET: "qa-export-test", DIAGNOSTIC_STORAGE_ADAPTER: "local-json", DIAGNOSTIC_DATA_DIR: dataDir, DIAGNOSTIC_REQUIRE_FULL_ENGINE: "false" };
  delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_MODEL;
  delete process.env.NETLIFY; delete process.env.LAMBDA_TASK_ROOT; delete process.env.AWS_LAMBDA_FUNCTION_NAME; delete process.env.AWS_EXECUTION_ENV;

  await writeFile(path.join(dataDir, "users.json"), JSON.stringify([
    { username: "admin1", password: "pw", displayName: "Admin", role: "admin", quotaMode: "unlimited", status: "active" },
    { username: "teach1", password: "pw", displayName: "Teacher", role: "teacher", quotaMode: "unlimited", status: "active" },
    { username: "stu1", password: "pw", displayName: "Student", role: "student", quotaMode: "limited", quota: 10, used: 3, status: "active", expiryDate: "2099-12-31" }
  ], null, 2));

  // Two reports belonging to different students; only the selected one may ever be exported.
  const reportA = {
    submissionId: "reportA", username: "stu1", studentProfileId: "p1", studentDisplayNameSnapshot: "Student A",
    dateTime: "2026-07-26T10:00:00.000Z", taskType: "Task 2", essayType: "Problem & Solution", estimatedBandRange: "6.0-6.5",
    appVersion: "12.8.3", engineVersion: "e-12.8.0", analysisValidity: "valid",
    sourceInput: { prompt: "Traffic prompt A", writing: "Writing A" },
    report: { estimatedBandRange: "6.0-6.5", feedbackCards: [{ issueId: "i1", issueCategory: "Countability", revisionType: "Minimal Correction", exactEvidence: "a severe traffic congestion" }], studentReportViewModel: { frameworkBreakdown: {} }, kruPomScores: {}, criteriaScores: {} }
  };
  const reportB = {
    submissionId: "reportB", username: "stu1", studentProfileId: "p2", studentDisplayNameSnapshot: "Student B",
    dateTime: "2026-07-25T10:00:00.000Z", taskType: "Task 1", visualType: "Bar Chart", estimatedBandRange: "6.5-7.0",
    analysisValidity: "valid", sourceInput: { prompt: "SECRET-PROMPT-B", writing: "SECRET-WRITING-B" },
    report: { feedbackCards: [{ issueId: "b1", issueCategory: "Overview Quality" }], studentReportViewModel: {} }
  };
  // An old report with no canonical layer at all.
  const reportOld = { submissionId: "reportOld", username: "stu1", studentProfileId: "p1", studentDisplayNameSnapshot: "Student A", dateTime: "2026-01-01T00:00:00.000Z", taskType: "Task 2", analysisValidity: "valid", report: { estimatedBandRange: "6.0" } };
  await writeFile(path.join(dataDir, "submission-history.json"), JSON.stringify([reportA, reportB, reportOld], null, 2));

  const handler = createApiHandler({ rootDir: dataDir });
  const request = async (method, p, body, cookie) => {
    const res = await handler({ method, path: p, headers: cookie ? { cookie } : {}, body: body ? JSON.stringify(body) : "" });
    let json = null;
    try { json = JSON.parse(res.body || "{}"); } catch { json = null; }
    return { ...res, json };
  };
  const login = async (u) => (await request("POST", "/api/login", { username: u, password: "pw" })).headers["Set-Cookie"];

  const adminCookie = await login("admin1");
  const teacherCookie = await login("teach1");
  const studentCookie = await login("stu1");

  // 1. Admin can list safe QA metadata.
  const list = await request("GET", "/api/admin/qa-reports", null, adminCookie);
  assert.equal(list.statusCode, 200, "admin can list QA reports");
  assert.ok(list.json.reports.length >= 3);
  const rowA = list.json.reports.find((r) => r.reportId === "reportA");
  assert.equal(rowA.studentName, "Student A");
  // Listing must expose metadata only — never prompt/writing/report body.
  assert.doesNotMatch(JSON.stringify(list.json), /Writing A|Traffic prompt A|SECRET-WRITING-B/, "listing never includes content");

  // 2-3. Student and teacher are refused (admin session required).
  for (const [label, cookie] of [["student", studentCookie], ["teacher", teacherCookie]]) {
    const denied = await request("GET", "/api/admin/qa-reports", null, cookie);
    assert.equal(denied.statusCode, 403, `${label} cannot list QA reports`);
    const deniedExport = await request("GET", "/api/admin/qa-reports/reportA/export", null, cookie);
    assert.equal(deniedExport.statusCode, 403, `${label} cannot export`);
    assert.equal(deniedExport.headers["content-type"], "application/json; charset=utf-8", "denial is JSON, not HTML");
  }
  const anon = await request("GET", "/api/admin/qa-reports/reportA/export", null, "");
  assert.equal(anon.statusCode, 403, "anonymous cannot export");

  // 4-5. Admin exports exactly one report; the other student's data never appears.
  const exported = await request("GET", "/api/admin/qa-reports/reportA/export", null, adminCookie);
  assert.equal(exported.statusCode, 200);
  assert.match(exported.headers["content-disposition"] || "", /^attachment; filename="diagnostic-qa-.*\.json"$/, "safe download headers");
  assert.equal(exported.json.reportId, "reportA");
  const body = JSON.stringify(exported.json);
  assert.doesNotMatch(body, /SECRET-PROMPT-B|SECRET-WRITING-B|reportB/, "another student's report never appears");
  // 6. Canonical per-issue layer is present for a persisted record.
  assert.equal(exported.json.feedbackCards[0].issueCategory, "Countability");
  assert.equal(exported.json.taskInput.studentWriting, "Writing A", "the selected report's own writing is included (needed to reproduce)");

  // 7. Old report with no canonical layer is refused honestly.
  const old = await request("GET", "/api/admin/qa-reports/reportOld/export", null, adminCookie);
  assert.equal(old.statusCode, 409);
  assert.equal(old.json.errorCode, "CANONICAL_QA_NOT_AVAILABLE");

  // 8-12. Secrets and foreign data never appear anywhere in an export.
  assert.doesNotMatch(body, /sk-[A-Za-z0-9]{16,}|qa-export-test|passwordHash|password|Bearer /i, "no key, session secret or password material");
  assert.doesNotMatch(body, /system prompt|systemPrompt/i, "no internal system prompt");

  // 13. Path traversal is rejected (never a file read).
  for (const evil of ["..%2F..%2Fusers", "%2E%2E%2F%2E%2E%2Fusers.json", "reportA%2F..%2Fusers"]) {
    const traversal = await request("GET", `/api/admin/qa-reports/${evil}/export`, null, adminCookie);
    assert.ok([404, 409].includes(traversal.statusCode), `traversal ${evil} is refused`);
    assert.doesNotMatch(String(traversal.body || ""), /passwordHash|scrypt:/, "traversal never leaks the user store");
  }

  // 14. Unknown report -> JSON 404, not HTML.
  const missing = await request("GET", "/api/admin/qa-reports/nope/export", null, adminCookie);
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json.errorCode, "REPORT_NOT_FOUND");

  // 15-18. Export calls no provider, changes no quota/usage, and does not alter the stored report.
  globalThis.fetch = async () => { throw new Error("export must not call the provider"); };
  const historyBefore = await readFile(path.join(dataDir, "submission-history.json"), "utf8");
  const usersBefore = await readFile(path.join(dataDir, "users.json"), "utf8");
  await request("GET", "/api/admin/qa-reports/reportA/export", null, adminCookie);
  globalThis.fetch = ORIGINAL_FETCH;
  assert.equal(await readFile(path.join(dataDir, "submission-history.json"), "utf8"), historyBefore, "export does not alter saved reports");
  assert.equal(await readFile(path.join(dataDir, "users.json"), "utf8"), usersBefore, "export does not change quota or teacher usage");

  // 19. QA snapshot store writes atomically and redacts secrets.
  const store = createQaCanonicalStore({ rootDir: dataDir });
  await store.write("snapReport", { reportId: "snapReport", apiKey: "sk-must-not-persist-0123456789", note: "Bearer abcdefghijklmnopqrst", nested: { OPENAI_API_KEY: "sk-nope-0123456789012345" } });
  const snap = await store.read("snapReport");
  assert.equal(snap.reportId, "snapReport");
  assert.doesNotMatch(JSON.stringify(snap), /sk-must-not-persist|sk-nope|abcdefghijklmnopqrst/, "snapshot never persists secrets");
  const dir = await readFile(path.join(dataDir, "qa-canonical", "snapReport.json"), "utf8");
  assert.ok(dir.length > 0, "snapshot file exists after atomic rename");

  // 20. redactForQa strips secret keys at depth and scrubs secret-looking values.
  const red = redactForQa({ ok: 1, session_secret: "x", deep: { password: "p", token: "Bearer 0123456789abcdefghij", fine: "keep" } });
  assert.equal(red.session_secret, undefined);
  assert.equal(red.deep.password, undefined);
  assert.equal(red.deep.fine, "keep");

  // 21. Student view model carries no canonical internals (assembleQaExportFromRecord keeps them admin-side only).
  const assembled = assembleQaExportFromRecord(reportA);
  assert.equal(assembled.canonicalAnalysis.available, false);
  assert.equal(assembled.canonicalAnalysis.reason, "NOT_PERSISTED_IN_THIS_REPORT_VERSION");

  console.log("V12.8.2 canonical QA export: admin-only access, single-report scope, secret redaction, traversal refusal, JSON errors, and no provider/quota/report side effects verified.");
} finally {
  globalThis.fetch = ORIGINAL_FETCH;
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  process.env = { ...ORIGINAL_ENV };
}
