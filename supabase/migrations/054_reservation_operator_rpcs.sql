-- BL-1 Task 3: thao tác đặt bàn của chủ quán/MEVO và phân bổ bàn nguyên tử.

ALTER TABLE public.reservation_tables
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS release_reason text;

CREATE OR REPLACE FUNCTION public.reservation_operator_actor_kind(p_store_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_operator_store uuid;
BEGIN
  SELECT role, store_id INTO v_role, v_operator_store
  FROM public.mevo_operators
  WHERE user_id = auth.uid() AND is_active IS TRUE;

  IF v_role = 'mevo_superadmin' THEN RETURN 'mevo'; END IF;
  IF v_role = 'store_owner' AND v_operator_store = p_store_id THEN RETURN 'owner'; END IF;
  IF v_role = 'store_staff' AND v_operator_store = p_store_id THEN
    RAISE EXCEPTION 'Chỉ chủ quán mới được quản lý đặt bàn';
  END IF;
  RAISE EXCEPTION 'Không có quyền quản lý đặt bàn của quán này';
END;
$$;

REVOKE ALL ON FUNCTION public.reservation_operator_actor_kind(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reservation_active_table_summary(p_reservation_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'table_ids', COALESCE(jsonb_agg(t.id ORDER BY t.table_number), '[]'::jsonb),
    'table_numbers', COALESCE(jsonb_agg(t.table_number ORDER BY t.table_number), '[]'::jsonb)
  )
  FROM public.reservation_tables rt
  JOIN public.tables t ON t.id = rt.table_id AND t.store_id = rt.store_id
  WHERE rt.reservation_id = p_reservation_id
    AND rt.released_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.reservation_active_table_summary(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assign_reservation_tables(
  p_reservation_id uuid,
  p_store_id uuid,
  p_arrival_at timestamptz,
  p_planning_hold_minutes integer,
  p_table_ids uuid[],
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sorted_table_ids uuid[];
  v_table_id uuid;
  v_valid_count integer;
  v_hold_ends_at timestamptz := p_arrival_at + make_interval(mins => p_planning_hold_minutes);
BEGIN
  IF p_table_ids IS NULL OR cardinality(p_table_ids) = 0 THEN
    RAISE EXCEPTION 'Cần chọn ít nhất một bàn';
  END IF;

  SELECT array_agg(id ORDER BY id) INTO v_sorted_table_ids
  FROM (SELECT DISTINCT unnest(p_table_ids) AS id) AS unique_table_ids;
  IF cardinality(v_sorted_table_ids) <> cardinality(p_table_ids) THEN
    RAISE EXCEPTION 'Không được chọn trùng bàn';
  END IF;

  SELECT count(*) INTO v_valid_count
  FROM public.tables
  WHERE id = ANY(v_sorted_table_ids)
    AND store_id = p_store_id
    AND is_active IS TRUE;
  IF v_valid_count <> cardinality(v_sorted_table_ids) THEN
    RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động';
  END IF;

  -- Khóa từng bàn theo cùng thứ tự trước khi kiểm conflict. Đây là serialization point
  -- cho hai thao tác xác nhận cùng lúc trên một bàn.
  FOREACH v_table_id IN ARRAY v_sorted_table_ids LOOP
    PERFORM 1 FROM public.tables WHERE id = v_table_id FOR UPDATE;
    IF public.open_session_id_for_table(v_table_id) IS NOT NULL THEN
      RAISE EXCEPTION 'Bàn đang có khách, hãy chọn bàn khác';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.reservation_tables rt
      JOIN public.reservations r ON r.id = rt.reservation_id
      WHERE rt.store_id = p_store_id
        AND rt.table_id = v_table_id
        AND rt.released_at IS NULL
        AND r.status = 'confirmed'
        AND rt.hold_starts_at < v_hold_ends_at
        AND rt.hold_ends_at > p_arrival_at
        AND r.id <> p_reservation_id
    ) THEN
      RAISE EXCEPTION 'Bàn đã được giữ cho đặt bàn khác trong khung giờ này';
    END IF;
  END LOOP;

  -- Không xóa dấu vết phân bổ cũ khi duyệt yêu cầu đổi bàn/giờ.
  UPDATE public.reservation_tables
  SET released_at = now(), released_by = p_actor_id, release_reason = 'reservation_change'
  WHERE reservation_id = p_reservation_id AND released_at IS NULL;

  INSERT INTO public.reservation_tables(
    reservation_id, store_id, table_id, hold_starts_at, hold_ends_at, assigned_by
  )
  SELECT p_reservation_id, p_store_id, table_id, p_arrival_at, v_hold_ends_at, p_actor_id
  FROM unnest(v_sorted_table_ids) AS selected(table_id)
  ON CONFLICT (reservation_id, table_id) DO UPDATE
  SET store_id = EXCLUDED.store_id,
      hold_starts_at = EXCLUDED.hold_starts_at,
      hold_ends_at = EXCLUDED.hold_ends_at,
      assigned_at = now(),
      assigned_by = EXCLUDED.assigned_by,
      released_at = NULL,
      released_by = NULL,
      release_reason = NULL;

  RETURN public.reservation_active_table_summary(p_reservation_id);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_reservation_tables(uuid, uuid, timestamptz, integer, uuid[], uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_manual_reservation(
  p_store_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_kind text;
  v_workflow public.store_workflow_settings%ROWTYPE;
  v_reservation public.reservations%ROWTYPE;
  v_arrival_at timestamptz;
  v_name text;
  v_phone text;
  v_party_size integer;
  v_reason text;
  v_token text;
BEGIN
  v_actor_kind := public.reservation_operator_actor_kind(p_store_id);
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Dữ liệu đặt bàn thủ công không hợp lệ';
  END IF;
  SELECT * INTO v_workflow FROM public.store_workflow_settings WHERE store_id = p_store_id;
  IF NOT FOUND OR v_workflow.reservations_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'Quán chưa bật nhận đặt bàn';
  END IF;

  v_name := NULLIF(btrim(p_payload->>'customer_name'), '');
  v_phone := NULLIF(btrim(p_payload->>'customer_phone'), '');
  v_party_size := (p_payload->>'party_size')::integer;
  v_arrival_at := (p_payload->>'arrival_at')::timestamptz;
  v_reason := NULLIF(btrim(p_payload->>'reason'), '');
  IF v_name IS NULL OR v_phone IS NULL OR v_party_size NOT BETWEEN 1 AND 100 OR v_arrival_at IS NULL THEN
    RAISE EXCEPTION 'Thiếu thông tin đặt bàn thủ công';
  END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Cần ghi lý do tạo đặt bàn thủ công'; END IF;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.reservations(
    store_id, customer_name, customer_phone, zalo_user_id, party_size, arrival_at, note,
    client_request_id, customer_token_hash,
    minimum_advance_minutes, booking_horizon_days, slot_interval_minutes,
    default_table_capacity, planning_hold_minutes, reservation_preorder_edit_cutoff_minutes
  ) VALUES (
    p_store_id, v_name, v_phone, NULLIF(p_payload->>'zalo_user_id', ''), v_party_size,
    v_arrival_at, NULLIF(btrim(COALESCE(p_payload->>'note', '')), ''), gen_random_uuid(),
    public.reservation_customer_token_hash(v_token),
    v_workflow.minimum_advance_minutes, v_workflow.booking_horizon_days,
    v_workflow.slot_interval_minutes, v_workflow.default_table_capacity,
    v_workflow.planning_hold_minutes, v_workflow.reservation_preorder_edit_cutoff_minutes
  ) RETURNING * INTO v_reservation;
  PERFORM public.append_reservation_event(
    v_reservation.id, p_store_id, auth.uid(), v_actor_kind, 'manual_created',
    '{}'::jsonb, public.reservation_public_json(v_reservation), v_reason
  );
  RETURN public.reservation_public_json(v_reservation)
    || jsonb_build_object('suggested_table_count', ceil(v_reservation.party_size::numeric / v_reservation.default_table_capacity));
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_reservation(
  p_reservation_id uuid,
  p_table_ids uuid[],
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_actor_kind text;
  v_before jsonb;
  v_tables jsonb;
BEGIN
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đặt bàn'; END IF;
  v_actor_kind := public.reservation_operator_actor_kind(v_reservation.store_id);
  IF v_reservation.status = 'confirmed' THEN
    RETURN public.reservation_public_json(v_reservation)
      || public.reservation_active_table_summary(v_reservation.id)
      || jsonb_build_object('suggested_table_count', ceil(v_reservation.party_size::numeric / v_reservation.default_table_capacity), 'already', true);
  END IF;
  IF v_reservation.status <> 'pending' THEN
    RAISE EXCEPTION 'Chỉ xác nhận được đặt bàn đang chờ';
  END IF;

  v_before := public.reservation_public_json(v_reservation) || public.reservation_active_table_summary(v_reservation.id);
  v_tables := public.assign_reservation_tables(
    v_reservation.id, v_reservation.store_id, v_reservation.arrival_at,
    v_reservation.planning_hold_minutes, p_table_ids, auth.uid()
  );
  UPDATE public.reservations
  SET status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid(), updated_at = now()
  WHERE id = v_reservation.id
  RETURNING * INTO v_reservation;
  PERFORM public.append_reservation_event(
    v_reservation.id, v_reservation.store_id, auth.uid(), v_actor_kind, 'confirmed',
    v_before, public.reservation_public_json(v_reservation) || v_tables, NULLIF(btrim(COALESCE(p_note, '')), '')
  );
  RETURN public.reservation_public_json(v_reservation) || v_tables
    || jsonb_build_object('suggested_table_count', ceil(v_reservation.party_size::numeric / v_reservation.default_table_capacity), 'already', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_reservation(
  p_reservation_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_actor_kind text;
BEGIN
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đặt bàn'; END IF;
  v_actor_kind := public.reservation_operator_actor_kind(v_reservation.store_id);
  IF v_reservation.status <> 'pending' THEN RAISE EXCEPTION 'Chỉ từ chối được đặt bàn đang chờ'; END IF;
  UPDATE public.reservations
  SET status = 'rejected', rejected_at = now(), rejected_by = auth.uid(), updated_at = now()
  WHERE id = v_reservation.id RETURNING * INTO v_reservation;
  PERFORM public.append_reservation_event(
    v_reservation.id, v_reservation.store_id, auth.uid(), v_actor_kind, 'rejected',
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'rejected'),
    NULLIF(btrim(COALESCE(p_reason, '')), '')
  );
  RETURN public.reservation_public_json(v_reservation);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_reservation_change(
  p_reservation_id uuid,
  p_accept boolean,
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
  v_actor_kind text;
  v_before jsonb;
  v_tables jsonb;
BEGIN
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đặt bàn'; END IF;
  v_actor_kind := public.reservation_operator_actor_kind(v_reservation.store_id);
  IF v_reservation.status NOT IN ('pending', 'confirmed')
     OR v_reservation.requested_arrival_at IS NULL OR v_reservation.requested_party_size IS NULL THEN
    RAISE EXCEPTION 'Đặt bàn này không có yêu cầu đổi đang chờ';
  END IF;
  v_before := public.reservation_public_json(v_reservation) || public.reservation_active_table_summary(v_reservation.id);

  IF p_accept IS NOT TRUE THEN
    UPDATE public.reservations
    SET requested_arrival_at = NULL, requested_party_size = NULL, change_note = NULL, updated_at = now()
    WHERE id = v_reservation.id RETURNING * INTO v_reservation;
    PERFORM public.append_reservation_event(
      v_reservation.id, v_reservation.store_id, auth.uid(), v_actor_kind, 'change_rejected',
      v_before, public.reservation_public_json(v_reservation), NULLIF(btrim(COALESCE(p_note, '')), '')
    );
    RETURN public.reservation_public_json(v_reservation) || public.reservation_active_table_summary(v_reservation.id);
  END IF;

  v_tables := public.assign_reservation_tables(
    v_reservation.id, v_reservation.store_id, v_reservation.requested_arrival_at,
    v_reservation.planning_hold_minutes, p_table_ids, auth.uid()
  );
  UPDATE public.reservations
  SET arrival_at = v_reservation.requested_arrival_at,
      party_size = v_reservation.requested_party_size,
      requested_arrival_at = NULL, requested_party_size = NULL, change_note = NULL,
      status = 'confirmed', confirmed_at = COALESCE(confirmed_at, now()),
      confirmed_by = COALESCE(confirmed_by, auth.uid()), updated_at = now()
  WHERE id = v_reservation.id RETURNING * INTO v_reservation;
  PERFORM public.append_reservation_event(
    v_reservation.id, v_reservation.store_id, auth.uid(), v_actor_kind, 'change_accepted',
    v_before, public.reservation_public_json(v_reservation) || v_tables,
    NULLIF(btrim(COALESCE(p_note, '')), '')
  );
  RETURN public.reservation_public_json(v_reservation) || v_tables
    || jsonb_build_object('suggested_table_count', ceil(v_reservation.party_size::numeric / v_reservation.default_table_capacity));
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_reservation_no_show(
  p_reservation_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_actor_kind text;
BEGIN
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đặt bàn'; END IF;
  v_actor_kind := public.reservation_operator_actor_kind(v_reservation.store_id);
  IF v_reservation.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Chỉ đánh dấu no-show cho đặt bàn đã xác nhận';
  END IF;
  UPDATE public.reservations
  SET status = 'no_show', no_show_at = now(), no_show_by = auth.uid(), updated_at = now()
  WHERE id = v_reservation.id RETURNING * INTO v_reservation;
  PERFORM public.append_reservation_event(
    v_reservation.id, v_reservation.store_id, auth.uid(), v_actor_kind, 'no_show',
    jsonb_build_object('status', 'confirmed'), jsonb_build_object('status', 'no_show'),
    NULLIF(btrim(COALESCE(p_note, '')), '')
  );
  RETURN public.reservation_public_json(v_reservation) || public.reservation_active_table_summary(v_reservation.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_store_reservations(
  p_store_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
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
  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'Khoảng thời gian tìm đặt bàn không hợp lệ';
  END IF;
  SELECT COALESCE(jsonb_agg(
    public.reservation_public_json(r)
      || public.reservation_active_table_summary(r.id)
      || jsonb_build_object('suggested_table_count', ceil(r.party_size::numeric / r.default_table_capacity))
    ORDER BY r.arrival_at, r.created_at
  ), '[]'::jsonb)
  INTO v_result
  FROM public.reservations r
  WHERE r.store_id = p_store_id
    AND r.arrival_at >= p_starts_at
    AND r.arrival_at < p_ends_at;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_reservation(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_reservation(uuid, uuid[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_reservation(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_reservation_change(uuid, boolean, uuid[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_reservation_no_show(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_store_reservations(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_reservation(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_reservation(uuid, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_reservation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_reservation_change(uuid, boolean, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_reservation_no_show(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_store_reservations(uuid, timestamptz, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
