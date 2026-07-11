# Hệ mã giảm giá (voucher) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vòng quay trúng mã giảm giá tự áp vào lần thanh toán sau; giải hiện vật báo bếp (card + loa TTS); mã shipper khoá Zalo UID quản lý ở `/admin/vouchers`.

**Architecture:** Một bảng `vouchers` chung (kind `spin`/`shipper`), toàn bộ validate + trừ tiền nằm trong RPC `create_order` (server-side, `FOR UPDATE`). `orders.total_amount` = tiền phải trả **sau giảm** → MAC thanh toán, doanh thu, màn bếp tự đúng. Lượt dùng đếm qua `orders.voucher_id` (không cột counter). Spec: `docs/superpowers/specs/2026-07-11-voucher-discount-system-design.md`.

**Tech Stack:** Supabase (PostgreSQL migration + RPC plpgsql, áp qua Supabase MCP `apply_migration` — được phép tự chạy), mini-app (React + zmp-ui + react-query + zustand), admin-web (Next.js App Router + server actions + vitest).

**⚠️ Trước khi bắt đầu:**
- Working tree đang có thay đổi CHƯA commit không liên quan (`mini-app/src/pages/checkout/index.tsx`, `order.api.ts`, `payment.service.ts`, `supabase/functions/checkout-create-mac/index.ts`, `docs/CHECKLIST-PILOT-PUBU-2026-07-09.md`). **KHÔNG commit các file này.** Mọi commit trong plan chỉ `git add` đúng file được liệt kê.
- `admin-web/AGENTS.md`: Next.js bản này khác training data — đọc guide trong `node_modules/next/dist/docs/` trước khi viết code admin-web nếu gặp API lạ.
- Quy tắc CLAUDE.md: xong plan phải DỪNG, nhờ anh Tú test theo `TESTING-VOUCHER.md` (Task 11 tạo), chờ PASS.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| Create `supabase/migrations/027_vouchers.sql` | Schema vouchers + orders cột mới + spin_rewards voucher + RLS + realtime + toàn bộ RPC |
| Modify `mini-app/src/services/spin/spin.api.ts` | Type SpinReward/SpinResult thêm `voucher` |
| Create `mini-app/src/services/voucher/voucher.api.ts` | RPC get_my_vouchers / check_voucher + estimateDiscount |
| Modify `mini-app/src/types/order.types.ts` | CreateOrderRequest.voucherCode; Order.discountAmount |
| Modify `mini-app/src/services/order/order.api.ts` | Gửi p_voucher_code; map discount_amount |
| Create `mini-app/src/components/checkout/voucher-section.tsx` | UI chọn/nhập mã ở checkout |
| Modify `mini-app/src/pages/checkout/index.tsx` | Nhúng voucher section + dòng giảm giá |
| Modify `mini-app/src/components/spin/spin-section.tsx` | Hiển thị kết quả trúng voucher |
| Modify `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx` | Card + TTS giải hiện vật, nút "Đã đưa" |
| Create `admin-web/lib/voucher-code.ts` + `.test.ts` | Sinh code SHIP-XXXXXX khó đoán |
| Create `admin-web/lib/actions/vouchers.ts` | Server actions tạo/tắt mã shipper |
| Create `admin-web/app/admin/vouchers/page.tsx` + `vouchers-client.tsx` | Trang "Ưu đãi" |
| Modify `admin-web/app/admin/layout.tsx` | Nav link Ưu đãi |
| Modify `admin-web/lib/actions/spin.ts` + `app/admin/spin/spin-client.tsx` | Ô thưởng loại voucher |
| Modify `admin-web/app/admin/orders/page.tsx` | Dòng giảm giá trên đơn |
| Create `TESTING-VOUCHER.md` | Checklist test cho anh Tú |

---

### Task 0: Nhánh feature

- [ ] **Step 1: Tạo nhánh**

```powershell
git checkout -b feat/vouchers
```

Expected: `Switched to a new branch 'feat/vouchers'` (các file dirty không liên quan đi theo — kệ chúng, không commit).

---

### Task 1: Migration 027 — schema + RLS + realtime

**Files:**
- Create: `supabase/migrations/027_vouchers.sql` (phần 1 — Task 2 sẽ nối thêm RPC vào cùng file)

- [ ] **Step 1: Viết phần schema của migration**

Tạo `supabase/migrations/027_vouchers.sql`:

```sql
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
```

- [ ] **Step 2: Commit**

```powershell
git add supabase/migrations/027_vouchers.sql
git commit -m "feat(db): bảng vouchers + orders.discount_amount + spin_rewards loại voucher (mig 027 phần schema)"
```

*(Chưa apply — apply 1 lần ở Task 2 sau khi có đủ RPC, tránh apply nửa chừng.)*

---

### Task 2: Migration 027 — RPC (helpers, create_order v5, spin_wheel v2, get_spin_state v2, check/get vouchers, redeem cho kitchen)

**Files:**
- Modify: `supabase/migrations/027_vouchers.sql` (nối vào cuối file)

- [ ] **Step 1: Nối phần RPC vào cuối `027_vouchers.sql`**

```sql
-- ============================================================
-- 6) Helpers
-- ============================================================
-- Đầu ngày hiện tại theo giờ VN (timestamptz) — cho daily_limit
CREATE OR REPLACE FUNCTION vn_day_start() RETURNS timestamptz
LANGUAGE sql STABLE AS $$
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
RETURNS int LANGUAGE sql IMMUTABLE AS $$
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
```

- [ ] **Step 2: Apply migration lên prod qua Supabase MCP**

Gọi `mcp apply_migration` với name `027_vouchers`, query = toàn bộ nội dung file. Expected: success, không lỗi.

- [ ] **Step 3: Smoke test SQL qua MCP `execute_sql`** (mỗi khối một lần gọi, tự dọn dữ liệu test)

```sql
-- 3a. Constraint spin phải có chủ → expect ERROR "spin_voucher_has_owner"
INSERT INTO vouchers (store_id, code, kind, label, discount_type, discount_value)
SELECT id, 'TEST-FAIL', 'spin', 't', 'fixed', 5000 FROM stores LIMIT 1;
```
Expected: lỗi violates check constraint `spin_voucher_has_owner`.

```sql
-- 3b-1. Tạo mã shipper test (câu lệnh RIÊNG — CTE INSERT cùng câu với SELECT
-- sẽ không thấy row mới do snapshot)
INSERT INTO vouchers (store_id, code, kind, label, discount_type, discount_value, daily_limit)
SELECT id, 'TEST-SHIP', 'shipper', 'Shipper test', 'fixed', 5000, 10 FROM stores LIMIT 1;
```

```sql
-- 3b-2. check_voucher: mã chưa kích hoạt hợp lệ với bất kỳ UID
SELECT check_voucher(store_id, 'test-ship', 'uid_A', 50000) FROM vouchers WHERE code = 'TEST-SHIP';
```
Expected: `{"valid": true, ..., "discount_amount": 5000}` (code thường vẫn khớp nhờ upper()).

```sql
-- 3c. UID khác sau khi mã có chủ + đơn quá nhỏ
UPDATE vouchers SET zalo_user_id = 'uid_A' WHERE code = 'TEST-SHIP';
SELECT check_voucher(store_id, 'TEST-SHIP', 'uid_B', 50000) AS wrong_uid,
       check_voucher(store_id, 'TEST-SHIP', 'uid_A', 5500)  AS too_small
FROM vouchers WHERE code = 'TEST-SHIP';
```
Expected: wrong_uid → `reason: "Mã này thuộc về tài khoản Zalo khác"`; too_small → `reason: "Đơn quá nhỏ để áp mã"` (5500−5000 < 1000).

