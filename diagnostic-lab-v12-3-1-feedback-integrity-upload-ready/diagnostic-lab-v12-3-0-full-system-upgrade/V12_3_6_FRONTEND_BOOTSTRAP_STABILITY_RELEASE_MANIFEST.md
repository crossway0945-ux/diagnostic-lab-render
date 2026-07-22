# V12.3.6 Frontend Bootstrap Stability — Release Manifest

Fixes the production outage where https://diagnostic.wonderbloom.co/ rendered only a solid dark-green
background. Starting version **12.3.5** → released **12.3.6**. Frontend/asset-delivery only — no
scoring, feedback, taxonomy, revision, auth, quota, storage or layout logic changed.

## Exact root cause

V12.3.5 added a new browser module, `domain/revisionQuality.js`, imported by
`domain/feedbackIntegrity.js` (and transitively by `domain/canonicalAnalysis.js`). The static file
server used a **hand-maintained allowlist** in `server.js` that was never updated to include it.

Affected import chain (all browser-side):

```
script.js
  → services/canonicalAnalysis.js
    → domain/canonicalAnalysis.js
      → domain/feedbackIntegrity.js
        → domain/revisionQuality.js   ← not in the server allowlist
```

Reproduced against the real server from the V12.3.5 build:

```
GET /                              → 200
GET /script.js                     → 200
GET /domain/feedbackIntegrity.js   → 200
GET /domain/revisionQuality.js     → 404  {"ok":false,"error":"Not found"}
```

Because the ES module graph could not complete, `script.js` never executed, `checkSession()` never
ran, and `document.body.classList.remove("auth-loading")` never fired — so `<body class="auth-loading">`
kept every element hidden over the dark-green background.

**Missing module path:** `domain/revisionQuality.js`.
**Server allowlist defect:** `server.js` hand-listed public files; the new module was omitted.
**Static-preview defect:** `scripts/build-static-preview.mjs` had a second independent hand-list, also
missing `revisionQuality.js`, `reportViewModels.js` and `textIntegrity.js`.

## Why existing tests did not catch it

`npm test` and `node --check` prove syntax and unit behaviour, but nothing launched the real Node
server and fetched the browser module graph over HTTP. A module could be imported by the browser yet
never served, and no test would notice. This release adds that missing layer.

## Shared public-asset solution (single source of truth)

New `services/publicAssetGraph.js` resolves the browser module graph **automatically** from the
entrypoints (`script.js`, `admin.js`) by parsing static relative imports, recursively. A new browser
module becomes public the instant something reachable imports it — the two hand-lists are gone.

- Only static relative imports (`./`, `../`) from approved entrypoints are followed, so a server-only
  module (storage, api router, provider client, secrets) can never enter the public set. A forbidden
  basename/segment guard rejects it defensively.
- `resolvePublicFilePaths()` → server allowlist. `validatePublicAssetGraph()` → preflight result.
- `NETLIFY_MIRROR_EXTRAS` documents the few server-side canonical files the Netlify preview mirrors
  for parity (`domain/index.js`, `domain/task1Classification.js`, `services/task2Safety.js`); these are
  **not** added to the Render server allowlist.

`server.js` now builds the allowlist from this graph, and `scripts/build-static-preview.mjs` uses the
same graph (rebuilding into a cleaned directory so a stale file can never mask a missing module).

## Server startup preflight

Before accepting traffic, `server.js` runs `validatePublicAssetGraph`. If the graph is incomplete,
escapes root, or would expose a server-only file, it logs the reason and `process.exit(1)` — the
server refuses to start rather than serve a blank application. On success it logs app version, public
module count and entrypoints.

## Blank-screen fail-safe

`index.html` now contains a classic (non-module) startup watchdog that runs **before** the module
entrypoint:

- waits for `window.__DIAGNOSTIC_APP_BOOTED__`, set by `script.js` only after `checkSession()` settles
  (which always leaves either the login screen or the app shell, both removing `auth-loading`);
- listens for capture-phase resource `error` events (a 404 module fires one) and a 10-second timeout;
- on failure, removes `auth-loading` and shows a controlled panel — "Diagnostic Lab could not start
  correctly. Please reload the page. If the problem continues, contact Kru Pom IELTS." — with a
  **Reload Page** button and a **Contact Kru Pom IELTS** link, exposing no file paths or stack traces;
- a `<noscript>` notice covers JavaScript-disabled browsers.

## Cache and content-type safety

Static responses now send `X-Content-Type-Options: nosniff`. HTML/JS/CSS use
`Cache-Control: no-cache, must-revalidate` so an old HTML can never load a new, incomplete module
graph and a new HTML never runs stale modules; `/assets` fonts keep a 1-day cache. Modules are served
as `application/javascript; charset=utf-8`; missing files remain JSON 404; `/api/*` stays JSON.

## Health and readiness

New `GET /api/readiness` (no OpenAI, no student data) returns `appVersion`,
`frontendAssetManifestVersion`, `publicModuleCount`, `frontendPreflightPassed`, `frontendEntrypoints`,
and 503 if the graph is incomplete. `/api/health` is unchanged.

## Tests added

