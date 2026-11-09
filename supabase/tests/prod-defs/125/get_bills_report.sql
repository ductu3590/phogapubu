CREATE OR REPLACE FUNCTION public.get_bills_report(p_store_id uuid, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from  timestamptz;
  v_to    timestamptz;
  v_today boolean;
BEGIN
  IF p_store_id IS NULL OR p_date IS NULL THEN
    RAISE EXCEPTION 'Thiếu quán hoặc ngày';
  END IF;
  IF NOT public.is_store_pos_operator(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền xem báo cáo quán này';
  END IF;

  SELECT b.day_from, b.day_to INTO v_from, v_to FROM public.business_day_bounds(p_store_id, p_date) b;
  v_today := p_date = public.current_business_date(p_store_id);

  RETURN (
    WITH money AS (
      SELECT o.id, o.session_id, o.order_type, o.total_amount, o.created_at,
             o.bill_payment_id,
             COALESCE(o.discount_amount, 0) + o.bill_discount_amount AS discount_amount,
             o.bill_discount_amount AS bill_disc,
             NULLIF(btrim(o.customer_name), '') AS customer_name,
             COALESCE(o.payment_received_at, o.completed_at, o.updated_at) AS received_at,
             CASE
               WHEN o.payment_instrument = 'mixed' THEN 'mixed'
               WHEN o.payment_instrument = 'debt' THEN 'debt'
               WHEN o.payment_instrument = 'cash' THEN 'cash'
               WHEN o.payment_instrument = 'bank' THEN 'bank'
               WHEN o.payment_instrument IS NULL AND o.payment_method = 'cash' THEN 'cash'
               WHEN o.payment_instrument IS NULL AND o.payment_method = 'bank_transfer' THEN 'bank'
               ELSE 'other'
             END AS bucket,
             o.payment_received_by AS received_by,
             s.close_reason, s.closed_by, s.opened_at AS session_opened_at,
             MAX(o.payment_received_at) OVER (PARTITION BY o.session_id) AS session_paid_at
      FROM public.orders o
      LEFT JOIN public.table_sessions s ON s.id = o.session_id
      WHERE o.store_id = p_store_id
        AND o.status <> 'cancelled'
        AND (o.payment_received_at IS NOT NULL OR (o.payment_method = 'cash' AND o.status = 'paid'))
        AND COALESCE(o.payment_received_at, o.completed_at, o.updated_at) >= v_from
        AND COALESCE(o.payment_received_at, o.completed_at, o.updated_at) < v_to
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
    -- mig 112a: pay cộng NGUYÊN các dòng khoản thu, còn doanh thu cộng đơn trong keyed. Hai số chỉ khớp
    -- vì đơn đã thu không bị huỷ / sửa tiền nữa (chặn ở mig 038 cancel_order, 046 bỏ/tặng món, 098 sửa
    -- số lượng, server action cancelOrder của admin-web lọc payment_received_at IS NULL, và mig 112b: trigger
    -- trg_orders_block_client_money_write chặn client huỷ / sửa tiền đơn đã thu). Mở đường nào huỷ/sửa đơn đã
    -- thu thì phải sửa cả chỗ này, không thì 'other' âm.
    pay AS (
      SELECT bp.id AS payment_id, bp.cash_given, bp.change_amount,
             COALESCE(SUM(l.amount) FILTER (WHERE l.instrument = 'cash'), 0)::bigint AS cash,
             COALESCE(SUM(l.amount) FILTER (WHERE l.instrument = 'bank'), 0)::bigint AS bank,
             COALESCE(SUM(l.amount) FILTER (WHERE l.instrument = 'debt'), 0)::bigint AS debt,
             COALESCE(jsonb_agg(jsonb_build_object('instrument', l.instrument, 'amount', l.amount)
                      ORDER BY array_position(ARRAY['cash','bank','debt'], l.instrument)) FILTER (WHERE l.id IS NOT NULL), '[]'::jsonb) AS lines
      FROM public.bill_payments bp
      LEFT JOIN public.bill_payment_lines l ON l.payment_id = bp.id
      WHERE bp.id IN (SELECT bill_payment_id FROM keyed WHERE bill_payment_id IS NOT NULL)
      GROUP BY bp.id
    ),
    bills AS (
      SELECT bill_key,
             MAX(received_at) AS paid_at,
             MIN(COALESCE(session_opened_at, created_at)) AS opened_at,
             SUM(total_amount)::bigint AS total,
             SUM(discount_amount)::bigint AS discount_total,
             SUM(bill_disc)::bigint AS bill_discount,
             CASE WHEN COUNT(DISTINCT bucket) = 1 THEN MIN(bucket) ELSE 'mixed' END AS instrument,
             COALESCE(array_agg(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL), '{}'::uuid[]) AS session_ids,
             array_agg(id ORDER BY created_at) AS order_ids,
             (array_agg(received_by) FILTER (WHERE received_by IS NOT NULL))[1] AS received_by,
             (array_agg(customer_name ORDER BY created_at) FILTER (WHERE customer_name IS NOT NULL))[1] AS order_customer,
             MIN(order_type) AS order_type,
             (array_agg(bill_payment_id))[1] AS payment_id
      FROM keyed
      GROUP BY bill_key
    ),
    open_sessions AS (
      SELECT s.id, s.opened_at, s.is_open_ordering, s.status = 'closed' AS expired,
             COALESCE(array_agg(o.id ORDER BY o.created_at) FILTER (WHERE o.id IS NOT NULL), '{}'::uuid[]) AS order_ids,
             COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_received_at IS NULL), 0)::bigint AS provisional_total
      FROM public.table_sessions s
      LEFT JOIN public.orders o
        ON o.session_id = s.id AND o.status <> 'cancelled' AND o.rejected_at IS NULL
      WHERE s.store_id = p_store_id
        AND ((s.status = 'open' AND v_today)
          OR (s.status = 'closed' AND s.close_reason = 'expired' AND s.opened_at >= v_from AND s.opened_at < v_to))
      GROUP BY s.id
      HAVING s.status = 'open' OR COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_received_at IS NULL), 0) > 0
    ),
    awaiting_orders AS (
      SELECT o.*
      FROM public.orders o
      WHERE o.store_id = p_store_id
        AND o.session_id IS NULL
        AND o.status NOT IN ('cancelled', 'paid')
        AND o.payment_received_at IS NULL
        AND o.order_source <> 'reservation_preorder'
        AND (o.payment_method IN ('cash', 'bank_transfer')
             OR (o.payment_method = 'zalo_checkout' AND o.payment_instrument IS DISTINCT FROM 'wallet'))
        AND o.created_at >= v_from AND o.created_at < v_to
    )
    SELECT jsonb_build_object(
      'date', p_date, 'day_from', v_from, 'day_to', v_to,
      'debt_collections', (SELECT jsonb_build_object('cash', COALESCE(SUM(amount) FILTER (WHERE method = 'cash'), 0), 'bank', COALESCE(SUM(amount) FILTER (WHERE method = 'bank'), 0), 'count', COUNT(*)) FROM public.debt_payments WHERE store_id = p_store_id AND business_date = p_date AND voided_at IS NULL),
      'totals', (
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
        FROM keyed),
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
          'opened_at', b.opened_at,
          'session_ids', to_jsonb(b.session_ids),
          'order_ids', to_jsonb(b.order_ids),
          'merged', COALESCE(array_length(b.session_ids, 1), 0) > 1,
          'tables_count', (SELECT COUNT(DISTINCT st.table_id) FROM public.session_tables st WHERE st.session_id = ANY(b.session_ids)),
          'total', b.total,
          'discount_total', b.discount_total,
          'bill_discount', b.bill_discount,
          'instrument', b.instrument,
          'debt_customer', (SELECT jsonb_build_object('id', dc.id, 'name', dc.name) FROM public.bill_payments bp JOIN public.debt_customers dc ON dc.id = bp.debt_customer_id WHERE bp.id = b.payment_id),
          'payments', COALESCE((SELECT p.lines FROM pay p WHERE p.payment_id = b.payment_id), '[]'::jsonb),
          'cash_given', (SELECT p.cash_given FROM pay p WHERE p.payment_id = b.payment_id),
          'change_amount', (SELECT p.change_amount FROM pay p WHERE p.payment_id = b.payment_id),
          'order_type', b.order_type,
          'items_count', (
            SELECT COALESCE(SUM(oi.quantity), 0) FROM public.order_items oi
            WHERE oi.order_id = ANY(b.order_ids) AND oi.void_type IS DISTINCT FROM 'cancelled'),
          'table_label', public.bills_report_table_label(b.session_ids, b.order_ids, b.order_type),
          'customer_name', COALESCE(
            (SELECT NULLIF(btrim(r.customer_name), '') FROM public.reservations r
              WHERE r.session_id = ANY(b.session_ids) ORDER BY r.arrived_at NULLS LAST LIMIT 1),
            b.order_customer),
          'party_size', (SELECT SUM(r.party_size) FROM public.reservations r WHERE r.session_id = ANY(b.session_ids)),
          'adjustments_count',
            (SELECT COUNT(*) FROM public.order_items oi WHERE oi.order_id = ANY(b.order_ids) AND oi.void_type IS NOT NULL)
            + (SELECT COUNT(*) FROM public.order_item_quantity_changes c WHERE c.order_id = ANY(b.order_ids)),
          'received_by_name', (
            SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), u.email)
            FROM auth.users u WHERE u.id = b.received_by)
        ) ORDER BY b.paid_at DESC), '[]'::jsonb)
        FROM bills b),
      'waiting', (
        SELECT COALESCE(jsonb_agg(w.j ORDER BY w.opened_at DESC), '[]'::jsonb)
        FROM (
          SELECT os.opened_at, jsonb_build_object(
            'key', 'S:' || os.id::text,
            'session_ids', jsonb_build_array(os.id),
            'order_ids', to_jsonb(os.order_ids),
            'opened_at', os.opened_at,
            'is_tray', os.is_open_ordering,
            'expired', os.expired,
            'tables_count', (SELECT COUNT(*) FROM public.session_tables st
                              WHERE st.session_id = os.id AND (st.is_open OR os.expired)),
            'table_label', COALESCE(
              (SELECT string_agg(t.table_number, ', ' ORDER BY t.table_number)
                 FROM public.session_tables st JOIN public.tables t ON t.id = st.table_id
                WHERE st.session_id = os.id AND (st.is_open OR os.expired)),
              '—'),
            'order_type', 'dine_in',
            'customer_name', (SELECT NULLIF(btrim(r.customer_name), '') FROM public.reservations r
                               WHERE r.session_id = os.id ORDER BY r.arrived_at NULLS LAST LIMIT 1),
            'party_size', (SELECT SUM(r.party_size) FROM public.reservations r WHERE r.session_id = os.id),
            'items_count', (
              SELECT COALESCE(SUM(oi.quantity), 0) FROM public.order_items oi
              JOIN public.orders o ON o.id = oi.order_id
              WHERE o.id = ANY(os.order_ids) AND o.payment_received_at IS NULL
                AND oi.void_type IS DISTINCT FROM 'cancelled'),
            'provisional_total', os.provisional_total
          ) AS j
          FROM open_sessions os
          UNION ALL
          SELECT ao.created_at, jsonb_build_object(
            'key', 'O:' || ao.id::text,
            'session_ids', '[]'::jsonb,
            'order_ids', jsonb_build_array(ao.id),
            'opened_at', ao.created_at,
            'is_tray', false,
            'expired', false,
            'tables_count', 0,
            'table_label', public.bills_report_table_label('{}'::uuid[], ARRAY[ao.id], ao.order_type),
            'order_type', ao.order_type,
            'customer_name', NULLIF(btrim(ao.customer_name), ''),
            'party_size', NULL,
            'items_count', (
              SELECT COALESCE(SUM(oi.quantity), 0) FROM public.order_items oi
              WHERE oi.order_id = ao.id AND oi.void_type IS DISTINCT FROM 'cancelled'),
            'provisional_total', ao.total_amount
          )
          FROM awaiting_orders ao
        ) w),
      'cancelled', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'order_id', o.id,
          'session_id', o.session_id,
          'at', COALESCE(o.rejected_at, o.updated_at),
          'created_at', o.created_at,
          'kind', CASE WHEN o.rejected_at IS NOT NULL THEN 'rejected' ELSE 'cancelled' END,
          'reason_code', o.rejection_reason_code,
          'reason_note', NULLIF(btrim(o.rejection_reason_note), ''),
          'total', o.total_amount,
          'order_type', o.order_type,
          'order_source', o.order_source,
          'customer_name', NULLIF(btrim(o.customer_name), ''),
          'table_label', public.bills_report_table_label(
            CASE WHEN o.session_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[o.session_id] END, ARRAY[o.id], o.order_type)
        ) ORDER BY COALESCE(o.rejected_at, o.updated_at) DESC), '[]'::jsonb)
        FROM public.orders o
        WHERE o.store_id = p_store_id
          AND o.status = 'cancelled'
          AND COALESCE(o.rejected_at, o.updated_at) >= v_from
          AND COALESCE(o.rejected_at, o.updated_at) < v_to),
      'adjustments', (
        SELECT COALESCE(jsonb_agg(x.j ORDER BY x.at DESC), '[]'::jsonb)
        FROM (
          SELECT oi.voided_at AS at, jsonb_build_object(
            'at', oi.voided_at,
            'type', oi.void_type,
            'item_name', oi.item_name,
            'quantity', oi.quantity,
            'old_quantity', NULL,
            'new_quantity', NULL,
            'amount', (oi.item_price + COALESCE(tp.price, 0)) * oi.quantity,
            'reason', NULLIF(btrim(oi.void_reason), ''),
            'table_label', public.bills_report_table_label(
              CASE WHEN o.session_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[o.session_id] END, ARRAY[o.id], o.order_type),
            'by_name', (SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), u.email)
                        FROM auth.users u WHERE u.id = oi.voided_by)
          ) AS j
          FROM public.order_items oi
          JOIN public.orders o ON o.id = oi.order_id
          LEFT JOIN LATERAL (
            SELECT SUM(COALESCE((e->>'price')::integer, 0)) AS price
            FROM jsonb_array_elements(COALESCE(oi.selected_toppings, '[]'::jsonb)) e
          ) tp ON true
          WHERE o.store_id = p_store_id
            AND oi.void_type IS NOT NULL
            AND oi.voided_at >= v_from AND oi.voided_at < v_to
          UNION ALL
          SELECT c.changed_at, jsonb_build_object(
            'at', c.changed_at,
            'type', 'quantity',
            'item_name', c.item_name,
            'quantity', c.new_quantity,
            'old_quantity', c.old_quantity,
            'new_quantity', c.new_quantity,
            'amount', (c.new_quantity - c.old_quantity) * (COALESCE(oi.item_price, 0) + COALESCE(tp.price, 0)),
            'reason', NULLIF(btrim(c.reason), ''),
            'table_label', public.bills_report_table_label(
              CASE WHEN o.session_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[o.session_id] END, ARRAY[o.id], o.order_type),
            'by_name', (SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), u.email)
                        FROM auth.users u WHERE u.id = c.changed_by)
          )
          FROM public.order_item_quantity_changes c
          JOIN public.orders o ON o.id = c.order_id
          LEFT JOIN public.order_items oi ON oi.id = c.order_item_id
          LEFT JOIN LATERAL (
            SELECT SUM(COALESCE((e->>'price')::integer, 0)) AS price
            FROM jsonb_array_elements(COALESCE(oi.selected_toppings, '[]'::jsonb)) e
          ) tp ON true
          WHERE c.store_id = p_store_id
            AND c.changed_at >= v_from AND c.changed_at < v_to
        ) x)
    )
  );
END;
$function$
