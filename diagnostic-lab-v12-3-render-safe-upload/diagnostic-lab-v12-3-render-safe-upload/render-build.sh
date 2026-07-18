#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' '=== Diagnostic Lab V12.0.3 Render build ==='
printf 'Render working directory: %s\n' "$(pwd)"
if [ ! -f "app/package.json" ]; then
  printf '%s\n' 'ERROR: app/package.json is missing.' >&2
  printf '%s\n' 'Expected Render Root Directory: diagnostic-lab-v12-3-render-safe-upload' >&2
  printf '%s\n' 'Files visible from the current directory:' >&2
  find . -maxdepth 3 -type f -print | sort >&2 || true
  exit 64
fi
cd app
printf 'Application directory: %s\n' "$(pwd)"
install_ok=0
for attempt in 1 2 3; do
  printf 'npm ci attempt %s/3\n' "$attempt"
  if npm ci; then
    install_ok=1
    break
  fi
  if [ "$attempt" -lt 3 ]; then
    printf '%s\n' 'npm ci failed; waiting 10 seconds before retry.' >&2
    sleep 10
  fi
done
if [ "$install_ok" -ne 1 ]; then
  printf '%s\n' 'ERROR: npm ci failed after three attempts.' >&2
  exit 65
fi
npm run build:static
npm run check
