# V12.8.3 — Canonical Diagnostic Integrity (module + verified corrections)

**Status: FULLY WIRED into the production analysis pipeline.** The canonical corrections for defects
A–H are implemented in `domain/canonicalIntegrity.js`, invoked automatically by `analyzeWriting()` for
every completed Task 2 analysis (before the canonical analysis and all downstream sections are built),
verified against the real exported QA fixture (`695dcee4c5a8d808c49db2a0`), and locked in by an
integration test. The Task 2 underlength 502 regression is fixed. Do not deploy automatically.

### The regression and its real root cause
Top Issues reference their detailed card by a **1-based positional id** (`feedbackCardId: "card-N"`)
and `validateReportOutput` enforces that link plus category/evidence agreement. Correcting and
de-duplicating the canonical layer changes card positions, so the previously-stamped ids became stale
→ *"Top issue N is not linked to a valid detailed feedback card"* → `REPORT_OUTPUT_VALIDATION_FAILED`
(502). Fixed by `relinkTopIssues()`, which re-points every top issue at the index its card actually
occupies, syncs the compared fields, drops a top issue whose card was merged away, and applies the
shared priority order. Verified load-bearing by a mutation test: bypassing the wiring makes the
integration test fail (`Top Issues are ordered most-severe first`).

## 1. Starting version
`package.json` / `appVersion` **12.8.2** → **12.8.3**. `rubricVersion`, `promptVersion`,
`issueTaxonomyVersion` and all scoring calibration unchanged. Frozen score of the fixture is untouched
(TR 6.5 / CC 6.0–6.5 / LR 6.0 / GRA 6.0 / overall 6.0–6.5 — verified after correction).

## 2. Confirmed root causes (reproduced from the real JSON, before any edit)
| Defect | Reproduced evidence |
|---|---|
| A | `issue-b1eeca53`: `primaryCategory: "Cause Route Clarity"`, `evidenceAssertionType: "route_gap"`, `repairTargets: []`, while the diagnosis is purely about the meaning of a quoted word |
| B | `Prompt Coverage: Strong` + `Body Route Alignment: Aligned` coexisting with `Thesis Route Clarity: Needs Work — "missing at least one traceable required route"` |
| C | Signature `Task 2\|paragraph-2\|7\|Countability\|946\|973\|countability` present **twice** |
| D | `topIssues` = Moderate, Moderate, **Major** (Major last) |
| E | `sentenceRole: causal_mechanism` (+result/consequence) but `sentenceFunction: "could not be determined safely"`; revision forced to Teacher-Guided Expansion by a false "new affected group" claim |
| F | 3 Student Actions failed with "does not identify the local repair span" although one was pedagogically precise |
| G | Summary claimed "frequent grammar and collocation errors" against ~1 occurrence per family |
| H | Repair Plan contained Cause-Route-order drills produced by defect A |
| §11 | The persisted `taskInput.studentWriting` contains `"congestion. Therefore"` **with a space** → no punctuation defect exists; none is fabricated |

## 3. Corrections implemented (`domain/canonicalIntegrity.js`) and verified on the real fixture
```
A primary category   Cause Route Clarity → Lexical Precision
A evidence assertion route_gap → lexical_meaning
A repair target      populated: "unconsciousness"   (secondary keeps the route effect only)
A student action     regenerated, specific, passes validation
C Countability       2 → 1 canonical issue (idempotent)
D top issue          Sentence Completion [Major] first
E sentence function  "This sentence explains how one step leads to the next, and states the result…"
E revision type      Teacher-Guided Expansion → Route-Preserving Revision (status pass)
G summary            "frequent" removed (quantity-aware wording)
B thesis route       no longer claims a missing route (cross-section gate, V12.8.1)
score                unchanged (6.0-6.5)
```
Rules are structural — sentence role, route presence, diagnosis semantics, target span, revision
content — with **no fixture wording, issue id or score hardcoded**. Guards proven by test: a genuine
missing-route diagnosis is *not* reclassified; Task 1 visual taxonomy is untouched; issues lacking
canonical detail are never merged; a genuinely new affected group is still detected; generic Student
Actions are still rejected; a genuinely recurring family keeps its frequency wording.

