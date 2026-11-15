#!/usr/bin/env bash
# mini-app (source lõi): vitest
set -euo pipefail
cd "$(dirname "$0")/../../mini-app"
[ -d node_modules ] || npm ci --no-audit --no-fund
npm test --silent
