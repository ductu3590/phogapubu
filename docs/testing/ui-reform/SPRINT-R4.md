> **SUPERSEDED ngày 02/10/2026 — bản lịch sử, không phải checklist hiện hành.** D01/D02 đã chốt; dùng [Test A1–A3](DESIGN-REVIEW-2026-10-02.md) và Task B1–B6. Nội dung đề xuất cũ dưới đây không còn hiệu lực.

# Sprint R4 — Nghiệm thu cải tổ UI

**PLANNED — chưa triển khai sản phẩm.** Đọc spec và implementation plan trước khi test.

## Test R4-1 — T11 / UI-05 / TD-02

Root: menu/booking/info; QR: menu/session/info; Gọi nhân viên theo context. POS policy Chờ/Đã xác nhận/Từ chối có lý do; payment riêng, Pubu có bếp thật. Loading/empty/offline/capability/error/retry; SDK safe area/keyboard trên Android/iPhone. Slow response/focus/reconnect không mất giỏ hoặc chuông lặp.

## Test R4-2 — T12 / UI-04 / TD-03

Menu/options/quantity/cart/review/sent ở 390/360; root read-only. Booking tối thiểu 30 phút, 7 ngày lịch, slot15, serving hours/ngày Việt Nam; yêu cầu đổi giữ lịch cũ, hủy đúng quyền. Preorder chỉ booking confirmed, một batch khóa sau gửi, retry cùng ID; arrival QR thêm đúng mâm. Price/topping đúng server. Pubu takeaway/ship/prepay/kitchen/voucher không hồi quy.

Sau mỗi task: cập nhật kết quả và đọc file này, báo đúng nhóm Test; dừng chờ anh Tú PASS, rồi commit task và báo checkpoint. Không tự chuyển task.
