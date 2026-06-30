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

```sql
CREATE TABLE menu_item_toppings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id  uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  store_id      uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name          text NOT NULL,
  price         int  NOT NULL DEFAULT 0,   -- phụ thu, VNĐ (>= 0)
  is_available  boolean NOT NULL DEFAULT true,
  sort_order    int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

- `store_id` lưu kèm (denormalize) để RLS và tra cứu trong RPC nhanh, không phải join `menu_items`. RPC vẫn kiểm chéo `menu_item_id` thuộc đúng `store_id`.
- `ON DELETE CASCADE` từ `menu_items`: xoá món → topping của món tự xoá.
- `price >= 0` ràng buộc bằng CHECK.
- Index: `(menu_item_id)` để load topping theo món.

### 2.2 Cột mới `order_items.selected_toppings`

```sql
ALTER TABLE order_items
  ADD COLUMN selected_toppings jsonb NOT NULL DEFAULT '[]'::jsonb;
```

- Snapshot dạng `[{ "name": "Thêm trứng", "price": 10000 }, ...]` lúc tạo đơn.
- `item_price` (đã có) tiếp tục là **giá 1 suất món chưa gồm topping** — GIỮ NGUYÊN ý nghĩa cũ để không vỡ dữ liệu/đơn cũ. Phụ thu topping nằm trong `selected_toppings`. Thành tiền 1 dòng = `(item_price + tổng price topping) * quantity`. (Xem 2.3 để biết tại sao tách rõ.)

### 2.3 Quy ước tính tiền (thống nhất giữa server, mini-app, bếp)

Cho mỗi `order_items`:
```
line_unit_price = item_price + SUM(selected_toppings[].price)
line_total      = line_unit_price * quantity
```
`orders.total_amount` = SUM(line_total) trên mọi dòng. RPC tính lại toàn bộ từ DB, không tin client.

## 3. RLS

- `menu_item_toppings`: bật RLS.
  - **anon (mini-app)**: SELECT cho phép đọc topping của store (giống `menu_items` hiện tại — đọc menu công khai). Theo policy menu_items đang có, áp cùng kiểu.
  - **INSERT/UPDATE/DELETE**: chỉ service-role (admin web dùng `createAdminClient`) — khớp cách `menu_items` đang được ghi qua admin client, không mở cho anon.
- `order_items.selected_toppings`: không thêm policy mới; ghi qua RPC `create_order` (SECURITY DEFINER) như hiện tại.

> Việc làm: đọc lại policy thực tế của `menu_items` trong `002_indexes_rls_realtime.sql` / `006b_tighten_admin_rls.sql` khi viết migration, nhân bản đúng kiểu cho `menu_item_toppings`.

## 4. RPC `create_order` — sửa

Mỗi phần tử `p_items` nhận thêm field tuỳ chọn `topping_ids` (mảng uuid):

```jsonc
{ "menu_item_id": "...", "quantity": 2, "note": "...", "topping_ids": ["...", "..."] }
```

Logic bổ sung trong vòng lặp món (sau khi đã xác thực `v_menu`):
1. Khởi tạo `v_toppings jsonb := '[]'`, `v_topping_total int := 0`.
2. Nếu `topping_ids` không rỗng: SELECT từ `menu_item_toppings`
   WHERE `id = ANY(topping_ids)` AND `menu_item_id = v_menu.id` AND `store_id = p_store_id` AND `is_available = true`.
   - Mỗi hàng: cộng `price` vào `v_topping_total`, append `{name, price}` vào `v_toppings`.
   - Nếu số topping tìm thấy < số id gửi lên → RAISE EXCEPTION (topping không hợp lệ / ngừng bán / sai món).
3. `INSERT INTO order_items (..., item_price, ..., selected_toppings)`
   với `item_price = v_menu.price` (GIỮ nguyên — chưa gồm topping) và `selected_toppings = v_toppings`.
4. `v_total := v_total + (v_menu.price + v_topping_total) * v_qty`.

- Chữ ký RPC (10 param) **không đổi** — `topping_ids` nằm trong JSON `p_items`, không phải param mới. Không cần DROP/CREATE đổi signature.
- Migration tạo lại function bằng `CREATE OR REPLACE` cùng signature.

## 5. Admin web — quản lý topping

Trong `admin-web/app/admin/menu/menu-client.tsx`, modal **"Sửa món"** (`ItemForm` khi có `item`):

- Thêm section "Topping (tuỳ chọn)" — chỉ hiện khi sửa món đã tồn tại (cần `menu_item_id`). Khi **thêm món mới**: lưu món trước, rồi sửa để thêm topping (đơn giản hoá; không quản lý topping trong form tạo mới).
- Mỗi dòng topping: input tên, input giá (VNĐ), toggle tạm hết, nút xoá.
- Nút "+ Thêm topping" thêm dòng trống.
- Lưu: server actions mới trong `admin-web/lib/actions/menu.ts`:
  - `addTopping(menuItemId, name, price)` → insert (lấy `store_id` từ món, xác thực user qua `getStoreId`).
  - `updateTopping(toppingId, { name, price, is_available })`.
  - `deleteTopping(toppingId)`.
  - `toggleTopping(toppingId, isAvailable)` (hoặc gộp vào `updateTopping`).
  - Mọi action xác thực bằng `getStoreId()` và kiểm topping thuộc đúng store trước khi ghi.
- Trang `admin/menu/page.tsx` query kèm `menu_item_toppings` để hiển thị sẵn (lồng trong `menu_items`).
- Danh sách món: hiển thị badge số topping (VD "3 topping") để dễ thấy món nào đã có.

## 6. Mini-app — chọn topping khi đặt

### 6.1 Tải dữ liệu
- `category.queries` / service load menu: kèm `menu_item_toppings` (chỉ `is_available = true`, sort theo `sort_order`) cho mỗi `Product`.
- Thêm vào type `Product`: `toppings: Topping[]` với `Topping = { id, name, price }`.

### 6.2 Luồng chọn (trang `menu/index.tsx`)
- Món **không có topping** (`toppings.length === 0`): giữ nguyên nút +/- quick-add như hiện tại.
- Món **có topping**: nút "+" mở **bottom sheet**:
  - Tiêu đề món + ảnh.
  - Danh sách topping checkbox, mỗi dòng "Tên +giá".
  - Tổng tiền 1 suất cập nhật theo lựa chọn.
  - Nút "Thêm vào giỏ" (đóng sheet, thêm vào cart).
  - **Mỗi lần "Thêm vào giỏ" = +1 suất** với tổ hợp topping đã chọn. Điều chỉnh số lượng sau đó bằng nút +/- trong giỏ (không có chọn số lượng trong sheet — giữ sheet gọn).

### 6.3 Cart — tách dòng theo tổ hợp topping
- `cart.types` `SelectedVariant` đã có sẵn khung — tái dùng để chứa topping:
  `{ groupId: "topping", groupTitle: "Topping", optionId: toppingId, optionName, extraPrice, quantity: 1 }`.
  (Hoặc giữ field nhưng đặt `groupId` cố định = "topping". Quyết định cụ thể khi viết plan; không phát sinh khái niệm group cho user.)
- `generateCartItemId`: đổi từ `productId` sang `productId + "|" + sortedToppingIds.join(",")` để Phở+trứng và Phở thường là 2 dòng khác nhau, đồng thời trùng tổ hợp thì gộp số lượng.
- `calculateTotals` đã cộng `extraPrice` sẵn — không phải sửa nhiều.
- Hiển thị topping dưới tên món trong giỏ + màn checkout.

### 6.4 Gửi đơn
- `order.api.ts` `createOrder`: map mỗi item kèm `topping_ids` = danh sách `optionId` của `selectedVariants`.
- `CreateOrderRequest.items[]` thêm `toppingIds?: string[]`.

## 7. Bếp + màn theo dõi đơn — hiển thị topping

- `order.api.ts` `getOrderWithItems`: map thêm `selectedToppings` từ `order_items.selected_toppings` vào `OrderItem`.
- `OrderItem` type thêm `selectedToppings: { name: string; price: number }[]`.
- Màn theo dõi đơn (mini-app `order-status`) + Kitchen Display (admin/next): hiển thị topping dạng dòng phụ dưới tên món, VD: `Phở gà đặc biệt ×1` / `+ Trứng, + Quẩy`.
- Kiểm các nơi khác đang đọc `order_items` (session-orders, kitchen) để hiển thị nhất quán.

## 8. Phạm vi KHÔNG làm (YAGNI)

- Không có nhóm topping / quy tắc bắt buộc / radio-select.
- Không chọn số lượng từng topping.
- Không topping dùng chung nhiều món (reuse).
- Không báo cáo thống kê topping bán chạy.
- Không quản lý topping trong form **thêm món mới** (chỉ trong sửa món).

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
