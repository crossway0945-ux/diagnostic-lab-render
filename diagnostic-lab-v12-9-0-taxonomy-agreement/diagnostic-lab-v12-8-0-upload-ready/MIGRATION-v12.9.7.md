# Migration to V12.9.7

No database or report-schema migration is required. Existing reports remain readable.

1. Back up the current repository branch and Render persistent disk.
2. Apply the full ZIP for a clean source replacement, or apply the changed-files ZIP to the existing
   `diagnostic-lab-v12-8-0-upload-ready/` directory.
3. Do not copy runtime JSON, users, reports, audit logs, `.env` files or secrets into the repository.
4. Preserve current Render environment variables and persistent-disk mount.
5. Use Node 22.16.0.
6. Run `npm install`, `npm run check` and `npm test`.
7. Confirm these Render settings:

   ```text
   Root Directory: diagnostic-lab-v12-8-0-upload-ready
   Build Command: npm install
   Start Command: npm start
   Health Check Path: /api/health
   ```

8. Perform the live-provider checklist before commercial release.
9. Deploy manually only after that external gate passes.

The rubric version intentionally remains `kru-pom-ielts-writing-v12.3.0`.
