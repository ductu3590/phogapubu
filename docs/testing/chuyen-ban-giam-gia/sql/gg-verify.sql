-- gg-verify.sql — kiểm tra mig 107 (giảm giá bill: cột ý định, nhật ký, helper, 2 RPC đặt giảm giá)
-- trên DB thật, trong MỘT giao dịch rồi ROLLBACK.
--
-- CÁCH CHẠY: dán nguyên file vào SQL editor (hoặc execute_sql) SAU KHI mig 107 đã áp.
-- Mỗi ca in `NOTICE: PASS <tên ca>`. Ca nào sai → RAISE EXCEPTION 'FAIL ...' và cả giao dịch dừng.
-- KHÔNG BAO GIỜ COMMIT: kết thúc bằng ROLLBACK nên không để lại bàn/phiên/đơn/nhật ký nào.
--
-- Fixture tự dựng ngay trong giao dịch trên quán "Bia lẩu Bảo Lương" (bàn mới tên ZZ-GG1..9,
-- không đụng bàn thật) + MỘT bàn ở quán khác (để thử gộp phiên khác quán). Giả lập thu ngân bằng
-- request.jwt.claims; RPC là SECURITY DEFINER nên quyền do is_store_pos_operator(auth.uid()) quyết định.
--
-- Ca: gg_privileges · helper_calc (làm tròn .5 lên, loại lạ báo lỗi) · helper_unpaid_subtotal (bỏ đơn huỷ + đơn đã thu) ·
--     set_percent · set_amount_over_subtotal (lỗi, trạng thái không đổi) · set_amount_equal_subtotal ·
--     set_invalid_values (loại lạ, âm, % > 100, NULL) · clear_discount (+ không sinh nhật ký thừa) ·
--     log_written · set_guards (phiên đóng, không có quyền, không tìm thấy) ·
--     combined_amount_split (30k/70k, giảm 10.001 → 3.000 / 7.001) · combined_tie_remainder (hoà → id nhỏ nhất) ·
--     combined_percent · combined_overwrite_and_clear · combined_over_total · combined_guards
--     (rỗng, khác quán, phiên đóng, không có quyền, trùng id).
--
-- Mig 108 (cần áp SAU 107): readers_open (list_open_table_sessions, get_sessions_bill, get_table_session_bill,
--     get_table_session_state trả giảm giá khi phiên đang mở) · pay_with_percent (chia 10% vào 3 đơn, dư 1đ vào
--     đơn lớn nhất) · discount_skips_paid_order · readers_paid_bill · pay_idempotent · discount_after_new_round ·
--     void_after_amount_blocks_pay (lỗi khi thu, sửa lại rồi thu được) · recompute_keeps_discount ·
--     expired_ignores_discount · staff_reset_ignores_discount · merge_drops_source_discount · bulk_pay_split ·
--     bills_report_revenue (doanh thu = tổng total_amount SAU giảm, discount_total gồm giảm giá bill).

BEGIN;

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

CREATE FUNCTION pg_temp.mk_session(p_store uuid, p_table uuid, p_id uuid DEFAULT gen_random_uuid())
RETURNS uuid LANGUAGE plpgsql AS $f$
BEGIN
  INSERT INTO public.table_sessions (id, store_id, table_id, host_zalo_user_id, opened_by)
  VALUES (p_id, p_store, p_table, 'gg-host-' || p_id, 'staff');
  INSERT INTO public.session_tables (session_id, table_id) VALUES (p_id, p_table);
  RETURN p_id;
END $f$;

-- Đơn của phiên. p_state: 'open' (chưa thu), 'cancelled' (huỷ/từ chối), 'paid' (đã nhận tiền).
CREATE FUNCTION pg_temp.mk_order(p_store uuid, p_table uuid, p_session uuid, p_total int, p_state text DEFAULT 'open')
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.orders (store_id, table_id, session_id, status, total_amount, payment_amount,
                             payment_method, order_source, zalo_user_id)
  VALUES (p_store, p_table, p_session, 'confirmed', p_total, p_total, 'cash', 'staff', 'gg-uid')
  RETURNING id INTO v_id;
  IF p_state = 'cancelled' THEN
    UPDATE public.orders SET status = 'cancelled' WHERE id = v_id;
  ELSIF p_state = 'paid' THEN
    UPDATE public.orders SET payment_received_at = now(), payment_received_via = 'legacy' WHERE id = v_id;
  END IF;
  RETURN v_id;
END $f$;

-- Thêm một món vào đơn (mig 108: recompute_order_total cần món thật để tính lại tổng).
CREATE FUNCTION pg_temp.mk_item(p_order uuid, p_price int, p_qty int DEFAULT 1)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.order_items (order_id, item_name, item_price, quantity)
  VALUES (p_order, 'ZZ-GG món ' || p_price, p_price, p_qty)
  RETURNING id INTO v_id;
  RETURN v_id;
END $f$;

DO $verify$
DECLARE
  v_store   uuid;
  v_other   uuid;
  v_op      uuid;
  v_t       uuid[] := '{}';
  v_tid     uuid;
  v_i       int;
  v_ot      uuid;
  r         jsonb;
  s1 uuid; s1b uuid; sa uuid; sb uuid; sc uuid; sd uuid; sx uuid; sz uuid; so uuid;
  v_ida uuid := 'a0000000-0000-0000-0000-0000000000a1';
  v_idb uuid := 'b0000000-0000-0000-0000-0000000000b1';
  -- mig 108
  v_t2      uuid[] := '{}';
  v_today   date;
  v_rev0    bigint;
  v_paid    uuid[];
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; m1 uuid; m2 uuid; b1 uuid; b2 uuid;
  o1 uuid; o2 uuid; o3 uuid; o4 uuid; o5 uuid; o6 uuid; i40 uuid;
