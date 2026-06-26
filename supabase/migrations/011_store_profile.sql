-- supabase/migrations/011_store_profile.sql
-- Thêm 2 cột vào stores: banner ảnh cho takeaway mode + ghi chú tự do của quán

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS takeaway_banner_url text,
  ADD COLUMN IF NOT EXISTS about_text          text;
