# Topping cho món ăn — Thiết kế

> Ngày: 2026-06-30
> Trạng thái: Đã duyệt hướng, chờ viết plan
> Phạm vi: thêm topping (add-on) cho món, quản lý trong admin web, chọn khi đặt trong mini-app, hiển thị ở bếp + màn theo dõi đơn.

## 1. Mục tiêu

Cho phép mỗi món có một danh sách **topping tuỳ chọn** (add-on). Khách tick có/không từng topping khi đặt; mỗi topping cộng thêm một khoản phụ thu vào giá món. Chủ quán (qua MEVO vận hành) quản lý topping ngay trong trang menu admin.

### Quyết định đã chốt (brainstorm 2026-06-30)

| Quyết định | Lý do |
|---|---|
| **Add-on đơn giản, 1 danh sách / món** (không nhóm, không quy tắc radio/checkbox) | YAGNI cho pilot quán phở/nhậu; topping thực tế chỉ là "thêm trứng/thịt/quẩy" |
| **Tick có/không, không chọn số lượng** | UI gọn nhất; đủ cho hầu hết trường hợp |
| **Topping quản lý trong modal "Sửa món"**, không tách trang riêng | Giảm phạm vi admin, đúng tinh thần v1 MEVO làm hết |
| **Snapshot topping bằng JSONB trên `order_items`**, không tách bảng con | Topping chỉ để hiển thị (bếp/hoá đơn đọc), không cần query/thống kê riêng → đỡ 1 bảng + join. Nếu sau cần báo cáo "topping bán chạy" mới tách |
| **Giá cộng phụ thu tính ở server** trong RPC `create_order` | Không tin giá client gửi — khớp pattern giá món hiện có |

## 2. Data model

### 2.1 Bảng mới `menu_item_toppings`

> **Migration phải idempotent (rerun-safe).** `ALTER TABLE … ADD CONSTRAINT` fail nếu constraint đã tồn tại từ lần chạy thử → bọc trong `DO $$ … IF NOT EXISTS … $$`. Dùng `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.

```sql
-- Cần UNIQUE(id, store_id) trên menu_items để làm đích cho composite FK bên dưới.
-- id đã là PK (unique), thêm constraint này chỉ để FK tham chiếu được cặp cột.
-- Bọc IF NOT EXISTS để rerun không fail.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_id_store_uniq'
  ) THEN
    ALTER TABLE menu_items ADD CONSTRAINT menu_items_id_store_uniq UNIQUE (id, store_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS menu_item_toppings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id  uuid NOT NULL,
  store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name          text NOT NULL,
  price         int  NOT NULL DEFAULT 0 CHECK (price >= 0),   -- phụ thu, VNĐ
  is_available  boolean NOT NULL DEFAULT true,
  sort_order    int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Composite FK: BẮT BUỘC topping.store_id == menu_items.store_id ở tầng DB.
  -- ON DELETE CASCADE: xoá món → topping tự xoá.
  CONSTRAINT menu_item_toppings_item_store_fkey
    FOREIGN KEY (menu_item_id, store_id)
    REFERENCES menu_items (id, store_id) ON DELETE CASCADE
);

-- Mini-app load topping theo món, chỉ lấy available, sort theo sort_order.
CREATE INDEX IF NOT EXISTS idx_menu_item_toppings_lookup
  ON menu_item_toppings (menu_item_id, is_available, sort_order);
```

- **`store_id` denormalize được DB enforce** qua composite FK `(menu_item_id, store_id) → menu_items(id, store_id)` — không thể insert topping lệch store kể cả qua service-role. (P2: chống sai lệch dữ liệu.)
- Admin action khi insert **luôn tự lấy `store_id` từ `menu_items`**, không nhận `store_id` từ client (xem §5).
- `price >= 0` bằng CHECK ngay trong DDL.
- Index `(menu_item_id, is_available, sort_order)` phục vụ đúng truy vấn load menu của mini-app.

### 2.2 Cột mới `order_items.selected_toppings`

```sql
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS selected_toppings jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Snapshot này dùng để hiển thị + đối chiếu tính tiền → ép luôn là JSON array, fail sớm ở DB.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_selected_toppings_is_array'
  ) THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_selected_toppings_is_array
      CHECK (jsonb_typeof(selected_toppings) = 'array');
  END IF;
