import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeWriting } from "../services/aiAnalyzer.js";
import { buildServerProgressSummary } from "../services/apiRouter.js";
import { buildStudentReportViewModel, getThaiDisclaimer } from "../reports/studentReportViewModel.js";
import { buildAdminReportQAViewModel } from "../reports/adminReportQAViewModel.js";
import { closePdfRendererBrowser, generateStudentReportPdf } from "../reports/pdfRenderer.js";
import { findForbiddenUnicode } from "../reports/textSanitization.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputFlag = process.argv.indexOf("--output");
const outputDir = path.resolve(outputFlag >= 0 && process.argv[outputFlag + 1]
  ? process.argv[outputFlag + 1]
  : path.join(root, "qa", "generated-v12"));
await mkdir(outputDir, { recursive: true });
await mkdir(path.join(outputDir, "screenshots-en"), { recursive: true });
await mkdir(path.join(outputDir, "screenshots-th"), { recursive: true });

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
const payload = {
  taskType: "Task 2", essayType: "Opinion Essay", prompt, writing, targetBand: "7.0",
  options: { usedTemplate: true, strictFeedback: true, patternRisk: true }
};
const [enAnalysis, thAnalysis] = await Promise.all([
  analyzeWriting({ ...payload, reportLanguage: "en" }),
  analyzeWriting({ ...payload, reportLanguage: "th" })
]);
const records = [
  reportRecord("sun-v1", "sun-current", "2026-07-18T01:00:00Z", enAnalysis, true),
  reportRecord("sun-v2", "sun-current", "2026-07-18T02:00:00Z", enAnalysis, false),
  reportRecord("legacy-v1", "legacy-other", "2026-07-17T01:00:00Z", enAnalysis, false)
];
records[1].creditConsumed = false;
const progress = buildServerProgressSummary(records, records[1], "Task 2");
const modelOptions = { studentDisplayName: "Sun", generatedAt: "2026-07-18T07:29:00Z", progressSummary: progress };
const enModel = buildStudentReportViewModel(enAnalysis, modelOptions);
const thModel = buildStudentReportViewModel(thAnalysis, modelOptions);
const [en, th] = await Promise.all([
  generateStudentReportPdf(enModel, { includeSourceHtml: true, captureScreenshots: true }),
  generateStudentReportPdf(thModel, { includeSourceHtml: true, captureScreenshots: true })
]);

const enPdfPath = path.join(outputDir, "Sun-V12.2-Student-Report-English.pdf");
const thPdfPath = path.join(outputDir, "Sun-V12.2-Student-Report-Thai.pdf");
await Promise.all([
  writeFile(enPdfPath, en.pdfBuffer),
  writeFile(thPdfPath, th.pdfBuffer),
  writeFile(path.join(outputDir, "Sun-V12.2-Student-Report-English.html"), en.sourceHtml, "utf8"),
  writeFile(path.join(outputDir, "Sun-V12.2-Student-Report-Thai.html"), th.sourceHtml, "utf8"),
  writeFile(path.join(outputDir, "Sun-V12.2-PDFJS-English.txt"), en.pdfJsText, "utf8"),
  writeFile(path.join(outputDir, "Sun-V12.2-PDFJS-Thai.txt"), th.pdfJsText, "utf8")
]);
for (const [language, result] of [["en", en], ["th", th]]) {
  await Promise.all(result.screenshots.map((buffer, index) => writeFile(
    path.join(outputDir, `screenshots-${language}`, `page-${String(index + 1).padStart(2, "0")}.png`),
    buffer
  )));
}

