// Stage-0 scope control: global prompt obligations and neutral tester-facing copy.
// All prompts use synthetic vocabulary that does not occur in the Eva, Evin or Sun regressions.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { classifyTask1Visual } from "../domain/task1Classification.js";
import { buildStudentReportViewModel } from "../domain/reportViewModels.js";
import { classifyTask2Prompt } from "../domain/task2Safety.js";

process.env.DIAGNOSTIC_REQUIRE_FULL_ENGINE = "false";
delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;

const task2Matrix = [
  {
    label: "Opinion",
    prompt: "Employers should permit compressed workweeks. To what extent do you agree or disagree?",
    family: "opinion",
    subtype: "standard",
    stance: true
  },
  {
    label: "Discuss Both Views",
    prompt: "Some people favour specialist degrees, while others prefer broad programmes. Discuss both views and give your opinion.",
    family: "discuss-both-views",
    subtype: "standard",
    stance: true
  },
  {
    label: "Problem and Solution",
    prompt: "Night-time noise creates difficulties in residential districts. What problems does this cause and what measures should councils take?",
    family: "problem-solution",
    subtype: "standard",
    stance: false
  },
  {
    label: "Causes and Solutions",
    prompt: "Why is household food waste increasing? What can be done to reduce it?",
    family: "problem-solution",
    subtype: "causes-solutions",
    stance: false
  },
  {
    label: "Advantages and Disadvantages",
    prompt: "What are the advantages and disadvantages of remote medical consultations?",
    family: "advantages-disadvantages",
    subtype: "standard",
    stance: false
  },
  {
    label: "Outweigh",
    prompt: "Do the disadvantages of cashless transport outweigh the advantages?",
    family: "advantages-disadvantages",
    subtype: "outweigh",
    stance: true
  },
  {
    label: "Two-Part Question",
    prompt: "Why do some residents avoid public libraries, and should municipal leaders respond to this trend?",
    family: "direct-question",
    subtype: "multi-question",
    stance: true,
    obligations: 2,
    promptSubtype: "hybrid"
  },
  {
    label: "Positive or Negative Development",
    prompt: "More adults are changing careers later in life. Is this a positive or negative development?",
    family: "direct-question",
    subtype: "positive-negative-development",
    stance: true
  },
  {
    label: "Direct Question variant",
    prompt: "What motivates residents to volunteer, and how does volunteering benefit neighbourhoods?",
    family: "direct-question",
    subtype: "multi-question",
    stance: false,
    obligations: 2
  },
  {
    label: "Hybrid cause plus outweigh",
    prompt: "Why has international tourism expanded, and do its advantages outweigh its disadvantages?",
    family: "direct-question",
    subtype: "multi-question",
    stance: true,
    obligations: 2,
    promptSubtype: "hybrid",
    comparisonRequired: true
  }
];

for (const fixture of task2Matrix) {
  const result = classifyTask2Prompt({
    taskType: "Task 2",
    essayType: fixture.family === "direct-question" ? "Direct Question" : "Not Sure / Auto-detect",
    prompt: fixture.prompt
  });
  assert.equal(result.essayType, fixture.family, `${fixture.label}: public family`);
  assert.equal(result.internalSubtype, fixture.subtype, `${fixture.label}: internal subtype`);
  assert.equal(result.stanceRequired, fixture.stance, `${fixture.label}: stance requirement`);
  assert.equal(result.promptObligations.length, fixture.obligations || result.promptObligations.length, `${fixture.label}: obligation count`);
  if (fixture.promptSubtype) assert.equal(result.promptSubtype, fixture.promptSubtype, `${fixture.label}: prompt subtype`);
  if (fixture.comparisonRequired) assert.equal(result.comparisonRequired, true, `${fixture.label}: comparison required`);
}

const oppositeOutweigh = classifyTask2Prompt({
  taskType: "Task 2",
  prompt: "Do the advantages of automated farms outweigh the disadvantages?"
});
assert.equal(oppositeOutweigh.outweighDirection, "advantages", "opposite outweigh polarity remains explicit");

const plainTwoSided = classifyTask2Prompt({
  taskType: "Task 2",
  prompt: "What are the advantages and disadvantages of community-owned energy?"
});
assert.equal(plainTwoSided.promptParts.length, 1, "a compound object is not split into two questions");

