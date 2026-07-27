# V12.8.2 — Canonical QA Export (admin-only) + V12.8.1 consistency gate

Patch release on V12.8.0. Adds the admin-only **Export Canonical QA JSON** feature so Kru Pom can
export one report's internal canonical diagnostic data from the Admin page — without Render Shell or
manual disk access — and carries the V12.8.1 enforced consistency gate. **No deploy performed.**

## 1. Starting version (verified from code, not filenames)
`package.json` / `appVersion` was **12.8.0** → now **12.8.2**. rubricVersion, promptVersion,
issueTaxonomyVersion and all scoring/calibration logic are **unchanged**.

## 2. Do current reports contain canonical data? (§1 audit — the key finding)

**Partially — better than expected.** In `buildSubmissionHistoryRecord` (`services/apiRouter.js`), the
report is passed through `projectCanonicalAnalysis(analysis.canonicalAnalysis, …)` **before**
`commitAnalysis` writes it to disk. That strips the **top-level aggregate** (`canonicalAnalysis`,
`canonicalRoute`, `frozenScoring`, `reportConsistencyAudit`, provider metadata).

**However, the saved `report.feedbackCards` retain the full per-issue canonical layer** — verified on
the real Sun record: `issueCategory` / `primaryCategory` / `secondaryCategories`, `sentenceRole`,
`revisionType`, `evidenceValidationStatus`, `revisionAlignmentStatus`, `repairTargets`,
`issueSignature`, `mergedCandidateIds`, evidence offsets, and more. The record also persists
`sourceInput` (prompt + writing), `kruPomScores`, `criteriaScores` and versions.

**Consequence:** existing reports export a **substantial, genuinely useful** QA file (enough to
reproduce the remaining category/revision-type/dedup defects). Fields that were never persisted are
marked `{"available": false, "reason": "NOT_PERSISTED_IN_THIS_REPORT_VERSION"}` — never fabricated.
Reports with no canonical layer at all return `CANONICAL_QA_NOT_AVAILABLE`.

**Exact strip stage:** `buildSubmissionHistoryRecord` → `projectCanonicalAnalysis`, before
`storage.commitAnalysis`.

## 3. New: full QA snapshot for FUTURE analyses (§7)
`persistQaSnapshot` writes an admin-only snapshot from the **pre-projection** analysis object to
`DATA_DIR/qa-canonical/<reportId>.json` — atomically (temp+rename), redacted, one file per report,
after the report commits, on **both** the sync and async-render paths. It never calls the provider,
never touches quota, never alters the saved report, and never throws into the student's analysis.
Retention: `DIAGNOSTIC_QA_EXPORT_RETENTION_DAYS` (default: keep all; set e.g. 30 to prune).

## 4. Endpoints (admin session verified server-side; no secret in URL)
- `GET /api/admin/qa-reports[?q=…]` — safe searchable metadata only (report id, student, date, task,
  essay/visual type, band, app/engine version, canonical-data availability). Never content.
- `GET /api/admin/qa-reports/:reportId/export` — one report, `attachment; filename=…`, `no-store`.
Errors: `ADMIN_REQUIRED` (403) · `REPORT_NOT_FOUND` (404) · `CANONICAL_QA_NOT_AVAILABLE` (409) ·
`CANONICAL_QA_EXPORT_FAILED` (500). All JSON, never HTML. A safe audit event is logged per export.

## 5. Redaction (§5)
`redactForQa` drops secret-shaped keys at any depth (api key, openai, authorization, session/admin
secret, password/hash, cookie, token, env, system prompt, raw provider, stack) and scrubs
`sk-…`/`Bearer …` values. The selected student's own prompt + writing are included (required to
reproduce); no other student's data is ever included.

## 6. Tests — exact command and result
```
node scripts/check-source.mjs   → Source check passed: 82 JavaScript modules.
node scripts/build-static-preview.mjs && node scripts/run-tests.mjs
                                → Test suite passed: 29 files.
```
New `tests/v12-8-2-canonical-qa-export.test.mjs` verifies: admin can list; **student/teacher/anonymous
get 403 JSON** on both endpoints; admin exports exactly one report; another student's prompt/writing/id
never appear; canonical per-issue layer present; old report → `CANONICAL_QA_NOT_AVAILABLE`; no API key,
session secret, password hash or system prompt in the export; **path traversal refused** (3 encodings,
no user-store leak); unknown report → JSON 404; export **does not call the provider** (fetch throws if
attempted), **does not change quota/teacher usage**, **does not alter submission-history**; snapshot
writes atomically and redacts secrets. All existing async-render, scoring, feedback-integrity and PDF tests
remain green (29/29).

## 7. Files changed
**New:** `services/qaCanonicalExport.js`, `tests/v12-8-2-canonical-qa-export.test.mjs`.
**Changed:** `services/apiRouter.js` (2 admin endpoints, QA helpers, `persistQaSnapshot` on both commit
paths, `handleAnalyze` receives `rootDir`), `admin.html` + `admin.js` + `styles.css` (Canonical QA
Export panel: search, select one, export, availability labels), `package.json`/`package-lock.json`/
`services/analysisVersions.js` (→ 12.8.2). Plus V12.8.1: `domain/reportConsistency.js`,
`domain/reportViewModels.js`, `tests/v12-8-1-final-consistency-gate.test.mjs`.
**Deliberately untouched:** scoring/calibration, rubric/prompt/taxonomy versions, route detection,
LFC-CPC/SAR/TEEL, Targeted Revision logic, async-render, auth, quota, pricing, PDF layout, and all
student-facing report copy.

## 8. Do you need a new analysis before exporting?
**No for most cases** — existing reports already export their per-issue canonical layer. **Yes for the
full snapshot** (top-level canonical analysis, route object, consistency audit, provider metadata):
those exist only for analyses run **after** this release is deployed.

## 9. How Kru Pom exports the JSON
1. Log in as **admin** → open `/admin`.
2. Scroll to **Canonical QA Export** → click **Load reports**.
3. Search by student name / report ID / date / task type, then **click one row** to select it.
4. Click **Export Canonical QA JSON** → the file downloads as
   `diagnostic-qa-<student>-<reportId>.json`.
5. The row label shows availability: *full canonical snapshot* / *partial (from saved record)* /
   *canonical data unavailable*.

## 10. Deployment (unchanged root)
GitHub path: `/diagnostic-lab-v12-8-0-upload-ready/package.json`.
Render: Root Directory `diagnostic-lab-v12-8-0-upload-ready`, Build `npm install`, Start `npm start`.
Optional env: `DIAGNOSTIC_QA_EXPORT_RETENTION_DAYS=30`.
Confirm live: `/api/health` → `"appVersion":"12.8.2"`.

## 11. Rollback
Redeploy the previous commit. The QA snapshot directory (`DATA_DIR/qa-canonical/`) is additive and
separate from student reports — deleting it affects nothing else. Student reports, progress history
and quotas are untouched by this feature.

## 12. Honest limitations
- The 6 remaining report-integrity defects (#2 taxonomy, #5 revision type, #6 Introduction dimensions,
  #7 Conclusion, #8 punctuation issue, #9 PDF extracted-text parity) are **not** fixed in this release —
  this feature is the tool that makes them reproducible.
- PDF text-integrity verification still requires Chromium + a PDF extractor on your side.
- No real gpt-5.6-sol run was performed here; provider-side verification remains PENDING.
