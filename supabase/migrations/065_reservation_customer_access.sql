-- BL-3 Task 1: quyền khách đặt bàn tách khỏi UUID/request-id; retry khôi phục qua intent kín.

CREATE TABLE IF NOT EXISTS public.reservation_customer_requests (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  client_request_id uuid NOT NULL,
  token_hash text CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  reservation_id uuid,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, client_request_id),
  CONSTRAINT reservation_customer_requests_booking_store_fkey
    FOREIGN KEY (reservation_id, store_id)
    REFERENCES public.reservations(id, store_id) ON DELETE CASCADE,
  CONSTRAINT reservation_customer_requests_consumed_pair
    CHECK ((reservation_id IS NULL) = (consumed_at IS NULL))
);

CREATE INDEX IF NOT EXISTS reservation_customer_requests_expiry
  ON public.reservation_customer_requests(expires_at)
  WHERE reservation_id IS NULL;

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS serving_hours_snapshot jsonb;
UPDATE public.reservations r SET serving_hours_snapshot = s.serving_hours
FROM public.stores s
WHERE r.store_id = s.id AND r.serving_hours_snapshot IS NULL;
UPDATE public.reservations SET serving_hours_snapshot = '[]'::jsonb
WHERE serving_hours_snapshot IS NULL;
ALTER TABLE public.reservations
  ALTER COLUMN serving_hours_snapshot SET DEFAULT '[]'::jsonb,
  ALTER COLUMN serving_hours_snapshot SET NOT NULL;

ALTER TABLE public.reservation_customer_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reservation_customer_requests FROM PUBLIC, anon, authenticated;

