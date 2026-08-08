# Runtime Promotional-Copy Removal

## User-facing result

PASS. Runtime tester/student-facing output contains no Early Access/Early-Bird/Founder/Founding Pilot pricing or purchase language and no THB amount. The Stage 0 UI now says `Private Access`, `Internal Validation Access`, `Access by invitation`, and `Diagnostic estimate only`.

## Surfaces checked

- Login and private-access DOM text
- Student plan projection
- Client quota and expiry messages
- API quota and expiry error bodies
- Generated Student View JSON
- Eva and Evin generated report/PDF text
- Static preview generated from the browser module graph

## Intentionally retained internal compatibility

Legacy database values and internal identifiers such as the `plan` field and existing CSS/DOM class names are retained because they are not user-facing output and renaming them could break authentication, storage or historical records. `displayAccessPlan()` converts a legacy promotional plan label to `Internal Validation Access` only when it is rendered.

Historical roadmaps, governance documents and planning decisions supplied as references were not edited. No replacement price was introduced.

## Regression gate

`tests/v12-9-8-stage0-control.test.mjs` extracts visible HTML text and the named client/API runtime message constants, then fails if prohibited promotional terms, purchase language or THB prices appear. Existing API and feedback-integrity tests enforce the neutral copy as well.
