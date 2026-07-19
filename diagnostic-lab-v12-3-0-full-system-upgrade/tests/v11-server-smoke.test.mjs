import assert from "node:assert/strict";

process.env.PORT = "0";
process.env.HOST = "127.0.0.1";
process.env.DIAGNOSTIC_ALLOW_LOCAL_ENGINE = "true";

const { server } = await import("../server.js");
if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
const address = server.address();
const base = `http://127.0.0.1:${address.port}`;

try {
  const [health, home, task2Domain, canonicalDomain] = await Promise.all([
    fetch(`${base}/api/health`),
    fetch(`${base}/`),
    fetch(`${base}/domain/task2Safety.js`),
    fetch(`${base}/domain/canonicalAnalysis.js`)
  ]);
  assert.equal(health.status, 200);
  const healthJson = await health.json();
  assert.equal(healthJson.appVersion, "12.3.0");
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /script\.js\?v=diagnostic-v12-3-0-full-system-upgrade/);
  assert.equal(task2Domain.status, 200);
  assert.match(await task2Domain.text(), /export function analyzeTask2Safety/);
  assert.equal(canonicalDomain.status, 200);
  assert.match(await canonicalDomain.text(), /export function projectCanonicalAnalysis/);
  console.log("V11 local server smoke: health, HTML, and canonical browser modules passed.");
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
