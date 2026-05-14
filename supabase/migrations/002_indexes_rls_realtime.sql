-- MEVO — Migration 002: Indexes, RLS, Realtime
-- Chạy file này trong Supabase Dashboard → SQL Editor

-- ============================================================
-- INDEXES — Tăng tốc truy vấn thường dùng
-- ============================================================

-- Orders: lọc theo quán + ngày (query phổ biến nhất trong admin)
CREATE INDEX IF NOT EXISTS idx_orders_store_created
  ON orders(store_id, created_at DESC);

-- Orders: lọc theo trạng thái (dashboard đếm đơn đang xử lý)
CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders(status);

-- Orders: lọc theo bàn (kitchen display)
CREATE INDEX IF NOT EXISTS idx_orders_table_id
  ON orders(table_id);

-- Order items: join với orders (luôn query theo order_id)
CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON order_items(order_id);

-- Menu items: hiển thị theo danh mục + thứ tự
CREATE INDEX IF NOT EXISTS idx_menu_items_category_sort
  ON menu_items(category_id, sort_order);

-- Menu items: lọc chỉ món đang bán (Mini App chỉ hiện is_available = true)
CREATE INDEX IF NOT EXISTS idx_menu_items_available
  ON menu_items(store_id, is_available);

-- Tables: lọc bàn theo quán
CREATE INDEX IF NOT EXISTS idx_tables_store_id
  ON tables(store_id, is_active);

-- Menu categories: sắp xếp theo quán
CREATE INDEX IF NOT EXISTS idx_menu_categories_store_sort
  ON menu_categories(store_id, sort_order);

-- ============================================================
-- STORES — Thêm cột zalo_app_id để mỗi quán lưu App ID riêng
-- (Hiện tại dùng env var, về sau multi-store sẽ cần cột này)
-- ============================================================
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS zalo_app_id TEXT;

-- Cập nhật quán Phở Gà Pubu với App ID hiện tại
-- (Thay 'YOUR_ZALO_APP_ID' bằng giá trị NEXT_PUBLIC_ZALO_APP_ID trong .env.local)
-- UPDATE stores SET zalo_app_id = 'YOUR_ZALO_APP_ID' WHERE slug = 'pho-ga-pubu';

-- ============================================================
-- RLS POLICIES — Authenticated admin có thể đọc toàn bộ dữ liệu
-- Dùng DO block để idempotent (chạy lại không bị lỗi duplicate)
-- ============================================================
DO $$
BEGIN

  -- Admin đọc TẤT CẢ stores (kể cả is_active = false)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_read_all_stores' AND tablename = 'stores') THEN
    CREATE POLICY "auth_read_all_stores" ON stores FOR SELECT TO authenticated USING (true);
  END IF;

  -- Admin đọc tất cả tables (kể cả is_active = false)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_read_all_tables' AND tablename = 'tables') THEN
    CREATE POLICY "auth_read_all_tables" ON tables FOR SELECT TO authenticated USING (true);
  END IF;

  -- Admin đọc tất cả menu_categories (kể cả is_active = false)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_read_all_categories' AND tablename = 'menu_categories') THEN
    CREATE POLICY "auth_read_all_categories" ON menu_categories FOR SELECT TO authenticated USING (true);
  END IF;

  -- Admin đọc tất cả menu_items (kể cả is_available = false)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_read_all_items' AND tablename = 'menu_items') THEN
    CREATE POLICY "auth_read_all_items" ON menu_items FOR SELECT TO authenticated USING (true);
  END IF;

  -- Admin INSERT/UPDATE/DELETE menu_items
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert_menu_items' AND tablename = 'menu_items') THEN
    CREATE POLICY "auth_insert_menu_items" ON menu_items FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update_menu_items' AND tablename = 'menu_items') THEN
    CREATE POLICY "auth_update_menu_items" ON menu_items FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_delete_menu_items' AND tablename = 'menu_items') THEN
    CREATE POLICY "auth_delete_menu_items" ON menu_items FOR DELETE TO authenticated USING (true);
  END IF;

  -- Admin INSERT menu_categories
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert_menu_categories' AND tablename = 'menu_categories') THEN
    CREATE POLICY "auth_insert_menu_categories" ON menu_categories FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  -- Admin INSERT/UPDATE/DELETE tables
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_insert_tables' AND tablename = 'tables') THEN
    CREATE POLICY "auth_insert_tables" ON tables FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update_tables' AND tablename = 'tables') THEN
    CREATE POLICY "auth_update_tables" ON tables FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_delete_tables' AND tablename = 'tables') THEN
    CREATE POLICY "auth_delete_tables" ON tables FOR DELETE TO authenticated USING (true);
  END IF;

  -- Admin UPDATE orders (mark paid, cancel)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_update_orders' AND tablename = 'orders') THEN
    CREATE POLICY "auth_update_orders" ON orders FOR UPDATE TO authenticated USING (true);
  END IF;

END $$;

-- ============================================================
-- REALTIME — Bật cho menu_items và tables
-- Khi admin tắt hàng → Mini App nhận update ngay, ẩn món đó
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE menu_items;
ALTER PUBLICATION supabase_realtime ADD TABLE tables;

-- ============================================================
-- FUNCTION — Lấy doanh thu theo ngày (dùng cho dashboard)
-- Tối ưu hơn filter trên app
-- ============================================================
CREATE OR REPLACE FUNCTION get_daily_revenue(
  p_store_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  total_revenue BIGINT,
  total_orders BIGINT,
  paid_orders BIGINT,
  cash_pending BIGINT
) LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0) AS total_revenue,
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (WHERE status = 'paid') AS paid_orders,
    COUNT(*) FILTER (WHERE payment_method = 'cash' AND status NOT IN ('paid','cancelled')) AS cash_pending
  FROM orders
  WHERE store_id = p_store_id
    AND created_at >= p_date::TIMESTAMPTZ
    AND created_at < (p_date + INTERVAL '1 day')::TIMESTAMPTZ;
$$;
