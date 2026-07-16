import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createAnalysisJobStore } from "./analysisJobStore.js";
import { analyzeWriting, getAnalyzerHealth, runProviderHealthCheck, validateReportOutput } from "./aiAnalyzer.js";
import { projectCanonicalAnalysis } from "./canonicalAnalysis.js";
import { resolveAnalysisVersions } from "./analysisVersions.js";
import {
  classifyTask1Visual,
  normalizeTask1PublicVisualType,
  task1DiagnosticVisualType,
  TASK1_PUBLIC_VISUAL_TYPES
} from "./task1Safety.js";
import {
  classifyTask2Prompt,
  normalizeTask2PublicEssayType,
  TASK2_PUBLIC_ESSAY_TYPES
} from "./task2Safety.js";
import { getWordCountMetadata } from "../wordCount.js";
import {
  createStorage,
  sanitizeUserForAdmin,
  sanitizeUserForClient
} from "./storage.js";

const MAX_JSON_BYTES = 8 * 1024 * 1024;
const SESSION_COOKIE = "ielts_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const ACCESS_EXPIRED_MESSAGE = "Your early access period has ended. Please contact Kru Pom IELTS to extend access.";
const API_DISCONNECTED_MESSAGE = "The Diagnostic Lab API is not connected yet. Please contact Kru Pom IELTS.";
const GENERIC_ANALYSIS_ERROR = "Analysis could not be completed. Please try again or contact Kru Pom IELTS.";
const QUOTA_USED_MESSAGE = "Your early access quota has been used. Please contact Kru Pom IELTS to extend access.";
const TEACHER_DAILY_LIMIT_MESSAGE = "Teacher daily safety limit reached. Please try again tomorrow or increase TEACHER_DAILY_SAFETY_LIMIT in Render environment variables.";
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

const TASK1_VISUAL_TYPES = new Set(TASK1_PUBLIC_VISUAL_TYPES);
const TASK2_ESSAY_TYPES = new Set(TASK2_PUBLIC_ESSAY_TYPES);

