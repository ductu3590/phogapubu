# Giao thiết kế trang bổ sung MEVO — 2026-09-21

Trạng thái: brief đã gửi Stitch; chờ anh Tú PASS phạm vi. Không phải nghiệm thu màn chưa sinh hoặc nghiệm thu BL.

## Test 1 — Nguồn và phạm vi

Mở `docs/design/stitch-admin-suite-2026-09-21/BRIEF.md` và ảnh `timeline-final.png`. Đúng bản POS hoàn thiện ID 5a5de7a5626b455b90caf1bf6381d569. Đồng ý POS + 5 nhóm page, bàn/QR/nhân viên/thiết bị nằm trong Cấu hình.

## Test 2 — Xác nhận brief trong Stitch

Mở project 11099609419664851651. Kiểm tra yêu cầu mới bắt đầu “Dựa trên màn đang chọn…” đã xuất hiện, yêu cầu giữ bản nguồn và tạo các page quản trị. Đồng ý lưu riêng cấu hình, chặn đổi giữa ca, không tải báo cáo/cấu hình cùng POS và giữ giỏ nháp.

PASS ở đây chỉ xác nhận việc giao brief/phạm vi. Khi Stitch tạo xong, phải review từng màn và luồng điều hướng riêng trước triển khai; không suy từ ảnh rằng hệ thống đã load nhanh.

Phản hồi: “Stitch Admin Suite — Test 1, 2 PASS” hoặc yêu cầu điều chỉnh.
