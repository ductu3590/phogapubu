-- BL-4 Task 2: serialize booking terminal actions and preorder release by locking
-- the reservation before its order; use the real order_source emitted by QR orders.

CREATE OR REPLACE FUNCTION public.reservation_hold_blocks_customer_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_source = 'customer_zalo'
     AND NEW.table_id IS NOT NULL
     AND public.table_has_current_reservation_hold(NEW.table_id, now()) THEN
    RAISE EXCEPTION 'Bàn đã được đặt trước. Vui lòng báo chủ quán để mở bàn.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_reservation_tables(
  p_reservation_id uuid,
  p_store_id uuid,
  p_arrival_at timestamptz,
  p_planning_hold_minutes integer,
  p_table_ids uuid[],
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sorted_table_ids uuid[];
  v_table_id uuid;
  v_valid_count integer;
  v_hold_ends_at timestamptz := p_arrival_at + make_interval(mins => p_planning_hold_minutes);
BEGIN
  IF p_table_ids IS NULL OR cardinality(p_table_ids) = 0 THEN
    RAISE EXCEPTION 'Cần chọn ít nhất một bàn';
  END IF;

  SELECT array_agg(id ORDER BY id) INTO v_sorted_table_ids
  FROM (SELECT DISTINCT unnest(p_table_ids) AS id) AS unique_table_ids;
  IF cardinality(v_sorted_table_ids) <> cardinality(p_table_ids) THEN
    RAISE EXCEPTION 'Không được chọn trùng bàn';
  END IF;

  SELECT count(*) INTO v_valid_count
  FROM public.tables
  WHERE id = ANY(v_sorted_table_ids)
    AND store_id = p_store_id
    AND is_active IS TRUE;
  IF v_valid_count <> cardinality(v_sorted_table_ids) THEN
    RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động';
  END IF;

  -- QR/session và booking cùng lấy advisory lock theo bàn; lấy theo ID tăng dần
  -- để vừa serialize phân bổ-với-QR, vừa giữ thứ tự khóa ổn định cho mâm nhiều bàn.
  FOREACH v_table_id IN ARRAY v_sorted_table_ids LOOP
    PERFORM public.lock_table_for_session(v_table_id);
    PERFORM 1 FROM public.tables WHERE id = v_table_id FOR UPDATE;
    IF public.open_session_id_for_table(v_table_id) IS NOT NULL THEN
      RAISE EXCEPTION 'Bàn đang có khách, hãy chọn bàn khác';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.reservation_tables rt
      JOIN public.reservations r ON r.id = rt.reservation_id
      WHERE rt.store_id = p_store_id
        AND rt.table_id = v_table_id
        AND rt.released_at IS NULL
        AND r.status = 'confirmed'
        AND rt.hold_starts_at < v_hold_ends_at
        AND rt.hold_ends_at > p_arrival_at
        AND r.id <> p_reservation_id
    ) THEN
      RAISE EXCEPTION 'Bàn đã được giữ cho đặt bàn khác trong khung giờ này';
    END IF;
  END LOOP;

  -- Không xóa dấu vết phân bổ cũ khi duyệt yêu cầu đổi bàn/giờ.
  UPDATE public.reservation_tables
  SET released_at = now(), released_by = p_actor_id, release_reason = 'reservation_change'
  WHERE reservation_id = p_reservation_id AND released_at IS NULL;

  INSERT INTO public.reservation_tables(
    reservation_id, store_id, table_id, hold_starts_at, hold_ends_at, assigned_by
  )
  SELECT p_reservation_id, p_store_id, table_id, p_arrival_at, v_hold_ends_at, p_actor_id
  FROM unnest(v_sorted_table_ids) AS selected(table_id)
  ON CONFLICT (reservation_id, table_id) DO UPDATE
  SET store_id = EXCLUDED.store_id,
      hold_starts_at = EXCLUDED.hold_starts_at,
      hold_ends_at = EXCLUDED.hold_ends_at,
      assigned_at = now(),
      assigned_by = EXCLUDED.assigned_by,
      released_at = NULL,
      released_by = NULL,
      release_reason = NULL;

  RETURN public.reservation_active_table_summary(p_reservation_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_reservation_preorder(
  p_order_id uuid,
  p_expected_revision integer,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  r public.reservations%ROWTYPE;
  snapshot jsonb;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Thiếu mã thao tác'; END IF;

  -- Chỉ đọc trước để xác định booking cần khóa; giữ thứ tự reservation -> order
  -- giống huỷ/no-show/nhận khách, tránh kiểm tra guard trên snapshot cũ lúc cạnh tranh.
  SELECT * INTO o
  FROM public.orders
  WHERE id = p_order_id;
  IF NOT FOUND OR o.order_source <> 'reservation_preorder' THEN
    RAISE EXCEPTION 'Không tìm thấy món đặt trước';
  END IF;
  IF NOT public.is_store_owner_of(o.store_id) THEN
    RAISE EXCEPTION 'Chỉ chủ quán được duyệt món đặt trước';
  END IF;

  SELECT * INTO r
  FROM public.reservations
  WHERE id = o.reservation_id AND store_id = o.store_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đặt bàn của món đặt trước'; END IF;
  IF r.status NOT IN ('confirmed', 'arrived') THEN
    RAISE EXCEPTION 'Đặt bàn đã kết thúc, không thể duyệt món đặt trước';
  END IF;

  SELECT * INTO o
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND OR o.order_source <> 'reservation_preorder'
     OR o.reservation_id IS DISTINCT FROM r.id
     OR o.store_id IS DISTINCT FROM r.store_id THEN
    RAISE EXCEPTION 'Không tìm thấy món đặt trước';
  END IF;
  IF o.status = 'cancelled' THEN RAISE EXCEPTION 'Món đặt trước đã huỷ'; END IF;

  -- Retry đúng revision sau khi commit: không tạo lần release thứ hai. Nếu khách vừa đổi món,
  -- caller cũ không được phép vô tình release revision mới.
  IF o.released_preorder_revision = p_expected_revision
     AND o.preorder_revision = p_expected_revision THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'released_revision', o.released_preorder_revision,
      'needs_print', NOT EXISTS (
        SELECT 1 FROM public.reservation_preorder_print_jobs j
        WHERE j.order_id = o.id AND j.revision = o.released_preorder_revision
      )
    );
  END IF;
  IF o.preorder_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Phiên bản món đã thay đổi, vui lòng tải lại';
  END IF;

  snapshot := public.preorder_release_snapshot(o, p_expected_revision);
  IF snapshot IS NULL THEN RAISE EXCEPTION 'Không tìm thấy snapshot phiên bản món'; END IF;
  UPDATE public.orders
  SET released_preorder_revision = p_expected_revision,
      released_preorder_snapshot = snapshot,
      status = 'confirmed',
      confirmed_at = COALESCE(confirmed_at, now()),
      confirmed_by = COALESCE(confirmed_by, auth.uid()),
      updated_at = now()
  WHERE id = o.id;
  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'released_revision', p_expected_revision,
    'needs_print', true,
    'snapshot', snapshot
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
