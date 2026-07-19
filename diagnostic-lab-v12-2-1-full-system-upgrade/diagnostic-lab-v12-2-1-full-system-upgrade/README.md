# Kru Pom IELTS Writing 7+ Diagnostic Lab V12.2.1

This upload-ready release uses one exact top-level project directory:

`diagnostic-lab-v12-2-1-full-system-upgrade`

`package.json` is directly inside that directory. No V11.7 subfolder is used for deployment.

## Render settings

- Root Directory: `diagnostic-lab-v12-2-1-full-system-upgrade`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`
- Node: `22.16.0`
- OpenAI model: `gpt-5.1`

Read `ROOT_DIRECTORY_EXACT.txt` and `RENDER_SETTINGS_EXACT.txt` before deploying.

## Verification commands

- `npm run verify:root`
- `npm run check`
- `npm test`
- `npm run qa:full-engine-mock`
- `npm run qa:yuki-api-pdf`
- `npm run qa:provider-live` requires the real production API key and model.
