#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' '=== Diagnostic Lab V12.0.3 Render start ==='
if [ ! -f "app/package.json" ]; then
  printf '%s\n' 'ERROR: app/package.json is missing from the configured Render Root Directory.' >&2
  exit 64
fi
cd app
exec npm start
