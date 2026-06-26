# Takeaway Mode — Design Spec
**Ngày:** 2026-06-26  
**Nhánh:** `feat/takeaway-mode`  
**Trạng thái:** Approved ✅

---

## 1. Bối cảnh & Mục tiêu

Mini-app MEVO hiện chỉ hoạt động khi quét QR tại bàn (`storeSlug + tableId`). Để publish lên Zalo và nộp hồ sơ Bộ Công Thương, app cần có giao diện mặc định có thể dùng được khi truy cập từ xa.

**Mục tiêu:**
- Cho phép khách đặt món trước từ xa (mang về hoặc ship tận nhà)
- Thanh toán ZaloPay trước khi bếp làm → tránh lạm dụng QR
- Không build app mới — tích hợp chung vào mini-app hiện tại
- Backward compatible hoàn toàn với flow dine-in hiện tại

---

## 2. Kiến trúc Detection

App tự detect mode dựa trên QR params:

```
parseQRParams() →
  storeSlug ✓ + tableId ✓  →  orderMode = "dine_in"    (flow hiện tại)
  storeSlug ✓ + tableId ✗  →  orderMode = "takeaway"   (MỚI)
  storeSlug ✗              →  hiện "Quét QR tại bàn"   (giữ nguyên)
```

`storeSlug` trong mode takeaway được lấy từ QR param hoặc từ env var `VITE_DEFAULT_STORE_SLUG` (baked vào app khi build — mỗi quán có app riêng).

`app.store.ts` thêm field: `orderMode: 'dine_in' | 'takeaway'`

### QR / URL cho từng loại

| Loại | URL pattern | Dùng ở đâu |
|---|---|---|
| Ăn tại bàn | `?store=pho-ga-pubu&table=<uuid>` | QR in tại bàn |
| Mang về / Ship | `?store=pho-ga-pubu` (hoặc URL mặc định của app) | QR ở quầy thu ngân, link Zalo OA, Zalo Mini App store |

---

## 3. Thay đổi UI

### Màu sắc
Toàn bộ mode takeaway dùng màu `primary: #A0673D` — đúng màu brand hiện tại của app. Không thêm màu mới.  
*(Giai đoạn sau: `stores.brand_color` cho phép admin cấu hình per-store)*

### 3.1 Menu Page — Banner Mang về

Khi `orderMode === 'takeaway'`:
- Thêm banner màu `#A0673D` phía trên tab bar: *"🛵 Mang về / Ship · [Tên quán]"*
- Ẩn tab **"Đã gọi"** (không liên quan khi không có table session)
- Tab bar còn lại: **Menu** | **Nhà hàng**
- Nút cart bar đổi text: "Đặt mang về" thay vì "Đặt món"
- Toàn bộ menu, giỏ hàng, product detail — giữ nguyên

### 3.2 Checkout Page — Form mới

Khi `orderMode === 'takeaway'`, thêm section mới vào đầu form:

**Toggle chọn hình thức:**
```
[ 🚶 Tự qua lấy ]  [ 🛵 Ship tận nhà ]
```
Toggle dùng style pill, active = background `#A0673D`, text trắng.

**Fields theo hình thức:**

| Hình thức | Fields |
|---|---|
| Tự qua lấy | Tên người lấy, Số điện thoại, **Giờ qua lấy** (time picker, slot 15 phút) |
| Ship tận nhà | Tên người nhận, Số điện thoại, **Địa chỉ giao hàng** (text input) + note phí ship |

**Note phí ship (ship tận nhà):**
> ⚠️ Phí ship do đơn vị giao hàng thu trực tiếp khi giao. Không tính trong đơn này.

**Thanh toán:** ZaloPay bắt buộc (ẩn option tiền mặt khi `orderMode === 'takeaway'`)

### 3.3 Order Status Page

Hiển thị thông tin theo `order_type`:
- `pickup`: hiện giờ lấy dự kiến + địa chỉ quán
- `delivery`: hiện địa chỉ giao + note phí ship

### 3.4 Kitchen Display (Admin Web)

Badge phân loại trên mỗi card đơn hàng:

| order_type | Badge |
|---|---|
| `dine_in` | `🪑 Bàn X` — nền xanh lá `#1a7f4b` |
| `pickup` | `🚶 HH:MM` — nền nâu `#A0673D` |
| `delivery` | `🛵 Ship` — nền nâu `#A0673D` |

---

## 4. DB Schema Changes

**Migration:** `supabase/migrations/010_takeaway.sql`

```sql
ALTER TABLE orders
  ADD COLUMN order_type text NOT NULL DEFAULT 'dine_in'
    CHECK (order_type IN ('dine_in', 'pickup', 'delivery')),
  ADD COLUMN customer_name    text,       -- nullable; required khi pickup/delivery
  ADD COLUMN customer_phone   text,       -- nullable; required khi pickup/delivery
  ADD COLUMN pickup_time      timestamptz, -- required khi order_type = 'pickup'
  ADD COLUMN delivery_address text;       -- required khi order_type = 'delivery'
```

**Backward compatible:** Đơn dine-in hiện tại mặc định `order_type = 'dine_in'`, các field mới = NULL. Không cần sửa RLS, realtime subscription, hay code kitchen display hiện có (ngoài thêm badge).

### Mapping fields theo order_type

| order_type | table_id | customer_name/phone | pickup_time | delivery_address |
|---|---|---|---|---|
| `dine_in` | ✅ required | — null | — null | — null |
| `pickup` | — null | ✅ required | ✅ required | — null |
| `delivery` | — null | ✅ required | — null | ✅ required |

---

## 5. Danh sách file thay đổi

| File | Thay đổi |
|---|---|
| `mini-app/src/stores/app.store.ts` | Thêm `orderMode` state, update `parseQRParams()` để detect takeaway |
| `mini-app/src/app.tsx` | Load store bằng `VITE_DEFAULT_STORE_SLUG` khi không có QR param |
| `mini-app/.env` | Thêm `VITE_DEFAULT_STORE_SLUG=pho-ga-pubu` |
| `mini-app/src/pages/menu/index.tsx` | Banner takeaway + ẩn tab "Đã gọi" khi `orderMode === 'takeaway'` |
| `mini-app/src/components/layout/index.tsx` | Pass `orderMode` xuống tab bar để ẩn/hiện tab |
| `mini-app/src/pages/checkout/index.tsx` | Toggle Tự lấy/Ship + form fields mới + ZaloPay-only |
| `mini-app/src/pages/order-status/index.tsx` | Hiển thị pickup_time hoặc delivery_address |
| `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx` | Badge phân loại đơn (Bàn / Tự lấy / Ship) |
| `supabase/migrations/010_takeaway.sql` | ALTER TABLE orders thêm 5 fields |

---

## 6. Out of Scope (v1)

- Chọn giờ ship (ship là ASAP, bếp làm ngay)
- Tracking shipper realtime
- Quản lý đơn takeaway riêng trong admin (dùng chung kitchen display)
- `stores.brand_color` cấu hình màu per-store (để giai đoạn sau)
- ZNS cho đơn takeaway (cần xem xét flow riêng vì không có table session)

---

## 7. Ghi chú Bộ Công Thương / Zalo Review

Mode takeaway là giao diện mặc định khi mở app không QR. Đáp ứng yêu cầu:
- App có chức năng đặt hàng, thanh toán hoạt động độc lập (không phụ thuộc QR)
- Hiển thị tên quán, địa chỉ, menu đầy đủ
- Có luồng thanh toán ZaloPay hoàn chỉnh
