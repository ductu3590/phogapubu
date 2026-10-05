# Mini App Stitch — MA-3 (Trang chủ m01 + Đặt bàn m02 + Đơn của tôi m03 + Chỉ đường Google Maps) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lối vào thường (mở app không qua QR bàn) có Trang chủ m01, Đặt bàn m02, Đơn của tôi m03 theo ngôn ngữ mới; mọi chỗ hiện địa chỉ quán có nút **Chỉ đường** mở link Google Maps cấu hình trong admin.

**Architecture:** Mig 090 thêm `stores.google_maps_url`; admin Cài đặt quán thêm ô nhập; Mini App đọc ở `app.tsx`. Quyết định thuần (link chỉ đường, chip ngày, bộ tab lối thường, tông trạng thái đặt bàn) là hàm có vitest. Trang chủ = trang Thực đơn ở lối thường có thêm phần đầu (ảnh bìa + thông tin quán + CTA), ô tìm + chip dính trong vùng cuộn. Logic đặt bàn / đổi lịch / huỷ / đặt món trước giữ nguyên.

**Tech Stack:** như MA-1/MA-2; admin-web Next 16 server action `lib/actions/store.ts`.

**Spec:** `docs/superpowers/specs/2026-10-05-mini-app-stitch-design.md` §4 MA-3, Q9. Số migration: spec ghi 088 nhưng 088/089 đã dùng ở MA-2 → **090**.

## Global Constraints

- Như MA-1/MA-2. Chỉ kiểm trên Bảo Lương (lối thường: chỉ xem menu + có đặt bàn).
- `google_maps_url` chỉ nhận `https://…`, rỗng = xoá; không link → nút Chỉ đường tìm theo địa chỉ; không địa chỉ → ẩn.
- Không dùng `window.alert/confirm` trong luồng khách.

## Dữ liệu đã biết

- `CustomerReservation` không có bàn đã xếp → bỏ "Vị trí bố trí" của m03.
- Không có trường "khu vực mong muốn" → bỏ khối đó của m02 (đã ghi spec §6).

## Review Focus

1. **Link Google Maps dán kèm khoảng trắng / không phải https / javascript:** → admin từ chối, app không mở link lạ. Test `directionsUrl` + test server action.
2. **Ngày đặt bàn gần nửa đêm, múi giờ máy khác VN** → chip "Hôm nay" đúng ngày VN (dựa `localToday` server trả). Test `dateChips`.
3. **Quán lối thường vừa mang về vừa đặt bàn** → vẫn tới được danh sách đặt bàn. Test `tabsFor`.
4. **Đặt bàn khi quán đóng cửa hôm nay** → form vẫn đặt được ngày khác (server là chốt). Kiểm ảnh.
5. **Huỷ đặt bàn bấm nhầm** → có hộp xác nhận, bấm ra ngoài không huỷ.

---

### Task 1: Mig 090 + admin Cài đặt quán + Mini App đọc link + `directionsUrl`
- Create `supabase/migrations/090_store_google_maps_url.sql`: `ALTER TABLE stores ADD COLUMN IF NOT EXISTS google_maps_url text CHECK (google_maps_url IS NULL OR google_maps_url ~ '^https://')`. Áp prod; kiểm anon đọc được (SELECT cột qua quyền bảng).
- admin-web `lib/actions/store.ts`: đọc `google_maps_url` (trim, rỗng → null, không `https://` → lỗi "Link Google Maps phải bắt đầu bằng https://"). Test trong test hiện có của action (nếu có) hoặc tách hàm thuần `normalizeMapsUrl` + test.
- `app/admin/settings/page.tsx` select thêm cột; `settings-client.tsx` thêm ô "Link Google Maps (chỉ đường)" cạnh Địa chỉ, gợi ý "Mở Google Maps → Chia sẻ → Sao chép đường liên kết".
- Mini App: `app.tsx` select + `app.store.ts` field `googleMapsUrl`.
- `mini-app/src/utils/directions.ts` `directionsUrl(mapsUrl, address): string | null` — link https hợp lệ → link; không → `https://www.google.com/maps/search/?api=1&query=<encodeURIComponent(address)>`; cả hai rỗng → null. Test 4 nhánh + link `javascript:` bị bỏ.
- Mở link bằng `openWebview` (zmp-sdk) như trang Thông tin nhà hàng đang mở OA.

### Task 2: Hàm thuần MA-3
- `tabsFor` (nav-sets): lối thường — Trang chủ `/`; Đặt bàn `/reservations/new` (nếu có đặt bàn); Đơn của tôi = `/reservations` khi chỉ-xem-menu + có đặt bàn, ngược lại `/session-orders` (mang về). `matchPaths` Đặt bàn gồm `/reservations/new`; Đơn của tôi (đặt bàn) gồm `/reservations`. Sửa test cũ + thêm test quán vừa mang về vừa đặt bàn (Đơn của tôi = `/session-orders`, trang đó có lối sang danh sách đặt bàn — Task 5).
- `dateChips(minimumDate, maximumDate, localToday)` → `[{ value: "2026-10-05", top: "HÔM NAY" | "T2".."CN", day: "05", month: "Th10" }]`, tối đa 14 chip, tính bằng chuỗi ngày (không phụ thuộc múi giờ máy). Test hôm nay / Chủ nhật / qua tháng.
- `reservationTone(status)` → `PillTone` + nhãn (dời bảng STATUS của `reservation-status.tsx` vào `utils/reservation-display.ts`). Test.

