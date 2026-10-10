# PA-5 — Địa chỉ trên phiếu in + In thử

Test trên **Bia lẩu Bảo Lương**, máy tính quầy có máy in bill 80mm. Địa chỉ quán hiện tại:
"236 Bảo Lương, Ngã 5 Bảo Lương, P. Yên Bái, Lào Cai".

## A. Phiếu bàn có địa chỉ
1. POS → duyệt một lượt khách gọi → in 2 liên. **Liên PHIẾU BÀN**: dưới tên quán có dòng địa chỉ, rồi mới tới "ĐT: …".
2. Địa chỉ dài xuống dòng gọn trong khổ giấy, không bị cắt mép phải.
3. **Liên PHIẾU BẾP** KHÔNG có địa chỉ (giữ như cũ).
4. Hoá đơn thanh toán (Thanh toán → In hoá đơn) vẫn có địa chỉ như trước.

## B. In thử
5. ⚙ Cài đặt → tab Cấu hình quán → khối **In ấn** → bấm **In thử** → tab mới mở, hộp thoại in tự bật.
   Phiếu ghi "PHIẾU IN THỬ", có tên + địa chỉ + SĐT thật của quán, 2 món mẫu, tổng 200.000đ, chân phiếu
   "Không phải hoá đơn — không tạo đơn".
6. Đăng nhập tài khoản **thu ngân**, gõ thẳng `/print/test-slip` → bị chuyển đi (không in được).
7. Sau khi in thử: POS không có bàn nào mới mở, Báo cáo ngày không có bill mới.
8. (Tuỳ chọn) Xoá tạm SĐT quán → In thử → không có dòng "ĐT:" trống. Nhập lại SĐT sau khi thử.
