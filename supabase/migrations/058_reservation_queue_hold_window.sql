-- BL-2A regression: Admin Mobile phải dùng cùng khoảng giữ bàn với DB khi khóa UI.
-- Không đổi luật conflict ở server; chỉ đưa snapshot đã có tới queue owner.

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
        'suggested_table_count', ceil(r.party_size::numeric / r.default_table_capacity),
        'planning_hold_minutes', r.planning_hold_minutes
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

REVOKE ALL ON FUNCTION public.list_reservation_queue(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_reservation_queue(uuid, timestamptz, timestamptz)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
