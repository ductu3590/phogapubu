# MA-1 — Khung Mini App + Thực đơn tại bàn (m06) + Giỏ hàng

Nhánh `feat/mini-app-stitch`. Spec `docs/superpowers/specs/2026-10-05-mini-app-stitch-design.md`. Chỉ test trên **Bia lẩu Bảo Lương**.

## Đã làm

- **Thanh công cụ mới cho mọi màn** (kiểu m06): hàng 1 = quay lại + tên trang, góc phải để trống cho nút "··· ⊗" của Zalo. Hàng 2 = logo/chữ viết tắt quán (bấm → Thông tin nhà hàng) · **Gọi NV** đỏ có chuông lắc · chip **Bàn 9** · nút **Quan tâm** (tim) · giỏ có số món · **tài khoản**.
- **2 bộ tab**: quét QR bàn = **Thực đơn · Đơn gọi**; mở thường = **Trang chủ · Đặt bàn**. Tab cũ "Nhà hàng" bỏ (vào bằng logo).
- **Thực đơn**: ô tìm món (gõ không dấu được), chip danh mục, tiêu đề nhóm có vạch màu + "N món", thẻ món tự đổi **lưới 2 cột** (danh mục ≥60% món có ảnh) / **danh sách** (Bảo Lương hiện chưa có ảnh nên ra danh sách), nút + → [− 1 +], món tắt hết lựa chọn → "Tạm hết".
- **Thanh giỏ tối** "N món · Bàn 9 · tổng + Xem đơn", nằm trên thanh tab, không đè.
- **Giỏ hàng** chia khối thẻ (bàn · món đã chọn · ghi chú · thanh toán · tạm tính), nút đáy "Gọi món". Logic gửi đơn/voucher/thanh toán không đổi.
- **Trang Tài khoản**: "Cập nhật trong phiên bản sắp tới".
- **Server (mig 087, đã áp prod)**: gọi nhân viên chặn **3 phút** cho mỗi bàn/mâm, kể cả khi thu ngân đã bấm xử lý xong lần gọi trước.

## Cố ý chưa làm trong MA-1

- Trang **Đơn gọi** và **Thông tin nhà hàng** vẫn giao diện cũ → MA-2. Chấm báo "còn lượt chờ duyệt" trên tab Đơn gọi → MA-2.
- **Trang chủ / Đặt bàn / Đơn của tôi** của lối vào thường vẫn là thực đơn + trang cũ → MA-3.

## Cách chạy để test

Code đã được gộp sẵn vào thư mục quán (chỉ trên máy, chưa push):

```
cd mini-app-instances/bia-lau-bao-luong/mini-app
npm run dev
```

- Ở bàn: mở `http://localhost:5173/?table=34933e2d-0787-4a7a-ad37-dee936b801c0&tableNumber=Bàn%209` (Bàn 9), bật chế độ điện thoại của trình duyệt (F12 → biểu tượng điện thoại, chọn 390 hoặc 360).
- Lối vào thường: `http://localhost:5173/`.
- ⚠️ Gọi NV / gọi món ở đây ghi vào **DB thật** của Bảo Lương (POS sẽ thấy). Nút Quan tâm chỉ chạy trong Zalo.
- Chưa cần `zmp deploy` — deploy một lần khi xong MA-4.

## Bài test

1. QR Bàn 9: thanh công cụ 2 hàng; hàng 2 có chữ viết tắt "BL", **Gọi NV** đỏ (chuông lắc nhẹ), chip **Bàn 9**, tim, giỏ, tài khoản. Khổ 360 không bị cắt chữ.
2. Bấm **Gọi NV** → "Đã gọi nhân viên, vui lòng chờ trong giây lát"; POS hiện thẻ gọi Bàn 9. Bấm lại ngay → "Bạn vừa gọi lúc HH:MM, có thể gọi lại sau HH:MM".
3. Thu ngân bấm xử lý xong thẻ gọi, khách gọi lại **trong 3 phút** → vẫn bị chặn. Sau 3 phút → gọi được.
4. Bấm **logo BL** → trang Thông tin nhà hàng (giao diện cũ). Bấm **icon tài khoản** → "Cập nhật trong phiên bản sắp tới", có nút quay lại.
5. Thực đơn ra **danh sách** (không ô ảnh trống); tiêu đề nhóm có vạch màu chủ đạo + "N món"; bấm chip → nhảy tới nhóm; cuộn → chip đổi theo.
6. Ô tìm: gõ "bia" / "lau" (không dấu) → lọc đúng; gõ chữ không có → "Không tìm thấy món …".
7. Bấm + món thường → thành [− 1 +]; món nhiều loại → mở bảng chọn; món tắt hết loại / hết hàng → mờ + "Tạm hết".
8. Thanh giỏ tối "2 món · Bàn 9 · tổng" + **Xem đơn**, nằm trên thanh tab, không che tab.
9. Giỏ hàng: sửa số lượng, ghi chú, **Gọi món** chạy như cũ; quán đóng cửa → nút khoá + dòng báo.
10. Thanh tab ở bàn: **Thực đơn · Đơn gọi**. Mở thường: **Trang chủ · Đặt bàn**, không có Gọi NV / chip bàn / giỏ / nút +; nút **Quan tâm** có chữ.
11. Đổi **Màu chủ đạo** ở `/admin` → Cài đặt quán → mở lại app: nút +, chip đang chọn, giá, vạch tiêu đề, tab đang chọn đổi theo; **Gọi NV vẫn đỏ**.

**→ Báo:** `MA-1 PASS`
