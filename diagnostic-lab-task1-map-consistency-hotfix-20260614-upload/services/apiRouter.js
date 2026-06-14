import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createAnalysisJobStore } from "./analysisJobStore.js";
import { analyzeWriting, getAnalyzerHealth, runProviderHealthCheck } from "./aiAnalyzer.js";
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

const TASK1_VISUAL_TYPES = new Set([
  "Line Graph",
  "Bar Chart",
  "Pie Chart",
  "Table",
  "Process Diagram",
  "Process",
  "Map",
  "Mixed Graph",
  "Mixed Chart"
]);

const TASK2_ESSAY_TYPES = new Set([
  "Opinion Essay",
  "Opinion",
  "Discuss Both Views",
  "Discussion Essay",
  "Problem & Solution",
  "Problem / Solution",
  "Problem/Solution",
  "Cause & Solution",
  "Causes & Solutions",
  "Advantage / Disadvantage",
  "Advantage/Disadvantage",
  "Direct Question"
]);

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
          durableStorage: Boolean(storage.isDurable)
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
          user: withExpiryFlags(sanitizeUserForClient(session.user))
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
        const records = await storage.getSubmissionHistory(session.user.username);
        return jsonResponse(200, { ok: true, records });
      }

      const analyzeStatusMatch = apiPath.match(/^\/api\/analyze-status\/([^/]+)$/);
      if (method === "GET" && analyzeStatusMatch) {
        return await handleAnalyzeStatus(request, storage, jobStore, decodeURIComponent(analyzeStatusMatch[1]));
      }

      if (method === "POST" && apiPath === "/api/analyze") {
        return await handleAnalyze(request, storage, jobStore);
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

async function handleLogin(request, storage) {
  const body = readJsonBody(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const user = await storage.getUserByUsername(username);

  if (!user || user.status === "disabled" || user.password !== password) {
    throw statusError("Username or password is incorrect. Please contact Kru Pom IELTS.", 401, "NOT_AUTHENTICATED");
  }

  return jsonResponse(200, {
    ok: true,
    authenticated: true,
    user: withExpiryFlags(sanitizeUserForClient(user))
  }, {
    "Set-Cookie": buildSessionCookie(createSessionToken(user.username))
  });
}

async function handleAnalyze(request, storage, jobStore) {
  const session = await requireSession(request, storage);
  const user = session.user;

  if (isAccessExpired(user)) {
    throw statusError(ACCESS_EXPIRED_MESSAGE, 403, "ACCESS_EXPIRED");
  }

  if (remainingAnalyses(user) <= 0) {
    throw statusError("Your early access quota has been used. Please contact Kru Pom IELTS to extend access.", 403, "QUOTA_USED");
  }

  const body = readJsonBody(request);
  const payload = validateAnalyzePayload(body);
  const submissionHash = createSubmissionHash(user.username, payload);
  const idempotencyKey = payload.clientSubmissionId;
  const existingRecord = idempotencyKey
    ? await storage.findSubmissionByKey(user.username, idempotencyKey)
    : null;
  const duplicateRecord = existingRecord || await storage.findSubmissionByHash?.(user.username, submissionHash);

  if (duplicateRecord) {
    const latestUser = await storage.getUserByUsername(user.username);
    return jsonResponse(200, buildDuplicateAnalysisResponse({
      user: latestUser || user,
      record: duplicateRecord,
      duplicateByHash: duplicateRecord.submissionHash === submissionHash && duplicateRecord.clientSubmissionId !== idempotencyKey
    }));
  }

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

  const analysis = await analyzeWriting(payload);
  const progressRecord = buildSubmissionHistoryRecord(user.username, payload, analysis, submissionHash);
  const savedRecord = await storage.appendSubmission(progressRecord).catch((error) => {
    error.errorCode = error.errorCode || "INTERNAL_ERROR";
    error.debugHint = error.debugHint || "Storage append failed after analysis. Check DIAGNOSTIC_STORAGE_ADAPTER and serverless filesystem permissions.";
    throw error;
  });
  if (savedRecord !== progressRecord) {
    const latestUser = await storage.getUserByUsername(user.username);
    return jsonResponse(200, buildDuplicateAnalysisResponse({
      user: latestUser || user,
      record: savedRecord,
      duplicateByHash: savedRecord.submissionHash === submissionHash && savedRecord.clientSubmissionId !== idempotencyKey
    }));
  }

  const updatedUser = await storage.incrementUsage(user.username).catch((error) => {
    error.errorCode = error.errorCode || "INTERNAL_ERROR";
    error.debugHint = error.debugHint || "Quota update failed after analysis. Check DIAGNOSTIC_STORAGE_ADAPTER and serverless filesystem permissions.";
    throw error;
  });

  return jsonResponse(200, {
    ok: true,
    duplicateSubmission: false,
    analysis,
    user: withExpiryFlags(sanitizeUserForClient(updatedUser)),
    progressRecord: savedRecord
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
      analysis: job.analysis,
      user: job.user,
      progressRecord: job.progressRecord,
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
    if (!user || user.status === "disabled") {
      throw statusError("Please log in to use the diagnostic lab.", 401, "NOT_AUTHENTICATED");
    }
    if (isAccessExpired(user)) {
      throw statusError(ACCESS_EXPIRED_MESSAGE, 403, "ACCESS_EXPIRED");
    }
    if (remainingAnalyses(user) <= 0) {
      throw statusError("Your early access quota has been used. Please contact Kru Pom IELTS to extend access.", 403, "QUOTA_USED");
    }

    const submissionHash = job.payload?.submissionHash || createSubmissionHash(user.username, job.payload || {});
    const existingRecord = job.payload?.clientSubmissionId
      ? await storage.findSubmissionByKey(user.username, job.payload.clientSubmissionId)
      : null;
    const duplicateRecord = existingRecord || await storage.findSubmissionByHash?.(user.username, submissionHash);

    if (duplicateRecord) {
      const latestUser = await storage.getUserByUsername(user.username);
      const duplicatePayload = buildDuplicateAnalysisResponse({
        user: latestUser || user,
        record: duplicateRecord,
        duplicateByHash: duplicateRecord.submissionHash === submissionHash && duplicateRecord.clientSubmissionId !== job.payload?.clientSubmissionId
      });
      const completeJob = {
        ...job,
        status: "complete",
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        analysis: duplicatePayload.analysis,
        user: duplicatePayload.user,
        progressRecord: duplicatePayload.progressRecord,
        duplicateSubmission: duplicatePayload.duplicateSubmission,
        message: duplicatePayload.message
      };
      await jobStore.set(jobId, completeJob);
      return completeJob;
    }

    const analysis = await analyzeWriting(job.payload);
    const progressRecord = buildSubmissionHistoryRecord(user.username, job.payload, analysis, submissionHash);
    const savedRecord = await storage.appendSubmission(progressRecord);
    const updatedUser = savedRecord === progressRecord
      ? await storage.incrementUsage(user.username)
      : await storage.getUserByUsername(user.username);

    const completeJob = {
      ...job,
      status: "complete",
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      analysis: savedRecord.report || savedRecord.analysis,
      user: withExpiryFlags(sanitizeUserForClient(updatedUser || user)),
      progressRecord: savedRecord,
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

  if (method === "POST" && apiPath === "/api/admin/users") {
    const body = readJsonBody(request);
    const user = await storage.createUser(body);
    return jsonResponse(201, { ok: true, user: sanitizeUserForAdmin(user) });
  }

  const userMatch = apiPath.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (method === "PATCH" && userMatch) {
    const username = decodeURIComponent(userMatch[1]);
    const body = readJsonBody(request);
    const user = await storage.updateUser(username, body);
    return jsonResponse(200, { ok: true, user: sanitizeUserForAdmin(user) });
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
  const providedSecret = getHeader(request.headers, "x-admin-secret") || bearerToken(getHeader(request.headers, "authorization"));
  if (process.env.ADMIN_SECRET && providedSecret === process.env.ADMIN_SECRET) return;

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
  if (!user || user.status === "disabled") return null;

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
  const wordCount = countWords(writing);

  if (!prompt || !writing) {
    throw statusError("Please provide both the prompt and student writing.", 400, "VALIDATION_ERROR");
  }

  if (prompt.length < 10) {
    throw statusError("Please paste the full IELTS question or visual description before analyzing.", 400, "VALIDATION_ERROR");
  }

  if (taskType === "Task 1" && wordCount < 40) {
    throw statusError("Task 1 writing is too short for a useful diagnostic. Please paste the full response.", 400, "VALIDATION_ERROR");
  }

  if (taskType === "Task 2" && wordCount < 80) {
    throw statusError("Task 2 writing is too short for a useful diagnostic. Please paste the full essay.", 400, "VALIDATION_ERROR");
  }

  const essayType = String(body.essayType || "");
  const visualType = String(body.visualType || "");

  if (taskType === "Task 1" && (!TASK1_VISUAL_TYPES.has(visualType) || visualType === "Not Sure")) {
    throw statusError("Please choose the Task 1 visual type before analyzing.", 400, "VALIDATION_ERROR");
  }

  if (taskType === "Task 2" && (!TASK2_ESSAY_TYPES.has(essayType) || essayType === "Not Sure")) {
    throw statusError("Please choose the Task 2 essay type before analyzing.", 400, "VALIDATION_ERROR");
  }

  const payload = {
    taskType,
    prompt,
    writing,
    targetBand: String(body.targetBand || "7.0"),
    essayType,
    visualType,
    clientSubmissionId: normalizeIdempotencyKey(body.clientSubmissionId || body.idempotencyKey),
    options: body.options || {},
    image: null
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

function countWords(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function buildSubmissionHistoryRecord(username, payload, analysis, submissionHash = "") {
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
    username,
    dateTime: new Date().toISOString(),
    taskType: payload.taskType,
    taskSubtype: payload.taskType === "Task 2" ? payload.essayType : payload.visualType,
    essayType: payload.taskType === "Task 2" ? payload.essayType : "",
    visualType: payload.taskType === "Task 1" ? payload.visualType : "",
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
    report: analysis
  };
}

function buildDuplicateAnalysisResponse({ user, record, duplicateByHash }) {
  const message = duplicateByHash
    ? "This essay was already analyzed. Showing the existing report."
    : "This analysis request was already processed. Showing the existing report.";

  return {
    ok: true,
    idempotentReplay: true,
    duplicateSubmission: Boolean(duplicateByHash),
    message,
    analysis: record.report || record.analysis,
    user: withExpiryFlags(sanitizeUserForClient(user)),
    progressRecord: record
  };
}

function createSubmissionHash(username, payload = {}) {
  const taskSubtype = payload.taskType === "Task 1" ? payload.visualType : payload.essayType;
  const hashInput = {
    username: normalizeHashText(username).toLowerCase(),
    taskType: normalizeHashText(payload.taskType),
    taskSubtype: normalizeHashText(taskSubtype).toLowerCase(),
    prompt: normalizeHashText(payload.prompt),
    writing: normalizeHashText(payload.writing),
    options: normalizeHashOptions(payload.options),
    image: payload.taskType === "Task 1" ? createImageFingerprint(payload.image) : ""
  };

  return createHash("sha256").update(JSON.stringify(hashInput)).digest("hex");
}

function createImageFingerprint(image) {
  if (!image?.dataUrl) return "";
  const imageInput = {
    name: normalizeHashText(image.name).toLowerCase(),
    mimeType: normalizeHashText(image.mimeType).toLowerCase(),
    size: Number(image.size || 0) || 0,
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
  return Math.max(0, Number(user?.quota || 0) - Number(user?.used || 0));
}

function isAccessExpired(user) {
  const timestamp = getExpiryTimestamp(user?.expiryDate);
  return Number.isFinite(timestamp) && Date.now() > timestamp;
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
    debugHint: error?.debugHint || normalized.payload.debugHint || ""
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