export function loadEnvFile(rootDir) {
  const envPath = path.join(rootDir, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

export function createApiHandler(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  loadEnvFile(rootDir);
  const storage = options.storage || createStorage({ rootDir });
  const jobStore = options.jobStore || createAnalysisJobStore({ rootDir });
  const analysisVersions = resolveAnalysisVersions(options.analysisVersions);

  return async function handleApiRequest(request) {
    const method = request.method || request.httpMethod || "GET";
    const apiPath = normalizeApiPath(request.path || "/api");

    try {
      if (method === "OPTIONS") {
        return jsonResponse(200, { ok: true });
      }

      if (method === "GET" && apiPath === "/api/health") {
        const analyzerHealth = getAnalyzerHealth();
        return jsonResponse(200, {
          ok: true,
          apiConnected: true,
          diagnosticEngineConfigured: analyzerHealth.diagnosticEngineConfigured,
          diagnosticEngineConnected: analyzerHealth.diagnosticEngineConfigured && analyzerHealth.modelConfigured,
          modelConfigured: analyzerHealth.modelConfigured,
          modelName: analyzerHealth.modelName,
          fullEngineRequired: analyzerHealth.fullEngineRequired,
          timeoutMs: analyzerHealth.timeoutMs,
          maxOutputTokens: analyzerHealth.maxOutputTokens,
          reasoningEffort: analyzerHealth.reasoningEffort,
          analysisMode: shouldUseAsyncAnalysis() ? "async-background" : "sync",
          jobStorageMode: jobStore.name,
          storageMode: storage.name,
          storageAdapter: storage.name,
          storageRuntime: storage.runtime || "node",
          durableStorage: Boolean(storage.isDurable),
          analysisVersions
        });
      }

      if (method === "GET" && apiPath === "/api/debug-analyze-health") {
        return await handleDebugAnalyzeHealth(request, storage);
      }

      if (method === "GET" && apiPath === "/api/session") {
        const session = await getSessionUser(request, storage);
        if (!session) {
          return jsonResponse(200, { ok: true, authenticated: false });
        }

        return jsonResponse(200, {
          ok: true,
          authenticated: true,
          user: withExpiryFlags(addDailyLimitFlags(sanitizeUserForClient(session.user)))
        });
      }

      if (method === "POST" && apiPath === "/api/login") {
        return await handleLogin(request, storage);
      }

      if (method === "POST" && apiPath === "/api/logout") {
        return jsonResponse(200, { ok: true }, {
          "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookieSuffix()}`
        });
      }

      if (method === "GET" && apiPath === "/api/progress") {
        const session = await requireSession(request, storage);
        const profile = await resolveStudentProfileFromRequest(storage, session.user, request);
        if (!profile) return jsonResponse(200, {
          ok: true,
          state: "no-student-selected",
          student: null,
          records: [],
          validRecords: [],
          summary: buildServerProgressSummary([], null, "")
        });
        const taskType = getQueryParam(request.path, "taskType");
        const records = await storage.getSubmissionHistory(session.user.username, profile.id, taskType);
        const validRecords = records.filter(isValidProgressRecord);
        return jsonResponse(200, {
          ok: true,
          state: validRecords.length ? "ready" : "no-valid-reports",
          student: { displayName: profile.displayName, active: profile.active !== false },
          records: records.map(sanitizeProgressRecordForClient),
          validRecords: validRecords.map(sanitizeProgressRecordForClient),
          summary: buildServerProgressSummary(validRecords, null, taskType)
        });
      }

      const submissionMatch = apiPath.match(/^\/api\/submissions\/([^/]+)$/);
      const reanalyzeMatch = apiPath.match(/^\/api\/submissions\/([^/]+)\/reanalyze$/);
      if (method === "POST" && reanalyzeMatch) {
        const session = await requireSession(request, storage);
        return await handleStoredReanalysis({
          storage,
          user: session.user,
          submissionId: decodeURIComponent(reanalyzeMatch[1]),
          analysisVersions
        });
      }
      if (method === "PATCH" && submissionMatch) {
        const session = await requireSession(request, storage);
        if (!isTeacherOrAdmin(session.user)) {
          throw statusError("Only a teacher or administrator can invalidate a report.", 403, "VALIDATION_ERROR");
        }
        const body = readJsonBody(request);
        if (String(body.action || "").trim().toLowerCase() !== "invalidate") {
          throw statusError("Submission action must be invalidate.", 400, "VALIDATION_ERROR");
        }
        const reason = String(body.reason || "").trim();
        if (reason.length < 5) throw statusError("Please record a reason for invalidating this analysis.", 400, "VALIDATION_ERROR");
        if (typeof storage.markSubmissionInvalid !== "function") throw statusError("This storage adapter cannot invalidate reports.", 500, "INTERNAL_ERROR");
        const updated = await storage.markSubmissionInvalid(session.user.username, decodeURIComponent(submissionMatch[1]), reason, session.user.username);
        if (!updated) throw statusError("Submission was not found for this account.", 404, "VALIDATION_ERROR");
        const records = await storage.getSubmissionHistory(session.user.username, updated.studentProfileId, updated.taskType);
        return jsonResponse(200, {
          ok: true,
          record: sanitizeProgressRecordForClient(updated),
          progressSummary: buildServerProgressSummary(records.filter(isValidProgressRecord), null, updated.taskType)
        });
      }

      if (method === "GET" && apiPath === "/api/student-profiles") {
        const session = await requireSession(request, storage);
        const profiles = await listProfilesForUser(storage, session.user);
        return jsonResponse(200, { ok: true, profiles: profiles.map((profile) => sanitizeStudentProfileForClient(session.user, profile, { includeStatus: true })) });
      }

      if (method === "POST" && apiPath === "/api/student-profiles") {
        const session = await requireSession(request, storage);
        if (!isTeacherOrAdmin(session.user)) {
          throw statusError("Student accounts use their own learner profile.", 403, "VALIDATION_ERROR");
        }
        const body = readJsonBody(request);
        const profile = await storage.createStudentProfile(session.user.username, body.displayName);
        return jsonResponse(201, { ok: true, profile: sanitizeStudentProfileForClient(session.user, profile) });
      }

      const studentProfileMatch = apiPath.match(/^\/api\/student-profiles\/([^/]+)$/);
      if (method === "PATCH" && studentProfileMatch) {
        const session = await requireSession(request, storage);
        if (!isTeacherOrAdmin(session.user)) {
          throw statusError("Student accounts cannot archive learner profiles.", 403, "VALIDATION_ERROR");
        }
        const token = decodeURIComponent(studentProfileMatch[1]);
        const profile = await resolveStudentProfileToken(storage, session.user, token, { includeArchived: true });
        if (!profile) throw statusError("Student profile was not found.", 404, "VALIDATION_ERROR");
        const action = String(readJsonBody(request).action || "").trim().toLowerCase();
        const updated = action === "archive"
          ? await storage.archiveStudentProfile(session.user.username, profile.id)
          : action === "restore"
            ? await storage.restoreStudentProfile(session.user.username, profile.id)
            : null;
        if (!updated) throw statusError("Student profile action must be archive or restore.", 400, "VALIDATION_ERROR");
        return jsonResponse(200, { ok: true, profile: sanitizeStudentProfileForClient(session.user, updated, { includeStatus: true }) });
      }

      if (method === "DELETE" && studentProfileMatch) {
        const session = await requireSession(request, storage);
        if (!isTeacherOrAdmin(session.user)) {
          throw statusError("Student accounts cannot permanently delete learner profiles.", 403, "VALIDATION_ERROR");
        }
        const token = decodeURIComponent(studentProfileMatch[1]);
        const profile = await resolveStudentProfileToken(storage, session.user, token, { includeArchived: true });
        if (!profile) throw statusError("Student profile was not found.", 404, "VALIDATION_ERROR");
        if (profile.active !== false) {
          throw statusError("Archive the student profile before permanently deleting it.", 409, "VALIDATION_ERROR");
        }
        const body = readJsonBody(request);
        const confirmedName = normalizeStudentConfirmation(body.confirmation);
        if (body.permanent !== true || confirmedName !== normalizeStudentConfirmation(profile.displayName)) {
          throw statusError(`Type ${profile.displayName} exactly to confirm permanent deletion.`, 400, "VALIDATION_ERROR");
        }
        const deletion = await storage.deleteStudentProfile(session.user.username, profile.id);
        const deletedJobCount = await jobStore.deleteForStudent(session.user.username, profile.id);
        return jsonResponse(200, {
          ok: true,
          deleted: true,
          studentDisplayName: profile.displayName,
          deletedReportCount: deletion.deletedReportCount,
          deletedJobCount,
          accountCreditsChanged: false
        });
      }

      const analyzeStatusMatch = apiPath.match(/^\/api\/analyze-status\/([^/]+)$/);
      if (method === "GET" && analyzeStatusMatch) {
        return await handleAnalyzeStatus(request, storage, jobStore, decodeURIComponent(analyzeStatusMatch[1]));
      }

      if (method === "POST" && apiPath === "/api/analyze") {
        return await handleAnalyze(request, storage, jobStore, analysisVersions);
      }

      const adminResponse = await maybeHandleAdminRoute(method, apiPath, request, storage);
      if (adminResponse) return adminResponse;

      return jsonResponse(404, { ok: false, error: "API route not found." });
    } catch (error) {
      const normalized = normalizeError(error);
      if (method === "POST" && apiPath === "/api/analyze") {
        logAnalyzeFailure(error, readAnalyzeMetadata(request));
      }
      return jsonResponse(normalized.statusCode, normalized.payload);
    }
  };
}

export function normalizeApiPath(rawPath) {
  const pathname = String(rawPath || "/api").split("?")[0];
  const functionPrefix = "/.netlify/functions/api";

  if (pathname.startsWith(functionPrefix)) {
    const suffix = pathname.slice(functionPrefix.length);
    return `/api${suffix || ""}`;
  }

  return pathname;
}

function getQueryParam(rawPath, name) {
  try {
    return new URL(String(rawPath || "/api"), "http://diagnostic.local").searchParams.get(name) || "";
  } catch {
    return "";
  }
}

function isTeacherOrAdmin(user) {
  return ["teacher", "admin"].includes(String(user?.role || "student").toLowerCase());
}

async function listProfilesForUser(storage, user) {
  const profiles = isTeacherOrAdmin(user)
    ? await storage.listStudentProfiles(user.username, { includeArchived: true })
    : [await storage.ensureStudentProfile(user.username, user.displayName || user.username)];
  return Promise.all(profiles.map(async (profile) => {
    const valid = stableProgressSort((await storage.getSubmissionHistory(user.username, profile.id)).filter(isValidProgressRecord));
    const task1 = valid.filter((record) => record.taskType === "Task 1");
    const task2 = valid.filter((record) => record.taskType === "Task 2");
    return {
      ...profile,
      reportCount: valid.length,
      task1ReportCount: task1.length,
      task2ReportCount: task2.length,
      latestTask1Range: task1.at(-1)?.estimatedBandRange || "",
      latestTask2Range: task2.at(-1)?.estimatedBandRange || "",
      latestActivityAt: valid.at(-1)?.dateTime || ""
    };
  }));
}

function studentProfileToken(user, profile) {
  return sign(`student-profile:${user.username}:${profile.id}`);
}

function sanitizeStudentProfileForClient(user, profile, options = {}) {
  const sanitized = {
    profileToken: studentProfileToken(user, profile),
    displayName: profile.displayName
  };
  if (options.includeStatus) {
    sanitized.active = profile.active !== false;
    sanitized.archivedAt = profile.archivedAt || "";
    sanitized.reportCount = Math.max(0, Number(profile.reportCount) || 0);
    sanitized.task1ReportCount = Math.max(0, Number(profile.task1ReportCount) || 0);
    sanitized.task2ReportCount = Math.max(0, Number(profile.task2ReportCount) || 0);
    sanitized.latestTask1Range = String(profile.latestTask1Range || "");
    sanitized.latestTask2Range = String(profile.latestTask2Range || "");
    sanitized.latestActivityAt = String(profile.latestActivityAt || "");
  }
  return sanitized;
}

function normalizeStudentConfirmation(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/gu, " ").trim();
}

async function resolveStudentProfileToken(storage, user, token, options = {}) {
  if (!token) return null;
  const profiles = await storage.listStudentProfiles(user.username, options);
  return profiles.find((profile) => verifySignature(`student-profile:${user.username}:${profile.id}`, token)) || null;
}

async function resolveStudentProfileForAnalysis(storage, user, token) {
  if (!isTeacherOrAdmin(user)) {
    return storage.ensureStudentProfile(user.username, user.displayName || user.username);
  }
  if (!token) {
    throw statusError("Please select a student before analyzing.", 400, "VALIDATION_ERROR");
  }
  const profile = await resolveStudentProfileToken(storage, user, token);
  if (!profile) {
    throw statusError("The selected student was not found. Please select the student again.", 404, "VALIDATION_ERROR");
  }
  return profile;
}

async function resolveStudentProfileFromRequest(storage, user, request) {
  if (!isTeacherOrAdmin(user)) {
    return storage.ensureStudentProfile(user.username, user.displayName || user.username);
  }
  const token = getQueryParam(request.path, "student");
  if (!token) return null;
  const profile = await resolveStudentProfileToken(storage, user, token, { includeArchived: true });
  if (!profile) throw statusError("Student progress was not found.", 404, "VALIDATION_ERROR");
  return profile;
}

async function assertOwnedStudentProfile(storage, user, payload) {
  const profile = await storage.getStudentProfile(user.username, payload.studentProfileId);
  if (!profile || profile.displayName !== payload.studentDisplayNameSnapshot) {
    throw statusError("The selected student profile is no longer available. Please submit again.", 404, "VALIDATION_ERROR");
  }
  return profile;
}

function sanitizeAnalysisForClient(analysis = {}) {
  if (!analysis || typeof analysis !== "object") return analysis;
  const {
    ownerAccountId,
    accountRole,
    studentProfileId,
    ...safe
  } = analysis;
  return {
    ...safe,
    ...(safe.canonicalAnalysis ? { canonicalAnalysis: sanitizeCanonicalForClient(safe.canonicalAnalysis) } : {}),
    ...(safe.canonicalTask2Analysis ? { canonicalTask2Analysis: sanitizeCanonicalForClient(safe.canonicalTask2Analysis) } : {})
  };
}

function sanitizeCanonicalForClient(canonical = {}) {
  const metadata = canonical?.metadata || {};
  const { ownerAccountId, studentProfileId, inputFingerprint, ...safeMetadata } = metadata;
  return { ...canonical, metadata: safeMetadata };
}

function sanitizeProgressRecordForClient(record = {}) {
  if (!record || typeof record !== "object") return record;
  const {
    username,
    ownerAccountId,
    studentProfileId,
    submissionHash,
    inputFingerprint,
    clientSubmissionId,
    analysisContentHash,
    analysisInput,
    ...safe
  } = record;
  if (safe.report) safe.report = sanitizeAnalysisForClient(safe.report);
  if (safe.analysis) safe.analysis = sanitizeAnalysisForClient(safe.analysis);
  return safe;
}

async function handleLogin(request, storage) {
  const body = readJsonBody(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const user = await storage.getUserByUsername(username);

  if (!user || user.status !== "active" || !verifyUserPassword(user, password)) {
    throw statusError("Username or password is incorrect. Please contact Kru Pom IELTS.", 401, "NOT_AUTHENTICATED");
  }

  const loginPatch = { lastLoginAt: new Date().toISOString() };
  if (user.password && !user.passwordHash) {
    loginPatch.password = "";
    loginPatch.passwordHash = hashPassword(password);
  }
  const updatedUser = await storage.updateUser(user.username, loginPatch).catch(() => user);

  return jsonResponse(200, {
    ok: true,
    authenticated: true,
    user: withExpiryFlags(addDailyLimitFlags(sanitizeUserForClient(updatedUser)))
  }, {
    "Set-Cookie": buildSessionCookie(createSessionToken(user.username))
  });
}

async function handleAnalyze(request, storage, jobStore, analysisVersions = resolveAnalysisVersions()) {
  const session = await requireSession(request, storage);
  const user = session.user;
  const body = readJsonBody(request);
  const payload = applyTask1ClassificationGuard(applyTask2ClassificationGuard(validateAnalyzePayload(body)));
  Object.assign(payload, analysisVersions);

  const studentProfile = await resolveStudentProfileForAnalysis(storage, user, payload.studentProfileToken);
  Object.assign(payload, {
    ownerAccountId: user.username,
    accountRole: user.role,
    studentProfileId: studentProfile.id,
    studentDisplayNameSnapshot: studentProfile.displayName
  });
  delete payload.studentProfileToken;
  const analysisContentHash = createAnalysisContentHash(user.username, payload);
  const submissionHash = createSubmissionHash(user.username, payload);
  payload.analysisContentHash = analysisContentHash;
  payload.inputFingerprint = submissionHash;
  const idempotencyKey = payload.clientSubmissionId;

  const existingRecord = idempotencyKey
    ? await storage.findSubmissionByKey(user.username, idempotencyKey, payload.studentProfileId)
    : null;
  const duplicateRecord = existingRecord || await storage.findSubmissionByHash?.(user.username, submissionHash, payload.studentProfileId);

  if (duplicateRecord) {
    const latestUser = await storage.getUserByUsername(user.username);
    await auditAnalyze(storage, latestUser || user, payload, {
      openAiCalled: false,
      quotaDeducted: false,
      duplicateCacheUsed: true
    });
    const duplicatePayload = buildDuplicateAnalysisResponse({
      user: latestUser || user,
      record: duplicateRecord,
      duplicateByHash: duplicateRecord.submissionHash === submissionHash && duplicateRecord.clientSubmissionId !== idempotencyKey
    });
    duplicatePayload.progressSummary = buildServerProgressSummary(
      (await storage.getSubmissionHistory(user.username, payload.studentProfileId, payload.taskType)).filter(isValidProgressRecord),
      duplicateRecord,
      payload.taskType
    );
    return jsonResponse(200, duplicatePayload);
  }

  const priorRecords = (await storage.getSubmissionHistory(user.username, payload.studentProfileId, payload.taskType)).filter(isValidProgressRecord);
  const previousVersion = priorRecords.find((record) => record.analysisContentHash === analysisContentHash) || null;
  const previousLatest = priorRecords.at(-1) || null;
  payload.parentReportId = previousVersion?.submissionId || "";
  payload.analysisReason = previousVersion ? "engine-upgrade" : previousLatest ? "revised-submission" : "first-analysis";
  payload.generatedAt = new Date().toISOString();

  await enforceAnalysisAccess(storage, user, payload);

  if (shouldUseAsyncAnalysis()) {
    const existingJob = idempotencyKey ? await jobStore.get(idempotencyKey) : null;
    if (existingJob && existingJob.username === user.username) {
      return jsonResponse(202, {
        ok: true,
        queued: true,
        jobId: existingJob.jobId,
        status: existingJob.status || "queued",
        statusUrl: `/api/analyze-status/${encodeURIComponent(existingJob.jobId)}`
      });
    }

    const jobId = idempotencyKey || createJobId();
    await jobStore.set(jobId, {
      jobId,
      username: user.username,
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      payload: {
        ...payload,
        submissionHash
      }
    });
    await invokeAnalyzeWorker(request, jobId);

    return jsonResponse(202, {
      ok: true,
      queued: true,
      jobId,
      status: "queued",
      statusUrl: `/api/analyze-status/${encodeURIComponent(jobId)}`
    });
  }

  let analysis;
  try {
    analysis = validateReportOutput(await analyzeWriting(payload), payload);
  } catch (error) {
    await auditAnalyze(storage, user, payload, {
      openAiCalled: true,
      quotaDeducted: false,
      duplicateCacheUsed: false,
      reason: error.errorCode || "analysis-failed"
    });
    throw error;
  }
  const progressRecord = buildSubmissionHistoryRecord(user.username, payload, analysis, submissionHash);
  const savedRecord = await storage.appendSubmission(progressRecord).catch((error) => {
    error.errorCode = error.errorCode || "INTERNAL_ERROR";
    error.debugHint = error.debugHint || "Storage append failed after analysis. Check DIAGNOSTIC_STORAGE_ADAPTER and serverless filesystem permissions.";
    throw error;
  });
  if (savedRecord !== progressRecord) {
    const latestUser = await storage.getUserByUsername(user.username);
    await auditAnalyze(storage, latestUser || user, payload, {
      openAiCalled: true,
      quotaDeducted: false,
      duplicateCacheUsed: true
    });
    const duplicatePayload = buildDuplicateAnalysisResponse({
      user: latestUser || user,
      record: savedRecord,
      duplicateByHash: savedRecord.submissionHash === submissionHash && savedRecord.clientSubmissionId !== idempotencyKey
    });
    duplicatePayload.progressSummary = buildServerProgressSummary(
      (await storage.getSubmissionHistory(user.username, payload.studentProfileId, payload.taskType)).filter(isValidProgressRecord),
      savedRecord,
      payload.taskType
    );
    return jsonResponse(200, duplicatePayload);
  }

  const updatedUser = await storage.incrementUsage(user.username).catch((error) => {
    error.errorCode = error.errorCode || "INTERNAL_ERROR";
    error.debugHint = error.debugHint || "Quota update failed after analysis. Check DIAGNOSTIC_STORAGE_ADAPTER and serverless filesystem permissions.";
    throw error;
  });
  await auditAnalyze(storage, updatedUser, payload, {
    openAiCalled: true,
    quotaDeducted: isLimitedUser(updatedUser),
    duplicateCacheUsed: false
  });

  return jsonResponse(200, {
    ok: true,
    duplicateSubmission: false,
    analysis: sanitizeAnalysisForClient(analysis),
    user: withExpiryFlags(addDailyLimitFlags(sanitizeUserForClient(updatedUser))),
    progressRecord: sanitizeProgressRecordForClient(savedRecord),
    progressSummary: buildServerProgressSummary(
      (await storage.getSubmissionHistory(user.username, payload.studentProfileId, payload.taskType)).filter(isValidProgressRecord),
      savedRecord,
      payload.taskType
    )
  });
}

async function handleStoredReanalysis({ storage, user, submissionId, analysisVersions }) {
  const records = await storage.getSubmissionHistory(user.username);
  const source = records.find((record) => record.submissionId === submissionId);
  if (!source || !isValidProgressRecord(source)) {
    throw statusError("The validated source report was not found for this account.", 404, "VALIDATION_ERROR");
  }
  if (
    source.canonicalEngineVersion === analysisVersions.canonicalEngineVersion &&
    source.rubricVersion === analysisVersions.rubricVersion
  ) {
    const response = buildDuplicateAnalysisResponse({ user, record: source, duplicateByHash: true });
    response.message = "This report already uses the current engine and rubric. Opening the existing validated report.";
    response.reanalysisStatus = "same-version-existing-report";
    response.progressSummary = buildServerProgressSummary(
      records.filter((record) => record.studentProfileId === source.studentProfileId && record.taskType === source.taskType && isValidProgressRecord(record)),
      source,
      source.taskType
    );
    return jsonResponse(200, response);
  }
  if (!source.analysisInput?.prompt || !source.analysisInput?.writing) {
    throw statusError(
      "This legacy report does not contain a safe re-analysis input snapshot. Start a new analysis with the saved writing instead.",
      409,
      "REANALYSIS_INPUT_UNAVAILABLE"
    );
  }

  const payload = applyTask1ClassificationGuard(applyTask2ClassificationGuard(validateAnalyzePayload({
    ...source.analysisInput,
    clientSubmissionId: randomBytes(16).toString("hex"),
    options: {
      ...(source.analysisInput.options || {}),
      essayTypeConfirmed: true,
      visualTypeConfirmed: true
    }
  })));
  Object.assign(payload, analysisVersions, {
    ownerAccountId: user.username,
    accountRole: user.role,
    studentProfileId: source.studentProfileId,
    studentDisplayNameSnapshot: source.studentDisplayNameSnapshot,
    parentReportId: source.submissionId,
    analysisReason: "engine-upgrade",
    generatedAt: new Date().toISOString()
  });
  await assertOwnedStudentProfile(storage, user, payload);
  payload.analysisContentHash = createAnalysisContentHash(user.username, payload);
  payload.inputFingerprint = createSubmissionHash(user.username, payload);

  const existing = await storage.findSubmissionByHash?.(user.username, payload.inputFingerprint, payload.studentProfileId);
  if (existing) {
    const response = buildDuplicateAnalysisResponse({ user, record: existing, duplicateByHash: true });
    response.reanalysisStatus = "current-version-existing-report";
    return jsonResponse(200, response);
  }

  await enforceAnalysisAccess(storage, user, payload);
  let analysis;
  try {
    analysis = validateReportOutput(await analyzeWriting(payload), payload);
  } catch (error) {
    await auditAnalyze(storage, user, payload, {
      openAiCalled: true,
      quotaDeducted: false,
      duplicateCacheUsed: false,
      reason: error.errorCode || "failed-generation-retry"
    });
    throw error;
  }
  const progressRecord = buildSubmissionHistoryRecord(user.username, payload, analysis, payload.inputFingerprint);
  const savedRecord = await storage.appendSubmission(progressRecord);
  const updatedUser = savedRecord === progressRecord
    ? await storage.incrementUsage(user.username)
    : await storage.getUserByUsername(user.username);
  await auditAnalyze(storage, updatedUser || user, payload, {
    openAiCalled: true,
    quotaDeducted: savedRecord === progressRecord && isLimitedUser(updatedUser || user),
    duplicateCacheUsed: savedRecord !== progressRecord,
    reason: "engine-upgrade"
  });
  const studentRecords = (await storage.getSubmissionHistory(user.username, source.studentProfileId, source.taskType)).filter(isValidProgressRecord);
  return jsonResponse(200, {
    ok: true,
    duplicateSubmission: savedRecord !== progressRecord,
    reanalysisStatus: savedRecord === progressRecord ? "engine-upgrade-created" : "current-version-existing-report",
    analysis: sanitizeAnalysisForClient(savedRecord.report || savedRecord.analysis),
    user: withExpiryFlags(addDailyLimitFlags(sanitizeUserForClient(updatedUser || user))),
    progressRecord: sanitizeProgressRecordForClient(savedRecord),
    progressSummary: buildServerProgressSummary(studentRecords, savedRecord, source.taskType)
  });
}

async function handleAnalyzeStatus(request, storage, jobStore, jobId) {
  const session = await requireSession(request, storage);
  const job = await jobStore.get(jobId);
  if (!job || job.username !== session.user.username) {
    throw statusError("Analysis job was not found. Please submit again.", 404, "VALIDATION_ERROR");
  }

  if (job.status === "complete") {
    return jsonResponse(200, {
      ok: true,
      status: "complete",
      analysis: sanitizeAnalysisForClient(job.analysis),
      user: job.user,
      progressRecord: sanitizeProgressRecordForClient(job.progressRecord),
      progressSummary: job.progressSummary || null,
      duplicateSubmission: Boolean(job.duplicateSubmission),
      message: job.message || ""
    });
  }

  if (job.status === "failed") {
    return jsonResponse(200, {
      ok: false,
      status: "failed",
      errorCode: job.errorCode || "PROVIDER_ERROR",
      error: job.message || GENERIC_ANALYSIS_ERROR,
      debugHint: job.debugHint || ""
    });
  }

  return jsonResponse(200, {
    ok: true,
    status: job.status || "queued",
    startedAt: job.startedAt || null,
    updatedAt: job.updatedAt || job.createdAt || null
  });
}

export async function processAnalyzeJob({ jobId, rootDir = process.cwd() }) {
  loadEnvFile(rootDir);
  const storage = createStorage({ rootDir });
  const jobStore = createAnalysisJobStore({ rootDir });
  const job = await jobStore.get(jobId);
  if (!job) throw statusError("Analysis job was not found.", 404, "VALIDATION_ERROR");
  if (job.status === "complete" || job.status === "running") return job;

  await jobStore.set(jobId, {
    ...job,
    status: "running",
    startedAt: job.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  try {
    const user = await storage.getUserByUsername(job.username);
    if (!user || user.status !== "active") {
      throw statusError("Please log in to use the diagnostic lab.", 401, "NOT_AUTHENTICATED");
    }
    applyTask1ClassificationGuard(applyTask2ClassificationGuard(job.payload || {}));
    await assertOwnedStudentProfile(storage, user, job.payload || {});

    const submissionHash = job.payload?.submissionHash || createSubmissionHash(user.username, job.payload || {});
    const existingRecord = job.payload?.clientSubmissionId
      ? await storage.findSubmissionByKey(user.username, job.payload.clientSubmissionId, job.payload.studentProfileId)
      : null;
    const duplicateRecord = existingRecord || await storage.findSubmissionByHash?.(user.username, submissionHash, job.payload.studentProfileId);

    if (duplicateRecord) {
      const latestUser = await storage.getUserByUsername(user.username);
      const duplicatePayload = buildDuplicateAnalysisResponse({
        user: latestUser || user,
        record: duplicateRecord,
        duplicateByHash: duplicateRecord.submissionHash === submissionHash && duplicateRecord.clientSubmissionId !== job.payload?.clientSubmissionId
      });
      duplicatePayload.progressSummary = buildServerProgressSummary(
        (await storage.getSubmissionHistory(user.username, job.payload.studentProfileId, job.payload.taskType)).filter(isValidProgressRecord),
        duplicateRecord,
        job.payload.taskType
      );
      await auditAnalyze(storage, latestUser || user, job.payload || {}, {
        openAiCalled: false,
        quotaDeducted: false,
        duplicateCacheUsed: true
      });
      const completeJob = {
        ...job,
        status: "complete",
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        analysis: duplicatePayload.analysis,
        user: duplicatePayload.user,
        progressRecord: duplicatePayload.progressRecord,
        progressSummary: duplicatePayload.progressSummary,
        duplicateSubmission: duplicatePayload.duplicateSubmission,
        message: duplicatePayload.message
      };
      await jobStore.set(jobId, completeJob);
      return completeJob;
    }

    await enforceAnalysisAccess(storage, user, job.payload || {});

    let analysis;
    try {
      analysis = validateReportOutput(await analyzeWriting(job.payload), job.payload);
    } catch (error) {
      await auditAnalyze(storage, user, job.payload || {}, {
        openAiCalled: true,
        quotaDeducted: false,
        duplicateCacheUsed: false,
        reason: error.errorCode || "analysis-failed"
      });
      throw error;
    }
    const progressRecord = buildSubmissionHistoryRecord(user.username, job.payload, analysis, submissionHash);
    const savedRecord = await storage.appendSubmission(progressRecord);
    const updatedUser = savedRecord === progressRecord
      ? await storage.incrementUsage(user.username)
      : await storage.getUserByUsername(user.username);
    await auditAnalyze(storage, updatedUser || user, job.payload || {}, {
      openAiCalled: true,
      quotaDeducted: savedRecord === progressRecord && isLimitedUser(updatedUser || user),
      duplicateCacheUsed: savedRecord !== progressRecord
    });

    const completeJob = {
      ...job,
      status: "complete",
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      analysis: savedRecord.report || savedRecord.analysis,
      user: withExpiryFlags(addDailyLimitFlags(sanitizeUserForClient(updatedUser || user))),
      progressRecord: savedRecord,
      progressSummary: buildServerProgressSummary(
        (await storage.getSubmissionHistory(user.username, job.payload.studentProfileId, job.payload.taskType)).filter(isValidProgressRecord),
        savedRecord,
        job.payload.taskType
      ),
      duplicateSubmission: savedRecord !== progressRecord
    };
    await jobStore.set(jobId, completeJob);
    return completeJob;
  } catch (error) {
    const normalized = normalizeError(error);
    const failedJob = {
      ...job,
      status: "failed",
      failedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      errorCode: normalized.payload.errorCode || "PROVIDER_ERROR",
      message: normalized.payload.error || GENERIC_ANALYSIS_ERROR,
      debugHint: normalized.payload.debugHint || error.debugHint || ""
    };
    await jobStore.set(jobId, failedJob);
    return failedJob;
  }
}

async function handleDebugAnalyzeHealth(request, storage) {
  const adminSecret = getHeader(request.headers, "x-admin-secret") || bearerToken(getHeader(request.headers, "authorization"));
  const isNonProduction = process.env.NODE_ENV !== "production";
  const canAccess = isNonProduction || (process.env.ADMIN_SECRET && adminSecret === process.env.ADMIN_SECRET);

  if (!canAccess) {
    throw statusError("Admin access is required.", 403, "NOT_AUTHENTICATED");
  }

  const analyzerHealth = getAnalyzerHealth();
  let providerCheck = {
    ran: false,
    ok: false,
    reason: analyzerHealth.diagnosticEngineConfigured && analyzerHealth.modelConfigured
      ? "Provider check was not run."
      : "Set OPENAI_API_KEY and OPENAI_MODEL before running a provider check."
  };

  if (analyzerHealth.diagnosticEngineConfigured && analyzerHealth.modelConfigured) {
    try {
      providerCheck = await runProviderHealthCheck();
    } catch (error) {
      providerCheck = {
        ran: true,
        ok: false,
        errorCode: error.errorCode || "PROVIDER_ERROR",
        providerStatus: error.providerStatus || null,
        debugHint: error.debugHint || "Provider health check failed."
      };
    }
  }

  return jsonResponse(200, {
    ok: true,
    apiConnected: true,
    analyzer: analyzerHealth,
    storageMode: storage.name,
    storageRuntime: storage.runtime || "node",
    durableStorage: Boolean(storage.isDurable),
    providerCheck
  });
}

async function maybeHandleAdminRoute(method, apiPath, request, storage) {
  if (!apiPath.startsWith("/api/admin/")) return null;
  await requireAdmin(request, storage);

  if (method === "GET" && apiPath === "/api/admin/users") {
    const users = await storage.listUsers();
    return jsonResponse(200, { ok: true, users: users.map(sanitizeUserForAdmin) });
  }

  if (method === "GET" && apiPath === "/api/admin/usage-summary") {
    const summary = typeof storage.getAuditSummary === "function"
      ? await storage.getAuditSummary()
      : [];
    return jsonResponse(200, { ok: true, summary });
  }

  if (method === "POST" && apiPath === "/api/admin/users") {
    const body = readJsonBody(request);
    const prepared = prepareAdminUserInput(body);
    const user = await storage.createUser(prepared.user);
    return jsonResponse(201, {
      ok: true,
      user: sanitizeUserForAdmin(user),
      generatedPassword: prepared.generatedPassword
    });
  }

  const userMatch = apiPath.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (method === "PATCH" && userMatch) {
    const username = decodeURIComponent(userMatch[1]);
    const body = readJsonBody(request);
    const user = await storage.updateUser(username, sanitizeAdminUserPatch(body));
    return jsonResponse(200, { ok: true, user: sanitizeUserForAdmin(user) });
  }

  const resetMatch = apiPath.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/);
  if (method === "POST" && resetMatch) {
    const username = decodeURIComponent(resetMatch[1]);
    const generatedPassword = generatePassword();
    const user = await storage.updateUser(username, {
      password: "",
      passwordHash: hashPassword(generatedPassword)
    });
    return jsonResponse(200, {
      ok: true,
      user: sanitizeUserForAdmin(user),
      generatedPassword
    });
  }

  const statusMatch = apiPath.match(/^\/api\/admin\/users\/([^/]+)\/(disable|enable)$/);
  if (method === "POST" && statusMatch) {
    const username = decodeURIComponent(statusMatch[1]);
    const user = statusMatch[2] === "disable"
      ? await storage.disableUser(username)
      : await storage.enableUser(username);
    return jsonResponse(200, { ok: true, user: sanitizeUserForAdmin(user) });
  }

  return jsonResponse(404, { ok: false, error: "API route not found." });
}

async function requireAdmin(request, storage) {
  const session = await getSessionUser(request, storage);
  if (session?.user?.role === "admin") return;

  throw statusError("Admin access is required.", 403, "NOT_AUTHENTICATED");
}

async function requireSession(request, storage) {
  const session = await getSessionUser(request, storage);
  if (!session) {
    throw statusError("Please log in to use the diagnostic lab.", 401, "NOT_AUTHENTICATED");
  }
  return session;
}

async function getSessionUser(request, storage) {
  const token = getSessionToken(request);
  const session = verifySessionToken(token);
  if (!session) return null;

  const user = await storage.getUserByUsername(session.username);
  if (!user || user.status !== "active") return null;

  return { user };
}

function getSessionToken(request) {
  const cookieHeader = getHeader(request.headers, "cookie");
  const cookies = parseCookies(cookieHeader || "");
  return cookies[SESSION_COOKIE] || "";
}

function parseCookies(header) {
  return Object.fromEntries(String(header).split(";").map((part) => {
    const [key, ...valueParts] = part.trim().split("=");
    return [key, decodeURIComponent(valueParts.join("=") || "")];
  }).filter(([key]) => key));
}

function createSessionToken(username) {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = base64UrlEncode(JSON.stringify({ username, expiresAt }));
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || !verifySignature(payload, signature)) return null;

  try {
    const session = JSON.parse(base64UrlDecode(payload));
    if (!session.username || Date.now() > Number(session.expiresAt || 0)) return null;
    return session;
  } catch {
    return null;
  }
}

function sign(value) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function verifySignature(payload, signature) {
  const expected = sign(payload);
  const expectedBytes = Buffer.from(expected);
  const signatureBytes = Buffer.from(signature);
  return expectedBytes.length === signatureBytes.length && timingSafeEqual(expectedBytes, signatureBytes);
}

function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.OPENAI_API_KEY || "change-this-session-secret";
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function buildSessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}${secureCookieSuffix()}`;
}

function secureCookieSuffix() {
  return process.env.NODE_ENV === "production" || process.env.NETLIFY ? "; Secure" : "";
}

function verifyUserPassword(user, password) {
  if (!password) return false;
  if (user.passwordHash && verifyPasswordHash(password, user.passwordHash)) return true;
  return Boolean(user.password && user.password === password);
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(String(password), salt, 64).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

function verifyPasswordHash(password, passwordHash) {
  const [scheme, salt, expected] = String(passwordHash || "").split(":");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const actual = Buffer.from(scryptSync(String(password), salt, 64).toString("base64url"));
  const expectedBytes = Buffer.from(expected);
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}

function generatePassword(length = 12) {
  const size = Math.max(10, Number(length) || 12);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const bytes = randomBytes(size);
    let value = "";
    for (const byte of bytes) {
      value += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
    }
    if (/[A-Za-z]/.test(value) && /\d/.test(value)) return value;
  }
  return `${generatePassword(size - 2)}7A`;
}

function prepareAdminUserInput(body = {}) {
  const generatedPassword = String(body.password || "").trim() || generatePassword();
  if (generatedPassword.length < 10 || !/[A-Za-z]/.test(generatedPassword) || !/\d/.test(generatedPassword)) {
    throw statusError("Password must be at least 10 characters and include letters and numbers.", 400, "VALIDATION_ERROR");
  }
  const role = normalizeRoleValue(body.role);
  const quotaMode = normalizeQuotaModeValue(body.quotaMode || (["teacher", "admin"].includes(role) ? "unlimited" : "limited"));
  const expiryDate = String(body.expiresAt || body.expiryDate || defaultExpiryDate()).slice(0, 10);

  return {
    generatedPassword,
    user: {
      username: normalizeUsername(body.username),
      displayName: String(body.displayName || body.studentName || body.username || "").trim(),
      plan: String(body.plan || (quotaMode === "unlimited" ? "Internal Use" : "Early Access")),
      role,
      quotaMode,
      quotaLimit: Number(body.quotaLimit ?? body.totalQuota ?? body.quota ?? (quotaMode === "unlimited" ? 0 : 10)),
      quotaUsed: 0,
      expiryDate: quotaMode === "unlimited" ? String(body.expiresAt || body.expiryDate || "") : expiryDate,
      status: normalizeStatusValue(body.status),
      password: "",
      passwordHash: hashPassword(generatedPassword),
      createdAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString(),
      dailyUsage: {}
    }
  };
}

function sanitizeAdminUserPatch(body = {}) {
  const patch = {};
  if ("displayName" in body || "studentName" in body) patch.displayName = String(body.displayName || body.studentName || "").trim();
  if ("plan" in body) patch.plan = String(body.plan || "");
  if ("role" in body) patch.role = normalizeRoleValue(body.role);
  if ("quotaMode" in body) patch.quotaMode = normalizeQuotaModeValue(body.quotaMode);
  if ("quotaLimit" in body || "totalQuota" in body || "quota" in body) {
    patch.quotaLimit = Math.max(0, Number(body.quotaLimit ?? body.totalQuota ?? body.quota ?? 0) || 0);
  }
  if ("quotaUsed" in body || "usedQuota" in body || "used" in body) {
    patch.quotaUsed = Math.max(0, Number(body.quotaUsed ?? body.usedQuota ?? body.used ?? 0) || 0);
  }
  if ("expiryDate" in body || "expiresAt" in body) patch.expiryDate = String(body.expiresAt || body.expiryDate || "").slice(0, 10);
  if ("status" in body) patch.status = normalizeStatusValue(body.status);
  return patch;
}

function normalizeUsername(value) {
  const username = String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  if (!username || username.length < 3) {
    throw statusError("Username must contain at least 3 letters or numbers.", 400, "VALIDATION_ERROR");
  }
  return username;
}

function normalizeRoleValue(value) {
  const role = String(value || "student").toLowerCase();
  return ["teacher", "admin"].includes(role) ? role : "student";
}

function normalizeQuotaModeValue(value) {
  return String(value || "limited").toLowerCase() === "unlimited" ? "unlimited" : "limited";
}

function normalizeStatusValue(value) {
  return String(value || "active").toLowerCase() === "inactive" || String(value || "").toLowerCase() === "disabled"
    ? "inactive"
    : "active";
}

function defaultExpiryDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 60);
  return date.toISOString().slice(0, 10);
}

function shouldUseAsyncAnalysis() {
  if (process.env.DIAGNOSTIC_ANALYSIS_MODE === "sync") return false;
  if (process.env.DIAGNOSTIC_ANALYSIS_MODE === "async") {
    return process.env.DIAGNOSTIC_ENABLE_NETLIFY_BLOBS === "true";
  }
  return false;
}

function createJobId() {
  return `job-${Date.now().toString(36)}-${randomBytes(8).toString("hex")}`;
}

async function invokeAnalyzeWorker(request, jobId) {
  const endpoint = `${requestBaseUrl(request)}/.netlify/functions/analyze-worker-background`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-worker-token": createWorkerToken(jobId)
    },
    body: JSON.stringify({ jobId })
  });

  if (![200, 202].includes(response.status)) {
    throw statusError(
      "Analysis could not be started. Please try again or contact Kru Pom IELTS.",
      502,
      "PROVIDER_ERROR",
      `Background worker invocation returned ${response.status}.`
    );
  }
}

function requestBaseUrl(request) {
  const host = getHeader(request.headers, "host");
  const protocol = getHeader(request.headers, "x-forwarded-proto") || "https";
  if (host) return `${protocol}://${host}`;
  return process.env.URL || process.env.DEPLOY_URL || "http://127.0.0.1:4174";
}

