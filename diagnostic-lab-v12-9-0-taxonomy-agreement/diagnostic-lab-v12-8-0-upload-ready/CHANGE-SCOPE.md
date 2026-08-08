# Change Scope — Stage 0 Global Prompt Coverage

## Authoritative starting point

- Source: `diagnostic-lab-v12.9.8-full-release.zip`
- Source SHA-256: `EDAD92A55E0E2AB8672191D8EA5EA5B75F01594658805790ADCEF8B201E70168`
- Preserved wrapper: `diagnostic-lab-v12-8-0-upload-ready/`
- Package/app version: `12.9.8` (unchanged)
- Engine: `ielts-diagnostic-engine-v12.9.8` (unchanged)
- Starting source-check scope: 102 JavaScript modules
- Starting test suite: 42 test files

## Reproduced defects and minimal corrections

| Changed production file | Reproduced defect | Root cause | Minimal correction | Global proof | Protected systems affected |
| --- | --- | --- | --- | --- | --- |
| `domain/task2Safety.js` | A coordinated Direct Question with one question mark produced one obligation; a cause-plus-outweigh hybrid lost its comparison/stance obligation. | Prompt splitting relied primarily on punctuation and did not recognise a second coordinated interrogative clause. Paragraph routing could tie a cause paragraph and a comparison paragraph. | Split only at a coordinated interrogative/auxiliary boundary; preserve compound objects; retain hybrid judgement metadata; add small route-scoring signals for modal and explicit comparison language. | `tests/v12-9-8-stage0-control.test.mjs` uses synthetic vocabulary across ten Task 2 families and two opposite outweigh directions. Existing Task 2 matrices also pass. | Task classification and route matching only. No criterion arithmetic, canonical issue model, provider integration, storage or auth change. |
| `index.html` | Runtime login/access UI displayed Early Access pricing, quantity, validity and purchase language during Stage 0. | Commercial pilot copy remained embedded in the public HTML. | Replace visible commercial copy with neutral private/internal-validation wording. | DOM-visible-text assertions plus the browser/user-facing scan. | Presentation copy only; element IDs/classes and authentication form remain unchanged. |
| `script.js` | Client quota/expiry errors and stored plan display could expose legacy promotional labels; the supplied ZIP also lacked the deployed health-label honesty branch. | User-facing messages used commercial names and raw stored plan labels were projected directly; provider `unknown` was conflated with failed/unavailable. | Neutralise the two messages, map legacy labels at the presentation boundary, and preserve the deployed connected/failed/configured health-state distinction. | Client-message extraction, Student View/runtime scan and `v12-9-9-health-label-honesty.test.mjs`. | Presentation and status labelling only; analysis availability, internal fields and stored values remain unchanged. |
| `services/apiRouter.js` | API error bodies exposed Early Access wording. | Runtime error constants used the commercial label. | Replace only the two user-facing message constants. | API regression and runtime-message scan. | No authentication, quota arithmetic, route, status code or storage change. |

## Test and QA support changes

- `tests/diagnostic-api.test.mjs`: Stage 0 access-copy assertions replace obsolete package-price assertions.
- `tests/v12-3-1-feedback-integrity-hotfix.test.mjs`: legacy commercial-copy expectation now enforces neutral Stage 0 copy.
- `tests/v12-9-8-stage0-control.test.mjs`: new global synthetic prompt, Task 1 family, hybrid route, Student View and runtime-copy regression.
- `qa/build-stopship-acceptance-manifest.mjs`: acceptance counts and page reporting are derived from the final 106-module/46-test run and actual rendered pages.

## Deployed-only carry-forward

GitHub `main` at `0c6cc6e7f04d16d71550a0f2754589f84222eb8e` contained deployed fixes absent from the supplied full-source ZIP. The packaging deletion gate and newly preserved tests stopped rather than silently removing them. `domain/evidenceAssertions.js`, `domain/agreementValidator.js`, root `agreementValidator.js`, `tests/poon-output-validation-failure-regression.test.mjs`, `tests/v12-9-9-health-label-honesty.test.mjs`, and `tests/v12-9-9-modal-infinitive-agreement-hotfix.test.mjs` were copied byte-for-byte from the LF-normalised Git baseline. The deployed `checkBackendHealth()` state distinction was merged into the already scoped `script.js` copy change. This is preservation of production fixes, not a new architecture.

## Explicitly unchanged

No dependency, version, scoring formula, canonical issue schema, paragraph parser, evidence assertion, feedback renderer, repair plan, authentication, credit/quota arithmetic, storage, async job flow, PDF renderer, branding, deployment configuration, Render command or environment variable was changed. No file was deleted, renamed or moved.
