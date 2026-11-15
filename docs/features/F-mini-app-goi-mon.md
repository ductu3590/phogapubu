# F · Mini App gọi món (source lõi)
## Làm gì
Khách quét QR bàn → menu (biến thể giá, topping, giảm giá theo món) → giỏ (lưu 6h) → gọi món; quán trả sau sang thẳng
tab "Đơn gọi" / Món đã gọi; gọi nhân viên (chặn 3 phút ở server).
## File chính
`mini-app/src/pages/{menu,checkout,session-orders,store-info,account}`, `mini-app/src/stores/`, `mini-app/src/services/`, RPC `create_order`.
## Cách kiểm thủ công
Chạy từ `mini-app-instances/bia-lau-bao-luong/mini-app` (không phải `mini-app/`). Chỉ kiểm trên Bảo Lương.
## Tài liệu
`docs/superpowers/specs/2026-10-05-mini-app-stitch-design.md`, `2026-08-20-prepay-postpay-table-session-design.md`,
`2026-09-01-menu-item-variants-design.md`.
