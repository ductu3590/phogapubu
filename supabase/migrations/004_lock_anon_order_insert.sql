-- 004 — Bỏ quyền anon insert trực tiếp orders/order_items.
-- Mini-app giờ tạo đơn qua RPC create_order (SECURITY DEFINER) → insert bằng quyền owner.
-- (Quyền anon SELECT/UPDATE orders GIỮ NGUYÊN ở Plan 1 — Plan 2 mới siết, kèm chuyển kitchen sang operator.)

DROP POLICY IF EXISTS "public_create_orders" ON orders;
DROP POLICY IF EXISTS "public_create_order_items" ON order_items;
