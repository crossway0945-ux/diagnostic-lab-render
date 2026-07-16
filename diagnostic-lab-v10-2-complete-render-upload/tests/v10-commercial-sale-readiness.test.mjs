import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { createApiHandler } from "../services/apiRouter.js";
import { classifyTask1Visual, TASK1_PUBLIC_VISUAL_TYPES } from "../services/task1Safety.js";
import { analyzeTask2Safety, classifyTask2Prompt, TASK2_PUBLIC_ESSAY_TYPES } from "../services/task2Safety.js";

const ORIGINAL_ENV = { ...process.env };
const task2Prompt = "Some people think governments should provide free public transport. To what extent do you agree or disagree?";
const task2Writing = makeWords([
  "Some people believe governments should provide free public transport. I strongly agree because it can improve access and reduce congestion.",
  "The first reason is fair access. Free buses can help low-income workers reach jobs and education without losing essential household income. This support can therefore widen practical opportunities.",
  "The second reason is lower congestion. A frequent free service can persuade commuters to leave private cars at home, which reduces traffic and improves journey reliability for everyone.",
  "In conclusion, I strongly agree that governments should provide free public transport because it improves access and reduces congestion."
].join("\n\n"), 255);

await main();

async function main() {
  await testExactPublicTaxonomies();
  testTask1SubtypeDetection();
  testTask2PublicRouting();
  await testTenRunCanonicalStability();
  await testApiReproducibilityIsolationAndVersioning();
  console.log("V10 commercial gate: exact public taxonomies, internal subtype routing, progress isolation, duplicate credit safety, versioned re-analysis, and ten-run canonical stability passed.");
}

function testExactPublicTaxonomies() {
  assert.deepEqual(TASK1_PUBLIC_VISUAL_TYPES, [
    "Line Graph", "Bar Chart", "Pie Chart", "Table", "Map", "Diagram", "Mixed / Combination Visuals", "Not Sure / Auto-detect"
  ]);
  assert.deepEqual(TASK2_PUBLIC_ESSAY_TYPES, [
    "Opinion Essay", "Discuss Both Views", "Problem & Solution", "Advantages & Disadvantages", "Direct Question", "Not Sure / Auto-detect"
  ]);
  return Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../netlify-static-preview/index.html", import.meta.url), "utf8")
  ]).then((sources) => {
    for (const html of sources) {
      assert.deepEqual(selectOptions(html, "visual-type"), TASK1_PUBLIC_VISUAL_TYPES);
      assert.deepEqual(selectOptions(html, "essay-type"), TASK2_PUBLIC_ESSAY_TYPES);
      assert.match(html, /id="progress-student-select"/);
      assert.match(html, /id="progress-student-search"/);
      assert.match(html, /id="progress-student-status"/);
      assert.match(html, /Select a student to view progress\./);
    }
  });
}

function testTask1SubtypeDetection() {
  const process = classifyTask1Visual({
    visualType: "Diagram",
    prompt: "The diagram shows the stages involved in recycling used glass bottles."
  });
  assert.equal(process.publicVisualType, "Diagram");
  assert.equal(process.internalVisualSubtype, "process");
  assert.equal(process.confidence, "high");
  assert.equal(process.classificationMatch, true);

  const mechanism = classifyTask1Visual({
    visualType: "Diagram",
    prompt: "The diagrams show the components of a solar panel and how the device works to heat air and water."
  });
  assert.equal(mechanism.publicVisualType, "Diagram");
  assert.equal(mechanism.internalVisualSubtype, "structural-mechanism");
  assert.equal(mechanism.classificationMatch, true);

  const mixed = classifyTask1Visual({
    visualType: "Bar Chart",
    prompt: "The pie chart and bar chart compare household spending and average income in 2020."
  });
  assert.equal(mixed.publicVisualType, "Mixed / Combination Visuals");
  assert.equal(mixed.confidence, "high");
  assert.equal(mixed.classificationMatch, false);
}

function testTask2PublicRouting() {
  const fixtures = [
    ["What are the causes of traffic congestion and what solutions can be introduced?", "Problem & Solution", "causes-solutions"],
    ["What problems does traffic congestion cause and what solutions can be introduced?", "Problem & Solution", "problem-solution"],
    ["What are the advantages and disadvantages of online study?", "Advantages & Disadvantages", "advantages-disadvantages"],
    ["Do the advantages of online study outweigh the disadvantages?", "Advantages & Disadvantages", "outweigh"],
    ["What are the causes and effects of urban migration?", "Direct Question", "causes-effects"],
    ["Is this a positive or negative development?", "Direct Question", "positive-negative-development"]
  ];
  for (const [prompt, publicType, internalSubtype] of fixtures) {
    const result = classifyTask2Prompt({ prompt, essayType: publicType });
    assert.equal(result.publicEssayType, publicType);
    assert.equal(result.internalEssaySubtype, internalSubtype);
    assert.ok(result.internalObligations.length);
    assert.equal(result.classificationMatch, true);
  }
}