```sql
-- 3d. get_my_vouchers thấy mã của uid_A, không thấy của uid_B; rồi DỌN
SELECT get_my_vouchers(store_id, 'uid_A') AS a, get_my_vouchers(store_id, 'uid_B') AS b
FROM vouchers WHERE code = 'TEST-SHIP';
DELETE FROM vouchers WHERE code IN ('TEST-SHIP');
```
Expected: `a` = mảng 1 phần tử, `b` = `[]`. Sau DELETE: dọn sạch.

```sql
-- 3e. create_order còn đúng 1 overload (11 tham số)
SELECT count(*) FROM pg_proc WHERE proname = 'create_order';
```
Expected: `1`.

- [ ] **Step 4: Commit**

```powershell
git add supabase/migrations/027_vouchers.sql
git commit -m "feat(db): RPC voucher — create_order v5 + spin_wheel v2 + check/get vouchers + redeem cho kitchen (mig 027 hoàn chỉnh, đã áp prod)"
```

---

### Task 3: Mini-app — voucher service + types + gửi mã khi tạo đơn

**Files:**
- Create: `mini-app/src/services/voucher/voucher.api.ts`
- Modify: `mini-app/src/types/order.types.ts:45-63` (CreateOrderRequest) + interface Order (thêm discountAmount)
- Modify: `mini-app/src/services/order/order.api.ts:5-28` (createOrder) + `:110-131` (mapOrder)

- [ ] **Step 1: Tạo `mini-app/src/services/voucher/voucher.api.ts`**

```ts
import { supabase } from "../supabase";

// Mã giảm giá (spec 2026-07-11). Server là nơi CHỐT quyền dùng + số tiền giảm
// (create_order). estimateDiscount chỉ để client hiển thị/chọn mã tốt nhất.
export type MyVoucher = {
  id: string;
  code: string;
  label: string;
  kind: "spin" | "shipper";
  discount_type: "fixed" | "percent";
  discount_value: number;
  max_discount: number | null;
  expires_at: string | null;
};

export type VoucherCheck =
  | { valid: true; code: string; label: string; discount_amount: number;
      discount_type: "fixed" | "percent"; discount_value: number; max_discount: number | null }
  | { valid: false; reason: string };

// Cùng công thức với SQL voucher_discount() — chỉ dùng để HIỂN THỊ,
// server tính lại khi tạo đơn.
export function estimateDiscount(
  v: Pick<MyVoucher, "discount_type" | "discount_value" | "max_discount">,
  subtotal: number,
): number {
  if (v.discount_type === "fixed") return Math.min(v.discount_value, subtotal);
  return Math.min(
    Math.round((subtotal * v.discount_value) / 100),
    v.max_discount ?? subtotal,
    subtotal,
  );
}

export const voucherService = {
  getMyVouchers: async (storeId: string, zaloUserId: string): Promise<MyVoucher[]> => {
    const { data, error } = await supabase.rpc("get_my_vouchers", {
      p_store_id: storeId,
      p_zalo_user_id: zaloUserId,
    });
    if (error) throw error;
    return (data ?? []) as unknown as MyVoucher[];
  },

  check: async (
    storeId: string,
    code: string,
    zaloUserId: string,
    subtotal: number,
  ): Promise<VoucherCheck> => {
    const { data, error } = await supabase.rpc("check_voucher", {
      p_store_id: storeId,
      p_code: code,
      p_zalo_user_id: zaloUserId,
      p_subtotal: subtotal,
    });
    if (error) throw error;
    return data as unknown as VoucherCheck;
  },
};
```

- [ ] **Step 2: Sửa `mini-app/src/types/order.types.ts`**

Trong `CreateOrderRequest` thêm sau `deliveryAddress?: string;`:

```ts
  voucherCode?: string;
```

Trong `interface Order` (cùng file, phía trên) thêm cạnh `totalAmount`:

```ts
  discountAmount: number;
```

- [ ] **Step 3: Sửa `mini-app/src/services/order/order.api.ts`**

Trong `createOrder`, thêm vào object params RPC (sau `p_delivery_address`):

```ts
      p_voucher_code: req.voucherCode ?? null,
```

Trong `mapOrder`, thêm sau dòng `totalAmount`:

```ts
    discountAmount: (row.discount_amount as number | undefined) ?? 0,
```

- [ ] **Step 4: Typecheck mini-app**

```powershell
Set-Location mini-app; npx tsc --noEmit
```

Expected: không lỗi MỚI so với baseline hiện tại (repo có thể còn lỗi cũ từ trước — chỉ cần các file vừa sửa không báo lỗi). Sửa nếu lỗi thuộc file mình sửa.

- [ ] **Step 5: Commit**

```powershell
Set-Location D:\Code\mevo
git add mini-app/src/services/voucher/voucher.api.ts mini-app/src/types/order.types.ts mini-app/src/services/order/order.api.ts
git commit -m "feat(mini-app): voucher service + createOrder gửi p_voucher_code"
```

---

### Task 4: Mini-app — section "Mã giảm giá" ở checkout

**Files:**
- Create: `mini-app/src/components/checkout/voucher-section.tsx`
- Modify: `mini-app/src/pages/checkout/index.tsx` (nhúng section giữa khối "Hình thức thanh toán" và "Tóm tắt tiền"; sửa 2 chỗ hiển thị tổng; truyền `voucherCode` vào createOrder)

- [ ] **Step 1: Tạo `mini-app/src/components/checkout/voucher-section.tsx`**

