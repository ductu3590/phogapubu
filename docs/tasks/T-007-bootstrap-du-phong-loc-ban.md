---
id: T-007
title: Đường đọc dự phòng của Mini App lọc bàn theo quán (khớp mig 140)
agent: frontend-dev
status: in_progress
depends_on: [T-005]
paths:
  - mini-app/src/app.tsx
  - mini-app/src/utils/**
  - docs/testing/mini-app-core/**
---
## Mục tiêu
Khi `get_mini_app_bootstrap` lỗi, `loadLegacy` (`mini-app/src/app.tsx` ~dòng 134-140) cũng chỉ nhận bàn thuộc đúng quán của slug —
cùng hành vi với mig 140.

## Bối cảnh
Review đợt T-002/T-003/T-005 (NOTE): mig 140 vá RPC, nhưng đường dự phòng vẫn đọc bàn chỉ theo `id` + `is_active`.
Hai truy vấn store/table chạy song song nên chưa có `store.id` lúc đọc bàn. Hướng gợi ý (agent tự chọn, giữ đơn giản):
lọc bàn bằng `store_id` lồng theo slug (`stores!inner(slug)` + `.eq("stores.slug", storeSlug)`), hoặc sau khi có cả hai
thì bỏ bàn nếu `table.store_id !== store.id`. Logic so khớp nên tách hàm thuần vào `src/utils/` để có test vitest.
Không đổi đường chính (bootstrap). Theme / trả trước / trả sau không đổi.

## Tiêu chí chấp nhận
- [ ] Test vitest cho hàm thuần: bàn đúng quán → giữ; bàn quán khác → bỏ (`table` null, app vào như lối thường)
- [ ] `python scripts/verify.py` xanh, nợ cũ không tăng
- [ ] Checklist ngắn `docs/testing/mini-app-core/BOOTSTRAP-DU-PHONG.md` cho anh Tú (cách ép rơi về đường dự phòng trên máy dev, ca bàn quán khác) — dừng chờ PASS theo CLAUDE.md
