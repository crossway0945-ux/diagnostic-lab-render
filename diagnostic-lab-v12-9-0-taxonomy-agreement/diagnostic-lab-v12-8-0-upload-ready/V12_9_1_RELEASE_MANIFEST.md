# V12.9.1 — Canonical Consistency, Scoring Calibration and Admin Hardening

**Release candidate. Not yet deployed. `package.json` version is deliberately still `12.9.0`.**

Two acceptance gates in J remain open (live-provider validation and a rendered-PDF artifact
inspection), and the brief forbids a version bump while J is incomplete. Bump to `12.9.1` only after
both gates are closed in the owner's environment — see *Remaining gates* below.

- Base: V12.9.0 (`diagnostic-lab-v12-9-0-admin-security.zip`) via the
  `v12-9-0-canonical-cfgh-handoff` working copy
- Owner and sole pedagogical-standard authority: **Kru Pom IELTS**
- Live domain: https://diagnostic.wonderbloom.co/
- GitHub repository: `crossway0945-ux/diagnostic-lab-render`
- Render Root Directory: **`diagnostic-lab-v12-8-0-upload-ready`** (unchanged)
- `rubricVersion`: `kru-pom-ielts-writing-v12.3.0` — **unchanged** (the IELTS rubric did not change)
- Branding, domain, product name and pricing: **unchanged**

---

## 1. What this release completes

### C — canonical cross-section consistency (was present but UNWIRED)

`buildCanonicalConsistencyAudit()` is now complete and **wired into the real pipeline**, in
`services/aiAnalyzer.js`, after canonical route and issue reconciliation and **before** the Student
View and the PDF are rendered. It operates on canonical objects — task requirements, route
assessment, task-aware route model, thesis dimensions, frozen scoring, framework assessment,
canonical issues, language profile, Paragraph Coverage, Executive Summary, Repair Plan and the
Student View projection — never on visible-string matching.

Ten rules, each with a structured audit record:

| ruleId | What it forbids |
| --- | --- |
| `ROUTE_PRESENT_VS_SCORING_TEXT` | a criterion claiming the task route is absent while it is present |
| `ROUTE_PRESENT_VS_PARAGRAPH_PROGRESSION` | "progression is absent" over aligned Body 1 / Body 2 |
| `BODY_ROUTE_CONSISTENCY` | a disadvantage body described elsewhere as a solution or unclear |
| `THESIS_CONSISTENCY` | a thesis naming every required route being called "missing a route" |
| `CONCLUSION_FUNCTION_VS_LANGUAGE` | conflating conclusion function with conclusion language accuracy |
| `EXPLANATION_DEPTH_CONSISTENCY` | Explanation Depth Strong while a validated mechanism gap survives |
| `SAR_EXAMPLE_QUALITY_CONSISTENCY` | SAR Strong while an example's group/mechanism/result is incomplete |
| `LANGUAGE_CONTROL_CONSISTENCY` | a paragraph Language Controlled while validated language issues remain |
| `REVISION_VALIDATION_CONSISTENCY` | a failed revision validator reaching any visible surface |
| `AUDIT_INTEGRITY` | an empty audit hiding a repair an upstream stage actually made |

Persisted at the **existing** schema path `normalized.feedbackIntegrity.consistencyAudit`. No
top-level report field was added — that would fail `validateReportOutput` with
`502 REPORT_OUTPUT_VALIDATION_FAILED`. Records carry `ruleId`, `affectedObject`, `affectedPath`,
`previousValue`, `correctedValue`, `evidenceSource`, `exactEvidence`, `repairAction`, `repairStatus`
and a deterministic processing marker (`canonical-consistency-gate-v12.9.1#N`) rather than a
wall-clock timestamp, so two runs over the same canonical objects produce identical audits.

Frozen band ranges are never modified by the gate; only diagnoses, framework statuses and paragraph
coverage are reconciled.

### Scoring calibration — recomputed from canonical evidence, never hard-coded

New module **`domain/canonicalDevelopmentEvidence.js`** answers the questions the language profile
cannot: was the comparative judgement *demonstrated* (not merely asserted), was every route the
thesis *promised* developed, does each consequence name who it affects and how, and does local
reference stay traceable. All four tests are structural and topic-independent.

Those findings feed `deriveDeterministicTask2CriterionRanges` as **canonical development limiters**:
two independent limiters hold a criterion at the 6.0 boundary, one removes the secure upper half.
The floor is 6.0 — a development limiter never reaches the low-band ranges reserved for route or
completion failure. No cap is tied to the number of feedback cards, and no score is hand-tuned.

Criterion diagnoses now state the real limitation instead of restating route coverage.

### Phase 2 — canonical issue selection

- Development evidence is promoted **before** language candidates, deduplication and prioritisation.
- Shared priority order (`domain/canonicalIntegrity.js`, `domain/reportConsistency.js`):
  task misunderstanding → **insufficient comparative judgement** → **undeveloped thesis promise** →
  incompleteness → sentence completion → meaning-impaired language → mechanism/affected group →
  reference/sentence structure → recurring lexis → grammar → local mechanical.
