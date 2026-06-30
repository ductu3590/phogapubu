# Topping cho món ăn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho mỗi món một danh sách topping (add-on) tuỳ chọn — quản lý trong admin web, khách tick khi đặt trong mini-app, giá phụ thu tính ở server, snapshot vào đơn, hiển thị ở giỏ/checkout/màn theo dõi/bếp.

**Architecture:** Bảng mới `menu_item_toppings` (per-món, composite FK chống lệch store) + cột snapshot `order_items.selected_toppings` (JSONB `[{id,name,price}]`). RPC `create_order` (SECURITY DEFINER) tự tra giá topping từ DB và cộng phụ thu — không tin client. Mini-app dùng `SelectedVariant` (đã có sẵn khung) với `groupId="topping"` để chứa topping trong giỏ; admin ghi qua service-role (`createAdminClient`) với helper verify ownership.

**Tech Stack:** Supabase Postgres (RPC plpgsql, RLS), Zalo Mini App (React 18 + zustand + @tanstack/react-query + zmp-ui), Next.js 16 admin (server actions). Spec nguồn: `docs/superpowers/specs/2026-06-30-menu-toppings-design.md`.

---

## Testing strategy (đọc trước)

Dự án **không có unit-test framework**; CLAUDE.md bắt buộc test thủ công theo `TESTING.md` sau mỗi sprint. Vì vậy "cổng kiểm" mỗi task là:
- **Mini-app:** `cd mini-app && npx tsc --noEmit` (tsconfig đã bật `noEmit` + `strict`).
- **Admin:** `cd admin-web && npx tsc --noEmit`.
- **Migration:** áp qua Supabase MCP `apply_migration` rồi verify bằng `execute_sql`/`list_tables`. (Anh Tú đã cho phép tự áp SQL prod — memory `feedback_apply_sql_via_mcp`.)
- **Manual:** Task cuối tổng hợp checklist để thêm vào `TESTING.md` và đưa anh Tú test.

KHÔNG dựng vitest/jest mới (YAGNI + không có pattern sẵn). Mỗi task commit riêng. Commit kèm trailer:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

## File structure (tạo / sửa)

**DB**
- Create: `supabase/migrations/015_menu_toppings.sql` — bảng, constraint, index, RLS, cột snapshot, RPC `create_order` v2.

**Types**
- Modify: `mini-app/src/types/database.types.ts` — thêm `menu_item_toppings`, cột `selected_toppings`.
- Modify: `mini-app/src/types/product.types.ts` — `Product.toppings`.
- Modify: `mini-app/src/types/order.types.ts` — `OrderItem.selectedToppings`, `CreateOrderRequest.items[].toppingIds`.
- Modify: `mini-app/src/types/cart.types.ts` — sửa comment "MVP luôn rỗng".

**Mini-app logic**
- Create: `mini-app/src/utils/order-pricing.ts` — helper tính tiền order item (đọc từ `OrderItem`).
- Modify: `mini-app/src/services/category/category.api.ts` — load + map toppings.
- Modify: `mini-app/src/stores/cart.store.tsx` — cart id gồm topping.
- Create: `mini-app/src/components/menu/topping-sheet.tsx` — bottom sheet chọn topping.
- Modify: `mini-app/src/pages/menu/index.tsx` — nút "+" mở sheet cho món có topping; badge tổng.
- Modify: `mini-app/src/pages/checkout/index.tsx` — hiển thị topping từng dòng + gửi `toppingIds`.
- Modify: `mini-app/src/services/order/order.api.ts` — gửi `topping_ids`, map `selectedToppings` khi đọc đơn.
- Modify: `mini-app/src/pages/order-status/index.tsx` — hiển thị topping + dùng helper line total.

**Admin**
- Modify: `admin-web/lib/actions/menu.ts` — assert helpers + CRUD topping.
- Modify: `admin-web/app/admin/menu/page.tsx` — query kèm `menu_item_toppings`.
- Modify: `admin-web/app/admin/menu/menu-client.tsx` — section topping trong modal sửa món, badge, auto-open edit sau khi thêm món.
- Modify: `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx` — map + render `selectedToppings` từ snapshot.

---

## Task 1: Migration DB (bảng topping + cột snapshot + RPC v2)

**Files:**
- Create: `supabase/migrations/015_menu_toppings.sql`

- [ ] **Step 1: Viết file migration**

Tạo `supabase/migrations/015_menu_toppings.sql` với nội dung đầy đủ:

```sql
-- 015 — Topping (add-on) cho món ăn
-- - Bảng menu_item_toppings (per-món, composite FK chống lệch store)
-- - Cột order_items.selected_toppings (JSONB snapshot [{id,name,price}])
-- - RPC create_order v2: nhận topping_ids trong mỗi item, tự tra giá + snapshot
-- Idempotent: rerun-safe.

-- ─── 1. UNIQUE(id, store_id) trên menu_items để làm đích composite FK ────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_id_store_uniq') THEN
    ALTER TABLE menu_items ADD CONSTRAINT menu_items_id_store_uniq UNIQUE (id, store_id);
  END IF;
END $$;

-- ─── 2. Bảng topping ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_item_toppings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id  uuid NOT NULL,
  store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name          text NOT NULL,
  price         int  NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_available  boolean NOT NULL DEFAULT true,
  sort_order    int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_item_toppings_item_store_fkey
    FOREIGN KEY (menu_item_id, store_id)
    REFERENCES menu_items (id, store_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_menu_item_toppings_lookup
  ON menu_item_toppings (menu_item_id, is_available, sort_order);

-- ─── 3. RLS topping ─────────────────────────────────────────────────────────
ALTER TABLE menu_item_toppings ENABLE ROW LEVEL SECURITY;

-- anon (mini-app) đọc topping công khai — mirror anon_read_items
DROP POLICY IF EXISTS "anon_read_toppings" ON menu_item_toppings;
CREATE POLICY "anon_read_toppings" ON menu_item_toppings
  FOR SELECT TO anon USING (true);

-- authenticated (admin) đọc theo operator — mirror auth_read_all_items (is_operator())
DROP POLICY IF EXISTS "auth_read_all_toppings" ON menu_item_toppings;
CREATE POLICY "auth_read_all_toppings" ON menu_item_toppings
  FOR SELECT TO authenticated USING (is_operator());

-- KHÔNG tạo policy INSERT/UPDATE/DELETE: admin ghi qua service-role (bypass RLS).
-- KHÔNG tạo policy cho role kitchen: bếp chỉ đọc snapshot order_items.selected_toppings.

-- ─── 4. Cột snapshot trên order_items ───────────────────────────────────────
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS selected_toppings jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_selected_toppings_is_array') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_selected_toppings_is_array
      CHECK (jsonb_typeof(selected_toppings) = 'array');
  END IF;
END $$;

-- ─── 5. RPC create_order v2 (cùng signature 10-param — CREATE OR REPLACE) ────
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
  v_topping_ids   uuid[];
  v_item_toppings jsonb;
  v_topping_total int;
  v_topping_count int;
BEGIN
  IF p_payment_method NOT IN ('zalopay','cash') THEN
    RAISE EXCEPTION 'payment_method không hợp lệ: %', p_payment_method;
  END IF;

  IF p_order_type NOT IN ('dine_in','pickup','delivery') THEN
    RAISE EXCEPTION 'order_type không hợp lệ: %', p_order_type;
  END IF;

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

    -- Topping: tra giá + snapshot từ DB (không tin giá client)
    v_item_toppings := '[]'::jsonb;
    v_topping_total := 0;
    IF v_item ? 'topping_ids'
       AND jsonb_typeof(v_item->'topping_ids') = 'array'
       AND jsonb_array_length(v_item->'topping_ids') > 0 THEN

      SELECT array_agg(DISTINCT value::uuid)
        INTO v_topping_ids
        FROM jsonb_array_elements_text(v_item->'topping_ids');

      SELECT
        COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'price', t.price)
                           ORDER BY t.sort_order, t.created_at), '[]'::jsonb),
        COALESCE(SUM(t.price), 0),
        COUNT(*)
      INTO v_item_toppings, v_topping_total, v_topping_count
      FROM menu_item_toppings t
      WHERE t.id = ANY(v_topping_ids)
        AND t.menu_item_id = v_menu.id
        AND t.store_id = p_store_id
        AND t.is_available = true;

      IF v_topping_count <> array_length(v_topping_ids, 1) THEN
        RAISE EXCEPTION 'Topping không hợp lệ hoặc ngừng bán cho món %', v_menu.name;
      END IF;
    END IF;

    INSERT INTO order_items (
      order_id, menu_item_id, item_name, item_price, quantity, note, selected_toppings
    ) VALUES (
      v_order.id, v_menu.id, v_menu.name, v_menu.price, v_qty, v_item->>'note', v_item_toppings
    );

    v_total := v_total + (v_menu.price + v_topping_total) * v_qty;
  END LOOP;

  UPDATE orders SET total_amount = v_total WHERE id = v_order.id RETURNING * INTO v_order;

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION create_order(uuid, uuid, jsonb, text, text, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION create_order(uuid, uuid, jsonb, text, text, text, text, text, text, text) TO anon;
```

- [ ] **Step 2: Áp migration qua Supabase MCP**

Dùng tool `mcp__638e660e-...__apply_migration` với `name = "015_menu_toppings"` và `query` = toàn bộ nội dung file trên.
Expected: thành công, không lỗi.

- [ ] **Step 3: Verify schema**

Dùng `mcp__638e660e-...__execute_sql`:
```sql
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='order_items' AND column_name='selected_toppings') AS has_col,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_name='menu_item_toppings') AS has_table,
  (SELECT count(*) FROM pg_constraint
     WHERE conname='menu_item_toppings_item_store_fkey') AS has_fk;
```
Expected: `has_col=1, has_table=1, has_fk=1`.

- [ ] **Step 4: Verify composite FK chặn lệch store (smoke negative)**

```sql
-- Phải LỖI (insert topping với store_id sai so với món):
DO $$
DECLARE m record;
BEGIN
  SELECT id, store_id INTO m FROM menu_items LIMIT 1;
  BEGIN
    INSERT INTO menu_item_toppings(menu_item_id, store_id, name, price)
    VALUES (m.id, gen_random_uuid(), 'x', 0);
    RAISE EXCEPTION 'KHÔNG MONG ĐỢI: insert lệch store lại thành công';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK: composite FK chặn lệch store';
  END;
END $$;
```
Expected: NOTICE "OK: composite FK chặn lệch store".

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/015_menu_toppings.sql
git commit -m "feat: migration topping món ăn (bảng menu_item_toppings + snapshot + RPC v2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Cập nhật types (database + product + order + cart)

**Files:**
- Modify: `mini-app/src/types/database.types.ts`
- Modify: `mini-app/src/types/product.types.ts`
- Modify: `mini-app/src/types/order.types.ts`
- Modify: `mini-app/src/types/cart.types.ts`

- [ ] **Step 1: Thêm bảng `menu_item_toppings` + cột `selected_toppings` vào `database.types.ts`**

Trong `mini-app/src/types/database.types.ts`, sau block `menu_items` (kết thúc dòng `Relationships: []` của nó), thêm:

```ts
      menu_item_toppings: {
        Row: {
          id: string
          menu_item_id: string
          store_id: string
          name: string
          price: number
          is_available: boolean
          sort_order: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['menu_item_toppings']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['menu_item_toppings']['Insert']>
        Relationships: []
      }
```

Và trong block `order_items` → `Row`, thêm field (sau `note`):
```ts
          selected_toppings: { id: string; name: string; price: number }[]
```