```tsx
import { useEffect, useState } from "react";
import {
  voucherService,
  estimateDiscount,
  MyVoucher,
} from "@/services/voucher/voucher.api";

// Section mã giảm giá ở checkout. TỰ BỌC lỗi: voucher chết chỉ ẩn section,
// KHÔNG được chặn luồng đặt món (giống SpinSection).
// - Tự load mã của khách (get_my_vouchers theo Zalo UID), tự chọn mã giảm sâu nhất.
// - Ô nhập mã cho shipper lần đầu (checkout là bước kích hoạt — khoá UID khi tạo đơn).
export default function VoucherSection({
  storeId,
  zaloUserId,
  subtotal,
  selected,
  onSelect,
}: {
  storeId: string;
  zaloUserId: string | null;
  subtotal: number;
  selected: MyVoucher | null;
  onSelect: (v: MyVoucher | null) => void;
}) {
  const [vouchers, setVouchers] = useState<MyVoucher[]>([]);
  const [showInput, setShowInput] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [inputError, setInputError] = useState("");
  const [checking, setChecking] = useState(false);

  // Load mã của khách + tự chọn mã giảm sâu nhất (1 lần khi vào trang)
  useEffect(() => {
    if (!zaloUserId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await voucherService.getMyVouchers(storeId, zaloUserId);
        if (cancelled || list.length === 0) return;
        setVouchers(list);
        const best = [...list].sort(
          (a, b) => estimateDiscount(b, subtotal) - estimateDiscount(a, subtotal),
        )[0];
        onSelect(best);
      } catch {
        /* voucher lỗi → im lặng, không chặn đặt món */
      }
    })();
    return () => {
      cancelled = true;
    };
    // subtotal cố ý KHÔNG nằm trong deps: chỉ auto-chọn 1 lần lúc vào trang,
    // khách đổi số lượng món không làm nhảy mã đã chọn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, zaloUserId]);

  const applyCode = async () => {
    const code = codeInput.trim();
    if (!code || !zaloUserId) return;
    setChecking(true);
    setInputError("");
    try {
      const res = await voucherService.check(storeId, code, zaloUserId, subtotal);
      if (!res.valid) {
        setInputError(res.reason);
        return;
      }
      const v: MyVoucher = {
        id: `manual-${res.code}`,
        code: res.code,
        label: res.label,
        kind: "shipper",
        discount_type: res.discount_type,
        discount_value: res.discount_value,
        max_discount: res.max_discount,
        expires_at: null,
      };
      onSelect(v);
      setShowInput(false);
      setCodeInput("");
    } catch {
      setInputError("Không kiểm tra được mã, thử lại.");
    } finally {
      setChecking(false);
    }
  };

  // Không có UID → không dùng được mã (server cũng sẽ từ chối) → ẩn hẳn
  if (!zaloUserId) return null;
  if (vouchers.length === 0 && !selected && !showInput) {
    return (
      <div className="mx-3.5 mt-3 rounded-xl bg-white px-4 py-3">
        <button
          onClick={() => setShowInput(true)}
          className="text-small font-medium text-primary"
        >
          🎟️ Nhập mã giảm giá
        </button>
      </div>
    );
  }

  return (
    <div className="mx-3.5 mt-3 rounded-xl bg-white px-4 py-4">
      <p className="mb-3 text-large-m font-semibold">Mã giảm giá</p>

      {selected && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-primary bg-primary/5 p-3">
          <span className="text-2xl">🎟️</span>
          <div className="flex-1">
            <p className="text-small-m font-semibold text-text-primary">{selected.label}</p>
            <p className="text-xxsmall text-text-secondary">
              Giảm {estimateDiscount(selected, subtotal).toLocaleString("vi-VN")}đ
              {selected.expires_at &&
                ` • HSD ${new Date(selected.expires_at).toLocaleDateString("vi-VN")}`}
            </p>
          </div>
          <button
            onClick={() => onSelect(null)}
            className="rounded-lg px-2 py-1 text-small text-text-secondary"
          >
            ✕
          </button>
        </div>
      )}

      {!selected &&
        vouchers.map((v) => (
          <button
            key={v.id}
            onClick={() => onSelect(v)}
            className="mb-2 flex w-full items-center gap-3 rounded-xl border-2 border-neutral100 p-3 text-left"
          >
            <span className="text-2xl">🎟️</span>
            <div className="flex-1">
              <p className="text-small-m font-semibold text-text-primary">{v.label}</p>
              <p className="text-xxsmall text-text-secondary">
                Giảm {estimateDiscount(v, subtotal).toLocaleString("vi-VN")}đ
              </p>
            </div>
          </button>
        ))}

      {showInput ? (
        <div className="mt-2">
          <div className="flex gap-2">
            <input
              value={codeInput}
              onChange={(e) => {
                setCodeInput(e.target.value.toUpperCase());
                setInputError("");
              }}
              placeholder="Nhập mã (VD SHIP-X7K2M9)"
              className="flex-1 rounded-xl border border-neutral100 px-3 py-2.5 text-sm uppercase outline-none focus:border-primary"
            />
            <button
              onClick={() => void applyCode()}
              disabled={checking || !codeInput.trim()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {checking ? "..." : "Áp dụng"}
            </button>
          </div>
          {inputError && <p className="mt-1 text-xs text-red-500">{inputError}</p>}
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="mt-2 text-xxsmall font-medium text-primary"
        >
          + Nhập mã khác
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Nhúng vào `mini-app/src/pages/checkout/index.tsx`**

(a) Thêm import đầu file:

```tsx
import VoucherSection from "@/components/checkout/voucher-section";
import { estimateDiscount, MyVoucher } from "@/services/voucher/voucher.api";
```

(b) Thêm state cạnh các state khác trong `CheckoutPage`:

```tsx
  const [voucher, setVoucher] = useState<MyVoucher | null>(null);
```

(c) Sau dòng `const totalAmount = calculateCartTotal(cartItems);` thêm:

```tsx
  const discount = voucher ? estimateDiscount(voucher, totalAmount) : 0;
  const payableAmount = totalAmount - discount;
```

(d) Trong lời gọi `createOrder(...)`, thêm vào object request (cạnh `zaloUserId`):

```tsx
        voucherCode: voucher?.code,
```

(e) Trong `onError` của `createOrder`, thêm bỏ chọn mã để khách đặt lại không kẹt (trước `openSnackbar`):

```tsx
          setVoucher(null);
```

(f) Nhúng section — đặt NGAY TRƯỚC khối `{/* Tóm tắt tiền */}`:

```tsx
        {/* Mã giảm giá */}
        <VoucherSection
          storeId={storeId ?? ""}
          zaloUserId={zaloUserId || null}
          subtotal={totalAmount}
          selected={voucher}
          onSelect={setVoucher}
        />
```

(g) Sửa khối `{/* Tóm tắt tiền */}` thành:

```tsx
        {/* Tóm tắt tiền */}
        <div className="mx-3.5 mt-3 rounded-xl bg-white px-4 py-4">
          <div className="flex justify-between">
            <span className="text-small text-text-secondary">Tổng tiền món</span>
            <span className="text-small font-semibold">{formatCurrency(totalAmount)}đ</span>
          </div>
          {discount > 0 && (
            <div className="mt-1.5 flex justify-between">
              <span className="text-small text-text-secondary">Giảm giá</span>
              <span className="text-small font-semibold text-green-600">
                −{formatCurrency(discount)}đ
              </span>
            </div>
          )}
        </div>
```

(h) Footer "Tổng cộng" (nút đặt món): đổi `{formatCurrency(totalAmount)}đ` thành `{formatCurrency(payableAmount)}đ`.

- [ ] **Step 3: Typecheck**

```powershell
Set-Location mini-app; npx tsc --noEmit
```

Expected: không lỗi mới trong các file vừa sửa.

- [ ] **Step 4: Commit**

```powershell
Set-Location D:\Code\mevo
git add mini-app/src/components/checkout/voucher-section.tsx mini-app/src/pages/checkout/index.tsx
git commit -m "feat(mini-app): section mã giảm giá ở checkout — tự áp mã theo Zalo UID + nhập mã shipper"
```

---

### Task 5: Mini-app — vòng quay hiển thị kết quả trúng voucher

**Files:**
- Modify: `mini-app/src/services/spin/spin.api.ts:4-13` (types)
- Modify: `mini-app/src/components/spin/spin-section.tsx:96-124` (result block)

- [ ] **Step 1: Sửa types trong `spin.api.ts`**

```ts
export type SpinReward = { id: string; label: string; type: "gift" | "none" | "voucher" };

