-- 027_vouchers.sql — Hệ mã giảm giá (spec 2026-07-11)
-- Nguyên tắc: voucher = QUYỀN ưu đãi gắn Zalo UID; `code` chỉ là nhãn/nhập tay.
-- CẮM THÊM: quán không tạo mã, không thêm ô voucher → mọi luồng y như hiện tại.
-- orders.total_amount = tiền PHẢI TRẢ SAU GIẢM → MAC/doanh thu/bếp tự đúng.

-- ============================================================
-- 1) Bảng vouchers — dùng chung mã vòng quay + mã shipper
-- ============================================================
CREATE TABLE IF NOT EXISTS vouchers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code           text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('spin','shipper')),
  label          text NOT NULL,
  discount_type  text NOT NULL CHECK (discount_type IN ('fixed','percent')),
  discount_value int  NOT NULL CHECK (discount_value > 0),
  max_discount   int,                 -- trần giảm cho percent; NULL với fixed
  zalo_user_id   text,                -- chủ mã; shipper NULL = chưa kích hoạt (khoá vào UID người dùng ĐẦU TIÊN)
  max_uses       int,                 -- spin: 1; shipper: NULL = không giới hạn tổng
  daily_limit    int,                 -- shipper: N đơn/ngày giờ VN
  expires_at     timestamptz,         -- spin: now()+N ngày; shipper: NULL
  spin_result_id uuid REFERENCES spin_results(id) ON DELETE SET NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT spin_voucher_has_owner CHECK (kind <> 'spin' OR zalo_user_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vouchers_store_code ON vouchers(store_id, upper(code));
CREATE INDEX IF NOT EXISTS idx_vouchers_store_user ON vouchers(store_id, zalo_user_id);

-- ============================================================
-- 2) orders: voucher đã áp + số tiền đã giảm
-- ============================================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS voucher_id      uuid REFERENCES vouchers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_amount int NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_orders_voucher ON orders(voucher_id) WHERE voucher_id IS NOT NULL;

-- ============================================================
-- 3) spin_rewards: thêm loại 'voucher' + cấu hình mức giảm
-- ============================================================
ALTER TABLE spin_rewards DROP CONSTRAINT IF EXISTS spin_rewards_type_check;
ALTER TABLE spin_rewards ADD CONSTRAINT spin_rewards_type_check
  CHECK (type IN ('gift','none','voucher'));
ALTER TABLE spin_rewards
  ADD COLUMN IF NOT EXISTS discount_type  text CHECK (discount_type IN ('fixed','percent')),
  ADD COLUMN IF NOT EXISTS discount_value int,
  ADD COLUMN IF NOT EXISTS max_discount   int,
  ADD COLUMN IF NOT EXISTS voucher_days   int NOT NULL DEFAULT 30;

-- ============================================================
-- 4) RLS vouchers: operator store-scoped FULL; anon KHÔNG trực tiếp (qua RPC)
-- ============================================================
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "op_all_vouchers" ON vouchers;
CREATE POLICY "op_all_vouchers" ON vouchers
  FOR ALL TO authenticated
  USING (is_store_scoped_operator(store_id))
  WITH CHECK (is_store_scoped_operator(store_id));

-- ============================================================
-- 5) Kitchen đọc spin_results (card giải hiện vật) + realtime
-- ============================================================
GRANT SELECT ON spin_results TO kitchen;
DROP POLICY IF EXISTS "kitchen_read_spin_results" ON spin_results;
CREATE POLICY "kitchen_read_spin_results" ON spin_results
  FOR SELECT TO kitchen USING (store_id = kitchen_store_id());
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE spin_results;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 6) Helpers
-- ============================================================
-- Đầu ngày hiện tại theo giờ VN (timestamptz) — cho daily_limit
CREATE OR REPLACE FUNCTION vn_day_start() RETURNS timestamptz
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'
$$;

-- Đếm lượt "chiếm" voucher (spec 4.2). Đơn cash chiếm NGAY khi tạo (vào bếp ngay);
-- đơn online chiếm khi có trans_id HOẶC còn trẻ <30' (khoá mềm, tự nhả); cancelled nhả ngay.
CREATE OR REPLACE FUNCTION voucher_uses(p_voucher_id uuid, p_since timestamptz DEFAULT NULL)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM orders o
  WHERE o.voucher_id = p_voucher_id
    AND o.status <> 'cancelled'
    AND (o.payment_method = 'cash'
         OR o.zalopay_trans_id IS NOT NULL
         OR o.created_at > now() - interval '30 minutes')
    AND (p_since IS NULL OR o.created_at >= p_since)
$$;

