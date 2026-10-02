> **SUPERSEDED ngày 02/10/2026 — bản lịch sử, không phải checklist hiện hành.** D01/D02 đã chốt; dùng [Test A1–A3](DESIGN-REVIEW-2026-10-02.md) và Task B1–B6. Nội dung đề xuất cũ dưới đây không còn hiệu lực.

# Sprint R2 — Nghiệm thu cải tổ UI

**PLANNED — chưa triển khai sản phẩm.** Đọc spec và implementation plan trước khi test.

## Test R2-1 — T05 / UI-02,03 / TD-03

Mọi khu hiện cùng màn; Timeline/map cùng selection và draft. Một bàn đang hoạt động đỏ có booking 22:00 riêng; giữ trước 60 phút, ngày Việt Nam và vạch giờ đúng. Mâm nhiều hàng chỉ một bill/counter. Pending chưa xếp ở queue. Tải chậm 30s/poll/focus vẫn hội tụ, không mất update hoặc chuông lặp.

## Test R2-2 — T06 / UI-08

Tên/SĐT từ booking/order đúng nguồn: booking → arrival → QR → ghép giữ lineage. Khách vãng lai không mang khách cũ; session qua ngày vẫn đọc đúng. Thêm bàn trống khác ghép phiên có bill. Owner A không đọc B; staff/anon không đọc owner PII endpoint. Arrival/merge/close race kiểm PostgreSQL nhiều kết nối.

## Test R2-3 — T07 / UI-07

Prepare/settle chỉ owner; pending chặn; fingerprint đổi dù cùng tổng phải chặn. Membership/void/topping changes và expiry checkout không xóa nợ. Hai máy chỉ một lần thu; retry cùng ID giữ actor/instrument đầu tiên. Kiểm close so với send/void/restore/release/merge/arrival trên PostgreSQL thật. Ngoại lệ không in audit theo D01.

## Test R2-4 — T08 / UI-07

Một Thanh toán → rà/sửa → in → phương thức → owner xác nhận tiền thật → đóng. afterprint không tự thu. Bill 830k, cash 900k thừa 70k; bank chỉ xác nhận tiền thực về. In lỗi/hủy theo D01; bill đổi bắt rà lại, pending/draft về đúng queue. Đóng mọi bàn mâm, booking tiếp trong hold vẫn giữ. Mất mạng không thu lặp.

Sau mỗi task: cập nhật kết quả và đọc file này, báo đúng nhóm Test; dừng chờ anh Tú PASS, rồi commit task và báo checkpoint. Không tự chuyển task.
