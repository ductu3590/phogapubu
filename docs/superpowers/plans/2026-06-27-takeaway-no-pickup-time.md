# Takeaway: Bỏ hẹn giờ + Kitchen nổi bật + Lưu form — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bỏ tính năng hẹn giờ qua lấy trong mode Mang về, làm đơn mang về nổi bật trên kitchen display, và lưu form mang về vào localStorage để khách không phải nhập lại.

**Architecture:** Mode takeaway đã build sẵn (pickup + delivery). Plan này (a) sửa DB bỏ ràng buộc `pickup_time` + recreate RPC `create_order` không còn param giờ, (b) gỡ UI chọn giờ ở mini-app, (c) lưu form vào localStorage, (d) đổi badge/banner kitchen, (e) ZNS message theo loại đơn. Không thay đổi phá vỡ dữ liệu — cột `pickup_time` giữ lại nullable.

**Tech Stack:** Supabase PostgreSQL (plpgsql RPC), Deno edge function, React 18 + TypeScript + Zustand (mini-app), Next.js (admin-web).

**Spec:** `docs/superpowers/specs/2026-06-27-takeaway-no-pickup-time-design.md`

**Lưu ý verification:** Repo không có unit-test cho page/SQL. Verification = `npx tsc --noEmit` + smoke test thủ công, đúng theo plan takeaway gốc.

---

## File Map

| File | Trách nhiệm |
|---|---|
| `supabase/migrations/012_takeaway_no_pickup_time.sql` | CREATE — drop/relax constraints + recreate `create_order` 10-param |
| `supabase/functions/zns-notify/index.ts` | MODIFY — message theo `order_type` |
| `mini-app/src/types/order.types.ts` | MODIFY — bỏ `pickupTime` khỏi `CreateOrderRequest` |
| `mini-app/src/services/order/order.api.ts` | MODIFY — bỏ `p_pickup_time` khi gọi RPC |
| `mini-app/src/pages/checkout/index.tsx` | MODIFY — bỏ chọn giờ, pickup chỉ tên, phone chỉ delivery, lưu form localStorage |
| `mini-app/src/pages/order-status/index.tsx` | MODIFY — pickup card bỏ giờ, theo status |
| `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx` | MODIFY — banner + viền nổi bật, badge bỏ giờ |

---

## Task 1: DB Migration 012 — bỏ pickup_time

**Files:**
- Create: `supabase/migrations/012_takeaway_no_pickup_time.sql`

- [ ] **Step 1: Tạo file migration**

