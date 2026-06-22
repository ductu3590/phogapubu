-- 003 — Tạo đơn phía server (chống sửa giá + enforce bàn↔quán)
-- Mini-app gọi RPC này thay vì insert trực tiếp. Giá/tên lấy TỪ DB, không tin client.

-- Cột capability_token: Plan 2 dùng để scope quyền đọc đơn (Plan 1 chỉ sinh + lưu)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS capability_token text;

CREATE OR REPLACE FUNCTION create_order(
  p_store_id uuid,
  p_table_id uuid,
  p_items jsonb,                 -- [{ "menu_item_id": uuid, "quantity": int, "note": text }]
  p_payment_method text,
  p_zalo_user_id text DEFAULT NULL,
  p_note text DEFAULT NULL
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
  v_item jsonb;
  v_menu menu_items%ROWTYPE;
  v_qty int;
BEGIN
  IF p_payment_method NOT IN ('zalopay','cash') THEN
    RAISE EXCEPTION 'payment_method không hợp lệ: %', p_payment_method;
  END IF;

  -- Bàn phải thuộc đúng quán + đang hoạt động (enforce quan hệ table↔store phía DB)
  IF NOT EXISTS (
    SELECT 1 FROM tables
    WHERE id = p_table_id AND store_id = p_store_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Đơn không có món nào';
  END IF;

  INSERT INTO orders (store_id, table_id, total_amount, zalo_user_id, note,
                      payment_method, status, capability_token)
  VALUES (p_store_id, p_table_id, 0, p_zalo_user_id, p_note,
          p_payment_method, 'pending', v_token)
  RETURNING * INTO v_order;

  -- Cho phép cùng món xuất hiện nhiều dòng (tách số lượng) — KHÔNG dedup theo menu_item_id
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Số lượng không hợp lệ';
    END IF;

    -- Lấy giá + tên TỪ DB (bỏ qua mọi giá client gửi)
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

-- Mini-app (anon) được phép gọi RPC; insert trực tiếp sẽ bị chặn ở migration sau (Task 3)
REVOKE ALL ON FUNCTION create_order(uuid, uuid, jsonb, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION create_order(uuid, uuid, jsonb, text, text, text) TO anon;
