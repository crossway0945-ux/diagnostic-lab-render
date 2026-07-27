import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DIRECT_PUBLIC_ASSETS,
  NETLIFY_MIRROR_EXTRAS,
  listAssetFiles,
  resolveBrowserModuleGraph,
  validatePublicAssetGraph
} from "../services/publicAssetGraph.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "netlify-static-preview");

// Refuse to build an incomplete static preview: the same source of truth the server uses, so the
// preview can never drift from what the server serves.
const preflight = await validatePublicAssetGraph(root);
if (!preflight.ok) {
  console.error("[build:static] frontend preflight failed — refusing to build an incomplete preview.", preflight);
  process.exit(1);
}

// Regenerate the whole preview so a stale file from a previous build can never mask a missing module.
await rm(output, { recursive: true, force: true });

const modules = await resolveBrowserModuleGraph(root);
const assets = await listAssetFiles(root);
const publicFiles = [...new Set([...DIRECT_PUBLIC_ASSETS, ...modules, ...NETLIFY_MIRROR_EXTRAS, ...assets])].sort();

for (const relativePath of publicFiles) {
  const destination = path.join(output, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(root, relativePath), destination);
}

console.log(`Static preview synchronized from the resolved browser module graph: ${publicFiles.length} files (${modules.length} modules).`);
