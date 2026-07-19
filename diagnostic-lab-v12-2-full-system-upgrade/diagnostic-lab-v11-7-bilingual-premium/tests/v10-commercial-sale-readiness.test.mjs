import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { classifyTask1Visual } from "../services/aiAnalyzer.js";
import { buildCanonicalAnalysis, projectCanonicalAnalysis } from "../services/canonicalAnalysis.js";
import {
  applyTask1ClassificationGuard,
  applyTask2ClassificationGuard,
  createApiHandler
} from "../services/apiRouter.js";
import { ANALYSIS_VERSIONS } from "../services/analysisVersions.js";

const originalEnv = { ...process.env };

await testExactPublicDropdowns();
testTask1DetectionAndInternalDiagramRoutes();
testTask2PublicFamiliesAndInternalObligations();
await testAcceptedSunCombinationFixtureIsFrozen();
await testDuplicateBeforeQuotaAndDailyLimit();
console.log("V10 commercial sale-readiness: taxonomy, Task 1 fixture freeze, version metadata, atomic persistence, and duplicate-limit bypass passed.");

async function testExactPublicDropdowns() {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.deepEqual(selectOptions(html, "visual-type"), [
    "Line Graph", "Bar Chart", "Pie Chart", "Table", "Map", "Diagram",
    "Mixed / Combination Visuals", "Not Sure / Auto-detect"
  ]);
  assert.deepEqual(selectOptions(html, "essay-type"), [
    "Opinion Essay", "Discuss Both Views", "Problem & Solution",
    "Advantages & Disadvantages", "Direct Question", "Not Sure / Auto-detect"
  ]);
}

function testTask1DetectionAndInternalDiagramRoutes() {
  const cases = [
    ["The line graph shows changes in transport between 1990 and 2020.", "Line Graph", "line-graph"],
    ["The bar chart compares five age groups.", "Bar Chart", "bar-chart"],
    ["The pie chart shows the distribution of studio locations.", "Pie Chart", "pie-chart"],
    ["The table presents figures for six countries.", "Table", "table"],
    ["The maps compare a town plan in 1990 and 2020.", "Map", "map"],
    ["The diagram shows the stages in the process by which paper is recycled.", "Diagram", "process"],
    ["The diagrams show the components of a solar panel and how the mechanism warms air and water.", "Diagram", "structural-mechanism"],
    ["The pie chart shows studio locations while the bar chart compares dance classes.", "Mixed / Combination Visuals", "mixed:bar-chart+pie-chart"]
  ];
  for (const [prompt, expectedPublic, expectedInternal] of cases) {
    const result = classifyTask1Visual({ prompt, visualType: "Not Sure / Auto-detect" });
    assert.equal(result.publicVisualType, expectedPublic, prompt);
    assert.equal(result.internalVisualSubtype, expectedInternal, prompt);
    assert.equal(result.confidence, "high", prompt);
  }
  assert.throws(
    () => applyTask1ClassificationGuard({
      taskType: "Task 1",
      prompt: "The bar chart compares five age groups.",
      visualType: "Line Graph",
      options: {}
    }),
    (error) => error.errorCode === "VISUAL_TYPE_MISMATCH" && error.detectedVisualType === "Bar Chart"
  );
  const auto = applyTask1ClassificationGuard({
    taskType: "Task 1",
    prompt: "The pie chart shows studio locations while the bar chart compares dance classes.",
    visualType: "Not Sure / Auto-detect",
    options: {}
  });
  assert.equal(auto.publicVisualType, "Mixed / Combination Visuals");
  assert.equal(auto.visualType, "Mixed Graph", "legacy engine strategy receives one compatible internal route");
}

