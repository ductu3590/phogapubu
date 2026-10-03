# UI-2 — POS thu ngân + màn nhân viên theo design system mới

Nhánh `feat/ui-system` (sau UI-1 PASS). Chỉ đổi **giao diện**: không đổi API, RPC, database, câu chữ
nghiệp vụ. Quyết định màu: CLAUDE.md dòng 2026-10-02.

Chạy: `cd admin-web && npm run dev`.
- POS: đăng nhập `baoluong@mevo.vn`, mở `/admin/cashier`.
- Nhân viên: đăng nhập `baoluong-nv@mevo.vn`, mở `/staff/order`, `/staff/tables`, `/staff/orders`.
- Xem đủ mọi trạng thái ô bàn mà không cần dữ liệu thật: `admin@mevo.vn` → `/mevo/ui-kit`, mục **Ô bàn POS**.

> Cookie đăng nhập dùng chung theo trình duyệt: test xong vai chủ quán rồi mới đăng nhập vai nhân viên
> (hoặc dùng cửa sổ ẩn danh).

## Đã đổi so với trước

| Chỗ | Trước | Sau |
|---|---|---|
| Màu trạng thái bàn | Đỏ = có khách, xanh = trống | Xanh lá = đang phục vụ · xanh dương = đã đặt · vàng = chờ duyệt · đỏ = trễ / xung đột · xám = trống; **luôn có chữ** |
| Màu mâm | Tô nền cả ô (có cả xanh lá, xanh dương) | Chỉ vạch trái 4px + chữ "Mâm N"; bảng màu mâm còn tím / hồng / chàm / fuchsia |
| Chữ trên POS | Nhiều chỗ 10–11px | Nhỏ nhất 13px |
| Sơ đồ bàn | Luôn vẽ 12 cột, ô bị bóp | Chỉ vẽ tới cột cuối có bàn (lúc **Sắp xếp bàn** vẫn đủ 12 cột); điện thoại xếp lưới 3 cột |
| Bill (màn < 1024px) | Cột 400px đè mất sơ đồ | Sheet trượt từ dưới, có nút đóng; tổng + nút thu tiền luôn ở chân |
| Gọi nhân viên khi trống | Khối cam ~70px | Một dòng |

## Test A — POS `/admin/cashier` (máy tính 1366px)

1. Thanh trên: chấm xanh "Đang cập nhật trực tiếp", số bàn/trống; nút **Sắp xếp bàn** viền.
2. Dòng chú giải 5 màu nằm ngay trên sơ đồ.
3. Khu "Trong nhà" 7 bàn: cả 7 ô nằm trên **một hàng, không cuộn ngang**, chữ "Trống" đọc đủ.
4. Bấm một bàn có khách: panel bill bên phải hiện tên bàn, giờ mở, danh sách món; **Tổng + Tiền mặt /
   Chuyển khoản luôn ở chân panel** kể cả khi danh sách món dài.
5. Có đơn khách gọi chờ xác nhận: ô bàn nền vàng + viền vàng nhấp nháy + chữ "Chờ duyệt · N"; chuông kêu
   như cũ. Trong bill, bấm **Xem món để xác nhận** → hiện món → **Xác nhận & in 2 liên** in đúng 2 phiếu như cũ.
6. **Từ chối** đơn: hộp thoại 5 lý do, chọn "Lý do khác" bắt nhập chữ; Xác nhận từ chối hoạt động như cũ.
7. **Thêm món tay**: hộp thoại tìm món, tab danh mục, nút − / +; món có loại/topping mở hộp thứ hai;
   bấm ra ngoài khi đã có món nháp **không** đóng mất giỏ.
8. Bỏ / Tặng / Khôi phục món, In bill, Bỏ bàn, Thao tác khác (thêm bàn, nhập mâm, nhả quyền) — hoạt động như cũ.
9. **Sắp xếp bàn**: lưới đủ 12 cột với ô trống viền đứt; kéo thả, phím mũi tên, Lưu sơ đồ / Hủy như cũ.
10. Tắt mạng vài giây: chấm thành xám "Mất kết nối — đang thử lại...", bật lại tự về xanh.

## Test B — POS trên tablet / điện thoại

11. 1024px: sidebar + sơ đồ + bill vẫn đủ chỗ, không cuộn ngang trang.
12. 390px (DevTools): sơ đồ thành lưới 3 cột, không cuộn ngang. Bấm 2 bàn trống → sheet "Đã chọn 2 bàn
    trống" trượt từ dưới; ✕ hoặc bấm nền tối để đóng.

## Test C — Màn nhân viên (điện thoại 390px)

13. Thanh trên: logo M + tên quán + "MEVO · Đặt hộ" + Đăng xuất; 3 tab Đặt món / Đang xử lý / Bàn có vạch cam
    dưới tab đang mở.
14. **Chọn bàn**: mỗi nút bàn có chấm + chữ trạng thái (cùng nghĩa với POS). Mâm hiện khối nền trắng có vạch màu
    bên trái + "Mâm N · X bàn".
15. **Menu**: ô tìm, tab danh mục, nút + tròn cam; thêm món → số đếm đen trên nút, thanh giỏ "N món · tổng" ở đáy.
16. Giỏ hàng (sheet từ dưới): nút − / + 44px, ghi chú từng món, nút **Đặt món · tổng** ở chân.
17. Màn **Bàn**: thẻ phiên có chấm trạng thái, vạch màu mâm; phiên quá hạn có banner đỏ; ⋯ mở sheet
    "Thao tác khác" với 3–4 dòng có icon.
18. Màn **Đang xử lý**: badge trạng thái đơn + badge thanh toán, không còn màu cam.

## Test D — Trang xem thử `/mevo/ui-kit`, mục "Ô bàn POS"

19. Đủ: Bàn 1 đang phục vụ · Bàn 2 chờ duyệt (nhấp nháy) · Bàn 3 trễ (nền đỏ nhạt) · Bàn 4 đã đặt (mờ, không
    bấm được — như cũ) · Bàn 5 tên dài bị cắt có "…" · Bàn 9 + 10 vạch tím "Mâm 1" · Bàn 11 vạch hồng "Mâm 2".
20. Thu hẹp còn 390px: lưới 3 cột, số "12.360.000đ" **không bị cắt**.

## Ngoài phạm vi UI-2 (giữ nguyên, có kế hoạch riêng)

- Sidebar `/admin` vẫn kiểu cũ (cam đặc) → UI-3.
- Màn nhân viên vẫn hỏi "Khách trả bằng gì?" và ghi "Đơn vào bếp ngay" (UI-06 / D02 là đổi nghiệp vụ, cần RPC).
- POS vẫn hai nút Tiền mặt / Chuyển khoản (UI-07 "một nút Thanh toán" là đổi luồng).
- Bàn "Đã đặt" (giữ chỗ trước giờ đến) vẫn khoá không bấm được — logic cũ, chỉ đổi màu.

**→ Báo:** `UI-2 PASS` hoặc số bài FAIL kèm ảnh.
