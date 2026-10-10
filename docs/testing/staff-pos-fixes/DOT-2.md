# Đợt 2 — POS /admin/pos (2026-10-09)

Mig 098 + 099 đã áp prod. Test trên Bảo Lương bằng tài khoản **chủ quán**, rồi lặp bài A2 bằng **thu ngân**.

## A1 — Gộp bill tự thoát
1. Có ≥2 bàn đang mở → **Gộp bill** → chọn 2 bàn → Thanh toán → Xác nhận đã nhận.
2. Thu xong: dải "Gộp bill: bấm từng thanh…" tự biến mất, nút **Gộp bill** hiện lại — không phải bấm "Thoát gộp bill".

## A2 — Nhãn vai trò
3. Thanh trên POS, cạnh tên quán: khối đen **Chủ quán** (màn rộng có kèm email).
4. Đăng nhập thu ngân → khối ghi **Thu ngân**.

## A4 — Sửa số lượng
5. Mở bill một bàn → menu ⋮ của một món → có **Số lượng** (cùng nhóm Tặng món / Bỏ món).
6. Đổi 3 → 2: nút Lưu bị khoá tới khi có lý do; bấm chip "Khách gọi nhầm" → Lưu → tổng bill giảm đúng 1 phần; dưới tên món hiện **SL 3→2 · Khách gọi nhầm**.
7. Đổi tiếp 2 → 5 lý do "Khách gọi thêm" → tổng tăng đúng; hiện thêm dòng **SL 2→5**.
8. Không cho xuống dưới 1 (muốn bỏ hẳn dùng Bỏ món). Món đã Bỏ/Tặng thì menu chỉ còn Khôi phục.
9. Làm được cả trong màn **Thanh toán** (danh sách "Món đã dùng & điều chỉnh").

## A3 — In tạm tính / hoá đơn đủ dòng 0đ
10. Bàn có 1 món Bỏ (có lý do) + 1 món Tặng (có lý do) + 1 lần sửa số lượng → **In tạm tính / hoá đơn**.
11. Phiếu có dòng `1 × BỎ — <lý do>` và `1 × TẶNG — <lý do>` ở 0đ; cuối mâm có mục **Điều chỉnh số lượng:** `Món: 3 → 2 — lý do`. Tổng cộng không đổi so với trước khi in.

## A5 — Khách lẻ
12. Thanh trên có nút viền cam **Khách lẻ** → hộp chọn bàn TRỐNG, chia theo khu.
13. Chọn bàn → màn chọn món tiêu đề "Khách lẻ · Bàn X" → thêm 2 món → gửi → bàn chuyển sang có khách và bill bàn đó tự mở, có đúng 2 món.
14. Món KHÔNG vào bếp, không chuông / không in phiếu bếp.
15. Chọn bàn rồi đóng hộp thoại (không gửi món) → bàn vẫn trống, không có phiên 0đ.
