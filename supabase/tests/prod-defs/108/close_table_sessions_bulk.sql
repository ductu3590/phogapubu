CREATE OR REPLACE FUNCTION public.close_table_sessions_bulk(p_session_ids uuid[], p_reason text, p_instrument text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
