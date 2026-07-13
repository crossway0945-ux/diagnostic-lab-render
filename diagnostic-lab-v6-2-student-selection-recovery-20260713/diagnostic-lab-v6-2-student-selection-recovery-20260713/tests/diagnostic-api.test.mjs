import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeWriting, validateReportOutput } from "../services/aiAnalyzer.js";
import { createAnalysisJobStore } from "../services/analysisJobStore.js";
import { createApiHandler } from "../services/apiRouter.js";
import { runDiagnosticReset } from "../services/diagnosticReset.js";
import { buildPrompt } from "../services/promptBuilder.js";
import { createStorage } from "../services/storage.js";
import { analyzeTask2Safety } from "../services/task2Safety.js";
import { countWords, getWordCountMetadata } from "../wordCount.js";

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

const solarPanelDiagramPayload = {
  taskType: "Task 1",
  essayType: "",
  visualType: "Diagram / Structure",
  targetBand: "7.0",
  clientSubmissionId: "solar-panel-intro-paraphrase-1",
  prompt: "The diagrams below show the structure of a solar panel and how it can be used to heat air and water.",
  writing: [
    "The diagrams illustrate the structure of a solar panel and show how it can be used to heat air and water.",
    "Overall, the solar panel consists of a transparent top, an inlet and an outlet, and the same basic design can warm either air or water.",
    "In the air-heating process, cool air enters through the inlet and passes under the transparent cover, where sunlight increases its temperature before it leaves through the outlet.",
    "For water heating, the panel uses a pipe inside the box, so water enters from one side, travels through the heated pipe, and exits as warm water."
  ].join("\n\n"),
  options: {}
};

const evaMixedGraphPayload = {
  taskType: "Task 1",
  essayType: "",
  visualType: "Mixed Graph",
  targetBand: "7.0",
  clientSubmissionId: "eva-mixed-graph-revision-1",
  prompt: "The pie chart shows the proportion of dance classes held in four different locations in an Australian town. The bar chart shows the number of young people attending ballet, tap and modern dance classes by age group, under 11 and 11-16.",
  writing: [
    "The pie chart and bar chart give information about dance classes in an Australian town.",
    "Overall, private studios were the most common location, while ballet attracted more younger students and modern dance attracted more older students.",
    "In the pie chart, private studios made up the largest share of dance-class locations, followed by school halls and community venues.",
    "In the bar chart, ballet had more students under 11, whereas modern dance had more students aged 11 to 16."
  ].join("\n\n"),
  options: {}
};

const lineGraphIntroPayload = {
  taskType: "Task 1",
  essayType: "",
  visualType: "Line Graph",
  targetBand: "7.0",
  clientSubmissionId: "line-graph-intro-revision-1",
  prompt: "The line graph below shows the number of car and bus users in City A from 2000 to 2020.",
  writing: [
    "The line graph shows the number of car and bus users in City A from 2000 to 2020.",
    "Overall, car use increased over the period, while bus use declined.",
    "In 2000, bus users outnumbered car users, but the opposite was true by 2020.",
    "The two lines crossed in the middle of the period."
  ].join("\n\n"),
  options: {}
};

const jjCinemaLineGraphPayload = {
  taskType: "Task 1",
  essayType: "",
  visualType: "Line Graph",
  targetBand: "7.0",
  clientSubmissionId: "jj-cinema-line-intro-v4-1",
  prompt: "The line graph below shows the percentage of people in four age groups - 7-14, 15-24, 25-34, and 35 and over - who went to the cinema more than once a month between 2000 and 2011.",
  writing: [
    "The bar chart depicts how popular the cinema attendance rate is in percentages across 4 different age groups, ranging from ages 7 to 35 and over, between the years of 2000 and 2011.",
    "Overall, although all age groups fluctuated, attendance gradually increased over time.",
    "The 7-14 and 15-24 groups had the highest rates for most of the period.",
    "The 35 and over group remained the lowest throughout the period."
  ].join("\n\n"),
  options: {
    usedTemplate: true,
    strictFeedback: true,
    patternRisk: true
  }
};

const goodsTransportLineGraphPayload = {
  taskType: "Task 1",
  essayType: "",
  visualType: "Line Graph",
  targetBand: "7.0",
  clientSubmissionId: "goods-transport-line-intro-v4-1",
  prompt: "The line graph below shows the quantity of goods, measured in million tonnes, transported by four different modes - road, water, rail, and pipeline - in the United Kingdom between 1974 and 2002.",
  writing: [
    "The line graph below shows the quantity of goods, measured in million tonnes, transported by four different modes - road, water, rail, and pipeline - in the United Kingdom between 1974 and 2002.",
    "Overall, road transport carried the most goods, while pipeline carried the least.",
    "Road and water transport increased overall.",
    "Pipeline rose and then levelled off."
  ].join("\n\n"),
  options: {}
};

const poonMarriageDivorcePayload = {
  taskType: "Task 1",
  essayType: "",
  visualType: "Bar Chart",
  targetBand: "7.0",
  clientSubmissionId: "poon-marriage-divorce-v5-1",
  prompt: "The bar charts below provide information about marriage and divorce rates, measured per thousand people, in five countries - the USA, the UK, Japan, Germany and Denmark - in 1985 and 2010.",
  writing: [
    "The bar charts illustrate the marriage and divorce rates in 5 countries which are USA, UK, Japan, Germany and Denmark, in 1985 and 2010.",
    "The figure are measured per thousand people.",
    "Overall, marriage rates fall in most countries in 2010, while divorce rate were generally remain stable.",
    "Regarding marriage rates, the USA had the highest figures in both years. Then, UK and Japan both were declined slight from 7 to 6.",
    "In addition, regarding with divorce rates. Moreover, Japan's divorce rate was doubled from 1 to 2 which was the lowest in five countries."
  ].join("\n\n"),
  options: {
    usedTemplate: true,
    strictFeedback: true,
    patternRisk: true
  }
};

const langleyMapPayload = {
  taskType: "Task 1",
  essayType: "",
  visualType: "Map",
  targetBand: "7.0",
  clientSubmissionId: "langley-map-consistency-1",
  prompt: "The maps below show the changes in Langley Village between 1910 and 1950.",
  writing: [
    "The maps compare the layout of Langley Village in 1910 and 1950.",
    "Overall, the village has undergone a significant transformation from an industrial area into a larger residential and recreation suburb.",
    "In 1910, the northern part of the village was dominated by a factory, a laundry, and small shops along Jordan Street.",
    "Across Jordan Street, the row of townhouses has been converted into high-rise flats. To the south of these buildings, the road network has been expanded with the construction of New Lane to accommodate better access to the area.",
    "The railway in the south has been completely removed, and the nearby railway worker's cottages have been demolished and replaced by a large green space, known as Sherman Park, which includes a pond and a children's play area."
  ].join("\n\n"),
  options: {
    usedTemplate: true,
    strictFeedback: true,
    patternRisk: true
  }
};

const langleyUnsafeOverviewPayload = {
  taskType: "Task 1",
  essayType: "",
  visualType: "Map",
  targetBand: "7.0",
  clientSubmissionId: "langley-map-strategy-1",
  prompt: "The maps below show the town of Langley in 1910 and 1950.",
  writing: [
    "The maps compare the town of Langley in 1910 and 1950.",
    "Most of the residential and industrial buildings were replaced with tall buildings, which creates more space for facilities construction.",
    "In 1910, the western and northern parts had houses, cottages and industrial buildings near the main streets.",
    "In 1950, several old buildings were replaced by flats, mansions, a park, a play area and more shops."
  ].join("\n\n"),
  options: {
    usedTemplate: true,
    strictFeedback: true,
    patternRisk: true
  }
};

const missingOverviewMapPayload = {
  taskType: "Task 1",
  essayType: "",
  visualType: "Map",
  targetBand: "7.0",
  clientSubmissionId: "missing-overview-map-1",
  prompt: "The maps below show the changes in a town centre between 1990 and 2020.",
  writing: [
    "The maps compare the layout of a town centre in 1990 and 2020.",
    "In 1990, a factory stood in the north-west corner, while small houses were located near the main road.",
    "By 2020, the factory had been replaced by apartment blocks, and a park had been built to the south.",
    "A new road was also added on the eastern side of the town centre."
  ].join("\n\n"),
  options: {}
};

const inaccurateOverviewMapPayload = {
  taskType: "Task 1",
  essayType: "",
  visualType: "Map",
  targetBand: "7.0",
  clientSubmissionId: "inaccurate-overview-map-1",
  prompt: "The maps below show how a village changed from an industrial area into a mainly residential area.",
  writing: [
    "The maps compare the layout of a village before and after redevelopment.",
    "Overall, the village became mainly commercial, with most residential facilities removed.",
    "The old factory site was replaced by apartment blocks, and new housing was added near the main road.",
    "A public park was also introduced in the southern part of the village."
  ].join("\n\n"),
  options: {}
};

const homeschoolingBand7Payload = {
  taskType: "Task 2",
  essayType: "Advantage / Disadvantage",
  visualType: "",
  targetBand: "7.0",
  clientSubmissionId: "homeschool-band7-1",
  prompt: "Some people believe that educating children at home provides more benefits than sending them to school. Do the advantages of home-schooling outweigh the disadvantages?",
  writing: [
    "In recent years, home-schooling has become a popular option for some families because it allows parents to control the learning environment. While educating children at home can provide flexibility and personalised instruction, I strongly believe that its disadvantages outweigh its advantages because school develops social communication and personal character more effectively.",
    "The main advantage of home-schooling is that children can learn in a way that matches their individual needs. Parents can adjust lessons to their child's pace, spend more time on difficult subjects, and avoid distractions that sometimes occur in large classrooms. For example, a child who struggles with mathematics can receive extra practice at home instead of moving forward before understanding the topic. This flexibility can make learning more comfortable for some students.",
    "However, one major disadvantage is that home-schooling may limit children's socialisation and communication skills. At school, students learn to discuss ideas, work in groups, solve disagreements, and present their opinions in front of classmates. For example, group projects and classroom discussions help children become confident speakers and cooperative team members, which are skills they will need at university and in the workplace. Therefore, missing this daily social environment can reduce a child's ability to communicate effectively.",
    "Another important disadvantage is that staying outside school can weaken character and personal development. Schools teach students discipline, responsibility, resilience, and the ability to accept feedback from teachers. For instance, preparing for exams and meeting homework deadlines train students to manage pressure and organise their time. These experiences help children become more independent and adaptable in adult life. In addition, not all parents have enough teaching knowledge or educational resources.",
    "In conclusion, although home-schooling offers flexibility and individual attention, I believe the disadvantages are more significant because children also need social interaction, communication practice, discipline, and resilience. For this reason, sending children to school is generally more beneficial for their long-term development."
  ].join("\n\n"),
  options: {
    usedTemplate: true,
    strictFeedback: true,
    patternRisk: true
  }
};

