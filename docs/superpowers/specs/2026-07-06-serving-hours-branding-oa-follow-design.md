# Thiết kế: Splash MEVO + Giờ phục vụ/Phạm vi phục vụ + Khôi phục prompt quan tâm OA

> Ngày: 2026-07-06 · Nhánh: `feat/serving-hours-branding` (tách từ `main`)
> Gộp 3 việc trong 1 spec vì cùng chạm mini-app + admin settings, phạm vi vừa phải.

## Bối cảnh & tiền đề

- `feat/core-v2` **trùng khớp `main`** (0 commit lệch — đã merge). Xoá an toàn, không mất việc.
- Delivery/pickup đã tồn tại ở DB từ migration 010 (`orders.order_type`, `delivery_address`,
  `customer_name/phone`). Task 2 **không** dựng lại delivery — chỉ thêm *cấu hình* phía trên.
- `stores.zalo_oa_id` của Phở Gà Pubu = `4383784364160415101` (đã set) → prompt OA "biến mất"
  **không phải** do thiếu dữ liệu, mà do hành vi hiển thị (xem Task 3).

---

## Task 1 — Màn hình splash thương hiệu MEVO

**Vấn đề:** Trạng thái `!storeId` trong `mini-app/src/pages/menu/index.tsx:101` hiện lúc cold start
(trước khi resolve store config) và khi không có store context. Hiện đang là emoji 📷 + "Quét QR tại bàn".

**Thiết kế:**
- Thay nội dung nhánh `!storeId` của trang menu bằng splash thương hiệu:
  - Logo MEVO (căn giữa, ~96px), asset tại `mini-app/src/static/mevo-logo.png`.
  - Tiêu đề **MEVO.VN** (lớn, đậm, `text-primary`).
  - Tagline: "Giải pháp đặt bàn & thanh toán cho nhà hàng, quán ăn, quán cà phê, trà sữa..."
  - Dòng gợi ý nhỏ: "Vui lòng quét mã QR trên bàn để đặt món".
- **Logo:** anh Tú gửi file. Trước mắt dùng **placeholder tạm** (SVG chữ MEVO inline hoặc
  `static/logo.png` hiện có) để build chạy được ngay; khi có file thật chỉ cần thả vào
  `static/mevo-logo.png` — 1 điểm swap duy nhất, không đổi layout.
- **Phạm vi:** chỉ trang menu (đây là splash). Empty-state tab Cửa hàng / Đơn hàng giữ nguyên.

**Không làm:** không đổi màn skeleton loading (`MenuSkeleton`) — nó chỉ chớp khi có storeId.

---

## Task 2 — Giờ phục vụ + Phạm vi phục vụ

**Quyết định (chốt với anh Tú):**
- Ngoài giờ → **chặn tất cả** (cả đơn tại bàn QR lẫn mang về/ship).
- Giờ linh hoạt: hỗ trợ **nhiều ca/ngày** + công tắc **"Tạm nghỉ"** thủ công (quán nghỉ lễ).
- Phạm vi ship = **chỉ hiển thị thông tin**, không geocoding/không chặn.

### Dữ liệu — migration mới `017_serving_hours.sql`

Thêm vào bảng `stores`:

| Cột | Kiểu | Default | Ý nghĩa |
|---|---|---|---|
| `is_accepting_orders` | boolean | `true` | Công tắc chủ "Đang nhận đơn / Tạm nghỉ". `false` = đóng cửa hoàn toàn |
| `serving_hours` | jsonb | `'[]'` | Mảng ca phục vụ, VD `[{"open":"06:00","close":"14:00"},{"open":"17:00","close":"22:00"}]`. Rỗng = mở cả ngày (không giới hạn giờ) |
| `delivery_area_note` | text | `null` | Text tự do mô tả phạm vi ship, VD "Ship ~3km khu vực TP Lào Cai" |

- Giờ lưu dạng chuỗi `"HH:mm"`, hiểu theo múi giờ **Asia/Ho_Chi_Minh**.
- Ca qua đêm (close < open, VD `18:00`–`02:00`) được hỗ trợ bằng logic wrap.

### Logic "quán đang mở"

`isStoreOpen(store, now)`:
```
if (!is_accepting_orders) return false
if (serving_hours rỗng) return true
now_hcm = now theo Asia/Ho_Chi_Minh (HH:mm)
return có ít nhất 1 ca chứa now_hcm
  (ca thường: open <= now < close; ca qua đêm open>close: now>=open || now<close)
```

### Thực thi — 2 lớp

