-- 094 (PA-3, 2026-10-08): màu nhận diện KHU. Chỉ nhận diện, không phải trạng thái (5 màu, không trùng màu
-- trạng thái — quyết định 2026-10-02). pos_save_floor_layout chỉ upsert name/sort_order nên KHÔNG làm mất màu;
-- khu POS tạo mới lấy mặc định 'violet', chủ quán đổi ở tab Sơ đồ bàn & QR.
-- ⚠️ pos_get_floor_layout vá tại chỗ (đọc bản đang chạy → replace → EXECUTE), như mig 093.

ALTER TABLE public.table_areas ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT 'violet';
ALTER TABLE public.table_areas DROP CONSTRAINT IF EXISTS table_areas_color_check;
ALTER TABLE public.table_areas ADD CONSTRAINT table_areas_color_check
  CHECK (color IN ('violet', 'indigo', 'purple', 'fuchsia', 'pink'));

-- Khu đang có: gán màu lần lượt theo thứ tự trong quán để hai khu cạnh nhau không trùng màu.
UPDATE public.table_areas a
SET color = (ARRAY['violet', 'indigo', 'purple', 'fuchsia', 'pink'])[((r.rn - 1) % 5) + 1]
FROM (
  SELECT id, row_number() OVER (PARTITION BY store_id ORDER BY sort_order, id) AS rn
  FROM public.table_areas
) r
WHERE r.id = a.id;

CREATE OR REPLACE FUNCTION pg_temp.mevo_patch(p_sig text, p_from text, p_to text)
RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef(p_sig::regprocedure);
  IF position(p_from IN v_def) = 0 THEN
    RAISE EXCEPTION 'mig 094: % không còn chuỗi cần vá: %', p_sig, p_from;
  END IF;
  EXECUTE replace(v_def, p_from, p_to);
END
$patch$;

SELECT pg_temp.mevo_patch('public.pos_get_floor_layout()',
  $$jsonb_build_object('id', a.id, 'name', a.name)$$,
  $$jsonb_build_object('id', a.id, 'name', a.name, 'color', a.color)$$);
