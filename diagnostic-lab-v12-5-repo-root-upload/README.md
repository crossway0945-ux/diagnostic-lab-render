# V12.0.5 — Repository-Root Upload

Upload the extracted CONTENTS directly to the GitHub repository root. `package.json` must be visible at the top level. In Render, leave **Root Directory empty**, use `npm ci`, `npm start`, and `/api/health`.

---

# IELTS Writing 7+ Diagnostic Lab — V12.0.3 Render-Safe Upload

This package preserves the V12 diagnostic/report application while changing the deployment wrapper so Render never expects `package.json` in the outer Root Directory.

## Repository layout

Upload the complete outer folder to the GitHub repository root:

```text
diagnostic-lab-v12-3-render-safe-upload/
├── render-build.sh
├── render-start.sh
├── RENDER_SETTINGS_EXACT.txt
└── app/
    ├── package.json
    ├── package-lock.json
    ├── server.js
    ├── reports/
    ├── services/
    └── tests/
```

Required GitHub path:

```text
diagnostic-lab-v12-3-render-safe-upload/app/package.json
```

## Exact Render settings

```text
Root Directory: diagnostic-lab-v12-3-render-safe-upload
Build Command: bash render-build.sh
Start Command: bash render-start.sh
Health Check Path: /api/health
NODE_VERSION: 22.16.0
```

The outer scripts enter `app/` explicitly before running npm. Do not replace the build/start commands with bare `npm install` or `npm start` in the outer directory.

## Local verification

From the outer folder:

```bash
bash render-build.sh
bash render-start.sh
```

For a code-only install in an environment that cannot access the Chrome download host:

```bash
PUPPETEER_SKIP_DOWNLOAD=true bash render-build.sh
```

## V12 report architecture

- Student HTML and Student PDF use the explicit `StudentReportViewModel.v12` projection.
- Internal validation data uses the separate `AdminReportQAViewModel.v12`.
- `reports/studentReportTemplate.js` is the authoritative student report template.
- `GET /api/reports/:reportId/pdf` generates the official PDF through an isolated server-side headless browser.
- Thai/English text extraction, internal-ID exclusion, protected-block pagination, and same-submission-group progress integrity are covered by the V12 QA suite.

## Production environment

Keep secrets only in Render Environment Variables. Do not upload a real `.env`, local data, caches, `node_modules`, or student reports.