1. **Mini-app (UX):**
   - Helper thuần `mini-app/src/utils/store-hours.ts` → `isStoreOpen(store, now)`, có unit test.
   - Trang menu: khi đóng → banner "Quán đang tạm nghỉ" hoặc "Ngoài giờ phục vụ (hiển thị khung giờ)",
     **vô hiệu hoá** thêm-giỏ + nút thanh toán. Vẫn cho xem menu.
   - `is_accepting_orders` + `serving_hours` thêm vào query store trong `app.tsx` và `app.store.ts`.
2. **Server (chống lách) — sửa RPC `create_order`:**
   - Đầu hàm, sau khi load store, kiểm tra `is_accepting_orders` và `serving_hours`
     (dùng `now() AT TIME ZONE 'Asia/Ho_Chi_Minh'`). Đóng → `RAISE EXCEPTION 'Quán đang đóng cửa hoặc ngoài giờ phục vụ'`.
   - **Lưu ý chữ ký:** phải bám đúng chữ ký `create_order` hiện hành (kiểm tra migration mới nhất
     trước khi sửa — không đổi tham số, chỉ thêm check nội bộ).

### Admin `/admin/settings`

- **Toggle** "Đang nhận đơn / Tạm nghỉ" → `is_accepting_orders`.
- **Editor ca phục vụ:** danh sách hàng open–close (time inputs), thêm/xoá ca. Rỗng = "Mở cả ngày".
- **Text** "Phạm vi ship (hiển thị cho khách)" → `delivery_area_note`.
- Cập nhật `updateStoreSettings` (`admin-web/lib/actions/store.ts`) + `SettingsClient` props.
- `delivery_area_note` hiển thị thêm ở tab Cửa hàng mini-app (`store-info`).

---

## Task 3 — Khôi phục prompt "quan tâm OA"

**Root cause (đã xác minh):** Code + data đều còn nguyên. v6 (`9995b7d`) **auto-gọi `followOA`**
mỗi lần vào tab. Bản sau ("Option C" `0bcc63c`) đổi thành sheet tự bật **1 lần duy nhất**, khoá bởi
`localStorage`. Sau khi bấm "Đồng ý" một lần, `mevo_perms_granted_<storeId>` được set →
**cả sheet lẫn CTA card biến mất vĩnh viễn** — dù cờ này chỉ nghĩa "đã bấm nút", không phải "đã follow".

**Quyết định (chốt):** CTA card **luôn hiện** + sheet tự bật **1 lần/phiên**.

**Thiết kế (`mini-app/src/pages/store-info/index.tsx` + `permission-sheet.tsx`):**
- **CTA card** "🔔 Kết nối với {quán}" hiện mỗi lần vào tab khi chưa kết nối — **không** bị cờ
  `granted` cũ ẩn đi.
- **Auto-sheet** bật 1 lần **mỗi phiên mở app** (dùng cờ theo session, VD `sessionStorage` hoặc
  state in-memory) thay vì 1-lần-vĩnh-viễn, khi chưa kết nối.
- **Trạng thái "đã kết nối"** không còn dựa cờ local "đã bấm". Ưu tiên trạng thái thật:
  - Nếu `followOA` resolve thành công (user thực sự đồng ý) → đánh dấu connected (`localStorage`).
  - Nếu bị `-201` (từ chối) → **không** đánh dấu connected → lần sau vẫn mời.
- Giữ nút "Để sau" (dismiss chỉ tắt sheet phiên này, CTA card vẫn còn).

---

## Kiểm thử (bổ sung TESTING)

- **Task 1:** mở app không QR → thấy splash MEVO (logo + MEVO.VN + tagline). Có storeId → vào menu bình thường.
- **Task 2:**
  - Tạm nghỉ ON → menu chặn đặt (cả bàn lẫn ship); server từ chối `create_order`.
  - Đặt ca 06:00–14:00, test lúc trong/ngoài ca (giả lập giờ) → mở/đóng đúng.
  - Nhiều ca (sáng+tối), nghỉ trưa → đóng đúng lúc nghỉ trưa.
  - `delivery_area_note` hiện ở tab Cửa hàng.
- **Task 3:**
  - Chưa follow → vào tab Cửa hàng: sheet tự bật (1 lần/phiên) + CTA card hiện.
  - Bấm "Để sau" → sheet ẩn, CTA card còn; đóng/mở lại app → sheet bật lại.
  - Đồng ý & follow OA thật → CTA card ẩn.

## Ngoài phạm vi (YAGNI)

- Không geocoding/tính khoảng cách ship.
- Không giờ riêng từng thứ trong tuần (chỉ ca áp dụng mọi ngày + toggle nghỉ thủ công).
- Không đổi luồng ZNS/webhook.
