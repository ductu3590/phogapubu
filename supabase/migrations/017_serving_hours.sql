-- 017 — Giờ phục vụ + Tạm nghỉ + Phạm vi ship (hiển thị)
-- Thêm cấu hình giờ nhận đơn cho stores + chặn create_order khi quán đóng cửa/ngoài giờ.
-- Idempotent rerun-safe.

-- ============================================================
-- 1. Cột cấu hình trên stores
-- ============================================================
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS is_accepting_orders boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS serving_hours       jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_area_note  text;

COMMENT ON COLUMN stores.is_accepting_orders IS 'Công tắc chủ: false = tạm nghỉ, chặn mọi đơn (cả QR bàn lẫn mang về)';
COMMENT ON COLUMN stores.serving_hours IS 'Mảng ca phục vụ [{"open":"HH:mm","close":"HH:mm"}]; rỗng = mở cả ngày. Giờ hiểu theo Asia/Ho_Chi_Minh';
COMMENT ON COLUMN stores.delivery_area_note IS 'Text mô tả phạm vi ship, chỉ hiển thị cho khách, không validate';

-- ============================================================
-- 2. Helper: quán có đang nhận đơn ngay lúc này không
--    (dùng trong create_order để chống lách phía server)
-- ============================================================
CREATE OR REPLACE FUNCTION store_accepting_now(p_store_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_accepting boolean;
  v_hours     jsonb;
  v_now       time;
  v_shift     jsonb;
  v_open      time;
  v_close     time;
BEGIN
  SELECT is_accepting_orders, serving_hours
    INTO v_accepting, v_hours
    FROM stores WHERE id = p_store_id;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_accepting IS NOT TRUE THEN RETURN false; END IF;

  -- Không cấu hình ca nào = mở cả ngày
  IF v_hours IS NULL OR jsonb_typeof(v_hours) <> 'array' OR jsonb_array_length(v_hours) = 0 THEN
    RETURN true;
  END IF;

  v_now := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::time;

  FOR v_shift IN SELECT * FROM jsonb_array_elements(v_hours) LOOP
    v_open  := (v_shift->>'open')::time;
    v_close := (v_shift->>'close')::time;
    IF v_open = v_close THEN
      RETURN true;                                   -- ca 24h
    ELSIF v_open < v_close THEN
      IF v_now >= v_open AND v_now < v_close THEN RETURN true; END IF;
    ELSE                                             -- ca qua đêm (VD 18:00–02:00)
      IF v_now >= v_open OR v_now < v_close THEN RETURN true; END IF;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION store_accepting_now(uuid) FROM public;
GRANT EXECUTE ON FUNCTION store_accepting_now(uuid) TO anon, authenticated;

-- ============================================================
-- 3. create_order v4 = v3 (016) + chặn khi quán đóng cửa
--    Giữ nguyên chữ ký 10 tham số, chỉ thêm 1 check gần đầu hàm.
-- ============================================================
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

  -- Chặn khi quán tạm nghỉ / ngoài giờ phục vụ (áp cho mọi loại đơn)
  IF NOT store_accepting_now(p_store_id) THEN
    RAISE EXCEPTION 'Quán đang tạm nghỉ hoặc ngoài giờ phục vụ';
  END IF;

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
