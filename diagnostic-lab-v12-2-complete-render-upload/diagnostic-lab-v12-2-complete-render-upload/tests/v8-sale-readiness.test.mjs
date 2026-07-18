import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { createApiHandler } from "../services/apiRouter.js";
import {
  analyzeTask2Safety,
  REVISION_TYPES,
  ROUTE_COVERAGE
} from "../services/task2Safety.js";
import { SEVERITY_TAXONOMY, validateCanonicalAnalysis } from "../services/canonicalAnalysis.js";
import { countWords } from "../wordCount.js";

const ORIGINAL_ENV = { ...process.env };
const ROUTE_STATUSES = new Set(Object.values(ROUTE_COVERAGE));

const TASK2_TYPES = [
  {
    name: "Opinion",
    selected: "Opinion Essay",
    expected: "opinion",
    stanceRequired: true,
    prompt: "Governments should make public transport free in city centres. To what extent do you agree or disagree?",
    intro: "I strongly agree that city-centre public transport should be free because it would improve access and reduce congestion.",
    body1: "The first reason is fair access because free buses allow low-income commuters to reach work and education without losing part of their essential household budget.",
    body2: "The second reason is lower congestion because a reliable free service can persuade regular drivers to leave private cars at home and use shared transport instead.",
    conclusion: "In conclusion, I strongly agree that free city-centre public transport would improve access and reduce congestion."
  },
  {
    name: "Discuss Both Views",
    selected: "Discuss Both Views",
    expected: "discuss-both-views",
    stanceRequired: true,
    prompt: "Some people prefer working from home, while others prefer working in an office. Discuss both views and give your own opinion.",
    intro: "Both arrangements have value, but I believe office work is generally more effective for roles that depend on sustained collaboration.",
    body1: "Supporters of home working argue that it saves commuting time and lets employees organise focused individual tasks around their most productive hours.",
    body2: "Supporters of office work emphasise direct communication, shared problem solving and faster feedback, which is why I consider it stronger for collaborative roles.",
    conclusion: "In conclusion, home working offers flexibility, but I believe office work better supports communication and sustained collaboration."
  },
  {
    name: "Problem & Solution",
    selected: "Problem & Solution",
    expected: "problem-solution",
    stanceRequired: false,
    prompt: "Traffic congestion creates serious problems in many cities. What problems does this cause and what solutions can be taken?",
    intro: "Urban congestion creates long delays and air pollution, while reliable public transport and coordinated road management can reduce these problems.",
    body1: "The main problem is lost travel time because too many private vehicles compete for limited road space, delaying workers and commercial deliveries throughout the city.",
    body2: "A practical solution is sustained investment in frequent public transport combined with coordinated roadworks, so commuters have a dependable alternative and avoid disrupted routes.",
    conclusion: "In conclusion, congestion wastes time and worsens pollution, while reliable public transport and coordinated road management can address both problems."
  },
  {
    name: "Advantages & Disadvantages",
    selected: "Advantage / Disadvantage",
    expected: "advantages-disadvantages",
    stanceRequired: false,
    prompt: "More university courses are delivered online. What are the advantages and disadvantages of this development?",
    intro: "Online university courses create important advantages in access as well as disadvantages in direct academic interaction.",
    body1: "The main advantage is wider access because students can attend specialist lessons without relocating or paying daily travel and accommodation costs.",
    body2: "The main disadvantage is reduced face-to-face interaction, which can make spontaneous discussion, practical teamwork and immediate academic support harder to obtain.",
    conclusion: "In conclusion, online courses improve access and flexibility but can weaken direct interaction and immediate academic support."
  },
  {
    name: "Outweigh",
    selected: "Advantages Outweigh Disadvantages",
    expected: "outweigh",
    stanceRequired: true,
    prompt: "A relatively large young population can create benefits and drawbacks. Do the advantages outweigh the disadvantages?",
    intro: "Although a young population can increase competition for jobs, I believe its economic advantages outweigh the disadvantages.",
    body1: "The main disadvantage is stronger employment pressure when many graduates enter a labour market that has only a limited number of suitable positions.",
    body2: "The stronger advantage is a larger productive workforce that can fill vacancies, raise output, support tax revenue and expand long-term national economic capacity.",
    conclusion: "In conclusion, the advantages of a productive young workforce outweigh the disadvantages of temporary employment pressure."
  },
  {
    name: "Direct Questions",
    selected: "Direct Question",
    expected: "direct-question",
    stanceRequired: false,
    prompt: "Why do many graduates move to large cities? What problems can this movement create?",
    intro: "Graduates often move to large cities for employment, although this movement can create housing and infrastructure pressure.",
    body1: "The main reason is access to a wider labour market because major employers and specialist careers are concentrated in large urban centres.",
    body2: "The main problem is pressure on housing and transport because rapid population growth can exceed the capacity of available homes and public services.",
    conclusion: "In conclusion, graduates move for employment, but this movement can increase housing and transport pressure."
  }
];

