CREATE OR REPLACE FUNCTION public.update_store_workflow_settings(p_store_id uuid, p_settings jsonb, p_changed_via text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  WHERE user_id = v_uid AND is_active = true AND public.operator_password_ok() /* mig 137 */;

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
      -- mig 126: đơn của phiên đã đóng không bao giờ rời các trạng thái này → không tính là "đang hoạt động"
      AND NOT EXISTS (
        SELECT 1 FROM public.table_sessions ts
        WHERE ts.id = orders.session_id AND ts.status = 'closed'
      )
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
$function$
