# UI-3 — Khu quản trị chủ quán `/admin/*` theo design system mới

Nhánh `feat/ui-system` (sau UI-2 PASS). Chỉ đổi **giao diện**: không đổi API, RPC, database, logic.
Đăng nhập `baoluong@mevo.vn`, mở `npm run dev` rồi đi lần lượt các mục ở sidebar.

## Đã đổi

| Chỗ | Sau UI-3 |
|---|---|
| Khung `/admin` | AppShell dùng chung: sidebar trắng 240px từ 1024px (thu gọn được), mục đang mở nền cam nhạt + vạch cam bên trái; dưới 1024px là thanh trên + nút ☰ mở ngăn kéo. Thay hẳn sidebar cũ (mục đang mở tô cam đặc) |
| Màu toàn bộ trang admin | 619 class màu lẻ (`orange-*`, `gray-*`, `red-*`…) đổi sang token: cam chỉ cho nút / mục đang chọn; xanh lá / vàng / đỏ / xanh dương chỉ cho trạng thái |
| Ô nhập (`.input`, `.label`) | Một dáng chung: nền trắng, viền xám, focus viền cam + quầng mờ, 44px trên điện thoại |
| Emoji làm icon | Gỡ hết khỏi tiêu đề, nhãn, nút; thay bằng icon lucide khi icon có nghĩa (sửa, xoá, tải QR, gọi khách…) |
| Công tắc bật/tắt (món đang bán, vòng quay) | Màu bật là cam (màu điều khiển), không còn xanh lá |
| Trang lỗi `/admin` | "Không tải được trang này" + Thử lại; chi tiết kỹ thuật gấp lại |
| Đang tải trang | Khung chờ (thanh xám) thay vì trang trắng lúc chuyển mục |
| POS từ 1024–1279px | Bill thành sheet trượt từ dưới để sơ đồ không bị bóp; từ 1280px vẫn là cột bên phải |
| Ô bàn chờ duyệt | Nhãn rút gọn "Chờ duyệt · N" để không bị cắt chữ |

## Test A — Khung & điều hướng

1. 1366px: sidebar có đủ Dashboard · Vận hành (Thu ngân, Đơn hàng, Màn hình bếp, Đặt bàn) · Kinh doanh (Quản lý menu,
   Ưu đãi, Vòng quay) · Thiết lập quán (Cài đặt quán, Bàn & QR, Nhân viên) · Tài khoản; email + Đăng xuất ở chân.
2. Bấm từng mục: mục đang mở sáng đúng (cả trang con, ví dụ trang in phiếu vẫn sáng "Thu ngân").
3. Nút thu gọn ở đầu sidebar → sidebar ẩn, POS rộng ra; nút mở lại ở góc trên trái.
4. 768px / 390px: thanh trên + ☰ → ngăn kéo menu; bấm mục là đóng ngăn kéo và chuyển trang.
5. Quán tắt tính năng đặt bàn → mục "Đặt bàn" biến mất (như cũ).

## Test B — Từng trang (1366px và 390px)

6. **Dashboard**: 4 thẻ số liệu nền trắng; thẻ "Đang xử lý" / "Tiền mặt chờ thu" viền vàng khi > 0; 3 lối tắt;
   danh sách đơn đang xử lý có badge trạng thái + nút viền "Hoàn tất" (bấm vẫn đóng đơn như cũ).
7. **Đơn hàng**: badge trạng thái đơn / thanh toán / nguồn không còn emoji; hàng nút "Đã nhận tiền" (viền) ·
   "Hoàn tất" (cam) · "Huỷ đơn" (đỏ nhạt). Điện thoại: ô lọc + ngày xuống dưới tiêu đề, không tràn.
8. **Quản lý menu**: 390px — danh mục ở trên (cuộn được), món bên dưới; tên món đọc đủ, giá + nút sửa/xoá xuống
   dòng thứ hai. Bật/tắt món, kéo sắp xếp, thêm/sửa/xoá món & danh mục, topping, tuỳ chọn giá — chạy như cũ.
9. **Đặt bàn**: thẻ booking có icon giờ / số khách; nút "Gọi khách" có icon điện thoại, cách chữ đều.
10. **Cài đặt quán**, **Vòng quay**, **Ưu đãi**, **Bàn & QR**, **Nhân viên**, **Tài khoản**, **Màn hình bếp**: lưu,
    tải QR, tạo mã, bật/tắt chạy như cũ; khối lưu ý dùng nền vàng (không còn nền cam).
11. Mở một form (ví dụ Thêm món): ô nhập viền xám, bấm vào thì viền cam + quầng mờ; nút Huỷ viền xám (không đen).

## Test C — POS sau khi đổi khung

12. 1366px: sơ đồ + bill cột phải như UI-2; thanh "Đơn mới" vẫn dính đáy.
13. 1024px (DevTools hoặc tablet ngang): bấm bàn có khách → bill trượt từ dưới, có ✕; tổng + Tiền mặt / Chuyển
    khoản ở chân.
14. Ô bàn có đơn chờ: "Chờ duyệt · N", không bị cắt chữ.

## Test D — Trạng thái lỗi / đang tải

15. Chuyển nhanh giữa các mục khi mạng chậm (DevTools → Slow 4G): thấy khung chờ thanh xám ở vùng nội dung, sidebar
    đứng yên.

## Ngoài phạm vi UI-3

- Các hộp thoại tự dựng trong trang menu / bàn / đặt bàn đã đổi màu nhưng chưa thay bằng `Dialog` dùng chung (vẫn
  đóng/mở như cũ).
- Trang in phiếu / in bill giữ nguyên (thiết kế cho giấy in).
- `/mevo` (superadmin) → UI-4. Mini App → UI-5.

**→ Báo:** `UI-3 PASS` hoặc số bài FAIL kèm ảnh.