-- Rejection/operator notes stay private; expose only wording derived from state.
CREATE OR REPLACE FUNCTION public.customer_reservation_json(
  p_reservation public.reservations
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.reservation_public_json(p_reservation) || jsonb_build_object(
    'server_now', now(),
    'preorder_edit_deadline', p_reservation.arrival_at
      - make_interval(mins => p_reservation.reservation_preorder_edit_cutoff_minutes),
    'can_request_change', p_reservation.status IN ('pending', 'confirmed')
      AND p_reservation.arrival_at > now()
      AND p_reservation.requested_arrival_at IS NULL,
    'can_cancel', p_reservation.status IN ('pending', 'confirmed')
      AND p_reservation.arrival_at > now(),
    'can_preorder', p_reservation.status = 'confirmed'
      AND p_reservation.requested_arrival_at IS NULL
      AND now() < p_reservation.arrival_at
        - make_interval(mins => p_reservation.reservation_preorder_edit_cutoff_minutes),
    'has_change_request', p_reservation.requested_arrival_at IS NOT NULL
      AND p_reservation.status IN ('pending', 'confirmed', 'change_requested'),
    'customer_message', CASE
      WHEN p_reservation.requested_arrival_at IS NOT NULL
        AND p_reservation.status IN ('pending', 'confirmed', 'change_requested')
        THEN 'Yêu cầu đổi đang chờ quán xác nhận; lịch cũ vẫn còn hiệu lực'
      WHEN p_reservation.status = 'pending'
        THEN 'Quán chưa xác nhận — đặt bàn chưa được bảo đảm'
      WHEN p_reservation.status = 'confirmed'
        THEN 'Đặt bàn đã được quán xác nhận'
      WHEN p_reservation.status = 'change_requested'
        THEN 'Yêu cầu đổi đang chờ quán xác nhận; lịch cũ vẫn còn hiệu lực'
      WHEN p_reservation.status = 'rejected'
        THEN 'Quán không thể nhận đặt bàn này. Vui lòng gọi quán để được hỗ trợ.'
      WHEN p_reservation.status = 'no_show'
        THEN 'Đặt bàn đã được quán đánh dấu khách không đến. Vui lòng gọi quán nếu cần hỗ trợ.'
      WHEN p_reservation.status IN ('cancelled_by_customer', 'cancelled_by_store')
        THEN 'Đặt bàn đã kết thúc. Vui lòng gọi quán nếu cần hỗ trợ.'
      WHEN p_reservation.status = 'arrived'
        THEN 'Quán đã xác nhận khách đến'
      WHEN p_reservation.status = 'completed'
        THEN 'Lượt đặt bàn đã hoàn tất'
      ELSE 'Trạng thái đặt bàn đang được cập nhật'
    END
  );
$$;
REVOKE ALL ON FUNCTION public.customer_reservation_json(public.reservations)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reservation_slots_for_hours(
  p_hours jsonb,
  p_local_date date,
  p_interval_minutes integer,
  p_minimum_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift jsonb;
  v_open time;
  v_close time;
  v_service_date date;
  v_start_local timestamp;
  v_end_local timestamp;
  v_slot_local timestamp;
  v_slot timestamptz;
  v_slots jsonb := '[]'::jsonb;
BEGIN
  -- Mảng rỗng là mở 24h. Sinh theo ngày lịch đã chọn rồi chuẩn hoá instant UTC.
  IF p_hours IS NULL OR jsonb_typeof(p_hours) <> 'array'
     OR jsonb_array_length(p_hours) = 0 THEN
    v_start_local := p_local_date::timestamp;
    v_end_local := v_start_local + interval '1 day';
    v_slot_local := v_start_local;
    WHILE v_slot_local < v_end_local LOOP
      v_slot := v_slot_local AT TIME ZONE 'Asia/Ho_Chi_Minh';
      IF v_slot >= p_minimum_at THEN
        v_slots := v_slots || jsonb_build_array(jsonb_build_object(
          'arrival_at', v_slot, 'local_time', to_char(v_slot_local, 'HH24:MI')
        ));
      END IF;
      v_slot_local := v_slot_local + make_interval(mins => p_interval_minutes);
    END LOOP;
  ELSE
    -- Ca mở hôm trước và đóng sau nửa đêm được tính vào ngày khách đang xem.
    FOREACH v_service_date IN ARRAY ARRAY[p_local_date - 1, p_local_date] LOOP
      FOR v_shift IN SELECT value FROM jsonb_array_elements(p_hours) LOOP
        v_open := (v_shift->>'open')::time;
        v_close := (v_shift->>'close')::time;
        v_start_local := v_service_date::timestamp + v_open;
        v_end_local := v_service_date::timestamp + v_close;
        IF v_close <= v_open THEN v_end_local := v_end_local + interval '1 day'; END IF;
        v_slot_local := v_start_local;
        WHILE v_slot_local < v_end_local LOOP
          IF v_slot_local >= p_local_date::timestamp
             AND v_slot_local < (p_local_date + 1)::timestamp THEN
            v_slot := v_slot_local AT TIME ZONE 'Asia/Ho_Chi_Minh';
            IF v_slot >= p_minimum_at AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(v_slots) old_slot
              WHERE (old_slot->>'arrival_at')::timestamptz = v_slot
            ) THEN
              v_slots := v_slots || jsonb_build_array(jsonb_build_object(
                'arrival_at', v_slot, 'local_time', to_char(v_slot_local, 'HH24:MI')
              ));
            END IF;
          END IF;
          v_slot_local := v_slot_local + make_interval(mins => p_interval_minutes);
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;

  SELECT COALESCE(jsonb_agg(slot ORDER BY (slot->>'arrival_at')::timestamptz), '[]'::jsonb)
  INTO v_slots FROM jsonb_array_elements(v_slots) AS slot;
  RETURN v_slots;
END;
$$;

REVOKE ALL ON FUNCTION public.reservation_slots_for_hours(jsonb, date, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_reservation_slots(p_store_id uuid, p_local_date date)
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
BEGIN
  SELECT s.serving_hours, w.booking_horizon_days, w.minimum_advance_minutes,
         w.slot_interval_minutes
  INTO v_hours, v_horizon, v_minimum_advance, v_interval
  FROM public.stores s JOIN public.store_workflow_settings w ON w.store_id = s.id
  WHERE s.id = p_store_id AND s.is_active IS TRUE AND w.reservations_enabled IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quán chưa bật nhận đặt bàn'; END IF;
  IF p_local_date IS NULL OR p_local_date < v_today
     OR p_local_date >= v_today + v_horizon THEN RETURN '[]'::jsonb; END IF;
  RETURN public.reservation_slots_for_hours(v_hours, p_local_date, v_interval,
    now() + make_interval(mins => v_minimum_advance));
END;
$$;
REVOKE ALL ON FUNCTION public.get_reservation_slots(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reservation_slots(uuid, date) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_reservation_config(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store public.stores%ROWTYPE;
  v_workflow public.store_workflow_settings%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  SELECT * INTO v_store FROM public.stores WHERE id = p_store_id;
  SELECT * INTO v_workflow FROM public.store_workflow_settings WHERE store_id = p_store_id;
  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'reservations_enabled', COALESCE(v_store.is_active, false)
      AND COALESCE(v_workflow.reservations_enabled, false),
    'preorder_enabled', COALESCE(v_workflow.reservation_preorder_enabled, false),
    'minimum_advance_minutes', COALESCE(v_workflow.minimum_advance_minutes, 30),
    'booking_horizon_days', COALESCE(v_workflow.booking_horizon_days, 7),
    'slot_interval_minutes', COALESCE(v_workflow.slot_interval_minutes, 15),
    'preorder_edit_cutoff_minutes', COALESCE(v_workflow.reservation_preorder_edit_cutoff_minutes, 30),
    'server_now', now(),
    'timezone', 'Asia/Ho_Chi_Minh',
    'local_today', v_today,
    'minimum_date', v_today,
    'maximum_date', v_today + COALESCE(v_workflow.booking_horizon_days, 7) - 1
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_reservation_config(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_reservation_config(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.prepare_reservation_request(
  p_store_id uuid,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_existing public.reservation_customer_requests%ROWTYPE;
  v_token text;
  v_expires_at timestamptz;
BEGIN
  IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'Thiếu mã yêu cầu đặt bàn'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.stores s
    JOIN public.store_workflow_settings w ON w.store_id = s.id
    WHERE s.id = p_store_id AND s.is_active IS TRUE AND w.reservations_enabled IS TRUE
  ) THEN RAISE EXCEPTION 'Quán chưa bật nhận đặt bàn'; END IF;

  SELECT * INTO v_existing FROM public.reservation_customer_requests
  WHERE store_id = p_store_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.reservation_id IS NULL AND v_existing.expires_at <= now() THEN
      RAISE EXCEPTION 'Yêu cầu chuẩn bị đã hết hạn; hãy tạo yêu cầu mới';
    END IF;
    -- Không thể khôi phục raw token đã mất; caller chuẩn bị ID mới nếu chưa gửi create.
    RETURN jsonb_build_object('customer_token', NULL,
      'expires_at', CASE WHEN v_existing.reservation_id IS NOT NULL THEN NULL ELSE v_existing.expires_at END,
      'already_prepared', true, 'already_used', v_existing.reservation_id IS NOT NULL);
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '24 hours';
  INSERT INTO public.reservation_customer_requests(store_id, client_request_id, token_hash, expires_at)
  VALUES (p_store_id, p_client_request_id, public.reservation_customer_token_hash(v_token), v_expires_at);
  RETURN jsonb_build_object('customer_token', v_token, 'expires_at', v_expires_at,
    'already_prepared', false, 'already_used', false);
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_reservation_request(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_reservation_request(uuid, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_customer_reservation(
  p_store_id uuid,
  p_client_request_id uuid,
  p_customer_token text,
  p_customer_name text,
  p_customer_phone text,
  p_party_size integer,
  p_arrival_at timestamptz,
  p_note text DEFAULT NULL,
  p_zalo_user_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.reservation_customer_requests%ROWTYPE;
  v_workflow public.store_workflow_settings%ROWTYPE;
  v_reservation public.reservations%ROWTYPE;
  v_token_hash text;
  v_serving_hours jsonb;
  v_local_date date;
  v_slots jsonb;
  v_now timestamptz := now();
BEGIN
  IF p_client_request_id IS NULL OR p_customer_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Không có quyền tạo hoặc xem yêu cầu đặt bàn này';
  END IF;
  v_token_hash := public.reservation_customer_token_hash(p_customer_token);
  SELECT * INTO v_request FROM public.reservation_customer_requests
  WHERE store_id = p_store_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.token_hash IS DISTINCT FROM v_token_hash THEN
    RAISE EXCEPTION 'Không có quyền tạo hoặc xem yêu cầu đặt bàn này';
  END IF;

  IF v_request.reservation_id IS NOT NULL THEN
    SELECT * INTO v_reservation FROM public.reservations
    WHERE id = v_request.reservation_id AND store_id = p_store_id
      AND customer_token_hash = v_token_hash;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không có quyền tạo hoặc xem yêu cầu đặt bàn này'; END IF;
    RETURN jsonb_build_object('created', false,
      'reservation', public.customer_reservation_json(v_reservation));
  END IF;
  IF v_request.expires_at <= v_now THEN RAISE EXCEPTION 'Yêu cầu chuẩn bị đã hết hạn; hãy tạo yêu cầu mới'; END IF;

  SELECT * INTO v_workflow FROM public.store_workflow_settings WHERE store_id = p_store_id FOR SHARE;
  IF NOT FOUND OR v_workflow.reservations_enabled IS NOT TRUE
     THEN
    RAISE EXCEPTION 'Quán chưa bật nhận đặt bàn';
  END IF;
  SELECT serving_hours INTO v_serving_hours FROM public.stores
  WHERE id = p_store_id AND is_active IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quán chưa bật nhận đặt bàn'; END IF;
  IF p_customer_name IS NULL OR length(btrim(p_customer_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Tên người đặt phải từ 1 đến 100 ký tự';
  END IF;
  IF p_customer_phone IS NULL OR length(btrim(p_customer_phone)) NOT BETWEEN 6 AND 20 THEN
    RAISE EXCEPTION 'Số điện thoại phải từ 6 đến 20 ký tự';
  END IF;
  IF p_party_size IS NULL OR p_party_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Số khách phải từ 1 đến 100';
  END IF;
  IF p_note IS NOT NULL AND length(btrim(p_note)) > 1000 THEN
    RAISE EXCEPTION 'Ghi chú không được vượt quá 1000 ký tự';
  END IF;
  IF p_arrival_at IS NULL OR p_arrival_at < v_now + make_interval(mins => v_workflow.minimum_advance_minutes) THEN
    RAISE EXCEPTION 'Chỉ nhận đặt bàn trước ít nhất % phút', v_workflow.minimum_advance_minutes;
  END IF;
  v_local_date := (p_arrival_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  IF v_local_date < (v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
     OR v_local_date >= (v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + v_workflow.booking_horizon_days THEN
    RAISE EXCEPTION 'Chỉ nhận đặt bàn trong % ngày tới', v_workflow.booking_horizon_days;
  END IF;
  v_slots := public.reservation_slots_for_hours(v_serving_hours, v_local_date,
    v_workflow.slot_interval_minutes, v_now + make_interval(mins => v_workflow.minimum_advance_minutes));
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_slots) slot
    WHERE (slot->>'arrival_at')::timestamptz = p_arrival_at) THEN
    RAISE EXCEPTION 'Giờ đến phải nằm trong khung giờ phục vụ và theo bước % phút', v_workflow.slot_interval_minutes;
  END IF;

  INSERT INTO public.reservations(
    store_id, customer_name, customer_phone, zalo_user_id, party_size, arrival_at,
    note, client_request_id, customer_token_hash,
    minimum_advance_minutes, booking_horizon_days, slot_interval_minutes,
    default_table_capacity, planning_hold_minutes, reservation_preorder_edit_cutoff_minutes,
    serving_hours_snapshot
  ) SELECT
    p_store_id, btrim(p_customer_name), btrim(p_customer_phone), p_zalo_user_id,
    p_party_size, p_arrival_at, NULLIF(btrim(COALESCE(p_note, '')), ''),
    p_client_request_id, v_token_hash,
    v_workflow.minimum_advance_minutes, v_workflow.booking_horizon_days,
    v_workflow.slot_interval_minutes, v_workflow.default_table_capacity,
    v_workflow.planning_hold_minutes, v_workflow.reservation_preorder_edit_cutoff_minutes,
    v_serving_hours
  RETURNING * INTO v_reservation;

  UPDATE public.reservation_customer_requests SET reservation_id = v_reservation.id,
    consumed_at = v_now, expires_at = 'infinity'::timestamptz
  WHERE store_id = p_store_id AND client_request_id = p_client_request_id;
  PERFORM public.append_reservation_event(v_reservation.id, p_store_id, NULL, 'customer', 'created',
    '{}'::jsonb, public.reservation_public_json(v_reservation), NULL);
  RETURN jsonb_build_object('created', true,
    'reservation', public.customer_reservation_json(v_reservation));
END;
$$;
REVOKE ALL ON FUNCTION public.create_customer_reservation(uuid, uuid, text, text, text, integer, timestamptz, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_reservation(uuid, uuid, text, text, text, integer, timestamptz, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_customer_reservation(
  p_reservation_id uuid,
  p_customer_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_reservation public.reservations%ROWTYPE;
BEGIN
  IF p_customer_token IS NULL OR p_customer_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Không có quyền xem đặt bàn này';
  END IF;
  SELECT * INTO v_reservation FROM public.reservations
  WHERE id = p_reservation_id
    AND customer_token_hash = public.reservation_customer_token_hash(p_customer_token);
  IF NOT FOUND THEN RAISE EXCEPTION 'Không có quyền xem đặt bàn này'; END IF;
  RETURN public.customer_reservation_json(v_reservation);
END;
$$;
REVOKE ALL ON FUNCTION public.get_customer_reservation(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_reservation(uuid, text) TO anon, authenticated;

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
  v_before jsonb;
  v_local_date date;
  v_minimum_at timestamptz;
  v_slots jsonb;
  v_now timestamptz := now();
BEGIN
  IF p_customer_token IS NULL OR p_customer_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Không có quyền đổi đặt bàn này';
  END IF;
  SELECT * INTO v_reservation FROM public.reservations
  WHERE id = p_reservation_id
    AND customer_token_hash = public.reservation_customer_token_hash(p_customer_token)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không có quyền đổi đặt bàn này'; END IF;
  IF v_reservation.status NOT IN ('pending', 'confirmed') OR v_reservation.arrival_at <= v_now THEN
    RAISE EXCEPTION 'Đặt bàn này không còn có thể yêu cầu đổi';
  END IF;
  IF v_reservation.requested_arrival_at IS NOT NULL THEN
    RAISE EXCEPTION 'Yêu cầu đổi đang chờ quán xác nhận';
  END IF;
  IF p_requested_party_size IS NULL OR p_requested_party_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Số khách phải từ 1 đến 100';
  END IF;
  IF p_change_note IS NOT NULL AND length(btrim(p_change_note)) > 1000 THEN
    RAISE EXCEPTION 'Ghi chú không được vượt quá 1000 ký tự';
  END IF;
  v_minimum_at := v_now + make_interval(mins => v_reservation.minimum_advance_minutes);
  IF p_requested_arrival_at IS NULL OR p_requested_arrival_at < v_minimum_at THEN
    RAISE EXCEPTION 'Giờ đổi phải trước ít nhất % phút', v_reservation.minimum_advance_minutes;
  END IF;
  v_local_date := (p_requested_arrival_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  IF v_local_date < (v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
     OR v_local_date >= (v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + v_reservation.booking_horizon_days THEN
    RAISE EXCEPTION 'Giờ đổi phải nằm trong % ngày tới', v_reservation.booking_horizon_days;
  END IF;
  v_slots := public.reservation_slots_for_hours(v_reservation.serving_hours_snapshot,
    v_local_date, v_reservation.slot_interval_minutes, v_minimum_at);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_slots) slot
    WHERE (slot->>'arrival_at')::timestamptz = p_requested_arrival_at) THEN
    RAISE EXCEPTION 'Giờ đổi phải nằm trong khung giờ phục vụ và theo bước % phút',
      v_reservation.slot_interval_minutes;
  END IF;
  v_before := public.customer_reservation_json(v_reservation);
  UPDATE public.reservations SET requested_arrival_at = p_requested_arrival_at,
    requested_party_size = p_requested_party_size,
    change_note = NULLIF(btrim(COALESCE(p_change_note, '')), ''), updated_at = v_now
  WHERE id = v_reservation.id RETURNING * INTO v_reservation;
  PERFORM public.append_reservation_event(v_reservation.id, v_reservation.store_id, NULL,
    'customer', 'change_requested', v_before,
    jsonb_build_object('requested_arrival_at', v_reservation.requested_arrival_at,
      'requested_party_size', v_reservation.requested_party_size), NULL);
  RETURN public.customer_reservation_json(v_reservation);
END;
$$;
REVOKE ALL ON FUNCTION public.request_reservation_change(uuid, text, timestamptz, integer, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_reservation_change(uuid, text, timestamptz, integer, text)
  TO anon, authenticated;

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
  IF p_customer_token IS NULL OR p_customer_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Không có quyền hủy đặt bàn này';
  END IF;
  SELECT * INTO v_reservation FROM public.reservations
  WHERE id = p_reservation_id
    AND customer_token_hash = public.reservation_customer_token_hash(p_customer_token)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không có quyền hủy đặt bàn này'; END IF;
  IF v_reservation.status NOT IN ('pending', 'confirmed') OR v_reservation.arrival_at <= now() THEN
    RAISE EXCEPTION 'Đặt bàn này không còn có thể hủy';
  END IF;
  IF p_reason IS NOT NULL AND length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'Lý do hủy không được vượt quá 500 ký tự';
  END IF;
  v_before_status := v_reservation.status;
  UPDATE public.reservations SET status = 'cancelled_by_customer',
    cancelled_at = now(), cancelled_by = NULL, updated_at = now()
  WHERE id = v_reservation.id RETURNING * INTO v_reservation;
  PERFORM public.append_reservation_event(v_reservation.id, v_reservation.store_id, NULL,
    'customer', 'cancelled_by_customer', jsonb_build_object('status', v_before_status),
    jsonb_build_object('status', v_reservation.status), NULLIF(btrim(COALESCE(p_reason, '')), ''));
  RETURN public.customer_reservation_json(v_reservation);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_customer_reservation(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_customer_reservation(uuid, text, text) TO anon, authenticated;

ALTER TABLE public.reservation_events DROP CONSTRAINT IF EXISTS reservation_events_event_type_check;
ALTER TABLE public.reservation_events ADD CONSTRAINT reservation_events_event_type_check CHECK (event_type IN (
  'created', 'confirmed', 'rejected', 'change_requested', 'change_accepted', 'change_rejected',
  'cancelled_by_customer', 'cancelled_by_store', 'arrived', 'completed', 'no_show',
  'manual_created', 'reminder_snoozed', 'rescheduled_by_store', 'customer_access_revoked'
));

CREATE OR REPLACE FUNCTION public.revoke_reservation_customer_access(
  p_reservation_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_actor_store uuid;
  v_actor_role text;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Cần ghi lý do thu hồi quyền (1–500 ký tự)';
  END IF;
  SELECT store_id, role INTO v_actor_store, v_actor_role FROM public.mevo_operators
  WHERE user_id = auth.uid() AND is_active IS TRUE;
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'store_owner'
     OR v_actor_store IS DISTINCT FROM v_reservation.store_id THEN
    RAISE EXCEPTION 'Chỉ chủ đúng quán mới được thu hồi quyền khách';
  END IF;
  PERFORM 1 FROM public.reservation_customer_requests
  WHERE reservation_id = v_reservation.id FOR UPDATE;
  UPDATE public.reservations SET customer_token_hash = encode(extensions.digest(encode(extensions.gen_random_bytes(32),'hex'),'sha256'),'hex'), updated_at = now()
  WHERE id = v_reservation.id RETURNING * INTO v_reservation;
  UPDATE public.reservation_customer_requests SET token_hash = NULL
  WHERE reservation_id = v_reservation.id;
  PERFORM public.append_reservation_event(v_reservation.id, v_reservation.store_id, auth.uid(), 'owner',
    'customer_access_revoked', '{}'::jsonb, jsonb_build_object('revoked', true), btrim(p_reason));
  RETURN jsonb_build_object('revoked', true, 'reservation_id', v_reservation.id);
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_reservation_customer_access(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_reservation_customer_access(uuid, text) TO authenticated;

-- RPC cũ replay theo UUID trả PII mà không cần token; không còn public entry point.
REVOKE ALL ON FUNCTION public.create_reservation(uuid, text, text, integer, timestamptz, text, text, uuid)
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