const weakTask2Payload = {
  taskType: "Task 2",
  essayType: "Opinion Essay",
  visualType: "",
  targetBand: "7.0",
  clientSubmissionId: "weak-task2-1",
  prompt: "Some people think schools should teach children about money, while other people think parents should do this. Discuss both views and give your own opinion.",
  writing: [
    "Some people think schools should teach children about money, while other people think parents should do this. This essay will discuss both views and give my opinion.",
    "On the one hand, schools can help students learn about money. Technology is useful because students can learn many things online. Teachers can also explain saving and spending, so students will understand finance. This is very important for students.",
    "On the other hand, parents are important because children stay with them every day. For example, many people use technology to preserve culture. Parents can tell children what is good or bad about money. Therefore, both schools and parents have important roles.",
    "In conclusion, I believe schools and parents should teach children money management because it is useful for their future."
  ].join("\n\n"),
  options: {
    usedTemplate: true,
    strictFeedback: true,
    patternRisk: true
  }
};

const poonCleanWaterPayload = {
  taskType: "Task 2",
  essayType: "Opinion Essay",
  visualType: "",
  targetBand: "7.0",
  clientSubmissionId: "task2-low-band-completion-route-1",
  prompt: "Access to clean water is a basic human right. Therefore, every home should receive a water supply free of charge. To what extent do you agree or disagree?",
  writing: [
    "Access to clean water is very important for everyone. Thus, many people believe that every household should provide water for free. This essay will discuss about agree or disagree for this idea.",
    "Firstly, clean water is a basic right in human life. It can help people to have a good cleanliness because people always use water in their daily activities such as drinking, washing or house cleaning. If water is not clean, humans can get some bacterias or diseases when they use some water; therefore, they can get an illness. Subsequently, if people can use clean water with charging, they would have a good quality of life. For instance, if people can drink taps water, they could safe their money because they don't have to pay money for buying pure water.",
    "On the other hand, this idea should be disagrees because this might used a lot of money. The government budget might be not enough, so the tax must be increase; Therefore, all citizens have to pay money same with before water supply free to charge.",
    "For conclusion, I consequently agree with this idea. Due to the fact that I"
  ].join("\n\n"),
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
};

async function main() {
  await testPackageCopyShows10Analyses();
  await testDeterministicWordCount();
  await testTeacherStudentSelectionReenablesAnalyzeButton();
  await testApiFlow();
  await testRoleQuotaAdminSecurity();
  await testStudentProfilesAndProgressIsolation();
  await testDiagnosticResetPreservesProtectedData();
  await testServerlessStorageSelection();
  await testProviderErrorClassification();
  await testStructuredOutputAndEvidenceGuard();
  await testProductionRequiresFullEngine();
  await testServerlessRequiresFullEngine();
  await testProblemSolutionRubricPrompt();
  await testTask1IntroParaphraseGuidance();
  await testTask1MixedGraphRevisionQualityGuard();
  await testTask1LineGraphRevisionQualityGuard();
  await testTask1JJLineGraphIntroductionFormulaRegression();
  await testTask1GoodsTransportIntroductionFormulaRegression();
  await testPoonReportIntegrityRegression();
  await testReportOutputQualityGateRules();
  await testInvalidReportDoesNotConsumeCredit();
  await testTask1HighBandStrategyPrompt();
  await testTask1MapModerateIssuesDoNotCreateCriticalCap();
  await testLangleyMapStrategyRegression();
  await testTask1MissingOverviewStillCapped();
  await testTask1InaccurateOverviewStillCapped();
  await testTask2Band7Calibration();
  await testDuplicateSubmissionHashCache();
  await testWeakTask2StillCapped();
  await testTask2LowBandCompletionAndRouteSafety();
  await testTask2RouteTypeAndCompletionRegressions();
  await testUnderlengthProviderPartialFeedbackIsRepaired();
}

async function testPackageCopyShows10Analyses() {
  const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const previewHtml = await readFile(new URL("../netlify-static-preview/index.html", import.meta.url), "utf8");

  for (const html of [indexHtml, previewHtml]) {
    assert.ok(html.includes("2,999 THB"));
    assert.ok(html.includes("10 analyses"));
    assert.ok(html.includes("Valid for 60 days"));
    assert.ok(html.includes("Private access only: No public signup."));
    assert.ok(html.includes("Students receive a username and password from Kru Pom IELTS after approval/payment."));
    assert.ok(!html.includes("20 analyses"));
  }
}

async function testDeterministicWordCount() {
  const tokens = "don't 35-year-old 7–14-year-olds 2010 !!!";
  assert.equal(countWords(tokens), 4);
  assert.equal(countWords("ภาษาไทย ทดสอบ"), 2);
  assert.equal(countWords("... -- !!!"), 0);
  assert.equal(countWords("3.5 1,000"), 2);

  const task1Below = getWordCountMetadata("Task 1", makeExactWordWriting("A report describes the chart.", 149));
  assert.deepEqual(task1Below, {
    wordCount: 149,
    minimumWordCount: 150,
    wordCountStatus: "below_minimum",
    wordShortfall: 1
  });
  assert.equal(getWordCountMetadata("Task 1", makeExactWordWriting("A report describes the chart.", 150)).wordCountStatus, "meets_minimum");
  assert.equal(getWordCountMetadata("Task 2", makeExactWordWriting("This essay states a clear position.", 249)).wordShortfall, 1);
  assert.equal(getWordCountMetadata("Task 2", makeExactWordWriting("This essay states a clear position.", 250)).wordCountStatus, "meets_minimum");

  const rootModule = await readFile(new URL("../wordCount.js", import.meta.url), "utf8");
  const previewModule = await readFile(new URL("../netlify-static-preview/wordCount.js", import.meta.url), "utf8");
  assert.equal(previewModule, rootModule);
}

