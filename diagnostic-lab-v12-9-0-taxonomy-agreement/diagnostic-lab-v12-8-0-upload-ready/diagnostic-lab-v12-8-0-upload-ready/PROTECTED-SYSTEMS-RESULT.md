# Protected Systems Result

## Verdict

PASS. `npm run check` validated 106 JavaScript modules and `npm test` passed all 46 test files after the scoped changes and deployed-only carry-forward.

| Protected system | Result | Regression evidence |
| --- | --- | --- |
| Authentication, roles, student separation | PASS | `diagnostic-api`, `v12-9-0-admin-security`, `v12-9-1-admin-hardening` |
| Admin authentication, CSRF, lifecycle and audit | PASS | `v12-9-0-admin-security`, `v12-9-1-admin-hardening` |
| Quota, exactly-once charging and teacher limit | PASS | `diagnostic-api`, `v12-5-0-async-render`, `v12-9-2-explicit-rerun` |
| Duplicate cache, explicit rerun and lineage | PASS | `v12-9-2-explicit-rerun` |
| Async 202 flow, durable jobs, polling and recovery | PASS | `v12-5-0-async-render` |
| Local durable storage and historical reports | PASS | `v10-commercial-sale-readiness`, `v12-5-0-async-render`, `v12-9-2-explicit-rerun` |
| Prompt/provider-key protection | PASS | `v12-4-1-analysis-reliability`, `v12-8-2-canonical-qa-export` |
| Criterion scoring and final score trace | PASS | `v11-final-sale-readiness`, `v12-9-1-canonical-consistency-gate`, Eva score trace |
| Paragraph map and raw offsets | PASS | `v12-9-7-eva-paragraph-map-stopship`, final Eva paragraph-map audit |
| Evidence, issue graph, deduplication and parity | PASS | `v12-6-0-global-feedback-integrity`, `v12-9-3-report-integrity`, `v12-9-7-framework-evidence-contract` |
| Feedback, revisions, Paragraph Coverage and Repair Plan | PASS | `v12-8-0-output-integrity`, `v12-9-4-report-quality`, `v12-9-5-report-density` |
| Student View allowlist and internal-ID boundary | PASS | `v12-7-0-global-root-cause-correction`, `v12-9-7-framework-evidence-contract`, Stage 0 control test |
| PDF text, pagination and print packing | PASS | `v11-4`, `v12-9-4`, `v12-9-5`, final binary inspection and visual review |
| Render root/build/start contract | PASS | `v12-3-4-production-diagnosis-precision`, `render.yaml`; configuration unchanged |

No production deployment was performed. Live provider execution remains credential-dependent and was not substituted with a synthetic claim.
