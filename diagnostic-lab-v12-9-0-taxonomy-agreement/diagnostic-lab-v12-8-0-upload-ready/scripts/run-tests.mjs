import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const tests = (await readdir("tests"))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort();
for (const name of tests) {
  console.log(`RUN ${name}`);
  const result = spawnSync(process.execPath, [path.join("tests", name)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Test suite passed: ${tests.length} files.`);
