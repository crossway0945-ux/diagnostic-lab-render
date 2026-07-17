# V11.4 PDF, Evidence Traceability and Progress-Version Proof Hotfix

V11.4 preserves the calibrated Sun result while repairing PDF completeness, multi-location evidence traceability, revision fidelity and progress-version accounting.

## Frozen calibration

- Overall: 6.0-6.5
- Task Response: 6.5
- Coherence & Cohesion: 6.0-6.5
- Lexical Resource: 6.0
- Grammatical Range & Accuracy: 6.0
- Position: strongly disagree
- Route: accessibility and traffic congestion

## Output fixes

- Eight detailed feedback cards now include the missing Body Paragraph 2 topic-sentence vocabulary repair.
- The Body 2 revision preserves the original route: `Furthermore, traffic congestion could increase if facilities of the same type were concentrated together within a single designated zone.`
- Priority issues retain every evidence location and exact evidence sentence instead of collapsing to one quote.
- The print report includes Evidence Scope, paragraph locations and all evidence items.
- The print serializer normalizes Unicode, removes invalid text-layer characters and uses ASCII hyphens/arrows for searchable PDF labels.
- The report cover is compacted so the next substantive section is not pushed onto a nearly empty page.
- Report-Version and Progress Proof lists the submission group, version lineage and progress eligibility.
- Engine reruns of the same student work are excluded from progress trends and repeated-issue counts.

## Regression proof

Run `npm test`. The V11.4 test freezes exact revision text, evidence location integrity, calibrated scores, deterministic submission grouping and print-source requirements.

Run `npm run proof:v11.4` to generate canonical JSON, report-version records, progress aggregation and a browser print fixture under `work/tmp/v11-4-proof`.
