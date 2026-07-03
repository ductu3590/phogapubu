#!/usr/bin/env bash
set -euo pipefail

# Tạo 1 worktree git riêng cho mini-app của 1 quán — cùng chung lịch sử code lõi
# (mini-app/src) với nhánh main, nhưng .env + app-config.json là riêng của quán đó
# (không tracked, không đụng quán khác). Sau khi tạo, cd vào thư mục mini-app bên trong
# và `npm run dev`/`zmp deploy` bình thường, không cần sửa file dùng chung.
#
# Dùng: scripts/create-mini-app-instance.sh <slug> "<Tên hiển thị>"
# Ví dụ: scripts/create-mini-app-instance.sh cang-tin-pubu "Căng tin PUBU"

if [ $# -lt 2 ]; then
  echo "Dùng: $0 <slug> \"<Tên hiển thị>\""
  echo "Ví dụ: $0 cang-tin-pubu \"Căng tin PUBU\""
  exit 1
fi

SLUG="$1"
STORE_NAME="$2"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTANCE_DIR="$REPO_ROOT/mini-app-instances/$SLUG"
BRANCH="deploy/$SLUG"

if [ -d "$INSTANCE_DIR" ]; then
  echo "❌ $INSTANCE_DIR đã tồn tại — không tạo lại."
  echo "   Muốn làm lại: xoá thư mục này, chạy 'git worktree prune', rồi 'git branch -D $BRANCH'."
  exit 1
fi

cd "$REPO_ROOT"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Nhánh $BRANCH đã có sẵn — dùng lại cho worktree mới (không tạo nhánh mới)."
  git worktree add "$INSTANCE_DIR" "$BRANCH"
else
  git worktree add "$INSTANCE_DIR" -b "$BRANCH" main
fi

cd "$INSTANCE_DIR/mini-app"

cp .env.example .env
sed -i "s/VITE_DEFAULT_STORE_SLUG=.*/VITE_DEFAULT_STORE_SLUG=$SLUG/" .env
sed "s/__STORE_NAME__/$STORE_NAME/" app-config.example.json > app-config.json

echo ""
echo "✅ Đã tạo worktree cho quán \"$STORE_NAME\" tại:"
echo "   $INSTANCE_DIR/mini-app"
echo ""
echo "Việc cần làm tiếp (thủ công, chỉ 1 lần):"
echo "  1. Mở $INSTANCE_DIR/mini-app/.env, điền:"
echo "     - VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (giống mọi quán, lấy từ .env quán khác)"
echo "     - VITE_ZALO_APP_ID / APP_ID (Zalo Mini App ID RIÊNG của quán \"$STORE_NAME\")"
echo "  2. cd \"$INSTANCE_DIR/mini-app\" && npm install"
echo "  3. npx zmp login   — đăng nhập tài khoản Zalo sở hữu app này (ghi ZMP_TOKEN vào .env)"
echo ""
echo "Từ giờ về sau:"
echo "  npm run dev        — test local quán này, không đụng .env quán khác"
echo "  npx zmp deploy     — deploy đúng lên app Zalo của quán \"$STORE_NAME\""
echo ""
echo "Khi mini-app/src trên main có bản vá/tính năng mới, đồng bộ vào đây bằng:"
echo "  cd \"$INSTANCE_DIR\" && git fetch origin && git merge origin/main"
