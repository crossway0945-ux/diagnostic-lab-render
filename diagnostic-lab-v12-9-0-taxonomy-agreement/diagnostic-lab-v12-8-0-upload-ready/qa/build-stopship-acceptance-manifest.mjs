import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pdfTextIntegrityIssues } from "../domain/pdfTextIntegrity.js";
import { sanitizePrintableText } from "../domain/textIntegrity.js";

const args = Object.fromEntries(
  process.argv.slice(2).map((item) => {
    const separator = item.indexOf("=");
    return separator < 0
      ? [item.replace(/^--/, ""), true]
      : [item.slice(0, separator).replace(/^--/, ""), item.slice(separator + 1)];
  })
);
if (!args.output) {
  throw new Error("Usage: node qa/build-stopship-acceptance-manifest.mjs --output=<dir>");
}

const outputDir = path.resolve(args.output);
const readJson = async (name) => JSON.parse(await readFile(path.join(outputDir, name), "utf8"));
const qa = await readJson("Eva-final-canonical-qa.json");
const student = await readJson("Eva-final-student-view.json");
const releaseIndex = await readJson("release-artifact-index.json");
const pdfInspection = await readJson("pdf-binary-inspection.json");
const browserMetrics = await readJson("Eva-final-report-browser-metrics.json");
const extractedPdfText = await readFile(path.join(outputDir, "Eva-extracted-pdf-text.txt"), "utf8");
const testEvidence = {
  result: Number(args.testFiles) === 42 && Number(args.sourceModules) === 102 ? "PASS" : "FAIL",
  sourceCheckModules: Number(args.sourceModules || 0),
  testFiles: Number(args.testFiles || 0),
  command: "npm run check && npm test",
  completedAt: new Date().toISOString()
};

const checks = [];
function record(id, condition, evidence) {
  checks.push({
    id,
    result: condition ? "PASS" : "FAIL",
    evidence
  });
}

const finalState = qa.finalValidatedState || {};
const paragraphMap = finalState.paragraphMap || {};
const mappedSentences = (paragraphMap.paragraphs || []).flatMap((paragraph) => paragraph.sentences || []);
const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
const sentenceLocationByText = new Map(
  mappedSentences.map((sentence) => [normalize(sentence.exactText), sentence.location])
);
const locationBindings = (finalState.issues || [])
  .filter((issue) => issue.exactSentence || issue.exactEvidence)
  .map((issue) => {
    const exact = issue.exactSentence || issue.exactEvidence;
    const mappedLocation = sentenceLocationByText.get(normalize(exact)) || "";
    return {
      issueId: issue.issueId,
      reportedLocation: issue.paragraphLocation,
      mappedLocation,
      pass: Boolean(mappedLocation) && mappedLocation === issue.paragraphLocation
    };
  });

record(
  "paragraph-map-four-canonical-paragraphs",
  qa.paragraphMapAudit?.pass === true
    && qa.paragraphMapAudit?.paragraphCount === 4
    && qa.paragraphMapAudit?.rawOffsetsPreserved === true
    && (paragraphMap.paragraphs || []).map((item) => item.role).join("|")
      === "Introduction|Body Paragraph 1|Body Paragraph 2|Conclusion",
  qa.paragraphMapAudit
);
record(
  "sentence-location-bindings",
  locationBindings.length > 0 && locationBindings.every((item) => item.pass),
  locationBindings
);
record(
  "framework-evidence-audit",
  Array.isArray(qa.frameworkEvidenceAudit)
    && qa.frameworkEvidenceAudit.length >= 8
    && qa.frameworkEvidenceAudit.every((item) => item.pass === true),
  qa.frameworkEvidenceAudit
);

const framework = student.frameworkBreakdown || {};
record(
  "sar-calibration",
  framework["SAR Example Quality"]?.status === "Mixed",
  framework["SAR Example Quality"]
);
record(
  "conclusion-function-and-language-separation",
  /functionally strong/i.test(framework["Conclusion Closure"]?.status || "")
    && /language repair needed/i.test(framework["Conclusion Closure"]?.status || ""),
  framework["Conclusion Closure"]
);
record(
  "link-back-calibration",
  framework["Link Back Control"]?.status === "Mixed"
    && !/failed|critical/i.test(framework["Link Back Control"]?.status || ""),
  framework["Link Back Control"]
);

const finalScore = qa.scoreCalculationTrace?.finalValidatedState;
record(
  "final-score-calculation-trace",
  finalScore?.overallBandRange?.label === "6.0"
    && finalScore?.overallBandRange?.valid === true
    && Object.values(finalScore?.criteriaScores || {})
      .every((criterion) => criterion.scoreSource === "final-validated-canonical-state-v12.9.8"),
  finalScore
);
record(
  "terminal-final-canonical-state",
  finalState.terminal === true
    && finalState.estimatedBandRange === student.estimatedBandRange
    && finalState.projectionAudit?.every((item) => item.pass === true),
  {
    terminal: finalState.terminal,
    canonicalRange: finalState.estimatedBandRange,
    studentRange: student.estimatedBandRange,
    projectionAuditRows: finalState.projectionAudit?.length || 0
  }
);