const TASK2_SCENARIOS = ["strong", "underdeveloped", "missing_prompt_part", "language_weak_logic_strong", "grammar_strong_logic_weak"];

const TASK1_DEFINITIONS = [
  { type: "Line Graph", count: 3, prompt: "The line graph shows monthly visits to three public parks between 2010 and 2020.", intro: "The line graph compares monthly visitor numbers for three public parks between 2010 and 2020.", overview: "Overall, visits rose in two parks, while the third park remained comparatively stable and ended with the lowest total." },
  { type: "Bar Chart", count: 3, prompt: "The bar chart compares recycling rates in four cities in 2005 and 2020, measured as percentages.", intro: "The bar chart compares the percentage of waste recycled in four cities in 2005 and 2020.", overview: "Overall, recycling increased in every city, with the largest rise occurring in the city that began at the lowest level." },
  { type: "Pie Chart", count: 2, prompt: "The pie charts show household expenditure in a country in 2000 and 2020, measured as percentages.", intro: "The pie charts compare the proportions of household spending allocated to five categories in 2000 and 2020.", overview: "Overall, housing remained the largest category, whereas the share for food declined and spending on leisure became more prominent." },
  { type: "Table", count: 2, prompt: "The table shows average weekly working hours in five industries in 2010 and 2020.", intro: "The table compares average weekly working hours across five industries in 2010 and 2020.", overview: "Overall, working hours fell in most industries, although the technology sector recorded a small increase and became the highest category." },
  { type: "Map", count: 3, prompt: "The maps show the town of Langley in 1910 and 1950.", intro: "The maps compare the layout of Langley in 1910 and 1950.", overview: "Overall, Langley changed from a mainly industrial settlement into a more residential area with additional recreational and commercial facilities." },
  { type: "Process Diagram", count: 3, prompt: "The diagram shows how used glass bottles are recycled.", intro: "The diagram illustrates the stages involved in recycling used glass bottles.", overview: "Overall, the process follows a linear sequence from the collection and cleaning of bottles to the manufacture and delivery of new containers." },
  { type: "Structural Diagram", count: 2, prompt: "The diagrams show the main components of a solar panel and how it warms air and water.", intro: "The diagrams compare the main components of a solar panel and illustrate how the device warms air and water.", overview: "Overall, both versions use a transparent top and an enclosed box, but air passes directly through the unit whereas water travels through an internal pipe." },
  { type: "Mixed Graph", count: 3, prompt: "The line graph and table show electricity demand and generating capacity in a region from 2010 to 2020, measured in gigawatts.", intro: "The line graph and table compare electricity demand with generating capacity in a region between 2010 and 2020, measured in gigawatts.", overview: "Overall, demand rose steadily and approached the available capacity, while the table indicates that renewable sources supplied a growing share of generation." }
];

await main();

async function main() {
  configureLocalEngine();
  await testThirtyTask2Fixtures();
  await testTwentyOneTask1Fixtures();
  await testNamedGoldenFixtures();
  await testPermanentStudentDeletionAndIsolation();
  await testCanonicalRendererAndPdfSerializationPath();
  process.env = { ...ORIGINAL_ENV };
  console.log("V8 sale-readiness gate: 30 Task 2 fixtures, 21 Task 1 fixtures, named golden invariants, canonical serialization, and student deletion isolation passed.");
}

