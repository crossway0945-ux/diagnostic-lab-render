import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawnSync } from "node:child_process";
import puppeteer from "puppeteer";

const candidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_BIN,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  puppeteer.executablePath()
].filter(Boolean);

for (const candidate of candidates) {
  try {
    await access(candidate, fsConstants.X_OK);
    console.log(`[diagnostic-lab] Chromium ready: ${candidate}`);
    process.exit(0);
  } catch {
    // Try the next candidate.
  }
}

console.log("[diagnostic-lab] Chromium not found after dependency installation; installing the Puppeteer Chrome build...");
const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["puppeteer", "browsers", "install", "chrome"], {
  stdio: "inherit",
  timeout: 240000,
  env: process.env
});
if (result.error || result.status !== 0) {
  console.error("[diagnostic-lab] Chromium installation failed. PDF export cannot run without a browser.");
  process.exit(result.status || 1);
}
const executablePath = puppeteer.executablePath();
await access(executablePath, fsConstants.X_OK);
console.log(`[diagnostic-lab] Chromium installed: ${executablePath}`);
