# Test VietQR ghép vào POS và tờ in (Đợt 1, mục D Part 2)

> **Agent 2026-11-15 (T-002):** vitest admin-web 178 file / 1627 test xanh, print-agent 8 file / 103 test xanh, `node --test supabase/tests/*.test.mjs` 588/589 (1 đỏ = nợ cũ 048 trên Windows; sau T-003 cùng ngày: 603/603 xanh). "Agent ✓" = đã kiểm đủ bằng máy; bài có chữ 👤 vẫn cần anh Tú (phần Agent ✓ đi kèm chỉ là logic đã có test, không thay cho nhìn bằng mắt / thiết bị thật). Gom thứ tự chạy ở [../TRUOC-GO-LIVE.md](../TRUOC-GO-LIVE.md).

Test trên Bảo Lương (đã khai tài khoản nhận tiền ở Cài đặt). Dựng bill bằng nút **Khách lẻ**, dọn bằng **Bỏ bàn** để không vào doanh thu, trừ bài 7.

1. Thanh toán, chọn **Chuyển khoản**: có mã QR, số tiền đúng số cần thu, câu nhắc đổi thành "Cho khách quét mã này, nghe loa báo tiền về đủ …".
   - **Kết quả:** Agent ✓ (jsdom) `payment-vietqr.test.tsx` "chuyển khoản có QR: hiện mã và câu nhắc mới"; `bill-qr.test.ts` paymentQrAmount chuyển khoản = số cần thu (15/11).
2. Đặt giảm giá cho bill: QR đổi theo số sau giảm.
   - **Kết quả:** Agent ✓ `bill-qr.test.ts` "bill có đơn đã thu trước: số trong QR là phần chưa thu sau giảm giá", "giảm 100%: không có QR" (15/11).
3. Chọn **Kết hợp**, gõ ô Chuyển khoản: QR đổi theo số vừa gõ. Xoá trắng ô đó (hoặc gõ lệch tổng): QR biến mất.
   - **Kết quả:** Agent ✓ `bill-qr.test.ts` "kết hợp: phần chuyển khoản", "kết hợp, phần CK 0 / 100001: 0"; `payment-vietqr.test.tsx` "kết hợp đang chia lệch: ẩn QR" (15/11).
4. Chọn **Tiền mặt**: không có QR.
   - **Kết quả:** Agent ✓ `bill-qr.test.ts` "tiền mặt: 0"; `payment-vietqr.test.tsx` "mặc định là tiền mặt: có tài khoản cũng không hiện QR" (15/11).
5. Gộp 2 mâm rồi Thanh toán, chọn Chuyển khoản: một QR cho cả bill, nội dung có cả hai bàn, tối đa 25 ký tự.
   - **Kết quả:** Agent ✓ `bill-qr.test.ts` "gộp bill: thứ tự đầu vào không đổi nội dung…"; `vietqr.test.ts` memo tối đa 25 ký tự, "tên dài chỉ cắt phần bàn" (15/11).
6. **In tạm tính** (bill chưa thu): tờ in có QR, số tiền đúng. Đo bằng thước: phần mã rộng từ 35mm. Quét bằng **3 app ngân hàng** trên tờ in nhiệt thật (chỉ xem, không chuyển). Làm thêm một lần qua **phần mềm in** (chế độ agent): tờ in cũng có QR.
   - **Kết quả:** 👤 anh Tú (thước + 3 app + máy in nhiệt thật + phần mềm in). Agent ✓ logic: `print-bill.test.tsx` "có QR ngay trong HTML lần đầu", "phần mã trên giấy đủ 35mm với mã nhỏ nhất" (15/11).
7. Thu xong một bill nhỏ nhất, in lại ở A04: **không có QR**, có các dòng từng khoản. Bài này cộng vào doanh thu, ghi lại số tiền: ______
   - **Kết quả:** 👤 anh Tú (thu thật; ghi số tiền ở dòng bài). Agent ✓ logic: `print-bill.test.tsx` "mig 112a — in lại bill đã thu" + `bill-qr.test.ts` "bill đã thu: không còn trong danh sách mở thì không có QR" (15/11).
8. Đăng nhập tài khoản **thu ngân**: thấy QR ở màn Thanh toán.
   - **Kết quả:** 👤 anh Tú (đăng nhập thu ngân). Agent ✓ logic: `lib/print/load-bill-qr.test.ts` (đọc đúng quán của người đăng nhập) (15/11).
9. Xoá tài khoản nhận tiền ở Cài đặt: POS và tờ in không còn QR, câu nhắc cũ ("Cho khách quét mã QR của quán…") trở lại.
   - **Kết quả:** Agent ✓ `payment-vietqr.test.tsx` "không có QR: giữ câu cũ, không hiện mã"; `bill-qr.test.ts` "chưa có tài khoản thì không có QR" (15/11).
10. Quán chưa khai tài khoản in bill: tờ in y như trước.
   - **Kết quả:** Agent ✓ `print-bill.test.tsx` "không có QR thì tờ in như cũ" (15/11).
