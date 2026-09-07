-- Sprint 2: sửa bill POS tại quầy.
-- Món không bị xoá vật lý để giữ đầy đủ audit cho kế toán và vận hành.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS void_type text,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS void_reason text;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_void_type_check;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_void_type_check
  CHECK (void_type IS NULL OR void_type IN ('cancelled', 'gift'));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_source_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_source_check
  CHECK (order_source IN ('customer_zalo', 'staff', 'pos'));

-- Tổng bill luôn được tính lại từ snapshot món + topping còn hiệu lực.
-- Cả món khách bỏ và món tặng đều không thu tiền.
CREATE OR REPLACE FUNCTION public.recompute_order_total(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
BEGIN
  SELECT COALESCE(SUM(
    (
      oi.item_price + COALESCE((
        SELECT SUM(COALESCE((topping->>'price')::integer, 0))
        FROM jsonb_array_elements(COALESCE(oi.selected_toppings, '[]'::jsonb)) AS topping
      ), 0)
    ) * oi.quantity
  ), 0)
  INTO v_total
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.void_type IS NULL;

  UPDATE public.orders
  SET total_amount = v_total,
      payment_amount = v_total,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN v_total;
END;
$$;

-- Hàm dùng nội bộ bởi pos_add_manual_items. Nó không nhận giá từ client;
-- giá, phiên bản và topping luôn được đọc lại từ menu hiện hành rồi snapshot.
CREATE OR REPLACE FUNCTION public.add_order_line(
  p_order_id uuid,
  p_store_id uuid,
  p_item jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_menu_item public.menu_items%ROWTYPE;
  v_variant public.menu_item_variants%ROWTYPE;
  v_menu_item_id uuid;
  v_variant_id uuid;
  v_quantity integer;
  v_note text;
  v_topping_ids uuid[] := ARRAY[]::uuid[];
  v_toppings jsonb := '[]'::jsonb;
  v_topping_total integer := 0;
  v_variant_count integer := 0;
BEGIN
  v_menu_item_id := NULLIF(p_item->>'menu_item_id', '')::uuid;
  v_variant_id := NULLIF(p_item->>'variant_id', '')::uuid;
  v_quantity := COALESCE((p_item->>'quantity')::integer, 0);
  v_note := NULLIF(btrim(COALESCE(p_item->>'note', '')), '');

  IF v_menu_item_id IS NULL OR v_quantity <= 0 THEN
    RAISE EXCEPTION 'Món hoặc số lượng không hợp lệ';
  END IF;

  SELECT * INTO v_menu_item
  FROM public.menu_items
  WHERE id = v_menu_item_id
    AND store_id = p_store_id
    AND is_available = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Món không còn phục vụ hoặc không thuộc quán';
  END IF;

  -- Đếm cả phiên bản đang tạm hết để không cho bỏ qua bắt buộc chọn phiên bản.
  SELECT COUNT(*) INTO v_variant_count
  FROM public.menu_item_variants
  WHERE menu_item_id = v_menu_item.id;

  IF v_variant_count > 0 THEN
    IF v_variant_id IS NULL THEN
      RAISE EXCEPTION 'Vui lòng chọn phiên bản món';
    END IF;

    SELECT * INTO v_variant
    FROM public.menu_item_variants
    WHERE id = v_variant_id
      AND menu_item_id = v_menu_item.id
      AND is_available = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Phiên bản món không còn phục vụ';
    END IF;
  ELSIF v_variant_id IS NOT NULL THEN
    RAISE EXCEPTION 'Món này không có phiên bản đã chọn';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT value::uuid), ARRAY[]::uuid[])
  INTO v_topping_ids
  FROM jsonb_array_elements_text(COALESCE(p_item->'topping_ids', '[]'::jsonb));

  IF EXISTS (
    SELECT 1
    FROM unnest(v_topping_ids) AS requested_topping(id)
    LEFT JOIN public.toppings t
      ON t.id = requested_topping.id
      AND t.store_id = p_store_id
      AND t.is_available = true
    LEFT JOIN public.menu_item_toppings mit
      ON mit.menu_item_id = v_menu_item.id
      AND mit.topping_id = requested_topping.id
    WHERE t.id IS NULL OR mit.topping_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Topping không hợp lệ hoặc không còn phục vụ';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', t.id, 'name', t.name, 'price', t.price)
    ORDER BY t.sort_order, t.name
  ), '[]'::jsonb), COALESCE(SUM(t.price), 0)
  INTO v_toppings, v_topping_total
  FROM public.toppings t
  WHERE t.id = ANY(v_topping_ids);

  INSERT INTO public.order_items (
    order_id,
    menu_item_id,
    item_name,
    item_price,
    quantity,
    note,
    selected_toppings,
    variant_id,
    variant_name
  ) VALUES (
    p_order_id,
    v_menu_item.id,
    CASE
      WHEN v_variant.id IS NULL THEN v_menu_item.name
      ELSE v_menu_item.name || ' (' || v_variant.name || ')'
    END,
    v_menu_item.price + COALESCE(v_variant.price, 0),
    v_quantity,
    v_note,
    v_toppings,
    v_variant.id,
    v_variant.name
  );

  RETURN (v_menu_item.price + COALESCE(v_variant.price, 0) + v_topping_total) * v_quantity;
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_void_order_item(
  p_order_item_id uuid,
  p_void_type text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_total integer;
BEGIN
  IF p_void_type NOT IN ('cancelled', 'gift') THEN
    RAISE EXCEPTION 'Loại điều chỉnh không hợp lệ';
  END IF;

  SELECT oi.* INTO v_item
  FROM public.order_items oi
  WHERE oi.id = p_order_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy món trong bill';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_item.order_id
  FOR UPDATE;

  IF NOT public.is_store_owner_of(v_order.store_id) THEN
    RAISE EXCEPTION 'Bạn không có quyền sửa bill';
  END IF;

  IF v_order.payment_received_at IS NOT NULL
    OR v_order.status = 'cancelled'
    OR v_order.voucher_id IS NOT NULL THEN
    RAISE EXCEPTION 'Bill này không còn được điều chỉnh';
  END IF;

  -- Gọi lặp lại cùng một thao tác là idempotent, không được ghi đè audit ban đầu.
  IF v_item.void_type IS NOT NULL THEN
    IF v_item.void_type = p_void_type THEN
      RETURN jsonb_build_object(
        'order_id', v_order.id,
        'total_amount', v_order.total_amount,
        'already_applied', true
      );
    END IF;
    RAISE EXCEPTION 'Món đã được điều chỉnh, hãy khôi phục trước';
  END IF;

  UPDATE public.order_items
  SET void_type = p_void_type,
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = NULLIF(btrim(p_reason), '')
  WHERE id = v_item.id;

  v_total := public.recompute_order_total(v_order.id);

  UPDATE public.table_sessions
  SET last_activity_at = now()
  WHERE id = v_order.session_id;

  RETURN jsonb_build_object('order_id', v_order.id, 'total_amount', v_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_restore_order_item(p_order_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_total integer;
BEGIN
  SELECT oi.* INTO v_item
  FROM public.order_items oi
  WHERE oi.id = p_order_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy món trong bill';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_item.order_id
  FOR UPDATE;

  IF NOT public.is_store_owner_of(v_order.store_id) THEN
    RAISE EXCEPTION 'Bạn không có quyền sửa bill';
  END IF;

  IF v_order.payment_received_at IS NOT NULL
    OR v_order.status = 'cancelled'
    OR v_order.voucher_id IS NOT NULL THEN
    RAISE EXCEPTION 'Bill này không còn được điều chỉnh';
  END IF;

  IF v_item.void_type IS NULL THEN
    RETURN jsonb_build_object(
      'order_id', v_order.id,
      'total_amount', v_order.total_amount,
      'already_applied', true
    );
  END IF;

  UPDATE public.order_items
  SET void_type = NULL,
      voided_at = NULL,
      voided_by = NULL,
      void_reason = NULL
  WHERE id = v_item.id;

  v_total := public.recompute_order_total(v_order.id);

  UPDATE public.table_sessions
  SET last_activity_at = now()
  WHERE id = v_order.session_id;

  RETURN jsonb_build_object('order_id', v_order.id, 'total_amount', v_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_add_manual_items(
  p_session_id uuid,
  p_items jsonb,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.table_sessions%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_existing_order_id uuid;
  v_item jsonb;
  v_total integer;
BEGIN
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu mã chống tạo trùng';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cần ít nhất một món để thêm';
  END IF;

  SELECT * INTO v_session
  FROM public.table_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Phiên bàn không còn mở';
  END IF;

  IF NOT public.is_store_owner_of(v_session.store_id) THEN
    RAISE EXCEPTION 'Bạn không có quyền thêm món vào bill';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.session_id = v_session.id
      AND o.voucher_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Bill có voucher không thể thêm món tay';
  END IF;

  SELECT id INTO v_existing_order_id
  FROM public.orders
  WHERE store_id = v_session.store_id
    AND client_request_id = p_client_request_id;

  IF v_existing_order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = v_existing_order_id;
    RETURN jsonb_build_object(
      'order_id', v_order.id,
      'total_amount', v_order.total_amount,
      'already_created', true
    );
  END IF;

  INSERT INTO public.orders (
    store_id,
    table_id,
    session_id,
    status,
    total_amount,
    payment_amount,
    payment_method,
    order_source,
    created_by,
    client_request_id,
    payment_instrument
  ) VALUES (
    v_session.store_id,
    v_session.table_id,
    v_session.id,
    'pending',
    0,
    0,
    'cash',
    'pos',
    auth.uid(),
    p_client_request_id,
    'cash'
  )
  ON CONFLICT (store_id, client_request_id) WHERE client_request_id IS NOT NULL
  DO NOTHING
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    SELECT * INTO v_order
    FROM public.orders
    WHERE store_id = v_session.store_id
      AND client_request_id = p_client_request_id;
    RETURN jsonb_build_object(
      'order_id', v_order.id,
      'total_amount', v_order.total_amount,
      'already_created', true
    );
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    PERFORM public.add_order_line(v_order.id, v_session.store_id, v_item);
  END LOOP;

  v_total := public.recompute_order_total(v_order.id);

  UPDATE public.table_sessions
  SET last_activity_at = now()
  WHERE id = v_session.id;

  RETURN jsonb_build_object('order_id', v_order.id, 'total_amount', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_order_total(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_order_line(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_void_order_item(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_restore_order_item(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_add_manual_items(uuid, jsonb, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.pos_void_order_item(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_restore_order_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_add_manual_items(uuid, jsonb, uuid) TO authenticated;
