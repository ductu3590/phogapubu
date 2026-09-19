-- BL-2A Task 1: queue vận hành đặt bàn, đổi lịch/bàn thủ công và Snooze nhắc đến giờ.
-- Reservation vẫn là source of truth; không tự no-show/hủy hoặc thay đổi kitchen/order.

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS reminder_snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_snoozed_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS reservations_store_status_arrival
  ON public.reservations(store_id, status, arrival_at);

-- Danh sách event cũ được giữ nguyên; hai event mới phân biệt rõ thay đổi chủ động của quán
-- với yêu cầu đổi từ khách và với việc trì hoãn nhắc.
ALTER TABLE public.reservation_events
  DROP CONSTRAINT IF EXISTS reservation_events_event_type_check;

ALTER TABLE public.reservation_events
  ADD CONSTRAINT reservation_events_event_type_check
  CHECK (event_type IN (
    'created', 'confirmed', 'rejected', 'change_requested', 'change_accepted',
    'change_rejected', 'cancelled_by_customer', 'cancelled_by_store', 'arrived',
    'completed', 'no_show', 'manual_created', 'reminder_snoozed', 'rescheduled_by_store'
  ));

CREATE OR REPLACE FUNCTION public.reservation_snooze_json(
  p_reservation public.reservations
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'reminder_snoozed_until', p_reservation.reminder_snoozed_until,
    'reminder_snoozed_by', p_reservation.reminder_snoozed_by
  );
$$;

