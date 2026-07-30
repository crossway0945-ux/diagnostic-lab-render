# Rollback from V12.9.8

1. In Render, redeploy the last known-good V12.9.7 commit.
2. Do not delete or recreate the persistent disk.
3. Confirm `/api/health` reports `appVersion: 12.9.7`.
4. Re-run one cached-report read and one administrator access check.

V12.9.8 introduces no irreversible storage migration. Rollback does not require deleting reports,
users, quota records, jobs, audit records or sessions. Permanent Delete remains disabled.
