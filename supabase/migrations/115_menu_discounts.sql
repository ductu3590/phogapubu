-- 115_menu_discounts.sql — Giảm giá theo món / theo danh mục, có lịch (MD-1).
-- Spec: docs/superpowers/specs/2026-11-09-menu-discount-design.md
--
-- 1) menu_categories thêm UNIQUE (id, store_id) để bảng mới ràng FK ghép theo quán (như menu_items).
-- 2) Bảng menu_discounts: một chương trình gắn ĐÚNG MỘT món hoặc MỘT danh mục, kiểu % hoặc VNĐ, lịch tuỳ chọn
--    (khoảng ngày, khung giờ có thể qua nửa đêm, ngày trong tuần). RLS chỉ cho operator đúng quán ĐỌC;
--    ghi qua server action dùng service role (tự kiểm chủ quán + món/danh mục thuộc quán).
-- 3) order_items thêm item_original_price (giá trước giảm, NULL nếu không giảm) + menu_discount_id.
-- 4) Hàm nội bộ menu_discount_is_active / menu_discount_amount / menu_item_discounted_price.
--    Quy tắc: món thắng danh mục; cùng cấp lấy mức giảm cao nhất; không cộng dồn; % làm tròn nửa lên tới đồng;
--    không bao giờ xuống dưới 0. Công thức TS: admin-web/lib/menu/menu-discount.ts và
--    mini-app/src/utils/menu-discount.ts — đổi một bên phải đổi cả ba.
-- 5) RPC công khai get_active_menu_discounts(store_id) để Mini App / POS / màn nhân viên vẽ giá gạch.
-- 6) Vá TẠI CHỖ create_order, staff_create_order, add_order_line: trừ giảm giá món lúc tạo đơn + ghi 2 cột mới.
--    Kèm vá lỗi có sẵn ở add_order_line: giá lựa chọn là giá TUYỆT ĐỐI (mig 042) nhưng hàm đang CỘNG vào giá
--    món (menu_items.price = giá lựa chọn rẻ nhất do trigger) → món có lựa chọn ghi tay ở POS / đặt món trước
--    bị tính gần gấp đôi. Đổi về COALESCE(giá lựa chọn, giá món) như create_order.
--
-- Chuỗi neo chép nguyên văn từ pg_get_functiondef trên prod (2026-11-09). create_order / staff_create_order
-- toàn LF; add_order_line LẪN CRLF trong thân nên mọi neo của nó nằm trên MỘT dòng. Prod đổi khác thì helper
-- RAISE và cả migration dừng. Chữ ký các hàm cũ KHÔNG đổi.

-- ============================================================
-- 0) Điều kiện trước
-- ============================================================
DO $pre$
BEGIN
  IF to_regprocedure('public.add_order_line(uuid,uuid,jsonb)') IS NULL
     OR to_regprocedure('public.staff_create_order(uuid,jsonb,text,uuid,text)') IS NULL
     OR to_regprocedure('public.create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'mig 115: thiếu một trong các hàm tạo đơn cần vá';
  END IF;
  IF to_regprocedure('public.is_store_scoped_operator(uuid)') IS NULL THEN
    RAISE EXCEPTION 'mig 115: thiếu is_store_scoped_operator (mig 019)';
  END IF;
END
$pre$;

-- ============================================================
-- 1) FK ghép theo quán cho danh mục
-- ============================================================
ALTER TABLE public.menu_categories
  ADD CONSTRAINT menu_categories_id_store_uniq UNIQUE (id, store_id);

-- ============================================================
-- 2) Bảng chương trình giảm giá
-- ============================================================
CREATE TABLE public.menu_discounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  menu_item_id  uuid,
  category_id   uuid,
  name          text,
  discount_type text NOT NULL,
  value         integer NOT NULL,
  starts_on     date,
  ends_on       date,
  time_from     time,
  time_to       time,
  days_of_week  smallint[],
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_discounts_target_check CHECK ((menu_item_id IS NULL) <> (category_id IS NULL)),
  CONSTRAINT menu_discounts_type_check CHECK (discount_type IN ('percent', 'amount')),
  CONSTRAINT menu_discounts_value_check CHECK (
    value > 0 AND value <= 100000000 AND (discount_type <> 'percent' OR value <= 100)),
  CONSTRAINT menu_discounts_name_check CHECK (name IS NULL OR char_length(name) BETWEEN 1 AND 60),
  CONSTRAINT menu_discounts_dates_check CHECK (starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on),
  CONSTRAINT menu_discounts_time_check CHECK (
    (time_from IS NULL) = (time_to IS NULL) AND (time_from IS NULL OR time_from <> time_to)),
  CONSTRAINT menu_discounts_dow_check CHECK (
    days_of_week IS NULL
    OR (cardinality(days_of_week) BETWEEN 1 AND 7 AND days_of_week <@ ARRAY[1,2,3,4,5,6,7]::smallint[])),
  CONSTRAINT menu_discounts_item_fk FOREIGN KEY (menu_item_id, store_id)
    REFERENCES public.menu_items(id, store_id) ON DELETE CASCADE,
  CONSTRAINT menu_discounts_category_fk FOREIGN KEY (category_id, store_id)
    REFERENCES public.menu_categories(id, store_id) ON DELETE CASCADE
);

