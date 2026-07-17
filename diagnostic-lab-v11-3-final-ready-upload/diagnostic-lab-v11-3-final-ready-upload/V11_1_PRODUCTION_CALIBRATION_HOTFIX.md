# V11.1 Production Calibration Hotfix

## Scope

V11.1 is a focused Task 2 calibration hotfix built from `diagnostic-lab-v11-a91e041.zip`. It does not change Task 1 classification or scoring logic.

## What changed

- Replaced the previous absence-of-error shortcut with a positive full-response language profile.
- Added exact-sentence provider `languageAudit` evidence with deterministic validation and canonical reconciliation.
- Scored Lexical Resource and Grammatical Range & Accuracy independently.
- Added family-aware Task 2 executive summaries instead of reusing Outweigh language for Opinion essays.
- Calibrated moderate body development, SAR and link-back evidence for the urban-zoning golden case.
- Removed contradictory fallback thesis feedback when an Opinion thesis already supplies its two reasons through `due to`.
- Replaced generic route filler in Top 3 with stronger lexical and grammar evidence when available.
- Updated app, engine, rubric, prompt and report-schema metadata to V11.1.

## Urban-zoning golden result

| Field | V11.1 result |
|---|---|
| Essay family | Opinion Essay |
| Position | strongly disagree |
| Thesis/body route | aligned and adequately developed |
| Body 2 development | Moderate / Partially Developed |
| Explanation / SAR / Link Back | Moderate / Moderate / Moderate |
| Task Response | 6.5 |
| Coherence & Cohesion | 6.0-6.5 |
| Lexical Resource | 6.0 |
| Grammatical Range & Accuracy | 6.0 |
| Overall | 6.0-6.5 |
| Top 3 | Development, Lexical Precision, Grammar/Sentence Control |

## Validation completed

- `build:static` passed and synchronized the canonical browser modules.
- `check` passed for all listed JavaScript modules and tests.
- The full regression suite passed: V7, V8, V8.2, V10, V11, V11.1 and local server smoke.
- The original 12-page Sun PDF was rendered and visually inspected.
- The V11.1 report was submitted through the local browser UI, its HTML output was inspected, and its A4 QA PDF was rendered and visually inspected page by page.
- Task 1 source diff against the V11 baseline is empty.

## Deployment status

Not deployed. This source archive has no configured Git remote or production credentials, so only local build, test, browser and PDF evidence is claimed.
