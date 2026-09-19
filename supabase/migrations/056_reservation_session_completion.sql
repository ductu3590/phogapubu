-- BL-1 Task 4: một reservation chỉ hoàn tất khi chủ quán thật sự chốt bill paid.
-- Các nhánh staff_reset/expired/merged không đổi trạng thái đặt bàn.

CREATE OR REPLACE FUNCTION public.close_table_session(
  p_session_id uuid,
  p_reason text,
  p_instrument text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.table_sessions%ROWTYPE;
  v_reservation public.reservations%ROWTYPE;
  v_uid uuid := auth.uid();
  v_settled integer := 0;
  v_cancelled integer := 0;
  v_left integer := 0;
  v_pending integer := 0;
  v_total bigint := 0;
  v_before jsonb;
BEGIN
  IF p_reason NOT IN ('paid', 'staff_reset') THEN
    RAISE EXCEPTION 'Lý do đóng bàn không hợp lệ: %', p_reason;
  END IF;

  -- Giữ thứ tự khoá của migration 039 để không chen đơn mới trong lúc chốt bill.
  SELECT * INTO v_session
  FROM public.table_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiên';
  END IF;
  IF NOT public.is_store_owner_of(v_session.store_id) THEN
    RAISE EXCEPTION 'Chỉ chủ quán mới được đóng bill';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Thiếu danh tính người chốt bill';
  END IF;

  -- Idempotent: không ghi đè người đã chốt lần đầu.
  IF v_session.status = 'closed'
     AND v_session.close_reason IN ('paid', 'staff_reset') THEN
    SELECT COALESCE(SUM(total_amount), 0)
    INTO v_total
    FROM public.orders
    WHERE session_id = p_session_id
      AND status <> 'cancelled';

    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'orders_settled', 0,
      'orders_cancelled', 0,
      'orders_left_in_kitchen', 0,
      'total', v_total
    );
  END IF;

  SELECT COUNT(*)
  INTO v_pending
  FROM public.orders
  WHERE session_id = p_session_id
    AND status = 'pending'
    AND order_source <> 'pos';

  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Còn % đơn chưa được chủ quán xác nhận', v_pending;
  END IF;

  IF p_reason = 'paid' THEN
    IF p_instrument IS NULL OR p_instrument NOT IN ('cash', 'bank') THEN
      RAISE EXCEPTION 'Phương tiện thanh toán không hợp lệ: %', COALESCE(p_instrument, '(trống)');
    END IF;

    UPDATE public.orders
    SET payment_received_at = now(),
        payment_received_via = 'owner',
        payment_received_by = v_uid,
        payment_instrument = p_instrument
    WHERE session_id = p_session_id
      AND status <> 'cancelled'
      AND payment_received_at IS NULL;
    GET DIAGNOSTICS v_settled = ROW_COUNT;
  ELSE
    UPDATE public.orders
    SET status = 'cancelled'
    WHERE session_id = p_session_id
      AND status IN ('pending', 'confirmed')
      AND payment_received_at IS NULL;
    GET DIAGNOSTICS v_cancelled = ROW_COUNT;

    SELECT COUNT(*)
    INTO v_left
    FROM public.orders
    WHERE session_id = p_session_id
      AND status IN ('cooking', 'ready');
  END IF;

  SELECT COALESCE(SUM(total_amount), 0)
  INTO v_total
  FROM public.orders
  WHERE session_id = p_session_id
    AND status <> 'cancelled';

  UPDATE public.table_sessions
  SET status = 'closed',
      closed_at = COALESCE(closed_at, now()),
      closed_by = v_uid,
      close_reason = p_reason
  WHERE id = p_session_id;

  -- `paid` là tín hiệu vận hành duy nhất hoàn tất booking. expiry/merge không gọi
  -- hàm này với paid nên chỉ giải phóng bàn, không giả vờ khách đã thanh toán/xong bữa.
  IF p_reason = 'paid' THEN
    SELECT * INTO v_reservation
    FROM public.reservations
    WHERE session_id = p_session_id
      AND status = 'arrived'
    FOR UPDATE;

    IF FOUND THEN
      v_before := public.reservation_public_json(v_reservation)
        || public.reservation_active_table_summary(v_reservation.id);
      UPDATE public.reservations
      SET status = 'completed',
          completed_at = now(),
          completed_by = v_uid,
          updated_at = now()
      WHERE id = v_reservation.id
      RETURNING * INTO v_reservation;

      PERFORM public.append_reservation_event(
        v_reservation.id, v_reservation.store_id, v_uid, 'owner', 'completed',
        v_before,
        public.reservation_public_json(v_reservation)
          || public.reservation_active_table_summary(v_reservation.id)
          || jsonb_build_object('session_id', p_session_id),
        NULL
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'orders_settled', v_settled,
    'orders_cancelled', v_cancelled,
    'orders_left_in_kitchen', v_left,
    'total', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_table_session(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_table_session(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_table_sessions_bulk(
  p_session_ids uuid[],
  p_reason text,
  p_instrument text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_ids uuid[];
  v_one jsonb;
  v_settled integer := 0;
  v_cancelled integer := 0;
  v_left integer := 0;
  v_total bigint := 0;
  v_count integer := 0;
BEGIN
  IF p_session_ids IS NULL OR array_length(p_session_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Chưa chọn phiên nào';
  END IF;

  SELECT array_agg(DISTINCT session_id ORDER BY session_id)
  INTO v_ids
  FROM unnest(p_session_ids) AS session_id;

  FOREACH v_id IN ARRAY v_ids
  LOOP
    v_one := public.close_table_session(v_id, p_reason, p_instrument);
    v_count := v_count + 1;
    v_settled := v_settled + COALESCE((v_one->>'orders_settled')::integer, 0);
    v_cancelled := v_cancelled + COALESCE((v_one->>'orders_cancelled')::integer, 0);
    v_left := v_left + COALESCE((v_one->>'orders_left_in_kitchen')::integer, 0);
    v_total := v_total + COALESCE((v_one->>'total')::bigint, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'sessions', v_count,
    'orders_settled', v_settled,
    'orders_cancelled', v_cancelled,
    'orders_left_in_kitchen', v_left,
    'total', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_table_sessions_bulk(uuid[], text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_table_sessions_bulk(uuid[], text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
