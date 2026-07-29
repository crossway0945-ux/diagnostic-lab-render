# V12.9.7 Release Manifest

Release type: production-ready source candidate, not deployed.

## Identity

- Authoritative source: `diagnostic-lab-v12.9.0-internal-validation.zip`
- Verified starting package version: 12.9.0
- Final package/app version: 12.9.7
- Engine version: `ielts-diagnostic-engine-v12.9.7`
- Report schema: `ielts-diagnostic-report-v12.9.7`
- Feedback schema: `feedback-integrity-v12.9.7`
- Framework evidence contract: `framework-evidence-contract-v12.9.7`
- PDF text integrity: `pdf-text-integrity-v12.9.7`
- Rubric version: `kru-pom-ielts-writing-v12.3.0` (unchanged)
- Preserved wrapper: `diagnostic-lab-v12-8-0-upload-ready/`

## Root-cause corrections

1. Positive framework labels could be inherited from provider prose or the absence of a complaint.
   `domain/frameworkEvidence.js` now requires typed, traceable positive evidence for every positive
   framework rating and fails closed when such evidence is absent.
2. SAR/support was treated as an essay-wide boolean. It is now aggregated per body paragraph:
   explicit example plus complete support is strong; a complete causal explanation may be sufficient
   without an example; an incomplete mechanism is a development repair; mixed paragraphs produce
   `Mixed`.
3. Several report sections projected independently. The canonical issue graph now provides one
   stable issue/action/revision reference, and projection/reference audits fail closed on drift.
4. Two issues sharing one sentence could select the first card by sentence alone. The renderer now
   matches both source sentence and canonical category, preventing Thesis-to-Body Promise from
   inheriting Comparative Judgement's action.
5. A present conclusion could erase a validated new-material defect. Conclusion completeness no
   longer overrides a `Conclusion Closure` issue in Paragraph Coverage or framework diagnosis.
6. Summary filtering occurred before all merges. Final density planning now runs after canonical
   reconciliation and enforces minimum value, priority retention and deduplication on the actual
   student-facing set.
7. Unicode checks covered only the BMP. Student and PDF gates now reject noncharacters in every
   Unicode plane, lone surrogates, replacement glyphs and unsafe invisible break characters while
   preserving legitimate hyphens and dashes.

## Main source changes

- Added: `domain/frameworkEvidence.js`
- Added: `qa/build-release-artifacts.mjs`
- Added: `qa/render-release-pdfs.mjs`
- Added: `qa/inspect-release-pdfs.py`
- Added: `tests/v12-9-7-framework-evidence-contract.test.mjs`
- Modified: `domain/canonicalDevelopmentEvidence.js`
- Modified: `domain/canonicalIntegrity.js`
- Modified: `domain/canonicalIssueGraph.js`
- Modified: `domain/evidenceAssertions.js`
- Modified: `domain/feedbackIntegrity.js`
- Modified: `domain/pdfTextIntegrity.js`
- Modified: `domain/reportConsistency.js`
- Modified: `domain/reportDensity.js`
- Modified: `domain/textIntegrity.js`
- Modified: `services/aiAnalyzer.js`
- Modified: `services/analysisVersions.js`
- Modified: `services/publicAssetGraph.js`
- Modified: `services/qaCanonicalExport.js`
- Modified: `script.js`
- Modified: `render.yaml`
- Modified: package metadata and affected permanent regression tests.

The generated `CHANGED-FILES-v12.9.7.txt` is the exact machine-computed list against the
authoritative source. The changed-files ZIP contains fewer than 100 files for GitHub web upload.

## Test and artifact results

```text
npm run check
  PASS — Source check passed: 101 JavaScript modules.

npm test
  PASS — Static preview: 32 files / 24 modules.
  PASS — Test suite: 41 files.

node tests/v12-9-6-paired-route-and-prose.test.mjs
  PASS

node tests/v12-9-7-framework-evidence-contract.test.mjs
  PASS
```

Browser and PDF:

- in-app browser inspected the actual Eva and Evin print projections;
- Chrome exported the same actual local print URLs to binary PDF;
- Eva: 13 pages, 19,690 extracted characters;
- Evin: 12 pages, 17,827 extracted characters;
- vertical overflow: 0 px;
- horizontal overflow: 0 px;
- clipped protected blocks: 0;
- footer/page-number collisions: 0;
- internal-ID patterns: 0;
- forbidden Unicode: 0;
- page numbering: 25/25;
- searchable/selectable text: 25/25;
- visual inspection: 25/25.

## Provider status

- Deterministic current engine: PASS.
- Authoritative provider-output replay through the current normalization and consistency gates: PASS.
- Live provider call: BLOCKED — no local provider credential was available.

No claim of live-provider PASS is made.

## Packaging exclusions

The full ZIP excludes `node_modules`, `.env`, secrets, runtime users, runtime reports, audit data,
logs, probes, browser cache, temporary print fixtures, QA snapshots and generated static-preview
output. Source files, tests and QA scripts are preserved.

## Render settings

```text
Root Directory: diagnostic-lab-v12-8-0-upload-ready
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
Node Version: 22.16.0
```
