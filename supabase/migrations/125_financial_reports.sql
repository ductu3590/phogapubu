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
-- 4) ALTER FUNCTION report_paid_orders … ROWS 50 (hàm của mig 117): chỉ đổi ước lượng số dòng cho planner, không đổi
--    thân hàm hay quyền.
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
-- 0b) Ước lượng số dòng của report_paid_orders (hàm mig 117 — ALTER, không thay thân hàm)
-- ============================================================
-- Hàm trả tập (SRF) mặc định được planner đoán 1000 dòng. Từ mig này `o.id IN (SELECT … FROM report_paid_orders(…))`
-- nằm trong get_bills_report (gọi 2 lần mỗi A04) và report_revenue_series (tới 366 lần mỗi kỳ): đoán 1000 dòng thì
-- planner dễ quét cả bảng orders. Một quán một ngày kinh doanh thường vài chục bill → 50.
ALTER FUNCTION public.report_paid_orders(uuid, timestamptz, timestamptz) ROWS 50;

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
-- 4) Thu chi (dòng tiền) theo hai quỹ: Tiền mặt, Ngân hàng
-- ============================================================
-- Phiếu sổ thu chi còn hiệu lực trong kỳ ngày kinh doanh, gom theo danh mục. Dùng chung cho thu chi và lãi lỗ.
CREATE FUNCTION public.report_cash_book_by_category(p_store_id uuid, p_from date, p_to date)
RETURNS TABLE(category_id uuid, kind text, name text, report_group text, sort_order integer, cash bigint, bank bigint)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT c.id, c.kind, c.name, c.report_group, c.sort_order,
         COALESCE(SUM(e.amount) FILTER (WHERE e.method = 'cash'), 0)::bigint,
         COALESCE(SUM(e.amount) FILTER (WHERE e.method = 'bank'), 0)::bigint
    FROM public.cash_book_entries e
    JOIN public.cash_book_categories c ON c.id = e.category_id
   WHERE e.store_id = p_store_id
     AND e.voided_at IS NULL
     AND e.business_date BETWEEN p_from AND p_to
   GROUP BY c.id, c.kind, c.name, c.report_group, c.sort_order
$$;