## 4. Tests — exact commands and results
```
node scripts/check-source.mjs                                    → 84 JavaScript modules
node scripts/build-static-preview.mjs && node scripts/run-tests.mjs → Test suite passed: 30 files
node tests/v12-8-3-canonical-integrity.test.mjs                  → pass (22 assertions)
```
All existing Task 1/Task 2, scoring, async-render, quota, auth, ownership, provider, QA-export and PDF
tests remain green.

## 5. Files changed / untouched
**New:** `domain/canonicalIntegrity.js`, `tests/v12-8-3-canonical-integrity.test.mjs`, this manifest.
**Changed:** `services/aiAnalyzer.js` (live integration point: `applyCanonicalIntegrity` is invoked
before `buildCanonicalAnalysis` for every Task 2 analysis, and its re-linked Top Issues are passed
through), `package.json` / `package-lock.json` / `services/analysisVersions.js` (12.8.3).
**Carried from 12.8.1/12.8.2:** `domain/reportConsistency.js` + `domain/reportViewModels.js` (enforced
cross-section gate), `services/qaCanonicalExport.js` + admin QA Export UI/endpoints.
**Deliberately untouched:** scoring/calibration, rubric/prompt/taxonomy versions, route detection,
LFC-CPC / SAR / TEEL, Targeted Revision engine, Task 1 visual logic, async-render, auth, sessions,
quota, ownership, pricing, PDF layout, student-facing copy.

## 6. Deliverables produced
- `sun-corrected-canonical-qa.json` — corrected canonical issues, feedbackCards, topIssues, executive
  summary, student view; `paragraphCoverage` honestly marked `NOT_PERSISTED_IN_THIS_REPORT_VERSION`.
- `sun-corrected-student-view.json` — student view after the cross-section gate.

## 7. End-to-end verification through the ACTUAL pipeline
The real Sun submission (prompt + writing from the exported QA JSON) was run through `analyzeWriting()`
and projected with `buildStudentReportViewModel()`:
```
top issues        : card-2:Sentence Completion[Major] > card-1:Countability[Moderate]
lexical-meaning filed as route_gap : 0
duplicate canonical signatures     : 0
undetermined sentence functions    : 0
unsupported "frequent" in summary  : none
STUDENT VIEW top issues            : Sentence Completion[Major] > Countability[Moderate]
STUDENT VIEW sections              : 15 (allowlist assertion passes → no unsupported field)
```
Artifacts: `sun-pipeline-canonical.json`, `sun-pipeline-student-view.json`,
`sun-corrected-canonical-qa.json`, `sun-corrected-student-view.json`.

**No report schema mutation:** the wiring writes only to the existing `mainScoreLimitingFactor` field.
`assertStudentReportViewModel` (strict allowlist) passes, which it would not if an unsupported field
were introduced.

## 8. Remaining limitations (honest)
1. **PDF not regenerated / extracted-text parity not verified** — this environment has no Chromium and
   no PDF text extractor (verified: extraction returns 0 characters). Run your PDF QA after deploy.
2. **No real gpt-5.6-sol run** — provider-side verification remains PENDING on your key. The local
   deterministic engine produces a different (smaller) card set than the provider, so the fixture's
   specific issue ids are not reproduced end-to-end; the *invariants* are, and the fixture-level
   corrections are verified directly by the unit tests.
3. Repair Plan (H) and Paragraph Coverage (§12) now inherit the corrected taxonomy automatically, but
   their student-visible effect should be confirmed on your next real analysis.

## 9. Readiness verdict — CONDITIONAL (deploy to production for acceptance testing)
The corrections are wired, automatic for every completed analysis, verified against real production
data, locked by a mutation-proven integration test, and all 30 test files pass with the integration
enabled. **Not yet sale-ready**: real-provider regression and PDF text-integrity remain PENDING on your
environment. Do not claim commercial readiness from these automated tests alone.

## 9. Deployment
GitHub path: `/diagnostic-lab-v12-8-0-upload-ready/package.json` (unchanged).
Render: Root Directory `diagnostic-lab-v12-8-0-upload-ready`, Build `npm install`, Start `npm start`.
Confirm: `/api/health` → `"appVersion":"12.8.3"`. After deploy, run one real analysis and check that a Major issue leads Top Issues.
**Rollback:** redeploy the previous commit. This release adds one module plus a disabled integration
point, so reverting is low-risk; saved reports, progress, quotas and QA snapshots are unaffected.
