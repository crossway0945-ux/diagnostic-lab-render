import path from "node:path";
import { createAnalysisJobStore } from "../services/analysisJobStore.js";
import { runDiagnosticReset } from "../services/diagnosticReset.js";
import { createStorage } from "../services/storage.js";

const CONFIRMATION_TOKEN = "RESET_DIAGNOSTIC_DATA";
const confirmation = process.argv.find((argument) => argument.startsWith("--confirm="))?.slice("--confirm=".length) || "";
const execute = confirmation === CONFIRMATION_TOKEN;
const rootDir = path.resolve(process.cwd());

try {
  if (confirmation && !execute) {
    throw new Error(`Confirmation token is incorrect. Use --confirm=${CONFIRMATION_TOKEN} exactly.`);
  }

  const result = await runDiagnosticReset({
    storage: createStorage({ rootDir }),
    jobStore: createAnalysisJobStore({ rootDir }),
    execute
  });
  console.log(JSON.stringify({
    ok: true,
    ...result,
    message: execute
      ? "Diagnostic reports, progress, student profiles, and temporary analysis jobs were cleared. Protected account and audit stores were unchanged."
      : `No data was changed. To execute, run: npm run reset:diagnostic-data -- --confirm=${CONFIRMATION_TOKEN}`
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message || "Diagnostic reset failed." }, null, 2));
  process.exit(1);
}
