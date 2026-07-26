# V12.6.0 Global Feedback Integrity Release Manifest

Release name: `diagnostic-lab-v12-6-0-global-feedback-integrity`

Release date: 26 July 2026

Deployment performed: No

## Release objective

V12.6.0 replaces fragmented feedback checks with a canonical evidence-and-issue pipeline shared by analysis, report summaries, detailed feedback, student actions, progress records, and PDF export. It preserves the existing IELTS/Kru Pom scoring rubric and V12.5.0 durable async orchestration.

## Version matrix

| Contract | Version |
|---|---|
| App | `12.6.0` |
| Diagnostic engine | `ielts-diagnostic-engine-v12.6.0` |
| Rubric | `kru-pom-ielts-writing-v12.3.0` |
| Prompt | `ielts-diagnostic-prompt-v12.6.0` |
| Report schema | `ielts-diagnostic-report-v12.6.0` |
| Feedback schema | `feedback-integrity-v12.6.0` |
| Issue taxonomy | `issue-taxonomy-v12.6.0` |
| Evidence validator | `evidence-assertion-v12.6.0` |
| Revision validator | `revision-alignment-v12.6.0` |
| PDF text integrity | `pdf-text-integrity-v12.6.0` |
| Async orchestration | `async-render-v12.5.0` |

## Main changes

- Canonical evidence assertions with exact spans, offsets, corrections, and proof.
- Deterministic validation for punctuation spacing, countability, articles, and controlled subject–verb agreement.
- Sentence-role classification and task-aware issue taxonomy.
- One canonical issue graph for summaries, detailed feedback, revision targets, Student Action, and progress evidence.
- Task 2 route/thesis dimension checks across opinion, discussion, problem/solution, causes/effects, advantages/disadvantages, positive/negative development, and direct questions.
- Task 1 task-aware repair plans for charts, maps, processes, and mixed visuals.
- Revision-fidelity guardrails; unsafe revisions are withheld from the student view while retaining a safe internal audit trail.
- Report consistency checks that prevent unsupported summary claims.
- PDF text-layer integrity and bilingual print QA.
- Flat-root Render package and unambiguous deployment settings.

## Automated verification

- Source check: passed, 73 JavaScript modules.
- Automated suite: passed, 25 test files.
- V12.6 regression corpus: at least 20 Task 2 matrix cases and 20 Task 1 matrix cases.
- Existing scoring, auth, quota, storage, progress, async job, duplicate, and frontend bootstrap regression suites: passed.
- Render contract: `rootDir: .`, build `npm install`, start `npm start`, health `/api/health`.

## PDF verification

Local browser flow generated:

- Thai report: 14 A4 pages.
- English report: 9 A4 pages.

Both passed:

- full-page visual inspection;
- protected-block overflow check;
- internal-field leak check;
- replacement/null-character check;
- page-footer check;
- searchable text extraction with both `pypdf` and `pdfplumber/pdfminer`.

The false subject–verb advice for a relative clause such as `the problems we have` was found during visual QA, fixed, regression-locked, and absent from the rebuilt report.

## Real-provider status

The production provider harness is included as:

```text
npm run qa:provider:v12.6
```

It requires:

```text
OPENAI_API_KEY
OPENAI_MODEL=gpt-5.6-sol
DIAGNOSTIC_REQUIRE_FULL_ENGINE=true
```

No provider key was present in the release-build environment. Therefore:

- real-provider corpus execution is pending;
- real model latency/retry/repair statistics are pending;
- teacher review of actual `gpt-5.6-sol` output is pending;
- this manifest does **not** claim final commercial sale-readiness until those checks pass in the production account.

No synthetic provider result has been presented as a real-provider result.

## Deployment settings

GitHub upload location:

```text
/
```

Render Dashboard:

```text
Root Directory: [leave blank]
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

The ZIP must show `package.json` at its own root. Do not upload an enclosing release folder.

## Data and rollback

- No production deployment or data migration was performed.
- Persistent production data remains under `/var/data`.
- Rollback is code-only: redeploy the previous known-good commit/package while retaining the same persistent disk.
- Before any production rollout, preserve a backup/export of `/var/data`.

## Known boundary

Deterministic and local-browser checks cannot prove the behavior, availability, timing, or schema compliance of the external model account. Provider Connectivity, Production Output Contract, corpus run, and teacher review remain mandatory release gates.
