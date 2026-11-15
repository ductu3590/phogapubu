#!/usr/bin/env bash
# print-agent (Electron): vitest
set -euo pipefail
cd "$(dirname "$0")/../../print-agent"
[ -d node_modules ] || npm ci --no-audit --no-fund
npm test --silent