async function testTeacherStudentSelectionReenablesAnalyzeButton() {
  const rootScript = await readFile(new URL("../script.js", import.meta.url), "utf8");
  const previewScript = await readFile(new URL("../netlify-static-preview/script.js", import.meta.url), "utf8");
  const rootHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const previewHtml = await readFile(new URL("../netlify-static-preview/index.html", import.meta.url), "utf8");
  const selectionAvailabilitySync = /studentProfileSelect\.addEventListener\("change",[\s\S]*?updateSelectedStudentDisplay\(\);\s*updateAnalyzeAvailability\(\);\s*loadProgressHistory\(\);/;
  const cacheBustedScript = "script.js?v=diagnostic-v6-2-student-selection-recovery";

  for (const source of [rootScript, previewScript]) {
    assert.match(source, selectionAvailabilitySync);
  }
  for (const html of [rootHtml, previewHtml]) {
    assert.ok(html.includes(cacheBustedScript));
  }
}

async function testStudentProfilesAndProgressIsolation() {
  resetEnv();
  process.env.SESSION_SECRET = "student-profile-test-secret";
  process.env.DIAGNOSTIC_STORAGE_ADAPTER = "local-json";
  process.env.TEACHER_DAILY_SAFETY_LIMIT = "20";
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;

  const rootDir = await mkdtemp(path.join(tmpdir(), "diagnostic-student-profiles-"));
  try {
    await writeFile(path.join(rootDir, "users.json"), JSON.stringify([
      { username: "teacher-a", password: "pass-a", displayName: "Teacher A", role: "teacher", quotaMode: "unlimited", status: "active" },
      { username: "teacher-b", password: "pass-b", displayName: "Teacher B", role: "teacher", quotaMode: "unlimited", status: "active" }
    ], null, 2));
    await writeFile(path.join(rootDir, "submission-history.json"), "[]\n");
    await writeFile(path.join(rootDir, "student-profiles.json"), "[]\n");

    const handler = createApiHandler({ rootDir });
    const loginA = await request(handler, "POST", "/api/login", { username: "teacher-a", password: "pass-a" });
    const loginB = await request(handler, "POST", "/api/login", { username: "teacher-b", password: "pass-b" });
    const cookieA = loginA.headers["Set-Cookie"];
    const cookieB = loginB.headers["Set-Cookie"];

    const missingSelection = await request(handler, "POST", "/api/analyze", {
      ...task1Payload,
      writing: makeExactWordWriting(task1Payload.writing, 149),
      clientSubmissionId: "teacher-missing-student"
    }, cookieA);
    assert.equal(missingSelection.statusCode, 400);

    const poon = await request(handler, "POST", "/api/student-profiles", { displayName: "Poon Poon" }, cookieA);
    const sun = await request(handler, "POST", "/api/student-profiles", { displayName: "Sun" }, cookieA);
    const jj = await request(handler, "POST", "/api/student-profiles", { displayName: "JJ" }, cookieA);
    assert.equal(poon.statusCode, 201);
    assert.deepEqual(Object.keys(poon.json.profile).sort(), ["displayName", "profileToken"]);
    assert.ok(!poon.json.profile.profileToken.includes("Poon"));

    const duplicateName = await request(handler, "POST", "/api/student-profiles", { displayName: "  poon   poon  " }, cookieA);
    assert.equal(duplicateName.statusCode, 409);

    const poonTask1Below = await request(handler, "POST", "/api/analyze", {
      ...task1Payload,
      writing: makeExactWordWriting(task1Payload.writing, 149),
      studentProfileToken: poon.json.profile.profileToken,
      clientSubmissionId: "poon-task1-149"
    }, cookieA);
    assert.equal(poonTask1Below.statusCode, 200);
    assert.equal(poonTask1Below.json.analysis.studentDisplayNameSnapshot, "Poon Poon");
    assert.equal(poonTask1Below.json.analysis.wordCount, 149);
    assert.equal(poonTask1Below.json.analysis.minimumWordCount, 150);
    assert.equal(poonTask1Below.json.analysis.wordCountStatus, "below_minimum");
    assert.equal(poonTask1Below.json.analysis.wordShortfall, 1);
    assert.ok(!("studentProfileId" in poonTask1Below.json.analysis));
    assert.ok(!JSON.stringify(poonTask1Below.json).includes("Submitted by"));

    const poonTask1AtMinimum = await request(handler, "POST", "/api/analyze", {
      ...task1Payload,
      writing: makeExactWordWriting(task1Payload.writing, 150),
      studentProfileToken: poon.json.profile.profileToken,
      clientSubmissionId: "poon-task1-150"
    }, cookieA);
    assert.equal(poonTask1AtMinimum.statusCode, 200);
    assert.equal(poonTask1AtMinimum.json.analysis.wordCountStatus, "meets_minimum");
    assert.equal(poonTask1AtMinimum.json.analysis.wordShortfall, 0);

    const poonTask2 = await request(handler, "POST", "/api/analyze", {
      ...task2Payload,
      writing: makeExactWordWriting(task2Payload.writing, 249),
      studentProfileToken: poon.json.profile.profileToken,
      clientSubmissionId: "poon-task2-249"
    }, cookieA);
    assert.equal(poonTask2.statusCode, 200);
    assert.equal(poonTask2.json.analysis.wordCount, 249);
    assert.equal(poonTask2.json.analysis.wordShortfall, 1);

    const poonTask1Progress = await request(handler, "GET", `/api/progress?student=${encodeURIComponent(poon.json.profile.profileToken)}&taskType=Task%201`, null, cookieA);
    const poonTask2Progress = await request(handler, "GET", `/api/progress?student=${encodeURIComponent(poon.json.profile.profileToken)}&taskType=Task%202`, null, cookieA);
    const sunProgress = await request(handler, "GET", `/api/progress?student=${encodeURIComponent(sun.json.profile.profileToken)}`, null, cookieA);
    const jjProgress = await request(handler, "GET", `/api/progress?student=${encodeURIComponent(jj.json.profile.profileToken)}`, null, cookieA);
    assert.equal(poonTask1Progress.json.records.length, 2);
    assert.equal(poonTask2Progress.json.records.length, 1);
    assert.equal(sunProgress.json.records.length, 0);
    assert.equal(jjProgress.json.records.length, 0);
    assert.ok(!("username" in poonTask1Progress.json.records[0]));
    assert.ok(!("studentProfileId" in poonTask1Progress.json.records[0]));

    const crossAccount = await request(handler, "GET", `/api/progress?student=${encodeURIComponent(poon.json.profile.profileToken)}`, null, cookieB);
    assert.equal(crossAccount.statusCode, 404);

    const profiles = JSON.parse(await readFile(path.join(rootDir, "student-profiles.json"), "utf8"));
    const history = JSON.parse(await readFile(path.join(rootDir, "submission-history.json"), "utf8"));
    const poonProfile = profiles.find((profile) => profile.displayName === "Poon Poon");
    assert.match(poonProfile.id, /^[0-9a-f-]{36}$/i);
    assert.equal(history.filter((record) => record.studentProfileId === poonProfile.id && record.taskType === "Task 1").length, 2);
    assert.equal(history.filter((record) => record.studentProfileId === poonProfile.id && record.taskType === "Task 2").length, 1);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
    resetEnv();
  }
}

async function testDiagnosticResetPreservesProtectedData() {
  resetEnv();
  const dataDir = await mkdtemp(path.join(tmpdir(), "diagnostic-reset-"));
  try {
    const users = [{
      username: "protected-user",
      passwordHash: "scrypt:protected-hash",
      displayName: "Protected User",
      role: "student",
      quotaMode: "limited",
      quota: 10,
      used: 3,
      expiryDate: "2099-12-31",
      status: "active",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }];
    const audit = [{ timestamp: "2026-07-12T00:00:00.000Z", username: "protected-user", quotaDeducted: true }];
    await writeFile(path.join(dataDir, "users.json"), JSON.stringify(users, null, 2));
    await writeFile(path.join(dataDir, "usage-audit.json"), JSON.stringify(audit, null, 2));
    await writeFile(path.join(dataDir, "submission-history.json"), JSON.stringify([{ submissionId: "old-report", username: "protected-user" }], null, 2));
    await writeFile(path.join(dataDir, "student-profiles.json"), JSON.stringify([{ id: "old-profile", ownerAccountId: "protected-user", displayName: "Old Student", active: true }], null, 2));
    await writeFile(path.join(dataDir, ".diagnostic-jobs.json"), JSON.stringify({ "old-job": { status: "complete" } }, null, 2));

    process.env.DIAGNOSTIC_STORAGE_ADAPTER = "local-json";
    process.env.DIAGNOSTIC_DATA_DIR = dataDir;
    delete process.env.NETLIFY;
    delete process.env.LAMBDA_TASK_ROOT;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    delete process.env.AWS_EXECUTION_ENV;
    const storage = createStorage({ rootDir: dataDir });
    const jobStore = createAnalysisJobStore({ rootDir: dataDir });

    const dryRunResult = await runDiagnosticReset({ storage, jobStore, execute: false });
    assert.equal(dryRunResult.mode, "dry-run");
    assert.equal(dryRunResult.manifest.diagnosticStores[0].recordCount, 1);
    assert.equal(JSON.parse(await readFile(path.join(dataDir, "submission-history.json"), "utf8")).length, 1);

    const executedResult = await runDiagnosticReset({ storage, jobStore, execute: true });
    assert.equal(executedResult.mode, "executed");
    assert.equal(JSON.parse(await readFile(path.join(dataDir, "submission-history.json"), "utf8")).length, 0);
    assert.equal(JSON.parse(await readFile(path.join(dataDir, "student-profiles.json"), "utf8")).length, 0);
    assert.deepEqual(JSON.parse(await readFile(path.join(dataDir, ".diagnostic-jobs.json"), "utf8")), {});
    assert.deepEqual(JSON.parse(await readFile(path.join(dataDir, "users.json"), "utf8")), users);
    assert.deepEqual(JSON.parse(await readFile(path.join(dataDir, "usage-audit.json"), "utf8")), audit);
    assert.equal(executedResult.before.protectedStores[0].checksum, executedResult.after.protectedStores[0].checksum);
    assert.equal(executedResult.before.protectedStores[0].recordCount, executedResult.after.protectedStores[0].recordCount);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
    resetEnv();
  }
}

function makeExactWordWriting(base, target) {
  const current = countWords(base);
  assert.ok(current <= target, `Base text has ${current} words, which exceeds target ${target}.`);
  const filler = Array.from({ length: target - current }, (_, index) => `detail${index + 1}`).join(" ");
  return `${base}${filler ? `\n\n${filler}.` : ""}`;
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
    const sessionAfterFailure = await request(handler, "GET", "/api/session", null, loginB.headers["Set-Cookie"]);
    assert.equal(sessionAfterFailure.json.user.used, 0);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
    resetEnv();
  }
}

