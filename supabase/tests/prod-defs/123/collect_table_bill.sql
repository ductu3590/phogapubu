-- Chụp từ nhánh tích hợp sau mig 122 (PGlite: 112a + 112b + 122 trên bản chụp prod-defs/112). Controller PHẢI đối chiếu pg_get_functiondef trên prod trước khi áp mig 123.
CREATE OR REPLACE FUNCTION public.collect_table_bill(p_session_ids uuid[], p_lines jsonb, p_cash_given integer, p_client_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_found integer;
  v_store_count integer;
  v_store uuid;
  v_dead integer;
  v_paid integer;
  v_common_payment uuid;
  v_payment_count integer;
  v_existing public.bill_payments%ROWTYPE;
  v_existing_ids uuid[];
  v_line jsonb;
  v_num numeric;
  v_amount integer;
  v_cash integer;
  v_bank integer;
  v_line_count integer := 0;
  v_sum bigint := 0;
  v_change integer;
  v_instrument text;
  v_payment_id uuid;
  v_sid uuid;
  v_res jsonb;
  v_settled integer := 0;
  v_due bigint;
  v_constraint text;
  v_pids uuid[];
  v_one public.bill_payments%ROWTYPE;
BEGIN
  -- 1. Tham số bắt buộc
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu mã chống thu trùng';
  END IF;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids
    FROM unnest(p_session_ids) AS x WHERE x IS NOT NULL;
  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'Chưa chọn phiên nào';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Thiếu danh tính người chốt bill';
  END IF;

  -- 2. Khoá phiên theo thứ tự id tăng dần: hai máy gộp chéo nhau không deadlock.
  PERFORM 1 FROM public.table_sessions WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;

  -- 3. Có đủ phiên, cùng một quán, đúng người
  SELECT count(*), count(DISTINCT store_id), (array_agg(store_id))[1]
    INTO v_found, v_store_count, v_store
    FROM public.table_sessions WHERE id = ANY(v_ids);
  IF v_found < array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'Không tìm thấy phiên';
  END IF;
  IF v_store_count > 1 THEN
    RAISE EXCEPTION 'Các phiên không cùng một quán';
  END IF;
  IF NOT public.is_store_pos_operator(v_store) THEN
    RAISE EXCEPTION 'Chỉ chủ quán hoặc thu ngân được thu tiền';
  END IF;

  -- 4. Gọi lại cùng mã (mạng đứt sau khi server đã thu xong): trả kết quả cũ. Tìm SAU khi khoá
  --    để lần gọi song song chờ khoá rồi thấy được kết quả lần đầu.
  SELECT * INTO v_existing FROM public.bill_payments
   WHERE store_id = v_store AND client_request_id = p_client_request_id;
  IF FOUND THEN
    SELECT array_agg(id ORDER BY id) INTO v_existing_ids
      FROM public.table_sessions WHERE bill_payment_id = v_existing.id;
    IF v_existing_ids IS DISTINCT FROM v_ids THEN
      RAISE EXCEPTION 'Mã thu tiền đã dùng cho bill khác';
    END IF;
    -- Trả kèm các khoản ĐÃ GHI: lần trước có thể là phương tiện khác lần bấm này (mất phản hồi rồi đổi cách thu).
    RETURN jsonb_build_object(
      'ok', true, 'already', true, 'payment_id', v_existing.id,
      'total', v_existing.total_amount,
      'orders_settled', (SELECT count(*) FROM public.orders WHERE bill_payment_id = v_existing.id),
      'lines', public.bill_payment_lines_json(ARRAY[v_existing.id]),
      'cash_given', v_existing.cash_given,
      'change_amount', v_existing.change_amount
    );
  END IF;

  -- 5. Trạng thái phiên: mở hoặc hết hạn còn nợ thì thu được.
  SELECT count(*) FILTER (WHERE close_reason IN ('staff_reset', 'merged')),
         count(*) FILTER (WHERE status = 'closed' AND close_reason = 'paid'),
         count(DISTINCT bill_payment_id), (array_agg(bill_payment_id))[1]
    INTO v_dead, v_paid, v_payment_count, v_common_payment
    FROM public.table_sessions WHERE id = ANY(v_ids);
  IF v_dead > 0 THEN
    RAISE EXCEPTION 'Phiên đã đóng, không thu được';
  END IF;
  IF v_paid = v_found THEN
    -- Máy khác đã thu hết nhóm này. payment_id (và khách đưa / tiền thối) chỉ khi mọi phiên cùng MỘT khoản thu.
    IF v_payment_count = 1 AND NOT EXISTS (SELECT 1 FROM public.table_sessions
                                            WHERE id = ANY(v_ids) AND bill_payment_id IS NULL) THEN
      SELECT * INTO v_one FROM public.bill_payments WHERE id = v_common_payment;
    END IF;
    -- Các khoản đã ghi (cộng theo phương tiện) của mọi khoản thu của nhóm; phiên thu trước mig 112a không có dòng.
    SELECT array_agg(DISTINCT bill_payment_id) FILTER (WHERE bill_payment_id IS NOT NULL) INTO v_pids
      FROM public.table_sessions WHERE id = ANY(v_ids);
    RETURN jsonb_build_object(
      'ok', true, 'already', true,
      'payment_id', v_one.id,
      'total', (SELECT COALESCE(sum(total_amount), 0) FROM public.orders
                 WHERE session_id = ANY(v_ids) AND status <> 'cancelled'),
      'orders_settled', 0,
      'lines', public.bill_payment_lines_json(COALESCE(v_pids, '{}'::uuid[])),
      'cash_given', v_one.cash_given,
      'change_amount', v_one.change_amount
    );
  END IF;
  IF v_paid > 0 THEN
    RAISE EXCEPTION 'Có mâm vừa được thu ở máy khác, tải lại bill';
  END IF;

  -- 6. Đọc khoản thu
  IF p_lines IS NULL OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) > 2 THEN
    RAISE EXCEPTION 'Khoản thu không hợp lệ';
  END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF jsonb_typeof(v_line) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_line -> 'instrument') IS DISTINCT FROM 'string'
       OR (v_line ->> 'instrument') NOT IN ('cash', 'bank')
       OR jsonb_typeof(v_line -> 'amount') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Khoản thu không hợp lệ';
    END IF;
    v_num := (v_line ->> 'amount')::numeric;
    IF v_num <> trunc(v_num) OR v_num < 1 OR v_num > 2000000000 THEN
      RAISE EXCEPTION 'Khoản thu không hợp lệ';
    END IF;
    v_amount := v_num::integer;
    IF v_line ->> 'instrument' = 'cash' THEN
      IF v_cash IS NOT NULL THEN RAISE EXCEPTION 'Mỗi phương tiện chỉ ghi một khoản'; END IF;
      v_cash := v_amount;
    ELSE
      IF v_bank IS NOT NULL THEN RAISE EXCEPTION 'Mỗi phương tiện chỉ ghi một khoản'; END IF;
      v_bank := v_amount;
    END IF;
    v_line_count := v_line_count + 1;
    v_sum := v_sum + v_amount;
  END LOOP;

  -- 7. Tiền khách đưa / tiền thối theo phần tiền mặt
  IF p_cash_given IS NOT NULL THEN
    IF v_cash IS NULL THEN
      RAISE EXCEPTION 'Không có phần tiền mặt để nhận tiền khách đưa';
    END IF;
    IF p_cash_given < v_cash THEN
      RAISE EXCEPTION 'Tiền khách đưa thiếu so với phần tiền mặt';
    END IF;
    v_change := p_cash_given - v_cash;
  END IF;

  -- 8. Phương tiện ghi lên đơn
  v_instrument := CASE
    WHEN v_line_count = 2 THEN 'mixed'
    WHEN v_cash IS NOT NULL THEN 'cash'
    WHEN v_bank IS NOT NULL THEN 'bank'
    ELSE 'cash'   -- bill 0đ: không có khoản nào
  END;

  -- 9. Ghi khoản thu. ⚠️ Mig ca làm việc (cash shift) vá tại chỗ câu INSERT này: giữ cột một dòng, giá trị một dòng,
  --    cash_shift_id là chữ NULL, và câu này phải đứng SAU mọi nhánh trả 'already'.
  -- Hai máy dùng chung một mã cho HAI nhóm phiên khác nhau: khoá phiên không chặn nhau, cả hai cùng
  -- lọt qua bước 4 → máy sau vấp UNIQUE (store_id, client_request_id). Đổi lỗi đó sang tiếng Việt.
  BEGIN
    INSERT INTO public.bill_payments (store_id, cash_shift_id, client_request_id, total_amount, cash_given, change_amount, collected_by, source)
    VALUES (v_store, public.require_open_cash_shift(v_store), p_client_request_id, v_sum, p_cash_given, v_change, v_uid, 'pos')
    RETURNING id INTO v_payment_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'bill_payments_store_id_client_request_id_key' THEN
      RAISE EXCEPTION 'Mã thu tiền đã dùng cho bill khác';
    END IF;
    RAISE;
  END;

  INSERT INTO public.bill_payment_lines (payment_id, instrument, amount)
  SELECT v_payment_id, l.instrument, l.amount
    FROM (VALUES ('cash', v_cash), ('bank', v_bank)) AS l(instrument, amount)
   WHERE l.amount IS NOT NULL;

  -- 10. Đóng từng phiên qua lõi (chia giảm giá, ghi đã thu, hoàn tất đơn, hoàn tất đặt bàn)
  FOREACH v_sid IN ARRAY v_ids LOOP
    v_res := public.close_table_session_core(v_sid, 'paid', v_instrument, v_payment_id);
    v_settled := v_settled + COALESCE((v_res ->> 'orders_settled')::integer, 0);
  END LOOP;

  -- 11. So số phải thu (server tự tính, chỉ phần thu lần này) với số client gửi, ở cấp cả nhóm.
  --     RAISE huỷ cả giao dịch: tất cả hoặc không có gì.
  SELECT COALESCE(sum(total_amount), 0) INTO v_due
    FROM public.orders WHERE bill_payment_id = v_payment_id;
  IF v_due <> v_sum THEN
    RAISE EXCEPTION 'Số tiền không khớp bill: cần thu %, đang ghi %. Tải lại bill rồi thu lại', v_due, v_sum;
  END IF;

  -- 12.
  RETURN jsonb_build_object(
    'ok', true, 'already', false, 'payment_id', v_payment_id,
    'total', v_due, 'orders_settled', v_settled
  );
END;
$function$