- Language promotion is now **paragraph-diverse**, so a paragraph rich in mechanical errors can no
  longer consume the whole budget and leave the conclusion with no card.
- A development finding no longer suppresses the language evidence on the same sentence.
- Top Issues are re-ordered by the shared priority after merging, so a Moderate local repair cannot
  outrank a Major task-level defect.
- The Executive Summary is rebuilt from the corrected set — but only when the engine's own wording
  does not already name the same limitation.

### Phase 3 — Paragraph Coverage and Repair Plan

- `rebuildParagraphCoverageFromIssues` now rebuilds the `dimensions` object as well as the status
  string; previously a paragraph could read "Language Repair Needed" while its language dimension
  still said "controlled".
- `Comparative Judgement` and `Thesis-to-Body Promise` map to the **task-development** dimension.
- The conclusion's `conclusionFunction` reaches the rebuild, so a functionally sound conclusion with
  a language defect reads "Functionally Strong - Language Repair Needed".
- The Repair Plan draws from validated, deduplicated canonical issues through the same builder and
  the same localiser, so English and Thai stay aligned. A new `comparison` activity family teaches
  comparative weighing rather than dictionary work.

### Root causes fixed at source (not papered over by the gate)

- `domain/thesisDimensions.js`: an outweigh thesis names both sides inside its *position* sentence,
  so requiring the `thesis_route` role alone recorded both routes absent while the route assessment
  recorded them present. Advantage/disadvantage recognition is now semantic, consistent with the
  V12.9.1 paragraph route model.

### I — admin hardening

New module **`services/adminSecurity.js`**.

- **CSRF** on every privileged write (`x-csrf-token`, session-bound HMAC, `GET /api/admin/csrf-token`
  to mint). A same-origin proof is accepted only when no token was supplied at all, so a
  present-but-invalid token is always a rejection. Rejections are audited.
- **Lifecycle guards** applied identically on the generic `PATCH` and every dedicated action
  (disable, archive, delete, role change, status change). The signed-in admin and the last active
  admin cannot be disabled, demoted, archived or deleted.
- **`archived` is a real state.** The generic status field refuses it
  (`400 ARCHIVE_ACTION_REQUIRED`); archiving requires the Archive action, which also revokes
  sessions and audits itself. The admin table shows an archived row as a read-only pill, so Save
  cannot silently un-archive it.
- **Durable audit log** (`admin-audit-log.json` in the data directory, atomic replace, 5000-event
  bound) with pagination, search, action filter and result filter, plus an Admin Audit Log panel.
  Recorded: admin login, refused admin access, CSRF rejection, user create/update, role, status,
  quota and expiry changes, password reset, session revocation, disable/enable, archive/restore,
  permanent delete, report deletion and QA export. Never recorded: passwords, hashes, session
  cookies, API keys, student essays or environment values.
- **Permanent-deletion ordering**: report ids and QA snapshot ids are collected while ownership
  still exists → sessions revoked → history mutated → snapshots removed by id → orphans verified.
  The response returns the order, the ids, the snapshot count and any orphans found.
- **Deep anonymisation** clears identity at every nesting depth (top level, report metadata,
  `canonicalAnalysis.metadata`, student-profile snapshots, export metadata) and drops raw writing.
  The mode stays explicit; `removeEvidenceText` additionally clears quoted evidence.
- **Durable session invalidation** via `sessionId` + `issuedAt` + `sessionVersion` against a
  persisted per-username `{ revokedBefore, sessionVersion }`. Survives restart; recreating a username
  cannot revive an old token; a session issued after the event stays valid.
- **`next=/admin`** honoured only after the server verifies the admin role, and only for a same-site
  path.
- **Permanent Delete is gated closed** in the console (`PERMANENT_DELETE_ENABLED = false`) with a
  message directing the admin to Archive.
- Admin user list UI: search, status filter (default **Active only**), role filter, sort, page size,
  previous/next, page number and total result count.

---

## 2. Files changed

```
NEW      domain/canonicalDevelopmentEvidence.js
NEW      services/adminSecurity.js
NEW      tests/v12-9-1-canonical-consistency-gate.test.mjs
NEW      tests/v12-9-1-admin-hardening.test.mjs
NEW      V12_9_1_RELEASE_MANIFEST.md
MODIFIED domain/reportConsistency.js        (C gate, shared priority, comparison repair family,
                                             executive-summary rebuild, legacy audit normalisation)
MODIFIED domain/canonicalIntegrity.js       (development promotion, priority tiers, paragraph-diverse
                                             language promotion, covered-sentence scope)
MODIFIED domain/task2Safety.js              (development evidence, criterion calibration, diagnoses)
MODIFIED domain/thesisDimensions.js         (outweigh thesis route recognition)
MODIFIED services/aiAnalyzer.js             (C wiring, coverage dimensions, summary rebuild, budget)
MODIFIED services/apiRouter.js              (CSRF, guards, durable audit, deletion order, sessions,
                                             next=/admin, report-delete audit)
MODIFIED services/storage.js                (deep anonymisation)
MODIFIED admin.html / admin.js / styles.css (list controls, audit panel, CSRF, delete gate)
MODIFIED script.js                          (next passthrough + server-verified redirect)
MODIFIED tests/diagnostic-api.test.mjs      (CSRF in the admin harness)
MODIFIED tests/v12-9-0-admin-security.test.mjs (CSRF in the harness; new guard codes)
REMOVED  (none)
```

