# F · POS thu ngân `/admin/pos`
## Làm gì
Timeline bàn theo giờ, cột "Việc cần xử lý", duyệt đơn (`pos_confirmation`) rồi in phiếu bếp/bàn, bill dạng tab, sửa
bill có audit (huỷ/tặng/ghi tay), giảm giá bill, chuyển bàn/mâm, thu tiền cả bàn (`collect_table_bill`) kết hợp
TM/CK/VietQR/ghi nợ, khoá PIN.
## File chính
`admin-web/app/admin/pos/`, `admin-web/lib/table-status.ts`, `admin-web/lib/pos-browser-reads.ts`, `admin-web/lib/collect-payment.ts`.
## Cách kiểm thủ công
Đăng nhập chủ quán Bảo Lương (mint phiên bằng service key) → `/admin/pos`.
## Tài liệu
`docs/superpowers/specs/2026-10-03-pos-stitch-layout-design.md`, `2026-11-02-chuyen-ban-giam-gia-bill-design.md`,
`2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md`.
