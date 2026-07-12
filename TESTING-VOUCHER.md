# TESTING — Hệ mã giảm giá (spec 2026-07-11)

> Nhánh `feat/vouchers`. Migration 027 ĐÃ áp prod. Admin web deploy khi push; mini-app cần `zmp deploy`.
> **ƯU TIÊN TEST 1 TRƯỚC** — nếu fail thì dừng, báo Claude sửa phương án (item giá âm) rồi mới test tiếp.
>
> Nhắc `zmp deploy` mini-app: chọn **Development** (anh tự test) hay **Testing** (release cho khách) —
> Zalo giới hạn số lần deploy/tháng.

## Test 1 — ⚠️ RỦI RO #1: thanh toán với số tiền ĐÃ GIẢM
Mục tiêu: xác nhận Zalo Checkout mở bình thường khi `amount` gửi lên nhỏ hơn tổng giá các `item`.
1. Admin → **Vòng quay**: thêm 1 ô loại **🎟️ Mã giảm giá**, kiểu `đ`, mức `10000`, HSD 30 ngày, tỉ lệ cao. Bật vòng quay (cần ≥1 ô đang bật).
2. Đặt 1 đơn thật, thanh toán (chuyển khoản) xong → quay → trúng ô mã giảm giá. Màn khách hiện "Mã tự động áp dụng cho lần đặt món sau • HSD ...".
3. Đặt đơn thứ 2 (tổng > 11.000đ): ở checkout thấy mục **Mã giảm giá** tự chọn mã, dòng "Giảm giá −10.000đ", **Tổng cộng** đã trừ 10k.
4. Bấm thanh toán → **Zalo Checkout mở BÌNH THƯỜNG với số tiền đã giảm** (KHÔNG lỗi khớp tổng item). Chuyển khoản xong → đơn `confirmed`.
5. Admin → **Đơn hàng**: đơn thứ 2 hiện dòng "🎟️ Giảm giá −10.000đ (mã ...)"; doanh thu cộng đúng số tiền đã giảm (không phải giá gốc).
- [ ] PASS / FAIL: ................
- Nếu FAIL ở bước 4 (Zalo báo lỗi số tiền): **DỪNG**, báo Claude thêm item "Giảm giá" giá âm vào `checkout-create-mac`.

## Test 2 — Giải hiện vật báo bếp
1. Admin → Vòng quay: thêm ô **🎁 Có quà** "Tặng 1 trà đá", tỉ lệ cao. Mở màn hình bếp, bật nút **🔊 Đọc đơn**.
2. Khách quay trúng trà đá → màn bếp hiện card **tím** góc trái "🎁 Bàn X trúng Tặng 1 trà đá — Mang ra cho khách" + chuông + loa đọc "Bàn X trúng Tặng 1 trà đá".
3. Bấm **"Đã đưa ✓"** → card biến mất. Màn khách (nếu mở lại) hiện "✓ Đã đổi thưởng". F5 màn bếp → card KHÔNG hiện lại.
4. Khách trúng ô **Mã giảm giá** hoặc **Trượt** → bếp KHÔNG hiện card, KHÔNG đọc loa.
- [ ] PASS / FAIL: ................

## Test 3 — Mã vòng quay: đúng người, 1 lần, hết nhả
1. Máy A (Zalo A) trúng mã → máy A vào checkout thấy mã tự áp.
2. Máy B (Zalo B) checkout → KHÔNG thấy mã của A; nhập tay code của A → báo "Mã này thuộc về tài khoản Zalo khác".
3. Máy A dùng mã, thanh toán thành công → đặt đơn nữa: mã KHÔNG còn (đã dùng 1 lần).
4. (Tùy chọn) Máy A áp mã mới khác, bấm thanh toán rồi THOÁT ngang không trả → nhờ Claude lùi `created_at` đơn treo 31 phút bằng SQL → máy A áp lại mã đó được (khoá mềm 30' đã nhả).
- [ ] PASS / FAIL: ................

## Test 4 — Mã shipper: kích hoạt + khoá UID + giới hạn ngày
1. Admin → **Ưu đãi** → tab Mã shipper: tạo mã "Shipper Test", giảm 5.000đ, tối đa **2 đơn/ngày**. Trạng thái hiện **"Chưa kích hoạt"**. Copy code (dạng SHIP-XXXXXX).
2. Máy A nhập code, đặt đơn thành công → admin refresh thấy trạng thái **"Đã khoá máy"**.
3. Máy B nhập cùng code → "Mã này thuộc về tài khoản Zalo khác".
4. Máy A đặt đơn thứ 2 trong ngày OK; đơn thứ 3 → "Mã đã hết lượt hôm nay".
5. Admin bấm **"Thu hồi"** → máy A đặt đơn mới không áp được ("Mã đã bị tắt"). Bấm "Bật lại" → dùng được lại.
6. Admin bấm dòng "N lượt dùng • đã giảm ..." → xem lịch sử: đủ các đơn đã dùng, đúng số tiền giảm + tổng phải trả.
- [ ] PASS / FAIL: ................

## Test 5 — Không phá luồng cũ (quán không dùng voucher)
1. Quán TẮT vòng quay + không tạo mã shipper nào: ở checkout chỉ thấy nút nhỏ "🎟️ Nhập mã giảm giá" (không có mã tự chọn); đặt món tiền mặt/chuyển khoản như cũ, không lỗi.
2. Đơn không mã: màn bếp, doanh thu, trang Đơn hàng hiển thị y như trước (không có dòng giảm giá).
- [ ] PASS / FAIL: ................

---
Sau khi cả 5 PASS → báo Claude để merge `feat/vouchers` vào `main` + `zmp deploy` mini-app cho Pubu.
