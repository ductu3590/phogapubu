-- 101_operator_display_name.sql — Tên hiển thị của nhân viên/thu ngân.
--
-- Trang /admin/staff trước đây chỉ có email → chủ quán không biết tài khoản nào là của ai.
-- Thêm tên do chủ quán tự gõ. Để NULL cho tài khoản cũ (chủ quán bấm Chỉnh sửa để đặt tên).
-- Chỉ là nhãn hiển thị, KHÔNG dùng cho phân quyền.

alter table mevo_operators
  add column if not exists display_name text;

alter table mevo_operators
  drop constraint if exists mevo_operators_display_name_len;
alter table mevo_operators
  add constraint mevo_operators_display_name_len
  check (display_name is null or char_length(display_name) between 1 and 60);
