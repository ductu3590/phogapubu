-- BL-3 Task 5: preorder giữ nguyên order ID và chỉ đi vào bill khi reservation arrived.

CREATE OR REPLACE FUNCTION public.settle_reservation_preorders(
  p_reservation_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reservation đã được RPC lifecycle khóa trước; khóa orders sau nó để tránh deadlock với sửa món khách.
  PERFORM 1 FROM public.orders
  WHERE reservation_id = p_reservation_id AND order_source = 'reservation_preorder'
  ORDER BY id FOR UPDATE;

  UPDATE public.orders o
  SET status = 'cancelled',
      waste_review_required = EXISTS (
        SELECT 1 FROM public.reservation_preorder_print_jobs j WHERE j.order_id = o.id
      ),
      updated_at = now()
  WHERE o.reservation_id = p_reservation_id
    AND o.order_source = 'reservation_preorder'
    AND o.status <> 'cancelled';
END;
$$;
REVOKE ALL ON FUNCTION public.settle_reservation_preorders(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reservation_preorder_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled_by_customer' AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (
       SELECT 1 FROM public.orders o
       WHERE o.reservation_id = OLD.id
         AND o.order_source = 'reservation_preorder'
         AND (o.released_preorder_revision > 0 OR EXISTS (
           SELECT 1 FROM public.reservation_preorder_print_jobs j WHERE j.order_id = o.id
         ))
     ) THEN
    RAISE EXCEPTION 'Món đặt trước đã được quán chuẩn bị, vui lòng gọi quán để hủy đặt bàn';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.reservation_preorder_lifecycle_guard() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reservation_preorder_lifecycle_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'arrived' THEN
    UPDATE public.orders
    SET session_id = NEW.session_id,
        table_id = (SELECT table_id FROM public.table_sessions WHERE id = NEW.session_id),
        updated_at = now()
    WHERE reservation_id = NEW.id
      AND order_source = 'reservation_preorder'
      AND status <> 'cancelled';
  ELSIF OLD.status IS DISTINCT FROM NEW.status
    AND NEW.status IN ('cancelled_by_customer', 'cancelled_by_store', 'no_show') THEN
    PERFORM public.settle_reservation_preorders(NEW.id, NEW.status);
  END IF;

  IF OLD.arrival_at IS DISTINCT FROM NEW.arrival_at
     AND NEW.status IN ('confirmed', 'change_requested') THEN
    UPDATE public.orders
    SET preorder_edit_deadline = NEW.arrival_at - make_interval(mins => NEW.reservation_preorder_edit_cutoff_minutes),
        updated_at = now()
    WHERE reservation_id = NEW.id
      AND order_source = 'reservation_preorder'
      AND status <> 'cancelled';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.reservation_preorder_lifecycle_after() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_reservation_preorder_lifecycle_guard ON public.reservations;
CREATE TRIGGER trg_reservation_preorder_lifecycle_guard
  BEFORE UPDATE OF status ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.reservation_preorder_lifecycle_guard();
DROP TRIGGER IF EXISTS trg_reservation_preorder_lifecycle_after ON public.reservations;
CREATE TRIGGER trg_reservation_preorder_lifecycle_after
  AFTER UPDATE OF status, arrival_at ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.reservation_preorder_lifecycle_after();

CREATE OR REPLACE FUNCTION public.cancel_store_reservation(
  p_reservation_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_actor_kind text;
BEGIN
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL OR char_length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'Cần ghi lý do hủy đặt bàn (tối đa 500 ký tự)';
  END IF;
  SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đặt bàn'; END IF;
  IF NOT public.is_store_owner_of(v_reservation.store_id) THEN RAISE EXCEPTION 'Chỉ chủ quán mới được hủy đặt bàn'; END IF;
  IF v_reservation.status NOT IN ('pending', 'confirmed', 'change_requested') OR v_reservation.session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Đặt bàn này không còn có thể hủy';
  END IF;
  v_actor_kind := public.reservation_operator_actor_kind(v_reservation.store_id);
  UPDATE public.reservations
  SET status = 'cancelled_by_store', cancelled_at = now(), cancelled_by = auth.uid(), updated_at = now()
  WHERE id = v_reservation.id RETURNING * INTO v_reservation;
  PERFORM public.append_reservation_event(v_reservation.id, v_reservation.store_id, auth.uid(), v_actor_kind,
    'cancelled_by_store', '{}'::jsonb, jsonb_build_object('status','cancelled_by_store'), btrim(p_reason));
  RETURN public.reservation_public_json(v_reservation);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_store_reservation(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_store_reservation(uuid, text) TO authenticated;

-- 066 từng khóa order trước rồi mới khóa reservation. Arrival khóa reservation trước
-- rồi trigger này khóa order, nên hai thao tác đồng thời có thể chờ vòng tròn.
-- Giữ chữ ký public, nhưng chuẩn hóa thứ tự: reservation -> order ở cả hai phía.
CREATE OR REPLACE FUNCTION public.cancel_reservation_preorder(
  p_order_id uuid,
  p_customer_token text,
  p_expected_revision integer,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  r public.reservations%ROWTYPE;
BEGIN
  -- Read only để biết reservation cần khóa; không giữ order lock trước reservation.
  SELECT * INTO o FROM public.orders
  WHERE id = p_order_id AND order_source = 'reservation_preorder';
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy món đặt trước'; END IF;

  r := public.assert_preorder_customer(o.reservation_id, p_customer_token);

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.order_source <> 'reservation_preorder' THEN
    RAISE EXCEPTION 'Không tìm thấy món đặt trước';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.reservation_preorder_mutations m
    WHERE m.order_id = o.id AND m.client_request_id = p_client_request_id
      AND m.action = 'cancel'
      AND m.payload = jsonb_build_object('expected_revision', p_expected_revision)
  ) THEN
    RETURN public.preorder_customer_json(o);
  END IF;
  IF EXISTS(SELECT 1 FROM public.reservation_preorder_mutations m WHERE m.order_id = o.id AND m.client_request_id = p_client_request_id) THEN
    RAISE EXCEPTION 'preorder_request_payload_mismatch';
  END IF;
  IF o.preorder_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Món đặt trước vừa được thay đổi, vui lòng tải lại';
  END IF;
  IF r.status <> 'confirmed' OR now() >= o.preorder_edit_deadline THEN
    RAISE EXCEPTION 'Đã quá thời hạn hủy món, vui lòng gọi quán';
  END IF;
  UPDATE public.orders SET status = 'cancelled', updated_at = now() WHERE id = o.id RETURNING * INTO o;
  INSERT INTO public.reservation_preorder_mutations(order_id, client_request_id, action, payload, result_revision)
  VALUES(o.id, p_client_request_id, 'cancel', jsonb_build_object('expected_revision', p_expected_revision), o.preorder_revision);
  RETURN public.preorder_customer_json(o);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_reservation_preorder(uuid, text, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_preorder(uuid, text, integer, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
