-- ============================================================
-- 002 — Siết RLS bảng orders (bảo mật thanh toán)
-- Lỗ hổng cũ: public_update_orders USING (true) cho phép bất kỳ ai có anon key
-- tự đặt đơn sang 'confirmed' mà không cần trả tiền.
-- Fix: anon KHÔNG được set trạng thái 'confirmed'. Chỉ service role
-- (edge function checkout-notify) mới xác nhận thanh toán — service role bỏ qua RLS.
-- Các chuyển trạng thái vận hành khác (cooking/ready/cancelled/paid) vẫn cho phép.
-- ============================================================

DROP POLICY IF EXISTS "public_update_orders" ON orders;

CREATE POLICY "public_update_orders"
  ON orders FOR UPDATE
  USING (true)
  WITH CHECK (status <> 'confirmed');