-- Tiền vào: Thu bill (TM / CK của tổng ngày) → Thu qua ví (phần 'khác' của tổng ngày, chỉ khi > 0, vào quỹ Ngân hàng)
-- → Thu nợ (lần trả chưa huỷ, NGÀY = debt_payments.business_date đọc thẳng) → từng danh mục phiếu thu.
-- Tiền ra: từng danh mục phiếu chi, kể cả "Nhập hàng" (phiếu chi 122b sinh từ phiếu nhập đã trả).
-- Ghi nợ (dòng 'debt' của bill) KHÔNG là tiền vào: tiền chỉ vào khi khách trả nợ.
CREATE FUNCTION public.report_cash_flow(p_store_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz;
  v_to   timestamptz;
  v_t    jsonb;
  v_in   jsonb;
  v_out  jsonb;
BEGIN
  IF p_store_id IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'Thiếu quán hoặc kỳ';
  END IF;
  IF NOT public.is_store_back_office(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền xem báo cáo quán này';
  END IF;
  SELECT b.period_from, b.period_to INTO v_from, v_to FROM public.report_period_bounds(p_store_id, p_from, p_to) b;

  v_t := public.report_day_totals(p_store_id, v_from, v_to);

  v_in := jsonb_build_array(jsonb_build_object(
    'key', 'bills', 'label', 'Thu bill', 'cash', (v_t->>'cash')::bigint, 'bank', (v_t->>'bank')::bigint));
  IF (v_t->>'other')::bigint > 0 THEN
    v_in := v_in || jsonb_build_object('key', 'wallet', 'label', 'Thu qua ví', 'cash', 0, 'bank', (v_t->>'other')::bigint);
  END IF;
  v_in := v_in || (
    SELECT jsonb_build_object('key', 'debt', 'label', 'Thu nợ',
             'cash', COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'), 0),
             'bank', COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'bank'), 0))
      FROM public.debt_payments p
     WHERE p.store_id = p_store_id AND p.voided_at IS NULL AND p.business_date BETWEEN p_from AND p_to);
  v_in := v_in || COALESCE((
    SELECT jsonb_agg(jsonb_build_object('key', 'cat:' || r.category_id, 'label', r.name, 'cash', r.cash, 'bank', r.bank)
                     ORDER BY r.sort_order, r.name)
      FROM public.report_cash_book_by_category(p_store_id, p_from, p_to) r
     WHERE r.kind = 'receipt'), '[]'::jsonb);

  v_out := COALESCE((
    SELECT jsonb_agg(jsonb_build_object('key', 'cat:' || r.category_id, 'label', r.name, 'report_group', r.report_group,
                                        'cash', r.cash, 'bank', r.bank)
                     ORDER BY r.sort_order, r.name)
      FROM public.report_cash_book_by_category(p_store_id, p_from, p_to) r
     WHERE r.kind = 'payment'), '[]'::jsonb);

  RETURN (
    WITH i AS (
      SELECT COALESCE(SUM((x->>'cash')::bigint), 0) AS cash, COALESCE(SUM((x->>'bank')::bigint), 0) AS bank
        FROM jsonb_array_elements(v_in) x),
    o AS (
      SELECT COALESCE(SUM((x->>'cash')::bigint), 0) AS cash, COALESCE(SUM((x->>'bank')::bigint), 0) AS bank
        FROM jsonb_array_elements(v_out) x)
    SELECT jsonb_build_object(
      'from', p_from, 'to', p_to,
      'funds', jsonb_build_object(
        'cash', jsonb_build_object('in', i.cash, 'out', o.cash, 'net', i.cash - o.cash),
        'bank', jsonb_build_object('in', i.bank, 'out', o.bank, 'net', i.bank - o.bank)),
      'inflows', v_in,
      'outflows', v_out)
    FROM i, o
  );
END;
$$;

