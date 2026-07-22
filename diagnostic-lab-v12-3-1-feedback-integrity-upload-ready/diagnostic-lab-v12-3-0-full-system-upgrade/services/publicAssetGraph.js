// Single source of truth for every file the browser is allowed to fetch.
//
// The browser loads `script.js` (and `admin.js`) as ES modules. Each of those pulls in more modules
// through static relative imports, and the whole graph must be publicly served or the page cannot
// boot. Previously two hand-maintained lists — one in server.js, one in build-static-preview.mjs —
// had to be updated by hand whenever a module was added. V12.3.5 added `domain/revisionQuality.js`,
// nobody updated the lists, and production served a blank screen.
//
// This module resolves the graph automatically from the entrypoints, so a new browser module becomes
// public the moment something reachable imports it. It only ever follows STATIC RELATIVE imports
// (`./x.js`, `../y.js`) starting from the approved entrypoints, so a server-only module (storage,
// api router, provider client, secrets) can never be pulled into the public set.

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

// Browser entrypoints. Anything reachable from these — and nothing else — is public.
export const BROWSER_ENTRYPOINTS = Object.freeze(["script.js", "admin.js"]);

// Direct, non-module public assets that no import graph would discover.
export const DIRECT_PUBLIC_ASSETS = Object.freeze(["index.html", "admin.html", "styles.css"]);

// Canonical domain files the Netlify static preview mirrors for parity checks. These are NOT part of
// the browser module graph and are NOT added to the Render server's public allowlist — they exist so
// the Netlify preview stays a faithful copy of the source tree. Keeping them here (rather than in a
// second hand-list inside the build script) preserves a single, documented source of truth.
export const NETLIFY_MIRROR_EXTRAS = Object.freeze([
  "domain/index.js",
  "domain/task1Classification.js",
  "services/task2Safety.js"
]);

// A public path may never resolve to one of these server-only areas, even if a stray import appeared.
const FORBIDDEN_PUBLIC_SEGMENTS = Object.freeze(["storage", "users", "reports", ".env", "secret", "audit"]);
const FORBIDDEN_PUBLIC_BASENAMES = Object.freeze([
  "storage.js", "apiRouter.js", "aiAnalyzer.js", "promptBuilder.js", "analysisJobStore.js",
  "diagnosticReset.js", "kruPomRubricReference.js", "server.js"
]);

const RELATIVE_SPECIFIER = /(?:\bfrom\s*|\bimport\s*|\bexport\s*\*\s*from\s*|\bimport\s*\()\s*['"](\.\.?\/[^'"]+)['"]/g;

function toPosix(value) {
  return String(value).split(path.sep).join("/");
}

/**
 * Extract every static relative import specifier from a module's source.
 */
export function extractRelativeImports(source) {
  const found = new Set();
  let match;
  RELATIVE_SPECIFIER.lastIndex = 0;
  while ((match = RELATIVE_SPECIFIER.exec(source))) {
    found.add(match[1]);
  }
  return [...found];
}

/**
 * Resolve the complete browser module graph, returning app-root-relative POSIX paths (sorted).
 * Throws with a precise message if an import points at a file that does not exist or escapes root.
 */
export async function resolveBrowserModuleGraph(rootDir, entrypoints = BROWSER_ENTRYPOINTS) {
  const root = path.resolve(rootDir);
  const visited = new Set();
  const queue = [];

  for (const entry of entrypoints) {
    const abs = path.resolve(root, entry);
    if (await isFile(abs)) queue.push(abs);
  }

  while (queue.length) {
    const current = queue.shift();
    const relative = toPosix(path.relative(root, current));
    if (visited.has(relative)) continue;
    visited.add(relative);

    const source = await readFile(current, "utf8");
    for (const specifier of extractRelativeImports(source)) {
      const resolved = path.resolve(path.dirname(current), specifier);
      const resolvedRelative = toPosix(path.relative(root, resolved));

      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
        throw new Error(`Public module escapes the application root: ${relative} imports ${specifier}`);
      }
      if (isForbiddenPublic(resolvedRelative)) {
        throw new Error(`Public module graph would expose a server-only file: ${relative} imports ${specifier}`);
      }
      if (!(await isFile(resolved))) {
        throw new Error(`Public browser module graph is incomplete: ${relative} imports ${specifier}, but ${resolvedRelative} does not exist.`);
      }
      if (!visited.has(resolvedRelative)) queue.push(resolved);
    }
  }

  return [...visited].sort();
}

/**
 * The full set of app-root-relative public paths: entry modules, their import graph, and the direct
 * assets. Used by the server allowlist and the static-preview build so they can never drift apart.
 */
export async function resolvePublicAssetManifest(rootDir) {
  const root = path.resolve(rootDir);
  const modules = await resolveBrowserModuleGraph(root);
  const assets = [];
  for (const asset of DIRECT_PUBLIC_ASSETS) {
    if (await isFile(path.resolve(root, asset))) assets.push(asset);
  }
  const files = [...new Set([...assets, ...modules])].sort();
  return {
    rootDir: root,
    entrypoints: BROWSER_ENTRYPOINTS.filter(() => true),
    modules,
    assets,
    files,
    moduleCount: modules.length
  };
}

/**
 * Absolute paths the static HTTP layer may serve. Built once at startup.
 */
export async function resolvePublicFilePaths(rootDir) {
  const manifest = await resolvePublicAssetManifest(rootDir);
  return manifest.files.map((relative) => path.resolve(manifest.rootDir, relative));
}

/**
 * Deterministic preflight: verify the whole graph resolves, every file exists, nothing escapes root,
 * and no server-only file leaked in. Never throws — returns a structured result the caller logs.
 */
export async function validatePublicAssetGraph(rootDir) {
  const root = path.resolve(rootDir);
  try {
    const manifest = await resolvePublicAssetManifest(root);
    const missing = [];
    const escaped = [];
    const exposedSecrets = [];
    for (const relative of manifest.files) {
      const abs = path.resolve(root, relative);
      if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) escaped.push(relative);
      if (isForbiddenPublic(relative)) exposedSecrets.push(relative);
      if (!(await isFile(abs))) missing.push(relative);
    }
    const ok = missing.length === 0 && escaped.length === 0 && exposedSecrets.length === 0;
    return { ok, missing, escaped, exposedSecrets, moduleCount: manifest.moduleCount, files: manifest.files, entrypoints: manifest.entrypoints };
  } catch (error) {
    return { ok: false, missing: [], escaped: [], exposedSecrets: [], moduleCount: 0, files: [], entrypoints: [...BROWSER_ENTRYPOINTS], error: error.message };
  }
}

/**
 * Recursively list the assets directory (fonts, images) so the static build can copy them too.
 */
export async function listAssetFiles(rootDir) {
  const assetsRoot = path.resolve(rootDir, "assets");
  const out = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else out.push(toPosix(path.relative(rootDir, abs)));
    }
  }
  await walk(assetsRoot);
  return out.sort();
}

function isForbiddenPublic(relativePosix) {
  const lower = relativePosix.toLowerCase();
  if (FORBIDDEN_PUBLIC_BASENAMES.includes(lower.split("/").pop())) return true;
  return FORBIDDEN_PUBLIC_SEGMENTS.some((segment) => lower.split("/").includes(segment));
}

async function isFile(abs) {
  const info = await stat(abs).catch(() => null);
  return Boolean(info && info.isFile());
}