END $$;
```

- Snapshot dạng `[{ "id": "<uuid>", "name": "Thêm trứng", "price": 10000 }, ...]` lúc tạo đơn. **Gồm `id`** để truy vết/đối soát với `menu_item_toppings` (P1) — chi phí gần như 0, đổi lại debug/đối soát/thống kê nhẹ về sau dễ. `name`+`price` vẫn là snapshot bất biến (đổi tên/giá topping sau không ảnh hưởng đơn cũ).
- `item_price` (đã có) tiếp tục là **giá 1 suất món chưa gồm topping** — GIỮ NGUYÊN ý nghĩa cũ để không vỡ dữ liệu/đơn cũ, và để hoá đơn hiển thị tách bạch giá món vs từng topping mà không phải trừ ngược. Phụ thu topping nằm trong `selected_toppings`.

### 2.3 Quy ước tính tiền + HELPER BẮT BUỘC (thống nhất server, mini-app, bếp)

Cho mỗi `order_items`:
```
line_unit_price = item_price + SUM(selected_toppings[].price)
line_total      = line_unit_price * quantity
```
`orders.total_amount` = SUM(line_total) trên mọi dòng. RPC tính lại toàn bộ từ DB, không tin client.

**P1 — chống lệch hiển thị:** vì `item_price` KHÔNG gồm topping, mọi nơi đang tính tiền theo dòng phải dùng helper chung, KHÔNG được `item.price * item.quantity` trực tiếp:

```ts
// mini-app: src/utils/order-pricing.ts (mới)
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

Call-site BẮT BUỘC sửa (tìm bằng **search chuỗi** cho bền với lệch số dòng):
- `mini-app/src/pages/order-status/index.tsx` — search `item.price * item.quantity` (hiện ~dòng 286) → dùng `getItemLineTotal`.
- Giỏ hàng + màn checkout (cart): line total & tổng phải qua helper (cart store `calculateTotals` đã cộng `extraPrice` — kiểm khớp công thức).
- `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx` — map `price: item.item_price`; nếu màn bếp KHÔNG hiển thị tiền từng dòng thì không bắt buộc, nhưng vẫn map `selectedToppings` để hiển thị topping (xem §7). Admin có helper riêng nếu cần hiển thị tiền.
- Bất kỳ formatter order-item nào khác (session-orders) — rà toàn bộ.

## 3. RLS

- `menu_item_toppings`: bật RLS.
  - **anon (mini-app)**: SELECT cho phép đọc topping của store (giống `menu_items` hiện tại — đọc menu công khai). Nhân bản đúng kiểu policy `menu_items`.
  - **authenticated (admin) SELECT (BẮT BUỘC):** `admin/menu/page.tsx` query menu bằng `createClient()` **authenticated** (KHÔNG service-role) và cần đọc cả topping `is_available=false` để quản lý. Phải có policy `authenticated SELECT` scoped theo store/operator **y hệt `menu_items`** (xem `006b_tighten_admin_rls.sql` / `007a_kitchen_isolation.sql` để copy đúng điều kiện operator). Nếu không, nested query topping trả rỗng. (Phương án thay thế: đổi `page.tsx` sang `createAdminClient()` — nhưng nhân bản policy authenticated nhất quán hơn với pattern hiện tại, chọn cách này.)
  - **INSERT/UPDATE/DELETE**: chỉ service-role (admin web ghi qua `createAdminClient`) — khớp cách `menu_items` được ghi qua admin client, không mở cho anon/authenticated.
  - **role `kitchen`: KHÔNG cấp quyền đọc `menu_item_toppings`.** Màn bếp chỉ đọc topping từ snapshot `order_items.selected_toppings` (đã có sẵn trong query order_items theo role kitchen). KHÔNG query topping "live" ở bếp/kitchen-display để khỏi cần GRANT/policy cho role kitchen. (P1 — verify: `kitchen-client.ts` gắn token role `kitchen`, không phải anon.)
