-- cb-verify.sql — kiểm tra mig 104 (chuyển bàn) trên DB thật, trong MỘT giao dịch rồi ROLLBACK.
--
-- CÁCH CHẠY: dán nguyên file vào SQL editor (hoặc execute_sql) SAU KHI mig 104 đã áp.
-- Mỗi ca in `NOTICE: PASS <tên ca>`. Ca nào sai → RAISE EXCEPTION 'FAIL ...' và cả giao dịch dừng.
-- KHÔNG BAO GIỜ COMMIT: kết thúc bằng ROLLBACK nên không để lại bàn/phiên/đơn nào.
--
-- Fixture tự dựng ngay trong giao dịch trên quán "Bia lẩu Bảo Lương" (bàn mới tên ZZ-CB1..16,
-- không đụng bàn thật). Giả lập thu ngân bằng request.jwt.claims; các RPC là SECURITY DEFINER
-- nên chạy được bằng role hiện tại, quyền do is_store_pos_operator(auth.uid()) quyết định.
--
-- Ca: move_privileges · move_basic · move_chain · move_busy_target · move_held_target (+ lịch hẹn muộn vẫn chuyển được) ·
--     move_tray_one_table · move_service_request · move_race · move_guards (tự chuyển, sai bàn nguồn,
--     phiên đóng, không có quyền).

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

