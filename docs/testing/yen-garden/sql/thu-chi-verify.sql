-- thu-chi-verify.sql — kiểm số liệu ca thu ngân + sổ thu chi (mig 122, 122b) trên DB THẬT, trong MỘT giao dịch rồi ROLLBACK.
--
-- CÁCH CHẠY: dán nguyên file vào SQL editor (hoặc execute_sql) SAU KHI mig 122 + 122b đã áp. Chạy lại bất kỳ lúc nào
-- (vd. sau mỗi bài test tay ở THU-CHI.md, hoặc cuối ngày bán thật đầu tiên).
-- Mỗi ca in `NOTICE: PASS <tên ca>`. Ca nào sai → RAISE EXCEPTION 'FAIL ...' và dừng. CHỈ ĐỌC: không tạo dữ liệu, kết thúc ROLLBACK.
--
-- Ca: closed_shift_expected (tiền dự kiến đã lưu = cash_shift_totals tính lại) · closed_shift_difference (chênh lệch =
--     đếm − dự kiến) · one_open_shift_per_store · cash_entries_have_shift (quán bật ca: phiếu TM ghi sau lần bật gần nhất
--     đều gắn ca) · bank_entries_no_shift · paid_receipts_have_entry (phiếu nhập đã trả có phiếu chi còn hiệu lực, đúng
--     số tiền, đúng phương thức) · voided_receipts_entry_voided · system_category_every_store · bill_payments_shift_same_store ·
--     anchors (neo 123 trong cash_shift_totals, hai lời gọi 122b trong RPC kho) · internal_privileges.

BEGIN;

