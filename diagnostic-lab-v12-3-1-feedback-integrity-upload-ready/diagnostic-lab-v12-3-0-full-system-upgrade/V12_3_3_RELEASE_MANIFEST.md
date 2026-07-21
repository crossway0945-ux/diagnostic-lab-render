# V12.3.3 Repairable Quality Gate — Production Hotfix Release Manifest

Fixes the production regression introduced by V12.3.2, where a real OpenAI analysis was completed but the
report was discarded with:

> The report could not be finalised because an output-quality check failed.

No scoring rules, teaching frameworks, prices, Render settings, or deployment paths changed.

## Root cause

V12.3.2 added three new consistency rules to `validateFeedbackIntegrity`, and every rule in that function is
treated as **fatal** by `validateReportOutput` (`services/aiAnalyzer.js`). Two consequences:

1. **The gate policed output that our own code generates.** `canonicalizeIssue` assigns `issueCategory`,
   `revisionType` and `secondaryIssueCategories`; the validator then rejected the whole report when those
   assignments disagreed with the rendered diagnosis. A builder must never emit a state its own validator
   rejects.
2. **One imperfect card destroyed the whole report.** `REPORT_OUTPUT_VALIDATION_FAILED` also triggers a full
   provider retry (`aiAnalyzer.js:138`), so a single heading mismatch cost a second OpenAI call and then
   still failed. Student credit was not deducted, but API cost was incurred and no report was saved.

## Repair: a two-tier gate

`auditFeedbackIntegrity(model, writing)` now returns `{ severity, code, message }` findings, and
`validateFeedbackIntegrity` returns **only the fatal ones**.

**Fatal — the report is blocked (would mislead the student or break the schema):**
- `EVIDENCE_NOT_IN_WRITING` — quoted evidence is not in the student's response
- `INVALID_SENTENCE_ROLE` — sentence role outside the schema
- `INVALID_ISSUE_CATEGORY` — issue category outside the shared taxonomy

**Repairable — corrected in place, never blocking:**
`CATEGORY_DIAGNOSIS_CONFLICT`, `REVISION_TYPE_MISMATCH`, `REVISION_TARGETS_UNRESOLVED`,
`PRIMARY_SECONDARY_DUPLICATE`, `ROLE_CATEGORY_CONFLICT`, `PUNCTUATION_CLAIM`,
`EVIDENCE_COUNT_METADATA`, `EVIDENCE_SCOPE_METADATA`, `TOP_ISSUE_UNLINKED`,
`TOP_ISSUE_FIELD_MISMATCH`, `LINKED_ISSUE_MISSING`.

## Self-repairs applied by the canonical builder

1. **Category vs rendered diagnosis** — the classifier now re-checks the *rendered* diagnosis text (the text
   the student actually reads). If it describes a development problem under a language heading, the
   development category becomes primary and the language label is preserved as a secondary issue.
2. **Revision type** — a revision carrying analytical expansion is relabelled `Teacher-Guided Expansion`.
   Relabelling is metadata-only; the student-facing revision text is never rewritten.
3. **Primary/secondary** — the primary category is removed from the secondary list.
4. **Unresolved repair targets** — instead of discarding the report or silently claiming a repair that did
   not happen, the card is marked `revisionAlignmentStatus: "partial-repair"` and carries an honest
   bilingual disclosure appended to *Why This Revision Is Stronger*:
   > This revision repairs only what can be corrected safely inside the quoted sentence. The diagnosed
   > point(s) (…) still require your own rewrite; the system does not write that content for you.

   The system never fabricates development content to satisfy its own validator.

## QA visibility

Every repair is recorded on the saved report as `feedbackIntegrityRepairs` (and per-card
`integrityRepairs`), so the rate of partial repairs can be monitored without blocking students.
`auditFeedbackIntegrity` remains available for full-detail QA.

## Versions

- appVersion `12.3.3`; engine/report/feedback-schema/issue-taxonomy/revision-validator bumped to `v12.3.3`.
- `rubricVersion` (v12.3.0) and `promptVersion` (v12.3.1) unchanged.
- `index.html` cache-bust token: `script.js?v=diagnostic-v12-3-3-repairable-gate`.

## Tests

- New: `tests/v12-3-3-repairable-quality-gate.test.mjs` — every repairable rule auto-repairs and yields zero
  fatal findings; fabricated evidence and broken schema still block; end-to-end `analyzeWriting` returns a
  saved report with unchanged scoring; Thai disclosure verified.
- Updated: `tests/v12-3-2-taxonomy-revision-contract.test.mjs` now asserts the conflicts are *detected as
  repairable* rather than fatal.
- Full suite: `npm test` → **17 test files passed**.
- Hostile-input stress check (wrong paragraph location, invalid revision type, duplicated secondary
  category, false punctuation claim, mismatched heading, language-only revision for a development
  diagnosis, all in one payload, English and Thai): **0 fatal, all 3 cards delivered and self-repaired.**

## Remaining limitation

The exact production failure could not be reproduced locally because the OpenAI provider response is not
available here. The fix removes the entire class of failure (any repairable rule blocking a report), and
fatal blocking is now limited to three unambiguous cases. After deploying, confirm in the Render log that
`REPORT_OUTPUT_VALIDATION_FAILED` no longer appears for `[feedback_integrity]`.
