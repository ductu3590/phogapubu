-- cb2-verify.sql — kiểm tra mig 106 (chuyển CẢ MÂM sang MỘT bàn trống: pos_move_session_to_table)
-- trên DB thật, trong MỘT giao dịch rồi ROLLBACK.
--
-- CÁCH CHẠY: dán nguyên file vào SQL editor (hoặc execute_sql) SAU KHI mig 104, 105 VÀ 106 đã áp.
-- Mỗi ca in `NOTICE: PASS <tên ca>`. Ca nào sai → RAISE EXCEPTION 'FAIL ...' và cả giao dịch dừng.
-- KHÔNG BAO GIỜ COMMIT: kết thúc bằng ROLLBACK nên không để lại bàn/phiên/đơn nào.
--
-- Fixture tự dựng trong giao dịch trên quán "Bia lẩu Bảo Lương" (bàn mới tên ZZ-CB2-1..18, không đụng bàn thật).
-- Giả lập thu ngân bằng request.jwt.claims; RPC là SECURITY DEFINER nên chạy được bằng role hiện tại,
-- quyền do is_store_pos_operator(auth.uid()) quyết định.
--
-- Ca: tray_to_one · tray_to_one_redirect · tray_to_one_service_dupe (+ yêu cầu chưa gắn phiên ở 2 bàn cũ) ·
--     tray_to_one_busy · tray_to_one_own_table · tray_to_one_held · single_table_session · guards · privileges.

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

