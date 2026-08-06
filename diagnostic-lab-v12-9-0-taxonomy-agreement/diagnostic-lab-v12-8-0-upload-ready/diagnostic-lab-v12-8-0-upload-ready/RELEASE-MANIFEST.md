# V12.9.8 Release Manifest

## Identity

- Starting deployed application version: 12.9.8
- Final application version: 12.9.8
- Preserved source wrapper: `diagnostic-lab-v12-8-0-upload-ready/`
- Existing repository parent: `diagnostic-lab-v12-9-0-taxonomy-agreement/`
- Rubric version: `kru-pom-ielts-writing-v12.3.0` (unchanged)
- Prompt version: `ielts-diagnostic-prompt-v12.8.0` (unchanged)
- Full release file count: 151
- Test-file count: 46

## Why package file counts differ

The full ZIP is the complete release-safe source. The GitHub changed-files ZIP is an overwrite subset
calculated against deployed `main`; it is not a second copy of the full application. File removal is
not used to satisfy GitHub's 100-file web-upload limit.

## V12.9.8 Git baseline diff

- Unchanged: 128
- Modified: 18
- Added: 5
- Deleted: 0
- Renamed: 0

## Protected-system verification

- Source check: 106 JavaScript modules passed.
- Complete suite: 46 test files passed before packaging.
- Eva: four-paragraph map, route, Band 6.0 boundary, SAR Mixed, conclusion closure and issue/action
  parity passed.
- Evin and Sun route/language regressions passed.
- Task 1 chart, map, process and mixed-graph regressions passed.
- Async-render, durable jobs, idempotency, quota, admin authentication, CSRF, lifecycle guards,
  audit, session revocation, archive/restore and anonymisation regressions passed.
- PDF binary/text acceptance evidence passed all 25 rendered pages (Eva 13, Evin 12).

## Packaging policy

The full ZIP contains the complete release-safe source. The changed-files ZIP contains only added or
modified files relative to the deployed GitHub source root. `node_modules`, runtime data, real
student/report snapshots, audit data, logs, browser caches and generated static-preview output are
excluded. No source, test or public asset is removed to meet GitHub's 100-file web limit.