- `order_items.selected_toppings`: không thêm policy mới; ghi qua RPC `create_order` (SECURITY DEFINER), đọc qua các query order_items hiện có (kitchen/mini-app) như cột bình thường.

> Việc làm: đọc lại policy thực tế của `menu_items` trong `002_indexes_rls_realtime.sql` / `006b_tighten_admin_rls.sql` + role kitchen trong `007a_kitchen_isolation.sql` khi viết migration, nhân bản đúng kiểu cho `menu_item_toppings` (KHÔNG đụng role kitchen).

## 4. RPC `create_order` — sửa

Mỗi phần tử `p_items` nhận thêm field tuỳ chọn `topping_ids` (mảng uuid):

```jsonc
{ "menu_item_id": "...", "quantity": 2, "note": "...", "topping_ids": ["...", "..."] }
```

Logic bổ sung trong vòng lặp món (sau khi đã xác thực `v_menu`):
1. Khởi tạo `v_toppings jsonb := '[]'`, `v_topping_total int := 0`.
2. Nếu `topping_ids` không rỗng: SELECT từ `menu_item_toppings`
   WHERE `id = ANY(topping_ids)` AND `menu_item_id = v_menu.id` AND `store_id = p_store_id` AND `is_available = true`.
   - Mỗi hàng: cộng `price` vào `v_topping_total`, append `{id, name, price}` vào `v_toppings`.
   - Nếu số topping tìm thấy < số id gửi lên → RAISE EXCEPTION (topping không hợp lệ / ngừng bán / sai món).
3. `INSERT INTO order_items (..., item_price, ..., selected_toppings)`
   với `item_price = v_menu.price` (GIỮ nguyên — chưa gồm topping) và `selected_toppings = v_toppings`.
4. `v_total := v_total + (v_menu.price + v_topping_total) * v_qty`.

- Chữ ký RPC (10 param) **không đổi** — `topping_ids` nằm trong JSON `p_items`, không phải param mới. Không cần DROP/CREATE đổi signature.
- Migration tạo lại function bằng `CREATE OR REPLACE` cùng signature.

## 5. Admin web — quản lý topping

Trong `admin-web/app/admin/menu/menu-client.tsx`, modal **"Sửa món"** (`ItemForm` khi có `item`):

- Thêm section "Topping (tuỳ chọn)" — chỉ hiện khi sửa món đã tồn tại (cần `menu_item_id`).
- **Ergonomics khi thêm món mới (P2):** sau khi `addMenuItem` thành công, KHÔNG đóng hẳn — **tự mở modal "Sửa món" của món vừa tạo** (action `addMenuItem` trả về `id` món mới) để vận hành viên thêm topping ngay, không phải tìm lại món. Tránh thao tác vòng vèo khi nhập menu pilot nhiều món.
- Mỗi dòng topping: input tên, input giá (VNĐ), toggle tạm hết, nút xoá.
- Nút "+ Thêm topping" thêm dòng trống.

**Server actions mới trong `admin-web/lib/actions/menu.ts` — BẮT BUỘC verify ownership (P1):**

