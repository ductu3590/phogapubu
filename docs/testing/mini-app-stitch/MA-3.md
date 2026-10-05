# MA-3 — Lối vào thường: Trang chủ (m01) + Đặt bàn (m02) + Đơn của tôi (m03) + Chỉ đường

Nhánh `feat/mini-app-stitch`. Chỉ test trên **Bia lẩu Bảo Lương**, mở **không qua QR bàn**: `npm run dev` trong `mini-app-instances/bia-lau-bao-luong/mini-app` (đã gộp sẵn code) → `http://localhost:5173/` ở chế độ điện thoại. Admin-web chạy từ nhánh này để thấy ô link Google Maps.

## Đã làm

- **Link Google Maps của quán** (mig 090, đã áp prod): `/admin` → Cài đặt quán → ô **Link Google Maps (nút Chỉ đường)** cạnh Địa chỉ. Chỉ nhận link `https://`, để trống = xoá. Chưa có link → nút Chỉ đường tìm theo địa chỉ.
- **Nút Chỉ đường** ở Trang chủ, Thông tin nhà hàng, Chi tiết đặt bàn.
- **Thanh tab lối thường**: **Trang chủ · Đặt bàn · Đơn của tôi**.
- **Trang chủ (m01)**: thẻ quán (ảnh bìa nếu có, không thì khối màu chủ đạo + chữ viết tắt) · địa chỉ + Chỉ đường · giờ mở cửa + **Đang mở / Đã đóng cửa / Tạm nghỉ** · số điện thoại bấm gọi · nút **Đặt bàn trước** · thẻ "Quý khách đang ngồi tại quán? Quét mã QR…" → **Thực đơn tham khảo** (không có nút +), ô tìm + chip dính khi cuộn qua phần đầu.
- **Đặt bàn (m02)**: khối Người đặt (Họ tên, SĐT — Bắt buộc) · Thời gian (chip ngày **HÔM NAY / T3 / T4…**, lưới giờ 4 cột theo bước giờ của quán) · Số khách (− số + và chip 2/4/6/10/15/20) · Ghi chú · nút đáy **Xác nhận đặt bàn**.
- **Đơn của tôi (m03)**: danh sách lượt đặt bàn (giờ, số khách, nhãn trạng thái) → chi tiết: thẻ trạng thái màu theo tình trạng · **Đặt món trước khi đến** (nếu quán cho) hoặc **Món đã đặt trước** · **Chi tiết lịch hẹn** · thông tin quán (Chỉ đường, Gọi ngay) · **Sửa đặt bàn / Huỷ bàn** (Huỷ có hộp xác nhận, bấm ra ngoài là thôi).

## Cố ý không làm (không có dữ liệu thật)

"Vị trí bố trí / bàn đã xếp" (khách không nhận được bàn đã xếp), mã QR check-in, "Khách quen Hạng Vàng", "Khu vực mong muốn", "giữ bàn 15 phút", "Giữ chỗ trong 15s", nhãn "Sân vườn & VIP".

## Bài test

1. Admin → Cài đặt quán: dán link Google Maps của quán (Google Maps → tìm quán → Chia sẻ → Sao chép liên kết) → Lưu thành công. Thử gõ `abc` hoặc `http://…` → báo "Link Google Maps phải bắt đầu bằng https://", không lưu.
2. Mở app không qua QR: thanh tab **Trang chủ · Đặt bàn · Đơn của tôi**; Trang chủ có đủ thẻ quán, địa chỉ, giờ mở cửa + nhãn đúng giờ hiện tại, số điện thoại, **Đặt bàn trước**, thẻ nhắc quét QR.
3. Bấm **Chỉ đường** → mở đúng link đã dán ở bài 1 (xoá link trong admin → nút mở Google Maps tìm theo địa chỉ).
4. Cuộn xuống **Thực đơn tham khảo**: không có nút +, ô tìm + chip dính trên đầu; bấm chip → nhảy đúng nhóm, chip sáng đúng.
5. Bấm **Đặt bàn trước** (hoặc tab Đặt bàn) → form m02: chip ngày đầu là **HÔM NAY**; chọn ngày → lưới giờ đổi; − / + và chip số khách chạy; thiếu tên/SĐT/giờ → báo lỗi; điền đủ → **Xác nhận đặt bàn** → sang chi tiết đặt bàn, nhãn **Chờ quán xác nhận**.
6. POS xác nhận đặt bàn đó → mở lại chi tiết: nhãn **Đã xác nhận** (xanh), khối **Đặt món trước khi đến** + nút Chọn món đặt trước (nếu quán bật đặt món trước).
7. Tab **Đơn của tôi** → danh sách có lượt vừa đặt; bấm vào → chi tiết; tab Đơn của tôi vẫn sáng.
8. **Sửa đặt bàn** → form đổi lịch, gửi → hiện "Yêu cầu đổi lịch đang chờ quán xác nhận". **Huỷ bàn** → hộp xác nhận; bấm ra ngoài / **Giữ lại** → không huỷ; **Huỷ đặt bàn** → nhãn **Đã huỷ**.
9. Trang **Thông tin nhà hàng** (bấm logo) có nút **Chỉ đường** cạnh địa chỉ.
10. Khổ 360: không cuộn ngang, chip HÔM NAY không xuống dòng, thanh nút đáy không đè thanh tab.

## Vá vòng 1 (2026-10-05) — SĐT sai báo lỗi mù mờ + kẹt bản nháp

Nguyên nhân: (1) câu lỗi tiếng Việt của server bị app che thành "Không thể gửi yêu cầu đặt bàn"; (2) lần gửi lỗi để lại bản nháp, các lần sau app gửi lại NGUYÊN bản nháp cũ (SĐT cũ) nên sửa số xong vẫn lỗi.
Đã sửa: kiểm SĐT ngay trên app (10 số bắt đầu bằng 0, nhận +84 / dấu cách) và báo đỏ dưới ô; gửi lại dùng thông tin MỚI trên form nhưng giữ mã yêu cầu cũ (không tạo trùng); nháp quá hạn thì tự tạo yêu cầu mới; luôn hiện đúng câu lỗi server.

11. Gõ SĐT `0962` → bấm Xác nhận → chữ đỏ ngay dưới ô "Số điện thoại cần đủ 10 số…", không gửi đi. Rời ô SĐT khi đang sai cũng báo ngay.
12. Máy anh đang có bản nháp kẹt (dòng vàng "Lần gửi trước chưa thành công…"): sửa SĐT đúng 10 số, chọn lại giờ → gửi → **tạo đặt bàn thành công** (sang chi tiết, Chờ quán xác nhận), dòng vàng biến mất. Danh sách Đơn của tôi chỉ có MỘT lượt mới.
13. Nhập `+84 962 345 678` → gửi được; chi tiết đặt bàn hiện `0962345678`.

**→ Báo:** `MA-3 PASS`