function testTask2PublicFamiliesAndInternalObligations() {
  const outweigh = applyTask2ClassificationGuard({
    taskType: "Task 2",
    essayType: "Advantages & Disadvantages",
    prompt: "Do the advantages of international tourism outweigh the disadvantages?",
    options: {}
  });
  assert.equal(outweigh.publicEssayType, "Advantages & Disadvantages");
  assert.equal(outweigh.internalEssaySubtype, "outweigh");
  assert.ok(outweigh.taskObligations.includes("comparative weighting"));

  const causeEffect = applyTask2ClassificationGuard({
    taskType: "Task 2",
    essayType: "Direct Question",
    prompt: "What are the causes of traffic congestion and what effects does it have on cities?",
    options: {}
  });
  assert.equal(causeEffect.publicEssayType, "Direct Question");
  assert.equal(causeEffect.internalEssaySubtype, "causes-effects");
  assert.ok(causeEffect.taskObligations.includes("cause-effect mechanism"));

  const autoOpinion = applyTask2ClassificationGuard({
    taskType: "Task 2",
    essayType: "Not Sure / Auto-detect",
    prompt: "To what extent do you agree or disagree that public transport should be free?",
    options: {}
  });
  assert.equal(autoOpinion.publicEssayType, "Opinion Essay");
  assert.equal(autoOpinion.internalEssaySubtype, "opinion");
}

async function testAcceptedSunCombinationFixtureIsFrozen() {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/task1-sun-combination-accepted.json", import.meta.url), "utf8"));
  const payload = {
    taskType: "Task 1",
    publicVisualType: fixture.publicVisualType,
    internalVisualSubtype: fixture.internalVisualSubtype,
    visualType: "Mixed Graph",
    wordCount: fixture.wordCount,
    ownerAccountId: "teacher-a",
    studentProfileId: "sun",
    studentDisplayNameSnapshot: fixture.student,
    inputFingerprint: "fixture-fingerprint",
    parentReportId: "",
    analysisReason: "first-analysis",
    ...ANALYSIS_VERSIONS
  };
  const analysis = {
    taskType: "Task 1",
    visualType: fixture.publicVisualType,
    criteriaScores: fixture.criteriaScores,
    kruPomScores: Object.fromEntries(Object.entries(fixture.framework).map(([name, status]) => [name, { status }])),
    criticalOverviewError: fixture.criticalOverviewError,
    overviewAccuracyStatus: fixture.overviewAccuracyStatus,
    dataSelectionQuality: fixture.dataSelectionQuality,
    groupingLogicStatus: fixture.groupingLogicStatus,
    dataAccuracyRisk: fixture.dataAccuracyRisk,
    mainScoreLimitingFactor: fixture.mainScoreLimitingFactor,
    mostUrgentRepair: fixture.mostUrgentRepair
  };
  const canonical = buildCanonicalAnalysis({ payload, analysis });
  const report = projectCanonicalAnalysis(canonical, analysis);
  assert.equal(report.estimatedBandRange, fixture.estimatedBandRange);
  assert.equal(report.criteriaScores["Task Achievement"].range, "6.5-7.0");
  assert.deepEqual(report.criteriaScores["Task Achievement"].numericRange, { low: 6.5, high: 7 });
  assert.equal(report.criticalOverviewError, false);
  assert.equal(canonical.metadata.visualType, "Mixed / Combination Visuals");
  assert.equal(canonical.metadata.internalVisualSubtype, fixture.internalVisualSubtype);
  for (const [key, value] of Object.entries(ANALYSIS_VERSIONS)) assert.equal(canonical.metadata[key], value);
  assert.equal(canonical.metadata.inputFingerprint, "fixture-fingerprint");
}

async function testDuplicateBeforeQuotaAndDailyLimit() {
  const rootDir = await mkdtemp(path.join(tmpdir(), "diagnostic-v10-"));
  try {
    process.env = {
      ...originalEnv,
      SESSION_SECRET: "v10-test-session",
      DIAGNOSTIC_STORAGE_ADAPTER: "local-json",
      DIAGNOSTIC_REQUIRE_FULL_ENGINE: "false",
      DIAGNOSTIC_ANALYSIS_MODE: "sync",
      TEACHER_DAILY_SAFETY_LIMIT: "1"
    };
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    await writeFile(path.join(rootDir, "users.json"), JSON.stringify([
      { username: "student-a", password: "pass-a", displayName: "Student A", role: "student", quotaMode: "limited", quota: 1, used: 0, status: "active" },
      { username: "teacher-a", password: "pass-t", displayName: "Teacher A", role: "teacher", quotaMode: "unlimited", used: 0, status: "active" }
    ], null, 2));
    await writeFile(path.join(rootDir, "student-profiles.json"), JSON.stringify([
      { id: "teacher-student", ownerAccountId: "teacher-a", displayName: "Learner", normalizedName: "learner", active: true }
    ], null, 2));
    await writeFile(path.join(rootDir, "submission-history.json"), "[]");
    await writeFile(path.join(rootDir, "usage-audit.json"), "[]");

    const handler = createApiHandler({ rootDir });
    await assertDuplicateLifecycle(handler, rootDir, "student-a", "pass-a", false);
    await assertDuplicateLifecycle(handler, rootDir, "teacher-a", "pass-t", true);
  } finally {
    process.env = originalEnv;
    await rm(rootDir, { recursive: true, force: true });
  }
}

