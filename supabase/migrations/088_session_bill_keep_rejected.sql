-- 088: Bill phiên (Mini App tab "Đơn gọi") trả về CẢ lượt bị thu ngân TỪ CHỐI (mig 077:
-- status='cancelled' + rejected_at) để khách và quán còn đối chứng khi xảy ra xung đột
-- ("tôi gọi rồi mà sao không có món?"). Lượt bị từ chối KHÔNG cộng vào total.
-- Các đơn cancelled KHÔNG phải do từ chối (khách bỏ thanh toán, huỷ hệ thống…) vẫn bị loại như cũ.
-- Kèm giờ + lý do từ chối. Cảnh báo trùng món phía client đã bỏ qua status='cancelled'.
-- File này CHỈ chứa get_table_session_bill — không gộp RPC khác (quy tắc 2026-09-01).
CREATE OR REPLACE FUNCTION public.get_table_session_bill(
  p_table_id uuid, p_zalo_user_id text DEFAULT NULL, p_device_id text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session public.table_sessions%ROWTYPE; v_orders jsonb; v_total bigint;
BEGIN
  SELECT * INTO v_session FROM public.table_sessions WHERE id = public.open_session_id_for_table(p_table_id);
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  IF NOT v_session.is_open_ordering AND NOT (
       (v_session.host_zalo_user_id IS NULL AND v_session.host_device_id IS NULL)
    OR (p_zalo_user_id IS NOT NULL AND v_session.host_zalo_user_id = p_zalo_user_id)
    OR (p_device_id IS NOT NULL AND v_session.host_device_id = p_device_id)
  ) THEN RETURN jsonb_build_object('found', false); END IF;

  SELECT coalesce(jsonb_agg(row_data ORDER BY row_data.created_at DESC), '[]'::jsonb),
         coalesce(sum(row_data.total_amount) FILTER (WHERE row_data.status <> 'cancelled'), 0)
    INTO v_orders, v_total
  FROM (
    SELECT o.id, o.status, o.created_at, o.total_amount, o.order_source, o.payment_received_at,
      o.rejected_at, o.rejection_reason_code, o.rejection_reason_note,
      coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', oi.id, 'menu_item_id', oi.menu_item_id, 'variant_id', oi.variant_id,
        'name', oi.item_name, 'quantity', oi.quantity,
        'price', CASE WHEN oi.void_type = 'gift' THEN 0 ELSE oi.item_price END,
        'toppings', oi.selected_toppings, 'void_type', oi.void_type
      ) ORDER BY oi.id) FROM public.order_items oi
      WHERE oi.order_id = o.id AND oi.void_type IS DISTINCT FROM 'cancelled'), '[]'::jsonb) AS items
    FROM public.orders o
    WHERE o.session_id = v_session.id
      AND (o.status <> 'cancelled' OR o.rejected_at IS NOT NULL)
  ) row_data;
  RETURN jsonb_build_object('found', true, 'session_id', v_session.id, 'opened_at', v_session.opened_at,
    'total', v_total, 'orders', v_orders);
END;
$$;
REVOKE ALL ON FUNCTION public.get_table_session_bill(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_table_session_bill(uuid, text, text) TO anon, authenticated;
