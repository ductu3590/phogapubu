-- BL-2C / BL-3 Task 6: owner release phiên bản món đặt trước rồi mới in/báo bếp.
-- Không dùng sửa order_items trực tiếp làm nguồn in: mọi phiếu lấy snapshot bất biến của job.

-- Task 5 gắn preorder vào session khi khách đến. Ràng buộc cũ chỉ cho phép batch chưa đến
-- (session/table NULL) nên sẽ vỡ ở lần preorder thật đầu tiên.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS preorder_order_shape;
ALTER TABLE public.orders ADD CONSTRAINT preorder_order_shape CHECK (
  order_source <> 'reservation_preorder' OR (
    reservation_id IS NOT NULL
    AND order_type = 'dine_in'
    AND ((session_id IS NULL AND table_id IS NULL) OR (session_id IS NOT NULL AND table_id IS NOT NULL))
  )
);

-- Snapshot bếp của revision đã duyệt. Khách có thể tiếp tục sửa order_items trước cutoff;
-- bếp tuyệt đối không được nhìn nhầm các sửa đổi chưa được chủ quán duyệt.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS released_preorder_snapshot jsonb;

ALTER TABLE public.reservation_preorder_print_jobs
  ADD COLUMN IF NOT EXISTS client_request_id uuid,
  ADD COLUMN IF NOT EXISTS reason text;
CREATE UNIQUE INDEX IF NOT EXISTS reservation_preorder_print_jobs_request_unique
  ON public.reservation_preorder_print_jobs(order_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.reservation_preorder_waste_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  resolved_by uuid NOT NULL REFERENCES auth.users(id),
  client_request_id uuid NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, client_request_id)
);
ALTER TABLE public.reservation_preorder_waste_resolutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reservation_preorder_waste_resolutions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.preorder_release_snapshot(
  p_order public.orders,
  p_revision integer
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'order_id', p_order.id,
    'reservation_id', p_order.reservation_id,
    'revision', r.revision,
    'total_amount', r.total_amount,
    'note', r.note,
    'items', r.items_snapshot
  )
  FROM public.reservation_preorder_revisions r
  WHERE r.order_id = p_order.id AND r.revision = p_revision
