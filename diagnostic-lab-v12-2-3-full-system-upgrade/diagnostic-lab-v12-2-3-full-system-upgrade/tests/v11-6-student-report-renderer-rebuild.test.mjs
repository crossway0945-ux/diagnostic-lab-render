import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { buildServerProgressSummary } from "../services/apiRouter.js";
import { buildStudentReportViewModel, getThaiDisclaimer } from "../reports/studentReportViewModel.js";
import { buildAdminReportQAViewModel } from "../reports/adminReportQAViewModel.js";
import { renderStudentReportDocument } from "../reports/studentReportTemplate.js";
import { closePdfRendererBrowser, generateStudentReportPdf } from "../reports/pdfRenderer.js";
import { findForbiddenUnicode } from "../reports/textSanitization.js";
import { lockedRevisionCount, validateRevision } from "../reports/revisionValidation.js";

const PROMPT = [
  "Towns and cities should be divided into zones so that all the schools are in one area, all the shopping malls are located together and all the industrial sites are situated close to each other.",
  "To what extent do you agree that urban areas should be split into distinct zones?"
].join("\n\n");

const WRITING = [
  "Some people may argue that towns and cities should be separated into zones, so all the same places are in the same area. However, I strongly disagree with the statement due to the lack of travel accessibility and traffic congestion.",
  "First of all, the clusterization of a specific place could lead to the difficulty of traveling. Every family is living in different places and distances, which could be very far away from their house, so it would be very difficult to travel through long distance. For instance, a student's house is very far away from his school, and it takes 3 hours to arrive there, so he needs to wake up at 5AM every morning, which lowers his energy and concentration in the class, resulting in bad grades. Therefore, when a certain place is clustered in one area, some people might encounter an issue of traveling,",
  "Furthermore, there would be more traffic congestion when a specific place is divided into a zone. Some places attract more people in some period of time, which could create a heavy traffic jam. For example, restaurants or shopping malls attract more people at breakfast, lunch, and dinner time; hence, people will be moving in the same direction at the same time, resulting in a large traffic congestion.",
  "In conclusion, I firmly believe that specific places like towns and cities should not be divided into zones, thus all the same places are in one area, since this could contribute to the difficulty in traveling and the congestion of traffic."
].join("\n\n");

const PAYLOAD = {
  taskType: "Task 2",
  essayType: "Opinion Essay",
  prompt: PROMPT,
  writing: WRITING,
  targetBand: "7.0",
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
};

const EXPECTED_LOCATIONS = [
  "Introduction, Sentence 1",
  "Introduction, Sentence 2",
  "Body Paragraph 1, Sentence 1",
  "Body Paragraph 1, Sentence 2",
  "Body Paragraph 1, Sentence 3",
  "Body Paragraph 1, Sentence 4",
  "Body Paragraph 2, Sentence 1",
  "Body Paragraph 2, Sentence 2",
  "Body Paragraph 2, Sentence 3",
  "Conclusion, Sentence 1"
];

const FORBIDDEN_INTERNAL = [
  /Ctrl\s*\+\s*M/i,
  /submissionGroupId/i,
  /reportVersionId/i,
  /parentReportId/i,
  /inputFingerprint/i,
  /studentWorkFingerprint/i,
  /response fingerprint/i,
  /prompt fingerprint/i,
  /engine version/i,
  /rubric version/i,
  /legacy-[a-f0-9]/i,
  /Report-Version and Progress Proof/i,
  /implementation proof/i,
  /internal QA/i,
  /_integrityGenerated/i
];

const STUDENT_MODEL_KEYS = [
  "schema", "language", "copy", "reportHeader", "studentMetadata", "estimatedBandRange",
  "executiveSummary", "completionStatus", "positionAndRoute", "criteriaBreakdown",
  "frameworkBreakdown", "topIssues", "detailedFeedback", "repairPlan", "progressSummary",
  "disclaimer", "footer"
];

