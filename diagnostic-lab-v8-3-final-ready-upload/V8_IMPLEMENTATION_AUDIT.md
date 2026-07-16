# V8 Final Sale-Readiness Audit (Pre-Implementation)

## Baseline provenance

- Input package: `diagnostic-lab-v7-production-calibration-fixed-upload(1).zip`
- Package integrity: ZIP test passed with no compressed-data errors.
- Git metadata in the supplied package: not present. The package is a flat deployment archive, not a Git working tree.
- Branch recorded by the preceding V7 audit: `main`.
- Baseline commit recorded by the preceding V7 audit: `c7e1c9797f24df27d1a0ed17aca67f6dfd18b991`.
- Production deployment commit: not recoverable from the supplied archive or production documentation. It must be verified in GitHub/Render before any production deployment.
- Baseline automated tests: passed (`diagnostic-api.test.mjs` and `v7-production-calibration.test.mjs`).
- Baseline V7 matrix: 24 Task 2 fixtures, one Evin regression, score arithmetic, revision fidelity, and archive/restore only.

## Teaching and regression evidence reviewed

- Task 1 authority: `Lesson 11 - IELTS Writing Task 1 Core System - FIXED(5).pdf` (45 pages).
- Task 2 authority: `IELTS Writing Band 7 Logic Task 2(3).pdf` (12 pages, visually reviewed/OCR extracted).
- Expanded framework: `IELTS Writing Lesson (Academic Writing)(8).pdf` (914 pages; relevant Task 1, Task 2, Golden Thread, SAR, LFC-CPC and task-type sections inspected).
- Regression reports: Evin, Eva and Poon Poon PDFs.

Confirmed teaching priorities:

- Task 1 introduction precision must retain visual type, reporting verb, subject, unit, category/item information, location and timeframe where supplied.
- Task 1 overview, grouping, comparison and data accuracy remain Task Achievement controls.
- Task 2 Golden Thread, thesis direction, body alignment, explanation, SAR and conclusion closure are teaching/diagnostic tools.
- SAR supports development but is not an automatic IELTS scoring cap.
- IELTS criteria and Kru Pom diagnostic frameworks must remain separate.

## Actual sources of truth in V7

| Concern | Current source(s) | Audit result |
| --- | --- | --- |
| Task 1 prompt and pedagogical rules | `services/promptBuilder.js`, `services/aiAnalyzer.js`, Task 1 schema and helper-specific guardrails | Multiple rule locations; visual-specific repair helpers are valuable but final score/summary projection is not canonical. |
| Task 2 task classification and route evidence | `services/task2Safety.js` | Main deterministic source, but only six canonical types and it silently defaults unknown prompts to Opinion. |
| Task 2 scoring | Provider criteria in `services/aiAnalyzer.js`, then low-band mutation, then `reconcileTask2CanonicalAnalysis()` | More than one score mutation stage exists before final display. |
| Overall score | `deriveTask2OverallBandRange()` plus older `estimatedBandRange`/cap fields and Task 1 helpers | Task 2 arithmetic exists, but legacy overall/cap fields still survive; Task 1 has separate calculations. |
| Cap logic | `services/task2Safety.js` and low-band/Task 1 helpers in `services/aiAnalyzer.js` | Explicit Task 2 metadata exists, but an older low-band layer still writes global overall fields independently. |
| Severity | Provider output, prompt enums, report rendering | No single enforced V8 taxonomy. `Needs Work`, `Strong`, `Moderate` and `Critical` are mixed with diagnostic meaning. |
| Revision type | Prompt, response schema, `applyTask2RevisionSafety()`, validator | Five-type V7 taxonomy conflicts with the required four-type V8 taxonomy. |
| Generic strategy | `enrichFeedbackStrategies()`, `enrichParagraphStrategies()`, `buildNextTimeStrategy()` | Automatically appends broad strategy text to multiple issue cards and paragraph actions. |
| Report/PDF | `script.js` dashboard and print renderer | Both read many top-level legacy fields independently; they do not project from one generic canonical analysis object. |
| Progress | `services/apiRouter.js`, `services/storage.js`, `script.js` | Progress stores the normalized report, but displayed score/framework fields are still legacy top-level values. |
| Student lifecycle | `services/storage.js`, `services/apiRouter.js`, `script.js` | Archive/restore exists. Permanent delete, report counts, stronger confirmation and student-scoped job/cache removal are absent. |

## Confirmed duplicated or conflicting logic

1. `applyTask2LowBandSafety()` independently rewrites criteria, overall range, caps, summary and route fields before the canonical reconciliation stage.
2. `reconcileTask2CanonicalAnalysis()` then performs a second normalization/score pass.
3. `normalizeAnalysis()` subsequently appends generic strategy language to every matching card and paragraph action.
4. The Task 2 prompt repeats the trusted deterministic-evidence instruction twice.
5. The prompt and validator allow V7 revision labels (`Teacher-Guided Recommended Route`, `Model Paragraph`) that conflict with V8.
6. Non-opinion validation currently requires `Thesis Route Clarity: Not Applicable`, directly contradicting the V8 requirement that Problem & Solution thesis route clarity remains assessable.
7. Task 2 classification has no distinct Causes & Effects or Positive/Negative Development schemas and defaults low-confidence cases to Opinion.
8. Route states mix `controlled`, `partial`, `failed`, `conflicting`, `adequate`, `present` and `missing` rather than one route-coverage taxonomy.
9. Task 1 score/cap helpers and Task 2 score helpers use different final aggregation paths.
10. Dashboard, print/PDF and progress read legacy fields rather than a shared final projection from one canonical object.

## Regression-report defects confirmed

- Evin is classified as Problem & Solution but the report displays `Detected position: unclear`, `supports the proposition` and `final position` language.
- Evin receives `5.5-6.0` while the displayed criterion ranges mathematically average higher.
- Evin's correct/relevant ideas are over-penalized through incomplete SAR framing.
- A supposed route-preserving Evin revision adds a new public-transport convenience/coverage premise.
- Identical thesis-planning strategy text is appended to unrelated vocabulary and mechanics cards.
- Poon Poon contains genuine opinion, conclusion and grammar failures, but the same generic strategy suffix is repeated across issue cards.
- The supplied Eva regression supports the V8 requirement to distinguish route precision from SAR and to label added policy premises as expansion/refinement.

## Consolidation decision

- Keep deterministic task evidence/classification in `services/task2Safety.js`, but expand it into the complete V8 task-type and route taxonomy.
- Make the reconciled canonical object the only Task 2 route/criterion/overall/cap source.
- Add one common canonical report projection for Task 1 and Task 2; legacy top-level fields will be derived compatibility projections, not independent sources.
- Remove the automatic per-card/per-paragraph generic strategy append stage.
- Enforce one severity taxonomy and the four permitted revision types before report validation.
- Add permanent student deletion across all storage adapters and student-scoped analysis-job cleanup, without changing account usage or credits.
- Expand the release gate to named golden fixtures, 30 Task 2 fixtures, 21 Task 1 fixtures, integrity validation, serialization and student-isolation checks.

## Protected areas

No V8 implementation change is authorized for authentication, password handling, sessions, roles, quotas, price, package quantity, expiry, payment, public signup, OpenAI key/environment handling, deterministic word count, failed-report credit protection, branding, colour system or deployment root.
