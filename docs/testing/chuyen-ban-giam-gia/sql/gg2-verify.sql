-- gg2-verify.sql — kiểm tra mig 110 (chặn thu lẻ từng lượt của bàn trả sau + khoá 2 hàm nội bộ tính tiền đơn)
-- trên DB thật, trong MỘT giao dịch rồi ROLLBACK.
--
-- CÁCH CHẠY: dán nguyên file vào SQL editor (hoặc execute_sql) SAU KHI mig 110 đã áp.
-- Mỗi ca in `NOTICE: PASS <tên ca>`. Ca nào sai → RAISE EXCEPTION 'FAIL ...' và cả giao dịch dừng.
-- Chạy hết thì câu SELECT cuối trả 'gg2-verify: TẤT CẢ CA ĐÃ PASS'.
-- KHÔNG BAO GIỜ COMMIT: kết thúc bằng ROLLBACK nên không để lại bàn/phiên/đơn nào.
--
-- Fixture tự dựng trong giao dịch trên quán "Bia lẩu Bảo Lương" (bàn mới ZZ-GG2-1..6, không đụng bàn thật).
-- Giả lập người dùng bằng request.jwt.claims (chủ quán / thu ngân / token bếp {store_id, kv}). Ca quyền chạy
-- RPC dưới vai `authenticated` thật (SET LOCAL ROLE) để chứng minh RPC SECURITY DEFINER vẫn gọi được 2 hàm đã khoá.
--
-- Ca: g2_privileges (anon/authenticated KHÔNG gọi được recompute_order_total, add_order_line; service_role vẫn được) ·
--     g2_direct_call_denied (gọi thẳng dưới vai authenticated → permission denied) ·
--     owner_blocks_open_session · kitchen_blocks_open_session · owner_blocks_expired_session ·
--     kitchen_blocks_expired_session (lỗi 'Bàn trả sau thu cả bàn một lần ở POS (Thanh toán)', đơn vẫn chưa thu) ·
--     owner_already_paid_idempotent (đơn phiên đã thu → vẫn trả already, không lỗi) ·
--     owner_non_session_ok · kitchen_non_session_ok (đơn không thuộc phiên vẫn thu lẻ được) ·
--     close_session_still_pays (thu cả bàn qua collect_table_bill) ·
--     pos_add_manual_items_ok · pos_void_ok · pos_restore_ok · pos_quantity_ok (gọi dưới vai authenticated).
--
-- ⚠️ Từ mig 112b: CHỈ chạy được sau khi mig 112a + 112b đã áp. close_table_session(…, 'paid', …) và
--    close_table_sessions_bulk(…, 'paid', …) bị chặn → mọi lần thu dùng pg_temp.pay (gọi collect_table_bill với đúng số
--    server tính). Bỏ bàn (staff_reset) vẫn gọi close_table_session như cũ.

BEGIN;

