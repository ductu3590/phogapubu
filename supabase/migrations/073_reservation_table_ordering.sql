-- BL-3 Task 8: QR không được tự mở một bill mới trong thời gian bàn đã giữ cho booking.
-- Migration 069/070 đã được dùng cho release preorder; dùng 073 để lịch sử migration bất biến.

CREATE OR REPLACE FUNCTION public.table_has_current_reservation_hold(
  p_table_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.reservation_tables rt
    JOIN public.reservations r
      ON r.id = rt.reservation_id AND r.store_id = rt.store_id
    JOIN public.store_workflow_settings w ON w.store_id = rt.store_id
    WHERE rt.table_id = p_table_id
      AND rt.released_at IS NULL
      AND r.status = 'confirmed'
      AND r.session_id IS NULL
      AND w.reservations_enabled
      AND rt.hold_starts_at <= p_now
      AND rt.hold_ends_at > p_now
  );
$$;
REVOKE ALL ON FUNCTION public.table_has_current_reservation_hold(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;

-- `reserved` chỉ là trạng thái UX: tuyệt đối không trả reservation_id hoặc PII.
CREATE OR REPLACE FUNCTION public.get_table_session_state(
  p_table_id uuid,
  p_zalo_user_id text DEFAULT NULL,
  p_device_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
  v_timing text;
  v_s public.table_sessions%ROWTYPE;
  v_count int;
  v_total bigint;
  v_table_names text;
BEGIN
  SELECT t.store_id INTO v_store
  FROM public.tables t
  WHERE t.id = p_table_id AND t.is_active;
  IF v_store IS NULL THEN
    RETURN jsonb_build_object('mode', 'prepay', 'state', 'free');
  END IF;

  SELECT payment_timing INTO v_timing FROM public.stores WHERE id = v_store;
  IF v_timing <> 'postpay' THEN
    RETURN jsonb_build_object('mode', 'prepay');
  END IF;

  PERFORM public.expire_stale_table_sessions(v_store);
  SELECT * INTO v_s FROM public.table_sessions WHERE id = public.open_session_id_for_table(p_table_id);

  IF NOT FOUND THEN
    IF public.table_has_current_reservation_hold(p_table_id, now()) THEN
      RETURN jsonb_build_object('mode', 'postpay', 'state', 'reserved');
    END IF;
    RETURN jsonb_build_object('mode', 'postpay', 'state', 'free');
  END IF;

  -- Mâm do chủ quán nhận khách mở luôn cho mọi người tại bàn gọi thêm.
  IF NOT v_s.is_open_ordering AND NOT (
       (v_s.host_zalo_user_id IS NULL AND v_s.host_device_id IS NULL)
    OR (p_zalo_user_id IS NOT NULL AND v_s.host_zalo_user_id = p_zalo_user_id)
    OR (p_device_id IS NOT NULL AND v_s.host_device_id = p_device_id)
  ) THEN
    RETURN jsonb_build_object('mode', 'postpay', 'state', 'locked', 'opened_at', v_s.opened_at);
  END IF;

  SELECT count(*), coalesce(sum(total_amount), 0)
    INTO v_count, v_total
  FROM public.orders
  WHERE session_id = v_s.id AND status <> 'cancelled';
  SELECT string_agg(t.table_number, ', ' ORDER BY t.table_number)
    INTO v_table_names
  FROM public.session_tables st
  JOIN public.tables t ON t.id = st.table_id
  WHERE st.session_id = v_s.id AND st.is_open;

  RETURN jsonb_build_object(
    'mode', 'postpay', 'state', 'owner', 'session_id', v_s.id,
    'opened_at', v_s.opened_at, 'order_count', v_count, 'total', v_total,
    'is_open_ordering', v_s.is_open_ordering, 'table_names', v_table_names
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_table_session_state(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_table_session_state(uuid, text, text) TO anon, authenticated;

-- Bill phục vụ cảnh báo trùng món phía QR. ID món/biến thể chỉ có trong bill của chính phiên,
-- không làm lộ booking nào; các dòng cancelled bị loại ngay từ server.
CREATE OR REPLACE FUNCTION public.get_table_session_bill(
  p_table_id uuid, p_zalo_user_id text DEFAULT NULL, p_device_id text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session public.table_sessions%ROWTYPE; v_orders jsonb; v_total bigint;
BEGIN
  SELECT * INTO v_session FROM public.table_sessions WHERE id = public.open_session_id_for_table(p_table_id);
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  IF NOT v_session.is_open_ordering AND NOT (
       (v_session.host_zalo_user_id IS NULL AND v_session.host_device_id IS NULL)
    OR (p_zalo_user_id IS NOT NULL AND v_session.host_zalo_user_id = p_zalo_user_id)
    OR (p_device_id IS NOT NULL AND v_session.host_device_id = p_device_id)
  ) THEN RETURN jsonb_build_object('found', false); END IF;

  SELECT coalesce(jsonb_agg(row_data ORDER BY row_data.created_at DESC), '[]'::jsonb), coalesce(sum(row_data.total_amount), 0)
    INTO v_orders, v_total
  FROM (
    SELECT o.id, o.status, o.created_at, o.total_amount, o.order_source, o.payment_received_at,
      coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', oi.id, 'menu_item_id', oi.menu_item_id, 'variant_id', oi.variant_id,
        'name', oi.item_name, 'quantity', oi.quantity,
        'price', CASE WHEN oi.void_type = 'gift' THEN 0 ELSE oi.item_price END,
        'toppings', oi.selected_toppings, 'void_type', oi.void_type
      ) ORDER BY oi.id) FROM public.order_items oi
      WHERE oi.order_id = o.id AND oi.void_type IS DISTINCT FROM 'cancelled'), '[]'::jsonb) AS items
    FROM public.orders o
    WHERE o.session_id = v_session.id AND o.status <> 'cancelled'
  ) row_data;
  RETURN jsonb_build_object('found', true, 'session_id', v_session.id, 'opened_at', v_session.opened_at,
    'total', v_total, 'orders', v_orders);
END;
$$;
REVOKE ALL ON FUNCTION public.get_table_session_bill(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_table_session_bill(uuid, text, text) TO anon, authenticated;

-- Bảng private giữ request-ID và ngữ cảnh QR. Không dùng orders.client_request_id vì
-- create_order cũ không nhận request-ID, và replay không được lộ capability sang máy khác.
CREATE TABLE IF NOT EXISTS public.table_order_batch_requests (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  client_request_id uuid NOT NULL,
  table_id uuid NOT NULL REFERENCES public.tables(id),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  expected_session_id uuid,
  actual_session_id uuid,
  zalo_user_id text,
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, client_request_id)
);
ALTER TABLE public.table_order_batch_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.table_order_batch_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_table_order_batch(
  p_store_id uuid,
  p_table_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_client_request_id uuid,
  p_zalo_user_id text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_voucher_code text DEFAULT NULL,
  p_expected_session_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table public.tables%ROWTYPE;
  v_request public.table_order_batch_requests%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_current_session_id uuid;
  v_created jsonb;
  v_actual_session_id uuid;
BEGIN
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu mã gửi đơn';
  END IF;
  IF NULLIF(btrim(p_zalo_user_id), '') IS NULL AND NULLIF(btrim(p_device_id), '') IS NULL THEN
    RAISE EXCEPTION 'Thiếu ngữ cảnh thiết bị, vui lòng quét lại QR';
  END IF;

  -- Cùng request-ID được tuần tự toàn quán, kể cả khi hai QR khác bàn cùng gửi lại.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_client_request_id::text, 0));

  SELECT * INTO v_request
  FROM public.table_order_batch_requests
  WHERE store_id = p_store_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.table_id IS DISTINCT FROM p_table_id
       OR v_request.expected_session_id IS DISTINCT FROM p_expected_session_id THEN
      RAISE EXCEPTION 'Mã gửi đơn không hợp lệ';
    END IF;
    IF (v_request.device_id IS NOT NULL AND v_request.device_id IS DISTINCT FROM p_device_id)
       OR (v_request.zalo_user_id IS NOT NULL AND v_request.zalo_user_id IS DISTINCT FROM p_zalo_user_id) THEN
      RAISE EXCEPTION 'batch request không thuộc ngữ cảnh thiết bị này';
    END IF;
    SELECT * INTO v_order FROM public.orders WHERE id = v_request.order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn đã gửi'; END IF;
    RETURN to_jsonb(v_order);
  END IF;

  SELECT * INTO v_table
  FROM public.tables
  WHERE id = p_table_id AND store_id = p_store_id AND is_active
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động'; END IF;

  PERFORM public.lock_table_for_session(p_table_id);
  v_current_session_id := public.open_session_id_for_table(p_table_id);
  IF v_current_session_id IS NULL AND public.table_has_current_reservation_hold(p_table_id, now()) THEN
    RAISE EXCEPTION 'Bàn đã được đặt trước. Vui lòng báo chủ quán để mở bàn.';
  END IF;
  IF p_expected_session_id IS NOT NULL AND p_expected_session_id IS DISTINCT FROM v_current_session_id THEN
    RAISE EXCEPTION 'Phiên bàn đã thay đổi, vui lòng kiểm tra lại trước khi gửi món';
  END IF;
  IF v_current_session_id IS NOT NULL AND p_expected_session_id IS NULL THEN
    RAISE EXCEPTION 'Phiên bàn đã thay đổi, vui lòng kiểm tra lại trước khi gửi món';
  END IF;

  v_created := public.create_order(
    p_store_id, p_table_id, p_items, p_payment_method, p_zalo_user_id, p_note,
    'dine_in', NULL, NULL, NULL, p_voucher_code, p_device_id
  );
  SELECT * INTO v_order FROM public.orders WHERE id = (v_created->>'id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tạo đơn thất bại'; END IF;
  v_actual_session_id := v_order.session_id;

  INSERT INTO public.table_order_batch_requests(
    store_id, client_request_id, table_id, order_id, expected_session_id,
    actual_session_id, zalo_user_id, device_id
  ) VALUES (
    p_store_id, p_client_request_id, p_table_id, v_order.id, p_expected_session_id,
    v_actual_session_id, NULLIF(btrim(p_zalo_user_id), ''), NULLIF(btrim(p_device_id), '')
  );
  RETURN to_jsonb(v_order);
END;
$$;
REVOKE ALL ON FUNCTION public.create_table_order_batch(uuid, uuid, jsonb, text, uuid, text, text, text, text, uuid)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.create_table_order_batch(uuid, uuid, jsonb, text, uuid, text, text, text, text, uuid)
  TO anon;

NOTIFY pgrst, 'reload schema';
