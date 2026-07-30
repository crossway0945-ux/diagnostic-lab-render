# V12.9.8 Release Manifest

## Identity

- Starting deployed application version: 12.9.7
- Final application version: 12.9.8
- Preserved source wrapper: `diagnostic-lab-v12-8-0-upload-ready/`
- Existing repository parent: `diagnostic-lab-v12-9-0-taxonomy-agreement/`
- Rubric version: `kru-pom-ielts-writing-v12.3.0` (unchanged)
- Prompt version: `ielts-diagnostic-prompt-v12.8.0` (unchanged)
- Full release file count: 142
- Test-file count: 42

## Why the user saw 51 files

`diagnostic-lab-v12.9.7-GITHUB-CHANGED-FILES.zip` contained exactly 51 added or modified files
relative to its V12.9.0 packaging baseline. It was a GitHub overwrite subset, not a full source
archive. The matching V12.9.7 full source archive contained 126 files. GitHub `main` currently
contains 127 files in the deployed source root.

## V12.9.8 Git baseline diff

- Unchanged: 92
- Modified: 35
- Added: 15
- Deleted: 0
- Renamed: 0

## Protected-system verification

- Source check: 102 JavaScript modules passed.
- Complete suite: 42 test files passed before packaging.
- Eva: four-paragraph map, route, Band 6.0 boundary, SAR Mixed, conclusion closure and issue/action
  parity passed.
- Evin and Sun route/language regressions passed.
- Task 1 chart, map, process and mixed-graph regressions passed.
- Async-render, durable jobs, idempotency, quota, admin authentication, CSRF, lifecycle guards,
  audit, session revocation, archive/restore and anonymisation regressions passed.
- PDF binary/text acceptance evidence from the verified working tree passed 11/11 page inspection.

## Packaging policy

The full ZIP contains the complete release-safe source. The changed-files ZIP contains only added or
modified files relative to the deployed GitHub source root. `node_modules`, runtime data, real
student/report snapshots, audit data, logs, browser caches and generated static-preview output are
excluded. No source, test or public asset is removed to meet GitHub's 100-file web limit.
