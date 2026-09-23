-- Bảo Lương: khi khách gửi món đặt trước thì nội dung trở thành snapshot vận hành.
-- Khách chỉ có thể gọi thêm sau khi quán nhận khách và mở phiên tại bàn.

CREATE UNIQUE INDEX IF NOT EXISTS orders_one_active_reservation_preorder
  ON public.orders(reservation_id)
  WHERE order_source = 'reservation_preorder' AND status <> 'cancelled';

CREATE OR REPLACE FUNCTION public.preorder_customer_json(p_order public.orders)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('order_id',p_order.id,'revision',p_order.preorder_revision,'released_revision',p_order.released_preorder_revision,
  'status',p_order.status,'total_amount',p_order.total_amount,'note',p_order.note,'edit_deadline',p_order.preorder_edit_deadline,
  'can_edit',false,'can_cancel',false,
  'customer_message','Đã gửi món đặt trước. Món đã chốt, vui lòng gọi thêm tại quán nếu cần.',
  'needs_pos_review',p_order.preorder_revision > p_order.released_preorder_revision,
  'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('menu_item_id',oi.menu_item_id,'name',oi.item_name,'price',oi.item_price,'quantity',oi.quantity,'note',oi.note,'variant_id',oi.variant_id,'variant_name',oi.variant_name,'toppings',oi.selected_toppings) ORDER BY oi.id) FROM public.order_items oi WHERE oi.order_id=p_order.id AND oi.void_type IS NULL),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.preorder_customer_json(public.orders) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.preorder_revision_json(p_order public.orders,p_revision integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('order_id',p_order.id,'revision',r.revision,'released_revision',p_order.released_preorder_revision,
  'status',p_order.status,'total_amount',r.total_amount,'note',r.note,'edit_deadline',p_order.preorder_edit_deadline,
  'can_edit',false,'can_cancel',false,
  'customer_message','Đã gửi món đặt trước. Món đã chốt, vui lòng gọi thêm tại quán nếu cần.',
  'needs_pos_review',p_order.preorder_revision > p_order.released_preorder_revision,'items',r.items_snapshot)
 FROM public.reservation_preorder_revisions r WHERE r.order_id=p_order.id AND r.revision=p_revision;
