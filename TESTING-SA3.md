# TESTING — Sprint SA-3: UI mobile-first đặt hộ (spec 2026-07-15 §7, §10)

> Nhánh `main`. **KHÔNG migration mới** — dùng RPC `staff_create_order` đã có + đã test kỹ ở SA-1.
> Thuần code `admin-web`, cần **redeploy Vercel**. **Test trên điện thoại thật** (Android/iPhone),
> đăng nhập bằng tài khoản nhân viên (tạo ở màn `/admin` → Nhân viên).
>
> ### SA-3 làm gì
> Biến `/staff/order` từ khung rỗng thành **màn đặt món hộ thật**: chọn bàn → chọn món/topping →
> giỏ → checkout tiền mặt/chuyển khoản → đơn vào bếp ngay. Chưa có realtime theo dõi đơn (SA-4) và
> chưa có màn xác nhận đã thu tiền (SA-5).

---

## Test 1 — ⭐ Đặt một đơn tiền mặt hoàn chỉnh

1. Đăng nhập `/staff` bằng tài khoản nhân viên → vào `/staff/order`.
2. **Chọn bàn** (lưới nút bàn). Nếu quán chỉ 1 bàn thì tự chọn.
3. Menu hiện theo danh mục (tabs ngang) + ô **tìm món**.
4. Bấm **+** ở một món **không có topping** → badge số trên nút tăng, thanh giỏ dưới đáy hiện "X món · tổng".
5. Bấm **Đặt món** (thanh giỏ) → xem lại giỏ → **Đặt món** → chọn **💵 Tiền mặt**.
6. Hiện màn **✅ Đã gửi vào bếp**: mã đơn, bàn, tổng, dòng "Khách thanh toán tại quầy sau".

- [ ] PASS / FAIL: ................

---

## Test 2 — ⭐ Bếp nhận đơn NGAY (không refresh)

1. Mở Kitchen Display (tablet/máy khác) song song.
2. Ngay sau Test 1 bước 6 → đơn **hiện trên màn bếp** ở "Chờ xử lý", có **chuông + loa đọc đơn**,
   không cần refresh. (Đơn tiền mặt/chuyển khoản vào bếp ngay, đúng thiết kế.)

- [ ] PASS / FAIL: ................

---

## Test 3 — Món có topping + ghi chú

1. Bấm **+** ở một món **có topping** → mở bảng chọn topping.
2. Tick vài topping → giá cập nhật; chỉnh **số lượng**; nhập **ghi chú** (vd "ít cay") → **Thêm**.
3. Mở giỏ → dòng đó hiện đúng topping đã chọn + giá đã cộng topping, ghi chú giữ nguyên.

- [ ] PASS / FAIL: ................

---

## Test 4 — Sửa giỏ + tổng tiền đúng

1. Trong giỏ: bấm **+ / −** đổi số lượng, xoá 1 dòng (giảm về 0).
2. Tổng tiền cập nhật đúng theo (giá món + topping) × số lượng.

- [ ] PASS / FAIL: ................

---

## Test 5 — Đổi bàn + đơn mới

1. Ở màn menu bấm **Đổi bàn** → chọn bàn khác.
2. Sau khi đặt xong 1 đơn → bấm **Đơn mới** → giỏ trống, vẫn ở bàn vừa chọn để đặt tiếp nhanh.

- [ ] PASS / FAIL: ................

---

## Test 6 — Chuyển khoản

1. Đặt 1 đơn nữa, ở checkout chọn **🏦 Chuyển khoản** → vào bếp giống tiền mặt, màn thành công hiện đúng.

- [ ] PASS / FAIL: ................

---

## Test 7 — Chống bấm trùng (idempotency)

1. Ở checkout, bấm nút thanh toán **hai lần thật nhanh** (hoặc bấm lại khi mạng chập chờn).
2. Chỉ **một đơn** vào bếp (không nhân đôi). Nút bị **khoá** khi đang gửi.

- [ ] PASS / FAIL: ................

---

## Test 8 — Đơn chưa thu KHÔNG vào doanh thu (kiểm chéo)

1. Mở `/admin` → Dashboard/Đơn hàng: đơn vừa đặt hiện trạng thái **chưa thu tiền**, **doanh thu chưa tăng**.
   (Xác nhận đã thu tiền là màn của SA-5 — chưa có ở sprint này.)

- [ ] PASS / FAIL: ................

---

## Test 9 — Không regression khách tự đặt

1. Quét QR bằng Zalo, khách tự đặt 1 đơn như thường → vẫn chạy bình thường (mini-app không đổi).

- [ ] PASS / FAIL: ................

---

## Dọn sau khi test

Các đơn test do nhân viên tạo nằm trong `orders` (order_source='staff'). Nếu muốn doanh thu/đếm đơn
sạch cho pilot, nhờ Claude xoá theo mốc thời gian test.

## Sau khi PASS

Báo Claude *"SA-3 PASS"* → sang **SA-4**: realtime ba màn hình (bếp + nhân viên + quầy cập nhật live,
dedupe chuông/TTS, reconnect).
