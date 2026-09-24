# MEVO — giao Stitch thiết kế các trang bổ sung

Ngày 2026-09-21. Trạng thái: đã gửi brief trực tiếp trong Stitch; đã thấy prompt xuất hiện trong hội thoại và trạng thái Thinking. Chưa nghiệm thu các màn sinh ra.

Project: https://stitch.withgoogle.com/projects/11099609419664851651

Tham chiếu: “MEVO POS — Điều hành bàn & đặt bàn (Bản hoàn thiện)”, ID `5a5de7a5626b455b90caf1bf6381d569`.

## Tài nguyên nguồn

- `timeline-final.html` và `timeline-final.png`: nguyên bản xuất ZIP từ Stitch, không sửa.
- ZIP: `C:/Users/ductu/Downloads/stitch_restaurant_table_booking_manager (2).zip`.
- Phiên này không có MCP Stitch hoặc hosted asset URL; dùng chức năng Xuất ZIP chính thức thay cho curl. Đã kiểm tra ZIP có code.html 96.751 bytes và screen.png 491.804 bytes.

## Phạm vi đã giao

Thiết kế cho trạng thái đích sau BL-0 đến BL-4. Không khẳng định backend hiện tại đã hoàn tất: TESTING.md lúc đọc ghi BL-2A PASS, BL-2B Task 2 code xong chờ credential/live OA.

Giữ nguyên POS nguồn. Tạo bản sao shell để nối điều hướng. POS là trang mặc định; sidebar gồm POS, Đặt bàn, Hóa đơn, Thực đơn, Báo cáo và bánh răng Cấu hình. Menu tài khoản chứa account/đăng xuất. Không thêm Dashboard trùng báo cáo hoặc Bếp riêng cho Bảo Lương.

| Nhóm page | Nội dung yêu cầu |
|---|---|
| Cấu hình quán | Thông tin; quy trình; bàn/khu vực; QR; nhân viên/quyền; in/thiết bị; thông báo Zalo; phương thức thanh toán |
| Đặt bàn | Mobile 390px và desktop danh sách, dùng cùng booking với POS, không tạo timeline thứ hai |
| Lịch sử hóa đơn | Theo phiên/mâm, phân trang, bộ lọc, drawer chi tiết/audit, bill mở quay về POS, bill đóng xem/in lại |
| Thực đơn | Danh mục, bảng món/thumbnail nhỏ, tìm/lọc, còn/hết món, drawer chỉnh; giá mới không đổi đơn cũ |
| Báo cáo | Tiền thực thu, số bill đã trả, trung bình bill, tiền bill mở riêng; phương thức thu/top món/1 biểu đồ; drill-down hóa đơn |

Cấu hình chia mục, không một form dài. Thông tin quán lưu riêng; nhóm quy trình lưu nguyên tử với validation, xem trước cũ/mới, lỗi giữ form, lịch sử thay đổi. Preset Pubu/Bảo Lương/Tùy chỉnh chỉ điền xem trước. Chặn đổi chính sách ảnh hưởng giữa ca khi còn phiên/đơn cần xử lý. Tắt booking không hủy booking cũ. Khoảng giữ bàn không là giới hạn thời gian ăn; timeout không xóa nợ.

Nhân viên không có quyền duyệt/in/thu tiền/đóng bill. OA secret, merchant key và credential vẫn thuộc MEVO nội bộ; page chủ quán chỉ xem trạng thái và hỗ trợ. Máy in không được báo giấy đã ra nếu chỉ gửi lệnh. Các cấu hình phần cứng/tài khoản chưa có contract phải ghi là phụ thuộc tích hợp.

Yêu cầu sinh các màn tên: MEVO — Cấu hình quán; MEVO — Bàn & QR; MEVO — Nhân viên & thiết bị; MEVO — Đặt bàn mobile; MEVO — Lịch sử hóa đơn; MEVO — Thực đơn; MEVO — Báo cáo. Hai màn Bàn & QR, Nhân viên & thiết bị là các trạng thái bên trong Cấu hình, không thêm menu cấp cao. Có thêm trạng thái quy trình bị chặn giữa ca và các lỗi/empty/loading.

## Yêu cầu gọn và nhanh

- Tách page cấu hình/báo cáo khỏi POS; không preload toàn bộ nội dung vào POS.
- Chỉ tải tab đang mở; phân trang mặc định 25 dòng; ảnh nhỏ lazy load; biểu đồ chỉ tải khi mở báo cáo.
- POS/queue cập nhật realtime; cấu hình và báo cáo không polling liên tục.
- Giữ bàn/mâm đang chọn, giỏ nháp, bộ lọc và vị trí cuộn khi quay về POS.
- Một CTA chính, 1–2 cấp điều hướng, drawer chỉnh nhỏ, không modal lồng modal.
- Dirty state, lưu/hủy, lỗi theo trường, không spinner toàn màn khi lọc.
- Desktop 1440×900/1366×768, tablet 1024×768, mobile 390px cho đặt bàn/cấu hình.

Đây là yêu cầu thiết kế và ràng buộc triển khai, chưa phải kết quả đo hiệu năng. Prototype dùng dữ liệu giả, không gọi API thật/gửi OA/in thật/thu tiền. Không mở rộng kho, HR, CRM, kế toán, cọc hoặc tách bill. Không thay đổi code MEVO hoặc tiến trình task backend khác.