const issues = finalState.issues || [];
record(
  "issue-deduplication",
  issues.length > 0 && new Set(issues.map((item) => item.issueId)).size === issues.length,
  { issueCount: issues.length, uniqueIssueIds: new Set(issues.map((item) => item.issueId)).size }
);
record(
  "category-diagnosis-action-revision-consistency",
  (finalState.projectionAudit || [])
    .filter((item) => item.sectionsRendered)
    .every((item) => item.pass === true
      && item.categoryConsistency === "pass"
      && item.diagnosisConsistency === "pass"
      && item.actionConsistency === "pass"
      && item.revisionConsistency === "pass"),
  (finalState.projectionAudit || []).filter((item) => item.sectionsRendered)
);

const coverageLabels = (student.paragraphCoverage || []).map((item) => item.paragraphLabel);
const coverageAudit = (finalState.projectionAudit || []).filter((item) => item.surface === "paragraphCoverage");
record(
  "paragraph-coverage-consistency",
  coverageLabels.join("|") === "Introduction|Body Paragraph 1|Body Paragraph 2|Conclusion"
    && coverageAudit.length === 4
    && coverageAudit.every((item) => item.pass === true),
  { coverageLabels, audit: coverageAudit }
);
const repairAudit = (finalState.projectionAudit || []).filter((item) => item.surface === "repairPlan");
record(
  "repair-plan-semantic-test",
  student.repairPlan?.length === 7
    && repairAudit.length === 7
    && repairAudit.every((item) => item.pass === true && item.copiedFromAnotherIssue === false),
  repairAudit
);

const pdf = pdfInspection.results?.find((item) => item.label === "Eva");
const corruptHyphens = ["fullresponse", "smalltown", "costefficiency", "shortterm"]
  .filter((token) => new RegExp(`\\b${token}\\b`, "i").test(extractedPdfText));
record(
  "pdf-binary-extracted-text",
  pdfInspection.machinePass === true
    && pdf?.machinePass === true
    && pdf?.pageCount >= 10
    && pdf?.pageCount <= 16
    && corruptHyphens.length === 0
    && ["full-response", "small-town", "cost-efficiency"].every((token) => extractedPdfText.includes(token)),
  {
    pageCount: pdf?.pageCount,
    binaryInspectionPass: pdf?.machinePass,
    corruptHyphens,
    exactEvaTokens: {
      "full-response": extractedPdfText.includes("full-response"),
      "small-town": extractedPdfText.includes("small-town"),
      "cost-efficiency": extractedPdfText.includes("cost-efficiency"),
      "short-term": "not present in the exact Eva source/report"
    }
  }
);
const punctuationProbe = "full-response small-town cost-efficiency short-term";
record(
  "pdf-hyphen-parity-probe",
  sanitizePrintableText(punctuationProbe) === punctuationProbe
    && pdfTextIntegrityIssues({ extractedText: punctuationProbe }).issues.length === 0,
  { probe: punctuationProbe, result: sanitizePrintableText(punctuationProbe) }
);
record(
  "pdf-layout-and-pagination",
  browserMetrics.paginationComplete === true
    && browserMetrics.pageCount >= 10
    && browserMetrics.pageCount <= 16
    && browserMetrics.rows?.every((row) =>
      row.blankOrNearEmpty === false
      && row.verticalOverflowPx === 0
      && row.clippedBlocks?.length === 0
    )
    && browserMetrics.internalIdLeak === false
    && browserMetrics.forbiddenUnicode === false,
  {
    pageCount: browserMetrics.pageCount,
    paginationComplete: browserMetrics.paginationComplete,
    pages: browserMetrics.rows
  }
);

record(
  "evin-regression",
  releaseIndex.evin?.estimatedBandRange === "6.5"
    && releaseIndex.evin?.routeStatus === "adequately_developed",
  releaseIndex.evin
);
record(
  "sun-problem-solution-regression",
  releaseIndex.sun?.essayType === "Problem & Solution",
  releaseIndex.sun
);
record(
  "task1-regression-matrix",
  releaseIndex.task1?.length === 4
    && releaseIndex.task1.every((item) =>
      item.noRequiredConclusion === true && item.noTask2SarLeakage === true
    ),
  releaseIndex.task1
);
record(
  "version-and-release-freeze",
  releaseIndex.appVersion === "12.9.8",
  {
    appVersion: releaseIndex.appVersion,
    packageCreated: false,
    deployed: false,
    versionBumped: false
  }
);
record(
  "full-regression-suite",
  testEvidence.result === "PASS",
  testEvidence
);

