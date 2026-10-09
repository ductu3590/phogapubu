# Sửa lặt vặt /staff + POS (2026-10-09)

Anh Tú chốt 2026-10-09. Hai đợt, test xong đợt 1 mới làm đợt 2.

## Đã làm ngay (prod)
- Dọn 9 phiên test Bảo Lương "hết hạn sau 6 giờ còn chưa thu" (18/9–7/10): `close_reason` → `staff_reset`,
  13 đơn chưa thu → `cancelled`. Phiên hết hạn còn nợ vẫn hiện "cần xử lý" là CỐ Ý (job 6h tự đóng
  phiên nhưng không được lẳng lặng nuốt tiền chưa thu).

## Đợt 1 — /staff
- **S1** Chuông "Gọi nhân viên" ở MỌI tab: chuyển `ServiceRequestQueue` lên `app/staff/layout.tsx`; chạm thẻ = Đã xử lý.
- **S2** Chia khu: màn chọn bàn (Đặt món) + sheet Ghép mâm nhóm bàn theo `table_areas` (màu khu PA-3).
  Mig 097: policy `staff_read_table_areas` (SELECT, `is_store_scoped_operator(store_id)`) — nhân viên chưa đọc được bảng khu.
- **S3** Quán `postpay`: bỏ sheet "Khách trả bằng gì?", gửi đơn luôn (`cash` làm giá trị giữ chỗ — phương tiện thật
  do thu ngân chọn lúc thu, `payment_instrument`, báo cáo đọc trường đó). Quán `prepay` giữ nguyên.
- **S4** Nút "Đổi bàn" cam đặc.
- **S5** Tab Bàn: phiên hết hạn còn nợ gom xuống mục thu gọn cuối danh sách.

## Đợt 2 — POS
- **A1** Gộp bill xong tự thoát chế độ gộp (`sauKhiXong` quên `setMergeMode(false)`).
- **A2** Nhãn vai trò "Chủ quán"/"Thu ngân" trên thanh trên POS.
- **A3** Tạm tính/hoá đơn in cả dòng 0đ: Tặng/Bỏ kèm lý do (vá `get_sessions_bill` tại chỗ).
- **A4** Nút "Số lượng" (tăng + giảm, bắt buộc lý do, lưu lịch sử, in ra bill). RPC mới `pos_set_order_item_quantity`.
- **A5** "Khách lẻ": chọn bàn trống → mở phiên → màn thêm món tay (KHÔNG vào bếp — món ăn sẵn; món cần bếp
  khách gọi QR hoặc in từ lịch sử).
