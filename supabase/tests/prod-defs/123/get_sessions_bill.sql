-- Chụp từ nhánh tích hợp sau mig 122 (PGlite: 112a + 112b + 122 trên bản chụp prod-defs/112). Controller PHẢI đối chiếu pg_get_functiondef trên prod trước khi áp mig 123.
CREATE OR REPLACE FUNCTION public.get_sessions_bill(p_session_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store uuid;
  v_store_count integer;
  v_store_row public.stores%ROWTYPE;
  v_sessions jsonb;
  v_total bigint;
  v_discount bigint;
BEGIN
  IF p_session_ids IS NULL OR array_length(p_session_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Chưa chọn phiên nào';
  END IF;

  SELECT COUNT(DISTINCT store_id)
  INTO v_store_count
  FROM public.table_sessions
  WHERE id = ANY(p_session_ids);

  IF v_store_count = 0 THEN
    RAISE EXCEPTION 'Không tìm thấy phiên';
  END IF;
  IF v_store_count > 1 THEN
    RAISE EXCEPTION 'Các phiên không cùng một quán';
  END IF;

  SELECT store_id INTO v_store
  FROM public.table_sessions
  WHERE id = ANY(p_session_ids)
  LIMIT 1;

  IF NOT public.is_store_scoped_operator(v_store) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;

  SELECT * INTO v_store_row FROM public.stores WHERE id = v_store;

  SELECT COALESCE(jsonb_agg(session_data ORDER BY session_data.opened_at), '[]'::jsonb),
         COALESCE(SUM(session_data.subtotal), 0) - COALESCE(SUM(session_data.discount), 0),
         COALESCE(SUM(session_data.discount), 0)
  INTO v_sessions, v_total, v_discount
  FROM (
    SELECT s.id AS session_id,
           s.opened_at,
           s.is_open_ordering,
           COALESCE((
             SELECT string_agg(t.table_number, ', ' ORDER BY t.table_number)
             FROM public.session_tables st
             JOIN public.tables t ON t.id = st.table_id
             WHERE st.session_id = s.id
           ), '?') AS tables,
           COALESCE((
             SELECT SUM(o.total_amount + o.bill_discount_amount)
             FROM public.orders o
             WHERE o.session_id = s.id
               AND o.status <> 'cancelled'
           ), 0) AS subtotal,
           disc_data.amount AS discount,
           CASE WHEN s.bill_discount_type = 'percent' AND disc_data.amount > 0
                THEN s.bill_discount_value::text || '%' END AS discount_label,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'name', line_data.name,
               'quantity', line_data.quantity,
               'price', CASE WHEN line_data.void_type IS NOT NULL THEN 0 ELSE line_data.unit_price END,
               'line_total', CASE WHEN line_data.void_type IS NOT NULL THEN 0 ELSE line_data.quantity * line_data.unit_price END,
               'is_gift', line_data.void_type = 'gift',
               'void_type', line_data.void_type,
               'void_reason', line_data.void_reason
             ) ORDER BY line_data.name, line_data.void_type NULLS FIRST)
             FROM (
               SELECT oi.item_name || CASE
                        WHEN COALESCE(topping_data.names, '') = '' THEN ''
                        ELSE ' + ' || topping_data.names
                      END AS name,
                      SUM(oi.quantity) AS quantity,
                      oi.item_price + COALESCE(topping_data.price, 0) AS unit_price,
                      oi.void_reason,
                      oi.void_type
               FROM public.orders o
               JOIN public.order_items oi ON oi.order_id = o.id
               LEFT JOIN LATERAL (
                 SELECT string_agg(topping->>'name', ', ' ORDER BY topping->>'name') AS names,
                        SUM(COALESCE((topping->>'price')::integer, 0)) AS price
                 FROM jsonb_array_elements(COALESCE(oi.selected_toppings, '[]'::jsonb)) AS topping
               ) AS topping_data ON true
               WHERE o.session_id = s.id
                 AND o.status <> 'cancelled'
                 
               GROUP BY oi.item_name, oi.item_price, oi.void_type, oi.void_reason,
                        topping_data.names, topping_data.price
             ) AS line_data
           ), '[]'::jsonb) AS items,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'name', c.item_name,
               'old_quantity', c.old_quantity,
               'new_quantity', c.new_quantity,
               'reason', c.reason,
               'changed_at', c.changed_at
             ) ORDER BY c.changed_at)
             FROM public.order_item_quantity_changes c
             JOIN public.orders o ON o.id = c.order_id
             WHERE o.session_id = s.id
               AND o.status <> 'cancelled'
           ), '[]'::jsonb) AS qty_changes
    FROM public.table_sessions s
    CROSS JOIN LATERAL (
      SELECT (CASE WHEN s.status = 'open'
                THEN public.bill_discount_amount(public.session_unpaid_subtotal(s.id),
                                                 s.bill_discount_type, s.bill_discount_value)
                ELSE COALESCE((SELECT SUM(o.bill_discount_amount)
                                 FROM public.orders o
                                WHERE o.session_id = s.id
                                  AND o.status <> 'cancelled'), 0)
              END)::bigint AS amount
    ) AS disc_data
    WHERE s.id = ANY(p_session_ids)
  ) AS session_data;

  RETURN jsonb_build_object(
    'store', jsonb_build_object(
      'name', v_store_row.name,
      'address', v_store_row.address,
      'phone', v_store_row.phone
    ),
    'printed_at', now(),
    'sessions', v_sessions,
    'grand_total', v_total,
    'grand_discount', v_discount,
    'payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('instrument', x.instrument, 'amount', x.amount) ORDER BY x.instrument DESC)
        FROM (SELECT l.instrument, SUM(l.amount)::bigint AS amount
                FROM public.bill_payment_lines l
               WHERE l.payment_id IN (SELECT ts.bill_payment_id FROM public.table_sessions ts
                                       WHERE ts.id = ANY(p_session_ids))
               GROUP BY l.instrument) x), '[]'::jsonb),
    'cash_given', (
      SELECT CASE WHEN count(*) = 1 THEN max(bp.cash_given) END
        FROM public.bill_payments bp
       WHERE bp.id IN (SELECT ts.bill_payment_id FROM public.table_sessions ts WHERE ts.id = ANY(p_session_ids))),
    'change_amount', (
      SELECT CASE WHEN count(*) = 1 THEN max(bp.change_amount) END
        FROM public.bill_payments bp
       WHERE bp.id IN (SELECT ts.bill_payment_id FROM public.table_sessions ts WHERE ts.id = ANY(p_session_ids)))
  );
END;
$function$