async function testRoleQuotaAdminSecurity() {
  resetEnv();
  process.env.SESSION_SECRET = "test-session-secret";
  process.env.DIAGNOSTIC_STORAGE_ADAPTER = "local-json";
  process.env.TEACHER_DAILY_SAFETY_LIMIT = "1";

  const rootDir = await mkdtemp(path.join(tmpdir(), "diagnostic-roles-"));
  const usersPath = path.join(rootDir, "users.json");
  try {
    await writeFile(usersPath, JSON.stringify([
      {
        username: "student-one",
        password: "pass-one",
        displayName: "Student One",
        role: "student",
        quota: 1,
        used: 0,
        expiryDate: "2099-12-31",
        status: "active"
      },
      {
        username: "student-zero",
        password: "pass-zero",
        displayName: "Student Zero",
        role: "student",
        quota: 1,
        used: 1,
        expiryDate: "2099-12-31",
        status: "active"
      },
      {
        username: "student-expired",
        password: "pass-expired",
        displayName: "Student Expired",
        role: "student",
        quota: 5,
        used: 0,
        expiryDate: "2000-01-01",
        status: "active"
      },
      {
        username: "teacher-one",
        password: "pass-teacher",
        displayName: "Teacher One",
        role: "teacher",
        quotaMode: "unlimited",
        quota: 0,
        used: 0,
        expiryDate: "",
        dailyUsage: {},
        status: "active"
      },
      {
        username: "admin-one",
        password: "pass-admin",
        displayName: "Admin One",
        role: "admin",
        quotaMode: "unlimited",
        quota: 0,
        used: 0,
        expiryDate: "",
        dailyUsage: {},
        status: "active"
      }
    ], null, 2));
    await writeFile(path.join(rootDir, "submission-history.json"), "[]\n");

    const handler = createApiHandler({ rootDir });

    const studentLogin = await request(handler, "POST", "/api/login", { username: "student-one", password: "pass-one" });
    assert.equal(studentLogin.statusCode, 200);
    const migratedUsers = JSON.parse(await readFile(usersPath, "utf8"));
    const migratedStudent = migratedUsers.find((user) => user.username === "student-one");
    assert.equal(migratedStudent.password, "");
    assert.match(migratedStudent.passwordHash, /^scrypt:/);

    const studentCookie = studentLogin.headers["Set-Cookie"];
    const studentAnalysis = await request(handler, "POST", "/api/analyze", {
      ...task2Payload,
      clientSubmissionId: "role-student-success"
    }, studentCookie);
    assert.equal(studentAnalysis.statusCode, 200);
    assert.equal(studentAnalysis.json.user.used, 1);
    assert.equal(studentAnalysis.json.user.remainingQuota, 0);

    const studentOverQuota = await request(handler, "POST", "/api/analyze", {
      ...task2Payload,
      clientSubmissionId: "role-student-over-quota",
      writing: `${task2Payload.writing}\n\nThis is a new non-duplicate attempt.`
    }, studentCookie);
    assert.equal(studentOverQuota.statusCode, 403);
    assert.equal(studentOverQuota.json.errorCode, "QUOTA_USED");

    const zeroLogin = await request(handler, "POST", "/api/login", { username: "student-zero", password: "pass-zero" });
    const zeroResult = await request(handler, "POST", "/api/analyze", {
      ...task2Payload,
      clientSubmissionId: "role-zero-quota"
    }, zeroLogin.headers["Set-Cookie"]);
    assert.equal(zeroResult.statusCode, 403);
    assert.equal(zeroResult.json.errorCode, "QUOTA_USED");

    const expiredLogin = await request(handler, "POST", "/api/login", { username: "student-expired", password: "pass-expired" });
    const expiredResult = await request(handler, "POST", "/api/analyze", {
      ...task2Payload,
      clientSubmissionId: "role-expired"
    }, expiredLogin.headers["Set-Cookie"]);
    assert.equal(expiredResult.statusCode, 403);
    assert.equal(expiredResult.json.errorCode, "ACCESS_EXPIRED");

    const studentAdminApi = await request(handler, "GET", "/api/admin/users", null, studentCookie);
    assert.equal(studentAdminApi.statusCode, 403);

    const teacherLogin = await request(handler, "POST", "/api/login", { username: "teacher-one", password: "pass-teacher" });
    assert.equal(teacherLogin.statusCode, 200);
    assert.equal(teacherLogin.json.user.quotaMode, "unlimited");
    const teacherCookie = teacherLogin.headers["Set-Cookie"];
    const teacherStudent = await request(handler, "POST", "/api/student-profiles", { displayName: "Poon Poon" }, teacherCookie);
    assert.equal(teacherStudent.statusCode, 201);
    const teacherStudentToken = teacherStudent.json.profile.profileToken;
    const teacherFirst = await request(handler, "POST", "/api/analyze", {
      ...task2Payload,
      studentProfileToken: teacherStudentToken,
      clientSubmissionId: "role-teacher-success"
    }, teacherCookie);
    assert.equal(teacherFirst.statusCode, 200);
    assert.equal(teacherFirst.json.user.quotaMode, "unlimited");
    assert.equal(teacherFirst.json.user.remainingQuota, null);
    assert.equal(teacherFirst.json.user.dailySafetyRemaining, 0);

    const teacherSecond = await request(handler, "POST", "/api/analyze", {
      ...task2Payload,
      studentProfileToken: teacherStudentToken,
      clientSubmissionId: "role-teacher-daily-limit",
      writing: `${task2Payload.writing}\n\nThis is another teacher attempt.`
    }, teacherCookie);
    assert.equal(teacherSecond.statusCode, 403);
    assert.equal(teacherSecond.json.errorCode, "TEACHER_DAILY_LIMIT");

    const adminLogin = await request(handler, "POST", "/api/login", { username: "admin-one", password: "pass-admin" });
    assert.equal(adminLogin.statusCode, 200);
    const adminCookie = adminLogin.headers["Set-Cookie"];
    const users = await request(handler, "GET", "/api/admin/users", null, adminCookie);
    assert.equal(users.statusCode, 200);
    assert.ok(!("passwordHash" in users.json.users[0]));
    assert.ok(!("password" in users.json.users[0]));

    const created = await request(handler, "POST", "/api/admin/users", {
      username: "new-student",
      displayName: "New Student",
      quotaLimit: 2,
      expiryDate: "2099-12-31"
    }, adminCookie);
    assert.equal(created.statusCode, 201);
    assert.match(created.json.generatedPassword, /[A-Za-z]/);
    assert.match(created.json.generatedPassword, /\d/);
    assert.ok(created.json.generatedPassword.length >= 10);
    assert.ok(!("passwordHash" in created.json.user));

    const newStudentLogin = await request(handler, "POST", "/api/login", {
      username: "new-student",
      password: created.json.generatedPassword
    });
    assert.equal(newStudentLogin.statusCode, 200);

    const reset = await request(handler, "POST", "/api/admin/users/new-student/reset-password", {}, adminCookie);
    assert.equal(reset.statusCode, 200);
    assert.ok(reset.json.generatedPassword.length >= 10);
    const resetLogin = await request(handler, "POST", "/api/login", {
      username: "new-student",
      password: reset.json.generatedPassword
    });
    assert.equal(resetLogin.statusCode, 200);

    const teacherPatch = await request(handler, "PATCH", "/api/admin/users/new-student", {
      role: "teacher"
    }, adminCookie);
    assert.equal(teacherPatch.statusCode, 200);
    assert.equal(teacherPatch.json.user.quotaMode, "unlimited");

    const studentPatch = await request(handler, "PATCH", "/api/admin/users/new-student", {
      role: "student"
    }, adminCookie);
    assert.equal(studentPatch.statusCode, 200);
    assert.equal(studentPatch.json.user.quotaMode, "limited");

    const summary = await request(handler, "GET", "/api/admin/usage-summary", null, adminCookie);
    assert.equal(summary.statusCode, 200);
    assert.ok(summary.json.summary.some((record) => record.username === "teacher-one" && record.openAiCalls >= 1));
    assert.ok(summary.json.summary.some((record) => record.username === "teacher-one" && record.blocked >= 1));
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

async function testTask1IntroParaphraseGuidance() {
  resetEnv();
  const prompt = buildPrompt(solarPanelDiagramPayload);
  assert.ok(prompt.includes("Task 1 introduction and paraphrase guidance"));
  assert.ok(prompt.includes("Technical nouns may stay when needed"));
  assert.ok(prompt.includes("Changing only one reporting verb"));
  assert.ok(prompt.includes("A targeted revision must be clearer and more visually grounded"));
  assert.ok(prompt.includes("For mixed or combination tasks, normally name each visual separately"));
  assert.ok(prompt.includes("Prompt-overlap risk"));
  assert.ok(prompt.includes("Diagram / structure"));
  assert.ok(prompt.includes("The diagrams compare the basic components of a solar panel"));
  assert.ok(prompt.includes("Do not tell students that Task 1 must always have exactly 4 paragraphs"));

  const analysis = await analyzeWriting(solarPanelDiagramPayload);
  const introCard = analysis.feedbackCards.find((card) => card.issueType === "Task 1 Introduction Paraphrase Control");
  assert.ok(introCard);
  assert.equal(introCard.severity, "Moderate");
  assert.equal(introCard.exactSentence, "The diagrams illustrate the structure of a solar panel and show how it can be used to heat air and water.");
  assert.equal(introCard.targetedRevision, "The diagrams compare the basic components of a solar panel and illustrate how the device can warm air and water.");
  assert.ok(!/critical|capped/i.test(introCard.whyItLimitsBand));
}

async function testTask1MixedGraphRevisionQualityGuard() {
  resetEnv();
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "gpt-5.5";

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      output_text: JSON.stringify({
        taskType: "Task 1",
        visualType: "Mixed Graph",
        estimatedBandRange: "7.0-7.5",
        mainScoreLimitingFactor: "The report is accurate overall, but the introduction model needs more precise mixed-graph wording.",
        mostUrgentRepair: "Make the introduction distinguish the pie chart from the bar chart.",
        taskAchievementCapReason: "",
        criticalOverviewError: false,
        overviewAccuracyStatus: "Accurate",
        mainTrendRecognition: "Clear",
        dataSelectionQuality: "Strong",
        unsafeGeneralisationDetected: false,
        majorOmissionDetected: false,
        contradictionDetected: false,
        dataAccuracyRisk: "Low",
        groupingLogicStatus: "Strong",
        recommendedTaskAchievementRange: "",
        overallBandCap: "",
        strictModeApplied: false,
        criteriaScores: {
          "Task Achievement": {
            range: "7.0-7.5",
            diagnosis: "The answer covers both visuals.",
            evidence: "Overall, private studios were the most common location, while ballet attracted more younger students and modern dance attracted more older students."
          },
          "Coherence & Cohesion": {
            range: "7.0-7.5",
            diagnosis: "The report is organized by visual.",
            evidence: "In the pie chart, private studios made up the largest share of dance-class locations, followed by school halls and community venues."
          },
          "Lexical Resource": {
            range: "7.0-7.5",
            diagnosis: "Vocabulary is mostly precise.",
            evidence: "In the bar chart, ballet had more students under 11, whereas modern dance had more students aged 11 to 16."
          },
          "Grammatical Range & Accuracy": {
            range: "7.0-7.5",
            diagnosis: "Grammar is controlled.",
            evidence: "The pie chart and bar chart give information about dance classes in an Australian town."
          }
        },
        kruPomScores: {
          "Visual Understanding": { status: "Strong", diagnosis: "Both visuals are understood." },
          "Prompt Coverage": { status: "Strong", diagnosis: "The answer covers both visuals." },
          "Overview Quality": { status: "Strong", diagnosis: "The overview identifies main patterns safely." },
          "Data Selection": { status: "Strong", diagnosis: "The selected data is relevant." },
          "Grouping Logic": { status: "Strong", diagnosis: "The body groups by visual type." },
          "Data Accuracy": { status: "Strong", diagnosis: "No major data error detected." },
          "Comparison Precision": { status: "Strong", diagnosis: "Comparisons are clear." },
          "Report Tone Control": { status: "Moderate", diagnosis: "The introduction model needs more exact mixed-graph wording." },
          "Task 1 Objective Reporting": { status: "Moderate", diagnosis: "The introduction should name each visual function." },
          "LFC CPC Control": { status: "Strong", diagnosis: "The report route is clear." },
          "Vocabulary Precision": { status: "Moderate", diagnosis: "Avoid vague collective labels." },
          "Grammar Risk": { status: "Strong", diagnosis: "No major grammar risk detected." }
        },
        top3Issues: [],
        feedbackCards: [{
          issueType: "Mixed Graph Introduction Precision",
          severity: "Moderate",
          criteria: ["Task Achievement", "Lexical Resource"],
          framework: ["Visual Understanding", "Task 1 Objective Reporting", "Vocabulary Precision"],
          paragraphLocation: "Introduction, Sentence 1",
          exactSentence: "The pie chart and bar chart give information about dance classes in an Australian town.",
          sentenceFunction: "This sentence introduces a mixed Task 1 visual.",
          whyItLimitsBand: "The student needs a more precise mixed-graph introduction model.",
          kruPomDiagnosis: "The model sentence must separate the pie chart's location proportions from the bar chart's participation figures.",
          targetedRevision: "The visuals show where young people attend dance classes and compare participation across two age groups.",
          whyRevisionIsStronger: "It is shorter.",
          studentAction: "Make the introduction clearer."
        }],
        paragraphFeedback: [{
          paragraphLocation: "Introduction",
          exactEvidence: "The pie chart and bar chart give information about dance classes in an Australian town.",
          diagnosis: "The introduction is accurate but could be more specific.",
          action: "Name each visual's function."
        }],
        practicePlan: [],
        disclaimer: "Diagnostic only."
      })
    })
  });

  const analysis = await analyzeWriting(evaMixedGraphPayload);
  const introCard = analysis.feedbackCards.find((card) => card.issueType === "Mixed Graph Introduction Precision");
  assert.ok(introCard);
  assert.equal(introCard.targetedRevision, "The pie chart illustrates the proportion of dance classes held in four different locations in an Australian town, while the bar chart compares the numbers of young people attending ballet, tap and modern dance classes across two age groups: under 11 and 11-16.");
  assert.ok(!/the visuals show/i.test(introCard.targetedRevision));
  assert.equal(analysis.estimatedBandRange, "7.0-7.5");
  assert.equal(analysis.taskAchievementCapReason, "");
  assert.equal(analysis.strictModeApplied, false);

  resetEnv();
}

