import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { createApiHandler } from "../services/apiRouter.js";
import { buildPrompt } from "../services/promptBuilder.js";
import { createStorage } from "../services/storage.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

const task2Payload = {
  taskType: "Task 2",
  essayType: "Opinion Essay",
  visualType: "",
  targetBand: "7.0",
  clientSubmissionId: "task2-success-1",
  prompt: "Some people think the money spent on developing the technology for space exploration is not justified. There are more beneficial ways to spend this money. To what extent do you agree or disagree?",
  writing: [
    "Many people believe that spending money on space exploration is not the best use of public funds because there are urgent problems on Earth. I partly agree with this view, although I also think space research can bring long-term benefits.",
    "On one hand, many countries still face poverty, hunger, and poor healthcare. In this situation, spending billions on rockets can seem wasteful because governments could build hospitals, schools, and houses for people in need.",
    "On the other hand, space exploration also brings useful results that help daily life. Satellites support weather forecasts, GPS, and communication, and space research can help scientists understand climate risks.",
    "In conclusion, countries should solve urgent social problems first, but carefully managed investment in space exploration can still be valuable for the future."
  ].join("\n\n"),
  options: {}
};

const task1Payload = {
  taskType: "Task 1",
  essayType: "",
  visualType: "Bar Chart",
  targetBand: "7.0",
  clientSubmissionId: "task1-success-1",
  prompt: "The bar chart below shows the total number of minutes of telephone calls in Australia, divided into three categories, from 2001 to 2008.",
  writing: [
    "The bar chart compares the total number of minutes of telephone calls in Australia in three categories between 2001 and 2008.",
    "Overall, local calls were the most common type throughout the period, while mobile calls increased the most. National and international calls also rose steadily.",
    "In 2001, local calls accounted for 72 billion minutes, much higher than national and international calls at 38 billion and mobile calls at 2 billion. Local calls peaked at 90 billion in 2005 before falling back to 72 billion in 2008.",
    "Meanwhile, national and international calls grew from 38 billion to 61 billion. Mobile calls rose sharply from 2 billion to 46 billion by the end of the period."
  ].join("\n\n"),
  options: {}
};

async function main() {
  await testApiFlow();
  await testServerlessStorageSelection();
  await testProviderErrorClassification();
  await testStructuredOutputAndEvidenceGuard();
  await testProductionRequiresFullEngine();
  await testServerlessRequiresFullEngine();
  await testProblemSolutionRubricPrompt();
}