$$;
REVOKE ALL ON FUNCTION public.preorder_release_snapshot(public.orders, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_reservation_preorder_queue(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_store_owner_of(p_store_id) THEN
    RAISE EXCEPTION 'Chỉ chủ quán được xem món đặt trước';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_data ORDER BY waste_review_required DESC, arrival_at, created_at)
    FROM (
      SELECT jsonb_build_object(
        'order_id', o.id,
        'reservation_id', o.reservation_id,
        'customer_name', r.customer_name,
        'customer_phone', r.customer_phone,
        'party_size', r.party_size,
        'arrival_at', r.arrival_at,
        'reservation_status', r.status,
        'order_status', o.status,
        'revision', o.preorder_revision,
        'released_revision', o.released_preorder_revision,
        'needs_print', o.status <> 'cancelled' AND o.released_preorder_revision > 0
          AND NOT EXISTS (SELECT 1 FROM public.reservation_preorder_print_jobs j
                          WHERE j.order_id = o.id AND j.revision = o.released_preorder_revision),
        'needs_review', o.preorder_revision > o.released_preorder_revision,
        'waste_review_required', o.waste_review_required,
        'total_amount', o.total_amount,
        'current_snapshot', public.preorder_release_snapshot(o, o.preorder_revision),
        'released_snapshot', CASE WHEN o.released_preorder_revision > 0
          THEN public.preorder_release_snapshot(o, o.released_preorder_revision) ELSE NULL END,
        'table_numbers', COALESCE((
          SELECT jsonb_agg(t.table_number ORDER BY t.table_number)
          FROM public.session_tables st JOIN public.tables t ON t.id = st.table_id
          WHERE st.session_id = o.session_id AND st.is_open
        ), '[]'::jsonb),
        'created_at', o.created_at
      ) AS row_data,
      o.waste_review_required, r.arrival_at, o.created_at
      FROM public.orders o
      JOIN public.reservations r ON r.id = o.reservation_id AND r.store_id = o.store_id
      WHERE o.store_id = p_store_id
        AND o.order_source = 'reservation_preorder'
        AND (o.status <> 'cancelled' OR o.waste_review_required)
    ) q
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_reservation_preorder(
  p_order_id uuid,
  p_expected_revision integer,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE o public.orders%ROWTYPE; snapshot jsonb;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Thiếu mã thao tác'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.order_source <> 'reservation_preorder' THEN RAISE EXCEPTION 'Không tìm thấy món đặt trước'; END IF;
  IF NOT public.is_store_owner_of(o.store_id) THEN RAISE EXCEPTION 'Chỉ chủ quán được duyệt món đặt trước'; END IF;
  IF o.status = 'cancelled' THEN RAISE EXCEPTION 'Món đặt trước đã huỷ'; END IF;

  -- Retry đúng revision sau khi commit: không tạo lần release thứ hai. Nếu khách vừa đổi món,
  -- caller cũ không được phép vô tình release revision mới.
  IF o.released_preorder_revision = p_expected_revision AND o.preorder_revision = p_expected_revision THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'released_revision', o.released_preorder_revision,
      'needs_print', NOT EXISTS (SELECT 1 FROM public.reservation_preorder_print_jobs j WHERE j.order_id=o.id AND j.revision=o.released_preorder_revision));
  END IF;
  IF o.preorder_revision <> p_expected_revision THEN RAISE EXCEPTION 'Phiên bản món đã thay đổi, vui lòng tải lại'; END IF;

  snapshot := public.preorder_release_snapshot(o, p_expected_revision);
  IF snapshot IS NULL THEN RAISE EXCEPTION 'Không tìm thấy snapshot phiên bản món'; END IF;
  UPDATE public.orders SET
    released_preorder_revision = p_expected_revision,
    released_preorder_snapshot = snapshot,
    status = 'confirmed',
    confirmed_at = COALESCE(confirmed_at, now()),
    confirmed_by = COALESCE(confirmed_by, auth.uid()),
    updated_at = now()
  WHERE id = o.id;
  RETURN jsonb_build_object('ok', true, 'already', false, 'released_revision', p_expected_revision, 'needs_print', true, 'snapshot', snapshot);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_reservation_preorder_print(
  p_order_id uuid,
  p_revision integer,
  p_kind text,
  p_request_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE o public.orders%ROWTYPE; existing public.reservation_preorder_print_jobs%ROWTYPE;
  snapshot jsonb; prior jsonb; job public.reservation_preorder_print_jobs%ROWTYPE;
BEGIN
  IF p_kind NOT IN ('original','adjustment','reprint') THEN RAISE EXCEPTION 'Loại phiếu không hợp lệ'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Thiếu mã thao tác'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR o.order_source <> 'reservation_preorder' THEN RAISE EXCEPTION 'Không tìm thấy món đặt trước'; END IF;
  IF NOT public.is_store_owner_of(o.store_id) THEN RAISE EXCEPTION 'Chỉ chủ quán được in món đặt trước'; END IF;
  SELECT * INTO existing FROM public.reservation_preorder_print_jobs
    WHERE order_id=o.id AND client_request_id=p_request_id;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'already',true,'print_job_id',existing.id,'snapshot',existing.snapshot); END IF;
  IF o.status = 'cancelled' THEN RAISE EXCEPTION 'Món đặt trước đã huỷ'; END IF;
  IF o.released_preorder_revision <> p_revision OR o.released_preorder_snapshot IS NULL THEN
    RAISE EXCEPTION 'Chỉ in phiên bản món đã được duyệt';
  END IF;
  IF p_kind = 'original' AND EXISTS (SELECT 1 FROM public.reservation_preorder_print_jobs j WHERE j.order_id=o.id AND j.kind='original') THEN
    RAISE EXCEPTION 'Phiếu gốc đã có; dùng In lại hoặc Điều chỉnh';
  END IF;
  IF p_kind = 'adjustment' AND NOT EXISTS (SELECT 1 FROM public.reservation_preorder_print_jobs j WHERE j.order_id=o.id) THEN
    RAISE EXCEPTION 'Chưa có phiếu gốc để điều chỉnh';
  END IF;
  IF p_kind = 'reprint' AND (p_reason IS NULL OR char_length(btrim(p_reason)) = 0) THEN
    RAISE EXCEPTION 'Nhập lý do in lại';
  END IF;
  SELECT j.snapshot INTO prior FROM public.reservation_preorder_print_jobs j
    WHERE j.order_id=o.id ORDER BY j.requested_at DESC LIMIT 1;
  snapshot := o.released_preorder_snapshot || jsonb_build_object(
    'kind',p_kind,'printed_revision',p_revision,'previous_snapshot',prior,
    'reservation', (SELECT jsonb_build_object('customer_name',r.customer_name,'arrival_at',r.arrival_at,'party_size',r.party_size)
                    FROM public.reservations r WHERE r.id=o.reservation_id),
    'table_numbers', COALESCE((SELECT jsonb_agg(t.table_number ORDER BY t.table_number)
      FROM public.session_tables st JOIN public.tables t ON t.id=st.table_id
      WHERE st.session_id=o.session_id AND st.is_open),'[]'::jsonb)
  );
  INSERT INTO public.reservation_preorder_print_jobs(order_id,store_id,revision,kind,snapshot,requested_by,client_request_id,reason)
    VALUES(o.id,o.store_id,p_revision,p_kind,snapshot,auth.uid(),p_request_id,NULLIF(btrim(p_reason),'')) RETURNING * INTO job;
  RETURN jsonb_build_object('ok',true,'already',false,'print_job_id',job.id,'snapshot',job.snapshot);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_preorder_waste(
  p_order_id uuid,
  p_reason text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE o public.orders%ROWTYPE; resolution public.reservation_preorder_waste_resolutions%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR o.order_source <> 'reservation_preorder' THEN RAISE EXCEPTION 'Không tìm thấy món đặt trước'; END IF;
  IF NOT public.is_store_owner_of(o.store_id) THEN RAISE EXCEPTION 'Chỉ chủ quán được đối soát hao hụt'; END IF;
  SELECT * INTO resolution FROM public.reservation_preorder_waste_resolutions WHERE order_id=o.id AND client_request_id=p_request_id;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'already',true); END IF;
  IF NOT o.waste_review_required THEN RAISE EXCEPTION 'Món này không cần đối soát hao hụt'; END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) = 0 THEN RAISE EXCEPTION 'Nhập kết quả đối soát'; END IF;
  INSERT INTO public.reservation_preorder_waste_resolutions(order_id,store_id,reason,resolved_by,client_request_id)
    VALUES(o.id,o.store_id,btrim(p_reason),auth.uid(),p_request_id);
  UPDATE public.orders SET waste_review_required=false,updated_at=now() WHERE id=o.id;
  RETURN jsonb_build_object('ok',true,'already',false);