async function testTask1LineGraphRevisionQualityGuard() {
  resetEnv();
  const analysis = await analyzeWriting(lineGraphIntroPayload);
  const introCard = analysis.feedbackCards.find((card) => card.issueType === "Task 1 Introduction Paraphrase Control");

  assert.ok(introCard);
  assert.ok(introCard.targetedRevision.includes("The line graph compares changes in"));
  assert.ok(introCard.targetedRevision.includes("car and bus users"));
  assert.ok(introCard.targetedRevision.includes("from 2000 to 2020"));
  assert.ok(!/shows changes over time/i.test(introCard.targetedRevision));
}

async function testTask1JJLineGraphIntroductionFormulaRegression() {
  resetEnv();
  const analysis = await analyzeWriting(jjCinemaLineGraphPayload);
  const introCard = analysis.feedbackCards.find((card) => card.issueType === "Task 1 Introduction Visual-Type Precision");

  assert.ok(introCard);
  assert.equal(introCard.exactSentence, "The bar chart depicts how popular the cinema attendance rate is in percentages across 4 different age groups, ranging from ages 7 to 35 and over, between the years of 2000 and 2011.");
  assert.equal(introCard.targetedRevision, "The line graph compares changes in the percentage of people across four distinct age groups - 7-14, 15-24, 25-34, and 35 and over - who attended the cinema more than once a month between 2000 and 2011.");
  assert.ok(/changes-over-time frame/i.test(introCard.whyRevisionIsStronger));
  assert.ok(/more than once a month/i.test(introCard.whyRevisionIsStronger));
  assert.ok(/7-14, 15-24, 25-34, and 35 and over/i.test(introCard.whyRevisionIsStronger));
  assert.ok(/intro checklist/i.test(introCard.studentAction));
  assert.ok(!/group the lines into similar trend groups/i.test(introCard.studentAction));
  assert.ok(!/group lines with similar trends/i.test(introCard.kruPomDiagnosis));
}

async function testTask1GoodsTransportIntroductionFormulaRegression() {
  resetEnv();
  const analysis = await analyzeWriting(goodsTransportLineGraphPayload);
  const introCard = analysis.feedbackCards.find((card) => card.issueType === "Task 1 Introduction Paraphrase Control");

  assert.ok(introCard);
  assert.equal(introCard.targetedRevision, "The line graph illustrates the quantity of goods, measured in million tonnes, transported by four different modes - road, water, rail, and pipeline - in the United Kingdom between 1974 and 2002.");
  assert.ok(introCard.targetedRevision.includes("road, water, rail, and pipeline"));
  assert.ok(introCard.targetedRevision.includes("million tonnes"));
  assert.ok(introCard.targetedRevision.includes("between 1974 and 2002"));
}

async function testPoonReportIntegrityRegression() {
  resetEnv();
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "gpt-5.5";

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ output_text: JSON.stringify(buildPoonProviderOutput()) })
  });

  const analysis = await analyzeWriting(poonMarriageDivorcePayload);
  const introCard = analysis.feedbackCards.find((card) => /introduction/i.test(card.paragraphLocation));
  const expectedRevision = "The bar charts compare marriage and divorce rates, measured per thousand people, in the USA, the UK, Japan, Germany and Denmark in 1985 and 2010.";
  const expectedWhy = "This version identifies the two bar charts correctly, states the exact subject and measurement unit, lists the five countries clearly and preserves the two comparison years without using an unnatural relative clause.";

  assert.ok(introCard);
  assert.equal(introCard.targetedRevision, expectedRevision);
  assert.equal(introCard.whyRevisionIsStronger, expectedWhy);
  assert.equal(countOccurrences(introCard.whyRevisionIsStronger, "This version identifies"), 1);
  assert.ok(!/below provide information|The bar chart compares changes in The bar charts/i.test(introCard.targetedRevision));
  assert.equal(analysis.mainScoreLimitingFactor, "The two main score-limiting factors are incomplete coverage of the visual information and inconsistent sentence-level grammar control.");
  assert.ok(!/not grammar/i.test(analysis.mainScoreLimitingFactor));
  assert.ok(analysis.feedbackCards.some((card) => /all major patterns, contrasts and exceptions/i.test(card.kruPomDiagnosis)));
  assert.ok(!analysis.feedbackCards.some((card) => /tick every country\/category/i.test(card.studentAction)));

  resetEnv();
}

async function testReportOutputQualityGateRules() {
  resetEnv();
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "gpt-5.5";
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ output_text: JSON.stringify(buildPoonProviderOutput()) })
  });
  const valid = await analyzeWriting(poonMarriageDivorcePayload);
  const introIndex = valid.feedbackCards.findIndex((card) => /introduction/i.test(card.paragraphLocation));

  const malformed = structuredClone(valid);
  malformed.feedbackCards[introIndex].targetedRevision = "The bar chart compares changes in The bar charts below provide information about marriage and divorce rates in five countries in 1985 and 2010.";
  assertQualityGateRejects(malformed, /task-instruction leakage|repeats a visual-type phrase|singular bar chart/i);

  const duplicated = structuredClone(valid);
  const explanation = duplicated.feedbackCards[introIndex].whyRevisionIsStronger;
  duplicated.feedbackCards[introIndex].whyRevisionIsStronger = `${explanation} ${explanation}`;
  const normalized = validateReportOutput(duplicated, poonMarriageDivorcePayload);
  assert.equal(normalized.feedbackCards[introIndex].whyRevisionIsStronger, explanation);

  const missingUnit = structuredClone(valid);
  missingUnit.feedbackCards[introIndex].targetedRevision = "The bar charts compare marriage and divorce rates in the USA, the UK, Japan, Germany and Denmark in 1985 and 2010.";
  missingUnit.feedbackCards[introIndex].whyRevisionIsStronger = "This version integrates the unit smoothly and lists the five countries clearly.";
  assertQualityGateRejects(missingUnit, /claims a unit/i);

  const singularVisual = structuredClone(valid);
  singularVisual.feedbackCards[introIndex].targetedRevision = "The bar chart compares marriage and divorce rates, measured per thousand people, in the USA, the UK, Japan, Germany and Denmark in 1985 and 2010.";
  singularVisual.feedbackCards[introIndex].whyRevisionIsStronger = "This version states the exact subject, measurement unit, five countries and comparison years clearly.";
  assertQualityGateRejects(singularVisual, /singular bar chart/i);

  const inconsistentSummary = structuredClone(valid);
  inconsistentSummary.mainScoreLimitingFactor = "The main score-limiting issue is not grammar. It is incomplete visual interpretation.";
  assertQualityGateRejects(inconsistentSummary, /dismisses grammar/i);

  resetEnv();
}

async function testInvalidReportDoesNotConsumeCredit() {
  resetEnv();
  process.env.SESSION_SECRET = "test-session-secret";
  process.env.DIAGNOSTIC_STORAGE_ADAPTER = "local-json";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "gpt-5.5";
  process.env.DIAGNOSTIC_ANALYSIS_MODE = "sync";

  const rootDir = await mkdtemp(path.join(tmpdir(), "diagnostic-output-gate-"));
  try {
    await writeFile(path.join(rootDir, "users.json"), JSON.stringify([{
      username: "poon-test",
      password: "pass-a",
      displayName: "Kru Pom Test",
      quota: 10,
      used: 0,
      expiryDate: "2099-12-31",
      status: "active"
    }], null, 2));
    await writeFile(path.join(rootDir, "submission-history.json"), "[]\n");

    const invalidOutput = buildPoonProviderOutput();
    invalidOutput.feedbackCards[1].targetedRevision = "In addition.";
    let providerCalls = 0;
    globalThis.fetch = async () => {
      providerCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ output_text: JSON.stringify(invalidOutput) })
      };
    };

    const handler = createApiHandler({ rootDir });
    const storage = createStorage({ rootDir });
    const login = await request(handler, "POST", "/api/login", { username: "poon-test", password: "pass-a" });
    const response = await request(handler, "POST", "/api/analyze", poonMarriageDivorcePayload, login.headers["Set-Cookie"]);
    const user = await storage.getUserByUsername("poon-test");
    const history = await storage.getSubmissionHistory("poon-test");

    assert.equal(response.statusCode, 502);
    assert.equal(response.json.errorCode, "REPORT_OUTPUT_VALIDATION_FAILED");
    assert.ok(/No analysis credit was used/i.test(response.json.error));
    assert.equal(providerCalls, 2);
    assert.equal(user.used, 0);
    assert.equal(history.length, 0);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
    resetEnv();
  }
}

