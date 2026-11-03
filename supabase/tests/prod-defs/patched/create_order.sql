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
  v_moved_session uuid; v_moved_table uuid; v_orig_table_id uuid;
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

    -- mig 105: người gọi thuộc một phiên ĐANG MỞ đã chuyển đi khỏi bàn này → gắn đơn vào đúng phiên đó
    -- ở bàn hiện tại, KHÔNG mở phiên mới ở bàn cũ (bill ma). Đứng trước cả trường hợp bàn cũ đã có khách
    -- mới. Phiên đã giữ lại chính bàn này (thêm lại vào mâm) → không đổi gì.
    v_orig_table_id := p_table_id;
    SELECT m.session_id, m.table_id INTO v_moved_session, v_moved_table
      FROM moved_session_for_caller(p_table_id, p_zalo_user_id, p_device_id) m;
    IF v_moved_session IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM session_tables st
          WHERE st.session_id = v_moved_session AND st.table_id = p_table_id AND st.is_open) THEN
      p_table_id := v_moved_table;
    END IF;

    -- Khoá theo BÀN trước khi tìm-hoặc-mở: hai máy bấm cùng lúc thì máy sau phải nhìn thấy
    -- phiên máy trước vừa tạo, không được tạo phiên thứ hai (rủi ro #1).
    PERFORM lock_table_for_session(p_table_id);

    v_session_id := open_session_id_for_table(p_table_id);
    IF v_session_id IS NULL THEN
      -- mig 105: tra lại phiên đã chuyển SAU khi giữ khoá bàn (xem chú thích ở migration 105).
      -- Phiên trả về mà không giữ bàn đang định mở → bàn vừa được chuyển đi, không được mở phiên mới ở đây.
      IF EXISTS (
           SELECT 1 FROM moved_session_for_caller(v_orig_table_id, p_zalo_user_id, p_device_id) m
            WHERE NOT EXISTS (
              SELECT 1 FROM session_tables st
               WHERE st.session_id = m.session_id AND st.table_id = p_table_id AND st.is_open))
         OR EXISTS (
           SELECT 1 FROM moved_session_for_caller(p_table_id, p_zalo_user_id, p_device_id) m
            WHERE NOT EXISTS (
              SELECT 1 FROM session_tables st
               WHERE st.session_id = m.session_id AND st.table_id = p_table_id AND st.is_open)) THEN
        RAISE EXCEPTION 'Bàn vừa được chuyển, vui lòng thử lại';
      END IF;
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
    order_type, customer_name, customer_phone, delivery_address, session_id, device_id)
  VALUES (p_store_id, p_table_id, 0, p_zalo_user_id, p_note, p_payment_method, 'pending', v_token,
    p_order_type, p_customer_name, p_customer_phone, p_delivery_address, v_session_id, NULLIF(btrim(p_device_id), ''))
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
