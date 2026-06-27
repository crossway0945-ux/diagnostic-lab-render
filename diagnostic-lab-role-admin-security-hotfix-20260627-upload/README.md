# IELTS Writing 7+ Diagnostic Lab

Evidence-based IELTS Writing feedback using IELTS criteria and Kru Pom IELTS writing framework.

This is a private Early Access MVP for Kru Pom IELTS students. It is not a public registration system.

## Local Run

Use Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:4174/
```

## Environment Variables

Create a `.env` file from `.env.example`, then set the diagnostic provider key on the server:

```bash
OPENAI_API_KEY=your_provider_key_here
OPENAI_MODEL=gpt-5.5
OPENAI_BASE_URL=https://api.openai.com/v1/responses
OPENAI_TIMEOUT_MS=25000
OPENAI_MAX_OUTPUT_TOKENS=5000
OPENAI_REASONING_EFFORT=medium
DIAGNOSTIC_REQUIRE_FULL_ENGINE=true
NODE_ENV=development
HOST=127.0.0.1
PORT=4174
```

For Render/Railway production:

```bash
NODE_ENV=production
HOST=0.0.0.0
OPENAI_API_KEY=your_provider_key_here
OPENAI_MODEL=gpt-5.5
```

`OPENAI_MODEL` is required whenever `OPENAI_API_KEY` is set. Use `gpt-5.5` for the latest GPT-5.5 diagnostic engine. If the model is missing or unavailable to the account, `/api/analyze` returns `PROVIDER_MODEL_ERROR` and quota is not deducted. `OPENAI_REASONING_EFFORT=medium` is the recommended stability/default setting; use `high` only if your hosting timeout and OpenAI account limits can handle slower, deeper checks. `PORT` is usually assigned automatically by the hosting platform. API keys are read only by `server.js` and must never be exposed in frontend code.

For production checking quality, keep `DIAGNOSTIC_REQUIRE_FULL_ENGINE=true`. This prevents the app from returning a weak local/basic report when the GPT-5.5 diagnostic engine is not connected.

## Current Architecture

This project uses a zero-dependency Node.js server in `server.js`.

Because the app depends on backend routes for login, sessions, quota, progress history, and analysis, Render or Railway is more suitable than Netlify static hosting.

Netlify can work only if the backend is converted to Netlify Functions and user/progress storage is moved to a database or durable storage.

## Functional Now

- Task 1 / Task 2 mode switching
- Task 1 image upload validation
- Private username/password login
- Server-side session cookie
- Manual student accounts in `users.json`
- Per-student quota and expiry-date checks
- Per-student progress history in `submission-history.json`
- Separate Task 1 Progress, Task 2 Progress, and Activity History
- Backend `/api/analyze` endpoint
- Backend `/api/progress` endpoint
- Separate Task 1 and Task 2 prompt builders
- Strict Task 1 overview/data-accuracy guardrails
- Exact-sentence fallback when provider key is not configured
- Dashboard, criteria breakdown, framework breakdown, feedback cards, paragraph diagnosis, and 7-day repair plan
- Dedicated print-only report layout for browser Save as PDF

## Early Access Login

Student accounts are stored in:

```text
users.json
```

The browser never receives the full user list. Login is checked by the backend. After a successful login, the backend sets an HttpOnly session cookie named `ielts_session`.

Sessions are stored in server memory. If the server restarts, students need to log in again.

This is MVP early-access authentication, not full production authentication.

## Add a New Student Account

Open `users.json` and add a new object:

```json
{
  "username": "newstudent",
  "password": "123456",
  "displayName": "New Student",
  "plan": "Early Access",
  "quota": 20,
  "used": 0,
  "expiryDate": "2026-08-07",
  "role": "student",
  "createdAt": "2026-06-07"
}
```

Save the file. The next login will use the updated account list.

## Change Quota

In `users.json`, edit the student's `quota`:

```json
"quota": 30
```

`used` means how many successful analyses the student has already used.

Remaining analyses are calculated as:

```text
quota - used
```

Quota is reduced only after a successful analysis. Failed analysis attempts do not reduce quota.

## Extend Expiry Date

In `users.json`, edit the student's `expiryDate`:

```json
"expiryDate": "2026-09-30"
```

Users can still log in after expiry, but they cannot run analysis. They will see:

```text
Your early access period has ended. Please contact Kru Pom IELTS to extend access.
```

Expired accounts do not run analysis and do not use quota.

`expiryDate` is interpreted as valid until the end of that date in Bangkok time.

## Reset a Password Manually

In `users.json`, edit the student's `password`:

```json
"password": "newpassword"
```

Tell the student the new password privately.

Do not use plain-text passwords in production.

## Reset Usage Manually

To reset a student's usage, edit:

```json
"used": 0
```

## Progress History Storage

Progress Tracker records are stored in:

```text
submission-history.json
```

Each successful analysis creates one record tied to the logged-in `username`. The browser receives only the current student's records through `/api/progress`.

Do not delete or reset this file unless you intentionally want to clear test history.

## PDF Export

The `Export Diagnostic PDF` button builds a dedicated print-only diagnostic report from the current analysis data, then opens the browser print window.

For best PDF export, choose `Save as PDF` in the browser print window and turn off browser headers and footers.

The print report hides web UI controls such as sidebar navigation, login, buttons, forms, tabs, collapse controls, and package information. Browser-controlled URL/date/page headers can still appear if the user leaves browser headers and footers enabled.

## Deploy on Render

Recommended production path for this project. Use Render as the main web app and backend host, not Netlify Drop.

This package includes `render.yaml`, `RENDER_ENV_TEMPLATE.txt`, and `RENDER_LAUNCH_GUIDE_THAI.md`.

1. Create a new Web Service.
2. Connect the repository.
3. Use Node.js.
4. Build command:

```bash
npm install
```

5. Start command:

```bash
npm start
```

6. Add environment variables:

```text
NODE_ENV=production
HOST=0.0.0.0
DIAGNOSTIC_STORAGE_ADAPTER=local-json
DIAGNOSTIC_DATA_DIR=/var/data
DIAGNOSTIC_REQUIRE_FULL_ENGINE=true
DIAGNOSTIC_ANALYSIS_MODE=sync
DIAGNOSTIC_ENABLE_NETLIFY_BLOBS=false
OPENAI_API_KEY=...
OPENAI_MODEL=...
OPENAI_BASE_URL=https://api.openai.com/v1/responses
OPENAI_TIMEOUT_MS=180000
OPENAI_MAX_OUTPUT_TOKENS=3500
OPENAI_REASONING_EFFORT=low
```

Add a persistent disk mounted at `/var/data`. Render will provide `PORT` automatically.

## Deploy on Railway

Railway is also suitable for the current Node server.

1. Create a new project from the repository.
2. Set start command to:

```bash
npm start
```

3. Add the same environment variables listed above.

Railway will provide `PORT` automatically.

## Netlify Option

Netlify is not recommended as the main production backend for this detailed diagnostic engine.

The included `netlify.toml` can deploy:

- static frontend files from `netlify-static-preview`
- serverless API routes through `netlify/functions/api.js`
- a redirect from `/api/*` to the Netlify Function

However, long-running diagnostic analysis is more reliable on a normal Node web service such as Render or Railway.

This fixes the common deploy issue where the login page loads, but `/api/login` returns a Netlify HTML 404 page instead of JSON.

Suggested Netlify project name:

```text
diagnostic-wonderbloom
```

Expected preview URL:

```text
https://diagnostic-wonderbloom.netlify.app
```

In Netlify:

1. Create a new project named `diagnostic-wonderbloom`.
2. Use this folder as the site root:

```text
ielts-diagnostic-lab-prototype
```

3. Use the included `netlify.toml`.
4. Leave build command empty.
5. Publish directory should be:

```text
netlify-static-preview
```

Required Netlify environment variables:

```text
NODE_ENV=production
SESSION_SECRET=<long random secret>
ADMIN_SECRET=<admin-only secret, optional>
DIAGNOSTIC_STORAGE_ADAPTER=memory
DIAGNOSTIC_REQUIRE_FULL_ENGINE=true
OPENAI_API_KEY=<your provider key>
OPENAI_MODEL=gpt-5.5
OPENAI_BASE_URL=https://api.openai.com/v1/responses
OPENAI_TIMEOUT_MS=25000
OPENAI_MAX_OUTPUT_TOKENS=5000
OPENAI_REASONING_EFFORT=medium
```

Recommended storage values:

- Local Node server: `DIAGNOSTIC_STORAGE_ADAPTER=local-json`
- Netlify without durable storage: `DIAGNOSTIC_STORAGE_ADAPTER=memory`

Important limitation: Netlify Functions do not provide durable local file storage. This setup now refuses unsafe serverless `local-json` writes by default and falls back to `netlify-memory`. It can read the bundled `users.json` and `submission-history.json`, and it keeps new usage/history in warm function memory. For production-grade quota/history persistence, connect a database or durable storage later.

After deploy, verify the API before testing login:

```text
https://diagnostic.wonderbloom.co/api/health
```

Expected result after setting OpenAI env vars: JSON with `ok: true`, `apiConnected: true`, `diagnosticEngineConfigured: true`, `diagnosticEngineConnected: true`, `modelName: "gpt-5.5"`, and `storageMode: "netlify-memory"` or `"memory"`. If this URL returns HTML, the deploy package is missing `netlify/functions`, `services`, `schemas`, or the `netlify.toml` redirect.

## Student Account Management

Public signup is disabled. Student accounts are managed server-side only.

Account fields:

- `username`
- `password` for MVP local JSON storage
- `displayName`
- `quota`
- `used`
- `status`: `active` or `disabled`
- `expiryDate`
- `role`: `student` or `admin`

Admin API routes are protected by either an admin session cookie or `ADMIN_SECRET` sent as `x-admin-secret`.

```text
GET /api/admin/users
POST /api/admin/users
PATCH /api/admin/users/:username
POST /api/admin/users/:username/disable
POST /api/admin/users/:username/enable
```

Admin responses never return `password` or `passwordHash`.

Example create body:

```json
{
  "username": "student02",
  "password": "temporary-password",
  "displayName": "Student 02",
  "quota": 5,
  "status": "active",
  "expiryDate": "2026-12-31",
  "role": "student"
}
```

Example edit body:

```json
{
  "displayName": "Edited Student",
  "quota": 8,
  "password": "new-temporary-password",
  "status": "active"
}
```

Disabled accounts cannot log in or run analysis.

## Quota and Idempotency

Each successful analysis uses 1 credit.

Quota decreases only after:

- the session is valid
- the payload passes validation
- analysis succeeds
- the history record is saved

Quota does not decrease for failed login, invalid payloads, disconnected API routes, provider failures, page refreshes, or non-JSON HTML responses.

The frontend sends `clientSubmissionId` for every submit. The backend stores this key with the submission history. A duplicate request with the same key returns the existing report and does not charge quota twice.

`/api/progress` returns only the logged-in student's submissions.

## Recommended Production Domain

Recommended production domain:

```text
diagnostic.wonderbloom.co
```

Reason: this keeps the Diagnostic Lab separate from the main `wonderbloom.co` site and makes it feel like a private IELTS diagnostic tool.

Do not use `wonderbloom.co/diagnostic` unless the project is intentionally merged into the main Wonderbloom website later.

For Render/Railway, add `diagnostic.wonderbloom.co` as a custom domain in the hosting dashboard, then create the DNS record requested by that platform, usually a CNAME.

## Current Security Limitations

- Passwords are stored in plain text for MVP simplicity.
- Do not use plain-text passwords in production.
- This is not production-grade authentication.
- Sessions use signed HttpOnly cookies. Set a strong `SESSION_SECRET` in production.
- Local development progress history is stored in a local JSON file.
- Netlify memory storage is not durable across cold starts. Use durable storage for production quota/history.
- No public signup exists.
- No forgot-password flow exists yet.
- No rate limiting exists yet.
- Do not store official payment data in this app.
- Do not collect unnecessary personal data.
- For production, replace this with hashed passwords, persistent sessions, audit logs, rate limiting, account management, database storage, backups, and HTTPS deployment.

## Disclaimer

This diagnostic report provides an estimated band range based on IELTS Writing criteria and Kru Pom IELTS writing framework. It is not an official IELTS score and does not replace assessment by certified IELTS examiners.