function buildPoonProviderOutput() {
  const duplicateExplanation = "It follows the Kru Pom introduction formula by naming the visual type, exact subject, unit or data type, category scope and timeframe without forcing unsafe synonyms.";
  return {
    taskType: "Task 1",
    essayType: "",
    visualType: "Bar Chart",
    targetBand: "7.0",
    estimatedBandRange: "5.5-6.0",
    mainScoreLimitingFactor: "The main score-limiting issue is not grammar. It is incomplete visual interpretation and missing key divorce data in the body.",
    mostUrgentRepair: "Add a fuller overview and a complete divorce body paragraph using accurate grouped comparisons.",
    taskAchievementCapReason: "Task Achievement is capped because the overview contains inaccurate or unsafe main trends.",
    criticalOverviewError: true,
    overviewAccuracyStatus: "Mostly accurate but incomplete",
    mainTrendRecognition: "Incomplete",
    dataSelectionQuality: "Needs Work",
    unsafeGeneralisationDetected: false,
    majorOmissionDetected: true,
    contradictionDetected: false,
    dataAccuracyRisk: "Moderate",
    groupingLogicStatus: "Needs Work",
    recommendedTaskAchievementRange: "5.5-6.0",
    overallBandCap: "6.0",
    strictModeApplied: true,
    criteriaScores: {
      "Task Achievement": { range: "5.5-6.0", diagnosis: "The overview and divorce coverage are incomplete.", evidence: "Overall, marriage rates fall in most countries in 2010, while divorce rate were generally remain stable." },
      "Coherence & Cohesion": { range: "6.0-6.5", diagnosis: "The divorce paragraph is underdeveloped.", evidence: "In addition, regarding with divorce rates." },
      "Lexical Resource": { range: "5.5-6.0", diagnosis: "Several word forms and collocations are inaccurate.", evidence: "Then, UK and Japan both were declined slight from 7 to 6." },
      "Grammatical Range & Accuracy": { range: "5.0-5.5", diagnosis: "Agreement, passive voice, tense and sentence boundaries are inconsistent.", evidence: "The figure are measured per thousand people." }
    },
    kruPomScores: {},
    top3Issues: [],
    feedbackCards: [{
      issueType: "Introduction precision",
      severity: "Moderate",
      criteria: ["Task Achievement", "Lexical Resource"],
      framework: ["Visual Understanding", "Vocabulary Precision"],
      paragraphLocation: "Introduction",
      exactSentence: "The bar charts illustrate the marriage and divorce rates in 5 countries which are USA, UK, Japan, Germany and Denmark, in 1985 and 2010.",
      sentenceFunction: "This sentence introduces the visual type, topic, countries and years.",
      whyItLimitsBand: "The introduction is understandable but uses an unnatural relative clause.",
      kruPomDiagnosis: "A Band 7-ready introduction should keep exact task information and restructure it naturally.",
      targetedRevision: "The bar chart compares changes in The bar charts below provide information about marriage and divorce rates in five countries in 1985 and 2010.",
      whyRevisionIsStronger: `It names the two charts, integrates the unit smoothly, and gives the countries and years in a natural order. ${duplicateExplanation} ${duplicateExplanation}`,
      studentAction: "Use the introduction formula and preserve the exact unit, countries and years."
    }, {
      issueType: "Major omission",
      severity: "Needs Work",
      criteria: ["Task Achievement", "Coherence & Cohesion"],
      framework: ["Data Selection", "Grouping Logic", "Comparison Precision"],
      paragraphLocation: "Body Paragraph 2",
      exactSentence: "Moreover, Japan's divorce rate was doubled from 1 to 2 which was the lowest in five countries.",
      sentenceFunction: "This sentence reports one divorce-rate change.",
      whyItLimitsBand: "The divorce paragraph omits the UK, Germany and Denmark, leaving the second chart underdeveloped.",
      kruPomDiagnosis: "The second chart needs grouped coverage of the remaining meaningful comparisons.",
      targetedRevision: "In the divorce chart, the USA stayed at 5 divorces per thousand people, while the UK rose from 3 to 4 and Japan doubled from 1 to 2; Germany and Denmark were unchanged at 2 and 3 respectively.",
      whyRevisionIsStronger: "This version completes the divorce comparison through grouped increases and stable figures without listing bars mechanically.",
      studentAction: "Group the omitted countries by increase or stability when they are needed to complete the comparison."
    }, {
      issueType: "Grammar control",
      severity: "Needs Work",
      criteria: ["Grammatical Range & Accuracy", "Lexical Resource"],
      framework: ["Grammar Risk", "Vocabulary Precision"],
      paragraphLocation: "Body Paragraph 1",
      exactSentence: "Then, UK and Japan both were declined slight from 7 to 6.",
      sentenceFunction: "This sentence compares two marriage-rate declines.",
      whyItLimitsBand: "The passive form and word form are inaccurate.",
      kruPomDiagnosis: "Use the active change pattern X declined from A to B.",
      targetedRevision: "The marriage rates in the UK and Japan both declined slightly, from 7 to 6 per thousand people.",
      whyRevisionIsStronger: "This version uses the correct active verb, adverb and measurement phrase.",
      studentAction: "Practise active change patterns such as rose from, fell from and remained unchanged at."
    }],
    paragraphFeedback: [],
    revisedThesis: "",
    revisedParagraphSuggestions: [],
    practicePlan: [],
    warnings: [],
    disclaimer: "Diagnostic only."
  };
}

function assertQualityGateRejects(analysis, pattern) {
  assert.throws(
    () => validateReportOutput(analysis, poonMarriageDivorcePayload),
    (error) => error?.errorCode === "REPORT_OUTPUT_VALIDATION_FAILED" && pattern.test((error.validationIssues || []).join(" "))
  );
}

function countOccurrences(value, needle) {
  return String(value || "").split(needle).length - 1;
}

async function testTask1HighBandStrategyPrompt() {
  resetEnv();
  const mapPrompt = buildPrompt(langleyUnsafeOverviewPayload);
  const processPrompt = buildPrompt({
    ...task1Payload,
    visualType: "Process",
    prompt: "The diagram below shows how paper is recycled."
  });

  assert.ok(mapPrompt.includes("Correction fixes the sentence. Strategy fixes the next essay."));
  assert.ok(mapPrompt.includes("Task 1 high-band strategy guidance by visual type"));
  assert.ok(mapPrompt.includes("chronological organisation"));
  assert.ok(mapPrompt.includes("western/northern residential redevelopment"));
  assert.ok(/old feature -> new feature/i.test(mapPrompt));
  assert.ok(processPrompt.includes("Process: organise by stages/phases"));
  assert.ok(processPrompt.includes("avoid chart language such as \"trend\""));
}

async function testTask1MapModerateIssuesDoNotCreateCriticalCap() {
  resetEnv();
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "gpt-5.5";

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, "gpt-5.5");
    assert.equal(body.text.format.name, "ielts_task1_diagnostic_report");

    return {
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify({
          taskType: "Task 1",
          visualType: "Map",
          estimatedBandRange: "5.0-5.5",
          mainScoreLimitingFactor: "Task Achievement is capped because the overview contains inaccurate or unsafe main trends. Minor over-interpretation and a few imprecise change verbs, not overall structure or grammar.",
          mostUrgentRepair: "Remove unsupported purpose language and make map-change verbs safer.",
          taskAchievementCapReason: "Task Achievement is capped because the overview contains inaccurate or unsafe main trends.",
          criticalOverviewError: true,
          overviewAccuracyStatus: "Accurate",
          mainTrendRecognition: "Clear",
          dataSelectionQuality: "Strong",
          unsafeGeneralisationDetected: false,
          majorOmissionDetected: false,
          contradictionDetected: false,
          dataAccuracyRisk: "Low",
          groupingLogicStatus: "Strong",
          recommendedTaskAchievementRange: "5.0-5.5",
          overallBandCap: "5.5",
          strictModeApplied: true,
          criteriaScores: {
            "Task Achievement": {
              range: "7.0-7.5",
              diagnosis: "Task Achievement is capped because the overview contains inaccurate or unsafe main trends. The overview and grouping are generally strong, but map precision needs repair.",
              evidence: "Overall, the village has undergone a significant transformation from an industrial area into a larger residential and recreation suburb."
            },
            "Coherence & Cohesion": {
              range: "7.0-7.5",
              diagnosis: "The report is clearly organized by area.",
              evidence: "Across Jordan Street, the row of townhouses has been converted into high-rise flats."
            },
            "Lexical Resource": {
              range: "7.0-7.5",
              diagnosis: "Vocabulary is mostly precise, with a few safer map-verb choices needed.",
              evidence: "Across Jordan Street, the row of townhouses has been converted into high-rise flats."
            },
            "Grammatical Range & Accuracy": {
              range: "7.0-7.5",
              diagnosis: "Grammar control is strong despite one dense sentence.",
              evidence: "The railway in the south has been completely removed, and the nearby railway worker's cottages have been demolished and replaced by a large green space, known as Sherman Park, which includes a pond and a children's play area."
            }
          },
          kruPomScores: {
            "Overview Quality": { status: "Strong", diagnosis: "The overview captures the main transformation." },
            "Data Selection": { status: "Strong", diagnosis: "The selected features are relevant." },
            "Grouping Logic": { status: "Strong", diagnosis: "The report groups changes logically by area." },
            "Data Accuracy": { status: "Moderate", diagnosis: "One purpose phrase and one map verb should be safer." },
            "Comparison Precision": { status: "Strong", diagnosis: "Before and after comparisons are clear." },
            "Report Tone Control": { status: "Moderate", diagnosis: "One purpose phrase goes beyond what the map directly shows." }
          },
          top3Issues: [{
            issueType: "Task Achievement Cap",
            severity: "Critical",
            summary: "Task Achievement is capped because the overview contains inaccurate or unsafe main trends.",
            exactSentence: "Overall, the village has undergone a significant transformation from an industrial area into a larger residential and recreation suburb.",
            paragraphLocation: "Introduction, Sentence 2"
          }],
          feedbackCards: [
            {
              issueType: "Unsupported Purpose Language",
              severity: "Needs Work",
              criteria: ["Task Achievement", "Lexical Resource"],
              framework: ["Report Tone Control", "Task 1 Objective Reporting"],
              paragraphLocation: "Body Paragraph 2, Sentence 2",
              exactSentence: "To the south of these buildings, the road network has been expanded with the construction of New Lane to accommodate better access to the area.",
              sentenceFunction: "This sentence reports a map change but adds a purpose.",
              whyItLimitsBand: "The purpose phrase is not directly visible on the map, so it should be made safer.",
              kruPomDiagnosis: "This is an objective reporting issue, not a critical overview failure.",
              targetedRevision: "To the south of these buildings, New Lane was constructed as part of the expanded road network.",
              whyRevisionIsStronger: "The revision reports only the visible change.",
              studentAction: "Remove purpose language unless it is directly labelled in the map."
            },
            {
              issueType: "Map Verb Precision",
              severity: "Moderate",
              criteria: ["Task Achievement", "Lexical Resource"],
              framework: ["Data Accuracy", "Vocabulary Precision"],
              paragraphLocation: "Body Paragraph 2, Sentence 1",
              exactSentence: "Across Jordan Street, the row of townhouses has been converted into high-rise flats.",
              sentenceFunction: "This sentence compares the before and after use of one area.",
              whyItLimitsBand: "Converted into may imply the same structures were changed; replaced by is safer if the map shows a new feature.",
              kruPomDiagnosis: "This is a map-language precision repair.",
              targetedRevision: "Across Jordan Street, the row of townhouses was replaced by high-rise flats.",
              whyRevisionIsStronger: "The revision avoids implying a process not shown in the map.",
              studentAction: "Use replaced by when an old feature disappears and a new feature appears."
            },
            {
              issueType: "Lexical Collocation",
              severity: "Moderate",
              criteria: ["Lexical Resource"],
              framework: ["Vocabulary Precision"],
              paragraphLocation: "Introduction, Sentence 2",
              exactSentence: "Overall, the village has undergone a significant transformation from an industrial area into a larger residential and recreation suburb.",
              sentenceFunction: "This sentence summarizes the overall transformation.",
              whyItLimitsBand: "Residential and recreation suburb is awkward collocation, but it does not make the overview critically inaccurate.",
              kruPomDiagnosis: "Make the overview wording more natural.",
              targetedRevision: "Overall, the village changed from an industrial area into a more residential suburb with recreational facilities.",
              whyRevisionIsStronger: "The revision keeps the same visual story with safer wording.",
              studentAction: "Use residential suburb with recreational facilities."
            }
          ],
          paragraphFeedback: [{
            paragraphLocation: "Introduction",
            exactEvidence: "Overall, the village has undergone a significant transformation from an industrial area into a larger residential and recreation suburb.",
            diagnosis: "The overview is accurate but needs safer wording.",
            action: "Keep the main transformation and repair collocation."
          }],
          practicePlan: [],
          disclaimer: "Diagnostic only."
        })
      })
    };
  };

  const analysis = await analyzeWriting(langleyMapPayload);
  assert.equal(analysis.estimatedBandRange, "7.0-7.5");
  assert.equal(analysis.criteriaScores["Task Achievement"].range, "7.0-7.5");
  assert.equal(analysis.taskAchievementCapReason, "");
  assert.equal(analysis.criticalOverviewError, false);
  assert.equal(analysis.overallBandCap, "");
  assert.equal(analysis.strictModeApplied, false);
  assert.equal(analysis.capsApplied.length, 0);
  assert.ok(!/capped/i.test(analysis.mainScoreLimitingFactor));
  assert.ok(analysis.feedbackCards.some((card) => card.exactSentence.includes("to accommodate better access")));
  assert.ok(analysis.feedbackCards.some((card) => card.exactSentence.includes("converted into")));

  resetEnv();
}

