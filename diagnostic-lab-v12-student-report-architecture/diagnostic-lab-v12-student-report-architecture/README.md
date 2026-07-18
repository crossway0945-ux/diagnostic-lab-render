# IELTS Writing 7+ Diagnostic Lab - V12 Student Report Architecture

Private diagnostic application for Kru Pom IELTS students. The canonical Task 1/Task 2 diagnostic engine remains the scoring source; V12 rebuilds the student-facing report projection, pagination, PDF generation, bilingual text pipeline, and progress-version integrity.

## Upload folder and Render root

Use this exact folder name after extracting the ZIP:

```text
diagnostic-lab-v12-student-report-architecture
```

Render settings:

```text
Root Directory: diagnostic-lab-v12-student-report-architecture
Build Command: npm ci
Start Command: npm start
Health Check Path: /api/health
```

The GitHub repository must contain:

```text
diagnostic-lab-v12-student-report-architecture/package.json
```

The ZIP base name and Render Root Directory intentionally match. Enter `diagnostic-lab-v12-student-report-architecture` in Render without the `.zip` extension, and do not create a second nested folder with the same name.

## Requirements

- Node.js 22.13 or newer
- Production environment variables from `RENDER_ENV_TEMPLATE.txt`
- Persistent production data directory/disk as already configured

## Local run

```bash
npm ci
npm run dev
```

Open:

```text
http://127.0.0.1:4174/
```

## Verification commands

```bash
npm run build:static
npm run check
npm test
npm run qa:report -- --output ./qa/generated-v12
```

`npm test` includes the focused renderer rebuild test, existing Task 1/Task 2 regression suites, authentication, ownership, duplicate, quota, and credit-protection tests.

## V12 report architecture

### One student-facing model

Both Student HTML and Student PDF are rendered from:

```text
StudentReportViewModel.v12
```

The model is built through an explicit student-facing projection. Internal report IDs, submission-group IDs, fingerprints, engine metadata, migration proof, raw JSON, and technical progress traces are not serialized into the student report.

### Separate Admin QA model

Technical verification uses:

```text
AdminReportQAViewModel.v12
```

This internal model may contain validated version IDs, excluded legacy groups, grouping evidence, PDF QA, and duplicate-credit results. It is not used as the Student PDF data source.

### One authoritative report template

```text
reports/studentReportTemplate.js
```

The template is shared by the authenticated HTML route and the PDF route. It composes measured protected blocks into explicit A4 pages after fonts have loaded. A report is rejected instead of silently clipping a block that cannot fit.

### Clean server-side PDF

The official PDF endpoint is:

```text
GET /api/reports/:reportId/pdf
```

It loads the stored validated report, builds the student view model, launches an isolated headless browser with a temporary profile and extensions disabled, runs layout/overlay/text checks, and then generates the PDF. The application no longer uses the user browser print profile as the official PDF path.

### Searchable Thai-English text

The report embeds Thai and Latin font subsets from installed dependencies, sanitizes report text, verifies the Thai disclaimer, and extracts the final PDF with PDF.js. Release QA also runs `pdftotext` when available.

### Progress-version integrity

The student-facing latest-essay version count is shown only when every displayed version belongs to the current validated `submissionGroupId`. Mixed or ambiguous legacy groups cause the count to be omitted rather than guessed.

## Production environment

Create `.env` from `.env.example` for local development. In Render, set the variables listed in `RENDER_ENV_TEMPLATE.txt`, including the provider key/model, session/admin secrets, local JSON storage adapter, persistent data path, and full-engine requirement.

Important production values:

```text
NODE_ENV=production
HOST=0.0.0.0
DIAGNOSTIC_STORAGE_ADAPTER=local-json
DIAGNOSTIC_DATA_DIR=/var/data
DIAGNOSTIC_REQUIRE_FULL_ENGINE=true
DIAGNOSTIC_ANALYSIS_MODE=sync
DIAGNOSTIC_ENABLE_NETLIFY_BLOBS=false
OPENAI_BASE_URL=https://api.openai.com/v1/responses
OPENAI_TIMEOUT_MS=180000
OPENAI_MAX_OUTPUT_TOKENS=3500
OPENAI_REASONING_EFFORT=low
```

Render provides `PORT` automatically. Never place provider keys or secrets in frontend files.

## Data and access safeguards

- Login and session checks remain server-side.
- Reports are retrieved only from the authenticated account history.
- Student profile ownership, archive/delete workflows, quota, expiry, duplicate handling, and failed-report credit protection remain governed by the existing application services and regression tests.
- Do not reset or replace production data files during this upload.

## Post-deployment smoke test

After Render deploys the new folder:

1. Log in and open a saved validated report.
2. Download the official PDF in English and Thai.
3. Confirm no browser overlay or internal identifiers appear.
4. Confirm all seven repair days appear and the version count is validated or omitted.
5. Copy English revisions and the Thai disclaimer from the PDF.
6. Reopen the same report and confirm no duplicate progress entry or credit use.
7. Inspect Render logs for PDF/font/browser errors.

Local verification does not claim completion of these production-only checks.
