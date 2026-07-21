# TESTING — Sprint SA-5: Thu tiền và báo cáo (spec 2026-07-15 §6.2, §9, §4.4, §10)

> Nhánh `main`. **KHÔNG migration mới** — dùng RPC `confirm_manual_payment` đã có + đã test ở SA-1.
> Thuần code `admin-web`, cần **redeploy Vercel**.
>
> ### SA-5 làm gì (sprint cuối luồng đặt hộ)
> - Nút **"✓ Đã nhận tiền"** ở `/admin` → Đơn hàng: chủ quán xác nhận đã thu tiền mặt / chuyển khoản
>   → gọi RPC `confirm_manual_payment` (**chỉ chủ quán**, ghi người + thời gian, **không đổi trạng thái bếp**).
> - Thay nút "Đã thanh toán" cũ (set `status='paid'` bằng service role, **không kiểm quyền**) bằng luồng RPC an toàn.
> - **Badge thanh toán** đầy đủ trên admin (💵 chưa thu / 🏦 chưa nhận / ✓ đã nhận) + **filter "Chưa thu"**.
> - Badge **"✓ Đã nhận tiền" lên LIVE** trên `/staff/orders` khi chủ quán xác nhận.
> - Đơn đã xác nhận **vào doanh thu thực nhận** (dashboard + trang Đơn hàng khớp nhau).

---

## Test 1 — ⭐ Xác nhận đơn tiền mặt

1. Đặt 1 đơn **tiền mặt** (qua `/staff/order` hoặc khách).
2. `/admin` → **Đơn hàng**: đơn đó có badge **"💵 Tiền mặt · chưa thu"** (vàng) + nút **"✓ Đã nhận tiền"**.
3. Bấm **"✓ Đã nhận tiền"** → badge đổi **"✓ Đã nhận tiền"** (xanh), nút biến mất.
4. Số **"Chưa thu"** ở đầu trang giảm 1; **Doanh thu** tăng đúng số tiền đơn.

- [ ] PASS / FAIL: ................

---

## Test 2 — ⭐ Xác nhận đơn chuyển khoản

1. Đặt 1 đơn **chuyển khoản** → `/admin` Đơn hàng thấy **"🏦 Chuyển khoản · chưa nhận"** + nút "✓ Đã nhận tiền".
2. (Chủ quán liếc app ngân hàng thấy tiền vào rồi mới bấm.) Bấm **"✓ Đã nhận tiền"** → badge xanh, vào doanh thu.

- [ ] PASS / FAIL: ................

---

## Test 3 — ⭐ Badge "Đã nhận tiền" lên LIVE trên màn nhân viên

1. Máy A: `/staff` → tab **Đang xử lý** (mở sẵn), thấy đơn đó badge vàng "chưa thu".
2. Máy B (chủ quán): `/admin` Đơn hàng → bấm **"✓ Đã nhận tiền"** cho đơn đó.
3. Máy A: badge đơn đó **tự đổi sang "✓ Đã nhận tiền"** (xanh) trong ~1–3 giây, không refresh.

- [ ] PASS / FAIL: ................

---

## Test 4 — Filter "Chưa thu"

1. `/admin` Đơn hàng → bấm nút **"Chưa thu"** → chỉ hiện đơn tiền mặt/chuyển khoản **chưa xác nhận**.
2. Bấm lại (**✓ Chưa thu**) → tắt filter, hiện lại tất cả. **Doanh thu ở đầu trang không đổi** theo filter.

- [ ] PASS / FAIL: ................

---

## Test 5 — Doanh thu hai màn khớp nhau

1. `/admin` → **Dashboard**: ghi doanh thu hôm nay.
2. `/admin` → **Đơn hàng**: doanh thu đầu trang **phải bằng** Dashboard (cùng luật `payment_received_at`).

- [ ] PASS / FAIL: ................  Dashboard = ........ / Đơn hàng = ........

---

## Test 6 — Trạng thái bếp KHÔNG đổi khi xác nhận tiền

1. Đơn đang **"Đang làm"/"Xong"** trên bếp → chủ quán bấm "✓ Đã nhận tiền".
2. Trạng thái bếp của đơn **giữ nguyên** (thanh toán tách khỏi tiến độ bếp) — chỉ badge thanh toán đổi.

- [ ] PASS / FAIL: ................

---

## Test 7 — Regression khách tự đặt / vòng quay / voucher

1. Khách quét QR đặt + thanh toán ZaloPay/chuyển khoản → vào doanh thu như cũ (không cần nút xác nhận tay).
2. Vòng quay + voucher của khách vẫn chạy bình thường.

- [ ] PASS / FAIL: ................

---

## Sau khi PASS

Báo Claude *"SA-5 PASS"* → **hoàn tất toàn bộ luồng Staff Assisted Ordering (SA-1…SA-5)**. Bước sau
(ngoài SA): loạt PM (multi-method payment) — vá `checkout-notify` để chuyển khoản qua Zalo của khách
không bị tính tiền khi thoát app ngân hàng (spec `2026-07-15-multi-method-payment-design.md`).