New `tests/v12-3-6-frontend-bootstrap.test.mjs`:
- launches the **real** `server.js` on an ephemeral port, parses `index.html`'s module entrypoint,
  recursively fetches the whole browser graph, and asserts every module is **200 `application/javascript`**
  (this test fails on the pre-fix build with the 404);
- asserts the graph contains `revisionQuality.js`, `reportViewModels.js`, `textIntegrity.js`, etc.;
- asserts a genuinely missing module throws a precise error and fails preflight (release block);
- asserts `nosniff` + revalidating cache headers, `/services/storage.js` stays 404 JSON, readiness OK,
  and API routes return JSON;
- asserts the watchdog + noscript exist and run before the module script, and `script.js` sets the
  boot flag after session bootstrap;
- asserts the cleaned static preview contains the full graph and no server-only file.

## Tests executed (real evidence)

- `node scripts/build-static-preview.mjs && node scripts/run-tests.mjs` → **Test suite passed: 20 files.**
- `node --check` on every server/service/domain/schema/renderer/script/function file → **0 failures.**
- Real HTTP (pre-fix): `/domain/revisionQuality.js → 404`. (post-fix): all 12 browser modules → **200 JS**.
- Real browser (in-app headless, `http://127.0.0.1:4210/`):
  - login screen visible; `document.body.className === ""` (auth-loading removed);
    `window.__DIAGNOSTIC_APP_BOOTED__ === true`; no startup-error panel; **no console errors**;
  - Network: every `.js` module including `/domain/revisionQuality.js` → **200 OK**, zero 404s;
  - Fail-safe: with the real watchdog and a never-booting page, the controlled panel renders, body
    auth-loading is cleared, Reload + Contact present, **no file paths/module names/stack traces leaked**.

Browser screenshots could not be captured (the in-app pane does not composite frames headlessly), so
the evidence above is the accessibility tree, live DOM state, network log and console log instead.

## Files changed

| File | Change |
|---|---|
| `services/publicAssetGraph.js` | **new** — recursive module-graph resolver + preflight |
| `server.js` | allowlist from the graph; startup preflight; `nosniff` + cache headers; `/api/readiness` |
| `scripts/build-static-preview.mjs` | uses the shared graph; clean rebuild |
| `index.html` | startup watchdog + noscript; cache-bust token → `diagnostic-v12-3-6-frontend-bootstrap` |
| `script.js` | sets `__DIAGNOSTIC_APP_BOOTED__` after `checkSession()` settles |
| `services/analysisVersions.js`, `package.json`, `package-lock.json` | `appVersion` → 12.3.6 |
| `tests/v12-3-6-frontend-bootstrap.test.mjs` | **new** |
| existing tests | version string bumps; two assertions retargeted from the removed hand-list to the graph mechanism (behaviour proven by the new HTTP test) |

## Files deliberately untouched

All scoring/analysis/taxonomy/revision logic (`domain/feedbackIntegrity.js` logic,
`domain/revisionQuality.js` logic, `domain/task2Safety.js`, `domain/canonicalAnalysis.js` logic,
`services/aiAnalyzer.js`, `services/promptBuilder.js`, schemas), auth/quota/duplicate/storage
(`services/apiRouter.js`, `services/storage.js`), report/PDF rendering, `styles.css`, Render settings,
custom domain, package copy. `engineVersion`, `rubricVersion`, `promptVersion`, `reportSchemaVersion`,
`feedbackSchemaVersion`, `issueTaxonomyVersion`, `revisionValidatorVersion` all stay at their 12.3.5
values by design.

## Active GitHub upload path & Render settings

Upload the **contents** of the ZIP into the existing active application folder (do not upload the ZIP
itself, do not create a new nested version folder, do not delete the parent):

```
diagnostic-lab-v12-3-1-feedback-integrity-upload-ready/diagnostic-lab-v12-3-0-full-system-upgrade/
```

Render Root Directory, Build (`npm install`), Start (`npm start`), `DIAGNOSTIC_DATA_DIR=/var/data`,
env vars, custom domain — all unchanged.

## Render smoke-test steps (post-deploy)

1. Deploy latest commit; wait for "Live".
2. Open https://diagnostic.wonderbloom.co/ with a hard refresh (Ctrl+F5) → **login screen appears**, no blank green.
3. DevTools Console → no errors. Network → no 404 `.js`; `/domain/revisionQuality.js` → 200.
4. `GET /api/health` → `"appVersion":"12.3.6"`. `GET /api/readiness` → `frontendPreflightPassed:true`.
5. Log in with a safe test account → dashboard opens. Open one saved report → scoring unchanged. Export one PDF → layout unchanged.
6. Log out → login returns. Test mobile width and an incognito window (cache-clean) → both boot.

## Rollback

Render → Deploys → select the last known-good deploy **before** V12.3.5 (the one that still rendered
the login screen) → "Redeploy". No GitHub, data, disk, domain or Root Directory change is needed.
V12.3.6 is the forward fix and is preferred over rollback.

## Remaining limitations

1. Browser **screenshots** could not be captured headlessly on this machine; DOM/network/console
   evidence is provided instead.
2. Verification used the deterministic local engine and the in-app headless browser, not the live
   Render deployment; run the post-deploy smoke steps above to confirm in production.
3. Admin.js currently has no imports, so the admin module graph is trivially complete; the resolver
   will cover it automatically if admin modules are added later.
