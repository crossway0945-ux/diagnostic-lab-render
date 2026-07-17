# V7 Production Calibration Audit

## Baseline

- Repository: `crossway0945-ux/diagnostic-lab-render`
- Branch: `main`
- Audited baseline commit: `c7e1c9797f24df27d1a0ed17aca67f6dfd18b991`
- Existing V6.5 regression suite passed before editing.

## Sources of truth found

- `services/task2Safety.js`: deterministic Task 2 classification, route evidence, caps and canonical reconciliation
- `services/aiAnalyzer.js`: provider-result normalization, report sections and quality validation
- `services/promptBuilder.js`: provider contract and pedagogical instructions
- `script.js`: UI and PDF rendering
- `services/storage.js` and `services/apiRouter.js`: student profiles, history and account usage

Before V7, task type, position, route status and score limiting were also inferred independently in report normalization, prompt wording and PDF fallbacks. This allowed non-opinion tasks to receive opinion fields and allowed displayed overall ranges to disagree with criterion arithmetic.

## V7 consolidation

The runtime now reconciles every Task 2 result through one canonical object containing:

- essay type and task requirements
- whether a stance is required
- route assessment
- criterion scores
- explicit cap metadata
- primary limiters
- Kru Pom framework assessment
- evidence issues
- arithmetic overall range

Executive Summary, Criteria Breakdown, Framework Breakdown, detailed feedback validation and PDF metadata consume this canonical result.

## Task-type routing

The canonical classifier covers:

1. Opinion
2. Discuss Both Views
3. Advantages & Disadvantages
4. Outweigh
5. Problem & Solution
6. Direct Question

Only Opinion, Discuss Both Views with an opinion request, and Outweigh require stance fields. Non-opinion reports fail validation if proposition/position wording leaks into the output.

## Score and cap policy

- Criterion ranges remain IELTS-criterion estimates.
- Kru Pom frameworks remain diagnostic and do not create unofficial score gates.
- Overall is derived from the four canonical criterion ranges and rounded to half bands.
- A cap changes the overall only when canonical `capMetadata` explicitly records the scope, value and reason.
- SAR is diagnostic-only.

## Feedback fidelity

- Minimal Correction preserves wording that is already acceptable.
- Route-Preserving Revision is checked for premise drift.
- A revision that adds a new argument, cause, solution or premise is relabelled `Teacher-Guided Expansion`.
- Student Action is issue-specific; one thesis-route strategy is not appended to unrelated cards.

## Student profile removal

Removal is archive/restore, not destructive deletion. Archived students disappear from analysis/report selection while submission history, progress and account credits remain intact.

## Verification

- Existing API and regression suite
- 24-fixture Task 2 matrix: 6 task types x 4 quality conditions
- Evin Problem & Solution regression
- criterion arithmetic and explicit-cap tests
- revision-fidelity tests
- student archive/restore persistence tests
