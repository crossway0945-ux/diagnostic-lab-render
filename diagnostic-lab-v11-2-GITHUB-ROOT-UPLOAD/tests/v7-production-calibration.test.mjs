import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApiHandler } from "../services/apiRouter.js";
import {
  analyzeTask2Safety,
  assessTask2RevisionFidelity,
  deriveTask2OverallBandRange,
  reconcileTask2CanonicalAnalysis
} from "../services/task2Safety.js";
import { countWords } from "../wordCount.js";

const ORIGINAL_ENV = { ...process.env };

const TASK_TYPES = [
  {
    expected: "opinion",
    essayType: "Opinion Essay",
    stanceRequired: true,
    prompt: "Governments should make city-centre public transport free. To what extent do you agree or disagree?",
    intro: "I strongly agree that city-centre public transport should be free because this policy can improve access and reduce congestion.",
    body1: "The first benefit is fair access for low-income commuters because free services allow them to reach work and education.",
    body2: "Another advantage is lower congestion because reliable buses can persuade drivers to leave private cars at home.",
    conclusion: "In conclusion, I strongly agree that free city-centre public transport would improve access and reduce congestion."
  },
  {
    expected: "discuss-both-views",
    essayType: "Discuss Both Views",
    stanceRequired: true,
    prompt: "Some people prefer working at home, while others prefer working in an office. Discuss both views and give your own opinion.",
    intro: "Both arrangements have value, but I believe office work is generally more effective for collaborative roles.",
    body1: "Supporters of home working argue that it saves commuting time and allows employees to organise focused tasks flexibly.",
    body2: "Supporters of office work emphasise direct communication, shared problem solving, and faster feedback from colleagues.",
    conclusion: "In conclusion, home working offers flexibility, but I believe office work better supports sustained collaboration."
  },
  {
    expected: "advantages-disadvantages",
    essayType: "Advantage / Disadvantage",
    stanceRequired: false,
    prompt: "More university courses are delivered online. What are the advantages and disadvantages of this development?",
    intro: "Online university courses create important benefits as well as practical drawbacks for learners and institutions.",
    body1: "The main advantage is wider access because students can attend lessons without relocating or paying daily travel costs.",
    body2: "The main disadvantage is reduced face-to-face interaction, which can make discussion and immediate academic support harder.",
    conclusion: "In conclusion, online courses improve access but can weaken direct interaction and support."
  },
  {
    expected: "outweigh",
    essayType: "Advantage / Disadvantage Outweigh",
    stanceRequired: true,
    prompt: "A large young population can create both benefits and drawbacks. Do the advantages outweigh the disadvantages?",
    intro: "Although a young population can increase job-market pressure, I believe its economic advantages outweigh the disadvantages.",
    body1: "The main disadvantage is stronger competition for employment when many graduates enter a limited labour market together.",
    body2: "The stronger advantage is a larger workforce that can raise productivity, tax revenue, and long-term economic capacity.",
    conclusion: "In conclusion, the advantages of a productive young workforce outweigh the disadvantages of temporary employment pressure."
  },
  {
    expected: "causes-solutions",
    essayType: "Problem & Solution",
    stanceRequired: false,
    prompt: "Traffic congestion is increasing in many cities. What are the causes of this problem and what solutions can be taken?",
    intro: "Urban congestion is mainly caused by growing private-car use and can be reduced through practical transport measures.",
    body1: "The first cause is the growing number of private cars because many commuters consider driving more convenient than shared transport.",
    body2: "A practical solution is sustained investment in reliable public transport and incentives that encourage commuters to share journeys.",
    conclusion: "In conclusion, rising car use causes congestion, while reliable public transport and shared travel can reduce it."
  },
  {
    expected: "direct-question",
    essayType: "Direct Question",
    stanceRequired: false,
    prompt: "Why do many graduates move to large cities? What problems can this movement create?",
    intro: "Graduates often move to large cities for employment, although this movement can create housing and infrastructure pressure.",
    body1: "The main reason is access to a wider labour market because major employers and specialist careers are concentrated in cities.",
    body2: "The main problem is pressure on housing and transport because a rapid population increase can exceed available capacity.",
    conclusion: "In conclusion, graduates move for employment, but this movement can increase housing and transport pressure."
  }
];

