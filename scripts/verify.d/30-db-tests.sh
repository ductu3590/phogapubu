#!/usr/bin/env bash
# Test migration/RPC bằng PGlite (supabase/tests/*.test.mjs, node:test)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
[ -d admin-web/node_modules/@electric-sql/pglite ] || (cd admin-web && npm ci --no-audit --no-fund)
# Đường dẫn thường (không phải file:// URL): đa số test tự gọi pathToFileURL.
# Riêng 048_pos_table_areas import thẳng nên đỏ trên Windows — nợ cũ, có task trả nợ.
PGLITE_MODULE="$(node -e "console.log(require('path').resolve('admin-web/node_modules/@electric-sql/pglite/dist/index.js'))")"
export PGLITE_MODULE
node --test supabase/tests/*.test.mjs