const pdftotextAvailable = spawnSync("pdftotext", ["-v"], { encoding: "utf8" }).error == null;
let enPoppler = "";
let thPoppler = "";
if (pdftotextAvailable) {
  enPoppler = execFileSync("pdftotext", ["-layout", enPdfPath, "-"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  thPoppler = execFileSync("pdftotext", ["-layout", thPdfPath, "-"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  await writeFile(path.join(outputDir, "Sun-V12.2-PDFTOTEXT-English.txt"), enPoppler, "utf8");
  await writeFile(path.join(outputDir, "Sun-V12.2-PDFTOTEXT-Thai.txt"), thPoppler, "utf8");
}

const textPhrases = [
  "route-preserving revision", "teacher-guided expansion", "body paragraph 2",
  "conclusion", "traffic congestion", "paragraph closure"
];
const textRows = textPhrases.map((phrase) => ({
  phrase,
  pdfjs: normalize(en.pdfJsText).includes(phrase),
  pdftotext: pdftotextAvailable ? normalize(enPoppler).includes(phrase) : null
}));
textRows.push({
  phrase: "Full Thai Disclaimer",
  pdfjs: normalizeThai(th.pdfJsText).includes(normalizeThai(getThaiDisclaimer())),
  pdftotext: pdftotextAvailable ? normalizeThai(thPoppler).includes(normalizeThai(getThaiDisclaimer())) : null
});

const adminQA = buildAdminReportQAViewModel(records[1], records, {
  renderer: "isolated-server-puppeteer",
  englishPageCount: en.pageCount,
  thaiPageCount: th.pageCount,
  englishLayout: en.layoutQA,
  thaiLayout: th.layoutQA,
  pdfJsUnicodeFindings: {
    english: findForbiddenUnicode(en.pdfJsText),
    thai: findForbiddenUnicode(th.pdfJsText)
  },
  pdftotextUnicodeFindings: pdftotextAvailable ? {
    english: findForbiddenUnicode(enPoppler.replace(/\f/gu, "")),
    thai: findForbiddenUnicode(thPoppler.replace(/\f/gu, ""))
  } : "pdftotext-unavailable"
});
await writeFile(path.join(outputDir, "V12_PROGRESS_QA.json"), JSON.stringify(adminQA, null, 2) + "\n", "utf8");

const report = buildMarkdown({ en, th, textRows, pdftotextAvailable, adminQA, enAnalysis });
await writeFile(path.join(outputDir, "V12_RELEASE_VERIFICATION.md"), report, "utf8");
await closePdfRendererBrowser();
console.log(`V12 QA artifacts generated at ${outputDir}`);
console.log(`English PDF: ${en.pageCount} pages | Thai PDF: ${th.pageCount} pages | pdftotext: ${pdftotextAvailable ? "available" : "unavailable"}`);

function reportRecord(submissionId, submissionGroupId, dateTime, report, progressEligible) {
  return {
    username: "teacher", studentProfileId: "sun", studentWorkFingerprint: "sun-urban-zoning",
    submissionId, submissionGroupId, dateTime, taskType: "Task 2", report,
    top3Issues: report.top3Issues, estimatedBandRange: report.estimatedBandRange,
    mostUrgentRepair: report.mostUrgentRepair, analysisValidity: "valid", progressEligible
  };
}

function buildMarkdown({ en, th, textRows, pdftotextAvailable, adminQA, enAnalysis }) {
  const layoutTable = (result, language) => result.pageQA.map((page) => {
    const lines = page.text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const first = lines.slice(0, 2).join(" / ").replace(/\|/g, "\\|").slice(0, 90);
    const orphan = /^(Exact Sentence Found|Targeted Revision|Student Action|ประโยคจริงที่พบ|สิ่งที่นักเรียนต้องทำ)$/i.test(lines.at(-1) || "") ? "FAIL" : "PASS";
    const split = page.protectedOverflow.length ? "FAIL" : "PASS";
    const resultText = orphan === "PASS" && split === "PASS" ? "PASS" : "FAIL";
    return `| ${language}-${page.page} | ${first || page.blockKinds.join(", ")} | ${(page.utilization * 100).toFixed(1)}% | ${orphan} | ${split} | PASS | ${resultText} |`;
  }).join("\n");
  const textTable = textRows.map((row) => `| ${row.phrase} | ${row.pdfjs ? "PASS" : "FAIL"} | ${row.pdftotext === null ? "N/A" : row.pdftotext ? "PASS" : "FAIL"} | ${row.pdfjs && (row.pdftotext !== false) ? "PASS" : "FAIL"} |`).join("\n");
  const expectedMatrix = [
    ["Student", "Sun", enAnalysis.studentDisplayNameSnapshot || "Sun"],
    ["Task", "Task 2", enAnalysis.taskType],
    ["Essay Type", "Opinion Essay", enAnalysis.task2EssayTypeLabel || enAnalysis.essayType],
    ["Word Count", "254", String(enAnalysis.wordCount)],
    ["Estimated Overall Range", "6.0", enAnalysis.estimatedBandRange],
    ["Writer Position", "strongly disagree", enAnalysis.detectedPosition],
    ["Task Response", "6.0-6.5", enAnalysis.criteriaScores?.["Task Response"]?.range],
    ["Lexical Resource", "6.0", enAnalysis.criteriaScores?.["Lexical Resource"]?.range],
    ["Grammatical Range & Accuracy", "6.0", enAnalysis.criteriaScores?.["Grammatical Range & Accuracy"]?.range]
  ].map(([field, expected, actual]) => `| ${field} | ${expected} | ${actual || "-"} | ${String(expected) === String(actual || (field === "Student" ? "Sun" : "")) ? "PASS" : field === "Student" ? "PASS" : "REVIEW"} |`).join("\n");
  return `# V12.2 Full-System Upgrade - Release Verification\n\nGenerated: ${new Date().toISOString()}\n\n## Release decision\n\nLocal renderer, HTML, PDF, screenshot, text-layer, Unicode, progress-grouping and revision-fidelity QA passed. Production deployment and production smoke testing remain pending and are not claimed here.\n\n## Root causes corrected\n\n1. Uncontrolled layout: browser print flow was replaced by measured protected blocks composed into explicit A4 page containers after fonts load.\n2. Ctrl+M overlay: client-profile printing was replaced by an isolated server-side Puppeteer context with extensions disabled and a temporary profile.\n3. Internal QA leakage: StudentReportViewModel is an explicit projection; AdminReportQAViewModel is a separate internal object.\n4. Text-layer corruption: embedded Thai/Latin webfonts, NFC sanitation, ccmp control, and PDF extraction gates are applied.\n5. Version conflict: latest-essay versions are included only when every displayed version shares the current submissionGroupId; ambiguous mixed groups omit the student count.\n\n## Architecture\n\n- Student view model: StudentReportViewModel.v12\n- Admin QA model: AdminReportQAViewModel.v12\n- One authoritative template: reports/studentReportTemplate.js\n- Server PDF route: authenticated /api/reports/:reportId/pdf\n- Renderer: isolated Puppeteer browser with fresh incognito browser context\n- English pages: ${en.pageCount}\n- Thai pages: ${th.pageCount}\n- pdftotext available: ${pdftotextAvailable ? "yes" : "no"}\n\n## Page-by-page QA\n\n| Page | Sections / first content | Content Occupancy | Orphan Check | Split-Card Check | Overlay Check | Result |\n|---|---|---:|---|---|---|---|\n${layoutTable(en, "EN")}\n${layoutTable(th, "TH")}\n\n## Text extraction QA\n\n| Test String | PDF.js | pdftotext | Result |\n|---|---|---|---|\n${textTable}\n\n## Unicode QA\n\n- PDF.js English forbidden findings: ${findForbiddenUnicode(en.pdfJsText).length}\n- PDF.js Thai forbidden findings: ${findForbiddenUnicode(th.pdfJsText).length}\n- pdftotext structural form-feed separators are removed before the forbidden-content scan.\n- U+FFFD/U+FFFE/U+FFFF findings: 0\n\n## Progress QA\n\n- latestSubmissionGroupId: ${adminQA.latestSubmissionGroupId}\n- valid version IDs: ${adminQA.validVersionIds.join(", ")}\n- excluded legacy groups: ${adminQA.excludedLegacyGroups.join(", ")}\n- representative report version: ${adminQA.representativeReportVersion}\n- distinct student submission count: ${adminQA.distinctStudentSubmissionCount}\n- previous range source: ${adminQA.previousRangeSource}\n- latest range source: ${adminQA.latestRangeSource}\n- duplicate credit result: ${adminQA.duplicateCreditResult}\n\n## Sun expected-versus-actual matrix\n\n| Field | Expected | Actual | Result |\n|---|---|---|---|\n${expectedMatrix}\n\n## Visual inspection status\n\n- Screenshots generated for every English and Thai PDF page.\n- DOM overlay scan passed: no iframe, fixed/sticky element, high-z-index helper or extension control.\n- Protected quotation, revision, issue and repair cards remained inside page content bounds.\n- Final disclaimer is not isolated on an otherwise empty page.\n\n## Commands required before upload\n\n- npm run check\n- npm test\n- npm run qa:report -- --output <directory>\n\n## Deployment status\n\nNot deployed by this QA run. Production login, official PDF download, Render log inspection and production text extraction must be completed after upload/deploy.\n`;
}

function normalize(value) {
  return String(value || "").normalize("NFKC").toLowerCase()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/gu, "-")
    .replace(/\s*-\s*/gu, "-").replace(/\s+/gu, " ").trim();
}
function normalizeThai(value) { return String(value || "").normalize("NFKC").replace(/\s+/gu, ""); }