REVOKE ALL ON FUNCTION public.reservation_snooze_json(public.reservations)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_reservation_queue(
  p_store_id uuid,
  p_recent_since timestamptz,
  p_future_until timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.reservation_operator_actor_kind(p_store_id);
  IF p_recent_since IS NULL OR p_future_until IS NULL OR p_future_until <= p_recent_since THEN
    RAISE EXCEPTION 'Khoảng thời gian hàng đợi đặt bàn không hợp lệ';
  END IF;

  SELECT COALESCE(jsonb_agg(
    public.reservation_public_json(r)
      || public.reservation_active_table_summary(r.id)
      || public.reservation_snooze_json(r)
      || jsonb_build_object(
        'suggested_table_count', ceil(r.party_size::numeric / r.default_table_capacity)
      )
    ORDER BY
      CASE
        WHEN r.status = 'pending' THEN 0
        WHEN r.status = 'change_requested' THEN 1
        WHEN r.status = 'confirmed' AND r.arrival_at <= now() THEN 2
        WHEN r.status = 'confirmed' THEN 3
        WHEN r.status = 'arrived' THEN 4
        ELSE 5
      END,
      r.arrival_at,
      r.created_at
  ), '[]'::jsonb)
  INTO v_result
  FROM public.reservations r
  WHERE r.store_id = p_store_id
    AND (
      r.status IN ('pending', 'change_requested', 'confirmed', 'arrived')
      OR (r.updated_at >= p_recent_since AND r.arrival_at < p_future_until)
    );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_reservation(
  p_reservation_id uuid,
  p_arrival_at timestamptz,
  p_party_size integer,
  p_table_ids uuid[] DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_updated public.reservations%ROWTYPE;
  v_actor_kind text;
  v_before jsonb;
  v_tables jsonb;
  v_note text;
BEGIN
  SELECT * INTO v_reservation
  FROM public.reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đặt bàn';
  END IF;
  v_actor_kind := public.reservation_operator_actor_kind(v_reservation.store_id);

  IF v_reservation.status NOT IN ('pending', 'confirmed', 'change_requested')
     OR v_reservation.session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Chỉ đổi được đặt bàn chưa nhận khách';
  END IF;
  IF p_arrival_at IS NULL THEN
    RAISE EXCEPTION 'Cần chọn giờ đến mới';
  END IF;
  IF p_party_size IS NULL OR p_party_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Số khách phải từ 1 đến 100';
  END IF;
  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'Cần ghi lý do đổi đặt bàn';
  END IF;

  v_before := public.reservation_public_json(v_reservation)
    || public.reservation_active_table_summary(v_reservation.id)
    || public.reservation_snooze_json(v_reservation);

  -- Pending chưa được giữ bàn: chủ quán có thể sửa thông tin rồi duyệt bình thường sau đó.
  -- Booking đã xác nhận/yêu cầu đổi phải chọn bàn và đi qua helper có khóa/conflict của BL-1.
  IF v_reservation.status IN ('confirmed', 'change_requested') THEN
    v_tables := public.assign_reservation_tables(
      v_reservation.id,
      v_reservation.store_id,
      p_arrival_at,
      v_reservation.planning_hold_minutes,
      p_table_ids,
      auth.uid()
    );
  ELSE
    IF COALESCE(cardinality(p_table_ids), 0) > 0 THEN
      RAISE EXCEPTION 'Chỉ chọn bàn khi xác nhận đặt bàn';
    END IF;
    v_tables := public.reservation_active_table_summary(v_reservation.id);
  END IF;

  UPDATE public.reservations
  SET arrival_at = p_arrival_at,
      party_size = p_party_size,
      status = CASE WHEN v_reservation.status = 'change_requested' THEN 'confirmed' ELSE v_reservation.status END,
      requested_arrival_at = NULL,
      requested_party_size = NULL,
      change_note = NULL,
      reminder_snoozed_until = NULL,
      reminder_snoozed_by = NULL,
      updated_at = now()
  WHERE id = v_reservation.id
  RETURNING * INTO v_updated;

  PERFORM public.append_reservation_event(
    v_updated.id,
    v_updated.store_id,
    auth.uid(),
    v_actor_kind,
    'rescheduled_by_store',
    v_before,
    public.reservation_public_json(v_updated)
      || v_tables
      || public.reservation_snooze_json(v_updated),
    v_note
  );

  RETURN public.reservation_public_json(v_updated)
    || v_tables
    || public.reservation_snooze_json(v_updated)
    || jsonb_build_object(
      'suggested_table_count', ceil(v_updated.party_size::numeric / v_updated.default_table_capacity)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.snooze_reservation_reminders(
  p_reservation_ids uuid[],
  p_minutes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_reservation public.reservations%ROWTYPE;
  v_updated public.reservations%ROWTYPE;
  v_actor_kind text;
  v_count integer := 0;
  v_until timestamptz;
BEGIN
  IF p_minutes NOT IN (10, 15, 30) THEN
    RAISE EXCEPTION 'Chỉ được Snooze 10, 15 hoặc 30 phút';
  END IF;
  IF p_reservation_ids IS NULL OR cardinality(p_reservation_ids) = 0 THEN
    RAISE EXCEPTION 'Chưa chọn đặt bàn cần Snooze';
  END IF;

  SELECT array_agg(reservation_id ORDER BY reservation_id)
  INTO v_ids
  FROM (SELECT DISTINCT unnest(p_reservation_ids) AS reservation_id) AS distinct_ids;
  IF cardinality(v_ids) <> cardinality(p_reservation_ids) THEN
    RAISE EXCEPTION 'Không được chọn trùng đặt bàn';
  END IF;

  v_until := now() + make_interval(mins => p_minutes);
  FOR v_reservation IN
    SELECT *
    FROM public.reservations
    WHERE id = ANY(v_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    v_actor_kind := public.reservation_operator_actor_kind(v_reservation.store_id);
    IF v_reservation.status <> 'confirmed' THEN
      RAISE EXCEPTION 'Chỉ Snooze được đặt bàn đã xác nhận';
    END IF;

    UPDATE public.reservations
    SET reminder_snoozed_until = v_until,
        reminder_snoozed_by = auth.uid(),
        updated_at = now()
    WHERE id = v_reservation.id
    RETURNING * INTO v_updated;

    PERFORM public.append_reservation_event(
      v_updated.id,
      v_updated.store_id,
      auth.uid(),
      v_actor_kind,
      'reminder_snoozed',
      public.reservation_public_json(v_reservation) || public.reservation_snooze_json(v_reservation),
      public.reservation_public_json(v_updated) || public.reservation_snooze_json(v_updated),
      format('Snooze %s phút', p_minutes)
    );
    v_count := v_count + 1;
  END LOOP;

  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Không tìm thấy đặt bàn cần Snooze';
  END IF;

  RETURN jsonb_build_object('updated_count', v_count, 'reminder_snoozed_until', v_until);
END;
$$;

REVOKE ALL ON FUNCTION public.list_reservation_queue(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_reservation(uuid, timestamptz, integer, uuid[], text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.snooze_reservation_reminders(uuid[], integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_reservation_queue(uuid, timestamptz, timestamptz)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_reservation(uuid, timestamptz, integer, uuid[], text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.snooze_reservation_reminders(uuid[], integer)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
