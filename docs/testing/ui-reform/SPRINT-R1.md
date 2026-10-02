> **SUPERSEDED ngày 02/10/2026 — bản lịch sử, không phải checklist hiện hành.** D01/D02 đã chốt; dùng [Test A1–A3](DESIGN-REVIEW-2026-10-02.md) và Task B1–B6. Nội dung đề xuất cũ dưới đây không còn hiệu lực.

# Sprint R1 — Nghiệm thu cải tổ UI

**PLANNED — chưa triển khai sản phẩm.** Đọc spec và implementation plan trước khi test.

## Test R1-1 — T03 / UI-03 / TD-03

Kiểm tokens/shell tại 1440×900, 1366×768, 1024×768, 390px và 360px; text contrast 4.5:1, UI 3:1, target 44–48px, focus/Esc/return focus, safe area và keyboard trên điện thoại thật. Màu branding khác trạng thái. Asset Stitch có manifest nguồn/ID/hash; thiếu nguồn vẫn ghi rõ WAITING_SOURCE.

## Test R1-2 — T04 / UI-01

Kéo Bàn 09 từ Trong nhà sang Ngoài trời; chạm chọn bàn rồi chuyển khu; thao tác bàn phím. Lưu/tải lại giữ đúng, Hủy không lưu. Pointer cancel hoàn nguyên gesture; lỗi/version conflict giữ draft. Khu bổ sung/Chưa phân khu hoạt động; session/mâm/booking không đổi, staff không sửa cấu hình.

Sau mỗi task: cập nhật kết quả và đọc file này, báo đúng nhóm Test; dừng chờ anh Tú PASS, rồi commit task và báo checkpoint. Không tự chuyển task.