const tempRoot = await mkdtemp(path.join(tmpdir(), "diagnostic-v12-renderer-test-"));
try {
  const [englishAnalysis, thaiAnalysis] = await Promise.all([
    analyzeWriting({ ...PAYLOAD, reportLanguage: "en" }),
    analyzeWriting({ ...PAYLOAD, reportLanguage: "th" })
  ]);

  assert.equal(englishAnalysis.estimatedBandRange, "6.0");
  assert.equal(englishAnalysis.detectedPosition, "strongly disagree");
  assert.equal(englishAnalysis.conclusionClosureStatus, "Moderate");
  assert.equal(thaiAnalysis.estimatedBandRange, englishAnalysis.estimatedBandRange);
  assert.deepEqual(englishAnalysis.feedbackCards.map((card) => card.paragraphLocation), EXPECTED_LOCATIONS);
  assert.deepEqual(thaiAnalysis.feedbackCards.map((card) => card.paragraphLocation), EXPECTED_LOCATIONS);

  for (const card of englishAnalysis.feedbackCards) {
    assert.ok(WRITING.includes(card.exactSentence), `Evidence is not verbatim: ${card.paragraphLocation}`);
    assert.ok(card.targetedRevision && card.targetedRevision !== card.exactSentence, `Missing usable revision: ${card.paragraphLocation}`);
    assert.equal(card.revisionIntegrity?.pass, true, `Revision integrity failed: ${card.paragraphLocation}`);
    const validation = validateRevision({
      original: card.exactSentence,
      revised: card.targetedRevision,
      revisionType: card.revisionType,
      diagnosedIssues: card.issueType
    });
    assert.equal(validation.pass, true, `Independent revision validation failed: ${card.paragraphLocation}`);
    assert.deepEqual(validation.introducedIssues, [], `Unsupported revision meaning: ${card.paragraphLocation}`);
  }
  assert.ok(englishAnalysis.feedbackCards.some((card) => card.paragraphLocation === "Body Paragraph 2, Sentence 2"), "Body 2 mechanism sentence was skipped.");
  assert.ok(englishAnalysis.feedbackCards.some((card) => card.paragraphLocation === "Conclusion, Sentence 1"), "Conclusion evidence was skipped.");
  assert.doesNotMatch(JSON.stringify(englishAnalysis.feedbackCards), /restaurants?[^.]{0,120}(not in|absent from|outside) the prompt/i);
  assert.equal(lockedRevisionCount(), 0, "Production must not depend on fixture-locked revisions.");

  const baseRecord = {
    username: "teacher", studentProfileId: "sun", taskType: "Task 2",
    studentWorkFingerprint: "sun-urban-zoning", top3Issues: englishAnalysis.top3Issues,
    estimatedBandRange: englishAnalysis.estimatedBandRange,
    mostUrgentRepair: englishAnalysis.mostUrgentRepair, analysisValidity: "valid"
  };
  const records = [
    { ...baseRecord, submissionId: "sun-v1", submissionGroupId: "sun-current", dateTime: "2026-07-18T01:00:00Z", report: englishAnalysis },
    { ...baseRecord, submissionId: "sun-v2", submissionGroupId: "sun-current", dateTime: "2026-07-18T02:00:00Z", report: englishAnalysis, progressEligible: false, creditConsumed: false },
    { ...baseRecord, submissionId: "legacy-v1", submissionGroupId: "legacy-other", dateTime: "2026-07-17T01:00:00Z", report: englishAnalysis, progressEligible: false }
  ];
  const progress = buildServerProgressSummary(records, records[1], "Task 2");
  assert.equal(progress.reportVersionCount, 2);
  assert.deepEqual(progress.reportVersions.map((item) => item.submissionGroupId), ["sun-current", "sun-current"]);

  const englishModel = buildStudentReportViewModel({
    ...englishAnalysis, submissionGroupId: "must-not-project", reportVersionId: "must-not-project", inputFingerprint: "must-not-project"
  }, { studentDisplayName: "Sun", generatedAt: "2026-07-18T07:29:00Z", progressSummary: progress });
  const thaiModel = buildStudentReportViewModel(thaiAnalysis, {
    studentDisplayName: "Sun", generatedAt: "2026-07-18T07:29:00Z", progressSummary: progress
  });
  const ambiguousModel = buildStudentReportViewModel(englishAnalysis, {
    progressSummary: { ...progress, reportVersions: [...progress.reportVersions, { submissionId: "legacy-v1", submissionGroupId: "legacy-other" }] }
  });

  assert.deepEqual(Object.keys(englishModel), STUDENT_MODEL_KEYS);
  assert.equal(englishModel.schema, "StudentReportViewModel.v12");
  assert.equal(englishModel.progressSummary.reportVersionCount, 2);
  assert.equal(ambiguousModel.progressSummary.reportVersionCount, null);
  assert.equal(englishModel.repairPlan.length, 7);
  assert.deepEqual(englishModel.detailedFeedback.map((card) => card.paragraphLocation), EXPECTED_LOCATIONS);

  const adminQA = buildAdminReportQAViewModel(records[1], records, { pageCount: 13 });
  assert.equal(adminQA.schema, "AdminReportQAViewModel.v12");
  assert.deepEqual(adminQA.validVersionIds, ["sun-v1", "sun-v2"]);
  assert.deepEqual(adminQA.excludedLegacyGroups, ["legacy-other"]);

  const englishHtml = renderStudentReportDocument(englishModel);
  const thaiHtml = renderStudentReportDocument(thaiModel);
  for (const html of [englishHtml, thaiHtml]) {
    assert.doesNotMatch(html, /window\.print\s*\(/);
    assert.doesNotMatch(html, /<iframe/i);
    for (const pattern of FORBIDDEN_INTERNAL) assert.doesNotMatch(html, pattern);
  }

  const englishPdf = await generateStudentReportPdf(englishModel, { includeSourceHtml: true, captureScreenshots: true });
  const thaiPdf = await generateStudentReportPdf(thaiModel, { captureScreenshots: true });
  for (const result of [englishPdf, thaiPdf]) {
    assert.ok(result.pageCount >= 10 && result.pageCount <= 18, `Unexpected page count: ${result.pageCount}`);
    assert.equal(result.screenshots.length, result.pageCount);
    assert.equal(result.pageQA.length, result.pageCount);
    for (const screenshot of result.screenshots) {
      assert.ok(screenshot.length > 10000);
      assert.deepEqual([...screenshot.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    }
    result.pageQA.forEach((page, index) => {
      assert.deepEqual(page.protectedOverflow, [], `Protected card overflow on page ${page.page}`);
      const lines = page.text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      assert.doesNotMatch(lines.at(-1) || "", /^(Exact Sentence Found|Targeted Revision|ประโยคจริงที่พบ)$/i);
      assert.doesNotMatch(lines[0] || "", /^(Student Action|สิ่งที่นักเรียนต้องทำ)$/i);
      if (index > 0 && index < result.pageQA.length - 1) assert.ok(page.utilization >= 0.25, `Low utilization on page ${page.page}`);
      assert.ok(page.utilization <= 1.001, `Overflow on page ${page.page}`);
    });
    assert.ok(result.pageQA.at(-1).utilization >= 0.35, "Final page is unnecessarily isolated.");
    for (const pattern of FORBIDDEN_INTERNAL) assert.doesNotMatch(result.pdfJsText, pattern);
    assert.deepEqual(findForbiddenUnicode(result.pdfJsText), []);
  }

  const normalizedEnglish = normalizeExtracted(englishPdf.pdfJsText);
  for (const phrase of ["route-preserving revision", "teacher-guided expansion", "body paragraph 2", "conclusion"]) {
    assert.ok(normalizedEnglish.includes(phrase), `PDF.js English extraction missed: ${phrase}`);
  }
  assert.ok(normalizeThaiExtracted(thaiPdf.pdfJsText).includes(normalizeThaiExtracted(getThaiDisclaimer())));

  const pdftotextAvailable = spawnSync("pdftotext", ["-v"], { encoding: "utf8" }).error == null;
  if (pdftotextAvailable) {
    const enPath = path.join(tempRoot, "sun-en.pdf");
    const thPath = path.join(tempRoot, "sun-th.pdf");
    await writeFile(enPath, englishPdf.pdfBuffer);
    await writeFile(thPath, thaiPdf.pdfBuffer);
    const enText = execFileSync("pdftotext", ["-layout", enPath, "-"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    const thText = execFileSync("pdftotext", ["-layout", thPath, "-"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    assert.ok(normalizeExtracted(enText).includes("route-preserving revision"));
    assert.ok(normalizeThaiExtracted(thText).includes(normalizeThaiExtracted(getThaiDisclaimer())));
    assert.deepEqual(findForbiddenUnicode(enText.replace(/\f/gu, "")), []);
    assert.deepEqual(findForbiddenUnicode(thText.replace(/\f/gu, "")), []);
  }

  console.log(`V12.2 renderer rebuild passed: ${englishPdf.pageCount} English pages, ${thaiPdf.pageCount} Thai pages; no split protected cards, no internal data, searchable bilingual text.`);
} finally {
  await closePdfRendererBrowser();
  await rm(tempRoot, { recursive: true, force: true });
}

function normalizeExtracted(value) {
  return String(value || "").normalize("NFKC").toLowerCase()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/gu, "-")
    .replace(/\s*-\s*/gu, "-").replace(/\s+/gu, " ").trim();
}
function normalizeThaiExtracted(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/gu, "");
}
