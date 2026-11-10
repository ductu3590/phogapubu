-- md1-verify.sql — kiểm mig 115 (giảm giá theo món / danh mục, có lịch) trên DB thật, trong MỘT giao dịch rồi ROLLBACK.
--
-- CÁCH CHẠY: dán nguyên file vào SQL editor (hoặc execute_sql) SAU KHI mig 115 đã áp.
-- Mỗi ca in `NOTICE: PASS <tên ca>`. Ca nào sai → RAISE EXCEPTION 'FAIL ...' và cả giao dịch dừng.
-- KHÔNG BAO GIỜ COMMIT: kết thúc bằng ROLLBACK nên không để lại chương trình / phiên / đơn nào.
-- Fixture: quán "Bia lẩu Bảo Lương", một món thường + một món có lựa chọn còn bán, một bàn đang trống.
--
-- Ca: amount_rounding · item_beats_category · best_of_same_level · overnight_window · weekday_and_dates ·
--     inactive_ignored · rpc_shape · create_order_snapshot · add_order_line_variant_absolute ·
--     staff_create_order_snapshot · anon_cannot_read_table · internal_functions_revoked

BEGIN;

DO $t$
DECLARE
  s uuid; mi uuid; cat uuid; mi2 uuid; vmi uuid; vv uuid; vprice int; tb uuid; u uuid;
  d1 uuid; d2 uuid; d3 uuid; x record; o jsonb; oid uuid; ret int; j jsonb; mprice int;