export type SpinResult = {
  result_id: string;
  reward_id: string | null;
  label: string;
  type: "gift" | "none" | "voucher";
  code: string;
  redeem_status: "won" | "redeemed";
  voucher: { code: string; label: string; expires_at: string | null } | null;
};
```

- [ ] **Step 2: Sửa result block trong `spin-section.tsx`**

Thay block `{phase === "result" && result && (...)}` hiện tại (dòng 96–124) bằng:

```tsx
      {phase === "result" && result && (
        <div className="mt-4 rounded-xl border border-[#E8C9B3] bg-[#FBF4EF] p-4 text-center">
          {isNone ? (
            <p className="text-small font-semibold text-text-primary">
              Chúc bạn may mắn lần sau 🍀
            </p>
          ) : result.type === "voucher" ? (
            <>
              <p className="text-small text-text-secondary">🎉 Bạn trúng</p>
              <p className="mt-0.5 text-medium-m font-bold text-primary">
                {result.label}
              </p>
              <p className="mt-2 text-xxsmall text-text-secondary">
                Mã tự động áp dụng cho lần đặt món sau
                {result.voucher?.expires_at &&
                  ` • HSD ${new Date(result.voucher.expires_at).toLocaleDateString("vi-VN")}`}
              </p>
              <div className="mt-2 inline-block rounded-lg bg-white px-3 py-1.5">
                <span className="text-small font-bold tracking-widest text-text-primary">
                  {result.voucher?.code ?? result.code}
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="text-small text-text-secondary">🎉 Bạn trúng</p>
              <p className="mt-0.5 text-medium-m font-bold text-primary">
                {result.label}
              </p>
              <p className="mt-2 text-xxsmall text-text-secondary">
                Nhân viên sẽ mang ra cho bạn — hoặc đưa màn hình này để đổi
              </p>
              <div className="mt-2 inline-block rounded-lg bg-white px-3 py-1.5">
                <span className="text-small font-bold tracking-widest text-text-primary">
                  {result.code}
                </span>
              </div>
              {result.redeem_status === "redeemed" && (
                <p className="mt-2 text-xxsmall font-medium text-green-600">
                  ✓ Đã đổi thưởng
                </p>
              )}
            </>
          )}
        </div>
      )}
```

- [ ] **Step 3: Typecheck + commit**

```powershell
Set-Location mini-app; npx tsc --noEmit; Set-Location D:\Code\mevo
git add mini-app/src/services/spin/spin.api.ts mini-app/src/components/spin/spin-section.tsx
git commit -m "feat(mini-app): vòng quay hiện kết quả trúng mã giảm giá (tự áp lần sau + HSD)"
```

---

### Task 6: Kitchen — card + loa TTS giải hiện vật, nút "Đã đưa"

**Files:**
- Modify: `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx`

- [ ] **Step 1: Thêm state + logic trong `KitchenDisplay`**

(a) Thêm state cạnh `callAlerts` (sau dòng 189):

```tsx
  // Giải hiện vật vòng quay chưa đưa cho khách (card + loa TTS)
  const [giftAlerts, setGiftAlerts] = useState<Array<{
    id: string; label: string; where: string; createdAt: string
  }>>([])
```

(b) Trong `init()` — sau khi `setOrders(mapped)` (khoảng dòng 326), thêm load giải gift 6h chưa đưa:

```tsx
      // Giải hiện vật 6h gần nhất chưa đưa (phòng bếp F5 mất card)
      const sixHoursAgo = new Date(Date.now() - 6 * 3600_000).toISOString()
      const { data: gifts } = await supabase!
        .from('spin_results')
        .select('id, reward_label, created_at, orders(order_type, tables(table_number))')
        .eq('store_id', storeData.id)
        .eq('reward_type', 'gift')
        .eq('status', 'won')
        .gte('created_at', sixHoursAgo)
        .order('created_at', { ascending: true })
      setGiftAlerts(
        (gifts ?? []).map((g) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const o = g.orders as any
          const where =
            o?.order_type && o.order_type !== 'dine_in'
              ? 'Đơn mang về'
              : (o?.tables?.table_number ?? 'Bàn ?')
          return { id: g.id, label: g.reward_label, where, createdAt: g.created_at }
        }),
      )
```

(c) Sau `srChannel = ...subscribe()` (khoảng dòng 443), thêm channel thứ 3 — LƯU Ý hoist biến `giftChannel` cạnh `ordersChannel`/`srChannel` (dòng 273-274) và thêm vào cleanup (dòng 449-452):

```tsx
      // Subscribe spin_results — giải hiện vật vòng quay → báo mang ra luôn
      giftChannel = supabase!
        .channel(`spin-gifts-${storeData.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'spin_results',
            filter: `store_id=eq.${storeData.id}`,
          },
          async (payload) => {
            const row = payload.new as {
              id: string; reward_type: string; reward_label: string
              order_id: string; created_at: string
            }
            if (row.reward_type !== 'gift') return // voucher/none KHÔNG báo bếp
            // Lấy bàn từ đơn (kitchen đọc được orders + tables)
            const { data: ord } = await supabase!
              .from('orders')
              .select('order_type, tables(table_number)')
              .eq('id', row.order_id)
              .single()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const o = ord as any
            const where =
              o?.order_type && o.order_type !== 'dine_in'
                ? 'Đơn mang về'
                : (o?.tables?.table_number ?? 'Bàn ?')
            setGiftAlerts((prev) => [
              ...prev,
              { id: row.id, label: row.reward_label, where, createdAt: row.created_at },
            ])
            playBell()
            if (ttsEnabledRef.current) {
              setTimeout(() => speak(`${where} trúng ${row.reward_label}`), 300)
            }
          },
        )
        .subscribe()
```

Khai báo hoisted (sửa dòng 273-274 thành):

```tsx
    let ordersChannel: ReturnType<typeof supabase.channel> | null = null
    let srChannel: ReturnType<typeof supabase.channel> | null = null
    let giftChannel: ReturnType<typeof supabase.channel> | null = null
```

Cleanup (sửa return cuối effect):

```tsx
    return () => {
      if (ordersChannel) supabase.removeChannel(ordersChannel)
      if (srChannel) supabase.removeChannel(srChannel)
      if (giftChannel) supabase.removeChannel(giftChannel)
    }
```

(d) Thêm handler "Đã đưa" (cạnh `updateStatus`):

```tsx
  // Nhân viên đã mang quà ra → gạch card (RPC redeem_spin_result cho phép role kitchen)
  const redeemGift = async (resultId: string) => {
    if (!supabase) return
    setGiftAlerts((prev) => prev.filter((g) => g.id !== resultId)) // optimistic
    const { error } = await supabase.rpc('redeem_spin_result', { p_result_id: resultId })
    if (error) alert('Không đánh dấu được, thử lại!')
  }
```

- [ ] **Step 2: Render cards — đặt NGAY SAU block `{callAlerts.length > 0 && (...)}` trong JSX**

```tsx
      {/* Giải hiện vật vòng quay — mang ra cho khách */}
      {giftAlerts.length > 0 && (
        <div className="fixed left-4 top-4 z-50 flex flex-col gap-2">
          {giftAlerts.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-3 rounded-xl bg-purple-600 px-4 py-3 text-white shadow-lg"
            >
              <span className="text-2xl">🎁</span>
              <div>
                <p className="font-bold">{g.where} trúng {g.label}</p>
                <p className="text-sm opacity-80">Mang ra cho khách</p>
              </div>
              <button
                onClick={() => void redeemGift(g.id)}
                className="ml-2 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-semibold hover:bg-white/30"
              >
                Đã đưa ✓
              </button>
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 3: Verify build + test**

```powershell
Set-Location admin-web; npm run test; npx tsc --noEmit
```

Expected: vitest PASS (3 file cũ), tsc không lỗi mới.

- [ ] **Step 4: Commit**

```powershell
Set-Location D:\Code\mevo
git add admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx
git commit -m "feat(kitchen): card + loa TTS giải hiện vật vòng quay, nút Đã đưa (realtime spin_results)"
```

---

### Task 7: Admin — lib sinh code shipper (TDD) + server actions vouchers

**Files:**
- Create: `admin-web/lib/voucher-code.ts`
- Create: `admin-web/lib/voucher-code.test.ts`
- Create: `admin-web/lib/actions/vouchers.ts`

- [ ] **Step 1: Viết test TRƯỚC — `admin-web/lib/voucher-code.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { generateShipperCode, SHIPPER_CODE_ALPHABET } from './voucher-code'

describe('generateShipperCode', () => {
  it('đúng định dạng SHIP-XXXXXX (6 ký tự alphabet an toàn)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateShipperCode()
      expect(code).toMatch(/^SHIP-[A-Z2-9]{6}$/)
      for (const ch of code.slice(5)) {
        expect(SHIPPER_CODE_ALPHABET).toContain(ch)
      }
    }
  })

  it('không chứa ký tự dễ nhầm I L O 0 1', () => {
    expect(SHIPPER_CODE_ALPHABET).not.toMatch(/[ILO01]/)
  })

  it('deterministic với rand giả', () => {
    expect(generateShipperCode(() => 0)).toBe('SHIP-AAAAAA')
  })
})
```

- [ ] **Step 2: Chạy test — phải FAIL**

```powershell
Set-Location admin-web; npx vitest run lib/voucher-code.test.ts
```

Expected: FAIL — `Cannot find module './voucher-code'`.

- [ ] **Step 3: Viết `admin-web/lib/voucher-code.ts`**

```ts
// Sinh code mã shipper khó đoán. Code CHƯA kích hoạt = bí mật trao tay cho shipper
// (spec 8.1) → bắt buộc tự sinh, không cho tự đặt code ngắn.
// Alphabet bỏ I, L, O, 0, 1 để đọc qua điện thoại không nhầm.
export const SHIPPER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateShipperCode(rand: () => number = Math.random): string {
  let s = ''
  for (let i = 0; i < 6; i++) {
    s += SHIPPER_CODE_ALPHABET[Math.floor(rand() * SHIPPER_CODE_ALPHABET.length)]
  }
  return `SHIP-${s}`
}
```

- [ ] **Step 4: Chạy lại test — PASS**

```powershell
npx vitest run lib/voucher-code.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Viết `admin-web/lib/actions/vouchers.ts`** (theo pattern `lib/actions/spin.ts`)