const CASES = ["high", "underdeveloped", "unclear-route", "complete-language-errors"];

await testTwentyFourTaskTypeFixtures();
await testEvinProblemSolutionRegression();
await testCriterionArithmeticAndExplicitCaps();
await testRevisionFidelity();
await testStudentArchiveRestorePreservesHistoryAndCredits();

async function testTwentyFourTaskTypeFixtures() {
  let fixtureCount = 0;
  for (const definition of TASK_TYPES) {
    for (const caseName of CASES) {
      fixtureCount += 1;
      const payload = buildFixture(definition, caseName);
      const safety = analyzeTask2Safety(payload);
      assert.equal(safety.essayRoute, definition.expected, `${definition.expected}/${caseName} task classification`);
      assert.equal(safety.stanceRequired, definition.stanceRequired, `${definition.expected}/${caseName} stance requirement`);
      assert.equal(safety.canonicalAnalysis.routeAssessment.schema.length > 0, true);
      assert.equal(Array.isArray(safety.taskRequirements), true);
      if (!definition.stanceRequired) {
        assert.equal(safety.detectedPosition, "");
        assert.equal(safety.positionConfidence, "not-applicable");
        assert.doesNotMatch(safety.bodyRouteSummary, /supports? the proposition|opposes? the proposition|final position|detected position/i);
      }
      if (["high", "complete-language-errors", "unclear-route"].includes(caseName)) {
        assert.ok(countWords(payload.writing) >= 250, `${definition.expected}/${caseName} must be a complete-length fixture`);
      }
      if (caseName === "complete-language-errors") {
        assert.ok(safety.languageAccuracyRisk.signalCount >= 2, `${definition.expected} language-error fixture must expose distributed signals`);
      }
    }
  }
  assert.equal(fixtureCount, 24);
}

function buildFixture(definition, caseName) {
  let paragraphs;
  if (caseName === "underdeveloped") {
    paragraphs = [definition.intro, definition.body1, definition.body2, definition.conclusion];
  } else if (caseName === "unclear-route") {
    const neutralIntro = definition.stanceRequired
      ? "This essay will consider the issue and discuss several relevant points without stating a final judgement."
      : definition.intro;
    paragraphs = [neutralIntro, definition.body1, definition.conclusion];
    paragraphs = padParagraphs(paragraphs, 255);
  } else {
    paragraphs = padParagraphs([definition.intro, definition.body1, definition.body2, definition.conclusion], 270);
    if (caseName === "complete-language-errors") {
      paragraphs[1] += " Many people make daily travels in exceeding amounts and this pattern affects planning.";
      paragraphs[2] += " Governments significantly invest in infrastructure;Therefore, the response must remain precise.";
    }
  }
  return {
    taskType: "Task 2",
    essayType: definition.essayType,
    prompt: definition.prompt,
    writing: paragraphs.join("\n\n"),
    targetBand: "7.0",
    options: {}
  };
}

function padParagraphs(paragraphs, target) {
  const output = [...paragraphs];
  let index = 0;
  const developmentSentences = [
    "This route is developed through a clear mechanism, a relevant consequence, and a direct connection to the task.",
    "For example, a realistic case can show how the stated cause or benefit affects people and public systems.",
    "As a result, the paragraph explains why the claim matters instead of merely listing a separate idea.",
    "This evidence supports the controlling sentence and keeps the paragraph focused on one required function."
  ];
  while (countWords(output.join("\n\n")) < target) {
    const bodyIndex = index % 2 ? Math.min(2, output.length - 2) : 1;
    output[bodyIndex] += ` ${developmentSentences[index % developmentSentences.length]}`;
    index += 1;
  }
  return output;
}