END;
$$;

-- Không cho nút xác nhận đơn thông thường bypass version guard của preorder.
CREATE OR REPLACE FUNCTION public.pos_confirm_order(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn'; END IF;
  IF NOT public.is_store_owner_of(v_o.store_id) THEN RAISE EXCEPTION 'Chỉ chủ quán mới xác nhận đơn'; END IF;
  IF v_o.order_source = 'reservation_preorder' THEN
    RAISE EXCEPTION 'Dùng thao tác duyệt món đặt trước theo phiên bản';
  END IF;
  IF v_o.status = 'cancelled' THEN RAISE EXCEPTION 'Đơn đã huỷ, không xác nhận được'; END IF;
  IF v_o.status <> 'pending' THEN RETURN jsonb_build_object('ok', true, 'already', true, 'status', v_o.status); END IF;
  UPDATE public.orders SET status='confirmed',confirmed_at=COALESCE(confirmed_at,now()),confirmed_by=COALESCE(confirmed_by,auth.uid()) WHERE id=p_order_id;
  RETURN jsonb_build_object('ok',true,'already',false,'status','confirmed');
END $$;

REVOKE ALL ON FUNCTION public.list_reservation_preorder_queue(uuid), public.release_reservation_preorder(uuid,integer,uuid), public.request_reservation_preorder_print(uuid,integer,text,uuid,text), public.resolve_preorder_waste(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_reservation_preorder_queue(uuid), public.release_reservation_preorder(uuid,integer,uuid), public.request_reservation_preorder_print(uuid,integer,text,uuid,text), public.resolve_preorder_waste(uuid,text,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