Vì các action dùng `createAdminClient()` (service-role, **bypass RLS**), không được update/insert theo id trần. Viết 2 helper và dùng trước MỌI ghi:
```ts
// Ném lỗi nếu món không thuộc store của user hiện tại → trả về store_id của món
async function assertMenuItemInStore(menuItemId: string, storeId: string): Promise<void>
// Ném lỗi nếu topping không thuộc store → trả về { menuItemId, storeId }
async function assertToppingInStore(toppingId: string, storeId: string): Promise<void>
```
- `addTopping(menuItemId, name, price)`: `storeId = await getStoreId()` → `assertMenuItemInStore(menuItemId, storeId)` → insert **lấy `store_id` từ chính bản ghi `menu_items`** (KHÔNG nhận `store_id` từ client; composite FK ở §2.1 cũng chặn lệch ở tầng DB). `sort_order = (max sort_order của món đó) + 1` (P3).
- `updateTopping(toppingId, { name, price, is_available })`: `getStoreId()` → `assertToppingInStore` → update.
- `deleteTopping(toppingId)`: `getStoreId()` → `assertToppingInStore` → delete.
- `toggleTopping(toppingId, isAvailable)`: gộp vào `updateTopping` (chỉ patch `is_available`).
- (Cùng dịp, nên rà lại `toggleMenuItem`/`updateMenuItem`/`deleteMenuItem` hiện cũng update theo id không check store — không bắt buộc trong phạm vi này nhưng ghi nhận là nợ kỹ thuật cùng loại.)

- Trang `admin/menu/page.tsx` query kèm `menu_item_toppings` (lồng trong `menu_items`, sort theo `sort_order`).
- Danh sách món: badge số topping (VD "3 topping") để dễ thấy món nào đã có.

## 6. Mini-app — chọn topping khi đặt

### 6.1 Tải dữ liệu
- `category.queries` / service load menu: kèm `menu_item_toppings` (chỉ `is_available = true`, sort theo `sort_order`) cho mỗi `Product`.
- Thêm vào type `Product`: `toppings: Topping[]` với `Topping = { id, name, price }`.

### 6.2 Luồng chọn (trang `menu/index.tsx`)
- Món **không có topping** (`toppings.length === 0`): giữ nguyên nút +/- quick-add theo `productId` như hiện tại (`getItemCount(productId)` / `updateQuantity(productId, …)` vẫn đúng vì chỉ 1 cart line / product).
- Món **có topping (P2 — không dùng trừ nhanh theo productId):** card **chỉ có nút "+"** mở sheet, KHÔNG có nút "−" nhanh. Vì 1 món có thể đẻ nhiều cart line (mỗi tổ hợp topping 1 line), `getItemCount(productId)` không còn đại diện 1 line. Badge trên nút hiển thị **tổng số lượng của MỌI tổ hợp** của product đó (cộng dồn các cart line cùng `productId`). Sửa/giảm từng tổ hợp làm trong giỏ.
- Món **có topping**: nút "+" mở **bottom sheet**:
  - Tiêu đề món + ảnh.
  - Danh sách topping checkbox, mỗi dòng "Tên +giá".
  - Tổng tiền 1 suất cập nhật theo lựa chọn.
  - Nút "Thêm vào giỏ" (đóng sheet, thêm vào cart).
  - **Mỗi lần "Thêm vào giỏ" = +1 suất** với tổ hợp topping đã chọn. Điều chỉnh số lượng sau đó bằng nút +/- trong giỏ (không có chọn số lượng trong sheet — giữ sheet gọn).

### 6.3 Cart — tách dòng theo tổ hợp topping (CHỐT, không để plan tự quyết — P2)
- Topping được biểu diễn bằng `SelectedVariant` với **`groupId` cố định = `"topping"`, `quantity: 1`**:
  `{ groupId: "topping", groupTitle: "Topping", optionId: toppingId, optionName: name, extraPrice: price, quantity: 1 }`.
  Không phát sinh khái niệm "group" cho user — `groupId` chỉ là hằng nội bộ. Cập nhật comment `// MVP selectedVariants luôn rỗng` trong `cart.types.ts` cho khớp thực tế mới.
