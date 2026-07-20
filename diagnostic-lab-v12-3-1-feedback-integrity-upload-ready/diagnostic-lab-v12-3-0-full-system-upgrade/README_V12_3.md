# IELTS Writing 7+ Diagnostic Lab V12.3.1

Production IELTS Writing Task 1 and Task 2 diagnostic system with canonical evidence, bilingual student-safe reports, protected admin QA fields, progress history, quota controls, and searchable A4 PDF export.

## Runtime and deployment

```text
Node.js: 22.16.0
Root Directory: diagnostic-lab-v12-3-0-full-system-upgrade
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

Upload the extracted project folder to the GitHub repository root. GitHub must contain `diagnostic-lab-v12-3-0-full-system-upgrade/package.json`. Do not use the ZIP filename as Root Directory and do not create a duplicated nested folder.

Copy non-secret production settings from `RENDER_ENV_TEMPLATE.txt`. Set `OPENAI_API_KEY`, `OPENAI_MODEL`, `SESSION_SECRET`, and `ADMIN_SECRET` only in Render. Persistent production storage uses `/var/data` as declared in `render.yaml`.

## Verification

```bash
npm install
npm run check
npm test
npm start
```

The student report uses an explicit `StudentReportViewModel`. Internal fingerprints, IDs, provider diagnostics, validation details, migration fields, and engine metadata are excluded from the student renderer and PDF.
