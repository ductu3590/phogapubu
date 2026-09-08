-- Khu vực + lưu nguyên sơ đồ POS trong một giao dịch, có kiểm tra phiên bản.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS table_layout_version integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.table_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (store_id, id)
);
ALTER TABLE public.table_areas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.table_areas FROM anon, authenticated;
GRANT SELECT ON public.table_areas TO authenticated;
DROP POLICY IF EXISTS owner_read_table_areas ON public.table_areas;
CREATE POLICY owner_read_table_areas ON public.table_areas FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.mevo_operators o
  WHERE o.user_id = auth.uid() AND o.store_id = table_areas.store_id
    AND o.role = 'store_owner' AND o.is_active = true
));
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS area_id uuid;
-- Khoá ghép ngăn gán bàn của quán này vào khu của quán khác, kể cả ghi ngoài POS.
ALTER TABLE public.tables DROP CONSTRAINT IF EXISTS tables_area_store_fk;
ALTER TABLE public.tables ADD CONSTRAINT tables_area_store_fk
  FOREIGN KEY (store_id, area_id) REFERENCES public.table_areas(store_id, id);
CREATE INDEX IF NOT EXISTS tables_area_idx ON public.tables(store_id, area_id);

-- Mọi đường ghi (kể cả màn quản lý bàn và tab POS cũ) đều làm bản nháp cũ hết hiệu lực.
CREATE OR REPLACE FUNCTION public.pos_bump_floor_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    UPDATE public.stores SET table_layout_version = table_layout_version + 1 WHERE id = OLD.store_id;
  END IF;
  IF TG_OP = 'INSERT' THEN
    UPDATE public.stores SET table_layout_version = table_layout_version + 1 WHERE id = NEW.store_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.store_id IS DISTINCT FROM OLD.store_id THEN
    UPDATE public.stores SET table_layout_version = table_layout_version + 1 WHERE id = NEW.store_id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.pos_bump_floor_version() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS pos_tables_changed ON public.tables;
CREATE TRIGGER pos_tables_changed AFTER INSERT OR DELETE OR UPDATE OF
  store_id, table_number, is_active, area_id, pos_x, pos_y ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.pos_bump_floor_version();
DROP TRIGGER IF EXISTS pos_areas_changed ON public.table_areas;
CREATE TRIGGER pos_areas_changed AFTER INSERT OR UPDATE OR DELETE ON public.table_areas
  FOR EACH ROW EXECUTE FUNCTION public.pos_bump_floor_version();

CREATE OR REPLACE FUNCTION public.pos_get_floor_layout()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store uuid; v_result jsonb;
BEGIN
  SELECT store_id INTO v_store FROM public.mevo_operators
  WHERE user_id = auth.uid() AND role = 'store_owner' AND is_active = true;
  IF v_store IS NULL THEN RAISE EXCEPTION 'Chỉ chủ quán được xem sơ đồ POS'; END IF;
  -- Một SELECT dùng cùng snapshot cho phiên bản, khu vực và bàn.
  SELECT jsonb_build_object(
    'version', s.table_layout_version,
    'areas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name)
      ORDER BY a.sort_order, a.id) FROM public.table_areas a WHERE a.store_id = s.id), '[]'::jsonb),
    'tables', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', t.id, 'table_number', t.table_number, 'area_id', t.area_id, 'pos_x', t.pos_x, 'pos_y', t.pos_y
    ) ORDER BY t.id) FROM public.tables t WHERE t.store_id = s.id AND t.is_active), '[]'::jsonb)
  ) INTO v_result FROM public.stores s WHERE s.id = v_store;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_save_floor_layout(p_version integer, p_areas jsonb, p_tables jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  -- Không nhận ID khu của quán khác và không cho mất khu đang tồn tại.
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
  -- Khoá bàn hiện tại để việc tắt/xoá bàn không chen vào giữa kiểm tra và ghi.
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
$$;
REVOKE ALL ON FUNCTION public.pos_get_floor_layout() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pos_save_floor_layout(integer, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_get_floor_layout() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_save_floor_layout(integer, jsonb, jsonb) TO authenticated;
DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['tables', 'table_areas', 'stores'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_table) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