CREATE FUNCTION pg_temp.mk_session(p_store uuid, p_table uuid, p_host text, p_tray boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.table_sessions (store_id, table_id, host_zalo_user_id, opened_by, is_open_ordering)
  VALUES (p_store, p_table, p_host, 'staff', p_tray) RETURNING id INTO v_id;
  INSERT INTO public.session_tables (session_id, table_id) VALUES (v_id, p_table);
  RETURN v_id;
END $f$;

CREATE FUNCTION pg_temp.mk_order(p_store uuid, p_table uuid, p_session uuid, p_uid text, p_device text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.orders (store_id, table_id, session_id, status, total_amount, payment_amount,
                             payment_method, order_source, zalo_user_id, device_id)
  VALUES (p_store, p_table, p_session, 'confirmed', 50000, 50000,
          'cash', 'staff', p_uid, p_device) RETURNING id INTO v_id;
  RETURN v_id;
END $f$;

DO $verify$
DECLARE
  v_store   uuid;
  v_op      uuid;                -- thu ngân (hoặc chủ quán) của quán
  v_t       uuid[] := '{}';      -- 16 bàn fixture, v_t[1]..v_t[16]
  v_tid     uuid;
  v_i       int;
  r         jsonb;
  s1 uuid; s2 uuid; s3 uuid; s5 uuid; s6 uuid; sa uuid; sb uuid; s7 uuid;
  o1 uuid; o5a uuid; o5b uuid;
  v_req uuid; v_req_done uuid;
  v_res uuid;
BEGIN
  -- ---------- chọn quán + thu ngân ----------
  SELECT id INTO v_store FROM public.stores WHERE name ILIKE '%Bảo Lương%' ORDER BY created_at LIMIT 1;
  IF v_store IS NULL THEN
    SELECT id INTO v_store FROM public.stores
     WHERE is_active AND payment_timing = 'postpay' ORDER BY created_at LIMIT 1;
  END IF;
  IF v_store IS NULL THEN RAISE EXCEPTION 'FAIL fixture — không tìm thấy quán trả sau'; END IF;

  SELECT user_id INTO v_op FROM public.mevo_operators
   WHERE store_id = v_store AND is_active AND role IN ('store_cashier', 'store_owner')
   ORDER BY (role = 'store_cashier') DESC LIMIT 1;
  IF v_op IS NULL THEN RAISE EXCEPTION 'FAIL fixture — quán chưa có thu ngân/chủ quán'; END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_op, 'role', 'authenticated')::text, true);

  -- Quán phải đang nhận đơn thì mới chèn được đơn fixture (trigger chặn đơn ngoài giờ). Rollback sau.
  UPDATE public.stores SET is_accepting_orders = true, serving_hours = '[]'::jsonb WHERE id = v_store;

  FOR v_i IN 1..16 LOOP
    INSERT INTO public.tables (store_id, table_number) VALUES (v_store, 'ZZ-CB' || v_i)
    RETURNING id INTO v_tid;
    v_t := v_t || v_tid;
  END LOOP;

  -- =====================================================================
  -- move_basic: bàn lẻ T1 -> T2
  -- =====================================================================
  s1 := pg_temp.mk_session(v_store, v_t[1], 'cb-host-1');
  o1 := pg_temp.mk_order(v_store, v_t[1], s1, 'cb-host-1');

  r := public.pos_move_session_table(s1, v_t[1], v_t[2]);
  PERFORM pg_temp.must('move_basic: trả {ok, from, to}',
    (r->>'ok')::boolean AND r->>'from_table_number' = 'ZZ-CB1' AND r->>'to_table_number' = 'ZZ-CB2');
  PERFORM pg_temp.must('move_basic: session_tables chỉ còn đúng 1 dòng, là bàn mới, đang mở',
    (SELECT count(*) FROM public.session_tables WHERE session_id = s1) = 1
    AND EXISTS (SELECT 1 FROM public.session_tables WHERE session_id = s1 AND table_id = v_t[2] AND is_open));
  PERFORM pg_temp.must('move_basic: bàn gốc của phiên đổi theo',
    (SELECT table_id FROM public.table_sessions WHERE id = s1) = v_t[2]);
  PERFORM pg_temp.must('move_basic: đơn đổi table_id',
    (SELECT table_id FROM public.orders WHERE id = o1) = v_t[2]);
  PERFORM pg_temp.must('move_basic: bàn cũ trống, bàn mới thuộc phiên',
    public.open_session_id_for_table(v_t[1]) IS NULL AND public.open_session_id_for_table(v_t[2]) = s1);
  PERFORM pg_temp.must('move_basic: đúng 1 dòng nhật ký, đúng người/bàn',
    (SELECT count(*) FROM public.table_session_moves WHERE session_id = s1) = 1
    AND EXISTS (SELECT 1 FROM public.table_session_moves
                 WHERE session_id = s1 AND from_table_id = v_t[1] AND to_table_id = v_t[2]
                   AND moved_by = v_op AND store_id = v_store));

  -- helper nhận diện: chủ phiên thấy phiên đã chuyển; khách lạ / NULL / rỗng thì không
  PERFORM pg_temp.must('move_basic: helper — chủ phiên (UID) nhận ra phiên đã chuyển, trả bàn mới',
    (SELECT session_id FROM public.moved_session_for_caller(v_t[1], 'cb-host-1', NULL)) = s1
    AND (SELECT table_id FROM public.moved_session_for_caller(v_t[1], 'cb-host-1', NULL)) = v_t[2]);
  PERFORM pg_temp.must('move_basic: helper — khách lạ không khớp',
    NOT EXISTS (SELECT 1 FROM public.moved_session_for_caller(v_t[1], 'cb-stranger', 'cb-stranger-dev')));
  PERFORM pg_temp.must('move_basic: helper — NULL và chuỗi rỗng không bao giờ khớp',
    NOT EXISTS (SELECT 1 FROM public.moved_session_for_caller(v_t[1], NULL, NULL))
    AND NOT EXISTS (SELECT 1 FROM public.moved_session_for_caller(v_t[1], '', '')));
  UPDATE public.orders SET device_id = 'cb-dev-9' WHERE id = o1;
  PERFORM pg_temp.must('move_basic: helper — khớp qua orders.device_id',
    (SELECT session_id FROM public.moved_session_for_caller(v_t[1], NULL, 'cb-dev-9')) = s1);
  PERFORM pg_temp.must('move_basic: helper — bàn chưa từng bị chuyển đi thì không có kết quả',
    NOT EXISTS (SELECT 1 FROM public.moved_session_for_caller(v_t[2], 'cb-host-1', NULL)));

  -- =====================================================================
  -- move_chain: T1 -> T2 -> T3 (chuyển nhiều lần vẫn tìm ra bàn hiện tại)
  -- =====================================================================
  PERFORM public.pos_move_session_table(s1, v_t[2], v_t[3]);
  PERFORM pg_temp.must('move_chain: 2 dòng nhật ký, thứ tự đúng',
    (SELECT array_agg(to_table_id ORDER BY moved_at) FROM public.table_session_moves WHERE session_id = s1)
      = ARRAY[v_t[2], v_t[3]]);
  PERFORM pg_temp.must('move_chain: helper từ bàn đầu (T1) vẫn ra bàn hiện tại T3',
    (SELECT table_id FROM public.moved_session_for_caller(v_t[1], 'cb-host-1', NULL)) = v_t[3]);
  PERFORM pg_temp.must('move_chain: helper từ bàn giữa (T2) ra T3',
    (SELECT table_id FROM public.moved_session_for_caller(v_t[2], 'cb-host-1', NULL)) = v_t[3]);

  -- =====================================================================
  -- move_busy_target: đích đang có khách
  -- =====================================================================
  s2 := pg_temp.mk_session(v_store, v_t[4], 'cb-host-2');
  PERFORM pg_temp.expect_fail('move_busy_target',
    format('SELECT public.pos_move_session_table(%L, %L, %L)', s2, v_t[4], v_t[3]),
    '%đang có khách%');
  PERFORM pg_temp.must('move_busy_target: không đổi gì sau khi bị từ chối',
    (SELECT table_id FROM public.table_sessions WHERE id = s2) = v_t[4]
    AND NOT EXISTS (SELECT 1 FROM public.table_session_moves WHERE session_id = s2));

  -- =====================================================================
  -- move_held_target: đích đang trong khung giữ cho khách đặt
  -- =====================================================================
  s3 := pg_temp.mk_session(v_store, v_t[6], 'cb-host-3');
  BEGIN
    UPDATE public.store_workflow_settings SET reservations_enabled = true WHERE store_id = v_store;
    IF NOT FOUND THEN
      INSERT INTO public.store_workflow_settings (store_id, reservations_enabled) VALUES (v_store, true);
    END IF;
    INSERT INTO public.reservations (
      store_id, status, customer_name, customer_phone, party_size, arrival_at, client_request_id,
      customer_token_hash, minimum_advance_minutes, booking_horizon_days, slot_interval_minutes,
      default_table_capacity, planning_hold_minutes, reservation_preorder_edit_cutoff_minutes)
    VALUES (v_store, 'pending', 'CB Test', '0900000000', 4, now() + interval '30 minutes', gen_random_uuid(),
            repeat('a', 64), 0, 30, 15, 4, 120, 0)
    RETURNING id INTO v_res;
    UPDATE public.reservations SET status = 'confirmed' WHERE id = v_res;
    INSERT INTO public.reservation_tables (reservation_id, store_id, table_id, hold_starts_at, hold_ends_at)
    VALUES (v_res, v_store, v_t[5], now() - interval '1 hour', now() + interval '1 hour');
  EXCEPTION WHEN OTHERS THEN
    -- Luật giữ bàn là quyết định của chủ quán: không dựng được fixture thì FAIL, không được lặng lẽ bỏ qua.
    RAISE EXCEPTION 'FAIL fixture move_held_target: %', SQLERRM;
  END;

  BEGIN
    PERFORM pg_temp.must('move_held_target: fixture — bàn đích đang trong khung giữ',
      public.table_has_current_reservation_hold(v_t[5], now()));
    PERFORM pg_temp.expect_fail('move_held_target',
      format('SELECT public.pos_move_session_table(%L, %L, %L)', s3, v_t[6], v_t[5]),
      '%đang giữ cho khách đặt%');

    -- Lịch hẹn muộn hơn, CHƯA tới khung giữ: vẫn chuyển được (POS chỉ hỏi xác nhận)
    UPDATE public.reservation_tables
       SET hold_starts_at = now() + interval '3 hours', hold_ends_at = now() + interval '5 hours'
     WHERE reservation_id = v_res;
    PERFORM pg_temp.must('move_held_target: lịch muộn — fixture chưa tới khung giữ',
      NOT public.table_has_current_reservation_hold(v_t[5], now()));
    r := public.pos_move_session_table(s3, v_t[6], v_t[5]);
    PERFORM pg_temp.must('move_held_target: lịch muộn hơn trong ngày vẫn chuyển được',
      (r->>'ok')::boolean AND public.open_session_id_for_table(v_t[5]) = s3);
  END;

  -- =====================================================================
  -- move_privileges: helper nội bộ không được mở cho anon/authenticated
  -- (default privileges của public cấp EXECUTE thẳng cho 2 role này, REVOKE FROM PUBLIC không gỡ được)
  -- =====================================================================
  PERFORM pg_temp.must('move_privileges: anon KHÔNG gọi được moved_session_for_caller',
    NOT has_function_privilege('anon', 'public.moved_session_for_caller(uuid,text,text)', 'EXECUTE'));
  PERFORM pg_temp.must('move_privileges: authenticated KHÔNG gọi được moved_session_for_caller',
    NOT has_function_privilege('authenticated', 'public.moved_session_for_caller(uuid,text,text)', 'EXECUTE'));
  PERFORM pg_temp.must('move_privileges: anon KHÔNG gọi được pos_move_session_table',
    NOT has_function_privilege('anon', 'public.pos_move_session_table(uuid,uuid,uuid)', 'EXECUTE'));
  PERFORM pg_temp.must('move_privileges: authenticated gọi được pos_move_session_table',
    has_function_privilege('authenticated', 'public.pos_move_session_table(uuid,uuid,uuid)', 'EXECUTE'));

  -- =====================================================================
  -- move_tray_one_table: mâm 2 bàn (T7, T8), đổi T8 -> T9; T7 giữ nguyên
  -- =====================================================================
  s5 := pg_temp.mk_session(v_store, v_t[7], NULL, true);
  INSERT INTO public.session_tables (session_id, table_id) VALUES (s5, v_t[8]);
  o5a := pg_temp.mk_order(v_store, v_t[7], s5, 'cb-tray');
  o5b := pg_temp.mk_order(v_store, v_t[8], s5, 'cb-tray');

  PERFORM public.pos_move_session_table(s5, v_t[8], v_t[9]);
  PERFORM pg_temp.must('move_tray_one_table: phiên chiếm đúng {T7, T9}',
    (SELECT array_agg(table_id ORDER BY table_id) FROM public.session_tables WHERE session_id = s5 AND is_open)
      = (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[v_t[7], v_t[9]]) x));
  PERFORM pg_temp.must('move_tray_one_table: bàn còn lại và đơn của nó giữ nguyên',
    (SELECT table_id FROM public.orders WHERE id = o5a) = v_t[7]
    AND (SELECT table_id FROM public.table_sessions WHERE id = s5) = v_t[7]);
  PERFORM pg_temp.must('move_tray_one_table: đơn của bàn được chuyển đổi theo',
    (SELECT table_id FROM public.orders WHERE id = o5b) = v_t[9]);
  PERFORM pg_temp.must('move_tray_one_table: bàn cũ T8 trống',
    public.open_session_id_for_table(v_t[8]) IS NULL);

  -- =====================================================================
  -- move_service_request: yêu cầu gọi nhân viên chưa xử lý đi theo
  -- =====================================================================
  s6 := pg_temp.mk_session(v_store, v_t[10], 'cb-host-6');
  INSERT INTO public.service_requests (store_id, table_id, table_number, type, session_id, last_ping_at, ping_count)
  VALUES (v_store, v_t[10], 'ZZ-CB10', 'call_staff', s6, now(), 1) RETURNING id INTO v_req;
  -- một yêu cầu ĐÃ xử lý cùng bàn: phải ở nguyên chỗ cũ
  INSERT INTO public.service_requests (store_id, table_id, table_number, type, session_id, last_ping_at, ping_count, resolved_at)
  VALUES (v_store, v_t[10], 'ZZ-CB10', 'call_staff', s6, now() - interval '1 hour', 1, now() - interval '30 minutes')
  RETURNING id INTO v_req_done;

  PERFORM public.pos_move_session_table(s6, v_t[10], v_t[11]);
  PERFORM pg_temp.must('move_service_request: yêu cầu chưa xử lý sang bàn mới (cả table_id lẫn table_number)',
    EXISTS (SELECT 1 FROM public.service_requests
             WHERE id = v_req AND table_id = v_t[11] AND table_number = 'ZZ-CB11'));
  PERFORM pg_temp.must('move_service_request: yêu cầu đã xử lý giữ nguyên',
    EXISTS (SELECT 1 FROM public.service_requests
             WHERE id = v_req_done AND table_id = v_t[10] AND table_number = 'ZZ-CB10'));

  -- =====================================================================
  -- move_race: hai phiên cùng chuyển vào một bàn trống (mô phỏng tuần tự — lần thứ hai
  -- nhìn thấy kết quả lần đầu y như khi advisory lock xếp hàng)
  -- =====================================================================
  sa := pg_temp.mk_session(v_store, v_t[12], 'cb-host-a');
  sb := pg_temp.mk_session(v_store, v_t[13], 'cb-host-b');
  PERFORM public.pos_move_session_table(sa, v_t[12], v_t[14]);
  PERFORM pg_temp.must('move_race: phiên A vào được bàn trống',
    public.open_session_id_for_table(v_t[14]) = sa);
  PERFORM pg_temp.expect_fail('move_race: phiên B vào cùng bàn bị từ chối',
    format('SELECT public.pos_move_session_table(%L, %L, %L)', sb, v_t[13], v_t[14]),
    '%đang có khách%');
  PERFORM pg_temp.must('move_race: phiên B vẫn ở bàn cũ, bàn đích vẫn của A',
    public.open_session_id_for_table(v_t[13]) = sb AND public.open_session_id_for_table(v_t[14]) = sa);

  -- =====================================================================
  -- move_guards
  -- =====================================================================
  PERFORM pg_temp.expect_fail('move_guards: chuyển sang chính bàn đó',
    format('SELECT public.pos_move_session_table(%L, %L, %L)', s2, v_t[4], v_t[4]),
    '%Không thể chuyển sang chính bàn đó%');

  s7 := pg_temp.mk_session(v_store, v_t[15], 'cb-host-7');
  PERFORM pg_temp.expect_fail('move_guards: bàn nguồn không thuộc phiên',
    format('SELECT public.pos_move_session_table(%L, %L, %L)', s2, v_t[15], v_t[16]),
    '%Bàn nguồn không thuộc phiên này%');

  UPDATE public.table_sessions SET status = 'closed', closed_at = now(), close_reason = 'staff_reset' WHERE id = s7;
  PERFORM pg_temp.expect_fail('move_guards: phiên đã đóng',
    format('SELECT public.pos_move_session_table(%L, %L, %L)', s7, v_t[15], v_t[16]),
    '%Phiên đã đóng%');

  -- người không phải thu ngân/chủ quán của quán này
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  PERFORM pg_temp.expect_fail('move_guards: không có quyền',
    format('SELECT public.pos_move_session_table(%L, %L, %L)', s2, v_t[4], v_t[16]),
    '%Không có quyền%');

  RAISE NOTICE 'TẤT CẢ CA ĐÃ PASS — giao dịch sẽ ROLLBACK, không để lại dữ liệu';
END
$verify$;

ROLLBACK;
