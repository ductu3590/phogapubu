# Trang Tài khoản Mini App — Design

**Ngày:** 2026-10-09 · **Trạng thái:** đã duyệt hướng trong chat, chờ duyệt spec
**Thay:** khung chờ "Cập nhật trong phiên bản sắp tới" của spec Stitch (Q7, `2026-10-05-mini-app-stitch-design.md`)

## 1. Mục tiêu

Biến `/account` từ khung trống thành trang **hồ sơ + quyền riêng tư**:

- Khách lấy **số điện thoại thật từ Zalo** một lần, form Đặt bàn / mang về tự điền sẵn, không phải gõ lại.
- Khách thấy rõ thông tin của mình nằm ở đâu và **tự xoá được**.

**Thành công khi:** khách mở Tài khoản → bấm "Lấy số từ Zalo" → số hiện ra → mở form Đặt bàn thấy tên + SĐT đã điền; bấm "Xoá thông tin cá nhân" → form trở lại trống.

## 2. Quyết định đã chốt

| # | Quyết định |
|---|---|
| Q1 | Phạm vi **chỉ hồ sơ + quyền riêng tư**. KHÔNG làm ví mã giảm giá, lịch sử đơn/đặt bàn, điểm tích luỹ ở trang này. |
| Q2 | SĐT lấy **số thật từ Zalo** (`getPhoneNumber` → server đổi token). |
| Q3 | SĐT **chỉ lưu trên máy khách** (localStorage). Server đổi token xong trả số về, **không ghi DB, không log số**. Không migration. |
| Q4 | Có **nhập tay dự phòng** khi Zalo lỗi / khách từ chối / quán chưa cấu hình secret. |
| Q5 | Không thêm tab. Lối vào giữ nguyên icon người trên `AppToolbar` (route `/account` đã có `back`, `hideBottomTabs`, `hideCart`). |

## 3. Màn `/account` (ngôn ngữ Stitch, `SectionCard`)

Từ trên xuống:

**3.1 Thẻ hồ sơ**
- Đã có quyền `scope.userInfo` → ảnh đại diện + tên Zalo (`getUserInfo`).
- Chưa có → avatar mặc định (`UserIcon`) + "Khách" + nút phụ **Kết nối Zalo** → `authorize({ scopes: ["scope.userInfo"] })` rồi `getUserInfo`. Từ chối thì giữ nguyên "Khách", không báo lỗi to.
- Tên Zalo lấy được → ghi vào hồ sơ (§5) **chỉ khi** hồ sơ chưa có tên (không đè tên khách đã tự sửa).

**3.2 Dòng Số điện thoại**
- Chưa có số → nút chính **Lấy số từ Zalo** + link nhỏ "Nhập tay".
- Đã có → hiện số dạng `0962 345 678` + nút **Cập nhật** (mở lại 2 lựa chọn: Zalo / nhập tay).
- Đang lấy → nút ở trạng thái chờ, không bấm lại được.
- Lỗi (từ chối quyền, quán chưa cấu hình, Zalo lỗi, mạng) → một dòng lỗi tiếng Việt dưới nút + tự mở ô nhập tay.
- Nhập tay: một ô SĐT + nút Lưu, kiểm bằng `normalizeVnPhone` (`utils/booking-validation.ts`) — cùng luật với form đặt bàn.

**3.3 Tên hiển thị khi đặt bàn**
- Ô tên sửa được (mặc định tên Zalo nếu có). Lưu cùng hồ sơ §5. Không bắt buộc.

**3.4 Quyền riêng tư**
- Dòng giải thích: "Tên và số điện thoại chỉ lưu trên điện thoại này để điền sẵn khi đặt bàn. Quán chỉ nhận khi bạn gửi đơn."
- Nút **Xoá thông tin cá nhân** (màu nguy hiểm, viền) → hộp xác nhận → xoá theo §6 → toast "Đã xoá".
- Hướng dẫn thu hồi quyền: "Muốn thu hồi quyền Zalo đã cấp: Zalo → Cá nhân → Cài đặt → Quyền riêng tư → Ứng dụng đã cấp quyền." (SDK không có lệnh thu hồi). *Đường dẫn menu kiểm lại trên Zalo thật khi test.*
- Link **Điều khoản sử dụng** → dùng lại `TermsSheet` + `DEFAULT_TERMS` như `/store-info`.

**3.5 Chân trang**: "Vận hành bởi MEVO" chữ nhỏ.

KHÔNG hiện Zalo UID, device id hay bất kỳ ID kỹ thuật nào.

## 4. Lấy SĐT từ Zalo

### 4.1 Client (`services/zalo-phone.ts`)
1. `getPhoneNumber()` → `{ token }`. Không có token (từ chối / app chưa được cấp quyền SĐT) → lỗi `denied`.
2. `getAccessToken()` → access token người dùng.
3. `fetch(${SUPABASE_URL}/functions/v1/zalo-phone, POST { storeId, token, accessToken })` — cùng kiểu gọi `checkout-create-mac` trong `payment.service.ts`.
4. Nhận `{ phone }` → `normalizeVnPhone` → lưu hồ sơ. Nhận `{ error }` → map sang câu tiếng Việt.

Mã lỗi client cần phân biệt: `denied` · `not_configured` · `zalo_error` · `network`.

