-- BL-0 Task 6: hàng đợi gọi nhân viên bền vững, timeout theo quán và quyền đóng bill.
-- Không thay đổi các RPC ghép mâm/thêm bàn: mọi ánh xạ bàn vẫn đi qua session_tables.

-- ============================================================
-- 1) Vòng đời service request và ràng buộc một request đang mở
-- ============================================================
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.table_sessions(id),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS last_ping_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_device_id text,
  ADD COLUMN IF NOT EXISTS ping_count integer NOT NULL DEFAULT 1;

ALTER TABLE public.service_requests
  DROP CONSTRAINT IF EXISTS service_requests_type_check;

-- Bản ghi cũ không có trạng thái xử lý nên không thể xem là yêu cầu đang mở đáng tin cậy.
-- Giữ lại để đối chiếu, nhưng đóng vòng đời trước khi đổi type và tạo unique index.
UPDATE public.service_requests
SET resolved_at = COALESCE(resolved_at, now()),
    last_ping_at = COALESCE(last_ping_at, created_at, now()),
    type = 'call_staff'
WHERE type IS DISTINCT FROM 'call_staff';

ALTER TABLE public.service_requests
  ALTER COLUMN type SET DEFAULT 'call_staff';

ALTER TABLE public.service_requests
  ADD CONSTRAINT service_requests_type_check
    CHECK (type = 'call_staff');

ALTER TABLE public.service_requests
  DROP CONSTRAINT IF EXISTS service_requests_ping_count_check;
ALTER TABLE public.service_requests
  ADD CONSTRAINT service_requests_ping_count_check
    CHECK (ping_count >= 1);

CREATE UNIQUE INDEX IF NOT EXISTS service_requests_one_open_session
  ON public.service_requests(store_id, session_id, type)
  WHERE resolved_at IS NULL AND session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS service_requests_one_open_table
  ON public.service_requests(store_id, table_id, type)
  WHERE resolved_at IS NULL AND session_id IS NULL;

CREATE INDEX IF NOT EXISTS service_requests_store_open
  ON public.service_requests(store_id, created_at)
  WHERE resolved_at IS NULL;

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_service_requests" ON public.service_requests;
DROP POLICY IF EXISTS "auth_select_service_requests" ON public.service_requests;
CREATE POLICY "auth_select_service_requests" ON public.service_requests
  FOR SELECT TO authenticated
  USING (public.is_store_scoped_operator(store_id));

REVOKE ALL ON public.service_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.service_requests FROM authenticated;
GRANT SELECT ON public.service_requests TO authenticated;