```sql
-- 012 — Takeaway: bỏ hẹn giờ qua lấy
-- - Bỏ ràng buộc bắt buộc pickup_time
-- - Pickup chỉ cần customer_name; delivery cần name + phone + address
-- - Recreate create_order: bỏ param p_pickup_time
-- - GIỮ cột pickup_time (nullable, ngừng ghi) — non-destructive

-- ─── 1. Bỏ ràng buộc bắt buộc giờ pickup ────────────────────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_pickup_time_required;

-- ─── 2. Nới ràng buộc thông tin khách ───────────────────────────────────────
-- takeaway cần name; phone chỉ bắt buộc khi delivery
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_customer_info_required;
ALTER TABLE orders ADD CONSTRAINT chk_customer_info_required
  CHECK (
    order_type = 'dine_in'
    OR (
      customer_name IS NOT NULL
      AND (order_type <> 'delivery' OR customer_phone IS NOT NULL)
    )
  );

-- ─── 3. Xoá RPC 11-param cũ ─────────────────────────────────────────────────
REVOKE ALL ON FUNCTION create_order(uuid, uuid, jsonb, text, text, text, text, text, text, timestamptz, text) FROM public;
DROP FUNCTION IF EXISTS create_order(uuid, uuid, jsonb, text, text, text, text, text, text, timestamptz, text);

-- ─── 4. Tạo lại RPC 10-param (không còn p_pickup_time) ──────────────────────
CREATE OR REPLACE FUNCTION create_order(
  p_store_id         uuid,
  p_table_id         uuid  DEFAULT NULL,
  p_items            jsonb DEFAULT NULL,
  p_payment_method   text  DEFAULT 'zalopay',
  p_zalo_user_id     text  DEFAULT NULL,
  p_note             text  DEFAULT NULL,
  p_order_type       text  DEFAULT 'dine_in',
  p_customer_name    text  DEFAULT NULL,
  p_customer_phone   text  DEFAULT NULL,
  p_delivery_address text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_total int := 0;
  v_token text := gen_random_uuid()::text;
  v_item  jsonb;
  v_menu  menu_items%ROWTYPE;
  v_qty   int;
BEGIN
  IF p_payment_method NOT IN ('zalopay','cash') THEN
    RAISE EXCEPTION 'payment_method không hợp lệ: %', p_payment_method;
  END IF;

  IF p_order_type NOT IN ('dine_in','pickup','delivery') THEN
    RAISE EXCEPTION 'order_type không hợp lệ: %', p_order_type;
  END IF;

  -- Dine-in: bàn phải thuộc đúng quán
  IF p_order_type = 'dine_in' THEN
    IF p_table_id IS NULL THEN
      RAISE EXCEPTION 'Đơn tại bàn cần có table_id';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM tables
      WHERE id = p_table_id AND store_id = p_store_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động';
    END IF;
  END IF;

  -- Takeaway: cần thông tin khách + chỉ ZaloPay
  IF p_order_type IN ('pickup','delivery') THEN
    IF p_customer_name IS NULL THEN
      RAISE EXCEPTION 'Đơn mang về cần tên khách hàng';
    END IF;
    IF p_order_type = 'delivery' THEN
      IF p_customer_phone IS NULL THEN
        RAISE EXCEPTION 'Đơn ship cần số điện thoại';
      END IF;
      IF p_delivery_address IS NULL THEN
        RAISE EXCEPTION 'Đơn ship cần địa chỉ giao hàng';
      END IF;
    END IF;
    IF p_payment_method <> 'zalopay' THEN
      RAISE EXCEPTION 'Đơn mang về chỉ chấp nhận ZaloPay';
    END IF;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Đơn không có món nào';
  END IF;

  INSERT INTO orders (
    store_id, table_id, total_amount, zalo_user_id, note,
    payment_method, status, capability_token,
    order_type, customer_name, customer_phone, delivery_address
  ) VALUES (
    p_store_id, p_table_id, 0, p_zalo_user_id, p_note,
    p_payment_method, 'pending', v_token,
    p_order_type, p_customer_name, p_customer_phone, p_delivery_address
  )
  RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Số lượng không hợp lệ';
    END IF;

    SELECT * INTO v_menu FROM menu_items
    WHERE id = (v_item->>'menu_item_id')::uuid
      AND store_id = p_store_id
      AND is_available = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Món không thuộc quán hoặc ngừng bán: %', v_item->>'menu_item_id';
    END IF;

    INSERT INTO order_items (order_id, menu_item_id, item_name, item_price, quantity, note)
    VALUES (v_order.id, v_menu.id, v_menu.name, v_menu.price, v_qty, v_item->>'note');

    v_total := v_total + v_menu.price * v_qty;
  END LOOP;

  UPDATE orders SET total_amount = v_total WHERE id = v_order.id RETURNING * INTO v_order;

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION create_order(uuid, uuid, jsonb, text, text, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION create_order(uuid, uuid, jsonb, text, text, text, text, text, text, text) TO anon;
```

- [ ] **Step 2: Apply migration (Supabase Dashboard → SQL Editor → Run)**

Verify ràng buộc đã bỏ:
```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'orders'::regclass AND conname LIKE 'chk_%';
```
Expected: `chk_pickup_time_required` KHÔNG còn; `chk_customer_info_required` và `chk_delivery_address_required` còn.

Verify RPC mới (10 param, không có timestamptz):
```sql
SELECT oid::regprocedure FROM pg_proc WHERE proname = 'create_order';
```
Expected: 1 dòng, signature kết thúc `..., text)` — không còn `timestamptz`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/012_takeaway_no_pickup_time.sql
git commit -m "feat(db): migration 012 — bỏ pickup_time, recreate create_order 10-param"
```

---

## Task 2: ZNS message theo loại đơn

**Files:**
- Modify: `supabase/functions/zns-notify/index.ts`

- [ ] **Step 1: Thêm `order_type, customer_name` vào select**

Tìm dòng `.select('id, zalo_user_id, total_amount, note, tables(table_number), stores(name, zalo_oa_id)')` và thay bằng:

```typescript
      .select('id, zalo_user_id, total_amount, note, order_type, customer_name, tables(table_number), stores(name, zalo_oa_id)')
