import path from "node:path";
import { processAnalyzeJob, verifyWorkerToken } from "../../services/apiRouter.js";

const rootDir = path.resolve(
  process.env.DIAGNOSTIC_DATA_DIR ||
  process.env.LAMBDA_TASK_ROOT ||
  process.cwd()
);

export async function handler(event) {
  const body = parseBody(event);
  const jobId = String(body.jobId || "").trim();
  const workerToken = getHeader(event.headers, "x-worker-token");

  if (!jobId || !verifyWorkerToken(jobId, workerToken)) {
    return jsonResponse(403, { ok: false, error: "Worker access denied.", errorCode: "NOT_AUTHENTICATED" });
  }

  await processAnalyzeJob({ jobId, rootDir });
  return jsonResponse(200, { ok: true });
}

function parseBody(event) {
  const raw = event?.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : String(event?.body || "");
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function getHeader(headers = {}, name) {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === target) return Array.isArray(value) ? value[0] : value;
  }
  return "";
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  };
}
