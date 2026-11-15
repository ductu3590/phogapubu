---
id: T-005
title: get_mini_app_bootstrap lọc bàn theo quán + test PGlite (SHOULD từ review T-001)
agent: backend-dev
status: todo
depends_on: [T-001]
paths:
  - supabase/migrations/140_*.sql
  - supabase/tests/140_*.test.mjs
  - mini-app/src/utils/bootstrap.ts
---
## Mục tiêu
Khối `table` của `get_mini_app_bootstrap` chỉ trả bàn thuộc đúng quán theo slug; có test SQL khoá hành vi hàm.

## Bối cảnh
Review đợt T-001 (2026-11-15), mục 2 + 9 + 13:
- `supabase/migrations/135_mini_app_bootstrap.sql:61-64` lấy bàn chỉ theo `t.id = p_table_id AND t.is_active`, thiếu `AND t.store_id = s.id`
  → QR ghép slug quán A với `table_id` quán B hiện bàn của B dưới tên A. Không phải lỗ rò (anon đọc được bàn đang bật qua REST,
  `create_order` vẫn kiểm `store_id`), nhưng sai.
- Chưa có test SQL cho hàm.
- Chú thích `mini-app/src/utils/bootstrap.ts:2` nói payload sai hình "rơi về đường đọc cũ" nhưng `app.tsx` khi `!boot` chỉ `setBootDone()`.

Mig 135 ĐÃ áp prod — không sửa file 135. Theo CLAUDE.md §6: `CREATE OR REPLACE` một RPC đang sống phải nằm RIÊNG một
migration, không ghi "rerun-safe"; giữ nguyên `SECURITY INVOKER`, chữ ký, danh sách cột trả về và GRANT như 135.
Orchestrator áp file lên prod (nguyên văn) sau khi merge — subagent không áp.

## Tiêu chí chấp nhận
- [ ] `supabase/migrations/140_mini_app_bootstrap_table_store.sql`: thân hàm = 135 + điều kiện `t.store_id = s.id`; không đổi gì khác (diff hàm chỉ một dòng)
- [ ] `supabase/tests/140_mini_app_bootstrap.test.mjs` (PGlite, nạp migration cần thiết như các test khác, `pathToFileURL(process.env.PGLITE_MODULE)`): slug đúng trả quán; quán `is_active=false` → NULL; slug sai → NULL; `p_table_id` của quán khác → `table` null; bàn đúng quán → có `table`
- [ ] Chú thích `mini-app/src/utils/bootstrap.ts` khớp hành vi thật (payload sai hình → app dừng ở màn chờ, không gọi đường cũ); không đổi code
- [ ] `python scripts/verify.py` xanh, nợ cũ không tăng
