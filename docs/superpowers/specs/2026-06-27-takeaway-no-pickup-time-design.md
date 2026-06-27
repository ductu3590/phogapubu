# Takeaway: Bỏ hẹn giờ + Kitchen làm nổi bật đơn mang về — Design

> Tinh chỉnh tính năng "Mang về" đã build (xem `2026-06-26-takeaway-mode-design.md`).
> Quyết định liên quan: CLAUDE.md mục 10 (2026-06-26) — hướng ZaloPay-only, đơn vào bếp sau khi có tiền.

## Mục tiêu

1. **Bỏ hẹn giờ qua lấy.** Luồng mới: khách đặt → chuyển tiền → bếp chuẩn bị **theo thứ tự đơn** → bếp bấm "đã chuẩn bị xong" → khách nhận tin Zalo "qua lấy đồ". Không còn chọn giờ.
2. **Kitchen display làm nổi bật đơn mang về** để bếp nhận ra ngay (đóng túi mang đi, không ra bát) — quy chế đóng túi là nội bộ quán, KHÔNG in lên màn hình.
3. **Lưu form mang về** để khách không phải nhập lại khi thanh toán lại sau khi lỡ thoát.

## Phạm vi đã chốt

- Giữ **cả 2** loại mang về: 🚶 Tự qua lấy + 🛵 Ship tận nhà. Chỉ bỏ ô chọn giờ ở nhánh Tự lấy (delivery vốn không có giờ).
- Form **Tự qua lấy**: chỉ thu **Tên**. Form **Ship**: Tên + SĐT + Địa chỉ (shipper cần gọi).
- Không thay đổi phá vỡ dữ liệu cũ. Cột `pickup_time` giữ lại (nullable, ngừng ghi).

---

## Part 1 — DB migration `012_takeaway_no_pickup_time.sql`

DB hiện **bắt buộc** pickup phải có giờ (RPC raise nếu thiếu) → phải sửa trước.

- **DROP** constraint `chk_pickup_time_required`.
- **Sửa** `chk_customer_info_required` → takeaway cần `customer_name`; `customer_phone` chỉ bắt buộc khi `delivery`:
  ```sql
  CHECK (
    order_type = 'dine_in'
    OR (
      customer_name IS NOT NULL
      AND (order_type <> 'delivery' OR customer_phone IS NOT NULL)
    )
  )
  ```
  (Drop constraint cũ rồi ADD constraint mới cùng tên.)
- **Giữ** `chk_delivery_address_required` nguyên trạng.
- **Giữ** cột `pickup_time` (nullable, không ghi nữa) — non-destructive.
- **Recreate** RPC `create_order`: bỏ param `p_pickup_time`, bỏ block validate giờ pickup, bỏ `pickup_time` khỏi INSERT. Đổi signature → REVOKE/DROP function 11-param cũ, CREATE function 10-param mới, GRANT EXECUTE cho `anon`. Vẫn enforce: takeaway = ZaloPay-only; pickup cần name; delivery cần name + phone + address.

Verify: chèn 1 pickup order chỉ có name (không phone/time) → thành công.

## Part 2 — Mini-app: bỏ chọn giờ + lưu form

### `mini-app/src/pages/checkout/index.tsx`
- Xoá `generatePickupSlots()`, `slotToTimestamp()`, state `pickupTime`, và toàn bộ khối `<select>` "Giờ qua lấy".
- Ô **SĐT** chỉ render khi `takeawayType === 'delivery'` (pickup không cần phone). Ô **Địa chỉ** vẫn chỉ delivery.
- `isTakeawayFormValid`:
  ```ts
  !isTakeaway
    || (takeawayType === 'pickup'
        ? customerName.trim() !== ''
        : customerName.trim() !== '' && isPhoneValid(customerPhone) && deliveryAddress.trim() !== '')
  ```
- `handleOrder`: payload pickup chỉ gửi `orderType + customerName`; delivery gửi `orderType + customerName + customerPhone + deliveryAddress`. Bỏ hẳn `pickupTime`.
- Bỏ message validate liên quan giờ; pickup chỉ check tên.

