# V6.1 Validator Classification Hotfix

## Exact Reproduced Root Cause

The previous word-count contradiction parser treated shortfall language as a total word-count claim. For example:

- `The response is 60 words below the minimum` was parsed as a claim that the essay contained 60 words.
- `Verified count: 190/250 words` could be parsed as a 250-word total.

This produced `WORD_COUNT_METADATA_INTEGRITY` even though the trusted values were correct: word count 190, minimum 250, shortfall 60.

A second mismatch existed between paragraph normalization and validation. Any non-empty generated `paragraphFeedback` array was accepted by the normalizer, while the validator required coverage for every submitted paragraph. V6.1 merges missing paragraph items from exact student evidence before validation.

## Validation Classes

- `fatal_integrity`: malformed or unsafe report output. This still blocks delivery.
- `diagnostic_issue`: weaknesses in the student's writing. These are saved in the report and never block delivery by themselves.

Underlength, unfinished endings, unclear positions, route conflict, underdeveloped body paragraphs, and meaning-control failures are diagnostic conditions.

Wrong trusted word count, wrong student identity, malformed revisions, unsafe position changes, score/report contradictions, missing required report sections after normalization, and duplicated generated guidance remain fatal.

## Logging

Failed reports now log:

- validation code
- severity
- validation stage
- field
- message
- whether retry ran
- first and second attempt validation details

No API keys, passwords, session secrets, or full private report objects are logged by this change.

## Scope Protection

This hotfix does not change Task 1 calibration, Task 2 score calibration, student profiles, authentication, sessions, quota rules, cache rules, pricing, Render configuration, or the report design.
