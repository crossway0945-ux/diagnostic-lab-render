import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
const start = source.indexOf("async function checkBackendHealth()");
const end = source.indexOf("\nasync function copyPracticePlan()", start);
assert.ok(start >= 0 && end > start, "checkBackendHealth must remain present");
const block = source.slice(start, end);

assert.match(block, /providerConnectivityStatus/, "the badge must distinguish verified connectivity from configuration");
assert.match(block, /providerStatus === "connected"/, "a verified provider check must show ready");
assert.match(block, /providerStatus === "failed" \|\| !engineConfigured/, "unavailable must require a failed check or missing configuration");
assert.match(block, /Diagnostic service configured/, "an unknown post-restart provider state must not be mislabeled unavailable");
assert.doesNotMatch(
  block,
  /fullEngineRequired && !serviceReady/,
  "the previous unknown-as-unavailable condition must not return"
);

console.log("V12.9.9 health label honesty: connected, failed/misconfigured, and unknown-but-configured states are distinguished without changing analysis availability.");
