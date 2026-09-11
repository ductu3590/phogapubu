-- BL-0 Task 2: nguồn cấu hình quy trình theo quán, audit và cổng capability ở DB.
-- Slug chỉ xuất hiện trong backfill một lần; mọi đường runtime đọc theo store_id.

CREATE TABLE IF NOT EXISTS public.store_workflow_settings (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  table_ordering_enabled boolean NOT NULL DEFAULT true,
  takeaway_enabled boolean NOT NULL DEFAULT true,
  shipping_enabled boolean NOT NULL DEFAULT true,
  reservations_enabled boolean NOT NULL DEFAULT false,
  reservation_preorder_enabled boolean NOT NULL DEFAULT false,
  minimum_advance_minutes integer NOT NULL DEFAULT 30
    CHECK (minimum_advance_minutes BETWEEN 0 AND 1440),
  booking_horizon_days integer NOT NULL DEFAULT 7
    CHECK (booking_horizon_days BETWEEN 1 AND 90),
  slot_interval_minutes integer NOT NULL DEFAULT 15
    CHECK (slot_interval_minutes IN (5, 10, 15, 30, 60)),
  default_table_capacity integer NOT NULL DEFAULT 6
    CHECK (default_table_capacity BETWEEN 1 AND 100),
  planning_hold_minutes integer NOT NULL DEFAULT 180
    CHECK (planning_hold_minutes BETWEEN 15 AND 720),
  kitchen_release_policy text NOT NULL DEFAULT 'automatic'
    CHECK (kitchen_release_policy IN ('automatic', 'pos_confirmation')),
  staff_order_release_policy text NOT NULL DEFAULT 'automatic'
    CHECK (staff_order_release_policy IN ('automatic', 'pos_confirmation')),
  open_ordering_on_arrival boolean NOT NULL DEFAULT true,
  table_session_idle_timeout_minutes integer NOT NULL DEFAULT 360
    CHECK (table_session_idle_timeout_minutes BETWEEN 60 AND 1440),
  reservation_preorder_edit_cutoff_minutes integer NOT NULL DEFAULT 30
    CHECK (reservation_preorder_edit_cutoff_minutes BETWEEN 0 AND 1440),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT preorder_requires_reservation
    CHECK (NOT reservation_preorder_enabled OR reservations_enabled)
);

