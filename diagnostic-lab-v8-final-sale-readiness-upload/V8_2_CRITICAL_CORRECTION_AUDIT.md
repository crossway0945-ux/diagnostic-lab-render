# V8.2 Critical Correction Audit

## Audit baseline

- Input artifact: `diagnostic-lab-v8-final-sale-readiness-upload(1).zip`
- Input package version: `0.8.1`
- Artifact SHA-256: `abc2df96899d26399839c4f8dd7c971cce3daa589238496b6cddedba97457e27`
- The supplied artifact contains no `.git` directory. Branch, commit hash, production deployment commit, `git status`, `git diff`, and the latest 20 commits therefore cannot be recovered from this upload. V8.2 changes were audited against a byte-for-byte extracted V8.1 baseline instead.
- Production deployment was not changed by this work.

## Source-of-truth audit

- Task 2 prompt classification, position detection, route detection, deterministic cap logic and criterion reconciliation: `services/task2Safety.js`
- Final canonical serialization and framework projection: `services/canonicalAnalysis.js`
- Provider normalization, recovery and canonical guardrail application: `services/aiAnalyzer.js`
- Submission validation, mismatch blocking, history metadata, invalidation and server progress summary: `services/apiRouter.js`
- Durable history and validity mutations: `services/storage.js`
- Student report, PDF and progress rendering: `script.js`
- Task 1 remains on its existing task-specific prompt, schema and canonical projection path.

## Conflicts found in V8.1

- Prompt classification could match the user-selected label instead of the prompt itself.
- `heavily disagree` was absent from the explicit-position pattern.
- Opinion bodies were labelled with generic `supports/opposes the proposition` language and an opposing concession could create a false contradiction.
- A missing-position cap could be applied even when semantic evidence established a position.
- Provider-generated Kru Pom text could overwrite canonical framework status and diagnosis.
- History stored only the selected essay type, not selected and canonical classification metadata.
- Browser progress could treat stale history as the current report and did not exclude known-invalid reports.
- Student-facing warnings included an internal canonical-engine banner.
- Deployment documents instructed Render to use a folder Root Directory even though the delivered archive is flat.

## Consolidated correction

- Prompt-only classification now dominates. High-confidence mismatch stops before provider access, profile mutation, cache, progress, usage or daily-limit mutation. Low-confidence classification requires explicit confirmation and stores that confirmation.
- Opinion position and body-route assessment now use writer-relative labels. A clear disagreement plus a relevant concession is partially controlled, not automatically contradictory.
- Position caps require absence across introduction, conclusion and semantic evidence with low confidence.
- Canonical Task 2 executive summary, framework display, criteria and overall arithmetic are projected from one canonical object.
- Sun's full-essay lexical and grammar signals are detected across the essay; correct stance language is not converted into a missing-position penalty.
- Teacher/admin report invalidation is ownership-scoped. Invalid reports retain audit metadata, do not alter credits, do not block resubmission cache, and are excluded from progress calculations.
- Server progress defines current versus previous attempts using server timestamps plus submission-id tie-breaking. Current PDF/report summaries use the current canonical range.
- Root and static-preview renderers are kept byte-identical.

## Release gate

Run both commands from the extracted package root:

```bash
npm run check
npm test
```

The V8.2 suite includes the exact 264-word Sun fixture, high-confidence mismatch blocking, low-confidence confirmation, ownership-safe invalidation and invalid-report progress exclusion in addition to all V7, V8 and V8.1 regression coverage.

Render settings for this flat ZIP:

```text
Root Directory: LEAVE BLANK
Build Command: npm install
Start Command: npm start
```