### Task 3: Trang chủ m01 (lối thường)
- `pages/menu/index.tsx`: khi `entryContext.kind === "root"` hiện phần đầu `HomeHero` (file mới `components/home/home-hero.tsx`): ảnh bìa (`takeawayBannerUrl` hoặc khối màu chủ đạo + logo/chữ viết tắt + tên quán), thẻ thông tin: địa chỉ + nút **Chỉ đường**, giờ phục vụ + `StatusPill` Đang mở/Đã đóng cửa (`isStoreOpen`, `formatServingHours`), nút gọi điện; nút lớn **Đặt bàn trước** (nếu đặt bàn bật) → `/reservations/new`; thẻ "Đang ngồi tại quán? Quét mã QR trên bàn để gọi món" (nếu `tableOrderingEnabled`).
- Vùng cuộn mới: [HomeHero] → ô tìm + chip **dính** (`sticky top-0`) → danh sách. Tiêu đề trên danh sách: "Thực đơn tham khảo" khi chỉ xem. `activeCategoryAt` đo theo đáy khối chip dính (ref).
- Lối thường không còn `OrderingUnavailableBanner` (Trang chủ đã nói rõ). Lối QR bàn giữ nguyên.
- Router `/`: title rỗng → thanh công cụ hiện tên quán (đã vậy).

### Task 4: Đặt bàn m02
- `components/reservations/reservation-form.tsx` giữ toàn bộ state/submit; trình bày lại bằng `SectionCard`:
  1. **Thông tin người đặt** (icon người): Họ tên, SĐT (ô nền nhạt, nhãn "Bắt buộc").
  2. **Thời gian đến quán**: chip ngày (`dateChips`) cuộn ngang thay ô `type=date`; lưới giờ 4 cột từ `slotsQuery`; dòng phụ "Bước nhảy N phút" (`slotIntervalMinutes`).
  3. **Số lượng khách**: nút − / số / + (1–100) + chip nhanh 2 · 4 · 6 · 10.
  4. **Ghi chú cho quán** (không bắt buộc).
  - Nút đáy `StickyActionBar` "Xác nhận đặt bàn" (đổi lịch: "Gửi yêu cầu đổi lịch").
- `pages/reservations/new.tsx`: bỏ tiêu đề riêng (thanh công cụ có), route `/reservations/new` handle `{ title: "Đặt bàn", back: false, hideCart: true }` (hiện tab).

### Task 5: Đơn của tôi m03 (danh sách + chi tiết) + hộp xác nhận
- `components/ui/confirm-sheet.tsx` (mới): sheet đáy, tiêu đề, mô tả, nút chính đỏ / nút phụ, bấm nền đóng.
- `pages/reservations/index.tsx`: route title "Đơn của tôi"; thẻ mỗi đặt bàn: giờ (to), số khách · tên, `StatusPill` (`reservationTone`); trống → thẻ giữa trang + nút "Đặt bàn trước".
- `pages/reservations/detail.tsx` (title "Chi tiết đặt bàn"): thẻ trạng thái lớn (nền theo tông + thông điệp `reservationActions().message`, cảnh báo đổi lịch đang chờ) → khối **Đặt món trước khi đến** (nếu `canPreorder`, CTA "Chọn món đặt trước") hoặc **Món đã đặt trước** (danh sách món) → **Chi tiết lịch hẹn** (người đặt, SĐT, số khách, giờ, ghi chú) → **Thông tin quán** (địa chỉ + Chỉ đường, Gọi ngay) → hai nút **Sửa đặt bàn** / **Huỷ bàn** (huỷ qua `ConfirmSheet`).
- `/session-orders` lối thường của quán vừa mang về vừa đặt bàn: thêm liên kết "Xem đặt bàn của tôi" (chỉ khi có `getBookingAccesses`).
- Tiêu đề thanh công cụ `/session-orders` ở lối thường: "Đơn của tôi" (sửa minor MA-2).

### Task 6: Ảnh chụp + checklist
- Merge vào worktree Bảo Lương; chụp 360/390 lối thường: Trang chủ (cuộn qua hero → chip dính), Đặt bàn (chip ngày, lưới giờ, stepper), Đơn của tôi (danh sách + chi tiết, mock RPC đặt bàn nếu thiết bị chưa có lượt đặt), Thông tin nhà hàng có Chỉ đường; admin Cài đặt quán có ô link.
- `docs/testing/mini-app-stitch/MA-3.md` + mục lục; dừng chờ `MA-3 PASS`.
