import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

async function main() {
  await testPackageCopyShows10Analyses();
  await testApiFlow();
  await testRoleQuotaAdminSecurity();
  await testServerlessStorageSelection();
  await testProviderErrorClassification();
  await testStructuredOutputAndEvidenceGuard();
  await testProductionRequiresFullEngine();
  await testServerlessRequiresFullEngine();
  await testProblemSolutionRubricPrompt();
  await testTask1IntroParaphraseGuidance();
  await testTask1MixedGraphRevisionQualityGuard();
  await testTask1LineGraphRevisionQualityGuard();
  await testTask1HighBandStrategyPrompt();
  await testTask1MapModerateIssuesDoNotCreateCriticalCap();
  await testLangleyMapStrategyRegression();
  await testTask1MissingOverviewStillCapped();
  await testTask1InaccurateOverviewStillCapped();
  await testTask2Band7Calibration();
  await testDuplicateSubmissionHashCache();
  await testWeakTask2StillCapped();
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
    const teacherFirst = await request(handler, "POST", "/api/analyze", {
      ...task2Payload,
      clientSubmissionId: "role-teacher-success"
    }, teacherCookie);
    assert.equal(teacherFirst.statusCode, 200);
    assert.equal(teacherFirst.json.user.quotaMode, "unlimited");
    assert.equal(teacherFirst.json.user.remainingQuota, null);
    assert.equal(teacherFirst.json.user.dailySafetyRemaining, 0);

    const teacherSecond = await request(handler, "POST", "/api/analyze", {
      ...task2Payload,
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
  assert.ok(introCard.targetedRevision.includes("The line graph illustrates changes in"));
  assert.ok(introCard.targetedRevision.includes("car and bus users"));
  assert.ok(introCard.targetedRevision.includes("from 2000 to 2020"));
  assert.ok(!/shows changes over time/i.test(introCard.targetedRevision));
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
