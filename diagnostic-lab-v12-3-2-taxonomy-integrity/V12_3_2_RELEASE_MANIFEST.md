# V12.3.2 Taxonomy & Revision-Fidelity Stabilization Release Manifest

Release type: system-level patch on top of V12.3.1. No scoring rules, teaching frameworks, prices, or deployment settings were changed.

## Root causes repaired

1. **Taxonomy misclassification** (`domain/feedbackIntegrity.js`)
   - `ISSUE_TAXONOMY` had no `Tense Control`, `Causal Mechanism`, `Word Choice`, `Subject–Verb Agreement`, `Modal + Base Verb`, `Pronoun Control`, `Topic Sentence Strength`, `Paragraph Closure`, `Introduction Precision`, or `Mixed-Visual Coverage`, so those diagnoses could never be labelled correctly.
   - `normalizeIssueCategory` accepted any explicit category verbatim and accepted `revisionIntegrity.diagnosedCategories` language labels before checking the diagnosis text, so a tense/mechanism/SAR diagnosis could keep an `Article Control` / `Countability` / `Collocation` heading.
   - Fix: deterministic diagnosis-signal classifiers (`detectDevelopmentSignal`, `detectLanguageSignal`) run on the diagnosis text with the card's own label echoes stripped. A development diagnosis outranks any language heading; a language heading is corrected when the diagnosis names a different language domain and never mentions the heading's own domain.

2. **Diagnosis–revision mismatch** (`domain/feedbackIntegrity.js`)
   - `inferRepairTargets` early-returned language-only repair targets for language categories, so a development diagnosis hidden under a language heading could pass validation with a one-word fix.
   - Fix: the early return is blocked when the diagnosis carries a development signal; development targets (`mechanism`, `explanation depth`, `SAR completeness`, `example specificity`) are always added from the signal. `Route-Preserving Revision` now tolerates at most 5 added words when development targets are being repaired; larger analytical additions must be `Teacher-Guided Expansion` or `Model Paragraph`.

3. **Integrity guard destroyed development revisions** (`services/aiAnalyzer.js`)
   - When `validateTask2RevisionIntegrity` failed (e.g. the expanded revision still contained "a large traffic congestion"), `buildSafeTask2TargetedRevision` replaced the entire Teacher-Guided revision with a language-repaired copy of the original sentence and relabelled it `Route-Preserving Revision` — the exact "large → severe" defect.
   - Fix: the guard now repairs the language inside the card's own revision first (preserving the expansion) and keeps `Teacher-Guided Expansion` / `Model Paragraph` labels.

4. **Route alignment label** (`services/aiAnalyzer.js`, `domain/canonicalAnalysis.js`, `script.js`)
   - The user-facing status for `Body Paragraph Route Alignment` is now `Aligned` (never `Strong`), with the clarification: "This rating assesses route alignment only. It does not mean that explanation, examples or language are strong." (Thai equivalent in Thai reports.) Implemented once in `projectRouteAlignmentDisplay` (`domain/feedbackIntegrity.js`) and used by both display builders. No other uses of `Strong` were changed, and the route result itself is not downgraded.

5. **Validation contract** (`domain/feedbackIntegrity.js`)
   - `validateFeedbackIntegrity` now also rejects: a language category whose diagnosis describes a development problem, a revision-type/revision-scale mismatch, and a primary category duplicated in `secondaryIssueCategories`. Canonical issues now carry `secondaryIssueCategories` so demoted language labels stay visible as secondary issues instead of replacing the development diagnosis.

## Versions

- appVersion `12.3.2`; engine/report/feedback-schema/issue-taxonomy/revision-validator versions bumped to `v12.3.2`.
- `rubricVersion` (v12.3.0) and `promptVersion` (v12.3.1) unchanged — no rubric or provider-prompt changes.
- `index.html` cache-bust token: `script.js?v=diagnostic-v12-3-2-taxonomy-integrity`.

## Tests

- New regression file: `tests/v12-3-2-taxonomy-revision-contract.test.mjs` (tense/article/word-form/lexical/countability classification matrix, causal-mechanism and SAR reclassification with secondary separation, development-diagnosis-vs-language-revision rejection, revision-type mismatch, Aligned display in English and Thai, route-deviation non-relabel, renderer badge support).
- Full suite: `npm test` → 16 test files passed (all 15 historical suites plus the new file).
- `qa/verify-pdf-text.py` expectation updated: the Sun Body Paragraph 2 Sentence 3 heading is now `Causal Mechanism` (was the incorrect `Countability`).

## Verified sample (Sun urban zoning, local engine)

- Estimated range unchanged: 6.0-6.5.
- Framework Breakdown shows `Body Paragraph Route Alignment: Aligned` + scope note; Explanation Depth / SAR Example Quality remain Moderate.
- Body 1 Sentence 2 card heading is `Tense Control` (was `Article Control`); Body 1 Sentence 1 heading is `Collocation` (was `Word Form`).
- Body 2 Sentence 3 card heading is `Causal Mechanism` with `secondaryIssueCategories: ["Countability"]`, revision type `Teacher-Guided Expansion`, and a revision that completes the causal chain and repairs "a large traffic congestion" inside the expansion.
- Web dashboard and the generated print/PDF markup were both inspected and carry the same saved report object.