async function assertDuplicateLifecycle(handler, rootDir, username, password, teacher) {
  const login = await request(handler, "POST", "/api/login", { username, password });
  const cookie = login.headers["Set-Cookie"];
  const profiles = await request(handler, "GET", "/api/student-profiles", null, cookie);
  const studentProfileToken = profiles.json.profiles[0].profileToken;
  const base = {
    taskType: "Task 2",
    essayType: "Opinion Essay",
    prompt: "Some people think governments should make public transport free. To what extent do you agree or disagree?",
    writing: opinionWriting(),
    targetBand: "7.0",
    studentProfileToken,
    options: {}
  };
  const first = await request(handler, "POST", "/api/analyze", { ...base, clientSubmissionId: `${username}-first` }, cookie);
  assert.equal(first.statusCode, 200);
  assert.equal(first.json.duplicateSubmission, false);
  const duplicate = await request(handler, "POST", "/api/analyze", { ...base, clientSubmissionId: `${username}-duplicate` }, cookie);
  assert.equal(duplicate.statusCode, 200, "exact duplicate bypasses exhausted limit");
  assert.equal(duplicate.json.duplicateSubmission, true);
  assert.equal(duplicate.json.creditConsumed, false);
  assert.equal(duplicate.json.dailyLimitConsumed, false);
  assert.equal(duplicate.json.pdfProjectionId, first.json.progressRecord.pdfProjectionId);
  assert.match(duplicate.json.message, /No credit or daily limit was used/);

  const users = JSON.parse(await readFile(path.join(rootDir, "users.json"), "utf8"));
  const savedUser = users.find((user) => user.username === username);
  if (teacher) assert.equal(Object.values(savedUser.dailyUsage || {}).reduce((sum, value) => sum + value, 0), 1);
  else assert.equal(savedUser.used, 1);
  const history = JSON.parse(await readFile(path.join(rootDir, "submission-history.json"), "utf8"));
  assert.equal(history.filter((record) => record.username === username).length, 1);
  const record = history.find((item) => item.username === username);
  assert.equal(record.inputFingerprint, record.submissionHash);
  assert.equal(record.analysisReason, "first-analysis");
  assert.equal(record.engineVersion, ANALYSIS_VERSIONS.engineVersion);
  assert.ok(record.pdfProjectionId);
}

function selectOptions(html, id) {
  const body = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`))?.[1] || "";
  return [...body.matchAll(/<option(?:\s+[^>]*)?>([\s\S]*?)<\/option>/g)]
    .map((match) => match[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim());
}

async function request(handler, method, requestPath, body = null, cookie = "") {
  const response = await handler({
    method,
    path: requestPath,
    headers: cookie ? { cookie } : {},
    body: body ? JSON.stringify(body) : ""
  });
  return { ...response, json: JSON.parse(response.body || "{}") };
}

function opinionWriting() {
  return [
    "Some people argue that governments should make public transport free for every citizen. I strongly agree because universal access would reduce private-car dependence and improve access to essential opportunities.",
    "The first reason is that fare-free buses and trains would give commuters a practical reason to leave their cars at home. When a reliable journey costs nothing, workers who currently drive short distances can switch to public transport without increasing their household expenses. For example, a city that removes bus fares for daily commuters can reduce the number of cars entering its centre during rush hour. This change would lower congestion and make the remaining road network more efficient.",
    "Free public transport would also improve access to education and employment for lower-income residents. Transport fares can prevent people from attending interviews, training courses, or medical appointments even when the services themselves are available. If the government funds these journeys through general taxation, residents can reach opportunities according to need rather than immediate ability to pay. Wider participation would benefit both individuals and the local economy.",
    "In conclusion, I strongly agree that public transport should be free because the policy can reduce unnecessary car use and ensure that essential opportunities remain accessible to all residents."
  ].join("\n\n");
}
