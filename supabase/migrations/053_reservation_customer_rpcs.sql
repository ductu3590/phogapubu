-- BL-1 Task 2: slot và RPC đặt bàn phía khách.
-- Mọi thời điểm tính ở server theo Asia/Ho_Chi_Minh; is_accepting_orders không áp cho booking tương lai.

CREATE OR REPLACE FUNCTION public.reservation_customer_token_hash(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

REVOKE ALL ON FUNCTION public.reservation_customer_token_hash(text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reservation_public_json(p_reservation public.reservations)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'reservation_id', p_reservation.id,
    'store_id', p_reservation.store_id,
    'status', p_reservation.status,
    'customer_name', p_reservation.customer_name,
    'customer_phone', p_reservation.customer_phone,
    'party_size', p_reservation.party_size,
    'arrival_at', p_reservation.arrival_at,
    'note', p_reservation.note,
    'requested_arrival_at', p_reservation.requested_arrival_at,
    'requested_party_size', p_reservation.requested_party_size,
    'change_note', p_reservation.change_note,
    'created_at', p_reservation.created_at,
    'updated_at', p_reservation.updated_at
  );
$$;

REVOKE ALL ON FUNCTION public.reservation_public_json(public.reservations)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_reservation_slots(
  p_store_id uuid,
  p_local_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours jsonb;
  v_horizon integer;
  v_minimum_advance integer;
  v_interval integer;
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_minimum_at timestamptz;
  v_shift jsonb;
  v_open time;
  v_close time;
  v_start_local timestamp;
  v_end_local timestamp;
  v_slot_local timestamp;
  v_slot timestamptz;
  v_slots jsonb := '[]'::jsonb;
BEGIN
  SELECT s.serving_hours, w.booking_horizon_days, w.minimum_advance_minutes,
         w.slot_interval_minutes
  INTO v_hours, v_horizon, v_minimum_advance, v_interval
  FROM public.stores s
  JOIN public.store_workflow_settings w ON w.store_id = s.id
  WHERE s.id = p_store_id
    AND s.is_active IS TRUE
    AND w.reservations_enabled IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quán chưa bật nhận đặt bàn';
  END IF;
  IF p_local_date IS NULL OR p_local_date < v_today
     OR p_local_date >= v_today + v_horizon THEN
    RETURN '[]'::jsonb;
  END IF;

  v_minimum_at := now() + make_interval(mins => v_minimum_advance);

  -- Mảng rỗng nghĩa là mở cả ngày, thống nhất với serving_hours hiện có.
  IF v_hours IS NULL OR jsonb_typeof(v_hours) <> 'array'
     OR jsonb_array_length(v_hours) = 0 THEN
    v_start_local := p_local_date::timestamp;
    v_end_local := v_start_local + interval '1 day';
    v_slot_local := v_start_local;
    WHILE v_slot_local < v_end_local LOOP
      v_slot := v_slot_local AT TIME ZONE 'Asia/Ho_Chi_Minh';
      IF v_slot >= v_minimum_at THEN
        v_slots := v_slots || jsonb_build_array(jsonb_build_object(
          'arrival_at', v_slot,
          'local_time', to_char(v_slot_local, 'HH24:MI')
        ));
      END IF;
      v_slot_local := v_slot_local + make_interval(mins => v_interval);
    END LOOP;
    RETURN v_slots;
  END IF;

  FOR v_shift IN SELECT value FROM jsonb_array_elements(v_hours) LOOP
    v_open := (v_shift->>'open')::time;
    v_close := (v_shift->>'close')::time;
    v_start_local := p_local_date::timestamp + v_open;
    v_end_local := p_local_date::timestamp + v_close;
    IF v_close <= v_open THEN
      v_end_local := v_end_local + interval '1 day';
    END IF;

    v_slot_local := v_start_local;
    WHILE v_slot_local < v_end_local LOOP
      v_slot := v_slot_local AT TIME ZONE 'Asia/Ho_Chi_Minh';
      IF v_slot >= v_minimum_at THEN
        v_slots := v_slots || jsonb_build_array(jsonb_build_object(
          'arrival_at', v_slot,
          'local_time', to_char(v_slot_local, 'HH24:MI')
        ));
      END IF;
      v_slot_local := v_slot_local + make_interval(mins => v_interval);
    END LOOP;
  END LOOP;

  RETURN v_slots;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reservation_slots(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reservation_slots(uuid, date) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_reservation(
  p_store_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_party_size integer,
  p_arrival_at timestamptz,
  p_note text DEFAULT NULL,
  p_zalo_user_id text DEFAULT NULL,
  p_client_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workflow public.store_workflow_settings%ROWTYPE;
  v_existing public.reservations%ROWTYPE;
  v_reservation public.reservations%ROWTYPE;
  v_slots jsonb;
  v_local_date date;
  v_minimum_at timestamptz;
  v_customer_token text;
BEGIN
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu mã chống gửi trùng';
  END IF;

  SELECT * INTO v_existing
  FROM public.reservations
  WHERE store_id = p_store_id AND client_request_id = p_client_request_id
  FOR UPDATE;
  IF FOUND THEN
    RETURN public.reservation_public_json(v_existing)
      || jsonb_build_object('created', false);
  END IF;

  SELECT * INTO v_workflow
  FROM public.store_workflow_settings
  WHERE store_id = p_store_id
  FOR SHARE;
  IF NOT FOUND OR v_workflow.reservations_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'Quán chưa bật nhận đặt bàn';
  END IF;
  IF p_customer_name IS NULL OR length(btrim(p_customer_name)) = 0 THEN
    RAISE EXCEPTION 'Vui lòng nhập tên người đặt';
  END IF;
  IF p_customer_phone IS NULL OR length(btrim(p_customer_phone)) < 6 THEN
    RAISE EXCEPTION 'Vui lòng nhập số điện thoại hợp lệ';
  END IF;
  IF p_party_size IS NULL OR p_party_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Số khách phải từ 1 đến 100';
  END IF;
  IF p_arrival_at IS NULL THEN
    RAISE EXCEPTION 'Vui lòng chọn giờ đến';
  END IF;

  v_minimum_at := now() + make_interval(mins => v_workflow.minimum_advance_minutes);
  IF p_arrival_at < v_minimum_at THEN
    RAISE EXCEPTION 'Chỉ nhận đặt bàn trước ít nhất % phút', v_workflow.minimum_advance_minutes;
  END IF;
  v_local_date := (p_arrival_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  IF v_local_date < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
     OR v_local_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + v_workflow.booking_horizon_days THEN
    RAISE EXCEPTION 'Chỉ nhận đặt bàn trong % ngày tới', v_workflow.booking_horizon_days;
  END IF;

  v_slots := public.get_reservation_slots(p_store_id, v_local_date);
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_slots) AS slot(value)
    WHERE (slot.value->>'arrival_at')::timestamptz = p_arrival_at
  ) THEN
    RAISE EXCEPTION 'Giờ đến phải nằm trong khung giờ phục vụ và theo bước % phút',
      v_workflow.slot_interval_minutes;
  END IF;

  v_customer_token := replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.reservations(
    store_id, customer_name, customer_phone, zalo_user_id, party_size, arrival_at,
    note, client_request_id, customer_token_hash,
    minimum_advance_minutes, booking_horizon_days, slot_interval_minutes,
    default_table_capacity, planning_hold_minutes,
    reservation_preorder_edit_cutoff_minutes
  ) VALUES (
    p_store_id, btrim(p_customer_name), btrim(p_customer_phone), p_zalo_user_id,
    p_party_size, p_arrival_at, NULLIF(btrim(COALESCE(p_note, '')), ''),
    p_client_request_id, public.reservation_customer_token_hash(v_customer_token),
    v_workflow.minimum_advance_minutes, v_workflow.booking_horizon_days,
    v_workflow.slot_interval_minutes, v_workflow.default_table_capacity,
    v_workflow.planning_hold_minutes,
    v_workflow.reservation_preorder_edit_cutoff_minutes
  ) ON CONFLICT (store_id, client_request_id) DO NOTHING
  RETURNING * INTO v_reservation;

  IF NOT FOUND THEN
    SELECT * INTO v_reservation
    FROM public.reservations
    WHERE store_id = p_store_id AND client_request_id = p_client_request_id;
    RETURN public.reservation_public_json(v_reservation)
      || jsonb_build_object('created', false);
  END IF;

  PERFORM public.append_reservation_event(
    v_reservation.id, v_reservation.store_id, NULL, 'customer', 'created',
    '{}'::jsonb, public.reservation_public_json(v_reservation), NULL
  );
  RETURN public.reservation_public_json(v_reservation)
    || jsonb_build_object('created', true, 'customer_token', v_customer_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_customer_reservation(
  p_reservation_id uuid,
  p_customer_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_reservation
  FROM public.reservations
  WHERE id = p_reservation_id
    AND customer_token_hash = public.reservation_customer_token_hash(p_customer_token);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không có quyền xem đặt bàn này';
  END IF;
  RETURN public.reservation_public_json(v_reservation);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_reservation_change(
  p_reservation_id uuid,
  p_customer_token text,
  p_requested_arrival_at timestamptz,
  p_requested_party_size integer,
  p_change_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_slots jsonb;
  v_local_date date;
BEGIN
  SELECT * INTO v_reservation
  FROM public.reservations
  WHERE id = p_reservation_id
    AND customer_token_hash = public.reservation_customer_token_hash(p_customer_token)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không có quyền đổi đặt bàn này';
  END IF;
  IF v_reservation.status NOT IN ('pending', 'confirmed')
     OR v_reservation.arrival_at <= now() THEN
    RAISE EXCEPTION 'Đặt bàn này không còn có thể yêu cầu đổi';
  END IF;
  IF p_requested_party_size IS NULL OR p_requested_party_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Số khách phải từ 1 đến 100';
  END IF;
  IF p_requested_arrival_at IS NULL OR p_requested_arrival_at < now() + make_interval(mins => v_reservation.minimum_advance_minutes) THEN
    RAISE EXCEPTION 'Giờ đổi phải trước ít nhất % phút', v_reservation.minimum_advance_minutes;
  END IF;
  v_local_date := (p_requested_arrival_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  IF v_local_date < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
     OR v_local_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + v_reservation.booking_horizon_days THEN
    RAISE EXCEPTION 'Giờ đổi phải nằm trong % ngày tới', v_reservation.booking_horizon_days;
  END IF;
  v_slots := public.get_reservation_slots(v_reservation.store_id, v_local_date);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_slots) AS slot(value)
    WHERE (slot.value->>'arrival_at')::timestamptz = p_requested_arrival_at
  ) THEN
    RAISE EXCEPTION 'Giờ đổi phải nằm trong khung giờ phục vụ';
  END IF;

  UPDATE public.reservations
  SET requested_arrival_at = p_requested_arrival_at,
      requested_party_size = p_requested_party_size,
      change_note = NULLIF(btrim(COALESCE(p_change_note, '')), ''),
      updated_at = now()
  WHERE id = v_reservation.id
  RETURNING * INTO v_reservation;
  PERFORM public.append_reservation_event(
    v_reservation.id, v_reservation.store_id, NULL, 'customer', 'change_requested',
    jsonb_build_object('arrival_at', v_reservation.arrival_at, 'party_size', v_reservation.party_size),
    jsonb_build_object('requested_arrival_at', v_reservation.requested_arrival_at,
      'requested_party_size', v_reservation.requested_party_size, 'change_note', v_reservation.change_note),
    NULL
  );
  RETURN public.reservation_public_json(v_reservation);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_customer_reservation(
  p_reservation_id uuid,
  p_customer_token text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_before_status text;
BEGIN
  SELECT * INTO v_reservation
  FROM public.reservations
  WHERE id = p_reservation_id
    AND customer_token_hash = public.reservation_customer_token_hash(p_customer_token)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không có quyền hủy đặt bàn này';
  END IF;
  IF v_reservation.status NOT IN ('pending', 'confirmed')
     OR v_reservation.arrival_at <= now() THEN
    RAISE EXCEPTION 'Đặt bàn này không còn có thể hủy';
  END IF;
  v_before_status := v_reservation.status;

  UPDATE public.reservations
  SET status = 'cancelled_by_customer',
      cancelled_at = now(),
      cancelled_by = NULL,
      updated_at = now()
  WHERE id = v_reservation.id
  RETURNING * INTO v_reservation;
  PERFORM public.append_reservation_event(
    v_reservation.id, v_reservation.store_id, NULL, 'customer', 'cancelled_by_customer',
    jsonb_build_object('status', v_before_status),
    jsonb_build_object('status', v_reservation.status),
    NULLIF(btrim(COALESCE(p_reason, '')), '')
  );
  RETURN public.reservation_public_json(v_reservation);
END;
$$;

REVOKE ALL ON FUNCTION public.create_reservation(uuid, text, text, integer, timestamptz, text, text, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_customer_reservation(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_reservation_change(uuid, text, timestamptz, integer, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_customer_reservation(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_reservation(uuid, text, text, integer, timestamptz, text, text, uuid)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_reservation(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_reservation_change(uuid, text, timestamptz, integer, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_customer_reservation(uuid, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
