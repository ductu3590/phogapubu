# Order Integrity & Tenant-Safe Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Loại bỏ lỗ hổng sửa giá khi đặt đơn — chuyển việc tạo đơn sang RPC phía server tính giá từ DB, enforce quan hệ bàn↔quán, và bỏ quyền anon insert trực tiếp.

**Architecture:** Mini-app gọi RPC `create_order` (`SECURITY DEFINER`) thay vì insert thẳng vào `orders`/`order_items`. RPC đọc giá + tên món **từ `menu_items` DB** (bỏ qua giá client gửi), kiểm `table.store_id === store_id` và mỗi món thuộc đúng quán, tính `total_amount` trên server, sinh `capability_token` (Plan 2 dùng để scope quyền đọc). Sau khi client đã chuyển sang RPC, **drop** policy anon INSERT.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), Supabase MCP (`apply_migration`, `execute_sql`, `generate_typescript_types`), mini-app TypeScript + `@supabase/supabase-js` v2.

**Phạm vi:** CHỈ toàn vẹn tạo đơn (DB + mini-app). KHÔNG đụng kitchen/admin/RLS đọc-ghi orders (để Plan 2 — operator path). KHÔNG đánh số lại 2 file `002_` (Plan 2, theo spec 4.3).

**Test reality:** mini-app không có test runner (scripts chỉ `dev/start/deploy`). Phần DB (an toàn nhất) verify bằng SQL qua Supabase MCP. Phần client verify bằng `npx tsc --noEmit` + test thủ công trên Zalo thật.

**Lưu ý môi trường:** Supabase project ref `dlkgdpexjtyynbotkwka`. Migration mới là additive (thêm function + cột + drop policy anon-insert không dùng nữa) — rủi ro thấp; nếu muốn an toàn tuyệt đối, chạy trên branch trước rồi merge.

---

### Task 1: RPC `create_order` + cột `capability_token`

**Files:**
- Create: `supabase/migrations/003_create_order_rpc.sql`

- [ ] **Step 1: Viết migration**

Tạo `supabase/migrations/003_create_order_rpc.sql`:

```sql
-- 003 — Tạo đơn phía server (chống sửa giá + enforce bàn↔quán)
-- Mini-app gọi RPC này thay vì insert trực tiếp. Giá/tên lấy TỪ DB, không tin client.

-- Cột capability_token: Plan 2 dùng để scope quyền đọc đơn (Plan 1 chỉ sinh + lưu)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS capability_token text;

CREATE OR REPLACE FUNCTION create_order(
  p_store_id uuid,
  p_table_id uuid,
  p_items jsonb,                 -- [{ "menu_item_id": uuid, "quantity": int, "note": text }]
  p_payment_method text,
  p_zalo_user_id text DEFAULT NULL,
  p_note text DEFAULT NULL
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
  v_item jsonb;
  v_menu menu_items%ROWTYPE;
  v_qty int;
BEGIN
  IF p_payment_method NOT IN ('zalopay','cash') THEN
    RAISE EXCEPTION 'payment_method không hợp lệ: %', p_payment_method;
  END IF;

  -- Bàn phải thuộc đúng quán + đang hoạt động (enforce P1-4 phía DB)
  IF NOT EXISTS (
    SELECT 1 FROM tables
    WHERE id = p_table_id AND store_id = p_store_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Đơn không có món nào';
  END IF;

  INSERT INTO orders (store_id, table_id, total_amount, zalo_user_id, note,
                      payment_method, status, capability_token)
  VALUES (p_store_id, p_table_id, 0, p_zalo_user_id, p_note,
          p_payment_method, 'pending', v_token)
  RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Số lượng không hợp lệ';
    END IF;

    -- Lấy giá + tên TỪ DB (bỏ qua mọi giá client gửi)
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

-- Mini-app (anon) được phép gọi RPC; insert trực tiếp sẽ bị chặn ở Task 3
REVOKE ALL ON FUNCTION create_order(uuid, uuid, jsonb, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION create_order(uuid, uuid, jsonb, text, text, text) TO anon;
```

- [ ] **Step 2: Áp migration**

Dùng Supabase MCP `apply_migration` với `name: "003_create_order_rpc"` và `query` = nội dung file trên (project ref `dlkgdpexjtyynbotkwka`).
Expected: thành công, không lỗi.

- [ ] **Step 3: Verify — giá tính từ server (happy path)**

Chạy qua Supabase MCP `execute_sql`:

```sql
WITH t AS (SELECT id, store_id FROM tables WHERE is_active LIMIT 1),
     m AS (SELECT id FROM menu_items WHERE store_id = (SELECT store_id FROM t)
                                       AND is_available LIMIT 1)
SELECT create_order(
  (SELECT store_id FROM t),
  (SELECT id FROM t),
  jsonb_build_array(jsonb_build_object('menu_item_id', (SELECT id FROM m), 'quantity', 2)),
  'cash', NULL, 'verify-task1'
) AS result;
```

Expected: trả về JSON đơn với `total_amount` = (giá thật của món × 2), `status = "pending"`, có `capability_token`. (Client KHÔNG gửi giá → không thể giả mạo.)

- [ ] **Step 4: Verify — chặn bàn sai quán**

```sql
SELECT create_order(
  gen_random_uuid(),                                  -- store_id rác
  (SELECT id FROM tables WHERE is_active LIMIT 1),     -- bàn thật của quán khác
  '[]'::jsonb, 'cash'
);
```

Expected: lỗi `Bàn không thuộc quán hoặc không hoạt động` (không tạo đơn).

- [ ] **Step 5: Verify — chặn món sai quán / số lượng xấu**

```sql
WITH t AS (SELECT id, store_id FROM tables WHERE is_active LIMIT 1)
SELECT create_order(
  (SELECT store_id FROM t), (SELECT id FROM t),
  jsonb_build_array(jsonb_build_object('menu_item_id', gen_random_uuid(), 'quantity', 1)),
  'cash'
);
```

Expected: lỗi `Món không thuộc quán hoặc ngừng bán: ...`.

- [ ] **Step 6: Dọn đơn verify + commit**

```sql
DELETE FROM orders WHERE note = 'verify-task1';
```

```bash
git add supabase/migrations/003_create_order_rpc.sql
git commit -m "feat(db): create_order RPC tính giá server-side + enforce bàn↔quán"
```

---

### Task 2: Mini-app gọi RPC thay vì insert trực tiếp

**Files:**
- Modify: `mini-app/src/services/order/order.api.ts:5-43` (hàm `createOrder`)
- Modify: `mini-app/src/types/database.types.ts` (regenerate — có `create_order` + cột mới)

- [ ] **Step 1: Regenerate database types**

Dùng Supabase MCP `generate_typescript_types` (project ref `dlkgdpexjtyynbotkwka`), ghi đè `mini-app/src/types/database.types.ts`.
Expected: types có function `create_order` trong `Database['public']['Functions']` và cột `capability_token` trong `orders`.

- [ ] **Step 2: Sửa `orderService.createOrder` gọi RPC**

Thay thân hàm `createOrder` trong `mini-app/src/services/order/order.api.ts` (giữ nguyên signature `CreateOrderRequest` → `Order`):

```ts
  createOrder: async (req: CreateOrderRequest): Promise<Order> => {
    // Giá + tên tính phía server trong RPC create_order (không tin client gửi giá)
    const { data, error } = await supabase.rpc("create_order", {
      p_store_id: req.storeId,
      p_table_id: req.tableId,
      p_items: req.items.map((item) => ({
        menu_item_id: item.menuItemId,
        quantity: item.quantity,
        note: item.note ?? null,
      })),
      p_payment_method: req.paymentMethod,
      p_zalo_user_id: req.zaloUserId ?? null,
      p_note: req.note ?? null,
    });

    if (error || !data) throw error ?? new Error("Tạo đơn thất bại");

    return mapOrder(data as Record<string, unknown>);
  },
```

(Giữ nguyên `mapOrder`, `cancelOrder`, `getOrderWithItems` bên dưới. `mapOrder` đã map snake_case → `Order`; RPC trả về row đơn, không kèm items — checkout chỉ dùng `order.id` nên không ảnh hưởng.)

- [ ] **Step 3: Typecheck**

Run: `cd mini-app && npx tsc --noEmit`
Expected: PASS, không lỗi type ở `order.api.ts` (rpc name `create_order` được nhận diện nhờ types đã regenerate).

- [ ] **Step 4: Commit**

```bash
git add mini-app/src/services/order/order.api.ts mini-app/src/types/database.types.ts
git commit -m "feat(mini-app): tạo đơn qua RPC create_order (chống sửa giá)"
```

---

### Task 3: Khoá quyền anon insert trực tiếp + dọn code chết

