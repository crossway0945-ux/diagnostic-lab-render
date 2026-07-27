import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildServerProgressSummary } from "../services/apiRouter.js";

const script = await readFile(new URL("../script.js", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const analyzer = await readFile(new URL("../services/aiAnalyzer.js", import.meta.url), "utf8");

assert.match(script, /async function exportDiagnosticPdf/);
assert.match(script, /diagnostic-print-frame/);
assert.match(script, /body > \*:not\(#print-report\)/);
assert.match(script, /assertStudentPrintBoundary/);
assert.match(script, /Report-Version and Progress Proof/i);
assert.doesNotMatch(script.match(/function renderPrintProgressSummary[\s\S]*?function validatedStudentReportVersionCount/)?.[0] || "", /renderPrintProgressProof/);
assert.match(script, /print-feedback-primary-group/);
assert.match(script, /print-feedback-revision-group/);
assert.match(css, /\.print-feedback-primary-group/);
assert.match(css, /font-family:\s*"Noto Sans Thai Embedded"/);
assert.match(script, /[\\u200B\\u2060]/);

for (const forbidden of [
  "essential facilities in one zone could force many residents",
  "significant travel difficulties",
  "serious commuting difficulties"
]) assert.doesNotMatch(analyzer, new RegExp(forbidden, "i"));

for (const fixtureSpecific of [
  "facilities of the same type in one designated zone could create commuting difficulties for some residents",
  "could force some residents to travel long distances to reach them",
  "could cause some residents to face travel difficulties",
  "urban areas should not be divided into separate zones for different types of facilities, because this would make travel less accessible and worsen traffic congestion"
]) assert.doesNotMatch(analyzer, new RegExp(fixtureSpecific.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

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

console.log("V11.6 student-report renderer: isolated export, content boundary, stable feedback blocks, locked revisions, Thai font, and exact progress version grouping passed.");
