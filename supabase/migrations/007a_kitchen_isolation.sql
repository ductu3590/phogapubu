-- 007a — Plan 2 / Task 2b (phần 1, ADDITIVE): cô lập bếp theo quán.
-- File này KHÔNG drop public_update_orders (giữ tương thích bếp anon cũ) → zero-downtime.
-- Việc khoá anon UPDATE nằm ở 007b, chạy SAU khi client mới đã deploy + tablet đã nạp token.
--
-- Gốc rễ P0: policy không ghi TO <role> mặc định là PUBLIC → áp cho cả role `kitchen`,
-- và nhiều permissive policy gộp bằng OR nên USING(true) thắng mọi policy scoped.
-- ⇒ Siết mọi public_* read về TO anon, rồi cấp policy riêng cho kitchen.

-- ============================================================
-- 1) Role Postgres riêng cho bếp — CHỈ đọc; mọi ghi đi qua RPC
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kitchen') THEN
    CREATE ROLE kitchen NOLOGIN;
  END IF;
END $$;

GRANT kitchen TO authenticator;            -- để PostgREST/Realtime SET ROLE kitchen
GRANT USAGE ON SCHEMA public TO kitchen;
GRANT SELECT ON stores, tables, orders, order_items TO kitchen;
-- KHÔNG GRANT UPDATE: bếp đổi trạng thái qua kitchen_set_status() để không sửa được
-- total_amount / payment_method / table_id, và không tự set paid/cancelled/confirmed.

-- ============================================================
-- 2) Cột version để thu hồi token theo từng quán
-- ============================================================
ALTER TABLE stores ADD COLUMN IF NOT EXISTS kitchen_token_version int NOT NULL DEFAULT 1;

-- ============================================================
-- 3) Helper: store_id của token bếp (fail-closed nếu claim lỗi)
-- ============================================================
CREATE OR REPLACE FUNCTION kitchen_store_id() RETURNS uuid
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store uuid; v_kv int;
BEGIN
  BEGIN
    v_store := (auth.jwt() ->> 'store_id')::uuid;
    v_kv    := (auth.jwt() ->> 'kv')::int;
  EXCEPTION WHEN others THEN
    RETURN NULL;                  -- claim thiếu/sai kiểu → từ chối, không throw
  END;
  RETURN (SELECT s.id FROM stores s
          WHERE s.id = v_store AND s.kitchen_token_version = v_kv);
END $$;

-- ============================================================
-- 4) Siết các policy PUBLIC read → CHỈ TO anon (để không rò sang role kitchen)
-- ============================================================
DROP POLICY IF EXISTS "public_read_orders"      ON orders;
DROP POLICY IF EXISTS "public_read_order_items" ON order_items;
DROP POLICY IF EXISTS "public_read_stores"      ON stores;
DROP POLICY IF EXISTS "public_read_tables"      ON tables;
DROP POLICY IF EXISTS "public_read_categories"  ON menu_categories;
DROP POLICY IF EXISTS "public_read_items"       ON menu_items;

CREATE POLICY "anon_read_orders"      ON orders          FOR SELECT TO anon USING (true);        -- 2c hoãn
CREATE POLICY "anon_read_order_items" ON order_items     FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_stores"      ON stores          FOR SELECT TO anon USING (is_active);
CREATE POLICY "anon_read_tables"      ON tables          FOR SELECT TO anon USING (is_active);
CREATE POLICY "anon_read_categories"  ON menu_categories FOR SELECT TO anon USING (is_active);
CREATE POLICY "anon_read_items"       ON menu_items      FOR SELECT TO anon USING (true);

-- ============================================================
-- 5) Policy đọc cho kitchen — chỉ đúng quán của token
-- ============================================================
CREATE POLICY "kitchen_read_stores" ON stores      FOR SELECT TO kitchen USING (id = kitchen_store_id());
CREATE POLICY "kitchen_read_tables" ON tables      FOR SELECT TO kitchen USING (store_id = kitchen_store_id());
CREATE POLICY "kitchen_read_orders" ON orders      FOR SELECT TO kitchen USING (store_id = kitchen_store_id());
CREATE POLICY "kitchen_read_items"  ON order_items FOR SELECT TO kitchen
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.store_id = kitchen_store_id()));

-- ============================================================
-- 6) Bếp đổi trạng thái qua RPC (state machine), KHÔNG update trực tiếp
-- ============================================================
CREATE OR REPLACE FUNCTION kitchen_set_status(p_order_id uuid, p_status text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store uuid; v_current text;
BEGIN
  v_store := kitchen_store_id();                 -- từ JWT, fail-closed
  IF v_store IS NULL THEN RAISE EXCEPTION 'Token bếp không hợp lệ'; END IF;
  IF p_status NOT IN ('cooking','ready') THEN
    RAISE EXCEPTION 'Trạng thái không hợp lệ cho bếp: %', p_status;
  END IF;
  SELECT status INTO v_current FROM orders WHERE id = p_order_id AND store_id = v_store;
  IF NOT FOUND THEN RAISE EXCEPTION 'Đơn không thuộc quán'; END IF;
  -- Chỉ cho tiến theo state machine
  IF NOT ( (p_status='cooking' AND v_current IN ('confirmed','pending'))
        OR (p_status='ready'   AND v_current='cooking') ) THEN
    RAISE EXCEPTION 'Chuyển trạng thái không hợp lệ: % -> %', v_current, p_status;
  END IF;
  UPDATE orders SET status = p_status WHERE id = p_order_id AND store_id = v_store;
END $$;
REVOKE ALL ON FUNCTION kitchen_set_status(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION kitchen_set_status(uuid, text) TO kitchen;

-- ============================================================
-- 7) RPC huỷ đơn (mini-app) có capability guard — thay anon UPDATE trực tiếp
-- ============================================================
CREATE OR REPLACE FUNCTION cancel_order(p_order_id uuid, p_token text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE orders SET status = 'cancelled'
  WHERE id = p_order_id AND status = 'pending' AND capability_token = p_token;
END $$;
REVOKE ALL ON FUNCTION cancel_order(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION cancel_order(uuid, text) TO anon;

-- ============================================================
-- 8) Hardening: overload abandon_zalopay_to_cash kèm capability guard.
--    Giữ overload (uuid) cũ để bếp/mini-app cũ còn chạy; 007b sẽ drop bản cũ.
-- ============================================================
CREATE OR REPLACE FUNCTION abandon_zalopay_to_cash(p_order_id uuid, p_token text)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order orders%ROWTYPE;
BEGIN
  UPDATE orders
     SET payment_method = 'cash'
   WHERE id = p_order_id
     AND status = 'pending'
     AND payment_method = 'zalopay'
     AND zalopay_trans_id IS NULL
     AND capability_token = p_token        -- chỉ chủ đơn (có token) mới chuyển được
  RETURNING * INTO v_order;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_order);
END $$;
REVOKE ALL ON FUNCTION abandon_zalopay_to_cash(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION abandon_zalopay_to_cash(uuid, text) TO anon;
