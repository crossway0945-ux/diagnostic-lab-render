import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createAnalysisJobStore } from "./analysisJobStore.js";
import {
  JOB_SCHEMA_VERSION,
  isActiveJobState,
  isTerminalJobState,
  stageMessageForStatus
} from "./renderJobStore.js";
import {
  jobConfigSnapshot,
  jobLeaseMs,
  jobStaleMs,
  jobTimeoutMs,
  providerMaxAttempts
} from "./jobConfig.js";
import {
  runDuplicateIdempotencyTest,
  runJobQueueStatus,
  runStaleJobRecoveryTest
} from "./jobDiagnostics.js";
import {
  assembleQaExportFromRecord,
  buildQaSnapshot,
  createQaCanonicalStore,
  QA_EXPORT_VERSION,
  redactForQa
} from "./qaCanonicalExport.js";
import { createAnalysisFailureLog, runStorageSelfTest } from "./analysisFailureLog.js";
import {
  analyzeWriting,
  getAnalyzerHealth,
  runProductionContractCheck,
  runProviderHealthCheck,
  validateReportOutput
} from "./aiAnalyzer.js";
import { classifyTask1Visual, normalizeTask1PublicVisualType, TASK1_PUBLIC_VISUAL_TYPES } from "../domain/task1Classification.js";
import { projectCanonicalAnalysis } from "./canonicalAnalysis.js";
import { classifyTask2Prompt, normalizeTask2PublicTypeLabel, TASK2_PUBLIC_TYPES } from "./task2Safety.js";
import { ANALYSIS_VERSIONS, ORCHESTRATION_VERSION, attachAnalysisVersions } from "./analysisVersions.js";
import { getWordCountMetadata } from "../wordCount.js";
import { buildStudentReportViewModel } from "../domain/reportViewModels.js";
import {
  createStorage,
  resolveDataDir,
  sanitizeUserForAdmin,
  sanitizeUserForClient
} from "./storage.js";
import {
  ACCOUNT_STATUSES,
  checkAdminLifecycleGuard,
  checkSameOrigin,
  createAdminSecurity,
  describeLifecycleIntent,
  issueCsrfToken,
  normalizeAccountStatus,
  verifyCsrfToken
} from "./adminSecurity.js";

const MAX_JSON_BYTES = 8 * 1024 * 1024;
const SESSION_COOKIE = "ielts_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const ACCESS_EXPIRED_MESSAGE = "Your early access period has ended. Please contact Kru Pom IELTS to extend access.";
const API_DISCONNECTED_MESSAGE = "The Diagnostic Lab API is not connected yet. Please contact Kru Pom IELTS.";
const GENERIC_ANALYSIS_ERROR = "Analysis could not be completed. Please try again or contact Kru Pom IELTS.";
const QUOTA_USED_MESSAGE = "Your early access quota has been used. Please contact Kru Pom IELTS to extend access.";
const TEACHER_DAILY_LIMIT_MESSAGE = "Teacher daily safety limit reached. Please try again tomorrow or increase TEACHER_DAILY_SAFETY_LIMIT in Render environment variables.";
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

// Durable admin security state (CSRF is stateless; the audit log and session revocations are not).
// One instance per data directory, so a restart reopens the same files.
const adminSecurityByDataDir = new Map();
function adminSecurityFor(rootDir = process.cwd()) {
  const dataDir = resolveDataDir(rootDir);
  if (!adminSecurityByDataDir.has(dataDir)) adminSecurityByDataDir.set(dataDir, createAdminSecurity({ dataDir }));
  return adminSecurityByDataDir.get(dataDir);
}
// The session middleware runs outside the admin router and still needs the revocation registry.
let activeAdminSecurity = null;
function currentAdminSecurity() {
  if (!activeAdminSecurity) activeAdminSecurity = adminSecurityFor(process.cwd());
  return activeAdminSecurity;
}

const TASK1_VISUAL_TYPES = new Set(TASK1_PUBLIC_VISUAL_TYPES);
const TASK2_ESSAY_TYPES = new Set(TASK2_PUBLIC_TYPES);

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

// Cached result of the most recent REAL provider/contract check. /api/health reads this cache so it
// can report genuine connectivity without ever calling OpenAI on a public request. Populated only by
// the admin-triggered diagnostics below.
const providerCheckCache = {
  provider: { status: "unknown", at: "", model: "", errorCode: "" },
  contract: { status: "unknown", at: "", stage: "", errorCode: "" }
};

function recordProviderCheck(result) {
  providerCheckCache.provider = {
    status: result?.ok ? "connected" : "failed",
    at: new Date().toISOString(),
    model: result?.modelName || "",
    errorCode: result?.ok ? "" : (result?.errorCode || "PROVIDER_ERROR")
  };
}

function recordContractCheck(result) {
  providerCheckCache.contract = {
    status: result?.ok ? "passed" : "failed",
    at: new Date().toISOString(),
    stage: result?.stage || "",
    errorCode: result?.ok ? "" : (result?.errorCode || "")
  };
}

export function createApiHandler(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  loadEnvFile(rootDir);
  const storage = options.storage || createStorage({ rootDir });
  const jobStore = options.jobStore || createAnalysisJobStore({ rootDir });
  const failureLog = options.failureLog || createAnalysisFailureLog({ rootDir });
  // Bind the durable admin-security state to this handler's data directory so session revocation and
  // the audit log survive a restart and are visible to the session middleware.
  activeAdminSecurity = adminSecurityFor(rootDir);

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
          // Configuration presence — NOT proof of connectivity.
          providerConfigured: analyzerHealth.diagnosticEngineConfigured,
          diagnosticEngineConfigured: analyzerHealth.diagnosticEngineConfigured,
          modelConfigured: analyzerHealth.modelConfigured,
          modelName: analyzerHealth.modelName,
          // Real connectivity is only known after an admin runs a provider check; until then it is
          // "unknown". This field never turns "connected" from configuration alone.
          providerConnectivityStatus: providerCheckCache.provider.status,
          lastProviderCheckAt: providerCheckCache.provider.at,
          lastProviderCheckModel: providerCheckCache.provider.model,
          lastProviderCheckErrorCode: providerCheckCache.provider.errorCode,
          productionContractCheckStatus: providerCheckCache.contract.status,
          lastProductionContractCheckAt: providerCheckCache.contract.at,
          // Back-compat: diagnosticEngineConnected now reflects the real cached check, not config.
          diagnosticEngineConnected: providerCheckCache.provider.status === "connected",
          fullEngineRequired: analyzerHealth.fullEngineRequired,
          timeoutMs: analyzerHealth.timeoutMs,
          maxOutputTokens: analyzerHealth.maxOutputTokens,
          retryMaxOutputTokens: analyzerHealth.retryMaxOutputTokens,
          reasoningEffort: analyzerHealth.reasoningEffort,
          analysisMode: analysisModeLabel(),
          orchestrationVersion: ORCHESTRATION_VERSION,
          jobSchemaVersion: JOB_SCHEMA_VERSION,
          jobConfig: jobConfigSnapshot(),
          jobStorageMode: jobStore.name,
          storageMode: storage.name,
          storageAdapter: storage.name,
          storageRuntime: storage.runtime || "node",
          durableStorage: Boolean(storage.isDurable),
          ...ANALYSIS_VERSIONS
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
          selectionRequired: true,
          student: null,
          records: [],
          validRecords: [],
          summariesByTask: {
            "Task 1": buildServerProgressSummary([], null, "Task 1"),
            "Task 2": buildServerProgressSummary([], null, "Task 2")
          }
        });
        const taskType = getQueryParam(request.path, "taskType");
        const records = await storage.getSubmissionHistory(session.user.username, profile.id, taskType);
        const validRecords = buildProgressRepresentatives(records, taskType);
        return jsonResponse(200, {
          ok: true,
          selectionRequired: false,
          student: { displayName: profile.displayName, profileToken: studentProfileToken(session.user, profile) },
          records: records.map(sanitizeProgressRecordForClient),
          validRecords: validRecords.map(sanitizeProgressRecordForClient),
          summary: buildServerProgressSummary(records, null, taskType),
          summariesByTask: {
            "Task 1": buildServerProgressSummary(records, null, "Task 1"),
            "Task 2": buildServerProgressSummary(records, null, "Task 2")
          }
        });
      }

      const submissionMatch = apiPath.match(/^\/api\/submissions\/([^/]+)$/);
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
        // Deleting a learner profile deletes that learner's reports, so it is a privileged data
        // mutation and belongs in the durable audit trail alongside the account lifecycle actions.
        const qaStoreForProfile = createQaCanonicalStore({ rootDir });
        const ownedByProfile = (typeof storage.readHistory === "function" ? await storage.readHistory() : [])
          .filter((record) => String(record.ownerAccountId || record.username || "") === String(session.user.username) && String(record.studentProfileId || "") === String(profile.id));
        const profileSubmissionIds = ownedByProfile.map((record) => String(record.submissionId || "")).filter(Boolean);
        const deletion = await storage.deleteStudentProfile(session.user.username, profile.id);
        const deletedJobCount = await jobStore.deleteForStudent(session.user.username, profile.id);
        for (const submissionId of profileSubmissionIds) {
          await qaStoreForProfile.delete(submissionId).catch(() => {});
        }
        await adminSecurityFor(rootDir).appendAudit({
          action: "report-delete",
          adminAccountId: session.user.username,
          targetId: profile.id,
          result: "ok",
          metadata: {
            scope: "student-profile",
            deletedReportCount: deletion.deletedReportCount,
            deletedJobCount,
            qaSnapshotIdCount: profileSubmissionIds.length
          }
        }).catch(() => null);
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
        return await handleAnalyze(request, storage, jobStore, failureLog, rootDir);
      }

      const adminResponse = await maybeHandleAdminRoute(method, apiPath, request, storage, { failureLog, rootDir, jobStore });
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
    const records = await storage.getSubmissionHistory(user.username, profile.id);
    const valid = stableProgressSort(records.filter(isValidProgressRecord));
    const task1 = valid.filter((record) => record.taskType === "Task 1");
    const task2 = valid.filter((record) => record.taskType === "Task 2");
    return {
      ...profile,
      reportCount: records.length,
      validReportCount: valid.length,
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
    sanitized.validReportCount = Math.max(0, Number(profile.validReportCount) || 0);
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
  const projected = analysis.canonicalAnalysis
    ? projectCanonicalAnalysis(analysis.canonicalAnalysis, analysis)
    : analysis;
  const {
    ownerAccountId,
    accountRole,
    studentProfileId,
    appVersion,
    engineVersion,
    rubricVersion,
    promptVersion,
    reportSchemaVersion,
    inputFingerprint,
    parentReportId,
    analysisReason,
    analysisMode,
    canonicalAnalysis,
    canonicalTask2Analysis,
    capMetadata,
    routeAssessment,
    taskObligations,
    languageProfile,
    languageAccuracyRisk,
    developmentRisk,
    validationClassification,
    providerWordCountConflict,
    ...safe
  } = projected;
  return {
    ...safe,
    studentReportViewModel: buildStudentReportViewModel(projected)
  };
}

function sanitizeProgressRecordForClient(record = {}) {
  if (!record || typeof record !== "object") return record;
  const {
    username,
    ownerAccountId,
    studentProfileId,
    submissionHash,
    clientSubmissionId,
    inputFingerprint,
    studentWorkFingerprint,
    submissionGroupId,
    reportVersionId,
    parentReportId,
    engineVersion,
    rubricVersion,
    promptVersion,
    reportSchemaVersion,
    ...safe
  } = record;
  if (safe.report) safe.report = sanitizeAnalysisForClient(safe.report);
  if (safe.analysis) safe.analysis = sanitizeAnalysisForClient(safe.analysis);
  return safe;
}

// Bounded login throttle: too many failures for one account short-circuit further password checks.
// Counters are per-process and reset on success, so a legitimate user is never locked out for long.
const LOGIN_MAX_FAILURES = Math.max(3, Number(process.env.LOGIN_MAX_FAILURES) || 8);
const LOGIN_LOCKOUT_MS = Math.max(30000, Number(process.env.LOGIN_LOCKOUT_MS) || 300000);
const loginFailures = new Map();

function loginThrottleState(key) {
  const entry = loginFailures.get(key);
  if (!entry) return { blocked: false };
  if (Date.now() - entry.firstAt > LOGIN_LOCKOUT_MS) {
    loginFailures.delete(key);
    return { blocked: false };
  }
  return { blocked: entry.count >= LOGIN_MAX_FAILURES };
}