async function testApiFlow() {
  resetEnv();
  process.env.SESSION_SECRET = "test-session-secret";
  process.env.DIAGNOSTIC_STORAGE_ADAPTER = "local-json";
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;

  const rootDir = await mkdtemp(path.join(tmpdir(), "diagnostic-api-"));
  try {
    await writeFile(path.join(rootDir, "users.json"), JSON.stringify([
      {
        username: "student-a",
        password: "pass-a",
        displayName: "Student A",
        quota: 3,
        used: 0,
        expiryDate: "2099-12-31",
        status: "active"
      },
      {
        username: "student-b",
        password: "pass-b",
        displayName: "Student B",
        quota: 3,
        used: 0,
        expiryDate: "2099-12-31",
        status: "active"
      }
    ], null, 2));
    await writeFile(path.join(rootDir, "submission-history.json"), "[]\n");

    const handler = createApiHandler({ rootDir });
    const health = await request(handler, "GET", "/api/health");
    assert.equal(health.statusCode, 200);
    assert.equal(health.json.ok, true);

    const wrongLogin = await request(handler, "POST", "/api/login", { username: "student-a", password: "bad" });
    assert.equal(wrongLogin.statusCode, 401);
    assert.equal(wrongLogin.json.errorCode, "NOT_AUTHENTICATED");

    const loginA = await request(handler, "POST", "/api/login", { username: "student-a", password: "pass-a" });
    assert.equal(loginA.statusCode, 200);
    const cookieA = loginA.headers["Set-Cookie"];
    assert.ok(cookieA);

    const noSession = await request(handler, "POST", "/api/analyze", task2Payload);
    assert.equal(noSession.statusCode, 401);
    assert.equal(noSession.json.errorCode, "NOT_AUTHENTICATED");

    const task2 = await request(handler, "POST", "/api/analyze", task2Payload, cookieA);
    assert.equal(task2.statusCode, 200);
    assert.equal(task2.json.ok, true);
    assert.equal(task2.json.user.used, 1);

    const replay = await request(handler, "POST", "/api/analyze", task2Payload, cookieA);
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.json.idempotentReplay, true);
    assert.equal(replay.json.user.used, 1);

    const task1 = await request(handler, "POST", "/api/analyze", { ...task1Payload, clientSubmissionId: "task1-no-image" }, cookieA);
    assert.equal(task1.statusCode, 200);
    assert.equal(task1.json.user.used, 2);

    const task1WithImage = await request(handler, "POST", "/api/analyze", {
      ...task1Payload,
      clientSubmissionId: "task1-with-image",
      image: {
        name: "chart.png",
        mimeType: "image/png",
        size: 68,
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
      }
    }, cookieA);
    assert.equal(task1WithImage.statusCode, 200);
    assert.equal(task1WithImage.json.user.used, 3);

    const loginB = await request(handler, "POST", "/api/login", { username: "student-b", password: "pass-b" });
    const progressB = await request(handler, "GET", "/api/progress", null, loginB.headers["Set-Cookie"]);
    assert.equal(progressB.statusCode, 200);
    assert.equal(progressB.json.records.length, 0);

    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.OPENAI_MODEL;
    const failedProvider = await request(handler, "POST", "/api/analyze", {
      ...task2Payload,
      clientSubmissionId: "provider-model-fail"
    }, loginB.headers["Set-Cookie"]);
    assert.equal(failedProvider.statusCode, 500);
    assert.equal(failedProvider.json.errorCode, "PROVIDER_MODEL_ERROR");

    const progressAfterFailure = await request(handler, "GET", "/api/progress", null, loginB.headers["Set-Cookie"]);
    assert.equal(progressAfterFailure.json.records.length, 0);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
    resetEnv();
  }
}

async function testServerlessStorageSelection() {
  resetEnv();
  const rootDir = await mkdtemp(path.join(tmpdir(), "diagnostic-storage-"));
  try {
    process.env.LAMBDA_TASK_ROOT = rootDir;
    delete process.env.DIAGNOSTIC_STORAGE_ADAPTER;
    assert.equal(createStorage({ rootDir }).name, "netlify-memory");

    process.env.DIAGNOSTIC_STORAGE_ADAPTER = "local-json";
    delete process.env.ALLOW_NETLIFY_LOCAL_JSON;
    assert.equal(createStorage({ rootDir }).name, "netlify-memory");

    const handler = createApiHandler({ rootDir });
    const health = await request(handler, "GET", "/api/health");
    assert.equal(health.statusCode, 200);
    assert.equal(health.json.storageMode, "netlify-memory");
    assert.equal(health.json.durableStorage, false);
    assert.equal(health.json.fullEngineRequired, true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
    resetEnv();
  }
}

async function testProviderErrorClassification() {
  resetEnv();
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "test-model";

  await assertRejectsWithCode(mockAnalyzeError(401, '{"error":{"message":"bad key"}}'), "PROVIDER_AUTH_ERROR");
  await assertRejectsWithCode(mockAnalyzeError(404, '{"error":{"code":"model_not_found"}}'), "PROVIDER_MODEL_ERROR");
  await assertRejectsWithCode(mockAnalyzeError(429, '{"error":{"message":"rate limited"}}'), "PROVIDER_RATE_LIMIT");

  globalThis.fetch = async () => {
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    throw error;
  };
  await assertRejectsWithCode(analyzeWriting(task2Payload), "PROVIDER_TIMEOUT");

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ output_text: "not valid json" })
  });
  await assertRejectsWithCode(analyzeWriting(task2Payload), "PROVIDER_JSON_PARSE_ERROR");

  resetEnv();
}

