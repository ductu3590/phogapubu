CREATE OR REPLACE FUNCTION public.pos_get_floor_layout()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_store uuid; v_result jsonb;
BEGIN
  SELECT store_id INTO v_store FROM public.mevo_operators
  WHERE user_id = auth.uid() AND role IN ('store_owner', 'store_cashier') AND is_active = true;
  IF v_store IS NULL THEN RAISE EXCEPTION 'Chỉ chủ quán được xem sơ đồ POS'; END IF;
  SELECT jsonb_build_object(
    'version', s.table_layout_version,
    'areas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'color', a.color)
      ORDER BY a.sort_order, a.id) FROM public.table_areas a WHERE a.store_id = s.id), '[]'::jsonb),
    'tables', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', t.id, 'table_number', t.table_number, 'area_id', t.area_id, 'pos_x', t.pos_x, 'pos_y', t.pos_y
    ) ORDER BY t.id) FROM public.tables t WHERE t.store_id = s.id AND t.is_active), '[]'::jsonb)
  ) INTO v_result FROM public.stores s WHERE s.id = v_store;
  RETURN v_result;
END;
$function$