CREATE FUNCTION pg_temp.must(p_label text, p_ok boolean, p_detail text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF coalesce(p_ok, false) THEN
    RAISE NOTICE 'PASS %', p_label;
  ELSE
    RAISE EXCEPTION 'FAIL % %', p_label, coalesce(p_detail, '');
  END IF;
END $f$;

DO $verify$
DECLARE
  v_bad text;
  v_n bigint;
BEGIN
  -- 1) Ca đã đóng: tiền dự kiến đã lưu khớp công thức két tính lại (phiếu / bill của ca đóng không đổi được nữa).
  SELECT string_agg(s.id::text || ' lưu ' || s.expected_cash || ' ≠ ' || (public.cash_shift_totals(s.id) ->> 'expected_cash'), '; ')
    INTO v_bad
    FROM public.cash_shifts s
   WHERE s.status = 'closed' AND s.expected_cash <> (public.cash_shift_totals(s.id) ->> 'expected_cash')::bigint;
  PERFORM pg_temp.must('closed_shift_expected', v_bad IS NULL, v_bad);

  SELECT string_agg(s.id::text, ', ') INTO v_bad
    FROM public.cash_shifts s
   WHERE s.status = 'closed' AND s.difference <> s.counted_cash - s.expected_cash;
  PERFORM pg_temp.must('closed_shift_difference', v_bad IS NULL, v_bad);

  SELECT string_agg(store_id::text, ', ') INTO v_bad
    FROM (SELECT store_id FROM public.cash_shifts WHERE status = 'open' GROUP BY store_id HAVING count(*) > 1) x;
  PERFORM pg_temp.must('one_open_shift_per_store', v_bad IS NULL, v_bad);

  -- 2) Quán đang bật ca: mọi phiếu TM ghi SAU lần bật gần nhất phải gắn ca (phiếu cũ trước khi bật, phiếu backfill
  --    122b thì không). Lần bật lấy từ nhật ký cài đặt (set_require_cash_shift ghi trước / sau).
  SELECT string_agg(e.id::text, ', ') INTO v_bad
    FROM public.cash_book_entries e
    JOIN public.store_workflow_settings w ON w.store_id = e.store_id AND w.require_cash_shift
    JOIN LATERAL (
      SELECT max(ev.created_at) AS turned_on_at
        FROM public.store_workflow_setting_events ev
       WHERE ev.store_id = e.store_id
         AND coalesce((ev.after_value ->> 'require_cash_shift')::boolean, false)
         AND NOT coalesce((ev.before_value ->> 'require_cash_shift')::boolean, false)
    ) t ON true
   WHERE e.method = 'cash' AND e.cash_shift_id IS NULL AND e.created_at > coalesce(t.turned_on_at, 'infinity'::timestamptz);
  PERFORM pg_temp.must('cash_entries_have_shift', v_bad IS NULL, v_bad);

  SELECT count(*) INTO v_n FROM public.cash_book_entries WHERE method = 'bank' AND cash_shift_id IS NOT NULL;
  PERFORM pg_temp.must('bank_entries_no_shift', v_n = 0, v_n::text);

  -- 3) Kho ↔ sổ (122b).
  SELECT string_agg(d.doc_no, ', ') INTO v_bad
    FROM public.inventory_documents d
    LEFT JOIN public.cash_book_entries e ON e.id = d.cash_book_entry_id
   WHERE d.kind = 'receipt' AND d.status = 'posted' AND d.paid_status = 'paid' AND d.total_amount BETWEEN 1 AND 2000000000
     AND (e.id IS NULL OR e.voided_at IS NOT NULL OR e.amount <> d.total_amount OR e.method <> d.paid_method
          OR e.source <> 'inventory_receipt' OR e.source_ref <> d.id);
  PERFORM pg_temp.must('paid_receipts_have_entry', v_bad IS NULL, v_bad);

  SELECT string_agg(d.doc_no, ', ') INTO v_bad
    FROM public.inventory_documents d
    JOIN public.cash_book_entries e ON e.id = d.cash_book_entry_id
   WHERE d.status = 'voided' AND e.voided_at IS NULL;
  PERFORM pg_temp.must('voided_receipts_entry_voided', v_bad IS NULL, v_bad);

  -- 4) Danh mục hệ thống "Nhập hàng" ở mọi quán (seed + trigger quán mới).
  SELECT string_agg(s.id::text, ', ') INTO v_bad
    FROM public.stores s
   WHERE NOT EXISTS (SELECT 1 FROM public.cash_book_categories c
                      WHERE c.store_id = s.id AND c.is_system AND c.report_group = 'inventory_purchase');
  PERFORM pg_temp.must('system_category_every_store', v_bad IS NULL, v_bad);

  SELECT count(*) INTO v_n
    FROM public.bill_payments p JOIN public.cash_shifts s ON s.id = p.cash_shift_id
   WHERE s.store_id <> p.store_id;
  PERFORM pg_temp.must('bill_payments_shift_same_store', v_n = 0, v_n::text);

  -- 5) Neo cho mig sau + lời vá 122b còn nguyên.
  PERFORM pg_temp.must('anchor_123_debt_cash',
    (SELECT (length(d) - length(replace(d, '  v_debt_cash := 0; -- mevo-anchor:123 cash_shift_totals.debt_cash', '')))
            / length('  v_debt_cash := 0; -- mevo-anchor:123 cash_shift_totals.debt_cash') = 1
       FROM (SELECT pg_get_functiondef('public.cash_shift_totals(uuid)'::regprocedure) AS d) x));
  PERFORM pg_temp.must('patch_122b_post',
    position('PERFORM public.inventory_receipt_cash_book(v_doc_id);'
             IN pg_get_functiondef('public.inventory_post_document(text,jsonb,jsonb,uuid)'::regprocedure)) > 0);
  PERFORM pg_temp.must('patch_122b_void',
    position('PERFORM public.inventory_receipt_cash_book_void(v_doc_id, p_reason);'
             IN pg_get_functiondef('public.inventory_void_document(uuid,text)'::regprocedure)) > 0);
  PERFORM pg_temp.must('patch_122_collect_gate',
    position('public.require_open_cash_shift(v_store)'
             IN pg_get_functiondef('public.collect_table_bill(uuid[],jsonb,integer,uuid)'::regprocedure)) > 0);

  -- 6) Hàm nội bộ không lộ cho client.
  SELECT string_agg(f, ', ') INTO v_bad FROM unnest(ARRAY[
    'public.require_open_cash_shift(uuid)', 'public.cash_shift_totals(uuid)', 'public.cash_book_system_category(uuid,text)',
    'public.cash_book_create_internal(uuid,text,text,uuid,bigint,text,text,text,uuid,uuid,uuid)',
    'public.cash_book_create_internal_result(uuid,text,text,uuid,bigint,text,text,text,uuid,uuid,uuid)',
    'public.cash_book_void_internal(uuid,text,uuid)', 'public.seed_cash_book_categories(uuid)',
    'public.cash_shift_report_json(uuid)', 'public.inventory_receipt_cash_book(uuid)',
    'public.inventory_receipt_cash_book_void(uuid,text)'
  ]) f
   WHERE has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE');
  PERFORM pg_temp.must('internal_privileges', v_bad IS NULL, v_bad);

  RAISE NOTICE 'TẤT CẢ CA ĐÃ PASS — giao dịch sẽ ROLLBACK, không để lại dữ liệu';
END
$verify$;

ROLLBACK;