```

- [ ] **Step 2: Tách message theo `order_type`**

Tìm khối `const messagePayload = { ... }` (đoạn `🍜 Món của bạn đã xong!...`) và thay toàn bộ bằng:

```typescript
    const orderType = (order.order_type as string) ?? 'dine_in'
    const storeName = store?.name || 'MEVO'

    let messageText: string
    if (orderType === 'pickup') {
      messageText = `🍜 Món của bạn đã chuẩn bị xong!\n${storeName}\nĐơn #${orderShortId}\n\nMời bạn qua quán lấy đồ. Cảm ơn bạn!`
    } else if (orderType === 'delivery') {
      messageText = `🍜 Đơn của bạn đã chuẩn bị xong!\n${storeName}\nĐơn #${orderShortId}\n\nShipper sẽ sớm giao đến cho bạn. Cảm ơn bạn!`
    } else {
      messageText = `🍜 Món của bạn đã xong!\n${storeName} — ${table?.table_number || 'Bàn'}\nĐơn #${orderShortId}\n\nNhân viên đang mang ra cho bạn. Cảm ơn bạn đã chờ!`
    }

    const messagePayload = {
      recipient: { user_id: zaloUserId },
      message: { text: messageText },
    }
```

- [ ] **Step 3: Verify lint (TypeScript/Deno cú pháp cơ bản)**

Đoạn này không có tsc riêng cho edge function. Đọc lại file đảm bảo `order.order_type` và `order.customer_name` được select, biến `orderShortId`, `table`, `store` đã khai báo phía trên (chúng có sẵn). `customer_name` select để dùng tương lai — không bắt buộc dùng trong message.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/zns-notify/index.ts
git commit -m "feat(zns): message theo order_type — pickup/delivery/dine_in"
```

Deploy (anh Tú chạy thủ công khi sẵn sàng): `supabase functions deploy zns-notify`

---

## Task 3: Mini-app types + API — bỏ pickupTime

**Files:**
- Modify: `mini-app/src/types/order.types.ts`
- Modify: `mini-app/src/services/order/order.api.ts`

- [ ] **Step 1: Bỏ `pickupTime` khỏi `CreateOrderRequest`**

Trong `mini-app/src/types/order.types.ts`, tìm trong interface `CreateOrderRequest` dòng:

```typescript
  pickupTime?: string;   // ISO 8601 timestamptz string
```
Xoá hẳn dòng này. (Giữ nguyên `Order.pickupTime` — DB còn cột, luôn null, không code nào đọc.)

- [ ] **Step 2: Bỏ `p_pickup_time` trong lời gọi RPC**

Trong `mini-app/src/services/order/order.api.ts`, tìm trong `createOrder` dòng:

```typescript
      p_pickup_time: req.pickupTime ?? null,
```
Xoá hẳn dòng này. Các param khác (`p_customer_name`, `p_customer_phone`, `p_delivery_address`, `p_order_type`) giữ nguyên.

- [ ] **Step 3: Verify TypeScript**

```bash
cd mini-app && npx tsc --noEmit
```
Expected: không có lỗi MỚI. (Lưu ý: checkout vẫn tham chiếu `pickupTime` cho tới Task 4 — nếu Task 4 chưa làm, sẽ có lỗi ở checkout. Chạy Task 3 + Task 4 liền nhau, hoặc bỏ qua lỗi checkout tại bước này và verify lại cuối Task 4.)

- [ ] **Step 4: Commit**

```bash
git add mini-app/src/types/order.types.ts mini-app/src/services/order/order.api.ts
git commit -m "feat(api): bỏ pickupTime khỏi CreateOrderRequest + lời gọi RPC"
```

---

## Task 4: Checkout — bỏ chọn giờ + lưu form localStorage

**Files:**
- Modify: `mini-app/src/pages/checkout/index.tsx`

