> **SUPERSEDED ngày 02/10/2026 — bản lịch sử, không phải checklist hiện hành.** D01/D02 đã chốt; dùng [Test A1–A3](DESIGN-REVIEW-2026-10-02.md) và Task B1–B6. Nội dung đề xuất cũ dưới đây không còn hiệu lực.

# Sprint R5 — Nghiệm thu cải tổ UI

**PLANNED — chưa triển khai sản phẩm.** Đọc spec và implementation plan trước khi test.

## Test R5-1 — T13 / UI-06

Sau chốt D02: postpay gửi không chọn method, instrument/received vẫn null; cash compatibility không là phương thức thực thu. Prepay Pubu giữ luồng hiện có. Staff gọi trực tiếp confirm/in/close/edit/cross-store phải bị từ chối. Double/retry một order; release policy POS/automatic và success copy đúng.

## Test R5-2 — T14 / UI-04,06,08

Chọn bàn/mâm → menu/stepper/options → review một Xác nhận đặt món → success đúng policy. Bill staff chỉ đọc, resolve call trong quyền. Giỏ riêng session/operator; bàn vừa đóng không tự gửi. Desktop/tablet1024/phone390/360 chạm/keyboard rõ. Network timeout sau commit không tạo trùng. Mục tiêu đơn chuẩn 30–45s đo thực, không suy từ prototype.

Sau mỗi task: cập nhật kết quả và đọc file này, báo đúng nhóm Test; dừng chờ anh Tú PASS, rồi commit task và báo checkpoint. Không tự chuyển task.
