// V12.9.2 — "Re-analyze with Current Engine" must actually re-analyze.
//
// Production defect: `handleAnalyze()` consulted the historical exact-input cache
// (`findSubmissionByHash`) BEFORE `buildAnalysisLineage()` resolved rerun intent, and the async
// worker repeated the same shortcut before provider execution. An explicit rerun of unchanged work
// could therefore never reach the engine — it always reopened the cached report. The storage commit
// layer then compounded it: a rerun record carries the same submissionHash as its parent by design,
// so `findDuplicateSubmission` collapsed the new version back onto the old report.
//
// The fix separates three concerns: request idempotency (clientSubmissionId), the historical
// exact-input cache (submissionHash), and explicit rerun lineage. Only the historical cache is
// skipped, and only for a server-verified rerun. This suite proves both the new behaviour and that
// idempotency, duplicate-job collapse, restart recovery and exactly-once quota still hold.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApiHandler, normalizeRequestedAnalysisReason } from "../services/apiRouter.js";
import { isExplicitRerunRecord } from "../services/storage.js";

const ORIGINAL_ENV = { ...process.env };
const dataDir = await mkdtemp(path.join(tmpdir(), "v1292-rerun-"));

const PROMPT = "Small town center shops are running out of business because rural residents tend to go shopping in big cities store.\n\nTo what extent do the disadvantages of this development outweigh the advantages?";
const WRITING = [
  "In recent years, an increasing number of rural residents have bypassed their local town centers to shop at large commercial hubs in major cities. While this trend offers consumers greater product variety and competitive pricing, I firmly believe that its disadvantages, rural economic decline and environmental degradation, far outweigh the advantages.",
  "On one hand, shopping in big cities provides diverse product choices and offers undeniable benefits for individual consumers. Large metropolitan retailers provide bulk discounts, competitive pricing, and frequent promotions which independent rural shops cannot offer. Furthermore, urban commercial hubs contain an unparalleled variety of goods in one place, making the shopping experience more convenient. For example, a rural resident visiting a major city retail park can find global supermarket chains and clothing departments within the same area, allowing them to complete a month of diverse shopping in a single afternoon. Therefore, this eliminates the need to visit multiple scattered shops.",
  "However, the widespread abandonment of local shops inflicts severe and lasting damage on the economic stability of rural communities. When residents divert their choices to metropolitan centers, small-town businesses are forced into bankruptcy. This leads to immediate local job losses and sharply reduces the local tax revenue needed to fund essential public infrastructure. Without interested consumers, vulnerable groups and bankrupted people are left isolated. Therefore, the promotion of small town center shops are vital to prevent economic decline.",
  "In conclusion, although shopping in metropolitan centers provide product variety and competitive pricing, the small independent shops are forced into an economic instability. The resulting economic decline of small center shops demonstrates that the disadvantages of this development far outweigh the advantages."
].join("\n\n");

