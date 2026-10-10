-- 092 (PA-1, 2026-10-07): Báo cáo NGÀY theo bill cho tab Báo cáo (thay dashboard cũ).
-- Chỉ ĐỌC. Tiền tính ở đây, client chỉ hiển thị. Ngày theo giờ Việt Nam.
-- Luật "tiền thật" phải khớp admin-web/lib/revenue.ts (hasRealMoney):
--   status <> 'cancelled' và (payment_received_at có giá trị, hoặc legacy cash + status 'paid').
-- Một bill = các đơn có tiền trong ngày cùng khoá:
--   • đơn của phiên đã đóng → closed_by@closed_at. Gộp bill N mâm chạy close_table_session trong MỘT
--     transaction nên now() trùng nhau → N phiên tự gom thành một dòng;
--   • phiên chưa đóng / đóng vì hết hạn → S:<session_id>;  • đơn không phiên (trả trước) → O:<order_id>.
-- PA-2 sẽ CREATE OR REPLACE hàm này ở file riêng để đổi kiểm quyền sang is_store_pos_operator.

CREATE OR REPLACE FUNCTION public.get_daily_report(p_store_id uuid, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from timestamptz;
  v_to   timestamptz;
BEGIN
  IF p_store_id IS NULL OR p_date IS NULL THEN
    RAISE EXCEPTION 'Thiếu quán hoặc ngày';
  END IF;
  IF NOT public.is_store_owner_of(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền xem báo cáo quán này';
  END IF;

  v_from := (p_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_to   := ((p_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN (
    WITH money AS (
      SELECT o.id, o.session_id, o.table_id, o.order_type, o.total_amount, m.received_at,
             CASE
               WHEN o.payment_instrument = 'cash' THEN 'cash'
               WHEN o.payment_instrument = 'bank' THEN 'bank'
               WHEN o.payment_instrument IS NULL AND o.payment_method = 'cash' THEN 'cash'
               WHEN o.payment_instrument IS NULL AND o.payment_method = 'bank_transfer' THEN 'bank'
               ELSE 'other'
             END AS bucket,
             o.payment_received_by AS received_by,
             CASE
               -- Chỉ phiên ĐƯỢC THU TIỀN mới gom theo giờ đóng: phiên hết hạn do job tự đóng cũng trùng
               -- now() nếu job đóng nhiều phiên một lượt → gom theo giờ sẽ gộp nhầm nhiều bàn thành một bill.
               WHEN o.session_id IS NOT NULL AND s.close_reason = 'paid' AND s.closed_at IS NOT NULL
                 THEN 'C:' || COALESCE(s.closed_by::text, '-') || '@' || s.closed_at::text
               WHEN o.session_id IS NOT NULL THEN 'S:' || o.session_id::text
               ELSE 'O:' || o.id::text
             END AS bill_key
      FROM public.orders o
      LEFT JOIN public.table_sessions s ON s.id = o.session_id
      CROSS JOIN LATERAL (
        SELECT COALESCE(o.payment_received_at, o.completed_at, o.updated_at) AS received_at
      ) m
      WHERE o.store_id = p_store_id
        AND o.status <> 'cancelled'
        AND (o.payment_received_at IS NOT NULL OR (o.payment_method = 'cash' AND o.status = 'paid'))
        AND m.received_at >= v_from AND m.received_at < v_to
    ),
    bills AS (
      SELECT bill_key,
             MAX(received_at) AS paid_at,
             SUM(total_amount)::bigint AS total,
             CASE WHEN COUNT(DISTINCT bucket) = 1 THEN MIN(bucket) ELSE 'mixed' END AS instrument,
             COALESCE(array_agg(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL), '{}'::uuid[]) AS session_ids,
             array_agg(id) AS order_ids,
             (array_agg(received_by) FILTER (WHERE received_by IS NOT NULL))[1] AS received_by,
             MIN(order_type) AS order_type
      FROM money
      GROUP BY bill_key
    )
    SELECT jsonb_build_object(
      'date', p_date,
      'totals', (
        SELECT jsonb_build_object(
          'revenue', COALESCE(SUM(total_amount), 0),
          'cash',    COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'cash'), 0),
          'bank',    COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'bank'), 0),
          'other',   COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'other'), 0),
          'bills_count', COUNT(DISTINCT bill_key))
        FROM money),
      -- Bàn đang có khách lúc gọi (không phụ thuộc ngày) + tạm tính các đơn chưa thu của phiên đang mở.
      'open', jsonb_build_object(
        'tables_count', (
          SELECT COUNT(*) FROM public.session_tables st
          JOIN public.table_sessions s ON s.id = st.session_id
          WHERE s.store_id = p_store_id AND s.status = 'open' AND st.is_open),
        'provisional_total', (
          SELECT COALESCE(SUM(o.total_amount), 0) FROM public.orders o
          JOIN public.table_sessions s ON s.id = o.session_id
          WHERE s.store_id = p_store_id AND s.status = 'open'
            AND o.status <> 'cancelled' AND o.rejected_at IS NULL
            AND o.payment_received_at IS NULL)),
      'bills', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'key', b.bill_key,
          'paid_at', b.paid_at,
          'session_ids', to_jsonb(b.session_ids),
          'order_ids', to_jsonb(b.order_ids),
          'merged', COALESCE(array_length(b.session_ids, 1), 0) > 1,
          'total', b.total,
          'instrument', b.instrument,
          'items_count', (
            SELECT COALESCE(SUM(oi.quantity), 0) FROM public.order_items oi
            WHERE oi.order_id = ANY(b.order_ids) AND oi.void_type IS DISTINCT FROM 'cancelled'),
          'table_label', COALESCE(
            (SELECT string_agg(DISTINCT t.table_number, ', ')
               FROM public.session_tables st JOIN public.tables t ON t.id = st.table_id
              WHERE st.session_id = ANY(b.session_ids)),
            (SELECT string_agg(DISTINCT t.table_number, ', ')
               FROM public.orders o JOIN public.tables t ON t.id = o.table_id
              WHERE o.id = ANY(b.order_ids)),
            CASE b.order_type WHEN 'pickup' THEN 'Mang về' WHEN 'delivery' THEN 'Ship' ELSE '—' END),
          'received_by_name', (
            SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), u.email)
            FROM auth.users u WHERE u.id = b.received_by)
        ) ORDER BY b.paid_at DESC), '[]'::jsonb)
        FROM bills b),
      'adjustments', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'at', oi.voided_at,
          'item_name', oi.item_name,
          'quantity', oi.quantity,
          'amount', (oi.item_price + COALESCE(tp.price, 0)) * oi.quantity,
          'type', oi.void_type,
          'reason', oi.void_reason,
          'table_label', COALESCE(
            (SELECT string_agg(DISTINCT t.table_number, ', ')
               FROM public.session_tables st JOIN public.tables t ON t.id = st.table_id
              WHERE st.session_id = o.session_id),
            (SELECT t.table_number FROM public.tables t WHERE t.id = o.table_id),
            '—'),
          'by_name', (
            SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), u.email)
            FROM auth.users u WHERE u.id = oi.voided_by)
        ) ORDER BY oi.voided_at DESC), '[]'::jsonb)
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        LEFT JOIN LATERAL (
          SELECT SUM(COALESCE((x->>'price')::integer, 0)) AS price
          FROM jsonb_array_elements(COALESCE(oi.selected_toppings, '[]'::jsonb)) x
        ) tp ON true
        WHERE o.store_id = p_store_id
          AND oi.void_type IS NOT NULL
          AND oi.voided_at >= v_from AND oi.voided_at < v_to)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_daily_report(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_report(uuid, date) TO authenticated;
