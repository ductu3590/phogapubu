-- BL-0 regression: phiên hết hạn mất nhãn bàn vì trigger đã đóng session_tables.is_open.
-- Kitchen cũng cần đọc đúng nhãn mâm, không chỉ table_id của đơn vừa gửi.

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
      -- Phiên đang mở chỉ lấy bàn đang chiếm; bill timeout vẫn phải nói tên bàn đã mở lúc đầu.
      WHERE st.session_id = s.id
        AND (st.is_open OR s.status = 'closed')
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

GRANT SELECT ON public.table_sessions, public.session_tables TO kitchen;

DROP POLICY IF EXISTS kitchen_read_table_sessions ON public.table_sessions;
CREATE POLICY kitchen_read_table_sessions ON public.table_sessions
  FOR SELECT TO kitchen
  USING (store_id = public.kitchen_store_id());

DROP POLICY IF EXISTS kitchen_read_session_tables ON public.session_tables;
CREATE POLICY kitchen_read_session_tables ON public.session_tables
  FOR SELECT TO kitchen
  USING (EXISTS (
    SELECT 1
    FROM public.table_sessions s
    WHERE s.id = session_tables.session_id
      AND s.store_id = public.kitchen_store_id()
  ));

NOTIFY pgrst, 'reload schema';