CREATE TABLE IF NOT EXISTS public.store_workflow_setting_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  before_value jsonb NOT NULL,
  after_value jsonb NOT NULL,
  changed_by uuid NOT NULL,
  changed_via text NOT NULL CHECK (changed_via IN ('owner', 'mevo')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_workflow_setting_events_store_created
  ON public.store_workflow_setting_events(store_id, created_at DESC);

-- Backfill preset đã chốt. CTE RETURNING bảo đảm chạy lại migration không ghi đè
-- cấu hình mà owner/MEVO đã thay đổi sau lần migrate đầu tiên.
WITH inserted AS (
  INSERT INTO public.store_workflow_settings (
    store_id,
    table_ordering_enabled,
    takeaway_enabled,
    shipping_enabled,
    reservations_enabled,
    reservation_preorder_enabled,
    minimum_advance_minutes,
    booking_horizon_days,
    slot_interval_minutes,
    default_table_capacity,
    planning_hold_minutes,
    kitchen_release_policy,
    staff_order_release_policy,
    open_ordering_on_arrival,
    table_session_idle_timeout_minutes,
    reservation_preorder_edit_cutoff_minutes
  )
  SELECT
    id, true, true, true, false, false, 30, 7, 15, 6, 180,
    'automatic', 'automatic', true, 360, 30
  FROM public.stores
  WHERE slug = 'pho-ga-pubu'
  ON CONFLICT (store_id) DO NOTHING
  RETURNING store_id
)
UPDATE public.stores s
SET payment_timing = 'prepay',
    payment_methods = ARRAY['zalo_checkout']::text[]
WHERE s.id IN (SELECT store_id FROM inserted);

WITH inserted AS (
  INSERT INTO public.store_workflow_settings (
    store_id,
    table_ordering_enabled,
    takeaway_enabled,
    shipping_enabled,
    reservations_enabled,
    reservation_preorder_enabled,
    minimum_advance_minutes,
    booking_horizon_days,
    slot_interval_minutes,
    default_table_capacity,
    planning_hold_minutes,
    kitchen_release_policy,
    staff_order_release_policy,
    open_ordering_on_arrival,
    table_session_idle_timeout_minutes,
    reservation_preorder_edit_cutoff_minutes
  )
  SELECT
    id, true, false, false, true, true, 30, 7, 15, 6, 180,
    'pos_confirmation', 'pos_confirmation', true, 360, 30
  FROM public.stores
  WHERE slug = 'bia-lau-bao-luong'
  ON CONFLICT (store_id) DO NOTHING
  RETURNING store_id
)
UPDATE public.stores s
SET payment_timing = 'postpay',
    payment_methods = ARRAY['cash']::text[]
WHERE s.id IN (SELECT store_id FROM inserted);

-- Quán khác giữ nguyên bốn nguồn cấu hình cũ trên stores và nhận capability
-- tương thích Pubu để migration không làm thay đổi hành vi đang chạy.
INSERT INTO public.store_workflow_settings(store_id)
SELECT id FROM public.stores
ON CONFLICT (store_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_store_workflow_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.store_workflow_settings(store_id)
  VALUES (NEW.id)
  ON CONFLICT (store_id) DO NOTHING;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_store_workflow_settings() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stores_ensure_workflow_settings ON public.stores;
CREATE TRIGGER trg_stores_ensure_workflow_settings
  AFTER INSERT ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.ensure_store_workflow_settings();

ALTER TABLE public.store_workflow_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_workflow_setting_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.store_workflow_settings FROM anon, authenticated;
REVOKE ALL ON public.store_workflow_setting_events FROM anon, authenticated;
GRANT SELECT ON public.store_workflow_settings TO authenticated;
GRANT SELECT ON public.store_workflow_setting_events TO authenticated;

DROP POLICY IF EXISTS workflow_settings_operator_read ON public.store_workflow_settings;
CREATE POLICY workflow_settings_operator_read
  ON public.store_workflow_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.mevo_operators o
      WHERE o.user_id = auth.uid()
        AND o.is_active = true
        AND (
          (o.role = 'store_owner' AND o.store_id = store_workflow_settings.store_id)
          OR o.role = 'mevo_superadmin'
        )
    )
  );

DROP POLICY IF EXISTS workflow_events_operator_read ON public.store_workflow_setting_events;
CREATE POLICY workflow_events_operator_read
  ON public.store_workflow_setting_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.mevo_operators o
      WHERE o.user_id = auth.uid()
        AND o.is_active = true
        AND (
          (o.role = 'store_owner' AND o.store_id = store_workflow_setting_events.store_id)
          OR o.role = 'mevo_superadmin'
        )
    )
  );

-- Snapshot hợp nhất dùng nội bộ bởi cả ba RPC. Không trả store_id, audit hoặc operator.
CREATE OR REPLACE FUNCTION public.store_workflow_snapshot(p_store_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'payment_timing', s.payment_timing,
    'payment_methods', to_jsonb(s.payment_methods),
    'is_accepting_orders', s.is_accepting_orders,
    'serving_hours', s.serving_hours,
    'table_ordering_enabled', w.table_ordering_enabled,
    'takeaway_enabled', w.takeaway_enabled,
    'shipping_enabled', w.shipping_enabled,
    'reservations_enabled', w.reservations_enabled,
    'reservation_preorder_enabled', w.reservation_preorder_enabled,
    'minimum_advance_minutes', w.minimum_advance_minutes,
    'booking_horizon_days', w.booking_horizon_days,
    'slot_interval_minutes', w.slot_interval_minutes,
    'default_table_capacity', w.default_table_capacity,
    'planning_hold_minutes', w.planning_hold_minutes,
    'kitchen_release_policy', w.kitchen_release_policy,
    'staff_order_release_policy', w.staff_order_release_policy,
    'open_ordering_on_arrival', w.open_ordering_on_arrival,
    'table_session_idle_timeout_minutes', w.table_session_idle_timeout_minutes,
    'reservation_preorder_edit_cutoff_minutes', w.reservation_preorder_edit_cutoff_minutes
  )
  FROM public.stores s
  JOIN public.store_workflow_settings w ON w.store_id = s.id
  WHERE s.id = p_store_id;
