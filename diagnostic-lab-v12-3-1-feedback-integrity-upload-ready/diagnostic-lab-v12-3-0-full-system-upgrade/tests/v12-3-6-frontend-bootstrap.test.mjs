// V12.3.6 frontend bootstrap stability.
//
// This suite reproduces the V12.3.5 production outage (a browser module returning 404, leaving the
// page a permanent blank background) against the REAL server, and proves the fix. It is deliberately
// an HTTP-level and file-level test, because unit and syntax tests cannot show whether every browser
// module is actually served through the running Node server.
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractRelativeImports,
  resolveBrowserModuleGraph,
  resolvePublicAssetManifest,
  validatePublicAssetGraph
} from "../services/publicAssetGraph.js";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- The resolved manifest is complete and leaks nothing server-only ---
const manifest = await resolvePublicAssetManifest(appRoot);
const requiredModules = [
  "script.js",
  "services/canonicalAnalysis.js",
  "domain/canonicalAnalysis.js",
  "domain/feedbackIntegrity.js",
  "domain/revisionQuality.js",
  "domain/reportViewModels.js",
  "domain/textIntegrity.js",
  "domain/pdfRetry.js",
  "domain/paragraphEvidence.js"
];
for (const relative of requiredModules) {
  assert.ok(manifest.modules.includes(relative), `${relative} must be in the resolved browser module graph`);
}
for (const secret of ["services/storage.js", "services/aiAnalyzer.js", "services/apiRouter.js", "services/promptBuilder.js"]) {
  assert.ok(!manifest.files.includes(secret), `${secret} must never be public`);
}
const preflight = await validatePublicAssetGraph(appRoot);
assert.equal(preflight.ok, true, `preflight must pass: ${JSON.stringify(preflight)}`);
assert.deepEqual(preflight.missing, []);
assert.deepEqual(preflight.exposedSecrets, []);
assert.deepEqual(preflight.escaped, []);