async function testThirtyTask2Fixtures() {
  let count = 0;
  for (const definition of TASK2_TYPES) {
    for (const scenario of TASK2_SCENARIOS) {
      count += 1;
      const payload = buildTask2Fixture(definition, scenario, count);
      const safety = analyzeTask2Safety(payload);
      assert.equal(safety.essayRoute, definition.expected, `${definition.name}/${scenario}: classification`);
      assert.equal(safety.taskClassification.confidence, "high", `${definition.name}/${scenario}: classification confidence`);
      assert.ok(safety.taskClassification.exactPromptSignals.length, `${definition.name}/${scenario}: prompt signals`);
      assert.equal(safety.stanceRequired, definition.stanceRequired, `${definition.name}/${scenario}: stance requirement`);
      assert.ok(ROUTE_STATUSES.has(safety.routeAssessment.overallRouteStatus), `${definition.name}/${scenario}: route taxonomy`);
      if (!definition.stanceRequired) {
        assert.equal(safety.detectedPosition, "");
        assert.equal(safety.positionConfidence, "not-applicable");
        assert.doesNotMatch(safety.bodyRouteSummary, /supports? the proposition|opposes? the proposition|final position|detected position/i);
      }

      const analysis = await analyzeWriting(payload);
      assertCanonicalReport(analysis, payload, `${definition.name}/${scenario}`);
      assert.equal(analysis.canonicalAnalysis.metadata.essayType, safety.taskClassification.publicEssayFamily);
      assert.equal(analysis.canonicalAnalysis.taskRequirements.stanceRequired, definition.stanceRequired);
      assert.equal(analysis.canonicalAnalysis.capMetadata.overallCap, null);
    }
  }
  assert.equal(count, 30);
}

async function testTwentyOneTask1Fixtures() {
  let count = 0;
  for (const definition of TASK1_DEFINITIONS) {
    for (let index = 1; index <= definition.count; index += 1) {
      count += 1;
      const payload = buildTask1Fixture(definition, index, count);
      const analysis = await analyzeWriting(payload);
      assertCanonicalReport(analysis, payload, `${definition.type}/${index}`);
      assert.equal(analysis.canonicalAnalysis.metadata.taskType, "Task 1");
      assert.equal(analysis.canonicalAnalysis.metadata.visualType, definition.type);
      assert.equal(analysis.canonicalAnalysis.taskRequirements.stanceRequired, false);
      assert.equal(analysis.canonicalAnalysis.routeAssessment.conclusionClosure, ROUTE_COVERAGE.NOT_APPLICABLE);
      assert.equal(analysis.canonicalAnalysis.capMetadata.overallCap, null);
      assert.doesNotMatch(JSON.stringify(analysis), /supports? the proposition|final opinion|detected position/i);
    }
  }
  assert.equal(count, 21);
}

