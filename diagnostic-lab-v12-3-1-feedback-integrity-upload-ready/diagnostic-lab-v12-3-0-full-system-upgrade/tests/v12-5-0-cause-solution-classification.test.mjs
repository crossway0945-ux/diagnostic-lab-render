// V12.5.0 classification accuracy: a two-part "What are the causes? What solutions can you suggest?"
// prompt is a Problem & Solution task, not a generic multi-question Direct Question. Regression guard
// for the production ESSAY_TYPE_MISMATCH that wrongly rejected a correctly-selected Problem & Solution.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { classifyTask2Prompt } from "../domain/task2Safety.js";
import { createApiHandler } from "../services/apiRouter.js";

const ORIGINAL_ENV = { ...process.env };

// --- Unit: the classifier itself ---
const CAUSES_SOLUTIONS_PROMPT = "One problem faced by almost every large city is severe traffic congestion.\nWhat do you think the causes are?\nWhat solutions can you suggest?";
const c = classifyTask2Prompt({ taskType: "Task 2", prompt: CAUSES_SOLUTIONS_PROMPT, essayType: "Problem & Solution" });
assert.equal(c.essayType, "problem-solution", "causes?/solutions? split prompt classifies as Problem & Solution");
assert.equal(c.internalSubtype, "causes-solutions", "and specifically the causes-and-solutions subtype");
assert.equal(c.classificationMatch, true, "a correctly-selected Problem & Solution must not mismatch");

// A problems? / what-can-be-done? split form is also Problem & Solution.
const c2 = classifyTask2Prompt({ taskType: "Task 2", prompt: "Many people are overweight. What are the problems associated with this? What can be done to solve them?", essayType: "Problem & Solution" });
assert.equal(c2.essayType, "problem-solution");
assert.equal(c2.classificationMatch, true);

// No over-reach: two genuine direct questions with NO solution requested stay Direct Question.
const d = classifyTask2Prompt({ taskType: "Task 2", prompt: "Some students take a gap year before university. Why do some students do this? Is it a positive or negative trend?" });
assert.equal(d.essayType, "direct-question", "a cause question without a solution question is not Problem & Solution");

// Genuine mismatch preserved: selecting Discuss Both Views on this prompt still mismatches.
const m = classifyTask2Prompt({ taskType: "Task 2", prompt: CAUSES_SOLUTIONS_PROMPT, essayType: "Discuss Both Views" });
assert.equal(m.classificationMatch, false, "a genuinely wrong selection must still be caught");

// --- End-to-end: the prompt no longer blocks analysis when Problem & Solution is selected ---
const dataDir = await mkdtemp(path.join(tmpdir(), "v1250-classify-"));
try {
  process.env = { ...ORIGINAL_ENV, SESSION_SECRET: "classify-test", DIAGNOSTIC_STORAGE_ADAPTER: "local-json", DIAGNOSTIC_DATA_DIR: dataDir, DIAGNOSTIC_ANALYSIS_MODE: "sync", DIAGNOSTIC_REQUIRE_FULL_ENGINE: "false" };
  delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_MODEL;
  delete process.env.NETLIFY; delete process.env.LAMBDA_TASK_ROOT; delete process.env.AWS_LAMBDA_FUNCTION_NAME; delete process.env.AWS_EXECUTION_ENV;
  await writeFile(path.join(dataDir, "users.json"), JSON.stringify([
    { username: "stu", password: "pw", displayName: "Student", role: "student", quotaMode: "limited", quota: 10, used: 0, status: "active", expiryDate: "2099-12-31" }
  ], null, 2));
  const handler = createApiHandler({ rootDir: dataDir });
  const request = async (method, p, body, cookie) => {
    const res = await handler({ method, path: p, headers: cookie ? { cookie } : {}, body: body ? JSON.stringify(body) : "" });
    return { ...res, json: JSON.parse(res.body || "{}") };
  };
  const login = await request("POST", "/api/login", { username: "stu", password: "pw" });
  const cookie = login.headers["Set-Cookie"];
  const analyze = await request("POST", "/api/analyze", {
    taskType: "Task 2",
    essayType: "Problem & Solution",
    prompt: CAUSES_SOLUTIONS_PROMPT,
    writing: [
      "Traffic congestion in large cities is a serious problem with clear causes and workable solutions.",
      "The main cause is the sheer number of private cars, because limited and unreliable public transport pushes commuters to drive alone, which fills the roads at peak times.",
      "The most effective solution is to expand high-frequency public transport, since convenient trains and buses give people a real alternative and reduce the number of cars on the road.",
      "In conclusion, congestion is largely caused by over-reliance on private cars, and it can be reduced by investing in dependable public transport."
    ].join("\n\n"),
    reportLanguage: "en",
    clientSubmissionId: "classify-1",
    options: {}
  }, cookie);
  assert.notEqual(analyze.json.errorCode, "ESSAY_TYPE_MISMATCH", "the prompt must not be rejected as a mismatch");
  assert.equal(analyze.statusCode, 200, "analysis proceeds for a correctly-selected Problem & Solution");
  assert.ok(analyze.json.analysis, "a report is produced");
} finally {
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  process.env = { ...ORIGINAL_ENV };
}

console.log("V12.5.0 cause-solution classification: split 'causes? solutions?' prompts classify as Problem & Solution, genuine Direct Questions and real mismatches preserved, and analysis no longer blocks.");
