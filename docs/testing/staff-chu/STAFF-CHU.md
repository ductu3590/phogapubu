# Màn nhân viên — sửa chữ sau test prod 4 vai (2026-11-17)

Phát hiện khi agent chạy thử prod Yên Garden bằng Playwright (4 cửa sổ: chủ quán, thu ngân, quản lý, nhân viên).

| # | Lỗi | Sửa |
|---|---|---|
| 1 | Quán bắt thu ngân duyệt đơn nhân viên (`staff_order_release_policy = 'pos_confirmation'`, vd Yên Garden) mà màn gửi xong vẫn ghi "Đã gửi vào bếp" | Ghi "Đã gửi, chờ thu ngân duyệt"; quán tự vào bếp giữ câu cũ |
| 2 | Món thu ngân ghi tay vào bill (`order_source = 'pos'`, nằm `pending` mãi) hiện "Chờ xử lý" ở `/staff/orders` và `/staff/tables` | Ghi "Thu ngân ghi", nhãn không tô màu chờ |
| 3 | Mã đơn hai kiểu: màn gửi xong `#f99ba0cf` (8 ký tự đầu), danh sách `#EBCEF9` (6 ký tự cuối) | Cùng một kiểu 6 ký tự cuối viết hoa, khớp Hoá đơn A04 |

Code: `admin-web/lib/staff-order-display.ts` (+ test), `app/staff/order/page.tsx` (đọc chính sách bằng admin client, lọc
`store_id` của nhân viên), `staff-order-client.tsx`, `staff-orders-client.tsx`, `tables-client.tsx`.

**Agent ✓:** `vitest` toàn admin-web 198 file / 1846 test xanh (có 7 test mới); `tsc` sạch ngoài lỗi e2e có sẵn
(worktree thiếu `@playwright/test`); eslint sạch. **Chưa xem bằng trình duyệt** (cổng secrets chặn `.env.local`, D-010).

## Test tay (anh Tú) — làm trên Yên Garden, sau khi bản này đã chạy (local hoặc Vercel)

| Bài | Làm | Kỳ vọng | Kết quả |
|---|---|---|---|
| S1 | Đăng nhập nhân viên YG trên điện thoại → Đặt món → chọn bàn → 1 món → Gửi đơn | Tiêu đề "Đã gửi, chờ thu ngân duyệt"; mã đơn dạng `#ABC123` (6 ký tự hoa) | |
| S2 | Mở tab Đang xử lý | Đơn vừa gửi mang đúng mã ở S1, nhãn "Chờ xử lý" (màu vàng) | |
| S3 | Thu ngân duyệt đơn ở POS, mở bill bàn đó → Gọi thêm món → 1 món → Thêm vào bill | — | |
| S4 | Nhân viên xem lại tab Đang xử lý và tab Bàn | Món ghi tay ở S3 hiện "Thu ngân ghi" (không vàng); đơn đã duyệt "Đã xác nhận" / "Đã nhận" | |
| S5 | Thu ngân: Thao tác khác → Bỏ bàn (dọn bàn thử) | Bàn trống, không có khoản thu | |
| S6 | (tuỳ chọn) Quán tự vào bếp — Bảo Lương nếu cài `automatic` — nhân viên gửi đơn | Vẫn ghi "Đã gửi vào bếp" | |
