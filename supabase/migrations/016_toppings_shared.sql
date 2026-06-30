-- 016 — Topping v2: kho dùng chung + bảng nối nhiều-nhiều
-- Restructure menu_item_toppings (v1 per-item) → junction. DROP data test cũ (chấp nhận).
-- Idempotent rerun-safe.

-- 1) Bảng kho toppings
CREATE TABLE IF NOT EXISTS toppings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name         text NOT NULL,
  price        int  NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_available boolean NOT NULL DEFAULT true,
  sort_order   int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'toppings_id_store_uniq') THEN
    ALTER TABLE toppings ADD CONSTRAINT toppings_id_store_uniq UNIQUE (id, store_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_toppings_store ON toppings (store_id, is_available, sort_order);

-- 2) Restructure menu_item_toppings → junction (drop bảng v1 per-item)
DROP TABLE IF EXISTS menu_item_toppings;
CREATE TABLE menu_item_toppings (
  menu_item_id uuid NOT NULL,
  topping_id   uuid NOT NULL,
  store_id     uuid NOT NULL,
  PRIMARY KEY (menu_item_id, topping_id),
  CONSTRAINT mit_item_fkey    FOREIGN KEY (menu_item_id, store_id) REFERENCES menu_items(id, store_id) ON DELETE CASCADE,
  CONSTRAINT mit_topping_fkey FOREIGN KEY (topping_id, store_id)   REFERENCES toppings(id, store_id)   ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mit_topping ON menu_item_toppings (topping_id);
CREATE INDEX IF NOT EXISTS idx_mit_item    ON menu_item_toppings (menu_item_id);

-- 3) RLS
ALTER TABLE toppings ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_toppings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_toppings" ON toppings;
CREATE POLICY "anon_read_toppings" ON toppings FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "auth_read_toppings" ON toppings;
CREATE POLICY "auth_read_toppings" ON toppings FOR SELECT TO authenticated USING (is_operator());
DROP POLICY IF EXISTS "anon_read_mit" ON menu_item_toppings;
CREATE POLICY "anon_read_mit" ON menu_item_toppings FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "auth_read_mit" ON menu_item_toppings;
CREATE POLICY "auth_read_mit" ON menu_item_toppings FOR SELECT TO authenticated USING (is_operator());
-- Ghi: chỉ service-role (bypass RLS). Không policy kitchen (đọc snapshot order_items).

-- 4) RPC create_order v3 (validate topping qua JOIN bảng nối)
CREATE OR REPLACE FUNCTION create_order(
  p_store_id uuid, p_table_id uuid DEFAULT NULL, p_items jsonb DEFAULT NULL,
  p_payment_method text DEFAULT 'zalopay', p_zalo_user_id text DEFAULT NULL, p_note text DEFAULT NULL,
  p_order_type text DEFAULT 'dine_in', p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL, p_delivery_address text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE; v_total int := 0; v_token text := gen_random_uuid()::text;
  v_item jsonb; v_menu menu_items%ROWTYPE; v_qty int;
  v_topping_ids uuid[]; v_item_toppings jsonb; v_topping_total int; v_topping_count int;
BEGIN
  IF p_payment_method NOT IN ('zalopay','cash') THEN RAISE EXCEPTION 'payment_method không hợp lệ: %', p_payment_method; END IF;
  IF p_order_type NOT IN ('dine_in','pickup','delivery') THEN RAISE EXCEPTION 'order_type không hợp lệ: %', p_order_type; END IF;

  IF p_order_type = 'dine_in' THEN
    IF p_table_id IS NULL THEN RAISE EXCEPTION 'Đơn tại bàn cần có table_id'; END IF;
    IF NOT EXISTS (SELECT 1 FROM tables WHERE id = p_table_id AND store_id = p_store_id AND is_active = true) THEN
      RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động'; END IF;
  END IF;

  IF p_order_type IN ('pickup','delivery') THEN
    IF p_customer_name IS NULL THEN RAISE EXCEPTION 'Đơn mang về cần tên khách hàng'; END IF;
    IF p_order_type = 'delivery' THEN
      IF p_customer_phone IS NULL THEN RAISE EXCEPTION 'Đơn ship cần số điện thoại'; END IF;
      IF p_delivery_address IS NULL THEN RAISE EXCEPTION 'Đơn ship cần địa chỉ giao hàng'; END IF;
    END IF;
    IF p_payment_method <> 'zalopay' THEN RAISE EXCEPTION 'Đơn mang về chỉ chấp nhận ZaloPay'; END IF;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Đơn không có món nào'; END IF;

  INSERT INTO orders (store_id, table_id, total_amount, zalo_user_id, note, payment_method, status, capability_token,
    order_type, customer_name, customer_phone, delivery_address)
  VALUES (p_store_id, p_table_id, 0, p_zalo_user_id, p_note, p_payment_method, 'pending', v_token,
    p_order_type, p_customer_name, p_customer_phone, p_delivery_address)
  RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Số lượng không hợp lệ'; END IF;

    SELECT * INTO v_menu FROM menu_items
    WHERE id = (v_item->>'menu_item_id')::uuid AND store_id = p_store_id AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Món không thuộc quán hoặc ngừng bán: %', v_item->>'menu_item_id'; END IF;

    v_item_toppings := '[]'::jsonb; v_topping_total := 0;
    IF v_item ? 'topping_ids' AND jsonb_typeof(v_item->'topping_ids') = 'array'
       AND jsonb_array_length(v_item->'topping_ids') > 0 THEN
      SELECT array_agg(DISTINCT value::uuid) INTO v_topping_ids
        FROM jsonb_array_elements_text(v_item->'topping_ids');
      SELECT
        COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'price',t.price) ORDER BY t.sort_order, t.created_at), '[]'::jsonb),
        COALESCE(SUM(t.price),0), COUNT(*)
      INTO v_item_toppings, v_topping_total, v_topping_count
      FROM toppings t
      JOIN menu_item_toppings mit ON mit.topping_id = t.id AND mit.menu_item_id = v_menu.id
      WHERE t.id = ANY(v_topping_ids) AND t.store_id = p_store_id AND t.is_available = true;
      IF v_topping_count <> array_length(v_topping_ids,1) THEN
        RAISE EXCEPTION 'Topping không hợp lệ / chưa gán cho món / ngừng bán: %', v_menu.name; END IF;
    END IF;

    INSERT INTO order_items (order_id, menu_item_id, item_name, item_price, quantity, note, selected_toppings)
    VALUES (v_order.id, v_menu.id, v_menu.name, v_menu.price, v_qty, v_item->>'note', v_item_toppings);
    v_total := v_total + (v_menu.price + v_topping_total) * v_qty;
  END LOOP;

  UPDATE orders SET total_amount = v_total WHERE id = v_order.id RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END; $$;
REVOKE ALL ON FUNCTION create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text) TO anon;
