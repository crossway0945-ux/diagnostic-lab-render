import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const roots = ["domain", "services", "reports", "schemas", "scripts", "tests", "netlify/functions"];
const files = ["server.js", "script.js", "wordCount.js"];
for (const root of roots) files.push(...await javascriptFiles(root));
for (const file of [...new Set(files)].sort()) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Source check passed: ${new Set(files).size} JavaScript modules.`);

async function javascriptFiles(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const item = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await javascriptFiles(item));
    else if (/\.(?:m?js)$/i.test(entry.name)) output.push(item);
  }
  return output;
}