BEGIN
  SELECT id INTO s FROM stores WHERE slug LIKE '%bao-luong%';
  SELECT m.id, m.category_id, m.price INTO mi, cat, mprice FROM menu_items m
   WHERE m.store_id = s AND m.is_available AND m.price > 0
     AND NOT EXISTS (SELECT 1 FROM menu_item_variants v WHERE v.menu_item_id = m.id)
     AND EXISTS (SELECT 1 FROM menu_items m2 WHERE m2.category_id = m.category_id AND m2.id <> m.id)
   LIMIT 1;
  SELECT id INTO mi2 FROM menu_items WHERE category_id = cat AND id <> mi LIMIT 1;
  SELECT id INTO tb FROM tables t WHERE t.store_id = s AND t.is_active
     AND NOT EXISTS (SELECT 1 FROM session_tables st WHERE st.table_id = t.id AND st.is_open) LIMIT 1;
  IF s IS NULL OR mi IS NULL OR tb IS NULL THEN RAISE EXCEPTION 'FAIL fixture: thiếu quán/món/bàn'; END IF;
  -- Dọn chương trình thật của quán trong giao dịch này để kết quả không bị lẫn (ROLLBACK trả lại).
  DELETE FROM menu_discounts WHERE store_id = s;

  -- amount_rounding
  IF menu_discount_amount('percent', 15, 12345) <> 1852 OR menu_discount_amount('percent', 1, 1250) <> 13
     OR menu_discount_amount('amount', 99999, 20000) <> 20000 OR menu_discount_amount('percent', 50, 0) <> 0 THEN
    RAISE EXCEPTION 'FAIL amount_rounding';
  END IF;
  RAISE NOTICE 'PASS amount_rounding';

  -- item_beats_category: danh mục 10%, món 1.000đ → món thắng dù giảm ít hơn
  INSERT INTO menu_discounts (store_id, category_id, discount_type, value) VALUES (s, cat, 'percent', 10) RETURNING id INTO d1;
  SELECT * INTO x FROM menu_item_discounted_price(mi2, 25000);
  IF x.discounted_price <> 22500 OR x.discount_id <> d1 THEN RAISE EXCEPTION 'FAIL item_beats_category (cat) %', x; END IF;
  INSERT INTO menu_discounts (store_id, menu_item_id, discount_type, value) VALUES (s, mi, 'amount', 1000) RETURNING id INTO d2;
  SELECT * INTO x FROM menu_item_discounted_price(mi, 25000);
  IF x.discounted_price <> 24000 OR x.discount_id <> d2 THEN RAISE EXCEPTION 'FAIL item_beats_category %', x; END IF;
  RAISE NOTICE 'PASS item_beats_category';

  -- best_of_same_level: thêm món 20% → 20% thắng 1.000đ
  INSERT INTO menu_discounts (store_id, menu_item_id, discount_type, value) VALUES (s, mi, 'percent', 20) RETURNING id INTO d3;
  SELECT * INTO x FROM menu_item_discounted_price(mi, 25000);
  IF x.discounted_price <> 20000 OR x.discount_id <> d3 THEN RAISE EXCEPTION 'FAIL best_of_same_level %', x; END IF;
  DELETE FROM menu_discounts WHERE id = d3;
  RAISE NOTICE 'PASS best_of_same_level';

  -- overnight_window: 22:00–02:00 chỉ thứ 6 (2026-11-13 là thứ 6)
  INSERT INTO menu_discounts (store_id, menu_item_id, discount_type, value, time_from, time_to, days_of_week)
  VALUES (s, mi, 'percent', 50, '22:00', '02:00', '{5}') RETURNING id INTO d3;
  IF (SELECT discounted_price FROM menu_item_discounted_price(mi, 25000, '2026-11-13 23:00+07')) <> 12500
     OR (SELECT discounted_price FROM menu_item_discounted_price(mi, 25000, '2026-11-14 01:59+07')) <> 12500
     OR (SELECT discounted_price FROM menu_item_discounted_price(mi, 25000, '2026-11-14 02:00+07')) <> 24000
     OR (SELECT discounted_price FROM menu_item_discounted_price(mi, 25000, '2026-11-14 23:00+07')) <> 24000
     OR (SELECT discounted_price FROM menu_item_discounted_price(mi, 25000, '2026-11-13 21:59+07')) <> 24000 THEN
    RAISE EXCEPTION 'FAIL overnight_window';
  END IF;
  DELETE FROM menu_discounts WHERE id = d3;
  RAISE NOTICE 'PASS overnight_window';

  -- weekday_and_dates: khoảng ngày bao gồm 2 đầu, giờ VN
  UPDATE menu_discounts SET starts_on = '2026-11-10', ends_on = '2026-11-12' WHERE id = d2;
  IF (SELECT discounted_price FROM menu_item_discounted_price(mi, 25000, '2026-11-09 23:59+07')) <> 22500 -- món hết hiệu lực → danh mục
     OR (SELECT discounted_price FROM menu_item_discounted_price(mi, 25000, '2026-11-10 00:00+07')) <> 24000
     OR (SELECT discounted_price FROM menu_item_discounted_price(mi, 25000, '2026-11-12 23:59+07')) <> 24000
     OR (SELECT discounted_price FROM menu_item_discounted_price(mi, 25000, '2026-11-13 00:00+07')) <> 22500 THEN
    RAISE EXCEPTION 'FAIL weekday_and_dates';
  END IF;
  UPDATE menu_discounts SET starts_on = NULL, ends_on = NULL WHERE id = d2;
  RAISE NOTICE 'PASS weekday_and_dates';

  -- inactive_ignored
  UPDATE menu_discounts SET is_active = false WHERE id IN (d1, d2);
  SELECT * INTO x FROM menu_item_discounted_price(mi, 25000);
  IF x.discounted_price <> 25000 OR x.discount_id IS NOT NULL THEN RAISE EXCEPTION 'FAIL inactive_ignored %', x; END IF;
  UPDATE menu_discounts SET is_active = true WHERE id IN (d1, d2);
  RAISE NOTICE 'PASS inactive_ignored';

  -- rpc_shape: món mi chỉ thấy chương trình cấp món; mi2 thấy cấp danh mục
  j := get_active_menu_discounts(s);
  IF NOT (j->'active_ids') @> to_jsonb(ARRAY[d1, d2]::text[])
     OR (SELECT r->'rules'->0->>'id' FROM jsonb_array_elements(j->'items') r WHERE r->>'menu_item_id' = mi::text) <> d2::text
     OR (SELECT r->'rules'->0->>'id' FROM jsonb_array_elements(j->'items') r WHERE r->>'menu_item_id' = mi2::text) <> d1::text THEN
    RAISE EXCEPTION 'FAIL rpc_shape %', j;
  END IF;
  RAISE NOTICE 'PASS rpc_shape';

  -- create_order_snapshot: món mi 2 phần, giảm 1.000đ/phần
  o := create_order(s, tb, jsonb_build_array(jsonb_build_object('menu_item_id', mi, 'quantity', 2)), 'cash',
                    NULL, NULL, 'dine_in', NULL, NULL, NULL, NULL, 'md1-verify-device');
  oid := (o->>'id')::uuid;
  IF (SELECT item_price FROM order_items WHERE order_id = oid) <> mprice - 1000
     OR (SELECT item_original_price FROM order_items WHERE order_id = oid) <> mprice
     OR (SELECT menu_discount_id FROM order_items WHERE order_id = oid) <> d2
     OR (o->>'total_amount')::int <> (mprice - 1000) * 2 THEN
    RAISE EXCEPTION 'FAIL create_order_snapshot %', o;
  END IF;
  RAISE NOTICE 'PASS create_order_snapshot';

  -- add_order_line_variant_absolute: giá lựa chọn là giá tuyệt đối (vá lỗi cộng gấp đôi), rồi mới trừ giảm giá
  SELECT v.menu_item_id, v.id, v.price INTO vmi, vv, vprice FROM menu_item_variants v JOIN menu_items m ON m.id = v.menu_item_id
   WHERE m.store_id = s AND v.is_available AND m.is_available ORDER BY v.price DESC LIMIT 1;
  IF vmi IS NOT NULL THEN
    DELETE FROM menu_discounts WHERE menu_item_id = vmi
       OR category_id = (SELECT category_id FROM menu_items WHERE id = vmi);
    ret := add_order_line(oid, s, jsonb_build_object('menu_item_id', vmi, 'variant_id', vv, 'quantity', 1));
    IF ret <> vprice THEN RAISE EXCEPTION 'FAIL add_order_line_variant_absolute (no discount) % <> %', ret, vprice; END IF;
    INSERT INTO menu_discounts (store_id, menu_item_id, discount_type, value) VALUES (s, vmi, 'amount', 5000);
    ret := add_order_line(oid, s, jsonb_build_object('menu_item_id', vmi, 'variant_id', vv, 'quantity', 1));
    IF ret <> GREATEST(vprice - 5000, 0) THEN RAISE EXCEPTION 'FAIL add_order_line_variant_absolute % <> %', ret, vprice - 5000; END IF;
    RAISE NOTICE 'PASS add_order_line_variant_absolute';
  ELSE
    RAISE NOTICE 'SKIP add_order_line_variant_absolute (quán không có món có lựa chọn)';
  END IF;

  -- staff_create_order_snapshot (giả lập nhân viên của quán)
  SELECT user_id INTO u FROM mevo_operators WHERE store_id = s AND is_active AND role IN ('store_owner','store_staff','store_cashier') LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  o := staff_create_order(tb, jsonb_build_array(jsonb_build_object('menu_item_id', mi, 'quantity', 1)), 'cash', gen_random_uuid(), NULL);
  IF (o->'items'->0->>'item_price')::int <> mprice - 1000 OR (o->'items'->0->>'item_original_price')::int <> mprice THEN
    RAISE EXCEPTION 'FAIL staff_create_order_snapshot %', o;
  END IF;
  RAISE NOTICE 'PASS staff_create_order_snapshot';

  -- anon_cannot_read_table + internal_functions_revoked
  IF has_table_privilege('anon', 'public.menu_discounts', 'SELECT') THEN RAISE EXCEPTION 'FAIL anon_cannot_read_table'; END IF;
  RAISE NOTICE 'PASS anon_cannot_read_table';
  IF has_function_privilege('anon', 'public.menu_item_discounted_price(uuid,integer,timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.add_order_line(uuid,uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.get_active_menu_discounts(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL internal_functions_revoked';
  END IF;
  RAISE NOTICE 'PASS internal_functions_revoked';
END
$t$;

ROLLBACK;
