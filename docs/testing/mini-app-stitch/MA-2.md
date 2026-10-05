# MA-2 — Đơn gọi (m07) + gọi xong sang thẳng Đơn gọi + Trạng thái đơn + Thông tin nhà hàng

Nhánh `feat/mini-app-stitch`. Chỉ test trên **Bia lẩu Bảo Lương**. Cách chạy giống MA-1 (`mini-app-instances/bia-lau-bao-luong/mini-app` → `npm run dev`, đã gộp sẵn code).

## Đã làm

- **Gọi món xong sang thẳng tab Đơn gọi** (quán trả sau tại bàn), kèm thông báo "Đã gửi món, chờ thu ngân xác nhận". Không còn màn Trạng thái đơn ở luồng này; bấm Quay lại không về giỏ đã gửi.
- **Trang Đơn gọi theo m07**: thẻ đầu (bàn/mâm, giờ vào, Đang phục vụ, **Tổng tạm tính**) → **Các lượt gọi món · mới nhất ở trên**, mỗi lượt có vạch màu + nhãn trạng thái + món + tiểu kế → **Đối soát tạm tính** → nút đáy **Gọi thêm món**.
- **Nhãn trạng thái đúng mô hình Bảo Lương** (theo cài đặt "Đơn khách xuống bếp = thu ngân xác nhận", không gắn tên quán): **Chờ xác nhận** (vàng) → **Đã vào bếp** (xanh dương). Không còn bước "Đang làm / Món xong".
- Nhãn nguồn lượt: **Nhân viên gọi hộ**, **Quán thêm** (POS), **Món đặt trước**. Món thu ngân ghi tay ở POS hiện **Đã ghi vào bill** (xám) — loại đơn này không bao giờ cần xác nhận nên không tính là đang chờ. Món tặng: **Đã tặng · 0đ**. Lượt có mã giảm giá có dòng **Giảm giá**.
- Tải danh sách lỗi → báo **Chưa tải được** + nút **Thử lại** (không báo nhầm "chưa gọi món").
- **Chấm đỏ trên tab Đơn gọi** khi còn lượt chờ xác nhận.
- **Trạng thái đơn** (chỉ còn cho quán trả trước / mang về) và **Thông tin nhà hàng** theo giao diện mới. Quán thu ngân duyệt mà vào bằng link cũ → thanh 3 bước Đã gửi đơn · Đã vào bếp · Đã thanh toán.

## Giới hạn dữ liệu đã biết (không đổi DB trong MA-2)

- Thu ngân **từ chối** một lượt → lượt đó **biến khỏi danh sách**, không có nhãn "Bị từ chối" (server bỏ đơn huỷ khỏi bill). Món bị thu ngân bỏ cũng biến mất. Cần thì làm riêng một thay đổi DB nhỏ.
- Bàn **đã thanh toán** → phiên đóng → trang về "Bàn chưa gọi món nào" (không có màn "Đã thanh toán").
- Nút **Chỉ đường** ở trang Thông tin nhà hàng làm ở MA-3 (cần thêm ô link Google Maps).

## Bài test

1. QR Bàn 9 → chọn món → **Gọi món** → sang ngay tab **Đơn gọi**, thông báo "Đã gửi món, chờ thu ngân xác nhận"; lượt mới **có ngay** ở trên cùng (không được hiện "Bàn chưa gọi món nào" rồi mới hiện) với nhãn **Chờ xác nhận** (vàng); tab Đơn gọi có **chấm đỏ**.
2. Bấm **Quay lại** (nút trên thanh công cụ không có ở tab; thử nút back của điện thoại/trình duyệt) → không quay về giỏ đã gửi.
3. Thu ngân bấm **Xác nhận** lượt đó trên POS → trên app (không cần tải lại) nhãn thành **Đã vào bếp** (xanh dương), chấm đỏ trên tab biến mất.
4. Gọi thêm 1 lượt nữa → danh sách có 2 lượt, Lượt #02 ở trên; **Đối soát tạm tính** tách đúng "Đã vào bếp" và "Đang chờ xác nhận"; **Tổng tạm tính** khớp số tiền trên POS.
5. Nhân viên gọi hộ ở `/staff/order` cho Bàn 9 → lượt mới hiện nhãn **Nhân viên gọi hộ**. Thu ngân thêm món tay ở POS → lượt **Quán thêm** · **Đã ghi vào bill** (xám), không làm chấm đỏ bật lên. Thu ngân **tặng** một món → dòng đó **Đã tặng · 0đ**, tổng giảm tương ứng.
6. Bấm **Gọi thêm món** → về Thực đơn, nút nằm trên thanh tab không che.
7. Thu ngân từ chối một lượt đang chờ → lượt đó biến khỏi danh sách (giới hạn đã biết, xác nhận đúng như mô tả).
8. Thu tiền + đóng bàn trên POS → trang Đơn gọi về "Bàn chưa gọi món nào" + nút **Xem thực đơn**.
9. Bấm logo **BL** → trang **Thông tin nhà hàng** giao diện mới (thẻ quán, khối Liên hệ, điều khoản, kết nối OA), có nút quay lại.
10. Khổ 360: không cuộn ngang, chữ không bị cắt, nút Gọi thêm món không đè thanh tab.

**→ Báo:** `MA-2 PASS`
