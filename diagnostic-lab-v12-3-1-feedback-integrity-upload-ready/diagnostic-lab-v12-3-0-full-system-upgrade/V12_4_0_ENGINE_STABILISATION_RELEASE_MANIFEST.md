# V12.4.0 — Global Diagnostic Engine Stabilisation and Model-Migration Release

Status: **CONDITIONAL PASS** — code and local regression complete; commercial
release is **blocked** until real `gpt-5.6-sol` provider results are produced by
the owner (no OpenAI key exists in the build environment). Do **not** deploy
automatically.

---

## 1. Starting versions (verified from source, not folder names)

| Item | Before (12.3.6) | After (12.4.0) |
|---|---|---|
| package.json `version` | 12.3.6 | **12.4.0** |
| appVersion | 12.3.6 | **12.4.0** |
| engineVersion | ielts-diagnostic-engine-v12.3.5 | **ielts-diagnostic-engine-v12.4.0** |
| reportSchemaVersion | ielts-diagnostic-report-v12.3.5 | **ielts-diagnostic-report-v12.4.0** |
| feedbackSchemaVersion | feedback-integrity-v12.3.5 | **feedback-integrity-v12.4.0** |
| revisionValidatorVersion | revision-alignment-v12.3.5 | **revision-alignment-v12.4.0** |
| issueTaxonomyVersion | issue-taxonomy-v12.3.5 | issue-taxonomy-v12.3.5 (unchanged — no category set change) |
| promptVersion | ielts-diagnostic-prompt-v12.3.1 | ielts-diagnostic-prompt-v12.3.1 (unchanged) |
| rubricVersion | kru-pom-ielts-writing-v12.3.0 | kru-pom-ielts-writing-v12.3.0 (**unchanged — scoring rubric did not change**) |
| Frontend cache token | diagnostic-v12-3-6-frontend-bootstrap | **diagnostic-v12-4-0-engine-stabilisation** |

## 2. Active application root (unchanged)

```
diagnostic-lab-v12-3-1-feedback-integrity-upload-ready/diagnostic-lab-v12-3-0-full-system-upgrade
```

`render.yaml` `rootDir` still points here and is asserted by the test suite. **Do
not change the Render Root Directory.**

## 3. Current provider configuration (verified in code)

- Model source: `OPENAI_MODEL` environment variable (server-side only; never in frontend JS — verified by grep).
- `OPENAI_BASE_URL` default: `https://api.openai.com/v1/responses` (unchanged).
- Reasoning effort: `OPENAI_REASONING_EFFORT`, now accepts `minimal | low | medium | high | max`.
- `getAnalyzerHealth()` reports the configured model as `modelName`. With
  `OPENAI_MODEL=gpt-5.6-sol` set it returns `modelName: "gpt-5.6-sol"` (verified locally with a placeholder key).

The supplied `Sun 14` PDF was produced by an **older** engine (12.3.5-era output,
which is exactly why it still showed `Analysis` in the SAR line and an unsafe
Body-1 revision). This release fixes those at the engine level.

---

## 4. Confirmed root causes (from the Sun 14 report) and the global fixes

| # | Defect in Sun 14 | Root cause | Global fix (not hardcoded) |
|---|---|---|---|
| 1 | SAR line read "…Situation and Result, but the **Analysis** needs…" | `A` in SAR rendered as *Analysis* | Deterministic sanitizer maps any SAR-context `Analysis`→`Action` in `domain/canonicalAnalysis.js` and `script.js`; unit test uses the verbatim Sun 14 string. |
| 2 | Body-1 revision "Families live in different locations, **which** could be very far away from their homes" | Reference clause pointed at itself | `checkRevisionReference` rejects a place-noun described as far from itself; the revision is **withheld** rather than shown. |
| 3 | Conclusion revision changed the policy subject to "**facilities**…should not be divided into zones" | Policy-subject drift | `checkRevisionTaskFidelity` compares the modal-policy subject of original vs revision against the prompt; a swapped subject fails and is withheld. |
| 4 | Body-2 tagged **Collocation** when the core issue was a causal mechanism | Language label hid a development diagnosis | Executive-development coverage + development-signal classifier promote the development category to primary and keep the language label as secondary. Sun now shows **Explanation and Example Development** as the Body-2 primary. |
| 5 | Paragraph Coverage contradicted the Framework | Single flat status per paragraph | Dimension-aware statuses separate route / development / language (e.g. Body 2 → "Route Aligned - Development Moderate"). |

## 5. Model-migration work implemented (code-level)

1. Model is read from `OPENAI_MODEL`; no production model is hardcoded (grep-verified: no `"gpt-5.x"` literal in code).
2. `max` reasoning effort accepted and **not** silently downgraded on the Node runtime.
3. Provider completeness handling in `services/aiAnalyzer.js`: detects `status: "incomplete"` → `PROVIDER_INCOMPLETE_RESPONSE` (with `incomplete_details.reason`) and refusal content → `PROVIDER_REFUSAL`. A truncated first attempt retries once with `maxOutputTokens + 2000`; **no second credit is deducted**.
4. Every report records `providerModel` and `providerReasoningEffort`; the model id appears in health results and the audit trail (no key exposed).
5. `runProviderHealthCheck()` + `scripts/provider-preflight.mjs`: a real Responses-API health request that reports the exact provider error and **never** falls back to another model.
6. `OPENAI_MAX_OUTPUT_TOKENS` (6000) and `OPENAI_TIMEOUT_MS` **reviewed and left unchanged** — the code now *detects* truncation and retries safely, so a blind ceiling increase without provider evidence was not made. Raise only if real `gpt-5.6-sol` runs show truncation.

