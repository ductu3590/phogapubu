# F · In ấn
## Làm gì
In 80mm từ trình duyệt (`/print/*`) hoặc phần mềm MEVO In (Electron, `print_mode='agent'`) cho nhiều máy
(Quầy/Bếp/Nướng/Bar); phiếu bếp của đơn tự vào bếp do máy chủ xếp (`auto_kitchen_print_enqueue`, mig 131).
## File chính
`print-agent/`, `admin-web/app/print/`, `admin-web/lib/print/print-plan.ts`.
## Giới hạn
Máy in nhiệt 80mm thật chưa thử (C-0). Đừng `npm ci` print-agent khi phần mềm đang chạy (Electron giữ dll).
## Tài liệu
`docs/testing/dot1/C-*.md`, `docs/superpowers/plans/2026-11-05-dot1-c-in-hai-noi.md`.
