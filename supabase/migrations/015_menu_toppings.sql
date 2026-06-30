-- 015 — Topping (add-on) cho món ăn
-- - Bảng menu_item_toppings (per-món, composite FK chống lệch store)
-- - Cột order_items.selected_toppings (JSONB snapshot [{id,name,price}])
-- - RPC create_order v2: nhận topping_ids trong mỗi item, tự tra giá + snapshot
-- Idempotent: rerun-safe.

-- ─── 1. UNIQUE(id, store_id) trên menu_items để làm đích composite FK ────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_id_store_uniq') THEN
    ALTER TABLE menu_items ADD CONSTRAINT menu_items_id_store_uniq UNIQUE (id, store_id);
  END IF;
END $$;

-- ─── 2. Bảng topping ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_item_toppings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id  uuid NOT NULL,
  store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name          text NOT NULL,
  price         int  NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_available  boolean NOT NULL DEFAULT true,
  sort_order    int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_item_toppings_item_store_fkey
    FOREIGN KEY (menu_item_id, store_id)
    REFERENCES menu_items (id, store_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_menu_item_toppings_lookup
  ON menu_item_toppings (menu_item_id, is_available, sort_order);

-- ─── 3. RLS topping ─────────────────────────────────────────────────────────
ALTER TABLE menu_item_toppings ENABLE ROW LEVEL SECURITY;

-- anon (mini-app) đọc topping công khai — mirror anon_read_items
DROP POLICY IF EXISTS "anon_read_toppings" ON menu_item_toppings;
CREATE POLICY "anon_read_toppings" ON menu_item_toppings
  FOR SELECT TO anon USING (true);

-- authenticated (admin) đọc theo operator — mirror auth_read_all_items (is_operator())
DROP POLICY IF EXISTS "auth_read_all_toppings" ON menu_item_toppings;
CREATE POLICY "auth_read_all_toppings" ON menu_item_toppings
  FOR SELECT TO authenticated USING (is_operator());

-- KHÔNG tạo policy INSERT/UPDATE/DELETE: admin ghi qua service-role (bypass RLS).
-- KHÔNG tạo policy cho role kitchen: bếp chỉ đọc snapshot order_items.selected_toppings.

-- ─── 4. Cột snapshot trên order_items ───────────────────────────────────────
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS selected_toppings jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_selected_toppings_is_array') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_selected_toppings_is_array
      CHECK (jsonb_typeof(selected_toppings) = 'array');
  END IF;
END $$;

-- ─── 5. RPC create_order v2 (cùng signature 10-param — CREATE OR REPLACE) ────
CREATE OR REPLACE FUNCTION create_order(
  p_store_id         uuid,
  p_table_id         uuid  DEFAULT NULL,
  p_items            jsonb DEFAULT NULL,
  p_payment_method   text  DEFAULT 'zalopay',
  p_zalo_user_id     text  DEFAULT NULL,
  p_note             text  DEFAULT NULL,
  p_order_type       text  DEFAULT 'dine_in',
  p_customer_name    text  DEFAULT NULL,
  p_customer_phone   text  DEFAULT NULL,
  p_delivery_address text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_total int := 0;
  v_token text := gen_random_uuid()::text;
  v_item  jsonb;
  v_menu  menu_items%ROWTYPE;
  v_qty   int;
  v_topping_ids   uuid[];
  v_item_toppings jsonb;
  v_topping_total int;
  v_topping_count int;
BEGIN
  IF p_payment_method NOT IN ('zalopay','cash') THEN
    RAISE EXCEPTION 'payment_method không hợp lệ: %', p_payment_method;
  END IF;

  IF p_order_type NOT IN ('dine_in','pickup','delivery') THEN
    RAISE EXCEPTION 'order_type không hợp lệ: %', p_order_type;
  END IF;

  IF p_order_type = 'dine_in' THEN
    IF p_table_id IS NULL THEN
      RAISE EXCEPTION 'Đơn tại bàn cần có table_id';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM tables
      WHERE id = p_table_id AND store_id = p_store_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động';
    END IF;
  END IF;

  IF p_order_type IN ('pickup','delivery') THEN
    IF p_customer_name IS NULL THEN
      RAISE EXCEPTION 'Đơn mang về cần tên khách hàng';
    END IF;
    IF p_order_type = 'delivery' THEN
      IF p_customer_phone IS NULL THEN
        RAISE EXCEPTION 'Đơn ship cần số điện thoại';
      END IF;
      IF p_delivery_address IS NULL THEN
        RAISE EXCEPTION 'Đơn ship cần địa chỉ giao hàng';
      END IF;
    END IF;
    IF p_payment_method <> 'zalopay' THEN
      RAISE EXCEPTION 'Đơn mang về chỉ chấp nhận ZaloPay';
    END IF;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Đơn không có món nào';
  END IF;

  INSERT INTO orders (
    store_id, table_id, total_amount, zalo_user_id, note,
    payment_method, status, capability_token,
    order_type, customer_name, customer_phone, delivery_address
  ) VALUES (
    p_store_id, p_table_id, 0, p_zalo_user_id, p_note,
    p_payment_method, 'pending', v_token,
    p_order_type, p_customer_name, p_customer_phone, p_delivery_address
  )
  RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Số lượng không hợp lệ';
    END IF;

    SELECT * INTO v_menu FROM menu_items
    WHERE id = (v_item->>'menu_item_id')::uuid
      AND store_id = p_store_id
      AND is_available = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Món không thuộc quán hoặc ngừng bán: %', v_item->>'menu_item_id';
    END IF;

    -- Topping: tra giá + snapshot từ DB (không tin giá client)
    v_item_toppings := '[]'::jsonb;
    v_topping_total := 0;
    IF v_item ? 'topping_ids'
       AND jsonb_typeof(v_item->'topping_ids') = 'array'
       AND jsonb_array_length(v_item->'topping_ids') > 0 THEN

      SELECT array_agg(DISTINCT value::uuid)
        INTO v_topping_ids
        FROM jsonb_array_elements_text(v_item->'topping_ids');

      SELECT
        COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'price', t.price)
                           ORDER BY t.sort_order, t.created_at), '[]'::jsonb),
        COALESCE(SUM(t.price), 0),
        COUNT(*)
      INTO v_item_toppings, v_topping_total, v_topping_count
      FROM menu_item_toppings t
      WHERE t.id = ANY(v_topping_ids)
        AND t.menu_item_id = v_menu.id
        AND t.store_id = p_store_id
        AND t.is_available = true;

      IF v_topping_count <> array_length(v_topping_ids, 1) THEN
        RAISE EXCEPTION 'Topping không hợp lệ hoặc ngừng bán cho món %', v_menu.name;
      END IF;
    END IF;

    INSERT INTO order_items (
      order_id, menu_item_id, item_name, item_price, quantity, note, selected_toppings
    ) VALUES (
      v_order.id, v_menu.id, v_menu.name, v_menu.price, v_qty, v_item->>'note', v_item_toppings
    );

    v_total := v_total + (v_menu.price + v_topping_total) * v_qty;
  END LOOP;

  UPDATE orders SET total_amount = v_total WHERE id = v_order.id RETURNING * INTO v_order;

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION create_order(uuid, uuid, jsonb, text, text, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION create_order(uuid, uuid, jsonb, text, text, text, text, text, text, text) TO anon;