async function runSuite({ asyncMode }) {
  const label = asyncMode ? "async-render" : "sync";
  process.env = {
    ...ORIGINAL_ENV,
    SESSION_SECRET: "rerun-test",
    DIAGNOSTIC_STORAGE_ADAPTER: "local-json",
    DIAGNOSTIC_DATA_DIR: dataDir,
    DIAGNOSTIC_REQUIRE_FULL_ENGINE: "false",
    TEACHER_DAILY_SAFETY_LIMIT: "500"
  };
  delete process.env.OPENAI_API_KEY;
  delete process.env.NETLIFY;
  delete process.env.LAMBDA_TASK_ROOT;
  if (asyncMode) process.env.RENDER = "true";
  else delete process.env.RENDER;

  await writeFile(path.join(dataDir, "users.json"), JSON.stringify([
    { username: "teacher", password: "pw", displayName: "Teacher", role: "teacher", quotaMode: "unlimited", status: "active" },
    { username: "student", password: "pw", displayName: "Student", role: "student", quotaMode: "limited", quota: 20, used: 0, status: "active", expiryDate: "2099-12-31" },
    { username: "other", password: "pw", displayName: "Other Teacher", role: "teacher", quotaMode: "unlimited", status: "active" }
  ], null, 2));
  await writeFile(path.join(dataDir, "submission-history.json"), "[]");
  await writeFile(path.join(dataDir, "student-profiles.json"), "[]");

  let handler = createApiHandler({ rootDir: dataDir });
  const raw = async (method, p, body, cookie) => {
    const res = await handler({ method, path: p, headers: cookie ? { cookie } : {}, body: body ? JSON.stringify(body) : "" });
    let json = null;
    try { json = JSON.parse(res.body || "{}"); } catch { json = null; }
    return { ...res, json };
  };
  const login = async (u) => (await raw("POST", "/api/login", { username: u, password: "pw" })).headers["Set-Cookie"];

  const teacherCookie = await login("teacher");
  const otherCookie = await login("other");
  const evaToken = (await raw("POST", "/api/student-profiles", { displayName: "Eva" }, teacherCookie)).json.profile.profileToken;
  const otherToken = (await raw("POST", "/api/student-profiles", { displayName: "Foreign" }, otherCookie)).json.profile.profileToken;

  // Drives a submission to completion regardless of sync (200) or async (202 + poll).
  const analyse = async (body, cookie = teacherCookie) => {
    const submitted = await raw("POST", "/api/analyze", body, cookie);
    if (submitted.statusCode !== 202) return { ...submitted, mode: `sync-${submitted.statusCode}` };
    const jobId = submitted.json.jobId;
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const status = await raw("GET", `/api/analyze-status/${encodeURIComponent(jobId)}`, null, cookie);
      if (status.json?.analysis || status.json?.status === "complete") return { ...status, mode: "async-202", jobId, acceptedDuplicate: submitted.json.duplicate === true };
      if (["failed", "error", "expired"].includes(status.json?.status)) return { ...status, mode: "async-failed", jobId };
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return { statusCode: 504, json: { error: "job did not complete" }, mode: "async-timeout", jobId };
  };

  const history = async () => JSON.parse(await readFile(path.join(dataDir, "submission-history.json"), "utf8"));
  const quotaUsed = async (username) => {
    const users = JSON.parse(await readFile(path.join(dataDir, "users.json"), "utf8"));
    const user = users.find((item) => item.username === username);
    return Number(user.quotaUsed ?? user.used ?? 0);
  };

  const base = {
    taskType: "Task 2", essayType: "Advantages & Disadvantages", visualType: "", targetBand: "7.0",
    prompt: PROMPT, writing: WRITING, reportLanguage: "en", studentProfileToken: evaToken,
    options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
  };

  // ---- 1. First analysis establishes the baseline report. -------------------------------------
  const first = await analyse({ ...base, clientSubmissionId: "rerun-first" });
  assert.ok(first.json.analysis, `${label}: first analysis completes`);
  const firstHistory = await history();
  assert.equal(firstHistory.length, 1, `${label}: one report exists`);
  const parent = firstHistory[0];
  assert.equal(parent.analysisReason, "first-analysis");
  assert.equal(parent.progressEligible, true);
  assert.equal(parent.explicitRerun, false, `${label}: a first analysis is not a rerun`);

  // ---- 2. Unchanged NORMAL submission opens the cached report, consumes nothing. ---------------
  // (Requirement A, and the guarantee the fix must not weaken.)
  const usageBeforeCachedOpen = await quotaUsed("teacher");
  const cached = await analyse({ ...base, clientSubmissionId: "rerun-cached-open" });
  assert.equal(cached.json.duplicateSubmission, true, `${label}: unchanged normal submission is a duplicate`);
  assert.match(String(cached.json.message || ""), /already been analyzed/i);
  assert.equal((await history()).length, 1, `${label}: no second report was created`);
  assert.equal(await quotaUsed("teacher"), usageBeforeCachedOpen, `${label}: opening the cached report consumes nothing`);
  assert.equal(cached.json.analysis.estimatedBandRange, first.json.analysis.estimatedBandRange);

  // ---- 3-6. Explicit rerun of UNCHANGED work reaches the engine and creates a new version. -----
  const rerun = await analyse({
    ...base,
    clientSubmissionId: "rerun-explicit-1",
    options: { ...base.options, parentReportId: parent.submissionId, analysisReason: "explicit-rerun" }
  });
  assert.ok(rerun.json.analysis, `${label}: explicit rerun returns an analysis`);
  assert.notEqual(rerun.json.duplicateSubmission, true, `${label}: explicit rerun is NOT reported as a duplicate`);
  const afterRerun = await history();
  assert.equal(afterRerun.length, 2, `${label}: the rerun created a SECOND report`);
  const child = afterRerun.find((record) => record.submissionId !== parent.submissionId);
  assert.ok(child, `${label}: the new version exists`);

  // 3. Same submissionGroupId, correct parentReportId.
  assert.equal(child.submissionGroupId, parent.submissionGroupId, `${label}: the rerun shares the work group`);
  assert.equal(child.parentReportId, parent.submissionId, `${label}: the rerun names its parent`);
  // 4. Distinct submissionId even though the student-work fingerprint is identical.
  assert.notEqual(child.submissionId, parent.submissionId, `${label}: the rerun has its own report id`);
  assert.equal(child.studentWorkFingerprint, parent.studentWorkFingerprint, `${label}: the work identity is unchanged`);
  assert.equal(child.submissionHash, parent.submissionHash, `${label}: the input hash is unchanged`);
  assert.equal(child.explicitRerun, true, `${label}: the record is marked a verified rerun`);
  // 6. Same engine → explicit-rerun.
  assert.equal(child.analysisReason, "explicit-rerun", `${label}: same engine yields explicit-rerun`);
  // B. Identical work does not advance progression.
  assert.equal(child.progressEligible, false, `${label}: identical work is not progression-eligible`);
  // 14. The old report is preserved, not overwritten.
  const preservedParent = afterRerun.find((record) => record.submissionId === parent.submissionId);
  assert.ok(preservedParent, `${label}: the earlier report still exists`);
  assert.equal(preservedParent.dateTime, parent.dateTime, `${label}: the earlier report was not rewritten`);
  // 16. The rerun reflects the CURRENT engine, not the cached projection.
  assert.ok(Array.isArray(child.report?.feedbackIntegrity?.consistencyAudit), `${label}: the rerun carries current-engine output`);

  // ---- 5. Engine changed → engine-upgrade. ----------------------------------------------------
  const mutated = await history();
  const parentIndex = mutated.findIndex((record) => record.submissionId === parent.submissionId);
  mutated[parentIndex] = { ...mutated[parentIndex], engineVersion: "ielts-diagnostic-engine-v0.0.1-old" };
  // Remove the first rerun so the stale-engine parent is the one the lineage resolves against.
  await writeFile(path.join(dataDir, "submission-history.json"), JSON.stringify([mutated[parentIndex]], null, 2));
  const upgraded = await analyse({
    ...base,
    clientSubmissionId: "rerun-engine-upgrade",
    options: { ...base.options, parentReportId: parent.submissionId, analysisReason: "explicit-rerun" }
  });
  assert.ok(upgraded.json.analysis, `${label}: engine-upgrade rerun completes`);
  const upgradeChild = (await history()).find((record) => record.clientSubmissionId === "rerun-engine-upgrade");
  assert.ok(upgradeChild, `${label}: the engine-upgrade rerun created a report`);
  assert.equal(upgradeChild.analysisReason, "engine-upgrade", `${label}: a changed engineVersion yields engine-upgrade`);
  assert.equal(upgradeChild.progressEligible, false);

  // ---- 7. Modified writing → revised-submission, normal quota, progression per policy. ---------
  const revised = await analyse({
    ...base,
    writing: `${WRITING}\n\nIn addition, local councils could support independent retailers with reduced business rates, which would slow the rate of closure while the wider trend continues.`,
    clientSubmissionId: "rerun-revised"
  });
  assert.ok(revised.json.analysis, `${label}: revised submission completes`);
  const revisedRecord = (await history()).find((record) => record.clientSubmissionId === "rerun-revised");
  assert.equal(revisedRecord.analysisReason, "revised-submission", `${label}: changed writing is a revised submission`);
  assert.equal(revisedRecord.progressEligible, true, `${label}: revised work advances progression`);
  assert.notEqual(revisedRecord.submissionGroupId, parent.submissionGroupId, `${label}: different work is a different group`);

  // ---- 8. Forged or foreign parentReportId is rejected. ----------------------------------------
  const forged = await raw("POST", "/api/analyze", {
    ...base, clientSubmissionId: "rerun-forged",
    options: { ...base.options, parentReportId: "deadbeefdeadbeefdeadbeef", analysisReason: "explicit-rerun" }
  }, teacherCookie);
  assert.equal(forged.statusCode, 404, `${label}: a non-existent parent report is rejected`);
  assert.equal(forged.json.errorCode, "VALIDATION_ERROR");

  // A parent belonging to ANOTHER account cannot be borrowed to force a bypass.
  const foreignFirst = await analyse({ ...base, studentProfileToken: otherToken, clientSubmissionId: "rerun-foreign-base" }, otherCookie);
  assert.ok(foreignFirst.json.analysis);
  const foreignParent = (await history()).find((record) => record.username === "other");
  assert.ok(foreignParent, `${label}: the other account has its own report`);
  const borrowed = await raw("POST", "/api/analyze", {
    ...base, clientSubmissionId: "rerun-borrowed",
    options: { ...base.options, parentReportId: foreignParent.submissionId, analysisReason: "explicit-rerun" }
  }, teacherCookie);
  assert.equal(borrowed.statusCode, 404, `${label}: a foreign parent report is not visible to this account`);

  // ---- 9. Missing parentReportId cannot force a cache bypass. ----------------------------------
  const bypassAttempt = await analyse({
    ...base, clientSubmissionId: "rerun-no-parent",
    options: { ...base.options, analysisReason: "explicit-rerun" }
  });
  assert.equal(bypassAttempt.json.duplicateSubmission, true, `${label}: a bare reason label cannot bypass the cache`);
  assert.equal((await history()).filter((r) => r.clientSubmissionId === "rerun-no-parent").length, 0, `${label}: no report was created`);

  // A bare boolean is likewise not trusted.
  const forceAttempt = await analyse({
    ...base, clientSubmissionId: "rerun-force-flag",
    options: { ...base.options, force: true, forceRerun: true, explicitRerun: true, rerunVerified: true }
  });
  assert.equal(forceAttempt.json.duplicateSubmission, true, `${label}: force/explicitRerun booleans are ignored`);

  // ---- 10. Repeated click / retry with the same clientSubmissionId runs the provider once. -----
  const parentForRetry = (await history()).find((record) => record.username === "teacher" && record.analysisReason === "first-analysis");
  const retryBody = {
    ...base, clientSubmissionId: "rerun-retry-key",
    options: { ...base.options, parentReportId: parentForRetry.submissionId, analysisReason: "explicit-rerun" }
  };
  const retryFirst = await analyse(retryBody);
  assert.ok(retryFirst.json.analysis);
  const afterRetryFirst = (await history()).length;
  const retrySecond = await analyse(retryBody);
  assert.ok(retrySecond.json.analysis, `${label}: the retry still returns the analysis`);
  assert.equal((await history()).length, afterRetryFirst, `${label}: a retried rerun creates no extra report`);
  const retryRecords = (await history()).filter((record) => record.clientSubmissionId === "rerun-retry-key");
  assert.equal(retryRecords.length, 1, `${label}: exactly one record exists for the idempotency key`);

  // ---- 11. Two concurrent identical reruns do not double-charge. -------------------------------
  const studentCookie = await login("student");
  const studentToken = (await raw("POST", "/api/student-profiles", { displayName: "Self" }, studentCookie)).json.profile?.profileToken
    || (await raw("GET", "/api/student-profiles", null, studentCookie)).json.profiles[0].profileToken;
  const studentBase = { ...base, studentProfileToken: studentToken };
  await analyse({ ...studentBase, clientSubmissionId: "student-base" }, studentCookie);
  const studentParent = (await history()).find((record) => record.username === "student");
  const quotaBefore = await quotaUsed("student");
  const concurrentBody = (key) => ({
    ...studentBase, clientSubmissionId: key,
    options: { ...base.options, parentReportId: studentParent.submissionId, analysisReason: "explicit-rerun" }
  });
  const [runA, runB] = await Promise.all([
    analyse(concurrentBody("student-concurrent"), studentCookie),
    analyse(concurrentBody("student-concurrent"), studentCookie)
  ]);
  assert.ok(runA.json.analysis && runB.json.analysis, `${label}: both concurrent requests receive an analysis`);
  const concurrentRecords = (await history()).filter((record) => record.clientSubmissionId === "student-concurrent");
  assert.equal(concurrentRecords.length, 1, `${label}: two concurrent identical reruns produce ONE report`);
  assert.equal(await quotaUsed("student") - quotaBefore, 1, `${label}: quota is charged exactly once`);

  // ---- 12. Restart after a completed rerun does not duplicate or double-charge. ----------------
  const quotaBeforeRestart = await quotaUsed("student");
  const historyBeforeRestart = (await history()).length;
  handler = createApiHandler({ rootDir: dataDir });
  const afterRestart = await analyse(concurrentBody("student-concurrent"), studentCookie);
  assert.ok(afterRestart.json.analysis, `${label}: the same rerun after restart still resolves`);
  assert.equal((await history()).length, historyBeforeRestart, `${label}: restart created no duplicate report`);
  assert.equal(await quotaUsed("student"), quotaBeforeRestart, `${label}: restart charged nothing further`);

  // ---- 15. The rerun report is exportable in its own right. ------------------------------------
  const rerunRecord = (await history()).find((record) => record.clientSubmissionId === "rerun-explicit-1")
    || (await history()).find((record) => record.explicitRerun === true);
  assert.ok(rerunRecord, `${label}: a rerun record is available for export`);
  assert.ok(rerunRecord.report, `${label}: the rerun stored its own report payload`);
  assert.notEqual(rerunRecord.pdfProjectionId, "", `${label}: the rerun has its own PDF projection id`);

  return { label, reports: (await history()).length };
}