async function testNamedGoldenFixtures() {
  const evin = buildGoldenProblemSolution("Evin", true);
  const eva = buildGoldenProblemSolution("Eva", false);
  const evinSafety = analyzeTask2Safety(evin);
  const evaSafety = analyzeTask2Safety(eva);
  const evinReport = await analyzeWriting(evin);
  const evaReport = await analyzeWriting(eva);

  for (const [name, safety, report] of [["Evin", evinSafety, evinReport], ["Eva", evaSafety, evaReport]]) {
    assert.equal(safety.essayRoute, "problem-solution", `${name}: task type`);
    assert.equal(safety.stanceRequired, false, `${name}: no opinion stance`);
    assert.equal(safety.detectedPosition, "", `${name}: opinion position not displayed`);
    assert.equal(report.kruPomScores["Thesis Route Clarity"].status, "Strong", `${name}: thesis route`);
    assert.doesNotMatch(report.bodyRouteSummary, /supports? the proposition|final position|detected position/i);
    const overall = parseRange(report.estimatedBandRange);
    assert.ok(overall.low >= 6.5 && overall.high <= 7.0, `${name}: approved overall range`);
    assertCanonicalReport(report, name === "Evin" ? evin : eva, `${name} golden`);
  }
  assert.ok(evinSafety.routeAssessment.bodyRoutes.some((route) => route.status === ROUTE_COVERAGE.PARTIALLY_DEVELOPED), "Evin: second cause remains a development limiter");
  assert.equal(evinReport.canonicalAnalysis.frameworkAssessment.sarExampleQuality.scoringRole, "diagnostic-only");
  assert.ok([ROUTE_COVERAGE.PARTIALLY_DEVELOPED, ROUTE_COVERAGE.ADEQUATELY_DEVELOPED].includes(evaSafety.routeAssessment.overallRouteStatus));

  const jj = buildTask1Fixture(TASK1_DEFINITIONS[0], 99, 901);
  jj.prompt = "The line graph shows the quantity of goods transported in the United Kingdom by road, water, rail and pipeline from 1974 to 2002, measured in million tonnes.";
  jj.writing = padTask1([
    "The line graph illustrates the quantity of goods, measured in million tonnes, transported by road, water, rail and pipeline in the United Kingdom between 1974 and 2002.",
    "Overall, road transport carried the greatest quantity and increased markedly, while pipeline remained the least used despite a gradual rise.",
    "Road and water both finished above their initial levels, although road recorded the largest absolute increase over the period.",
    "Rail fluctuated before recovering near its starting level, whereas pipeline rose slowly and then remained broadly stable."
  ]);
  const jjReport = await analyzeWriting(jj);
  assert.match(jjReport.canonicalAnalysis.metadata.visualType, /Line Graph/);
  assert.match(jj.writing, /million tonnes/);
  assert.match(jj.writing, /road, water, rail and pipeline/);
  assert.match(jj.writing, /United Kingdom/);
  assert.match(jj.writing, /1974 and 2002/);
  assertCanonicalReport(jjReport, jj, "JJ line graph golden");

  const langley = buildTask1Fixture(TASK1_DEFINITIONS[4], 99, 902);
  const langleyReport = await analyzeWriting(langley);
  assert.doesNotMatch(JSON.stringify(langleyReport.feedbackCards), /to improve access|to accommodate better access/i);
  assert.match(JSON.stringify(langleyReport.practicePlan), /Old Feature -> New Feature|old feature -> new feature/i);
  assertCanonicalReport(langleyReport, langley, "Langley map golden");

  const poon = buildTask1Fixture(TASK1_DEFINITIONS[1], 99, 903);
  poon.prompt = "The bar charts compare marriage and divorce rates per thousand people in the USA, the UK, Japan, Germany and Denmark in 1985 and 2010.";
  poon.writing = padTask1([
    "The bar charts compare marriage and divorce rates, measured per thousand people, in the USA, the UK, Japan, Germany and Denmark in 1985 and 2010.",
    "Overall, marriage rates fell in most of the five countries, while divorce figures were lower and changed less dramatically.",
    "The USA and the UK recorded comparatively high marriage rates, although both figures declined by 2010.",
    "Japan, Germany and Denmark showed smaller changes, and the divorce data remained below the corresponding marriage figures."
  ]);
  const poonReport = await analyzeWriting(poon);
  assert.doesNotMatch(JSON.stringify(poonReport.feedbackCards), /The bar chart compares changes in The bar charts|below provide information/i);
  assertCanonicalReport(poonReport, poon, "Poon bar-chart golden");

  const underlength = buildTask2Fixture(TASK2_TYPES[0], "underdeveloped", 904);
  underlength.writing = [TASK2_TYPES[0].intro, TASK2_TYPES[0].body1, TASK2_TYPES[0].body2, "In conclusion, I"].join("\n\n");
  const underlengthReport = await analyzeWriting(underlength);
  assert.ok(underlengthReport.wordCount < 250);
  assert.ok(underlengthReport.wordShortfall > 0);
  assert.equal(underlengthReport.unfinishedEndingDetected, true);
  assert.equal(underlengthReport.canonicalAnalysis.capMetadata.overallCap, null);
  assertCanonicalReport(underlengthReport, underlength, "Underlength Task 2 golden");
}