CREATE INDEX menu_discounts_store_idx ON public.menu_discounts (store_id);
CREATE INDEX menu_discounts_item_idx ON public.menu_discounts (menu_item_id) WHERE menu_item_id IS NOT NULL;
CREATE INDEX menu_discounts_category_idx ON public.menu_discounts (category_id) WHERE category_id IS NOT NULL;

ALTER TABLE public.menu_discounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.menu_discounts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.menu_discounts TO authenticated;
CREATE POLICY menu_discounts_operator_read ON public.menu_discounts
  FOR SELECT TO authenticated USING (public.is_store_scoped_operator(store_id));

-- ============================================================
-- 3) Snapshot trên dòng đơn
-- ============================================================
ALTER TABLE public.order_items
  ADD COLUMN item_original_price integer,
  ADD COLUMN menu_discount_id uuid REFERENCES public.menu_discounts(id) ON DELETE SET NULL;

-- ============================================================
-- 4) Hàm nội bộ
-- ============================================================
-- "Ngày của khung": hôm nay; khung qua nửa đêm (22:00–02:00) mà giờ hiện tại < giờ kết thúc thì là hôm qua.
-- NULL = không nằm trong khung giờ.
CREATE FUNCTION public.menu_discount_is_active(d public.menu_discounts, p_at timestamptz)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH l AS (SELECT (p_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS ts),
  x AS (
    SELECT CASE
             WHEN d.time_from IS NULL THEN l.ts::date
             WHEN d.time_from < d.time_to THEN
               CASE WHEN l.ts::time >= d.time_from AND l.ts::time < d.time_to THEN l.ts::date END
             ELSE
               CASE WHEN l.ts::time >= d.time_from THEN l.ts::date
                    WHEN l.ts::time < d.time_to THEN l.ts::date - 1 END
           END AS day
      FROM l)
  SELECT COALESCE(
           d.is_active
           AND x.day IS NOT NULL
           AND (d.starts_on IS NULL OR x.day >= d.starts_on)
           AND (d.ends_on IS NULL OR x.day <= d.ends_on)
           AND (d.days_of_week IS NULL OR extract(isodow FROM x.day)::smallint = ANY (d.days_of_week)),
           false)
    FROM x;
$$;

CREATE FUNCTION public.menu_discount_amount(p_type text, p_value integer, p_price integer)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
           WHEN p_price IS NULL OR p_price <= 0 OR p_value IS NULL OR p_value <= 0 THEN 0
           WHEN p_type = 'percent' THEN LEAST(p_price, round(p_price::numeric * p_value / 100)::integer)
           ELSE LEAST(p_price, p_value)
         END;
$$;

-- Luôn trả ĐÚNG MỘT dòng: không có chương trình thì discount_id NULL, giá giữ nguyên.
CREATE FUNCTION public.menu_item_discounted_price(p_menu_item_id uuid, p_price integer, p_at timestamptz DEFAULT now())
RETURNS TABLE (discount_id uuid, discounted_price integer)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH mi AS (
    SELECT id, store_id, category_id FROM public.menu_items WHERE id = p_menu_item_id
  ),
  cand AS (
    SELECT d.id,
           CASE WHEN d.menu_item_id IS NOT NULL THEN 1 ELSE 2 END AS lvl,
           public.menu_discount_amount(d.discount_type, d.value, p_price) AS amt,
           d.created_at
      FROM mi
      JOIN public.menu_discounts d
        ON d.store_id = mi.store_id
       AND (d.menu_item_id = mi.id OR d.category_id = mi.category_id)
     WHERE p_price > 0
       AND public.menu_discount_is_active(d, p_at)
  ),
  best AS (
    SELECT id, amt FROM cand ORDER BY lvl, amt DESC, created_at, id LIMIT 1
  )
  SELECT b.id, p_price - COALESCE(b.amt, 0)
    FROM (SELECT 1) one
    LEFT JOIN best b ON true;
$$;

REVOKE ALL ON FUNCTION public.menu_discount_is_active(public.menu_discounts, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.menu_discount_amount(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.menu_item_discounted_price(uuid, integer, timestamptz) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 5) RPC công khai: chương trình đang hiệu lực, theo món (chỉ cấp thắng)
-- ============================================================
CREATE FUNCTION public.get_active_menu_discounts(p_store_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH act AS (
    SELECT d.*
      FROM public.menu_discounts d
      JOIN public.stores s ON s.id = d.store_id AND s.is_active
     WHERE d.store_id = p_store_id
       AND public.menu_discount_is_active(d, now())
  ),
  rule_json AS (
    SELECT a.id, a.menu_item_id, a.category_id,
           jsonb_build_object(
             'id', a.id, 'discount_type', a.discount_type, 'value', a.value, 'name', a.name,
             'time_to', to_char(a.time_to, 'HH24:MI'), 'ends_on', a.ends_on) AS j
      FROM act a
  ),
  per_item AS (
    SELECT mi.id AS menu_item_id,
           COALESCE(
             (SELECT jsonb_agg(r.j ORDER BY r.id) FROM rule_json r WHERE r.menu_item_id = mi.id),
             (SELECT jsonb_agg(r.j ORDER BY r.id) FROM rule_json r WHERE r.category_id = mi.category_id)
           ) AS rules
      FROM public.menu_items mi
     WHERE mi.store_id = p_store_id
  )
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('menu_item_id', p.menu_item_id, 'rules', p.rules))
                         FROM per_item p WHERE p.rules IS NOT NULL), '[]'::jsonb),
    'active_ids', COALESCE((SELECT jsonb_agg(a.id) FROM act a), '[]'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.get_active_menu_discounts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_menu_discounts(uuid) TO anon, authenticated;

-- ============================================================
-- 6) Vá tại chỗ 3 hàm tạo đơn. Helper mẫu mig 105/108/110.
-- ============================================================
CREATE OR REPLACE FUNCTION pg_temp.mevo_patch(p_sig text, p_from text, p_to text)
RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text; v_from text; v_to text; v_hits int;
BEGIN
  v_from := replace(p_from, E'\r\n', E'\n');
  v_to   := replace(p_to,   E'\r\n', E'\n');
  v_def  := pg_get_functiondef(p_sig::regprocedure);
  v_hits := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
  IF v_hits = 0 THEN
    RAISE EXCEPTION 'mig 115: % không còn chuỗi cần vá: %', p_sig, v_from;
  END IF;
  IF v_hits > 1 THEN
    RAISE EXCEPTION 'mig 115: % có hơn một chỗ khớp chuỗi cần vá: %', p_sig, v_from;
  END IF;
  EXECUTE replace(v_def, v_from, v_to);
