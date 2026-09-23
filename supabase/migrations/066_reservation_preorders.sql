-- BL-3 Task 4: preorder là đơn chưa có bàn/phiên, version do server chốt.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reservation_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS preorder_revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS released_preorder_revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS preorder_edit_deadline timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS waste_review_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_source_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_source_check CHECK (order_source IN ('customer_zalo','staff','pos','reservation_preorder'));
ALTER TABLE public.orders ADD CONSTRAINT orders_id_store_unique UNIQUE (id, store_id);
ALTER TABLE public.orders ADD CONSTRAINT orders_reservation_store_fkey FOREIGN KEY (reservation_id, store_id) REFERENCES public.reservations(id, store_id) ON DELETE RESTRICT;
ALTER TABLE public.orders ADD CONSTRAINT preorder_order_shape CHECK (order_source <> 'reservation_preorder' OR (reservation_id IS NOT NULL AND table_id IS NULL AND session_id IS NULL AND order_type = 'dine_in'));

-- Preorder là đơn hẹn trước, không phải lượt quét QR tại bàn: không dùng capability table_ordering_enabled.
CREATE OR REPLACE FUNCTION public.enforce_order_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_source = 'reservation_preorder' THEN
    RETURN NEW;
  END IF;
  PERFORM public.assert_order_channel_enabled(NEW.store_id, NEW.order_type);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_order_workflow() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.reservation_preorder_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  store_id uuid NOT NULL, reservation_id uuid NOT NULL, revision integer NOT NULL, items_snapshot jsonb NOT NULL,
  total_amount integer NOT NULL, note text, actor_kind text NOT NULL CHECK(actor_kind IN ('customer','owner','system')),
  client_request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, revision), UNIQUE(order_id, client_request_id),
  FOREIGN KEY (reservation_id, store_id) REFERENCES public.reservations(id,store_id)
);
-- Mọi thao tác khách gửi đều có dấu vết request để retry chỉ trả lại đúng kết quả cũ.
CREATE TABLE IF NOT EXISTS public.reservation_preorder_mutations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  client_request_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN ('submit','revise','cancel')),
  payload jsonb NOT NULL,
  result_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, client_request_id)
);
CREATE TABLE IF NOT EXISTS public.reservation_preorder_print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL, revision integer NOT NULL, kind text NOT NULL CHECK(kind IN ('original','adjustment','reprint')),
  snapshot jsonb NOT NULL, requested_by uuid REFERENCES auth.users(id), requested_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reservation_preorder_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_preorder_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_preorder_print_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reservation_preorder_revisions, public.reservation_preorder_mutations, public.reservation_preorder_print_jobs FROM anon, authenticated;

-- anon cũ từng đọc toàn bộ orders/order_items; preorder chỉ đi qua token RPC.
DROP POLICY IF EXISTS "anon_read_orders" ON public.orders;
CREATE POLICY "anon_read_orders" ON public.orders FOR SELECT TO anon USING (order_source <> 'reservation_preorder');
DROP POLICY IF EXISTS "anon_read_order_items" ON public.order_items;
CREATE POLICY "anon_read_order_items" ON public.order_items FOR SELECT TO anon USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_items.order_id AND o.order_source <> 'reservation_preorder'));

