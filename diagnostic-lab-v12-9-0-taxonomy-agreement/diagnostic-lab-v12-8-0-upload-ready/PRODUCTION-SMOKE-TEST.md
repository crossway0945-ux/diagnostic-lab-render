# V12.9.8 Production Smoke Test

## Health and readiness

- `/api/health`: `appVersion` is `12.9.8`.
- Provider model is the intended production model.
- `diagnosticEngineConfigured`, `fullEngineRequired`, `durableStorage` and async-render are correct.
- `/api/readiness`: frontend preflight passes and expected public modules are present.

## Eva explicit rerun

- Creates a new report version in the same submission group.
- Names the correct parent report and leaves the old report accessible.
- Charges quota exactly once.
- Produces four paragraphs, approximately Band 6.0, SAR Mixed and a functionally strong conclusion
  with language repair.
- Top Issues, Paragraph Coverage and Repair Plan remain aligned.
- PDF is approximately 10–16 pages, searchable, and free of internal IDs and Unicode corruption.

## Evin and Task 1

- Evin retains route presence and no false Subject-Verb Agreement issue.
- Task 1 chart, map, process and mixed graph retain correct overview logic.
- Task 1 never requires a conclusion and never inherits Task 2 SAR logic.

## Security and lifecycle

- Anonymous and non-admin users are blocked from admin surfaces.
- CSRF and session revocation remain enforced.
- Archive/restore works and audit entries persist.
- Permanent Delete remains disabled.
