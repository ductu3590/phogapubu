> **SUPERSEDED ngày 02/10/2026 — bản lịch sử, không phải checklist hiện hành.** D01/D02 đã chốt; dùng [Test A1–A3](DESIGN-REVIEW-2026-10-02.md) và Task B1–B6. Nội dung đề xuất cũ dưới đây không còn hiệu lực.

# Sprint R6 — Nghiệm thu cải tổ UI

**PLANNED — chưa triển khai sản phẩm.** Đọc spec và implementation plan trước khi test.

## Test R6-1 — T15 / UI-01,02 / TD-03

Sidebar thu gọn/mobile/nav theo tác vụ/capability; deep links, account, vouchers/spin/kitchen Pubu vẫn chạy. Không KDS Bảo Lương. Menu CRUD/availability/ảnh giữ order snapshot cũ. Forms config dirty/save/error riêng, workflow atomic/audit/preset/chặn giữa ca. Không printer health giả, không lộ secret.

## Test R6-2 — T16 / UI-07,08 / TD-03

Hóa đơn theo session, ba order vẫn một bill; bulk hai session phải phân biệt số phiên và receipt. Phân trang25/filter/drill-down/audit/tenant; bill mở về đúng POS, bill đóng readonly snapshot/reprint. Thực thu 0 trước owner received; gift/void/unpaid/midnight Việt Nam/instrument đúng; top món có backend thật, không dùng số mẫu.

Sau mỗi task: cập nhật kết quả và đọc file này, báo đúng nhóm Test; dừng chờ anh Tú PASS, rồi commit task và báo checkpoint. Không tự chuyển task.