- [ ] **Step 2: Thêm `toppings` vào `Product`**

Thay toàn bộ `mini-app/src/types/product.types.ts`:
```ts
// Topping (add-on) tuỳ chọn của món — chỉ chứa topping còn bán (is_available)
export interface Topping {
  id: string;
  name: string;
  price: number; // phụ thu, VNĐ
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  isAvailable: boolean;
  categoryId: string;
  sortOrder: number;
  toppings: Topping[]; // [] nếu món không có topping
}
```

- [ ] **Step 3: Thêm `selectedToppings` + `toppingIds` vào order types**

Trong `mini-app/src/types/order.types.ts`:

Sửa `OrderItem` (thêm field cuối):
```ts
export interface OrderItem {
  id: string;
  menuItemId: string | null;
  name: string;
  quantity: number;
  price: number;
  note?: string | null;
  selectedToppings: { id: string; name: string; price: number }[];
}
```

Sửa `CreateOrderRequest.items[]` (thêm `toppingIds`):
```ts
  items: {
    menuItemId: string;
    name: string;
    price: number;
    quantity: number;
    note?: string;
    toppingIds?: string[];
  }[];
```

- [ ] **Step 4: Sửa comment lỗi thời trong `cart.types.ts`**

Trong `mini-app/src/types/cart.types.ts` đổi 2 comment:
- Dòng 1 `// MVP: selectedVariants luôn rỗng, giữ để tương thích với cart utils`
  → `// selectedVariants chứa topping đã chọn (groupId = "topping")`
- Dòng `selectedVariants: SelectedVariant[];   // luôn [] cho MVP`
  → `selectedVariants: SelectedVariant[];   // topping đã chọn; [] nếu món không topping`

- [ ] **Step 5: Type-check**

Run: `cd mini-app && npx tsc --noEmit`
Expected: PASS (không lỗi mới). *Lưu ý: `category.api.ts` chưa map `toppings` → có thể báo thiếu field `toppings` trên `Product`. Nếu báo, đó là lỗi sẽ sửa ở Task 6; tạm thời chấp nhận và sửa ngay Task 6.* Để giữ mỗi task xanh, thêm `toppings` map vào `category.api.ts` Task 6 NGAY sau task này.

- [ ] **Step 6: Commit**

```bash
git add mini-app/src/types/database.types.ts mini-app/src/types/product.types.ts mini-app/src/types/order.types.ts mini-app/src/types/cart.types.ts
git commit -m "feat: types cho topping (Product.toppings, OrderItem.selectedToppings, toppingIds)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Mini-app — load topping vào menu

**Files:**
- Modify: `mini-app/src/services/category/category.api.ts`

- [ ] **Step 1: Map toppings khi load menu**

Trong `mini-app/src/services/category/category.api.ts`:

Sửa `mapProduct` để nhận và map mảng topping lồng:
```ts
import { Product, Topping } from "@/types/product.types";

function mapToppings(rows: Record<string, unknown>[] | null | undefined): Topping[] {
  return (rows ?? [])
    .map((r) => ({
      id: r.id as string,
      name: r.name as string,
      price: r.price as number,
    }));
}

function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    price: row.price as number,
    image: (row.image_url as string | null) ?? null,
    isAvailable: row.is_available as boolean,
    categoryId: row.category_id as string,
    sortOrder: row.sort_order as number,
    toppings: mapToppings(row.menu_item_toppings as Record<string, unknown>[] | undefined),
  };
}
```

Sửa câu `.select(...)` trong `getMenuByStore` để lồng topping còn bán, sort sẵn:
```ts
    const { data, error } = await supabase
      .from("menu_categories")
      .select(
        "*, menu_items(*, menu_item_toppings(id, name, price, is_available, sort_order))",
      )
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("sort_order");
```

Vì PostgREST không lọc/sort được bảng lồng sâu trong cùng câu một cách gọn, lọc + sort topping trong JS ngay tại `mapToppings`:
```ts
function mapToppings(rows: Record<string, unknown>[] | null | undefined): Topping[] {
  return (rows ?? [])
    .filter((r) => r.is_available === true)
    .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
    .map((r) => ({
      id: r.id as string,
      name: r.name as string,
      price: r.price as number,
    }));
}
```

- [ ] **Step 2: Type-check**

Run: `cd mini-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mini-app/src/services/category/category.api.ts
git commit -m "feat: load topping còn bán theo món khi tải menu

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Mini-app — cart id gồm topping

**Files:**
- Modify: `mini-app/src/stores/cart.store.tsx`

- [ ] **Step 1: Đổi `generateCartItemId` để tách dòng theo tổ hợp topping**

Trong `mini-app/src/stores/cart.store.tsx`, thay hàm:
```ts
// ID cart line = productId + tổ hợp topping (đã sort) → cùng món khác topping = 2 line,
// cùng tổ hợp thì gộp số lượng.
const generateCartItemId = (item: Omit<CartItem, "id">): string => {
  const toppingIds = item.selectedVariants
    .filter((v) => v.groupId === "topping")
    .map((v) => v.optionId)
    .sort();
  return toppingIds.length > 0
    ? `${item.productId}|${toppingIds.join(",")}`
    : item.productId;
};
```

- [ ] **Step 2: Type-check**

Run: `cd mini-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mini-app/src/stores/cart.store.tsx
git commit -m "feat: cart tách dòng theo tổ hợp topping

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Mini-app — bottom sheet chọn topping

**Files:**
- Create: `mini-app/src/components/menu/topping-sheet.tsx`

- [ ] **Step 1: Tạo component sheet**

Tạo `mini-app/src/components/menu/topping-sheet.tsx`:
```tsx
import { useState } from "react";
import { Sheet } from "zmp-ui";
import { Product } from "@/types/product.types";
import { SelectedVariant } from "@/types/cart.types";
import { formatCurrency } from "@/utils/format";
import { cn } from "@/utils/cn";