async function testLangleyMapStrategyRegression() {
  resetEnv();
  const analysis = await analyzeWriting(langleyUnsafeOverviewPayload);
  const allFeedbackText = [
    analysis.mainScoreLimitingFactor,
    analysis.mostUrgentRepair,
    ...(analysis.feedbackCards || []).flatMap((card) => [
      card.exactSentence,
      card.whyItLimitsBand,
      card.kruPomDiagnosis,
      card.whyRevisionIsStronger,
      card.studentAction
    ]),
    ...(analysis.paragraphFeedback || []).flatMap((item) => [item.diagnosis, item.action]),
    ...(analysis.practicePlan || []).flatMap((item) => [item.title, item.task])
  ].filter(Boolean).join(" ");

  assert.equal(analysis.estimatedBandRange, "6.0-6.5");
  assert.ok(maxBand(analysis.criteriaScores["Task Achievement"].range) <= 6.5);
  assert.ok(allFeedbackText.includes("creates more space for facilities construction"));
  assert.ok(/visible changes|visible map changes|visible old-to-new evidence/i.test(allFeedbackText));
  assert.ok(/Old Feature -> New Feature/i.test(allFeedbackText));
  assert.ok(/location\/function/i.test(allFeedbackText));
  assert.ok(/western\/northern residential redevelopment/i.test(allFeedbackText));
  assert.ok(/central\/southern recreational changes plus eastern commercial expansion/i.test(allFeedbackText));
  assert.ok(/Avoid purpose phrases unless the map explicitly gives the reason/i.test(allFeedbackText));
  assert.ok(!analysis.disclaimer.toLowerCase().includes("official IELTS score") || analysis.disclaimer.includes("not an official IELTS score"));
}

async function testTask1MissingOverviewStillCapped() {
  resetEnv();
  const analysis = await analyzeWriting(missingOverviewMapPayload);

  assert.ok(analysis.taskAchievementCapReason.includes("Task Achievement is capped"));
  assert.equal(analysis.criticalOverviewError, true);
  assert.ok(maxBand(analysis.estimatedBandRange) <= 5.5);
  assert.ok(maxBand(analysis.criteriaScores["Task Achievement"].range) <= 5.5);
  assert.ok(analysis.capsApplied.length > 0);
}

async function testTask1InaccurateOverviewStillCapped() {
  resetEnv();
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "gpt-5.5";

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      output_text: JSON.stringify({
        taskType: "Task 1",
        visualType: "Map",
        estimatedBandRange: "6.0-6.5",
        mainScoreLimitingFactor: "The overview gives the wrong dominant transformation.",
        mostUrgentRepair: "Rewrite the overview so it says the village became mainly residential.",
        taskAchievementCapReason: "Task Achievement is capped because the overview contains inaccurate or unsafe main trends.",
        criticalOverviewError: true,
        overviewAccuracyStatus: "Incorrect",
        mainTrendRecognition: "Incorrect",
        dataSelectionQuality: "Missing key data",
        unsafeGeneralisationDetected: false,
        majorOmissionDetected: true,
        contradictionDetected: true,
        dataAccuracyRisk: "High",
        groupingLogicStatus: "Weak",
        recommendedTaskAchievementRange: "5.5-6.0",
        overallBandCap: "6.0",
        strictModeApplied: true,
        criteriaScores: {
          "Task Achievement": {
            range: "6.0-6.5",
            diagnosis: "The overview gives the wrong dominant transformation.",
            evidence: "Overall, the village became mainly commercial, with most residential facilities removed."
          },
          "Coherence & Cohesion": {
            range: "6.5",
            diagnosis: "Organization is understandable but the overview route is wrong.",
            evidence: "The old factory site was replaced by apartment blocks, and new housing was added near the main road."
          },
          "Lexical Resource": {
            range: "7.0",
            diagnosis: "Vocabulary is adequate.",
            evidence: "A public park was also introduced in the southern part of the village."
          },
          "Grammatical Range & Accuracy": {
            range: "7.0",
            diagnosis: "Grammar is controlled.",
            evidence: "A public park was also introduced in the southern part of the village."
          }
        },
        kruPomScores: {
          "Overview Quality": { status: "Critical", diagnosis: "The overview says commercial when the map shows the dominant transformation is residential." }
        },
        feedbackCards: [{
          issueType: "Wrong Dominant Transformation",
          severity: "Critical",
          criteria: ["Task Achievement"],
          framework: ["Overview Quality", "Data Accuracy"],
          paragraphLocation: "Introduction, Sentence 2",
          exactSentence: "Overall, the village became mainly commercial, with most residential facilities removed.",
          sentenceFunction: "This sentence is the overview.",
          whyItLimitsBand: "This is a critical visual misunderstanding because the overview gives the wrong dominant transformation.",
          kruPomDiagnosis: "The overview contradicts the main map story: commercial vs residential.",
          targetedRevision: "Overall, the village became mainly residential, with new housing and public space replacing older industrial features.",
          whyRevisionIsStronger: "It matches the dominant transformation.",
          studentAction: "Rewrite the overview from the safest visible main change."
        }],
        paragraphFeedback: [{
          paragraphLocation: "Introduction",
          exactEvidence: "Overall, the village became mainly commercial, with most residential facilities removed.",
          diagnosis: "The overview contradicts the main map story.",
          action: "Rewrite the overview."
        }],
        practicePlan: [],
        disclaimer: "Diagnostic only."
      })
    })
  });

  const analysis = await analyzeWriting(inaccurateOverviewMapPayload);
  assert.ok(analysis.taskAchievementCapReason.includes("Task Achievement is capped"));
  assert.equal(analysis.criticalOverviewError, true);
  assert.ok(maxBand(analysis.estimatedBandRange) <= 6.0);
  assert.ok(maxBand(analysis.criteriaScores["Task Achievement"].range) <= 6.0);
  assert.ok(analysis.capsApplied.length > 0);

  resetEnv();
}

async function testTask2Band7Calibration() {
  resetEnv();
  const analysis = await analyzeWriting(homeschoolingBand7Payload);

  assert.equal(analysis.estimatedBandRange, "7.0-7.5");
  assert.equal(analysis.criteriaScores["Task Response"].range, "7.0-7.5");
  assert.ok(["7.0", "7.0-7.5"].includes(analysis.criteriaScores["Coherence & Cohesion"].range));
  assert.equal(analysis.criteriaScores["Lexical Resource"].range, "7.0-7.5");
  assert.equal(analysis.criteriaScores["Grammatical Range & Accuracy"].range, "7.0-7.5");
  assert.equal(analysis.taskResponseCapReason, "");
  assert.equal(analysis.strictModeApplied, false);
}

async function testDuplicateSubmissionHashCache() {
  resetEnv();
  process.env.SESSION_SECRET = "test-session-secret";
  process.env.DIAGNOSTIC_STORAGE_ADAPTER = "local-json";

  const rootDir = await mkdtemp(path.join(tmpdir(), "diagnostic-duplicate-"));
  try {
    await writeFile(path.join(rootDir, "users.json"), JSON.stringify([{
      username: "student-a",
      password: "pass-a",
      displayName: "Student A",
      quota: 5,
      used: 0,
      expiryDate: "2099-12-31",
      status: "active"
    }], null, 2));
    await writeFile(path.join(rootDir, "submission-history.json"), "[]\n");

    const handler = createApiHandler({ rootDir });
    const login = await request(handler, "POST", "/api/login", { username: "student-a", password: "pass-a" });
    const cookie = login.headers["Set-Cookie"];

    const first = await request(handler, "POST", "/api/analyze", homeschoolingBand7Payload, cookie);
    assert.equal(first.statusCode, 200);
    assert.equal(first.json.user.used, 1);
    assert.equal(first.json.analysis.estimatedBandRange, "7.0-7.5");

    const whitespaceDuplicate = await request(handler, "POST", "/api/analyze", {
      ...homeschoolingBand7Payload,
      clientSubmissionId: "homeschool-band7-whitespace",
      prompt: `  ${homeschoolingBand7Payload.prompt.replace(/\s+/g, "   ")}  `,
      writing: homeschoolingBand7Payload.writing.replace(/\n\n/g, "\n\n\n").replace(/ /g, "  ")
    }, cookie);
    assert.equal(whitespaceDuplicate.statusCode, 200);
    assert.equal(whitespaceDuplicate.json.duplicateSubmission, true);
    assert.equal(whitespaceDuplicate.json.user.used, 1);
    assert.equal(whitespaceDuplicate.json.progressRecord.submissionId, first.json.progressRecord.submissionId);

    const changed = await request(handler, "POST", "/api/analyze", {
      ...homeschoolingBand7Payload,
      clientSubmissionId: "homeschool-band7-meaningful-change",
      writing: `${homeschoolingBand7Payload.writing}\n\nThis extra sentence changes the submitted essay content in a meaningful way.`
    }, cookie);
    assert.equal(changed.statusCode, 200);
    assert.equal(changed.json.duplicateSubmission, false);
    assert.equal(changed.json.user.used, 2);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
    resetEnv();
  }
}