**Files:**
- Create: `supabase/migrations/004_lock_anon_order_insert.sql`
- Delete (nếu xác nhận không dùng): `mini-app/src/services/order.service.ts`

- [ ] **Step 1: Xác nhận `order.service.ts` là code chết**

Run: `cd mini-app && grep -rn "services/order.service" src || grep -rn "from './order.service'" src`
Expected: KHÔNG có import nào tới `services/order.service` (đường sống là `services/order/order.api.ts`). Nếu có import → KHÔNG xoá, dừng lại báo cáo.

- [ ] **Step 2: Viết migration drop policy anon insert**

Tạo `supabase/migrations/004_lock_anon_order_insert.sql`:

```sql
-- 004 — Bỏ quyền anon insert trực tiếp orders/order_items.
-- Mini-app giờ tạo đơn qua RPC create_order (SECURITY DEFINER) → insert bằng quyền owner.
-- (Quyền anon SELECT/UPDATE orders GIỮ NGUYÊN ở Plan 1 — Plan 2 mới siết, kèm chuyển kitchen sang operator.)

DROP POLICY IF EXISTS "public_create_orders" ON orders;
DROP POLICY IF EXISTS "public_create_order_items" ON order_items;
```

- [ ] **Step 3: Áp migration**

Dùng Supabase MCP `apply_migration` với `name: "004_lock_anon_order_insert"`.
Expected: thành công.

- [ ] **Step 4: Verify — anon KHÔNG insert trực tiếp được, RPC vẫn chạy**

Chạy qua Supabase MCP `execute_sql` (mô phỏng quyền anon):

```sql
SET LOCAL role anon;
-- (a) Insert trực tiếp phải bị chặn:
DO $$
BEGIN
  BEGIN
    INSERT INTO orders (store_id, table_id, total_amount, payment_method, status)
    VALUES (gen_random_uuid(), gen_random_uuid(), 1, 'cash', 'pending');
    RAISE EXCEPTION 'FAIL: anon vẫn insert được orders';
  EXCEPTION WHEN insufficient_privilege OR others THEN
    RAISE NOTICE 'OK: anon bị chặn insert trực tiếp';
  END;
END $$;
RESET role;
```

Expected: thấy NOTICE `OK: anon bị chặn insert trực tiếp` (không thấy dòng `FAIL`).
Sau đó chạy lại verify happy-path của Task 1 Step 3 (gọi `create_order`) → vẫn tạo đơn thành công (RPC bypass RLS). Dọn: `DELETE FROM orders WHERE note = 'verify-task1';`

- [ ] **Step 5: Xoá code chết (nếu Step 1 xác nhận)**

Xoá file `mini-app/src/services/order.service.ts`.
Run: `cd mini-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/004_lock_anon_order_insert.sql
git rm mini-app/src/services/order.service.ts
git commit -m "feat(db): khoá anon insert orders (dùng RPC) + dọn order.service.ts chết"
```

---

## Checkpoint test (BẮT BUỘC theo CLAUDE.md)

Sau Task 3, **DỪNG** — không tự sang Plan 2. Báo anh Tú test thủ công trên Zalo thật (env=TESTING):
1. Đặt đơn **tiền mặt** → vào bếp → đánh dấu xong. (Luồng tạo đơn giờ qua RPC.)
2. Đặt đơn **ZaloPay** sandbox → `checkout-create-mac` đọc `total_amount` (giờ do server tính) → trả tiền → `confirmed` → vào bếp.
3. Xác nhận `total_amount` trên đơn = đúng giá menu × số lượng.

Chờ anh Tú xác nhận PASS trước khi sang **Plan 2 (operator path + RLS đọc/ghi + kitchen)**.

---

## Self-review (đã chạy)
- **Spec coverage:** Plan này phủ spec mục 4.1 (create_order server-side), một phần 4.2 (bỏ anon insert; SELECT/UPDATE để Plan 2), 4 (table↔store). Mục 4.3/4.4, 5, 6, 7 thuộc các plan khác (đã ghi rõ ngoài phạm vi).
- **Placeholder scan:** không có TBD/“xử lý lỗi phù hợp”; mọi step có SQL/code/command thật.
- **Type consistency:** RPC tên `create_order` dùng nhất quán ở migration + client + regenerate types; tham số `p_store_id/p_table_id/p_items/p_payment_method/p_zalo_user_id/p_note` khớp giữa SQL và lời gọi `supabase.rpc`.