END
$patch$;

-- ---------- create_order ----------
SELECT pg_temp.mevo_patch(
  'public.create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text)',
  E'  v_variant_name text;\nBEGIN',
  E'  v_variant_name text;\n  v_orig_price   int;\n  v_menu_discount_id uuid;\nBEGIN');

SELECT pg_temp.mevo_patch(
  'public.create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text)',
  E'      v_item_name    := v_menu.name || '' ('' || v_variant.name || '')'';\n    END IF;',
  E'      v_item_name    := v_menu.name || '' ('' || v_variant.name || '')'';\n    END IF;\n\n'
  || E'    -- mig 115: giảm giá theo món / danh mục, tính trên giá món hoặc giá lựa chọn (topping giữ giá).\n'
  || E'    v_orig_price := v_item_price;\n'
  || E'    SELECT md.discount_id, md.discounted_price INTO v_menu_discount_id, v_item_price\n'
  || E'      FROM menu_item_discounted_price(v_menu.id, v_item_price) md;');

SELECT pg_temp.mevo_patch(
  'public.create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text)',
  E'selected_toppings, variant_id, variant_name)',
  E'selected_toppings, variant_id, variant_name, item_original_price, menu_discount_id)');

SELECT pg_temp.mevo_patch(
  'public.create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text)',
  E'v_item_toppings, v_variant_id, v_variant_name);',
  E'v_item_toppings, v_variant_id, v_variant_name,\n'
  || E'            CASE WHEN v_menu_discount_id IS NULL THEN NULL ELSE v_orig_price END, v_menu_discount_id);');

-- ---------- staff_create_order ----------
SELECT pg_temp.mevo_patch(
  'public.staff_create_order(uuid,jsonb,text,uuid,text)',
  E'  v_variant_name text;\nBEGIN',
  E'  v_variant_name text;\n  v_orig_price   int;\n  v_menu_discount_id uuid;\nBEGIN');

