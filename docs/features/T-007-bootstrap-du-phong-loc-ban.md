# T-007 — Đường dự phòng bootstrap lọc bàn theo quán

`loadLegacy` (app.tsx, chạy khi RPC `get_mini_app_bootstrap` lỗi) giờ đọc thêm `store_id` của bàn và gọi
`pickTableForStore` (`mini-app/src/utils/bootstrap.ts`): bàn không thuộc quán của slug → bỏ, app vào như lối thường.
Khớp mig 140. Đường chính, theme, trả trước/trả sau không đổi. Test: `bootstrap.test.ts`. Checklist: `docs/testing/mini-app-core/BOOTSTRAP-DU-PHONG.md`.
