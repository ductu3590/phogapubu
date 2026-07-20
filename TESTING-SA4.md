# TESTING — Sprint SA-4: Realtime ba màn hình (spec 2026-07-15 §8, §10)

> Nhánh `main`. **KHÔNG migration mới** — `orders` đã bật realtime + RLS cho `authenticated` sẵn.
> Thuần code `admin-web`, cần **redeploy Vercel**. Test cần **≥2 màn hình cùng lúc**
> (điện thoại nhân viên + tablet bếp + máy chủ quán).
>
> ### SA-4 làm gì
> - **`/staff/orders`**: màn theo dõi đơn realtime của nhân viên (trước là khung rỗng) — đơn mới
>   hiện ngay, trạng thái/thanh toán đổi live, có chấm xanh báo kết nối + tự kéo lại khi mất mạng.
> - **`/admin` → Đơn hàng**: tự làm mới khi có đơn/thanh toán đổi (không bắt F5).
> - **Bếp**: đã realtime từ trước — sprint này chỉ xác nhận không regression.

---

## Test 1 — ⭐ Đơn mới hiện live trên /staff/orders

1. Máy A: đăng nhập nhân viên → mở **`/staff/orders`** (thấy "Đơn đang xử lý", **chấm xanh** góc trái).
2. Máy B (hoặc tab khác): đăng nhập nhân viên → `/staff/order` → đặt 1 đơn.
3. Trên máy A: đơn **tự hiện lên đầu danh sách trong ~1–3 giây**, KHÔNG bấm refresh.

- [ ] PASS / FAIL: ................

---

## Test 2 — ⭐ Trạng thái đổi live khi bếp thao tác

1. Giữ `/staff/orders` mở ở máy A.
2. Trên Kitchen Display: bấm **Bắt đầu làm** → rồi **Đã xong** cho đơn đó.
3. Máy A: badge trạng thái đổi **Chờ xử lý → Đang làm → Xong** live, không refresh.

- [ ] PASS / FAIL: ................

---

## Test 3 — ⭐ Admin Đơn hàng tự làm mới

1. Máy chủ quán (PC): mở `/admin` → **Đơn hàng**.
2. Đặt 1 đơn mới từ điện thoại nhân viên (hoặc khách quét QR).
3. Trang Đơn hàng **tự cập nhật** (đơn mới xuất hiện, số đơn/doanh thu đổi) trong ~1–3 giây, **không F5**.

- [ ] PASS / FAIL: ................

---

## Test 4 — Badge thanh toán đúng

Trên `/staff/orders` và `/admin`:
- Đơn **tiền mặt** chưa thu → badge **"💵 Tiền mặt · chưa thu"** (vàng).
- Đơn **chuyển khoản** chưa xác nhận → **"🏦 Chuyển khoản · chưa nhận"** (vàng).
- (Xác nhận đã nhận tiền là SA-5 — chưa có nút; badge "✓ Đã nhận tiền" sẽ lên khi có.)

- [ ] PASS / FAIL: ................

---

## Test 5 — Mất mạng rồi có lại (reconnect)

1. Mở `/staff/orders`, tắt wifi/4G điện thoại vài giây → **chấm chuyển xám**.
2. Bật lại mạng → **chấm xanh lại** + danh sách **tự kéo lại đúng** (không phải bấm refresh).
   (Thử: trong lúc mất mạng, đặt 1 đơn ở máy khác → khi có mạng lại đơn đó phải xuất hiện.)

- [ ] PASS / FAIL: ................

---

## Test 6 — Bếp không regression (chuông kêu 1 lần)

1. Đặt vài đơn liên tiếp → mỗi đơn bếp **kêu chuông + đọc đúng 1 lần** (không kêu lặp).
2. Đơn tiền mặt và chuyển khoản đều vào bếp; ZaloPay vẫn chờ thanh toán mới vào.

- [ ] PASS / FAIL: ................

---

## Nếu realtime KHÔNG chạy (đơn không tự hiện)

Đây là rủi ro chính của sprint (realtime cho tài khoản `authenticated`). Nếu Test 1/2/3 phải F5 mới
thấy: **báo Claude ngay** kèm chấm xanh/xám đang là gì — có thể cần chỉnh cách nạp token realtime.
Lưu ý: kể cả realtime hỏng, mở trang vẫn thấy đơn hiện tại (chỉ là không tự cập nhật).

## Sau khi PASS

Báo Claude *"SA-4 PASS"* → sang **SA-5**: nút xác nhận đã thu tiền (CASH/chuyển khoản) tại quầy +
doanh thu thực nhận, badge "Đã nhận tiền" lên live.
