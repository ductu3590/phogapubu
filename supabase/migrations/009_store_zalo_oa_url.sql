-- Thêm URL trang Zalo OA để hiện nút "Xem trang Zalo OA" trong mini-app tab Nhà hàng
ALTER TABLE stores ADD COLUMN IF NOT EXISTS zalo_oa_url text;
