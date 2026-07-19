import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const EXPECTED_ROOT = "diagnostic-lab-v12-2-1-full-system-upgrade";
const EXPECTED_VERSION = "12.2.1";
const cwd = process.cwd();
assert.equal(path.basename(cwd), EXPECTED_ROOT, `Run from ${EXPECTED_ROOT}; current folder is ${path.basename(cwd)}.`);
const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8"));
assert.equal(pkg.version, EXPECTED_VERSION);
const render = await readFile(path.join(cwd, "render.yaml"), "utf8");
assert.match(render, new RegExp(`rootDir:\\s*${EXPECTED_ROOT.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`));
assert.match(render, /buildCommand:\s*npm install/);
assert.match(render, /startCommand:\s*npm start/);
assert.match(render, /healthCheckPath:\s*\/api\/health/);
assert.doesNotMatch(render, /diagnostic-lab-v11-7-bilingual-premium/);
assert.doesNotMatch(render, /diagnostic-lab-v12-2-full-system-upgrade\//);
console.log(JSON.stringify({ status: "PASS", rootDirectory: EXPECTED_ROOT, version: EXPECTED_VERSION }, null, 2));
