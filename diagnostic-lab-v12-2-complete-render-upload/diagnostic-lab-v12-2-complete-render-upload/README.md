# IELTS Writing 7+ Diagnostic Lab — V12.0.2 Complete Render Upload

This is the complete V12 student-report architecture packaged for the existing GitHub-upload → Render workflow. The canonical Task 1/Task 2 diagnostic engine remains the scoring source. V12 rebuilds the student-facing report projection, pagination, PDF generation, bilingual text pipeline, and progress-version integrity.

## Exact upload structure

Extract `diagnostic-lab-v12-2-complete-render-upload.zip` and upload the entire folder below to the GitHub repository root:

```text
diagnostic-lab-v12-2-complete-render-upload
```

The repository must contain:

```text
diagnostic-lab-v12-2-complete-render-upload/package.json
diagnostic-lab-v12-2-complete-render-upload/package-lock.json
diagnostic-lab-v12-2-complete-render-upload/server.js
diagnostic-lab-v12-2-complete-render-upload/reports/
diagnostic-lab-v12-2-complete-render-upload/services/
diagnostic-lab-v12-2-complete-render-upload/tests/
```

Do not flatten the package into the repository root and do not create a second folder with the same name.

## Exact Render settings

```text
Root Directory: diagnostic-lab-v12-2-complete-render-upload
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

Node.js is constrained to major version 22 by `.node-version` and `package.json`.

## Local verification

Run from inside `diagnostic-lab-v12-2-complete-render-upload`:

```bash
npm install
npm run build:static
npm run check
npm test
```

## V12 report architecture

- Student HTML and Student PDF use the explicit `StudentReportViewModel.v12` projection.
- Internal validation data uses the separate `AdminReportQAViewModel.v12`.
- `reports/studentReportTemplate.js` is the authoritative student report template.
- `GET /api/reports/:reportId/pdf` generates the official PDF through an isolated server-side headless browser.
- Thai/English text extraction, internal-ID exclusion, protected-block pagination, and same-submission-group progress integrity are covered by the V12 QA suite.

## Production environment

Use the existing production environment values and persistent disk. Do not upload `.env` or replace production data. See `RENDER_ENV_TEMPLATE.txt`.

## Post-deployment smoke test

After deployment, verify login, saved-report access, English and Thai PDF download, searchable text, seven repair days, progress-version integrity, no duplicate credit use, and clean Render PDF/font logs.
