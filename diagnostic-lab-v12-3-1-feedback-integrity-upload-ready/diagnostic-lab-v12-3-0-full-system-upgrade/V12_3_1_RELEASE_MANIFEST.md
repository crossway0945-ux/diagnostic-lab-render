# V12.3.1 Production Hotfix Release Manifest

This release is the feedback-integrity and revision-alignment hotfix for the existing V12.3.0 production codebase. It does not deploy automatically and does not include secrets, saved reports, QA account data, generated QA images, or installed dependencies.

## Render settings

- Root Directory: `diagnostic-lab-v12-3-0-full-system-upgrade`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`
- Node.js: `22.16.0`

After extraction, GitHub must contain this exact path:

`diagnostic-lab-v12-3-0-full-system-upgrade/package.json`

Do not enter the ZIP filename as the Root Directory. Do not leave Root Directory blank. Do not add a second wrapper folder with the same name.

## Version contract

- Application, engine, prompt and report: `12.3.1`
- Protected IELTS rubric/calibration: `12.3.0`

The rubric version is intentionally unchanged because this release repairs feedback integrity, issue linking, revision fidelity, paragraph coverage and PDF reliability; it does not recalibrate scores.

## Release verification

- Source check: 48 JavaScript modules passed.
- Automated regression suite: 15 of 15 test files passed.
- Focused V12.3.1 tests cover canonical issue linking, sentence roles, evidence counts, paragraph coverage, conclusion separation, revision alignment and all four bounded PDF-retry outcomes.
- Thai and English authenticated QA reports were rendered and visually inspected page by page.
- PDF text layers passed independent `pypdf` and `pdfplumber/pdfminer` extraction with A4 size, complete page footers, no null characters, no replacement characters and no internal-field leakage.
- Authentication, roles, quota, duplicate cache, ownership, pricing and saved-report protections remain covered by the full regression suite.

## Security and packaging

The upload artifact excludes `.env`, `.git`, `node_modules`, generated static previews, local QA data/logs/PIDs, generated QA PDFs and rendered page images. Configure `OPENAI_API_KEY`, `OPENAI_MODEL`, `SESSION_SECRET` and `ADMIN_SECRET` only in Render environment variables.
