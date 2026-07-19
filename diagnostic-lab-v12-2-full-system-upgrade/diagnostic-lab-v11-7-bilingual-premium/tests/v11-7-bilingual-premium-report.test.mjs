import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { buildPrompt } from "../services/promptBuilder.js";
import { createSubmissionHash, createStudentWorkFingerprint } from "../services/apiRouter.js";

const prompt = [
  "Towns and cities should be divided into zones so that all the schools are in one area, all the shopping malls are located together and all the industrial sites are situated close to each other.",
  "To what extent do you agree that urban areas should be split into distinct zones?"
].join("\n\n");

const writing = [
  "Some people may argue that towns and cities should be separated into zones, so all the same places are in the same area. However, I strongly disagree with the statement due to the lack of travel accessibility and traffic congestion.",
  "First of all, the clusterization of a specific place could lead to the difficulty of traveling. Every family is living in different places and distances, which could be very far away from their house, so it would be very difficult to travel through long distance. For instance, a student's house is very far away from his school, and it takes 3 hours to arrive there, so he needs to wake up at 5AM every morning, which lowers his energy and concentration in the class, resulting in bad grades. Therefore, when a certain place is clustered in one area, some people might encounter an issue of traveling,",
  "Furthermore, there would be more traffic congestion when a specific place is divided into a zone. Some places attract more people in some period of time, which could create a heavy traffic jam. For example, restaurants or shopping malls attract more people at breakfast, lunch, and dinner time; hence, people will be moving in the same direction at the same time, resulting in a large traffic congestion.",
  "In conclusion, I firmly believe that specific places like towns and cities should not be divided into zones, thus all the same places are in one area, since this could contribute to the difficulty in traveling and the congestion of traffic."
].join("\n\n");

const commonPayload = {
  taskType: "Task 2",
  essayType: "Opinion Essay",
  prompt,
  writing,
  targetBand: "7.0",
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
};

const [englishReport, thaiReport] = await Promise.all([
  analyzeWriting({ ...commonPayload, reportLanguage: "en" }),
  analyzeWriting({ ...commonPayload, reportLanguage: "th" })
]);

assert.equal(englishReport.reportLanguage, "en");
assert.equal(thaiReport.reportLanguage, "th");
assert.equal(englishReport.estimatedBandRange, "6.0");
assert.equal(thaiReport.estimatedBandRange, englishReport.estimatedBandRange);
assert.deepEqual(
  Object.fromEntries(Object.entries(thaiReport.criteriaScores).map(([name, value]) => [name, value.range])),
  Object.fromEntries(Object.entries(englishReport.criteriaScores).map(([name, value]) => [name, value.range]))
);
assert.equal(englishReport.detectedPosition, "strongly disagree");
assert.equal(thaiReport.detectedPosition, englishReport.detectedPosition);
assert.deepEqual(
  thaiReport.feedbackCards.map((card) => card.paragraphLocation),
  englishReport.feedbackCards.map((card) => card.paragraphLocation)
);

const thaiPattern = /[ก-๙]/u;
assert.doesNotMatch(englishReport.mainScoreLimitingFactor, thaiPattern);
assert.match(thaiReport.mainScoreLimitingFactor, thaiPattern);
assert.doesNotMatch(englishReport.criteriaScores["Task Response"].diagnosis, thaiPattern);
assert.match(thaiReport.criteriaScores["Task Response"].diagnosis, thaiPattern);
assert.match(thaiReport.kruPomScores["Thesis Route Clarity"].diagnosis, thaiPattern);
assert.match(thaiReport.feedbackCards[0].kruPomDiagnosis, thaiPattern);
assert.match(thaiReport.practicePlan[1].task, /แต่ละ Body|กลไก/u);
assert.match(englishReport.practicePlan[1].task, /Rewrite each body explanation/i);

