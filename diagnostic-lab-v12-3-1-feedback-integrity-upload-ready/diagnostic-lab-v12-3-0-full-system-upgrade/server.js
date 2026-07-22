import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiHandler } from "./services/apiRouter.js";
import { resolvePublicFilePaths, validatePublicAssetGraph } from "./services/publicAssetGraph.js";
import { ANALYSIS_VERSIONS } from "./services/analysisVersions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const PORT = Number(process.env.PORT || 4174);
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const handleApiRequest = createApiHandler({ rootDir: __dirname });
const FRONTEND_ASSET_MANIFEST_VERSION = "frontend-bootstrap-v12.3.6";

// The public file set is resolved once at startup from the browser module graph (single source of
// truth shared with the static-preview build). A new browser module becomes servable automatically.
const frontendPreflight = await validatePublicAssetGraph(__dirname);
const allowedPublicFiles = new Set(frontendPreflight.ok ? await resolvePublicFilePaths(__dirname) : []);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // Frontend readiness: a lightweight, non-scoring, non-authenticated liveness probe. Never calls
    // OpenAI and never inspects student data. Returns 503 when the public module graph is incomplete.
    if (url.pathname === "/api/readiness" && req.method === "GET") {
      sendJson(res, frontendPreflight.ok ? 200 : 503, {
        ok: frontendPreflight.ok,
        appVersion: ANALYSIS_VERSIONS.appVersion,
        frontendAssetManifestVersion: FRONTEND_ASSET_MANIFEST_VERSION,
        publicModuleCount: frontendPreflight.moduleCount,
        frontendPreflightPassed: frontendPreflight.ok,
        frontendEntrypoints: frontendPreflight.entrypoints
      });
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      const body = await readRawBody(req);
      const apiResponse = await handleApiRequest({
        method: req.method,
        path: `${url.pathname}${url.search}`,
        headers: req.headers,
        body
      });
      sendApiResponse(res, apiResponse);
      return;
    }

    if (req.method !== "GET") {
      sendJson(res, 405, { ok: false, error: "Method not allowed" });
      return;
    }

    if ((url.pathname === "/admin" || url.pathname === "/admin.html") && !(await canViewAdminPage(req.headers))) {
      sendJson(res, 403, { ok: false, error: "Admin access is required." });
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    const status = error.statusCode || 500;
    const errorCode = error.errorCode || (status === 413 ? "PAYLOAD_TOO_LARGE" : "INTERNAL_ERROR");
    const message = status >= 500
      ? "Analysis could not be completed. Please try again or contact Kru Pom IELTS."
      : error.message;
    sendJson(res, status, { ok: false, error: message, errorCode });
  }
});

// Startup preflight: refuse to accept traffic with an incomplete public module graph, so the outage
// where the page could only render a blank background can never reach a user again.
if (!frontendPreflight.ok) {
  console.error("[diagnostic-lab] FRONTEND PREFLIGHT FAILED — refusing to start.", {
    appVersion: ANALYSIS_VERSIONS.appVersion,
    missing: frontendPreflight.missing,
    escaped: frontendPreflight.escaped,
    exposedSecrets: frontendPreflight.exposedSecrets,
    error: frontendPreflight.error
  });
  process.exit(1);
}

console.log("[diagnostic-lab] frontend preflight passed.", {
  appVersion: ANALYSIS_VERSIONS.appVersion,
  publicModuleCount: frontendPreflight.moduleCount,
  frontendEntrypoints: frontendPreflight.entrypoints
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  console.log(`IELTS Diagnostic Lab running at http://${displayHost}:${PORT}/`);
});

async function readRawBody(req) {
  let total = 0;
  const chunks = [];

  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_REQUEST_BYTES) {
      const error = new Error("Submission is too large. Keep Task 1 images under 5 MB.");
      error.statusCode = 413;
      error.errorCode = "PAYLOAD_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function serveStatic(urlPath, res) {
  const normalizedPath = urlPath === "/admin" ? "/admin.html" : urlPath;
  const safePath = decodeURIComponent(normalizedPath === "/" ? "/index.html" : normalizedPath);
  const filePath = path.resolve(__dirname, `.${safePath}`);

  if (filePath !== __dirname && !filePath.startsWith(`${__dirname}${path.sep}`)) {
    sendJson(res, 403, { ok: false, error: "Forbidden" });
    return;
  }

  const assetsRoot = path.resolve(__dirname, "assets");
  const isAsset = filePath.startsWith(`${assetsRoot}${path.sep}`);

  if (!allowedPublicFiles.has(filePath) && !isAsset) {
    sendJson(res, 404, { ok: false, error: "Not found" });
    return;
  }

  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat || !fileStat.isFile()) {
    sendJson(res, 404, { ok: false, error: "Not found" });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const bytes = await readFile(filePath);
  res.writeHead(200, {
    "content-type": mimeTypes[ext] || "application/octet-stream",
    // Never let a browser sniff a served module into a different type.
    "x-content-type-options": "nosniff",
    // During private early access, avoid mixed-version frontends: an old HTML must not load a new,
    // incomplete module graph and a new HTML must not run against stale modules. Assets in /assets
    // (fonts) are safe to cache. HTML/JS/CSS always revalidate.
    "cache-control": isAsset ? "public, max-age=86400" : "no-cache, must-revalidate"
  });
  res.end(bytes);
}

async function canViewAdminPage(headers) {
  const apiResponse = await handleApiRequest({
    method: "GET",
    path: "/api/session",
    headers,
    body: ""
  });
  if (apiResponse.statusCode !== 200) return false;

  const payload = JSON.parse(apiResponse.body || "{}");
  return Boolean(payload?.authenticated && payload?.user?.role === "admin");
}

function sendApiResponse(res, response) {
  res.writeHead(response.statusCode, response.headers || {});
  res.end(response.body || "");
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

export { server };
