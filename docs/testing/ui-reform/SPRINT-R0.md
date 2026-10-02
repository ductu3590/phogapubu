> **SUPERSEDED ngày 02/10/2026 — bản lịch sử, không phải checklist hiện hành.** D01/D02 đã chốt; dùng [Test A1–A3](DESIGN-REVIEW-2026-10-02.md) và Task B1–B6. Nội dung đề xuất cũ dưới đây không còn hiệu lực.

# Sprint R0 — Nghiệm thu cải tổ UI

**PLANNED — chưa triển khai sản phẩm.** Đọc spec và implementation plan trước khi test.

## Test R0-1 — T01 / TD-01 / UI-09

Core và instance typecheck exit 0; kiểm export SDK, quan hệ FK trong types và setup app-config. Không dùng any, ts-ignore hoặc tắt kiểm tra. Ghi SHA/dependency và trace baseline 30 mẫu mỗi profile theo PERFORMANCE.md. Thiếu môi trường đo giữ WAITING_MEASUREMENT.

## Test R0-2 — T02 / TD-02 / UI-05

Policy POS/automatic và Pubu đúng; missing policy không tự cho vào bếp. Lỗi RPC object/Error/network/malformed có thông báo tiếng Việt phù hợp; không lộ SQL/token. Lỗi hoặc chưa rõ kết quả giữ giỏ và request ID để kiểm tra/thử lại.

Sau mỗi task: cập nhật kết quả và đọc file này, báo đúng nhóm Test; dừng chờ anh Tú PASS, rồi commit task và báo checkpoint. Không tự chuyển task.