CREATE OR REPLACE FUNCTION public.preorder_customer_json(p_order public.orders)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('order_id',p_order.id,'revision',p_order.preorder_revision,'released_revision',p_order.released_preorder_revision,
  'status',p_order.status,'total_amount',p_order.total_amount,'note',p_order.note,'edit_deadline',p_order.preorder_edit_deadline,
  'can_edit',p_order.status='pending' AND now() < p_order.preorder_edit_deadline,
  'needs_pos_review',p_order.preorder_revision > p_order.released_preorder_revision,
  'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('menu_item_id',oi.menu_item_id,'name',oi.item_name,'price',oi.item_price,'quantity',oi.quantity,'note',oi.note,'variant_id',oi.variant_id,'variant_name',oi.variant_name,'toppings',oi.selected_toppings) ORDER BY oi.id) FROM public.order_items oi WHERE oi.order_id=p_order.id AND oi.void_type IS NULL),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.preorder_customer_json(public.orders) FROM PUBLIC, anon, authenticated;

-- Retry phải trả snapshot của revision đã ghi, không lấy order_items hiện hành.
CREATE OR REPLACE FUNCTION public.preorder_revision_json(p_order public.orders,p_revision integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('order_id',p_order.id,'revision',r.revision,'released_revision',p_order.released_preorder_revision,
  'status',p_order.status,'total_amount',r.total_amount,'note',r.note,'edit_deadline',p_order.preorder_edit_deadline,
  'can_edit',p_order.status='pending' AND now() < p_order.preorder_edit_deadline,
  'needs_pos_review',p_order.preorder_revision > p_order.released_preorder_revision,'items',r.items_snapshot)
 FROM public.reservation_preorder_revisions r WHERE r.order_id=p_order.id AND r.revision=p_revision;
$$;
REVOKE ALL ON FUNCTION public.preorder_revision_json(public.orders,integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assert_preorder_customer(p_reservation_id uuid,p_customer_token text)
RETURNS public.reservations LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.reservations%ROWTYPE; BEGIN
 IF p_customer_token IS NULL OR p_customer_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Không có quyền xem món đặt trước'; END IF;
 SELECT * INTO r FROM public.reservations WHERE id=p_reservation_id AND customer_token_hash=public.reservation_customer_token_hash(p_customer_token) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không có quyền xem món đặt trước'; END IF; RETURN r; END $$;
REVOKE ALL ON FUNCTION public.assert_preorder_customer(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.write_preorder_revision(p_order_id uuid,p_reservation public.reservations,p_items jsonb,p_note text,p_request_id uuid,p_expected_revision integer DEFAULT NULL,p_action text DEFAULT 'revise')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; item jsonb; total integer; snapshot jsonb; normalized_note text; payload jsonb; BEGIN
 normalized_note:=NULLIF(btrim(COALESCE(p_note,'')), '');
 IF normalized_note IS NOT NULL AND char_length(normalized_note) > 1000 THEN RAISE EXCEPTION 'Ghi chú không quá 1000 ký tự'; END IF;
 IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Cần từ 1 đến 100 món'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF p_expected_revision IS NOT NULL AND o.preorder_revision <> p_expected_revision THEN RAISE EXCEPTION 'Món đặt trước vừa được thay đổi, vui lòng tải lại'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x WHERE jsonb_typeof(x.value) <> 'object' OR COALESCE((x.value->>'quantity')::integer,0) NOT BETWEEN 1 AND 99) THEN RAISE EXCEPTION 'Số lượng mỗi món phải từ 1 đến 99'; END IF;
 DELETE FROM public.order_items WHERE order_id=o.id;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP PERFORM public.add_order_line(o.id,p_reservation.store_id,item); END LOOP;
 total:=public.recompute_order_total(o.id);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('menu_item_id',oi.menu_item_id,'name',oi.item_name,'price',oi.item_price,'quantity',oi.quantity,'note',oi.note,'variant_id',oi.variant_id,'variant_name',oi.variant_name,'toppings',oi.selected_toppings) ORDER BY oi.id),'[]'::jsonb) INTO snapshot FROM public.order_items oi WHERE oi.order_id=o.id;
 UPDATE public.orders SET preorder_revision=o.preorder_revision+1,note=normalized_note,updated_at=now() WHERE id=o.id RETURNING * INTO o;
 INSERT INTO public.reservation_preorder_revisions(order_id,store_id,reservation_id,revision,items_snapshot,total_amount,note,actor_kind,client_request_id) VALUES(o.id,o.store_id,p_reservation.id,o.preorder_revision,snapshot,total,o.note,'customer',p_request_id);
 payload:=jsonb_build_object('items',p_items,'note',normalized_note,'expected_revision',p_expected_revision);
 INSERT INTO public.reservation_preorder_mutations(order_id,client_request_id,action,payload,result_revision) VALUES(o.id,p_request_id,p_action,payload,o.preorder_revision);
 RETURN public.preorder_customer_json(o); END $$;
REVOKE ALL ON FUNCTION public.write_preorder_revision(uuid,public.reservations,jsonb,text,uuid,integer,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_reservation_preorder(p_reservation_id uuid,p_customer_token text,p_client_request_id uuid,p_items jsonb,p_note text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
 INSERT INTO public.orders(store_id,reservation_id,order_type,order_source,status,total_amount,payment_amount,payment_method,payment_instrument,client_request_id,preorder_edit_deadline) VALUES(r.store_id,r.id,'dine_in','reservation_preorder','pending',0,0,'cash','cash',p_client_request_id,r.arrival_at-make_interval(mins=>r.reservation_preorder_edit_cutoff_minutes)) RETURNING * INTO o;
 RETURN public.write_preorder_revision(o.id,r,p_items,p_note,p_client_request_id,NULL,'submit'); END $$;

CREATE OR REPLACE FUNCTION public.revise_reservation_preorder(p_order_id uuid,p_customer_token text,p_expected_revision integer,p_client_request_id uuid,p_items jsonb,p_note text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; r public.reservations%ROWTYPE; existing public.reservation_preorder_mutations%ROWTYPE; BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND order_source='reservation_preorder'; IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy món đặt trước'; END IF; r:=public.assert_preorder_customer(o.reservation_id,p_customer_token);
 SELECT * INTO existing FROM public.reservation_preorder_mutations WHERE order_id=o.id AND client_request_id=p_client_request_id; IF FOUND THEN
   IF existing.action <> 'revise' OR existing.payload <> jsonb_build_object('items',p_items,'note',NULLIF(btrim(COALESCE(p_note,'')),''),'expected_revision',p_expected_revision) THEN RAISE EXCEPTION 'preorder_request_payload_mismatch'; END IF;
   RETURN public.preorder_revision_json(o,existing.result_revision);
 END IF;
 IF r.status <> 'confirmed' OR now() >= o.preorder_edit_deadline THEN RAISE EXCEPTION 'Đã quá thời hạn chỉnh món, vui lòng gọi quán'; END IF;
 RETURN public.write_preorder_revision(o.id,r,p_items,p_note,p_client_request_id,p_expected_revision,'revise'); END $$;

CREATE OR REPLACE FUNCTION public.cancel_reservation_preorder(p_order_id uuid,p_customer_token text,p_expected_revision integer,p_client_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; r public.reservations%ROWTYPE; BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND order_source='reservation_preorder' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy món đặt trước'; END IF;
 r:=public.assert_preorder_customer(o.reservation_id,p_customer_token);
 IF EXISTS(SELECT 1 FROM public.reservation_preorder_mutations m WHERE m.order_id=o.id AND m.client_request_id=p_client_request_id AND m.action='cancel' AND m.payload=jsonb_build_object('expected_revision',p_expected_revision)) THEN RETURN public.preorder_customer_json(o); END IF;
 IF EXISTS(SELECT 1 FROM public.reservation_preorder_mutations m WHERE m.order_id=o.id AND m.client_request_id=p_client_request_id) THEN RAISE EXCEPTION 'preorder_request_payload_mismatch'; END IF;
 IF o.preorder_revision <> p_expected_revision THEN RAISE EXCEPTION 'Món đặt trước vừa được thay đổi, vui lòng tải lại'; END IF;
 IF r.status <> 'confirmed' OR now() >= o.preorder_edit_deadline THEN RAISE EXCEPTION 'Đã quá thời hạn hủy món, vui lòng gọi quán'; END IF;
 UPDATE public.orders SET status='cancelled',updated_at=now() WHERE id=o.id RETURNING * INTO o;
 INSERT INTO public.reservation_preorder_mutations(order_id,client_request_id,action,payload,result_revision) VALUES(o.id,p_client_request_id,'cancel',jsonb_build_object('expected_revision',p_expected_revision),o.preorder_revision);
 RETURN public.preorder_customer_json(o);
END $$;

CREATE OR REPLACE FUNCTION public.get_customer_reservation_preorders(p_reservation_id uuid,p_customer_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.reservations%ROWTYPE; BEGIN r:=public.assert_preorder_customer(p_reservation_id,p_customer_token); RETURN COALESCE((SELECT jsonb_agg(public.preorder_customer_json(o) ORDER BY o.created_at) FROM public.orders o WHERE o.reservation_id=r.id AND o.order_source='reservation_preorder'),'[]'::jsonb); END $$;
REVOKE ALL ON FUNCTION public.submit_reservation_preorder(uuid,text,uuid,jsonb,text),public.revise_reservation_preorder(uuid,text,integer,uuid,jsonb,text),public.cancel_reservation_preorder(uuid,text,integer,uuid),public.get_customer_reservation_preorders(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_reservation_preorder(uuid,text,uuid,jsonb,text),public.revise_reservation_preorder(uuid,text,integer,uuid,jsonb,text),public.cancel_reservation_preorder(uuid,text,integer,uuid),public.get_customer_reservation_preorders(uuid,text) TO anon, authenticated;
NOTIFY pgrst,'reload schema';
