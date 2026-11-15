# F · Thanh toán Mini App (trả trước) — VÙNG KHÔNG ĐỤNG
## Làm gì
Zalo Checkout SDK: ví + chuyển khoản (BANK); thanh toán lại đơn `pending` khi khách thoát màn chọn PT; không chắc thì
rơi về "chờ xác nhận".
## File chính
`supabase/functions/checkout-create-mac`, `supabase/functions/checkout-notify` (nhánh BANK verify `overallMac` sort a→z),
`mini-app/src/pages/checkout`.
## Giới hạn
Chỉ quán trả trước (Pubu, đang tạm dừng). Sửa phải hỏi anh Tú.
## Tài liệu
`docs/superpowers/specs/2026-07-15-multi-method-payment-design.md`, `2026-08-06-repay-abandoned-checkout-design.md`,
`docs/decisions.md` dòng 2026-07-08.