-- Lý do voucher KHÔNG dùng được cho UID này (NULL = dùng được).
-- LƯU Ý: zalo_user_id IS NULL (shipper chưa kích hoạt) là HỢP LỆ — checkout là bước kích hoạt.
CREATE OR REPLACE FUNCTION voucher_reject_reason(v vouchers, p_zalo_user_id text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT v.is_active THEN RETURN 'Mã đã bị tắt'; END IF;
  IF v.expires_at IS NOT NULL AND v.expires_at <= now() THEN RETURN 'Mã đã hết hạn'; END IF;
  IF p_zalo_user_id IS NULL OR p_zalo_user_id = '' THEN
    RETURN 'Không xác định được tài khoản Zalo để dùng mã'; END IF;
  IF v.zalo_user_id IS NOT NULL AND v.zalo_user_id <> p_zalo_user_id THEN
    RETURN 'Mã này thuộc về tài khoản Zalo khác'; END IF;
  IF v.max_uses IS NOT NULL AND voucher_uses(v.id) >= v.max_uses THEN
    RETURN 'Mã đã được dùng'; END IF;
  IF v.daily_limit IS NOT NULL AND voucher_uses(v.id, vn_day_start()) >= v.daily_limit THEN
    RETURN 'Mã đã hết lượt hôm nay'; END IF;
  RETURN NULL;
END $$;

-- Số tiền giảm cho subtotal (fixed trừ thẳng; percent làm tròn, chặn max_discount)
CREATE OR REPLACE FUNCTION voucher_discount(v vouchers, p_subtotal int)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN v.discount_type = 'fixed' THEN LEAST(v.discount_value, p_subtotal)
    ELSE LEAST(round(p_subtotal * v.discount_value / 100.0)::int,
               COALESCE(v.max_discount, p_subtotal), p_subtotal)
  END
$$;

-- ============================================================
-- 7) RPC anon: danh sách mã của khách + preview mã nhập tay
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_vouchers(p_store_id uuid, p_zalo_user_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', v.id, 'code', v.code, 'label', v.label, 'kind', v.kind,
      'discount_type', v.discount_type, 'discount_value', v.discount_value,
      'max_discount', v.max_discount, 'expires_at', v.expires_at
    ) ORDER BY v.created_at DESC), '[]'::jsonb)
  FROM vouchers v
  WHERE v.store_id = p_store_id
    AND p_zalo_user_id IS NOT NULL AND p_zalo_user_id <> ''
    AND v.zalo_user_id = p_zalo_user_id
    AND voucher_reject_reason(v, p_zalo_user_id) IS NULL