$$;
REVOKE ALL ON FUNCTION public.preorder_revision_json(public.orders,integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_reservation_preorder(p_reservation_id uuid,p_customer_token text,p_client_request_id uuid,p_items jsonb,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.reservations%ROWTYPE; o public.orders%ROWTYPE; existing public.reservation_preorder_mutations%ROWTYPE; BEGIN
 r:=public.assert_preorder_customer(p_reservation_id,p_customer_token);
 IF r.status <> 'confirmed' OR r.arrival_at <= now() THEN RAISE EXCEPTION 'Chỉ đặt món trước sau khi quán xác nhận và trước giờ đến'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.store_workflow_settings w JOIN public.stores s ON s.id=w.store_id WHERE w.store_id=r.store_id AND w.reservation_preorder_enabled AND s.payment_timing='postpay' AND s.payment_methods @> ARRAY['cash']) THEN RAISE EXCEPTION 'Cấu hình quán chưa hỗ trợ đặt món trước trả sau bằng tiền mặt'; END IF;
 SELECT * INTO o FROM public.orders WHERE store_id=r.store_id AND client_request_id=p_client_request_id;
 IF FOUND THEN
   IF o.reservation_id IS DISTINCT FROM r.id THEN RAISE EXCEPTION 'Mã gửi món không hợp lệ'; END IF;
   SELECT * INTO existing FROM public.reservation_preorder_mutations m WHERE m.order_id=o.id AND m.client_request_id=p_client_request_id AND m.action='submit' AND m.payload=jsonb_build_object('items',p_items,'note',NULLIF(btrim(COALESCE(p_note,'')),''),'expected_revision',NULL);
   IF NOT FOUND THEN RAISE EXCEPTION 'preorder_request_payload_mismatch'; END IF;
   RETURN public.preorder_revision_json(o,existing.result_revision);
 END IF;
 IF EXISTS(SELECT 1 FROM public.orders WHERE reservation_id=r.id AND order_source='reservation_preorder' AND status <> 'cancelled') THEN
   RAISE EXCEPTION 'Món đặt trước đã gửi. Vui lòng gọi thêm tại quán.';
 END IF;
 INSERT INTO public.orders(store_id,reservation_id,order_type,order_source,status,total_amount,payment_amount,payment_method,payment_instrument,client_request_id,preorder_edit_deadline) VALUES(r.store_id,r.id,'dine_in','reservation_preorder','pending',0,0,'cash','cash',p_client_request_id,r.arrival_at-make_interval(mins=>r.reservation_preorder_edit_cutoff_minutes)) RETURNING * INTO o;
 RETURN public.write_preorder_revision(o.id,r,p_items,p_note,p_client_request_id,NULL,'submit'); END $$;

CREATE OR REPLACE FUNCTION public.revise_reservation_preorder(p_order_id uuid,p_customer_token text,p_expected_revision integer,p_client_request_id uuid,p_items jsonb,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; existing public.reservation_preorder_mutations%ROWTYPE; BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND order_source='reservation_preorder'; IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy món đặt trước'; END IF;
 PERFORM public.assert_preorder_customer(o.reservation_id,p_customer_token);
 SELECT * INTO existing FROM public.reservation_preorder_mutations WHERE order_id=o.id AND client_request_id=p_client_request_id;
 IF FOUND THEN
   IF existing.action <> 'revise' OR existing.payload <> jsonb_build_object('items',p_items,'note',NULLIF(btrim(COALESCE(p_note,'')),''),'expected_revision',p_expected_revision) THEN RAISE EXCEPTION 'preorder_request_payload_mismatch'; END IF;
   RETURN public.preorder_revision_json(o,existing.result_revision);
 END IF;
 RAISE EXCEPTION 'Món đặt trước đã khóa ngay sau khi gửi. Vui lòng gọi thêm tại quán.';
END $$;

CREATE OR REPLACE FUNCTION public.cancel_reservation_preorder(p_order_id uuid,p_customer_token text,p_expected_revision integer,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND order_source='reservation_preorder';
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy món đặt trước'; END IF;
 PERFORM public.assert_preorder_customer(o.reservation_id,p_customer_token);
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.order_source <> 'reservation_preorder' THEN RAISE EXCEPTION 'Không tìm thấy món đặt trước'; END IF;
 IF EXISTS(SELECT 1 FROM public.reservation_preorder_mutations m WHERE m.order_id=o.id AND m.client_request_id=p_client_request_id AND m.action='cancel' AND m.payload=jsonb_build_object('expected_revision',p_expected_revision)) THEN RETURN public.preorder_customer_json(o); END IF;
 IF EXISTS(SELECT 1 FROM public.reservation_preorder_mutations m WHERE m.order_id=o.id AND m.client_request_id=p_client_request_id) THEN RAISE EXCEPTION 'preorder_request_payload_mismatch'; END IF;
 RAISE EXCEPTION 'Món đặt trước đã khóa ngay sau khi gửi. Vui lòng gọi thêm tại quán.';
END $$;

REVOKE ALL ON FUNCTION public.submit_reservation_preorder(uuid,text,uuid,jsonb,text),public.revise_reservation_preorder(uuid,text,integer,uuid,jsonb,text),public.cancel_reservation_preorder(uuid,text,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_reservation_preorder(uuid,text,uuid,jsonb,text),public.revise_reservation_preorder(uuid,text,integer,uuid,jsonb,text),public.cancel_reservation_preorder(uuid,text,integer,uuid) TO anon, authenticated;
NOTIFY pgrst,'reload schema';
