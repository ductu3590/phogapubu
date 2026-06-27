-- 012 — Takeaway: bỏ hẹn giờ qua lấy
-- - Bỏ ràng buộc bắt buộc pickup_time
-- - Pickup chỉ cần customer_name; delivery cần name + phone + address
-- - Recreate create_order: bỏ param p_pickup_time
-- - GIỮ cột pickup_time (nullable, ngừng ghi) — non-destructive

-- ─── 1. Bỏ ràng buộc bắt buộc giờ pickup ────────────────────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_pickup_time_required;

-- ─── 2. Nới ràng buộc thông tin khách ───────────────────────────────────────
-- takeaway cần name; phone chỉ bắt buộc khi delivery
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_customer_info_required;
ALTER TABLE orders ADD CONSTRAINT chk_customer_info_required
  CHECK (
    order_type = 'dine_in'
    OR (
      customer_name IS NOT NULL
      AND (order_type <> 'delivery' OR customer_phone IS NOT NULL)
    )
  );

-- ─── 3. Xoá RPC 11-param cũ ─────────────────────────────────────────────────
REVOKE ALL ON FUNCTION create_order(uuid, uuid, jsonb, text, text, text, text, text, text, timestamptz, text) FROM public;
DROP FUNCTION IF EXISTS create_order(uuid, uuid, jsonb, text, text, text, text, text, text, timestamptz, text);

-- ─── 4. Tạo lại RPC 10-param (không còn p_pickup_time) ──────────────────────
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
BEGIN
  IF p_payment_method NOT IN ('zalopay','cash') THEN
    RAISE EXCEPTION 'payment_method không hợp lệ: %', p_payment_method;
  END IF;

  IF p_order_type NOT IN ('dine_in','pickup','delivery') THEN
    RAISE EXCEPTION 'order_type không hợp lệ: %', p_order_type;
  END IF;

  -- Dine-in: bàn phải thuộc đúng quán
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

  -- Takeaway: cần thông tin khách + chỉ ZaloPay
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

    INSERT INTO order_items (order_id, menu_item_id, item_name, item_price, quantity, note)
    VALUES (v_order.id, v_menu.id, v_menu.name, v_menu.price, v_qty, v_item->>'note');

    v_total := v_total + v_menu.price * v_qty;
  END LOOP;

  UPDATE orders SET total_amount = v_total WHERE id = v_order.id RETURNING * INTO v_order;

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION create_order(uuid, uuid, jsonb, text, text, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION create_order(uuid, uuid, jsonb, text, text, text, text, text, text, text) TO anon;