-- ============================================================
-- 5) Lãi lỗ
-- ============================================================
--   revenue         = report_day_totals(kỳ).revenue (= cộng A04 từng ngày)
--   cogs_ingredient = 0 khi inventory_cogs.ingredient_uncounted, ngược lại ingredient_cogs
--   cogs_total      = goods_cogs + cogs_ingredient
--   gross_profit    = revenue − cogs_total
--   net_profit      = gross_profit − chi phí hoạt động − hao hụt (writeoff_cost) + thu khác
-- Giá vốn lấy TỔNG của inventory_cogs, KHÔNG cộng lại items: khi nguyên liệu chưa kiểm kho, các dòng items vẫn mang
-- cogs riêng (hợp đồng KHO). Phiếu chi "Nhập hàng" (inventory_purchase) KHÔNG vào lãi lỗ — tiền hàng đã nằm trong giá
-- vốn — chỉ báo ở excluded cùng rút tiền chủ quán (owner_draw) và chuyển quỹ (cash_transfer).
-- inventory_cogs tự kiểm is_store_back_office theo auth.uid() của người gọi (hàm này SECURITY DEFINER không đổi uid).
CREATE FUNCTION public.report_profit_loss(p_store_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from       timestamptz;
  v_to         timestamptz;
  v_revenue    bigint;
  v_cogs       jsonb;
  v_goods      bigint;
  v_ingredient bigint;
  v_writeoff   bigint;
  v_uncounted  boolean;
  v_opex       jsonb;
  v_income     jsonb;
  v_opex_total bigint;
  v_income_total bigint;
BEGIN
  IF p_store_id IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'Thiếu quán hoặc kỳ';
  END IF;
  IF NOT public.is_store_back_office(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền xem báo cáo quán này';
  END IF;
  SELECT b.period_from, b.period_to INTO v_from, v_to FROM public.report_period_bounds(p_store_id, p_from, p_to) b;

  v_revenue := (public.report_day_totals(p_store_id, v_from, v_to)->>'revenue')::bigint;

  v_cogs := public.inventory_cogs(p_store_id, p_from, p_to);
  v_uncounted  := COALESCE((v_cogs->>'ingredient_uncounted')::boolean, false);
  v_goods      := COALESCE((v_cogs->>'goods_cogs')::bigint, 0);
  v_ingredient := CASE WHEN v_uncounted THEN 0 ELSE COALESCE((v_cogs->>'ingredient_cogs')::bigint, 0) END;
  v_writeoff   := COALESCE((v_cogs->>'writeoff_cost')::bigint, 0);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('category_id', r.category_id, 'name', r.name, 'amount', r.cash + r.bank)
                            ORDER BY r.cash + r.bank DESC, r.name), '[]'::jsonb),
         COALESCE(SUM(r.cash + r.bank), 0)
    INTO v_opex, v_opex_total
    FROM public.report_cash_book_by_category(p_store_id, p_from, p_to) r
   WHERE r.kind = 'payment' AND r.report_group = 'operating_expense';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('category_id', r.category_id, 'name', r.name, 'amount', r.cash + r.bank)
                            ORDER BY r.cash + r.bank DESC, r.name), '[]'::jsonb),
         COALESCE(SUM(r.cash + r.bank), 0)
    INTO v_income, v_income_total
    FROM public.report_cash_book_by_category(p_store_id, p_from, p_to) r
   WHERE r.kind = 'receipt' AND r.report_group = 'other_income';

  RETURN jsonb_build_object(
    'from', p_from, 'to', p_to,
    'revenue', v_revenue,
    'cogs_goods', v_goods,
    'cogs_ingredient', v_ingredient,
    'cogs_total', v_goods + v_ingredient,
    'gross_profit', v_revenue - (v_goods + v_ingredient),
    'operating_expenses', jsonb_build_object('total', v_opex_total, 'rows', v_opex),
    'writeoff_cost', v_writeoff,
    'other_income', jsonb_build_object('total', v_income_total, 'rows', v_income),
    'net_profit', v_revenue - (v_goods + v_ingredient) - v_opex_total - v_writeoff + v_income_total,
    'excluded', (
      SELECT jsonb_build_object(
        'inventory_purchase', COALESCE(SUM(r.cash + r.bank) FILTER (WHERE r.report_group = 'inventory_purchase'), 0),
        'owner_draw',         COALESCE(SUM(r.cash + r.bank) FILTER (WHERE r.report_group = 'owner_draw'), 0),
        'cash_transfer',      COALESCE(SUM(r.cash + r.bank) FILTER (WHERE r.report_group = 'cash_transfer'), 0))
        FROM public.report_cash_book_by_category(p_store_id, p_from, p_to) r),
    'warnings', jsonb_build_object(
      'ingredient_uncounted', v_uncounted,
      'missing_cost_items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('inventory_item_id', x->'inventory_item_id', 'name', x->'name') ORDER BY x->>'name')
          FROM jsonb_array_elements(COALESCE(v_cogs->'items', '[]'::jsonb)) x
         WHERE COALESCE((x->>'missing_cost')::boolean, false)), '[]'::jsonb))
  );
END;
$$;

