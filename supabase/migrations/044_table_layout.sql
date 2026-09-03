-- 044_table_layout.sql — toạ độ ô lưới cho sơ đồ bàn ở màn POS /admin/cashier
-- Spec: docs/superpowers/specs/2026-09-03-pos-cashier-bill-edit-design.md §1.2
--
-- Chỉ ALTER TABLE ... IF NOT EXISTS. File này KHÔNG chứa CREATE OR REPLACE của bất kỳ RPC
-- đang chạy thật, nên chạy lại an toàn (quyết định 2026-09-01).
--
-- Toạ độ là Ô LƯỚI (cột 0..11, hàng 0..n), KHÔNG phải pixel: snap lưới thì hai bàn không bao
-- giờ chồng nhau và sơ đồ không vỡ khi đổi cỡ màn hình.

alter table tables add column if not exists pos_x smallint;
alter table tables add column if not exists pos_y smallint;

comment on column tables.pos_x is
  'Cột trong lưới sơ đồ bàn (0..11) ở /admin/cashier. NULL = chưa sắp, client tự xếp theo tên bàn.';
comment on column tables.pos_y is
  'Hàng trong lưới sơ đồ bàn (0..n) ở /admin/cashier. NULL = chưa sắp.';

notify pgrst, 'reload schema';