- [ ] **Step 1: Thêm `useRef` vào import dòng 1**

Đổi:
```typescript
import { useState, useEffect } from "react";
```
thành:
```typescript
import { useState, useEffect, useRef } from "react";
```

- [ ] **Step 2: Xoá 2 hàm `generatePickupSlots` + `slotToTimestamp`, thêm helper lưu form**

Xoá nguyên 2 hàm (hiện ở dòng ~20-43):
```typescript
function generatePickupSlots(): string[] { ... }
function slotToTimestamp(slot: string): string { ... }
```

Ngay sau `function isPhoneValid(...) { ... }` (giữ lại hàm này), thêm:

```typescript
const TAKEAWAY_FORM_KEY = "mevo_takeaway_form";

interface TakeawayFormData {
  takeawayType: "pickup" | "delivery";
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
}

function loadTakeawayForm(): TakeawayFormData {
  const empty: TakeawayFormData = {
    takeawayType: "pickup",
    customerName: "",
    customerPhone: "",
    deliveryAddress: "",
  };
  try {
    const raw = localStorage.getItem(TAKEAWAY_FORM_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<TakeawayFormData>;
    return {
      takeawayType: parsed.takeawayType === "delivery" ? "delivery" : "pickup",
      customerName: parsed.customerName ?? "",
      customerPhone: parsed.customerPhone ?? "",
      deliveryAddress: parsed.deliveryAddress ?? "",
    };
  } catch {
    return empty;
  }
}
```

- [ ] **Step 3: Hydrate state từ localStorage + bỏ state `pickupTime`**

Tìm khối state takeaway (dòng ~56-63):
```typescript
  const [takeawayType, setTakeawayType] = useState<"pickup" | "delivery">("pickup");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [pickupTime, setPickupTime] = useState(() => generatePickupSlots()[0] ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [addressError, setAddressError] = useState("");
```
Thay bằng (bỏ `pickupTime`, hydrate từ localStorage):
```typescript
  const initialForm = useRef(loadTakeawayForm()).current;
  const [takeawayType, setTakeawayType] = useState<"pickup" | "delivery">(initialForm.takeawayType);
  const [customerName, setCustomerName] = useState(initialForm.customerName);
  const [customerPhone, setCustomerPhone] = useState(initialForm.customerPhone);
  const [deliveryAddress, setDeliveryAddress] = useState(initialForm.deliveryAddress);
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [addressError, setAddressError] = useState("");
```

- [ ] **Step 4: Bỏ biến `pickupSlots`, thêm effect lưu form**

Tìm dòng (~69):
```typescript
  const pickupSlots = generatePickupSlots();
```
Xoá dòng này. Ngay sau khối `useEffect` đồng bộ payment method (kết thúc ở `}, [paymentMethods, paymentMethod]);` dòng ~77), thêm:

```typescript
  // Lưu form mang về để khách không phải nhập lại khi thanh toán lại
  useEffect(() => {
    if (!isTakeaway) return;
    const data: TakeawayFormData = { takeawayType, customerName, customerPhone, deliveryAddress };
    try {
      localStorage.setItem(TAKEAWAY_FORM_KEY, JSON.stringify(data));
    } catch {
      /* localStorage đầy hoặc bị chặn — bỏ qua */
    }
  }, [isTakeaway, takeawayType, customerName, customerPhone, deliveryAddress]);
```

- [ ] **Step 5: Sửa `isTakeawayFormValid` (pickup chỉ cần tên)**

Tìm (dòng ~78-82):
```typescript
  const isTakeawayFormValid =
    !isTakeaway ||
    (customerName.trim() !== "" &&
      isPhoneValid(customerPhone) &&
      (takeawayType === "pickup" ? pickupTime !== "" : deliveryAddress.trim() !== ""));
```
Thay bằng:
```typescript
  const isTakeawayFormValid =
    !isTakeaway ||
    (takeawayType === "pickup"
      ? customerName.trim() !== ""
      : customerName.trim() !== "" &&
        isPhoneValid(customerPhone) &&
        deliveryAddress.trim() !== "");
```

- [ ] **Step 6: Sửa validate trong `handleOrder`**

