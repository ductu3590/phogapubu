# Tuỳ chọn quyết định giá cho món (menu item variants) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một dòng menu cho phép khách chọn 1 trong N lựa chọn (Tháp/Ca/Cốc, đĩa to/nhỏ, theo hãng), mỗi lựa chọn một giá tuyệt đối thay giá món.

**Architecture:** Thêm bảng `menu_item_variants` gắn theo món (không phải kho dùng chung như topping), giá tuyệt đối. Trigger đồng bộ `menu_items.price` = giá lựa chọn rẻ nhất còn bán để mọi câu truy vấn cũ tự hiện "Từ …đ". Hai RPC tạo đơn (`create_order`, `staff_create_order`) bắt buộc có `variant_id` cho món có biến thể, lấy giá từ CSDL, ghép tên vào `order_items.item_name` để 7 màn hiển thị chạy đúng mà không phải sửa. Topping giữ nguyên hoàn toàn.

**Tech Stack:** Postgres/Supabase (migration + PL/pgSQL RPC), Next.js 16 + React 19 (admin-web), Zalo Mini App + React + zustand (mini-app), vitest cả hai bên.

**Spec:** [docs/superpowers/specs/2026-09-01-menu-item-variants-design.md](../specs/2026-09-01-menu-item-variants-design.md)

---

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `supabase/migrations/042_menu_item_variants.sql` | Bảng, cột, trigger, RLS, hai RPC |
| `admin-web/lib/menu/variant.ts` | Hàm thuần: validate input biến thể, tính giá hiển thị |
| `admin-web/lib/menu/variant.test.ts` | Test cho trên |
| `admin-web/lib/actions/menu.ts` | Thêm 5 server action CRUD biến thể |
| `admin-web/lib/actions/menu-variant.test.ts` | Test guard "biến thể thuộc đúng quán" |
| `admin-web/app/admin/menu/page.tsx` | Query kèm `menu_item_variants` |
| `admin-web/app/admin/menu/menu-client.tsx` | Component `ItemVariantEditor` trong modal sửa món |
| `admin-web/app/staff/order/page.tsx` + `staff-order-client.tsx` | Đặt hộ: bắt chọn biến thể |
| `admin-web/lib/actions/staff-order.ts` | Truyền `variant_id` xuống RPC |
| `mini-app/src/types/product.types.ts` | Kiểu `Variant`, `Product.variants` |
| `mini-app/src/types/cart.types.ts` | `CartItem.variant` |
| `mini-app/src/types/order.types.ts` | `variantId` trong request tạo đơn |
| `mini-app/src/utils/cart-key.ts` | Hàm thuần sinh id dòng giỏ (tách khỏi store để test được) |
| `mini-app/src/utils/cart-key.test.ts` | Test cho trên |
| `mini-app/src/services/category/category.api.ts` | Đọc biến thể từ Supabase |
| `mini-app/src/services/order/order.api.ts` | Gửi `variant_id` |
| `mini-app/src/components/menu/option-sheet.tsx` | Đổi tên từ `topping-sheet.tsx`, gánh cả hai |
| `mini-app/src/pages/menu/index.tsx` | Mở sheet khi có biến thể, hiện "Từ …đ" |
| `mini-app/src/pages/checkout/index.tsx` | Hiện tên biến thể ở dòng giỏ, gửi `variantId` |
| `mini-app/src/stores/cart.store.tsx` | Dùng `buildCartItemId` |
| `TESTING.md` | Mục kiểm thử mới |
| `CLAUDE.md` | Một dòng lịch sử quyết định |

---

## Task 0: Gộp nhánh — BẮT BUỘC LÀM TRƯỚC

⚠️ **Không được bỏ qua.** `main` thiếu mig 039+040; `create_order` trên prod là bản 12 tham số của mig 040. Viết migration dựa trên file `main` sẽ ghi đè hàm prod bằng bản 10 tham số cũ và **xoá logic phiên bàn/lớp Mâm của Bảo Lương đang chạy thật**.

**Files:** không tạo file mới.

- [ ] **Step 1: Xác nhận hiện trạng hai nhánh**

```bash
git log --oneline feat/postpay-table-session..main
```

Kỳ vọng: 3 commit (`6a74131` mig 041, `7449494` fix khung lồng nhau, `7b8f7bd` module tài khoản).

- [ ] **Step 2: Gộp nhánh postpay vào main**

```bash
git checkout main && git merge feat/postpay-table-session
```

Nếu xung đột: hai nhánh đụng `CLAUDE.md` (bảng lịch sử quyết định) và có thể `TESTING.md`. Giữ **cả hai** khối, xếp theo ngày. Không có xung đột nào ở migration vì số hiệu file khác nhau.

- [ ] **Step 3: Kiểm tra file migration đã đủ 039→041**

```bash
ls supabase/migrations/ | tail -5
```

Kỳ vọng thấy `038_`, `039_`, `040_`, `041_`.

- [ ] **Step 4: Build + test không hỏng**

```bash
cd admin-web && npm run build && npm test
```

Kỳ vọng: build thành công, toàn bộ test PASS.

- [ ] **Step 5: Đối chiếu định nghĩa `create_order` trên prod khớp file 040**

Chạy qua Supabase MCP (`execute_sql`, project `dlkgdpexjtyynbotkwka`):

```sql
select pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'create_order';
```

**Lưu toàn bộ kết quả này lại** — Task 2 sẽ vá trực tiếp lên nó. Kỳ vọng: 12 tham số, có nhắc tới `table_sessions` và `voucher_discount`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: gop feat/postpay-table-session vao main truoc khi lam variants"
```

---

## Task 1: Migration 042 — bảng, cột, trigger, RLS

**Files:**
- Create: `supabase/migrations/042_menu_item_variants.sql`

- [ ] **Step 1: Viết phần schema của migration**

Tạo `supabase/migrations/042_menu_item_variants.sql` với nội dung dưới đây. (Phần RPC thêm ở Task 2, **chưa** chạy migration ở task này.)

```sql
-- 042 — Tuỳ chọn quyết định giá cho món (menu item variants)
-- Một món = tối đa MỘT nhóm "chọn loại", chọn đúng 1, bắt buộc, giá TUYỆT ĐỐI thay giá món.
-- Chạy song song với topping (mig 015/016) — không đụng gì tới topping.
-- Spec: docs/superpowers/specs/2026-09-01-menu-item-variants-design.md
-- Idempotent: rerun-safe.

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
  CONSTRAINT miv_item_store_fkey
    FOREIGN KEY (menu_item_id, store_id)
    REFERENCES menu_items (id, store_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_miv_lookup
  ON menu_item_variants (menu_item_id, is_available, sort_order);

-- ─── 2. Nhãn nhóm hiện cho khách ────────────────────────────────────────────
-- NULL → mini-app hiện 'Chọn loại'
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS variant_group_name text;

-- ─── 3. Snapshot vào đơn ────────────────────────────────────────────────────
-- KHÔNG đặt FK: snapshot phải sống sót khi biến thể bị xoá khỏi menu.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id   uuid;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_name text;

-- ─── 4. Trigger đồng bộ giá hiển thị ────────────────────────────────────────
-- menu_items.price := giá biến thể RẺ NHẤT còn bán.
-- Mục đích: mọi câu truy vấn cũ đang đọc menu_items.price tự có số đúng để
-- hiện "Từ …đ" mà không phải sửa và không phải join thêm.
-- Nếu không còn biến thể nào còn bán → GIỮ NGUYÊN giá cũ, không ghi đè.
CREATE OR REPLACE FUNCTION sync_menu_item_price_from_variants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id  uuid;
  v_min int;
BEGIN
  -- Chạy cho cả món cũ lẫn món mới: phòng ca UPDATE đổi menu_item_id.
  FOREACH v_id IN ARRAY (
    SELECT array_agg(DISTINCT x) FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.menu_item_id END,
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.menu_item_id END
    ]) AS x WHERE x IS NOT NULL
  ) LOOP
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

