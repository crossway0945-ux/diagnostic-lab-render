# Task 1 Map Consistency Hotfix - 2026-06-14

This package fixes only the Task 1 Map score/cap consistency bug.

## What Changed

- Added a Task 1 consistency validator after provider analysis.
- If a Task 1 Map report says the overview is accurate/strong and all four IELTS criteria are 7.0+, a critical overview cap is removed unless exact critical evidence proves the cap.
- Moderate map issues such as unsupported purpose language, one imprecise map verb, awkward collocation, or one dense sentence remain strict feedback, but they no longer force an automatic 5.0-5.5 cap.
- Missing overview and genuinely inaccurate overview cases remain strictly capped.
- Task 2 scoring was not intentionally changed.

## Historical note

This document records an earlier Task 1 hotfix. Do not use its former Root Directory value for V7. Current V7 settings are:

```text
Root Directory: diagnostic-lab-v7-one-shot-production-calibration-20260713-upload
Build Command: npm install
Start Command: npm start
```

No new environment variables are required.
