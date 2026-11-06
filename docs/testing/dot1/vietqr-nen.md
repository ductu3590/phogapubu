# Đợt 1 mục D, Part 1: VietQR nền (Tài khoản nhận tiền)

Test trên Bảo Lương, đăng nhập bằng tài khoản chủ quán. Bài 4 là bài quan trọng nhất của mục D: mã phải quét được bằng app ngân hàng thật.

| # | Bước | Kết quả đúng |
|---|---|---|
| 1 | Vào Cài đặt chung, kéo xuống mục **Tài khoản nhận tiền** (giữa khối Âm thanh/In ấn và Quy trình vận hành) khi quán chưa khai báo. | Có mục, có 3 ô (Ngân hàng, Số tài khoản, Tên chủ tài khoản) và nút Lưu tài khoản. Không có mã QR, không có chữ "Quét thử". |
| 2 | Chọn ngân hàng, nhập số tài khoản có dấu cách (vd `0011 0012-34567`), tên có dấu (vd `Đỗ Đức Tú`), bấm Lưu tài khoản. | Hiện "Đã lưu". Ô số tài khoản thành `0011001234567`, ô tên thành `DO DUC TU`. Hiện khối **Quét thử** có mã QR, tên ngân hàng, số tài khoản, tên chủ tài khoản và dòng "Quét bằng app ngân hàng để kiểm tra: 10.000đ. Không cần chuyển." |
| 3 | Xoá trống ô số tài khoản (hai ô kia còn chữ) rồi Lưu. | Báo lỗi tiếng Việt "Cần nhập đủ ngân hàng, số tài khoản và tên chủ tài khoản". Chữ đang gõ ở các ô còn nguyên, không bị xoá. Tài khoản đã lưu trước đó không đổi. |
| 4 | Quét mã Quét thử bằng **3 app ngân hàng khác nhau**. Chỉ xem, **không chuyển tiền**. | Mỗi app điền sẵn đúng ngân hàng nhận, đúng số tài khoản, số tiền 10.000đ, nội dung `MEVO QUET THU`. App nào không đọc được hoặc điền sai thì ghi lại tên app. |
| 5 | Đăng nhập tài khoản thu ngân, thử vào Cài đặt. | Không vào được Cài đặt chung (thu ngân chỉ có Bảo mật của mình). |
| 6 | **Làm cuối cùng nếu quán chưa muốn bật.** Đăng nhập chủ quán, để trống cả ba ô (chọn "Chọn ngân hàng", xoá số và tên) rồi Lưu. | Hiện "Đã lưu". Khối Quét thử và mã QR biến mất, ba ô trống. |
