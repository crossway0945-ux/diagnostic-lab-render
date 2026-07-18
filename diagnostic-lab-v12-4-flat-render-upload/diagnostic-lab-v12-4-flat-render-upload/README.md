# IELTS Writing 7+ Diagnostic Lab — V12.0.4 Flat Render Upload

This release keeps the V12 diagnostic/report application intact and fixes the Render path problem by placing `package.json` directly inside the configured Render Root Directory.

## Repository layout

Upload the complete folder to the GitHub repository root:

```text
diagnostic-lab-v12-4-flat-render-upload/
├── package.json
├── package-lock.json
├── server.js
├── reports/
├── services/
└── tests/
```

There is no `app/` wrapper folder and no second nested project folder.

Required GitHub path:

```text
diagnostic-lab-v12-4-flat-render-upload/package.json
```

## Exact Render settings

```text
Root Directory: diagnostic-lab-v12-4-flat-render-upload
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
NODE_VERSION: 22.16.0
```

With these settings Render reads:

```text
/opt/render/project/src/diagnostic-lab-v12-4-flat-render-upload/package.json
```

## Local verification

From the project folder:

```bash
npm install
npm run build:static
npm run check
npm test
npm start
```

## V12 report architecture

- Student HTML and Student PDF use the explicit `StudentReportViewModel.v12` projection.
- Internal validation data uses the separate `AdminReportQAViewModel.v12`.
- `reports/studentReportTemplate.js` is the authoritative student report template.
- `GET /api/reports/:reportId/pdf` generates the official PDF through an isolated server-side headless browser.
- Thai/English extraction, internal-ID exclusion, protected-block pagination, and same-submission-group progress integrity are covered by the V12 QA suite.

## Production environment

Keep secrets only in Render Environment Variables. Do not upload a real `.env`, local data, caches, `node_modules`, or student reports.