function createWorkerToken(jobId) {
  const payload = `analysis-worker:${jobId}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyWorkerToken(jobId, token) {
  const [payload, signature] = String(token || "").split(".");
  return payload === `analysis-worker:${jobId}` && Boolean(signature) && verifySignature(payload, signature);
}

function readJsonBody(request) {
  const raw = request.body || "";
  const text = request.isBase64Encoded
    ? Buffer.from(raw, "base64").toString("utf8")
    : String(raw);

  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) {
    throw statusError("Submission is too large. Keep Task 1 images under 5 MB.", 413, "PAYLOAD_TOO_LARGE");
  }

  try {
    return JSON.parse(text || "{}");
  } catch {
    throw statusError("Invalid JSON payload.", 400, "VALIDATION_ERROR");
  }
}

function validateAnalyzePayload(body) {
  const taskType = body.taskType === "Task 1" ? "Task 1" : "Task 2";
  const prompt = String(body.prompt || "").trim();
  const writing = String(body.writing || "").trim();
  const wordCountMetadata = getWordCountMetadata(taskType, writing);

  if (!prompt || !writing) {
    throw statusError("Please provide both the prompt and student writing.", 400, "VALIDATION_ERROR");
  }

  if (prompt.length < 10) {
    throw statusError("Please paste the full IELTS question or visual description before analyzing.", 400, "VALIDATION_ERROR");
  }

  const essayType = normalizeTask2PublicEssayType(body.essayType);
  const visualType = normalizeTask1PublicVisualType(body.visualType);

  if (taskType === "Task 1" && !TASK1_VISUAL_TYPES.has(visualType)) {
    throw statusError("Please choose a valid Task 1 visual type.", 400, "VALIDATION_ERROR");
  }

  if (taskType === "Task 2" && !TASK2_ESSAY_TYPES.has(essayType)) {
    throw statusError("Please choose a valid Task 2 essay type.", 400, "VALIDATION_ERROR");
  }

  const payload = {
    taskType,
    prompt,
    writing,
    targetBand: String(body.targetBand || "7.0"),
    essayType,
    visualType,
    studentProfileToken: String(body.studentProfileToken || "").trim(),
    clientSubmissionId: normalizeIdempotencyKey(body.clientSubmissionId || body.idempotencyKey),
    options: body.options || {},
    image: null,
    ...wordCountMetadata
  };

  if (taskType === "Task 1" && body.image) {
    const image = body.image;
    const mimeType = String(image.mimeType || "");
    const size = Number(image.size || 0);
    const dataUrl = String(image.dataUrl || "");

    if (!mimeType.startsWith("image/")) {
      throw statusError("Task 1 upload must be an image file.", 400, "VALIDATION_ERROR");
    }

    if (size > 5 * 1024 * 1024 || dataUrl.length > 7 * 1024 * 1024) {
      throw statusError("Task 1 image must be 5 MB or smaller.", 413, "PAYLOAD_TOO_LARGE");
    }

    payload.image = {
      name: String(image.name || "task1-image"),
      mimeType,
      size,
      dataUrl
    };
  }

  return payload;
}

function normalizeIdempotencyKey(value) {
  const key = String(value || "").trim();
  return key || randomBytes(16).toString("hex");
}

export function applyTask2ClassificationGuard(payload = {}) {
  if (payload.taskType !== "Task 2") return payload;
  const selectedLabel = String(payload.selectedEssayTypeLabel || payload.essayType || "").trim();
  const classification = classifyTask2Prompt({ ...payload, essayType: selectedLabel });
  Object.assign(payload, {
    selectedEssayType: classification.selectedEssayType || "",
    selectedEssayTypeLabel: classification.selectedEssayTypeLabel || selectedLabel,
    canonicalEssayType: classification.essayType,
    canonicalEssayTypeLabel: classification.publicEssayType,
    publicEssayType: classification.publicEssayType,
    internalEssaySubtype: classification.internalEssaySubtype,
    internalTaskObligations: classification.internalObligations,
    promptClassificationConfidence: classification.confidence,
    classificationMatch: classification.classificationMatch
  });

  if (classification.confidence === "high" && !classification.classificationMatch) {
    const error = statusError(
      `The selected essay type (${payload.selectedEssayTypeLabel}) does not match the prompt, which is classified as ${classification.publicEssayType}. Please correct the essay type before analysis.`,
      409,
      "ESSAY_TYPE_MISMATCH"
    );
    Object.assign(error, {
      selectedEssayType: payload.selectedEssayTypeLabel,
      detectedEssayType: classification.publicEssayType,
      promptClassificationConfidence: classification.confidence,
      classificationMatch: false
    });
    throw error;
  }

  if (classification.confidence === "low" || (classification.autoSelected && classification.confidence === "medium")) {
    const confirmed = payload.options?.essayTypeConfirmed === true || payload.options?.classificationConfirmed === true;
    if (!confirmed) {
      const unresolved = classification.publicEssayType === "Not Sure / Auto-detect";
      const error = statusError(
        unresolved
          ? "The prompt type could not be classified reliably. Please choose the Task 2 essay type before analysis."
          : `The prompt type needs confirmation. Please confirm ${classification.publicEssayType} before analysis.`,
        409,
        "ESSAY_TYPE_CONFIRMATION_REQUIRED"
      );
      Object.assign(error, {
        selectedEssayType: payload.selectedEssayTypeLabel,
        detectedEssayType: classification.publicEssayType,
        promptClassificationConfidence: classification.confidence,
        classificationMatch: classification.classificationMatch
      });
      throw error;
    }
    payload.classificationConfirmation = {
      confirmed: true,
      confirmedEssayType: classification.essayType,
      confirmedEssayTypeLabel: classification.publicEssayType,
      confirmedAt: new Date().toISOString()
    };
  }

  payload.essayType = classification.publicEssayType;
  return payload;
}

export function applyTask1ClassificationGuard(payload = {}) {
  if (payload.taskType !== "Task 1") return payload;
  const classification = classifyTask1Visual(payload);
  Object.assign(payload, {
    selectedVisualType: classification.selectedPublicVisualType,
    publicVisualType: classification.publicVisualType,
    internalVisualSubtype: classification.internalVisualSubtype,
    visualClassificationConfidence: classification.confidence,
    visualClassificationEvidence: classification.evidence,
    visualClassificationMatch: classification.classificationMatch
  });

  if (classification.confidence === "high" && !classification.classificationMatch) {
    const error = statusError(
      `The selected visual type (${classification.selectedPublicVisualType}) does not match the prompt, which is classified as ${classification.publicVisualType}. Please correct the visual type before analysis.`,
      409,
      "VISUAL_TYPE_MISMATCH"
    );
    Object.assign(error, {
      selectedVisualType: classification.selectedPublicVisualType,
      detectedVisualType: classification.publicVisualType,
      internalVisualSubtype: classification.internalVisualSubtype,
      visualClassificationConfidence: classification.confidence,
      classificationMatch: false
    });
    throw error;
  }

  if (classification.requiresConfirmation) {
    const confirmed = payload.options?.visualTypeConfirmed === true || payload.options?.classificationConfirmed === true;
    if (!confirmed) {
      const unresolved = !classification.publicVisualType;
      const error = statusError(
        unresolved
          ? "The visual type could not be classified reliably. Please choose the Task 1 visual type before analysis."
          : `The visual type needs confirmation. Please confirm ${classification.publicVisualType} before analysis.`,
        409,
        "VISUAL_TYPE_CONFIRMATION_REQUIRED"
      );
      Object.assign(error, {
        selectedVisualType: classification.selectedPublicVisualType,
        detectedVisualType: classification.publicVisualType,
        internalVisualSubtype: classification.internalVisualSubtype,
        visualClassificationConfidence: classification.confidence,
        classificationMatch: classification.classificationMatch
      });
      throw error;
    }
  }

  if (!classification.publicVisualType) {
    throw statusError("Please choose the Task 1 visual type before analysis.", 400, "VALIDATION_ERROR");
  }
  payload.publicVisualType = classification.publicVisualType;
  payload.visualType = task1DiagnosticVisualType(classification);
  return payload;
}

function isValidProgressRecord(record = {}) {
  return String(record.analysisValidity || "valid").toLowerCase() !== "invalid";
}

function stableProgressSort(records = []) {
  return [...records].sort((a, b) => {
    const timeDelta = new Date(a.dateTime || 0).getTime() - new Date(b.dateTime || 0).getTime();
    return timeDelta || String(a.submissionId || "").localeCompare(String(b.submissionId || ""));
  });
}

function buildServerProgressSummary(records = [], currentRecord = null, taskType = "") {
  const valid = stableProgressSort(records.filter((record) =>
    isValidProgressRecord(record) && (!taskType || record.taskType === taskType)
  ));
  const current = currentRecord && isValidProgressRecord(currentRecord)
    ? currentRecord
    : valid.at(-1) || null;
  if (!current) {
    return {
      taskType: taskType || "",
      previousSubmissionCount: 0,
      previousEstimatedRange: "",
      latestEstimatedRange: "",
      currentMainRepair: "",
      repeatedIssue: "",
      reportCount: 0,
      change: ""
    };
  }
  const currentIndex = valid.findIndex((record) => record.submissionId === current.submissionId);
  const previous = currentIndex >= 0 ? valid.slice(0, currentIndex) : valid.filter((record) => record.submissionId !== current.submissionId);
  const previousLatest = previous.at(-1) || null;
  const issueCounts = new Map();
  for (const record of valid) {
    const unique = new Map((record.top3Issues || [])
      .map((issue) => String(issue.issueType || issue.title || issue).trim())
      .filter(Boolean)
      .map((label) => [label.toLowerCase(), label]));
    for (const [key, label] of unique) {
      const existing = issueCounts.get(key) || { label, count: 0 };
      issueCounts.set(key, { label: existing.label, count: existing.count + 1 });
    }
  }
  const repeatedIssue = [...issueCounts.values()]
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))[0]?.label || "";
  const previousMid = bandRangeMidpoint(previousLatest?.estimatedBandRange);
  const currentMid = bandRangeMidpoint(current.estimatedBandRange);
  const change = previousMid === null || currentMid === null
    ? ""
    : currentMid > previousMid ? `Improved by ${(currentMid - previousMid).toFixed(1)}`
      : currentMid < previousMid ? `Lower by ${(previousMid - currentMid).toFixed(1)}`
        : "No band-range change";
  return {
    taskType: current.taskType || taskType,
    currentSubmissionId: current.submissionId,
    previousSubmissionCount: previous.length,
    previousEstimatedRange: previousLatest?.estimatedBandRange || "",
    latestEstimatedRange: current.estimatedBandRange || "",
    currentMainRepair: current.mostUrgentRepair || current.mainScoreLimitingFactor || "",
    repeatedIssue,
    reportCount: valid.length,
    change
  };
}

function bandRangeMidpoint(value) {
  const parsed = parseBandRange(value);
  return Number.isFinite(parsed.min) && Number.isFinite(parsed.max) ? (parsed.min + parsed.max) / 2 : null;
}

function buildSubmissionHistoryRecord(username, payload, analysis, submissionHash = "") {
  analysis = analysis?.canonicalAnalysis
    ? projectCanonicalAnalysis(analysis.canonicalAnalysis, analysis)
    : analysis;
  const estimatedBandRange = String(analysis.estimatedBandRange || "").trim();
  const parsedRange = parseBandRange(estimatedBandRange);
  const criteriaScores = analysis.criteriaScores || {};
  const taskResponseOrAchievementRange =
    getCriteriaRange(criteriaScores, "Task Response") ||
    getCriteriaRange(criteriaScores, "Task Achievement");

  return {
    submissionId: randomBytes(12).toString("hex"),
    clientSubmissionId: payload.clientSubmissionId,
    submissionHash: submissionHash || createSubmissionHash(username, payload),
    inputFingerprint: submissionHash || createSubmissionHash(username, payload),
    analysisContentHash: payload.analysisContentHash || createAnalysisContentHash(username, payload),
    username,
    ownerAccountId: username,
    studentProfileId: payload.studentProfileId,
    studentDisplayNameSnapshot: payload.studentDisplayNameSnapshot,
    dateTime: new Date().toISOString(),
    taskType: payload.taskType,
    taskSubtype: payload.taskType === "Task 2" ? (payload.publicEssayType || payload.essayType) : (payload.publicVisualType || payload.visualType),
    essayType: payload.taskType === "Task 2" ? (payload.publicEssayType || payload.canonicalEssayTypeLabel || payload.essayType) : "",
    selectedEssayType: payload.taskType === "Task 2" ? (payload.selectedEssayTypeLabel || payload.essayType) : "",
    canonicalEssayType: payload.taskType === "Task 2" ? (payload.canonicalEssayType || "") : "",
    canonicalEssayTypeLabel: payload.taskType === "Task 2" ? (payload.canonicalEssayTypeLabel || payload.essayType) : "",
    internalEssaySubtype: payload.taskType === "Task 2" ? (payload.internalEssaySubtype || payload.canonicalEssayType || "") : "",
    internalTaskObligations: payload.taskType === "Task 2" ? (payload.internalTaskObligations || []) : [],
    promptClassificationConfidence: payload.taskType === "Task 2" ? (payload.promptClassificationConfidence || "") : "",
    classificationMatch: payload.taskType === "Task 2" ? Boolean(payload.classificationMatch) : true,
    classificationConfirmation: payload.taskType === "Task 2" ? (payload.classificationConfirmation || null) : null,
    analysisValidity: "valid",
    visualType: payload.taskType === "Task 1" ? (payload.publicVisualType || payload.visualType) : "",
    internalVisualSubtype: payload.taskType === "Task 1" ? (payload.internalVisualSubtype || "") : "",
    visualClassificationConfidence: payload.taskType === "Task 1" ? (payload.visualClassificationConfidence || "") : "",
    canonicalEngineVersion: String(payload.canonicalEngineVersion || ""),
    rubricVersion: String(payload.rubricVersion || ""),
    promptVersion: String(payload.promptVersion || ""),
    reportSchemaVersion: String(payload.reportSchemaVersion || ""),
    generatedAt: String(analysis.generatedAt || payload.generatedAt || new Date().toISOString()),
    parentReportId: String(payload.parentReportId || ""),
    analysisReason: String(payload.analysisReason || "first-analysis"),
    wordCount: payload.wordCount,
    minimumWordCount: payload.minimumWordCount,
    wordCountStatus: payload.wordCountStatus,
    wordShortfall: payload.wordShortfall,
    promptPreview: buildPromptPreview(payload.prompt),
    shortPromptPreview: buildPromptPreview(payload.prompt),
    estimatedBandRange,
    bandRangeMin: parsedRange.min,
    bandRangeMax: parsedRange.max,
    criteriaScores,
    kruPomScores: analysis.kruPomScores || {},
    mainScoreLimitingFactor: analysis.mainScoreLimitingFactor || "",
    mostUrgentRepair: analysis.mostUrgentRepair || "",
    top3Issues: Array.isArray(analysis.top3Issues) ? analysis.top3Issues.slice(0, 3) : [],
    feedbackCards: Array.isArray(analysis.feedbackCards) ? analysis.feedbackCards : [],
    practicePlan: Array.isArray(analysis.practicePlan) ? analysis.practicePlan : [],
    taskResponseOrAchievementRange,
    coherenceRange: getCriteriaRange(criteriaScores, "Coherence & Cohesion"),
    lexicalRange: getCriteriaRange(criteriaScores, "Lexical Resource"),
    grammarRange: getCriteriaRange(criteriaScores, "Grammatical Range & Accuracy"),
    analysisInput: {
      taskType: payload.taskType,
      prompt: payload.prompt,
      writing: payload.writing,
      targetBand: payload.targetBand,
      essayType: payload.publicEssayType || payload.essayType,
      visualType: payload.publicVisualType || payload.visualType,
      options: normalizeHashOptions(payload.options),
      image: payload.taskType === "Task 1" ? payload.image : null
    },
    report: analysis
  };
}

function buildDuplicateAnalysisResponse({ user, record, duplicateByHash }) {
  const message = duplicateByHash
    ? "This exact submission has already been analysed. Opening the existing validated report."
    : "This analysis request was already processed. Opening the existing validated report.";

  return {
    ok: true,
    idempotentReplay: true,
    duplicateSubmission: Boolean(duplicateByHash),
    existingReportAvailable: true,
    availableActions: ["Open Existing Report", "Re-analyze with Current Engine"],
    message,
    analysis: sanitizeAnalysisForClient(record.report || record.analysis),
    user: withExpiryFlags(addDailyLimitFlags(sanitizeUserForClient(user))),
    progressRecord: sanitizeProgressRecordForClient(record)
  };
}

export function createAnalysisContentHash(username, payload = {}) {
  return createHash("sha256").update(JSON.stringify(buildFingerprintInput(username, payload, false))).digest("hex");
}

export function createSubmissionHash(username, payload = {}) {
  return createHash("sha256").update(JSON.stringify(buildFingerprintInput(username, payload, true))).digest("hex");
}

function buildFingerprintInput(username, payload, includeVersions) {
  const publicType = payload.taskType === "Task 1"
    ? (payload.publicVisualType || normalizeTask1PublicVisualType(payload.visualType))
    : (payload.publicEssayType || normalizeTask2PublicEssayType(payload.essayType));
  const internalSubtype = payload.taskType === "Task 1"
    ? payload.internalVisualSubtype
    : payload.internalEssaySubtype;
  const input = {
    ownerAccountId: normalizeHashText(payload.ownerAccountId || username).toLowerCase(),
    studentProfileId: normalizeHashText(payload.studentProfileId),
    taskType: normalizeHashText(payload.taskType),
    publicType: normalizeHashText(publicType).toLowerCase(),
    internalSubtype: normalizeHashText(internalSubtype).toLowerCase(),
    internalObligations: [...new Set((payload.internalTaskObligations || []).map(normalizeHashText).filter(Boolean))].sort(),
    prompt: normalizeHashText(payload.prompt),
    writing: normalizeHashText(payload.writing),
    targetBand: normalizeHashText(payload.targetBand),
    options: normalizeHashOptions({
      usedTemplate: Boolean(payload.options?.usedTemplate),
      strictFeedback: Boolean(payload.options?.strictFeedback),
      patternRisk: Boolean(payload.options?.patternRisk)
    }),
    image: payload.taskType === "Task 1" ? createImageFingerprint(payload.image) : ""
  };
  if (includeVersions) {
    input.canonicalEngineVersion = normalizeHashText(payload.canonicalEngineVersion);
    input.rubricVersion = normalizeHashText(payload.rubricVersion);
  }
  return input;
}

function createImageFingerprint(image) {
  if (!image?.dataUrl) return "";
  const imageInput = {
    mimeType: normalizeHashText(image.mimeType).toLowerCase(),
    dataHash: createHash("sha256").update(String(image.dataUrl || "")).digest("hex")
  };
  return createHash("sha256").update(JSON.stringify(imageInput)).digest("hex");
}

function normalizeHashText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHashOptions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalizeHashOptionValue(value[key])])
  );
}

function normalizeHashOptionValue(value) {
  if (Array.isArray(value)) return value.map(normalizeHashOptionValue);
  if (value && typeof value === "object") return normalizeHashOptions(value);
  if (typeof value === "string") return normalizeHashText(value);
  if (typeof value === "boolean" || typeof value === "number" || value === null) return value;
  return String(value || "");
}

function buildPromptPreview(prompt) {
  const collapsed = String(prompt || "").replace(/\s+/g, " ").trim();
  return collapsed.length > 120 ? `${collapsed.slice(0, 117)}...` : collapsed;
}

function getCriteriaRange(criteriaScores, name) {
  const item = criteriaScores?.[name];
  if (!item) return "";
  if (typeof item === "string") return item;
  return String(item.range || "").trim();
}

function parseBandRange(value) {
  const normalized = String(value || "")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\s+/g, "");
  const matches = normalized.match(/\d+(?:\.\d+)?/g);

  if (!matches?.length) return { min: null, max: null };
  const numbers = matches.map(Number).filter((number) => Number.isFinite(number));
  if (!numbers.length) return { min: null, max: null };
  if (numbers.length === 1) return { min: numbers[0], max: numbers[0] };
  return { min: numbers[0], max: numbers[1] };
}

function withExpiryFlags(user) {
  const accessExpired = isAccessExpired(user);
  return {
    ...user,
    isExpired: accessExpired,
    accessExpired
  };
}

function remainingAnalyses(user) {
  if (!isLimitedUser(user)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Number(user?.quota || 0) - Number(user?.used || 0));
}

function isAccessExpired(user) {
  if (!isLimitedUser(user) && !user?.expiryDate && !user?.expiresAt) return false;
  const timestamp = getExpiryTimestamp(user?.expiresAt || user?.expiryDate);
  return Number.isFinite(timestamp) && Date.now() > timestamp;
}

async function enforceAnalysisAccess(storage, user, payload = {}) {
  if (!user || user.status !== "active") {
    await auditAnalyze(storage, user, payload, { blocked: true, reason: "inactive-or-missing-user" });
    throw statusError("Please log in to use the diagnostic lab.", 401, "NOT_AUTHENTICATED");
  }

  if (isAccessExpired(user)) {
    await auditAnalyze(storage, user, payload, { blocked: true, reason: "access-expired" });
    throw statusError(ACCESS_EXPIRED_MESSAGE, 403, "ACCESS_EXPIRED");
  }

  if (isLimitedUser(user) && remainingAnalyses(user) <= 0) {
    await auditAnalyze(storage, user, payload, { blocked: true, reason: "quota-used" });
    throw statusError(QUOTA_USED_MESSAGE, 403, "QUOTA_USED");
  }

  if (isUnlimitedInternalUser(user) && teacherDailyRemaining(user) <= 0) {
    await auditAnalyze(storage, user, payload, { blocked: true, reason: "teacher-daily-limit" });
    throw statusError(TEACHER_DAILY_LIMIT_MESSAGE, 403, "TEACHER_DAILY_LIMIT");
  }
}

function isLimitedUser(user) {
  return String(user?.quotaMode || "limited").toLowerCase() !== "unlimited";
}

function isUnlimitedInternalUser(user) {
  const role = String(user?.role || "student").toLowerCase();
  return ["teacher", "admin"].includes(role) && !isLimitedUser(user);
}

function teacherDailySafetyLimit() {
  const value = Number(process.env.TEACHER_DAILY_SAFETY_LIMIT || 50);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 50;
}

function teacherDailyUsed(user, dateKey = new Date().toISOString().slice(0, 10)) {
  return Math.max(0, Number(user?.dailyUsage?.[dateKey] || 0));
}

function teacherDailyRemaining(user) {
  if (!isUnlimitedInternalUser(user)) return null;
  return Math.max(0, teacherDailySafetyLimit() - teacherDailyUsed(user));
}

function addDailyLimitFlags(user) {
  if (!isUnlimitedInternalUser(user)) return user;
  const dailySafetyLimit = teacherDailySafetyLimit();
  const dailySafetyUsed = teacherDailyUsed(user);
  return {
    ...user,
    quota: null,
    totalQuota: null,
    remaining: null,
    remainingQuota: null,
    dailySafetyLimit,
    dailySafetyUsed,
    dailySafetyRemaining: Math.max(0, dailySafetyLimit - dailySafetyUsed)
  };
}

async function auditAnalyze(storage, user, payload = {}, details = {}) {
  if (typeof storage.appendAuditLog !== "function") return null;
  return storage.appendAuditLog({
    username: user?.username || "",
    role: user?.role || "student",
    taskType: payload.taskType || "",
    taskSubtype: payload.taskType === "Task 1" ? payload.visualType : payload.essayType,
    timestamp: new Date().toISOString(),
    openAiCalled: Boolean(details.openAiCalled),
    quotaDeducted: Boolean(details.quotaDeducted),
    duplicateCacheUsed: Boolean(details.duplicateCacheUsed),
    blocked: Boolean(details.blocked),
    reason: details.reason || ""
  }).catch(() => null);
}

function getExpiryTimestamp(expiryDate) {
  const match = String(expiryDate || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return Number.NaN;

  const [, year, month, day] = match.map(Number);
  return Date.UTC(year, month - 1, day, 16, 59, 59, 999);
}

function normalizeError(error) {
  const statusCode = Number(error?.statusCode || 500);
  const errorCode = error?.errorCode || inferErrorCode(statusCode);
  const debugHint = error?.debugHint || defaultDebugHint(errorCode, statusCode);
  const payload = {
    ok: false,
    error: safeErrorMessage(error, statusCode, errorCode),
    errorCode
  };

  if (debugHint) payload.debugHint = debugHint;
  for (const key of [
    "selectedEssayType",
    "detectedEssayType",
    "promptClassificationConfidence",
    "selectedVisualType",
    "detectedVisualType",
    "internalVisualSubtype",
    "visualClassificationConfidence",
    "classificationMatch"
  ]) {
    if (error?.[key] !== undefined) payload[key] = error[key];
  }
  return { statusCode, errorCode, payload };
}

function inferErrorCode(statusCode) {
  if (statusCode === 401) return "NOT_AUTHENTICATED";
  if (statusCode === 413) return "PAYLOAD_TOO_LARGE";
  if (statusCode === 400) return "VALIDATION_ERROR";
  return "INTERNAL_ERROR";
}

function safeErrorMessage(error, statusCode, errorCode) {
  if (statusCode < 500) return error?.message || GENERIC_ANALYSIS_ERROR;
  if (errorCode && errorCode !== "INTERNAL_ERROR") return error?.message || GENERIC_ANALYSIS_ERROR;
  return GENERIC_ANALYSIS_ERROR;
}

function defaultDebugHint(errorCode, statusCode) {
  if (statusCode < 500 && !["PAYLOAD_TOO_LARGE"].includes(errorCode)) return "";
  if (errorCode?.startsWith("PROVIDER_")) return "Check server logs for provider status, model, and response format.";
  if (errorCode === "PAYLOAD_TOO_LARGE") return "Task 1 image or JSON payload exceeded the configured size limit.";
  return "Check server logs for the internal error details.";
}

function logAnalyzeFailure(error, metadata) {
  const normalized = normalizeError(error);
  console.error("[diagnostic-lab] POST /api/analyze failed", {
    ...metadata,
    statusCode: normalized.statusCode,
    errorCode: normalized.errorCode,
    errorName: error?.name || "Error",
    errorMessage: truncate(error?.message || "", 300),
    providerStatus: error?.providerStatus || null,
    providerBodyPreview: error?.providerBodyPreview || "",
    rawOutputPreview: error?.rawOutputPreview || "",
    debugHint: error?.debugHint || normalized.payload.debugHint || "",
    retryAttempted: Boolean(error?.retryAttempted),
    firstAttemptErrorCode: error?.firstAttemptErrorCode || "",
    firstValidationDetails: Array.isArray(error?.firstValidationDetails) ? error.firstValidationDetails.slice(0, 8) : [],
    validationDetails: Array.isArray(error?.validationDetails) ? error.validationDetails.slice(0, 8) : []
  });
}

function readAnalyzeMetadata(request) {
  const raw = request?.body || "";
  const text = request?.isBase64Encoded
    ? Buffer.from(raw, "base64").toString("utf8")
    : String(raw);

  const metadata = {
    route: "POST /api/analyze",
    rawBytes: Buffer.byteLength(text, "utf8")
  };

  try {
    const body = JSON.parse(text || "{}");
    const image = body.image || null;
    return {
      ...metadata,
      taskType: String(body.taskType || ""),
      hasImage: Boolean(image?.dataUrl),
      promptLength: String(body.prompt || "").length,
      writingLength: String(body.writing || "").length,
      imageSize: Number(image?.size || 0) || 0,
      imageDataUrlLength: String(image?.dataUrl || "").length
    };
  } catch (error) {
    return {
      ...metadata,
      bodyParseError: truncate(error?.message || "Could not parse analyze body.", 160)
    };
  }
}

function truncate(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function jsonResponse(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...extraHeaders
    },
    body: JSON.stringify(payload)
  };
}

function corsHeaders() {
  if (!process.env.CORS_ORIGIN) return {};
  return {
    "access-control-allow-origin": process.env.CORS_ORIGIN,
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-admin-secret",
    "access-control-allow-credentials": "true"
  };
}

function getHeader(headers = {}, name) {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === target) return Array.isArray(value) ? value[0] : value;
  }
  return "";
}

function bearerToken(value = "") {
  const match = String(value).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function statusError(message, statusCode, errorCode = "INTERNAL_ERROR", debugHint = "") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  if (debugHint) error.debugHint = debugHint;
  return error;
}

export { API_DISCONNECTED_MESSAGE };
