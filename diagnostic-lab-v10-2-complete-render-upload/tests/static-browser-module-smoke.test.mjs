import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(path.join(tmpdir(), "diagnostic-static-smoke-"));
const port = await getAvailablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["server.js"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    DIAGNOSTIC_DATA_DIR: dataDir,
    DIAGNOSTIC_REQUIRE_FULL_ENGINE: "false",
    OPENAI_API_KEY: "",
    OPENAI_MODEL: ""
  },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitUntilHealthy();
  const publicFiles = [
    ["/", "text/html"],
    ["/script.js", "application/javascript"],
    ["/wordCount.js", "application/javascript"],
    ["/services/canonicalAnalysis.js", "application/javascript"],
    ["/services/task1Safety.js", "application/javascript"],
    ["/services/task2Safety.js", "application/javascript"]
  ];

  for (const [urlPath, expectedType] of publicFiles) {
    const response = await fetch(`${baseUrl}${urlPath}`);
    assert.equal(response.status, 200, `${urlPath} must be publicly loadable`);
    assert.match(response.headers.get("content-type") || "", new RegExp(expectedType));
  }

  const html = await (await fetch(`${baseUrl}/`)).text();
  assert.match(html, /diagnostic-v10-2-frontend-recovery/);
  assert.match(html, /could not finish loading/);
  console.log("Static browser module smoke: page shell and full frontend import graph are publicly loadable.");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
  await rm(dataDir, { recursive: true, force: true });
}

async function waitUntilHealthy() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Local server did not become healthy for the static-module smoke test.");
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const portNumber = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => error ? reject(error) : resolve(portNumber));
    });
  });
}