async function testStructuredOutputAndEvidenceGuard() {
  resetEnv();
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "gpt-5.5";

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, "gpt-5.5");
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.name, "ielts_task2_diagnostic_report");
    assert.equal(body.text.format.strict, true);
    assert.equal(body.reasoning.effort, "medium");

    return {
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify({
          taskType: "Task 2",
          estimatedBandRange: "6.0-6.5",
          mainScoreLimitingFactor: "Route control needs checking.",
          mostUrgentRepair: "Use exact evidence and clearer thesis control.",
          feedbackCards: [{
            issueType: "Invented Evidence",
            severity: "Critical",
            criteria: ["Task Response"],
            framework: ["Prompt Coverage"],
            paragraphLocation: "Body Paragraph 1, Sentence 1",
            exactSentence: "This sentence was never written by the student.",
            sentenceFunction: "Invented evidence",
            whyItLimitsBand: "It should be dropped.",
            kruPomDiagnosis: "It should be dropped.",
            targetedRevision: "Use real evidence.",
            whyRevisionIsStronger: "It is evidence-based.",
            studentAction: "Quote exact student writing."
          }],
          paragraphFeedback: [{
            paragraphLocation: "Body Paragraph 1",
            exactEvidence: "This paragraph evidence was never written by the student.",
            diagnosis: "It should be dropped.",
            action: "Use real evidence."
          }],
          warnings: [],
          criteriaScores: {},
          kruPomScores: {},
          practicePlan: [],
          disclaimer: "Diagnostic only."
        })
      })
    };
  };

  const analysis = await analyzeWriting(task2Payload);
  assert.equal(analysis.taskType, "Task 2");
  assert.ok(!analysis.feedbackCards.some((card) => card.exactSentence === "This sentence was never written by the student."));
  assert.ok(analysis.warnings.some((warning) => warning.includes("Dropped one feedback card")));
  assert.ok(analysis.warnings.some((warning) => warning.includes("Dropped one paragraph note")));

  resetEnv();
}

async function testProductionRequiresFullEngine() {
  resetEnv();
  process.env.NODE_ENV = "production";
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;

  await assertRejectsWithCode(analyzeWriting(task2Payload), "PROVIDER_AUTH_ERROR");
  resetEnv();
}

async function testServerlessRequiresFullEngine() {
  resetEnv();
  const rootDir = await mkdtemp(path.join(tmpdir(), "diagnostic-lambda-"));
  try {
    process.env.LAMBDA_TASK_ROOT = rootDir;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;

    await assertRejectsWithCode(analyzeWriting(task2Payload), "PROVIDER_AUTH_ERROR");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
    resetEnv();
  }
}

async function testProblemSolutionRubricPrompt() {
  const prompt = buildPrompt({
    ...task2Payload,
    essayType: "Problem & Solution"
  });

  assert.ok(prompt.includes("Problem & Solution essay-specific rules"));
  assert.ok(prompt.includes("Body 1 should describe the causes/problems"));
  assert.ok(prompt.includes("Body 2 should describe solutions"));
  assert.ok(prompt.includes("LFC CPC"));
}

function mockAnalyzeError(status, body) {
  globalThis.fetch = async () => ({
    ok: false,
    status,
    text: async () => body
  });
  return analyzeWriting(task2Payload);
}

async function assertRejectsWithCode(promise, errorCode) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.errorCode, errorCode);
    return true;
  });
}

async function request(handler, method, requestPath, body = null, cookie = "") {
  const response = await handler({
    method,
    path: requestPath,
    headers: cookie ? { cookie } : {},
    body: body ? JSON.stringify(body) : ""
  });

  return {
    ...response,
    json: JSON.parse(response.body || "{}")
  };
}

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_TIMEOUT_MS;
  delete process.env.OPENAI_MAX_OUTPUT_TOKENS;
  delete process.env.DIAGNOSTIC_STORAGE_ADAPTER;
  delete process.env.DIAGNOSTIC_DATA_DIR;
  delete process.env.NETLIFY;
  delete process.env.LAMBDA_TASK_ROOT;
  delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  delete process.env.AWS_EXECUTION_ENV;
  delete process.env.ALLOW_NETLIFY_LOCAL_JSON;
  globalThis.fetch = ORIGINAL_FETCH;
}

main().catch((error) => {
  resetEnv();
  console.error(error);
  process.exitCode = 1;
});
