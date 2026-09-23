-- Preorder trước giờ đến chưa thuộc bill/session, nhưng phải mang nhãn bàn đã phân bổ.
CREATE OR REPLACE FUNCTION public.reservation_preorder_table_numbers(p_order public.orders)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(
    (SELECT jsonb_agg(t.table_number ORDER BY t.table_number) FROM public.session_tables st JOIN public.tables t ON t.id=st.table_id WHERE st.session_id=p_order.session_id AND st.is_open),
    (SELECT jsonb_agg(t.table_number ORDER BY t.table_number) FROM public.reservation_tables rt JOIN public.tables t ON t.id=rt.table_id AND t.store_id=rt.store_id WHERE rt.reservation_id=p_order.reservation_id),
    '[]'::jsonb
  )
$$;
REVOKE ALL ON FUNCTION public.reservation_preorder_table_numbers(public.orders) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_reservation_preorder_queue(p_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_store_owner_of(p_store_id) THEN RAISE EXCEPTION 'Chỉ chủ quán được xem món đặt trước'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(row_data ORDER BY waste_review_required DESC, arrival_at, created_at) FROM (
    SELECT jsonb_build_object('order_id',o.id,'reservation_id',o.reservation_id,'customer_name',r.customer_name,'customer_phone',r.customer_phone,'party_size',r.party_size,'arrival_at',r.arrival_at,'reservation_status',r.status,'order_status',o.status,'revision',o.preorder_revision,'released_revision',o.released_preorder_revision,
      'needs_print',o.status <> 'cancelled' AND o.released_preorder_revision > 0 AND NOT EXISTS (SELECT 1 FROM public.reservation_preorder_print_jobs j WHERE j.order_id=o.id AND j.revision=o.released_preorder_revision),
      'needs_review',o.preorder_revision > o.released_preorder_revision,'waste_review_required',o.waste_review_required,'total_amount',o.total_amount,
      'current_snapshot',public.preorder_release_snapshot(o,o.preorder_revision),'released_snapshot',CASE WHEN o.released_preorder_revision>0 THEN public.preorder_release_snapshot(o,o.released_preorder_revision) ELSE NULL END,
      'table_numbers',public.reservation_preorder_table_numbers(o),'created_at',o.created_at) row_data,
      o.waste_review_required,r.arrival_at,o.created_at
    FROM public.orders o JOIN public.reservations r ON r.id=o.reservation_id AND r.store_id=o.store_id
    WHERE o.store_id=p_store_id AND o.order_source='reservation_preorder' AND (o.status <> 'cancelled' OR o.waste_review_required)
  ) q),'[]'::jsonb);
END $$;

NOTIFY pgrst,'reload schema';