async function testPermanentStudentDeletionAndIsolation() {
  const rootDir = await mkdtemp(path.join(tmpdir(), "diagnostic-v8-delete-"));
  process.env = { ...ORIGINAL_ENV, SESSION_SECRET: "v8-delete-test", DIAGNOSTIC_STORAGE_ADAPTER: "local-json" };
  try {
    await writeFile(path.join(rootDir, "users.json"), JSON.stringify([
      { username: "teacher-v8", password: "pass-v8", displayName: "Teacher V8", role: "teacher", quotaMode: "unlimited", used: 7, status: "active" }
    ], null, 2));
    await writeFile(path.join(rootDir, "submission-history.json"), "[]\n");
    await writeFile(path.join(rootDir, "student-profiles.json"), "[]\n");
    await writeFile(path.join(rootDir, ".diagnostic-jobs.json"), "{}\n");
    const handler = createApiHandler({ rootDir });
    const login = await request(handler, "POST", "/api/login", { username: "teacher-v8", password: "pass-v8" });
    const cookie = login.headers["Set-Cookie"];
    const target = await request(handler, "POST", "/api/student-profiles", { displayName: "Delete Me" }, cookie);
    const other = await request(handler, "POST", "/api/student-profiles", { displayName: "Keep Me" }, cookie);
    const profiles = JSON.parse(await readFile(path.join(rootDir, "student-profiles.json"), "utf8"));
    const targetStored = profiles.find((profile) => profile.displayName === "Delete Me");
    const otherStored = profiles.find((profile) => profile.displayName === "Keep Me");
    await writeFile(path.join(rootDir, "submission-history.json"), JSON.stringify([
      { username: "teacher-v8", studentProfileId: targetStored.id, submissionId: "target-1", taskType: "Task 1" },
      { username: "teacher-v8", studentProfileId: targetStored.id, submissionId: "target-2", taskType: "Task 2" },
      { username: "teacher-v8", studentProfileId: otherStored.id, submissionId: "other-1", taskType: "Task 2" }
    ], null, 2));
    await writeFile(path.join(rootDir, ".diagnostic-jobs.json"), JSON.stringify({
      targetJob: { username: "teacher-v8", payload: { studentProfileId: targetStored.id } },
      otherJob: { username: "teacher-v8", payload: { studentProfileId: otherStored.id } }
    }, null, 2));

    const archived = await request(handler, "PATCH", `/api/student-profiles/${encodeURIComponent(target.json.profile.profileToken)}`, { action: "archive" }, cookie);
    assert.equal(archived.statusCode, 200);
    const listed = await request(handler, "GET", "/api/student-profiles", null, cookie);
    assert.equal(listed.json.profiles.find((profile) => profile.displayName === "Delete Me").reportCount, 2);

    const wrong = await request(handler, "DELETE", `/api/student-profiles/${encodeURIComponent(target.json.profile.profileToken)}`, { permanent: true, confirmation: "wrong" }, cookie);
    assert.equal(wrong.statusCode, 400);
    const deleted = await request(handler, "DELETE", `/api/student-profiles/${encodeURIComponent(target.json.profile.profileToken)}`, { permanent: true, confirmation: "Delete Me" }, cookie);
    assert.equal(deleted.statusCode, 200);
    assert.equal(deleted.json.deletedReportCount, 2);
    assert.equal(deleted.json.deletedJobCount, 1);
    assert.equal(deleted.json.accountCreditsChanged, false);

    const remainingProfiles = JSON.parse(await readFile(path.join(rootDir, "student-profiles.json"), "utf8"));
    const remainingHistory = JSON.parse(await readFile(path.join(rootDir, "submission-history.json"), "utf8"));
    const remainingJobs = JSON.parse(await readFile(path.join(rootDir, ".diagnostic-jobs.json"), "utf8"));
    const users = JSON.parse(await readFile(path.join(rootDir, "users.json"), "utf8"));
    assert.deepEqual(remainingProfiles.map((profile) => profile.id), [otherStored.id]);
    assert.deepEqual(remainingHistory.map((record) => record.submissionId), ["other-1"]);
    assert.deepEqual(Object.keys(remainingJobs), ["otherJob"]);
    assert.equal(users[0].used, 7);
    assert.equal(other.statusCode, 201);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
    configureLocalEngine();
  }
}

