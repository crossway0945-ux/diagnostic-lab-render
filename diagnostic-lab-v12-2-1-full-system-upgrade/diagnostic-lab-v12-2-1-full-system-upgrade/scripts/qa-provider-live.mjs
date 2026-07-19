import { runProviderHealthCheck } from "../services/aiAnalyzer.js";
if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
  console.error("OPENAI_API_KEY and OPENAI_MODEL are required for the live provider check.");
  process.exit(2);
}
const result = await runProviderHealthCheck();
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
