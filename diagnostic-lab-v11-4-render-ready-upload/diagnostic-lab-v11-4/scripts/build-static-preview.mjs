import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "netlify-static-preview");
const publicFiles = [
  "index.html",
  "script.js",
  "styles.css",
  "wordCount.js",
  "domain/task1Classification.js",
  "domain/task2Safety.js",
  "domain/canonicalAnalysis.js",
  "domain/index.js",
  "services/canonicalAnalysis.js",
  "services/task2Safety.js",
  "services/analysisVersions.js"
];

for (const relativePath of publicFiles) {
  const destination = path.join(output, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(root, relativePath), destination);
}

console.log(`Static preview synchronized: ${publicFiles.length} files from the canonical V11 source tree.`);