```ts
'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import { generateShipperCode } from '@/lib/voucher-code'

export type ActionResult = { error?: string }

export type ShipperVoucherInput = {
  label: string                       // tên shipper, VD "Shipper Tuấn Anh"
  discount_type: 'fixed' | 'percent'
  discount_value: number
  max_discount: number | null         // chỉ dùng khi percent
  daily_limit: number | null          // NULL = không giới hạn/ngày
}

// Tạo mã shipper. Code TỰ SINH khó đoán (SHIP-XXXXXX), retry nếu trùng (unique per store).
export async function createShipperVoucher(input: ShipperVoucherInput): Promise<ActionResult> {
  const storeId = await requireStoreOwnerStoreId()
  const admin = createAdminClient()

  const label = (input.label ?? '').trim()
  if (!label) return { error: 'Nhập tên shipper (để nhớ mã của ai).' }
  const value = Math.floor(Number(input.discount_value) || 0)
  if (value <= 0) return { error: 'Mức giảm phải lớn hơn 0.' }
  if (input.discount_type === 'percent' && value > 100) {
    return { error: 'Phần trăm giảm tối đa 100.' }
  }
  const dailyLimit =
    input.daily_limit == null ? null : Math.max(1, Math.floor(Number(input.daily_limit)))
  const maxDiscount =
    input.discount_type === 'percent' && input.max_discount != null
      ? Math.max(1, Math.floor(Number(input.max_discount)))
      : null

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateShipperCode()
    const { error } = await admin.from('vouchers').insert({
      store_id: storeId,
      code,
      kind: 'shipper',
      label,
      discount_type: input.discount_type,
      discount_value: value,
      max_discount: maxDiscount,
      daily_limit: dailyLimit,
    })
    if (!error) {
      revalidatePath('/admin/vouchers')
      return {}
    }
    if (error.code !== '23505') return { error: `Lỗi tạo mã: ${error.message}` } // không phải trùng code
  }
  return { error: 'Không sinh được code (trùng nhiều lần), thử lại.' }
}

// Bật/tắt mã (thu hồi = tắt — chặn ngay từ đơn sau, lịch sử giữ nguyên)
export async function setVoucherActive(id: string, active: boolean): Promise<ActionResult> {
  const storeId = await requireStoreOwnerStoreId()
  const admin = createAdminClient()
  const { error } = await admin
    .from('vouchers')
    .update({ is_active: active })
    .eq('id', id)
    .eq('store_id', storeId)
  if (error) return { error: `Lỗi cập nhật: ${error.message}` }
  revalidatePath('/admin/vouchers')
  return {}
}
```

- [ ] **Step 6: Verify + commit**

```powershell
npm run test; npx tsc --noEmit; Set-Location D:\Code\mevo
git add admin-web/lib/voucher-code.ts admin-web/lib/voucher-code.test.ts admin-web/lib/actions/vouchers.ts
git commit -m "feat(admin): lib sinh code shipper (TDD) + server actions tạo/tắt mã"
```

---

### Task 8: Admin — trang `/admin/vouchers` "Ưu đãi" + nav link

**Files:**
- Create: `admin-web/app/admin/vouchers/page.tsx`
- Create: `admin-web/app/admin/vouchers/vouchers-client.tsx`
- Modify: `admin-web/app/admin/layout.tsx:43` (thêm NavLink sau dòng Vòng quay)

- [ ] **Step 1: Tạo `admin-web/app/admin/vouchers/page.tsx`** (server component, pattern giống `spin/page.tsx`)

```tsx
import { createClient } from '@/lib/supabase/server'
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { redirect } from 'next/navigation'
import VouchersClient from './vouchers-client'

export default async function VouchersPage() {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')
  const storeId = operator.storeId

  const supabase = await createClient()
  const { data: vouchers } = await supabase
    .from('vouchers')
    .select('id, code, kind, label, discount_type, discount_value, max_discount, zalo_user_id, daily_limit, expires_at, is_active, created_at')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  // Lịch sử dùng: các đơn đã áp voucher (chưa huỷ), mới nhất trước
  const ids = (vouchers ?? []).map((v) => v.id)
  const { data: usedOrders } = ids.length
    ? await supabase
        .from('orders')
        .select('id, voucher_id, discount_amount, total_amount, status, created_at')
        .in('voucher_id', ids)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(200)
    : { data: [] }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">🎟️ Ưu đãi</h1>
        <p className="text-sm text-gray-500">
          Mã shipper (khoá theo Zalo của shipper) và mã vòng quay khách đã trúng.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <VouchersClient
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          vouchers={(vouchers as any[]) ?? []}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          usedOrders={(usedOrders as any[]) ?? []}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Tạo `admin-web/app/admin/vouchers/vouchers-client.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatVND } from '@/lib/utils'
import {
  createShipperVoucher,
  setVoucherActive,
  type ShipperVoucherInput,
} from '@/lib/actions/vouchers'

type VoucherRow = {
  id: string
  code: string
  kind: 'spin' | 'shipper'
  label: string
  discount_type: 'fixed' | 'percent'
  discount_value: number
  max_discount: number | null
  zalo_user_id: string | null
  daily_limit: number | null
  expires_at: string | null
  is_active: boolean
  created_at: string
}

