# V8.3 Task 2 Taxonomy and Canonical Logic Audit

## Release scope

This patch is limited to Task 2 essay-family classification, internal prompt obligations, semantic position interpretation, canonical report projection, legacy Task 2 display migration, and matching regression tests.

## Public Task 2 choices

The production and Netlify-preview forms expose exactly:

1. Not Sure / Auto-detect (default)
2. Opinion Essay
3. Discuss Both Views
4. Problem & Solution
5. Advantages & Disadvantages
6. Direct Question

Causes/solutions, causes/effects, outweigh, positive/negative development, and multi-question patterns are internal subtypes and obligations. They are not separate public essay families.

## Canonical integrity

- Classification stores a public family, an internal subtype, prompt obligations, confidence, exact prompt signals, and selection match.
- High-confidence family mismatch is rejected before analysis.
- Medium confidence requires confirmation.
- Low-confidence auto-detection requires a manual public-family selection.
- Newly saved history records use the public family. Legacy subtype labels are projected to their public family when read.
- Report, dashboard, print/PDF, and progress fields derive their Task 2 family from the canonical public-family metadata.
- Body-paragraph functions for Direct Question and Discuss Both Views are matched against prompt meaning rather than paragraph order.
- The report output gate compares public family, internal subtype, semantic position, framework Position Clarity, and missing-position caps against the same canonical evidence.

## Semantic position correction

Task 2 position evidence now separates:

- whether a position is required
- writer judgement
- relation to the prompt claim
- position clarity
- position consistency
- confidence
- stance wording quality
- concession control
- exact position evidence

For negatively worded prompts, a writer who says that space-exploration spending is justified is treated as disagreeing with the prompt's negative claim. Indirect wording or an awkward collocation is diagnosed separately and does not become a missing or contradictory position.

## Protected systems

No intended changes were made to authentication, passwords, sessions, roles, ownership, student-profile lifecycle, quotas, price, package quantity, validity, payment, signup, API keys, environment variables, Render root-directory behavior, word-count rules, failed-analysis credit behavior, PDF visual design, branding, or Task 1 calibration.

## Verification

Run:

```text
npm run check
npm test
```

The V8.3 regression covers the public taxonomy matrix, UI option list and default, auto-detect behavior, mismatch blocking, internal obligation mapping, Eva negative-prompt semantics, Sun stance wording/concession separation, and production/preview parity.

Final local results:

- Syntax gate: 19 files passed.
- Diagnostic API regression: passed.
- V7 calibration: 24 Task 2 fixtures passed.
- V8 sale-readiness: 30 Task 2 fixtures and 21 Task 1 fixtures passed.
- V8.2 opinion-route/progress regression: passed.
- V8.3 taxonomy/semantic-position/UI regression: passed.
- Original files: 69. Final upload files: 72. Removed files: 0. Unchanged original files: 47. Four additional original files changed only to make the V8.3 GitHub/Render upload instructions consistent with the delivered folder layout.