BEGIN
  -- ---------- chọn quán + thu ngân ----------
  SELECT id INTO v_store FROM public.stores WHERE name ILIKE '%Bảo Lương%' ORDER BY created_at LIMIT 1;
  IF v_store IS NULL THEN
    SELECT id INTO v_store FROM public.stores
     WHERE is_active AND payment_timing = 'postpay' ORDER BY created_at LIMIT 1;
  END IF;
  IF v_store IS NULL THEN RAISE EXCEPTION 'FAIL fixture — không tìm thấy quán trả sau'; END IF;

  SELECT id INTO v_other FROM public.stores WHERE id <> v_store ORDER BY created_at LIMIT 1;
  IF v_other IS NULL THEN RAISE EXCEPTION 'FAIL fixture — cần ít nhất 2 quán để thử gộp phiên khác quán'; END IF;

  SELECT user_id INTO v_op FROM public.mevo_operators
   WHERE store_id = v_store AND is_active AND role IN ('store_cashier', 'store_owner')
   ORDER BY (role = 'store_cashier') DESC LIMIT 1;
  IF v_op IS NULL THEN RAISE EXCEPTION 'FAIL fixture — quán chưa có thu ngân/chủ quán'; END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_op, 'role', 'authenticated')::text, true);

  -- Quán phải đang nhận đơn thì mới chèn được đơn fixture (trigger chặn đơn ngoài giờ). Rollback sau.
  UPDATE public.stores SET is_accepting_orders = true, serving_hours = '[]'::jsonb WHERE id = v_store;

  FOR v_i IN 1..9 LOOP
    INSERT INTO public.tables (store_id, table_number) VALUES (v_store, 'ZZ-GG' || v_i)
    RETURNING id INTO v_tid;
    v_t := v_t || v_tid;
  END LOOP;
  INSERT INTO public.tables (store_id, table_number) VALUES (v_other, 'ZZ-GG-OTHER') RETURNING id INTO v_ot;

  -- =====================================================================
  -- gg_privileges: helper nội bộ không mở cho anon/authenticated; RPC chỉ authenticated;
  -- nhật ký chỉ đọc (default privileges của public cấp EXECUTE/ghi thẳng cho 2 role này nên phải gỡ tường minh)
  -- =====================================================================
  PERFORM pg_temp.must('gg_privileges: anon KHÔNG gọi được bill_discount_amount',
    NOT has_function_privilege('anon', 'public.bill_discount_amount(bigint,text,integer)', 'EXECUTE'));
  PERFORM pg_temp.must('gg_privileges: authenticated KHÔNG gọi được bill_discount_amount',
    NOT has_function_privilege('authenticated', 'public.bill_discount_amount(bigint,text,integer)', 'EXECUTE'));
  PERFORM pg_temp.must('gg_privileges: anon KHÔNG gọi được session_unpaid_subtotal',
    NOT has_function_privilege('anon', 'public.session_unpaid_subtotal(uuid)', 'EXECUTE'));
  PERFORM pg_temp.must('gg_privileges: authenticated KHÔNG gọi được session_unpaid_subtotal',
    NOT has_function_privilege('authenticated', 'public.session_unpaid_subtotal(uuid)', 'EXECUTE'));
  PERFORM pg_temp.must('gg_privileges: anon KHÔNG gọi được 2 RPC đặt giảm giá',
    NOT has_function_privilege('anon', 'public.pos_set_session_discount(uuid,text,integer)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.pos_set_sessions_discount(uuid[],text,integer)', 'EXECUTE'));
  PERFORM pg_temp.must('gg_privileges: authenticated gọi được 2 RPC đặt giảm giá',
    has_function_privilege('authenticated', 'public.pos_set_session_discount(uuid,text,integer)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.pos_set_sessions_discount(uuid[],text,integer)', 'EXECUTE'));
  PERFORM pg_temp.must('gg_privileges: nhật ký — anon không đọc, authenticated chỉ SELECT',
    NOT has_table_privilege('anon', 'public.table_session_discount_changes', 'SELECT')
    AND has_table_privilege('authenticated', 'public.table_session_discount_changes', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.table_session_discount_changes', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.table_session_discount_changes', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.table_session_discount_changes', 'DELETE'));

  -- =====================================================================
  -- helper_calc: cùng phép tính discountAmount (admin-web/lib/bill-discount.ts)
  -- =====================================================================
  PERFORM pg_temp.must('helper_calc: amount → đúng giá trị; NULL → 0',
    public.bill_discount_amount(100000, 'amount', 20000) = 20000
    AND public.bill_discount_amount(100000, NULL, 20000) = 0);
  PERFORM pg_temp.must('helper_calc: percent làm tròn nửa lên như Math.round (25*10% = 2,5 → 3; 15*10% = 1,5 → 2)',
    public.bill_discount_amount(25, 'percent', 10) = 3 AND public.bill_discount_amount(15, 'percent', 10) = 2);
  PERFORM pg_temp.must('helper_calc: percent 15% của 105.000 = 15.750; 100% = toàn bộ; 0% = 0',
    public.bill_discount_amount(105000, 'percent', 15) = 15750
    AND public.bill_discount_amount(105000, 'percent', 100) = 105000
    AND public.bill_discount_amount(105000, 'percent', 0) = 0);
  PERFORM pg_temp.expect_fail('helper_calc: loại lạ báo lỗi, không lặng lẽ tính 0',
    $q$SELECT public.bill_discount_amount(100000, 'bogus', 10)$q$, '%Loại giảm giá không hợp lệ%');

  -- =====================================================================
  -- helper_unpaid_subtotal: 60k + 40k chưa thu; 50k bị huỷ/từ chối và 30k đã nhận tiền KHÔNG tính
  -- =====================================================================
  s1 := pg_temp.mk_session(v_store, v_t[1]);
  PERFORM pg_temp.mk_order(v_store, v_t[1], s1, 60000);
  PERFORM pg_temp.mk_order(v_store, v_t[1], s1, 40000);
  PERFORM pg_temp.mk_order(v_store, v_t[1], s1, 50000, 'cancelled');
  PERFORM pg_temp.mk_order(v_store, v_t[1], s1, 30000, 'paid');
  PERFORM pg_temp.must('helper_unpaid_subtotal: chỉ cộng đơn chưa huỷ và chưa nhận tiền (=100.000)',
    public.session_unpaid_subtotal(s1) = 100000);
  PERFORM pg_temp.must('helper_unpaid_subtotal: phiên không có đơn = 0',
    public.session_unpaid_subtotal(gen_random_uuid()) = 0);

  -- =====================================================================
  -- set_percent
  -- =====================================================================
  r := public.pos_set_session_discount(s1, 'percent', 10);
  PERFORM pg_temp.must('set_percent: trả {ok, subtotal=100000, discount=10000}',
    (r->>'ok')::boolean AND (r->>'subtotal')::bigint = 100000 AND (r->>'discount')::bigint = 10000);
  PERFORM pg_temp.must('set_percent: phiên lưu percent 10, ghi người đặt + giờ',
    EXISTS (SELECT 1 FROM public.table_sessions
             WHERE id = s1 AND bill_discount_type = 'percent' AND bill_discount_value = 10
               AND bill_discount_set_by = v_op AND bill_discount_set_at IS NOT NULL));
  PERFORM pg_temp.must('set_percent: CHƯA trừ vào đơn nào (chỉ là ý định, tiền trừ lúc thu — mig 108)',
    NOT EXISTS (SELECT 1 FROM public.orders WHERE session_id = s1 AND bill_discount_amount <> 0));

  s1b := pg_temp.mk_session(v_store, v_t[2]);
  PERFORM pg_temp.mk_order(v_store, v_t[2], s1b, 25);
  r := public.pos_set_session_discount(s1b, 'percent', 10);
  PERFORM pg_temp.must('set_percent: 10% của 25đ = 3đ (nửa lên) — khớp bill-discount.ts',
    (r->>'discount')::bigint = 3);

  -- =====================================================================
  -- set_amount (đổi từ percent sang amount) + set_amount_over_subtotal + equal
  -- =====================================================================
  r := public.pos_set_session_discount(s1, 'amount', 20000);
  PERFORM pg_temp.must('set_amount: đổi percent → amount 20.000, discount=20000',
    (r->>'discount')::bigint = 20000
    AND EXISTS (SELECT 1 FROM public.table_sessions
                 WHERE id = s1 AND bill_discount_type = 'amount' AND bill_discount_value = 20000));

  PERFORM pg_temp.expect_fail('set_amount_over_subtotal: 100.001 > 100.000 bị từ chối',
    format('SELECT public.pos_set_session_discount(%L, %L, %s)', s1, 'amount', 100001),
    '%Giảm giá lớn hơn tiền hàng — sửa lại giảm giá%');
  PERFORM pg_temp.must('set_amount_over_subtotal: giảm giá cũ (amount 20.000) còn nguyên sau khi bị từ chối',
    EXISTS (SELECT 1 FROM public.table_sessions
             WHERE id = s1 AND bill_discount_type = 'amount' AND bill_discount_value = 20000));

  r := public.pos_set_session_discount(s1, 'amount', 100000);
  PERFORM pg_temp.must('set_amount_equal_subtotal: bằng đúng tiền hàng (100.000) vẫn hợp lệ',
    (r->>'discount')::bigint = 100000);
  r := public.pos_set_session_discount(s1, 'percent', 100);
  PERFORM pg_temp.must('set_amount_equal_subtotal: 100% hợp lệ, discount = toàn bộ',
    (r->>'discount')::bigint = 100000);

  -- =====================================================================
  -- set_invalid_values
  -- =====================================================================
  PERFORM pg_temp.expect_fail('set_invalid_values: loại lạ (giá trị khác 0)',
    format('SELECT public.pos_set_session_discount(%L, %L, %s)', s1, 'bogus', 5),
    '%Loại giảm giá không hợp lệ%');
  PERFORM pg_temp.expect_fail('set_invalid_values: loại lạ KHÔNG lọt qua nhánh "giá trị 0 = bỏ giảm giá"',
    format('SELECT public.pos_set_session_discount(%L, %L, %s)', s1, 'bogus', 0),
    '%Loại giảm giá không hợp lệ%');
  PERFORM pg_temp.expect_fail('set_invalid_values: số âm',
    format('SELECT public.pos_set_session_discount(%L, %L, %s)', s1, 'amount', -5),
    '%Giảm giá phải là số nguyên không âm%');
  PERFORM pg_temp.expect_fail('set_invalid_values: loại có nhưng giá trị NULL',
    format('SELECT public.pos_set_session_discount(%L, %L, NULL)', s1, 'amount'),
    '%Giảm giá phải là số nguyên không âm%');
  PERFORM pg_temp.expect_fail('set_invalid_values: % > 100',
    format('SELECT public.pos_set_session_discount(%L, %L, %s)', s1, 'percent', 101),
    '%Phần trăm phải từ 0 đến 100%');
  PERFORM pg_temp.must('set_invalid_values: giảm giá hiện tại (percent 100) không bị đụng bởi các lần từ chối',
    EXISTS (SELECT 1 FROM public.table_sessions
             WHERE id = s1 AND bill_discount_type = 'percent' AND bill_discount_value = 100));

  -- =====================================================================
  -- clear_discount
  -- =====================================================================
  r := public.pos_set_session_discount(s1, NULL, NULL);
  PERFORM pg_temp.must('clear_discount: (NULL, NULL) bỏ giảm giá, discount=0',
    (r->>'discount')::bigint = 0 AND (r->>'subtotal')::bigint = 100000
    AND EXISTS (SELECT 1 FROM public.table_sessions
                 WHERE id = s1 AND bill_discount_type IS NULL AND bill_discount_value IS NULL
                   AND bill_discount_set_by IS NULL AND bill_discount_set_at IS NULL));
  PERFORM public.pos_set_session_discount(s1, 'amount', 5000);
  PERFORM public.pos_set_session_discount(s1, 'amount', 0);
  PERFORM pg_temp.must('clear_discount: (amount, 0) cũng là bỏ giảm giá',
    EXISTS (SELECT 1 FROM public.table_sessions
             WHERE id = s1 AND bill_discount_type IS NULL AND bill_discount_value IS NULL));

  -- =====================================================================
  -- log_written: mỗi lần ĐỔI giá trị một dòng; đặt lại y hệt / bỏ khi chưa có thì không sinh dòng thừa
  -- Lịch sử của s1: NULL→percent10, percent10→amount20000, amount20000→amount100000, amount100000→percent100,
  --                 percent100→NULL, NULL→amount5000, amount5000→NULL  (các lần bị từ chối KHÔNG ghi)
  -- =====================================================================
  PERFORM pg_temp.must('log_written: đúng 7 dòng nhật ký cho s1, đúng thứ tự cũ → mới',
    (SELECT count(*) FROM public.table_session_discount_changes WHERE session_id = s1) = 7
    AND (SELECT array_agg(coalesce(old_type, '-') || ':' || coalesce(old_value::text, '-') || '>' ||
                          coalesce(new_type, '-') || ':' || coalesce(new_value::text, '-') ORDER BY changed_at, id)
           FROM public.table_session_discount_changes WHERE session_id = s1)
        = ARRAY['-:->percent:10', 'percent:10>amount:20000', 'amount:20000>amount:100000',
                'amount:100000>percent:100', 'percent:100>-:-', '-:->amount:5000', 'amount:5000>-:-']);
  PERFORM pg_temp.must('log_written: ghi đúng cửa hàng + người đổi',
    NOT EXISTS (SELECT 1 FROM public.table_session_discount_changes
                 WHERE session_id = s1 AND (store_id <> v_store OR changed_by <> v_op)));
  PERFORM public.pos_set_session_discount(s1, NULL, NULL);
  PERFORM public.pos_set_session_discount(s1b, 'percent', 10);
  PERFORM pg_temp.must('log_written: bỏ khi chưa có giảm giá / lưu lại y hệt KHÔNG sinh dòng thừa',
    (SELECT count(*) FROM public.table_session_discount_changes WHERE session_id = s1) = 7
    AND (SELECT count(*) FROM public.table_session_discount_changes WHERE session_id = s1b) = 1);

  -- =====================================================================
  -- set_guards
  -- =====================================================================
  sx := pg_temp.mk_session(v_store, v_t[9]);
  UPDATE public.table_sessions SET status = 'closed', closed_at = now(), close_reason = 'staff_reset' WHERE id = sx;
  PERFORM pg_temp.expect_fail('set_guards: phiên đã đóng',
    format('SELECT public.pos_set_session_discount(%L, %L, %s)', sx, 'percent', 10), '%Phiên đã đóng%');
  PERFORM pg_temp.expect_fail('set_guards: không tìm thấy phiên',
    format('SELECT public.pos_set_session_discount(%L, %L, %s)', gen_random_uuid(), 'percent', 10),
    '%Không tìm thấy phiên%');

  -- =====================================================================
  -- combined_amount_split: 2 phiên 30k / 70k, giảm 10.001 → 3.000 / 7.001
  -- =====================================================================
  sa := pg_temp.mk_session(v_store, v_t[3]);
  sb := pg_temp.mk_session(v_store, v_t[4]);
  PERFORM pg_temp.mk_order(v_store, v_t[3], sa, 30000);
  PERFORM pg_temp.mk_order(v_store, v_t[4], sb, 70000);

  r := public.pos_set_sessions_discount(ARRAY[sa, sb], 'amount', 10001);
  PERFORM pg_temp.must('combined_amount_split: trả {ok, subtotal=100000, discount=10001}',
    (r->>'ok')::boolean AND (r->>'subtotal')::bigint = 100000 AND (r->>'discount')::bigint = 10001
    AND jsonb_array_length(r->'sessions') = 2);
  PERFORM pg_temp.must('combined_amount_split: phiên 30k = 3.000, phiên 70k = 7.001 (dư vào phiên lớn nhất), lưu dạng amount',
    EXISTS (SELECT 1 FROM public.table_sessions WHERE id = sa AND bill_discount_type = 'amount' AND bill_discount_value = 3000
              AND bill_discount_set_by = v_op)
    AND EXISTS (SELECT 1 FROM public.table_sessions WHERE id = sb AND bill_discount_type = 'amount' AND bill_discount_value = 7001
                  AND bill_discount_set_by = v_op));
  PERFORM pg_temp.must('combined_amount_split: chi tiết từng phiên trong kết quả khớp số đã lưu',
    (SELECT (e->>'discount')::bigint FROM jsonb_array_elements(r->'sessions') e WHERE (e->>'session_id')::uuid = sa) = 3000
    AND (SELECT (e->>'discount')::bigint FROM jsonb_array_elements(r->'sessions') e WHERE (e->>'session_id')::uuid = sb) = 7001);
  PERFORM pg_temp.must('combined_amount_split: nhật ký mỗi phiên 1 dòng',
    (SELECT count(*) FROM public.table_session_discount_changes WHERE session_id = sa) = 1
    AND (SELECT count(*) FROM public.table_session_discount_changes WHERE session_id = sb) = 1);

  -- =====================================================================
  -- combined_over_total: giảm VNĐ vượt TỔNG tiền hàng bị chặn, không phiên nào đổi
  -- =====================================================================
  PERFORM pg_temp.expect_fail('combined_over_total: 100.001 > tổng 100.000',
    format('SELECT public.pos_set_sessions_discount(%L::uuid[], %L, %s)', ARRAY[sa, sb], 'amount', 100001),
    '%Giảm giá lớn hơn tiền hàng — sửa lại giảm giá%');
  PERFORM pg_temp.must('combined_over_total: hai phiên giữ nguyên giảm giá cũ',
    (SELECT bill_discount_value FROM public.table_sessions WHERE id = sa) = 3000
    AND (SELECT bill_discount_value FROM public.table_sessions WHERE id = sb) = 7001);

  -- =====================================================================
  -- combined_percent: cùng % cho từng phiên (ghi đè giảm giá riêng)
  -- =====================================================================
  r := public.pos_set_sessions_discount(ARRAY[sb, sa], 'percent', 10);
  PERFORM pg_temp.must('combined_percent: thứ tự mảng không quan trọng; mỗi phiên lưu percent 10; tổng giảm = 3.000 + 7.000',
    (r->>'discount')::bigint = 10000
    AND EXISTS (SELECT 1 FROM public.table_sessions WHERE id = sa AND bill_discount_type = 'percent' AND bill_discount_value = 10)
    AND EXISTS (SELECT 1 FROM public.table_sessions WHERE id = sb AND bill_discount_type = 'percent' AND bill_discount_value = 10));
  PERFORM pg_temp.expect_fail('combined_percent: % > 100',
    format('SELECT public.pos_set_sessions_discount(%L::uuid[], %L, %s)', ARRAY[sa, sb], 'percent', 101),
    '%Phần trăm phải từ 0 đến 100%');
  PERFORM pg_temp.expect_fail('combined_percent: loại lạ',
    format('SELECT public.pos_set_sessions_discount(%L::uuid[], %L, %s)', ARRAY[sa, sb], 'bogus', 0),
    '%Loại giảm giá không hợp lệ%');
  PERFORM pg_temp.expect_fail('combined_percent: loại có nhưng giá trị NULL',
    format('SELECT public.pos_set_sessions_discount(%L::uuid[], %L, NULL)', ARRAY[sa, sb], 'amount'),
    '%Giảm giá phải là số nguyên không âm%');
  PERFORM pg_temp.expect_fail('combined_percent: số âm',
    format('SELECT public.pos_set_sessions_discount(%L::uuid[], %L, %s)', ARRAY[sa, sb], 'amount', -1),
    '%Giảm giá phải là số nguyên không âm%');

  -- =====================================================================
  -- combined_overwrite_and_clear: amount mới ghi đè percent cũ; rồi bỏ cả hai; trùng id chỉ tính một lần
  -- =====================================================================
  r := public.pos_set_sessions_discount(ARRAY[sa, sb, sa], 'amount', 10001);
  PERFORM pg_temp.must('combined_overwrite_and_clear: amount ghi đè percent; trùng id (sa hai lần) chỉ xử lý một lần',
    jsonb_array_length(r->'sessions') = 2 AND (r->>'discount')::bigint = 10001
    AND (SELECT bill_discount_value FROM public.table_sessions WHERE id = sa) = 3000
    AND (SELECT bill_discount_value FROM public.table_sessions WHERE id = sb) = 7001);
  r := public.pos_set_sessions_discount(ARRAY[sa, sb], NULL, NULL);
  PERFORM pg_temp.must('combined_overwrite_and_clear: (NULL, NULL) bỏ giảm giá của cả hai phiên',
    (r->>'discount')::bigint = 0
    AND NOT EXISTS (SELECT 1 FROM public.table_sessions
                     WHERE id IN (sa, sb) AND (bill_discount_type IS NOT NULL OR bill_discount_value IS NOT NULL
                                               OR bill_discount_set_by IS NOT NULL OR bill_discount_set_at IS NOT NULL)));

  -- =====================================================================
  -- combined_tie_remainder: hoà tiền hàng → dư vào id NHỎ NHẤT theo so sánh chuỗi
  --   2 phiên 50k, giảm 3 → mỗi phiên floor(1,5)=1, dư 1 vào phiên 'a…' (không phải 'b…'), kể cả khi mảng truyền ngược
  -- =====================================================================
  sc := pg_temp.mk_session(v_store, v_t[5], v_idb);
  sd := pg_temp.mk_session(v_store, v_t[6], v_ida);
  PERFORM pg_temp.mk_order(v_store, v_t[5], sc, 50000);
  PERFORM pg_temp.mk_order(v_store, v_t[6], sd, 50000);
  PERFORM public.pos_set_sessions_discount(ARRAY[v_idb, v_ida], 'amount', 3);
  PERFORM pg_temp.must('combined_tie_remainder: hoà → phiên id nhỏ nhất (a…) nhận 2, phiên b… nhận 1',
    (SELECT bill_discount_value FROM public.table_sessions WHERE id = v_ida) = 2
    AND (SELECT bill_discount_value FROM public.table_sessions WHERE id = v_idb) = 1);
  PERFORM public.pos_set_sessions_discount(ARRAY[v_ida, v_idb], 'amount', 1);
  PERFORM pg_temp.must('combined_tie_remainder: giảm 1 → toàn bộ vào a…, phiên b… được 0 nên không còn giảm giá (NULL)',
    (SELECT bill_discount_value FROM public.table_sessions WHERE id = v_ida) = 1
    AND (SELECT bill_discount_type FROM public.table_sessions WHERE id = v_idb) IS NULL
    AND (SELECT bill_discount_value FROM public.table_sessions WHERE id = v_idb) IS NULL);

  -- =====================================================================
  -- combined_guards
  -- =====================================================================
  PERFORM pg_temp.expect_fail('combined_guards: mảng rỗng',
    $q$SELECT public.pos_set_sessions_discount('{}'::uuid[], 'percent', 10)$q$, '%Chưa chọn phiên nào%');
  PERFORM pg_temp.expect_fail('combined_guards: mảng NULL',
    $q$SELECT public.pos_set_sessions_discount(NULL::uuid[], 'percent', 10)$q$, '%Chưa chọn phiên nào%');
  PERFORM pg_temp.expect_fail('combined_guards: có phiên không tồn tại',
    format('SELECT public.pos_set_sessions_discount(%L::uuid[], %L, %s)', ARRAY[sa, gen_random_uuid()], 'percent', 10),
    '%Không tìm thấy phiên%');
  PERFORM pg_temp.expect_fail('combined_guards: phiên đã đóng',
    format('SELECT public.pos_set_sessions_discount(%L::uuid[], %L, %s)', ARRAY[sa, sx], 'percent', 10),
    '%Phiên đã đóng%');

  -- tổng tiền hàng = 0: không có gì để giảm
  sz := pg_temp.mk_session(v_store, v_t[7]);
  PERFORM pg_temp.expect_fail('combined_guards: tổng tiền hàng 0 mà giảm VNĐ > 0',
    format('SELECT public.pos_set_sessions_discount(%L::uuid[], %L, %s)', ARRAY[sz], 'amount', 1),
    '%Giảm giá lớn hơn tiền hàng — sửa lại giảm giá%');

  -- phiên ở quán khác (tạo bằng quyền hiện tại; chỉ cần tồn tại để thử luật cùng-quán)
  so := pg_temp.mk_session(v_other, v_ot);
  PERFORM pg_temp.expect_fail('combined_guards: các phiên khác quán bị từ chối',
    format('SELECT public.pos_set_sessions_discount(%L::uuid[], %L, %s)', ARRAY[sa, so], 'percent', 10),
    '%Các phiên không cùng một quán%');

  -- người không phải thu ngân/chủ quán của quán này
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  PERFORM pg_temp.expect_fail('set_guards: không có quyền (một phiên)',
    format('SELECT public.pos_set_session_discount(%L, %L, %s)', s1b, 'percent', 5), '%Không có quyền%');
  PERFORM pg_temp.expect_fail('combined_guards: không có quyền (nhiều phiên)',
    format('SELECT public.pos_set_sessions_discount(%L::uuid[], %L, %s)', ARRAY[sa, sb], 'percent', 5), '%Không có quyền%');
  PERFORM pg_temp.must('combined_guards: người không có quyền không làm đổi gì',
    (SELECT bill_discount_value FROM public.table_sessions WHERE id = s1b) = 10);

  -- #####################################################################
  -- MIG 108 — trừ giảm giá lúc thu tiền + đọc giảm giá ở POS / in / A04 / Mini App
  -- #####################################################################
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_op, 'role', 'authenticated')::text, true);

  FOR v_i IN 10..19 LOOP
    INSERT INTO public.tables (store_id, table_number) VALUES (v_store, 'ZZ-GG' || v_i)
    RETURNING id INTO v_tid;
    v_t2 := v_t2 || v_tid;
  END LOOP;

  v_today := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  -- Doanh thu hôm nay TRƯỚC mọi lần thu của phần 108 (đơn fixture đã thu ở phần 107 nằm sẵn trong số này)
  v_rev0 := (public.get_bills_report(v_store, v_today)->'totals'->>'revenue')::bigint;
  IF v_rev0 IS NULL THEN RAISE EXCEPTION 'FAIL fixture — get_bills_report không trả totals.revenue'; END IF;

  -- =====================================================================
  -- readers_open: phiên đang mở 33.333 + 33.333 + 33.334 chưa thu, 20.000 đã thu, 50.000 huỷ; giảm 10%
  -- =====================================================================
  p1 := pg_temp.mk_session(v_store, v_t2[1]);
  o1 := pg_temp.mk_order(v_store, v_t2[1], p1, 33333);
  o2 := pg_temp.mk_order(v_store, v_t2[1], p1, 33333);
  o3 := pg_temp.mk_order(v_store, v_t2[1], p1, 33334);
  o4 := pg_temp.mk_order(v_store, v_t2[1], p1, 20000, 'paid');
  o5 := pg_temp.mk_order(v_store, v_t2[1], p1, 50000, 'cancelled');
  PERFORM public.pos_set_session_discount(p1, 'percent', 10);

  r := public.list_open_table_sessions(v_store);
  PERFORM pg_temp.must('readers_open: list_open_table_sessions trả bill_discount_type/value của phiên',
    EXISTS (SELECT 1 FROM jsonb_array_elements(r) e
             WHERE (e->>'session_id')::uuid = p1
               AND e->>'bill_discount_type' = 'percent' AND (e->>'bill_discount_value')::int = 10));
  PERFORM pg_temp.must('readers_open: phiên không giảm giá → bill_discount_type null',
    EXISTS (SELECT 1 FROM jsonb_array_elements(r) e
             WHERE (e->>'session_id')::uuid = sz AND e ? 'bill_discount_type' AND e->'bill_discount_type' = 'null'::jsonb));

  r := public.get_sessions_bill(ARRAY[p1]);
  PERFORM pg_temp.must('readers_open: get_sessions_bill subtotal 120.000, discount 10.000 (10% tiền CHƯA thu), nhãn 10%, grand_total 110.000',
    (r->'sessions'->0->>'subtotal')::bigint = 120000
    AND (r->'sessions'->0->>'discount')::bigint = 10000
    AND r->'sessions'->0->>'discount_label' = '10%'
    AND (r->>'grand_discount')::bigint = 10000
    AND (r->>'grand_total')::bigint = 110000);

  r := public.get_table_session_bill(v_t2[1], 'gg-host-' || p1, NULL);
  PERFORM pg_temp.must('readers_open: get_table_session_bill (Mini App) trả bill_discount 10.000',
    (r->>'found')::boolean AND (r->>'session_id')::uuid = p1 AND (r->>'bill_discount')::bigint = 10000);
  r := public.get_table_session_state(v_t2[1], 'gg-host-' || p1, NULL);
  PERFORM pg_temp.must('readers_open: get_table_session_state nhánh owner trả bill_discount 10.000',
    r->>'state' = 'owner' AND (r->>'bill_discount')::bigint = 10000);

  -- =====================================================================
  -- pay_with_percent + discount_skips_paid_order
  --   10.000 chia theo 33.333/33.333/33.334: floor = 3.333 ×3 = 9.999, dư 1 → đơn lớn nhất (33.334) = 3.334
  -- =====================================================================
  r := public.close_table_session(p1, 'paid', 'cash');
  PERFORM pg_temp.must('pay_with_percent: tổng thu = 120.000 − 10.000 = 110.000',
    (r->>'ok')::boolean AND NOT (r->>'already')::boolean AND (r->>'total')::bigint = 110000
    AND (r->>'orders_settled')::int = 3);
  PERFORM pg_temp.must('pay_with_percent: bill_discount_amount 3.333 / 3.333 / 3.334, cộng = 10.000',
    (SELECT bill_discount_amount FROM public.orders WHERE id = o1) = 3333
    AND (SELECT bill_discount_amount FROM public.orders WHERE id = o2) = 3333
    AND (SELECT bill_discount_amount FROM public.orders WHERE id = o3) = 3334
    AND (SELECT sum(bill_discount_amount) FROM public.orders WHERE session_id = p1) = 10000);
  PERFORM pg_temp.must('pay_with_percent: total_amount = payment_amount = tiền SAU giảm (30.000 mỗi đơn), đã ghi nhận tiền',
    NOT EXISTS (SELECT 1 FROM public.orders WHERE id IN (o1, o2, o3)
                 AND (total_amount <> 30000 OR payment_amount <> 30000 OR payment_received_at IS NULL
                      OR payment_received_via <> 'owner' OR payment_instrument <> 'cash')));
  PERFORM pg_temp.must('discount_skips_paid_order: đơn đã thu trước (20.000) và đơn huỷ (50.000) không dính giảm giá',
    (SELECT total_amount FROM public.orders WHERE id = o4) = 20000
    AND (SELECT bill_discount_amount FROM public.orders WHERE id = o4) = 0
    AND (SELECT total_amount FROM public.orders WHERE id = o5) = 50000
    AND (SELECT bill_discount_amount FROM public.orders WHERE id = o5) = 0);

  r := public.get_sessions_bill(ARRAY[p1]);
  PERFORM pg_temp.must('readers_paid_bill: phiên đã thu → subtotal TRƯỚC giảm 120.000, discount = tổng đã chia 10.000, nhãn 10%, grand 110.000',
    (r->'sessions'->0->>'subtotal')::bigint = 120000
    AND (r->'sessions'->0->>'discount')::bigint = 10000
    AND r->'sessions'->0->>'discount_label' = '10%'
    AND (r->>'grand_discount')::bigint = 10000
    AND (r->>'grand_total')::bigint = 110000);

  r := public.close_table_session(p1, 'paid', 'cash');
  PERFORM pg_temp.must('pay_idempotent: thu lần 2 → already, total vẫn 110.000, không chia thêm',
    (r->>'already')::boolean AND (r->>'total')::bigint = 110000
    AND (SELECT sum(bill_discount_amount) FROM public.orders WHERE session_id = p1) = 10000);

  -- =====================================================================
  -- discount_after_new_round: đặt 10% lúc tiền hàng 50.000 rồi khách gọi thêm 50.000 → giảm theo tiền MỚI
  -- =====================================================================
  p2 := pg_temp.mk_session(v_store, v_t2[2]);
  PERFORM pg_temp.mk_order(v_store, v_t2[2], p2, 50000);
  r := public.pos_set_session_discount(p2, 'percent', 10);
  PERFORM pg_temp.must('discount_after_new_round: lúc đặt giảm 5.000', (r->>'discount')::bigint = 5000);
  PERFORM pg_temp.mk_order(v_store, v_t2[2], p2, 50000);
  r := public.get_sessions_bill(ARRAY[p2]);
  PERFORM pg_temp.must('discount_after_new_round: bill hiện giảm 10.000 sau lượt mới',
    (r->'sessions'->0->>'discount')::bigint = 10000 AND (r->>'grand_total')::bigint = 90000);
  r := public.close_table_session(p2, 'paid', 'cash');
  PERFORM pg_temp.must('discount_after_new_round: thu 90.000, đã chia 10.000 (5.000 mỗi đơn)',
    (r->>'total')::bigint = 90000
    AND (SELECT sum(bill_discount_amount) FROM public.orders WHERE session_id = p2) = 10000
    AND NOT EXISTS (SELECT 1 FROM public.orders WHERE session_id = p2 AND bill_discount_amount <> 5000));

  -- =====================================================================
  -- void_after_amount_blocks_pay: giảm 70.000 VNĐ trên 100.000, bỏ món 40.000 → tiền hàng 60.000 < giảm
  -- =====================================================================
  p3 := pg_temp.mk_session(v_store, v_t2[3]);
  o6 := pg_temp.mk_order(v_store, v_t2[3], p3, 100000);
  PERFORM pg_temp.mk_item(o6, 60000);
  i40 := pg_temp.mk_item(o6, 40000);
  PERFORM public.pos_set_session_discount(p3, 'amount', 70000);
  UPDATE public.order_items SET void_type = 'cancelled', voided_at = now(), voided_by = v_op, void_reason = 'gg'
   WHERE id = i40;
  PERFORM pg_temp.must('void_after_amount_blocks_pay: recompute trả 60.000 (đơn chưa thu, chưa có giảm giá bill)',
    public.recompute_order_total(o6) = 60000);
  PERFORM pg_temp.expect_fail('void_after_amount_blocks_pay: thu tiền bị chặn',
    format('SELECT public.close_table_session(%L, %L, %L)', p3, 'paid', 'cash'),
    '%Giảm giá lớn hơn tiền hàng — sửa lại giảm giá%');
  PERFORM pg_temp.must('void_after_amount_blocks_pay: phiên vẫn mở, đơn chưa ghi nhận tiền, chưa trừ gì',
    (SELECT status FROM public.table_sessions WHERE id = p3) = 'open'
    AND (SELECT payment_received_at FROM public.orders WHERE id = o6) IS NULL
    AND (SELECT bill_discount_amount FROM public.orders WHERE id = o6) = 0
    AND (SELECT total_amount FROM public.orders WHERE id = o6) = 60000);
  PERFORM public.pos_set_session_discount(p3, 'amount', 50000);
  r := public.close_table_session(p3, 'paid', 'cash');
  PERFORM pg_temp.must('void_after_amount_blocks_pay: sửa giảm giá còn 50.000 → thu được 10.000',
    (r->>'total')::bigint = 10000
    AND (SELECT bill_discount_amount FROM public.orders WHERE id = o6) = 50000
    AND (SELECT payment_amount FROM public.orders WHERE id = o6) = 10000);

  -- =====================================================================
  -- recompute_keeps_discount: tính lại đơn đã chia giảm giá không cộng ngược tiền đã giảm
  -- =====================================================================
  PERFORM pg_temp.must('recompute_keeps_discount: trả 10.000 (60.000 − 50.000), total/payment giữ 10.000',
    public.recompute_order_total(o6) = 10000
    AND (SELECT total_amount FROM public.orders WHERE id = o6) = 10000
    AND (SELECT payment_amount FROM public.orders WHERE id = o6) = 10000
    AND (SELECT bill_discount_amount FROM public.orders WHERE id = o6) = 50000);

  -- =====================================================================
  -- expired_ignores_discount: phiên hết hạn còn nợ → thu đúng tiền đang ghi
  -- =====================================================================
  p4 := pg_temp.mk_session(v_store, v_t2[4]);
  PERFORM pg_temp.mk_order(v_store, v_t2[4], p4, 80000);
  PERFORM public.pos_set_session_discount(p4, 'percent', 50);
  UPDATE public.table_sessions SET status = 'closed', closed_at = now(), close_reason = 'expired' WHERE id = p4;
  r := public.get_sessions_bill(ARRAY[p4]);
  PERFORM pg_temp.must('expired_ignores_discount: bill phiên hết hạn hiện discount 0, không nhãn, grand 80.000',
    (r->'sessions'->0->>'discount')::bigint = 0
    AND r->'sessions'->0->'discount_label' = 'null'::jsonb
    AND (r->>'grand_total')::bigint = 80000);
  r := public.close_table_session(p4, 'paid', 'cash');
  PERFORM pg_temp.must('expired_ignores_discount: thu 80.000, không chia giảm giá',
    (r->>'total')::bigint = 80000
    AND NOT EXISTS (SELECT 1 FROM public.orders WHERE session_id = p4 AND (bill_discount_amount <> 0 OR total_amount <> 80000)));

  -- =====================================================================
  -- staff_reset_ignores_discount: Bỏ bàn không thu tiền → giảm giá bỏ qua
  -- =====================================================================
  p5 := pg_temp.mk_session(v_store, v_t2[5]);
  PERFORM pg_temp.mk_order(v_store, v_t2[5], p5, 30000);
  PERFORM public.pos_set_session_discount(p5, 'percent', 10);
  r := public.close_table_session(p5, 'staff_reset', NULL);
  PERFORM pg_temp.must('staff_reset_ignores_discount: đơn bị huỷ, không chia giảm giá',
    (r->>'orders_cancelled')::int = 1
    AND NOT EXISTS (SELECT 1 FROM public.orders WHERE session_id = p5 AND (bill_discount_amount <> 0 OR total_amount <> 30000)));

  -- =====================================================================
  -- merge_drops_source_discount: nhập phiên (giảm 5.000) vào mâm (giảm 10%) → bỏ giảm giá nguồn, mâm giữ 10%
  -- =====================================================================
  m1 := pg_temp.mk_session(v_store, v_t2[6]);
  PERFORM pg_temp.mk_order(v_store, v_t2[6], m1, 40000);
  PERFORM public.pos_set_session_discount(m1, 'amount', 5000);
  m2 := pg_temp.mk_session(v_store, v_t2[7]);
  PERFORM pg_temp.mk_order(v_store, v_t2[7], m2, 60000);
  PERFORM public.pos_set_session_discount(m2, 'percent', 10);
  PERFORM public.merge_session_into_tray(m1, m2);
  PERFORM pg_temp.must('merge_drops_source_discount: phiên nguồn đóng merged, ý định giảm giá bị xoá',
    EXISTS (SELECT 1 FROM public.table_sessions
             WHERE id = m1 AND status = 'closed' AND close_reason = 'merged'
               AND bill_discount_type IS NULL AND bill_discount_value IS NULL
               AND bill_discount_set_by IS NULL AND bill_discount_set_at IS NULL));
  PERFORM pg_temp.must('merge_drops_source_discount: nhật ký amount 5.000 → NULL, đúng người đổi',
    (SELECT count(*) FROM public.table_session_discount_changes WHERE session_id = m1) = 2
    AND EXISTS (SELECT 1 FROM public.table_session_discount_changes
                 WHERE session_id = m1 AND old_type = 'amount' AND old_value = 5000
                   AND new_type IS NULL AND new_value IS NULL AND changed_by = v_op AND store_id = v_store));
  r := public.get_sessions_bill(ARRAY[m2]);
  PERFORM pg_temp.must('merge_drops_source_discount: mâm đích giữ 10%, áp lên cả đơn mới nhập (10% × 100.000)',
    EXISTS (SELECT 1 FROM public.table_sessions WHERE id = m2 AND bill_discount_type = 'percent' AND bill_discount_value = 10)
    AND (r->'sessions'->0->>'discount')::bigint = 10000);

  -- =====================================================================
  -- bulk_pay_split: gộp bill 30.000 + 70.000, giảm 10.001 VNĐ → 3.000 / 7.001, thu một lần
  -- =====================================================================
  b1 := pg_temp.mk_session(v_store, v_t2[8]);
  b2 := pg_temp.mk_session(v_store, v_t2[9]);
  PERFORM pg_temp.mk_order(v_store, v_t2[8], b1, 30000);
  PERFORM pg_temp.mk_order(v_store, v_t2[9], b2, 70000);
  PERFORM public.pos_set_sessions_discount(ARRAY[b1, b2], 'amount', 10001);
  r := public.get_sessions_bill(ARRAY[b1, b2]);
  PERFORM pg_temp.must('bulk_pay_split: hoá đơn gộp grand_discount 10.001, grand_total 89.999',
    (r->>'grand_discount')::bigint = 10001 AND (r->>'grand_total')::bigint = 89999);
  r := public.close_table_sessions_bulk(ARRAY[b1, b2], 'paid', 'bank');
  PERFORM pg_temp.must('bulk_pay_split: thu 89.999; mâm 30k trừ 3.000, mâm 70k trừ 7.001',
    (r->>'total')::bigint = 89999 AND (r->>'sessions')::int = 2
    AND (SELECT sum(bill_discount_amount) FROM public.orders WHERE session_id = b1) = 3000
    AND (SELECT sum(bill_discount_amount) FROM public.orders WHERE session_id = b2) = 7001
    AND (SELECT sum(total_amount) FROM public.orders WHERE session_id IN (b1, b2)) = 89999);

  -- =====================================================================
  -- bills_report_revenue: doanh thu tăng đúng tổng total_amount SAU giảm của các phiên vừa thu
  --   p1 110.000 (gồm 20.000 đã thu trước) + p2 90.000 + p3 10.000 + p4 80.000 + b1/b2 89.999 = 379.999
  --   giảm giá bill: 10.000 + 10.000 + 50.000 + 0 + 10.001 = 80.001
  -- =====================================================================
  v_paid := ARRAY[p1, p2, p3, p4, b1, b2];
  r := public.get_bills_report(v_store, v_today);
  PERFORM pg_temp.must('bills_report_revenue: doanh thu tăng 379.999 (tiền SAU giảm, không phải 460.000)',
    (r->'totals'->>'revenue')::bigint - v_rev0 = 379999);
  PERFORM pg_temp.must('bills_report_revenue: các bill của phiên vừa thu — total 379.999, bill_discount 80.001, discount_total gồm giảm giá bill',
    (SELECT sum((b->>'total')::bigint) FROM jsonb_array_elements(r->'bills') b
      WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(b->'session_ids') x WHERE x::uuid = ANY(v_paid))) = 379999
    AND (SELECT sum((b->>'bill_discount')::bigint) FROM jsonb_array_elements(r->'bills') b
      WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(b->'session_ids') x WHERE x::uuid = ANY(v_paid))) = 80001
    AND (SELECT sum((b->>'discount_total')::bigint) FROM jsonb_array_elements(r->'bills') b
      WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(b->'session_ids') x WHERE x::uuid = ANY(v_paid))) = 80001);
  PERFORM pg_temp.must('bills_report_revenue: mọi bill đều có trường bill_discount',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'bills') b WHERE NOT b ? 'bill_discount'));

  RAISE NOTICE 'TẤT CẢ CA ĐÃ PASS — giao dịch sẽ ROLLBACK, không để lại dữ liệu';
END
$verify$;

ROLLBACK;
