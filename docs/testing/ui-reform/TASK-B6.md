# UI Reform — Task B6 · Nghiệm thu Testing
**Trạng thái: PLANNED — khóa đến khi thiết kế được duyệt; chưa triển khai/chưa PASS.**

Theo [plan A/B](../../superpowers/plans/2026-10-01-mevo-ui-reform.md) và [design.md](../../design/ui-reform-2026-10-01/design.md). Khi mở task, cập nhật bước chạy/expected, môi trường và screen ID đã duyệt trước nghiệm thu.

## Test B6 — Nhóm nghiệm thu
- [ ] Toàn fixture booking→preorder→arrival→QR/staff→duyệt/in→bill→thu; PASS nghiệp vụ Bảo Lương/Pubu không hồi quy.
- [ ] Mạng chậm/two-client/concurrency/retry/pending/bill đổi và quyền; PostgreSQL nhiều kết nối cho race thật nếu có đổi RPC.
- [ ] So sánh màn duyệt trên phone/tablet/desktop; Zalo thật, các trạng thái lỗi và in lỗi D01, staff D02.
- [ ] Evidence commit/deploy/Zalo Testing version/thiết bị/ảnh, hiệu năng baseline/sau, phạm vi chưa đo ghi thật.
- [ ] Testing PASS không tự Publish; quyết định release/Test5B checkpoint riêng.

**Checkpoint:** hoàn thành task → chạy kiểm tra phù hợp → đọc file này, báo đúng nhóm Test B6 → chờ anh Tú PASS → commit thay đổi task → mới tiếp tục. PASS thiết kế không thay PASS sản phẩm.