interface ToppingSheetProps {
  product: Product | null;
  visible: boolean;
  onClose: () => void;
  // Trả về tổ hợp topping đã chọn (dưới dạng SelectedVariant) để thêm 1 suất vào giỏ
  onConfirm: (variants: SelectedVariant[]) => void;
}

export default function ToppingSheet({ product, visible, onClose, onConfirm }: ToppingSheetProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset lựa chọn mỗi lần mở sheet cho 1 món
  const handleClose = () => {
    setSelected(new Set());
    onClose();
  };

  if (!product) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toppingTotal = product.toppings
    .filter((t) => selected.has(t.id))
    .reduce((s, t) => s + t.price, 0);
  const unitPrice = product.price + toppingTotal;

  const handleConfirm = () => {
    const variants: SelectedVariant[] = product.toppings
      .filter((t) => selected.has(t.id))
      .map((t) => ({
        groupId: "topping",
        groupTitle: "Topping",
        optionId: t.id,
        optionName: t.name,
        extraPrice: t.price,
        quantity: 1,
      }));
    onConfirm(variants);
    setSelected(new Set());
  };

  return (
    <Sheet autoHeight visible={visible} onClose={handleClose}>
      <div className="flex max-h-[75vh] flex-col bg-white">
        <div className="flex items-center gap-3 border-b border-neutral100 px-4 py-3">
          {product.image ? (
            <img src={product.image} alt={product.name}
              className="h-12 w-12 rounded-lg object-cover" draggable={false} />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-neutral100 text-2xl">🍽️</div>
          )}
          <div className="min-w-0">
            <p className="text-normal-sb font-semibold text-text-primary line-clamp-1">{product.name}</p>
            <p className="text-small text-text-secondary">{formatCurrency(product.price)}đ</p>
          </div>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-2">
          <p className="py-2 text-small-m font-semibold text-text-secondary">Chọn thêm topping</p>
          {product.toppings.map((t) => {
            const checked = selected.has(t.id);
            return (
              <button key={t.id} onClick={() => toggle(t.id)}
                className="flex w-full items-center gap-3 border-b border-neutral100 py-3 text-left">
                <span className={cn(
                  "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors",
                  checked ? "border-primary bg-primary text-white" : "border-neutral400",
                )}>
                  {checked && <span className="text-xs">✓</span>}
                </span>
                <span className="flex-1 text-normal text-text-primary">{t.name}</span>
                <span className="text-small font-medium text-text-secondary">+{formatCurrency(t.price)}đ</span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-neutral100 px-4 py-4">
          <button onClick={handleConfirm}
            className="flex w-full items-center justify-between rounded-xl bg-primary px-4 py-3 font-semibold text-white active:bg-primary">
            <span>Thêm vào giỏ</span>
            <span>{formatCurrency(unitPrice)}đ</span>
          </button>
        </div>
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd mini-app && npx tsc --noEmit`
Expected: PASS. (Component chưa được dùng — vẫn compile vì export default.)

- [ ] **Step 3: Commit**

```bash
git add mini-app/src/components/menu/topping-sheet.tsx
git commit -m "feat: bottom sheet chọn topping (tick có/không)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Mini-app — tích hợp sheet vào trang menu

**Files:**
- Modify: `mini-app/src/pages/menu/index.tsx`

- [ ] **Step 1: Thêm state sheet + đổi handler add cho món có topping**

Trong `mini-app/src/pages/menu/index.tsx`, thêm import + state trong `MenuPage`:
```tsx
import ToppingSheet from "@/components/menu/topping-sheet";
import { SelectedVariant } from "@/types/cart.types";
```
Trong body `MenuPage` (cạnh các state khác):
```tsx
  const [toppingProduct, setToppingProduct] = useState<Product | null>(null);
```

Sửa `handleAdd` để: món có topping → mở sheet; món không topping → quick-add như cũ:
```tsx
  const handleAdd = (product: Product) => {
    if (product.toppings.length > 0) {
      setToppingProduct(product);
      return;
    }
    const existing = cartItems.find((i) => i.id === product.id);
    if (existing) {
      updateQuantity(product.id, existing.quantity + 1);
    } else {
      addToCart({
        productId: product.id,
        productName: product.name,
        productImage: product.image ?? "",
        basePrice: product.price,
        selectedVariants: [],
        quantity: 1,
      });
    }
  };
```

Thêm handler xác nhận từ sheet (thêm 1 suất với tổ hợp topping):
```tsx
  const handleConfirmToppings = (variants: SelectedVariant[]) => {
    if (!toppingProduct) return;
    addToCart({
      productId: toppingProduct.id,
      productName: toppingProduct.name,
      productImage: toppingProduct.image ?? "",
      basePrice: toppingProduct.price,
      selectedVariants: variants,
      quantity: 1,
    });
    setToppingProduct(null);
  };
```

- [ ] **Step 2: Đổi `getItemCount` thành tổng mọi tổ hợp + render sheet**

Sửa `getItemCount` để cộng dồn mọi cart line cùng `productId` (vì 1 món có thể đẻ nhiều line):
```tsx
  const getItemCount = (productId: string) =>
    cartItems
      .filter((i) => i.productId === productId)
      .reduce((s, i) => s + i.quantity, 0);
```

Trước thẻ đóng `</div>` ngoài cùng của return trong `MenuPage`, thêm sheet:
```tsx
      <ToppingSheet
        product={toppingProduct}
        visible={toppingProduct !== null}
        onClose={() => setToppingProduct(null)}
        onConfirm={handleConfirmToppings}
      />
```

- [ ] **Step 3: Ẩn nút "−" nhanh cho món có topping (chỉ giữ "+")**

Trong `MenuItemRow`, thêm prop `hasToppings` và chỉ render cụm nút "−"/count khi KHÔNG có topping. Sửa signature + chỗ render:
```tsx
function MenuItemRow({
  product,
  count,
  onAdd,
  onDecrease,
}: {
  product: Product;
  count: number;
  onAdd: () => void;
  onDecrease: () => void;
}) {
  const hasToppings = product.toppings.length > 0;
  // ... giữ nguyên phần trên ...
```
Trong cụm nút (khối `product.isAvailable && (...)`), đổi điều kiện hiện "−"/count:
```tsx
          {product.isAvailable && (
            <div className="flex items-center gap-2">
              {!hasToppings && count > 0 && (
                <>
                  <button
                    onClick={onDecrease}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-primary text-primary transition-all active:scale-90"
                    aria-label="Giảm"
                  >
                    <MinusIcon className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[20px] text-center text-small-m font-bold text-text-primary">
                    {count}
                  </span>
                </>
              )}
              {hasToppings && count > 0 && (
                <span className="min-w-[20px] text-center text-small-m font-bold text-primary">
                  {count}
                </span>
              )}
              <button
                onClick={onAdd}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white transition-all active:scale-90"
                aria-label="Thêm vào giỏ"
              >
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
```

- [ ] **Step 4: Type-check**

Run: `cd mini-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mini-app/src/pages/menu/index.tsx
git commit -m "feat: menu mở sheet topping cho món có topping, badge tổng mọi tổ hợp

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Mini-app — checkout hiển thị topping + gửi toppingIds

**Files:**
- Modify: `mini-app/src/pages/checkout/index.tsx`
- Modify: `mini-app/src/services/order/order.api.ts`

- [ ] **Step 1: Gửi `toppingIds` trong payload tạo đơn (checkout)**

Trong `mini-app/src/pages/checkout/index.tsx`, sửa phần `items: cartItems.map(...)` trong `createOrder({...})`:
```tsx
        items: cartItems.map((item) => ({
          menuItemId: item.productId,
          name: item.productName,
          price: item.basePrice,
          quantity: item.quantity,
          note: item.note,
          toppingIds: item.selectedVariants
            .filter((v) => v.groupId === "topping")
            .map((v) => v.optionId),
        })),
```

- [ ] **Step 2: Hiển thị topping + giá đúng từng dòng trong danh sách món checkout**

Trong `checkout/index.tsx`, đổi dòng import cart sẵn có (`import { calculateCartTotal } from "@/utils/cart";`) thành:
```tsx
import { calculateCartTotal, calculateCartItemPrice, formatVariantWithPercentage } from "@/utils/cart";
```
Sửa block hiển thị mỗi `item` (đoạn `<div className="flex-1">` chứa tên + giá) để show topping và đơn giá gồm topping:
```tsx
                  <div className="flex-1">
                    <p className="text-small-m font-medium text-text-primary line-clamp-2">
                      {item.productName}
                    </p>
                    {item.selectedVariants.length > 0 && (
                      <p className="text-xxsmall text-text-secondary line-clamp-2">
                        {formatVariantWithPercentage(item.selectedVariants)}
                      </p>
                    )}
                    <p className="text-xxsmall text-text-secondary">
                      {formatCurrency(calculateCartItemPrice(item))}đ
                    </p>
                  </div>
```
(`totalAmount = calculateCartTotal(cartItems)` đã cộng topping sẵn — không đổi.)

- [ ] **Step 3: Gửi `topping_ids` xuống RPC (order.api)**

Trong `mini-app/src/services/order/order.api.ts`, hàm `createOrder`, sửa map items:
```ts
      p_items: req.items.map((item) => ({
        menu_item_id: item.menuItemId,
        quantity: item.quantity,
        note: item.note ?? null,
        topping_ids: item.toppingIds ?? [],
      })),
```

- [ ] **Step 4: Type-check**

Run: `cd mini-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mini-app/src/pages/checkout/index.tsx mini-app/src/services/order/order.api.ts
git commit -m "feat: checkout hiển thị topping + gửi topping_ids xuống RPC

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Mini-app — helper giá order item + hiển thị topping ở màn theo dõi đơn

**Files:**
- Create: `mini-app/src/utils/order-pricing.ts`
- Modify: `mini-app/src/services/order/order.api.ts`
- Modify: `mini-app/src/pages/order-status/index.tsx`

- [ ] **Step 1: Tạo helper tính tiền order item**

Tạo `mini-app/src/utils/order-pricing.ts`:
```ts
// Tính tiền cho ORDER item (đọc từ OrderItem có selectedToppings).
// item_price KHÔNG gồm topping → mọi nơi hiển thị tiền dòng phải dùng helper này.
type PriceableOrderItem = {
  price: number;
  quantity: number;
  selectedToppings?: { price: number }[];
};

export const getItemUnitPrice = (i: PriceableOrderItem): number =>
  i.price + (i.selectedToppings ?? []).reduce((s, t) => s + t.price, 0);

export const getItemLineTotal = (i: PriceableOrderItem): number =>
  getItemUnitPrice(i) * i.quantity;
```

- [ ] **Step 2: Map `selectedToppings` khi đọc đơn (order.api)**

Trong `mini-app/src/services/order/order.api.ts`, hàm `getOrderWithItems`, sửa map item:
```ts
      items: (data.order_items ?? []).map((item: Record<string, unknown>) => ({
        id: item.id as string,
        menuItemId: item.menu_item_id as string | null,
        name: item.item_name as string,
        quantity: item.quantity as number,
        price: item.item_price as number,
        note: item.note as string | null,
        selectedToppings: (item.selected_toppings as { id: string; name: string; price: number }[] | null) ?? [],
      })),
```

- [ ] **Step 3: Sửa hiển thị màn theo dõi đơn (order-status)**

Trong `mini-app/src/pages/order-status/index.tsx`:
- Import helper:
```tsx
import { getItemLineTotal } from "@/utils/order-pricing";
```
- Thay nguyên block render mỗi item (hiện là dòng 280–288: `<div key={item.id} className="flex justify-between">` … `</div>`) bằng block dưới — bọc tên + topping trong cột, đổi line total qua helper:
```tsx
              <div key={item.id} className="flex justify-between gap-2">
                <div className="flex-1">
                  <span className="text-small text-text-primary">
                    {item.name}
                    <span className="ml-1 text-text-secondary">×{item.quantity}</span>
                  </span>
                  {item.selectedToppings.length > 0 && (
                    <p className="text-xxsmall text-text-secondary">
                      {item.selectedToppings.map((t) => `+ ${t.name}`).join(", ")}
                    </p>
                  )}
                </div>
                <span className="text-small font-medium">
                  {formatCurrency(getItemLineTotal(item))}đ
                </span>
              </div>
```

- [ ] **Step 4: Type-check**

Run: `cd mini-app && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mini-app/src/utils/order-pricing.ts mini-app/src/services/order/order.api.ts mini-app/src/pages/order-status/index.tsx
git commit -m "feat: màn theo dõi đơn hiển thị topping + line total qua helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Admin — server actions quản lý topping (verify ownership)

**Files:**
- Modify: `admin-web/lib/actions/menu.ts`

- [ ] **Step 1: Thêm assert helpers + CRUD topping**

Trong `admin-web/lib/actions/menu.ts`, thêm (sau hàm `getStoreId`):
```ts
// Ném lỗi nếu món không thuộc store của user → chống service-role sửa chéo store
async function assertMenuItemInStore(menuItemId: string, storeId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('menu_items')
    .select('id, store_id')
    .eq('id', menuItemId)
    .single()
  if (error || !data) throw new Error('Không tìm thấy món')
  if (data.store_id !== storeId) throw new Error('Món không thuộc quán của bạn')
}

// Ném lỗi nếu topping không thuộc store của user
async function assertToppingInStore(toppingId: string, storeId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('menu_item_toppings')
    .select('id, store_id')
    .eq('id', toppingId)
    .single()
  if (error || !data) throw new Error('Không tìm thấy topping')
  if (data.store_id !== storeId) throw new Error('Topping không thuộc quán của bạn')
}

// Thêm topping cho 1 món — store_id LẤY TỪ món, không nhận từ client
export async function addTopping(menuItemId: string, name: string, price: number) {
  const storeId = await getStoreId()
  await assertMenuItemInStore(menuItemId, storeId)
  const admin = createAdminClient()
  // sort_order = max + 1 trong cùng món để thứ tự ổn định
  const { data: maxRow } = await admin
    .from('menu_item_toppings')
    .select('sort_order')
    .eq('menu_item_id', menuItemId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSort = (maxRow?.sort_order ?? -1) + 1
  const { error } = await admin.from('menu_item_toppings').insert({
    menu_item_id: menuItemId,
    store_id: storeId,
    name: name.trim(),
    price: Math.max(0, Math.round(price)),
    is_available: true,
    sort_order: nextSort,
  })
  if (error) throw new Error(`addTopping: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Sửa topping (tên/giá/tạm hết)
export async function updateTopping(
  toppingId: string,
  patch: { name?: string; price?: number; is_available?: boolean },
) {
  const storeId = await getStoreId()
  await assertToppingInStore(toppingId, storeId)
  const admin = createAdminClient()
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.price !== undefined) update.price = Math.max(0, Math.round(patch.price))
  if (patch.is_available !== undefined) update.is_available = patch.is_available
  const { error } = await admin.from('menu_item_toppings').update(update).eq('id', toppingId)
  if (error) throw new Error(`updateTopping: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Xoá topping
export async function deleteTopping(toppingId: string) {
  const storeId = await getStoreId()
  await assertToppingInStore(toppingId, storeId)
  const admin = createAdminClient()
  const { error } = await admin.from('menu_item_toppings').delete().eq('id', toppingId)
  if (error) throw new Error(`deleteTopping: ${error.message}`)
  revalidatePath('/admin/menu')
}
```

- [ ] **Step 2: Cho `addMenuItem` trả về `id` món mới (phục vụ auto-open edit ở Task 11)**

Trong `admin-web/lib/actions/menu.ts`, sửa `addMenuItem` để select id và trả về:
```ts
  const { data, error } = await admin.from('menu_items').insert({
    store_id: storeId,
    category_id: formData.get('category_id') as string,
    name: formData.get('name') as string,
    description: (formData.get('description') as string) || null,
    price: parseInt(formData.get('price') as string, 10),
    image_url: imageUrl,
    is_available: true,
    sort_order: 0,
  }).select('id').single()
  if (error) throw new Error(`addMenuItem: ${error.message}`)
  revalidatePath('/admin/menu')
  return data.id as string
```

- [ ] **Step 3: Type-check admin**

Run: `cd admin-web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add admin-web/lib/actions/menu.ts
git commit -m "feat: server actions topping (CRUD + assert ownership, addMenuItem trả id)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Admin — query topping vào trang menu

**Files:**
- Modify: `admin-web/app/admin/menu/page.tsx`

- [ ] **Step 1: Lồng `menu_item_toppings` vào query**

Trong `admin-web/app/admin/menu/page.tsx`, sửa câu `.select(...)`:
```ts
  const { data: categories } = await supabase
    .from('menu_categories')
    .select('*, menu_items(*, menu_item_toppings(id, name, price, is_available, sort_order))')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('sort_order')
```

- [ ] **Step 2: Type-check admin**

Run: `cd admin-web && npx tsc --noEmit`
Expected: PASS. (Type `MenuItem` trong `menu-client.tsx` chưa có `menu_item_toppings` → sẽ thêm ở Task 11; nếu báo lỗi field thừa, đó là do strict object — sửa ngay Task 11. Để task này xanh, Task 11 thực hiện liền sau.)

- [ ] **Step 3: Commit**

```bash
git add admin-web/app/admin/menu/page.tsx
git commit -m "feat: trang admin menu query kèm topping của món

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Admin — UI quản lý topping trong modal sửa món + badge + auto-open edit

**Files:**
- Modify: `admin-web/app/admin/menu/menu-client.tsx`

- [ ] **Step 1: Mở rộng type + import actions**

Trong `admin-web/app/admin/menu/menu-client.tsx`, sửa import actions:
```tsx
import {
  toggleMenuItem,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  addCategory,
  updateCategory,
  deleteCategory,
  addTopping,
  updateTopping,
  deleteTopping,
} from '@/lib/actions/menu'
```
Thêm type topping + field vào `MenuItem`:
```tsx
type Topping = {
  id: string
  name: string
  price: number
  is_available: boolean
  sort_order: number
}
type MenuItem = {
  id: string
  name: string
  description: string | null
  price: number
  is_available: boolean
  image_url: string | null
  sort_order: number
  category_id: string
  menu_item_toppings?: Topping[]
}
```

- [ ] **Step 2: Badge số topping trong danh sách món**

Trong khối render mỗi `item` (cạnh tên/giá), thêm badge khi có topping. Sau `<p>{item.description}</p>` (trong `<div className="min-w-0 flex-1">`), thêm:
```tsx
                      {(item.menu_item_toppings?.length ?? 0) > 0 && (
                        <span className="mt-0.5 inline-block rounded bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-orange-600">
                          {item.menu_item_toppings!.length} topping
                        </span>
                      )}
```

- [ ] **Step 3: Section quản lý topping trong modal "Sửa món"**

Thêm component `ToppingEditor` ở cuối file `menu-client.tsx`:
```tsx
function ToppingEditor({
  item,
  router,
}: {
  item: MenuItem
  router: ReturnType<typeof useRouter>
}) {
  const [isPending, startTransition] = useTransition()
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const toppings = item.menu_item_toppings ?? []

  const handleAdd = () => {
    const name = newName.trim()
    const price = parseInt(newPrice, 10)
    if (!name || Number.isNaN(price) || price < 0) {
      alert('Nhập tên và giá topping hợp lệ')
      return
    }
    startTransition(async () => {
      await addTopping(item.id, name, price)
      setNewName('')
      setNewPrice('')
      router.refresh()
    })
  }

  const handleToggle = (t: Topping) => {
    startTransition(async () => {
      await updateTopping(t.id, { is_available: !t.is_available })
      router.refresh()
    })
  }

  const handleDelete = (t: Topping) => {
    if (!confirm(`Xoá topping "${t.name}"?`)) return
    startTransition(async () => {
      await deleteTopping(t.id)
      router.refresh()
    })
  }

  return (
    <div className="mt-2 border-t border-gray-100 pt-3">
      <p className="mb-2 text-sm font-semibold text-gray-700">Topping (tuỳ chọn)</p>
      <div className="flex flex-col gap-2">
        {toppings.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1.5">
            <button
              type="button"
              onClick={() => handleToggle(t)}
              disabled={isPending}
              className={`h-5 w-9 flex-shrink-0 rounded-full transition-colors ${t.is_available ? 'bg-green-500' : 'bg-gray-300'}`}
              title={t.is_available ? 'Đang bán — bấm để tạm hết' : 'Tạm hết — bấm để bán lại'}
            >
              <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${t.is_available ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
            <span className={`flex-1 text-sm ${t.is_available ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{t.name}</span>
            <span className="text-sm text-gray-500">{formatVND(t.price)}</span>
            <button
              type="button"
              onClick={() => handleDelete(t)}
              disabled={isPending}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
              title="Xoá topping"
            >🗑️</button>
          </div>
        ))}
        {toppings.length === 0 && <p className="text-xs text-gray-400">Chưa có topping</p>}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Tên topping (VD: Thêm trứng)"
          className="input flex-1"
        />
        <input
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value)}
          type="number"
          min="0"
          placeholder="Giá"
          className="input w-24"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending}
          className="flex-shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
        >+ Thêm</button>
      </div>
    </div>
  )
}
```

Trong modal "Sửa món" (`{editItem && (... <ItemForm .../>)}`), thêm `ToppingEditor` ngay sau `<ItemForm>` (trong cùng `<Modal>`):
```tsx
      {editItem && (
        <Modal title="Sửa món" onClose={() => setEditItem(null)}>
          <ItemForm
            categories={categories}
            item={editItem}
            defaultCategoryId={editItem.category_id}
            onImage={setEditImage}
            submitLabel="Lưu"
            onSubmit={async (fd) => {
              if (editImage) fd.set('image', editImage)
              await updateMenuItem(editItem.id, fd)
              setEditItem(null)
              setEditImage(null)
              router.refresh()
            }}
            onCancel={() => setEditItem(null)}
          />
          <ToppingEditor item={editItem} router={router} />
        </Modal>
      )}
```

- [ ] **Step 4: Auto-open modal sửa món vừa tạo (ergonomics)**

Trong modal "Thêm món mới" (`{showAddItem && (...)}`), sửa `onSubmit` để mở ngay modal sửa món vừa tạo:
```tsx
            onSubmit={async (fd) => {
              if (addImage) fd.set('image', addImage)
              const newId = await addMenuItem(fd)
              setShowAddItem(false)
              setAddImage(null)
              router.refresh()
              // Mở ngay modal sửa để thêm topping cho món vừa tạo.
              // Bản ghi mới chưa có trong `categories` (chờ refresh) → dựng MenuItem tối thiểu từ form.
              setEditItem({
                id: newId,
                name: fd.get('name') as string,
                description: (fd.get('description') as string) || null,
                price: parseInt(fd.get('price') as string, 10),
                is_available: true,
                image_url: null,
                sort_order: 0,
                category_id: fd.get('category_id') as string,
                menu_item_toppings: [],
              })
            }}
```

- [ ] **Step 5: Type-check admin**

Run: `cd admin-web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add admin-web/app/admin/menu/menu-client.tsx
git commit -m "feat: admin quản lý topping trong modal sửa món + badge + auto-open edit

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Kitchen display — hiển thị topping từ snapshot

**Files:**
- Modify: `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx`

- [ ] **Step 1: Map `selectedToppings` từ snapshot (KHÔNG query bảng topping)**

Trong `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx`, tại `items.map((item) => ({...}))`, thêm field:
```tsx
    items: items.map((item) => ({
      id: item.id,
      menuItemId: item.menu_item_id ?? null,
      name: item.item_name,
      quantity: item.quantity,
      price: item.item_price,
      note: item.note ?? null,
      selectedToppings: (item.selected_toppings ?? []) as { id: string; name: string; price: number }[],
    })),
```
Tìm type `KitchenOrder` (hoặc type item tương ứng) trong file và thêm `selectedToppings: { id: string; name: string; price: number }[]` vào định nghĩa item. (Nếu type khai báo ở file khác, sửa nơi khai báo.)

- [ ] **Step 2: Render topping dưới tên món**

Tìm nơi render từng item của đơn trong JSX (hiển thị `item.name` + `×{item.quantity}`), thêm ngay dưới:
```tsx
                {item.selectedToppings.length > 0 && (
                  <div className="text-sm text-gray-500">
                    {item.selectedToppings.map((t) => `+ ${t.name}`).join(', ')}
                  </div>
                )}
```

- [ ] **Step 3: Type-check admin**

Run: `cd admin-web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx
git commit -m "feat: màn bếp hiển thị topping từ snapshot order_items

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: Verification tổng + checklist TESTING.md

**Files:**
- Modify: `TESTING.md` (thêm mục topping) — nếu chưa có file, tạo mục mới.

- [ ] **Step 1: Type-check cả hai app**

Run:
```bash
cd mini-app && npx tsc --noEmit && cd ../admin-web && npx tsc --noEmit
```
Expected: cả hai PASS, không lỗi.

- [ ] **Step 2: Build admin (đảm bảo server actions/route hợp lệ)**

Run: `cd admin-web && npm run build`
Expected: build thành công.

- [ ] **Step 3: Thêm checklist test thủ công vào `TESTING.md`**

Thêm section:
```markdown
## Topping món ăn (Sprint topping — 2026-06-30)

### Admin
- [ ] Sửa 1 món → thêm 2 topping (VD "Thêm trứng" 10000, "Quẩy" 5000) → reload thấy badge "2 topping".
- [ ] Toggle 1 topping sang "tạm hết" → topping đó không còn hiện trong mini-app.
- [ ] Xoá 1 topping → biến mất.
- [ ] Thêm MÓN MỚI → sau khi lưu tự mở modal sửa món vừa tạo, thêm được topping ngay.

### Mini-app
- [ ] Món KHÔNG topping: nút +/- quick-add hoạt động như cũ.
- [ ] Món CÓ topping: bấm "+" mở bottom sheet; tick topping thấy tổng tiền 1 suất cập nhật; "Thêm vào giỏ" = +1 suất.
- [ ] Thêm cùng món với 2 tổ hợp topping khác nhau → giỏ có 2 dòng riêng; cùng tổ hợp → gộp số lượng.
- [ ] Badge trên nút "+" của món có topping = tổng số mọi tổ hợp.
- [ ] Checkout: mỗi dòng hiện topping + đơn giá gồm topping; tổng tiền khớp.

### Đơn hàng (server đúng giá + snapshot)
- [ ] Đặt 1 đơn có topping → kiểm DB `order_items.selected_toppings` có `[{id,name,price}]`; `orders.total_amount` = Σ (giá món + Σ topping) × số lượng.
- [ ] Màn theo dõi đơn (mini-app): mỗi món hiện dòng "+ Trứng, + Quẩy"; tiền từng dòng đúng.
- [ ] Màn bếp: hiện topping dưới tên món.
- [ ] Đặt đơn với topping đã bị "tạm hết" (giả lập sửa client) → RPC từ chối (lỗi "Topping không hợp lệ").

### Deploy (BẮT BUỘC trước khi test đơn thật)
- [ ] Đã `cd mini-app && zmp deploy` bản mới (RPC v2 đã áp prod trước đó ở Task 1).
```

- [ ] **Step 4: Commit**

```bash
git add TESTING.md
git commit -m "docs: checklist test thủ công cho topping"
```

- [ ] **Step 5: DỪNG — báo anh Tú test theo TESTING.md**

Theo CLAUDE.md: KHÔNG tự chuyển task tiếp. Nói: *"Xong rồi anh, test theo TESTING.md — mục 'Topping món ăn' nhé. Lưu ý cần `zmp deploy` mini-app trước khi test đơn thật."*

---

## Lưu ý triển khai (rủi ro)

- **Thứ tự bắt buộc:** Task 1 (RPC v2 áp prod) phải xong TRƯỚC khi `zmp deploy` mini-app mới. RPC v2 vẫn tương thích payload cũ (item không có `topping_ids` → `[]`), nên không vỡ app đang chạy.
- **Đơn cũ:** `selected_toppings` mặc định `[]` → UI phải ẩn dòng topping khi rỗng (đã xử lý ở mọi nơi render).
- **`is_operator()`** đã tồn tại (migration 006b) — policy `auth_read_all_toppings` dùng lại, không định nghĩa lại.
- **Task 2 & 3, 10 & 11 đi cặp:** type mở rộng ở task trước có thể khiến task sau mới xanh hẳn; thực hiện liền nhau, đừng tách phiên.
```
