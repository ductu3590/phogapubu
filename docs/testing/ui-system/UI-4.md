# UI-4 — Khu MEVO superadmin `/mevo` theo design system mới

Nhánh `feat/ui-system` (sau UI-3 PASS). Chỉ đổi **giao diện**: không đổi API, RPC, database, logic.
Đăng nhập `admin@mevo.vn`, `cd admin-web && npm run dev`.

## Đã đổi

| Chỗ | Sau UI-4 |
|---|---|
| Khung `/mevo` | CÙNG AppShell với `/admin` (bỏ sidebar 224px cố định cũ — từng vỡ trên điện thoại). Menu: Tổng quan · Danh sách quán · Tài khoản · Nội bộ › Bộ giao diện |
| Tổng quan | 4 thẻ số liệu nền trắng, icon lucide (không emoji); "Thiếu thanh toán/OA" viền vàng khi > 0; lỗi deploy hiện banner đỏ |
| Danh sách quán | Từ 768px: bảng đủ cột. Điện thoại: mỗi quán một dòng bấm được (không còn bảng bị cắt mất cột) |
| Cột Deploy | Nhãn tiếng Việt có màu: Đã publish (xanh lá) · Đã deploy (xanh dương) · Chưa deploy (xám) · Lỗi deploy (đỏ) |
| Ô secret | Nút ẩn/hiện là icon con mắt (không emoji), ô nhập cùng dáng `.input` |
| Tài khoản | Badge vai trò (Chủ quán / Nhân viên) trung tính, không còn nền cam |
| Tạo quán (wizard) | Màn "Đã tạo quán" dùng chấm trạng thái thay ✅ / ⏳ |
| Màu | 220 class màu lẻ đổi sang token |

## Test

1. 1366px: sidebar MEVO có 4 mục, mục đang mở sáng đúng (vào chi tiết một quán vẫn sáng "Danh sách quán").
2. 390px: thanh trên + ☰ mở ngăn kéo menu; không trang nào cuộn ngang.
3. **Tổng quan**: số liệu đúng như trước (tổng quán, đang onboarding, đã publish, thiếu thanh toán/OA).
4. **Danh sách quán** 1366px: bảng 7 cột, "Chi tiết" mở đúng quán. 390px: dòng thẻ có tên, slug, 3 badge, mũi tên.
5. **Chi tiết quán**: lưu Thông tin quán, Giao diện Mini App (màu chủ đạo), checkout/OA, gán chủ quán, thông báo nhóm
   — chạy như cũ. Nút con mắt ẩn/hiện secret hoạt động.
6. **Tạo quán mới**: đi đủ 6 bước như cũ; màn cuối liệt kê mục đã xong / còn thiếu bằng chấm màu.
7. **Tài khoản**: danh sách theo quán, "Đổi mật khẩu" mở form như cũ.
8. **Bộ giao diện** (`/mevo/ui-kit`): giờ xem được cả trên điện thoại (trước đây bị sidebar cũ đè).

**→ Báo:** `UI-4 PASS` hoặc số bài FAIL kèm ảnh.