-- ---------- mig 112a/112b: thu tiền chỉ còn qua collect_table_bill ----------
-- Thu đúng số server tính: tiền chưa thu trừ giảm giá của phiên đang mở.
CREATE FUNCTION pg_temp.pay(p_ids uuid[], p_instrument text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_due bigint;
BEGIN
  SELECT COALESCE(SUM(public.session_unpaid_subtotal(s.id)
    - CASE WHEN s.status = 'open' THEN public.bill_discount_amount(public.session_unpaid_subtotal(s.id), s.bill_discount_type, s.bill_discount_value) ELSE 0 END), 0)
    INTO v_due FROM public.table_sessions s WHERE s.id = ANY(p_ids);
  RETURN public.collect_table_bill(p_ids,
    CASE WHEN v_due > 0 THEN jsonb_build_array(jsonb_build_object('instrument', p_instrument, 'amount', v_due)) ELSE '[]'::jsonb END,
    NULL, gen_random_uuid());
END $$;

-- ---------- helper (chỉ sống trong phiên này) ----------
CREATE FUNCTION pg_temp.must(p_label text, p_ok boolean) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF coalesce(p_ok, false) THEN
    RAISE NOTICE 'PASS %', p_label;
  ELSE
    RAISE EXCEPTION 'FAIL %', p_label;
  END IF;
END $f$;

-- Chạy một câu SQL, bắt buộc phải lỗi và thông báo lỗi khớp LIKE.
CREATE FUNCTION pg_temp.expect_fail(p_label text, p_sql text, p_like text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE p_like THEN
      RAISE NOTICE 'PASS % (lỗi: %)', p_label, SQLERRM;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL % — sai thông báo lỗi: % (cần khớp %)', p_label, SQLERRM, p_like;
  END;
  RAISE EXCEPTION 'FAIL % — lẽ ra phải báo lỗi mà không báo', p_label;
END $f$;

CREATE FUNCTION pg_temp.mk_session(p_store uuid, p_table uuid)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.table_sessions (id, store_id, table_id, host_zalo_user_id, opened_by)
  VALUES (v_id, p_store, p_table, 'gg2-host-' || v_id, 'staff');
  INSERT INTO public.session_tables (session_id, table_id) VALUES (v_id, p_table);
  RETURN v_id;
END $f$;

-- Đơn tiền mặt đã duyệt, chưa thu. p_session NULL = đơn không thuộc phiên (kiểu trả trước / mang về).
CREATE FUNCTION pg_temp.mk_order(p_store uuid, p_table uuid, p_session uuid, p_price int)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.orders (store_id, table_id, session_id, status, total_amount, payment_amount,
                             payment_method, order_source, zalo_user_id)
  VALUES (p_store, p_table, p_session, 'confirmed', p_price, p_price, 'cash', 'staff', 'gg2-uid')
  RETURNING id INTO v_id;
  INSERT INTO public.order_items (order_id, item_name, item_price, quantity)
  VALUES (v_id, 'ZZ-GG2 món ' || p_price, p_price, 1);
  RETURN v_id;
END $f$;

DO $verify$
DECLARE
  v_store   uuid;
  v_owner   uuid;
  v_cashier uuid;
  v_kv      int;
  v_t       uuid[] := '{}';
  v_tid     uuid;
  v_i       int;
  v_menu    uuid;
  v_price   int;
  v_err     text;
  r         jsonb;
  s_open uuid; s_exp uuid; s_pay uuid; s_pos uuid;
  o_open uuid; o_exp uuid; o_paid uuid; o_free1 uuid; o_free2 uuid; o_pay1 uuid; o_pay2 uuid; o_pos uuid;
  v_item uuid; v_new_order uuid;
  c_owner   text;
  c_cashier text;
  c_kitchen text;
BEGIN
  -- ---------- chọn quán + chủ quán + thu ngân ----------
  SELECT id INTO v_store FROM public.stores WHERE name ILIKE '%Bảo Lương%' ORDER BY created_at LIMIT 1;
  IF v_store IS NULL THEN
    SELECT id INTO v_store FROM public.stores
     WHERE is_active AND payment_timing = 'postpay' ORDER BY created_at LIMIT 1;
  END IF;
  IF v_store IS NULL THEN RAISE EXCEPTION 'FAIL fixture — không tìm thấy quán trả sau'; END IF;

  SELECT user_id INTO v_owner FROM public.mevo_operators
   WHERE store_id = v_store AND is_active AND role = 'store_owner' LIMIT 1;
  IF v_owner IS NULL THEN
    SELECT user_id INTO v_owner FROM public.mevo_operators WHERE is_active AND role = 'mevo_superadmin' LIMIT 1;
  END IF;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'FAIL fixture — quán chưa có chủ quán'; END IF;

  SELECT user_id INTO v_cashier FROM public.mevo_operators
   WHERE store_id = v_store AND is_active AND role IN ('store_cashier', 'store_owner')
   ORDER BY (role = 'store_cashier') DESC LIMIT 1;

  SELECT kitchen_token_version INTO v_kv FROM public.stores WHERE id = v_store;

  c_owner   := json_build_object('sub', v_owner, 'role', 'authenticated')::text;
  c_cashier := json_build_object('sub', v_cashier, 'role', 'authenticated')::text;
  c_kitchen := json_build_object('role', 'authenticated', 'store_id', v_store, 'kv', v_kv)::text;

  -- Quán phải đang nhận đơn thì mới chèn được đơn fixture; bếp được xác nhận tiền mặt để đi tới bước chặn.
  -- Cả hai rollback cuối file.
  UPDATE public.stores
     SET is_accepting_orders = true, serving_hours = '[]'::jsonb, kitchen_can_confirm_cash = true
   WHERE id = v_store;

  FOR v_i IN 1..6 LOOP
    INSERT INTO public.tables (store_id, table_number) VALUES (v_store, 'ZZ-GG2-' || v_i)
    RETURNING id INTO v_tid;
    v_t := v_t || v_tid;
  END LOOP;

  -- =====================================================================
  -- g2_privileges
  -- =====================================================================
  PERFORM pg_temp.must('g2_privileges: anon KHÔNG gọi được recompute_order_total',
    NOT has_function_privilege('anon', 'public.recompute_order_total(uuid)', 'EXECUTE'));
  PERFORM pg_temp.must('g2_privileges: authenticated KHÔNG gọi được recompute_order_total',
    NOT has_function_privilege('authenticated', 'public.recompute_order_total(uuid)', 'EXECUTE'));
  PERFORM pg_temp.must('g2_privileges: anon KHÔNG gọi được add_order_line',
    NOT has_function_privilege('anon', 'public.add_order_line(uuid,uuid,jsonb)', 'EXECUTE'));
  PERFORM pg_temp.must('g2_privileges: authenticated KHÔNG gọi được add_order_line',
    NOT has_function_privilege('authenticated', 'public.add_order_line(uuid,uuid,jsonb)', 'EXECUTE'));
  PERFORM pg_temp.must('g2_privileges: service_role vẫn gọi được 2 hàm (không REVOKE)',
    has_function_privilege('service_role', 'public.recompute_order_total(uuid)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.add_order_line(uuid,uuid,jsonb)', 'EXECUTE'));
  PERFORM pg_temp.must('g2_privileges: RPC thu tiền/sửa bill vẫn mở cho authenticated',
    has_function_privilege('authenticated', 'public.confirm_manual_payment(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.pos_add_manual_items(uuid,jsonb,uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.pos_void_order_item(uuid,text,text)', 'EXECUTE'));

  -- =====================================================================
  -- Fixture phiên/đơn
  -- =====================================================================
  s_open := pg_temp.mk_session(v_store, v_t[1]);
  o_open := pg_temp.mk_order(v_store, v_t[1], s_open, 10000);
  o_paid := pg_temp.mk_order(v_store, v_t[1], s_open, 20000);
  UPDATE public.orders SET payment_received_at = now(), payment_received_via = 'legacy' WHERE id = o_paid;

  s_exp := pg_temp.mk_session(v_store, v_t[2]);
  o_exp := pg_temp.mk_order(v_store, v_t[2], s_exp, 30000);
  UPDATE public.table_sessions SET status = 'closed', closed_at = now(), close_reason = 'expired' WHERE id = s_exp;

  o_free1 := pg_temp.mk_order(v_store, v_t[3], NULL, 40000);
  o_free2 := pg_temp.mk_order(v_store, v_t[3], NULL, 50000);

  -- =====================================================================
  -- Chặn thu lẻ lượt của phiên còn thu ở POS
  -- =====================================================================
  PERFORM set_config('request.jwt.claims', c_owner, true);
  PERFORM pg_temp.expect_fail('owner_blocks_open_session',
    format('SELECT public.confirm_manual_payment(%L)', o_open), 'Bàn trả sau thu cả bàn một lần ở POS (Thanh toán)');
  PERFORM pg_temp.expect_fail('owner_blocks_expired_session',
    format('SELECT public.confirm_manual_payment(%L)', o_exp), 'Bàn trả sau thu cả bàn một lần ở POS (Thanh toán)');
  r := public.confirm_manual_payment(o_paid);
  PERFORM pg_temp.must('owner_already_paid_idempotent: đơn phiên đã thu → already, không lỗi',
    (r->>'ok')::boolean AND (r->>'already')::boolean);

  PERFORM set_config('request.jwt.claims', c_kitchen, true);
  PERFORM pg_temp.must('fixture: token bếp giả lập đúng quán', public.kitchen_store_id() = v_store);
  PERFORM pg_temp.expect_fail('kitchen_blocks_open_session',
    format('SELECT public.kitchen_confirm_payment(%L)', o_open), 'Bàn trả sau thu cả bàn một lần ở POS (Thanh toán)');
  PERFORM pg_temp.expect_fail('kitchen_blocks_expired_session',
    format('SELECT public.kitchen_confirm_payment(%L)', o_exp), 'Bàn trả sau thu cả bàn một lần ở POS (Thanh toán)');

  PERFORM pg_temp.must('blocked: 2 đơn bị chặn vẫn chưa thu',
    NOT EXISTS (SELECT 1 FROM public.orders WHERE id IN (o_open, o_exp) AND payment_received_at IS NOT NULL));

  -- =====================================================================
  -- Đơn không thuộc phiên (trả trước / mang về) vẫn thu lẻ được
  -- =====================================================================
  PERFORM set_config('request.jwt.claims', c_owner, true);
  r := public.confirm_manual_payment(o_free1);
  PERFORM pg_temp.must('owner_non_session_ok',
    (r->>'ok')::boolean AND NOT (r->>'already')::boolean
    AND EXISTS (SELECT 1 FROM public.orders WHERE id = o_free1 AND payment_received_at IS NOT NULL
                  AND payment_received_via = 'owner' AND payment_received_by = v_owner));

  PERFORM set_config('request.jwt.claims', c_kitchen, true);
  r := public.kitchen_confirm_payment(o_free2);
  PERFORM pg_temp.must('kitchen_non_session_ok',
    (r->>'ok')::boolean
    AND EXISTS (SELECT 1 FROM public.orders WHERE id = o_free2 AND payment_received_at IS NOT NULL
                  AND payment_received_via = 'kitchen'));

  -- =====================================================================
  -- thu cả bàn vẫn chạy (mig 112a: qua collect_table_bill)
  -- =====================================================================
  PERFORM set_config('request.jwt.claims', c_cashier, true);
  s_pay := pg_temp.mk_session(v_store, v_t[4]);
  o_pay1 := pg_temp.mk_order(v_store, v_t[4], s_pay, 15000);
  o_pay2 := pg_temp.mk_order(v_store, v_t[4], s_pay, 25000);
  r := pg_temp.pay(ARRAY[s_pay], 'cash');
  PERFORM pg_temp.must('close_session_still_pays: 2 lượt đã thu, phiên đóng paid',
    NOT EXISTS (SELECT 1 FROM public.orders WHERE id IN (o_pay1, o_pay2) AND payment_received_at IS NULL)
    AND EXISTS (SELECT 1 FROM public.table_sessions WHERE id = s_pay AND status = 'closed' AND close_reason = 'paid'));
  -- và cũng mở khoá: phiên đã đóng paid → đơn đã thu → confirm_manual_payment trả already
  PERFORM set_config('request.jwt.claims', c_owner, true);
  r := public.confirm_manual_payment(o_pay1);
  PERFORM pg_temp.must('close_session_still_pays: gọi thu lẻ sau khi đã chốt bill → already',
    (r->>'already')::boolean);

  -- =====================================================================
  -- RPC sửa bill vẫn chạy (gọi nội bộ add_order_line / recompute_order_total), dưới vai authenticated thật
  -- =====================================================================
  SELECT mi.id, mi.price INTO v_menu, v_price
    FROM public.menu_items mi
   WHERE mi.store_id = v_store AND mi.is_available
     AND NOT EXISTS (SELECT 1 FROM public.menu_item_variants v WHERE v.menu_item_id = mi.id)
   ORDER BY mi.price, mi.id LIMIT 1;
  IF v_menu IS NULL THEN RAISE EXCEPTION 'FAIL fixture — quán không có món đang bán (không phiên bản)'; END IF;

  s_pos := pg_temp.mk_session(v_store, v_t[5]);
  o_pos := pg_temp.mk_order(v_store, v_t[5], s_pos, 12000);
  SELECT id INTO v_item FROM public.order_items WHERE order_id = o_pos;

  PERFORM set_config('request.jwt.claims', c_cashier, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- g2_direct_call_denied: gọi thẳng 2 hàm đã khoá
  v_err := NULL;
  BEGIN
    PERFORM public.recompute_order_total(o_pos);
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  IF v_err IS NULL THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'FAIL g2_direct_call_denied: recompute_order_total gọi được'; END IF;
  RAISE NOTICE 'PASS g2_direct_call_denied: recompute_order_total (lỗi: %)', v_err;
  v_err := NULL;
  BEGIN
    PERFORM public.add_order_line(o_pos, v_store, jsonb_build_object('menu_item_id', v_menu, 'quantity', 1));
  EXCEPTION WHEN insufficient_privilege THEN v_err := SQLERRM;
  END;
  IF v_err IS NULL THEN EXECUTE 'RESET ROLE'; RAISE EXCEPTION 'FAIL g2_direct_call_denied: add_order_line gọi được'; END IF;
  RAISE NOTICE 'PASS g2_direct_call_denied: add_order_line (lỗi: %)', v_err;

  r := public.pos_add_manual_items(s_pos, jsonb_build_array(jsonb_build_object('menu_item_id', v_menu, 'quantity', 2)),
                                   gen_random_uuid());
  v_new_order := (r->>'order_id')::uuid;
  PERFORM public.pos_void_order_item(v_item, 'gift', 'gg2-verify');
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.must('pos_add_manual_items_ok: tạo đơn POS, tổng = 2 × giá món',
    v_new_order IS NOT NULL AND (r->>'total_amount')::int = 2 * v_price
    AND (SELECT total_amount FROM public.orders WHERE id = v_new_order) = 2 * v_price);
  PERFORM pg_temp.must('pos_void_ok: tặng món → tổng đơn về 0',
    (SELECT total_amount FROM public.orders WHERE id = o_pos) = 0);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.pos_restore_order_item(v_item);
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.must('pos_restore_ok: khôi phục → tổng 12.000',
    (SELECT total_amount FROM public.orders WHERE id = o_pos) = 12000);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.pos_set_order_item_quantity(v_item, 3, 'gg2-verify');
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.must('pos_quantity_ok: SL 3 → tổng 36.000',
    (SELECT total_amount FROM public.orders WHERE id = o_pos) = 36000);

  RAISE NOTICE 'TẤT CẢ CA ĐÃ PASS — giao dịch sẽ ROLLBACK, không để lại dữ liệu';
END
$verify$;

SELECT 'gg2-verify: TẤT CẢ CA ĐÃ PASS' AS result;

ROLLBACK;