// --- A missing module must be a release-blocking preflight failure ---
// Build a throwaway fixture whose entrypoint imports a module that does not exist — exactly the
// V12.3.5 shape — and prove the resolver throws a precise error and the preflight reports not-ok.
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "diag-graph-"));
try {
  await writeFile(path.join(fixtureRoot, "script.js"), 'import "./domain/ghost.js";\n', "utf8");
  await assert.rejects(
    () => resolveBrowserModuleGraph(fixtureRoot),
    /incomplete|does not exist/i,
    "a missing imported module must throw a precise, actionable error"
  );
  const brokenPreflight = await validatePublicAssetGraph(fixtureRoot);
  assert.equal(brokenPreflight.ok, false, "preflight must report not-ok when a module is missing");
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
// The extractor recognises the exact import that broke production.
const feedbackSource = await readFile(path.join(appRoot, "domain/feedbackIntegrity.js"), "utf8");
assert.ok(extractRelativeImports(feedbackSource).includes("./revisionQuality.js"),
  "feedbackIntegrity.js must be seen to import ./revisionQuality.js");

// --- Real server: every browser module in the graph returns 200 JavaScript ---
process.env.PORT = "0";
process.env.HOST = "127.0.0.1";
process.env.DIAGNOSTIC_ALLOW_LOCAL_ENGINE = "true";
const { server } = await import("../server.js");
if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const indexResponse = await fetch(`${base}/`);
  assert.equal(indexResponse.status, 200);
  assert.match(indexResponse.headers.get("content-type") || "", /text\/html/);
  const indexHtml = await indexResponse.text();
  const entryMatch = indexHtml.match(/<script[^>]+type="module"[^>]+src="([^"?]+)/);
  assert.ok(entryMatch, "index.html must reference a module entrypoint");

  // Recursively fetch the entire browser module graph exactly as a browser would.
  const visited = new Set();
  const queue = [`/${entryMatch[1].replace(/^\.?\//, "")}`];
  const fetchedModules = [];
  while (queue.length) {
    const modulePath = queue.shift();
    if (visited.has(modulePath)) continue;
    visited.add(modulePath);
    const response = await fetch(`${base}${modulePath}`);
    assert.equal(response.status, 200, `${modulePath} must return 200 (was ${response.status})`);
    const contentType = response.headers.get("content-type") || "";
    assert.match(contentType, /application\/javascript/, `${modulePath} must be served as JavaScript, was ${contentType}`);
    assert.doesNotMatch(contentType, /application\/json/, `${modulePath} must not be a JSON 404 body`);
    const source = await response.text();
    fetchedModules.push(modulePath);
    for (const specifier of extractRelativeImports(source)) {
      const resolved = new URL(specifier, `${base}${modulePath}`).pathname;
      assert.ok(!resolved.includes(".."), `${specifier} must not escape the app root`);
      if (!visited.has(resolved)) queue.push(resolved);
    }
  }

  // The complete fetched graph must contain the modules the outage was about.
  for (const relative of requiredModules) {
    assert.ok(fetchedModules.includes(`/${relative}`), `/${relative} must have been fetched and returned 200`);
  }

  // Headers: nosniff and revalidating cache on a module.
  const moduleHead = await fetch(`${base}/domain/revisionQuality.js`);
  assert.equal(moduleHead.headers.get("x-content-type-options"), "nosniff");
  assert.match(moduleHead.headers.get("cache-control") || "", /no-cache|no-store/);

  // A genuine server-only module stays 404 JSON.
  const secretResponse = await fetch(`${base}/services/storage.js`);
  assert.equal(secretResponse.status, 404);
  assert.match(secretResponse.headers.get("content-type") || "", /application\/json/);

  // Readiness endpoint reports a healthy frontend without calling OpenAI or touching student data.
  const readiness = await fetch(`${base}/api/readiness`);
  assert.equal(readiness.status, 200);
  const readinessBody = await readiness.json();
  assert.equal(readinessBody.frontendPreflightPassed, true);
  assert.equal(readinessBody.appVersion, "12.4.1");
  assert.ok(readinessBody.publicModuleCount >= requiredModules.length);

  // API routes still return JSON, never HTML.
  const session = await fetch(`${base}/api/session`);
  assert.match(session.headers.get("content-type") || "", /application\/json/);
  const health = await fetch(`${base}/api/health`);
  assert.match(health.headers.get("content-type") || "", /application\/json/);
} finally {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

// --- Blank-screen fail-safe is present in index.html and wired in script.js ---
const indexSource = await readFile(path.join(appRoot, "index.html"), "utf8");
assert.match(indexSource, /__DIAGNOSTIC_APP_BOOTED__/, "index.html must define the boot flag watchdog");
assert.match(indexSource, /startup-error-panel/, "index.html must contain a controlled startup-error panel");
assert.match(indexSource, /<noscript>/i, "index.html must include a noscript notice");
assert.match(indexSource, /Contact Kru Pom IELTS/, "the fail-safe must offer a contact route");
// The watchdog must run before the module entrypoint.
assert.ok(indexSource.indexOf("__DIAGNOSTIC_APP_BOOTED__") < indexSource.indexOf('type="module"'),
  "the watchdog must be declared before the module script");
const scriptSource = await readFile(path.join(appRoot, "script.js"), "utf8");
assert.match(scriptSource, /window\.__DIAGNOSTIC_APP_BOOTED__\s*=\s*true/, "script.js must set the boot flag after startup");
assert.match(scriptSource, /checkSession\(\)\.finally\(markApplicationBooted\)/, "the boot flag must be set after session bootstrap settles");

// --- Static preview built by `npm run build:static` contains the full graph ---
const previewRoot = path.join(appRoot, "netlify-static-preview");
if (await pathExists(previewRoot)) {
  for (const relative of requiredModules) {
    assert.ok(await pathExists(path.join(previewRoot, relative)), `static preview must include ${relative}`);
  }
  // Recursively validate the preview's own module graph resolves.
  const previewModules = await resolveBrowserModuleGraph(previewRoot);
  for (const relative of requiredModules) {
    assert.ok(previewModules.includes(relative), `static preview graph must resolve ${relative}`);
  }
  // No server-only file leaked into the preview.
  const previewFiles = await listAllFiles(previewRoot);
  for (const forbidden of ["services/storage.js", "services/aiAnalyzer.js", "services/apiRouter.js"]) {
    assert.ok(!previewFiles.includes(forbidden), `static preview must not contain ${forbidden}`);
  }
}

async function pathExists(target) {
  return Boolean(await stat(target).catch(() => null));
}

async function listAllFiles(root) {
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else out.push(path.relative(root, abs).split(path.sep).join("/"));
    }
  }
  await walk(root);
  return out;
}

console.log("V12.3.6 frontend bootstrap: real-server module graph 200, missing-module preflight block, headers, readiness, blank-screen fail-safe and static-preview completeness verified.");
