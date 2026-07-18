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
import { generateStudentReportPdf } from "../reports/pdfRenderer.js";
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

const LOCKED = [
  ["Route-Preserving Revision", "Some people argue that towns and cities should be divided into separate zones, with schools, shopping malls and industrial sites concentrated in designated areas."],
  ["Route-Preserving Revision", "First of all, concentrating facilities of the same type in one designated zone could create commuting difficulties for some residents."],
  ["Route-Preserving Revision", "Families live in different parts of a city, so concentrating facilities of the same type in one designated zone could force some residents to travel long distances to reach them."],
  ["Teacher-Guided Expansion", "For example, if all schools were concentrated in one education district, students living in outer parts of the city would have to travel farther each day, reducing their study time and placing additional pressure on public transport."],
  ["Route-Preserving Revision", "Therefore, concentrating similar facilities in one area could cause some residents to face travel difficulties."],
  ["Route-Preserving Revision", "Furthermore, traffic congestion could increase if facilities of the same type were concentrated together within a single designated zone."],
  ["Teacher-Guided Expansion", "For example, if all major shopping malls were concentrated in one district, large numbers of shoppers would use the same roads during peak periods, causing severe traffic congestion around that area."],
  ["Route-Preserving Revision", "In conclusion, I firmly believe that urban areas should not be divided into zones according to facility type, because this could make daily travel more difficult and worsen traffic congestion."]
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
  /internal QA/i
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

  assert.equal(englishAnalysis.estimatedBandRange, "6.0-6.5");
  assert.equal(englishAnalysis.detectedPosition, "strongly disagree");
  assert.equal(thaiAnalysis.estimatedBandRange, englishAnalysis.estimatedBandRange);

  // Version grouping must include only one validated submission group.
  const baseRecord = {
    username: "teacher",
    studentProfileId: "sun",
    taskType: "Task 2",
    studentWorkFingerprint: "sun-urban-zoning",
    top3Issues: englishAnalysis.top3Issues,
    estimatedBandRange: englishAnalysis.estimatedBandRange,
    mostUrgentRepair: englishAnalysis.mostUrgentRepair,
    analysisValidity: "valid"
  };
  const records = [
    { ...baseRecord, submissionId: "sun-v1", submissionGroupId: "sun-current", dateTime: "2026-07-18T01:00:00Z", report: englishAnalysis },
    { ...baseRecord, submissionId: "sun-v2", submissionGroupId: "sun-current", dateTime: "2026-07-18T02:00:00Z", report: englishAnalysis, progressEligible: false, creditConsumed: false },
    { ...baseRecord, submissionId: "legacy-v1", submissionGroupId: "legacy-other", dateTime: "2026-07-17T01:00:00Z", report: englishAnalysis, progressEligible: false }
  ];
  const progress = buildServerProgressSummary(records, records[1], "Task 2");
  assert.equal(progress.currentSubmissionGroupId, "sun-current");
  assert.equal(progress.reportVersionCount, 2);
  assert.deepEqual(progress.reportVersions.map((item) => item.submissionGroupId), ["sun-current", "sun-current"]);

  const ambiguousProgress = {
    ...progress,
    reportVersions: [...progress.reportVersions, { submissionId: "legacy-v1", submissionGroupId: "legacy-other" }]
  };

  const englishModel = buildStudentReportViewModel({
    ...englishAnalysis,
    submissionGroupId: "must-not-project",
    reportVersionId: "must-not-project",
    inputFingerprint: "must-not-project"
  }, {
    studentDisplayName: "Sun",
    generatedAt: "2026-07-18T07:29:00Z",
    progressSummary: progress
  });
  const thaiModel = buildStudentReportViewModel(thaiAnalysis, {
    studentDisplayName: "Sun",
    generatedAt: "2026-07-18T07:29:00Z",
    progressSummary: progress
  });
  const ambiguousModel = buildStudentReportViewModel(englishAnalysis, { progressSummary: ambiguousProgress });

  assert.deepEqual(Object.keys(englishModel), STUDENT_MODEL_KEYS);
  assert.equal(englishModel.schema, "StudentReportViewModel.v12");
  assert.equal(englishModel.progressSummary.reportVersionCount, 2);
  assert.equal(ambiguousModel.progressSummary.reportVersionCount, null, "Mixed groups must omit the student-facing version count.");
  assert.equal(englishModel.repairPlan.length, 7);
  assert.equal(lockedRevisionCount(), 8);

  const adminQA = buildAdminReportQAViewModel(records[1], records, { pageCount: 13 });
  assert.equal(adminQA.schema, "AdminReportQAViewModel.v12");
  assert.equal(adminQA.latestSubmissionGroupId, "sun-current");
  assert.deepEqual(adminQA.validVersionIds, ["sun-v1", "sun-v2"]);
  assert.deepEqual(adminQA.excludedLegacyGroups, ["legacy-other"]);
  assert.equal(adminQA.duplicateCreditResult, "no-additional-credit");

  const englishHtml = renderStudentReportDocument(englishModel);
  const thaiHtml = renderStudentReportDocument(thaiModel);
  for (const html of [englishHtml, thaiHtml]) {
    assert.match(html, /StudentReportViewModel|report-output|report-source/);
    assert.doesNotMatch(html, /window\.print\s*\(/);
    assert.doesNotMatch(html, /<iframe/i);
    for (const pattern of FORBIDDEN_INTERNAL) assert.doesNotMatch(html, pattern);
    assert.match(html, /Kru Pom IELTS \| IELTS Writing 7\+ Diagnostic Lab \| Diagnostic estimate only/);
  }
  for (const value of Object.values(adminQA)) {
    if (typeof value === "string" && value) assert.equal(englishHtml.includes(value), false, `Admin-only value leaked into Student HTML: ${value}`);
  }

  const revisionPairs = englishModel.detailedFeedback.map((card) => [card.revisionType, card.targetedRevision]);
  for (const [type, revision] of LOCKED) {
    assert.ok(revisionPairs.some(([actualType, actualRevision]) => actualType === type && actualRevision === revision), `Missing locked revision: ${revision}`);
    if (/route-preserving/i.test(type)) {
      const card = englishModel.detailedFeedback.find((item) => item.targetedRevision === revision);
      const validation = validateRevision({
        original: card.exactSentence,
        revised: card.targetedRevision,
        revisionType: card.revisionType,
        diagnosedIssues: card.issueType
      });
      assert.equal(validation.pass, true, `Route-preserving revision failed: ${revision}`);
      assert.deepEqual(validation.introducedIssues, []);
    }
  }

  const englishPdf = await generateStudentReportPdf(englishModel, { includeSourceHtml: true, captureScreenshots: true });
  const thaiPdf = await generateStudentReportPdf(thaiModel, { captureScreenshots: true });
  assert.ok(englishPdf.pageCount >= 13 && englishPdf.pageCount <= 15, `English page count ${englishPdf.pageCount} is outside 13-15.`);
  assert.ok(thaiPdf.pageCount >= 13 && thaiPdf.pageCount <= 15, `Thai page count ${thaiPdf.pageCount} is outside 13-15.`);
  assert.equal(englishPdf.screenshots.length, englishPdf.pageCount);
  assert.equal(thaiPdf.screenshots.length, thaiPdf.pageCount);
  for (const screenshot of [...englishPdf.screenshots, ...thaiPdf.screenshots]) {
    assert.ok(screenshot.length > 10000, "Page screenshot is unexpectedly small.");
    assert.deepEqual([...screenshot.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "Invalid PNG screenshot signature.");
  }

  for (const result of [englishPdf, thaiPdf]) {
    assert.equal(result.pageQA.length, result.pageCount);
    result.pageQA.forEach((page, index) => {
      assert.deepEqual(page.protectedOverflow, [], `Protected card overflow on page ${page.page}.`);
      const lines = page.text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      const first = lines[0] || "";
      const last = lines.at(-1) || "";
      assert.doesNotMatch(last, /^(Exact Sentence Found|Targeted Revision|ประโยคจริงที่พบ)$/i, `Orphan label at page ${page.page}.`);
      assert.doesNotMatch(first, /^(Student Action|สิ่งที่นักเรียนต้องทำ)$/i, `Detached Student Action at page ${page.page}.`);
      if (index > 0 && index < result.pageQA.length - 1) assert.ok(page.utilization >= 0.30, `Low utilization at page ${page.page}: ${page.utilization}`);
      assert.ok(page.utilization <= 1.001, `Overflow utilization at page ${page.page}: ${page.utilization}`);
    });
    const finalPage = result.pageQA.at(-1);
    assert.ok(finalPage.utilization >= 0.50, `Final page is unnecessarily isolated: ${finalPage.utilization}`);
    assert.ok(finalPage.blockKinds.length >= 2, "Disclaimer is unnecessarily isolated on the final page.");
  }

  const normalizedEnglish = normalizeExtracted(englishPdf.pdfJsText);
  for (const phrase of [
    "full-language edit", "route-preserving revision", "two-body route",
    "student-progress trends", "traffic-congestion reason", "teacher-guided expansion"
  ]) assert.ok(normalizedEnglish.includes(phrase), `PDF.js English extraction missed: ${phrase}`);
  assert.ok(normalizeThaiExtracted(thaiPdf.pdfJsText).includes(normalizeThaiExtracted(getThaiDisclaimer())), "PDF.js Thai disclaimer extraction failed.");

  for (const result of [englishPdf, thaiPdf]) {
    for (const pattern of FORBIDDEN_INTERNAL) assert.doesNotMatch(result.pdfJsText, pattern);
    assert.deepEqual(findForbiddenUnicode(result.pdfJsText), []);
    assert.match(result.pdfJsText, /Kru Pom IELTS \| IELTS Writing 7\+ Diagnostic Lab \| Diagnostic estimate only/);
  }

  // A second independent extractor is required when pdftotext is available.
  const pdftotextAvailable = spawnSync("pdftotext", ["-v"], { encoding: "utf8" }).error == null;
  if (pdftotextAvailable) {
    const enPath = path.join(tempRoot, "sun-en.pdf");
    const thPath = path.join(tempRoot, "sun-th.pdf");
    await writeFile(enPath, englishPdf.pdfBuffer);
    await writeFile(thPath, thaiPdf.pdfBuffer);
    const enText = execFileSync("pdftotext", ["-layout", enPath, "-"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    const thText = execFileSync("pdftotext", ["-layout", thPath, "-"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    const normalizedPdftotext = normalizeExtracted(enText);
    for (const phrase of [
      "full-language edit", "route-preserving revision", "two-body route",
      "student-progress trends", "traffic-congestion reason", "teacher-guided expansion"
    ]) assert.ok(normalizedPdftotext.includes(phrase), `pdftotext English extraction missed: ${phrase}`);
    assert.ok(normalizeThaiExtracted(thText).includes(normalizeThaiExtracted(getThaiDisclaimer())), "pdftotext Thai disclaimer extraction failed.");
    assert.deepEqual(findForbiddenUnicode(enText.replace(/\f/gu, "")), []);
    assert.deepEqual(findForbiddenUnicode(thText.replace(/\f/gu, "")), []);
  }

  console.log(`V12 student-report renderer rebuild passed: ${englishPdf.pageCount} English pages, ${thaiPdf.pageCount} Thai pages, clean server-side PDF, deterministic pagination, locked revisions, strict Student/Admin boundary, screenshots, and searchable text.`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function normalizeExtracted(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/gu, "-")
    .replace(/\s*-\s*/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeThaiExtracted(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/gu, "");
}
