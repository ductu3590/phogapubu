---
id: T-001
title: Mini App Yên Garden (theme garden) — qua test và lên main
agent: frontend-dev
status: done
depends_on: [T-000]
from_branch: claude/yen-garden-mini-app-aa37d2
paths:
  - mini-app/**
  - admin-web/lib/actions/**
  - admin-web/app/admin/menu/**
  - docs/testing/yen-garden/**
  - docs/design/yen-garden/**
  - docs/brand/yen-garden/**
---
## Mục tiêu
Đưa nhánh `claude/yen-garden-mini-app-aa37d2` (+12 commit: theme `garden`, khởi động một lượt `get_mini_app_bootstrap`,
nút "gọi thêm bia", `menu_categories.quick_reorder`) qua test của anh Tú rồi gộp vào `main`.

Bắt đầu bằng `python scripts/task.py start T-001 --from claude/yen-garden-mini-app-aa37d2`.

## Đầu vào / contract dùng
- Mig 134 (`stores.mini_app_theme`), 135 (`get_mini_app_bootstrap`), 136 (`menu_categories.quick_reorder`) — **đã áp prod**.
- Theme classic (Bảo Lương) phải giữ nguyên hành vi.

## Tiêu chí chấp nhận
- [x] Gộp `main` mới nhất vào nhánh, `python scripts/verify.py` không tệ hơn baseline — 964f310, typecheck nợ cũ 5→1
- [x] Anh Tú PASS `docs/testing/yen-garden/MINI-APP.md` (dừng chờ PASS theo quy tắc test của CLAUDE.md) — PASS hết A–E 2026-11-15
- [x] Theme classic trên Bảo Lương không đổi (chụp màn đối chiếu) — bài A2 anh Tú PASS, đối chiếu `screens/bl-*.png`
- [ ] Gộp vào `main`; nhắc anh Tú `git merge origin/main` ở `mini-app-instances/yen-garden` TRƯỚC khi `zmp deploy` (chọn Development/Testing)

## Ghi chú
- KHÔNG sửa `mini-app-instances/**` (vùng không đụng). `.env` của worktree quán chưa có Zalo App ID — việc của anh Tú.
- Quán `yen-garden` trên prod còn DỮ LIỆU MẪU → T-004.
