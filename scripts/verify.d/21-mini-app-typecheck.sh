#!/usr/bin/env bash
# mini-app (source lõi): typecheck. Lưu ý: app-config.json cố ý vắng ở source lõi (chỉ có trong
# mini-app-instances/<slug>) nên lỗi TS2307 '../app-config.json' là nợ cũ đã biết.
set -euo pipefail
cd "$(dirname "$0")/../../mini-app"
[ -d node_modules ] || npm ci --no-audit --no-fund
npm run typecheck --silent
