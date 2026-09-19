-- BL-1 Task 4: chủ quán nhận khách đặt trước thành một phiên/mâm đang mở.
-- Không tạo order và không in bếp; chỉ mở ngữ cảnh gọi món sau khi khách đã tới.

CREATE OR REPLACE FUNCTION public.arrive_reservation(
  p_reservation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_arrived public.reservations%ROWTYPE;
  v_actor_kind text;
  v_table_ids uuid[];
  v_lock_table_ids uuid[];
  v_table_id uuid;
  v_session_id uuid;
  v_tables jsonb;
  v_before jsonb;
BEGIN
  -- Reservation là điểm khóa đầu tiên: retry từ POS chỉ một lần mở mâm.
  SELECT * INTO v_reservation
  FROM public.reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đặt bàn';
  END IF;
  v_actor_kind := public.reservation_operator_actor_kind(v_reservation.store_id);

  IF v_reservation.status IN ('arrived', 'completed') THEN
    IF v_reservation.session_id IS NULL THEN
      RAISE EXCEPTION 'Đặt bàn đã nhận khách nhưng thiếu phiên';
    END IF;
    RETURN public.reservation_public_json(v_reservation)
      || public.reservation_active_table_summary(v_reservation.id)
      || jsonb_build_object('session_id', v_reservation.session_id, 'already', true);
  END IF;

  IF v_reservation.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Chỉ nhận khách cho đặt bàn đã xác nhận';
  END IF;

  -- Khóa bàn theo id để cùng thứ tự với các thao tác mâm khác, nhưng giữ bàn gốc
  -- theo số bàn để nhãn phiên ổn định cho POS/Kitchen.
  SELECT
    array_agg(rt.table_id ORDER BY t.table_number, t.id),
    array_agg(rt.table_id ORDER BY rt.table_id),
    jsonb_build_object(
      'table_ids', COALESCE(jsonb_agg(t.id ORDER BY t.table_number, t.id), '[]'::jsonb),
      'table_numbers', COALESCE(jsonb_agg(t.table_number ORDER BY t.table_number, t.id), '[]'::jsonb)
    )
  INTO v_table_ids, v_lock_table_ids, v_tables
  FROM public.reservation_tables rt
  JOIN public.tables t ON t.id = rt.table_id AND t.store_id = rt.store_id
  WHERE rt.reservation_id = v_reservation.id
    AND rt.released_at IS NULL;

  IF COALESCE(cardinality(v_table_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Đặt bàn chưa được phân bàn';
  END IF;

  -- create_order/staff_create_order dùng advisory lock này trước khi mở phiên.
  -- Lấy đủ lock trước khi kiểm để không chen một đơn QR vào đúng lúc nhận khách.
  FOREACH v_table_id IN ARRAY v_lock_table_ids LOOP
    PERFORM public.lock_table_for_session(v_table_id);
  END LOOP;

  -- Khóa row bàn để tuần tự với phân bổ reservation khác.
  PERFORM 1
  FROM public.tables
  WHERE id = ANY(v_lock_table_ids)
  ORDER BY id
  FOR UPDATE;

  FOREACH v_table_id IN ARRAY v_lock_table_ids LOOP
    IF public.open_session_id_for_table(v_table_id) IS NOT NULL THEN
      RAISE EXCEPTION 'Bàn đang có khách, hãy xử lý phiên hiện tại trước';
    END IF;
  END LOOP;

  INSERT INTO public.table_sessions(store_id, table_id, opened_by, is_open_ordering)
  VALUES (v_reservation.store_id, v_table_ids[1], 'staff', true)
  RETURNING id INTO v_session_id;

  INSERT INTO public.session_tables(session_id, table_id)
  SELECT v_session_id, selected.table_id
  FROM unnest(v_table_ids) AS selected(table_id);

  v_before := public.reservation_public_json(v_reservation)
    || public.reservation_active_table_summary(v_reservation.id);
  UPDATE public.reservations
  SET status = 'arrived',
      session_id = v_session_id,
      arrived_at = now(),
      arrived_by = auth.uid(),
      updated_at = now()
  WHERE id = v_reservation.id
  RETURNING * INTO v_arrived;

  PERFORM public.append_reservation_event(
    v_arrived.id, v_arrived.store_id, auth.uid(), v_actor_kind, 'arrived',
    v_before,
    public.reservation_public_json(v_arrived) || v_tables || jsonb_build_object('session_id', v_session_id),
    NULL
  );

  RETURN public.reservation_public_json(v_arrived)
    || v_tables
    || jsonb_build_object('session_id', v_session_id, 'already', false);
END;
$$;

REVOKE ALL ON FUNCTION public.arrive_reservation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arrive_reservation(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
