-- 125_financial_reports.sql — Báo cáo tài chính (chỉ đọc, Yên Garden Part 2): tổng ngày dùng chung, doanh thu theo
-- ngày / tháng (Task 7); thu chi, lãi lỗ (Task 8); công nợ phải thu (Task 9).
--
-- 1) report_day_totals(store, from, to): MỘT công thức tổng doanh thu cho một khoảng giờ — revenue, cash, bank, debt,
--    other, bills_count, discount_total. Thân hàm chép NGUYÊN các CTE money / keyed / pay và khối 'totals' của
--    get_bills_report (bản sau mig 123, chụp ở supabase/tests/prod-defs/125/get_bills_report.sql), chỉ đổi WHERE của
--    money sang report_paid_orders (mig 117) và thêm discount_total. Không viết lại cách chia TM / CK / nợ / khác.
-- 2) Vá tại chỗ get_bills_report: CTE money lọc qua report_paid_orders, khối 'totals' gọi report_day_totals.
--    Từ đây "đơn đã thu trong kỳ" chỉ còn ở report_paid_orders và tổng ngày chỉ còn ở report_day_totals:
--    doanh thu theo ngày của báo cáo tài chính = A04 ngày đó, cùng một hàm. Migration sau muốn đổi cách cộng tổng
--    ngày thì vá report_day_totals, KHÔNG vá get_bills_report. Danh sách bill vẫn do CTE keyed của get_bills_report
--    dựng (hai bên cùng khoá bill: test so bills.length = totals.bills_count).
-- 3) RPC chỉ đọc cho chủ quán + quản lý (is_store_back_office, mig 116). Thu ngân KHÔNG xem báo cáo tài chính.
--
-- Bản chụp get_bills_report dựng từ chuỗi migration trên pglite (112a + 112b + 122 + 123 trên prod-defs/112).
-- Controller PHẢI đối chiếu pg_get_functiondef trên prod với prod-defs/125/get_bills_report.sql trước khi áp: lệch thì
-- helper RAISE và cả migration dừng. Chữ ký các hàm cũ KHÔNG đổi; chỉ thêm hàm mới bằng CREATE FUNCTION.

