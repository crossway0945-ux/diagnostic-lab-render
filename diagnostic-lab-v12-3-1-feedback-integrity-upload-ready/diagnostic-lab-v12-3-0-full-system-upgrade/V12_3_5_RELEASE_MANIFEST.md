# V12.3.5 Revision Safety — Release Manifest

Global correction of feedback integrity, issue taxonomy, revision safety and report copy.
Starting version: **12.3.4**. Released version: **12.3.5**.
No scoring rule, rubric, cap, prompt, auth, quota, storage or layout system was changed.

## Render Root Directory (unchanged)

```
diagnostic-lab-v12-3-1-feedback-integrity-upload-ready/diagnostic-lab-v12-3-0-full-system-upgrade
```
Build `npm install` · Start `npm start` · Health `/api/health` · `DIAGNOSTIC_DATA_DIR=/var/data`

## Root causes and global fixes

**R-1 — A wording complaint was read as a missing mechanism.**
`detectDevelopmentSignal` matched `mechanism … not`, so "the policy mechanism is not expressed
naturally" (a lexical observation) produced a **Causal Mechanism** heading. Now a mechanism defect is
only recognised when the mechanism itself is absent or incomplete; "not expressed / worded / phrased
/ stated / described" is excluded. Genuinely missing mechanisms are still detected.

**R-2 — A visibly incomplete sentence was headed Collocation.**
The completion patterns required the exact phrase "ends with a comma" or "incomplete sentence".
Production prose writes "The comma ending makes the sentence incomplete". The patterns now cover
comma endings, split noun/adjective forms, "does not form a complete", missing full stop and
"no full stop", and Sentence Completion outranks every other language category.

**R-3 — Task 1 logic categories headed Task 2 cards.**
`Grouping Logic` was accepted verbatim on a Task 2 report because any taxonomy member was allowed.
Added `TASK1_ONLY_CATEGORIES` / `TASK2_ONLY_CATEGORIES` with `categoryAllowedForTask()`, and added the
two missing Task 2 categories the taxonomy lacked: **Topic Sentence Precision** and
**Policy Mechanism Accuracy**, with a `detectTask2StructureSignal` detector. A category owned by the
other task type is now reclassified from the diagnosis, never displayed.

**R-4 — A substantial expansion kept a Route-Preserving label.**
Escalation to Teacher-Guided Expansion only fired when alignment *failed*, so a revision that added
content and satisfied its targets kept the wrong label. Escalation now depends on what the revision
did, not on whether validation passed, and uses one shared discriminator (below).

**R-5 — The system generated AI meta-language.**
`buildTeacherGuidedBody2Revision` appended "This affects the wider group named in the prompt because
the same mechanism operates beyond the single example." to a student-facing model. Removed. The
deterministic path cannot invent a specific actor, timing and consequence, so it now repairs only
what is verifiable and the revision-alignment disclosure states honestly what the student must write.
The surrounding rationale and Student Action were rewritten to name concrete requirements.

**R-6 — A regex rewrite produced broken grammar and meaning drift.**
`repairDeterministicLanguageSentence` spliced "…in one area this could contribute…" (a dangling
demonstrative) and shifted the policy subject. Removed. Meaning-level repairs must come from the
analysis engine and pass the new validator.

**R-7 — Report copy.** `TESL` → `TEEL` and a missing space after a comma between quoted items are
repaired in both sanitizers, so web and PDF stay identical.

## New module: `domain/revisionQuality.js`

A Targeted Revision is the one thing a student is invited to copy, so it is now validated on its own
terms. Every finding is **repairable** — diagnosis, evidence and score are always preserved.

| Check | Catches |
|---|---|
| `checkRevisionGrammar` | fragments, missing terminal punctuation, comma splice, duplicated subject, repeated word, **dangling demonstrative** |
| `checkRevisionReference` | a place noun described as distant from itself; a sentence opening with an unbound pronoun |
| `checkRevisionTaskFidelity` | fabricated figures absent from both the student's sentence and the prompt |
| `checkRevisionLanguageSafety` | AI meta-language; vague nouns with no who/what/when/how |
| `checkRevisionTypeFidelity` | a label that misdescribes what the revision did |

Exposed on every canonical issue: `grammarValidationStatus`, `semanticValidationStatus`,
`taskFidelityStatus`, `languageSafetyStatus`, `revisionTypeValidationStatus`, `revisionQualityProblems`.

