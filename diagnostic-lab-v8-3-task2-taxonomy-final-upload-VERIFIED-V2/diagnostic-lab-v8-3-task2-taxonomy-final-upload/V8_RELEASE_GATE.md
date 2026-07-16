# V8.1 Final Sale-Readiness Release Gate

Date: 14 July 2026 (Asia/Bangkok)

## Decision

**Pre-deployment release candidate: PASS.** The canonical engine, deterministic integrity rules, regression matrix, storage isolation, browser workflow and PDF-render checks pass locally.

**Production deployment: NOT PERFORMED.** The mission prohibits deployment before the gate passes, and this package does not include authority or credentials to deploy. The currently deployed site remains healthy but is still the preceding production build. Final sale-readiness closure therefore requires the post-deployment authenticated smoke test listed below.

## Source and architecture gate

| Gate | Result | Evidence |
| --- | --- | --- |
| Task 1 teaching authority inspected | PASS | `Lesson 11 - IELTS Writing Task 1 Core System - FIXED(5).pdf` |
| Task 2 teaching authority inspected | PASS | `IELTS Writing Band 7 Logic Task 2(3).pdf` |
| Expanded Kru Pom source inspected | PASS | `IELTS Writing Lesson (Academic Writing)(8).pdf` |
| Regression evidence inspected | PASS | Evin, Eva and Poon Poon reports |
| Pre-implementation source audit | PASS | `V8_IMPLEMENTATION_AUDIT.md` |
| One canonical report object | PASS | `services/canonicalAnalysis.js` builds and validates one V8 object for Task 1 and Task 2 |
| One displayed scoring projection | PASS | Dashboard, print/PDF, history and progress project from `canonicalAnalysis`; Overall is calculated from the four final criterion ranges |
| IELTS/Kru Pom separation | PASS | Criterion scoring is separate from diagnostic-only framework fields; SAR is not an automatic IELTS cap |
| No independent Overall cap | PASS | `capMetadata.overallCap` is `null`; applicable caps are criterion-specific and evidence-backed |
| Netlify/Node frontend alignment | PASS | Root and Netlify static frontend use the same V8 renderer and browser-safe canonical modules |

## Automated regression gate

Command: `npm run check && npm test`

| Suite | Result | Coverage |
| --- | --- | --- |
| Syntax/integrity checks | PASS | Server, frontend, API, storage, job store, analyzer, routing, canonical object, schema, prompts and tests |
| Inherited API/product suite | PASS | Authentication, quota protection, history, Task 1 image/data paths, provider failures and validation |
| Recoverable provider-output gate | PASS | Incomplete cards are removed, repeated generic guidance is made card-specific, Top 3 links are rebuilt from retained evidence, and a valid report consumes one credit exactly once |
| Fatal integrity gate | PASS | Conflicting backend word-count claims still fail after one retry, save no report and consume no additional credit |
| V7 compatibility suite | PASS | 24 Task 2 fixtures, Evin arithmetic regression, archive/restore |
| V8 Task 2 matrix | PASS | 30 fixtures: six task families × five quality/failure profiles |
| V8 Task 1 matrix | PASS | 21 fixtures: line, bar, pie, table, map, process, structural and mixed visuals |
| Canonical integrity | PASS | Controlled route/severity/revision taxonomies, half-band arithmetic, exact evidence, cap metadata and JSON serialization |
| Student permanent deletion | PASS | Archived-only deletion, exact-name confirmation, report/job isolation and unchanged account credits |

Expected error logs in the inherited suite are deliberate negative-path assertions and did not fail the test run.

## Named golden regression matrix

| Fixture | Expected invariant | Actual result | Status |
| --- | --- | --- | --- |
| Evin | Problem & Solution; no opinion contamination; strong thesis route; partial route remains visible; 6.5–7.0 | All invariants satisfied; result remained within 6.5–7.0 | PASS |
| Eva | Problem & Solution; no opinion contamination; strong thesis route; controlled partial/adequate development; 6.5–7.0 | All invariants satisfied; result remained within 6.5–7.0 | PASS |
| JJ | Line-graph introduction preserves unit, categories, location and timeframe | `million tonnes`, four transport modes, United Kingdom and 1974–2002 retained | PASS |
| Langley | Map language reports factual old-to-new change without invented purpose | No invented access/accommodation purpose; Old Feature → New Feature strategy present | PASS |
| Poon Poon | Plural visual grammar, per-thousand unit and no malformed repeated introduction | All invariants satisfied | PASS |
| Underlength Task 2 | Word shortfall and unfinished ending are visible; criterion evidence applies without a global Overall override | All invariants satisfied; overall remains criterion arithmetic | PASS |

These fixtures provide implementation regression evidence. Independent human examiner sign-off is still recommended before commercial launch and is not impersonated by this automated gate.

## Local UI and PDF gate

Authenticated browser workflow tested against the Node server with local deterministic analysis enabled:

- login: PASS
- new Task 2 submission: PASS
- canonical dashboard render: PASS
- four IELTS criterion cards: PASS
- thirteen framework/diagnostic cards: PASS
- four evidence cards for the test response: PASS
- progress/history write path: PASS
- print renderer and PDF creation: PASS
- A4 PDF: 12 pages, text-extractable, no clipping or overlap found across the rendered contact sheet: PASS
- Thai glyph rendering with bundled Noto Sans Thai fonts: PASS
- browser console/page errors: none

The browser check exposed and resolved two blockers before this gate was closed: browser-safe canonical modules were missing from the Node static allowlist, and a hidden student selector could participate in native form validation for student accounts.

## Production read-only check

The existing production site was not modified.

| Check | Result |
| --- | --- |
| `https://diagnostic.wonderbloom.co/` serves the login application | PASS |
| `/api/health` returns `ok: true` | PASS |
| Diagnostic engine configured/connected | PASS |
| Durable `local-json` storage reported | PASS |
| Authenticated live analysis/report/PDF/profile/progress test | NOT RUN — credentials and deployment authority were not provided |
| Production deployment commit | UNVERIFIED — not present in the supplied archive or public health response |

## Required post-deployment smoke gate

After uploading this exact package and confirming the deployed commit, complete all of the following before declaring the product sale-ready:

1. Log in with a controlled student account and run one Task 1 and one Task 2 analysis.
2. Confirm the dashboard, evidence report, PDF export, history and progress all show the same canonical score/range.
3. Log in with a controlled teacher account; add, archive, restore and permanently delete a disposable student profile.
4. Confirm permanent deletion removes only that profile's reports/jobs and does not change account credits.
5. Confirm failed/provider-invalid reports do not consume credits.
6. Record the production commit and the smoke-test report IDs in this file or the deployment record.

Until those authenticated production checks pass, describe this artifact as the **V8 pre-deployment release candidate**, not as a completed production deployment.