async function testCanonicalRendererAndPdfSerializationPath() {
  const [script, index, server, previewScript, previewIndex, previewCanonical, previewTask2Safety, template, pdfRenderer, viewModel] = await Promise.all([
    readFile(new URL("../script.js", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../server.js", import.meta.url), "utf8"),
    readFile(new URL("../netlify-static-preview/script.js", import.meta.url), "utf8"),
    readFile(new URL("../netlify-static-preview/index.html", import.meta.url), "utf8"),
    readFile(new URL("../netlify-static-preview/services/canonicalAnalysis.js", import.meta.url), "utf8"),
    readFile(new URL("../netlify-static-preview/services/task2Safety.js", import.meta.url), "utf8"),
    readFile(new URL("../reports/studentReportTemplate.js", import.meta.url), "utf8"),
    readFile(new URL("../reports/pdfRenderer.js", import.meta.url), "utf8"),
    readFile(new URL("../reports/studentReportViewModel.js", import.meta.url), "utf8")
  ]);
  assert.match(script, /projectCanonicalAnalysis\(analysis\.canonicalAnalysis, analysis\)/);
  assert.match(script, /async function exportDiagnosticPdf/);
  assert.match(script, /\/api\/reports\/\$\{encodeURIComponent\(id\)\}\/pdf/);
  assert.doesNotMatch(script, /window\.print\s*\(|win\.print\s*\(|function renderPrintReport/);
  assert.match(script, /studentProfileSelect\.disabled = !canManageStudents/);
  assert.match(script, /studentProfileSelect\.required = canManageStudents/);
  assert.match(index, /Permanently delete archived student/);
  assert.doesNotMatch(index, /Structural Diagram|Advantages Outweigh Disadvantages/);
  assert.match(index, /script\.js\?v=diagnostic-v12-student-report-architecture/);
  assert.match(server, /services\/canonicalAnalysis\.js/);
  assert.match(server, /services\/task2Safety\.js/);
  assert.match(template, /renderStudentReportDocument/);
  assert.match(template, /data-report-block/);
  assert.match(pdfRenderer, /puppeteer\.default\.launch/);
  assert.match(pdfRenderer, /userDataDir/);
  assert.match(viewModel, /StudentReportViewModel\.v12/);
  assert.equal(previewScript, script, "Static preview uses the canonical frontend source");
  assert.equal(previewIndex, index, "Static preview exposes the same task and lifecycle controls");
  assert.equal(previewCanonical.trim(), 'export * from "../domain/canonicalAnalysis.js";');
  assert.equal(previewTask2Safety.trim(), 'export * from "../domain/task2Safety.js";');
}

function buildTask2Fixture(definition, scenario, id) {
  let paragraphs = [definition.intro, definition.body1, definition.body2, definition.conclusion];
  if (scenario === "strong") paragraphs = padTask2(paragraphs);
  if (scenario === "underdeveloped") paragraphs = paragraphs.map((paragraph, index) => index === 2 ? firstSentence(paragraph) : paragraph);
  if (scenario === "missing_prompt_part") {
    paragraphs = padTask2([
      definition.stanceRequired ? "This essay examines the issue without declaring a final judgement." : firstSentence(definition.intro),
      definition.body1,
      "This topic also receives considerable public attention, and careful planning is important for communities and institutions.",
      `In conclusion, ${firstSentence(definition.body1).replace(/^(The|Supporters of)\s+/i, "the ")}`
    ]);
  }
  if (scenario === "language_weak_logic_strong") {
    paragraphs = padTask2(paragraphs.map((paragraph, index) => index === 0
      ? `${paragraph} This make the route more clearer for reader.`
      : `${paragraph} This approach provide useful result and people has better choices.`));
  }
  if (scenario === "grammar_strong_logic_weak") {
    paragraphs = padTask2([
      "This essay examines several contemporary considerations connected with the topic.",
      "Digital technology has transformed communication in many organisations, allowing information to circulate rapidly across national borders.",
      "Cultural traditions also influence daily behaviour because communities preserve familiar practices across generations.",
      "In conclusion, the topic is complex and deserves careful consideration from individuals and institutions."
    ]);
  }
  return {
    taskType: "Task 2",
    essayType: definition.selected,
    visualType: "",
    targetBand: "7.0",
    clientSubmissionId: `v8-task2-${id}-${scenario}`,
    prompt: definition.prompt,
    writing: paragraphs.join("\n\n"),
    options: { strictFeedback: true, usedTemplate: false, patternRisk: true }
  };
}

function buildTask1Fixture(definition, variant, id) {
  const detailA = definition.type === "Map"
    ? "In the earlier plan, homes and industrial buildings occupied the western and northern areas, while shops were concentrated near the central road."
    : definition.type === "Process Diagram"
      ? "First, used bottles are collected and sorted before they are washed, crushed and heated to form reusable glass."
      : definition.type === "Structural Diagram"
        ? "For air heating, cool air enters through an inlet, passes through the enclosed box and leaves through an outlet after absorbing heat."
        : "The leading category increased clearly over the period, whereas the lowest category changed only slightly and remained well below the others.";
  const detailB = definition.type === "Map"
    ? "By the later year, much of the industrial land had been replaced by housing, and a park, play area and additional shops had appeared."
    : definition.type === "Process Diagram"
      ? "The molten material is then shaped into new bottles, inspected and transported back to retailers, completing the recycling sequence."
      : definition.type === "Structural Diagram"
        ? "For water heating, the box contains a coiled pipe through which water flows before leaving the panel at a higher temperature."
        : "A second group followed a more moderate pattern, creating the clearest contrast with the strongest movement shown in the visual.";
  return {
    taskType: "Task 1",
    essayType: "",
    visualType: definition.type,
    targetBand: "7.0",
    clientSubmissionId: `v8-task1-${id}-${variant}`,
    prompt: definition.prompt,
    writing: padTask1([definition.intro, definition.overview, detailA, detailB]),
    options: { strictFeedback: true, usedTemplate: false, patternRisk: false }
  };
}

function buildGoldenProblemSolution(name, partialSecondCause) {
  const body1 = [
    "The first problem is poor traffic management because uncoordinated roadworks remove capacity from busy routes and force vehicles into the same restricted corridors.",
    "This creates queues that delay workers, public buses and commercial deliveries throughout the day.",
    partialSecondCause ? "A second problem is rapid growth in private-car use." : "A second problem is rapid growth in private-car use, which increases pressure on roads whenever public transport is unreliable or inconvenient."
  ].join(" ");
  const paragraphs = [
    "Urban congestion creates long delays through poor traffic management and rising car use, while coordinated roadworks and reliable public transport can reduce these problems.",
    body1,
    "City authorities can coordinate road repairs so that alternative routes remain open and can invest in frequent public transport that gives commuters a practical substitute for private cars. These measures address both disrupted road capacity and excessive car use.",
    "In conclusion, weak road management and rising car use intensify congestion, while coordinated construction and dependable public transport can reduce the resulting pressure."
  ];
  if (partialSecondCause) {
    const development = "This policy pairing directly responds to the diagnosed road-capacity and private-car pressures, so it preserves the problem-solution route.";
    while (countWords(paragraphs.join("\n\n")) < 265) paragraphs[2] += ` ${development}`;
  } else {
    const padded = padTask2(paragraphs);
    paragraphs.splice(0, paragraphs.length, ...padded);
  }
  return {
    taskType: "Task 2",
    essayType: "Problem & Solution",
    targetBand: "7.0",
    clientSubmissionId: `v8-golden-${name.toLowerCase()}`,
    prompt: "Traffic congestion creates serious problems in many cities. What are the main problems and what solutions can be taken?",
    writing: paragraphs.join("\n\n"),
    options: { strictFeedback: true, usedTemplate: false, patternRisk: false }
  };
}

function assertCanonicalReport(analysis, payload, label) {
  const canonical = analysis.canonicalAnalysis;
  assert.ok(canonical, `${label}: canonical analysis exists`);
  assert.equal(canonical.version, "11.4", `${label}: canonical version`);
  assert.deepEqual(validateCanonicalAnalysis(canonical), [], `${label}: canonical validation`);
  assert.equal(analysis.estimatedBandRange, canonical.overallScore.label, `${label}: displayed overall`);
  assert.ok(ROUTE_STATUSES.has(canonical.routeAssessment.overallRouteStatus), `${label}: canonical route taxonomy`);
  assert.equal(canonical.capMetadata.overallCap, null, `${label}: no independent Overall cap`);
  assertScoreMath(canonical, label);
  assert.ok(Array.isArray(canonical.evidenceIssues), `${label}: evidence array`);
  assert.ok(Array.isArray(canonical.paragraphFeedback), `${label}: paragraph feedback`);
  assert.ok(Array.isArray(canonical.repairPlan), `${label}: repair plan`);
  assert.ok(Array.isArray(canonical.topIssues), `${label}: top issues`);
  assert.ok(canonical.topIssues.length <= 3, `${label}: prioritized top issues`);
  assert.ok(canonical.evidenceIssues.length <= 9, `${label}: no excessive evidence-card count`);
  const normalizedWriting = normalizeEvidence(payload.writing);
  for (const [index, card] of canonical.evidenceIssues.entries()) {
    assert.ok(SEVERITY_TAXONOMY.includes(card.severity), `${label}: severity ${index + 1}`);
    assert.ok(normalizedWriting.includes(normalizeEvidence(card.exactSentence)), `${label}: exact evidence ${index + 1}`);
    assert.ok(String(card.studentAction || "").trim().length >= 8, `${label}: issue-specific action ${index + 1}`);
    if (payload.taskType === "Task 2") assert.ok(REVISION_TYPES.includes(card.revisionType), `${label}: revision type ${index + 1}`);
  }
  if (canonical.capMetadata.applied) {
    assert.ok(canonical.capMetadata.criterion, `${label}: cap criterion`);
    assert.ok(Number.isFinite(canonical.capMetadata.value), `${label}: cap value`);
    assert.ok(canonical.capMetadata.reasonCode, `${label}: cap reason`);
    assert.ok(canonical.capMetadata.exactEvidence, `${label}: cap evidence`);
  }
  const serialized = JSON.parse(JSON.stringify(canonical));
  assert.equal(serialized.overallScore.label, canonical.overallScore.label, `${label}: report/PDF serialization`);
}

function assertScoreMath(canonical, label) {
  const criteria = canonical.criterionAssessment;
  const ranges = [criteria.taskResponseOrAchievement, criteria.coherenceCohesion, criteria.lexicalResource, criteria.grammaticalRangeAccuracy]
    .map((criterion) => parseRange(criterion.range));
  for (const range of ranges) {
    assert.ok(isHalfBand(range.low) && isHalfBand(range.high), `${label}: valid half-band criterion`);
  }
  const expectedLow = roundHalf(ranges.reduce((sum, range) => sum + range.low, 0) / 4);
  const expectedHigh = roundHalf(ranges.reduce((sum, range) => sum + range.high, 0) / 4);
  assert.equal(canonical.overallScore.low, expectedLow, `${label}: overall low arithmetic`);
  assert.equal(canonical.overallScore.high, expectedHigh, `${label}: overall high arithmetic`);
}

function padTask2(paragraphs, target = 265) {
  const output = [...paragraphs];
  const development = [
    "This mechanism matters because it changes the choices available to the people directly affected by the issue.",
    "When the same pattern occurs across a city or institution, the cumulative result can influence access, efficiency and public resources.",
    "A realistic example would therefore clarify the connection between the immediate action and the wider consequence.",
    "This evidence develops the controlling idea instead of adding a separate route that the paragraph cannot explain fully."
  ];
  let index = 0;
  while (countWords(output.join("\n\n")) < target) {
    output[index % 2 ? 2 : 1] += ` ${development[index % development.length]}`;
    index += 1;
  }
  return output;
}

function padTask1(paragraphs, target = 170) {
  const output = [...paragraphs];
  const detail = [
    "The comparison is most visible in the final period, when the gap between the leading and trailing features became wider.",
    "By contrast, the middle group changed more gradually and did not overtake the dominant category at any point shown.",
    "These selected details support the overview without listing every individual figure or inventing a reason for the pattern.",
    "The remaining feature followed a stable or moderate pattern and therefore formed the clearest contrast with the largest movement."
  ];
  let index = 0;
  while (countWords(output.join("\n\n")) < target) {
    output[index % 2 ? 3 : 2] += ` ${detail[index % detail.length]}`;
    index += 1;
  }
  return output.join("\n\n");
}

function firstSentence(value) {
  return String(value || "").match(/[^.!?]+[.!?]+/)?.[0]?.trim() || String(value || "").trim();
}

function parseRange(value) {
  const values = String(value || "").match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  return { low: values[0], high: values[1] ?? values[0] };
}

function isHalfBand(value) {
  return Number.isFinite(value) && value >= 0 && value <= 9 && Number.isInteger(value * 2);
}

function roundHalf(value) {
  return Math.round(value * 2) / 2;
}

function normalizeEvidence(value) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function configureLocalEngine() {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE = "false";
  process.env.DIAGNOSTIC_STORAGE_ADAPTER = "local-json";
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
