-- Sprint 2: các reader phải phản ánh đúng món khách bỏ/tặng.
-- Không thay đổi quyền public của bill khách; chỉ bổ sung metadata không nhạy cảm.

CREATE OR REPLACE FUNCTION public.get_table_session_bill(
  p_table_id uuid, p_zalo_user_id text DEFAULT NULL, p_device_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.table_sessions%ROWTYPE;
  v_orders jsonb;
  v_total bigint;
BEGIN
  SELECT * INTO v_session
  FROM public.table_sessions
  WHERE id = public.open_session_id_for_table(p_table_id);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF NOT v_session.is_open_ordering AND NOT (
       (v_session.host_zalo_user_id IS NULL AND v_session.host_device_id IS NULL)
    OR (p_zalo_user_id IS NOT NULL AND v_session.host_zalo_user_id = p_zalo_user_id)
    OR (p_device_id IS NOT NULL AND v_session.host_device_id = p_device_id)
  ) THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data.created_at DESC), '[]'::jsonb),
         COALESCE(SUM(row_data.total_amount), 0)
  INTO v_orders, v_total
  FROM (
    SELECT o.id, o.status, o.created_at, o.total_amount, o.order_source,
           o.payment_received_at,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'id', oi.id,
               'name', oi.item_name,
               'quantity', oi.quantity,
               'price', CASE WHEN oi.void_type = 'gift' THEN 0 ELSE oi.item_price END,
               'toppings', oi.selected_toppings,
               'void_type', oi.void_type,
               'is_gift', oi.void_type = 'gift'
             ) ORDER BY oi.id)
             FROM public.order_items oi
             WHERE oi.order_id = o.id
               AND oi.void_type IS DISTINCT FROM 'cancelled'
           ), '[]'::jsonb) AS items
    FROM public.orders o
    WHERE o.session_id = v_session.id
      AND o.status <> 'cancelled'
  ) AS row_data;

  RETURN jsonb_build_object(
    'found', true,
    'session_id', v_session.id,
    'opened_at', v_session.opened_at,
    'total', v_total,
    'orders', v_orders
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_table_session_bill(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_table_session_bill(uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_open_table_sessions(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.is_store_scoped_operator(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;

  PERFORM public.expire_stale_table_sessions(p_store_id);

  SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data.opened_at), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT s.id AS session_id,
           s.table_id,
           s.is_open_ordering,
           COALESCE(table_data.table_names, '[]'::jsonb) AS tables,
           COALESCE(table_data.label, '?') AS table_number,
           s.status,
           s.close_reason,
           s.opened_at,
           s.opened_by,
           s.last_activity_at,
           (s.host_zalo_user_id IS NOT NULL OR s.host_device_id IS NOT NULL) AS has_host,
           (s.status = 'closed') AS needs_review,
           COALESCE(order_data.order_count, 0) AS order_count,
           COALESCE(order_data.total, 0) AS total,
           COALESCE(order_data.unpaid_total, 0) AS unpaid_total,
           COALESCE(order_data.cooking_count, 0) AS cooking_count,
           COALESCE(order_data.orders, '[]'::jsonb) AS orders
    FROM public.table_sessions s
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'table_number', t.table_number)
                        ORDER BY t.table_number) AS table_names,
             string_agg(t.table_number, ', ' ORDER BY t.table_number) AS label
      FROM public.session_tables st
      JOIN public.tables t ON t.id = st.table_id
      WHERE st.session_id = s.id
        AND st.is_open
    ) AS table_data ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS order_count,
             SUM(o.total_amount) AS total,
             SUM(o.total_amount) FILTER (WHERE o.payment_received_at IS NULL) AS unpaid_total,
             COUNT(*) FILTER (WHERE o.status IN ('pending', 'confirmed', 'cooking')) AS cooking_count,
             jsonb_agg(jsonb_build_object(
               'id', o.id,
               'status', o.status,
               'created_at', o.created_at,
               'total_amount', o.total_amount,
               'order_source', o.order_source,
               'payment_received_at', o.payment_received_at,
               'items', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                   'id', oi.id,
                   'name', oi.item_name,
                   'quantity', oi.quantity,
                   'price', oi.item_price,
                   'toppings', oi.selected_toppings,
                   'void_type', oi.void_type,
                   'void_reason', oi.void_reason,
                   'voided_at', oi.voided_at,
                   'is_gift', oi.void_type = 'gift'
                 ) ORDER BY oi.id)
                 FROM public.order_items oi
                 WHERE oi.order_id = o.id
               ), '[]'::jsonb)
             ) ORDER BY o.created_at) AS orders
      FROM public.orders o
      WHERE o.session_id = s.id
        AND o.status <> 'cancelled'
    ) AS order_data ON true
    WHERE s.store_id = p_store_id
      AND (
        s.status = 'open'
        OR (s.close_reason = 'expired' AND EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.session_id = s.id
            AND o.status <> 'cancelled'
            AND o.payment_received_at IS NULL
        ))
      )
  ) AS row_data;

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.list_open_table_sessions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_open_table_sessions(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_open_table_sessions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_sessions_bill(p_session_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
  v_store_count integer;
  v_store_row public.stores%ROWTYPE;
  v_sessions jsonb;
  v_total bigint;
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
         COALESCE(SUM(session_data.subtotal), 0)
  INTO v_sessions, v_total
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
             SELECT SUM(o.total_amount)
             FROM public.orders o
             WHERE o.session_id = s.id
               AND o.status <> 'cancelled'
           ), 0) AS subtotal,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'name', line_data.name,
               'quantity', line_data.quantity,
               'price', CASE WHEN line_data.void_type = 'gift' THEN 0 ELSE line_data.unit_price END,
               'line_total', CASE WHEN line_data.void_type = 'gift' THEN 0 ELSE line_data.quantity * line_data.unit_price END,
               'is_gift', line_data.void_type = 'gift'
             ) ORDER BY line_data.name)
             FROM (
               SELECT oi.item_name || CASE
                        WHEN COALESCE(topping_data.names, '') = '' THEN ''
                        ELSE ' + ' || topping_data.names
                      END AS name,
                      SUM(oi.quantity) AS quantity,
                      oi.item_price + COALESCE(topping_data.price, 0) AS unit_price,
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
                 AND oi.void_type IS DISTINCT FROM 'cancelled'
               GROUP BY oi.item_name, oi.item_price, oi.void_type,
                        topping_data.names, topping_data.price
             ) AS line_data
           ), '[]'::jsonb) AS items
    FROM public.table_sessions s
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
    'grand_total', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_sessions_bill(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sessions_bill(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_sessions_bill(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