async function testTenRunCanonicalStability() {
  const payload = { taskType: "Task 2", essayType: "Opinion Essay", prompt: task2Prompt, writing: task2Writing, targetBand: "7.0" };
  const snapshots = [];
  for (let index = 0; index < 10; index += 1) {
    const safety = analyzeTask2Safety(payload);
    const report = await analyzeWriting(payload);
    snapshots.push(JSON.stringify({
      publicType: safety.taskClassification.publicEssayType,
      internalSubtype: safety.taskClassification.internalEssaySubtype,
      obligations: safety.taskClassification.internalObligations,
      position: safety.detectedPosition,
      route: safety.routeAssessment,
      criteria: report.criteriaScores,
      overall: report.estimatedBandRange,
      caps: report.capMetadata,
      issues: (report.top3Issues || []).map((issue) => issue.issueType || issue.title),
      severity: (report.feedbackCards || []).map((card) => card.severity)
    }));
  }
  assert.equal(new Set(snapshots).size, 1);
}

async function testApiReproducibilityIsolationAndVersioning() {
  const rootDir = await mkdtemp(path.join(tmpdir(), "diagnostic-v10-"));
  try {
    process.env.SESSION_SECRET = "v10-commercial-test";
    process.env.DIAGNOSTIC_STORAGE_ADAPTER = "local-json";
    process.env.TEACHER_DAILY_SAFETY_LIMIT = "1";
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    await writeFile(path.join(rootDir, "users.json"), JSON.stringify([{
      username: "teacher-v10", password: "pass-v10", displayName: "Teacher V10", role: "teacher", quotaMode: "unlimited", used: 0, status: "active"
    }], null, 2));
    await writeFile(path.join(rootDir, "student-profiles.json"), JSON.stringify([
      { id: "student-a", ownerAccountId: "teacher-v10", displayName: "Student A", normalizedName: "student a", active: true },
      { id: "student-b", ownerAccountId: "teacher-v10", displayName: "Student B", normalizedName: "student b", active: true }
    ], null, 2));
    await writeFile(path.join(rootDir, "submission-history.json"), "[]\n");

    const versions10 = { canonicalEngineVersion: "10.0.0", rubricVersion: "2026.07.16", promptVersion: "10.0.0", reportSchemaVersion: "10.0.0" };
    const handler = createApiHandler({ rootDir, analysisVersions: versions10 });
    const login = await request(handler, "POST", "/api/login", { username: "teacher-v10", password: "pass-v10" });
    const cookie = login.headers["Set-Cookie"];
    const profiles = await request(handler, "GET", "/api/student-profiles", null, cookie);
    const studentA = profiles.json.profiles.find((profile) => profile.displayName === "Student A").profileToken;
    const studentB = profiles.json.profiles.find((profile) => profile.displayName === "Student B").profileToken;

    const mismatch = await request(handler, "POST", "/api/analyze", task1Payload(studentA, "Bar Chart", "The line graph and table compare electricity demand and capacity from 2010 to 2020."), cookie);
    assert.equal(mismatch.statusCode, 409);
    assert.equal(mismatch.json.errorCode, "VISUAL_TYPE_MISMATCH");
    assert.equal(mismatch.json.detectedVisualType, "Mixed / Combination Visuals");
    assert.equal((await history(rootDir)).length, 0);
    assert.equal((await session(handler, cookie)).json.user.dailySafetyUsed, 0);

    const firstPayload = task2Payload(studentA, "first-a");
    const first = await request(handler, "POST", "/api/analyze", firstPayload, cookie);
    assert.equal(first.statusCode, 200);
    assert.equal(first.json.analysis.essayType, "Opinion Essay");
    assert.equal(first.json.progressRecord.canonicalEngineVersion, "10.0.0");
    assert.equal(first.json.progressRecord.analysisReason, "first-analysis");
    assert.equal((await session(handler, cookie)).json.user.dailySafetyUsed, 1);

    const duplicate = await request(handler, "POST", "/api/analyze", { ...firstPayload, clientSubmissionId: "duplicate-a" }, cookie);
    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.json.duplicateSubmission, true);
    assert.deepEqual(duplicate.json.analysis, first.json.analysis);
    assert.equal((await history(rootDir)).length, 1);
    assert.equal((await session(handler, cookie)).json.user.dailySafetyUsed, 1);

    process.env.TEACHER_DAILY_SAFETY_LIMIT = "50";

    const otherStudent = await request(handler, "POST", "/api/analyze", task2Payload(studentB, "first-b"), cookie);
    assert.equal(otherStudent.statusCode, 200);
    assert.notEqual(otherStudent.json.progressRecord.submissionId, first.json.progressRecord.submissionId);
    const progressA = await request(handler, "GET", `/api/progress?student=${encodeURIComponent(studentA)}&taskType=Task%202`, null, cookie);
    const progressB = await request(handler, "GET", `/api/progress?student=${encodeURIComponent(studentB)}&taskType=Task%202`, null, cookie);
    assert.equal(progressA.json.validRecords.length, 1);
    assert.equal(progressB.json.validRecords.length, 1);

    const revised = await request(handler, "POST", "/api/analyze", {
      ...task2Payload(studentA, "revised-a"),
      writing: `${task2Writing}\n\nThis revised sentence adds a meaningful practical qualification.`
    }, cookie);
    assert.equal(revised.statusCode, 200);
    assert.equal(revised.json.progressSummary.previousSubmissionCount, 1);
    assert.equal(revised.json.progressSummary.latestEstimatedRange, revised.json.analysis.estimatedBandRange);

    const handler11 = createApiHandler({
      rootDir,
      analysisVersions: { ...versions10, canonicalEngineVersion: "10.1.0", promptVersion: "10.1.0" }
    });
    const upgraded = await request(handler11, "POST", `/api/submissions/${first.json.progressRecord.submissionId}/reanalyze`, {}, cookie);
    assert.equal(upgraded.statusCode, 200);
    assert.equal(upgraded.json.reanalysisStatus, "engine-upgrade-created");
    assert.equal(upgraded.json.progressRecord.parentReportId, first.json.progressRecord.submissionId);
    assert.equal(upgraded.json.progressRecord.analysisReason, "engine-upgrade");
    assert.equal(upgraded.json.progressRecord.canonicalEngineVersion, "10.1.0");
    const afterUpgrade = await history(rootDir);
    assert.ok(afterUpgrade.some((record) => record.submissionId === first.json.progressRecord.submissionId));
    assert.ok(afterUpgrade.some((record) => record.parentReportId === first.json.progressRecord.submissionId));

    const sameVersionRerun = await request(handler11, "POST", `/api/submissions/${upgraded.json.progressRecord.submissionId}/reanalyze`, {}, cookie);
    assert.equal(sameVersionRerun.statusCode, 200);
    assert.equal(sameVersionRerun.json.reanalysisStatus, "same-version-existing-report");
    assert.equal((await history(rootDir)).length, afterUpgrade.length);
  } finally {
    process.env = { ...ORIGINAL_ENV };
    await rm(rootDir, { recursive: true, force: true });
  }
}

