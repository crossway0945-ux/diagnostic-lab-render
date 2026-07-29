# Rollback from V12.9.7

1. Stop new analyses or place the service in maintenance mode.
2. Preserve the Render persistent disk; do not delete users, reports, jobs or audit data.
3. Re-deploy the immediately previous verified source package to the same service.
4. Keep the Root Directory as `diagnostic-lab-v12-8-0-upload-ready`.
5. Keep the existing environment variables and disk mount unchanged.
6. Run `/api/health`, login, one cached-report open and one non-provider smoke check.
7. Re-enable analyses only after the previous version is healthy.

V12.9.7 does not require an irreversible data migration. Rolling back code does not require
rewriting stored reports. Reports created with additional V12.9.7 integrity metadata are designed
to remain readable through defensive optional-field handling.

Known rollback consequence: the previous version restores the framework/SAR/projection/PDF defects
fixed by V12.9.7.