type UsedOrder = {
  id: string
  voucher_id: string
  discount_amount: number
  total_amount: number
  status: string
  created_at: string
}

function discountText(v: VoucherRow): string {
  return v.discount_type === 'fixed'
    ? `Giảm ${formatVND(v.discount_value)}`
    : `Giảm ${v.discount_value}%${v.max_discount ? ` (tối đa ${formatVND(v.max_discount)})` : ''}`
}

export default function VouchersClient({
  vouchers,
  usedOrders,
}: {
  vouchers: VoucherRow[]
  usedOrders: UsedOrder[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'shipper' | 'spin'>('shipper')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Form tạo mã shipper
  const [label, setLabel] = useState('')
  const [dType, setDType] = useState<'fixed' | 'percent'>('fixed')
  const [dValue, setDValue] = useState(5000)
  const [dMax, setDMax] = useState<number | ''>('')
  const [dLimit, setDLimit] = useState<number | ''>(10)
  // Mã đang mở lịch sử dùng
  const [openHistory, setOpenHistory] = useState<string | null>(null)

  const usesByVoucher = useMemo(() => {
    const m = new Map<string, UsedOrder[]>()
    for (const o of usedOrders) {
      const arr = m.get(o.voucher_id) ?? []
      arr.push(o)
      m.set(o.voucher_id, arr)
    }
    return m
  }, [usedOrders])

  const shipperVouchers = vouchers.filter((v) => v.kind === 'shipper')
  const spinVouchers = vouchers.filter((v) => v.kind === 'spin')

  const handleCreate = async () => {
    setError('')
    setBusy(true)
    try {
      const input: ShipperVoucherInput = {
        label,
        discount_type: dType,
        discount_value: Number(dValue),
        max_discount: dType === 'percent' && dMax !== '' ? Number(dMax) : null,
        daily_limit: dLimit === '' ? null : Number(dLimit),
      }
      const res = await createShipperVoucher(input)
      if (res?.error) {
        setError(res.error)
        return
      }
      setLabel('')
      router.refresh()
    } catch {
      setError('Lỗi kết nối, thử lại.')
    } finally {
      setBusy(false)
    }
  }

  const handleToggle = async (v: VoucherRow) => {
    setBusy(true)
    try {
      const res = await setVoucherActive(v.id, !v.is_active)
      if (res?.error) setError(res.error)
      else router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const statusBadge = (v: VoucherRow) => {
    if (!v.is_active)
      return <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-500">Đã tắt</span>
    if (v.kind === 'shipper' && !v.zalo_user_id)
      return <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-xs text-yellow-600">Chưa kích hoạt</span>
    if (v.expires_at && new Date(v.expires_at) <= new Date())
      return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Hết hạn</span>
    return <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-600">
      {v.kind === 'shipper' ? 'Đã khoá máy' : 'Còn hiệu lực'}
    </span>
  }

  const renderList = (list: VoucherRow[]) => (
    <div className="flex flex-col gap-2">
      {list.length === 0 && <p className="py-6 text-center text-sm text-gray-400">Chưa có mã nào</p>}
      {list.map((v) => {
        const uses = usesByVoucher.get(v.id) ?? []
        const totalSaved = uses.reduce((s, o) => s + o.discount_amount, 0)
        return (
          <div key={v.id} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-gray-900">{v.code}</span>
              {statusBadge(v)}
              <span className="flex-1 text-sm text-gray-600">{v.label}</span>
              <span className="text-sm text-gray-500">{discountText(v)}</span>
              {v.daily_limit != null && (
                <span className="text-xs text-gray-400">tối đa {v.daily_limit} đơn/ngày</span>
              )}
              {v.kind === 'shipper' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleToggle(v)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                    v.is_active
                      ? 'border border-red-200 text-red-500 hover:bg-red-50'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  {v.is_active ? 'Thu hồi' : 'Bật lại'}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpenHistory(openHistory === v.id ? null : v.id)}
              className="mt-1 text-xs text-orange-600 hover:underline"
            >
              {uses.length} lượt dùng • đã giảm {formatVND(totalSaved)} {openHistory === v.id ? '▲' : '▼'}
            </button>
            {openHistory === v.id && uses.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                {uses.map((o) => (
                  <p key={o.id} className="text-xs text-gray-500">
                    {new Date(o.created_at).toLocaleString('vi-VN')} — đơn #
                    {o.id.slice(-6).toUpperCase()} • giảm {formatVND(o.discount_amount)} • trả{' '}
                    {formatVND(o.total_amount)}
                  </p>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="flex max-w-3xl flex-col gap-5 text-gray-900">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setTab('shipper')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === 'shipper' ? 'bg-white shadow' : 'text-gray-500'}`}
        >
          🛵 Mã shipper ({shipperVouchers.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('spin')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === 'spin' ? 'bg-white shadow' : 'text-gray-500'}`}
        >
          🎁 Mã vòng quay ({spinVouchers.length})
        </button>
      </div>

      {tab === 'shipper' && (
        <>
          {/* Form tạo mã */}
          <div className="rounded-xl border-2 border-gray-200 bg-white p-4">
            <p className="mb-3 font-semibold">Tạo mã shipper mới</p>
            <p className="mb-3 rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-700">
              Code tự sinh khó đoán — đưa TẬN TAY shipper. Lần đầu shipper nhập mã khi
              thanh toán, mã sẽ khoá vĩnh viễn vào Zalo của shipper đó.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col text-xs text-gray-500">
                Tên shipper
                <input value={label} onChange={(e) => setLabel(e.target.value)}
                  placeholder="VD: Shipper Tuấn Anh" className="input mt-1 w-44" />
              </label>
              <label className="flex flex-col text-xs text-gray-500">
                Loại giảm
                <select value={dType} onChange={(e) => setDType(e.target.value as 'fixed' | 'percent')}
                  className="input mt-1 w-28">
                  <option value="fixed">Số tiền (đ)</option>
                  <option value="percent">Phần trăm</option>
                </select>
              </label>
              <label className="flex flex-col text-xs text-gray-500">
                {dType === 'fixed' ? 'Giảm (đ)/đơn' : 'Giảm (%)'}
                <input type="number" min={1} value={dValue}
                  onChange={(e) => setDValue(Number(e.target.value))} className="input mt-1 w-24" />
              </label>
              {dType === 'percent' && (
                <label className="flex flex-col text-xs text-gray-500">
                  Giảm tối đa (đ)
                  <input type="number" min={1} value={dMax}
                    onChange={(e) => setDMax(e.target.value === '' ? '' : Number(e.target.value))}
                    className="input mt-1 w-28" />
                </label>
              )}
              <label className="flex flex-col text-xs text-gray-500">
                Tối đa đơn/ngày (bỏ trống = không giới hạn)
                <input type="number" min={1} value={dLimit}
                  onChange={(e) => setDLimit(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input mt-1 w-24" />
              </label>
              <button type="button" onClick={() => void handleCreate()} disabled={busy}
                className="rounded-xl bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                Tạo mã
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>
          {renderList(shipperVouchers)}
        </>
      )}

      {tab === 'spin' && (
        <>
          <p className="text-xs text-gray-400">
            Mã khách trúng từ vòng quay — chỉ xem. Cấu hình ô trúng ở trang Vòng quay.
          </p>
          {renderList(spinVouchers)}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Thêm nav link — `admin-web/app/admin/layout.tsx`, sau dòng `<NavLink href="/admin/spin" ...>`:**

```tsx
          <NavLink href="/admin/vouchers" icon="🎟️">Ưu đãi</NavLink>
```

- [ ] **Step 4: Verify + commit**

```powershell
Set-Location admin-web; npx tsc --noEmit; npm run test; Set-Location D:\Code\mevo
git add admin-web/app/admin/vouchers/ admin-web/app/admin/layout.tsx
git commit -m "feat(admin): trang Ưu đãi — tạo/thu hồi mã shipper, trạng thái kích hoạt, lịch sử dùng mã"
```

---

### Task 9: Admin — ô vòng quay loại "Mã giảm giá"

**Files:**
- Modify: `admin-web/lib/actions/spin.ts` (RewardInput + saveRewards)
- Modify: `admin-web/app/admin/spin/spin-client.tsx` (form ô thưởng)
- Modify: `admin-web/app/admin/spin/page.tsx:17-21` (select thêm cột mới)

- [ ] **Step 1: Sửa `admin-web/lib/actions/spin.ts`**

Thay `RewardInput`:

```ts
export type RewardInput = {
  id?: string
  label: string
  type: 'gift' | 'none' | 'voucher'
  weight: number
  is_active: boolean
  // Chỉ dùng khi type='voucher'
  discount_type?: 'fixed' | 'percent'
  discount_value?: number | null
  max_discount?: number | null
  voucher_days?: number | null
}
```

Trong `saveRewards`, thay khối `.map((r) => ({...}))` của `clean` bằng:

```ts
  const clean = rewards
    .map((r) => {
      const type = r.type === 'none' ? 'none' : r.type === 'voucher' ? 'voucher' : 'gift'
      const isVoucher = type === 'voucher'
      return {
        id: r.id,
        label: (r.label ?? '').trim(),
        type,
        weight: Math.max(1, Math.floor(Number(r.weight) || 1)),
        is_active: !!r.is_active,
        discount_type: isVoucher ? (r.discount_type === 'percent' ? 'percent' : 'fixed') : null,
        discount_value: isVoucher ? Math.max(1, Math.floor(Number(r.discount_value) || 0)) : null,
        max_discount:
          isVoucher && r.discount_type === 'percent' && r.max_discount
            ? Math.max(1, Math.floor(Number(r.max_discount)))
            : null,
        voucher_days: isVoucher ? Math.max(1, Math.floor(Number(r.voucher_days) || 30)) : null,
      }
    })
    .filter((r) => r.label.length > 0)

  // Ô voucher phải có mức giảm > 0 (spin_wheel sẽ không phát mã nếu value 0)
  const badVoucher = clean.find((r) => r.type === 'voucher' && (r.discount_value ?? 0) <= 0)
  if (badVoucher) return { error: `Ô "${badVoucher.label}": nhập mức giảm lớn hơn 0.` }
  const badPercent = clean.find(
    (r) => r.type === 'voucher' && r.discount_type === 'percent' && (r.discount_value ?? 0) > 100,
  )
  if (badPercent) return { error: `Ô "${badPercent.label}": phần trăm giảm tối đa 100.` }
```

Và khối `rows` (upsert) thêm các cột mới:

```ts
  const rows = clean.map((r, i) => ({
    ...(r.id ? { id: r.id } : {}),
    store_id: storeId,
    label: r.label,
    type: r.type,
    weight: r.weight,
    sort_order: i,
    is_active: r.is_active,
    discount_type: r.discount_type,
    discount_value: r.discount_value,
    max_discount: r.max_discount,
    voucher_days: r.voucher_days ?? 30,
  }))
```

- [ ] **Step 2: Sửa `admin-web/app/admin/spin/page.tsx`** — select thêm cột:

```ts
    .select('id, label, type, weight, is_active, sort_order, discount_type, discount_value, max_discount, voucher_days')
```

- [ ] **Step 3: Sửa `admin-web/app/admin/spin/spin-client.tsx`**

(a) `addRow` giữ nguyên (mặc định gift). Select loại (dòng 143-151) thay bằng:

```tsx
              <select
                value={r.type}
                onChange={(e) => update(r.key, { type: e.target.value as RewardInput['type'] })}
                className="input w-32"
                title="Loại"
              >
                <option value="gift">🎁 Có quà</option>
                <option value="voucher">🎟️ Mã giảm giá</option>
                <option value="none">— Trượt</option>
              </select>
```

(b) Ngay SAU thẻ `<select>` đó, thêm inputs điều kiện khi là voucher:

```tsx
              {r.type === 'voucher' && (
                <>
                  <select
                    value={r.discount_type ?? 'fixed'}
                    onChange={(e) => update(r.key, { discount_type: e.target.value as 'fixed' | 'percent' })}
                    className="input w-24"
                    title="Kiểu giảm"
                  >
                    <option value="fixed">đ</option>
                    <option value="percent">%</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={r.discount_value ?? ''}
                    onChange={(e) => update(r.key, { discount_value: Number(e.target.value) })}
                    placeholder={r.discount_type === 'percent' ? 'VD 10' : 'VD 10000'}
                    className="input w-24"
                    title="Mức giảm"
                  />
                  {r.discount_type === 'percent' && (
                    <input
                      type="number"
                      min={1}
                      value={r.max_discount ?? ''}
                      onChange={(e) => update(r.key, { max_discount: Number(e.target.value) })}
                      placeholder="Tối đa đ"
                      className="input w-24"
                      title="Giảm tối đa (đ)"
                    />
                  )}
                  <label className="flex items-center gap-1 text-xs text-gray-500">
                    HSD
                    <input
                      type="number"
                      min={1}
                      value={r.voucher_days ?? 30}
                      onChange={(e) => update(r.key, { voucher_days: Number(e.target.value) })}
                      className="input w-16"
                      title="Số ngày hạn dùng"
                    />
                    ngày
                  </label>
                </>
              )}
```

(c) Cập nhật ghi chú cuối trang (dòng 192-195) — thêm 1 câu vào `<p>`:

```
Ô &quot;Mã giảm giá&quot;: khách trúng sẽ được mã TỰ ĐỘNG áp vào lần đặt món sau.
```

- [ ] **Step 4: Verify + commit**

```powershell
Set-Location admin-web; npx tsc --noEmit; npm run test; Set-Location D:\Code\mevo
git add admin-web/lib/actions/spin.ts admin-web/app/admin/spin/spin-client.tsx admin-web/app/admin/spin/page.tsx
git commit -m "feat(admin): ô vòng quay loại Mã giảm giá (fixed/% + trần + số ngày HSD)"
```

---

### Task 10: Admin — dòng giảm giá trên trang Đơn hàng

**Files:**
- Modify: `admin-web/app/admin/orders/page.tsx`

- [ ] **Step 1: Query thêm code voucher** — sửa select đơn (dòng 42-43) thành:

```ts
    .select('*, order_items(*), tables(table_number), vouchers(code)')
```

- [ ] **Step 2: Hiện dòng giảm giá** — ngay SAU khối items `</div>` (sau dòng 125), thêm:

```tsx
              {order.discount_amount > 0 && (
                <p className="mb-3 text-sm text-green-600">
                  🎟️ Giảm giá −{formatVND(order.discount_amount)}
                  {(order.vouchers as { code: string } | null)?.code &&
                    ` (mã ${(order.vouchers as { code: string }).code})`}
                </p>
              )}
```

*(Doanh thu KHÔNG sửa — `total_amount` đã là tiền sau giảm.)*

- [ ] **Step 3: Verify + commit**

```powershell
Set-Location admin-web; npx tsc --noEmit; npm run build; Set-Location D:\Code\mevo
git add admin-web/app/admin/orders/page.tsx
git commit -m "feat(admin): hiện dòng giảm giá + mã trên trang Đơn hàng"
```

Expected: `npm run build` PASS (bắt lỗi type toàn admin-web trước khi bàn giao).

---

### Task 11: TESTING-VOUCHER.md + cập nhật CLAUDE.md + bàn giao

**Files:**
- Create: `TESTING-VOUCHER.md`
- Modify: `CLAUDE.md` (thêm dòng Lịch sử quyết định)

- [ ] **Step 1: Tạo `TESTING-VOUCHER.md`**

```markdown
# TESTING — Hệ mã giảm giá (spec 2026-07-11)

> Test trên mini-app Pubu (zmp deploy Dev) + admin prod. ƯU TIÊN TEST 1 TRƯỚC —
> nếu fail thì dừng, báo Claude sửa phương án (item giá âm) rồi mới test tiếp.

## Test 1 — ⚠️ RỦI RO #1: thanh toán với số tiền ĐÃ GIẢM
1. Admin → Vòng quay: thêm ô "Giảm 10.000đ" loại Mã giảm giá, tỉ lệ cao. Bật vòng quay.
2. Đặt 1 đơn thật, thanh toán (chuyển khoản), quay trúng mã.
3. Đặt đơn thứ 2 (> 11.000đ): checkout hiện "Mã giảm giá" tự chọn, Tổng cộng đã trừ 10k.
4. Bấm thanh toán → **Zalo Checkout mở BÌNH THƯỜNG với số tiền đã giảm** (không lỗi
   khớp tổng item). Chuyển khoản xong → đơn confirmed, số tiền nhận = số đã giảm.
- [ ] PASS / FAIL: ................

## Test 2 — Giải hiện vật báo bếp
1. Thêm ô "Tặng 1 trà đá" (Có quà) tỉ lệ cao. Mở màn bếp, bật 🔊 Đọc đơn.
2. Khách quay trúng trà đá → màn bếp hiện card tím "🎁 Bàn X trúng Tặng 1 trà đá"
   + chuông + loa đọc "Bàn X trúng Tặng 1 trà đá".
3. Bấm "Đã đưa ✓" → card biến mất; màn khách hiện "✓ Đã đổi thưởng"; F5 bếp không hiện lại.
- [ ] PASS / FAIL: ................

## Test 3 — Mã vòng quay: đúng người, 1 lần, hết nhả
1. Máy A trúng mã → máy A checkout thấy mã tự áp; máy B (Zalo khác) KHÔNG thấy,
   nhập tay code → "Mã này thuộc về tài khoản Zalo khác".
2. Máy A dùng mã thanh toán thành công → đặt đơn nữa: mã KHÔNG còn.
3. Máy A áp mã, bấm thanh toán rồi THOÁT ngang (không trả) → chờ 31 phút (hoặc Claude
   sửa created_at lùi 31' bằng SQL) → mã dùng lại được.
- [ ] PASS / FAIL: ................

## Test 4 — Mã shipper: kích hoạt + khoá UID + giới hạn ngày
1. Admin → Ưu đãi: tạo mã "Shipper Test", giảm 5.000đ, tối đa 2 đơn/ngày.
   Trạng thái "Chưa kích hoạt".
2. Máy A nhập mã, đặt đơn thành công → admin thấy "Đã khoá máy"; máy B nhập mã
   → "Mã này thuộc về tài khoản Zalo khác".
3. Máy A dùng đơn thứ 2 OK; đơn thứ 3 trong ngày → "Mã đã hết lượt hôm nay".
4. Admin bấm "Thu hồi" → máy A đặt đơn mới không áp được mã ("Mã đã bị tắt").
5. Admin xem lịch sử: đủ các đơn, đúng số tiền giảm.
- [ ] PASS / FAIL: ................

## Test 5 — Không phá luồng cũ
1. Quán tắt vòng quay + không có mã: checkout chỉ hiện nút "Nhập mã giảm giá",
   đặt món tiền mặt/chuyển khoản như cũ.
2. Đơn không mã: bếp, doanh thu, Đơn hàng admin hiển thị như trước.
- [ ] PASS / FAIL: ................
```

- [ ] **Step 2: Thêm dòng vào bảng "Lịch sử quyết định" trong `CLAUDE.md`** (cuối bảng):

```markdown
| 2026-07-11 | **Hệ mã giảm giá** (mig 027): bảng `vouchers` chung (spin/shipper), trừ tiền TRONG `create_order` v5 (`orders.total_amount` = tiền SAU giảm → MAC/doanh thu tự đúng); quyền dùng mã = `zalo_user_id` (code chỉ là nhãn); mã shipper khoá UID lần dùng đầu tại checkout, code tự sinh `SHIP-XXXXXX`, giới hạn N đơn/ngày, quản lý ở `/admin/vouchers`; giải hiện vật báo bếp realtime + TTS. Spec: `docs/superpowers/specs/2026-07-11-voucher-discount-system-design.md` | Vòng quay trúng mã phải tự áp lần sau; ưu đãi shipper 5k/đơn không cho khách thường dùng ké; ⚠️ RỦI RO #1 (Zalo có bắt sum(item)=amount?) phải test đầu tiên |
```

- [ ] **Step 3: Commit + DỪNG bàn giao test**

```powershell
git add TESTING-VOUCHER.md CLAUDE.md
git commit -m "docs: checklist test hệ mã giảm giá + ghi quyết định vào CLAUDE.md"
```

Sau đó nói với anh Tú:

> "Xong rồi anh, test theo TESTING-VOUCHER.md — ƯU TIÊN Test 1 (rủi ro thanh toán số tiền đã giảm) trước nhé. Cần `zmp deploy` mini-app (nhắc: chọn **Development** để tự test / **Testing** để release — Zalo giới hạn deploy/tháng) + admin tự deploy khi push. Chờ anh báo PASS em mới merge main."

**KHÔNG tự merge main / không tự zmp deploy** — chờ anh Tú xác nhận PASS (quy tắc CLAUDE.md).

---

## Ghi chú cho executor

1. **Thứ tự bắt buộc**: Task 1→2 (DB) trước mọi task client — client gọi RPC mới.
2. **Migration đã áp prod ngay Task 2** nhưng vô hại với client cũ: `create_order` bản mới nhận được lời gọi cũ (param mới có DEFAULT), ô voucher chưa ai cấu hình, bảng mới chưa ai đụng. Đây là tính "cắm thêm" của spec.
3. **Đừng đụng** `checkout-create-mac` / `checkout-notify` — không cần sửa: amount đọc từ `orders.total_amount` đã là số sau giảm.
4. **Rủi ro #1** (Zalo bắt `sum(item) = amount`?) chỉ kiểm chứng được bằng đơn thật ở Test 1. Nếu FAIL: sửa `checkout-create-mac` thêm item `{name: 'Giảm giá', quantity: 1, price: -discount_amount}` khi `discount_amount > 0` (đọc thêm cột này trong query orders) — MAC tự đúng vì ký trên body có item mới.
5. Mini-app không có test runner — verify bằng `npx tsc --noEmit`; admin-web có vitest + `npm run build`.
