import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiHandler } from "./services/apiRouter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const PORT = Number(process.env.PORT || 4174);
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const handleApiRequest = createApiHandler({ rootDir: __dirname });

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

  const allowedPublicFiles = new Set([
    path.resolve(__dirname, "index.html"),
    path.resolve(__dirname, "admin.html"),
    path.resolve(__dirname, "styles.css"),
    path.resolve(__dirname, "script.js"),
    path.resolve(__dirname, "wordCount.js"),
    path.resolve(__dirname, "admin.js"),
    path.resolve(__dirname, "domain/index.js"),
    path.resolve(__dirname, "domain/task1Classification.js"),
    path.resolve(__dirname, "domain/task2Safety.js"),
    path.resolve(__dirname, "domain/canonicalAnalysis.js"),
    path.resolve(__dirname, "services/canonicalAnalysis.js"),
    path.resolve(__dirname, "services/task2Safety.js"),
    path.resolve(__dirname, "services/analysisVersions.js")
  ]);
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
  res.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
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