$$;

REVOKE ALL ON FUNCTION public.store_workflow_snapshot(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_store_workflow(p_store_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.store_workflow_snapshot(s.id)
  FROM public.stores s
  WHERE s.id = p_store_id AND s.is_active = true;
$$;

REVOKE ALL ON FUNCTION public.get_public_store_workflow(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_store_workflow(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_store_workflow_settings(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_operator_store uuid;
  v_result jsonb;
BEGIN
  SELECT role, store_id
  INTO v_role, v_operator_store
  FROM public.mevo_operators
  WHERE user_id = auth.uid() AND is_active = true;

  IF v_role NOT IN ('store_owner', 'mevo_superadmin') OR v_role IS NULL THEN
    RAISE EXCEPTION 'Chỉ chủ quán hoặc MEVO được xem cấu hình quy trình';
  END IF;
  IF v_role = 'store_owner' AND v_operator_store IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'Chỉ được xem quán của mình';
  END IF;

  v_result := public.store_workflow_snapshot(p_store_id);
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy cấu hình quy trình của quán';
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_store_workflow_settings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_workflow_settings(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_store_workflow_settings(
  p_store_id uuid,
  p_settings jsonb,
  p_changed_via text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_operator_store uuid;
  v_expected_keys text[] := ARRAY[
    'payment_timing',
    'payment_methods',
    'is_accepting_orders',
    'serving_hours',
    'table_ordering_enabled',
    'takeaway_enabled',
    'shipping_enabled',
    'reservations_enabled',
    'reservation_preorder_enabled',
    'minimum_advance_minutes',
    'booking_horizon_days',
    'slot_interval_minutes',
    'default_table_capacity',
    'planning_hold_minutes',
    'kitchen_release_policy',
    'staff_order_release_policy',
    'open_ordering_on_arrival',
    'table_session_idle_timeout_minutes',
    'reservation_preorder_edit_cutoff_minutes'
  ];
  v_boolean_keys text[] := ARRAY[
    'is_accepting_orders',
    'table_ordering_enabled',
    'takeaway_enabled',
    'shipping_enabled',
    'reservations_enabled',
    'reservation_preorder_enabled',
    'open_ordering_on_arrival'
  ];
  v_integer_keys text[] := ARRAY[
    'minimum_advance_minutes',
    'booking_horizon_days',
    'slot_interval_minutes',
    'default_table_capacity',
    'planning_hold_minutes',
    'table_session_idle_timeout_minutes',
    'reservation_preorder_edit_cutoff_minutes'
  ];
  v_key text;
  v_unknown_key text;
  v_payment_timing text;
  v_payment_methods text[];
  v_is_accepting_orders boolean;
  v_serving_hours jsonb;
  v_table_ordering_enabled boolean;
  v_takeaway_enabled boolean;
  v_shipping_enabled boolean;
  v_reservations_enabled boolean;
  v_reservation_preorder_enabled boolean;
  v_minimum_advance_minutes integer;
  v_booking_horizon_days integer;
  v_slot_interval_minutes integer;
  v_default_table_capacity integer;
  v_planning_hold_minutes integer;
  v_kitchen_release_policy text;
  v_staff_order_release_policy text;
  v_open_ordering_on_arrival boolean;
  v_table_session_idle_timeout_minutes integer;
  v_reservation_preorder_edit_cutoff_minutes integer;
  v_before jsonb;
  v_after jsonb;
  v_is_dangerous_change boolean;
BEGIN
  SELECT role, store_id
  INTO v_role, v_operator_store
  FROM public.mevo_operators
  WHERE user_id = v_uid AND is_active = true;

  IF v_role NOT IN ('store_owner', 'mevo_superadmin') OR v_role IS NULL THEN
    RAISE EXCEPTION 'Chỉ chủ quán hoặc MEVO được sửa cấu hình quy trình';
  END IF;
  IF v_role = 'store_owner' AND v_operator_store IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'Chỉ được sửa quán của mình';
  END IF;
  IF (v_role = 'store_owner' AND p_changed_via IS DISTINCT FROM 'owner')
     OR (v_role = 'mevo_superadmin' AND p_changed_via IS DISTINCT FROM 'mevo') THEN
    RAISE EXCEPTION 'Nguồn thay đổi không hợp lệ';
  END IF;

  PERFORM 1 FROM public.stores WHERE id = p_store_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy quán';
  END IF;

  INSERT INTO public.store_workflow_settings(store_id)
  VALUES (p_store_id)
  ON CONFLICT (store_id) DO NOTHING;
  PERFORM 1
  FROM public.store_workflow_settings
  WHERE store_id = p_store_id
  FOR UPDATE;

  IF p_settings IS NULL OR jsonb_typeof(p_settings) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Cấu hình quy trình phải là một object đầy đủ';
  END IF;

  FOREACH v_key IN ARRAY v_expected_keys LOOP
    IF NOT (p_settings ? v_key) THEN
      RAISE EXCEPTION 'Thiếu cấu hình bắt buộc: %', v_key;
    END IF;
  END LOOP;

  SELECT key
  INTO v_unknown_key
  FROM jsonb_object_keys(p_settings) AS keys(key)
  WHERE NOT (key = ANY(v_expected_keys))
  LIMIT 1;
  IF v_unknown_key IS NOT NULL THEN
    RAISE EXCEPTION 'Cấu hình không hỗ trợ: %', v_unknown_key;
  END IF;

  FOREACH v_key IN ARRAY v_boolean_keys LOOP
    IF jsonb_typeof(p_settings -> v_key) IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Cấu hình % phải là bật hoặc tắt', v_key;
    END IF;
  END LOOP;
  FOREACH v_key IN ARRAY v_integer_keys LOOP
    IF jsonb_typeof(p_settings -> v_key) IS DISTINCT FROM 'number'
       OR (p_settings ->> v_key) !~ '^-?[0-9]+$' THEN
      RAISE EXCEPTION 'Cấu hình số % không hợp lệ', v_key;
    END IF;
  END LOOP;
  IF jsonb_typeof(p_settings -> 'payment_timing') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_settings -> 'kitchen_release_policy') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_settings -> 'staff_order_release_policy') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Chính sách quy trình không hợp lệ';
  END IF;

  IF jsonb_typeof(p_settings -> 'payment_methods') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_settings -> 'payment_methods') = 0 THEN
    RAISE EXCEPTION 'Phải chọn ít nhất một phương thức thanh toán';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_settings -> 'payment_methods') AS methods(value)
    WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
       OR (value #>> '{}') NOT IN ('zalo_checkout', 'cash')
  ) THEN
    RAISE EXCEPTION 'Phương thức thanh toán không hợp lệ';
  END IF;
  SELECT array_agg(value #>> '{}' ORDER BY ordinality)
  INTO v_payment_methods
  FROM jsonb_array_elements(p_settings -> 'payment_methods')
    WITH ORDINALITY AS methods(value, ordinality);
  IF cardinality(v_payment_methods) <> (
    SELECT count(DISTINCT value #>> '{}')
    FROM jsonb_array_elements(p_settings -> 'payment_methods') AS methods(value)
  ) THEN
    RAISE EXCEPTION 'Phương thức thanh toán không được trùng nhau';
  END IF;

  IF jsonb_typeof(p_settings -> 'serving_hours') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Giờ phục vụ phải là danh sách ca';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_settings -> 'serving_hours') AS shifts(value)
    WHERE jsonb_typeof(value) IS DISTINCT FROM 'object'
  ) THEN
    RAISE EXCEPTION 'Giờ phục vụ không hợp lệ';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_settings -> 'serving_hours') AS shifts(value)
    WHERE NOT (value ? 'open')
       OR NOT (value ? 'close')
       OR jsonb_typeof(value -> 'open') IS DISTINCT FROM 'string'
       OR jsonb_typeof(value -> 'close') IS DISTINCT FROM 'string'
       OR (SELECT count(*) FROM jsonb_object_keys(value)) <> 2
       OR (value ->> 'open') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR (value ->> 'close') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ) THEN
    RAISE EXCEPTION 'Giờ phục vụ phải có dạng HH:mm hợp lệ';
  END IF;

  v_payment_timing := p_settings ->> 'payment_timing';
  v_is_accepting_orders := (p_settings ->> 'is_accepting_orders')::boolean;
  v_serving_hours := p_settings -> 'serving_hours';
  v_table_ordering_enabled := (p_settings ->> 'table_ordering_enabled')::boolean;
  v_takeaway_enabled := (p_settings ->> 'takeaway_enabled')::boolean;
  v_shipping_enabled := (p_settings ->> 'shipping_enabled')::boolean;
  v_reservations_enabled := (p_settings ->> 'reservations_enabled')::boolean;
  v_reservation_preorder_enabled := (p_settings ->> 'reservation_preorder_enabled')::boolean;
  v_minimum_advance_minutes := (p_settings ->> 'minimum_advance_minutes')::integer;
  v_booking_horizon_days := (p_settings ->> 'booking_horizon_days')::integer;
  v_slot_interval_minutes := (p_settings ->> 'slot_interval_minutes')::integer;
  v_default_table_capacity := (p_settings ->> 'default_table_capacity')::integer;
  v_planning_hold_minutes := (p_settings ->> 'planning_hold_minutes')::integer;
  v_kitchen_release_policy := p_settings ->> 'kitchen_release_policy';
  v_staff_order_release_policy := p_settings ->> 'staff_order_release_policy';
  v_open_ordering_on_arrival := (p_settings ->> 'open_ordering_on_arrival')::boolean;
  v_table_session_idle_timeout_minutes :=
    (p_settings ->> 'table_session_idle_timeout_minutes')::integer;
  v_reservation_preorder_edit_cutoff_minutes :=
    (p_settings ->> 'reservation_preorder_edit_cutoff_minutes')::integer;

  IF v_payment_timing NOT IN ('prepay', 'postpay') THEN
    RAISE EXCEPTION 'Thời điểm thanh toán không hợp lệ';
  END IF;
  IF v_minimum_advance_minutes NOT BETWEEN 0 AND 1440 THEN
    RAISE EXCEPTION 'Số phút đặt trước tối thiểu phải từ 0 đến 1440';
  END IF;
  IF v_booking_horizon_days NOT BETWEEN 1 AND 90 THEN
    RAISE EXCEPTION 'Khoảng ngày được đặt bàn phải từ 1 đến 90';
  END IF;
  IF v_slot_interval_minutes NOT IN (5, 10, 15, 30, 60) THEN
    RAISE EXCEPTION 'Bước chọn giờ phải là 5, 10, 15, 30 hoặc 60 phút';
  END IF;
  IF v_default_table_capacity NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Sức chứa mặc định phải từ 1 đến 100 người';
  END IF;
  IF v_planning_hold_minutes NOT BETWEEN 15 AND 720 THEN
    RAISE EXCEPTION 'Khoảng giữ bàn phải từ 15 đến 720 phút';
  END IF;
  IF v_kitchen_release_policy NOT IN ('automatic', 'pos_confirmation')
     OR v_staff_order_release_policy NOT IN ('automatic', 'pos_confirmation') THEN
    RAISE EXCEPTION 'Chính sách xuống bếp không hợp lệ';
  END IF;
  IF v_table_session_idle_timeout_minutes NOT BETWEEN 60 AND 1440 THEN
    RAISE EXCEPTION 'Thời gian hết hạn phiên phải từ 60 đến 1440 phút';
  END IF;
  IF v_reservation_preorder_edit_cutoff_minutes NOT BETWEEN 0 AND 1440 THEN
    RAISE EXCEPTION 'Thời gian khóa sửa món đặt trước phải từ 0 đến 1440 phút';
  END IF;
  IF v_reservation_preorder_enabled AND NOT v_reservations_enabled THEN
    RAISE EXCEPTION 'Đặt món trước chỉ bật được khi Đặt bàn đang bật';
  END IF;

  v_before := public.store_workflow_snapshot(p_store_id);
  v_is_dangerous_change :=
    (v_before ->> 'payment_timing') IS DISTINCT FROM v_payment_timing
    OR (v_before ->> 'kitchen_release_policy') IS DISTINCT FROM v_kitchen_release_policy
    OR (v_before ->> 'staff_order_release_policy') IS DISTINCT FROM v_staff_order_release_policy
    OR (v_before ->> 'open_ordering_on_arrival')::boolean
      IS DISTINCT FROM v_open_ordering_on_arrival
    OR (v_before ->> 'table_session_idle_timeout_minutes')::integer
      IS DISTINCT FROM v_table_session_idle_timeout_minutes;

  IF v_is_dangerous_change AND EXISTS (
    SELECT 1
    FROM public.table_sessions
    WHERE store_id = p_store_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Còn phiên đang hoạt động. Hãy đóng các phiên trước khi đổi chính sách.';
  END IF;
  IF v_is_dangerous_change AND EXISTS (
    SELECT 1
    FROM public.orders
    WHERE store_id = p_store_id
      AND status IN ('pending', 'confirmed', 'cooking', 'ready')
  ) THEN
    RAISE EXCEPTION 'Còn đơn đang hoạt động. Hãy xử lý các đơn trước khi đổi chính sách.';
  END IF;

  UPDATE public.stores
  SET payment_timing = v_payment_timing,
      payment_methods = v_payment_methods,
      is_accepting_orders = v_is_accepting_orders,
      serving_hours = v_serving_hours
  WHERE id = p_store_id;

  UPDATE public.store_workflow_settings
  SET table_ordering_enabled = v_table_ordering_enabled,
      takeaway_enabled = v_takeaway_enabled,
      shipping_enabled = v_shipping_enabled,
      reservations_enabled = v_reservations_enabled,
      reservation_preorder_enabled = v_reservation_preorder_enabled,
      minimum_advance_minutes = v_minimum_advance_minutes,
      booking_horizon_days = v_booking_horizon_days,
      slot_interval_minutes = v_slot_interval_minutes,
      default_table_capacity = v_default_table_capacity,
      planning_hold_minutes = v_planning_hold_minutes,
      kitchen_release_policy = v_kitchen_release_policy,
      staff_order_release_policy = v_staff_order_release_policy,
      open_ordering_on_arrival = v_open_ordering_on_arrival,
      table_session_idle_timeout_minutes = v_table_session_idle_timeout_minutes,
      reservation_preorder_edit_cutoff_minutes =
        v_reservation_preorder_edit_cutoff_minutes,
      updated_at = now(),
      updated_by = v_uid
  WHERE store_id = p_store_id;

  v_after := public.store_workflow_snapshot(p_store_id);
  INSERT INTO public.store_workflow_setting_events(
    store_id,
    before_value,
    after_value,
    changed_by,
    changed_via
  ) VALUES (
    p_store_id,
    v_before,
    v_after,
    v_uid,
    p_changed_via
  );

  RETURN v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.update_store_workflow_settings(uuid, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_store_workflow_settings(uuid, jsonb, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.assert_order_channel_enabled(
  p_store_id uuid,
  p_order_type text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_enabled boolean;
  v_takeaway_enabled boolean;
  v_shipping_enabled boolean;
BEGIN
  SELECT
    table_ordering_enabled,
    takeaway_enabled,
    shipping_enabled
  INTO
    v_table_enabled,
    v_takeaway_enabled,
    v_shipping_enabled
  FROM public.store_workflow_settings
  WHERE store_id = p_store_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy cấu hình quy trình của quán';
  END IF;

  CASE p_order_type
    WHEN 'dine_in' THEN
      IF NOT v_table_enabled THEN
        RAISE EXCEPTION 'Quán hiện không nhận đơn Tại bàn';
      END IF;
    WHEN 'pickup' THEN
      IF NOT v_takeaway_enabled THEN
        RAISE EXCEPTION 'Quán hiện không nhận đơn Mang về';
      END IF;
    WHEN 'delivery' THEN
      IF NOT v_shipping_enabled THEN
        RAISE EXCEPTION 'Quán hiện không nhận đơn Ship';
      END IF;
    ELSE
      RAISE EXCEPTION 'Loại đơn không hợp lệ: %', p_order_type;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_order_channel_enabled(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_order_channel_enabled(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_order_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_order_channel_enabled(NEW.store_id, NEW.order_type);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_order_workflow() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_enforce_workflow ON public.orders;
CREATE TRIGGER trg_orders_enforce_workflow
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_workflow();

NOTIFY pgrst, 'reload schema';