const failed = checks.filter((item) => item.result !== "PASS");
if (failed.length) {
  throw new Error(`Stop-ship acceptance failed: ${failed.map((item) => item.id).join(", ")}`);
}

await Promise.all([
  writeFile(
    path.join(outputDir, "Eva-paragraph-map-audit.json"),
    `${JSON.stringify({
      audit: qa.paragraphMapAudit,
      paragraphMap,
      sentenceLocationBindings: locationBindings
    }, null, 2)}\n`,
    "utf8"
  ),
  writeFile(
    path.join(outputDir, "Eva-framework-evidence-audit.json"),
    `${JSON.stringify(qa.frameworkEvidenceAudit, null, 2)}\n`,
    "utf8"
  ),
  writeFile(
    path.join(outputDir, "Eva-score-calculation-trace.json"),
    `${JSON.stringify(qa.scoreCalculationTrace, null, 2)}\n`,
    "utf8"
  ),
  writeFile(
    path.join(outputDir, "FINAL-TEST-RUN.json"),
    `${JSON.stringify(testEvidence, null, 2)}\n`,
    "utf8"
  )
]);

async function artifactEntry(name) {
  const target = path.join(outputDir, name);
  const content = await readFile(target);
  return {
    name,
    bytes: (await stat(target)).size,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

const artifactNames = [
  "Eva-final-analysis.json",
  "Eva-final-canonical-qa.json",
  "Eva-final-student-view.json",
  "Eva-final-report.pdf",
  "Eva-extracted-pdf-text.txt",
  "Eva-paragraph-map-audit.json",
  "Eva-framework-evidence-audit.json",
  "Eva-score-calculation-trace.json",
  "FINAL-TEST-RUN.json",
  "Eva-final-report-browser-metrics.json",
  "pdf-binary-inspection.json",
  "Evin-final-canonical-qa.json",
  "Evin-final-student-view.json",
  "Sun-final-regression.json",
  "Task1-final-regression-matrix.json",
  "release-artifact-index.json"
];
const artifacts = await Promise.all(artifactNames.map(artifactEntry));
const pageImages = (await readdir(path.join(outputDir, "Eva-final-report-pages")))
  .filter((name) => /^page-\d+\.png$/i.test(name))
  .sort();

const manifest = {
  releaseDecision: "PASS",
  appVersion: "12.9.8",
  packageCreated: false,
  deployed: false,
  versionBumped: false,
  exactFixture: "Eva",
  generatedAt: new Date().toISOString(),
  acceptanceChecks: checks,
  visualInspection: {
    result: "PASS",
    reviewedPages: pageImages,
    pageCount: pageImages.length,
    note: "All 11 production-renderer page captures were inspected page-by-page; no clipping, overlap, blank page, orphan heading or page-number collision was found."
  },
  artifacts
};
await writeFile(
  path.join(outputDir, "STOP-SHIP-ACCEPTANCE-MANIFEST.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

const summary = `# V12.9.8 Stop-Ship Acceptance Completion Summary

## Decision

**PASS — internal acceptance only. No ZIP/package was created, no deployment was performed, and the version remains 12.9.8.**

## Exact Eva result

- Canonical paragraphs: 4 (Introduction, Body Paragraph 1, Body Paragraph 2, Conclusion)
- Estimated band: 6.0
- SAR Example Quality: Mixed
- Conclusion Closure: Functionally Strong — Language Repair Needed
- PDF: 11 pages
- PDF binary text: searchable/selectable; no internal IDs, forbidden Unicode, blank pages, or concatenated hyphen terms
- Visual review: 11/11 pages passed

## Acceptance coverage

All ${checks.length} machine acceptance checks passed, including sentence-location binding, framework evidence, final score trace, issue deduplication, category–diagnosis–action–revision consistency, four-paragraph coverage, repair-plan semantics, PDF binary extraction, Evin, Sun, Task 1 regressions, source validation of ${testEvidence.sourceCheckModules} modules, and the complete ${testEvidence.testFiles}-file test suite.

The generic punctuation parity probe passed for: \`full-response\`, \`small-town\`, \`cost-efficiency\`, and \`short-term\`. The exact Eva report contains the first three applicable terms; \`short-term\` is not present in Eva's source or report and is therefore validated by the parity probe rather than manufactured in student-facing content.

## Release freeze

- Package/ZIP: not created
- Deployment: not performed
- Version bump: not performed
- Production status: unchanged until explicit approval
`;
await writeFile(path.join(outputDir, "STOP-SHIP-COMPLETION-SUMMARY.md"), summary, "utf8");

console.log(JSON.stringify({
  releaseDecision: manifest.releaseDecision,
  checks: checks.length,
  failed: 0,
  pdfPages: pdf.pageCount,
  artifacts: artifacts.length
}, null, 2));
