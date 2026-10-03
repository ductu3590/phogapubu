# POS-1 — Trang mới /admin/pos: khung + Timeline + Danh sách

Nhánh `feat/pos-timeline`. Trang MỚI, **không sửa** `/admin/cashier` (vẫn chạy song song tới khi POS-1..4 PASS hết thì
xoá). Không đổi API, RPC, database: mọi thao tác (thu tiền, xác nhận đơn, ghép mâm, đặt bàn…) gọi lại đúng hàm của POS cũ.
Spec: `docs/superpowers/specs/2026-10-03-pos-stitch-layout-design.md`.

## Đã làm

| Chỗ | Nội dung |
|---|---|
| Menu trái | Mục mới **Điều hành bàn (mới)** ngay trên Thu ngân (POS) |
| Thanh trên | Kết nối · ca phục vụ (theo Cài đặt quán, rỗng = 10:00–24:00) · nút gộp bill |
| Hàng đợi | Chip: Lượt món chờ duyệt · Gọi nhân viên · Đặt bàn chờ duyệt · Khách trễ / xung đột · Chưa xếp bàn — bấm chip mở **Việc cần xử lý** |
| Timeline (mặc định) | Mỗi hàng một bàn, nhóm theo khu vực; thanh liền = phiên đang mở (mở → bây giờ), viền đứt = đặt bàn (giờ hẹn → hết giờ giữ bàn); vạch đỏ = bây giờ; nút **Về bây giờ** |
| Màu thanh | Xanh lá phục vụ · vàng chờ duyệt (nhấp nháy) · đỏ quá hạn / khách trễ >15 phút / **xung đột** (sắp tới giờ giữ bàn ≤30 phút mà bàn còn khách khác) · xanh dương đã đặt · mâm có vạch trái màu mâm + "Mâm N" |
| Sơ đồ bàn | Đúng sơ đồ cũ (sắp xếp bàn, ghép mâm, chọn bàn cho đặt bàn) |
| Danh sách | Bảng phiên đang mở + đặt bàn trong ca, xếp theo giờ |
| Cột phải | Không chọn gì → **Việc cần xử lý** (dùng lại các khối cũ: gọi nhắc khách, đặt bàn, món đặt trước, gọi NV, đơn mới). Bấm thanh phiên → **bill** cũ. Bấm thanh đặt bàn → thẻ **chi tiết đặt bàn** (Xác nhận & chọn bàn / Khách đã đến) |
| Màn < 1280px | Việc cần xử lý = sheet bên phải mở bằng nút; bill / đặt bàn = sheet đáy như POS cũ |

Xem trước không cần dữ liệu thật: `/mevo/ui-kit` mục **Timeline POS** (đủ 8 tình huống, đặt theo giờ hiện tại).

## Test (đăng nhập chủ quán Bảo Lương)

1. Menu trái có **Điều hành bàn (mới)**; bấm vào mở `/admin/pos`, mặc định tab **Timeline**, vạch đỏ ở giờ hiện tại.
2. Thanh ca hiện đúng giờ phục vụ trong Cài đặt quán (Bảo Lương 08:00–23:00).
3. Lọc khu vực (Tất cả / Trong nhà / Ngoài trời) — Timeline và Danh sách chỉ còn bàn khu đó.
4. Dùng Mini App (hoặc `/staff/order`) mở bàn + gọi món ở Bàn 1 → trên Timeline Bàn 1 hiện thanh **vàng nhấp nháy** "Chờ duyệt · 1", chuông kêu, chip "Lượt món chờ duyệt" = 1.
5. Bấm thanh đó → cột phải ra **bill** của Bàn 1; Xác nhận đơn → in 2 liên như cũ; thanh chuyển **xanh lá** "1 đơn" + tạm tính.
6. Thu tiền (Tiền mặt / Chuyển khoản) trong bill → thanh biến mất, bàn về "Trống".
7. Ghép mâm 2 bàn ở tab **Sơ đồ bàn**, quay lại Timeline → 2 hàng có thanh cùng vạch màu + "Mâm N".
8. (Nếu bật đặt bàn) Tạo một đặt bàn hôm nay ở trang Đặt bàn → thanh **viền đứt**: chờ duyệt = vàng (chưa có bàn thì ở hàng **Chưa xếp bàn**), đã xác nhận = xanh dương. Bấm thanh → thẻ chi tiết; "Xác nhận & chọn bàn" tự chuyển sang Sơ đồ bàn để chọn bàn.
9. Bấm chip / nút **Việc cần xử lý** (màn < 1280px) → sheet bên phải, nút X và bấm nền đều đóng; khách bấm "Gọi nhân viên" trong Mini App → chip "Gọi nhân viên" tăng, chuông kêu (kể cả khi sheet đang đóng).
10. Tab **Danh sách**: phiên + đặt bàn trong ca, bấm dòng mở bill / chi tiết như Timeline.
11. Điện thoại (390px): Timeline cuộn ngang trong khung, cột tên bàn đứng yên, không cuộn ngang cả trang.
12. `/admin/cashier` cũ vẫn chạy bình thường.

**→ Báo:** `POS-1 PASS` hoặc số bài FAIL kèm ảnh.

## Vá sau PASS (2026-10-03)

Phiên vừa mở trước đây vẽ rất ngắn, không đọc được chữ. Giờ:
- Thanh phiên dài **tối thiểu 80 phút** (≈176px) kể cả bàn vừa mở 1 phút — chỉ là độ dài hiển thị, có thể vượt vạch đỏ "bây giờ".
- Trên thanh luôn ghi **tên bàn** (hoặc **Mâm N**) trước, rồi trạng thái (Chờ duyệt · N / N đơn / Chưa gọi món), tiền khi thanh đủ rộng.

13. Mở bàn mới + gọi 1 món → thanh trên Timeline đọc đủ "Bàn N  Chờ duyệt · 1"; mâm mới ghép đọc đủ "Mâm N  Chưa gọi món".