function recordLoginFailure(key) {
  const entry = loginFailures.get(key);
  if (!entry || Date.now() - entry.firstAt > LOGIN_LOCKOUT_MS) {
    loginFailures.set(key, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count += 1;
}

async function handleLogin(request, storage) {
  const body = readJsonBody(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const throttleKey = username.toLowerCase();

  if (loginThrottleState(throttleKey).blocked) {
    throw statusError("Too many sign-in attempts. Please wait a few minutes and try again.", 429, "RATE_LIMITED");
  }

  const user = await storage.getUserByUsername(username);

  if (!user || user.status !== "active" || !verifyUserPassword(user, password)) {
    recordLoginFailure(throttleKey);
    throw statusError("Username or password is incorrect. Please contact Kru Pom IELTS.", 401, "NOT_AUTHENTICATED");
  }
  loginFailures.delete(throttleKey);

  const loginPatch = { lastLoginAt: new Date().toISOString() };
  if (user.password && !user.passwordHash) {
    loginPatch.password = "";
    loginPatch.passwordHash = hashPassword(password);
  }
  const updatedUser = await storage.updateUser(user.username, loginPatch).catch(() => user);

  const security = currentAdminSecurity();
  const isAdmin = String(updatedUser.role || user.role || "").toLowerCase() === "admin";
  // The new session is minted at the account's CURRENT durable session version, so it survives an
  // earlier revocation of the same username while every pre-revocation token stays dead.
  const sessionVersion = await security.getSessionVersion(user.username);
  if (isAdmin) {
    await security.appendAudit({
      action: "admin-login",
      adminAccountId: user.username,
      targetId: user.username,
      result: "ok",
      metadata: { sessionVersion }
    }).catch(() => null);
  }

  // `next` is honoured only after the server has confirmed the role the destination requires, and
  // only for a same-site path — never an absolute URL.
  const requestedNext = safeNextPath(body.next);
  const redirectTo = requestedNext && (!requestedNext.startsWith("/admin") || isAdmin) ? requestedNext : "";

  return jsonResponse(200, {
    ok: true,
    authenticated: true,
    redirectTo,
    user: withExpiryFlags(addDailyLimitFlags(sanitizeUserForClient(updatedUser)))
  }, {
    "Set-Cookie": buildSessionCookie(createSessionToken(user.username, sessionVersion))
  });
}

// Accepts only a same-site absolute path. Anything protocol-relative, absolute-URL or containing a
// backslash is refused, so `next` can never send the admin to another origin.
export function safeNextPath(value) {
  const raw = String(value || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("://")) return "";
  return raw.slice(0, 200);
}

async function handleAnalyze(request, storage, jobStore, failureLog = null, rootDir = process.cwd()) {
  const startedAt = Date.now();
  const requestId = createAnalysisRequestId();
  const session = await requireSession(request, storage);
  const user = session.user;
  const body = readJsonBody(request);
  const payload = applyTask1ClassificationGuard(applyTask2ClassificationGuard(validateAnalyzePayload(body)));
  payload.analysisRequestId = requestId;

  const studentProfile = await resolveStudentProfileForAnalysis(storage, user, payload.studentProfileToken);
  Object.assign(payload, {
    ownerAccountId: user.username,
    accountRole: user.role,
    studentProfileId: studentProfile.id,
    studentDisplayNameSnapshot: studentProfile.displayName
  });
  delete payload.studentProfileToken;
  // A browser can never assert rerun status directly: the flag is server-set here, and
  // validateAnalyzePayload already rebuilt the payload from an allowlist so an injected value cannot
  // survive. Deleted defensively in case this function is ever called with a raw object.
  delete payload.explicitRerun;
  const submissionHash = createSubmissionHash(user.username, payload);
  payload.inputFingerprint = submissionHash;
  // The fingerprints describe the STUDENT'S WORK only. Rerun intent, parent id and analysis reason
  // are deliberately excluded, so a rerun of unchanged writing keeps the same work identity and
  // therefore the same submissionGroupId and progression grouping.
  payload.studentWorkFingerprint = createStudentWorkFingerprint(user.username, payload);
  const idempotencyKey = payload.clientSubmissionId;

  // Resolved BEFORE the historical cache is consulted. Throws on a forged or foreign parent id.
  const rerunIntent = await resolveRerunIntent(storage, user.username, payload);
  payload.explicitRerun = rerunIntent.verified;

  // Request idempotency always applies — a retried click returns the same analysis.
  const existingRecord = idempotencyKey
    ? await storage.findSubmissionByKey(user.username, idempotencyKey, payload.studentProfileId)
    : null;
  // ONLY the historical exact-input shortcut is skipped for a verified rerun. Without a verified
  // rerun the behaviour is byte-for-byte what it was before.
  const duplicateRecord = existingRecord || (rerunIntent.verified
    ? null
    : await storage.findSubmissionByHash?.(user.username, submissionHash, payload.studentProfileId));

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

  await enforceAnalysisAccess(storage, user, payload);
  Object.assign(payload, await buildAnalysisLineage(storage, user.username, payload));

  if (shouldUseAsyncAnalysis()) {
    // An existing active job for the same content (owner + student + hash/clientSubmissionId) must not
    // start a second provider call and must not touch quota. Return its jobId so the client just polls.
    const activeJob = await findActiveDuplicateJob(jobStore, user.username, payload.studentProfileId, {
      clientSubmissionId: idempotencyKey,
      submissionHash
    });
    if (activeJob) {
      await auditAnalyze(storage, user, payload, { openAiCalled: false, quotaDeducted: false, duplicateCacheUsed: true });
      return jsonResponse(202, buildAcceptedResponse(activeJob, { duplicate: true }));
    }

    // Create a durable queued job and return 202 immediately. The complete provider analysis runs in
    // the worker loop, never inside this request. Access was already enforced (check only, no deduct).
    const health = getAnalyzerHealth();
    const now = new Date().toISOString();
    const jobId = createJobId();
    const job = {
      jobId,
      requestId,
      username: user.username,
      ownerId: user.username,
      role: user.role,
      status: "queued",
      stage: "queued",
      progressMessageKey: stageMessageForStatus("queued"),
      createdAt: now,
      updatedAt: now,
      startedAt: "",
      completedAt: "",
      failedAt: "",
      attempt: 0,
      providerAttempt: 0,
      revisionRepairAttempt: 0,
      leaseOwner: "",
      leaseExpiresAt: "",
      heartbeatAt: "",
      errorCode: "",
      failureStage: "",
      retryable: false,
      message: "",
      debugHint: "",
      reportId: "",
      quotaCommitted: false,
      teacherUsageCommitted: false,
      providerModel: health.modelName,
      reasoningEffort: health.reasoningEffort,
      engineVersion: ANALYSIS_VERSIONS.engineVersion,
      jobSchemaVersion: JOB_SCHEMA_VERSION,
      taskType: payload.taskType,
      essayType: payload.publicEssayType || payload.essayType || "",
      visualType: payload.publicVisualType || payload.visualType || "",
      submissionHash,
      clientSubmissionId: idempotencyKey || "",
      payload: { ...payload, submissionHash }
    };
    await jobStore.set(jobId, job);
    await auditAnalyze(storage, user, payload, { openAiCalled: false, quotaDeducted: false, duplicateCacheUsed: false, reason: "queued" });

    // Legacy Netlify async invokes a background function; Render-native async relies on the in-process
    // worker loop that is already polling the durable store, so no cross-process kick is needed.
    if (!isRenderAsyncMode()) {
      await invokeAnalyzeWorker(request, jobId);
    }

    return jsonResponse(202, buildAcceptedResponse(job, { duplicate: false }));
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
    await persistAnalyzeFailure(failureLog, { error, user, payload, requestId, startedAt });
    // No credit was deducted (the audit above records quotaDeducted: false). Return a safe, coded,
    // reference-tagged response instead of the old undifferentiated generic message.
    return buildAnalyzeErrorResponse({ error, user, requestId });
  }
  const progressRecord = buildSubmissionHistoryRecord(user.username, payload, analysis, submissionHash);
  let transaction;
  try {
    if (typeof storage.commitAnalysis === "function") {
      transaction = await storage.commitAnalysis(progressRecord, buildAnalyzeAuditEntry(user, payload, {
        openAiCalled: true,
        quotaDeducted: isLimitedUser(user),
        duplicateCacheUsed: false
      }));
    } else {
      const saved = await storage.appendSubmission(progressRecord);
      const updated = saved === progressRecord ? await storage.incrementUsage(user.username) : await storage.getUserByUsername(user.username);
      transaction = { record: saved, user: updated, created: saved === progressRecord };
      await auditAnalyze(storage, updated || user, payload, {
        openAiCalled: true,
        quotaDeducted: saved === progressRecord && isLimitedUser(updated || user),
        duplicateCacheUsed: saved !== progressRecord
      });
    }
  } catch (error) {
    // The report was generated but could not be committed: a distinct, honest failure. Quota is not
    // deducted because the commit (which also increments usage) did not succeed.
    error.errorCode = error.errorCode || "STORAGE_COMMIT_FAILED";
    error.debugHint = error.debugHint || "Atomic report, usage and audit commit failed. Check the configured storage adapter.";
    await persistAnalyzeFailure(failureLog, { error, user, payload, requestId, startedAt });
    return buildAnalyzeErrorResponse({ error, user, requestId });
  }
  const savedRecord = transaction.record;
  const updatedUser = transaction.user || user;
  if (!transaction.created) {
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

  // Admin-only canonical QA snapshot from the pre-projection analysis (never affects the student view).
  await persistQaSnapshot({ rootDir, analysis, savedRecord, payload });

  return jsonResponse(200, {
    ok: true,
    duplicateSubmission: false,
    requestId,
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

// Persists a safe, bounded failure record for admin visibility. Never throws: a logging failure must
// not turn one analysis failure into two, and must not change the response the student receives.
async function persistAnalyzeFailure(failureLog, { error, user, payload, requestId, startedAt }) {
  if (!failureLog) return;
  try {
    const health = getAnalyzerHealth();
    await failureLog.append({
      requestId,
      ownerAccountId: user?.username,
      accountRole: user?.role,
      taskType: payload?.taskType,
      essayOrVisualType: payload?.publicEssayType || payload?.essayType || payload?.publicVisualType || payload?.visualType || "",
      providerModel: error?.providerModel || health.modelName,
      reasoningEffort: error?.providerReasoningEffort || health.reasoningEffort,
      failureStage: failureStageForError(error),
      errorCode: error?.errorCode,
      providerStatus: error?.providerStatus,
      incompleteReason: error?.incompleteReason,
      retryAttempted: error?.retryAttempted,
      firstAttemptErrorCode: error?.firstAttemptErrorCode,
      validatorIssueCodes: Array.isArray(error?.validationDetails) ? error.validationDetails.map((detail) => detail.code) : [],
      durationMs: Date.now() - Number(startedAt || Date.now())
    });
  } catch (logError) {
    console.error("[diagnostic-lab] failed to persist analysis failure record", { message: truncate(String(logError?.message || ""), 200) });
  }
}

async function handleAnalyzeStatus(request, storage, jobStore, jobId) {
  const session = await requireSession(request, storage);
  let job = await jobStore.get(jobId);
  // Ownership is mandatory: a job is only ever visible to the account that created it (brief §6.6).
  if (!job || job.username !== session.user.username) {
    throw statusError("Analysis job was not found. Please submit again.", 404, "VALIDATION_ERROR");
  }
  const isStaff = isTeacherOrAdmin(session.user);

  // Defensive terminalization: if the worker is not advancing a job and it has exceeded the whole-job
  // timeout, return a definitive, safe answer instead of letting the client poll forever. No credit is
  // involved (nothing committed), so this is safe and idempotent.
  if (isActiveJobState(job.status)) {
    const ageMs = Date.now() - Date.parse(job.createdAt || new Date().toISOString());
    if (Number.isFinite(ageMs) && ageMs > jobStaleMs()) {
      job = await jobStore.set(jobId, timeoutJob(job, "ASYNC_JOB_EXPIRED", "expired")).catch(() => job);
    } else if (Number.isFinite(ageMs) && ageMs > jobTimeoutMs()) {
      job = await jobStore.set(jobId, timeoutJob(job, "ASYNC_JOB_TIMEOUT", "failed")).catch(() => job);
    }
  }

  if (job.status === "complete") {
    return jsonResponse(200, {
      ok: true,
      status: "complete",
      jobId: job.jobId,
      requestId: job.requestId || "",
      reportId: job.reportId || "",
      analysis: sanitizeAnalysisForClient(job.analysis),
      user: job.user,
      progressRecord: sanitizeProgressRecordForClient(job.progressRecord),
      progressSummary: job.progressSummary || null,
      duplicateSubmission: Boolean(job.duplicateSubmission),
      message: job.message || stageMessageForStatus("complete")
    });
  }

  if (job.status === "failed" || job.status === "cancelled" || job.status === "expired") {
    const errorCode = job.errorCode || "PROVIDER_ERROR";
    const payload = {
      ok: false,
      status: job.status,
      jobId: job.jobId,
      requestId: job.requestId || "",
      errorCode,
      error: job.message || GENERIC_ANALYSIS_ERROR,
      retryable: job.retryable !== undefined ? Boolean(job.retryable) : RETRYABLE_ANALYSIS_CODES.has(errorCode)
    };
    if (isStaff) {
      payload.failureStage = job.failureStage || failureStageForError({ errorCode });
      if (job.debugHint) payload.safeDebugSummary = safeDebugHint({ debugHint: job.debugHint });
      if (job.providerStatus) payload.providerStatus = job.providerStatus;
      payload.attempt = job.attempt || 0;
      payload.providerAttempt = job.providerAttempt || 0;
    }
    return jsonResponse(200, payload);
  }

  // Active: a safe, non-numeric stage label only. Never a fake percentage, never provider internals.
  return jsonResponse(200, {
    ok: true,
    status: job.status || "queued",
    stage: job.stage || job.status || "queued",
    jobId: job.jobId,
    requestId: job.requestId || "",
    message: job.progressMessageKey || stageMessageForStatus(job.status),
    startedAt: job.startedAt || null,
    updatedAt: job.updatedAt || job.createdAt || null,
    ...(isStaff ? { heartbeatAt: job.heartbeatAt || null, attempt: job.attempt || 0 } : {})
  });
}

// Marks a stuck active job as a distinct timeout/expiry terminal state (brief §7). No credit involved.
function timeoutJob(job, errorCode, status) {
  const now = new Date().toISOString();
  return {
    ...job,
    status,
    stage: status,
    failureStage: "async_job_timeout",
    failedAt: now,
    updatedAt: now,
    leaseOwner: "",
    leaseExpiresAt: "",
    errorCode,
    retryable: true,
    message: errorCode === "ASYNC_JOB_EXPIRED"
      ? "The analysis expired before it could finish. No credit was used. Please try again."
      : "The analysis took too long to finish. No credit was used. Please try again."
  };
}

// Durable, lease-aware, restart-safe analysis worker for one job (brief §6.3–§6.5, §11, §7).
// Callable two ways:
//   • by the Render worker loop with shared { storage, jobStore, failureLog, leaseOwner, leaseMs }
//     (the job is already leased to leaseOwner), and
//   • directly as processAnalyzeJob({ jobId, rootDir }) (legacy Netlify worker / tests), where it
//     creates its own instances and claims the lease itself.
// Exactly-once credit is guaranteed by storage.commitAnalysis (it dedupes by clientSubmissionId /
// submissionHash before incrementing usage), so a retry or restart can never double-charge.
export async function processAnalyzeJob({
  jobId,
  rootDir = process.cwd(),
  storage: injectedStorage,
  jobStore: injectedJobStore,
  failureLog: injectedFailureLog,
  leaseOwner,
  leaseMs
} = {}) {
  loadEnvFile(rootDir);
  const storage = injectedStorage || createStorage({ rootDir });
  const jobStore = injectedJobStore || createAnalysisJobStore({ rootDir });
  const failureLog = injectedFailureLog || createAnalysisFailureLog({ rootDir });
  const lease = Number(leaseMs || jobLeaseMs());
  const owner = leaseOwner || `inproc:${process.pid}:${randomBytes(4).toString("hex")}`;
  const canLease = typeof jobStore.claim === "function" && typeof jobStore.heartbeat === "function";

  let job = await jobStore.get(jobId);
  if (!job) throw statusError("Analysis job was not found.", 404, "VALIDATION_ERROR");
  if (isTerminalJobState(job.status)) return job;

  // Take (or renew) the lease. If another worker holds a live lease, do not touch the job.
  if (canLease) {
    const claimed = await jobStore.claim(jobId, owner, lease);
    if (!claimed) return await jobStore.get(jobId);
    job = claimed;
  }

  // Advance the visible stage and renew the lease in one write.
  const stage = async (status, patch = {}) => {
    const base = { status, stage: status, progressMessageKey: stageMessageForStatus(status), ...patch };
    if (canLease) {
      job = await jobStore.heartbeat(jobId, owner, lease, base) || { ...job, ...base };
    } else {
      job = await jobStore.set(jobId, { ...job, ...base, updatedAt: new Date().toISOString() });
    }
    return job;
  };
  // Write a terminal state (clears the lease). Never uses heartbeat (which rejects terminal states).
  const finalize = async (patch) => {
    const now = new Date().toISOString();
    job = await jobStore.set(jobId, { ...job, leaseOwner: "", leaseExpiresAt: "", updatedAt: now, ...patch });
    return job;
  };
  const ageMs = () => Date.now() - Date.parse(job.createdAt || new Date().toISOString());
  const startedAt = job.startedAt || job.createdAt;

  try {
    await stage("preprocessing", { startedAt: job.startedAt || new Date().toISOString() });

    // Whole-job timeout is distinct from a provider timeout (brief §7): do not begin expensive work
    // on a job that has already exceeded its budget.
    if (ageMs() > jobStaleMs()) return failAsyncTimeout(finalize, "ASYNC_JOB_EXPIRED", "expired");
    if (ageMs() > jobTimeoutMs()) return failAsyncTimeout(finalize, "ASYNC_JOB_TIMEOUT", "failed");

    const user = await storage.getUserByUsername(job.username);
    if (!user || user.status !== "active") {
      throw statusError("Please log in to use the diagnostic lab.", 401, "NOT_AUTHENTICATED");
    }
    applyTask1ClassificationGuard(applyTask2ClassificationGuard(job.payload || {}));
    await assertOwnedStudentProfile(storage, user, job.payload || {});

    const submissionHash = job.payload?.submissionHash || createSubmissionHash(user.username, job.payload || {});

    // Rerun intent is RE-VERIFIED here rather than trusted from the stored job payload, so a restart
    // cannot act on a stale flag (for example if the parent report was deleted while the job was
    // queued). A parent that no longer resolves simply degrades the job to a normal submission.
    const rerunIntent = await resolveRerunIntent(storage, user.username, job.payload || {}).catch(() => ({ verified: false }));

    // Restart-safety idempotency checkpoint: if a report for this submission already exists (a prior
    // attempt committed but crashed before marking the job complete), project it — no provider call,
    // no second credit (brief §6.5, §11). The clientSubmissionId lookup is what makes this safe, and
    // it stays active for reruns too, so a rerun that already committed is never run twice.
    const existingRecord = job.payload?.clientSubmissionId
      ? await storage.findSubmissionByKey(user.username, job.payload.clientSubmissionId, job.payload.studentProfileId)
      : null;
    // Same rule as the synchronous path: skip only the historical exact-input shortcut.
    const duplicateRecord = existingRecord || (rerunIntent.verified
      ? null
      : await storage.findSubmissionByHash?.(user.username, submissionHash, job.payload.studentProfileId));

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
      await auditAnalyze(storage, latestUser || user, job.payload || {}, { openAiCalled: false, quotaDeducted: false, duplicateCacheUsed: true });
      return finalize({
        status: "complete",
        stage: "complete",
        completedAt: new Date().toISOString(),
        reportId: duplicateRecord.submissionId || duplicateRecord.id || job.reportId || "",
        analysis: duplicatePayload.analysis,
        user: duplicatePayload.user,
        progressRecord: duplicatePayload.progressRecord,
        progressSummary: duplicatePayload.progressSummary,
        duplicateSubmission: duplicatePayload.duplicateSubmission,
        message: duplicatePayload.message
      });
    }

    await enforceAnalysisAccess(storage, user, job.payload || {});

    // Bounded provider attempts across restarts: a job that has already used its provider budget and
    // still has no saved report fails safely instead of re-calling the provider unboundedly.
    if (Number(job.providerAttempt || 0) >= providerMaxAttempts()) {
      const code = job.errorCode || "ASYNC_JOB_EXPIRED";
      return failAsyncTimeout(finalize, code, "failed");
    }

    let analysis;
    try {
      await stage("provider_request", { providerAttempt: Number(job.providerAttempt || 0) + 1 });
      const raw = await analyzeWriting(job.payload);
      await stage("scoring_validation");
      analysis = validateReportOutput(raw, job.payload);
    } catch (error) {
      await auditAnalyze(storage, user, job.payload || {}, {
        openAiCalled: true,
        quotaDeducted: false,
        duplicateCacheUsed: false,
        reason: error.errorCode || "analysis-failed"
      });
      throw error;
    }

    await stage("saving");
    const progressRecord = buildSubmissionHistoryRecord(user.username, job.payload, analysis, submissionHash);
    const transaction = typeof storage.commitAnalysis === "function"
      ? await storage.commitAnalysis(progressRecord, buildAnalyzeAuditEntry(user, job.payload || {}, {
          openAiCalled: true,
          quotaDeducted: isLimitedUser(user),
          duplicateCacheUsed: false
        }))
      : await (async () => {
          const saved = await storage.appendSubmission(progressRecord);
          const updated = saved === progressRecord ? await storage.incrementUsage(user.username) : await storage.getUserByUsername(user.username);
          await auditAnalyze(storage, updated || user, job.payload || {}, {
            openAiCalled: true,
            quotaDeducted: saved === progressRecord && isLimitedUser(updated || user),
            duplicateCacheUsed: saved !== progressRecord
          });
          return { record: saved, user: updated, created: saved === progressRecord };
        })();
    const savedRecord = transaction.record;
    const updatedUser = transaction.user || user;
    if (!transaction.created) {
      await auditAnalyze(storage, updatedUser, job.payload || {}, { openAiCalled: true, quotaDeducted: false, duplicateCacheUsed: true });
    }
    // Admin-only canonical QA snapshot from the pre-projection analysis (async-render path).
    await persistQaSnapshot({ rootDir, analysis, savedRecord, payload: job.payload || {} });

    return finalize({
      status: "complete",
      stage: "complete",
      completedAt: new Date().toISOString(),
      reportId: savedRecord.submissionId || savedRecord.id || "",
      // Commit markers make the exactly-once accounting auditable (brief §11).
      quotaCommitted: Boolean(transaction.created && isLimitedUser(updatedUser || user)),
      teacherUsageCommitted: Boolean(transaction.created && isUnlimitedInternalUser(updatedUser || user)),
      analysis: savedRecord.report || savedRecord.analysis,
      user: withExpiryFlags(addDailyLimitFlags(sanitizeUserForClient(updatedUser || user))),
      progressRecord: savedRecord,
      progressSummary: buildServerProgressSummary(
        (await storage.getSubmissionHistory(user.username, job.payload.studentProfileId, job.payload.taskType)).filter(isValidProgressRecord),
        savedRecord,
        job.payload.taskType
      ),
      duplicateSubmission: !transaction.created,
      message: !transaction.created ? "This exact submission has already been analyzed. No credit or daily limit was used. Opening the existing saved report." : ""
    });
  } catch (error) {
    const normalized = normalizeError(error);
    const errorCode = normalized.payload.errorCode || "PROVIDER_ERROR";
    await persistAnalyzeFailure(failureLog, {
      error,
      user: { username: job.username, role: job.role },
      payload: job.payload || {},
      requestId: job.requestId,
      startedAt: Date.parse(startedAt) || Date.now()
    });
    return finalize({
      status: "failed",
      stage: failureStageForError(error),
      failedAt: new Date().toISOString(),
      errorCode,
      failureStage: failureStageForError(error),
      retryable: RETRYABLE_ANALYSIS_CODES.has(errorCode),
      providerStatus: error?.providerStatus || null,
      message: normalized.payload.error || GENERIC_ANALYSIS_ERROR,
      debugHint: normalized.payload.debugHint || error.debugHint || ""
    });
  }
}

// Distinct, safe terminal state for whole-job timeout/expiry (brief §7). No credit is ever involved.
function failAsyncTimeout(finalize, errorCode, status) {
  return finalize({
    status,
    stage: "async_job_timeout",
    failedAt: new Date().toISOString(),
    errorCode,
    failureStage: "async_job_timeout",
    retryable: true,
    message: errorCode === "ASYNC_JOB_EXPIRED"
      ? "The analysis expired before it could finish. No credit was used. Please try again."
      : "The analysis took too long to finish. No credit was used. Please try again."
  });
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

async function maybeHandleAdminRoute(method, apiPath, request, storage, context = {}) {
  if (!apiPath.startsWith("/api/admin/")) return null;
  const security = adminSecurityFor(context.rootDir || process.cwd());
  const adminSession = await requireAdmin(request, storage, security);
  const actor = adminSession?.user?.username || "";

  // The admin console fetches a CSRF token bound to this session. Read-only, so it needs no token.
  if (method === "GET" && apiPath === "/api/admin/csrf-token") {
    return jsonResponse(200, { ok: true, csrfToken: issueCsrfToken(csrfSubject(adminSession)) });
  }

  // ---- CSRF: every privileged write must prove it came from this origin for this session --------
  // Read-only GETs are exempt; every mutating method is not. A rejection is recorded in the audit so
  // an attempted forgery is visible.
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const guard = verifyAdminWriteRequest(request, adminSession);
    if (!guard.ok) {
      await security.appendAudit({
        action: "admin-csrf-rejected",
        adminAccountId: actor,
        targetId: apiPath,
        result: "rejected",
        metadata: { method, reason: guard.reason }
      }).catch(() => null);
      return jsonResponse(403, { ok: false, error: guard.reason, errorCode: "CSRF_REJECTED" });
    }
  }

  // ---- System Diagnostics (admin session only; never expose secrets or student data) ----
  if (method === "POST" && apiPath === "/api/admin/diagnostics/provider-connectivity") {
    const analyzerHealth = getAnalyzerHealth();
    if (!analyzerHealth.diagnosticEngineConfigured || !analyzerHealth.modelConfigured) {
      return jsonResponse(200, {
        ok: false,
        ran: false,
        reason: "Set OPENAI_API_KEY and OPENAI_MODEL before running a provider check.",
        modelName: analyzerHealth.modelName
      });
    }
    let result;
    try {
      const check = await runProviderHealthCheck();
      result = { ok: check.ok, ran: true, modelName: check.modelName, endpoint: check.endpoint };
    } catch (error) {
      result = {
        ok: false,
        ran: true,
        modelName: analyzerHealth.modelName,
        errorCode: error?.errorCode || "PROVIDER_ERROR",
        providerStatus: error?.providerStatus || null,
        debugHint: safeDebugHint(error)
      };
    }
    recordProviderCheck(result);
    return jsonResponse(200, { ...result, checkedAt: providerCheckCache.provider.at });
  }

  if (method === "POST" && apiPath === "/api/admin/diagnostics/production-contract") {
    const analyzerHealth = getAnalyzerHealth();
    if (!analyzerHealth.diagnosticEngineConfigured || !analyzerHealth.modelConfigured) {
      return jsonResponse(200, {
        ok: false,
        ran: false,
        reason: "Set OPENAI_API_KEY and OPENAI_MODEL before running a contract check.",
        modelName: analyzerHealth.modelName
      });
    }
    const result = await runProductionContractCheck();
    recordContractCheck(result);
    // The contract result is already safe (no essay, prompt or raw output), but strip any debugHint.
    const { debugHint, ...safe } = result;
    return jsonResponse(200, { ...safe, checkedAt: providerCheckCache.contract.at });
  }

  if (method === "POST" && apiPath === "/api/admin/diagnostics/storage") {
    const result = await runStorageSelfTest({ rootDir: context.rootDir });
    return jsonResponse(200, { ...result, storageAdapter: storage.name, durableStorage: Boolean(storage.isDurable) });
  }

  if (method === "GET" && apiPath === "/api/admin/diagnostics/analysis-failures") {
    const records = context.failureLog ? await context.failureLog.list() : [];
    return jsonResponse(200, { ok: true, count: records.length, failures: records });
  }

  if (method === "POST" && apiPath === "/api/admin/diagnostics/clear-failures") {
    const cleared = context.failureLog ? await context.failureLog.clear() : { cleared: true, count: 0 };
    return jsonResponse(200, { ok: true, ...cleared });
  }

  if (method === "GET" && apiPath === "/api/admin/diagnostics/system") {
    const analyzerHealth = getAnalyzerHealth();
    return jsonResponse(200, {
      ok: true,
      appVersion: ANALYSIS_VERSIONS.appVersion,
      engineVersion: ANALYSIS_VERSIONS.engineVersion,
      analysisMode: analysisModeLabel(),
      provider: {
        configured: analyzerHealth.diagnosticEngineConfigured,
        modelConfigured: analyzerHealth.modelConfigured,
        modelName: analyzerHealth.modelName,
        reasoningEffort: analyzerHealth.reasoningEffort,
        timeoutMs: analyzerHealth.timeoutMs,
        maxOutputTokens: analyzerHealth.maxOutputTokens,
        retryMaxOutputTokens: analyzerHealth.retryMaxOutputTokens
      },
      lastProviderCheck: providerCheckCache.provider,
      lastContractCheck: providerCheckCache.contract,
      storage: { adapter: storage.name, durable: Boolean(storage.isDurable), runtime: storage.runtime || "node" },
      jobStore: context.jobStore?.name || "",
      jobConfig: jobConfigSnapshot()
    });
  }

  // ---- Async job diagnostics (brief §9). No student content, no secrets. ----
  if (method === "GET" && apiPath === "/api/admin/diagnostics/job-queue-status") {
    if (!context.jobStore) return jsonResponse(200, { ok: true, supported: false, reason: "No job store on this deployment." });
    return jsonResponse(200, await runJobQueueStatus(context.jobStore));
  }

  if (method === "POST" && apiPath === "/api/admin/diagnostics/stale-job-recovery-test") {
    // Runs entirely in an isolated temp store; never touches production job data.
    return jsonResponse(200, await runStaleJobRecoveryTest());
  }

  if (method === "POST" && apiPath === "/api/admin/diagnostics/duplicate-idempotency-test") {
    // Runs entirely in an isolated temp storage with a synthetic user; no production quota is touched.
    return jsonResponse(200, await runDuplicateIdempotencyTest());
  }

  // ---- Canonical QA Export (admin session only; never exposes secrets or another student's data) ----
  // Listing: safe searchable metadata only — no prompt, no writing, no report body.
  if (method === "GET" && apiPath === "/api/admin/qa-reports") {
    const qaStore = createQaCanonicalStore({ rootDir: context.rootDir });
    const records = typeof storage.readHistory === "function" ? await storage.readHistory() : [];
    const query = normalizeQaQuery(getQueryParam(request.path, "q"));
    const rows = [];
    for (const record of Array.isArray(records) ? records : []) {
      const reportId = String(record.submissionId || "");
      if (!reportId) continue;
      const meta = {
        reportId,
        studentName: String(record.studentDisplayNameSnapshot || ""),
        studentId: String(record.studentProfileId || ""),
        date: String(record.dateTime || ""),
        taskType: String(record.taskType || ""),
        essayOrVisualType: String(record.essayType || record.visualType || ""),
        estimatedBandRange: String(record.estimatedBandRange || ""),
        appVersion: String(record.appVersion || ""),
        engineVersion: String(record.engineVersion || ""),
        providerModel: String(record.providerModel || ""),
        canonicalSnapshotAvailable: await qaStore.has(reportId),
        // A record still exports a substantial QA file from its persisted per-issue canonical layer.
        recordExportAvailable: Boolean((record.report || record).feedbackCards?.length || record.feedbackCards?.length)
      };
      if (query && !qaMetadataMatches(meta, query)) continue;
      rows.push(meta);
    }
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return jsonResponse(200, { ok: true, count: rows.length, exportVersion: QA_EXPORT_VERSION, reports: rows.slice(0, 200) });
  }

  const qaExportMatch = apiPath.match(/^\/api\/admin\/qa-reports\/([^/]+)\/export$/);
  if (method === "GET" && qaExportMatch) {
    const requestedId = decodeURIComponent(qaExportMatch[1]);
    // Path-traversal safety: the id is only ever matched against stored record ids, never joined
    // into a filesystem path here; the QA store sanitises it again before touching disk.
    const records = typeof storage.readHistory === "function" ? await storage.readHistory() : [];
    const record = (Array.isArray(records) ? records : []).find((item) => String(item.submissionId || "") === requestedId);
    if (!record) {
      return jsonResponse(404, { ok: false, error: "Report was not found.", errorCode: "REPORT_NOT_FOUND" });
    }
    try {
      const qaStore = createQaCanonicalStore({ rootDir: context.rootDir });
      const snapshot = await qaStore.read(requestedId);
      const payload = snapshot
        ? { ...redactForQa(snapshot), exportedAt: new Date().toISOString(), canonicalDataSource: "qa-snapshot", studentReportViewModel: (record.report || record).studentReportViewModel || {} }
        : assembleQaExportFromRecord(record);
      if (!payload.feedbackCards?.length && !snapshot) {
        return jsonResponse(409, {
          ok: false,
          errorCode: "CANONICAL_QA_NOT_AVAILABLE",
          error: "Canonical data unavailable for this report version. Run a new analysis after the QA Export feature is deployed."
        });
      }
      await auditQaExport(storage, request, record);
      const fileName = `diagnostic-qa-${sanitizeDownloadName(record.studentDisplayNameSnapshot)}-${sanitizeDownloadName(requestedId)}.json`;
      return {
        statusCode: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${fileName}"`,
          "cache-control": "no-store"
        },
        body: JSON.stringify(payload, null, 2)
      };
    } catch (error) {
      return jsonResponse(500, { ok: false, errorCode: "CANONICAL_QA_EXPORT_FAILED", error: "Canonical QA export could not be produced." });
    }
  }

  // Paginated, searchable, filterable user list. Default view shows ACTIVE accounts only, so archived
  // and disabled accounts never clutter the table (brief §19). Payload is always bounded.
  if (method === "GET" && apiPath === "/api/admin/users") {
    const all = await storage.listUsers();
    const query = String(getQueryParam(request.path, "q") || "").trim().toLowerCase();
    const status = String(getQueryParam(request.path, "status") || "active").toLowerCase();
    const role = String(getQueryParam(request.path, "role") || "").toLowerCase();
    const sort = String(getQueryParam(request.path, "sort") || "newest").toLowerCase();
    const page = Math.max(1, Number(getQueryParam(request.path, "page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(getQueryParam(request.path, "pageSize")) || 25));

    const today = new Date().toISOString().slice(0, 10);
    let rows = all.map(sanitizeUserForAdmin).filter((user) => {
      const userStatus = String(user.status || "active").toLowerCase();
      if (status === "expired") {
        if (!user.expiryDate || String(user.expiryDate) >= today) return false;
      } else if (status !== "all" && userStatus !== status) {
        return false;
      }
      if (role && String(user.role || "").toLowerCase() !== role) return false;
      if (query) {
        const haystack = [user.username, user.displayName, user.email, user.plan].map((v) => String(v || "").toLowerCase());
        if (!haystack.some((value) => value.includes(query))) return false;
      }
      return true;
    });
    const sorters = {
      newest: (a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
      oldest: (a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
      "last-login": (a, b) => String(b.lastLoginAt || "").localeCompare(String(a.lastLoginAt || "")),
      expiry: (a, b) => String(a.expiryDate || "9999").localeCompare(String(b.expiryDate || "9999")),
      used: (a, b) => (Number(b.used) || 0) - (Number(a.used) || 0)
    };
    rows = rows.sort(sorters[sort] || sorters.newest);
    const total = rows.length;
    const start = (page - 1) * pageSize;
    return jsonResponse(200, {
      ok: true,
      users: rows.slice(start, start + pageSize),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      appliedFilters: { q: query, status, role, sort }
    });
  }

  // ---- Account lifecycle: archive / restore / permanent delete (POST or DELETE only) ----
  const accountActionMatch = apiPath.match(/^\/api\/admin\/users\/([^/]+)\/(archive|restore|delete)$/);
  if (accountActionMatch && ["POST", "DELETE"].includes(method)) {
    const targetUsername = decodeURIComponent(accountActionMatch[1]);
    const action = accountActionMatch[2];
    const target = await storage.getUserByUsername(targetUsername);
    if (!target) {
      return jsonResponse(404, { ok: false, error: "Account was not found.", errorCode: "ACCOUNT_NOT_FOUND" });
    }
    const body = readJsonBody(request);

    if (action === "archive" || action === "restore") {
      const guard = action === "archive"
        ? await enforceAdminLifecycleGuard(storage, { target, actor, action: "account-archive" })
        : null;
      if (guard) {
        await security.appendAudit({ action: `account-${action}`, adminAccountId: actor, targetId: targetUsername, result: "blocked", metadata: { code: guard.code } });
        return jsonResponse(409, { ok: false, error: guard.message, errorCode: guard.code });
      }
      const nextStatus = action === "archive" ? "archived" : "active";
      const updated = await storage.updateUser(targetUsername, { status: nextStatus });
      // Archiving takes the account out of service, so its sessions must stop working immediately.
      if (action === "archive") await security.revokeSessions(targetUsername, { reason: "account-archive" });
      await security.appendAudit({ action: `account-${action}`, adminAccountId: actor, targetId: targetUsername, result: "ok", metadata: { status: nextStatus } });
      return jsonResponse(200, { ok: true, action, user: sanitizeUserForAdmin(updated) });
    }

    // Permanent delete — irreversible, requires typed confirmation and an explicit report mode.
    const confirmation = normalizeStudentConfirmation(body.confirmation);
    if (confirmation !== normalizeStudentConfirmation(targetUsername)) {
      return jsonResponse(400, { ok: false, error: `Type ${targetUsername} exactly to confirm permanent deletion.`, errorCode: "CONFIRMATION_REQUIRED" });
    }
    const deleteGuard = await enforceAdminLifecycleGuard(storage, { target, actor, action: "account-delete" });
    if (deleteGuard) {
      await security.appendAudit({ action: "account-delete", adminAccountId: actor, targetId: targetUsername, result: "blocked", metadata: { code: deleteGuard.code } });
      return jsonResponse(409, { ok: false, error: deleteGuard.message, errorCode: deleteGuard.code });
    }
    const reportMode = body.reportMode === "delete" ? "delete" : "anonymise";
    if (typeof storage.deleteUser !== "function") {
      return jsonResponse(501, { ok: false, error: "Permanent deletion is not supported by this storage adapter.", errorCode: "NOT_SUPPORTED" });
    }
    // ---- Deletion ORDER (brief §F) ----
    // Ownership is the only thing that links a report or a QA snapshot to this account, and deletion
    // erases it. So every id is collected FIRST, from data that still carries ownership; then the
    // sessions are revoked; then history is mutated; then the collected snapshots are removed by id
    // and the result is verified for orphans.
    const owned = await collectOwnedRecordIds(storage, targetUsername);
    await security.revokeSessions(targetUsername, { reason: "account-delete" });
    const qaStore = createQaCanonicalStore({ rootDir: context.rootDir });
    const result = await storage.deleteUser(targetUsername, { reportMode, removeEvidenceText: body.removeEvidenceText === true });
    let removedSnapshots = 0;
    for (const submissionId of owned.submissionIds) {
      const removed = await qaStore.delete(submissionId).then(() => true).catch(() => false);
      if (removed) removedSnapshots += 1;
    }
    const orphans = await findOrphanedRecords(storage, targetUsername, owned);
    await security.appendAudit({
      action: "account-delete",
      adminAccountId: actor,
      targetId: targetUsername,
      result: orphans.length ? "incomplete" : "ok",
      metadata: {
        reportMode,
        reportIdCount: owned.reportIds.length,
        qaSnapshotIdCount: owned.submissionIds.length,
        removedSnapshots,
        deletedReportCount: result.deletedReportCount,
        anonymisedReportCount: result.anonymisedReportCount,
        studentProfileCount: owned.studentProfileIds.length,
        orphanCount: orphans.length
      }
    });
    return jsonResponse(200, {
      ok: true,
      deleted: true,
      reportMode,
      ...result,
      deletionOrder: ["collect-report-ids", "collect-qa-snapshot-ids", "revoke-sessions", "mutate-history", "remove-qa-snapshots", "verify-no-orphans"],
      reportIds: owned.reportIds,
      qaSnapshotIds: owned.submissionIds,
      removedSnapshots,
      orphanedRecords: orphans
    });
  }

  // ---- Admin audit log: durable, paginated, searchable, filterable, no sensitive values ----
  if (method === "GET" && apiPath === "/api/admin/audit-log") {
    const result = await security.readAudit({
      q: getQueryParam(request.path, "q") || "",
      action: getQueryParam(request.path, "action") || "",
      result: getQueryParam(request.path, "result") || "",
      page: getQueryParam(request.path, "page"),
      pageSize: getQueryParam(request.path, "pageSize")
    });
    return jsonResponse(200, { ok: true, ...result });
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
    await security.appendAudit({
      action: "user-create",
      adminAccountId: actor,
      targetId: user.username,
      result: "ok",
      metadata: { role: user.role, quotaMode: user.quotaMode, quotaLimit: user.quotaLimit, expiryDate: user.expiryDate, status: user.status }
    });
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
    const target = await storage.getUserByUsername(username);
    if (!target) {
      return jsonResponse(404, { ok: false, error: "Account was not found.", errorCode: "ACCOUNT_NOT_FOUND" });
    }
    let patch;
    try {
      patch = sanitizeAdminUserPatch(body);
    } catch (error) {
      return jsonResponse(error.statusCode || 400, { ok: false, error: error.message, errorCode: error.errorCode || "VALIDATION_ERROR" });
    }
    // The generic PATCH is the same lifecycle surface as the dedicated actions — a role change to
    // non-admin, or a status change to inactive/archived, must pass exactly the same guards.
    const guard = await enforceAdminLifecycleGuard(storage, { target, actor, patch, action: "user-update" });
    if (guard) {
      await security.appendAudit({ action: "user-update", adminAccountId: actor, targetId: username, result: "blocked", metadata: { code: guard.code, ...changedFields(target, patch) } });
      return jsonResponse(409, { ok: false, error: guard.message, errorCode: guard.code });
    }
    const changes = changedFields(target, patch);
    const user = await storage.updateUser(username, patch);
    // A change that takes the account out of service, or that removes privileges, invalidates the
    // sessions issued under the old state.
    const deactivated = ["inactive", "archived"].includes(String(patch.status || "").toLowerCase());
    const demoted = Object.prototype.hasOwnProperty.call(patch, "role") && String(target.role || "").toLowerCase() === "admin" && String(patch.role || "").toLowerCase() !== "admin";
    if (deactivated || demoted) {
      await security.revokeSessions(username, { reason: deactivated ? "status-change" : "role-change" });
      await security.appendAudit({ action: "session-revoke", adminAccountId: actor, targetId: username, result: "ok", metadata: { cause: deactivated ? "status-change" : "role-change" } });
    }
    for (const action of auditActionsForPatch(patch)) {
      await security.appendAudit({ action, adminAccountId: actor, targetId: username, result: "ok", metadata: changes });
    }
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
    // A reset password must not leave a live session behind that was authenticated with the old one.
    await security.revokeSessions(username, { reason: "password-reset" });
    await security.appendAudit({ action: "password-reset", adminAccountId: actor, targetId: username, result: "ok", metadata: {} });
    await security.appendAudit({ action: "session-revoke", adminAccountId: actor, targetId: username, result: "ok", metadata: { cause: "password-reset" } });
    return jsonResponse(200, {
      ok: true,
      user: sanitizeUserForAdmin(user),
      generatedPassword
    });
  }

  const statusMatch = apiPath.match(/^\/api\/admin\/users\/([^/]+)\/(disable|enable)$/);
  if (method === "POST" && statusMatch) {
    const username = decodeURIComponent(statusMatch[1]);
    const action = statusMatch[2];
    const target = await storage.getUserByUsername(username);
    if (!target) {
      return jsonResponse(404, { ok: false, error: "Account was not found.", errorCode: "ACCOUNT_NOT_FOUND" });
    }
    if (action === "disable") {
      const guard = await enforceAdminLifecycleGuard(storage, { target, actor, action: "account-disable" });
      if (guard) {
        await security.appendAudit({ action: "account-disable", adminAccountId: actor, targetId: username, result: "blocked", metadata: { code: guard.code } });
        return jsonResponse(409, { ok: false, error: guard.message, errorCode: guard.code });
      }
    }
    const user = action === "disable"
      ? await storage.disableUser(username)
      : await storage.enableUser(username);
    if (action === "disable") {
      await security.revokeSessions(username, { reason: "account-disable" });
      await security.appendAudit({ action: "session-revoke", adminAccountId: actor, targetId: username, result: "ok", metadata: { cause: "account-disable" } });
    }
    await security.appendAudit({ action: `account-${action}`, adminAccountId: actor, targetId: username, result: "ok", metadata: { status: user.status } });
    return jsonResponse(200, { ok: true, user: sanitizeUserForAdmin(user) });
  }

  return jsonResponse(404, { ok: false, error: "API route not found." });
}

// ---- Admin lifecycle guard, applied identically on every mutating surface -----------------------
async function enforceAdminLifecycleGuard(storage, { target, actor, patch = {}, action = "" } = {}) {
  const intent = describeLifecycleIntent(patch, { action });
  if (!intent.demotes && !intent.deactivates && !intent.deletes) return null;
  const activeAdmins = (await storage.listUsers()).filter((user) =>
    String(user.role || "").toLowerCase() === "admin" && String(user.status || "active").toLowerCase() === "active"
  );
  return checkAdminLifecycleGuard({ target, actorUsername: actor, activeAdmins, intent });
}

// Which audit actions a generic PATCH represents. One PATCH can be several auditable changes.
function auditActionsForPatch(patch = {}) {
  const actions = ["user-update"];
  if ("role" in patch) actions.push("role-change");
  if ("status" in patch) actions.push("status-change");
  if ("quotaLimit" in patch || "quotaUsed" in patch || "quotaMode" in patch) actions.push("quota-change");
  if ("expiryDate" in patch) actions.push("expiry-change");
  return actions;
}

// Safe before/after metadata for the audit: operational fields only, never credentials.
function changedFields(before = {}, patch = {}) {
  const changes = {};
  for (const key of ["role", "status", "quotaMode", "quotaLimit", "quotaUsed", "expiryDate", "plan", "displayName"]) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    changes[key] = `${before[key] ?? ""} -> ${patch[key] ?? ""}`;
  }
  return changes;
}

// Collects every id that links data to this account, BEFORE any ownership field is erased.
async function collectOwnedRecordIds(storage, username) {
  const owner = String(username || "");
  const records = typeof storage.readHistory === "function" ? await storage.readHistory() : [];
  const owned = (Array.isArray(records) ? records : []).filter((record) =>
    String(record.username || "") === owner || String(record.ownerAccountId || "") === owner
  );
  const profiles = typeof storage.readStudentProfiles === "function" ? await storage.readStudentProfiles() : [];
  return {
    reportIds: owned.map((record) => String(record.reportId || record.submissionId || "")).filter(Boolean),
    submissionIds: owned.map((record) => String(record.submissionId || "")).filter(Boolean),
    studentProfileIds: (Array.isArray(profiles) ? profiles : [])
      .filter((profile) => String(profile.ownerAccountId || "") === owner)
      .map((profile) => String(profile.id || ""))
      .filter(Boolean)
  };
}

// Verifies that nothing still points at the deleted account after the deletion completed.
async function findOrphanedRecords(storage, username, owned) {
  const owner = String(username || "");
  const orphans = [];
  const records = typeof storage.readHistory === "function" ? await storage.readHistory() : [];
  for (const record of Array.isArray(records) ? records : []) {
    if (String(record.username || "") === owner || String(record.ownerAccountId || "") === owner) {
      orphans.push({ type: "history", id: String(record.submissionId || record.reportId || "") });
    }
  }
  const profiles = typeof storage.readStudentProfiles === "function" ? await storage.readStudentProfiles() : [];
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (String(profile.ownerAccountId || "") === owner) orphans.push({ type: "student-profile", id: String(profile.id || "") });
  }
  const users = await storage.listUsers();
  if (users.some((user) => String(user.username || "") === owner)) orphans.push({ type: "user", id: owner });
  return orphans;
}

async function requireAdmin(request, storage, security = null) {
  const session = await getSessionUser(request, storage);
  if (session?.user?.role === "admin") return session;
  // A refused privileged access attempt is itself an auditable security event.
  await (security || currentAdminSecurity()).appendAudit({
    action: "admin-access-denied",
    adminAccountId: session?.user?.username || "",
    targetId: String(request.path || ""),
    result: session ? "forbidden" : "unauthenticated",
    metadata: { method: request.method || request.httpMethod || "GET" }
  }).catch(() => null);
  // Distinguish "not signed in" (401) from "signed in without admin rights" (403), and use a specific
  // code so the frontend can route to login instead of showing a dead end.
  if (!session) {
    throw statusError("Please sign in with an administrator account.", 401, "ADMIN_REQUIRED");
  }
  throw statusError("Admin access is required.", 403, "ADMIN_REQUIRED");
}

// The CSRF subject binds a token to one session, so a token minted for another admin cannot be
// replayed. The session id is used when present; the username is the floor.
function csrfSubject(session) {
  return `${session?.user?.username || ""}:${session?.session?.sessionId || ""}`;
}

function verifyAdminWriteRequest(request, session) {
  const headers = request.headers || {};
  const token = getHeader(headers, "x-csrf-token") || readJsonBody(request)?.csrfToken || "";
  const csrf = verifyCsrfToken(csrfSubject(session), token);
  if (csrf.ok) return { ok: true };
  // A securely equivalent same-origin proof is accepted only when no token was supplied at all, so a
  // present-but-invalid token is always a rejection.
  if (!token) {
    const origin = checkSameOrigin(headers, getHeader(headers, "host"));
    if (origin.ok) return { ok: true, via: "same-origin" };
    return { ok: false, reason: `${csrf.reason} ${origin.reason}`.trim() };
  }
  return { ok: false, reason: csrf.reason };
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
  // Durable revocation: survives a restart, and distinguishes a token minted before the revoking
  // event (dead) from one minted after it (valid), even when the username was recreated.
  if (await currentAdminSecurity().isSessionRevoked(session.username, session.issuedAt, session.sessionVersion)) return null;

  return { user, session };
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

// A session token carries its own identity (sessionId), the instant it was minted (issuedAt) and the
// account's session version. Durable revocation compares all three, which is what makes "password
// reset kills existing sessions", "a recreated username cannot revive an old token" and "a session
// issued after the event stays valid" simultaneously true.
function createSessionToken(username, sessionVersion = 0) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = base64UrlEncode(JSON.stringify({
    username,
    expiresAt,
    issuedAt,
    sessionId: randomBytes(12).toString("base64url"),
    sessionVersion: Number(sessionVersion) || 0
  }));
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
  // `archived` is a real lifecycle state, so the generic status field must not silently turn it into
  // `active`. The generic dropdown offers active/inactive only; archiving requires the Archive action,
  // which also revokes sessions and records its own audit event.
  if ("status" in body) patch.status = normalizeAccountStatus(body.status, { allowArchived: false });
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

// Account creation may set active or inactive; `archived` is reached only through the Archive action.
function normalizeStatusValue(value) {
  return normalizeAccountStatus(value, { allowArchived: false });
}

function defaultExpiryDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 60);
  return date.toISOString().slice(0, 10);
}

function shouldUseAsyncAnalysis() {
  const mode = String(process.env.DIAGNOSTIC_ANALYSIS_MODE || "sync");
  if (mode === "sync") return false;
  // Render-native durable async: an in-process worker loop drives a durable job store. No Netlify.
  if (mode === "async-render") return true;
  // Legacy Netlify background-function async (requires Netlify Blobs). Unchanged.
  if (mode === "async") return process.env.DIAGNOSTIC_ENABLE_NETLIFY_BLOBS === "true";
  return false;
}

// True only for the Render-native worker-loop mode, where the in-process worker picks jobs up and the
// submission handler must NOT try to invoke a (nonexistent) Netlify background function.
function isRenderAsyncMode() {
  return String(process.env.DIAGNOSTIC_ANALYSIS_MODE || "sync") === "async-render";
}

function analysisModeLabel() {
  if (isRenderAsyncMode()) return "async-render";
  if (shouldUseAsyncAnalysis()) return "async-background";
  return "sync";
}

// The prompt 202 body (brief §6.1). `queued: true` is kept for older frontends during rollout.
function buildAcceptedResponse(job, { duplicate = false } = {}) {
  return {
    ok: true,
    accepted: true,
    queued: true,
    jobId: job.jobId,
    requestId: job.requestId || "",
    status: job.status || "queued",
    statusUrl: `/api/analyze-status/${encodeURIComponent(job.jobId)}`,
    duplicate: Boolean(duplicate),
    message: stageMessageForStatus(job.status || "queued")
  };
}

// Find an in-flight (non-terminal) job for the same owner + student + content. Used to collapse a
// re-submission of identical content onto one provider call and one credit (brief §6.1 step 10, §12).
async function findActiveDuplicateJob(jobStore, ownerId, studentProfileId, { clientSubmissionId, submissionHash } = {}) {
  if (typeof jobStore.list === "function") {
    const jobs = await jobStore.list();
    return jobs.find((job) =>
      String(job.username || "") === String(ownerId || "") &&
      String(job.payload?.studentProfileId || "") === String(studentProfileId || "") &&
      isActiveJobState(job.status) && (
        (clientSubmissionId && job.clientSubmissionId === clientSubmissionId) ||
        (submissionHash && job.submissionHash === submissionHash)
      )
    ) || null;
  }
  // Legacy stores without list(): best-effort lookup by the clientSubmissionId-as-jobId convention.
  const job = clientSubmissionId ? await jobStore.get(clientSubmissionId) : null;
  return job && job.username === ownerId && isActiveJobState(job.status) ? job : null;
}

function createJobId() {
  return `job-${Date.now().toString(36)}-${randomBytes(8).toString("hex")}`;
}

// A short, opaque reference id for one analysis submission. It correlates a student-visible failure
// with the admin failure log and server logs. It carries no personal data.
function createAnalysisRequestId() {
  return `analysis-${Date.now().toString(36)}-${randomBytes(5).toString("hex")}`;
}

// A debug hint safe to return to a logged-in admin: it never includes the raw provider body, the
// prompt, the essay, or a stack trace — only a short, sanitised description.
function safeDebugHint(error) {
  const hint = String(error?.debugHint || error?.message || "").slice(0, 200);
  return hint.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
}

// Maps a failure to the pipeline stage that produced it, for the admin failure log and responses.
function failureStageForError(error) {
  const code = String(error?.errorCode || "");
  if (["PROVIDER_AUTH_ERROR", "PROVIDER_MODEL_ERROR", "PROVIDER_RATE_LIMIT", "PROVIDER_NETWORK_ERROR", "PROVIDER_SCHEMA_ERROR", "PROVIDER_ERROR"].includes(code)) return "provider_request";
  if (code === "PROVIDER_TIMEOUT") return "provider_timeout";
  if (code === "ASYNC_JOB_TIMEOUT" || code === "ASYNC_JOB_EXPIRED") return "async_job_timeout";
  if (["PROVIDER_INCOMPLETE_RESPONSE", "PROVIDER_MAX_OUTPUT_TOKENS"].includes(code)) return "provider_incomplete";
  if (code === "PROVIDER_REFUSAL") return "provider_refusal";
  if (code === "PROVIDER_JSON_PARSE_ERROR") return "json_parse";
  if (code === "REPORT_OUTPUT_VALIDATION_FAILED") return "output_validation";
  if (code === "REVISION_REPAIR_FAILED") return "revision_repair";
  if (code === "STORAGE_COMMIT_FAILED") return "storage_commit";
  return "internal";
}

const RETRYABLE_ANALYSIS_CODES = new Set([
  "PROVIDER_RATE_LIMIT",
  "PROVIDER_TIMEOUT",
  "PROVIDER_NETWORK_ERROR",
  "PROVIDER_INCOMPLETE_RESPONSE",
  "PROVIDER_MAX_OUTPUT_TOKENS",
  "PROVIDER_JSON_PARSE_ERROR",
  "REPORT_OUTPUT_VALIDATION_FAILED",
  "STORAGE_COMMIT_FAILED",
  "ASYNC_JOB_TIMEOUT",
  "ASYNC_JOB_EXPIRED"
]);

// Builds the analysis error response. Students receive only a safe message, error code, reference id
// and retry guidance. Teachers/admins additionally receive the failure stage and safe provider
// metadata — never the raw provider body, prompt, essay, or a stack trace.
function buildAnalyzeErrorResponse({ error, user, requestId }) {
  const normalized = normalizeError(error);
  const failureStage = failureStageForError(error);
  const retryable = RETRYABLE_ANALYSIS_CODES.has(normalized.errorCode);
  const payload = {
    ok: false,
    error: normalized.payload.error,
    errorCode: normalized.errorCode,
    requestId,
    retryable
  };
  for (const key of ["selectedEssayType", "detectedEssayType", "promptClassificationConfidence", "classificationMatch"]) {
    if (error?.[key] !== undefined) payload[key] = error[key];
  }
  if (isTeacherOrAdmin(user)) {
    payload.failureStage = failureStage;
    payload.safeDebugSummary = safeDebugHint(error);
    if (error?.providerStatus) payload.providerStatus = error.providerStatus;
    if (error?.incompleteReason) payload.incompleteReason = error.incompleteReason;
    if (error?.retryAttempted) payload.retryAttempted = true;
    if (error?.firstAttemptErrorCode) payload.firstAttemptErrorCode = error.firstAttemptErrorCode;
  }
  return jsonResponse(normalized.statusCode, payload);
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

  const essayType = normalizeTask2PublicTypeLabel(body.essayType);
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
    reportLanguage: normalizeReportLanguage(body.reportLanguage),
    reportLanguageExplicit: Object.prototype.hasOwnProperty.call(body, "reportLanguage"),
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

  return attachAnalysisVersions(payload);
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
    publicEssayType: classification.publicEssayType || classification.essayTypeLabel,
    internalEssaySubtype: classification.internalEssaySubtype || classification.essayType,
    internalEssaySubtypeLabel: classification.internalEssaySubtypeLabel || classification.essayTypeLabel,
    taskObligations: classification.obligations || classification.requiredRoutes || [],
    canonicalEssayType: classification.essayType,
    canonicalEssayTypeLabel: classification.essayTypeLabel,
    promptClassificationConfidence: classification.confidence,
    classificationMatch: classification.classificationMatch,
    classificationMismatchSeverity: classification.mismatchSeverity
  });

  const autoDetect = /not sure|auto[- ]?detect/i.test(selectedLabel);
  if (autoDetect && classification.confidence !== "high") {
    const error = statusError(
      "The essay type cannot be auto-detected with high confidence. Please choose the public essay type before analysis.",
      409,
      "ESSAY_TYPE_SELECTION_REQUIRED"
    );
    Object.assign(error, {
      detectedEssayType: classification.essayTypeLabel,
      promptClassificationConfidence: classification.confidence
    });
    throw error;
  }

  if (classification.confidence === "high" && !classification.classificationMatch) {
    const error = statusError(
      `The selected essay type (${payload.selectedEssayTypeLabel}) does not match the prompt, which is classified as ${classification.essayTypeLabel}. Please correct the essay type before analysis.`,
      409,
      "ESSAY_TYPE_MISMATCH"
    );
    Object.assign(error, {
      selectedEssayType: payload.selectedEssayTypeLabel,
      detectedEssayType: classification.essayTypeLabel,
      promptClassificationConfidence: classification.confidence,
      classificationMatch: false
    });
    throw error;
  }

  if (classification.confidence === "medium") {
    const confirmed = payload.options?.essayTypeConfirmed === true || payload.options?.classificationConfirmed === true;
    if (!confirmed) {
      const error = statusError(
        `The prompt type was classified with ${classification.confidence} confidence. Please confirm ${classification.essayTypeLabel} before analysis.`,
        409,
        "ESSAY_TYPE_CONFIRMATION_REQUIRED"
      );
      Object.assign(error, {
        selectedEssayType: payload.selectedEssayTypeLabel,
        detectedEssayType: classification.essayTypeLabel,
        promptClassificationConfidence: classification.confidence,
        classificationMatch: classification.classificationMatch
      });
      throw error;
    }
    payload.classificationConfirmation = {
      confirmed: true,
      confirmedEssayType: classification.essayType,
      confirmedEssayTypeLabel: classification.essayTypeLabel,
      confirmedAt: new Date().toISOString()
    };
  }

  payload.essayType = classification.internalEssaySubtypeLabel;
  return payload;
}

export function applyTask1ClassificationGuard(payload = {}) {
  if (payload.taskType !== "Task 1") return payload;
  const classification = classifyTask1Visual(payload);
  const selected = classification.selectedPublicVisualType || payload.visualType;
  const autoDetect = selected === "Not Sure / Auto-detect";
  Object.assign(payload, {
    selectedVisualType: selected,
    publicVisualType: classification.publicVisualType,
    internalVisualSubtype: classification.internalVisualSubtype,
    visualClassificationConfidence: classification.confidence,
    visualClassificationMatch: classification.classificationMatch,
    visualClassificationSignals: classification.exactPromptSignals || [],
    visualMismatchSeverity: classification.mismatchSeverity
  });

  if (classification.confidence === "high" && !classification.classificationMatch) {
    const error = statusError(
      `The selected visual type (${selected}) does not match the prompt, which is classified as ${classification.publicVisualType}. Please correct the visual type before analysis.`,
      409,
      "VISUAL_TYPE_MISMATCH"
    );
    Object.assign(error, {
      selectedVisualType: selected,
      detectedVisualType: classification.publicVisualType,
      visualClassificationConfidence: classification.confidence,
      classificationMatch: false
    });
    throw error;
  }

  const confirmedMedium = classification.confidence === "medium" && payload.options?.visualTypeConfirmed === true;
  if (classification.confidence === "medium" && !confirmedMedium) {
    const error = statusError(
      `Please confirm ${classification.publicVisualType} before analysis.`,
      409,
      "VISUAL_TYPE_CONFIRMATION_REQUIRED"
    );
    Object.assign(error, {
      detectedVisualType: classification.publicVisualType,
      visualClassificationConfidence: classification.confidence
    });
    throw error;
  }

  if (autoDetect && classification.confidence === "low") {
    const error = statusError(
      "The visual type cannot be auto-detected from the prompt. Please choose a visual type before analysis.",
      409,
      "VISUAL_TYPE_SELECTION_REQUIRED"
    );
    Object.assign(error, {
      detectedVisualType: classification.publicVisualType,
      visualClassificationConfidence: classification.confidence
    });
    throw error;
  }

  if (classification.publicVisualType === "Diagram") {
    payload.visualType = classification.internalVisualSubtype === "process" ? "Process Diagram" : "Structural Diagram";
  } else if (classification.publicVisualType === "Mixed / Combination Visuals") {
    payload.visualType = "Mixed Graph";
  } else {
    payload.visualType = classification.publicVisualType;
  }
  return payload;
}

function isValidProgressRecord(record = {}) {
  return String(record.analysisValidity || "valid").toLowerCase() !== "invalid";
}

function isProgressEligibleRecord(record = {}) {
  return isValidProgressRecord(record) && record.progressEligible !== false;
}

function stableProgressSort(records = []) {
  return [...records].sort((a, b) => {
    const timeDelta = new Date(a.dateTime || 0).getTime() - new Date(b.dateTime || 0).getTime();
    return timeDelta || String(a.submissionId || "").localeCompare(String(b.submissionId || ""));
  });
}

export function buildServerProgressSummary(records = [], currentRecord = null, taskType = "") {
  const valid = stableProgressSort(records.filter((record) =>
    isValidProgressRecord(record) && (!taskType || record.taskType === taskType)
  ));
  const current = currentRecord && isValidProgressRecord(currentRecord)
    ? currentRecord
    : valid.at(-1) || null;
  if (!current) {
    return {
      taskType: taskType || "",
      currentSubmissionGroupId: "",
      previousSubmissionId: "",
      previousSubmissionGroupId: "",
      distinctSubmissionCount: 0,
      sameWorkRerunsExcluded: true,
      repeatedIssuesUseDistinctSubmissions: true,
      reportCount: 0,
      reportVersionCount: 0,
      currentReportVersion: 0,
      reportVersions: [],
      previousSubmissionCount: 0,
      previousEstimatedRange: "",
      latestEstimatedRange: "",
      changeIndicator: "new",
      currentMainRepair: "",
      repeatedIssue: ""
    };
  }
  const allValid = valid.some((record) => record.submissionId === current.submissionId)
    ? valid
    : stableProgressSort([...valid, current]);
  const representatives = buildProgressRepresentatives(allValid, taskType || current.taskType);
  const currentGroupId = String(current.submissionGroupId || "").trim();
  const currentVersions = allValid.filter((record) => currentGroupId
    ? String(record.submissionGroupId || "").trim() === currentGroupId
    : sameStudentWork(record, current)
  );
  const previous = representatives.filter((record) =>
    record.submissionId !== current.submissionId && !sameStudentWork(record, current)
  );
  const previousLatest = previous.at(-1) || null;
  const issueCounts = new Map();
  const issueLabels = new Map();
  for (const record of [...previous, current]) {
    const unique = new Set((record.top3Issues || []).map((issue) => String(issue.issueType || issue.title || issue).trim()).filter(Boolean));
    for (const label of unique) {
      const key = label.toLowerCase();
      issueCounts.set(key, (issueCounts.get(key) || 0) + 1);
      issueLabels.set(key, label);
    }
  }
  const repeatedKey = [...issueCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "";
  const previousMidpoint = bandRangeMidpoint(previousLatest?.estimatedBandRange);
  const currentMidpoint = bandRangeMidpoint(current.estimatedBandRange);
  const changeIndicator = previousLatest && previousMidpoint !== null && currentMidpoint !== null
    ? currentMidpoint > previousMidpoint ? "up" : currentMidpoint < previousMidpoint ? "down" : "unchanged"
    : "new";
  return {
    taskType: current.taskType || taskType,
    currentSubmissionId: current.submissionId,
    currentSubmissionGroupId: resolveSubmissionGroupId(current),
    previousSubmissionId: previousLatest?.submissionId || "",
    previousSubmissionGroupId: previousLatest ? resolveSubmissionGroupId(previousLatest) : "",
    distinctSubmissionCount: representatives.length,
    sameWorkRerunsExcluded: true,
    repeatedIssuesUseDistinctSubmissions: true,
    reportCount: previous.length + 1,
    reportVersionCount: currentVersions.length || 1,
    currentReportVersion: Math.max(1, currentVersions.findIndex((record) => record.submissionId === current.submissionId) + 1),
    reportVersions: (currentVersions.length ? currentVersions : [current]).map((record, index) => ({
      submissionId: record.submissionId || "",
      submissionGroupId: resolveSubmissionGroupId(record),
      parentReportId: record.parentReportId || "",
      version: index + 1,
      dateTime: record.dateTime || "",
      appVersion: record.appVersion || "",
      engineVersion: record.engineVersion || "",
      analysisReason: record.analysisReason || (index ? "explicit-rerun" : "first-analysis"),
      progressEligible: index === 0
    })),
    previousSubmissionCount: previous.length,
    previousEstimatedRange: previousLatest?.estimatedBandRange || "",
    latestEstimatedRange: current.estimatedBandRange || "",
    changeIndicator,
    currentMainRepair: current.mostUrgentRepair || current.mainScoreLimitingFactor || "",
    repeatedIssue: repeatedKey ? issueLabels.get(repeatedKey) : ""
  };
}

function bandRangeMidpoint(value) {
  const range = parseBandRange(value);
  return range.min === null || range.max === null ? null : (range.min + range.max) / 2;
}

// ---------------------------------------------------------------------------
// Explicit rerun ("Re-analyze with Current Engine").
//
// Three separate concerns that were previously collapsed into one hash lookup:
//
//   1. REQUEST IDEMPOTENCY  — keyed on clientSubmissionId. Always active. A retried click, a
//      restart, or a second request carrying the same key returns the same analysis and never calls
//      the provider twice.
//   2. HISTORICAL EXACT-INPUT CACHE — keyed on submissionHash. "You already analysed this exact
//      work; here is the saved report." Correct for a normal submission, wrong for a rerun.
//   3. EXPLICIT RERUN LINEAGE — a verified request to analyse unchanged work again with the current
//      engine, producing a NEW version alongside the old one.
//
// Only (2) is skipped for a verified rerun. (1) and (3) stay in force, so exactly-once quota,
// duplicate-job collapse and restart recovery are unaffected.
//
// Rerun intent is never taken on the client's word. A bare boolean is not accepted: the request must
// name a parent report that actually exists for THIS account, THIS student profile and THIS task
// type, and the reason must normalise to a value the server allows a client to ask for.
// ---------------------------------------------------------------------------

// Reasons a client may request. `engine-upgrade` is derived by the server from the stored
// engineVersion and is deliberately NOT accepted from a browser.
const CLIENT_REQUESTABLE_ANALYSIS_REASONS = new Set(["explicit-rerun"]);

export function normalizeRequestedAnalysisReason(value) {
  const reason = String(value || "").trim().toLowerCase();
  return CLIENT_REQUESTABLE_ANALYSIS_REASONS.has(reason) ? reason : "";
}

// Resolves and validates rerun intent BEFORE the historical hash cache is consulted.
// Returns { verified, parent, requestedReason }. Throws when a parent was explicitly named but does
// not belong to this account/student/task — a forged or foreign id is an error, not a silent
// downgrade. A request with no parentReportId simply is not a rerun, so it can never force a bypass.
export async function resolveRerunIntent(storage, username, payload) {
  const requestedParentId = String(payload?.options?.parentReportId || "").trim();
  const requestedReason = normalizeRequestedAnalysisReason(payload?.options?.analysisReason);
  if (!requestedParentId) return { verified: false, parent: null, requestedReason };

  // Scoped read: same owner, same student profile, same task type. A parent outside that scope is
  // simply not found, so a foreign report id cannot be borrowed.
  const records = await storage.getSubmissionHistory(username, payload.studentProfileId, payload.taskType);
  const parent = records.find((record) =>
    String(record.submissionId || "") === requestedParentId &&
    String(record.username || "") === String(username) &&
    String(record.studentProfileId || "") === String(payload.studentProfileId) &&
    String(record.taskType || "") === String(payload.taskType) &&
    record.analysisValidity !== "invalid"
  ) || null;

  if (!parent) {
    throw statusError("The parent report was not found for this student and task.", 404, "VALIDATION_ERROR");
  }
  // A named, owned, valid parent plus an allowed reason is a verified rerun.
  return { verified: Boolean(requestedReason), parent, requestedReason };
}

async function buildAnalysisLineage(storage, username, payload) {
  const records = await storage.getSubmissionHistory(username, payload.studentProfileId, payload.taskType);
  const requestedParentId = String(payload.options?.parentReportId || "").trim();
  const requestedParent = requestedParentId
    ? records.find((record) => record.submissionId === requestedParentId) || null
    : null;
  if (requestedParentId && !requestedParent) {
    throw statusError("The parent report was not found for this student and task.", 404, "VALIDATION_ERROR");
  }
  const parent = requestedParent || stableProgressSort(records.filter(isValidProgressRecord)).at(-1) || null;
  const engineChanged = Boolean(parent && parent.engineVersion && parent.engineVersion !== payload.engineVersion);
  const sameWork = Boolean(parent && sameStudentWork(parent, {
    username,
    studentProfileId: payload.studentProfileId,
    taskType: payload.taskType,
    publicTaskType: payload.publicEssayType || payload.publicVisualType || "",
    studentWorkFingerprint: payload.studentWorkFingerprint,
    sourceInput: {
      taskType: payload.taskType,
      prompt: payload.prompt,
      writing: payload.writing,
      essayType: payload.publicEssayType || "",
      visualType: payload.publicVisualType || "",
      uploadedVisualContentHash: payload.taskType === "Task 1" ? createImageFingerprint(payload.image) : ""
    }
  }));
  const inputChanged = Boolean(parent && !sameWork);
  // The client's requested reason is honoured only for a VERIFIED rerun (a named, owned, valid
  // parent). Without that, an unchanged submission is not relabelled on the client's say-so.
  const explicitReason = payload.explicitRerun === true
    ? normalizeRequestedAnalysisReason(payload.options?.analysisReason)
    : "";
  const analysisReason = engineChanged && sameWork
    ? "engine-upgrade"
    : inputChanged
      ? "revised-submission"
    : explicitReason === "explicit-rerun"
      ? "explicit-rerun"
      : parent
        ? "revised-submission"
        : "first-analysis";
  const submissionGroupId = sameWork && parent?.submissionGroupId
    ? parent.submissionGroupId
    : createSubmissionGroupId(username, payload);
  return {
    parentReportId: parent?.submissionId || "",
    submissionGroupId,
    analysisReason,
    // Identical work never advances progression, whether it was reopened or explicitly re-analysed.
    progressEligible: !parent || !sameWork,
    // Carried onto the stored record so the commit layer can tell a new VERSION of the same work
    // apart from a duplicate of it.
    explicitRerun: payload.explicitRerun === true && sameWork
  };
}

function buildProgressRepresentatives(records = [], taskType = "") {
  const groups = [];
  for (const record of stableProgressSort(records.filter((item) =>
    isValidProgressRecord(item) && (!taskType || item.taskType === taskType)
  ))) {
    const group = groups.find((items) => sameStudentWork(items[0], record));
    if (group) group.push(record);
    else groups.push([record]);
  }
  return groups.map((items) => items.at(-1));
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
    studentWorkFingerprint: payload.studentWorkFingerprint || createStudentWorkFingerprint(username, payload),
    submissionGroupId: payload.submissionGroupId || createSubmissionGroupId(username, payload),
    pdfProjectionId: createHash("sha256").update(JSON.stringify(analysis)).digest("hex"),
    username,
    ownerAccountId: username,
    studentProfileId: payload.studentProfileId,
    studentDisplayNameSnapshot: payload.studentDisplayNameSnapshot,
    dateTime: new Date().toISOString(),
    taskType: payload.taskType,
    reportLanguage: payload.reportLanguage || "en",
    taskSubtype: payload.taskType === "Task 2" ? (payload.internalEssaySubtypeLabel || payload.essayType) : (payload.internalVisualSubtype || payload.visualType),
    publicTaskType: payload.taskType === "Task 2" ? (payload.publicEssayType || payload.canonicalEssayTypeLabel) : (payload.publicVisualType || payload.visualType),
    internalTaskSubtype: payload.taskType === "Task 2" ? (payload.internalEssaySubtype || payload.canonicalEssayType) : (payload.internalVisualSubtype || ""),
    essayType: payload.taskType === "Task 2" ? (payload.publicEssayType || payload.canonicalEssayTypeLabel || payload.essayType) : "",
    selectedEssayType: payload.taskType === "Task 2" ? (payload.selectedEssayTypeLabel || payload.essayType) : "",
    canonicalEssayType: payload.taskType === "Task 2" ? (payload.canonicalEssayType || "") : "",
    canonicalEssayTypeLabel: payload.taskType === "Task 2" ? (payload.canonicalEssayTypeLabel || payload.essayType) : "",
    internalEssaySubtype: payload.taskType === "Task 2" ? (payload.internalEssaySubtype || payload.canonicalEssayType || "") : "",
    internalEssaySubtypeLabel: payload.taskType === "Task 2" ? (payload.internalEssaySubtypeLabel || payload.essayType || "") : "",
    taskObligations: payload.taskType === "Task 2" ? (payload.taskObligations || []) : [],
    promptClassificationConfidence: payload.taskType === "Task 2" ? (payload.promptClassificationConfidence || "") : "",
    classificationMatch: payload.taskType === "Task 2" ? Boolean(payload.classificationMatch) : true,
    classificationConfirmation: payload.taskType === "Task 2" ? (payload.classificationConfirmation || null) : null,
    analysisValidity: "valid",
    visualType: payload.taskType === "Task 1" ? (payload.publicVisualType || payload.visualType) : "",
    internalVisualSubtype: payload.taskType === "Task 1" ? (payload.internalVisualSubtype || "") : "",
    visualClassificationConfidence: payload.taskType === "Task 1" ? (payload.visualClassificationConfidence || "") : "",
    visualClassificationMatch: payload.taskType === "Task 1" ? Boolean(payload.visualClassificationMatch) : true,
    appVersion: payload.appVersion || ANALYSIS_VERSIONS.appVersion,
    engineVersion: payload.engineVersion || ANALYSIS_VERSIONS.engineVersion,
    rubricVersion: payload.rubricVersion || ANALYSIS_VERSIONS.rubricVersion,
    promptVersion: payload.promptVersion || ANALYSIS_VERSIONS.promptVersion,
    reportSchemaVersion: payload.reportSchemaVersion || ANALYSIS_VERSIONS.reportSchemaVersion,
    parentReportId: payload.parentReportId || "",
    analysisReason: payload.analysisReason || "first-analysis",
    progressEligible: payload.progressEligible !== false,
    // Server-verified marker. The commit layer uses it to allow this record alongside the parent it
    // supersedes instead of collapsing it back onto the identical submissionHash.
    explicitRerun: payload.explicitRerun === true,
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
    top3Issues: Array.isArray(analysis.top3Issues) ? analysis.top3Issues.slice(0, payload.taskType === "Task 2" ? 5 : 3) : [],
    feedbackCards: Array.isArray(analysis.feedbackCards) ? analysis.feedbackCards : [],
    practicePlan: Array.isArray(analysis.practicePlan) ? analysis.practicePlan : [],
    taskResponseOrAchievementRange,
    coherenceRange: getCriteriaRange(criteriaScores, "Coherence & Cohesion"),
    lexicalRange: getCriteriaRange(criteriaScores, "Lexical Resource"),
    grammarRange: getCriteriaRange(criteriaScores, "Grammatical Range & Accuracy"),
    sourceInput: {
      taskType: payload.taskType,
      prompt: payload.prompt,
      writing: payload.writing,
      targetBand: payload.targetBand,
      reportLanguage: payload.reportLanguage || "en",
      essayType: payload.publicEssayType || "",
      visualType: payload.publicVisualType || "",
      imageRequired: payload.taskType === "Task 1" && Boolean(payload.image?.dataUrl),
      uploadedVisualContentHash: payload.taskType === "Task 1" ? createImageFingerprint(payload.image) : ""
    },
    report: analysis
  };
}

function buildDuplicateAnalysisResponse({ user, record, duplicateByHash }) {
  const message = "This exact submission has already been analyzed. No credit or daily limit was used. Opening the existing saved report.";

  return {
    ok: true,
    idempotentReplay: true,
    duplicateSubmission: true,
    duplicateReason: duplicateByHash ? "exact-input-fingerprint" : "idempotent-request-replay",
    creditConsumed: false,
    dailyLimitConsumed: false,
    pdfProjectionId: record.pdfProjectionId || "",
    duplicateActions: ["open-existing-report", "reanalyze-with-current-engine"],
    message,
    analysis: sanitizeAnalysisForClient(record.report || record.analysis),
    user: withExpiryFlags(addDailyLimitFlags(sanitizeUserForClient(user))),
    progressRecord: sanitizeProgressRecordForClient(record)
  };
}

export function createSubmissionHash(username, payload = {}) {
  const publicType = payload.taskType === "Task 1"
    ? payload.publicVisualType || payload.visualType
    : payload.publicEssayType || payload.canonicalEssayTypeLabel || payload.essayType;
  const internalType = payload.taskType === "Task 1"
    ? payload.internalVisualSubtype || payload.visualType
    : payload.internalEssaySubtype || payload.canonicalEssayType || payload.essayType;
  const hashInput = {
    ownerAccountId: normalizeHashText(username).toLowerCase(),
    studentProfileId: normalizeHashText(payload.studentProfileId),
    taskType: normalizeHashText(payload.taskType),
    publicType: normalizeHashText(publicType).toLowerCase(),
    internalType: normalizeHashText(internalType).toLowerCase(),
    internalObligations: (payload.taskObligations || []).map(normalizeHashText),
    prompt: normalizeHashText(payload.prompt),
    writing: normalizeHashText(payload.writing),
    uploadedVisualContentHash: payload.taskType === "Task 1" ? createImageFingerprint(payload.image) : "",
    targetBand: normalizeHashText(payload.targetBand),
    reportLanguage: normalizeReportLanguage(payload.reportLanguage),
    rubricVersion: normalizeHashText(payload.rubricVersion || ANALYSIS_VERSIONS.rubricVersion),
    engineVersion: normalizeHashText(payload.engineVersion || ANALYSIS_VERSIONS.engineVersion),
    promptVersion: normalizeHashText(payload.promptVersion || ANALYSIS_VERSIONS.promptVersion),
    reportSchemaVersion: normalizeHashText(payload.reportSchemaVersion || ANALYSIS_VERSIONS.reportSchemaVersion)
  };

  return createHash("sha256").update(JSON.stringify(hashInput)).digest("hex");
}

export function createStudentWorkFingerprint(username, payload = {}) {
  const publicType = payload.taskType === "Task 1"
    ? payload.publicVisualType || payload.visualType
    : payload.publicEssayType || payload.canonicalEssayTypeLabel || payload.essayType;
  const internalType = payload.taskType === "Task 1"
    ? payload.internalVisualSubtype || payload.visualType
    : payload.internalEssaySubtype || payload.canonicalEssayType || payload.essayType;
  const hashInput = {
    ownerAccountId: normalizeHashText(username).toLowerCase(),
    studentProfileId: normalizeHashText(payload.studentProfileId),
    taskType: normalizeHashText(payload.taskType),
    publicType: normalizeHashText(publicType).toLowerCase(),
    internalType: normalizeHashText(internalType).toLowerCase(),
    prompt: normalizeHashText(payload.prompt),
    writing: normalizeHashText(payload.writing),
    uploadedVisualContentHash: payload.taskType === "Task 1" ? createImageFingerprint(payload.image) : ""
  };
  return createHash("sha256").update(JSON.stringify(hashInput)).digest("hex");
}

export function createSubmissionGroupId(username, payload = {}) {
  const fingerprint = payload.studentWorkFingerprint || createStudentWorkFingerprint(username, payload);
  return `work-${createHash("sha256").update(`${normalizeHashText(username).toLowerCase()}:${fingerprint}`).digest("hex").slice(0, 24)}`;
}

function sameStudentWork(left = {}, right = {}) {
  if (left.submissionGroupId && right.submissionGroupId) {
    return left.submissionGroupId === right.submissionGroupId;
  }
  if (left.studentWorkFingerprint && right.studentWorkFingerprint) {
    return left.studentWorkFingerprint === right.studentWorkFingerprint;
  }
  const a = left.sourceInput || {};
  const b = right.sourceInput || {};
  if (!normalizeHashText(a.prompt) || !normalizeHashText(a.writing) || !normalizeHashText(b.prompt) || !normalizeHashText(b.writing)) {
    return false;
  }
  return normalizeHashText(left.studentProfileId) === normalizeHashText(right.studentProfileId) &&
    normalizeHashText(left.taskType || a.taskType) === normalizeHashText(right.taskType || b.taskType) &&
    normalizeHashText(a.prompt) === normalizeHashText(b.prompt) &&
    normalizeHashText(a.writing) === normalizeHashText(b.writing) &&
    normalizeHashText(a.uploadedVisualContentHash) === normalizeHashText(b.uploadedVisualContentHash);
}

function resolveSubmissionGroupId(record = {}) {
  if (record.submissionGroupId) return String(record.submissionGroupId);
  if (record.studentWorkFingerprint) return `legacy-${String(record.studentWorkFingerprint).slice(0, 24)}`;
  return "";
}

function createImageFingerprint(image) {
  if (!image?.dataUrl) return "";
  const imageInput = {
    mimeType: normalizeHashText(image.mimeType).toLowerCase(),
    dataHash: createHash("sha256").update(String(image.dataUrl || "")).digest("hex")
  };
  return createHash("sha256").update(JSON.stringify(imageInput)).digest("hex");
}

function normalizeReportLanguage(value) {
  return String(value || "").toLowerCase() === "th" ? "th" : "en";
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

// Persists the admin-only canonical QA snapshot for a newly saved report. Uses the PRE-projection
// analysis object, so the full canonical layer is captured before it is stripped for the student view.
// Never throws (a QA-snapshot failure must never fail a student's analysis), never calls the provider,
// never touches quota, and never modifies the saved report.
async function persistQaSnapshot({ rootDir, analysis, savedRecord, payload }) {
  try {
    if (!savedRecord?.submissionId) return;
    const qaStore = createQaCanonicalStore({ rootDir });
    await qaStore.write(savedRecord.submissionId, buildQaSnapshot({ analysis, savedRecord, payload }));
    await qaStore.prune(process.env.DIAGNOSTIC_QA_EXPORT_RETENTION_DAYS);
  } catch (error) {
    console.error("[diagnostic-lab] canonical QA snapshot failed", { message: truncate(String(error?.message || ""), 160) });
  }
}

// ---- Admin account-safety rails -------------------------------------------------------------
// An admin may never remove their own console access, and the system must always retain at least one
// usable admin account.
// Session revocation and the admin audit are provided by `services/adminSecurity.js`, which persists
// both to the data directory so they survive a process restart. The previous in-memory deny-list and
// in-memory audit array have been removed: neither survived a restart, which is exactly the property
// the security requirement needs.
export async function isSessionRevoked(username, issuedAtMs = 0, sessionVersion = 0) {
  return currentAdminSecurity().isSessionRevoked(username, issuedAtMs, sessionVersion);
}

function normalizeQaQuery(value) {
  return String(value || "").trim().toLowerCase();
}

// Matches a search term against safe metadata only (name, ids, date, task/essay type) — never content.
function qaMetadataMatches(meta, query) {
  return [meta.studentName, meta.studentId, meta.reportId, meta.date, meta.taskType, meta.essayOrVisualType]
    .some((field) => String(field || "").toLowerCase().includes(query));
}

function sanitizeDownloadName(value) {
  return String(value || "report").normalize("NFKD").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 40) || "report";
}

// Safe admin audit event for a QA export: who exported which report — never the exported content.
async function auditQaExport(storage, request, record, security = null) {
  const session = await getSessionUser(request, storage).catch(() => null);
  // A QA export is a privileged read of a student's report, so it is recorded in the durable admin
  // audit as well as the usage trail — safe metadata only, never the exported content.
  await (security || currentAdminSecurity()).appendAudit({
    action: "qa-export",
    adminAccountId: session?.user?.username || "admin",
    targetId: String(record.submissionId || record.reportId || ""),
    result: "ok",
    metadata: { taskType: String(record.taskType || "") }
  }).catch(() => null);
  if (typeof storage.appendAuditLog !== "function") return;
  await storage.appendAuditLog({
    username: session?.user?.username || "admin",
    role: session?.user?.role || "admin",
    taskType: String(record.taskType || ""),
    taskSubtype: "canonical-qa-export",
    openAiCalled: false,
    quotaDeducted: false,
    duplicateCacheUsed: false,
    blocked: false,
    reason: `qa-export:${String(record.submissionId || "").slice(0, 24)}`
  }).catch(() => null);
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
  return storage.appendAuditLog(buildAnalyzeAuditEntry(user, payload, details)).catch(() => null);
}

function buildAnalyzeAuditEntry(user, payload = {}, details = {}) {
  return {
    username: user?.username || "",
    role: user?.role || "student",
    taskType: payload.taskType || "",
    taskSubtype: payload.taskType === "Task 1"
      ? payload.internalVisualSubtype || payload.visualType
      : payload.internalEssaySubtype || payload.essayType,
    timestamp: new Date().toISOString(),
    openAiCalled: Boolean(details.openAiCalled),
    quotaDeducted: Boolean(details.quotaDeducted),
    duplicateCacheUsed: Boolean(details.duplicateCacheUsed),
    blocked: Boolean(details.blocked),
    reason: details.reason || ""
  };
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
  for (const key of ["selectedEssayType", "detectedEssayType", "promptClassificationConfidence", "classificationMatch"]) {
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
