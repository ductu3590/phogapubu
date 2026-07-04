-- 024_store_wifi.sql — Wifi hiển thị trên menu (Sprint v2.1)
-- Nội dung per-store đọc runtime từ mini-app: NULL/rỗng = không hiển thị.
-- Đi cùng đường đọc profile quán của anon (mig 011 about_text) — không cần policy mới.

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS wifi_name     text,
  ADD COLUMN IF NOT EXISTS wifi_password text;