const thesisCard = englishReport.feedbackCards.find((card) => /Thesis Route/.test(card.issueType));
assert.ok(thesisCard);
assert.match(thesisCard.targetedRevision, /strongly disagree.*travel difficulties.*traffic congestion/i);
const conclusionCard = englishReport.feedbackCards.find((card) => /Conclusion Precision/.test(card.issueType));
assert.ok(conclusionCard);
assert.match(conclusionCard.targetedRevision, /strongly disagree.*urban areas should be divided.*travel difficulties.*traffic congestion/i);
assert.equal(conclusionCard.revisionIntegrity.pass, true);
assert.ok(englishReport.feedbackCards.every((card) => card.revisionIntegrity?.pass));
assert.ok(thaiReport.feedbackCards.every((card) => card.revisionIntegrity?.pass));
assert.ok(thaiReport.feedbackCards.every((card, index) => card.targetedRevision === englishReport.feedbackCards[index].targetedRevision));

const englishPrompt = buildPrompt({ ...commonPayload, reportLanguage: "en" });
const thaiPrompt = buildPrompt({ ...commonPayload, reportLanguage: "th" });
assert.match(englishPrompt, /REPORT LANGUAGE: ENGLISH/);
assert.match(englishPrompt, /Do not include Thai explanatory text/);
assert.match(thaiPrompt, /REPORT LANGUAGE: THAI/);
assert.match(thaiPrompt, /natural, professional Thai/);
assert.match(thaiPrompt, /Targeted Revision.*IELTS-ready English/s);

const hashPayload = {
  taskType: "Task 2",
  publicEssayType: "Opinion Essay",
  internalEssaySubtype: "agree_disagree",
  prompt,
  writing,
  targetBand: "7.0",
  options: commonPayload.options
};
const enHash = createSubmissionHash("teacher", { ...hashPayload, reportLanguage: "en" });
const thHash = createSubmissionHash("teacher", { ...hashPayload, reportLanguage: "th" });
assert.notEqual(enHash, thHash, "English and Thai reports should be separate exact report variants.");
assert.equal(
  createStudentWorkFingerprint("teacher", { ...hashPayload, reportLanguage: "en" }),
  createStudentWorkFingerprint("teacher", { ...hashPayload, reportLanguage: "th" }),
  "Language variants of the same essay must remain one student submission group."
);

const [rootHtml, previewHtml, rootScript, rootCss, studentViewModel, reportTemplate, pdfRenderer] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../netlify-static-preview/index.html", import.meta.url), "utf8"),
  readFile(new URL("../script.js", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8"),
  readFile(new URL("../reports/studentReportViewModel.js", import.meta.url), "utf8"),
  readFile(new URL("../reports/studentReportTemplate.js", import.meta.url), "utf8"),
  readFile(new URL("../reports/pdfRenderer.js", import.meta.url), "utf8")
]);
for (const html of [rootHtml, previewHtml]) {
  assert.match(html, /name="reportLanguage" value="en"/);
  assert.match(html, /name="reportLanguage" value="th"/);
  assert.match(html, /diagnostic-v12-student-report-architecture/);
}
assert.match(rootScript, /const REPORT_COPY = Object\.freeze/);
assert.match(rootScript, /reportLanguage: selectedReportLanguage\(\)/);
assert.match(rootScript, /\/api\/reports\/\$\{encodeURIComponent\(id\)\}\/pdf/);
assert.doesNotMatch(rootScript, /window\.print\s*\(|win\.print\s*\(|function renderPrintReport/);
assert.match(rootCss, /\.report-language-selector/);
assert.match(studentViewModel, /StudentReportViewModel\.v12/);
assert.match(studentViewModel, /THAI_DISCLAIMER/);
assert.match(reportTemplate, /renderStudentReportDocument/);
assert.match(reportTemplate, /document\.fonts\.ready/);
assert.match(pdfRenderer, /generateStudentReportPdf/);
assert.match(pdfRenderer, /extractPdfTextWithPdfJs/);

console.log("V12 bilingual report: language selection, Thai/English output separation, score invariants, teaching-aligned revisions, shared student view model, and server PDF architecture passed.");