### Rewording vs expansion

Word counts cannot separate them: replacing "some people might encounter an issue" with "some
residents may face difficulties" introduces many new words but adds no analysis, while a genuine
expansion can be *shorter* than the original. The discriminator is whether the revision supplies an
analytical element the original lacked — an **affected group** (scope escalation) or a stated
**condition or timing**. `hasGroupScope()` treats "every family" and "families" as populations but
"a student's house" as one case, so a singular-to-plural grammar fix is never mistaken for expansion.
Consequence and causal wording are deliberately excluded because synonyms trip them.

## Files changed

| File | Change |
|---|---|
| `domain/feedbackIntegrity.js` | R-1, R-2, R-3, R-4; task-scoped taxonomy; validator wiring; `prompt` threaded through |
| `domain/revisionQuality.js` | **new** — revision quality validator |
| `services/aiAnalyzer.js` | R-5, R-6; passes `prompt` to the canonical model |
| `domain/canonicalAnalysis.js` | R-7 sanitizer |
| `script.js` | R-7 print sanitizer |
| `services/analysisVersions.js`, `package.json`, `package-lock.json`, `index.html` | version 12.3.5 |
| `tests/v12-3-5-revision-safety.test.mjs` | **new** regression suite |
| existing test files | version strings and one corrected expectation (below) |

**Deliberately untouched:** all scoring and caps (`domain/task2Safety.js`, canonical scoring, band
arithmetic), `services/promptBuilder.js`, `services/apiRouter.js`, `services/storage.js`, schemas,
`styles.css`, auth, quota, duplicate cache, progress, PDF retry, Render settings, package copy.

**One corrected expectation:** `v11-3` asserted a singular-to-plural grammar repair should be labelled
Teacher-Guided Expansion. That expectation encoded the over-eager escalation this release fixes; it
now expects Minimal Correction, which is what the revision actually is.

## Tests

`npm test` → **19 files passed**. `node --check` → 0 failures across every server, service, domain,
schema, renderer, script and Netlify function file.

New suite covers: R-1 wording-vs-missing mechanism (both directions), R-2 completion detection,
R-3 task-scoped taxonomy in both directions, revision grammar / reference / task-fidelity /
generic-language checks with matching safe counter-examples, rewording-vs-expansion in four
variants, repairable severity, all four copy repairs, absence of AI meta-language in emitted code,
and an end-to-end model where a Task 1 category and an AI-meta revision are both repaired without a
fatal block.

## Sun regression result (local engine)

| Acceptance check | Result |
|---|---|
| Overall / TR / CC / LR / GRA | 6.0-6.5 / 6.5 / 6.0-6.5 / 6.0 / 6.0 — unchanged |
| Detected position | strongly disagree |
| Route Alignment | **Aligned** with separate-assessment note |
| Conclusion Closure | **Strong** (language assessed separately) |
| Body Paragraph 2 in Top Issues | Yes — Example Development, Moderate |
| `TESL` anywhere | No |
| AI meta-language anywhere | No |
| `Grouping Logic` on a Task 2 card | No |
| Broken "…area this could…" clause | No |
| Fatal validation issues | 0 |
| Repairs logged for QA | 3 |

The Body 1 Sentence 2 revision that ships from the deterministic path is still semantically weak
("locations … far from their homes"); the validator now reports `semanticValidationStatus: fail` for
it and records it as a repairable finding instead of letting it pass silently.

## Remaining limitations

1. **Visual PDF inspection was not performed.** `pdftoppm` is not installed on the build machine and
   the browser cannot open local PDFs. All text-level copy defects are fixed and covered by tests;
   overlap, clipping, orphan headings and footer collisions must be checked by eye on the first
   report generated after deploy.
2. **No live-provider run.** Only the deterministic local engine was exercised. The detectors are
   tested against verbatim production prose from two shipped PDFs, but the first real report after
   deploy should be reviewed.
3. **Targeted regeneration is not implemented.** Section 11 of the brief asks for a bounded
   provider retry that repairs only a failed revision. This release detects and discloses unsafe
   revisions but does not yet re-request a replacement from the provider; that is the natural next
   increment and is not required for the report to be safe, because nothing unsafe is presented as
   verified.
4. **Task 1 was verified only through the existing fixture matrix** (21 Task 1 fixtures, all passing).
   No new live Task 1 report was generated.
