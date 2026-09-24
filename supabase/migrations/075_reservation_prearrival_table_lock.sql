-- Bảo Lương: ưu tiên bàn đã xác nhận từ 60 phút trước giờ khách đến.
-- Cùng một khoảng được DB dùng cho conflict, QR và hiển thị POS.

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
  v_hold_starts_at timestamptz := p_arrival_at - interval '60 minutes';
  v_hold_ends_at timestamptz := p_arrival_at + make_interval(mins => p_planning_hold_minutes);
BEGIN
  IF p_table_ids IS NULL OR cardinality(p_table_ids) = 0 THEN RAISE EXCEPTION 'Cần chọn ít nhất một bàn'; END IF;
  SELECT array_agg(id ORDER BY id) INTO v_sorted_table_ids FROM (SELECT DISTINCT unnest(p_table_ids) AS id) AS unique_table_ids;
  IF cardinality(v_sorted_table_ids) <> cardinality(p_table_ids) THEN RAISE EXCEPTION 'Không được chọn trùng bàn'; END IF;
  SELECT count(*) INTO v_valid_count FROM public.tables WHERE id = ANY(v_sorted_table_ids) AND store_id = p_store_id AND is_active IS TRUE;
  IF v_valid_count <> cardinality(v_sorted_table_ids) THEN RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động'; END IF;

  FOREACH v_table_id IN ARRAY v_sorted_table_ids LOOP
    PERFORM 1 FROM public.tables WHERE id = v_table_id FOR UPDATE;
    IF public.open_session_id_for_table(v_table_id) IS NOT NULL THEN RAISE EXCEPTION 'Bàn đang có khách, hãy chọn bàn khác'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.reservation_tables rt JOIN public.reservations r ON r.id = rt.reservation_id
      WHERE rt.store_id = p_store_id AND rt.table_id = v_table_id AND rt.released_at IS NULL
        AND r.status = 'confirmed' AND rt.hold_starts_at < v_hold_ends_at
        AND rt.hold_ends_at > v_hold_starts_at AND r.id <> p_reservation_id
    ) THEN RAISE EXCEPTION 'Bàn đã được giữ cho đặt bàn khác trong khung giờ này'; END IF;
  END LOOP;

  UPDATE public.reservation_tables SET released_at = now(), released_by = p_actor_id, release_reason = 'reservation_change'
  WHERE reservation_id = p_reservation_id AND released_at IS NULL;
  INSERT INTO public.reservation_tables(reservation_id, store_id, table_id, hold_starts_at, hold_ends_at, assigned_by)
  SELECT p_reservation_id, p_store_id, table_id, v_hold_starts_at, v_hold_ends_at, p_actor_id FROM unnest(v_sorted_table_ids) AS selected(table_id)
  ON CONFLICT (reservation_id, table_id) DO UPDATE SET store_id = EXCLUDED.store_id, hold_starts_at = EXCLUDED.hold_starts_at,
    hold_ends_at = EXCLUDED.hold_ends_at, assigned_at = now(), assigned_by = EXCLUDED.assigned_by, released_at = NULL, released_by = NULL, release_reason = NULL;
  RETURN public.reservation_active_table_summary(p_reservation_id);
END;
$$;
REVOKE ALL ON FUNCTION public.assign_reservation_tables(uuid, uuid, timestamptz, integer, uuid[], uuid) FROM PUBLIC, anon, authenticated;

-- Booking đã xác nhận trước khi nâng cấp cũng phải được khóa đúng chính sách mới.
UPDATE public.reservation_tables rt
SET hold_starts_at = r.arrival_at - interval '60 minutes'
FROM public.reservations r
WHERE r.id = rt.reservation_id AND r.status = 'confirmed' AND rt.released_at IS NULL;

CREATE OR REPLACE FUNCTION public.list_prearrival_reserved_table_ids(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reservation_operator_actor_kind(p_store_id);
  IF NOT public.is_store_owner_of(p_store_id) THEN RAISE EXCEPTION 'Chỉ chủ quán được xem bàn đang giữ'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(rt.table_id ORDER BY rt.table_id)
    FROM public.reservation_tables rt JOIN public.reservations r ON r.id = rt.reservation_id
    WHERE rt.store_id = p_store_id AND rt.released_at IS NULL AND r.status = 'confirmed' AND r.session_id IS NULL
      AND r.arrival_at - interval '60 minutes' <= now() AND rt.hold_ends_at > now()), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.list_prearrival_reserved_table_ids(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_prearrival_reserved_table_ids(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
