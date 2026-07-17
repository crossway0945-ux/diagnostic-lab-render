import path from "node:path";
import { createApiHandler } from "../../services/apiRouter.js";

const rootDir = path.resolve(
  process.env.DIAGNOSTIC_DATA_DIR ||
  process.env.LAMBDA_TASK_ROOT ||
  process.cwd()
);
const handleApiRequest = createApiHandler({ rootDir });

export async function handler(event) {
  const pathFromEvent = event.rawUrl
    ? `${new URL(event.rawUrl).pathname}${new URL(event.rawUrl).search}`
    : event.path || "/api";

  return handleApiRequest({
    method: event.httpMethod || "GET",
    path: pathFromEvent,
    headers: event.headers || {},
    body: event.body || "",
    isBase64Encoded: Boolean(event.isBase64Encoded)
  });
}