-- Phiên + các dòng session_tables cho từng bàn trong p_tables. p_tray = true → mâm đoàn (is_open_ordering).
CREATE FUNCTION pg_temp.mk_session(p_store uuid, p_tables uuid[], p_host text, p_tray boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid; v_t uuid;
BEGIN
  INSERT INTO public.table_sessions (store_id, table_id, host_zalo_user_id, opened_by, is_open_ordering)
  VALUES (p_store, p_tables[1], p_host, 'staff', p_tray) RETURNING id INTO v_id;
  FOREACH v_t IN ARRAY p_tables LOOP
    INSERT INTO public.session_tables (session_id, table_id) VALUES (v_id, v_t);
  END LOOP;
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
  v_store uuid;
  v_op    uuid;
  v_t     uuid[] := '{}';      -- 18 bàn fixture, v_t[1]..v_t[18]
  v_tid   uuid;
  v_i     int;
  r       jsonb;
  s1 uuid; s2 uuid; s2b uuid; s3 uuid; s4 uuid; s5 uuid; s6 uuid; s7 uuid;
  o1a uuid; o1b uuid; o1c uuid;
  q_old uuid; q_new uuid; q_a uuid; q_b uuid;
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

  FOR v_i IN 1..18 LOOP
    INSERT INTO public.tables (store_id, table_number) VALUES (v_store, 'ZZ-CB2-' || v_i)
    RETURNING id INTO v_tid;
    v_t := v_t || v_tid;
  END LOOP;

  -- =====================================================================
  -- tray_to_one: mâm {T1, T2} (gốc T1, mâm đoàn) → T3
  -- =====================================================================
  s1 := pg_temp.mk_session(v_store, ARRAY[v_t[1], v_t[2]], 'cb2-host-a', true);
  o1a := pg_temp.mk_order(v_store, v_t[1], s1, 'cb2-host-a');
  o1b := pg_temp.mk_order(v_store, v_t[2], s1, 'cb2-guest');
  o1c := pg_temp.mk_order(v_store, v_t[2], s1, NULL, 'cb2-dev-only');

  r := public.pos_move_session_to_table(s1, v_t[3]);
  PERFORM pg_temp.must('tray_to_one: trả {ok, from_table_numbers, to_table_number, tables_moved}',
    (r->>'ok')::boolean AND r->>'from_table_numbers' = 'ZZ-CB2-1, ZZ-CB2-2'
    AND r->>'to_table_number' = 'ZZ-CB2-3' AND (r->>'tables_moved')::int = 2);
  PERFORM pg_temp.must('tray_to_one: session_tables còn đúng 1 dòng, là bàn đích, đang mở',
    (SELECT count(*) FROM public.session_tables WHERE session_id = s1) = 1
    AND EXISTS (SELECT 1 FROM public.session_tables WHERE session_id = s1 AND table_id = v_t[3] AND is_open));
  PERFORM pg_temp.must('tray_to_one: bàn gốc của phiên = bàn đích',
    (SELECT table_id FROM public.table_sessions WHERE id = s1) = v_t[3]);
  PERFORM pg_temp.must('tray_to_one: is_open_ordering vẫn true, phiên vẫn mở',
    (SELECT is_open_ordering AND status = 'open' FROM public.table_sessions WHERE id = s1));
  PERFORM pg_temp.must('tray_to_one: đơn của CẢ HAI bàn cũ có table_id = đích',
    (SELECT count(*) FROM public.orders WHERE session_id = s1 AND table_id = v_t[3]) = 3
    AND NOT EXISTS (SELECT 1 FROM public.orders WHERE session_id = s1 AND table_id <> v_t[3]));
  PERFORM pg_temp.must('tray_to_one: 2 dòng nhật ký, mỗi bàn cũ một dòng trỏ về đích, đúng người/quán',
    (SELECT count(*) FROM public.table_session_moves WHERE session_id = s1) = 2
    AND EXISTS (SELECT 1 FROM public.table_session_moves
                 WHERE session_id = s1 AND from_table_id = v_t[1] AND to_table_id = v_t[3] AND moved_by = v_op AND store_id = v_store)
    AND EXISTS (SELECT 1 FROM public.table_session_moves
                 WHERE session_id = s1 AND from_table_id = v_t[2] AND to_table_id = v_t[3] AND moved_by = v_op AND store_id = v_store));
  PERFORM pg_temp.must('tray_to_one: hai bàn cũ trống, bàn đích thuộc phiên',
    public.open_session_id_for_table(v_t[1]) IS NULL AND public.open_session_id_for_table(v_t[2]) IS NULL
    AND public.open_session_id_for_table(v_t[3]) = s1);

  -- =====================================================================
  -- tray_to_one_redirect: khách ở BẤT KỲ bàn cũ nào quét lại đều được chuyển hướng về bàn đích
  -- =====================================================================
  r := public.get_table_session_state(v_t[2], 'cb2-guest', NULL);
  PERFORM pg_temp.must('tray_to_one_redirect: khách đã gọi ở bàn cũ thứ 2 → moved về bàn đích',
    r->>'state' = 'moved' AND (r->>'session_id')::uuid = s1
    AND (r->>'table_id')::uuid = v_t[3] AND r->>'table_number' = 'ZZ-CB2-3');
  r := public.get_table_session_state(v_t[1], 'cb2-host-a', NULL);
  PERFORM pg_temp.must('tray_to_one_redirect: chủ phiên ở bàn cũ thứ 1 → moved về bàn đích',
    r->>'state' = 'moved' AND (r->>'table_id')::uuid = v_t[3]);
  r := public.get_table_session_state(v_t[2], NULL, 'cb2-dev-only');
  PERFORM pg_temp.must('tray_to_one_redirect: khách chỉ có device id → moved về bàn đích',
    r->>'state' = 'moved' AND (r->>'table_id')::uuid = v_t[3]);
  r := public.get_table_session_state(v_t[2], 'cb2-stranger', 'cb2-stranger-dev');
  PERFORM pg_temp.must('tray_to_one_redirect: người lạ ở bàn cũ thấy bàn trống', r->>'state' = 'free');
  r := public.get_table_session_state(v_t[3], 'cb2-host-a', NULL);
  PERFORM pg_temp.must('tray_to_one_redirect: hỏi bàn đích → owner như bình thường',
    r->>'state' = 'owner' AND (r->>'session_id')::uuid = s1);

  -- =====================================================================
  -- tray_to_one_service_dupe: yêu cầu gọi NV mở ở cả 2 bàn cũ → còn đúng 1 ở đích, không lỗi
  -- =====================================================================
  s2 := pg_temp.mk_session(v_store, ARRAY[v_t[4], v_t[5]], 'cb2-host-2', true);
  -- T4: gắn phiên, cũ hơn.  T5: chưa gắn phiên, mới hơn → bản T5 phải thắng.
  INSERT INTO public.service_requests (store_id, table_id, table_number, type, session_id, last_ping_at, ping_count)
  VALUES (v_store, v_t[4], 'ZZ-CB2-4', 'call_staff', s2, now() - interval '10 minutes', 1) RETURNING id INTO q_old;
  INSERT INTO public.service_requests (store_id, table_id, table_number, type, session_id, last_ping_at, ping_count)
  VALUES (v_store, v_t[5], 'ZZ-CB2-5', 'call_staff', NULL, now() - interval '1 minute', 1) RETURNING id INTO q_new;

  PERFORM public.pos_move_session_to_table(s2, v_t[6]);
  PERFORM pg_temp.must('tray_to_one_service_dupe: còn đúng 1 yêu cầu mở ở đích (loại call_staff)',
    (SELECT count(*) FROM public.service_requests
      WHERE store_id = v_store AND table_id = v_t[6] AND type = 'call_staff' AND resolved_at IS NULL) = 1
    AND NOT EXISTS (SELECT 1 FROM public.service_requests
                     WHERE store_id = v_store AND table_id IN (v_t[4], v_t[5]) AND resolved_at IS NULL));
  PERFORM pg_temp.must('tray_to_one_service_dupe: yêu cầu MỚI NHẤT được giữ (đủ cả số bàn mới), bản cũ đánh dấu đã xử lý',
    EXISTS (SELECT 1 FROM public.service_requests
             WHERE id = q_new AND table_id = v_t[6] AND table_number = 'ZZ-CB2-6' AND resolved_at IS NULL)
    AND EXISTS (SELECT 1 FROM public.service_requests
                 WHERE id = q_old AND resolved_at IS NOT NULL AND resolved_by = v_op));

  -- Hai yêu cầu cùng loại, đều CHƯA gắn phiên, ở hai bàn cũ khác nhau: dồn về cùng bàn đích không đụng
  -- service_requests_one_open_table.
  s2b := pg_temp.mk_session(v_store, ARRAY[v_t[7], v_t[8]], 'cb2-host-2b', true);
  INSERT INTO public.service_requests (store_id, table_id, table_number, type, session_id, last_ping_at, ping_count)
  VALUES (v_store, v_t[7], 'ZZ-CB2-7', 'call_staff', NULL, now() - interval '5 minutes', 1) RETURNING id INTO q_a;
  INSERT INTO public.service_requests (store_id, table_id, table_number, type, session_id, last_ping_at, ping_count)
  VALUES (v_store, v_t[8], 'ZZ-CB2-8', 'call_staff', NULL, now() - interval '2 minutes', 1) RETURNING id INTO q_b;
  PERFORM public.pos_move_session_to_table(s2b, v_t[9]);
  PERFORM pg_temp.must('tray_to_one_service_dupe: 2 yêu cầu chưa gắn phiên → còn 1 ở đích (bản mới), 1 đã xử lý',
    (SELECT count(*) FROM public.service_requests
      WHERE store_id = v_store AND table_id = v_t[9] AND resolved_at IS NULL) = 1
    AND EXISTS (SELECT 1 FROM public.service_requests WHERE id = q_b AND table_id = v_t[9] AND resolved_at IS NULL)
    AND EXISTS (SELECT 1 FROM public.service_requests WHERE id = q_a AND resolved_at IS NOT NULL));

  -- =====================================================================
  -- tray_to_one_busy: đích đang có khách
  -- =====================================================================
  s3 := pg_temp.mk_session(v_store, ARRAY[v_t[10], v_t[11]], 'cb2-host-3', true);
  s4 := pg_temp.mk_session(v_store, ARRAY[v_t[12]], 'cb2-host-4');
  PERFORM pg_temp.expect_fail('tray_to_one_busy',
    format('SELECT public.pos_move_session_to_table(%L, %L)', s3, v_t[12]),
    '%ZZ-CB2-12 đang có khách%');
  PERFORM pg_temp.must('tray_to_one_busy: không đổi gì sau khi bị từ chối',
    (SELECT count(*) FROM public.session_tables WHERE session_id = s3 AND is_open) = 2
    AND (SELECT table_id FROM public.table_sessions WHERE id = s3) = v_t[10]
    AND NOT EXISTS (SELECT 1 FROM public.table_session_moves WHERE session_id = s3));

  -- =====================================================================
  -- tray_to_one_own_table: đích là một bàn của chính mâm
  -- =====================================================================
  PERFORM pg_temp.expect_fail('tray_to_one_own_table',
    format('SELECT public.pos_move_session_to_table(%L, %L)', s3, v_t[11]),
    '%ZZ-CB2-11 đang có khách%');
  PERFORM pg_temp.must('tray_to_one_own_table: mâm còn nguyên 2 bàn',
    (SELECT count(*) FROM public.session_tables WHERE session_id = s3 AND is_open) = 2);

  -- =====================================================================
  -- tray_to_one_held: đích đang trong khung giữ cho khách đặt
  -- =====================================================================
  s5 := pg_temp.mk_session(v_store, ARRAY[v_t[13], v_t[14]], 'cb2-host-5', true);
  BEGIN
    UPDATE public.store_workflow_settings SET reservations_enabled = true WHERE store_id = v_store;
    IF NOT FOUND THEN
      INSERT INTO public.store_workflow_settings (store_id, reservations_enabled) VALUES (v_store, true);
    END IF;
    INSERT INTO public.reservations (
      store_id, status, customer_name, customer_phone, party_size, arrival_at, client_request_id,
      customer_token_hash, minimum_advance_minutes, booking_horizon_days, slot_interval_minutes,
      default_table_capacity, planning_hold_minutes, reservation_preorder_edit_cutoff_minutes)
    VALUES (v_store, 'pending', 'CB2 Test', '0900000000', 4, now() + interval '30 minutes', gen_random_uuid(),
            repeat('a', 64), 0, 30, 15, 4, 120, 0)
    RETURNING id INTO v_res;
    UPDATE public.reservations SET status = 'confirmed' WHERE id = v_res;
    INSERT INTO public.reservation_tables (reservation_id, store_id, table_id, hold_starts_at, hold_ends_at)
    VALUES (v_res, v_store, v_t[15], now() - interval '1 hour', now() + interval '1 hour');
  EXCEPTION WHEN OTHERS THEN
    -- Luật giữ bàn là quyết định của chủ quán: không dựng được fixture thì FAIL, không được lặng lẽ bỏ qua.
    RAISE EXCEPTION 'FAIL fixture tray_to_one_held: %', SQLERRM;
  END;
  PERFORM pg_temp.must('tray_to_one_held: fixture — bàn đích đang trong khung giữ',
    public.table_has_current_reservation_hold(v_t[15], now()));
  PERFORM pg_temp.expect_fail('tray_to_one_held',
    format('SELECT public.pos_move_session_to_table(%L, %L)', s5, v_t[15]),
    '%đang giữ cho khách đặt%');
  PERFORM pg_temp.must('tray_to_one_held: mâm còn nguyên 2 bàn',
    (SELECT count(*) FROM public.session_tables WHERE session_id = s5 AND is_open) = 2);

  -- =====================================================================
  -- single_table_session: phiên 1 bàn → chạy như chuyển một bàn
  -- =====================================================================
  s6 := pg_temp.mk_session(v_store, ARRAY[v_t[16]], 'cb2-host-6');
  r := public.pos_move_session_to_table(s6, v_t[17]);
  PERFORM pg_temp.must('single_table_session: trả {ok, tables_moved = 1, số bàn}',
    (r->>'ok')::boolean AND (r->>'tables_moved')::int = 1
    AND r->>'from_table_numbers' = 'ZZ-CB2-16' AND r->>'to_table_number' = 'ZZ-CB2-17');
  PERFORM pg_temp.must('single_table_session: 1 dòng session_tables = đích, bàn gốc = đích, bàn cũ trống',
    (SELECT count(*) FROM public.session_tables WHERE session_id = s6) = 1
    AND EXISTS (SELECT 1 FROM public.session_tables WHERE session_id = s6 AND table_id = v_t[17] AND is_open)
    AND (SELECT table_id FROM public.table_sessions WHERE id = s6) = v_t[17]
    AND public.open_session_id_for_table(v_t[16]) IS NULL);
  PERFORM pg_temp.must('single_table_session: 1 dòng nhật ký',
    (SELECT count(*) FROM public.table_session_moves WHERE session_id = s6) = 1);

  -- =====================================================================
  -- guards: phiên đóng, không có quyền, đích không thuộc quán
  -- =====================================================================
  s7 := pg_temp.mk_session(v_store, ARRAY[v_t[18]], 'cb2-host-7');
  UPDATE public.table_sessions SET status = 'closed', closed_at = now(), close_reason = 'staff_reset' WHERE id = s7;
  PERFORM pg_temp.expect_fail('guards: phiên đã đóng',
    format('SELECT public.pos_move_session_to_table(%L, %L)', s7, v_t[1]),
    '%Phiên đã đóng%');
  PERFORM pg_temp.expect_fail('guards: đích NULL',
    format('SELECT public.pos_move_session_to_table(%L, NULL)', s4),
    '%Bàn đích không thuộc quán%');

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  PERFORM pg_temp.expect_fail('guards: không có quyền',
    format('SELECT public.pos_move_session_to_table(%L, %L)', s4, v_t[1]),
    '%Không có quyền%');

  -- =====================================================================
  -- privileges
  -- =====================================================================
  PERFORM pg_temp.must('privileges: anon KHÔNG gọi được pos_move_session_to_table',
    NOT has_function_privilege('anon', 'public.pos_move_session_to_table(uuid,uuid)', 'EXECUTE'));
  PERFORM pg_temp.must('privileges: authenticated gọi được pos_move_session_to_table',
    has_function_privilege('authenticated', 'public.pos_move_session_to_table(uuid,uuid)', 'EXECUTE'));

  RAISE NOTICE 'TẤT CẢ CA mig 106 ĐÃ PASS — giao dịch sẽ ROLLBACK, không để lại dữ liệu';
END
$verify$;

ROLLBACK;
