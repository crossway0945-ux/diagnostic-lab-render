# V11.2 Report-Integrity and Commercial-Output Hotfix

Release version: `11.2.0`

This release preserves the accepted Sun urban-zoning calibration:

- Overall: `6.0-6.5`
- Task Response: `6.5`
- Coherence & Cohesion: `6.0-6.5`
- Lexical Resource: `6.0`
- Grammatical Range & Accuracy: `6.0`
- Position: strongly disagree
- Thesis route: two clear reasons
- Body route alignment: Strong
- Concession: No concession
- Conclusion closure: Strong

## Corrected commercial-output defects

1. Body route alignment no longer appends development labels such as
   `adequately developed`; development remains in its own Moderate fields.
2. Targeted revisions pass a deterministic full-sentence integrity gate for
   issue removal, stance/route preservation, revision type, grammar and
   sentence completion.
3. The Sun Body 1 sentence is fully repaired rather than preserving
   `Every family is living...` or `travel through long distance`.
4. The Sun conclusion revision repairs the full sentence, not only
   `congestion of traffic`.
5. Lexical/reference problems are not mislabeled as optional grammar polish.
6. The personalized repair plan always contains Day 1 through Day 7.
7. Day 1 targets causal development when the thesis/body route is already
   strong.
8. Re-analysis of identical student writing after an engine update is marked
   `engine-upgrade` and excluded from progress comparisons.
9. Student-facing projection removes invalid/private-use Unicode and
   normalizes dash characters safely.
10. Long feedback cards may continue across print pages without being clipped.

## Release gates

- `npm run check`: passed
- `npm test`: passed
- V7, V8, V8.2, V10, V11, V11.1 and V11.2 regression suites: passed
- Local server smoke test: passed
- Static preview rebuilt from canonical sources

The V11.2 focused regression is:
`tests/v11-2-report-integrity-hotfix.test.mjs`.
