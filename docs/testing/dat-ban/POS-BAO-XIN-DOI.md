# POS báo "Điều chỉnh" khi khách sửa lịch đặt bàn

**Lỗi:** khách đặt bàn trên Mini App (đã đặt món trước), sau đó vào sửa lịch (tăng số người) → gửi cho quán, nhưng POS
không báo gì để quán duyệt.

**Nguyên nhân:** DB đánh dấu "khách xin đổi" bằng cột `requested_arrival_at` / `requested_party_size`, còn `status` giữ
nguyên `confirmed` (hoặc `pending`). admin-web lại chỉ nhận ra yêu cầu đổi khi `status = 'change_requested'` — giá trị
không RPC nào ghi. Toàn bộ giao diện duyệt yêu cầu đổi (ô "Xin đổi" trên POS, nút "Xử lý yêu cầu đổi" ở trang Đặt bàn,
RPC `resolve_reservation_change`) có sẵn nhưng chưa từng hiện.

**Chữ hiển thị:** "Điều chỉnh" (anh Tú 2026-11-19: không dùng "khách xin đổi").

**Sửa:** `admin-web/lib/reservation-rows.ts` — `toReservationRow` coi đơn `pending`/`confirmed` có `requested_arrival_at`
là `change_requested` (khớp cờ `has_change_request` của SQL). Không đổi DB, không đổi Mini App.

**Agent đã kiểm:** test `lib/reservation-rows.test.ts` (4 bài) + toàn bộ vitest admin-web 1883/1883; RPC
`list_reservation_queue` (vai `yg-pos`) trả đơn đang có ở Yên Garden: `status confirmed`, 6 người, xin đổi 15 người
lúc 17:00 hôm nay 19/11 → sẽ hiện là "Điều chỉnh".

> Đơn mẫu đang chờ sẵn trên prod: **Yên Garden — khách "Tú", 6 → 15 người, 17:00 19/11**. Test 1 dùng luôn đơn này
> (phải test trước 17:00 hôm nay, quá giờ đến là khách không đổi được nữa). Bảo Lương làm lại từ đầu ở Test 2.

## Test 1 — POS hiện "Điều chỉnh" (Yên Garden, đơn có sẵn)

1. Đăng nhập POS Yên Garden (`yg-pos` hoặc `yg-quanly`), mở POS.
   - [ ] Hàng việc cần làm có dòng đặt bàn của "Tú" với lý do **Điều chỉnh** (không còn là "Đã đặt" bình thường).
   - [ ] Trên Timeline, thanh đặt bàn đó ghi **"Điều chỉnh"**.
2. Bấm vào đặt bàn đó.
   - [ ] Ô chi tiết ghi trạng thái **"Điều chỉnh"** và dòng **"Điều chỉnh: 17:00 · 15 khách"** (hoặc tương tự).
   - [ ] Có liên kết **"Duyệt điều chỉnh ở trang Đặt bàn"**; KHÔNG còn nút "Khách đã đến · mở mâm" (phải xử lý đổi trước).

## Test 2 — Duyệt / từ chối điều chỉnh

1. Từ Test 1, sang trang Đặt bàn → thẻ của "Tú" ghi **"Điều chỉnh"**, có nút **"Xử lý điều chỉnh"**.
2. Bấm nút → chọn đủ bàn cho 15 người → **Đồng ý**.
   - [ ] Đặt bàn thành 15 người, giữ 17:00, trạng thái về **Đã xác nhận**; POS hết báo "Điều chỉnh".
   - [ ] Mini App của khách (mở lại chi tiết đặt bàn): hiện 15 người, hết dòng "Yêu cầu đổi đang chờ quán xác nhận".
   - [ ] Món đặt trước vẫn còn nguyên.
3. Làm lại trên **Bảo Lương** bằng Mini App: đặt bàn → quán xác nhận → khách đặt món trước → khách sửa lịch tăng số người
   → gửi.
   - [ ] Trong vài giây POS Bảo Lương hiện "Điều chỉnh" (không cần tải lại trang).
4. Lần này bấm **Từ chối** điều chỉnh.
   - [ ] Đặt bàn giữ số người cũ, trạng thái **Đã xác nhận**; POS hết báo.
   - [ ] Mini App khách quay về lịch cũ, khách gửi được yêu cầu đổi mới.

## Test 3 — Không báo nhầm

- [ ] Đặt bàn đã xác nhận nhưng khách không sửa gì → POS vẫn hiện bình thường (Đã đặt / Trễ / Xung đột như trước).
- [ ] Đặt bàn chờ duyệt (khách mới đặt, quán chưa xác nhận) → vẫn là "Chờ duyệt" với nút "Xác nhận & chọn bàn".
