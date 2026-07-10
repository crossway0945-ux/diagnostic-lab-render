# Render Hotfix - Structured Output Retry

This hotfix is for the Render production app.

## Fixed

- Added one automatic retry when the diagnostic engine returns an incomplete or non-parseable structured JSON response.
- The retry uses the same student submission, a stricter JSON-only instruction, and a slightly larger output token allowance.
- Quota is still deducted only after a valid diagnostic report is produced and stored.

## Why

The backend, provider connection, timeout, and persistent storage were already working, but some long Task 2 submissions could still fail with:

```text
Analysis could not be completed cleanly.
```

That message means the provider response was not clean structured JSON for the app to render. The server now handles this case automatically instead of asking the student to retry manually.