### 4.2 Edge function `supabase/functions/zalo-phone/`
- Input: `{ storeId: uuid, token: string, accessToken: string }`; thiếu/sai kiểu → 400.
- Đọc `store_zalo_configs.zalo_app_secret_key` + `is_enabled` theo `storeId` bằng service_role (bảng mig 021, không policy, anon không đọc được).
  Không có dòng / secret rỗng / `is_enabled=false` → `{ error: "not_configured" }`.
- Gọi `GET https://graph.zalo.me/v2.0/me/info` với header `access_token`, `code` (= token), `secret_key`.
  Thành công → `data.number` (dạng `84xxxxxxxxx`) → trả `{ phone }`. Zalo trả `error != 0` → `{ error: "zalo_error" }` (log mã lỗi Zalo, **không log số, không log token**).
- **Không ghi DB.** CORS giống các function hiện có. Đặt logic trong `handler.ts` (hàm nhận `fetch` + đọc config được tiêm vào) để test được như `reservation-zca-notify`.
- ⚠️ Kiểm lại tên header/endpoint với tài liệu Zalo Mini App hiện hành khi làm (ghi chú: `docs` Zalo "Lấy số điện thoại người dùng").

**Lạm dụng:** function chỉ đổi được token hợp lệ do chính Zalo cấp cho app của quán → không lộ dữ liệu ai khác. Không cần rate limit riêng ở v1.

## 5. Một nguồn hồ sơ trên máy

- Dùng lại **`ReservationProfile { customerName, customerPhone }`** + `getReservationProfile` / `saveReservationProfile` (`services/reservation/reservation-storage.ts`, key `mevo_reservation_profile:<storeId>`). Không tạo key mới.
- Thêm `clearReservationProfile(storeId)`.
- Form Đặt bàn đã đọc profile (`reservation-form.tsx`) → không đổi.
- Form mang về (`pages/checkout`, key `TAKEAWAY_FORM_KEY`): khi ô tên / SĐT **đang trống** thì điền từ profile. Không đè dữ liệu khách đã gõ.
- Hàm thuần gộp hồ sơ (`utils/account-profile.ts`): `mergeProfile(current, patch, { overwriteName })` — quyết định có đè tên hay không, chuẩn hoá SĐT. Test vitest (node).

## 6. "Xoá thông tin cá nhân" xoá gì

| Xoá | Giữ (cố ý) | Vì sao giữ |
|---|---|---|
| Hồ sơ `mevo_reservation_profile:<storeId>` | `mevo_reservation_access*` (quyền xem lịch hẹn) | Xoá là khách không xem lại / không huỷ được lịch hẹn của chính mình |
| Bản nháp đặt bàn `mevo_reservation_draft:<storeId>` | `device-id` | Xoá là mất quyền chủ phiên bàn đang ngồi (khoá chủ phiên mig 039) |
| Tên + SĐT + địa chỉ trong form mang về (`TAKEAWAY_FORM_KEY`) | Giỏ hàng `mevo_cart` | Không phải dữ liệu cá nhân; tự hết hạn 6h |
| Cache tên/ảnh Zalo trong state trang | Cờ quan tâm OA | Không phải dữ liệu cá nhân |

Danh sách key cần xoá gom vào **một** hàm `clearPersonalData(storeId)` (`services/account-storage.ts`) để sau này thêm key cá nhân mới chỉ sửa một chỗ. Có test liệt kê đúng key xoá / key giữ.

## 7. Việc ngoài code (chỉ anh Tú làm được) — CHẶN test bài lấy số Zalo

1. Console Zalo app Bảo Lương: xin quyền **Số điện thoại** (nêu mục đích: điền sẵn form đặt bàn).
2. Điền `zalo_app_secret_key` của app Bảo Lương vào `store_zalo_configs` (em chạy SQL qua MCP khi anh đưa key — không commit key).

Chưa xong 2 việc này: trang vẫn chạy, nút Zalo báo lỗi và rơi về nhập tay (§3.2) — đây cũng là một bài test.

## 8. Ngoài phạm vi

Ví mã giảm giá, lịch sử đơn/đặt bàn, điểm tích luỹ / hạng khách, lưu SĐT lên server, POS xem SĐT khách, thu hồi quyền Zalo bằng code, đổi lối vào thành tab.

## 9. Kiểm thử

**Tự động (vitest node):** `mergeProfile` (đè / không đè tên, chuẩn hoá `84…`/`+84…`), `clearPersonalData` (đúng key xoá, đúng key giữ), map mã lỗi → câu tiếng Việt, `handler.ts` của edge function (thiếu input, chưa cấu hình, Zalo lỗi, thành công; khẳng định không gọi ghi DB).

**Tay trên Bảo Lương (Zalo thật):**
1. Mở Tài khoản lần đầu: "Khách" + Kết nối Zalo → cho quyền → tên/ảnh hiện.
2. Lấy số từ Zalo → số hiện đúng định dạng 0xxx.
3. Mở Đặt bàn → tên + SĐT đã điền sẵn.
4. Từ chối quyền SĐT → câu lỗi + ô nhập tay mở; nhập số sai → báo lỗi; nhập đúng → lưu.
5. Quán chưa có secret → "chưa hỗ trợ", rơi về nhập tay.
6. Xoá thông tin cá nhân → form Đặt bàn trống; lịch hẹn cũ VẪN xem được; bàn đang ngồi vẫn gọi món được.
7. Điều khoản mở đúng nội dung quán.
8. Khổ 360px không vỡ, góc phải thanh công cụ chừa chỗ nút Zalo.

## 10. Ước lượng

Một sprint nhỏ (AC-1): edge function + service + trang + nối form mang về + test. Không migration.