async function testWeakTask2StillCapped() {
  resetEnv();
  const analysis = await analyzeWriting(weakTask2Payload);

  assert.ok(maxBand(analysis.estimatedBandRange) <= 6.5);
  assert.ok(maxBand(analysis.criteriaScores["Task Response"].range) <= 6.5);
  assert.equal(analysis.strictModeApplied, true);
  assert.ok(analysis.taskResponseCapReason.includes("Task Response is capped"));
}

async function testTask2LowBandCompletionAndRouteSafety() {
  resetEnv();
  const safety = analyzeTask2Safety(poonCleanWaterPayload);
  assert.ok(safety.wordCount >= 180 && safety.wordCount <= 200);
  assert.equal(safety.minimumRequiredWords, 250);
  assert.equal(safety.underLengthBy, 250 - safety.wordCount);
  assert.equal(safety.completionStatus, "unfinished");
  assert.equal(safety.unfinishedEndingDetected, true);
  assert.ok(["unclear", "contradictory"].includes(safety.detectedPosition));
  assert.equal(safety.positionConfidence, "low");
  assert.equal(safety.routeConflict, true);
  assert.equal(safety.routeIntegrity, "unstable");
  assert.equal(safety.completionIntegrity, "critically incomplete");
  assert.equal(safety.compoundSeverity, "critical interaction");
  assert.ok(safety.meaningReversingErrors.some((item) => /with charging/i.test(item.exactEvidence)));
  assert.ok(safety.meaningReversingErrors.some((item) => /free to charge/i.test(item.exactEvidence)));

  const analysis = await analyzeWriting(poonCleanWaterPayload);
  assert.equal(analysis.estimatedBandRange, "4.0-4.5");
  assert.equal(analysis.criteriaScores["Task Response"].range, "4.0");
  for (const criterion of ["Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"]) {
    assert.ok(maxBand(analysis.criteriaScores[criterion].range) <= 4.5);
  }
  assert.equal(analysis.wordCount, safety.wordCount);
  assert.equal(analysis.completionStatus, "unfinished");
  assert.equal(analysis.routeConflict, true);
  assert.equal(analysis.compoundSeverity, "critical interaction");
  assert.equal(analysis.validationClassification.fatalIntegrity.length, 0);
  assert.ok(analysis.validationClassification.diagnosticIssues.some((issue) => issue.code === "ESSAY_BELOW_MINIMUM"));
  assert.ok(analysis.validationClassification.diagnosticIssues.some((issue) => issue.code === "UNFINISHED_STUDENT_ENDING"));
  assert.ok(/below the Task 2 minimum|below the minimum/i.test(analysis.mainScoreLimitingFactor));
  assert.ok(analysis.feedbackCards.some((card) => card.revisionType === "Teacher-Guided Recommended Route"));
  assert.ok(analysis.feedbackCards.some((card) => card.revisionType === "Minimal Correction" && /with charging|free to charge/i.test(card.exactSentence)));
  assert.ok(!/detected position:\s*partly agree/i.test(JSON.stringify(analysis)));
  assert.ok(analysis.paragraphFeedback.length >= 4);

  const repeatedAction = "Before writing, write a one-line thesis route and check every paragraph against it.";
  const duplicated = {
    ...analysis,
    feedbackCards: [0, 1, 2].map((index) => ({
      ...analysis.feedbackCards[index % analysis.feedbackCards.length],
      exactSentence: analysis.feedbackCards[index % analysis.feedbackCards.length].exactSentence,
      studentAction: repeatedAction
    }))
  };
  assert.throws(() => validateReportOutput(duplicated, poonCleanWaterPayload), /output-quality check failed/i);
  assert.throws(
    () => validateReportOutput({ ...analysis, wordCount: analysis.wordCount + 1 }, poonCleanWaterPayload),
    (error) => error.validationDetails?.some((issue) => issue.code === "WORD_COUNT_METADATA_INTEGRITY" && issue.severity === "fatal_integrity")
  );

  const rootScript = await readFile(new URL("../script.js", import.meta.url), "utf8");
  const previewScript = await readFile(new URL("../netlify-static-preview/script.js", import.meta.url), "utf8");
  for (const source of [rootScript, previewScript]) {
    assert.ok(source.includes("Completion Status"));
    assert.ok(source.includes("Revision Type"));
    assert.ok(source.includes("Position and Route"));
  }
}

async function testUnderlengthProviderPartialFeedbackIsRepaired() {
  resetEnv();
  const localAnalysis = await analyzeWriting(poonCleanWaterPayload);
  const providerOutput = {
    ...localAnalysis,
    paragraphFeedback: [localAnalysis.paragraphFeedback[0]]
  };
  delete providerOutput.validationClassification;

  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "test-model";
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ output_text: JSON.stringify(providerOutput) })
  });

  try {
    const analysis = await analyzeWriting({
      ...poonCleanWaterPayload,
      clientSubmissionId: "task2-underlength-provider-partial-feedback"
    });
    assert.equal(analysis.wordCountStatus, "below_minimum");
    assert.equal(analysis.wordCount, 190);
    assert.equal(analysis.wordShortfall, 60);
    assert.equal(analysis.paragraphFeedback.length, 4);
    assert.deepEqual(
      analysis.paragraphFeedback.map((item) => item.paragraphLocation),
      ["Introduction", "Body Paragraph 1", "Body Paragraph 2", "Conclusion"]
    );
    assert.equal(analysis.validationClassification.fatalIntegrity.length, 0);
    assert.ok(analysis.validationClassification.diagnosticIssues.some((issue) => issue.code === "ESSAY_BELOW_MINIMUM"));
  } finally {
    resetEnv();
  }
}

async function testTask2RouteTypeAndCompletionRegressions() {
  const completedPoon = {
    ...poonCleanWaterPayload,
    clientSubmissionId: "task2-low-band-completed-ending-1",
    writing: poonCleanWaterPayload.writing.replace(
      "For conclusion, I consequently agree with this idea. Due to the fact that I",
      "In conclusion, I agree that a basic water supply should be free because it protects public health and reduces essential household costs."
    )
  };
  const completedSafety = analyzeTask2Safety(completedPoon);
  assert.equal(completedSafety.unfinishedEndingDetected, false);
  assert.equal(completedSafety.seriousInteraction, true);
  resetEnv();
  const completedAnalysis = await analyzeWriting(completedPoon);
  assert.ok(maxBand(completedAnalysis.estimatedBandRange) <= 5.0);

  const partlyAgree = analyzeTask2Safety(task2Payload);
  assert.equal(partlyAgree.routeConflict, false);
  assert.match(partlyAgree.detectedPosition, /partly agree/);

  const discussBothViews = analyzeTask2Safety(weakTask2Payload);
  assert.equal(discussBothViews.essayRoute, "discuss-both-views");
  assert.equal(discussBothViews.routeConflict, false);

  const outweigh = analyzeTask2Safety(homeschoolingBand7Payload);
  assert.equal(outweigh.essayRoute, "outweigh");
  assert.equal(outweigh.routeConflict, false);
  assert.equal(outweigh.criticalInteraction, false);

  const band5Complete = {
    ...weakTask2Payload,
    writing: padTask2ToWordCount(weakTask2Payload.writing, 260)
  };
  const band5Safety = analyzeTask2Safety(band5Complete);
  assert.equal(band5Safety.completionStatus, "complete");
  assert.equal(band5Safety.criticalInteraction, false);

  const band6Complete = {
    ...task2Payload,
    writing: padTask2ToWordCount(task2Payload.writing, 255)
  };
  const band6Safety = analyzeTask2Safety(band6Complete);
  assert.equal(band6Safety.completionStatus, "complete");
  assert.equal(band6Safety.criticalInteraction, false);
  assert.equal(band6Safety.seriousInteraction, false);

  const slightUnderLength = {
    ...task2Payload,
    writing: padTask2ToWordCount(task2Payload.writing, 242)
  };
  const slightSafety = analyzeTask2Safety(slightUnderLength);
  assert.equal(slightSafety.wordCount, 242);
  assert.equal(slightSafety.completionStatus, "mostly complete");
  assert.equal(slightSafety.criticalInteraction, false);
  assert.equal(slightSafety.seriousInteraction, false);

  const missingDirectAnswer = {
    taskType: "Task 2",
    essayType: "Direct Question",
    prompt: "Why do many people move to large cities? What problems can this cause?",
    writing: [
      "Many people move to large cities for employment, and this essay explains the main reason for that choice.",
      "The principal reason is access to a wider labour market. Large companies concentrate in urban centres, so applicants can pursue more roles and develop specialist careers. For example, graduates often relocate because regional towns offer fewer professional positions. This concentration of employers therefore makes cities attractive to ambitious workers.",
      "In conclusion, access to employment is the main reason why many people relocate to large cities."
    ].join("\n\n")
  };
  const directSafety = analyzeTask2Safety(missingDirectAnswer);
  assert.equal(directSafety.directQuestionMissingPart, true);
  assert.equal(directSafety.seriousInteraction, true);
}

function padTask2ToWordCount(writing, target) {
  const paragraphs = writing.split(/\n\s*\n/);
  const current = countWords(writing);
  assert.ok(current <= target, `Task 2 base text has ${current} words, above target ${target}.`);
  const filler = Array.from({ length: target - current }, (_, index) => `development${index + 1}`).join(" ");
  paragraphs[Math.max(1, paragraphs.length - 2)] += ` ${filler}.`;
  const result = paragraphs.join("\n\n");
  assert.equal(countWords(result), target);
  return result;
}

function mockAnalyzeError(status, body) {
  globalThis.fetch = async () => ({
    ok: false,
    status,
    text: async () => body
  });
  return analyzeWriting(task2Payload);
}

function maxBand(value) {
  const numbers = String(value || "").match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  return numbers.length ? Math.max(...numbers) : Number.NaN;
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
  delete process.env.TEACHER_DAILY_SAFETY_LIMIT;
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
