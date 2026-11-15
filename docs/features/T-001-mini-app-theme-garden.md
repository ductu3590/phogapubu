# T-001 — Mini App theme `garden` (Yên Garden)

## Làm gì
- Theme chọn theo quán: `stores.mini_app_theme` (`classic` mặc định | `garden`, mig 134). Giá trị lạ/thiếu rơi về `classic`, nên Bảo Lương/Pubu không đổi.
- Khởi động một lượt: RPC `get_mini_app_bootstrap` (mig 135) trả quán + bàn + workflow + giảm giá; menu đọc song song theo slug. RPC lỗi thì rơi về đường đọc cũ (`loadLegacy`).
- Nút "Thêm 1" gọi thêm bia/rượu: hàng trên thanh giỏ, gợi ý đúng món + cỡ bàn đã gọi gần nhất, chỉ trong danh mục tick `menu_categories.quick_reorder` (mig 136, bật ở `/admin/menu`).
- Admin: chọn bộ giao diện ở `/mevo/stores/<id>` và wizard tạo quán; ảnh món lưu webp 600px.

## File chính
- `mini-app/src/utils/{theme,bootstrap,quick-reorder}.ts` (+ test), `mini-app/src/app.tsx`
- `mini-app/src/components/ui/{product-card,bottom-sheet,quick-reorder-bar,product-list-frame}.tsx`, `components/layout/layout.tsx`
- `mini-app/src/services/category/category.api.ts` (`buildMenu`, `getMenuRowsBySlug`)
- `admin-web/lib/actions/{menu,mevo-stores}.ts`, `admin-web/lib/mini-app-themes.ts`

## Kiểm thủ công
Theo `docs/testing/yen-garden/MINI-APP.md` (nhóm A–F). Đối chiếu classic: A2 + ảnh `docs/testing/yen-garden/screens/bl-*.png`.
Sau khi gộp main: `git merge origin/main` trong `mini-app-instances/yen-garden` rồi mới `zmp deploy`.
