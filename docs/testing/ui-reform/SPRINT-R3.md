> **SUPERSEDED ngày 02/10/2026 — bản lịch sử, không phải checklist hiện hành.** D01/D02 đã chốt; dùng [Test A1–A3](DESIGN-REVIEW-2026-10-02.md) và Task B1–B6. Nội dung đề xuất cũ dưới đây không còn hiệu lực.

# Sprint R3 — Nghiệm thu cải tổ UI

**PLANNED — chưa triển khai sản phẩm.** Đọc spec và implementation plan trước khi test.

## Test R3-1 — T09 / UI-04,07

Section list/scroll spy/tab click không bounce và không mất giỏ. Variant thay giá, topping cộng giá, hết món chặn. Draft đúng tenant/operator/session/source; bàn vừa đổi/đóng không gửi khách mới. Khăn 10×2k thêm 20k source POS không bếp/chuông/phiếu đơn.

## Test R3-2 — T10 / UI-09,05

Đo 30 mẫu mỗi profile trước/sau; ghi deployment SHA/thiết bị/mạng, p50/p95/error. Print ready mục tiêu p95 ≤5s bình thường, ≤8s mạng B theo PERFORMANCE. Tách confirm/job/render/browser/giấy. Popup blocked, release already thiếu snapshot vẫn đúng revision/job; original unique, reprint audit, no-show race, hai liên giá/tổng đúng. Refresh nền không mất queue. Gap ordinary QR/staff print jobs được kiểm riêng. Chưa đo live không ghi UI-09 PASS.

Sau mỗi task: cập nhật kết quả và đọc file này, báo đúng nhóm Test; dừng chờ anh Tú PASS, rồi commit task và báo checkpoint. Không tự chuyển task.
