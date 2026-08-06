# Rollback — V12.9.8 Stage 0 Control Update

1. In Render, redeploy the last known-good commit from immediately before this Stage 0 update.
2. Do not delete or recreate the persistent disk.
3. Confirm `/api/health` still reports `appVersion: 12.9.8`.
4. Re-run one cached-report read and one administrator access check.

This update introduces no version or irreversible storage migration. Rollback does not require deleting reports,
users, quota records, jobs, audit records or sessions. Permanent Delete remains disabled.