- `generateCartItemId`: đổi từ `productId` sang `productId + "|" + [...optionId].sort().join(",")` (chỉ lấy variant `groupId === "topping"`). → Phở+trứng và Phở thường là 2 line khác nhau; trùng tổ hợp thì gộp số lượng.
- **Khi gửi đơn, chỉ variant có `groupId === "topping"` mới map thành `topping_ids`** (tránh lệch nếu sau này có loại variant khác).
- `calculateTotals` đã cộng `extraPrice * quantity` sẵn — khớp công thức §2.3, không phải sửa logic (chỉ cần dữ liệu variant đúng).
- Hiển thị topping dưới tên món trong giỏ + màn checkout; line total qua helper §2.3.

### 6.4 Gửi đơn
- `order.api.ts` `createOrder`: map mỗi item kèm `topping_ids` = danh sách `optionId` của `selectedVariants`.
- `CreateOrderRequest.items[]` thêm `toppingIds?: string[]`.

## 7. Bếp + màn theo dõi đơn — hiển thị topping

- `order.api.ts` `getOrderWithItems`: map thêm `selectedToppings` từ `order_items.selected_toppings` vào `OrderItem`.
- `OrderItem` type thêm `selectedToppings: { id: string; name: string; price: number }[]` (mặc định `[]`).
- `kitchen-display.tsx` map order items: thêm `selectedToppings` từ `item.selected_toppings` (đọc từ snapshot — KHÔNG query `menu_item_toppings`, xem §3).
- Màn theo dõi đơn (mini-app `order-status`) + Kitchen Display: hiển thị topping dạng dòng phụ dưới tên món, VD: `Phở gà đặc biệt ×1` / `+ Trứng, + Quẩy`. Tiền từng dòng (nếu hiển thị) qua helper §2.3.
- Rà MỌI nơi đọc `order_items` (session-orders, kitchen, order-status, cart, checkout) để: (a) hiển thị topping nhất quán, (b) dùng helper tính tiền §2.3. Đơn cũ `selected_toppings = []` → ẩn dòng topping.

## 8. Phạm vi KHÔNG làm (YAGNI)

- Không có nhóm topping / quy tắc bắt buộc / radio-select.
- Không chọn số lượng từng topping.
- Không topping dùng chung nhiều món (reuse).
- Không báo cáo thống kê topping bán chạy.
- Không quản lý topping ngay trong form **thêm món mới**; thay vào đó sau khi tạo món sẽ **tự mở modal sửa món** để thêm topping (§5) — giữ form tạo gọn nhưng không bắt vận hành viên tìm lại món.
- **Không có UI kéo-thả/reorder topping (P3).** Thứ tự đảm bảo ổn định bằng `sort_order = max + 1` khi thêm (§5) + mini-app/admin luôn `ORDER BY sort_order, created_at`. Nếu sau cần đổi thứ tự mới thêm nút lên/xuống.

## 9. Thứ tự triển khai (sẽ chi tiết trong plan)

1. Migration: bảng `menu_item_toppings` + RLS + cột `order_items.selected_toppings` + sửa RPC `create_order`.
2. Cập nhật `database.types.ts` + các type liên quan.
3. Admin: query kèm topping + server actions + UI trong modal sửa món.
4. Mini-app: load topping + bottom sheet chọn + cart tách dòng + gửi `topping_ids`.
5. Hiển thị topping ở giỏ, checkout, màn theo dõi đơn, bếp.
6. Test theo TESTING.md (bổ sung checklist topping).

## 10. Rủi ro / lưu ý

- **Đơn cũ**: `selected_toppings` default `[]` → đơn cũ không vỡ. UI phải xử lý mảng rỗng (ẩn dòng topping).
- **Mini-app cần `zmp deploy`** sau khi đổi RPC payload — nếu không, app cũ gửi đơn không có `topping_ids` vẫn chạy (field tuỳ chọn) nhưng app mới cần bản RPC mới đã áp. Áp migration RPC **trước** khi deploy mini-app mới; RPC mới vẫn tương thích payload cũ (không có `topping_ids` = `[]`).
- **Topping bị xoá/ngừng bán giữa chừng**: snapshot JSONB đã chốt giá lúc đặt → đơn không đổi. RPC chặn đặt topping `is_available=false`.
