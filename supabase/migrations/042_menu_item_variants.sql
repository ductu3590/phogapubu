-- 042 — Tuỳ chọn quyết định giá cho món (menu item variants)
-- Một món = tối đa MỘT nhóm "chọn loại", chọn đúng 1, bắt buộc, giá TUYỆT ĐỐI thay giá món.
-- Chạy song song với topping (mig 015/016) — không đụng gì tới topping.
-- Spec: docs/superpowers/specs/2026-09-01-menu-item-variants-design.md
-- Idempotent: rerun-safe.
--
-- ⚠️ TRUNCATE menu_item_variants KHÔNG kích hoạt trigger FOR EACH ROW (Postgres bỏ qua
-- row-trigger khi TRUNCATE) → menu_items.price sẽ kẹt ở giá trị cuối cùng trước đó, không
-- tự cập nhật. Không dùng TRUNCATE trên bảng này; dùng DELETE nếu cần xoá sạch.

-- ─── 1. Bảng biến thể ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_item_variants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL,
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name         text NOT NULL,
  price        int  NOT NULL CHECK (price >= 0),
  is_available boolean NOT NULL DEFAULT true,
  sort_order   int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- FK GHÉP (menu_item_id, store_id): chặn ở tầng CSDL việc gán biến thể
  -- của quán này sang món quán khác, kể cả khi code phía trên có lỗi.
  -- Phụ thuộc ẩn: FK ghép này chỉ tạo được nhờ UNIQUE(id, store_id) trên menu_items —
  -- đã có sẵn từ mig 015 (constraint menu_items_id_store_uniq), KHÔNG phải migration này thêm.
  CONSTRAINT miv_item_store_fkey
    FOREIGN KEY (menu_item_id, store_id)
    REFERENCES menu_items (id, store_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_miv_lookup
  ON menu_item_variants (menu_item_id, is_available, sort_order);

-- ─── 2. Nhãn nhóm hiện cho khách ────────────────────────────────────────────
-- NULL → mini-app hiện 'Chọn loại'
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS variant_group_name text;

-- Ý nghĩa cột price đổi ngầm khi món có biến thể — nơi đọc cột này (admin-web, mini-app)
-- không có cách nào tự biết, nên ghi rõ ràng buộc ở đây (theo khuôn mig 017).
COMMENT ON COLUMN menu_items.price IS
  'Giá hiển thị mặc định. Với món CÓ biến thể (xem bảng menu_item_variants), cột này bị '
  'trigger trg_sync_menu_item_price ghi đè thành giá biến thể RẺ NHẤT còn bán — chỉ để hiện '
  '"Từ …đ", KHÔNG phải giá bán thật của một lựa chọn cụ thể. Chỗ tính tiền đơn hàng phải đọc '
  'menu_item_variants.price theo variant_id khách chọn, không được dùng menu_items.price.';

-- ─── 3. Snapshot vào đơn ────────────────────────────────────────────────────
-- KHÔNG đặt FK: snapshot phải sống sót khi biến thể bị xoá khỏi menu.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id   uuid;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_name text;

-- Cặp phải đi cùng nhau: có variant_id mà thiếu variant_name → phiếu bếp in dòng trống,
-- nấu sai món, và không dựng lại được tên vì cố ý không có FK ở trên.
-- Theo đúng khuôn DO-block mig 015 (order_items_selected_toppings_is_array).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_variant_pair_check') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_variant_pair_check
      CHECK ((variant_id IS NULL) = (variant_name IS NULL));
  END IF;
END $$;

-- ─── 4. Trigger đồng bộ giá hiển thị ────────────────────────────────────────
-- menu_items.price := giá biến thể RẺ NHẤT còn bán tại thời điểm ghi.
-- Mục đích: mọi câu truy vấn cũ đang đọc menu_items.price tự có số đúng để
-- hiện "Từ …đ" mà không phải sửa và không phải join thêm.
--
-- Nếu không còn biến thể nào còn bán → GIỮ NGUYÊN mức price hiện tại (không ghi đè, không
-- NULL). Đây KHÔNG phải "giá gốc của món" — giá gốc đã mất ngay từ lúc thêm biến thể ĐẦU
-- TIÊN (trigger ghi đè ngay lúc đó) và không được lưu ở đâu để khôi phục. Ví dụ: Bia 50k →
-- thêm Cốc 20k + Tháp 200k → price=20k → xoá Cốc → price=200k → xoá Tháp (hết biến thể) →
-- price KẸT ở 200.000đ, không tự về lại 50k. Admin PHẢI tự sửa menu_items.price bằng tay
-- sau khi xoá biến thể cuối cùng của một món.
--
-- Đồng thời (concurrency): ở mức isolation READ COMMITTED mặc định, hai giao dịch sửa biến
-- thể của CÙNG một món song song có thể mỗi bên chỉ thấy MIN tại lúc SELECT của riêng mình
-- (lost update), và có nguy cơ deadlock vì FK ghép ở mục 1 giữ khoá FOR KEY SHARE trên dòng
-- menu_items TRƯỚC KHI trigger này chạy UPDATE — nếu cả hai giao dịch cùng lúc đòi nâng lên
-- khoá độc quyền trên cùng dòng đó thì một bên phải chờ. Rủi ro THẤP ở quy mô MEVO (mỗi quán
-- một người vận hành, mỗi lần lưu form admin là một transaction chạy tuần tự nên vẫn ra đúng
-- MIN). Nếu gặp thật: chữa ở TẦNG ỨNG DỤNG bằng cách thử lại (retry) khi UPDATE báo deadlock —
-- KHÔNG thêm SELECT ... FOR UPDATE, vô ích vì khoá FOR KEY SHARE của FK đã cầm trước khi
-- trigger kịp chạy.
CREATE OR REPLACE FUNCTION sync_menu_item_price_from_variants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ids uuid[];
  v_id  uuid;
  v_min int;
BEGIN
  -- Chạy cho cả món cũ lẫn món mới: phòng ca UPDATE đổi menu_item_id.
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
END; $$;

DROP TRIGGER IF EXISTS trg_sync_menu_item_price ON menu_item_variants;
CREATE TRIGGER trg_sync_menu_item_price
AFTER INSERT OR UPDATE OR DELETE ON menu_item_variants
FOR EACH ROW EXECUTE FUNCTION sync_menu_item_price_from_variants();

-- ─── 5. RLS — sao đúng khuôn mig 019 (store-scoped), KHÔNG PHẢI khuôn cũ mig 016 ───────────
-- mig 016 dùng is_operator(), chỉ kiểm tra "có phải operator nào đó không" — KHÔNG kiểm tra
-- đúng quán. mig 019 sinh ra chính để vá lỗ hổng đó, và đã viết lại policy của
-- toppings/menu_item_toppings sang is_store_scoped_operator(store_id). Bảng mới này phải
-- theo bản vá 019, không theo bản gốc 016 đã lỗi thời — nếu dùng lại is_operator() thì chủ
-- quán A gọi thẳng Supabase (không qua admin-web) vẫn đọc được tên + giá biến thể của mọi
-- quán khác.
ALTER TABLE menu_item_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_variants" ON menu_item_variants;
CREATE POLICY "anon_read_variants" ON menu_item_variants
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "auth_read_variants" ON menu_item_variants;
CREATE POLICY "auth_read_variants" ON menu_item_variants
  FOR SELECT TO authenticated USING (is_store_scoped_operator(store_id));
-- Ghi: chỉ service-role (bypass RLS). Không policy cho role kitchen —
-- bếp chỉ đọc snapshot order_items.item_name / variant_name.

-- ─── 6. create_order — bắt buộc chọn biến thể, giá đọc từ CSDL ──────────────
-- ⚠️ Bản dưới đây được vá TRỰC TIẾP TRÊN ĐỊNH NGHĨA ĐANG CHẠY THẬT trên prod
-- (dump bằng pg_get_functiondef), KHÔNG phải chép lại từ file migration cũ.
-- File cũ có thể đã lạc hậu — chép lại từ đó sẽ xoá mất logic phiên bàn (mig 039),
-- lớp Mâm (mig 040) và voucher (mig 027) mà quán đang chạy thật.
-- Khác biệt so với bản đang chạy CHỈ gồm 4 điểm:
--   1) thêm 6 biến vào DECLARE
--   2) thêm khối "Biến thể" trong vòng lặp món (sau lookup menu_items, trước topping)
--   3) INSERT order_items ghi item_name/item_price đã ghép biến thể + snapshot 2 cột mới
--   4) v_total cộng theo v_item_price thay vì v_menu.price
-- Không đụng topping, phiên bàn, mâm, voucher, giờ phục vụ, phương thức thanh toán.
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

  SELECT payment_timing INTO v_timing FROM stores WHERE id = p_store_id;
  IF v_timing IS NULL THEN RAISE EXCEPTION 'Không tìm thấy quán'; END IF;

  IF v_timing = 'postpay' AND p_order_type = 'dine_in' THEN
    p_payment_method := 'cash';
    v_skip_method_check := true;

    PERFORM lock_table_for_session(p_table_id);

    v_session_id := open_session_id_for_table(p_table_id);
    IF v_session_id IS NULL THEN
      INSERT INTO table_sessions (store_id, table_id, host_zalo_user_id, host_device_id, opened_by)
      VALUES (p_store_id, p_table_id, p_zalo_user_id, p_device_id, 'customer')
      RETURNING id INTO v_session_id;
      INSERT INTO session_tables (session_id, table_id) VALUES (v_session_id, p_table_id);
    END IF;

    SELECT * INTO v_session FROM table_sessions WHERE id = v_session_id FOR UPDATE;
    IF NOT FOUND OR v_session.status <> 'open' THEN
      RAISE EXCEPTION 'Bàn vừa được đóng, vui lòng quét lại QR';
    END IF;

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
    v_variant_id   := NULLIF(v_item->>'variant_id','')::uuid;
    v_item_price   := v_menu.price;
    v_item_name    := v_menu.name;
    v_variant_name := NULL;

    -- Đếm TỔNG biến thể, KHÔNG lọc is_available. Nếu lọc thì món đã tắt bán
    -- hết mọi lựa chọn sẽ rơi vào nhánh "món thường" và bán được ở giá cũ,
    -- trong khi mini-app đã ẩn món đi.
    SELECT count(*) INTO v_variant_cnt
      FROM menu_item_variants WHERE menu_item_id = v_menu.id;

    IF v_variant_cnt = 0 THEN
      IF v_variant_id IS NOT NULL THEN
        RAISE EXCEPTION 'Món không có tuỳ chọn: %', v_menu.name;
      END IF;
    ELSE
      IF v_variant_id IS NULL THEN
        RAISE EXCEPTION 'Món cần chọn loại: %', v_menu.name;
      END IF;
      SELECT * INTO v_variant FROM menu_item_variants
       WHERE id = v_variant_id AND menu_item_id = v_menu.id
         AND store_id = p_store_id AND is_available = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Lựa chọn không hợp lệ hoặc đã hết: %', v_menu.name;
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
END; $function$;