$$;
REVOKE ALL ON FUNCTION get_my_vouchers(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION get_my_vouchers(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION check_voucher(p_store_id uuid, p_code text, p_zalo_user_id text, p_subtotal int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v vouchers%ROWTYPE; v_reason text; v_disc int;
BEGIN
  SELECT * INTO v FROM vouchers
   WHERE store_id = p_store_id AND upper(code) = upper(trim(p_code));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Mã không tồn tại'); END IF;
  v_reason := voucher_reject_reason(v, p_zalo_user_id);
  IF v_reason IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', v_reason); END IF;
  v_disc := voucher_discount(v, COALESCE(p_subtotal, 0));
  IF COALESCE(p_subtotal, 0) - v_disc < 1000 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Đơn quá nhỏ để áp mã'); END IF;
  RETURN jsonb_build_object('valid', true, 'code', v.code, 'label', v.label,
    'discount_type', v.discount_type, 'discount_value', v.discount_value,
    'max_discount', v.max_discount, 'discount_amount', v_disc);
END $$;
REVOKE ALL ON FUNCTION check_voucher(uuid, text, text, int) FROM public;
GRANT EXECUTE ON FUNCTION check_voucher(uuid, text, text, int) TO anon, authenticated;

-- ============================================================
-- 8) create_order v5 = v4 (017) + p_voucher_code
--    ⚠️ Thêm param DEFAULT tạo OVERLOAD MỚI → PHẢI DROP bản 10 tham số cũ,
--    nếu không PostgREST thấy 2 hàm trùng tên → lỗi ambiguous.
--    Client cũ (không gửi p_voucher_code) vẫn gọi được bản mới nhờ DEFAULT NULL.
-- ============================================================
DROP FUNCTION IF EXISTS create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION create_order(
  p_store_id uuid, p_table_id uuid DEFAULT NULL, p_items jsonb DEFAULT NULL,
  p_payment_method text DEFAULT 'zalopay', p_zalo_user_id text DEFAULT NULL, p_note text DEFAULT NULL,
  p_order_type text DEFAULT 'dine_in', p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL, p_delivery_address text DEFAULT NULL,
  p_voucher_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE; v_total int := 0; v_token text := gen_random_uuid()::text;
  v_item jsonb; v_menu menu_items%ROWTYPE; v_qty int;
  v_topping_ids uuid[]; v_item_toppings jsonb; v_topping_total int; v_topping_count int;
  v_voucher vouchers%ROWTYPE; v_discount int := 0; v_reason text;
BEGIN
  IF p_payment_method NOT IN ('zalopay','cash') THEN RAISE EXCEPTION 'payment_method không hợp lệ: %', p_payment_method; END IF;
  IF p_order_type NOT IN ('dine_in','pickup','delivery') THEN RAISE EXCEPTION 'order_type không hợp lệ: %', p_order_type; END IF;

  -- Chặn khi quán tạm nghỉ / ngoài giờ phục vụ (áp cho mọi loại đơn)
  IF NOT store_accepting_now(p_store_id) THEN
    RAISE EXCEPTION 'Quán đang tạm nghỉ hoặc ngoài giờ phục vụ';
  END IF;

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
    IF p_payment_method <> 'zalopay' THEN RAISE EXCEPTION 'Đơn mang về chỉ chấp nhận ZaloPay'; END IF;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Đơn không có món nào'; END IF;

  INSERT INTO orders (store_id, table_id, total_amount, zalo_user_id, note, payment_method, status, capability_token,
    order_type, customer_name, customer_phone, delivery_address)
  VALUES (p_store_id, p_table_id, 0, p_zalo_user_id, p_note, p_payment_method, 'pending', v_token,
    p_order_type, p_customer_name, p_customer_phone, p_delivery_address)
  RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Số lượng không hợp lệ'; END IF;

    SELECT * INTO v_menu FROM menu_items
    WHERE id = (v_item->>'menu_item_id')::uuid AND store_id = p_store_id AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Món không thuộc quán hoặc ngừng bán: %', v_item->>'menu_item_id'; END IF;

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

    INSERT INTO order_items (order_id, menu_item_id, item_name, item_price, quantity, note, selected_toppings)
    VALUES (v_order.id, v_menu.id, v_menu.name, v_menu.price, v_qty, v_item->>'note', v_item_toppings);
    v_total := v_total + (v_menu.price + v_topping_total) * v_qty;
  END LOOP;

  -- ── Voucher: validate + kích hoạt lần đầu + tính giảm (FOR UPDATE chống 2 đơn đồng thời) ──
  IF p_voucher_code IS NOT NULL AND trim(p_voucher_code) <> '' THEN
    SELECT * INTO v_voucher FROM vouchers
     WHERE store_id = p_store_id AND upper(code) = upper(trim(p_voucher_code))
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mã giảm giá không tồn tại'; END IF;
    v_reason := voucher_reject_reason(v_voucher, p_zalo_user_id);
    IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%', v_reason; END IF;
    -- Kích hoạt lần đầu: mã shipper chưa có chủ → khoá vĩnh viễn vào UID này
    IF v_voucher.zalo_user_id IS NULL THEN
      UPDATE vouchers SET zalo_user_id = p_zalo_user_id WHERE id = v_voucher.id;
    END IF;
    v_discount := voucher_discount(v_voucher, v_total);
    IF v_total - v_discount < 1000 THEN RAISE EXCEPTION 'Đơn quá nhỏ để áp mã giảm giá'; END IF;
  END IF;

  UPDATE orders SET total_amount = v_total - v_discount,
                    discount_amount = v_discount,
                    voucher_id = v_voucher.id
   WHERE id = v_order.id RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END; $$;
REVOKE ALL ON FUNCTION create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text) TO anon;

-- ============================================================
-- 9) get_spin_state v2 + spin_wheel v2
--    Thay đổi: (a) đơn KHÔNG có zalo_user_id → loại ô 'voucher' khỏi rewards/draw
--    (bất biến kind='spin' ⇒ có chủ); (b) trúng voucher → tạo dòng vouchers cùng
--    transaction; (c) response kèm 'voucher' {code,label,expires_at} để client hiện HSD.
-- ============================================================
CREATE OR REPLACE FUNCTION get_spin_state(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  v_paid := (v_order.payment_method='zalopay' AND v_order.zalopay_trans_id IS NOT NULL AND v_order.status<>'cancelled')
         OR (v_order.payment_method='cash' AND v_order.status='paid');
  IF NOT v_paid THEN RETURN jsonb_build_object('status','not_eligible'); END IF;

  SELECT spin_enabled INTO v_enabled FROM stores WHERE id = v_order.store_id;

  -- Đơn không có UID → ẩn ô voucher (không thể phát mã đúng người)
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
END; $$;

CREATE OR REPLACE FUNCTION spin_wheel(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  v_paid := (v_order.payment_method='zalopay' AND v_order.zalopay_trans_id IS NOT NULL AND v_order.status<>'cancelled')
         OR (v_order.payment_method='cash' AND v_order.status='paid');
  IF NOT v_paid THEN RETURN jsonb_build_object('status','not_eligible'); END IF;

  SELECT spin_enabled INTO v_enabled FROM stores WHERE id = v_order.store_id;
  IF NOT COALESCE(v_enabled,false) THEN RETURN jsonb_build_object('status','disabled'); END IF;

  SELECT jsonb_agg(jsonb_build_object('id',id,'label',label,'type',type) ORDER BY sort_order, id)
    INTO v_rewards FROM spin_rewards
   WHERE store_id=v_order.store_id AND is_active
     AND (v_order.zalo_user_id IS NOT NULL OR type <> 'voucher');
  IF v_rewards IS NULL THEN RETURN jsonb_build_object('status','disabled'); END IF;

  -- Idempotent: đã quay rồi → trả kết quả cũ (kèm voucher nếu có)
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

  -- Random theo weight — cùng bộ lọc với v_rewards (loại voucher nếu đơn không UID)
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

  -- Trúng ô voucher → phát mã gắn UID của đơn, cùng transaction.
  -- v_new có thể là kết quả cũ (ON CONFLICT) → chỉ tạo nếu chưa có voucher cho result này.
  IF v_new.reward_type = 'voucher'
     AND NOT EXISTS (SELECT 1 FROM vouchers WHERE spin_result_id = v_new.id) THEN
    INSERT INTO vouchers (store_id, code, kind, label, discount_type, discount_value,
                          max_discount, zalo_user_id, max_uses, expires_at, spin_result_id)
    SELECT v_order.store_id, upper(left(v_new.id::text, 6)), 'spin', sr.label,
           COALESCE(sr.discount_type, 'fixed'), COALESCE(sr.discount_value, 0),
           sr.max_discount, v_order.zalo_user_id, 1,
           now() + make_interval(days => COALESCE(sr.voucher_days, 30)), v_new.id
    FROM spin_rewards sr WHERE sr.id = v_new.reward_id
      AND COALESCE(sr.discount_value, 0) > 0;  -- ô voucher cấu hình sai (value 0) → không phát mã
  END IF;

  SELECT jsonb_build_object('code', vc.code, 'label', vc.label, 'expires_at', vc.expires_at)
    INTO v_voucher_json FROM vouchers vc WHERE vc.spin_result_id = v_new.id;

  RETURN jsonb_build_object('status','done','already',false,'rewards',v_rewards,
    'result', jsonb_build_object('result_id',v_new.id,'reward_id',v_new.reward_id,
      'label',v_new.reward_label,'type',v_new.reward_type,
      'code',upper(left(v_new.id::text,6)),'redeem_status',v_new.status,
      'voucher', v_voucher_json));
END; $$;

-- ============================================================
-- 10) redeem_spin_result v2: cho phép CẢ kitchen (nút "Đã đưa" trên màn bếp)
-- ============================================================
CREATE OR REPLACE FUNCTION redeem_spin_result(p_result_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_res spin_results%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM spin_results WHERE id = p_result_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy kết quả'; END IF;
  IF NOT (kitchen_store_id() = v_res.store_id OR is_store_scoped_operator(v_res.store_id)) THEN
    RAISE EXCEPTION 'Không có quyền với quán này';
  END IF;
  UPDATE spin_results SET status='redeemed', redeemed_at=now()
    WHERE id=p_result_id AND status='won';
  RETURN jsonb_build_object('ok', true, 'already', v_res.status='redeemed');
END; $$;
GRANT EXECUTE ON FUNCTION redeem_spin_result(uuid) TO authenticated, kitchen;

-- ============================================================
-- 11) Hardening: helper nội bộ KHÔNG cho gọi trực tiếp qua PostgREST
--     (chỉ được gọi từ các hàm SECURITY DEFINER phía trên).
--     Tiện tay dọn luôn 3 RPC spin kế thừa public từ mig 025.
--     ⚠️ Supabase default ACL grant EXECUTE cho anon/authenticated/service_role
--     NGAY khi CREATE FUNCTION → REVOKE FROM public KHÔNG đủ, phải revoke
--     tường minh cả anon + authenticated trên helper nội bộ.
-- ============================================================
REVOKE ALL ON FUNCTION vn_day_start() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION voucher_uses(uuid, timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION voucher_reject_reason(vouchers, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION voucher_discount(vouchers, int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION get_spin_state(uuid) FROM public;
REVOKE ALL ON FUNCTION spin_wheel(uuid) FROM public;
REVOKE ALL ON FUNCTION redeem_spin_result(uuid) FROM public, anon;
-- get_spin_state/spin_wheel vẫn cần anon (mini-app gọi); redeem đã GRANT authenticated+kitchen ở mục 10
GRANT EXECUTE ON FUNCTION get_spin_state(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION spin_wheel(uuid) TO anon, authenticated;