-- ============================================================
-- 0) Điều kiện trước
-- ============================================================
DO $pre$
BEGIN
  IF to_regprocedure('public.report_paid_orders(uuid,timestamptz,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'mig 125: thiếu hàm report_paid_orders (mig 117)';
  END IF;
  IF to_regprocedure('public.report_period_bounds(uuid,date,date)') IS NULL THEN
    RAISE EXCEPTION 'mig 125: thiếu hàm report_period_bounds (mig 117)';
  END IF;
  IF to_regprocedure('public.is_store_back_office(uuid)') IS NULL THEN
    RAISE EXCEPTION 'mig 125: thiếu hàm is_store_back_office (mig 116)';
  END IF;
  IF to_regprocedure('public.inventory_cogs(uuid,date,date)') IS NULL THEN
    RAISE EXCEPTION 'mig 125: thiếu hàm inventory_cogs (mig 118)';
  END IF;
  IF to_regprocedure('public.business_day_bounds(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'mig 125: thiếu hàm business_day_bounds (mig 111)';
  END IF;
  IF to_regclass('public.bill_payment_lines') IS NULL OR to_regclass('public.debt_payments') IS NULL
     OR to_regclass('public.debt_payment_allocations') IS NULL OR to_regclass('public.cash_book_entries') IS NULL
     OR to_regclass('public.cash_book_categories') IS NULL THEN
    RAISE EXCEPTION 'mig 125: thiếu bảng của mig 112a / 122 / 123';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.bill_payment_lines'::regclass
       AND c.conname = 'bill_payment_lines_instrument_check'
       AND pg_get_constraintdef(c.oid) LIKE '%''debt''%') THEN
    RAISE EXCEPTION 'mig 125: bill_payment_lines.instrument chưa có ''debt'' (mig 123)';
  END IF;
END
$pre$;

-- ============================================================
-- 1) Tổng ngày dùng chung
-- ============================================================
-- Chép từ get_bills_report sau mig 123: money (chỉ giữ cột keyed / pay / totals dùng), keyed, pay (chỉ giữ cột
-- totals dùng), khối 'totals'. Đổi WHERE của money → report_paid_orders; thêm discount_total (= discount_total của
-- A04: COALESCE(discount_amount, 0) + bill_discount_amount). Window session_paid_at chạy trên đúng tập đơn như cũ.
CREATE FUNCTION public.report_day_totals(p_store_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH money AS (
    SELECT o.id, o.session_id, o.total_amount,
           o.bill_payment_id,
           COALESCE(o.discount_amount, 0) + o.bill_discount_amount AS discount_amount,
           CASE
             WHEN o.payment_instrument = 'mixed' THEN 'mixed'
             WHEN o.payment_instrument = 'debt' THEN 'debt'
             WHEN o.payment_instrument = 'cash' THEN 'cash'
             WHEN o.payment_instrument = 'bank' THEN 'bank'
             WHEN o.payment_instrument IS NULL AND o.payment_method = 'cash' THEN 'cash'
             WHEN o.payment_instrument IS NULL AND o.payment_method = 'bank_transfer' THEN 'bank'
             ELSE 'other'
           END AS bucket,
           s.close_reason, s.closed_by,
           MAX(o.payment_received_at) OVER (PARTITION BY o.session_id) AS session_paid_at
    FROM public.orders o
    LEFT JOIN public.table_sessions s ON s.id = o.session_id
    WHERE o.id IN (SELECT r.order_id FROM public.report_paid_orders(p_store_id, p_from, p_to) r)
  ),
  keyed AS (
    SELECT money.*,
           CASE
             WHEN bill_payment_id IS NOT NULL THEN 'P:' || bill_payment_id::text
             WHEN session_id IS NOT NULL AND close_reason = 'paid' AND session_paid_at IS NOT NULL
               THEN 'C:' || COALESCE(closed_by::text, '-') || '@' || session_paid_at::text
             WHEN session_id IS NOT NULL THEN 'S:' || session_id::text
             ELSE 'O:' || id::text
           END AS bill_key
    FROM money
  ),
  -- Cộng NGUYÊN các dòng khoản thu (xem ghi chú mig 112a trong get_bills_report: chỉ khớp doanh thu vì đơn đã thu
  -- không huỷ / sửa tiền được nữa).
  pay AS (
    SELECT bp.id AS payment_id,
           COALESCE(SUM(l.amount) FILTER (WHERE l.instrument = 'cash'), 0)::bigint AS cash,
           COALESCE(SUM(l.amount) FILTER (WHERE l.instrument = 'bank'), 0)::bigint AS bank,
           COALESCE(SUM(l.amount) FILTER (WHERE l.instrument = 'debt'), 0)::bigint AS debt
    FROM public.bill_payments bp
    LEFT JOIN public.bill_payment_lines l ON l.payment_id = bp.id
    WHERE bp.id IN (SELECT bill_payment_id FROM keyed WHERE bill_payment_id IS NOT NULL)
    GROUP BY bp.id
  )
  SELECT jsonb_build_object(
    'revenue', COALESCE(SUM(total_amount), 0),
    'cash',    COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'cash' AND bill_payment_id IS NULL), 0)
               + (SELECT COALESCE(SUM(cash), 0) FROM pay),
    'bank',    COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'bank' AND bill_payment_id IS NULL), 0)
               + (SELECT COALESCE(SUM(bank), 0) FROM pay),
    -- Bất biến TM + CK + nợ + khác = doanh thu đúng theo cách tính: khác = phần còn lại.
    'other',   COALESCE(SUM(total_amount), 0)
               - COALESCE(SUM(total_amount) FILTER (WHERE bucket IN ('cash', 'bank') AND bill_payment_id IS NULL), 0)
               - (SELECT COALESCE(SUM(cash + bank + debt), 0) FROM pay),
    'debt',    (SELECT COALESCE(SUM(debt), 0) FROM pay),
    'bills_count', COUNT(DISTINCT bill_key),
    'discount_total', COALESCE(SUM(discount_amount), 0))
  FROM keyed;
