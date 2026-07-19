import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeTask2Safety, reconcileTask2CanonicalAnalysis } from "../services/task2Safety.js";
import { buildCanonicalAnalysis, projectCanonicalAnalysis } from "../services/canonicalAnalysis.js";
import { applyTask2ClassificationGuard, createApiHandler } from "../services/apiRouter.js";
import { analyzeWriting, validateReportOutput } from "../services/aiAnalyzer.js";

const sunPrompt = "Some people believe that the amount of money spent on the development of technology for space exploration is not justified, and there are more beneficial ways to spend this money. To what extent do you agree or disagree?";
const sunWriting = [
  "Some people believe that the amount of money spent on the development of technology for space exploration is not justified, and there are more beneficial ways to spend this money. However, I heavily disagree with this view, since it can provide numerous benefits for humans.",
  "On one hand, investing money in developing technology for space exploration is advantageous in various aspects. For example, satellites play a pivotal role in communication, navigation, and disaster monitoring. Furthermore, it can encourage the young majority to study subjects like astrology, math, and physics. This can provide more opportunities for occupations ,which increases the number of employees, reducing financial issues. In addition, there are still many undiscovered secrets in the space,which might create a significant impact in the future. These discoveries can create innovations and knowledge that may help societies respond to future challenges.",
  "On the other hand, there are several areas that need financial support. For example, many countries still struggle with poverty, inadequate healthcare, and insufficient food supply, which cannot be overlooked. Some people might also think that the government should invest money in building facilities like hospitals, schools, and basic needs, such as water, foods, and shelters. Furthermore, problems like global warming cannot be overlooked and can cause significant and certain impacts in the future, such as ice cap melting, floods, etc.",
  "In conclusion, even though the government should operate in solving issues that need large financial support, I believe that the money spent on developing the technology for space exploration is justified, since it can provide many long-term direct and indirect benefits for humans."
].join("\n\n");

await testSunCanonicalOpinionRoute();
testLowConfidenceConfirmation();
await testMismatchAndInvalidProgressLifecycle();
console.log("V8.2 critical correction: Sun route, prompt mismatch blocking, invalidation, and server progress invariants passed.");

