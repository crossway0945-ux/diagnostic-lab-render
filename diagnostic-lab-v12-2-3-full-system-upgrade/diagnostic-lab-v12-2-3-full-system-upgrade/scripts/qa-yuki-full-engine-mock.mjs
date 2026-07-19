import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { createApiHandler } from "../services/apiRouter.js";

const prompt = "Some people think that spending a lot of money on space exploration is not worth it, and that this money should be used to solve problems on Earth instead. To what extent do you agree or disagree?";
const writing = `Some people think that spending a lot of money on space exploration is not worth it, and that this money should be used to solve problems on Earth instead. While the opinion is valid, I partly disagree because space research also brings new technology, useful knowledge, and future opportunities that can help improve life on Earth in the long run.

On one hand, it is true that many countries still face serious problems such as poverty, hunger, and poor healthcare. Millions of people do not have enough food, clean water, or proper education. In this situation, spending billions on rockets and satellites can seem wasteful. Governments could use that money to build hospitals, schools, and houses for people in need. These projects would make life better for people right away, instead of focusing on something far away in space.

On the other hand, space exploration also brings useful results that help us in daily life. For example, satellites are used for weather forecasts, GPS, and communication, all of which come from space research. Studying space also helps scientists learn more about Earth's climate and how to protect it. Although it costs a lot of money, space technology can lead to new inventions and inspire young people to study science and technology, which helps society grow in the future.

In conclusion, I believe that while it is important to solve the problems we have on Earth, investing in space exploration is still valuable. If countries spend money wisely, they can support both the needs of people today and the discoveries that will help us in the near future.`;
const payload = { taskType: "Task 2", essayType: "Opinion Essay", prompt, writing, reportLanguage: "en", targetBand: "7.0", options: { usedTemplate: true, strictFeedback: true, patternRisk: true } };

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const rootDir = await mkdtemp(path.join(tmpdir(), "v1221-full-engine-"));
try {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE = "false";
  process.env.NODE_ENV = "test";
  const validProviderReport = await analyzeWriting(payload);

  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "gpt-5.1";
  process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE = "true";
  process.env.NODE_ENV = "production";
  process.env.SESSION_SECRET = "release-smoke-secret";
  process.env.DIAGNOSTIC_STORAGE_ADAPTER = "local-json";
  process.env.DIAGNOSTIC_ANALYSIS_MODE = "sync";

  let providerCalls = 0;
  globalThis.fetch = async (_url, options) => {
    providerCalls += 1;
    const body = JSON.parse(options.body);
    assert.equal(body.model, "gpt-5.1");
    assert.equal(body.store, false);
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.strict, true);
    return { ok: true, status: 200, json: async () => ({ output_text: JSON.stringify(validProviderReport) }) };
  };

  await writeFile(path.join(rootDir, "users.json"), JSON.stringify([{ username: "teacher", password: "pass", displayName: "Kru Pom", role: "teacher", quota: 999, used: 0, expiryDate: "2099-12-31", status: "active" }], null, 2));
  await writeFile(path.join(rootDir, "submission-history.json"), "[]\n");
  await writeFile(path.join(rootDir, "student-profiles.json"), JSON.stringify([{ id: "yuki", ownerAccountId: "teacher", displayName: "Yuki", normalizedName: "yuki", active: true }], null, 2));

  const handler = createApiHandler({ rootDir });
  const call = (method, requestPath, body = null, cookie = "") => handler({ method, path: requestPath, headers: cookie ? { cookie } : {}, body: body ? JSON.stringify(body) : "" });
  const login = await call("POST", "/api/login", { username: "teacher", password: "pass" });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = login.headers["Set-Cookie"];
  const profiles = JSON.parse((await call("GET", "/api/student-profiles", null, cookie)).body);
  const profile = (profiles.profiles || profiles.students || []).find((item) => item.displayName === "Yuki");
  assert.ok(profile?.profileToken);
  const response = await call("POST", "/api/analyze", { ...payload, clientSubmissionId: "v1221-full-engine-yuki", studentProfileToken: profile.profileToken }, cookie);
  assert.equal(response.statusCode, 200, response.body);
  const result = JSON.parse(response.body);
  assert.equal(result.analysis?.detectedPosition || result.detectedPosition, "partly disagree");
  assert.match(result.analysis?.bodyRouteSummary || result.bodyRouteSummary || "", /Body 1 route:.*controlled concession/i);
  assert.match(result.analysis?.bodyRouteSummary || result.bodyRouteSummary || "", /Body 2 route:.*writer's disagreement/i);
  assert.ok(providerCalls >= 1);
  console.log(JSON.stringify({ status: "PASS", codePath: "full-engine-provider-transport-mock", providerCalls, position: result.analysis?.detectedPosition || result.detectedPosition }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  process.env = originalEnv;
  await rm(rootDir, { recursive: true, force: true });
}