try {
  const sync = await runSuite({ asyncMode: false });
  await writeFile(path.join(dataDir, "submission-history.json"), "[]");
  // ---- 13. The async-render path behaves identically to the sync path. -------------------------
  const asyncRun = await runSuite({ asyncMode: true });
  assert.equal(sync.reports, asyncRun.reports, "the async path produces the same report count as the sync path");

  // Server-normalised reason values: only what a client is allowed to ask for.
  assert.equal(normalizeRequestedAnalysisReason("explicit-rerun"), "explicit-rerun");
  assert.equal(normalizeRequestedAnalysisReason("EXPLICIT-RERUN"), "explicit-rerun");
  assert.equal(normalizeRequestedAnalysisReason("engine-upgrade"), "", "a client cannot claim engine-upgrade");
  assert.equal(normalizeRequestedAnalysisReason("first-analysis"), "", "a client cannot claim first-analysis");
  assert.equal(normalizeRequestedAnalysisReason("' OR 1=1"), "");
  assert.equal(normalizeRequestedAnalysisReason(""), "");

  // The commit layer only treats a record as a rerun version when the server marked it AND it names
  // a parent — a stray boolean on a record is not enough to escape duplicate collapse.
  assert.equal(isExplicitRerunRecord({ explicitRerun: true, parentReportId: "abc" }), true);
  assert.equal(isExplicitRerunRecord({ explicitRerun: true, parentReportId: "" }), false);
  assert.equal(isExplicitRerunRecord({ explicitRerun: false, parentReportId: "abc" }), false);
  assert.equal(isExplicitRerunRecord({}), false);

  console.log("V12.9.2 explicit rerun: an unchanged normal submission still opens the cached report free of charge, while a verified 'Re-analyze with Current Engine' reaches the engine and creates a second report that shares the submissionGroupId, names its parent, takes its own submissionId, is labelled engine-upgrade or explicit-rerun correctly and is not progression-eligible; a revised submission is labelled revised-submission and does advance progression; forged, foreign and absent parent ids cannot bypass the cache and bare force booleans are ignored; a retried click, two concurrent reruns and a restart each call the provider once and charge quota exactly once; and the sync and async-render paths behave identically.");
} finally {
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  process.env = { ...ORIGINAL_ENV };
}
