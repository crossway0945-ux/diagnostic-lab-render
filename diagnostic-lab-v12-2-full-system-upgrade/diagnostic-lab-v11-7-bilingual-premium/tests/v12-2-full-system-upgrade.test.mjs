import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { buildStudentReportViewModel } from "../reports/studentReportViewModel.js";

const runtimeFiles = [
  "domain/canonicalAnalysis.js",
  "domain/task2Safety.js",
  "domain/task2DiagnosticIntegrity.js",
  "services/aiAnalyzer.js",
  "services/promptBuilder.js",
  "reports/revisionValidation.js"
];
const runtimeSource = (await Promise.all(runtimeFiles.map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")))).join("\n");
assert.doesNotMatch(runtimeSource, /localizeUrbanZoningCard|isZoningOpinion/);
assert.doesNotMatch(runtimeSource, /clusterization of a specific place could lead to the difficulty of traveling/i);
assert.doesNotMatch(runtimeSource, /if all major shopping malls were concentrated in one district/i);

const prompt = "Towns and cities should be divided into zones so that schools, shopping malls and industrial sites are located in separate designated areas. To what extent do you agree or disagree?";
const writing = [
  "Some people may argue that towns and cities should be separated into zones, so all the same places are in the same area. However, I strongly disagree with the statement due to the lack of travel accessibility and traffic congestion.",
  "First of all, the clusterization of a specific place could lead to the difficulty of traveling. Every family is living in different places and distances, which could be very far away from their house, so it would be very difficult to travel through long distance. For instance, a student's house is very far away from his school, and it takes 3 hours to arrive there, so he needs to wake up at 5AM every morning, which lowers his energy and concentration in the class, resulting in bad grades. Therefore, when a certain place is clustered in one area, some people might encounter an issue of traveling,",
  "Furthermore, there would be more traffic congestion when a specific place is divided into a zone. Some places attract more people in some period of time, which could create a heavy traffic jam. For example, restaurants or shopping malls attract more people at breakfast, lunch, and dinner time; hence, people will be moving in the same direction at the same time, resulting in a large traffic congestion.",
  "In conclusion, I firmly believe that specific places like towns and cities should not be divided into zones, thus all the same places are in one area, since this could contribute to the difficulty in traveling and the congestion of traffic."
].join("\n\n");

const en = await analyzeWriting({ taskType: "Task 2", essayType: "Opinion Essay", prompt, writing, reportLanguage: "en", targetBand: "7.0" });
const th = await analyzeWriting({ taskType: "Task 2", essayType: "Opinion Essay", prompt, writing, reportLanguage: "th", targetBand: "7.0" });
assert.equal(en.estimatedBandRange, "6.0");
assert.equal(en.conclusionClosureStatus, "Moderate");
assert.equal(en.feedbackCards.length, 10);
assert.ok(en.feedbackCards.some((card) => card.paragraphLocation === "Body Paragraph 2, Sentence 2"));
assert.ok(en.feedbackCards.some((card) => card.paragraphLocation === "Conclusion, Sentence 1"));
assert.deepEqual(th.feedbackCards.map((card) => card.paragraphLocation), en.feedbackCards.map((card) => card.paragraphLocation));
assert.deepEqual(th.feedbackCards.map((card) => card.targetedRevision), en.feedbackCards.map((card) => card.targetedRevision));
for (const card of en.feedbackCards) {
  assert.ok(writing.includes(card.exactSentence));
  assert.equal(card.revisionIntegrity?.pass, true);
  assert.equal("_integrityGenerated" in card, false);
}
assert.doesNotMatch(JSON.stringify(en), /restaurants?[^.]{0,120}(not in|absent from|outside) the prompt/i);

const unrelated = await analyzeWriting({
  taskType: "Task 2", essayType: "Opinion Essay", reportLanguage: "en", targetBand: "7.0",
  prompt: "Some people believe governments should spend more money on space exploration than on public services. To what extent do you agree or disagree?",
  writing: [
    "Some people support greater spending on space exploration. I disagree because public health and education have more immediate effects on citizens.",
    "First, hospitals require stable funding to provide treatment and reduce waiting times. For example, additional investment can allow public hospitals to employ more doctors and serve patients more efficiently.",
    "Second, education spending gives young people practical skills and improves their future employment prospects. Better-funded schools can also reduce inequality between communities.",
    "In conclusion, I disagree with prioritising space exploration because health care and education produce more direct public benefits."
  ].join("\n\n")
});
assert.doesNotMatch(JSON.stringify(unrelated), /zoning|shopping malls|industrial sites|education district|designated zone/i);

for (const fixture of [
  {
    essayType: "Discuss Both Views Essay",
    prompt: "Some people think university should be free, while others think students should pay. Discuss both views and give your opinion.",
    writing: "Some people support free university because it expands access, while others believe fees protect quality. This essay discusses both views and argues that targeted public funding is the fairest approach.\n\nFree tuition can enable capable students from low-income families to study.\n\nHowever, full fees can provide stable resources and reduce pressure on taxpayers.\n\nIn conclusion, both positions have merit, but targeted support is preferable."
  },
  {
    essayType: "Problem & Solution Essay",
    prompt: "Traffic congestion is increasing in many cities. What problems does this cause and what solutions can be introduced?",
    writing: "Traffic congestion causes lost time and pollution. Governments can improve public transport and manage road demand.\n\nLong delays reduce productivity and vehicle emissions damage air quality.\n\nReliable rail services and congestion charging can reduce unnecessary car journeys.\n\nIn conclusion, congestion creates economic and environmental problems that require transport and demand-management solutions."
  },
  {
    essayType: "Advantages & Disadvantages Essay",
    prompt: "What are the advantages and disadvantages of working from home?",
    writing: "Working from home offers flexibility but can reduce collaboration.\n\nEmployees save commuting time and can organise their schedules more efficiently.\n\nHowever, isolation and weaker communication may make teamwork difficult.\n\nIn conclusion, remote work provides flexibility but also creates coordination challenges."
  },
  {
    essayType: "Direct Question Essay",
    prompt: "Why do people move to large cities, and is this a positive development?",
    writing: "People move to large cities for jobs and education, but I believe the trend is only partly positive.\n\nCities offer larger labour markets and specialised universities.\n\nHowever, rapid migration can increase housing costs and pressure on services.\n\nIn conclusion, opportunity attracts migrants, although the wider development is mixed."
  }
]) {
  const result = await analyzeWriting({ taskType: "Task 2", reportLanguage: "en", targetBand: "7.0", ...fixture });
  assert.equal(result.taskType, "Task 2");
  assert.ok(result.feedbackCards.length > 0);
  assert.ok(result.feedbackCards.every((card) => fixture.writing.includes(card.exactSentence)));
}

const studentModel = buildStudentReportViewModel({ ...en, submissionGroupId: "secret", reportVersionId: "secret", engineVersion: "secret" });
const serialized = JSON.stringify(studentModel);
assert.doesNotMatch(serialized, /submissionGroupId|reportVersionId|engineVersion|_integrityGenerated/);
console.log("V12.2 full-system upgrade passed: generic Task 2 engine, exact evidence matching, calibrated Sun fixture, task-family coverage, bilingual parity, revision fidelity, and strict Student/Admin boundary.");
