# ST-4 — Khu /mevo theo bản Stitch A06–A11

Nhánh `feat/pos-timeline`. Đăng nhập tài khoản **MEVO superadmin** (`admin@mevo.vn`).

## Đã làm

- **Sidebar rộng** (A07/A10): logo "MEVO Cockpit", nhóm "Vận hành & quản trị" (Tổng quan · Tạo quán mới · Danh sách quán · Tài khoản vận hành) + "Nội bộ" (Bộ giao diện). Mục đang mở **tô đặc cam, chữ trắng**. Chân sidebar là thẻ tài khoản (email + nút đăng xuất).
- **Tổng quan** (A06): 4 thẻ số liệu (Tổng số quán · Đang onboarding · Phiên bàn đang mở · Chưa đủ hồ sơ) + **lưới thẻ quán**: trạng thái, slug, số bàn/phiên đang mở, mô hình vận hành bằng lời ("Trả sau · Thu ngân duyệt + in phiếu · Có đặt bàn"), các mục đã có/chưa có, nút "Mở hồ sơ quán".
- **Danh sách quán** (A11): bảng có ô chữ viết tắt (BL, PP…), slug + Mini App ID, nhãn trạng thái, mô hình vận hành; bấm tên quán để mở hồ sơ. Điện thoại: danh sách dòng.
- "Chưa đủ hồ sơ" = thiếu Zalo Mini App ID hoặc chưa có tài khoản chủ quán (thay "Thiếu thanh toán/OA" cũ — quán trả sau như Bảo Lương không cần Checkout nên đếm cũ báo sai).
- "Thanh toán Zalo Checkout" chỉ hiện trong thẻ quán **trả trước**.

## Cố ý KHÔNG làm (bản vẽ có nhưng hệ thống chưa có dữ liệu thật — hỏi riêng nếu cần)

Audit log, ma trận phân quyền RBAC, chỉnh theme/banner trong /mevo (A08), cổng VietQR/ZNS/máy in mạng (A09), cụm máy chủ/SLA, ô tìm kiếm + chuông trên đầu trang, phân trang/bộ lọc danh sách quán, khung 6 bước onboarding bên phải A11.

## Bài test

1. Mở `/mevo`: sidebar rộng, mục **Tổng quan** tô cam. Chân sidebar hiện email đăng nhập; bấm icon đăng xuất → về trang đăng nhập.
2. 4 thẻ số liệu khớp thực tế: Tổng số quán = 3, Phiên bàn đang mở = số bàn đang có khách lúc tải trang.
3. Thẻ **Bia lẩu Bảo Lương**: mô hình "Trả sau · Thu ngân duyệt + in phiếu · Có đặt bàn", 20 bàn, KHÔNG có dòng "Thanh toán Zalo Checkout". Thẻ **Phở Gà Pubu** có dòng đó.
4. Bấm "Mở hồ sơ quán" → đúng trang chi tiết quán.
5. Bấm **Danh sách quán**: bảng không bị đẩy tràn ở màn 1280px; bấm tên quán → trang chi tiết. Sidebar sáng đúng "Danh sách quán" (không sáng "Tạo quán mới").
6. Bấm **Tạo quán mới**: wizard cũ chạy bình thường, sidebar sáng "Tạo quán mới".
7. **Tài khoản vận hành**: trang cũ vẫn chạy (đặt lại mật khẩu…).
8. Điện thoại (≤ 400px): nút menu mở ngăn kéo sidebar; trang Tổng quan không tràn ngang, thẻ quán không bị cắt mép.

**→ Báo:** `ST-4 PASS`