async function testEvinProblemSolutionRegression() {
  const evinParagraphs = padParagraphs([
    "Traffic congestion is caused by heavy private-car use and poor travel planning, while public transport and shared travel can reduce the pressure.",
    "The first cause is the rising number of private cars because car ownership is a convenient mode for daily travels. This places exceeding amounts of vehicles on the roads;Therefore, commuters face longer delays.",
    "Governments should significantly invest in reliable public transport, improve service frequency, and encourage car sharing. These solutions reduce the number of separate journeys and respond directly to excessive private-car use.",
    "In conclusion, rising car use and weak planning create congestion, while reliable public transport and shared journeys can address these causes."
  ], 300);
  evinParagraphs[1] += " A second cause is weak coordination between residential growth and transport planning.";
  const writing = evinParagraphs.join("\n\n");
  const payload = {
    taskType: "Task 2",
    essayType: "Problem & Solution",
    prompt: "Traffic congestion is increasing. What are the causes and what solutions can be taken?",
    writing
  };
  const safety = analyzeTask2Safety(payload);
  assert.equal(safety.essayRoute, "causes-solutions");
  assert.equal(safety.stanceRequired, false);
  assert.equal(safety.detectedPosition, "");
  assert.equal(safety.routeAssessment.status, "partially_developed");
  assert.match(safety.bodyRouteSummary, /Body 1 route: develops causes \(partially developed\)/);
  assert.match(safety.bodyRouteSummary, /Body 2 route: develops solutions/);
  assert.match(safety.bodyRouteSummary, /Conclusion route: summarises the task routes/);
  assert.doesNotMatch(safety.bodyRouteSummary, /supports? the proposition|final position/i);

  const provider = {
    criteriaScores: {
      "Task Response": { range: "5.5-6.0", diagnosis: "A second cause is only partly developed.", evidence: "A second cause is weak coordination between residential growth and transport planning." },
      "Coherence & Cohesion": { range: "7.0-7.5", diagnosis: "Paragraphing is clear.", evidence: "Governments should significantly invest in reliable public transport." },
      "Lexical Resource": { range: "7.0-7.5", diagnosis: "Vocabulary is varied.", evidence: "car ownership is a convenient mode" },
      "Grammatical Range & Accuracy": { range: "7.0-7.5", diagnosis: "Grammar is generally controlled.", evidence: "on the roads;Therefore" }
    },
    estimatedBandRange: "5.5-6.0",
    overallBandCap: "6.0",
    taskResponseCapReason: "SAR development is incomplete."
  };
  const canonical = reconcileTask2CanonicalAnalysis(payload, provider, safety);
  assert.equal(canonical.criterionScores["Task Response"].range, "6.0-6.5");
  assert.equal(canonical.criterionScores["Coherence & Cohesion"].range, "6.0-6.5");
  assert.equal(canonical.criterionScores["Lexical Resource"].range, "6.5-7.0");
  assert.equal(canonical.criterionScores["Grammatical Range & Accuracy"].range, "6.5-7.0");
  assert.equal(canonical.overallBandRange.label, "6.5-7.0");
  assert.equal(canonical.capMetadata.overallCap, null, "partial development and SAR must not create a hidden overall cap");
  assert.equal(canonical.frameworkAssessment.sarExampleQuality.scoringRole, "diagnostic-only");
}

async function testCriterionArithmeticAndExplicitCaps() {
  const criteria = {
    "Task Response": { range: "6.0-6.5" },
    "Coherence & Cohesion": { range: "7.0" },
    "Lexical Resource": { range: "6.5-7.0" },
    "Grammatical Range & Accuracy": { range: "7.0" }
  };
  assert.equal(deriveTask2OverallBandRange(criteria).label, "6.5-7.0");
  assert.equal(deriveTask2OverallBandRange(criteria, { overallCap: 6.5 }).label, "6.5-7.0", "legacy global caps cannot override criterion arithmetic");
}

