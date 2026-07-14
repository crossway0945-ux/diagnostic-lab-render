# V8.1 Output-Recovery Hotfix

Date: 14 July 2026 (Asia/Bangkok)

## Production symptom

A provider response could contain valid scoring, route and evidence data but one incomplete generated field such as `In addition.` or the same generic action repeated across several cards. The final validator rejected the whole report with `REPORT_OUTPUT_VALIDATION_FAILED`, even though the defective presentation card could be safely omitted.

## Root cause

The final integrity validator correctly detected malformed output, but the normalization layer did not fully separate recoverable provider-presentation defects from fatal report-integrity contradictions. As a result, a local text-quality defect reached the fatal release gate.

## Consolidated correction

- Normalize and evaluate all feedback cards before canonical projection.
- Remove cards with incomplete generated fields, unsafe partial Task 2 revisions, prompt leakage, invalid Task 1 introduction revisions or internally repeated generated text.
- Keep deterministic Task 1 and Task 2 safety cards and create one exact-evidence fallback only when no usable card remains.
- Make guidance card-specific when a provider repeats identical generic text across three or more cards.
- Rebuild Top 3 links from the final retained evidence cards; for serious Task 2 interactions, preserve completion, thesis-route and meaning-control priorities.
- Recover incomplete executive-summary fields from the highest-priority retained evidence.

## Integrity boundary retained

The hotfix does not suppress or downgrade fatal contradictions. Trusted metadata, student identity, backend word count, canonical criterion arithmetic, route state, cap metadata and exact evidence remain fail-closed. A failed fatal-integrity report consumes no credit and writes no history record.

## Regression evidence

`npm run check && npm test` passes, including:

- Task 1 provider output with one fragmentary revision: report succeeds, the bad card is absent, one credit is consumed and one history record is saved.
- Task 2 provider output with a fragmentary revision, repeated generic actions and conflicting Top 3 mappings: report succeeds with retained exact evidence and deterministic Top 3 links.
- Provider output claiming a false backend word count: both attempts fail, no additional credit is consumed and no new history record is saved.
- V7 calibration, V8 Task 1/Task 2 golden matrices, canonical serialization, profile isolation and permanent-deletion tests remain green.