-- Giữ nguyên quyền y như bản đang chạy (mig 039/040): mất GRANT anon là mọi khách
-- ở mọi quán không đặt được món nữa.
REVOKE ALL ON FUNCTION create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text) TO anon;

-- ─── 7. staff_create_order — cùng luật biến thể cho đơn đặt hộ ──────────────
-- Cũng vá trên định nghĩa đang chạy thật (mig 040). Khác create_order ở 2 chỗ:
-- quán lấy từ v_store (không có p_store_id), và biến topping tên v_item_tops/v_top_total.
-- Nhân viên đặt hộ mà bỏ qua kiểm tra này thì vẫn tính sai tiền y như khách tự đặt.
CREATE OR REPLACE FUNCTION public.staff_create_order(p_table_id uuid, p_items jsonb, p_payment_method text, p_client_request_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_store        uuid;
  v_role         text;
  v_order_id     uuid;
  v_total        int := 0;
  v_item         jsonb;
  v_menu         menu_items%rowtype;
  v_qty          int;
  v_topping_ids  uuid[];
  v_item_tops    jsonb;
  v_top_total    int;
  v_top_count    int;
  v_timing       text;
  v_session_id   uuid;
  v_instrument   text;
  v_variant      menu_item_variants%ROWTYPE;
  v_variant_id   uuid;
  v_variant_cnt  int;
  v_item_price   int;
  v_item_name    text;
  v_variant_name text;
BEGIN
  select store_id, role into v_store, v_role
  from mevo_operators where user_id = v_uid and is_active;
  if v_store is null or v_role not in ('store_owner','store_staff') then
    raise exception 'Không có quyền đặt món hộ';
  end if;

  if p_client_request_id is null then
    raise exception 'Thiếu client_request_id';
  end if;

  select id into v_order_id from orders
  where store_id = v_store and client_request_id = p_client_request_id;
  if v_order_id is not null then
    return jsonb_build_object(
      'order_id',   v_order_id,
      'total',      (select total_amount from orders where id = v_order_id),
      'idempotent', true,
      'items',      coalesce((select jsonb_agg(to_jsonb(oi))
                              from order_items oi where oi.order_id = v_order_id), '[]'::jsonb)
    );
  end if;

  if not exists (
    select 1 from tables
    where id = p_table_id and store_id = v_store and is_active
  ) then
    raise exception 'Bàn không thuộc quán hoặc đã ngừng dùng';
  end if;

  select payment_timing into v_timing from stores where id = v_store;

  if v_timing = 'postpay' then
    p_payment_method := 'cash';
    v_instrument     := null;

    perform lock_table_for_session(p_table_id);
    v_session_id := open_session_id_for_table(p_table_id);
    if v_session_id is null then
      insert into table_sessions (store_id, table_id, opened_by)
      values (v_store, p_table_id, 'staff')
      returning id into v_session_id;
      insert into session_tables (session_id, table_id) values (v_session_id, p_table_id);
    end if;
    perform 1 from table_sessions where id = v_session_id for update;
  else
    if p_payment_method not in ('cash','bank_transfer') then
      raise exception 'Phương thức không hợp lệ cho đơn đặt hộ: %', p_payment_method;
    end if;
    v_instrument := case p_payment_method when 'bank_transfer' then 'bank' else 'cash' end;
  end if;

  if not store_accepting_now(v_store)
     and not exists (
       select 1 from table_sessions
        where id = v_session_id and opened_at > now() - interval '2 hours'
     ) then
    raise exception 'Quán đang tạm nghỉ hoặc ngoài giờ phục vụ';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Đơn phải có ít nhất một món';
  end if;

  insert into orders (
    store_id, table_id, total_amount, payment_method, status,
    note, order_source, created_by, client_request_id, payment_instrument, session_id
  ) values (
    v_store, p_table_id, 0, p_payment_method, 'pending',
    p_note, 'staff', v_uid, p_client_request_id, v_instrument, v_session_id
  )
  on conflict (store_id, client_request_id) where client_request_id is not null
  do nothing
  returning id into v_order_id;

  if v_order_id is null then
    select id into v_order_id from orders
    where store_id = v_store and client_request_id = p_client_request_id;
    return jsonb_build_object(
      'order_id',   v_order_id,
      'total',      (select total_amount from orders where id = v_order_id),
      'idempotent', true,
      'items',      coalesce((select jsonb_agg(to_jsonb(oi))
                              from order_items oi where oi.order_id = v_order_id), '[]'::jsonb)
    );
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 then raise exception 'Số lượng không hợp lệ'; end if;

    select * into v_menu from menu_items
    where id = (v_item->>'menu_item_id')::uuid
      and store_id = v_store
      and is_available = true;
    if not found then
      raise exception 'Món không thuộc quán hoặc ngừng bán: %', v_item->>'menu_item_id';
    end if;

    -- ─── Biến thể: chọn 1, bắt buộc, giá tuyệt đối thay giá món ─────────────
    v_variant_id   := NULLIF(v_item->>'variant_id','')::uuid;
    v_item_price   := v_menu.price;
    v_item_name    := v_menu.name;
    v_variant_name := NULL;

    -- Đếm TỔNG biến thể, KHÔNG lọc is_available. Nếu lọc thì món đã tắt bán
    -- hết mọi lựa chọn sẽ rơi vào nhánh "món thường" và bán được ở giá cũ,
    -- trong khi mini-app đã ẩn món đi.
    SELECT count(*) INTO v_variant_cnt
      FROM menu_item_variants WHERE menu_item_id = v_menu.id;

    IF v_variant_cnt = 0 THEN
      IF v_variant_id IS NOT NULL THEN
        RAISE EXCEPTION 'Món không có tuỳ chọn: %', v_menu.name;
      END IF;
    ELSE
      IF v_variant_id IS NULL THEN
        RAISE EXCEPTION 'Món cần chọn loại: %', v_menu.name;
      END IF;
      SELECT * INTO v_variant FROM menu_item_variants
       WHERE id = v_variant_id AND menu_item_id = v_menu.id
         AND store_id = v_store AND is_available = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Lựa chọn không hợp lệ hoặc đã hết: %', v_menu.name;
      END IF;
      v_item_price   := v_variant.price;
      v_variant_name := v_variant.name;
      v_item_name    := v_menu.name || ' (' || v_variant.name || ')';
    END IF;

    v_item_tops := '[]'::jsonb; v_top_total := 0;
    if v_item ? 'topping_ids' and jsonb_typeof(v_item->'topping_ids') = 'array'
       and jsonb_array_length(v_item->'topping_ids') > 0 then
      select array_agg(distinct value::uuid) into v_topping_ids
        from jsonb_array_elements_text(v_item->'topping_ids');
      select
        coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'price',t.price)
                 order by t.sort_order, t.created_at), '[]'::jsonb),
        coalesce(sum(t.price),0), count(*)
      into v_item_tops, v_top_total, v_top_count
      from toppings t
      join menu_item_toppings mit on mit.topping_id = t.id and mit.menu_item_id = v_menu.id
      where t.id = any(v_topping_ids) and t.store_id = v_store and t.is_available = true;
      if v_top_count <> array_length(v_topping_ids,1) then
        raise exception 'Topping không hợp lệ / chưa gán cho món / ngừng bán: %', v_menu.name;
      end if;
    end if;

    insert into order_items (order_id, menu_item_id, item_name, item_price, quantity, note,
                             selected_toppings, variant_id, variant_name)
    values (v_order_id, v_menu.id, v_item_name, v_item_price, v_qty,
            nullif(v_item->>'note',''), v_item_tops, v_variant_id, v_variant_name);

    v_total := v_total + (v_item_price + v_top_total) * v_qty;
  end loop;

  update orders set total_amount = v_total, payment_amount = v_total where id = v_order_id;

  if v_session_id is not null then
    update table_sessions set last_activity_at = now() where id = v_session_id;
  end if;

  return jsonb_build_object(
    'order_id',   v_order_id,
    'total',      v_total,
    'idempotent', false,
    'items',      coalesce((select jsonb_agg(to_jsonb(oi))
                            from order_items oi where oi.order_id = v_order_id), '[]'::jsonb)
  );
end $function$;

-- Giữ nguyên quyền y như bản đang chạy (mig 039/040): chỉ authenticated, KHÔNG anon.
revoke all on function staff_create_order(uuid, jsonb, text, uuid, text) from public;
revoke all on function staff_create_order(uuid, jsonb, text, uuid, text) from anon;
grant execute on function staff_create_order(uuid, jsonb, text, uuid, text) to authenticated;
