CREATE OR REPLACE FUNCTION public.pos_save_floor_layout(p_version integer, p_areas jsonb, p_tables jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_store uuid; v_version integer; v_count integer;
BEGIN
  SELECT store_id INTO v_store FROM public.mevo_operators
  WHERE user_id = auth.uid() AND role = 'store_owner' AND is_active = true;
  IF v_store IS NULL THEN RAISE EXCEPTION 'Chỉ chủ quán được sửa sơ đồ POS'; END IF;
  SELECT table_layout_version INTO v_version FROM public.stores WHERE id = v_store FOR UPDATE;
  IF p_version IS DISTINCT FROM v_version THEN
    RAISE EXCEPTION 'Sơ đồ đã được máy khác thay đổi. Hãy tải lại sơ đồ trước khi sửa tiếp.';
  END IF;
  IF jsonb_typeof(p_areas) IS DISTINCT FROM 'array' OR jsonb_typeof(p_tables) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Dữ liệu sơ đồ không hợp lệ';
  END IF;
  IF jsonb_array_length(p_areas) > 100 OR jsonb_array_length(p_tables) > 2400 THEN
    RAISE EXCEPTION 'Sơ đồ vượt giới hạn 100 khu vực hoặc 2400 bàn';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_areas) AS a(id uuid, name text)
    WHERE a.id IS NULL OR a.name IS NULL OR length(btrim(a.name)) NOT BETWEEN 1 AND 60)
    OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p_areas) AS a(id uuid) GROUP BY id HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p_areas) AS a(name text) GROUP BY lower(btrim(name)) HAVING count(*) > 1)
  THEN RAISE EXCEPTION 'Tên khu vực phải có 1–60 ký tự và không trùng nhau'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_areas) AS a(id uuid)
    JOIN public.table_areas old ON old.id = a.id WHERE old.store_id <> v_store)
    OR EXISTS (SELECT 1 FROM public.table_areas old WHERE old.store_id = v_store
      AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_areas) AS a(id uuid) WHERE a.id = old.id))
  THEN RAISE EXCEPTION 'Danh sách khu vực đã thay đổi hoặc không thuộc quán'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_tables) AS t(id uuid, area_id uuid, pos_x numeric, pos_y numeric)
    WHERE t.id IS NULL OR t.pos_x IS NULL OR t.pos_y IS NULL
      OR t.pos_x <> trunc(t.pos_x) OR t.pos_y <> trunc(t.pos_y)
      OR t.pos_x NOT BETWEEN 0 AND 11 OR t.pos_y NOT BETWEEN 0 AND 199
      OR (t.area_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_areas) AS a(id uuid) WHERE a.id = t.area_id)))
    OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p_tables) AS t(id uuid) GROUP BY id HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p_tables) AS t(area_id uuid, pos_x numeric, pos_y numeric)
      GROUP BY area_id, pos_x, pos_y HAVING count(*) > 1)
  THEN RAISE EXCEPTION 'Vị trí bàn không hợp lệ hoặc có hai bàn chồng nhau'; END IF;
  PERFORM id FROM public.tables WHERE store_id = v_store AND is_active FOR UPDATE;
  SELECT count(*) INTO v_count FROM public.tables WHERE store_id = v_store AND is_active;
  IF v_count <> jsonb_array_length(p_tables) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_tables) AS t(id uuid)
    WHERE NOT EXISTS (SELECT 1 FROM public.tables old WHERE old.id = t.id AND old.store_id = v_store AND old.is_active)
  ) THEN RAISE EXCEPTION 'Danh sách bàn đã thay đổi. Hãy tải lại sơ đồ.'; END IF;
  INSERT INTO public.table_areas(id, store_id, name, sort_order)
  SELECT (a.value->>'id')::uuid, v_store, btrim(a.value->>'name'), a.ordinality::integer
  FROM jsonb_array_elements(p_areas) WITH ORDINALITY AS a(value, ordinality)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order
  WHERE table_areas.store_id = v_store;
  UPDATE public.tables old SET area_id = t.area_id, pos_x = t.pos_x, pos_y = t.pos_y
  FROM jsonb_to_recordset(p_tables) AS t(id uuid, area_id uuid, pos_x smallint, pos_y smallint)
  WHERE old.id = t.id AND old.store_id = v_store AND old.is_active;
  UPDATE public.stores SET table_layout_version = table_layout_version + 1 WHERE id = v_store;
  RETURN public.pos_get_floor_layout();
END;
$function$
