#!/usr/bin/env bash
# Test migration/RPC bằng PGlite (supabase/tests/*.test.mjs, node:test)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
[ -d admin-web/node_modules/@electric-sql/pglite ] || (cd admin-web && npm ci --no-audit --no-fund)
# Đường dẫn thường (không phải file:// URL): mọi test tự gọi pathToFileURL (048 sửa ở T-003).
PGLITE_MODULE="$(node -e "console.log(require('path').resolve('admin-web/node_modules/@electric-sql/pglite/dist/index.js'))")"
export PGLITE_MODULE
node --test supabase/tests/*.test.mjs
