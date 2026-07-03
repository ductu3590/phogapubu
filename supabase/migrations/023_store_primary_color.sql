-- 023 — Màu chủ đạo Mini App theo từng quán (theme runtime, không phải bí mật).
-- Default trùng giá trị hardcode hiện tại trong mini-app/src/tokens.js (#A0673D) nên
-- quán cũ không đổi giao diện gì cho tới khi ai đó chủ động sửa qua /mevo.
alter table stores
  add column if not exists primary_color text not null default '#A0673D';