async function testRevisionFidelity() {
  const minimal = assessTask2RevisionFidelity({
    exactSentence: "This places more vehicles on the roads;Therefore, commuters face delays.",
    targetedRevision: "This places more vehicles on the road; therefore, commuters face delays.",
    revisionType: "Minimal Correction"
  });
  assert.equal(minimal.revisionType, "Minimal Correction");
  assert.match(minimal.targetedRevision, /on the roads; Therefore/);
  assert.equal(minimal.preservedAcceptableWording, true);

  const expansion = assessTask2RevisionFidelity({
    exactSentence: "Governments should improve public transport.",
    targetedRevision: "Governments should improve public transport coverage in areas where residents lack access and route availability.",
    revisionType: "Route-Preserving Revision"
  });
  assert.equal(expansion.addsPremise, true);
  assert.equal(expansion.revisionType, "Teacher-Guided Expansion");
}

async function testStudentArchiveRestorePreservesHistoryAndCredits() {
  process.env = { ...ORIGINAL_ENV };
  process.env.SESSION_SECRET = "v7-student-archive-secret";
  process.env.DIAGNOSTIC_STORAGE_ADAPTER = "local-json";
  const rootDir = await mkdtemp(path.join(tmpdir(), "diagnostic-v7-archive-"));
  try {
    await writeFile(path.join(rootDir, "users.json"), JSON.stringify([
      { username: "teacher-v7", password: "pass-v7", displayName: "Teacher V7", role: "teacher", quotaMode: "unlimited", used: 3, status: "active" }
    ], null, 2));
    await writeFile(path.join(rootDir, "submission-history.json"), "[]\n");
    await writeFile(path.join(rootDir, "student-profiles.json"), "[]\n");
    const handler = createApiHandler({ rootDir });
    const login = await request(handler, "POST", "/api/login", { username: "teacher-v7", password: "pass-v7" });
    const cookie = login.headers["Set-Cookie"];
    const created = await request(handler, "POST", "/api/student-profiles", { displayName: "Evin" }, cookie);
    assert.equal(created.statusCode, 201);
    const storedProfile = JSON.parse(await readFile(path.join(rootDir, "student-profiles.json"), "utf8"))[0];
    const history = [{ username: "teacher-v7", studentProfileId: storedProfile.id, taskType: "Task 2", estimatedBandRange: "6.5" }];
    await writeFile(path.join(rootDir, "submission-history.json"), JSON.stringify(history, null, 2));

    const archived = await request(handler, "PATCH", `/api/student-profiles/${encodeURIComponent(created.json.profile.profileToken)}`, { action: "archive" }, cookie);
    assert.equal(archived.statusCode, 200);
    assert.equal(archived.json.profile.active, false);
    const listedArchived = await request(handler, "GET", "/api/student-profiles", null, cookie);
    assert.equal(listedArchived.json.profiles[0].active, false);
    assert.deepEqual(JSON.parse(await readFile(path.join(rootDir, "submission-history.json"), "utf8")), history);
    assert.equal(JSON.parse(await readFile(path.join(rootDir, "users.json"), "utf8"))[0].used, 3);

    const restored = await request(handler, "PATCH", `/api/student-profiles/${encodeURIComponent(created.json.profile.profileToken)}`, { action: "restore" }, cookie);
    assert.equal(restored.statusCode, 200);
    assert.equal(restored.json.profile.active, true);
    assert.deepEqual(JSON.parse(await readFile(path.join(rootDir, "submission-history.json"), "utf8")), history);
  } finally {
    process.env = { ...ORIGINAL_ENV };
    await rm(rootDir, { recursive: true, force: true });
  }
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

console.log("V7 production calibration: 24 Task 2 fixtures, Evin regression, scoring arithmetic, and student archive/restore passed.");