SELECT pg_temp.mevo_patch(
  'public.staff_create_order(uuid,jsonb,text,uuid,text)',
  E'      v_item_name    := v_menu.name || '' ('' || v_variant.name || '')'';\n    end if;',
  E'      v_item_name    := v_menu.name || '' ('' || v_variant.name || '')'';\n    end if;\n\n'
  || E'    -- mig 115: giảm giá theo món / danh mục, tính trên giá món hoặc giá lựa chọn (topping giữ giá).\n'
  || E'    v_orig_price := v_item_price;\n'
  || E'    select md.discount_id, md.discounted_price into v_menu_discount_id, v_item_price\n'
  || E'      from menu_item_discounted_price(v_menu.id, v_item_price) md;');

SELECT pg_temp.mevo_patch(
  'public.staff_create_order(uuid,jsonb,text,uuid,text)',
  E'selected_toppings, variant_id, variant_name)',
  E'selected_toppings, variant_id, variant_name, item_original_price, menu_discount_id)');

SELECT pg_temp.mevo_patch(
  'public.staff_create_order(uuid,jsonb,text,uuid,text)',
  E'v_item_tops, v_variant_id, v_variant_name);',
  E'v_item_tops, v_variant_id, v_variant_name,\n'
  || E'            case when v_menu_discount_id is null then null else v_orig_price end, v_menu_discount_id);');

-- ---------- add_order_line (thân hàm lẫn CRLF → neo một dòng) ----------
SELECT pg_temp.mevo_patch(
  'public.add_order_line(uuid,uuid,jsonb)',
  E'v_variant_count integer := 0;',
  E'v_variant_count integer := 0;\n  v_orig_price integer;\n  v_unit_price integer;\n  v_menu_discount_id uuid;');

SELECT pg_temp.mevo_patch(
  'public.add_order_line(uuid,uuid,jsonb)',
  E'  INSERT INTO public.order_items (',
  E'  -- mig 115: giá lựa chọn là giá TUYỆT ĐỐI (như create_order), rồi trừ giảm giá món / danh mục.\n'
  || E'  v_orig_price := COALESCE(v_variant.price, v_menu_item.price);\n'
  || E'  SELECT md.discount_id, md.discounted_price INTO v_menu_discount_id, v_unit_price\n'
  || E'    FROM public.menu_item_discounted_price(v_menu_item.id, v_orig_price) md;\n\n'
  || E'  INSERT INTO public.order_items (');

SELECT pg_temp.mevo_patch(
  'public.add_order_line(uuid,uuid,jsonb)',
  E'    variant_name',
  E'    variant_name, item_original_price, menu_discount_id');

SELECT pg_temp.mevo_patch(
  'public.add_order_line(uuid,uuid,jsonb)',
  E'    v_variant.name',
  E'    v_variant.name, CASE WHEN v_menu_discount_id IS NULL THEN NULL ELSE v_orig_price END, v_menu_discount_id');

SELECT pg_temp.mevo_patch(
  'public.add_order_line(uuid,uuid,jsonb)',
  E'    v_menu_item.price + COALESCE(v_variant.price, 0),',
  E'    v_unit_price,');

SELECT pg_temp.mevo_patch(
  'public.add_order_line(uuid,uuid,jsonb)',
  E'  RETURN (v_menu_item.price + COALESCE(v_variant.price, 0) + v_topping_total) * v_quantity;',
  E'  RETURN (v_unit_price + v_topping_total) * v_quantity;');

-- add_order_line vẫn là hàm nội bộ (mig 110): CREATE OR REPLACE giữ nguyên quyền cũ, nhắc lại cho chắc.
REVOKE ALL ON FUNCTION public.add_order_line(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 7) Hậu kiểm
-- ============================================================
DO $post$
BEGIN
  IF pg_get_functiondef('public.create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text)'::regprocedure)
       NOT LIKE '%menu_item_discounted_price%'
     OR pg_get_functiondef('public.staff_create_order(uuid,jsonb,text,uuid,text)'::regprocedure)
       NOT LIKE '%menu_item_discounted_price%'
     OR pg_get_functiondef('public.add_order_line(uuid,uuid,jsonb)'::regprocedure)
       NOT LIKE '%menu_item_discounted_price%' THEN
    RAISE EXCEPTION 'mig 115: vá hàm tạo đơn không trọn';
  END IF;
  IF pg_get_functiondef('public.add_order_line(uuid,uuid,jsonb)'::regprocedure) LIKE '%COALESCE(v_variant.price, 0)%' THEN
    RAISE EXCEPTION 'mig 115: add_order_line còn cộng giá lựa chọn vào giá món';
  END IF;
END
$post$;
