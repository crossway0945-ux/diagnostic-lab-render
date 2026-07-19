import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiHandler } from "../services/apiRouter.js";
import { closePdfRendererBrowser } from "../reports/pdfRenderer.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputArgIndex = process.argv.indexOf("--output");
const outputPath = outputArgIndex >= 0 && process.argv[outputArgIndex + 1]
  ? path.resolve(process.argv[outputArgIndex + 1])
  : path.join(projectRoot, "qa-output", "Yuki-V12.2.1-API-Export-Smoke.pdf");
const rootDir = await mkdtemp(path.join(tmpdir(), "yuki-pdf-api-"));

process.env.SESSION_SECRET = "pdf-api-smoke-secret";
process.env.DIAGNOSTIC_STORAGE_ADAPTER = "local-json";
process.env.DIAGNOSTIC_ANALYSIS_MODE = "sync";
process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE = "false";
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;

const prompt = "Some people think that spending a lot of money on space exploration is not worth it, and that this money should be used to solve problems on Earth instead. To what extent do you agree or disagree?";
const writing = `Some people think that spending a lot of money on space exploration is not worth it, and that this money should be used to solve problems on Earth instead. While the opinion is valid, I partly disagree because space research also brings new technology, useful knowledge, and future opportunities that can help improve life on Earth in the long run.

On one hand, it is true that many countries still face serious problems such as poverty, hunger, and poor healthcare. Millions of people do not have enough food, clean water, or proper education. In this situation, spending billions on rockets and satellites can seem wasteful. Governments could use that money to build hospitals, schools, and houses for people in need. These projects would make life better for people right away, instead of focusing on something far away in space.

On the other hand, space exploration also brings useful results that help us in daily life. For example, satellites are used for weather forecasts, GPS, and communication, all of which come from space research. Studying space also helps scientists learn more about Earth's climate and how to protect it. Although it costs a lot of money, space technology can lead to new inventions and inspire young people to study science and technology, which helps society grow in the future.

In conclusion, I believe that while it is important to solve the problems we have on Earth, investing in space exploration is still valuable. If countries spend money wisely, they can support both the needs of people today and the discoveries that will help us in the near future.`;

try {
  await writeFile(path.join(rootDir, "users.json"), JSON.stringify([{
    username: "teacher",
    password: "pass",
    displayName: "Kru Pom",
    role: "teacher",
    quota: 999,
    used: 0,
    expiryDate: "2099-12-31",
    status: "active"
  }], null, 2));
  await writeFile(path.join(rootDir, "submission-history.json"), "[]\n");
  await writeFile(path.join(rootDir, "student-profiles.json"), JSON.stringify([{
    id: "yuki",
    ownerAccountId: "teacher",
    displayName: "Yuki",
    normalizedName: "yuki",
    active: true
  }], null, 2));

  const handler = createApiHandler({ rootDir });
  const call = (method, requestPath, body = null, cookie = "") => handler({
    method,
    path: requestPath,
    headers: cookie ? { cookie } : {},
    body: body ? JSON.stringify(body) : ""
  });

  const login = await call("POST", "/api/login", { username: "teacher", password: "pass" });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = login.headers["Set-Cookie"];
  const profilesResponse = await call("GET", "/api/student-profiles", null, cookie);
  assert.equal(profilesResponse.statusCode, 200, profilesResponse.body);
  const profiles = JSON.parse(profilesResponse.body);
  const yukiProfile = (profiles.profiles || profiles.students || []).find((item) => item.displayName === "Yuki");
  assert.ok(yukiProfile?.profileToken, profilesResponse.body);

  const analyze = await call("POST", "/api/analyze", {
    taskType: "Task 2",
    essayType: "Opinion Essay",
    visualType: "",
    targetBand: "7.0",
    clientSubmissionId: "yuki-pdf-smoke",
    studentProfileToken: yukiProfile.profileToken,
    prompt,
    writing,
    reportLanguage: "en",
    options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
  }, cookie);
  assert.equal(analyze.statusCode, 200, analyze.body);
  const analyzed = JSON.parse(analyze.body);
  assert.equal(analyzed.analysis?.detectedPosition || analyzed.detectedPosition, "partly disagree");
  assert.match(analyzed.analysis?.bodyRouteSummary || analyzed.bodyRouteSummary || "", /Body 1 route:.*controlled concession/i);
  assert.match(analyzed.analysis?.bodyRouteSummary || analyzed.bodyRouteSummary || "", /Body 2 route:.*writer's disagreement/i);
  const reportId = analyzed.progressRecord?.submissionId || analyzed.reportId || analyzed.submissionId;
  assert.ok(reportId, JSON.stringify(analyzed).slice(0, 1200));

  const pdf = await call("GET", `/api/reports/${encodeURIComponent(reportId)}/pdf`, null, cookie);
  assert.equal(pdf.statusCode, 200, String(pdf.body || "").slice(0, 1000));
  assert.match(String(pdf.headers["content-type"] || ""), /application\/pdf/);
  assert.equal(pdf.isBase64Encoded, true);
  const bytes = Buffer.from(pdf.body, "base64");
  assert.ok(bytes.length > 20000, `Generated PDF is too small: ${bytes.length} bytes.`);
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);

  console.log(JSON.stringify({
    status: "PASS",
    reportId,
    bytes: bytes.length,
    pages: pdf.headers["x-report-page-count"],
    route: analyzed.analysis?.detectedPosition || analyzed.detectedPosition,
    output: outputPath
  }, null, 2));
} finally {
  await closePdfRendererBrowser();
  await rm(rootDir, { recursive: true, force: true });
}
