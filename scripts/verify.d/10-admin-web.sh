#!/usr/bin/env bash
# admin-web: unit test (vitest) + typecheck
set -euo pipefail
cd "$(dirname "$0")/../../admin-web"
[ -d node_modules ] || npm ci --no-audit --no-fund
npm test --silent
npx tsc --noEmit --pretty false