async function testSunCanonicalOpinionRoute() {
  const payload = {
    taskType: "Task 2",
    essayType: "Opinion Essay",
    prompt: sunPrompt,
    writing: sunWriting,
    clientSubmissionId: "sun-v8-2-golden"
  };
  const safety = analyzeTask2Safety(payload);
  assert.equal(safety.wordCount, 264);
  assert.equal(safety.taskClassification.essayType, "opinion");
  assert.equal(safety.taskClassification.confidence, "high");
  assert.equal(safety.detectedPosition, "strongly disagree");
  assert.equal(safety.positionConfidence, "high");
  assert.equal(safety.routeConflict, false);
  assert.equal(safety.routeAssessment.status, "partially_developed");
  assert.match(safety.routeAssessment.bodyRoutes[0].label, /writer's disagreement/);
  assert.match(safety.routeAssessment.bodyRoutes[1].label, /relevant concession/);
  assert.equal(safety.routeAssessment.bodyRoutes[1].status, "partially_developed");
  assert.match(safety.routeAssessment.conclusionLabel, /disagree/);
  assert.equal(safety.capMetadata.caps.some((cap) => cap.reasonCode === "REQUIRED_POSITION_ABSENT"), false);
  assert.doesNotMatch(safety.routeAssessment.summary, /supports the proposition|opposes the proposition/i);

  const provider = {
    criteriaScores: Object.fromEntries([
      "Task Response",
      "Coherence & Cohesion",
      "Lexical Resource",
      "Grammatical Range & Accuracy"
    ].map((name) => [name, { range: "7.0-7.5", diagnosis: "Legacy provider diagnosis", evidence: "Legacy provider evidence" }])),
    kruPomScores: {
      "Thesis Route Clarity": { status: "Needs Work", diagnosis: "Position unclear" },
      "Conclusion Closure": { status: "Needs Work", diagnosis: "Conclusion missing" }
    },
    mainScoreLimitingFactor: "Position unclear",
    mostUrgentRepair: "Choose a position",
    practicePlan: []
  };
  const canonicalTask2Analysis = reconcileTask2CanonicalAnalysis(payload, provider, safety);
  for (const criterion of ["Task Response", "Coherence & Cohesion", "Lexical Resource"]) {
    const bands = canonicalTask2Analysis.criterionScores[criterion].range.match(/\d+(?:\.\d+)?/g).map(Number);
    assert.ok(Math.min(...bands) >= 6.0 && Math.max(...bands) <= 6.5);
  }
  assert.ok(Number(canonicalTask2Analysis.criterionScores["Grammatical Range & Accuracy"].range.match(/\d+(?:\.\d+)?/g).at(-1)) <= 7.0);
  assert.equal(canonicalTask2Analysis.overallScore.label, "6.0-6.5");
  assert.match(canonicalTask2Analysis.executiveSummary.mainScoreLimitingFactor, /disagreement position is clear/i);
  assert.match(canonicalTask2Analysis.executiveSummary.mostUrgentRepair, /keep the disagreement route/i);

  const canonical = buildCanonicalAnalysis({
    payload,
    analysis: { ...provider, canonicalTask2Analysis },
    feedbackCards: [],
    repairPlan: []
  });
  const report = projectCanonicalAnalysis(canonical, provider);
  assert.equal(report.estimatedBandRange, "6.0-6.5");
  assert.equal(report.kruPomScores["Position Clarity"].status, "Strong");
  assert.equal(report.kruPomScores["Thesis Route Clarity"].status, "Moderate");
  assert.equal(report.kruPomScores["Body Paragraph Route Alignment"].status, "Moderate");
  assert.equal(report.kruPomScores["Conclusion Closure"].status, "Strong");
  assert.doesNotMatch(JSON.stringify(report), /Task 2 V8 canonical route and criterion arithmetic applied/i);

  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;
  try {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    const fullReport = validateReportOutput(await analyzeWriting(payload), payload);
    assert.equal(fullReport.estimatedBandRange, "6.0-6.5");
    assert.equal(fullReport.detectedPosition, "strongly disagree");
    assert.equal(fullReport.positionConfidence, "high");
    assert.equal(fullReport.capMetadata.applied, false);
    assert.equal(fullReport.kruPomScores["Position Clarity"].status, "Strong");
    assert.doesNotMatch(JSON.stringify(fullReport.warnings || []), /canonical route and criterion arithmetic applied/i);
  } finally {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalModel;
  }
}

function testLowConfidenceConfirmation() {
  const payload = {
    taskType: "Task 2",
    essayType: "Opinion Essay",
    prompt: "What are your thoughts about modern technology in society?",
    writing: sunWriting,
    options: {}
  };
  const selected = applyTask2ClassificationGuard(structuredClone(payload));
  assert.equal(selected.promptClassificationConfidence, "low");
  assert.equal(selected.selectedEssayTypeLabel, "Opinion Essay");
  assert.equal(selected.classificationConfirmation, undefined);
}

async function testMismatchAndInvalidProgressLifecycle() {
  const rootDir = await mkdtemp(path.join(tmpdir(), "diagnostic-v8-2-"));
  const originalEnv = {
    SESSION_SECRET: process.env.SESSION_SECRET,
    DIAGNOSTIC_STORAGE_ADAPTER: process.env.DIAGNOSTIC_STORAGE_ADAPTER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL
  };
  try {
    process.env.SESSION_SECRET = "v8-2-test-session";
    process.env.DIAGNOSTIC_STORAGE_ADAPTER = "local-json";
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    await writeFile(path.join(rootDir, "users.json"), JSON.stringify([{
      username: "teacher-a",
      password: "pass-a",
      displayName: "Teacher A",
      role: "teacher",
      quotaMode: "unlimited",
      used: 0,
      status: "active"
    }], null, 2));
    await writeFile(path.join(rootDir, "student-profiles.json"), JSON.stringify([{
      id: "student-sun",
      ownerAccountId: "teacher-a",
      displayName: "Sun",
      normalizedName: "sun",
      active: true
    }], null, 2));
    await writeFile(path.join(rootDir, "submission-history.json"), JSON.stringify([
      progressRecord("old-valid", "2026-07-12T01:00:00.000Z", "6.0", "valid"),
      progressRecord("bad-report", "2026-07-13T01:00:00.000Z", "5.5-6.0", "invalid"),
      progressRecord("latest-valid", "2026-07-14T01:00:00.000Z", "6.0-6.5", "valid"),
      { ...progressRecord("other-owner", "2026-07-14T02:00:00.000Z", "7.0", "valid"), username: "teacher-b", ownerAccountId: "teacher-b" }
    ], null, 2));

    const handler = createApiHandler({ rootDir });
    const login = await request(handler, "POST", "/api/login", { username: "teacher-a", password: "pass-a" });
    const cookie = login.headers["Set-Cookie"];
    const profiles = await request(handler, "GET", "/api/student-profiles", null, cookie);
    const studentToken = profiles.json.profiles[0].profileToken;
    const mismatch = await request(handler, "POST", "/api/analyze", {
      taskType: "Task 2",
      essayType: "Discuss Both Views",
      prompt: "Many cities experience serious traffic congestion. What problems does this cause, and what solutions can governments introduce?",
      writing: sunWriting,
      studentProfileToken: studentToken,
      clientSubmissionId: "must-not-reach-provider",
      options: {}
    }, cookie);
    assert.equal(mismatch.statusCode, 409);
    assert.equal(mismatch.json.errorCode, "ESSAY_TYPE_MISMATCH");
    assert.equal(mismatch.json.selectedEssayType, "Discuss Both Views");
    assert.equal(mismatch.json.detectedEssayType, "Problem & Solution");
    assert.equal(mismatch.json.promptClassificationConfidence, "high");
    assert.equal(mismatch.json.classificationMatch, false);
    const historyAfterMismatch = JSON.parse(await readFile(path.join(rootDir, "submission-history.json"), "utf8"));
    assert.equal(historyAfterMismatch.length, 4);

    const crossAccount = await request(handler, "PATCH", "/api/submissions/other-owner", {
      action: "invalidate",
      reason: "Must not cross account ownership"
    }, cookie);
    assert.equal(crossAccount.statusCode, 404);

    const before = await request(handler, "GET", `/api/progress?student=${encodeURIComponent(studentToken)}&taskType=Task%202`, null, cookie);
    assert.equal(before.statusCode, 200);
    assert.equal(before.json.records.length, 3);
    assert.equal(before.json.validRecords.length, 2);
    assert.equal(before.json.summary.previousSubmissionCount, 1);
    assert.equal(before.json.summary.previousEstimatedRange, "6.0");
    assert.equal(before.json.summary.latestEstimatedRange, "6.0-6.5");

    const invalidated = await request(handler, "PATCH", "/api/submissions/latest-valid", {
      action: "invalidate",
      reason: "Known scoring-engine regression"
    }, cookie);
    assert.equal(invalidated.statusCode, 200);
    assert.equal(invalidated.json.record.analysisValidity, "invalid");
    assert.equal(invalidated.json.progressSummary.latestEstimatedRange, "6.0");
    assert.equal(invalidated.json.progressSummary.previousSubmissionCount, 0);
    const userAfter = await request(handler, "GET", "/api/session", null, cookie);
    assert.equal(userAfter.json.user.used, 0);
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(rootDir, { recursive: true, force: true });
  }
}

function progressRecord(submissionId, dateTime, estimatedBandRange, analysisValidity) {
  return {
    submissionId,
    clientSubmissionId: submissionId,
    username: "teacher-a",
    ownerAccountId: "teacher-a",
    studentProfileId: "student-sun",
    studentDisplayNameSnapshot: "Sun",
    taskType: "Task 2",
    essayType: "Opinion Essay",
    dateTime,
    estimatedBandRange,
    mostUrgentRepair: `Repair for ${submissionId}`,
    top3Issues: [{ issueType: "Body Route Alignment" }],
    analysisValidity,
    report: { taskType: "Task 2", estimatedBandRange }
  };
}

async function request(handler, method, requestPath, body = null, cookie = "") {
  const response = await handler({
    method,
    path: requestPath,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : ""
  });
  return {
    statusCode: response.statusCode,
    headers: response.headers || {},
    json: JSON.parse(response.body || "{}")
  };
}
