# Review prototype POS Timeline 2026-09-21

Trạng thái: chờ anh Tú PASS nhận xét. Không thay thế nghiệm thu BL-2A/2B hoặc xác nhận prototype sẵn sàng production.

## Test 1 — Kiểm tra nguồn và nhận xét

Mở `docs/design/stitch-pos-2026-09-21/screen.png`, `code.html` và `REVIEW.md`. Xác nhận đúng màn `cd57300e6e1a4a2baee056e84949713e`.

Đối chiếu các ví dụ: mở Bàn 04 nhưng gọi món hiện 09+10; chọn VIP nhưng nút vẫn 04+05; tổng 6 dòng món không khớp tổng bill; trạng thái đoàn chưa đến/đang ăn mâu thuẫn. Đánh dấu nhận xét nào anh không muốn áp dụng.

## Test 2 — Chốt phạm vi chỉnh Stitch

Đồng ý giữ bố cục Timeline + panel, chỉnh đúng bàn/bill, xung đột theo khoảng giờ, tách xác nhận/in, rà soát trước thu tiền. Bổ sung mô phỏng ghép bàn, tiền mặt, sửa bill và trạng thái lỗi. Không mở thêm cọc/tách bill/thu ngân tự động trong lần này.

PASS nếu đồng ý nhận xét và phạm vi chỉnh; ảnh/code hiện vẫn là prototype có hạn chế đã nêu. Phản hồi “Review POS Timeline 21/09 — Test 1, 2 PASS” hoặc điểm cần sửa.