const task1Matrix = [
  ["The line graph tracks commuter numbers from 1995 to 2025.", "Line Graph"],
  ["The bar chart compares recycling rates in six districts.", "Bar Chart"],
  ["The pie charts show household energy use in 2001 and 2021.", "Pie Chart"],
  ["The table presents figures for five employment sectors.", "Table"],
  ["The line graph and table compare demand and capacity over three decades.", "Mixed / Combination Visuals"],
  ["The maps compare a harbour before and after redevelopment.", "Map"],
  ["The diagram shows the stages by which seaweed is processed into packaging.", "Diagram"],
  ["The diagram shows the components of a geothermal heating mechanism.", "Diagram"],
  ["The bar chart compares four regions in 2000, 2010 and 2020.", "Bar Chart"]
];
for (const [prompt, expected] of task1Matrix) {
  assert.equal(classifyTask1Visual({ taskType: "Task 1", prompt }).publicVisualType, expected, prompt);
}

const hybridPrompt = task2Matrix.at(-1).prompt;
const hybridWriting = [
  "International tourism has expanded because transport is cheaper and digital booking is widely available. Although crowding can place pressure on famous sites, I believe the employment and cultural advantages of tourism outweigh these disadvantages.",
  "The main reason for the expansion is easier access. Budget airlines connect secondary cities, while booking platforms let travellers compare routes and reserve accommodation quickly. These services reduce the time and uncertainty involved in planning an overseas journey. As a result, destinations that were once difficult to reach can now attract visitors throughout the year.",
  "The advantages are stronger than the disadvantages because visitor spending supports local employment and helps communities maintain museums, guides and public spaces. Crowding can raise waste levels during peak months, but timed entry and transport planning can control this pressure. The lasting income and cultural exchange therefore matter more than the manageable seasonal disruption.",
  "In conclusion, tourism has grown because travel and planning have become easier. Its advantages outweigh its disadvantages because stable local income and cultural exchange provide broader benefits than the seasonal pressures that destinations can manage."
].join("\n\n");
const hybridAnalysis = await analyzeWriting({
  taskType: "Task 2",
  essayType: "Direct Question",
  targetBand: "7.0",
  reportLanguage: "en",
  clientSubmissionId: "synthetic-stage0-hybrid",
  prompt: hybridPrompt,
  writing: hybridWriting,
  options: { usedTemplate: false, strictFeedback: true, patternRisk: false }
});
assert.equal(hybridAnalysis.canonicalAnalysis.taskRequirements.promptObligations.length, 2);
assert.equal(hybridAnalysis.canonicalAnalysis.taskRequirements.stanceRequired, true);
assert.equal(hybridAnalysis.routeAssessment.requirements.find((item) => item.id === "question-2")?.status, "adequately_developed");
assert.equal(hybridAnalysis.routeAssessment.missingRequirements.length, 0);
assert.equal(hybridAnalysis.feedbackIntegrity.paragraphMapAudit.pass, true);
assert.equal(hybridAnalysis.feedbackIntegrity.paragraphMapAudit.paragraphCount, 4);

const studentView = buildStudentReportViewModel(hybridAnalysis);
const studentText = JSON.stringify(studentView);
assert.doesNotMatch(studentText, /\b(?:issue|development)-[a-z0-9-]+\b|submissionGroupId|reportVersionId|parentReportId/i);
assert.doesNotMatch(studentText, /(?:private\s+)?early\s+access|early[ -]?bird|founder(?: tutor)? plan|founding pilot|future launch price|\b\d{1,3}(?:,\d{3})?\s*THB\b/i);

const [indexHtml, scriptSource, apiSource] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../script.js", import.meta.url), "utf8"),
  readFile(new URL("../services/apiRouter.js", import.meta.url), "utf8")
]);
const visibleIndexText = indexHtml
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();
const projectedRuntimeMessages = [scriptSource, apiSource].flatMap((source) =>
  [...source.matchAll(/const\s+(?:ACCESS_EXPIRED_MESSAGE|QUOTA_USED_MESSAGE)\s*=\s*"([^"]+)"/g)]
    .map((match) => match[1])
);
assert.equal(projectedRuntimeMessages.length, 4, "client and API access messages remain explicitly covered");
const runtimeFacingText = [visibleIndexText, ...projectedRuntimeMessages].join("\n");
assert.match(visibleIndexText, /Internal Validation Access/);
assert.match(visibleIndexText, /Access by invitation/);
assert.match(visibleIndexText, /Diagnostic estimate only/);
assert.match(scriptSource, /function displayAccessPlan/);
assert.match(scriptSource, /Internal Validation Access/);
assert.doesNotMatch(runtimeFacingText, /(?:private\s+)?early\s+access|early[ -]?bird|founder(?: tutor)? plan|founding pilot|future launch price|approval\/payment|\b\d{1,3}(?:,\d{3})?\s*THB\b/i);

console.log("V12.9.8 Stage-0 control: global Task 2 obligations, Task 1 family coverage, hybrid judgement preservation, neutral access copy, Student View boundary and paragraph-map integrity passed.");