Tìm (dòng ~97-102):
```typescript
    if (isTakeaway && !isTakeawayFormValid) {
      if (!customerName.trim()) setNameError("Vui lòng nhập tên");
      if (!isPhoneValid(customerPhone)) setPhoneError("Số điện thoại không hợp lệ (10 số, bắt đầu 0)");
      if (takeawayType === "delivery" && !deliveryAddress.trim()) setAddressError("Vui lòng nhập địa chỉ");
      return;
    }
```
Thay bằng:
```typescript
    if (isTakeaway && !isTakeawayFormValid) {
      if (!customerName.trim()) setNameError("Vui lòng nhập tên");
      if (takeawayType === "delivery") {
        if (!isPhoneValid(customerPhone)) setPhoneError("Số điện thoại không hợp lệ (10 số, bắt đầu 0)");
        if (!deliveryAddress.trim()) setAddressError("Vui lòng nhập địa chỉ");
      }
      return;
    }
```

- [ ] **Step 7: Sửa payload takeaway (bỏ pickupTime, phone/address chỉ delivery)**

Tìm (dòng ~124-130):
```typescript
        ...(isTakeaway && {
          orderType: takeawayType,
          customerName: customerName.trim(),
          customerPhone: customerPhone.replace(/\s/g, ""),
          ...(takeawayType === "pickup" && { pickupTime: slotToTimestamp(pickupTime) }),
          ...(takeawayType === "delivery" && { deliveryAddress: deliveryAddress.trim() }),
        }),
```
Thay bằng:
```typescript
        ...(isTakeaway && {
          orderType: takeawayType,
          customerName: customerName.trim(),
          ...(takeawayType === "delivery" && {
            customerPhone: customerPhone.replace(/\s/g, ""),
            deliveryAddress: deliveryAddress.trim(),
          }),
        }),
```

- [ ] **Step 8: JSX — SĐT chỉ hiện khi delivery + xoá khối "Giờ lấy"**

(a) Tìm khối SĐT (dòng ~277-291):
```tsx
            {/* SĐT */}
            <div className="mb-3">
              <label className="mb-1 block text-xs text-text-secondary">Số điện thoại *</label>
              <input
                value={customerPhone}
                onChange={(e) => { setCustomerPhone(e.target.value); setPhoneError(""); }}
                onBlur={() => { if (!isPhoneValid(customerPhone)) setPhoneError("Số điện thoại không hợp lệ"); }}
                placeholder="0901 234 567"
                inputMode="tel"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${
                  phoneError ? "border-red-400" : "border-neutral100 focus:border-primary"
                }`}
              />
              {phoneError && <p className="mt-1 text-xs text-red-500">{phoneError}</p>}
            </div>
