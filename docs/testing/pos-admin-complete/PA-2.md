# PA-2 — Vai trò Thu ngân

Spec `docs/superpowers/specs/2026-10-07-pos-admin-complete-design.md` · Plan `docs/superpowers/plans/2026-10-08-pa2-cashier-role.md`
Migration đã áp prod: 093 (`store_cashier`, `is_store_pos_operator`, vá 16 RPC, `set_menu_item_available`). Test trên **Bảo Lương**.
Chuẩn bị: đăng nhập chủ quán → **Thêm → Nhân viên** → thêm một email mới với vai trò **Thu ngân** (ghi lại mật khẩu tạm).

## Chủ quán quản lý vai trò
1. Form Thêm nhân viên có ô **Vai trò** (Nhân viên phục vụ / Thu ngân). Thêm thu ngân → danh sách hiện nhãn **Thu ngân**.
2. Bấm **Đổi thành Phục vụ** rồi **Đổi thành Thu ngân** → nhãn đổi theo.
3. Thêm thu ngân bằng email của chính chủ quán → báo lỗi "đã gắn với một tài khoản khác", không đổi gì.

## Thu ngân đăng nhập (trình duyệt ẩn danh / máy khác)
4. Đăng nhập tài khoản thu ngân → vào thẳng **POS**. Rail chỉ có **POS · Báo cáo**, không có ⚙. Ô **Thêm**: Đặt bàn · Thực đơn (Tạm hết) · Tài khoản.
5. Khách gọi món bằng Mini App → thu ngân **duyệt & in 2 liên** được; **từ chối** một lượt được.
6. Bỏ 1 món, tặng 1 món (có lý do) → được. Mở **Báo cáo** → khối Điều chỉnh bill ghi đúng tên/email thu ngân.
7. Thêm món ghi tay, ghép mâm, thêm bàn vào mâm → được.
8. **Thu tiền** (tiền mặt hoặc chuyển khoản) → bàn trống, đơn hoàn tất; Báo cáo hiện bill với người thu là thu ngân.
9. Đặt bàn: tạo đặt bàn mới, nhận khách, đánh dấu khách không đến → được.
10. **Thêm → Thực đơn (Tạm hết)**: chỉ có danh sách + ô tìm + nút Đang bán/Tạm hết, KHÔNG có nút sửa/xoá/thêm. Tắt một món → Mini App hiện "Tạm hết"; bật lại.
11. Trên POS, tab Sơ đồ bàn **không có** nút "Sắp xếp bàn".
12. Gõ thẳng các địa chỉ: `/admin/settings`, `/admin/tables`, `/admin/staff`, `/admin/vouchers`, `/admin/spin`, `/admin/orders` → đều về **POS**.
13. Bấm **Xem / In lại** ở Báo cáo hoặc **In tạm tính** ở bill → mở được hoá đơn 80mm.

13a. Thu ngân **Thêm → Tài khoản** → đổi họ tên và đổi mật khẩu → lưu được (đăng xuất, đăng nhập lại bằng mật khẩu mới).
13b. Thu ngân mở `/staff/order` trên điện thoại → đặt hộ một món cho một bàn → được; mở `/staff/tables` → thấy nút thu tiền / chốt bill.

## Vá thêm sau review (có từ trước PA-2)
13c. Chủ quán Pubu (hoặc quán khác) KHÔNG lấy/thu hồi được link màn bếp của Bảo Lương — phần này em đã test tự động; anh chỉ cần kiểm chủ quán Bảo Lương vẫn mở **Thêm → Bếp**/link bếp như cũ (nếu quán bật màn bếp).
13d. Trang **Đơn** (chủ quán): nút **Huỷ** đơn vẫn chạy bình thường.

## Thu hồi quyền
14. Chủ quán đổi người đó về **Nhân viên phục vụ** → bên thu ngân bấm F5: bị chuyển sang màn đặt hộ `/staff/order`; mọi thao tác POS đang mở báo lỗi quyền.
15. Chủ quán **Vô hiệu hoá** người đó → F5 → về trang đăng nhập.
16. `/mevo/accounts` (superadmin) hiện nhãn **Thu ngân** đúng người.

## Ghi chú khi em tự chạy thử
- Ngay sau khi đổi tài khoản đăng nhập giữa chừng, POS có lần hiện "Mất kết nối — đang thử lại" vài giây; tải lại thì "Trực tuyến" sau ~3 giây và giữ ổn định. Nếu anh thấy "Mất kết nối" kéo dài hơn 10 giây khi đăng nhập thu ngân, chụp ảnh gửi em.

**→ Báo:** `PA-2 PASS` hoặc số bài FAIL kèm ảnh.