-- ─── 5. RLS — khuôn toppings BẢN ĐÃ ĐƯỢC MIG 019 VIẾT LẠI ───────────────────
-- KHÔNG dùng is_operator(): hàm đó chỉ hỏi "có phải người vận hành nào đó không",
-- không hỏi "của quán nào" → chủ quán A đọc được menu quán B. Mig 019 sinh ra để
-- vá đúng lớp lỗi này và đã đổi policy toppings sang is_store_scoped_operator.
ALTER TABLE menu_item_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_variants" ON menu_item_variants;
CREATE POLICY "anon_read_variants" ON menu_item_variants
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "auth_read_variants" ON menu_item_variants;
CREATE POLICY "auth_read_variants" ON menu_item_variants
  FOR SELECT TO authenticated USING (is_store_scoped_operator(store_id));
-- Ghi: chỉ service-role (bypass RLS). Không policy cho role kitchen —
-- bếp chỉ đọc snapshot order_items.item_name / variant_name.
```

- [ ] **Step 2: Áp phần schema lên prod**

Chạy toàn bộ nội dung file qua Supabase MCP `apply_migration` (project `dlkgdpexjtyynbotkwka`, name `042_menu_item_variants`).

- [ ] **Step 3: Kiểm tra trigger chạy đúng — ca cơ bản**

```sql
-- Dùng một món thật của Bảo Lương làm chuột bạch
with m as (select id, store_id, price from menu_items
           where store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8' and name='Nước ngọt')
insert into menu_item_variants (menu_item_id, store_id, name, price, sort_order)
select id, store_id, v.n, v.p, v.s from m,
  (values ('Lon',15000,1),('Chai',20000,2)) as v(n,p,s);

select name, price from menu_items where name='Nước ngọt'
  and store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8';
```

Kỳ vọng: `price` = **15000** (giá rẻ nhất), không phải 15000 do trùng hợp — đổi thử giá Lon thành 12000 rồi xem `price` có thành 12000 không.

- [ ] **Step 4: Kiểm tra ca "tắt hết biến thể thì giữ nguyên giá"**

```sql
update menu_item_variants set is_available = false
 where menu_item_id = (select id from menu_items where name='Nước ngọt'
   and store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8');
select price from menu_items where name='Nước ngọt'
  and store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8';
```

Kỳ vọng: giá **không đổi** (không bị set NULL, không lỗi).

- [ ] **Step 5: Dọn dữ liệu chuột bạch**

```sql
delete from menu_item_variants
 where menu_item_id = (select id from menu_items where name='Nước ngọt'
   and store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8');
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/042_menu_item_variants.sql
git commit -m "feat(db): bang menu_item_variants + trigger dong bo gia + RLS (mig 042)"
```

---

## Task 2: Hai RPC tạo đơn bắt buộc chọn biến thể

**Files:**
- Modify: `supabase/migrations/042_menu_item_variants.sql` (thêm phần 6 và 7)

⚠️ **Cách làm bắt buộc:** lấy định nghĩa **đang chạy trên prod** (đã lưu ở Task 0 Step 5), chèn khối biến thể vào, dán **toàn bộ** hàm vào file 042. **Không** copy thân hàm từ file migration cũ — file 040 có thể đã lệch so với prod.

- [ ] **Step 1: Lấy lại định nghĩa cả hai hàm trên prod**

```sql
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in ('create_order','staff_create_order');
```

- [ ] **Step 2: Chèn khối biến thể vào `create_order`**

Trong khối `DECLARE`, thêm:

```sql
  v_variant      menu_item_variants%ROWTYPE;
  v_variant_id   uuid;
  v_variant_cnt  int;
  v_item_price   int;
  v_item_name    text;
  v_variant_name text;
```

Trong vòng lặp `FOR v_item IN ...`, **ngay sau** khối tra `menu_items` (dòng kết thúc bằng `RAISE EXCEPTION 'Món không thuộc quán hoặc ngừng bán: %'`) và **trước** khối topping (`v_item_toppings := '[]'::jsonb;`), chèn:

```sql
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
```

- [ ] **Step 3: Đổi câu INSERT và dòng cộng tiền trong `create_order`**

Thay:

```sql
    INSERT INTO order_items (order_id, menu_item_id, item_name, item_price, quantity, note, selected_toppings)
    VALUES (v_order.id, v_menu.id, v_menu.name, v_menu.price, v_qty, v_item->>'note', v_item_toppings);
    v_total := v_total + (v_menu.price + v_topping_total) * v_qty;
```

Bằng:

```sql
    INSERT INTO order_items (order_id, menu_item_id, item_name, item_price, quantity, note,
                             selected_toppings, variant_id, variant_name)
    VALUES (v_order.id, v_menu.id, v_item_name, v_item_price, v_qty, v_item->>'note',
            v_item_toppings, v_variant_id, v_variant_name);
    v_total := v_total + (v_item_price + v_topping_total) * v_qty;
```

- [ ] **Step 4: Làm y hệt cho `staff_create_order`**

Cùng khối `DECLARE`, cùng khối chèn, cùng câu INSERT. **Khác biệt duy nhất:** hàm này dùng biến `v_store` thay cho `p_store_id`, nên dòng tra biến thể là:

```sql
         AND store_id = v_store AND is_available = true;
```

Kiểm tra tên biến snapshot của hàm này (`v_item_tops`, `v_top_total` thay vì `v_item_toppings`, `v_topping_total`) và dùng đúng tên đang có.

- [ ] **Step 5: Giữ nguyên GRANT ở cuối mỗi hàm**

Chép nguyên xi hai dòng `REVOKE`/`GRANT` đang có sau mỗi định nghĩa. Thiếu chúng thì mini-app (role `anon`) mất quyền gọi `create_order` → **toàn bộ khách không đặt được món**.

- [ ] **Step 6: Áp lên prod**

Chạy phần 6+7 của file 042 qua `execute_sql`.

- [ ] **Step 7: Smoke test tầng CSDL — 8 ca**

Tạo dữ liệu tạm rồi chạy từng ca. Dùng một món Bảo Lương và một bàn thật.

```sql
-- Chuẩn bị: gắn 2 biến thể cho 'Nước ngọt'
with m as (select id, store_id from menu_items
           where store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8' and name='Nước ngọt')
insert into menu_item_variants (menu_item_id, store_id, name, price, sort_order)
select id, store_id, v.n, v.p, v.s from m, (values ('Lon',15000,1),('Chai',20000,2)) as v(n,p,s)
returning id, name;
```

| Ca | Gọi `create_order` với | Kỳ vọng |
|---|---|---|
| 1 | món có biến thể, **không** `variant_id` | lỗi `Món cần chọn loại: Nước ngọt` |
| 2 | `variant_id` của món khác | lỗi `Lựa chọn không hợp lệ hoặc đã hết` |
| 3 | `variant_id` của quán khác | lỗi `Lựa chọn không hợp lệ hoặc đã hết` |
| 4 | `variant_id` đã `is_available=false` | lỗi `Lựa chọn không hợp lệ hoặc đã hết` |
| 5 | món **thường** + có gửi `variant_id` | lỗi `Món không có tuỳ chọn` |
| 6 | đúng, chọn 'Chai' | `item_price=20000`, `item_name='Nước ngọt (Chai)'`, `variant_name='Chai'`, `total_amount=20000×qty` |
| 7 | đúng + kèm topping | tiền = `20000 + topping` |
| 8 | tắt **hết** biến thể rồi đặt món đó | lỗi (KHÔNG được rơi về giá món cũ) |

Ví dụ ca 6:

```sql
select create_order(
  '2139c162-9677-4cbd-87e3-d2e1ac22e6e8'::uuid,
  (select id from tables where store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8' limit 1),
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', (select id from menu_items where name='Nước ngọt'
                      and store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8'),
    'quantity', 2,
    'variant_id', '<id biến thể Chai>')),
  'cash');
```

- [ ] **Step 8: Không hồi quy — đặt một đơn món thường**

Đặt đơn một món KHÔNG có biến thể ở Phở Gà Pubu (`87f4c6bc-07b5-4dcd-99d8-067f3417ab5e`) kèm topping. Kỳ vọng: chạy đúng như trước, `variant_id`/`variant_name` = NULL.

- [ ] **Step 9: Xoá đơn test và dữ liệu chuột bạch**

```sql
delete from order_items where order_id in (
  select id from orders where store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8'
    and created_at > now() - interval '1 hour');
delete from orders where store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8'
  and created_at > now() - interval '1 hour';
delete from menu_item_variants where menu_item_id =
  (select id from menu_items where name='Nước ngọt'
    and store_id='2139c162-9677-4cbd-87e3-d2e1ac22e6e8');
```

- [ ] **Step 10: Sinh lại types**

```bash
```
Chạy Supabase MCP `generate_typescript_types` rồi ghi đè `admin-web/types/database.types.ts` và `mini-app/src/types/database.types.ts`.

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/042_menu_item_variants.sql admin-web/types/database.types.ts mini-app/src/types/database.types.ts
git commit -m "feat(db): create_order + staff_create_order bat buoc chon bien the (mig 042)"
```

---

## Task 3: Hàm thuần sinh id dòng giỏ (mini-app)

Tách `generateCartItemId` khỏi store để test được, rồi thêm biến thể vào khoá.

**Files:**
- Create: `mini-app/src/utils/cart-key.ts`
- Create: `mini-app/src/utils/cart-key.test.ts`
- Modify: `mini-app/src/types/cart.types.ts`
- Modify: `mini-app/src/stores/cart.store.tsx:24-32`

- [ ] **Step 1: Thêm `variant` vào `CartItem`**

Sửa `mini-app/src/types/cart.types.ts`, thêm vào `interface CartItem`:

```ts
  // Lựa chọn quyết định giá (Tháp/Ca/Cốc). Không có = món thường.
  // basePrice của dòng giỏ = variant.price khi có biến thể → calculateTotals không phải sửa.
  variant?: { id: string; name: string; price: number };
```

- [ ] **Step 2: Viết test trước (chưa có file cài đặt)**

Tạo `mini-app/src/utils/cart-key.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildCartItemId } from './cart-key'

// Khoá dòng giỏ quyết định món nào gộp với món nào. Sai khoá = khách chọn
// đĩa to rồi chọn đĩa nhỏ lại bị cộng dồn thành 2 đĩa to → tính sai tiền.
const mon = (over: Partial<Parameters<typeof buildCartItemId>[0]> = {}) => ({
  productId: 'pho-ga',
  selectedVariants: [],
  ...over,
})

describe('buildCartItemId', () => {
  it('món thường: khoá là chính productId', () => {
    expect(buildCartItemId(mon())).toBe('pho-ga')
  })

  it('hai biến thể khác nhau cho ra hai khoá khác nhau', () => {
    const to = buildCartItemId(mon({ variant: { id: 'v-to', name: 'Đĩa to', price: 80000 } }))
    const nho = buildCartItemId(mon({ variant: { id: 'v-nho', name: 'Đĩa nhỏ', price: 50000 } }))
    expect(to).not.toBe(nho)
  })

  it('cùng biến thể cùng topping cho ra cùng khoá (để gộp số lượng)', () => {
    const a = mon({
      variant: { id: 'v-to', name: 'Đĩa to', price: 80000 },
      selectedVariants: [{ groupId: 'topping', groupTitle: 'Topping', optionId: 't1', optionName: 'Trứng', extraPrice: 10000 }],
    })
    expect(buildCartItemId(a)).toBe(buildCartItemId({ ...a }))
  })

  it('thứ tự tích topping không làm đổi khoá', () => {
    const t1 = { groupId: 'topping', groupTitle: 'Topping', optionId: 't1', optionName: 'A', extraPrice: 0 }
    const t2 = { groupId: 'topping', groupTitle: 'Topping', optionId: 't2', optionName: 'B', extraPrice: 0 }
    expect(buildCartItemId(mon({ selectedVariants: [t1, t2] })))
      .toBe(buildCartItemId(mon({ selectedVariants: [t2, t1] })))
  })

  it('cùng biến thể khác topping = hai dòng riêng', () => {
    const v = { id: 'v-to', name: 'Đĩa to', price: 80000 }
    const a = buildCartItemId(mon({ variant: v, selectedVariants: [] }))
    const b = buildCartItemId(mon({
      variant: v,
      selectedVariants: [{ groupId: 'topping', groupTitle: 'Topping', optionId: 't1', optionName: 'Trứng', extraPrice: 10000 }],
    }))
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 3: Chạy test, xác nhận FAIL**

```bash
cd mini-app && npx vitest run src/utils/cart-key.test.ts
```

Kỳ vọng: FAIL — `Failed to resolve import "./cart-key"`.

- [ ] **Step 4: Viết cài đặt tối thiểu**

Tạo `mini-app/src/utils/cart-key.ts`:

```ts
import { CartItem } from "@/types/cart.types";

// Khoá dòng giỏ = món + biến thể + tổ hợp topping (đã sort).
// Cùng khoá thì cộng dồn số lượng; khác khoá thì thành dòng riêng.
export const buildCartItemId = (
  item: Pick<CartItem, "productId" | "selectedVariants"> & Pick<Partial<CartItem>, "variant">,
): string => {
  const toppingIds = item.selectedVariants
    .filter((v) => v.groupId === "topping")
    .map((v) => v.optionId)
    .sort();
  return [item.productId, item.variant?.id ?? "", toppingIds.join(",")]
    .join("|")
    .replace(/\|+$/, "");
};
```

- [ ] **Step 5: Chạy test, xác nhận PASS**

```bash
cd mini-app && npx vitest run src/utils/cart-key.test.ts
```

Kỳ vọng: 5 test PASS.

- [ ] **Step 6: Cho store dùng hàm mới**

Trong `mini-app/src/stores/cart.store.tsx`, xoá hàm `generateCartItemId` (dòng 24–32) và thay bằng import:

```ts
import { buildCartItemId } from "@/utils/cart-key";
```

Đổi mọi chỗ gọi `generateCartItemId(` thành `buildCartItemId(`.

- [ ] **Step 7: Chạy toàn bộ test mini-app**

```bash
cd mini-app && npx vitest run
```

Kỳ vọng: tất cả PASS, đặc biệt `cart.store.test.ts` không hỏng.

- [ ] **Step 8: Commit**

```bash
git add mini-app/src/utils/cart-key.ts mini-app/src/utils/cart-key.test.ts mini-app/src/types/cart.types.ts mini-app/src/stores/cart.store.tsx
git commit -m "feat(mini-app): khoa dong gio tinh ca bien the (buildCartItemId + test)"
```

---

## Task 4: Mini-app đọc biến thể từ Supabase

**Files:**
- Modify: `mini-app/src/types/product.types.ts`
- Modify: `mini-app/src/services/category/category.api.ts:1-45`

- [ ] **Step 1: Thêm kiểu `Variant`**

Trong `mini-app/src/types/product.types.ts`, thêm trên `interface Product`:

```ts
// Lựa chọn quyết định giá của món (Tháp/Ca/Cốc, đĩa to/nhỏ).
// price là giá TUYỆT ĐỐI, không phải phụ thu.
export interface Variant {
  id: string;
  name: string;
  price: number;
}
```

Và thêm hai trường vào `interface Product`:

```ts
  variants: Variant[];             // CHỈ chứa biến thể còn bán; [] nếu món không có
  hasVariantGroup: boolean;        // món CÓ nhóm biến thể hay không, KHÔNG lọc còn-bán
  variantGroupName: string | null; // nhãn hiện cho khách; null → 'Chọn loại'
```

⚠️ **Phải có `hasVariantGroup` riêng.** `variants` đã lọc còn-bán, nên món tắt hết lựa chọn sẽ có `variants: []` — không phân biệt được với món thường. Nếu lấy `variantGroupName !== null` làm dấu hiệu thay thế thì món có biến thể mà admin chưa đặt tên nhóm sẽ bị coi là món thường và **hiện giá cũ cho khách bấm đặt, để server từ chối**. Đây đúng là cái bẫy mà `create_order` tránh bằng cách đếm TỔNG biến thể (Task 2 Step 2).

- [ ] **Step 2: Đọc biến thể trong `category.api.ts`**

Thêm hàm map ngay dưới `mapToppings`:

```ts
function mapVariants(rows: Record<string, unknown>[] | null | undefined): Variant[] {
  return (rows ?? [])
    .filter((v) => v.is_available === true)
    .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
    .map((v) => ({ id: v.id as string, name: v.name as string, price: v.price as number }));
}
```

Thêm vào `mapProduct` (trong object trả về):

```ts
    variants: mapVariants(row.menu_item_variants as Record<string, unknown>[] | undefined),
    hasVariantGroup: ((row.menu_item_variants as unknown[] | undefined) ?? []).length > 0,
    variantGroupName: (row.variant_group_name as string | null) ?? null,
```

`hasVariantGroup` đếm mảng **thô** (chưa lọc `is_available`), `variants` đếm mảng **đã lọc** — hai con số khác nhau là chủ ý.

Sửa import dòng 3 thành `import { Product, Topping, Variant } from "@/types/product.types";`

Sửa câu select (dòng 33) thành:

```ts
        "*, menu_items(*, menu_item_toppings(toppings(id, name, price, is_available, sort_order)), menu_item_variants(id, name, price, is_available, sort_order))",
```

- [ ] **Step 3: Sửa các mock cho khỏi vỡ kiểu**

```bash
cd mini-app && npx tsc --noEmit
```

Kỳ vọng: báo lỗi thiếu `variants`/`variantGroupName` ở `src/services/product/product.mock.ts` (và có thể `order.mock.ts`). Thêm `variants: [], variantGroupName: null` vào từng object mock cho tới khi sạch lỗi.

- [ ] **Step 4: Xác nhận type-check sạch**

```bash
cd mini-app && npx tsc --noEmit
```

Kỳ vọng: không lỗi.

- [ ] **Step 5: Commit**

```bash
git add mini-app/src/types/product.types.ts mini-app/src/services/category/category.api.ts mini-app/src/services/product/product.mock.ts
git commit -m "feat(mini-app): doc menu_item_variants tu Supabase"
```

---

## Task 5: `OptionSheet` — sheet chọn biến thể + topping

**Files:**
- Rename: `mini-app/src/components/menu/topping-sheet.tsx` → `mini-app/src/components/menu/option-sheet.tsx`
- Modify: `mini-app/src/pages/menu/index.tsx`

- [ ] **Step 1: Đổi tên file**

```bash
cd mini-app && git mv src/components/menu/topping-sheet.tsx src/components/menu/option-sheet.tsx
```

- [ ] **Step 2: Viết lại `option-sheet.tsx`**

Thay toàn bộ nội dung file bằng:

```tsx
import { useState } from "react";
import { Sheet } from "zmp-ui";
import { Product, Variant } from "@/types/product.types";
import { SelectedVariant } from "@/types/cart.types";
import { formatCurrency } from "@/utils/format";
import { cn } from "@/utils/cn";

interface OptionSheetProps {
  product: Product | null;
  visible: boolean;
  onClose: () => void;
  // variant = lựa chọn quyết định giá (null nếu món không có);
  // toppings = phụ thu tích thêm
  onConfirm: (variant: Variant | null, toppings: SelectedVariant[]) => void;
}

export default function OptionSheet({ product, visible, onClose, onConfirm }: OptionSheetProps) {
  const [selectedToppings, setSelectedToppings] = useState<Set<string>>(new Set());
  // KHÔNG chọn sẵn lựa chọn đầu tiên: bắt khách nhìn giá rồi mới bấm,
  // tránh cảnh vô ý đặt tháp bia 200k.
  const [variantId, setVariantId] = useState<string | null>(null);

  const reset = () => {
    setSelectedToppings(new Set());
    setVariantId(null);
  };
  const handleClose = () => {
    reset();
    onClose();
  };

  if (!product) return null;

  const hasVariants = product.variants.length > 0;
  const variant = product.variants.find((v) => v.id === variantId) ?? null;
  const canConfirm = !hasVariants || variant !== null;

  const toggleTopping = (id: string) => {
    setSelectedToppings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toppingTotal = product.toppings
    .filter((t) => selectedToppings.has(t.id))
    .reduce((s, t) => s + t.price, 0);
  // Có biến thể thì giá gốc là giá biến thể, không phải product.price
  const unitPrice = (variant ? variant.price : product.price) + toppingTotal;

  const handleConfirm = () => {
    if (!canConfirm) return;
    const toppings: SelectedVariant[] = product.toppings
      .filter((t) => selectedToppings.has(t.id))
      .map((t) => ({
        groupId: "topping",
        groupTitle: "Topping",
        optionId: t.id,
        optionName: t.name,
        extraPrice: t.price,
        quantity: 1,
      }));
    onConfirm(variant, toppings);
    reset();
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
            <p className="text-small text-text-secondary">
              {hasVariants ? "Từ " : ""}{formatCurrency(product.price)}đ
            </p>
          </div>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-2">
          {hasVariants && (
            <>
              <p className="py-2 text-small-m font-semibold text-text-secondary">
                {product.variantGroupName ?? "Chọn loại"}{" "}
                <span className="font-normal text-primary">(bắt buộc)</span>
              </p>
              {product.variants.map((v) => (
                <button key={v.id} onClick={() => setVariantId(v.id)}
                  className="flex w-full items-center gap-3 border-b border-neutral100 py-3 text-left">
                  <span className={cn(
                    "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    variantId === v.id ? "border-primary" : "border-neutral300",
                  )}>
                    {variantId === v.id && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                  </span>
                  <span className="flex-1 text-normal text-text-primary">{v.name}</span>
                  <span className="text-normal-sb font-semibold text-text-primary">
                    {formatCurrency(v.price)}đ
                  </span>
                </button>
              ))}
            </>
          )}

          {product.toppings.length > 0 && (
            <>
              <p className="py-2 text-small-m font-semibold text-text-secondary">Chọn thêm topping</p>
              {product.toppings.map((t) => {
                const checked = selectedToppings.has(t.id);
                return (
                  <button key={t.id} onClick={() => toggleTopping(t.id)}
                    className="flex w-full items-center gap-3 border-b border-neutral100 py-3 text-left">
                    <span className={cn(
                      "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors",
                      checked ? "border-primary bg-primary" : "border-neutral300",
                    )}>
                      {checked && <span className="text-xxsmall font-bold text-white">✓</span>}
                    </span>
                    <span className="flex-1 text-normal text-text-primary">{t.name}</span>
                    <span className="text-small text-text-secondary">+{formatCurrency(t.price)}đ</span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="border-t border-neutral100 p-4">
          <button onClick={handleConfirm} disabled={!canConfirm}
            className={cn(
              "w-full rounded-xl py-3 text-normal-sb font-semibold text-white transition-opacity",
              canConfirm ? "bg-primary" : "bg-neutral300",
            )}>
            {canConfirm
              ? `Thêm vào giỏ — ${formatCurrency(unitPrice)}đ`
              : `Chọn ${(product.variantGroupName ?? "loại").toLowerCase()} để tiếp tục`}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
```

⚠️ Biến thể đã tắt bán **không xuất hiện** trong `product.variants` (đã lọc ở `mapVariants` — Task 4). Món tắt hết biến thể sẽ có `variants: []` → xử lý ở Step 4 dưới đây.

- [ ] **Step 3: Sửa trang menu gọi sheet mới**

Trong `mini-app/src/pages/menu/index.tsx`:

Dòng 7, đổi import:

```tsx
import OptionSheet from "@/components/menu/option-sheet";
```

Dòng 76, đổi tên state cho đúng nghĩa:

```tsx
  const [optionProduct, setOptionProduct] = useState<Product | null>(null);
```

Trong `handleAdd`, đổi điều kiện mở sheet (dòng 100–102):

```tsx
    if (product.variants.length > 0 || product.toppings.length > 0) {
      setOptionProduct(product);
      return;
    }
```

Thay `handleConfirmToppings` (dòng 119–130) bằng:

```tsx
  const handleConfirmOptions = (variant: Variant | null, toppings: SelectedVariant[]) => {
    if (!optionProduct) return;
    addToCart({
      productId: optionProduct.id,
      productName: optionProduct.name,
      productImage: optionProduct.image ?? "",
      // Có biến thể → giá dòng giỏ là giá biến thể
      basePrice: variant ? variant.price : optionProduct.price,
      variant: variant ? { id: variant.id, name: variant.name, price: variant.price } : undefined,
      selectedVariants: toppings,
      quantity: 1,
    });
    setOptionProduct(null);
  };
```

Thêm `Variant` vào import kiểu ở đầu file.

Thay khối JSX (dòng 265–270):

```tsx
      <OptionSheet
        product={optionProduct}
        visible={optionProduct !== null}
        onClose={() => setOptionProduct(null)}
        onConfirm={handleConfirmOptions}
      />
```

- [ ] **Step 4: Card món — "Từ …đ", tắt hết biến thể = tạm hết**

Trong component card (dòng ~332), thay:

```tsx
  const hasToppings = product.toppings.length > 0;
```

bằng:

```tsx
  const hasVariants = product.variants.length > 0;
  // Món CÓ nhóm biến thể nhưng tắt bán hết mọi lựa chọn → coi như tạm hết.
  // Dùng hasVariantGroup (đếm thô) chứ KHÔNG dùng variantGroupName: món có biến
  // thể mà admin chưa đặt tên nhóm vẫn phải bị coi là món có biến thể.
  const soldOutByVariants = product.hasVariantGroup && !hasVariants;
  const available = product.isAvailable && !soldOutByVariants;
  // Có tuỳ chọn → không cho bấm +/- ngay trên card, phải mở sheet
  const hasOptions = hasVariants || product.toppings.length > 0;
```

Đổi mọi chỗ dùng `product.isAvailable` trong card thành `available`, và mọi chỗ dùng `hasToppings` thành `hasOptions`.

Đổi dòng hiện giá (dòng ~374):

```tsx
          <span className="font-semibold text-primary">
            {hasVariants ? "Từ " : ""}{formatCurrency(product.price)}đ
          </span>
```

- [ ] **Step 5: Type-check**

```bash
cd mini-app && npx tsc --noEmit
```

Kỳ vọng: không lỗi.

- [ ] **Step 6: Commit**

```bash
git add mini-app/src/components/menu/option-sheet.tsx mini-app/src/pages/menu/index.tsx
git commit -m "feat(mini-app): OptionSheet chon bien the bat buoc + topping trong 1 sheet"
```

---

## Task 6: Gửi `variant_id` khi tạo đơn + hiện tên biến thể ở giỏ

**Files:**
- Modify: `mini-app/src/types/order.types.ts`
- Modify: `mini-app/src/services/order/order.api.ts:26-31`
- Modify: `mini-app/src/pages/checkout/index.tsx:234-243, 477-495`

- [ ] **Step 1: Thêm `variantId` vào kiểu request**

Trong `mini-app/src/types/order.types.ts`, tìm kiểu item của `CreateOrderRequest` (có `menuItemId`, `quantity`, `toppingIds`) và thêm:

```ts
  variantId?: string;
```

- [ ] **Step 2: Gửi xuống RPC**

Trong `mini-app/src/services/order/order.api.ts`, khối `p_items: req.items.map(...)` (dòng 26–31), thêm dòng:

```ts
        variant_id: item.variantId ?? null,
```

- [ ] **Step 3: Checkout gửi biến thể lên**

Trong `mini-app/src/pages/checkout/index.tsx`, khối `items: cartItems.map(...)` (dòng 234), thêm:

```tsx
          variantId: item.variant?.id,
```

- [ ] **Step 4: Dòng giỏ hiện tên biến thể**

Trong cùng file, trong khối render từng `item` (dòng ~477–495), ngay dưới dòng hiện tên món, thêm:

```tsx
                  {item.variant && (
                    <p className="text-xxsmall text-text-secondary">{item.variant.name}</p>
                  )}
```

- [ ] **Step 5: Type-check + test**

```bash
cd mini-app && npx tsc --noEmit && npx vitest run
```

Kỳ vọng: không lỗi, toàn bộ test PASS.

- [ ] **Step 6: Commit**

```bash
git add mini-app/src/types/order.types.ts mini-app/src/services/order/order.api.ts mini-app/src/pages/checkout/index.tsx
git commit -m "feat(mini-app): gui variant_id khi tao don + hien ten bien the o gio"
```

---

## Task 7: Server actions CRUD biến thể (admin)

**Files:**
- Create: `admin-web/lib/menu/variant.ts`
- Create: `admin-web/lib/menu/variant.test.ts`
- Modify: `admin-web/lib/actions/menu.ts`

- [ ] **Step 1: Viết test trước**

Tạo `admin-web/lib/menu/variant.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseVariantInput, displayPriceLabel } from './variant'

// Giá biến thể do người gõ tay từ tờ menu giấy. Hai lỗi hay gặp:
// gõ nhầm chữ vào ô giá, và để trống tên.
describe('parseVariantInput', () => {
  it('nhận tên và giá hợp lệ', () => {
    expect(parseVariantInput(' Đĩa to ', '80000')).toEqual({ ok: true, name: 'Đĩa to', price: 80000 })
  })

  it('từ chối tên rỗng', () => {
    expect(parseVariantInput('   ', '80000')).toEqual({ ok: false, error: 'Nhập tên lựa chọn' })
  })

  it('từ chối giá không phải số', () => {
    expect(parseVariantInput('Đĩa to', 'tám mươi nghìn')).toEqual({ ok: false, error: 'Giá phải là số ≥ 0' })
  })

  it('từ chối giá âm', () => {
    expect(parseVariantInput('Đĩa to', '-1')).toEqual({ ok: false, error: 'Giá phải là số ≥ 0' })
  })

  it('chấp nhận giá 0 (món tặng kèm)', () => {
    expect(parseVariantInput('Cỡ thường', '0')).toEqual({ ok: true, name: 'Cỡ thường', price: 0 })
  })
})

describe('displayPriceLabel', () => {
  it('món thường: hiện giá trần trụi', () => {
    expect(displayPriceLabel(50000, false)).toBe('50.000đ')
  })

  it('món có biến thể: hiện "Từ"', () => {
    expect(displayPriceLabel(50000, true)).toBe('Từ 50.000đ')
  })
})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

```bash
cd admin-web && npx vitest run lib/menu/variant.test.ts
```

Kỳ vọng: FAIL — không resolve được `./variant`.

- [ ] **Step 3: Viết cài đặt**

Tạo `admin-web/lib/menu/variant.ts`:

```ts
// Hàm thuần cho biến thể món — tách khỏi server action để test được.

export type ParseResult =
  | { ok: true; name: string; price: number }
  | { ok: false; error: string }

// Giá gõ tay từ tờ menu giấy → phải chặn cả chữ lẫn số âm.
export function parseVariantInput(rawName: string, rawPrice: string): ParseResult {
  const name = rawName.trim()
  if (!name) return { ok: false, error: 'Nhập tên lựa chọn' }
  const price = Number(rawPrice)
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: 'Giá phải là số ≥ 0' }
  return { ok: true, name, price: Math.round(price) }
}

export function displayPriceLabel(price: number, hasVariants: boolean): string {
  const formatted = `${price.toLocaleString('vi-VN')}đ`
  return hasVariants ? `Từ ${formatted}` : formatted
}
```

`displayPriceLabel` được dùng ở Task 8 Step 5 (chú thích dưới ô giá chỉ đọc). Nếu cuối Task 8 nó vẫn không có chỗ gọi nào thì **xoá cả hàm lẫn test của nó** — không để hàm chết trong repo.

- [ ] **Step 4: Chạy test, xác nhận PASS**

```bash
cd admin-web && npx vitest run lib/menu/variant.test.ts
```

Kỳ vọng: 7 test PASS.

- [ ] **Step 5: Thêm server actions**

Trong `admin-web/lib/actions/menu.ts`, thêm ngay sau `assertToppingInStore` (dòng ~63):

```ts
// Ném lỗi nếu biến thể không thuộc store của user
async function assertVariantInStore(variantId: string, storeId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('menu_item_variants')
    .select('id, store_id')
    .eq('id', variantId)
    .single()
  if (error || !data) throw new Error('Không tìm thấy lựa chọn')
  if (data.store_id !== storeId) throw new Error('Lựa chọn không thuộc quán của bạn')
}
```

Và thêm 5 action ở cuối file:

```ts
// ─── Biến thể (tuỳ chọn quyết định giá) ─────────────────────────────────────
// Giá là TUYỆT ĐỐI, không phải phụ thu. Trigger CSDL tự đặt menu_items.price
// = giá rẻ nhất còn bán, nên ở đây không phải tự tính.

export async function addItemVariant(menuItemId: string, name: string, price: number) {
  const storeId = await getStoreId()
  await assertMenuItemInStore(menuItemId, storeId)
  const admin = createAdminClient()
  const { data: last } = await admin
    .from('menu_item_variants')
    .select('sort_order')
    .eq('menu_item_id', menuItemId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { error } = await admin.from('menu_item_variants').insert({
    menu_item_id: menuItemId,
    store_id: storeId,
    name: name.trim(),
    price: Math.round(price),
    sort_order: (last?.sort_order ?? 0) + 1,
  })
  if (error) throw new Error(`addItemVariant: ${error.message}`)
  revalidatePath('/admin/menu')
}

export async function updateItemVariant(
  variantId: string,
  patch: { name?: string; price?: number; is_available?: boolean },
) {
  const storeId = await getStoreId()
  await assertVariantInStore(variantId, storeId)
  const admin = createAdminClient()
  const { error } = await admin.from('menu_item_variants').update(patch).eq('id', variantId)
  if (error) throw new Error(`updateItemVariant: ${error.message}`)
  revalidatePath('/admin/menu')
}

export async function deleteItemVariant(variantId: string) {
  const storeId = await getStoreId()
  await assertVariantInStore(variantId, storeId)
  const admin = createAdminClient()
  const { error } = await admin.from('menu_item_variants').delete().eq('id', variantId)
  if (error) throw new Error(`deleteItemVariant: ${error.message}`)
  revalidatePath('/admin/menu')
}

export async function reorderItemVariants(menuItemId: string, variantIds: string[]) {
  const storeId = await getStoreId()
  await assertMenuItemInStore(menuItemId, storeId)
  const admin = createAdminClient()
  for (const { id, sort_order } of buildSortUpdates(variantIds)) {
    const { error } = await admin
      .from('menu_item_variants')
      .update({ sort_order })
      .eq('id', id)
      .eq('menu_item_id', menuItemId)
    if (error) throw new Error(`reorderItemVariants: ${error.message}`)
  }
  revalidatePath('/admin/menu')
}

export async function setVariantGroupName(menuItemId: string, groupName: string) {
  const storeId = await getStoreId()
  await assertMenuItemInStore(menuItemId, storeId)
  const admin = createAdminClient()
  const trimmed = groupName.trim()
  const { error } = await admin
    .from('menu_items')
    .update({ variant_group_name: trimmed || null })
    .eq('id', menuItemId)
  if (error) throw new Error(`setVariantGroupName: ${error.message}`)
  revalidatePath('/admin/menu')
}
```

⚠️ Kiểm tra chữ ký `buildSortUpdates` trong `admin-web/lib/menu/reorder.ts` và dùng đúng dạng nó trả về. Nếu khác dạng `{id, sort_order}` thì sửa vòng lặp cho khớp — **không** sửa `buildSortUpdates` (đang phục vụ món và danh mục).

- [ ] **Step 6: Chạy toàn bộ test + build**

```bash
cd admin-web && npm test && npm run build
```

Kỳ vọng: tất cả PASS, build thành công.

- [ ] **Step 7: Commit**

```bash
git add admin-web/lib/menu/variant.ts admin-web/lib/menu/variant.test.ts admin-web/lib/actions/menu.ts
git commit -m "feat(admin): server actions CRUD bien the mon + ham thuan validate"
```

---

## Task 8: Giao diện nhập biến thể ở `/admin/menu`

**Files:**
- Modify: `admin-web/app/admin/menu/page.tsx:13-20`
- Modify: `admin-web/app/admin/menu/menu-client.tsx`

- [ ] **Step 1: Query kèm biến thể**

Trong `admin-web/app/admin/menu/page.tsx`, sửa câu select (dòng 16):

```ts
    .select('*, menu_items(*, menu_item_toppings(topping_id), menu_item_variants(id, name, price, is_available, sort_order))')
```

- [ ] **Step 2: Mở rộng kiểu `MenuItem` trong client**

Trong `admin-web/app/admin/menu/menu-client.tsx`, thêm vào type `MenuItem` (quanh dòng 41):

```ts
  variant_group_name?: string | null
  menu_item_variants?: { id: string; name: string; price: number; is_available: boolean; sort_order: number }[]
```

Thêm import (khối dòng 16–19):

```ts
  addItemVariant,
  updateItemVariant,
  deleteItemVariant,
  reorderItemVariants,
  setVariantGroupName,
```

- [ ] **Step 3: Viết component `ItemVariantEditor`**

Thêm vào cuối `menu-client.tsx`:

```tsx
// Khối nhập lựa chọn quyết định giá, hiện trong modal sửa món.
// Giá TUYỆT ĐỐI — gõ thẳng theo tờ menu giấy, không phải tính chênh lệch.
function ItemVariantEditor({ item, router }: { item: MenuItem; router: ReturnType<typeof useRouter> }) {
  const [, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [groupName, setGroupName] = useState(item.variant_group_name ?? '')
  const variants = (item.menu_item_variants ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)

  const add = () => {
    const parsed = parseVariantInput(name, price)
    if (!parsed.ok) { alert(parsed.error); return }
    startTransition(async () => {
      await addItemVariant(item.id, parsed.name, parsed.price)
      setName(''); setPrice(''); router.refresh()
    })
  }
  const toggle = (v: { id: string; is_available: boolean }) => startTransition(async () => {
    await updateItemVariant(v.id, { is_available: !v.is_available }); router.refresh()
  })
  const del = (v: { id: string; name: string }) => {
    const last = variants.length === 1
    const msg = last
      ? `Xoá lựa chọn cuối cùng "${v.name}"? Món sẽ quay về món thường, giá giữ ở mức hiện tại — nhớ kiểm tra lại giá món.`
      : `Xoá lựa chọn "${v.name}"?`
    if (!confirm(msg)) return
    startTransition(async () => { await deleteItemVariant(v.id); router.refresh() })
  }
  const saveGroupName = () => startTransition(async () => {
    await setVariantGroupName(item.id, groupName); router.refresh()
  })
  // Đổi thứ tự bằng nút ▲▼ thay vì kéo thả: danh sách chỉ 2-4 dòng, nút mũi tên
  // bấm chuẩn hơn trên điện thoại và không phải kéo theo thư viện drag nào.
  const move = (idx: number, delta: number) => {
    const next = variants.slice()
    const target = idx + delta
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    startTransition(async () => {
      await reorderItemVariants(item.id, next.map((v) => v.id)); router.refresh()
    })
  }

  return (
    <div className="mt-4 rounded-lg border border-gray-200 p-4">
      <p className="font-semibold text-gray-700">📐 Tuỳ chọn quyết định giá</p>
      <p className="mt-1 text-xs text-gray-500">
        Khách phải chọn đúng một. Giá gõ ở đây là giá bán thật của món, không phải tiền cộng thêm.
      </p>

      <div className="mt-3 flex gap-2">
        <input value={groupName} onChange={(e) => setGroupName(e.target.value)} onBlur={saveGroupName}
          placeholder="Tên nhóm (VD: Chọn cỡ, Chọn hãng)" className="input flex-1" />
      </div>

      <div className="mt-3 space-y-2">
        {variants.map((v, idx) => (
          <div key={v.id} className="flex items-center gap-2 rounded border border-gray-100 px-3 py-2">
            <span className="flex flex-col leading-none">
              <button onClick={() => move(idx, -1)} disabled={idx === 0}
                className="text-xs text-gray-400 disabled:opacity-30" aria-label="Lên">▲</button>
              <button onClick={() => move(idx, 1)} disabled={idx === variants.length - 1}
                className="text-xs text-gray-400 disabled:opacity-30" aria-label="Xuống">▼</button>
            </span>
            <span className={`flex-1 text-sm ${v.is_available ? 'text-gray-700' : 'text-gray-400 line-through'}`}>
              {v.name}
            </span>
            <span className="text-sm font-medium text-gray-700">{v.price.toLocaleString('vi-VN')}đ</span>
            <button onClick={() => toggle(v)} className="text-xs text-gray-500 hover:text-orange-600">
              {v.is_available ? 'Tắt bán' : 'Bật bán'}
            </button>
            <button onClick={() => del(v)} className="text-xs text-red-500 hover:text-red-700">Xoá</button>
          </div>
        ))}
        {variants.length === 0 && (
          <p className="py-3 text-center text-sm text-gray-400">
            Chưa có lựa chọn nào — món đang bán theo giá món.
          </p>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Tên lựa chọn (VD: Đĩa to)" className="input flex-1" />
        <input value={price} onChange={(e) => setPrice(e.target.value)}
          placeholder="Giá" inputMode="numeric" className="input w-32" />
        <button onClick={add} className="btn-primary whitespace-nowrap">Thêm</button>
      </div>
    </div>
  )
}
```

Thêm import ở đầu file: `import { parseVariantInput } from '@/lib/menu/variant'`

⚠️ Kiểm tra class tiện ích `input` / `btn-primary` có tồn tại trong file này không (`ToppingPool` dòng ~542 đang dùng `input`). Nếu `btn-primary` không có, dùng đúng class mà nút "Thêm" của `ToppingPool` đang dùng.

- [ ] **Step 4: Cắm vào modal sửa món**

Ngay dưới dòng 352 (`<ItemToppingPicker item={editItem} toppings={toppings} router={router} />`), thêm:

```tsx
          <ItemVariantEditor item={editItem} router={router} />
```

- [ ] **Step 5: Ô "Giá" của món chuyển chỉ đọc khi đã có biến thể**

Tìm ô nhập giá trong form sửa món:

```bash
cd admin-web && grep -n "name=\"price\"" app/admin/menu/menu-client.tsx
```

Thêm `readOnly={(editItem.menu_item_variants?.length ?? 0) > 0}` vào ô đó, và chèn ngay dưới nó:

⚠️ Phải là `readOnly`, **KHÔNG được dùng `disabled`**. `updateMenuItem` ghi thẳng `price` từ form lên DB mỗi lần lưu (kể cả khi chỉ đổi tên món). Ô `readOnly` vẫn gửi giá trị hiện tại nên ghi đè lại chính nó, vô hại; ô `disabled` **không gửi gì**, `parseInt(undefined)` ra `NaN` và giá món hỏng.

```tsx
          {(editItem.menu_item_variants?.length ?? 0) > 0 && (
            <p className="mt-1 text-xs text-orange-600">
              {displayPriceLabel(editItem.price, true)} — giá đang do tuỳ chọn quyết định.
              Sửa giá ở danh sách lựa chọn bên dưới.
            </p>
          )}
```

Thêm `displayPriceLabel` vào import từ `@/lib/menu/variant` (cùng dòng với `parseVariantInput`).

- [ ] **Step 6: Badge số lựa chọn ở danh sách món**

Cạnh badge topping (dòng ~265), thêm:

```tsx
                      {(item.menu_item_variants?.length ?? 0) > 0 && (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
                          {item.menu_item_variants!.length} lựa chọn
                        </span>
                      )}
```

- [ ] **Step 7: Build**

```bash
cd admin-web && npm run build && npm test
```

Kỳ vọng: build thành công, test PASS.

- [ ] **Step 8: Commit**

```bash
git add admin-web/app/admin/menu/page.tsx admin-web/app/admin/menu/menu-client.tsx
git commit -m "feat(admin): khoi nhap tuy chon quyet dinh gia trong modal sua mon"
```

---

## Task 9: Đặt hộ `/staff/order` bắt chọn biến thể

Bỏ qua task này thì nhân viên gọi hộ sẽ tạo đơn bị `staff_create_order` từ chối mà không hiểu vì sao.

**Files:**
- Modify: `admin-web/app/staff/order/page.tsx`
- Modify: `admin-web/app/staff/order/staff-order-client.tsx`
- Modify: `admin-web/lib/actions/staff-order.ts:6-16, 88-95`

- [ ] **Step 1: Query kèm biến thể, lọc còn-bán ngay ở server**

Trong `admin-web/app/staff/order/page.tsx`, thêm `menu_item_variants(id, name, price, is_available, sort_order)` vào câu select `menu_items`. Ở chỗ map sang kiểu `Item`, **lọc sẵn biến thể còn bán và sắp thứ tự tại đây** để client không phải biết tới `is_available`:

```ts
    variants: (row.menu_item_variants ?? [])
      .filter((v: { is_available: boolean }) => v.is_available)
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
      .map((v: { id: string; name: string; price: number }) => ({ id: v.id, name: v.name, price: v.price })),
    variantGroupName: row.variant_group_name ?? null,
```

- [ ] **Step 2: Mở rộng kiểu**

Trong `staff-order-client.tsx`, sửa (dòng 6–7 và 16):

```ts
type Variant = { id: string; name: string; price: number }
type Item = { id: string; name: string; price: number; imageUrl: string | null; toppings: Topping[]; variants: Variant[]; variantGroupName: string | null }
```

Trong `type CartLine` (quanh dòng 16), thêm:

```ts
  variant: Variant | null
```

- [ ] **Step 3: Giá dòng tính theo biến thể**

Sửa `lineUnit` (dòng 22):

```ts
const lineUnit = (l: CartLine) => l.basePrice + l.toppings.reduce((s, t) => s + t.price, 0)
```

Giữ nguyên công thức — nhưng khi tạo `CartLine` phải đặt `basePrice = variant ? variant.price : item.price`. Sửa cả hai chỗ tạo dòng:

Dòng 64 (thêm nhanh, không sheet):

```ts
      return [...prev, { lineId: crypto.randomUUID(), menuItemId: item.id, name: item.name, basePrice: item.price, toppings: [], variant: null, quantity: 1, note: '' }]
```

Dòng 257 (thêm qua sheet) — xem Step 5.

- [ ] **Step 4: Mở sheet khi món có biến thể**

Dòng 69, đổi:

```ts
    if (item.toppings.length > 0 || item.variants.length > 0) setSheetItem(item)
```

Và dòng 58 (tìm dòng đã có để cộng dồn) chỉ áp dụng cho món không tuỳ chọn — thêm điều kiện `l.variant === null` vào `findIndex`:

```ts
      const idx = prev.findIndex((l) => l.menuItemId === item.id && l.variant === null && l.toppings.length === 0 && l.note === '')
```

- [ ] **Step 5: Sheet chọn biến thể**

Trong component `ToppingSheet` (dòng 343), đổi tên thành `OptionSheet`, thêm state và khối radio:

```tsx
function OptionSheet({ item, onClose, onAdd }: {
  item: Item
  onClose: () => void
  onAdd: (variant: Variant | null, toppings: Topping[], qty: number, note: string) => void
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [variantId, setVariantId] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  // item.variants đã lọc còn-bán ở page.tsx (Step 1) → ở đây không lọc lại
  const available = item.variants
  const variant = available.find((v) => v.id === variantId) ?? null
  const canAdd = available.length === 0 || variant !== null
  const chosen = item.toppings.filter((t) => selected[t.id])
  // ... phần JSX topping giữ nguyên, thêm khối dưới đây LÊN TRÊN nó:
```

Khối radio chèn trên danh sách topping:

```tsx
      {available.length > 0 && (
        <>
          <p className="mb-3 text-sm text-gray-500">
            {item.variantGroupName ?? 'Chọn loại'} <span className="text-orange-600">(bắt buộc)</span>
          </p>
          <div className="space-y-1">
            {available.map((v) => (
              <button key={v.id} onClick={() => setVariantId(v.id)}
                className={`flex w-full items-center justify-between rounded border px-3 py-2 text-left text-sm ${variantId === v.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}>
                <span>{v.name}</span>
                <span className="font-medium">{v.price.toLocaleString('vi-VN')}đ</span>
              </button>
            ))}
          </div>
        </>
      )}
```

Nút xác nhận của sheet: `disabled={!canAdd}`, và gọi `onAdd(variant, chosen, qty, note)`.

- [ ] **Step 6: Chỗ gọi sheet tạo dòng giỏ**

Dòng 253–258, đổi thành:

```tsx
        <OptionSheet
          item={sheetItem}
          onClose={() => setSheetItem(null)}
          onAdd={(variant, toppings, qty, note) => {
            mutateCart((prev) => [...prev, {
              lineId: crypto.randomUUID(),
              menuItemId: sheetItem.id,
              name: variant ? `${sheetItem.name} (${variant.name})` : sheetItem.name,
              basePrice: variant ? variant.price : sheetItem.price,
              toppings, variant, quantity: qty, note,
            }])
```

- [ ] **Step 7: Gửi `variant_id` xuống RPC**

Trong `admin-web/lib/actions/staff-order.ts`, thêm vào `type StaffOrderItem` (dòng 9):

```ts
  variant_id?: string | null
```

Trong `staff-order-client.tsx` dòng ~93, khối build items, thêm:

```ts
      variant_id: l.variant?.id ?? null,
```

- [ ] **Step 8: Build + test**

```bash
cd admin-web && npm run build && npm test
```

Kỳ vọng: build thành công, test PASS.

- [ ] **Step 9: Commit**

```bash
git add admin-web/app/staff/order admin-web/lib/actions/staff-order.ts
git commit -m "feat(staff): dat ho bat chon bien the truoc khi them mon"
```

---

## Task 10: Tài liệu + checklist test

**Files:**
- Modify: `TESTING.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Thêm mục kiểm thử vào `TESTING.md`**

Thêm mục `## 2026-09-01 — Tuỳ chọn quyết định giá cho món` với đúng 19 ca sau:

**A. Tầng CSDL — chạy bằng SQL, không cần giao diện** (đã chạy ở Task 1 Step 3–4 và Task 2 Step 7, chép kết quả vào đây)
1. Món có biến thể + không gửi `variant_id` → đơn bị từ chối
2. `variant_id` của món khác → bị từ chối
3. `variant_id` của quán khác → bị từ chối
4. `variant_id` đã tắt bán → bị từ chối
5. Món thường + có gửi `variant_id` → bị từ chối
6. Đặt đúng → `item_price` = giá biến thể, `item_name` = `Món (Biến thể)`, `total_amount` khớp
7. Đặt kèm topping → tiền = giá biến thể + topping
8. Ca 1–7 lặp lại qua `staff_create_order`
9. Trigger: thêm/sửa/xoá/tắt biến thể → `menu_items.price` = giá rẻ nhất còn bán
10. Tắt hết biến thể → `menu_items.price` giữ nguyên **và** đơn đặt món đó bị từ chối

**B. Mini-app — sau khi `zmp deploy`**
11. Card món hiện "Từ …đ"; bấm `+` mở sheet chứ không thêm thẳng vào giỏ
12. Chưa chọn lựa chọn → nút "Thêm vào giỏ" bị khoá, hiện chữ "Chọn … để tiếp tục"
13. Món tắt hết lựa chọn → hiện "Tạm hết", không bấm được
14. Cùng món hai cỡ → hai dòng giỏ riêng; cùng cỡ cùng topping → cộng dồn số lượng
15. Thoát app mở lại trong 6h → giỏ còn đúng biến thể đã chọn
16. Đặt đơn thật → màn bếp, bill và loa đọc đơn đều ra `Bia hơi (Tháp)`

**C. Admin**
17. Thêm / sửa / tắt bán / xoá / đổi thứ tự ▲▼ lựa chọn; ô giá món chuyển chỉ đọc
18. Xoá lựa chọn cuối cùng → hiện cảnh báo về giá món

**D. Không hồi quy**
19. Đặt một đơn món **thường có topping** ở Phở Gà Pubu → mọi thứ y như trước, `variant_id` NULL

- [ ] **Step 2: Thêm dòng lịch sử quyết định vào `CLAUDE.md`**

Thêm vào cuối bảng §10:

```
| 2026-09-01 | **Tuỳ chọn quyết định giá cho món** (mig 042, bảng `menu_item_variants`): mỗi món tối đa MỘT nhóm "chọn loại", chọn đúng 1, **bắt buộc**, giá **tuyệt đối** thay giá món. Chạy song song topping, không đụng topping. Trigger đồng bộ `menu_items.price` = giá rẻ nhất còn bán → mọi query cũ tự hiện "Từ …đ". `order_items.item_name` ghép sẵn `"Bia hơi (Tháp)"` nên bếp/bill/TTS/Món-đã-gọi chạy đúng không phải sửa. Nhóm "chọn 1 trong N không đổi giá" (cay/không cay) dùng **topping 0đ**, không làm loại nhóm thứ hai. Spec: `docs/superpowers/specs/2026-09-01-menu-item-variants-design.md` | Menu Bảo Lương có nhiều món cùng tên khác cỡ khác giá (bia Tháp/Ca/Cốc, đĩa to/nhỏ, bia lon theo hãng) — tách thành món riêng thì menu phình gấp đôi. ⚠️ Server đếm **TỔNG** biến thể (không lọc `is_available`) để quyết định món có biến thể hay không: đếm bản còn-bán thì món tắt hết lựa chọn sẽ rơi về nhánh "món thường" và **bán được ở giá cũ** trong khi mini-app đã ẩn |
```

- [ ] **Step 3: Commit**

```bash
git add TESTING.md CLAUDE.md
git commit -m "docs: checklist test + ghi quyet dinh tuy chon quyet dinh gia (mig 042)"
```

---

## Task 11: Deploy + bàn giao

- [ ] **Step 1: Deploy admin-web**

```bash
git push origin main
```

Vercel tự deploy. Chờ xanh rồi mở `/admin/menu` kiểm tra khối "Tuỳ chọn quyết định giá" hiện ra.

- [ ] **Step 2: Nhắc anh Tú deploy mini-app**

⚠️ **Bản mini-app cũ không thấy biến thể** → nếu bật biến thể cho một quán trước khi deploy, khách quán đó sẽ thấy giá "Từ …đ" nhưng đặt món bị server từ chối.

Nói với anh Tú:

> Cần `zmp deploy` mini-app cho từng quán trước khi bật biến thể cho quán đó. Nhớ **merge `origin/main` vào worktree quán TRƯỚC** rồi mới deploy, nếu không sẽ deploy ra bản code cũ:
> ```bash
> cd mini-app-instances/<slug> && git fetch origin && git merge origin/main && cd mini-app && zmp deploy
> ```
> Lúc deploy chọn **Development** (tự test) hay **Testing** (phát hành) — Zalo giới hạn số lần deploy mỗi tháng.

- [ ] **Step 3: Dừng lại, báo anh Tú test**

Theo quy tắc bắt buộc ở `CLAUDE.md`: **không tự chuyển sang việc tiếp theo**. Nói:

> "Xong rồi anh, test theo TESTING.md — mục 2026-09-01 nhé."

Chờ anh Tú xác nhận PASS.

---

## Việc dữ liệu sau khi PASS (không thuộc plan này)

Gộp lại menu Bảo Lương bằng SQL trên prod: Cơm rang / Mì xào to-nhỏ (8 món → 4 món × 2 biến thể), Chó chặt đĩa và Lợn quay (200–400k đang ghi trong mô tả → biến thể thật), Bia hơi / Bia lon (theo cỡ và theo hãng).