$$;

-- ============================================================
-- 2) Vá tại chỗ get_bills_report
-- ============================================================
-- Helper (chỉ sống trong phiên chạy migration), mẫu mig 111: chuỗi neo phải khớp ĐÚNG MỘT lần; đổi CRLF → LF
-- cho chuỗi neo / thay thế (bản checkout trên Windows có thể là CRLF).
CREATE OR REPLACE FUNCTION pg_temp.mevo_patch(p_sig text, p_from text, p_to text)
RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text; v_from text; v_to text; v_hits int;
BEGIN
  v_from := replace(p_from, E'\r\n', E'\n');
  v_to   := replace(p_to,   E'\r\n', E'\n');
  v_def  := pg_get_functiondef(p_sig::regprocedure);
  v_hits := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
  IF v_hits = 0 THEN
    RAISE EXCEPTION 'mig 125: % không còn chuỗi cần vá: %', p_sig, v_from;
  END IF;
  IF v_hits > 1 THEN
    RAISE EXCEPTION 'mig 125: % có hơn một chỗ khớp chuỗi cần vá: %', p_sig, v_from;
  END IF;
  EXECUTE replace(v_def, v_from, v_to);
END
$patch$;

-- (1) CTE money: điều kiện "đã thu trong kỳ" chuyển sang report_paid_orders (cùng điều kiện, mig 117 chép nguyên văn).
SELECT pg_temp.mevo_patch('public.get_bills_report(uuid,date)',
$a$      WHERE o.store_id = p_store_id
        AND o.status <> 'cancelled'
        AND (o.payment_received_at IS NOT NULL OR (o.payment_method = 'cash' AND o.status = 'paid'))
        AND COALESCE(o.payment_received_at, o.completed_at, o.updated_at) >= v_from
        AND COALESCE(o.payment_received_at, o.completed_at, o.updated_at) < v_to
    ),$a$,
$b$      WHERE o.id IN (SELECT r.order_id FROM public.report_paid_orders(p_store_id, v_from, v_to) r)
    ),$b$);

-- (2) Khối 'totals' → report_day_totals (thêm khoá discount_total, các khoá cũ giữ nguyên giá trị).
SELECT pg_temp.mevo_patch('public.get_bills_report(uuid,date)',
$a$      'totals', (
        SELECT jsonb_build_object(
          'revenue', COALESCE(SUM(total_amount), 0),
          'cash',    COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'cash' AND bill_payment_id IS NULL), 0)
                     + (SELECT COALESCE(SUM(cash), 0) FROM pay),
          'bank',    COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'bank' AND bill_payment_id IS NULL), 0)
                     + (SELECT COALESCE(SUM(bank), 0) FROM pay),
          -- Bất biến TM + CK + khác = doanh thu đúng theo cách tính: khác = phần còn lại.
          'other',   COALESCE(SUM(total_amount), 0)
                     - COALESCE(SUM(total_amount) FILTER (WHERE bucket IN ('cash', 'bank') AND bill_payment_id IS NULL), 0)
                     - (SELECT COALESCE(SUM(cash + bank + debt), 0) FROM pay),
          'debt',    (SELECT COALESCE(SUM(debt), 0) FROM pay),
          'bills_count', COUNT(DISTINCT bill_key))
        FROM keyed),$a$,
$b$      'totals', public.report_day_totals(p_store_id, v_from, v_to),$b$);