## 6. Revision-safety validators (release blocker — all enforced before display)

- Grammar: fragments, comma splices (now also catches splices whose second clause starts with a lexical verb, e.g. "…, they need to travel"), dangling demonstratives, repeated subject/word.
- Reference: self-referential relative clauses.
- Task fidelity: policy-subject drift and fabricated data-like figures.
- Language safety: generic AI meta-language ("the wider group named in the prompt", etc.).
- Type fidelity: Minimal Correction vs Route-Preserving vs Teacher-Guided Expansion vs Model Paragraph.
- **Withhold flow:** if no safe revision can be verified, the student sees a controlled bilingual notice + a Student Action, `revisionType = "Revision Unavailable"`, and the rejected candidate is stored only in the internal `revisionIntegrity.revisedClaim` audit field (excluded from the student view model by allowlist).

## 7. Files changed

Engine / validators: `domain/feedbackIntegrity.js`, `domain/revisionQuality.js`,
`domain/canonicalAnalysis.js`, `services/aiAnalyzer.js`, `script.js`.
Config / versions: `services/analysisVersions.js`, `package.json`,
`package-lock.json`, `index.html`, `server.js`, `README.md`.
New: `scripts/provider-preflight.mjs`, `tests/v12-4-0-engine-stabilisation.test.mjs`.
Test version assertions and now-unsafe-revision expectations updated across the
suite (v11-2, v11-3, v8-sale-readiness, v12-3-*).

## 8. Files deliberately NOT touched (working systems protected)

Pricing (2,999 THB / 10 analyses / 60 days), authentication, quota/credit
accounting, duplicate hashing, the V12.3.6 frontend bootstrap (public asset
graph, startup preflight, blank-screen watchdog, `/api/readiness`), and the
premium PDF/print layout. Render service, domain/DNS, Root Directory, Build
(`npm install`), Start (`npm start`), and the persistent disk were not changed.

## 9. Tests

- `node scripts/build-static-preview.mjs && node scripts/run-tests.mjs` → **Test suite passed: 21 files.**
- New file `tests/v12-4-0-engine-stabilisation.test.mjs` asserts, from verbatim
  Sun 14 strings: SAR `Analysis`→`Action`; reference-broken B1 revision withheld;
  policy-drift conclusion rejected; `max` effort accepted; truncation/refusal
  detection present; `providerModel` recorded; executive development promotion;
  dimension-aware coverage; and that **no unsafe revision reaches the student
  view model**.

## 10. Sun regression (local deterministic engine, 12.4.0)

Band 6.0-6.5 · strongly disagree · Route Alignment = Aligned (+ scope note) ·
B1S2 unsafe revision **withheld** · SAR uses Action · Body-2 primary =
Explanation and Example Development · Coverage: Introduction Strong · Body 1
"Function Controlled - Language Repair Needed" · Body 2 "Route Aligned -
Development Moderate" · Conclusion Strong · no AI meta-language · no corrupt
Unicode.

---

## 11. NOT VERIFIED — required before commercial release (owner action)

Per the release brief, this cannot be called "ready for sale" on local tests
alone. The following require the owner's OpenAI account and **cannot** be run in
this build environment (no `OPENAI_API_KEY`, no `gpt-5.6-sol` access here):

1. `gpt-5.6-sol` **provider access preflight** (§3.1) — run `scripts/provider-preflight.mjs`.
2. **Real provider reports** (§33): 3 Task-2 levels, 3 essay types, Task-1 chart/map/process, mixed graph, Sun, one repeatability case.
3. **Reasoning-effort benchmark** high vs max (§3.2), latency, token usage, truncation rate.
4. **Manual pedagogical audit** of the real reports (§36).
5. **PDF visual inspection** of a real `gpt-5.6-sol` report.

Until 1–5 are done and reviewed, keep production on the current working model.

## 12. Deployment order (do NOT auto-deploy)

1. Extract the ZIP.
2. Enter the active GitHub folder
   `diagnostic-lab-v12-3-1-feedback-integrity-upload-ready/diagnostic-lab-v12-3-0-full-system-upgrade`.
3. Upload the **contents** of the ZIP, overwrite matching files. Do **not** upload
   the ZIP itself, do **not** create a nested version folder, do **not** delete
   the parent folder. Commit to `main` only after review.
4. Run the preflight with the production key:
   `OPENAI_API_KEY=… OPENAI_MODEL=gpt-5.6-sol node scripts/provider-preflight.mjs`.
5. Only if it prints `PREFLIGHT PASS`, set Render env `OPENAI_MODEL=gpt-5.6-sol`
   (and `OPENAI_REASONING_EFFORT=high` or `max` per the benchmark), then redeploy.
6. Verify `/api/health` and `/api/readiness` report `modelName: "gpt-5.6-sol"` and
   `frontendPreflightPassed: true`; run one safe test-account analysis; export a PDF.

## 13. Rollback

Keep the previous Render deploy available. To roll back the model without a code
change, reset the Render env `OPENAI_MODEL` to the prior value and redeploy; the
code has no hidden fallback, so the model in use is always exactly the env value.