function task2Payload(studentProfileToken, clientSubmissionId) {
  return { taskType: "Task 2", essayType: "Not Sure / Auto-detect", visualType: "", targetBand: "7.0", clientSubmissionId, studentProfileToken, prompt: task2Prompt, writing: task2Writing, options: {} };
}

function task1Payload(studentProfileToken, visualType, prompt) {
  return {
    taskType: "Task 1", essayType: "", visualType, targetBand: "7.0", clientSubmissionId: "task1-mismatch", studentProfileToken, prompt,
    writing: makeWords("The visuals compare electricity demand and capacity. Overall, demand increased while capacity remained higher throughout the period.", 155), options: {}
  };
}

function selectOptions(html, id) {
  const select = html.match(new RegExp(`<select id="${id}"[\\s\\S]*?<\\/select>`))?.[0] || "";
  return [...select.matchAll(/<option(?:\s+selected)?>([\s\S]*?)<\/option>/g)]
    .map((match) => match[1].replaceAll("&amp;", "&").trim());
}

function makeWords(text, target) {
  const current = text.trim().split(/\s+/).length;
  return `${text} ${Array.from({ length: Math.max(0, target - current) }, (_, index) => `detail${index + 1}`).join(" ")}`.trim();
}

async function history(rootDir) {
  return JSON.parse(await readFile(path.join(rootDir, "submission-history.json"), "utf8"));
}

async function session(handler, cookie) {
  return request(handler, "GET", "/api/session", null, cookie);
}

async function request(handler, method, requestPath, body = null, cookie = "") {
  const response = await handler({ method, path: requestPath, headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body === null ? "" : JSON.stringify(body) });
  return { ...response, json: JSON.parse(response.body || "{}") };
}
