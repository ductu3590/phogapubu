-- 103b_baseline_prod_drift.sql — Đưa DB dựng mới về ĐÚNG định nghĩa hàm prod ngay trước mig 104.
--
-- ⛔ KHÔNG ÁP FILE NÀY LÊN PROD. Prod đã qua 104–110; chạy file này sẽ LÙI 13 hàm về bản cũ, mất luôn
--    chuyển bàn, giảm giá bill, chặn thu lẻ. Khối $guard$ bên dưới tự từ chối mọi DB đã có mig 104.
--    File chỉ tồn tại để DB dựng từ đầu (replay supabase/migrations/* theo thứ tự) khớp prod.
--
-- Vì sao cần: các hàm đang chạy được vá TẠI CHỖ bằng pg_temp.mevo_patch (pg_get_functiondef + replace),
-- chuỗi neo chép từ prod. Nhưng thân hàm trên prod khác file migration cũ: nhiều lần áp lên prod đã lược
-- comment và gộp dòng. DB dựng mới vì thế không có chuỗi neo → mig 105 RAISE, sau đó tới 108, 110.
--
-- 36 hàm dưới đây (2026-11-04, đối chiếu md5 từng hàm giữa prod và bản replay):
--   • 13 hàm bị vá ở 105/108/109/110 — lấy bản TRƯỚC khi vá:
--       supabase/tests/prod-defs/ (12 hàm); assign_reservation_tables = bản prod gỡ bản vá mig 109.
--   • 23 hàm còn lại — bản prod hiện tại (không migration nào từ 104 đụng tới).
-- Đã so sau khi bỏ comment + khoảng trắng: KHÔNG hàm nào lệch logic, trừ create_tray_session (repo ghi
-- tường minh closed_by = NULL, prod bỏ cột đó; kết quả như nhau). Nên file này không đổi hành vi.
--
-- Ngoài hàm, file còn BẬT RLS cho reservation_customer_call_tasks (cuối file): mig 074 không có
-- ENABLE ROW LEVEL SECURITY, còn prod có (nhiều khả năng event trigger ensure_rls của nền tảng tự bật).
-- Mig 074 đã REVOKE ALL khỏi anon/authenticated nên DB mới không hở ngay, chỉ thiếu một lớp so với prod.
--
-- Không đưa vào đây:
--   • rls_auto_enable() + event trigger ensure_rls: do nền tảng Supabase tạo, không phải code repo.
--   • 13 hàm prod có CRLF trong thân nhưng chữ giống hệt file (add_order_line, is_operator...): chỉ khác
--     xuống dòng, không chuỗi neo nào phụ thuộc.
--
-- ⚠️ Thân hàm phải giữ NGUYÊN BYTE: get_sessions_bill và recompute_order_total lẫn CRLF, mig 108 neo vào
--    đúng các byte đó. Vì vậy .gitattributes đặt file này là -text (autocrlf không được đổi). Đừng định
--    dạng lại, đừng chuẩn hoá xuống dòng, đừng sửa tay để "cập nhật": hàm sửa sau này thuộc migration mới.
-- ⚠️ `supabase db reset`/`db push` BỎ QUA file này như 7 file 006b_, 007a_... (tên phải khớp ^[0-9]+_).
--    Repo cũng không có supabase/config.toml, và số 002, 017 bị trùng. Dựng DB = chạy psql từng file theo
--    thứ tự LC_ALL=C.

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.table_session_moves') IS NOT NULL THEN
    RAISE EXCEPTION 'mig 103b: DB này đã qua mig 104, không được áp baseline (sẽ lùi hàm về bản cũ)';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.add_table_to_session(p_session_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_s table_sessions%rowtype; v_busy text;
begin
  select * into v_s from table_sessions where id = p_session_id for update;
  if not found then raise exception 'Không tìm thấy phiên'; end if;
  if not is_store_scoped_operator(v_s.store_id) then raise exception 'Không có quyền'; end if;
  if v_s.status <> 'open' then raise exception 'Phiên đã đóng'; end if;

  perform lock_table_for_session(p_table_id);
  if not exists (select 1 from tables where id = p_table_id and store_id = v_s.store_id and is_active) then
    raise exception 'Bàn không thuộc quán hoặc đã ngừng dùng';
  end if;
  if open_session_id_for_table(p_table_id) is not null then
    select table_number into v_busy from tables where id = p_table_id;
    raise exception '% đang có khách', v_busy;
  end if;

  insert into session_tables (session_id, table_id) values (p_session_id, p_table_id)
  on conflict (session_id, table_id) do update set is_open = true;

  update table_sessions set is_open_ordering = true, last_activity_at = now()
   where id = p_session_id;

  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.assign_reservation_tables(p_reservation_id uuid, p_store_id uuid, p_arrival_at timestamp with time zone, p_planning_hold_minutes integer, p_table_ids uuid[], p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sorted_table_ids uuid[];
  v_table_id uuid;
  v_valid_count integer;
  v_hold_starts_at timestamptz := p_arrival_at - interval '60 minutes';
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
  SELECT count(*) INTO v_valid_count FROM public.tables
  WHERE id = ANY(v_sorted_table_ids) AND store_id = p_store_id AND is_active IS TRUE;
  IF v_valid_count <> cardinality(v_sorted_table_ids) THEN
    RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động';
  END IF;

  FOREACH v_table_id IN ARRAY v_sorted_table_ids LOOP
    PERFORM public.lock_table_for_session(v_table_id);
    PERFORM 1 FROM public.tables WHERE id = v_table_id FOR UPDATE;
    IF public.open_session_id_for_table(v_table_id) IS NOT NULL THEN
      RAISE EXCEPTION 'Bàn đang có khách, hãy chọn bàn khác';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.reservation_tables rt
      JOIN public.reservations r ON r.id = rt.reservation_id
      WHERE rt.store_id = p_store_id AND rt.table_id = v_table_id
        AND rt.released_at IS NULL AND r.status = 'confirmed'
        AND rt.hold_starts_at < v_hold_ends_at
        AND rt.hold_ends_at > v_hold_starts_at
        AND r.id <> p_reservation_id
    ) THEN
      RAISE EXCEPTION 'Bàn đã được giữ cho đặt bàn khác trong khung giờ này';
    END IF;
  END LOOP;

  UPDATE public.reservation_tables
  SET released_at = now(), released_by = p_actor_id, release_reason = 'reservation_change'
  WHERE reservation_id = p_reservation_id AND released_at IS NULL;
  INSERT INTO public.reservation_tables(
    reservation_id, store_id, table_id, hold_starts_at, hold_ends_at, assigned_by
  )
  SELECT p_reservation_id, p_store_id, table_id, v_hold_starts_at, v_hold_ends_at, p_actor_id
  FROM unnest(v_sorted_table_ids) AS selected(table_id)
  ON CONFLICT (reservation_id, table_id) DO UPDATE
  SET store_id = EXCLUDED.store_id,
      hold_starts_at = EXCLUDED.hold_starts_at,
      hold_ends_at = EXCLUDED.hold_ends_at,
      assigned_at = now(), assigned_by = EXCLUDED.assigned_by,
      released_at = NULL, released_by = NULL, release_reason = NULL;
  RETURN public.reservation_active_table_summary(p_reservation_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_complete_dine_in()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.status := 'paid';
  new.completed_at := coalesce(new.completed_at, now());
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.close_table_session(p_session_id uuid, p_reason text, p_instrument text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.table_sessions%ROWTYPE;
  v_reservation public.reservations%ROWTYPE;
  v_uid uuid := auth.uid();
  v_settled integer := 0;
  v_cancelled integer := 0;
  v_left integer := 0;
  v_pending integer := 0;
  v_total bigint := 0;
  v_before jsonb;
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
  IF NOT public.is_store_pos_operator(v_session.store_id) THEN
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

    -- Mig 085: thu ngân xác nhận đã nhận tiền = bữa ăn KẾT THÚC → mọi đơn còn hiệu lực của bàn
    -- chuyển "Hoàn tất" (status 'paid' + completed_at), cùng quy ước với trigger auto_complete_dine_in.
    UPDATE public.orders
    SET status = 'paid',
        completed_at = COALESCE(completed_at, now())
    WHERE session_id = p_session_id
      AND status NOT IN ('cancelled', 'paid');
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

  IF p_reason = 'paid' THEN
    SELECT * INTO v_reservation
    FROM public.reservations
    WHERE session_id = p_session_id
      AND status = 'arrived'
    FOR UPDATE;

    IF FOUND THEN
      v_before := public.reservation_public_json(v_reservation)
        || public.reservation_active_table_summary(v_reservation.id);
      UPDATE public.reservations
      SET status = 'completed',
          completed_at = now(),
          completed_by = v_uid,
          updated_at = now()
      WHERE id = v_reservation.id
      RETURNING * INTO v_reservation;

      PERFORM public.append_reservation_event(
        v_reservation.id, v_reservation.store_id, v_uid, 'owner', 'completed',
        v_before,
        public.reservation_public_json(v_reservation)
          || public.reservation_active_table_summary(v_reservation.id)
          || jsonb_build_object('session_id', p_session_id),
        NULL
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'orders_settled', v_settled,
    'orders_cancelled', v_cancelled,
    'orders_left_in_kitchen', v_left,
    'total', v_total
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_manual_payment(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_order orders%rowtype;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then raise exception 'Không tìm thấy đơn'; end if;
  if not is_store_owner_or_admin(v_order.store_id) then
    raise exception 'Chỉ chủ quán được xác nhận nhận tiền';
  end if;
  if v_order.payment_method not in ('cash','bank_transfer')
     and not (v_order.payment_method = 'zalo_checkout'
              and v_order.payment_instrument is distinct from 'wallet') then
    raise exception 'Đơn ví Zalo tự xác nhận, không xác nhận tay';
  end if;
  if v_order.status = 'cancelled' then raise exception 'Đơn đã huỷ'; end if;
  if v_order.payment_received_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'received_at', v_order.payment_received_at);
  end if;
  update orders
  set payment_received_at = now(), payment_received_via = 'owner', payment_received_by = auth.uid()
  where id = p_order_id;
  return jsonb_build_object('ok', true, 'already', false);
end $function$
;

CREATE OR REPLACE FUNCTION public.create_order(p_store_id uuid, p_table_id uuid DEFAULT NULL::uuid, p_items jsonb DEFAULT NULL::jsonb, p_payment_method text DEFAULT 'zalo_checkout'::text, p_zalo_user_id text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_order_type text DEFAULT 'dine_in'::text, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_delivery_address text DEFAULT NULL::text, p_voucher_code text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order orders%ROWTYPE; v_total int := 0; v_token text := gen_random_uuid()::text;
  v_item jsonb; v_menu menu_items%ROWTYPE; v_qty int;
  v_topping_ids uuid[]; v_item_toppings jsonb; v_topping_total int; v_topping_count int;
  v_voucher vouchers%ROWTYPE; v_discount int := 0; v_reason text;
  v_timing text; v_session table_sessions%ROWTYPE; v_session_id uuid;
  v_skip_method_check boolean := false;
  v_variant      menu_item_variants%ROWTYPE;
  v_variant_id   uuid;
  v_variant_cnt  int;
  v_item_price   int;
  v_item_name    text;
  v_variant_name text;
BEGIN
  IF p_payment_method = 'zalopay' THEN p_payment_method := 'zalo_checkout'; END IF;
  IF p_payment_method NOT IN ('zalo_checkout','cash') THEN RAISE EXCEPTION 'payment_method không hợp lệ: %', p_payment_method; END IF;

  IF p_order_type NOT IN ('dine_in','pickup','delivery') THEN RAISE EXCEPTION 'order_type không hợp lệ: %', p_order_type; END IF;

  IF p_order_type = 'dine_in' THEN
    IF p_table_id IS NULL THEN RAISE EXCEPTION 'Đơn tại bàn cần có table_id'; END IF;
    IF NOT EXISTS (SELECT 1 FROM tables WHERE id = p_table_id AND store_id = p_store_id AND is_active = true) THEN
      RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động'; END IF;
  END IF;

  IF p_order_type IN ('pickup','delivery') THEN
    IF p_customer_name IS NULL THEN RAISE EXCEPTION 'Đơn mang về cần tên khách hàng'; END IF;
    IF p_order_type = 'delivery' THEN
      IF p_customer_phone IS NULL THEN RAISE EXCEPTION 'Đơn ship cần số điện thoại'; END IF;
      IF p_delivery_address IS NULL THEN RAISE EXCEPTION 'Đơn ship cần địa chỉ giao hàng'; END IF;
    END IF;
    IF p_payment_method <> 'zalo_checkout' THEN RAISE EXCEPTION 'Đơn mang về chỉ chấp nhận thanh toán online'; END IF;
  END IF;

  -- ---------- KHỐI PHIÊN BÀN ----------
  SELECT payment_timing INTO v_timing FROM stores WHERE id = p_store_id;
  IF v_timing IS NULL THEN RAISE EXCEPTION 'Không tìm thấy quán'; END IF;

  IF v_timing = 'postpay' AND p_order_type = 'dine_in' THEN
    p_payment_method := 'cash';
    v_skip_method_check := true;

    -- Khoá theo BÀN trước khi tìm-hoặc-mở: hai máy bấm cùng lúc thì máy sau phải nhìn thấy
    -- phiên máy trước vừa tạo, không được tạo phiên thứ hai (rủi ro #1).
    PERFORM lock_table_for_session(p_table_id);

    v_session_id := open_session_id_for_table(p_table_id);
    IF v_session_id IS NULL THEN
      INSERT INTO table_sessions (store_id, table_id, host_zalo_user_id, host_device_id, opened_by)
      VALUES (p_store_id, p_table_id, p_zalo_user_id, p_device_id, 'customer')
      RETURNING id INTO v_session_id;
      -- unique index session_tables_one_open_per_table là chốt chặn cuối nếu advisory lock hở
      INSERT INTO session_tables (session_id, table_id) VALUES (v_session_id, p_table_id);
    END IF;

    SELECT * INTO v_session FROM table_sessions WHERE id = v_session_id FOR UPDATE;
    IF NOT FOUND OR v_session.status <> 'open' THEN
      RAISE EXCEPTION 'Bàn vừa được đóng, vui lòng quét lại QR';
    END IF;

    -- Mâm đoàn: nhân viên đã đứng ra ghép bàn nên KHÔNG khoá chủ phiên — ai trong mâm quét QR
    -- bàn nào cũng gọi thêm được (quyết định #2 ngày 2026-08-30). Bàn lẻ vẫn khoá như mig 039.
    IF NOT v_session.is_open_ordering THEN
      IF v_session.host_zalo_user_id IS NULL AND v_session.host_device_id IS NULL THEN
        UPDATE table_sessions
           SET host_zalo_user_id = p_zalo_user_id, host_device_id = p_device_id
         WHERE id = v_session.id RETURNING * INTO v_session;
      END IF;

      IF NOT (
           (p_zalo_user_id IS NOT NULL AND v_session.host_zalo_user_id = p_zalo_user_id)
        OR (p_device_id   IS NOT NULL AND v_session.host_device_id   = p_device_id)
      ) THEN
        RAISE EXCEPTION 'Bàn này đang có khách khác gọi món. Nhờ nhân viên mở bàn giúp bạn.';
      END IF;
    END IF;

  ELSIF v_timing = 'prepay' AND p_order_type = 'dine_in' THEN
    IF p_payment_method <> 'zalo_checkout' THEN
      RAISE EXCEPTION 'Quán yêu cầu thanh toán trước khi bếp làm.';
    END IF;
  END IF;

  IF NOT v_skip_method_check THEN
    IF NOT EXISTS (
      SELECT 1 FROM stores WHERE id = p_store_id AND p_payment_method = ANY(payment_methods)
    ) THEN
      RAISE EXCEPTION 'Quán không nhận phương thức thanh toán này, vui lòng chọn lại';
    END IF;
  END IF;

  IF NOT store_accepting_now(p_store_id)
     AND NOT (v_session_id IS NOT NULL AND v_session.opened_at > now() - interval '2 hours') THEN
    RAISE EXCEPTION 'Quán đang tạm nghỉ hoặc ngoài giờ phục vụ';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Đơn không có món nào'; END IF;

  INSERT INTO orders (store_id, table_id, total_amount, zalo_user_id, note, payment_method, status, capability_token,
    order_type, customer_name, customer_phone, delivery_address, session_id)
  VALUES (p_store_id, p_table_id, 0, p_zalo_user_id, p_note, p_payment_method, 'pending', v_token,
    p_order_type, p_customer_name, p_customer_phone, p_delivery_address, v_session_id)
  RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Số lượng không hợp lệ'; END IF;

    SELECT * INTO v_menu FROM menu_items
    WHERE id = (v_item->>'menu_item_id')::uuid AND store_id = p_store_id AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Món không thuộc quán hoặc ngừng bán: %', v_item->>'menu_item_id'; END IF;

    -- ─── Biến thể: chọn 1, bắt buộc, giá tuyệt đối thay giá món ─────────────
    -- Reset CẢ NĂM biến mỗi vòng: món trước có biến thể, món sau không, mà quên reset
    -- thì món sau thừa hưởng giá/tên của món trước.
    v_variant_id   := NULLIF(v_item->>'variant_id','')::uuid;
    v_item_price   := v_menu.price;
    v_item_name    := v_menu.name;
    v_variant_name := NULL;
    v_variant      := NULL;

    -- Đếm TỔNG biến thể, KHÔNG lọc is_available. Nếu lọc thì món đã tắt bán
    -- hết mọi lựa chọn sẽ rơi vào nhánh "món thường" và bán được ở giá cũ,
    -- trong khi mini-app đã ẩn món đi.
    -- Không cần lọc store_id ở đây (câu tra bên dưới thì có): FK ghép
    -- miv_item_store_fkey (mig 042) đã chặn biến thể quán khác gắn vào món quán này.
    SELECT count(*) INTO v_variant_cnt
      FROM menu_item_variants WHERE menu_item_id = v_menu.id;

    IF v_variant_cnt = 0 THEN
      IF v_variant_id IS NOT NULL THEN
        RAISE EXCEPTION 'Món "%" vừa đổi tuỳ chọn, mời bạn chọn lại', v_menu.name;
      END IF;
    ELSE
      IF v_variant_id IS NULL THEN
        RAISE EXCEPTION 'Món "%" cần chọn loại, mời bạn chọn lại', v_menu.name;
      END IF;
      SELECT * INTO v_variant FROM menu_item_variants
       WHERE id = v_variant_id AND menu_item_id = v_menu.id
         AND store_id = p_store_id AND is_available = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Lựa chọn cho món "%" không còn, mời bạn chọn lại', v_menu.name;
      END IF;
      v_item_price   := v_variant.price;
      v_variant_name := v_variant.name;
      v_item_name    := v_menu.name || ' (' || v_variant.name || ')';
    END IF;

    v_item_toppings := '[]'::jsonb; v_topping_total := 0;
    IF v_item ? 'topping_ids' AND jsonb_typeof(v_item->'topping_ids') = 'array'
       AND jsonb_array_length(v_item->'topping_ids') > 0 THEN
      SELECT array_agg(DISTINCT value::uuid) INTO v_topping_ids
        FROM jsonb_array_elements_text(v_item->'topping_ids');
      SELECT
        COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'price',t.price) ORDER BY t.sort_order, t.created_at), '[]'::jsonb),
        COALESCE(SUM(t.price),0), COUNT(*)
      INTO v_item_toppings, v_topping_total, v_topping_count
      FROM toppings t
      JOIN menu_item_toppings mit ON mit.topping_id = t.id AND mit.menu_item_id = v_menu.id
      WHERE t.id = ANY(v_topping_ids) AND t.store_id = p_store_id AND t.is_available = true;
      IF v_topping_count <> array_length(v_topping_ids,1) THEN
        RAISE EXCEPTION 'Topping không hợp lệ / chưa gán cho món / ngừng bán: %', v_menu.name; END IF;
    END IF;

    INSERT INTO order_items (order_id, menu_item_id, item_name, item_price, quantity, note,
                             selected_toppings, variant_id, variant_name)
    VALUES (v_order.id, v_menu.id, v_item_name, v_item_price, v_qty, v_item->>'note',
            v_item_toppings, v_variant_id, v_variant_name);
    v_total := v_total + (v_item_price + v_topping_total) * v_qty;
  END LOOP;

  IF p_voucher_code IS NOT NULL AND trim(p_voucher_code) <> '' THEN
    SELECT * INTO v_voucher FROM vouchers
     WHERE store_id = p_store_id AND upper(code) = upper(trim(p_voucher_code))
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mã giảm giá không tồn tại'; END IF;
    v_reason := voucher_reject_reason(v_voucher, p_zalo_user_id);
    IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%', v_reason; END IF;
    IF v_voucher.zalo_user_id IS NULL THEN
      UPDATE vouchers SET zalo_user_id = p_zalo_user_id WHERE id = v_voucher.id;
    END IF;
    v_discount := voucher_discount(v_voucher, v_total);
    IF v_total - v_discount < 1000 THEN RAISE EXCEPTION 'Đơn quá nhỏ để áp mã giảm giá'; END IF;
  END IF;

  UPDATE orders SET total_amount = v_total - v_discount,
                    payment_amount = v_total - v_discount,
                    discount_amount = v_discount,
                    voucher_id = v_voucher.id
   WHERE id = v_order.id RETURNING * INTO v_order;

  IF v_session_id IS NOT NULL THEN
    UPDATE table_sessions SET last_activity_at = now() WHERE id = v_session_id;
  END IF;

  RETURN to_jsonb(v_order);
END; $function$
;

CREATE OR REPLACE FUNCTION public.create_table_order_batch(p_store_id uuid, p_table_id uuid, p_items jsonb, p_payment_method text, p_client_request_id uuid, p_zalo_user_id text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_voucher_code text DEFAULT NULL::text, p_expected_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_table public.tables%ROWTYPE; v_request public.table_order_batch_requests%ROWTYPE;
  v_order public.orders%ROWTYPE; v_current_session_id uuid; v_created jsonb; v_actual_session_id uuid;
BEGIN
  IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'Thiếu mã gửi đơn'; END IF;
  IF NULLIF(btrim(p_zalo_user_id), '') IS NULL AND NULLIF(btrim(p_device_id), '') IS NULL THEN
    RAISE EXCEPTION 'Thiếu ngữ cảnh thiết bị, vui lòng quét lại QR'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_client_request_id::text, 0));
  SELECT * INTO v_request FROM public.table_order_batch_requests
    WHERE store_id = p_store_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.table_id IS DISTINCT FROM p_table_id OR v_request.expected_session_id IS DISTINCT FROM p_expected_session_id THEN
      RAISE EXCEPTION 'Mã gửi đơn không hợp lệ'; END IF;
    IF (v_request.device_id IS NOT NULL AND v_request.device_id IS DISTINCT FROM p_device_id)
       OR (v_request.zalo_user_id IS NOT NULL AND v_request.zalo_user_id IS DISTINCT FROM p_zalo_user_id) THEN
      RAISE EXCEPTION 'batch request không thuộc ngữ cảnh thiết bị này'; END IF;
    SELECT * INTO v_order FROM public.orders WHERE id = v_request.order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn đã gửi'; END IF;
    RETURN to_jsonb(v_order);
  END IF;
  SELECT * INTO v_table FROM public.tables WHERE id = p_table_id AND store_id = p_store_id AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động'; END IF;
  PERFORM public.lock_table_for_session(p_table_id);
  v_current_session_id := public.open_session_id_for_table(p_table_id);
  IF v_current_session_id IS NULL AND public.table_has_current_reservation_hold(p_table_id, now()) THEN
    RAISE EXCEPTION 'Bàn đã được đặt trước. Vui lòng báo chủ quán để mở bàn.'; END IF;
  IF p_expected_session_id IS NOT NULL AND p_expected_session_id IS DISTINCT FROM v_current_session_id THEN
    RAISE EXCEPTION 'Phiên bàn đã thay đổi, vui lòng kiểm tra lại trước khi gửi món'; END IF;
  IF v_current_session_id IS NOT NULL AND p_expected_session_id IS NULL THEN
    RAISE EXCEPTION 'Phiên bàn đã thay đổi, vui lòng kiểm tra lại trước khi gửi món'; END IF;
  v_created := public.create_order(p_store_id, p_table_id, p_items, p_payment_method, p_zalo_user_id, p_note,
    'dine_in', NULL, NULL, NULL, p_voucher_code, p_device_id);
  SELECT * INTO v_order FROM public.orders WHERE id = (v_created->>'id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tạo đơn thất bại'; END IF;
  v_actual_session_id := v_order.session_id;
  INSERT INTO public.table_order_batch_requests(
    store_id, client_request_id, table_id, order_id, expected_session_id, actual_session_id, zalo_user_id, device_id
  ) VALUES (
    p_store_id, p_client_request_id, p_table_id, v_order.id, p_expected_session_id,
    v_actual_session_id, NULLIF(btrim(p_zalo_user_id), ''), NULLIF(btrim(p_device_id), '')
  );
  RETURN to_jsonb(v_order);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_tray_session(p_store_id uuid, p_table_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_ids uuid[]; v_tid uuid; v_session_id uuid; v_busy text;
begin
  if not is_store_scoped_operator(p_store_id) then raise exception 'Không có quyền'; end if;
  if p_table_ids is null or array_length(p_table_ids,1) is null then
    raise exception 'Chưa chọn bàn nào';
  end if;

  select array_agg(distinct x order by x) into v_ids from unnest(p_table_ids) x;
  foreach v_tid in array v_ids loop perform lock_table_for_session(v_tid); end loop;

  foreach v_tid in array v_ids loop
    if not exists (select 1 from tables where id = v_tid and store_id = p_store_id and is_active) then
      raise exception 'Bàn không thuộc quán hoặc đã ngừng dùng';
    end if;
    if open_session_id_for_table(v_tid) is not null then
      select table_number into v_busy from tables where id = v_tid;
      raise exception '% đang có khách, đóng bàn đó trước hoặc dùng "Nhập vào mâm"', v_busy;
    end if;
  end loop;

  insert into table_sessions (store_id, table_id, opened_by, is_open_ordering)
  values (p_store_id, v_ids[1], 'staff', true)
  returning id into v_session_id;

  insert into session_tables (session_id, table_id)
  select v_session_id, x from unnest(v_ids) x;

  return jsonb_build_object('ok', true, 'session_id', v_session_id,
                            'table_count', array_length(v_ids,1), 'by', v_uid);
end $function$
;

CREATE OR REPLACE FUNCTION public.get_bills_report(p_store_id uuid, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from  timestamptz;
  v_to    timestamptz;
  v_today boolean;
BEGIN
  IF p_store_id IS NULL OR p_date IS NULL THEN
    RAISE EXCEPTION 'Thiếu quán hoặc ngày';
  END IF;
  IF NOT public.is_store_pos_operator(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền xem báo cáo quán này';
  END IF;

  v_from  := (p_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_to    := ((p_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_today := p_date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

  RETURN (
    WITH money AS (
      SELECT o.id, o.session_id, o.order_type, o.total_amount, o.created_at,
             COALESCE(o.discount_amount, 0) AS discount_amount,
             NULLIF(btrim(o.customer_name), '') AS customer_name,
             COALESCE(o.payment_received_at, o.completed_at, o.updated_at) AS received_at,
             CASE
               WHEN o.payment_instrument = 'cash' THEN 'cash'
               WHEN o.payment_instrument = 'bank' THEN 'bank'
               WHEN o.payment_instrument IS NULL AND o.payment_method = 'cash' THEN 'cash'
               WHEN o.payment_instrument IS NULL AND o.payment_method = 'bank_transfer' THEN 'bank'
               ELSE 'other'
             END AS bucket,
             o.payment_received_by AS received_by,
             s.close_reason, s.closed_by, s.opened_at AS session_opened_at,
             MAX(o.payment_received_at) OVER (PARTITION BY o.session_id) AS session_paid_at
      FROM public.orders o
      LEFT JOIN public.table_sessions s ON s.id = o.session_id
      WHERE o.store_id = p_store_id
        AND o.status <> 'cancelled'
        AND (o.payment_received_at IS NOT NULL OR (o.payment_method = 'cash' AND o.status = 'paid'))
        AND COALESCE(o.payment_received_at, o.completed_at, o.updated_at) >= v_from
        AND COALESCE(o.payment_received_at, o.completed_at, o.updated_at) < v_to
    ),
    keyed AS (
      SELECT money.*,
             CASE
               WHEN session_id IS NOT NULL AND close_reason = 'paid' AND session_paid_at IS NOT NULL
                 THEN 'C:' || COALESCE(closed_by::text, '-') || '@' || session_paid_at::text
               WHEN session_id IS NOT NULL THEN 'S:' || session_id::text
               ELSE 'O:' || id::text
             END AS bill_key
      FROM money
    ),
    bills AS (
      SELECT bill_key,
             MAX(received_at) AS paid_at,
             MIN(COALESCE(session_opened_at, created_at)) AS opened_at,
             SUM(total_amount)::bigint AS total,
             SUM(discount_amount)::bigint AS discount_total,
             CASE WHEN COUNT(DISTINCT bucket) = 1 THEN MIN(bucket) ELSE 'mixed' END AS instrument,
             COALESCE(array_agg(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL), '{}'::uuid[]) AS session_ids,
             array_agg(id ORDER BY created_at) AS order_ids,
             (array_agg(received_by) FILTER (WHERE received_by IS NOT NULL))[1] AS received_by,
             (array_agg(customer_name ORDER BY created_at) FILTER (WHERE customer_name IS NOT NULL))[1] AS order_customer,
             MIN(order_type) AS order_type
      FROM keyed
      GROUP BY bill_key
    ),
    open_sessions AS (
      SELECT s.id, s.opened_at, s.is_open_ordering, s.status = 'closed' AS expired,
             COALESCE(array_agg(o.id ORDER BY o.created_at) FILTER (WHERE o.id IS NOT NULL), '{}'::uuid[]) AS order_ids,
             COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_received_at IS NULL), 0)::bigint AS provisional_total
      FROM public.table_sessions s
      LEFT JOIN public.orders o
        ON o.session_id = s.id AND o.status <> 'cancelled' AND o.rejected_at IS NULL
      WHERE s.store_id = p_store_id
        AND ((s.status = 'open' AND v_today)
          OR (s.status = 'closed' AND s.close_reason = 'expired' AND s.opened_at >= v_from AND s.opened_at < v_to))
      GROUP BY s.id
      HAVING s.status = 'open' OR COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_received_at IS NULL), 0) > 0
    ),
    awaiting_orders AS (
      SELECT o.*
      FROM public.orders o
      WHERE o.store_id = p_store_id
        AND o.session_id IS NULL
        AND o.status NOT IN ('cancelled', 'paid')
        AND o.payment_received_at IS NULL
        AND o.order_source <> 'reservation_preorder'
        AND (o.payment_method IN ('cash', 'bank_transfer')
             OR (o.payment_method = 'zalo_checkout' AND o.payment_instrument IS DISTINCT FROM 'wallet'))
        AND o.created_at >= v_from AND o.created_at < v_to
    )
    SELECT jsonb_build_object(
      'date', p_date,
      'totals', (
        SELECT jsonb_build_object(
          'revenue', COALESCE(SUM(total_amount), 0),
          'cash',    COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'cash'), 0),
          'bank',    COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'bank'), 0),
          'other',   COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'other'), 0),
          'bills_count', COUNT(DISTINCT bill_key))
        FROM keyed),
      'open', jsonb_build_object(
        'tables_count', (
          SELECT COUNT(*) FROM public.session_tables st
          JOIN public.table_sessions s ON s.id = st.session_id
          WHERE s.store_id = p_store_id AND s.status = 'open' AND st.is_open),
        'provisional_total', (
          SELECT COALESCE(SUM(o.total_amount), 0) FROM public.orders o
          JOIN public.table_sessions s ON s.id = o.session_id
          WHERE s.store_id = p_store_id AND s.status = 'open'
            AND o.status <> 'cancelled' AND o.rejected_at IS NULL
            AND o.payment_received_at IS NULL)),
      'bills', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'key', b.bill_key,
          'paid_at', b.paid_at,
          'opened_at', b.opened_at,
          'session_ids', to_jsonb(b.session_ids),
          'order_ids', to_jsonb(b.order_ids),
          'merged', COALESCE(array_length(b.session_ids, 1), 0) > 1,
          'tables_count', (SELECT COUNT(DISTINCT st.table_id) FROM public.session_tables st WHERE st.session_id = ANY(b.session_ids)),
          'total', b.total,
          'discount_total', b.discount_total,
          'instrument', b.instrument,
          'order_type', b.order_type,
          'items_count', (
            SELECT COALESCE(SUM(oi.quantity), 0) FROM public.order_items oi
            WHERE oi.order_id = ANY(b.order_ids) AND oi.void_type IS DISTINCT FROM 'cancelled'),
          'table_label', public.bills_report_table_label(b.session_ids, b.order_ids, b.order_type),
          'customer_name', COALESCE(
            (SELECT NULLIF(btrim(r.customer_name), '') FROM public.reservations r
              WHERE r.session_id = ANY(b.session_ids) ORDER BY r.arrived_at NULLS LAST LIMIT 1),
            b.order_customer),
          'party_size', (SELECT SUM(r.party_size) FROM public.reservations r WHERE r.session_id = ANY(b.session_ids)),
          'adjustments_count',
            (SELECT COUNT(*) FROM public.order_items oi WHERE oi.order_id = ANY(b.order_ids) AND oi.void_type IS NOT NULL)
            + (SELECT COUNT(*) FROM public.order_item_quantity_changes c WHERE c.order_id = ANY(b.order_ids)),
          'received_by_name', (
            SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), u.email)
            FROM auth.users u WHERE u.id = b.received_by)
        ) ORDER BY b.paid_at DESC), '[]'::jsonb)
        FROM bills b),
      'waiting', (
        SELECT COALESCE(jsonb_agg(w.j ORDER BY w.opened_at DESC), '[]'::jsonb)
        FROM (
          SELECT os.opened_at, jsonb_build_object(
            'key', 'S:' || os.id::text,
            'session_ids', jsonb_build_array(os.id),
            'order_ids', to_jsonb(os.order_ids),
            'opened_at', os.opened_at,
            'is_tray', os.is_open_ordering,
            'expired', os.expired,
            'tables_count', (SELECT COUNT(*) FROM public.session_tables st
                              WHERE st.session_id = os.id AND (st.is_open OR os.expired)),
            'table_label', COALESCE(
              (SELECT string_agg(t.table_number, ', ' ORDER BY t.table_number)
                 FROM public.session_tables st JOIN public.tables t ON t.id = st.table_id
                WHERE st.session_id = os.id AND (st.is_open OR os.expired)),
              '—'),
            'order_type', 'dine_in',
            'customer_name', (SELECT NULLIF(btrim(r.customer_name), '') FROM public.reservations r
                               WHERE r.session_id = os.id ORDER BY r.arrived_at NULLS LAST LIMIT 1),
            'party_size', (SELECT SUM(r.party_size) FROM public.reservations r WHERE r.session_id = os.id),
            'items_count', (
              SELECT COALESCE(SUM(oi.quantity), 0) FROM public.order_items oi
              JOIN public.orders o ON o.id = oi.order_id
              WHERE o.id = ANY(os.order_ids) AND o.payment_received_at IS NULL
                AND oi.void_type IS DISTINCT FROM 'cancelled'),
            'provisional_total', os.provisional_total
          ) AS j
          FROM open_sessions os
          UNION ALL
          SELECT ao.created_at, jsonb_build_object(
            'key', 'O:' || ao.id::text,
            'session_ids', '[]'::jsonb,
            'order_ids', jsonb_build_array(ao.id),
            'opened_at', ao.created_at,
            'is_tray', false,
            'expired', false,
            'tables_count', 0,
            'table_label', public.bills_report_table_label('{}'::uuid[], ARRAY[ao.id], ao.order_type),
            'order_type', ao.order_type,
            'customer_name', NULLIF(btrim(ao.customer_name), ''),
            'party_size', NULL,
            'items_count', (
              SELECT COALESCE(SUM(oi.quantity), 0) FROM public.order_items oi
              WHERE oi.order_id = ao.id AND oi.void_type IS DISTINCT FROM 'cancelled'),
            'provisional_total', ao.total_amount
          )
          FROM awaiting_orders ao
        ) w),
      'cancelled', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'order_id', o.id,
          'session_id', o.session_id,
          'at', COALESCE(o.rejected_at, o.updated_at),
          'created_at', o.created_at,
          'kind', CASE WHEN o.rejected_at IS NOT NULL THEN 'rejected' ELSE 'cancelled' END,
          'reason_code', o.rejection_reason_code,
          'reason_note', NULLIF(btrim(o.rejection_reason_note), ''),
          'total', o.total_amount,
          'order_type', o.order_type,
          'order_source', o.order_source,
          'customer_name', NULLIF(btrim(o.customer_name), ''),
          'table_label', public.bills_report_table_label(
            CASE WHEN o.session_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[o.session_id] END, ARRAY[o.id], o.order_type)
        ) ORDER BY COALESCE(o.rejected_at, o.updated_at) DESC), '[]'::jsonb)
        FROM public.orders o
        WHERE o.store_id = p_store_id
          AND o.status = 'cancelled'
          AND COALESCE(o.rejected_at, o.updated_at) >= v_from
          AND COALESCE(o.rejected_at, o.updated_at) < v_to),
      'adjustments', (
        SELECT COALESCE(jsonb_agg(x.j ORDER BY x.at DESC), '[]'::jsonb)
        FROM (
          SELECT oi.voided_at AS at, jsonb_build_object(
            'at', oi.voided_at,
            'type', oi.void_type,
            'item_name', oi.item_name,
            'quantity', oi.quantity,
            'old_quantity', NULL,
            'new_quantity', NULL,
            'amount', (oi.item_price + COALESCE(tp.price, 0)) * oi.quantity,
            'reason', NULLIF(btrim(oi.void_reason), ''),
            'table_label', public.bills_report_table_label(
              CASE WHEN o.session_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[o.session_id] END, ARRAY[o.id], o.order_type),
            'by_name', (SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), u.email)
                        FROM auth.users u WHERE u.id = oi.voided_by)
          ) AS j
          FROM public.order_items oi
          JOIN public.orders o ON o.id = oi.order_id
          LEFT JOIN LATERAL (
            SELECT SUM(COALESCE((e->>'price')::integer, 0)) AS price
            FROM jsonb_array_elements(COALESCE(oi.selected_toppings, '[]'::jsonb)) e
          ) tp ON true
          WHERE o.store_id = p_store_id
            AND oi.void_type IS NOT NULL
            AND oi.voided_at >= v_from AND oi.voided_at < v_to
          UNION ALL
          SELECT c.changed_at, jsonb_build_object(
            'at', c.changed_at,
            'type', 'quantity',
            'item_name', c.item_name,
            'quantity', c.new_quantity,
            'old_quantity', c.old_quantity,
            'new_quantity', c.new_quantity,
            'amount', (c.new_quantity - c.old_quantity) * (COALESCE(oi.item_price, 0) + COALESCE(tp.price, 0)),
            'reason', NULLIF(btrim(c.reason), ''),
            'table_label', public.bills_report_table_label(
              CASE WHEN o.session_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[o.session_id] END, ARRAY[o.id], o.order_type),
            'by_name', (SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), u.email)
                        FROM auth.users u WHERE u.id = c.changed_by)
          )
          FROM public.order_item_quantity_changes c
          JOIN public.orders o ON o.id = c.order_id
          LEFT JOIN public.order_items oi ON oi.id = c.order_item_id
          LEFT JOIN LATERAL (
            SELECT SUM(COALESCE((e->>'price')::integer, 0)) AS price
            FROM jsonb_array_elements(COALESCE(oi.selected_toppings, '[]'::jsonb)) e
          ) tp ON true
          WHERE c.store_id = p_store_id
            AND c.changed_at >= v_from AND c.changed_at < v_to
        ) x)
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_daily_revenue(p_store_id uuid, p_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(total_revenue bigint, total_orders bigint, paid_orders bigint, cash_pending bigint)
 LANGUAGE sql
 STABLE
AS $function$
  with tinh as (
    select
      total_amount,
      (
        (payment_received_at is not null and status <> 'cancelled')
        or (payment_method = 'cash' and status = 'paid')
      ) as da_co_tien,
      (payment_received_at is null
       and status not in ('paid','cancelled')
       and (session_id is not null or payment_instrument is distinct from 'wallet')) as cho_thu
    from orders
    where store_id = p_store_id
      and created_at >= p_date::timestamptz
      and created_at <  (p_date + interval '1 day')::timestamptz
  )
  select
    coalesce(sum(total_amount) filter (where da_co_tien), 0)::bigint,
    count(*)::bigint,
    count(*) filter (where da_co_tien)::bigint,
    count(*) filter (where cho_thu)::bigint
  from tinh;
$function$
;

CREATE OR REPLACE FUNCTION public.get_sessions_bill(p_session_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store uuid;
  v_store_count integer;
  v_store_row public.stores%ROWTYPE;
  v_sessions jsonb;
  v_total bigint;
BEGIN
  IF p_session_ids IS NULL OR array_length(p_session_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Chưa chọn phiên nào';
  END IF;

  SELECT COUNT(DISTINCT store_id)
  INTO v_store_count
  FROM public.table_sessions
  WHERE id = ANY(p_session_ids);

  IF v_store_count = 0 THEN
    RAISE EXCEPTION 'Không tìm thấy phiên';
  END IF;
  IF v_store_count > 1 THEN
    RAISE EXCEPTION 'Các phiên không cùng một quán';
  END IF;

  SELECT store_id INTO v_store
  FROM public.table_sessions
  WHERE id = ANY(p_session_ids)
  LIMIT 1;

  IF NOT public.is_store_scoped_operator(v_store) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;

  SELECT * INTO v_store_row FROM public.stores WHERE id = v_store;

  SELECT COALESCE(jsonb_agg(session_data ORDER BY session_data.opened_at), '[]'::jsonb),
         COALESCE(SUM(session_data.subtotal), 0)
  INTO v_sessions, v_total
  FROM (
    SELECT s.id AS session_id,
           s.opened_at,
           s.is_open_ordering,
           COALESCE((
             SELECT string_agg(t.table_number, ', ' ORDER BY t.table_number)
             FROM public.session_tables st
             JOIN public.tables t ON t.id = st.table_id
             WHERE st.session_id = s.id
           ), '?') AS tables,
           COALESCE((
             SELECT SUM(o.total_amount)
             FROM public.orders o
             WHERE o.session_id = s.id
               AND o.status <> 'cancelled'
           ), 0) AS subtotal,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'name', line_data.name,
               'quantity', line_data.quantity,
               'price', CASE WHEN line_data.void_type IS NOT NULL THEN 0 ELSE line_data.unit_price END,
               'line_total', CASE WHEN line_data.void_type IS NOT NULL THEN 0 ELSE line_data.quantity * line_data.unit_price END,
               'is_gift', line_data.void_type = 'gift',
               'void_type', line_data.void_type,
               'void_reason', line_data.void_reason
             ) ORDER BY line_data.name, line_data.void_type NULLS FIRST)
             FROM (
               SELECT oi.item_name || CASE
                        WHEN COALESCE(topping_data.names, '') = '' THEN ''
                        ELSE ' + ' || topping_data.names
                      END AS name,
                      SUM(oi.quantity) AS quantity,
                      oi.item_price + COALESCE(topping_data.price, 0) AS unit_price,
                      oi.void_reason,
                      oi.void_type
               FROM public.orders o
               JOIN public.order_items oi ON oi.order_id = o.id
               LEFT JOIN LATERAL (
                 SELECT string_agg(topping->>'name', ', ' ORDER BY topping->>'name') AS names,
                        SUM(COALESCE((topping->>'price')::integer, 0)) AS price
                 FROM jsonb_array_elements(COALESCE(oi.selected_toppings, '[]'::jsonb)) AS topping
               ) AS topping_data ON true
               WHERE o.session_id = s.id
                 AND o.status <> 'cancelled'
                 
               GROUP BY oi.item_name, oi.item_price, oi.void_type, oi.void_reason,
                        topping_data.names, topping_data.price
             ) AS line_data
           ), '[]'::jsonb) AS items,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'name', c.item_name,
               'old_quantity', c.old_quantity,
               'new_quantity', c.new_quantity,
               'reason', c.reason,
               'changed_at', c.changed_at
             ) ORDER BY c.changed_at)
             FROM public.order_item_quantity_changes c
             JOIN public.orders o ON o.id = c.order_id
             WHERE o.session_id = s.id
               AND o.status <> 'cancelled'
           ), '[]'::jsonb) AS qty_changes
    FROM public.table_sessions s
    WHERE s.id = ANY(p_session_ids)
  ) AS session_data;

  RETURN jsonb_build_object(
    'store', jsonb_build_object(
      'name', v_store_row.name,
      'address', v_store_row.address,
      'phone', v_store_row.phone
    ),
    'printed_at', now(),
    'sessions', v_sessions,
    'grand_total', v_total
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_spin_state(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order orders%ROWTYPE;
  v_enabled boolean;
  v_paid boolean;
  v_existing spin_results%ROWTYPE;
  v_rewards jsonb;
  v_voucher_json jsonb;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_eligible'); END IF;

  v_paid := v_order.payment_received_at IS NOT NULL AND v_order.status <> 'cancelled'
            AND v_order.order_source = 'customer_zalo' AND v_order.zalo_user_id IS NOT NULL;
  IF NOT v_paid THEN RETURN jsonb_build_object('status','not_eligible'); END IF;

  SELECT spin_enabled INTO v_enabled FROM stores WHERE id = v_order.store_id;

  SELECT jsonb_agg(jsonb_build_object('id',id,'label',label,'type',type) ORDER BY sort_order, id)
    INTO v_rewards FROM spin_rewards
   WHERE store_id=v_order.store_id AND is_active
     AND (v_order.zalo_user_id IS NOT NULL OR type <> 'voucher');

  IF NOT COALESCE(v_enabled,false) OR v_rewards IS NULL THEN
    RETURN jsonb_build_object('status','disabled');
  END IF;

  SELECT * INTO v_existing FROM spin_results WHERE order_id = p_order_id;
  IF FOUND THEN
    SELECT jsonb_build_object('code', vc.code, 'label', vc.label, 'expires_at', vc.expires_at)
      INTO v_voucher_json FROM vouchers vc WHERE vc.spin_result_id = v_existing.id;
    RETURN jsonb_build_object('status','done','already',true,'rewards',v_rewards,
      'result', jsonb_build_object('result_id',v_existing.id,'reward_id',v_existing.reward_id,
        'label',v_existing.reward_label,'type',v_existing.reward_type,
        'code',upper(left(v_existing.id::text,6)),'redeem_status',v_existing.status,
        'voucher', v_voucher_json));
  END IF;

  RETURN jsonb_build_object('status','available','rewards',v_rewards);
END; $function$
;

CREATE OR REPLACE FUNCTION public.get_table_session_bill(p_table_id uuid, p_zalo_user_id text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_table_session_state(p_table_id uuid, p_zalo_user_id text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_store uuid; v_timing text; v_s public.table_sessions%ROWTYPE; v_count int; v_total bigint; v_table_names text;
BEGIN
 SELECT t.store_id INTO v_store FROM public.tables t WHERE t.id=p_table_id AND t.is_active;
 IF v_store IS NULL THEN RETURN jsonb_build_object('mode','prepay','state','free'); END IF;
 SELECT payment_timing INTO v_timing FROM public.stores WHERE id=v_store;
 IF v_timing<>'postpay' THEN RETURN jsonb_build_object('mode','prepay'); END IF;
 PERFORM public.expire_stale_table_sessions(v_store);
 IF public.table_has_current_reservation_hold(p_table_id,now()) THEN RETURN jsonb_build_object('mode','postpay','state','reserved'); END IF;
 SELECT * INTO v_s FROM public.table_sessions WHERE id=public.open_session_id_for_table(p_table_id);
 IF NOT FOUND THEN RETURN jsonb_build_object('mode','postpay','state','free'); END IF;
 IF NOT v_s.is_open_ordering AND NOT ((v_s.host_zalo_user_id IS NULL AND v_s.host_device_id IS NULL) OR (p_zalo_user_id IS NOT NULL AND v_s.host_zalo_user_id=p_zalo_user_id) OR (p_device_id IS NOT NULL AND v_s.host_device_id=p_device_id)) THEN RETURN jsonb_build_object('mode','postpay','state','locked','opened_at',v_s.opened_at); END IF;
 SELECT count(*),coalesce(sum(total_amount),0) INTO v_count,v_total FROM public.orders WHERE session_id=v_s.id AND status<>'cancelled';
 SELECT string_agg(t.table_number,', ' ORDER BY t.table_number) INTO v_table_names FROM public.session_tables st JOIN public.tables t ON t.id=st.table_id WHERE st.session_id=v_s.id AND st.is_open;
 RETURN jsonb_build_object('mode','postpay','state','owner','session_id',v_s.id,'opened_at',v_s.opened_at,'order_count',v_count,'total',v_total,'is_open_ordering',v_s.is_open_ordering,'table_names',v_table_names);
END; $function$
;

CREATE OR REPLACE FUNCTION public.kitchen_confirm_payment(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order orders%rowtype;
  v_store uuid := kitchen_store_id();
  v_can_cash boolean;
begin
  select * into v_order from orders where id = p_order_id and store_id = v_store;
  if not found then raise exception 'Không tìm thấy đơn'; end if;
  if v_order.status = 'cancelled' then raise exception 'Đơn đã huỷ'; end if;
  if v_order.payment_received_at is not null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if v_order.payment_method = 'cash' then
    select kitchen_can_confirm_cash into v_can_cash from stores where id = v_store;
    if not coalesce(v_can_cash, false) then
      raise exception 'Bếp không được xác nhận tiền mặt (bật trong cài đặt quán nếu cần)';
    end if;
  elsif v_order.payment_method = 'zalo_checkout' then
    if v_order.payment_instrument = 'wallet' then
      raise exception 'Đơn ví đã tự xác nhận, không cần bấm';
    end if;
  end if;
  update orders
     set payment_received_at = now(), payment_received_via = 'kitchen'
   where id = p_order_id;
  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.list_open_table_sessions(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.is_store_scoped_operator(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;

  PERFORM public.expire_stale_table_sessions(p_store_id);

  SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data.opened_at), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT s.id AS session_id,
           s.table_id,
           s.is_open_ordering,
           COALESCE(table_data.table_names, '[]'::jsonb) AS tables,
           COALESCE(table_data.label, '?') AS table_number,
           s.status,
           s.close_reason,
           s.opened_at,
           s.opened_by,
           s.last_activity_at,
           (s.host_zalo_user_id IS NOT NULL OR s.host_device_id IS NOT NULL) AS has_host,
           (s.status = 'closed') AS needs_review,
           COALESCE(order_data.order_count, 0) AS order_count,
           COALESCE(order_data.total, 0) AS total,
           COALESCE(order_data.unpaid_total, 0) AS unpaid_total,
           COALESCE(order_data.cooking_count, 0) AS cooking_count,
           COALESCE(order_data.orders, '[]'::jsonb) AS orders,
           COALESCE(rejected_data.orders, '[]'::jsonb) AS rejected_orders
    FROM public.table_sessions s
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'table_number', t.table_number)
                        ORDER BY t.table_number) AS table_names,
             string_agg(t.table_number, ', ' ORDER BY t.table_number) AS label
      FROM public.session_tables st
      JOIN public.tables t ON t.id = st.table_id
      -- Phiên đang mở chỉ lấy bàn đang chiếm; bill timeout vẫn phải nói tên bàn đã mở lúc đầu.
      WHERE st.session_id = s.id
        AND (st.is_open OR s.status = 'closed')
    ) AS table_data ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS order_count,
             SUM(o.total_amount) AS total,
             SUM(o.total_amount) FILTER (WHERE o.payment_received_at IS NULL) AS unpaid_total,
             COUNT(*) FILTER (WHERE o.status IN ('pending', 'confirmed', 'cooking')) AS cooking_count,
             jsonb_agg(jsonb_build_object(
               'id', o.id,
               'status', o.status,
               'created_at', o.created_at,
               'total_amount', o.total_amount,
               'order_source', o.order_source,
               'payment_received_at', o.payment_received_at,
               'items', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                   'id', oi.id,
                   'name', oi.item_name,
                   'quantity', oi.quantity,
                   'price', oi.item_price,
                   'toppings', oi.selected_toppings,
                   'void_type', oi.void_type,
                   'void_reason', oi.void_reason,
                   'voided_at', oi.voided_at,
                   'is_gift', oi.void_type = 'gift',
                   'qty_changes', COALESCE((
                     SELECT jsonb_agg(jsonb_build_object(
                       'old_quantity', c.old_quantity,
                       'new_quantity', c.new_quantity,
                       'reason', c.reason,
                       'changed_at', c.changed_at
                     ) ORDER BY c.changed_at)
                     FROM public.order_item_quantity_changes c
                     WHERE c.order_item_id = oi.id
                   ), '[]'::jsonb)
                 ) ORDER BY oi.id)
                 FROM public.order_items oi
                 WHERE oi.order_id = o.id
               ), '[]'::jsonb)
             ) ORDER BY o.created_at) AS orders
      FROM public.orders o
      WHERE o.session_id = s.id
        AND o.status <> 'cancelled'
    ) AS order_data ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
               'id', o.id,
               'status', o.status,
               'created_at', o.created_at,
               'total_amount', o.total_amount,
               'order_source', o.order_source,
               'payment_received_at', o.payment_received_at,
               'rejected_at', o.rejected_at,
               'rejection_reason_code', o.rejection_reason_code,
               'rejection_reason_note', o.rejection_reason_note,
               'items', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                   'id', oi.id,
                   'name', oi.item_name,
                   'quantity', oi.quantity,
                   'price', oi.item_price,
                   'toppings', oi.selected_toppings,
                   'void_type', oi.void_type,
                   'void_reason', oi.void_reason,
                   'voided_at', oi.voided_at,
                   'is_gift', oi.void_type = 'gift',
                   'qty_changes', COALESCE((
                     SELECT jsonb_agg(jsonb_build_object(
                       'old_quantity', c.old_quantity,
                       'new_quantity', c.new_quantity,
                       'reason', c.reason,
                       'changed_at', c.changed_at
                     ) ORDER BY c.changed_at)
                     FROM public.order_item_quantity_changes c
                     WHERE c.order_item_id = oi.id
                   ), '[]'::jsonb)
                 ) ORDER BY oi.id)
                 FROM public.order_items oi
                 WHERE oi.order_id = o.id
               ), '[]'::jsonb)
             ) ORDER BY o.created_at) AS orders
      FROM public.orders o
      WHERE o.session_id = s.id
        AND o.status = 'cancelled'
        AND o.rejected_at IS NOT NULL
    ) AS rejected_data ON true
    WHERE s.store_id = p_store_id
      AND (
        s.status = 'open'
        OR (s.close_reason = 'expired' AND EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.session_id = s.id
            AND o.status <> 'cancelled'
            AND o.payment_received_at IS NULL
        ))
      )
  ) AS row_data;

  RETURN v_rows;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.list_prearrival_reserved_table_ids(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN PERFORM public.reservation_operator_actor_kind(p_store_id); IF NOT public.is_store_pos_operator(p_store_id) THEN RAISE EXCEPTION 'Chỉ chủ quán được xem bàn đang giữ'; END IF; RETURN COALESCE((SELECT jsonb_agg(rt.table_id ORDER BY rt.table_id) FROM public.reservation_tables rt JOIN public.reservations r ON r.id=rt.reservation_id WHERE rt.store_id=p_store_id AND rt.released_at IS NULL AND r.status='confirmed' AND r.session_id IS NULL AND r.arrival_at-interval '60 minutes'<=now() AND rt.hold_ends_at>now()),'[]'::jsonb); END; $function$
;

CREATE OR REPLACE FUNCTION public.list_reservation_customer_calls(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.reservation_operator_actor_kind(p_store_id);
  IF NOT public.is_store_pos_operator(p_store_id) THEN RAISE EXCEPTION 'Chỉ chủ quán được xem việc gọi nhắc khách'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('task_id', t.id, 'reservation_id', t.reservation_id, 'customer_name', r.customer_name, 'customer_phone', r.customer_phone, 'party_size', r.party_size, 'arrival_at', r.arrival_at, 'due_at', t.due_at, 'created_at', t.created_at) ORDER BY t.due_at, t.created_at) FROM public.reservation_customer_call_tasks t JOIN public.reservations r ON r.id = t.reservation_id WHERE t.store_id = p_store_id AND t.due_at <= now() AND t.resolved_at IS NULL AND t.retired_at IS NULL), '[]'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.list_staff_upcoming_reserved_tables(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_store_scoped_operator(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền xem bàn đã đặt của quán này';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'table_id', rt.table_id,
      'reservation_id', r.id,
      'customer_name', r.customer_name,
      'party_size', r.party_size,
      'arrival_at', r.arrival_at,
      'hold_ends_at', rt.hold_ends_at
    ) ORDER BY r.arrival_at)
    FROM public.reservation_tables rt
    JOIN public.reservations r ON r.id = rt.reservation_id
    WHERE rt.store_id = p_store_id
      AND rt.released_at IS NULL
      AND r.status = 'confirmed'
      AND r.session_id IS NULL
      AND rt.hold_ends_at > now()
      AND r.arrival_at < now() + interval '12 hours'
  ), '[]'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.menu_items_sku_fill()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_prefix text; v_next integer;
BEGIN
  IF NEW.sku IS NOT NULL THEN RETURN NEW; END IF;
  SELECT sku_prefix INTO v_prefix FROM public.menu_categories WHERE id = NEW.category_id;
  v_prefix := COALESCE(v_prefix, 'MON');
  PERFORM pg_advisory_xact_lock(hashtext(NEW.store_id::text || ':' || v_prefix));
  SELECT COALESCE(MAX((substring(sku FROM '^' || v_prefix || '-(\d{1,6})$'))::integer), 0) + 1 INTO v_next
  FROM public.menu_items WHERE store_id = NEW.store_id AND sku ~ ('^' || v_prefix || '-\d{1,6}$');
  NEW.sku := v_prefix || '-' || lpad(v_next::text, 3, '0');
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.merge_session_into_tray(p_session_id uuid, p_target_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_src table_sessions%rowtype; v_dst table_sessions%rowtype;
  v_first uuid; v_second uuid;
  v_orders int; v_tables int;
begin
  if p_session_id = p_target_session_id then raise exception 'Không thể nhập phiên vào chính nó'; end if;

  v_first  := least(p_session_id, p_target_session_id);
  v_second := greatest(p_session_id, p_target_session_id);
  perform 1 from table_sessions where id = v_first  for update;
  perform 1 from table_sessions where id = v_second for update;

  select * into v_src from table_sessions where id = p_session_id;
  if not found then raise exception 'Không tìm thấy phiên nguồn'; end if;
  select * into v_dst from table_sessions where id = p_target_session_id;
  if not found then raise exception 'Không tìm thấy mâm đích'; end if;

  if not is_store_scoped_operator(v_src.store_id) then raise exception 'Không có quyền'; end if;
  if v_src.store_id <> v_dst.store_id then raise exception 'Hai phiên không cùng quán'; end if;
  if v_src.status <> 'open' or v_dst.status <> 'open' then raise exception 'Chỉ gom được phiên đang mở'; end if;

  update orders set session_id = p_target_session_id where session_id = p_session_id;
  get diagnostics v_orders = row_count;

  update session_tables set session_id = p_target_session_id
   where session_id = p_session_id and is_open;
  get diagnostics v_tables = row_count;

  update table_sessions
     set status = 'closed', closed_at = now(), closed_by = v_uid, close_reason = 'merged'
   where id = p_session_id;

  update table_sessions
     set is_open_ordering = true, last_activity_at = now()
   where id = p_target_session_id;

  return jsonb_build_object('ok', true, 'orders_moved', v_orders, 'tables_moved', v_tables);
end $function$
;

CREATE OR REPLACE FUNCTION public.pos_get_floor_layout()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_store uuid; v_result jsonb;
BEGIN
  SELECT store_id INTO v_store FROM public.mevo_operators
  WHERE user_id = auth.uid() AND role IN ('store_owner', 'store_cashier') AND is_active = true;
  IF v_store IS NULL THEN RAISE EXCEPTION 'Chỉ chủ quán được xem sơ đồ POS'; END IF;
  SELECT jsonb_build_object(
    'version', s.table_layout_version,
    'areas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'color', a.color)
      ORDER BY a.sort_order, a.id) FROM public.table_areas a WHERE a.store_id = s.id), '[]'::jsonb),
    'tables', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', t.id, 'table_number', t.table_number, 'area_id', t.area_id, 'pos_x', t.pos_x, 'pos_y', t.pos_y
    ) ORDER BY t.id) FROM public.tables t WHERE t.store_id = s.id AND t.is_active), '[]'::jsonb)
  ) INTO v_result FROM public.stores s WHERE s.id = v_store;
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pos_reject_order(p_order_id uuid, p_reason_code text, p_reason_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_note text := NULLIF(btrim(p_reason_note), '');
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đơn';
  END IF;
  IF NOT public.is_store_pos_operator(v_order.store_id) THEN
    RAISE EXCEPTION 'Chỉ chủ quán mới được từ chối đơn';
  END IF;
  IF v_order.order_source = 'reservation_preorder' THEN
    RAISE EXCEPTION 'Món đặt trước phải xử lý tại hàng đợi món đặt trước';
  END IF;

  IF v_order.status = 'cancelled' AND v_order.rejected_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'status', 'cancelled');
  END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Chỉ được từ chối đơn đang chờ xác nhận';
  END IF;
  IF p_reason_code IS NULL OR p_reason_code NOT IN (
    'out_of_stock', 'kitchen_overloaded', 'duplicate', 'customer_requested', 'other'
  ) THEN
    RAISE EXCEPTION 'Lý do từ chối không hợp lệ';
  END IF;
  IF p_reason_code = 'other' AND v_note IS NULL THEN
    RAISE EXCEPTION 'Nhập lý do khác';
  END IF;

  UPDATE public.orders
  SET status = 'cancelled',
      rejected_at = now(),
      rejected_by = auth.uid(),
      rejection_reason_code = p_reason_code,
      rejection_reason_note = CASE WHEN p_reason_code = 'other' THEN v_note ELSE NULL END,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'already', false, 'status', 'cancelled');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pos_save_floor_layout(p_version integer, p_areas jsonb, p_tables jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_store uuid; v_version integer; v_count integer;
BEGIN
  SELECT store_id INTO v_store FROM public.mevo_operators
  WHERE user_id = auth.uid() AND role = 'store_owner' AND is_active = true;
  IF v_store IS NULL THEN RAISE EXCEPTION 'Chỉ chủ quán được sửa sơ đồ POS'; END IF;
  SELECT table_layout_version INTO v_version FROM public.stores WHERE id = v_store FOR UPDATE;
  IF p_version IS DISTINCT FROM v_version THEN
    RAISE EXCEPTION 'Sơ đồ đã được máy khác thay đổi. Hãy tải lại sơ đồ trước khi sửa tiếp.';
  END IF;
  IF jsonb_typeof(p_areas) IS DISTINCT FROM 'array' OR jsonb_typeof(p_tables) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Dữ liệu sơ đồ không hợp lệ';
  END IF;
  IF jsonb_array_length(p_areas) > 100 OR jsonb_array_length(p_tables) > 2400 THEN
    RAISE EXCEPTION 'Sơ đồ vượt giới hạn 100 khu vực hoặc 2400 bàn';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_areas) AS a(id uuid, name text)
    WHERE a.id IS NULL OR a.name IS NULL OR length(btrim(a.name)) NOT BETWEEN 1 AND 60)
    OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p_areas) AS a(id uuid) GROUP BY id HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p_areas) AS a(name text) GROUP BY lower(btrim(name)) HAVING count(*) > 1)
  THEN RAISE EXCEPTION 'Tên khu vực phải có 1–60 ký tự và không trùng nhau'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_areas) AS a(id uuid)
    JOIN public.table_areas old ON old.id = a.id WHERE old.store_id <> v_store)
    OR EXISTS (SELECT 1 FROM public.table_areas old WHERE old.store_id = v_store
      AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_areas) AS a(id uuid) WHERE a.id = old.id))
  THEN RAISE EXCEPTION 'Danh sách khu vực đã thay đổi hoặc không thuộc quán'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_tables) AS t(id uuid, area_id uuid, pos_x numeric, pos_y numeric)
    WHERE t.id IS NULL OR t.pos_x IS NULL OR t.pos_y IS NULL
      OR t.pos_x <> trunc(t.pos_x) OR t.pos_y <> trunc(t.pos_y)
      OR t.pos_x NOT BETWEEN 0 AND 11 OR t.pos_y NOT BETWEEN 0 AND 199
      OR (t.area_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_areas) AS a(id uuid) WHERE a.id = t.area_id)))
    OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p_tables) AS t(id uuid) GROUP BY id HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p_tables) AS t(area_id uuid, pos_x numeric, pos_y numeric)
      GROUP BY area_id, pos_x, pos_y HAVING count(*) > 1)
  THEN RAISE EXCEPTION 'Vị trí bàn không hợp lệ hoặc có hai bàn chồng nhau'; END IF;
  PERFORM id FROM public.tables WHERE store_id = v_store AND is_active FOR UPDATE;
  SELECT count(*) INTO v_count FROM public.tables WHERE store_id = v_store AND is_active;
  IF v_count <> jsonb_array_length(p_tables) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_tables) AS t(id uuid)
    WHERE NOT EXISTS (SELECT 1 FROM public.tables old WHERE old.id = t.id AND old.store_id = v_store AND old.is_active)
  ) THEN RAISE EXCEPTION 'Danh sách bàn đã thay đổi. Hãy tải lại sơ đồ.'; END IF;
  INSERT INTO public.table_areas(id, store_id, name, sort_order)
  SELECT (a.value->>'id')::uuid, v_store, btrim(a.value->>'name'), a.ordinality::integer
  FROM jsonb_array_elements(p_areas) WITH ORDINALITY AS a(value, ordinality)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order
  WHERE table_areas.store_id = v_store;
  UPDATE public.tables old SET area_id = t.area_id, pos_x = t.pos_x, pos_y = t.pos_y
  FROM jsonb_to_recordset(p_tables) AS t(id uuid, area_id uuid, pos_x smallint, pos_y smallint)
  WHERE old.id = t.id AND old.store_id = v_store AND old.is_active;
  UPDATE public.stores SET table_layout_version = table_layout_version + 1 WHERE id = v_store;
  RETURN public.pos_get_floor_layout();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pos_set_order_item_quantity(p_order_item_id uuid, p_quantity integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_total integer;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 999 THEN
    RAISE EXCEPTION 'Số lượng phải từ 1 đến 999 (bỏ hẳn món thì dùng "Bỏ món")';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Cần ghi lý do sửa số lượng';
  END IF;

  SELECT oi.* INTO v_item FROM public.order_items oi WHERE oi.id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy món trong bill';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;

  IF NOT public.is_store_pos_operator(v_order.store_id) THEN
    RAISE EXCEPTION 'Bạn không có quyền sửa bill';
  END IF;

  IF v_order.payment_received_at IS NOT NULL
    OR v_order.status = 'cancelled'
    OR v_order.voucher_id IS NOT NULL THEN
    RAISE EXCEPTION 'Bill này không còn được điều chỉnh';
  END IF;

  IF v_item.void_type IS NOT NULL THEN
    RAISE EXCEPTION 'Món đã được Bỏ/Tặng, hãy khôi phục trước khi sửa số lượng';
  END IF;

  IF v_item.quantity = p_quantity THEN
    RETURN jsonb_build_object('order_id', v_order.id, 'total_amount', v_order.total_amount, 'already_applied', true);
  END IF;

  INSERT INTO public.order_item_quantity_changes
    (store_id, order_id, order_item_id, item_name, old_quantity, new_quantity, reason, changed_by)
  VALUES
    (v_order.store_id, v_order.id, v_item.id, v_item.item_name, v_item.quantity, p_quantity, v_reason, auth.uid());

  UPDATE public.order_items SET quantity = p_quantity WHERE id = v_item.id;

  v_total := public.recompute_order_total(v_order.id);

  UPDATE public.table_sessions SET last_activity_at = now() WHERE id = v_order.session_id;

  RETURN jsonb_build_object('order_id', v_order.id, 'total_amount', v_total);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pos_walk_in_order(p_table_id uuid, p_items jsonb, p_client_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_table public.tables%ROWTYPE;
  v_existing public.orders%ROWTYPE;
  v_session_id uuid;
  v_result jsonb;
BEGIN
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu mã chống tạo trùng';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cần ít nhất một món';
  END IF;

  SELECT * INTO v_table FROM public.tables WHERE id = p_table_id;
  IF NOT FOUND OR NOT v_table.is_active THEN
    RAISE EXCEPTION 'Bàn không tồn tại hoặc đã ngừng dùng';
  END IF;
  IF NOT public.is_store_pos_operator(v_table.store_id) THEN
    RAISE EXCEPTION 'Bạn không có quyền mở bàn';
  END IF;

  SELECT * INTO v_existing FROM public.orders
  WHERE store_id = v_table.store_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('order_id', v_existing.id, 'session_id', v_existing.session_id,
                              'total_amount', v_existing.total_amount, 'already_created', true);
  END IF;

  PERFORM public.lock_table_for_session(p_table_id);
  IF public.open_session_id_for_table(p_table_id) IS NOT NULL THEN
    RAISE EXCEPTION '% vừa có khách. Chọn bàn khác hoặc thêm món vào bill bàn đó', v_table.table_number;
  END IF;

  INSERT INTO public.table_sessions (store_id, table_id, opened_by, is_open_ordering)
  VALUES (v_table.store_id, p_table_id, 'staff', false)
  RETURNING id INTO v_session_id;

  INSERT INTO public.session_tables (session_id, table_id) VALUES (v_session_id, p_table_id);

  v_result := public.pos_add_manual_items(v_session_id, p_items, p_client_request_id);
  RETURN v_result || jsonb_build_object('session_id', v_session_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_order_total(p_order_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total integer;
BEGIN
  SELECT COALESCE(SUM(
    (
      oi.item_price + COALESCE((
        SELECT SUM(COALESCE((topping->>'price')::integer, 0))
        FROM jsonb_array_elements(COALESCE(oi.selected_toppings, '[]'::jsonb)) AS topping
      ), 0)
    ) * oi.quantity
  ), 0)
  INTO v_total
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.void_type IS NULL;

  UPDATE public.orders
  SET total_amount = v_total,
      payment_amount = v_total,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN v_total;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.release_reservation_preorder(p_order_id uuid, p_expected_revision integer, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders%ROWTYPE;
  r public.reservations%ROWTYPE;
  snapshot jsonb;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Thiếu mã thao tác'; END IF;

  SELECT * INTO o
  FROM public.orders
  WHERE id = p_order_id;
  IF NOT FOUND OR o.order_source <> 'reservation_preorder' THEN
    RAISE EXCEPTION 'Không tìm thấy món đặt trước';
  END IF;
  IF NOT public.is_store_pos_operator(o.store_id) THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.requeue_reservation_zca_notification(p_store_id uuid, p_delivery_id uuid, p_expected_updated_at timestamp with time zone, p_request_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid(); v_delivery public.reservation_notification_deliveries%ROWTYPE;
  v_channel public.store_reservation_notification_channels%ROWTYPE;
  v_reservation public.reservations%ROWTYPE;
  v_event public.reservation_notification_recovery_events%ROWTYPE; v_now timestamptz := now();
  v_booking_found boolean := false;
BEGIN
  IF p_request_id IS NULL OR p_expected_updated_at IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'Mã thao tác hoặc lý do gửi lại không hợp lệ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mevo_operators op
    WHERE op.user_id = v_actor AND op.role = 'mevo_superadmin' AND op.store_id IS NULL AND op.is_active) THEN
    RAISE EXCEPTION 'Chỉ MEVO superadmin được gửi lại thông báo nội bộ';
  END IF;
  SELECT * INTO v_event FROM public.reservation_notification_recovery_events WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_event.delivery_id = p_delivery_id AND v_event.reason = btrim(p_reason)
       AND v_event.from_updated_at = p_expected_updated_at THEN
      RETURN jsonb_build_object('ok', true, 'already', true, 'delivery_id', p_delivery_id, 'status', 'queued');
    END IF;
    RAISE EXCEPTION 'Mã thao tác đã dùng cho dữ liệu khác';
  END IF;

  SELECT * INTO v_channel FROM public.store_reservation_notification_channels
  WHERE store_id = p_store_id FOR UPDATE;
  SELECT * INTO v_delivery FROM public.reservation_notification_deliveries
  WHERE id = p_delivery_id AND store_id = p_store_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy delivery thông báo nội bộ'; END IF;
  IF v_delivery.reservation_id IS NOT NULL THEN
    SELECT * INTO v_reservation FROM public.reservations
    WHERE id = v_delivery.reservation_id AND store_id = p_store_id FOR UPDATE;
    v_booking_found := FOUND;
  END IF;
  SELECT * INTO v_delivery FROM public.reservation_notification_deliveries
  WHERE id = p_delivery_id AND store_id = p_store_id FOR UPDATE;
  IF v_delivery.updated_at <> p_expected_updated_at THEN RAISE EXCEPTION 'Delivery đã thay đổi, vui lòng tải lại'; END IF;
  IF v_delivery.delivery_provider <> 'zca_group' OR v_delivery.recovery_version <> 1
     OR v_delivery.message_snapshot IS NULL THEN RAISE EXCEPTION 'Delivery cũ không có payload an toàn để gửi lại'; END IF;
  IF v_delivery.requeue_count >= 3 THEN RAISE EXCEPTION 'Đã đạt giới hạn gửi lại'; END IF;
  IF v_delivery.created_at < v_now - interval '24 hours' THEN RAISE EXCEPTION 'Delivery đã quá 24 giờ, cần kiểm tra thủ công'; END IF;
  IF v_delivery.status NOT IN ('failed', 'action_required')
     AND NOT (v_delivery.status IN ('queued', 'processing') AND COALESCE(v_delivery.processing_started_at, v_delivery.queued_at, v_delivery.updated_at) < v_now - interval '120 seconds') THEN
    RAISE EXCEPTION 'Delivery chưa ở trạng thái có thể gửi lại';
  END IF;
  IF v_delivery.status IN ('failed', 'action_required') AND v_delivery.updated_at > v_now - interval '60 seconds' THEN
    RAISE EXCEPTION 'Vui lòng chờ 60 giây trước khi gửi lại';
  END IF;
  IF v_channel.provider <> 'zca_group' OR NOT v_channel.is_enabled
     OR v_channel.destination_group_id IS DISTINCT FROM v_delivery.destination_group_id
     OR v_channel.retry_contract_verified_at IS NULL OR length(btrim(COALESCE(v_channel.retry_contract_evidence,''))) = 0
     OR v_channel.retry_contract_version IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Kênh chưa có bằng chứng relay cho phép gửi lại';
  END IF;
  IF v_delivery.kind = 'owner_new_reservation' AND (NOT v_booking_found OR v_reservation.status <> 'pending' OR v_reservation.arrival_at <= v_now) THEN
    RAISE EXCEPTION 'Đặt bàn không còn chờ xử lý hoặc đã quá giờ';
  END IF;

  UPDATE public.reservation_notification_deliveries
  SET status = 'queued', dispatch_token = gen_random_uuid(), queued_at = v_now,
      processing_started_at = NULL, provider_code = NULL, last_error = NULL,
      requeue_count = requeue_count + 1, updated_at = v_now
  WHERE id = v_delivery.id;
  INSERT INTO public.reservation_notification_recovery_events(
    store_id, delivery_id, request_id, actor_id, reason, from_status, from_updated_at, to_updated_at
  ) VALUES (p_store_id, v_delivery.id, p_request_id, v_actor, btrim(p_reason),
    v_delivery.status, v_delivery.updated_at, v_now);
  RETURN jsonb_build_object('ok', true, 'already', false, 'delivery_id', v_delivery.id, 'status', 'queued');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_reservation_customer_call(p_task_id uuid, p_outcome text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_task public.reservation_customer_call_tasks%ROWTYPE; v_actor_kind text;
BEGIN
  IF p_outcome NOT IN ('called', 'unreachable') THEN RAISE EXCEPTION 'Kết quả gọi nhắc không hợp lệ'; END IF;
  SELECT * INTO v_task FROM public.reservation_customer_call_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy việc gọi nhắc khách'; END IF;
  IF NOT public.is_store_pos_operator(v_task.store_id) THEN RAISE EXCEPTION 'Chỉ chủ quán được xử lý việc gọi nhắc khách'; END IF;
  IF v_task.retired_at IS NOT NULL THEN RAISE EXCEPTION 'Việc gọi nhắc này không còn hiệu lực'; END IF;
  IF v_task.resolved_at IS NOT NULL THEN RETURN jsonb_build_object('task_id', v_task.id, 'already', true, 'outcome', v_task.outcome); END IF;
  UPDATE public.reservation_customer_call_tasks SET resolved_at = now(), resolved_by = auth.uid(), outcome = p_outcome, updated_at = now() WHERE id = v_task.id RETURNING * INTO v_task;
  v_actor_kind := public.reservation_operator_actor_kind(v_task.store_id);
  PERFORM public.append_reservation_event(v_task.reservation_id, v_task.store_id, auth.uid(), v_actor_kind, 'reservation_customer_call_resolved', '{}'::jsonb, jsonb_build_object('task_id', v_task.id, 'outcome', v_task.outcome), CASE WHEN v_task.outcome = 'called' THEN 'Đã gọi nhắc khách' ELSE 'Chưa liên hệ được khách' END);
  RETURN jsonb_build_object('task_id', v_task.id, 'already', false, 'outcome', v_task.outcome);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.spin_wheel(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order orders%ROWTYPE;
  v_enabled boolean;
  v_paid boolean;
  v_existing spin_results%ROWTYPE;
  v_rewards jsonb;
  v_total int;
  v_r numeric;
  v_pick spin_rewards%ROWTYPE;
  v_new spin_results%ROWTYPE;
  v_voucher vouchers%ROWTYPE;
  v_voucher_json jsonb;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_eligible'); END IF;

  v_paid := v_order.payment_received_at IS NOT NULL AND v_order.status <> 'cancelled'
            AND v_order.order_source = 'customer_zalo' AND v_order.zalo_user_id IS NOT NULL;
  IF NOT v_paid THEN RETURN jsonb_build_object('status','not_eligible'); END IF;

  SELECT spin_enabled INTO v_enabled FROM stores WHERE id = v_order.store_id;
  IF NOT COALESCE(v_enabled,false) THEN RETURN jsonb_build_object('status','disabled'); END IF;

  SELECT jsonb_agg(jsonb_build_object('id',id,'label',label,'type',type) ORDER BY sort_order, id)
    INTO v_rewards FROM spin_rewards
   WHERE store_id=v_order.store_id AND is_active
     AND (v_order.zalo_user_id IS NOT NULL OR type <> 'voucher');
  IF v_rewards IS NULL THEN RETURN jsonb_build_object('status','disabled'); END IF;

  SELECT * INTO v_existing FROM spin_results WHERE order_id = p_order_id;
  IF FOUND THEN
    SELECT jsonb_build_object('code', vc.code, 'label', vc.label, 'expires_at', vc.expires_at)
      INTO v_voucher_json FROM vouchers vc WHERE vc.spin_result_id = v_existing.id;
    RETURN jsonb_build_object('status','done','already',true,'rewards',v_rewards,
      'result', jsonb_build_object('result_id',v_existing.id,'reward_id',v_existing.reward_id,
        'label',v_existing.reward_label,'type',v_existing.reward_type,
        'code',upper(left(v_existing.id::text,6)),'redeem_status',v_existing.status,
        'voucher', v_voucher_json));
  END IF;

  SELECT sum(weight) INTO v_total FROM spin_rewards
   WHERE store_id=v_order.store_id AND is_active
     AND (v_order.zalo_user_id IS NOT NULL OR type <> 'voucher');
  v_r := random() * v_total;
  SELECT s.* INTO v_pick FROM (
    SELECT sr.*, sum(sr.weight) OVER (ORDER BY sr.sort_order, sr.id) AS running
    FROM spin_rewards sr
    WHERE sr.store_id=v_order.store_id AND sr.is_active
      AND (v_order.zalo_user_id IS NOT NULL OR sr.type <> 'voucher')
  ) s WHERE v_r < s.running ORDER BY s.running ASC LIMIT 1;
  IF v_pick.id IS NULL THEN
    SELECT * INTO v_pick FROM spin_rewards
     WHERE store_id=v_order.store_id AND is_active
       AND (v_order.zalo_user_id IS NOT NULL OR type <> 'voucher')
     ORDER BY sort_order, id LIMIT 1;
  END IF;

  INSERT INTO spin_results (store_id, order_id, zalo_user_id, reward_id, reward_label, reward_type)
  VALUES (v_order.store_id, p_order_id, v_order.zalo_user_id, v_pick.id, v_pick.label, v_pick.type)
  ON CONFLICT (order_id) DO NOTHING
  RETURNING * INTO v_new;
  IF v_new.id IS NULL THEN
    SELECT * INTO v_new FROM spin_results WHERE order_id = p_order_id;
  END IF;

  IF v_new.reward_type = 'voucher'
     AND NOT EXISTS (SELECT 1 FROM vouchers WHERE spin_result_id = v_new.id) THEN
    INSERT INTO vouchers (store_id, code, kind, label, discount_type, discount_value,
                          max_discount, zalo_user_id, max_uses, expires_at, spin_result_id)
    SELECT v_order.store_id, upper(left(v_new.id::text, 6)), 'spin', sr.label,
           COALESCE(sr.discount_type, 'fixed'), COALESCE(sr.discount_value, 0),
           sr.max_discount, v_order.zalo_user_id, 1,
           now() + make_interval(days => COALESCE(sr.voucher_days, 30)), v_new.id
    FROM spin_rewards sr WHERE sr.id = v_new.reward_id
      AND COALESCE(sr.discount_value, 0) > 0;
  END IF;

  SELECT jsonb_build_object('code', vc.code, 'label', vc.label, 'expires_at', vc.expires_at)
    INTO v_voucher_json FROM vouchers vc WHERE vc.spin_result_id = v_new.id;

  RETURN jsonb_build_object('status','done','already',false,'rewards',v_rewards,
    'result', jsonb_build_object('result_id',v_new.id,'reward_id',v_new.reward_id,
      'label',v_new.reward_label,'type',v_new.reward_type,
      'code',upper(left(v_new.id::text,6)),'redeem_status',v_new.status,
      'voucher', v_voucher_json));
END; $function$
;

CREATE OR REPLACE FUNCTION public.store_accepting_now(p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_accepting boolean;
  v_hours     jsonb;
  v_now       time;
  v_shift     jsonb;
  v_open      time;
  v_close     time;
BEGIN
  SELECT is_accepting_orders, serving_hours
    INTO v_accepting, v_hours
    FROM stores WHERE id = p_store_id;

  IF NOT FOUND THEN RETURN false; END IF;
  IF v_accepting IS NOT TRUE THEN RETURN false; END IF;

  IF v_hours IS NULL OR jsonb_typeof(v_hours) <> 'array' OR jsonb_array_length(v_hours) = 0 THEN
    RETURN true;
  END IF;

  v_now := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::time;

  FOR v_shift IN SELECT * FROM jsonb_array_elements(v_hours) LOOP
    v_open  := (v_shift->>'open')::time;
    v_close := (v_shift->>'close')::time;
    IF v_open = v_close THEN
      RETURN true;
    ELSIF v_open < v_close THEN
      IF v_now >= v_open AND v_now < v_close THEN RETURN true; END IF;
    ELSE
      IF v_now >= v_open OR v_now < v_close THEN RETURN true; END IF;
    END IF;
  END LOOP;

  RETURN false;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sweep_abandoned_orders(p_store_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count int;
begin
  if not is_store_owner_or_admin(p_store_id) then
    raise exception 'Không có quyền';
  end if;
  update orders set status = 'cancelled'
  where store_id = p_store_id
    and order_source = 'customer_zalo'
    and payment_method = 'zalo_checkout'
    and status = 'pending'
    and payment_received_at is null
    and created_at < now() - interval '30 minutes';
  get diagnostics v_count = row_count;
  return v_count;
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_menu_item_price_from_variants()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids uuid[];
  v_id  uuid;
  v_min int;
BEGIN
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.menu_item_id END,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.menu_item_id END
  ]) AS x WHERE x IS NOT NULL;

  IF v_ids IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT MIN(price) INTO v_min
      FROM menu_item_variants
     WHERE menu_item_id = v_id AND is_available = true;
    IF v_min IS NOT NULL THEN
      UPDATE menu_items SET price = v_min WHERE id = v_id AND price <> v_min;
    END IF;
  END LOOP;
  RETURN NULL;
END; $function$
;

CREATE OR REPLACE FUNCTION public.sync_reservation_customer_call_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_due_at timestamptz;
BEGIN
  IF NEW.status = 'confirmed' THEN
    v_due_at := GREATEST(NEW.arrival_at - interval '60 minutes', now());
    UPDATE public.reservation_customer_call_tasks SET retired_at = now(), retired_reason = 'rescheduled', updated_at = now() WHERE reservation_id = NEW.id AND scheduled_arrival_at IS DISTINCT FROM NEW.arrival_at AND resolved_at IS NULL AND retired_at IS NULL;
    INSERT INTO public.reservation_customer_call_tasks (store_id, reservation_id, scheduled_arrival_at, due_at) VALUES (NEW.store_id, NEW.id, NEW.arrival_at, v_due_at)
    ON CONFLICT (reservation_id, scheduled_arrival_at) DO UPDATE SET due_at = EXCLUDED.due_at, retired_at = NULL, retired_reason = NULL, updated_at = now();
  ELSIF NEW.status IN ('arrived', 'cancelled_by_customer', 'cancelled_by_store', 'no_show', 'completed', 'rejected') THEN
    UPDATE public.reservation_customer_call_tasks SET retired_at = now(), retired_reason = NEW.status, updated_at = now() WHERE reservation_id = NEW.id AND resolved_at IS NULL AND retired_at IS NULL;
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.table_has_current_reservation_hold(p_table_id uuid, p_now timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.reservation_tables rt
    JOIN public.reservations r ON r.id = rt.reservation_id AND r.store_id = rt.store_id
    JOIN public.store_workflow_settings w ON w.store_id = rt.store_id
    WHERE rt.table_id = p_table_id AND rt.released_at IS NULL AND r.status = 'confirmed'
      AND r.session_id IS NULL AND w.reservations_enabled
      AND rt.hold_starts_at <= p_now AND rt.hold_ends_at > p_now
  );
$function$
;

ALTER TABLE public.reservation_customer_call_tasks ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

COMMIT;
