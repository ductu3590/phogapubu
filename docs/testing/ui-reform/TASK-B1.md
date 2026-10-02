# UI Reform — Task B1 · Nền dùng chung
**Trạng thái: PLANNED — khóa đến khi thiết kế được duyệt; chưa triển khai/chưa PASS.**

Theo [plan A/B](../../superpowers/plans/2026-10-01-mevo-ui-reform.md) và [design.md](../../design/ui-reform-2026-10-01/design.md). Khi mở task, cập nhật bước chạy/expected, môi trường và screen ID đã duyệt trước nghiệm thu.

## Test B1 — Nhóm nghiệm thu
- [ ] Typecheck/build core và instance hết lỗi đã audit; không cast/tắt check để che lỗi.
- [ ] Tokens/font/components khớp màn duyệt trên 360/390/1024/1366/1440; contrast, focus, safe area và reduced-motion.
- [ ] Policy/config loading, lỗi/timeout/retry giữ draft và request id; không cooking/ready giả Bảo Lương, Pubu giữ thật.
- [ ] Ghi baseline đường in theo PERFORMANCE.md: môi trường/mẫu/p50/p95 và giới hạn; không tự suy nguyên nhân 30–40s.

**Checkpoint:** hoàn thành task → chạy kiểm tra phù hợp → đọc file này, báo đúng nhóm Test B1 → chờ anh Tú PASS → commit thay đổi task → mới tiếp tục. PASS thiết kế không thay PASS sản phẩm.

