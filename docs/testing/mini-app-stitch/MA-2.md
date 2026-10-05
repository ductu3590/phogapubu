# MA-2 — Đơn gọi (m07) + gọi xong sang thẳng Đơn gọi + Trạng thái đơn + Thông tin nhà hàng

Nhánh `feat/mini-app-stitch`. Chỉ test trên **Bia lẩu Bảo Lương**. Cách chạy giống MA-1 (`mini-app-instances/bia-lau-bao-luong/mini-app` → `npm run dev`, đã gộp sẵn code).

## Đã làm

- **Gọi món xong sang thẳng tab Đơn gọi** (quán trả sau tại bàn), kèm thông báo "Đã gửi món, chờ thu ngân xác nhận". Không còn màn Trạng thái đơn ở luồng này; bấm Quay lại không về giỏ đã gửi.
- **Trang Đơn gọi theo m07**: thẻ đầu (bàn/mâm, giờ vào, Đang phục vụ, **Tổng tạm tính**) → **Các lượt gọi món · mới nhất ở trên**, mỗi lượt có vạch màu + nhãn trạng thái + món + tiểu kế → **Đối soát tạm tính** → nút đáy **Gọi thêm món**.
- **Nhãn trạng thái đúng mô hình Bảo Lương** (theo cài đặt "Đơn khách xuống bếp = thu ngân xác nhận", không gắn tên quán): **Chờ xác nhận** (vàng) → **Đã vào bếp** (xanh dương). Không còn bước "Đang làm / Món xong".
- Nhãn nguồn lượt: **Nhân viên gọi hộ**, **Quán thêm** (POS), **Món đặt trước**. Món thu ngân ghi tay ở POS hiện **Đã ghi vào bill** (xám) — loại đơn này không bao giờ cần xác nhận nên không tính là đang chờ. Món tặng: **Đã tặng · 0đ**. Lượt có mã giảm giá có dòng **Giảm giá**.
- **Lượt bị thu ngân từ chối vẫn nằm trong danh sách** (mig 088, đã áp prod): nhãn đỏ **Bị từ chối**, món gạch ngang, dòng "Quán không nhận lượt này · Lý do: … · lúc HH:MM. Không tính tiền." — lý do dùng đúng chữ trên POS. Không cộng vào tổng.
- Mỗi món: tên (tối đa 2 dòng) bên trái, **×SL · giá** luôn cùng một dòng bên phải; bỏ dòng tiểu kế từng lượt.
- Tải danh sách lỗi → báo **Chưa tải được** + nút **Thử lại** (không báo nhầm "chưa gọi món").
- **Chấm đỏ trên tab Đơn gọi** khi còn lượt chờ xác nhận.
- **Trạng thái đơn** (chỉ còn cho quán trả trước / mang về) và **Thông tin nhà hàng** theo giao diện mới. Quán thu ngân duyệt mà vào bằng link cũ → thanh 3 bước Đã gửi đơn · Đã vào bếp · Đã thanh toán.

## Giới hạn dữ liệu đã biết (không đổi DB trong MA-2)

- Món **bị thu ngân bỏ** (từng món, không phải cả lượt) vẫn biến khỏi lượt.
- Bàn **đã thanh toán** → phiên đóng → trang về "Bàn chưa gọi món nào" (không có màn "Đã thanh toán").
- Nút **Chỉ đường** ở trang Thông tin nhà hàng làm ở MA-3 (cần thêm ô link Google Maps).

## Bài test

1. QR Bàn 9 → chọn món → **Gọi món** → sang ngay tab **Đơn gọi**, thông báo "Đã gửi món, chờ thu ngân xác nhận"; lượt mới **có ngay** ở trên cùng (không được hiện "Bàn chưa gọi món nào" rồi mới hiện) với nhãn **Chờ xác nhận** (vàng); tab Đơn gọi có **chấm đỏ**.
2. Bấm **Quay lại** (nút trên thanh công cụ không có ở tab; thử nút back của điện thoại/trình duyệt) → không quay về giỏ đã gửi.
3. Thu ngân bấm **Xác nhận** lượt đó trên POS → trên app (không cần tải lại) nhãn thành **Đã vào bếp** (xanh dương), chấm đỏ trên tab biến mất.
4. Gọi thêm 1 lượt nữa → danh sách có 2 lượt, Lượt #02 ở trên; **Đối soát tạm tính** tách đúng "Đã vào bếp" và "Đang chờ xác nhận"; **Tổng tạm tính** khớp số tiền trên POS.
5. Nhân viên gọi hộ ở `/staff/order` cho Bàn 9 → lượt mới hiện nhãn **Nhân viên gọi hộ**. Thu ngân thêm món tay ở POS → lượt **Quán thêm** · **Đã ghi vào bill** (xám), không làm chấm đỏ bật lên. Thu ngân **tặng** một món → dòng đó **Đã tặng · 0đ**, tổng giảm tương ứng.
6. Bấm **Gọi thêm món** → về Thực đơn, nút nằm trên thanh tab không che.
7. Thu ngân **từ chối** một lượt đang chờ (chọn lý do, ví dụ Hết đồ) → lượt vẫn ở danh sách với nhãn đỏ **Bị từ chối**, món gạch ngang, dòng lý do + giờ; **Tổng tạm tính** và Đối soát không cộng lượt này; chấm đỏ tab tắt. Chọn "Lý do khác" + gõ nội dung → app hiện đúng nội dung đó.
8. Thu tiền + đóng bàn trên POS → trang Đơn gọi về "Bàn chưa gọi món nào" + nút **Xem thực đơn**.
9. Bấm logo **BL** → trang **Thông tin nhà hàng** giao diện mới (thẻ quán, khối Liên hệ, điều khoản, kết nối OA), có nút quay lại.
10. Khổ 360: không cuộn ngang; tên món dài xuống dòng 2 nhưng **×SL · giá** vẫn một dòng; nút Gọi thêm món không đè thanh tab.

## Vá vòng 2 (2026-10-05) — Lịch sử POS + số lượt thống nhất

- **POS → bill → tab Lịch sử** hiện cả lượt bị từ chối (mig 089, đã áp prod): nền đỏ nhạt, "Đã từ chối lúc HH:MM · <lý do> · không tính tiền", không có nút in lại. **Tab Hoá đơn không đổi** (không có lượt bị từ chối, tổng không đổi).
- **Số "Lượt #NN" giống nhau ở POS và Mini App**: chỉ đánh số lượt khách / nhân viên gọi, tính cả lượt bị từ chối. Món thu ngân ghi tay hiện "**Ghi tay**", món đặt trước hiện "**Món đặt trước**" (không mang số) ở cả hai nơi.
- Lý do từ chối dùng chung một danh sách chữ cho hộp chọn lý do (POS), tab Lịch sử và Mini App.

11. Từ chối một lượt trên POS → mở bill bàn đó → tab **Lịch sử** có lượt đó (đỏ nhạt, giờ + lý do); tab **Hoá đơn** không có, tổng không đổi.
12. So số lượt: cùng một bàn, số "Lượt #NN" trên tab Lịch sử POS khớp số trên tab Đơn gọi của Mini App, kể cả khi có lượt bị từ chối và món ghi tay.

**→ Báo:** `MA-2 PASS`
