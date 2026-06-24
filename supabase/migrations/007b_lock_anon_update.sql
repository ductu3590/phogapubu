-- 007b — Plan 2 / Task 2b (phần cuối): KHOÁ anon UPDATE orders.
-- ⚠️ CHỈ APPLY SAU KHI:
--   - admin-web (kitchen-display dùng token + RPC) đã deploy
--   - mini-app (cancel_order / abandon dùng token) đã deploy
--   - TẤT CẢ tablet bếp đã mở lại bằng link token và xác nhận chạy
-- Nếu apply sớm, tablet nào chưa nạp token sẽ mất quyền ghi.

-- Khoá đường ghi công khai cuối cùng: anon không UPDATE orders trực tiếp được nữa.
-- (Bếp ghi qua kitchen_set_status; mini-app huỷ/đổi tiền mặt qua RPC có capability_token.)
DROP POLICY IF EXISTS "public_update_orders" ON orders;

-- Gỡ overload abandon cũ (không có capability guard) sau khi mini-app mới đã chuyển sang
-- abandon_zalopay_to_cash(uuid, text).
DROP FUNCTION IF EXISTS abandon_zalopay_to_cash(uuid);