-- ============================================================
-- 6) Công nợ phải thu theo kỳ (số nợ TẠI MỐC, tự định nghĩa — KHÔNG dùng debt_customer_bills của mig 123: hàm đó là
--    số còn nợ LÚC NÀY, cộng mọi lần trả chưa huỷ bất kể lần trả xảy ra khi nào)
-- ============================================================
-- • Bill nợ: dòng 'debt' của bill_payments có debt_customer_id. Ngày phát sinh = business_date_of(quán, collected_at)
--   (tính lúc đọc, nên đổi giờ bắt đầu ngày thì bill dời ngày như A04).
-- • Lần trả hiệu lực: debt_payments.voided_at IS NULL (đã huỷ thì coi như chưa từng có, kể cả khi huỷ sau kỳ).
--   Ngày trả = debt_payments.business_date ĐỌC THẲNG (ngày kinh doanh lúc ghi, lưu sẵn) — KHÔNG tính lại bằng
--   business_date_of(created_at). Hệ quả chấp nhận có chủ đích: đổi giờ bắt đầu ngày làm bill dời ngày nhưng lần trả
--   nợ thì không. Tiền trả vào từng bill = debt_payment_allocations.amount.
-- • opening = phát sinh trước p_from − trả trước p_from; incurred = phát sinh trong kỳ; collected = trả trong kỳ;
--   closing = opening + incurred − collected.
-- • Mỗi bill còn nợ tại p_to = số nợ − tiền trả tới hết p_to; tuổi = p_to − ngày phát sinh: 0–7, 8–30, > 30.
--   oldest_open_date = ngày phát sinh nhỏ nhất của bill còn nợ > 0 tại p_to.
-- • Chỉ trả khách có ít nhất một trong opening, incurred, collected, closing khác 0. Sắp closing DESC, tên.
CREATE FUNCTION public.report_receivables(p_store_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF p_store_id IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'Thiếu quán hoặc kỳ';
  END IF;
  IF NOT public.is_store_back_office(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền xem báo cáo quán này';
  END IF;
  -- Kiểm kỳ (ngược, quá 366 ngày) dùng chung với các báo cáo khác; mốc giờ không cần vì mọi thứ so theo ngày.
  PERFORM 1 FROM public.report_period_bounds(p_store_id, p_from, p_to);

  WITH bills AS (
    SELECT bp.id, bp.debt_customer_id AS customer_id,
           public.business_date_of(p_store_id, bp.collected_at) AS incurred_on,
           SUM(l.amount)::bigint AS debt
      FROM public.bill_payments bp
      JOIN public.bill_payment_lines l ON l.payment_id = bp.id AND l.instrument = 'debt'
     WHERE bp.store_id = p_store_id AND bp.debt_customer_id IS NOT NULL
     GROUP BY bp.id, bp.debt_customer_id, bp.collected_at
  ),
  -- Ngày hiệu lực của một lần trả vào một bill = GREATEST(debt_payments.business_date, ngày phát sinh của bill).
  -- Vì bill tính ngày lúc đọc còn lần trả lưu ngày lúc ghi, đổi giờ bắt đầu ngày có thể làm lần trả mang ngày TRƯỚC
  -- bill của nó (bill 04:30 sáng dời sang ngày sau). Không kẹp thì kỳ bắt đầu ở ngày mới của bill ra đầu kỳ âm
  -- (0 − tiền trả "trước kỳ") còn đã thu = 0. Kẹp về ngày của bill: lần trả rơi đúng kỳ của bill, đầu kỳ mỗi bill
  -- không âm, và bill phát sinh sau p_to kéo luôn lần trả của nó ra ngoài kỳ (hai bên cùng không tính).
  paid AS (
    SELECT a.bill_payment_id,
           COALESCE(SUM(a.amount) FILTER (WHERE GREATEST(dp.business_date, b.incurred_on) < p_from), 0)::bigint AS before_period,
           COALESCE(SUM(a.amount) FILTER (WHERE GREATEST(dp.business_date, b.incurred_on) BETWEEN p_from AND p_to), 0)::bigint AS in_period
      FROM public.debt_payment_allocations a
      JOIN public.debt_payments dp ON dp.id = a.debt_payment_id
      JOIN bills b ON b.id = a.bill_payment_id
     WHERE dp.store_id = p_store_id AND dp.voided_at IS NULL
     GROUP BY a.bill_payment_id
  ),
  per_bill AS (
    SELECT b.customer_id, b.incurred_on, b.debt,
           COALESCE(p.before_period, 0) AS before_period,
           COALESCE(p.in_period, 0) AS in_period,
           b.debt - COALESCE(p.before_period, 0) - COALESCE(p.in_period, 0) AS open_at_end,
           p_to - b.incurred_on AS age
      FROM bills b
      LEFT JOIN paid p ON p.bill_payment_id = b.id
     WHERE b.incurred_on <= p_to
  ),
  per_customer AS (
    SELECT pb.customer_id,
           (COALESCE(SUM(pb.debt) FILTER (WHERE pb.incurred_on < p_from), 0) - COALESCE(SUM(pb.before_period), 0))::bigint AS opening,
           COALESCE(SUM(pb.debt) FILTER (WHERE pb.incurred_on >= p_from), 0)::bigint AS incurred,
           COALESCE(SUM(pb.in_period), 0)::bigint AS collected,
           MIN(pb.incurred_on) FILTER (WHERE pb.open_at_end > 0) AS oldest_open_date,
           COALESCE(SUM(pb.open_at_end) FILTER (WHERE pb.open_at_end > 0 AND pb.age <= 7), 0)::bigint AS age_0_7,
           COALESCE(SUM(pb.open_at_end) FILTER (WHERE pb.open_at_end > 0 AND pb.age BETWEEN 8 AND 30), 0)::bigint AS age_8_30,
           COALESCE(SUM(pb.open_at_end) FILTER (WHERE pb.open_at_end > 0 AND pb.age > 30), 0)::bigint AS age_over_30
      FROM per_bill pb
     GROUP BY pb.customer_id
  ),
  shown AS (
    SELECT c.id AS customer_id, c.name, c.phone, c.kind,
           x.opening, x.incurred, x.collected, x.opening + x.incurred - x.collected AS closing,
           x.oldest_open_date, x.age_0_7, x.age_8_30, x.age_over_30
      FROM per_customer x
      JOIN public.debt_customers c ON c.id = x.customer_id AND c.store_id = p_store_id
     WHERE x.opening <> 0 OR x.incurred <> 0 OR x.collected <> 0 OR x.opening + x.incurred - x.collected <> 0
  )
  SELECT jsonb_build_object(
    'from', p_from, 'to', p_to,
    'totals', jsonb_build_object(
      'opening',     COALESCE(SUM(s.opening), 0),
      'incurred',    COALESCE(SUM(s.incurred), 0),
      'collected',   COALESCE(SUM(s.collected), 0),
      'closing',     COALESCE(SUM(s.closing), 0),
      'age_0_7',     COALESCE(SUM(s.age_0_7), 0),
      'age_8_30',    COALESCE(SUM(s.age_8_30), 0),
      'age_over_30', COALESCE(SUM(s.age_over_30), 0)),
    'rows', COALESCE(jsonb_agg(jsonb_build_object(
      'customer_id', s.customer_id, 'name', s.name, 'phone', s.phone, 'kind', s.kind,
      'opening', s.opening, 'incurred', s.incurred, 'collected', s.collected, 'closing', s.closing,
      'oldest_open_date', s.oldest_open_date,
      'age_0_7', s.age_0_7, 'age_8_30', s.age_8_30, 'age_over_30', s.age_over_30
    ) ORDER BY s.closing DESC, s.name), '[]'::jsonb))
    INTO v_rows
    FROM shown s;

  RETURN v_rows;
END;
$$;

-- ============================================================
-- 7) Quyền. REVOKE FROM PUBLIC một mình không gỡ quyền Supabase cấp thẳng cho anon/authenticated.
-- ============================================================
REVOKE ALL ON FUNCTION public.report_day_totals(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_cash_book_by_category(uuid, date, date) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.report_cash_flow(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_cash_flow(uuid, date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.report_profit_loss(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_profit_loss(uuid, date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.report_receivables(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_receivables(uuid, date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.report_revenue_series(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_revenue_series(uuid, date, date, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
