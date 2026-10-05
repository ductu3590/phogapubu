-- 090: Link Google Maps của quán — nút "Chỉ đường" trên Mini App (Trang chủ, Thông tin nhà hàng,
-- Chi tiết đặt bàn). Chỉ https (Mini App mở thẳng link trong Zalo). NULL = app tự tìm theo địa chỉ.
-- Cột thường trên stores: anon đã có quyền SELECT cả bảng nên Mini App đọc được ngay.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS google_maps_url text;

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_google_maps_url_https;
ALTER TABLE public.stores
  ADD CONSTRAINT stores_google_maps_url_https CHECK (google_maps_url IS NULL OR google_maps_url ~ '^https://');

COMMENT ON COLUMN public.stores.google_maps_url IS 'Link Google Maps (https) cho nút Chỉ đường của Mini App; NULL = tìm theo địa chỉ.';
