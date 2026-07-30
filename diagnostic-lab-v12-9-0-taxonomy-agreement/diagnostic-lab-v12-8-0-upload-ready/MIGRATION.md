# Migration to V12.9.8

No database or report-data migration is required.

1. Keep the existing persistent disk and environment variables unchanged.
2. Upload the extracted changed-files package into the existing repository parent
   `diagnostic-lab-v12-9-0-taxonomy-agreement/`, so its preserved
   `diagnostic-lab-v12-8-0-upload-ready/` wrapper overwrites the live source root.
3. Commit to `main` with `Release v12.9.8 diagnostic integrity and paragraph mapping fixes`.
4. Wait for Render to build with `npm install` and start with `npm start`.
5. Run every item in `PRODUCTION-SMOKE-TEST.md`.

The IELTS/Kru Pom rubric and provider prompt are unchanged. Stored V12.9.7 reports remain readable.
