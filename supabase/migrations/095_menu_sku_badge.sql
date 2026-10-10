-- 095 (PA-4, 2026-10-08): mã món (SKU) tự sinh theo tiền tố danh mục + nhãn món.
-- ⚠️ public.menu_sku_prefix PHẢI khớp admin-web/lib/menu/sku.ts skuPrefixFromName (đã đối chiếu dữ liệu thật).
-- Trigger chỉ sinh khi cột để TRỐNG → mã gõ tay được giữ; đổi danh mục KHÔNG đổi mã cũ.
-- Backfill chạy MỘT lần; chạy lại file sẽ không ghi đè (chỉ điền chỗ còn NULL).

ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS sku_prefix text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS badge text;

ALTER TABLE public.menu_categories DROP CONSTRAINT IF EXISTS menu_categories_sku_prefix_check;
ALTER TABLE public.menu_categories ADD CONSTRAINT menu_categories_sku_prefix_check
  CHECK (sku_prefix IS NULL OR sku_prefix ~ '^[A-Z0-9]{1,6}$');
ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_sku_check;
ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_sku_check
  CHECK (sku IS NULL OR sku ~ '^[A-Z0-9][A-Z0-9-]{0,19}$');
ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_badge_check;
ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_badge_check
  CHECK (badge IS NULL OR badge IN ('best_seller', 'signature'));

CREATE OR REPLACE FUNCTION public.menu_sku_prefix(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(NULLIF(left(upper(string_agg(left(w, 1), '' ORDER BY ord)), 4), ''), 'MON')
  FROM regexp_split_to_table(
         translate(lower(normalize(COALESCE(p_name, ''), NFC)),
           'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
           'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'),
         '[^a-z0-9]+') WITH ORDINALITY AS t(w, ord)
  WHERE w <> '';
$function$;

-- Tiền tố duy nhất trong quán: base, base2, base3… (tổng ≤ 6 ký tự) — khớp uniquePrefix (sku.ts).
CREATE OR REPLACE FUNCTION public.menu_unique_sku_prefix(p_store_id uuid, p_base text, p_self uuid)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE v_candidate text := p_base; v_n integer := 2;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.menu_categories
                WHERE store_id = p_store_id AND sku_prefix = v_candidate AND id IS DISTINCT FROM p_self) LOOP
    v_candidate := left(p_base, 6 - length(v_n::text)) || v_n::text;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_candidate;
END;
$function$;

CREATE OR REPLACE FUNCTION public.menu_categories_sku_prefix_fill()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.sku_prefix IS NULL THEN
    NEW.sku_prefix := public.menu_unique_sku_prefix(NEW.store_id, public.menu_sku_prefix(NEW.name), NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.menu_items_sku_fill()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE v_prefix text; v_next integer;
BEGIN
  IF NEW.sku IS NOT NULL THEN RETURN NEW; END IF;
  SELECT sku_prefix INTO v_prefix FROM public.menu_categories WHERE id = NEW.category_id;
  v_prefix := COALESCE(v_prefix, 'MON');
  -- Khoá theo quán+tiền tố để hai món thêm cùng lúc không lấy cùng số.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.store_id::text || ':' || v_prefix));
  SELECT COALESCE(MAX((substring(sku FROM '^' || v_prefix || '-(\d+)$'))::integer), 0) + 1 INTO v_next
  FROM public.menu_items WHERE store_id = NEW.store_id AND sku ~ ('^' || v_prefix || '-\d+$');
  NEW.sku := v_prefix || '-' || lpad(v_next::text, 3, '0');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS menu_categories_sku_prefix_bi ON public.menu_categories;
CREATE TRIGGER menu_categories_sku_prefix_bi BEFORE INSERT ON public.menu_categories
  FOR EACH ROW EXECUTE FUNCTION public.menu_categories_sku_prefix_fill();
DROP TRIGGER IF EXISTS menu_items_sku_bi ON public.menu_items;
CREATE TRIGGER menu_items_sku_bi BEFORE INSERT ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.menu_items_sku_fill();

-- Backfill: tiền tố theo thứ tự danh mục, rồi mã theo thứ tự món trong từng danh mục.
DO $backfill$
DECLARE r record; v_prefix text; v_next integer;
BEGIN
  FOR r IN SELECT id, store_id, name FROM public.menu_categories WHERE sku_prefix IS NULL ORDER BY store_id, sort_order, id LOOP
    UPDATE public.menu_categories
    SET sku_prefix = public.menu_unique_sku_prefix(r.store_id, public.menu_sku_prefix(r.name), r.id)
    WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT i.id, i.store_id, c.sku_prefix FROM public.menu_items i JOIN public.menu_categories c ON c.id = i.category_id
           WHERE i.sku IS NULL ORDER BY i.store_id, c.sort_order, i.sort_order, i.id LOOP
    v_prefix := COALESCE(r.sku_prefix, 'MON');
    SELECT COALESCE(MAX((substring(sku FROM '^' || v_prefix || '-(\d+)$'))::integer), 0) + 1 INTO v_next
    FROM public.menu_items WHERE store_id = r.store_id AND sku ~ ('^' || v_prefix || '-\d+$');
    UPDATE public.menu_items SET sku = v_prefix || '-' || lpad(v_next::text, 3, '0') WHERE id = r.id;
  END LOOP;
END
$backfill$;

CREATE UNIQUE INDEX IF NOT EXISTS menu_categories_store_sku_prefix_uq ON public.menu_categories(store_id, sku_prefix) WHERE sku_prefix IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS menu_items_store_sku_uq ON public.menu_items(store_id, sku) WHERE sku IS NOT NULL;