Carried forward from the handoff (A, B, D, E, F, G, H) plus `tests/v12-9-1-route-semantics.test.mjs`.

---

## 3. Tests

```
node scripts/check-source.mjs                                       -> Source check passed: 91 JavaScript modules.
node scripts/build-static-preview.mjs && node scripts/run-tests.mjs -> Test suite passed: 35 files.
```

End-to-end matrix over the real API handler: **84 checks, 0 failed** (Eva, Sun, underlength Task 2,
strong Opinion, weak Discuss Both Views, Task 1 chart / map / process, admin
anonymous/non-admin/admin/CSRF fixtures, archive/restore/reset, canonical QA export).

---

## 4. Eva calibration result

| Criterion | Production (V12.9.0, false route-absent) | This release, real provider evidence replayed | This release, local engine only | Target |
| --- | --- | --- | --- | --- |
| Task Response | 5.0-5.5 | **6.0** | 6.0 | ≈6.0 |
| Coherence & Cohesion | 5.0-5.5 | **6.0** | 6.0 | ≈6.0 |
| Lexical Resource | 6.0 | **6.0** | 6.5-7.0 | ≈6.0 |
| Grammatical Range & Accuracy | 6.0 | **6.0** | 6.0 | 5.5-6.0 |
| Overall | 5.5-6.0 | **6.0** | 6.0-6.5 | 5.5-6.0, centred on 6.0 |

Task Response and Coherence are driven by canonical development evidence, which is
provider-independent, so they hold on the local engine too. Lexical Resource and Grammar are driven
by the language profile, whose yield depends on the provider: the local deterministic engine detects
2 language items for Eva where `gpt-5.6-sol` detected 17, so Lexical Resource sits one step high
without a provider run. This is the same local-vs-provider gap documented in the previous handoff,
now narrowed to Lexical Resource alone.

---

## 5. Remaining gates before a version bump and deployment

1. **Live-provider validation.** No `OPENAI_API_KEY` was available. Every provider-dependent result
   here comes from replaying the real `gpt-5.6-sol` findings stored in the production QA export
   through the complete post-provider pipeline. Run one real analysis on the deployed environment and
   confirm the Eva-class calibration and issue set.
2. **Rendered-PDF artifact inspection.** The PDF is produced client-side by the browser's print
   engine, so no PDF file was regenerated. The deterministic PDF gates in the suite do pass
   (pagination source, searchable-text sanitisation, extracted-text forbidden patterns, Thai font,
   framed print layout, semantic parity with the Student View, no internal metadata leakage). What
   remains is exporting one report from the deployed app and inspecting every page visually.
3. **Enable Permanent Delete** (`PERMANENT_DELETE_ENABLED` in `admin.js`) only after the
   destructive-action safety checks have been run against the deployed environment.

---

## 6. Environment

`GET https://diagnostic.wonderbloom.co/api/health` was checked before packaging:

```
appVersion 12.9.0 | modelName gpt-5.6-sol | reasoningEffort high
analysisMode async-render | jobStorageMode render-durable | durableStorage true
fullEngineRequired true | timeoutMs 600000 | maxOutputTokens 16000
```

**No Render environment change is required.** No value is provably wrong. The earlier warning about
sync mode is not current — live `analysisMode` is `async-render`.

---

## 7. Migration

No schema migration. `feedbackIntegrity.consistencyAudit` already existed and was empty; it now
carries structured records. Old reports remain readable: the audit is read defensively and a
pre-existing lighter finding is lifted into the full record shape.

Two new files appear in the data directory on first use, created automatically:
`admin-audit-log.json` and `admin-session-revocations.json`. On the first deploy every session
version is 0, so existing sessions keep working until a revoking event occurs.

Because CSRF is now enforced, **an open admin tab from before the deploy must be reloaded** before
its next privileged write; the console retries once automatically after re-fetching a token.

## 8. Rollback

Re-deploy `diagnostic-lab-v12-9-0-admin-security.zip` to the same Render Root Directory. Nothing in
this release writes a format V12.9.0 cannot read: `consistencyAudit` is ignored by the old code, and
`admin-audit-log.json` / `admin-session-revocations.json` are simply unread. Reports written under
V12.9.1 render correctly under V12.9.0. Rolling back restores the false route-absent penalty for
outweigh essays and removes CSRF, the durable audit and durable session revocation.

## 9. Package contents

- 104 files. `node_modules`, `.env`, secrets, real users, production reports, QA snapshots, logs,
  build output (`netlify-static-preview/`) and temporary probes are all excluded.
- Wrapper: `diagnostic-lab-v12-8-0-upload-ready/`, with `package.json` at the application root.
- No duplicate nested wrapper. No required source or test was deleted.
