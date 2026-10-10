-- 096 (PA-4 vá review, 2026-10-08): mã món tự sinh không được tràn số.
-- Trước: chủ quán gõ tay mã kiểu "DU-99999999999" (hợp lệ theo CHECK ≤ 20 ký tự) → (substring)::integer tràn
-- → MỌI món mới để trống mã trong danh mục tiền tố DU đều lỗi "integer out of range", không thêm được món.
-- Sau: chỉ tính các mã có đuôi 1–6 chữ số (mẫu tự sinh PREFIX-001…999999); mã tay số khổng lồ bị bỏ qua.
-- Thay hàm do chính mig 095 tạo (cùng đợt PA-4), thân hàm ở đây là bản đầy đủ mới nhất.

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
  SELECT COALESCE(MAX((substring(sku FROM '^' || v_prefix || '-(\d{1,6})$'))::integer), 0) + 1 INTO v_next
  FROM public.menu_items WHERE store_id = NEW.store_id AND sku ~ ('^' || v_prefix || '-\d{1,6}$');
  NEW.sku := v_prefix || '-' || lpad(v_next::text, 3, '0');
  RETURN NEW;
END;
$function$;