-- ============================================================
-- 2) Khách ping qua RPC; cùng phiên/mâm dùng chung một request mở
-- ============================================================
CREATE OR REPLACE FUNCTION public.ping_service_request(
  p_table_id uuid,
  p_type text,
  p_device_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table public.tables%ROWTYPE;
  v_session_id uuid;
  v_request public.service_requests%ROWTYPE;
BEGIN
  IF p_type IS DISTINCT FROM 'call_staff' THEN
    RAISE EXCEPTION 'Loại yêu cầu không hợp lệ';
  END IF;

  SELECT * INTO v_table
  FROM public.tables
  WHERE id = p_table_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động';
  END IF;

  SELECT s.id INTO v_session_id
  FROM public.table_sessions s
  WHERE s.id = public.open_session_id_for_table(v_table.id)
    AND s.store_id = v_table.store_id
    AND s.status = 'open';

  IF v_session_id IS NOT NULL THEN
    INSERT INTO public.service_requests AS current_request (
      store_id,
      table_id,
      table_number,
      type,
      session_id,
      last_ping_at,
      last_device_id,
      ping_count
    ) VALUES (
      v_table.store_id,
      v_table.id,
      v_table.table_number,
      'call_staff',
      v_session_id,
      now(),
      p_device_id,
      1
    )
    ON CONFLICT (store_id, session_id, type)
      WHERE resolved_at IS NULL AND session_id IS NOT NULL
    DO UPDATE
      SET table_id = EXCLUDED.table_id,
          table_number = EXCLUDED.table_number,
          last_ping_at = EXCLUDED.last_ping_at,
          last_device_id = EXCLUDED.last_device_id,
          ping_count = current_request.ping_count + 1
      WHERE current_request.last_ping_at <= EXCLUDED.last_ping_at - interval '10 seconds'
    RETURNING * INTO v_request;
  ELSE
    INSERT INTO public.service_requests AS current_request (
      store_id,
      table_id,
      table_number,
      type,
      session_id,
      last_ping_at,
      last_device_id,
      ping_count
    ) VALUES (
      v_table.store_id,
      v_table.id,
      v_table.table_number,
      'call_staff',
      NULL,
      now(),
      p_device_id,
      1
    )
    ON CONFLICT (store_id, table_id, type)
      WHERE resolved_at IS NULL AND session_id IS NULL
    DO UPDATE
      SET table_number = EXCLUDED.table_number,
          last_ping_at = EXCLUDED.last_ping_at,
          last_device_id = EXCLUDED.last_device_id,
          ping_count = current_request.ping_count + 1
      WHERE current_request.last_ping_at <= EXCLUDED.last_ping_at - interval '10 seconds'
    RETURNING * INTO v_request;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vui lòng chờ trước khi gọi nhân viên lần nữa';
  END IF;

  RETURN to_jsonb(v_request);
END;
$$;

REVOKE ALL ON FUNCTION public.ping_service_request(uuid, text, text)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.ping_service_request(uuid, text, text) TO anon;

-- ============================================================
-- 3) Staff/owner đọc hàng đợi và đánh dấu đã xử lý đúng store
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_service_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.service_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM public.service_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu';
  END IF;
  IF NOT public.is_store_scoped_operator(v_request.store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;

  IF v_request.resolved_at IS NOT NULL THEN
    RETURN to_jsonb(v_request) || jsonb_build_object('already', true);
  END IF;

  UPDATE public.service_requests
  SET resolved_at = now(),
      resolved_by = auth.uid()
  WHERE id = v_request.id
  RETURNING * INTO v_request;

  RETURN to_jsonb(v_request) || jsonb_build_object('already', false);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_service_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_service_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_open_service_requests(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requests jsonb;
BEGIN
  IF NOT public.is_store_scoped_operator(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at), '[]'::jsonb)
  INTO v_requests
  FROM public.service_requests r
  WHERE r.store_id = p_store_id
    AND r.resolved_at IS NULL;

  RETURN v_requests;
END;
$$;

REVOKE ALL ON FUNCTION public.list_open_service_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_open_service_requests(uuid) TO authenticated;

-- ============================================================
-- 4) Timeout phiên đọc cấu hình riêng của từng quán
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_stale_table_sessions(p_store_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.table_sessions t
  SET status = 'closed',
      closed_at = now(),
      close_reason = 'expired'
  WHERE t.id IN (
    SELECT s.id
    FROM public.table_sessions s
    JOIN public.store_workflow_settings workflow
      ON workflow.store_id = s.store_id
    WHERE s.store_id = p_store_id
      AND s.status = 'open'
      AND s.last_activity_at < now() - make_interval(
        mins => workflow.table_session_idle_timeout_minutes
      )
    FOR UPDATE OF s SKIP LOCKED
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_table_sessions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_table_sessions(uuid) TO anon, authenticated;

-- ============================================================
-- 5) Chỉ owner được thu/bỏ bàn; không đóng khi còn batch chờ POS
-- ============================================================
CREATE OR REPLACE FUNCTION public.close_table_session(
  p_session_id uuid,
  p_reason text,
  p_instrument text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.table_sessions%ROWTYPE;
  v_uid uuid := auth.uid();
  v_settled integer := 0;
  v_cancelled integer := 0;
  v_left integer := 0;
  v_pending integer := 0;
  v_total bigint := 0;
BEGIN
  IF p_reason NOT IN ('paid', 'staff_reset') THEN
    RAISE EXCEPTION 'Lý do đóng bàn không hợp lệ: %', p_reason;
  END IF;

  -- Giữ thứ tự khoá của migration 039 để không chen đơn mới trong lúc chốt bill.
  SELECT * INTO v_session
  FROM public.table_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiên';
  END IF;
  IF NOT public.is_store_owner_of(v_session.store_id) THEN
    RAISE EXCEPTION 'Chỉ chủ quán mới được đóng bill';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Thiếu danh tính người chốt bill';
  END IF;

  -- Idempotent: không ghi đè người đã chốt lần đầu.
  IF v_session.status = 'closed'
     AND v_session.close_reason IN ('paid', 'staff_reset') THEN
    SELECT COALESCE(SUM(total_amount), 0)
    INTO v_total
    FROM public.orders
    WHERE session_id = p_session_id
      AND status <> 'cancelled';

    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'orders_settled', 0,
      'orders_cancelled', 0,
      'orders_left_in_kitchen', 0,
      'total', v_total
    );
  END IF;

  SELECT COUNT(*)
  INTO v_pending
  FROM public.orders
  WHERE session_id = p_session_id
    AND status = 'pending'
    AND order_source <> 'pos';

  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Còn % đơn chưa được chủ quán xác nhận', v_pending;
  END IF;

  IF p_reason = 'paid' THEN
    IF p_instrument IS NULL OR p_instrument NOT IN ('cash', 'bank') THEN
      RAISE EXCEPTION 'Phương tiện thanh toán không hợp lệ: %', COALESCE(p_instrument, '(trống)');
    END IF;

    UPDATE public.orders
    SET payment_received_at = now(),
        payment_received_via = 'owner',
        payment_received_by = v_uid,
        payment_instrument = p_instrument
    WHERE session_id = p_session_id
      AND status <> 'cancelled'
      AND payment_received_at IS NULL;
    GET DIAGNOSTICS v_settled = ROW_COUNT;
  ELSE
    UPDATE public.orders
    SET status = 'cancelled'
    WHERE session_id = p_session_id
      AND status IN ('pending', 'confirmed')
      AND payment_received_at IS NULL;
    GET DIAGNOSTICS v_cancelled = ROW_COUNT;

    SELECT COUNT(*)
    INTO v_left
    FROM public.orders
    WHERE session_id = p_session_id
      AND status IN ('cooking', 'ready');
  END IF;

  SELECT COALESCE(SUM(total_amount), 0)
  INTO v_total
  FROM public.orders
  WHERE session_id = p_session_id
    AND status <> 'cancelled';

  UPDATE public.table_sessions
  SET status = 'closed',
      closed_at = COALESCE(closed_at, now()),
      closed_by = v_uid,
      close_reason = p_reason
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'orders_settled', v_settled,
    'orders_cancelled', v_cancelled,
    'orders_left_in_kitchen', v_left,
    'total', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_table_session(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_table_session(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_table_sessions_bulk(
  p_session_ids uuid[],
  p_reason text,
  p_instrument text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_ids uuid[];
  v_one jsonb;
  v_settled integer := 0;
  v_cancelled integer := 0;
  v_left integer := 0;
  v_total bigint := 0;
  v_count integer := 0;
BEGIN
  IF p_session_ids IS NULL OR array_length(p_session_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Chưa chọn phiên nào';
  END IF;

  -- Giữ thứ tự id tăng dần và loại trùng như RPC mâm hiện hành.
  SELECT array_agg(DISTINCT session_id ORDER BY session_id)
  INTO v_ids
  FROM unnest(p_session_ids) AS session_id;

  FOREACH v_id IN ARRAY v_ids
  LOOP
    v_one := public.close_table_session(v_id, p_reason, p_instrument);
    v_count := v_count + 1;
    v_settled := v_settled + COALESCE((v_one->>'orders_settled')::integer, 0);
    v_cancelled := v_cancelled + COALESCE((v_one->>'orders_cancelled')::integer, 0);
    v_left := v_left + COALESCE((v_one->>'orders_left_in_kitchen')::integer, 0);
    v_total := v_total + COALESCE((v_one->>'total')::bigint, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'sessions', v_count,
    'orders_settled', v_settled,
    'orders_cancelled', v_cancelled,
    'orders_left_in_kitchen', v_left,
    'total', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_table_sessions_bulk(uuid[], text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_table_sessions_bulk(uuid[], text, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