```
Bọc nó trong điều kiện delivery:
```tsx
            {/* SĐT — chỉ ship tận nhà */}
            {takeawayType === "delivery" && (
              <div className="mb-3">
                <label className="mb-1 block text-xs text-text-secondary">Số điện thoại *</label>
                <input
                  value={customerPhone}
                  onChange={(e) => { setCustomerPhone(e.target.value); setPhoneError(""); }}
                  onBlur={() => { if (!isPhoneValid(customerPhone)) setPhoneError("Số điện thoại không hợp lệ"); }}
                  placeholder="0901 234 567"
                  inputMode="tel"
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${
                    phoneError ? "border-red-400" : "border-neutral100 focus:border-primary"
                  }`}
                />
                {phoneError && <p className="mt-1 text-xs text-red-500">{phoneError}</p>}
              </div>
            )}
```

(b) Xoá nguyên khối "Giờ lấy" (dòng ~293-310):
```tsx
            {/* Giờ lấy */}
            {takeawayType === "pickup" && (
              <div className="mb-3">
                <label className="mb-1 block text-xs text-text-secondary">Giờ qua lấy *</label>
                <select ...>
                  ...
                </select>
              </div>
            )}
```
Xoá hẳn khối này (từ comment `{/* Giờ lấy */}` đến hết `)}` tương ứng).

- [ ] **Step 9: Verify TypeScript**

```bash
cd mini-app && npx tsc --noEmit
```
Expected: không còn lỗi liên quan `pickupTime`, `generatePickupSlots`, `slotToTimestamp`, `pickupSlots`.

- [ ] **Step 10: Commit**

```bash
git add mini-app/src/pages/checkout/index.tsx
git commit -m "feat(checkout): bỏ chọn giờ, pickup chỉ tên, lưu form localStorage"
```

---

## Task 5: Order-status — pickup card bỏ giờ, theo status

**Files:**
- Modify: `mini-app/src/pages/order-status/index.tsx`

- [ ] **Step 1: Import `useAppStore`**

Sau dòng `import { cn } from "@/utils/cn";` (dòng 8), thêm:
```typescript
import { useAppStore } from "@/stores/app.store";
```

- [ ] **Step 2: Viết lại `TakeawayInfoCard`**

Thay nguyên hàm `TakeawayInfoCard` (dòng ~54-85) bằng:

```tsx
function TakeawayInfoCard({ order }: { order: Order }) {
  const { storeName, storeAddress } = useAppStore();
  if (order.orderType === "dine_in") return null;

  if (order.orderType === "pickup") {
    const ready = order.status === "ready";
    return (
      <div className="mx-4 mt-4 rounded-xl border border-[#E8C9B3] bg-[#FBF4EF] p-4">
        <p className="mb-1 text-xs text-text-secondary">🚶 Tự qua lấy</p>
        <p className="text-base font-semibold text-primary">{storeName || "Quán"}</p>
        {storeAddress && (
          <p className="mt-0.5 text-xs text-text-secondary">📍 {storeAddress}</p>
        )}
        <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-text-secondary">
          {ready
            ? "🎉 Món xong rồi! Mời bạn qua quán lấy đồ."
            : "Bếp chuẩn bị theo thứ tự — bạn sẽ nhận thông báo Zalo khi món xong."}
        </p>
      </div>
    );
  }

  if (order.orderType === "delivery" && order.deliveryAddress) {
    return (
      <div className="mx-4 mt-4 rounded-xl border border-[#E8C9B3] bg-[#FBF4EF] p-4">
        <p className="mb-1 text-xs text-text-secondary">🛵 Giao đến</p>
        <p className="text-sm font-semibold text-primary">{order.deliveryAddress}</p>
        <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-[#92400E]">
          ⚠️ Phí ship do shipper thu trực tiếp khi giao
        </p>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd mini-app && npx tsc --noEmit
```
Expected: không lỗi. `order.status` và `storeName`/`storeAddress` đều có sẵn trong type.

- [ ] **Step 4: Commit**

```bash
git add mini-app/src/pages/order-status/index.tsx
git commit -m "feat(order-status): pickup card bỏ giờ, hiển thị theo status"
```

---

## Task 6: Kitchen display — banner + viền nổi bật, badge bỏ giờ

**Files:**
- Modify: `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx`

- [ ] **Step 1: `OrderTypeBadge` pickup bỏ giờ**

Tìm nhánh pickup trong `OrderTypeBadge` (dòng ~81-95):
```tsx
  if (order.orderType === 'pickup' && order.pickupTime) {
    const timeStr = new Date(order.pickupTime).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    })
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
        style={{ background: '#A0673D' }}
      >
        🚶 {timeStr}
      </span>
    )
  }
```
Thay bằng:
```tsx
  if (order.orderType === 'pickup') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
        style={{ background: '#A0673D' }}
      >
        🚶 Tự lấy
      </span>
    )
  }
```

- [ ] **Step 2: Thêm cờ `isTakeaway` + viền nổi bật trong `OrderCard`**

Trong `OrderCard` (sau `const isUrgent = elapsed > 600`, dòng ~555), thêm:
```tsx
  const isTakeaway = order.orderType !== 'dine_in'
```

Tìm `className` của div ngoài cùng card (dòng ~558-566):
```tsx
    <div
      className={cn(
        'rounded-xl border p-3 transition-all',
        order.status === 'ready'
          ? 'border-green-800 bg-gray-900'
          : isUrgent
            ? 'border-red-700 bg-red-950/30'
            : 'border-gray-700 bg-gray-900',
      )}
    >
```
Thay bằng (thêm nhánh takeaway viền amber dày):
```tsx
    <div
      className={cn(
        'rounded-xl border p-3 transition-all',
        order.status === 'ready'
          ? 'border-green-800 bg-gray-900'
          : isUrgent
            ? 'border-red-700 bg-red-950/30'
            : isTakeaway
              ? 'border-2 border-amber-500 bg-gray-900'
              : 'border-gray-700 bg-gray-900',
      )}
    >
```

- [ ] **Step 3: Thêm banner nổi bật ở đỉnh card**

Ngay sau `>` mở của div card (trước `{/* Header card */}`, dòng ~567), thêm:
```tsx
      {/* Banner nổi bật đơn mang về — bếp đóng túi mang đi */}
      {isTakeaway && (
        <div
          className="-mx-3 -mt-3 mb-2 rounded-t-xl px-3 py-1.5 text-center"
          style={{ background: '#A0673D' }}
        >
          <span className="text-sm font-extrabold tracking-wide text-white">
            {order.orderType === 'delivery' ? '🛵 SHIP' : '📦 MANG VỀ'}
          </span>
        </div>
      )}
```

- [ ] **Step 4: Verify TypeScript (admin-web)**

```bash
cd admin-web && npx tsc --noEmit
```
Expected: không lỗi. (`order.pickupTime` không còn được đọc; field vẫn tồn tại trong type nên không gây lỗi.)

- [ ] **Step 5: Commit**

```bash
git add "admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx"
git commit -m "feat(kitchen): banner + viền nổi bật đơn mang về, badge bỏ giờ"
```

---

## Task 7: Smoke test toàn luồng

- [ ] **Step 1: Mini-app dev**

```bash
cd mini-app && npm run dev
```

- [ ] **Step 2: Takeaway — Tự qua lấy**

Mở `http://localhost:3000/` (không param → takeaway). Kiểm tra:
- Chọn món → checkout: nhánh "🚶 Tự qua lấy" chỉ có ô **Tên** (không SĐT, không ô giờ).
- Nút bị disable tới khi nhập tên; nhập tên → enable.
- Đặt → ZaloPay sandbox. Sau khi thành công vào order-status: card "🚶 Tự qua lấy" hiện tên quán + địa chỉ + dòng "bạn sẽ nhận thông báo Zalo khi món xong".

- [ ] **Step 3: Lưu form**

Ở checkout takeaway, nhập tên (và thử chuyển sang Ship nhập phone/địa chỉ) → bấm thanh toán → thoát/huỷ giữa chừng (đơn bị huỷ) → quay lại checkout. Kiểm tra: các ô **tự điền lại** giá trị vừa nhập (đọc từ localStorage `mevo_takeaway_form`).

- [ ] **Step 4: Takeaway — Ship**

Chuyển toggle "🛵 Ship tận nhà": hiện Tên + SĐT + Địa chỉ. Nút disable tới khi đủ 3 ô hợp lệ (SĐT 10 số bắt đầu 0).

- [ ] **Step 5: Dine-in không đổi**

Mở `http://localhost:3000/?store=pho-ga-pubu&table=<uuid-bàn-hợp-lệ>`: không có form mang về, có chọn tiền mặt/ZaloPay như cũ.

- [ ] **Step 6: Kitchen display**

Mở kitchen admin. Kiểm tra:
- Đơn pickup: banner đỏ-nâu "📦 MANG VỀ" đỉnh card + viền amber dày; badge "🚶 Tự lấy" (không giờ).
- Đơn delivery: banner "🛵 SHIP" + địa chỉ dưới badge.
- Đơn tại bàn: không banner, badge xanh "🪑 Bàn X" như cũ.
- Bấm "Đã xong ✓" trên đơn pickup → khách nhận ZNS "Mời bạn qua quán lấy đồ" (nếu OA token đã set).

- [ ] **Step 7: Commit cuối**

```bash
git add -A
git commit -m "chore: smoke test passed — takeaway bỏ hẹn giờ + kitchen nổi bật + lưu form"
```
```

## Out of scope (YAGNI)
- Không drop cột `pickup_time`.
- Không đụng dine-in flow, nút chuông, tab "Đã gọi".
- Không thêm hẹn giờ cho delivery.
