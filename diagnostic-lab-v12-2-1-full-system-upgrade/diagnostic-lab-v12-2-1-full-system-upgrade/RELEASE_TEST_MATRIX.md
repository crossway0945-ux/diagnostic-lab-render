# V12.2.1 Release Test Matrix

## Passed in a clean extracted project
- Exact root verifier: PASS
- `npm install` with Node 22.16.0: PASS
- npm audit: 0 vulnerabilities
- Syntax checks: PASS
- Full regression suite: PASS
- Task 1 fixture coverage: PASS
- Task 2 task-family and route coverage: PASS
- Authentication, ownership, quota, duplicate and progress tests: PASS
- Yuki partial-disagreement regression: PASS
- Production full-engine transport path with mocked Responses API: PASS
- Yuki login -> analysis -> save -> authenticated PDF endpoint: PASS
- Yuki PDF: 6 A4 pages, valid PDF header, searchable text, premium layout
- Sun bilingual renderer QA: English 12 pages and Thai 12 pages
- Protected card overflow: 0 in renderer QA
- Student PDF internal identifiers: 0
- Ctrl+M/browser overlay: 0
- Replacement-character corruption: 0

## Not claimed
A real OpenAI request using the owner's production API key cannot be executed in this build environment because that secret is not available here. The release includes:
- `npm run qa:provider-live`
- protected endpoint `/api/debug-analyze-health`

Run one of those after setting the real production key/model to verify provider authentication and model access.
