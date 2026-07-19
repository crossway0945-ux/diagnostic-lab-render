import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildServerProgressSummary } from "../services/apiRouter.js";

const [script, template, renderer, studentViewModel, adminViewModel] = await Promise.all([
  readFile(new URL("../script.js", import.meta.url), "utf8"),
  readFile(new URL("../reports/studentReportTemplate.js", import.meta.url), "utf8"),
  readFile(new URL("../reports/pdfRenderer.js", import.meta.url), "utf8"),
  readFile(new URL("../reports/studentReportViewModel.js", import.meta.url), "utf8"),
  readFile(new URL("../reports/adminReportQAViewModel.js", import.meta.url), "utf8")
]);

assert.match(script, /async function exportDiagnosticPdf/);
assert.match(script, /\/api\/reports\/\$\{encodeURIComponent\(id\)\}\/pdf/);
assert.doesNotMatch(script, /window\.print\s*\(|win\.print\s*\(|function renderPrintReport/);
assert.match(template, /renderStudentReportDocument/);
assert.match(template, /report-source/);
assert.match(template, /report-output/);
assert.match(template, /document\.fonts\.ready/);
assert.match(template, /Protected report block exceeds one A4 page/);
assert.doesNotMatch(template, /submissionGroupId|reportVersionId|parentReportId|Ctrl\s*\+\s*M/i);
assert.match(renderer, /puppeteer\.default\.launch/);
assert.match(renderer, /--disable-extensions/);
assert.match(renderer, /userDataDir/);
assert.match(renderer, /extractPdfTextWithPdfJs/);
assert.match(studentViewModel, /StudentReportViewModel\.v12/);
assert.match(adminViewModel, /AdminReportQAViewModel\.v12/);

const base = {
  username: "teacher",
  studentProfileId: "sun",
  taskType: "Task 2",
  studentWorkFingerprint: "same-work",
  top3Issues: [{ issueType: "Vocabulary Precision" }],
  estimatedBandRange: "6.0-6.5",
  mostUrgentRepair: "Keep the route.",
  analysisValidity: "valid"
};
const records = [
  { ...base, submissionId: "v1", submissionGroupId: "work-current", dateTime: "2026-07-17T01:00:00Z" },
  { ...base, submissionId: "v2", submissionGroupId: "work-current", dateTime: "2026-07-17T02:00:00Z", progressEligible: false },
  { ...base, submissionId: "legacy1", submissionGroupId: "legacy-other", dateTime: "2026-07-17T03:00:00Z", progressEligible: false }
];
const summary = buildServerProgressSummary(records, records[1], "Task 2");
assert.equal(summary.currentSubmissionGroupId, "work-current");
assert.equal(summary.reportVersionCount, 2);
assert.ok(summary.reportVersions.every((item) => item.submissionGroupId === "work-current"));

console.log("V12 renderer architecture: official server PDF, authoritative template, isolated browser, Student/Admin data boundary, and exact progress grouping passed.");
