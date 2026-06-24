-- 006b — Plan 2 / Task 2a (phần 2): Siết RLS role `authenticated` về is_operator().
-- ⚠️ CHỈ APPLY SAU KHI đã seed mevo_operators cho tài khoản admin và đăng nhập thử OK,
--    nếu không sẽ tự khoá mình ra ngoài (admin đăng nhập nhưng không đọc/ghi được gì).
--
-- Trước 006b: các policy auth_* dùng USING(true) → bất kỳ ai đăng nhập đều full quyền.
-- Sau 006b:   chỉ user nằm trong mevo_operators mới có quyền.

-- ── stores ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_read_all_stores" ON stores;
CREATE POLICY "auth_read_all_stores" ON stores
  FOR SELECT TO authenticated USING (is_operator());

-- ── tables ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_read_all_tables" ON tables;
CREATE POLICY "auth_read_all_tables" ON tables
  FOR SELECT TO authenticated USING (is_operator());
DROP POLICY IF EXISTS "auth_insert_tables" ON tables;
CREATE POLICY "auth_insert_tables" ON tables
  FOR INSERT TO authenticated WITH CHECK (is_operator());
DROP POLICY IF EXISTS "auth_update_tables" ON tables;
CREATE POLICY "auth_update_tables" ON tables
  FOR UPDATE TO authenticated USING (is_operator()) WITH CHECK (is_operator());
DROP POLICY IF EXISTS "auth_delete_tables" ON tables;
CREATE POLICY "auth_delete_tables" ON tables
  FOR DELETE TO authenticated USING (is_operator());

-- ── menu_categories ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_read_all_categories" ON menu_categories;
CREATE POLICY "auth_read_all_categories" ON menu_categories
  FOR SELECT TO authenticated USING (is_operator());
DROP POLICY IF EXISTS "auth_insert_menu_categories" ON menu_categories;
CREATE POLICY "auth_insert_menu_categories" ON menu_categories
  FOR INSERT TO authenticated WITH CHECK (is_operator());

-- ── menu_items ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_read_all_items" ON menu_items;
CREATE POLICY "auth_read_all_items" ON menu_items
  FOR SELECT TO authenticated USING (is_operator());
DROP POLICY IF EXISTS "auth_insert_menu_items" ON menu_items;
CREATE POLICY "auth_insert_menu_items" ON menu_items
  FOR INSERT TO authenticated WITH CHECK (is_operator());
DROP POLICY IF EXISTS "auth_update_menu_items" ON menu_items;
CREATE POLICY "auth_update_menu_items" ON menu_items
  FOR UPDATE TO authenticated USING (is_operator()) WITH CHECK (is_operator());
DROP POLICY IF EXISTS "auth_delete_menu_items" ON menu_items;
CREATE POLICY "auth_delete_menu_items" ON menu_items
  FOR DELETE TO authenticated USING (is_operator());

-- ── orders ────────────────────────────────────────────────────────────────
-- Update (mark paid / cancel) — siết về operator.
DROP POLICY IF EXISTS "auth_update_orders" ON orders;
CREATE POLICY "auth_update_orders" ON orders
  FOR UPDATE TO authenticated USING (is_operator()) WITH CHECK (is_operator());

-- THÊM MỚI: quyền ĐỌC orders/order_items cho operator.
-- Cần vì 007a sẽ siết public_read_* về TO anon → nếu không có policy này,
-- admin (authenticated) sẽ mất đường đọc đơn (hiện đang đọc nhờ policy PUBLIC).
DROP POLICY IF EXISTS "auth_read_orders" ON orders;
CREATE POLICY "auth_read_orders" ON orders
  FOR SELECT TO authenticated USING (is_operator());

DROP POLICY IF EXISTS "auth_read_order_items" ON order_items;
CREATE POLICY "auth_read_order_items" ON order_items
  FOR SELECT TO authenticated USING (is_operator());