-- ============================================================
-- 3) Doanh thu theo ngày / tháng
-- ============================================================
-- 'day': mỗi ngày kinh doanh p_from … p_to một dòng (cả ngày 0đ), mỗi dòng = report_day_totals của ngày đó (= A04).
-- 'month': 12 tháng kết thúc ở tháng của p_to (bỏ qua p_from); date = ngày 1; khoảng = day_from của ngày 1 tới day_to
-- của ngày cuối tháng. Kết quả trả from = ngày 1 tháng đầu, to = ngày cuối tháng của p_to.
CREATE FUNCTION public.report_revenue_series(p_store_id uuid, p_from date, p_to date, p_grain text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first date;
  v_last  date;
  v_rows  jsonb;
BEGIN
  IF p_store_id IS NULL OR p_to IS NULL OR (p_grain = 'day' AND p_from IS NULL) THEN
    RAISE EXCEPTION 'Thiếu quán hoặc kỳ';
  END IF;
  IF NOT public.is_store_back_office(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền xem báo cáo quán này';
  END IF;

  IF p_grain IS NOT DISTINCT FROM 'day' THEN
    PERFORM 1 FROM public.report_period_bounds(p_store_id, p_from, p_to);
    v_first := p_from;
    v_last  := p_to;
    SELECT jsonb_agg(jsonb_build_object('date', g.d::date) || public.report_day_totals(p_store_id, b.day_from, b.day_to)
                     ORDER BY g.d)
      INTO v_rows
      FROM generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g(d)
      CROSS JOIN LATERAL public.business_day_bounds(p_store_id, g.d::date) b;
  ELSIF p_grain IS NOT DISTINCT FROM 'month' THEN
    -- Ép p_to sang timestamp (không múi giờ): date_trunc trên date sẽ chọn bản timestamptz theo múi giờ phiên.
    v_first := (date_trunc('month', p_to::timestamp) - interval '11 months')::date;
    v_last  := (date_trunc('month', p_to::timestamp) + interval '1 month' - interval '1 day')::date;
    SELECT jsonb_agg(jsonb_build_object('date', m.d::date)
                     || public.report_day_totals(p_store_id, f.day_from, t.day_to)
                     ORDER BY m.d)
      INTO v_rows
      FROM generate_series(v_first::timestamp, date_trunc('month', p_to::timestamp), interval '1 month') m(d)
      CROSS JOIN LATERAL public.business_day_bounds(p_store_id, m.d::date) f
      CROSS JOIN LATERAL public.business_day_bounds(
        p_store_id, (m.d + interval '1 month' - interval '1 day')::date) t;
  ELSE
    RAISE EXCEPTION 'Chế độ không hợp lệ';
  END IF;

  RETURN jsonb_build_object(
    'from', v_first, 'to', v_last, 'grain', p_grain,
    'rows', COALESCE(v_rows, '[]'::jsonb),
    'totals', (
      SELECT jsonb_build_object(
        'revenue',        COALESCE(SUM((r->>'revenue')::bigint), 0),
        'discount_total', COALESCE(SUM((r->>'discount_total')::bigint), 0),
        'cash',           COALESCE(SUM((r->>'cash')::bigint), 0),
        'bank',           COALESCE(SUM((r->>'bank')::bigint), 0),
        'debt',           COALESCE(SUM((r->>'debt')::bigint), 0),
        'other',          COALESCE(SUM((r->>'other')::bigint), 0),
        'bills_count',    COALESCE(SUM((r->>'bills_count')::bigint), 0))
      FROM jsonb_array_elements(COALESCE(v_rows, '[]'::jsonb)) r)
  );
END;
$$;

-- ============================================================
-- 4) Quyền. REVOKE FROM PUBLIC một mình không gỡ quyền Supabase cấp thẳng cho anon/authenticated.
-- ============================================================
REVOKE ALL ON FUNCTION public.report_day_totals(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.report_revenue_series(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_revenue_series(uuid, date, date, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