### Lưu form vào localStorage (yêu cầu mới)
- Key: `mevo_takeaway_form`. Shape: `{ takeawayType, customerName, customerPhone, deliveryAddress }`.
- **Hydrate**: các `useState` của form khởi tạo (lazy init) từ giá trị parse trong localStorage nếu có.
- **Persist**: một `useEffect` ghi JSON xuống localStorage mỗi khi 4 field đổi.
- **Không auto-clear** — giữ lại để lần sau (kể cả khi quay lại sau huỷ đơn) tự điền sẵn. Khách vẫn sửa được.
- Chỉ áp dụng khi `isTakeaway`.

### `mini-app/src/pages/order-status/index.tsx`
- `TakeawayInfoCard` nhánh **pickup**: bỏ hiển thị giờ. Lấy `storeName`/`storeAddress` từ `useAppStore`. Hiển thị theo status:
  - `status !== 'ready'`: "🚶 Tự qua lấy tại {storeName} · {storeAddress}. Bếp chuẩn bị theo thứ tự — bạn sẽ nhận thông báo Zalo khi món xong."
  - `status === 'ready'`: "🎉 Món xong rồi! Mời bạn qua {storeName} lấy đồ."
- Nhánh **delivery**: giữ nguyên.

### `mini-app/src/types/order.types.ts`
- Bỏ `pickupTime` khỏi `CreateOrderRequest`. Trường `Order.pickupTime` có thể giữ (luôn null) để không phải sửa `mapOrder` — không còn code nào đọc.

### `mini-app/src/services/order/order.api.ts`
- Bỏ `p_pickup_time` khỏi tham số gọi `supabase.rpc("create_order", {...})`.

## Part 3 — Kitchen display: đơn mang về NỔI BẬT

`admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx` — trong `OrderCard`, khi `order.orderType !== 'dine_in'`:
- **Banner đỉnh card**, nền amber đậm, chữ to đậm — chỉ nhãn loại đơn, KHÔNG kèm ghi chú đóng túi:
  - pickup: **📦 MANG VỀ** ; delivery: **🛵 SHIP**
- **Viền card amber dày** (`border-2`) cho đơn takeaway để quét mắt phân biệt với đơn ăn tại bàn. Banner luôn hiện kể cả khi đơn quá giờ (đỏ) / đã xong (xanh).
- `OrderTypeBadge`: pickup đổi `🚶 HH:MM` → **🚶 Tự lấy** (bỏ giờ). Delivery giữ `🛵 Ship`. Giữ tên khách + địa chỉ delivery như hiện tại.

`admin-web/types/database.types.ts`: cột `pickup_time` giữ trong `OrderRow` (DB còn cột). `KitchenOrder.pickupTime` không còn dùng — giữ field cũng được, không cần sửa.

## Part 4 — ZNS đổi nội dung theo loại đơn

`supabase/functions/zns-notify/index.ts`:
- Thêm `order_type, customer_name` vào câu `select`.
- Tách message theo `order_type`:
  - **pickup**: "🍜 Món của bạn đã chuẩn bị xong! Mời bạn qua {store} lấy đồ. Đơn #{X}."
  - **delivery**: "🍜 Đơn của bạn đã xong, shipper sẽ sớm giao đến. Đơn #{X}."
  - **dine_in**: giữ nguyên câu hiện tại.

---

## Files

| File | Thay đổi |
|---|---|
| `supabase/migrations/012_takeaway_no_pickup_time.sql` | CREATE: drop/relax constraints + recreate `create_order` (bỏ pickup_time) |
| `supabase/functions/zns-notify/index.ts` | Message theo `order_type` |
| `mini-app/src/pages/checkout/index.tsx` | Bỏ chọn giờ; pickup chỉ tên; lưu form localStorage |
| `mini-app/src/pages/order-status/index.tsx` | Pickup card bỏ giờ, theo status |
| `mini-app/src/types/order.types.ts` | Bỏ `pickupTime` khỏi `CreateOrderRequest` |
| `mini-app/src/services/order/order.api.ts` | Bỏ `p_pickup_time` khi gọi RPC |
| `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx` | Banner + viền nổi bật; badge bỏ giờ |

## Out of scope (YAGNI)

- Không drop cột `pickup_time` (giữ cho an toàn dữ liệu).
- Không đụng luồng dine-in, nút chuông, tab "Đã gọi".
- Không thêm hẹn giờ cho delivery.
