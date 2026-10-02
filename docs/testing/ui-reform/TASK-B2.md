# UI Reform — Task B2 · POS hợp nhất
**Trạng thái: PLANNED — khóa đến khi thiết kế được duyệt; chưa triển khai/chưa PASS.**

Theo [plan A/B](../../superpowers/plans/2026-10-01-mevo-ui-reform.md) và [design.md](../../design/ui-reform-2026-10-01/design.md). Khi mở task, cập nhật bước chạy/expected, môi trường và screen ID đã duyệt trước nghiệm thu.

## Test B2 — Nhóm nghiệm thu
- [ ] Timeline/Sơ đồ mọi khu cùng selection; queue booking/món/call/thông báo cùng POS và đúng số chờ, không refresh.
- [ ] Booking chọn bàn→arrival→mâm; preorder liên kết đúng, hold60, contact đúng, không tự đóng/xóa nợ hoặc copy món.
- [ ] Duyệt/in QR/staff/preorder đúng revision; retry không trùng/chuông trùng; hai liên cùng giá/tổng, khác nhãn.
- [ ] Bill audit bỏ/tặng/restore/manual POS; pending/bill đổi chặn thu tới rà lại; owner thu thật/đóng cả mâm nguyên tử, tenant/staff bị chặn.
- [ ] D01: in bị chặn/lỗi/máy hỏng vẫn thu bình thường; không nhánh/lý do; in lại không nhân món/tiền.
- [ ] Đo mở phiếu trước/sau cùng profile; ảnh/flow khớp màn duyệt, không fake printer/online.

**Checkpoint:** hoàn thành task → chạy kiểm tra phù hợp → đọc file này, báo đúng nhóm Test B2 → chờ anh Tú PASS → commit thay đổi task → mới tiếp tục. PASS thiết kế không thay PASS sản phẩm.

