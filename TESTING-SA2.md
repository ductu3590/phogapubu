# TESTING — Sprint SA-2: Auth và tài khoản staff (spec 2026-07-15 §5, §10)

> Nhánh `main`. **Migration 029 ĐÃ áp prod** (cột `mevo_operators.is_active` để bật/tắt nhân viên +
> siết RLS/RPC đọc `is_active`). Phần còn lại thuần code `admin-web`, cần **redeploy Vercel** mới thấy.
>
> ### SA-2 làm gì
> Trước SA-2: cổng login chỉ cho `mevo_superadmin` + `store_owner`; `store_staff` bị đá ra (đó là
> lý do TEST 5 của SA-1 "không đăng nhập được" — đúng lúc đó). SA-2 mở đường cho nhân viên:
> - `store_staff` đăng nhập được → vào **khu riêng `/staff`**, KHÔNG vào `/admin`/`/mevo`.
> - Chủ quán có màn **`/admin/nhân viên`** để tự tạo/vô hiệu hoá tài khoản nhân viên của quán mình.
> - "Vô hiệu hoá" = **tắt** tài khoản (không xoá) — nhân viên biến thành trạng thái "Đã tắt", mất quyền
>   ngay (cả ở tầng DB), và chủ quán **bật lại** được bất cứ lúc nào cho nhân viên làm việc tiếp.
>
> UI đặt món hộ thật (chọn bàn/món/thanh toán) **chưa có** — đó là SA-3. `/staff/order` hiện chỉ là
> màn khung xác nhận đã vào đúng khu.

---

## Test 1 — ⭐ Chủ quán KHÔNG bị ảnh hưởng (regression quan trọng nhất)

1. Đăng nhập `/admin` bằng tài khoản chủ quán **Phở Gà Pubu** → **vẫn vào thẳng `/admin`** như cũ.
2. Sidebar có thêm mục **🧑‍🍳 Nhân viên** → bấm vào mở được trang.
3. Mọi trang cũ (Menu, Bàn, Đơn hàng, Ưu đãi, Cài đặt) vẫn vào bình thường.

- [ ] PASS / FAIL: ................

---

## Test 2 — ⭐ Chủ quán tạo tài khoản nhân viên

1. Vào `/admin` → **Nhân viên** → nhập một email test (vd `nv1-pubu@mevo.test`) → **Thêm nhân viên**.
2. Phải hiện **mật khẩu tạm** (khối xanh, chỉ hiện 1 lần) → **chép lại ngay**.
3. Nhân viên vừa thêm xuất hiện trong danh sách bên dưới.

- [ ] PASS / FAIL: ................
- Mật khẩu tạm đã chép: ................

---

## Test 3 — ⭐ Nhân viên đăng nhập vào ĐÚNG khu /staff (không vào được /admin)

1. Đăng xuất. Đăng nhập `/login` bằng `nv1-pubu@mevo.test` + mật khẩu tạm ở Test 2.
   → **Phải nhảy tới `/staff/order`** (màn "Màn đặt hộ"), **KHÔNG** vào `/admin`.
2. Trong khi đang đăng nhập nhân viên, gõ thẳng URL `…/admin/menu` (hoặc `/admin`).
   → **Phải bị đẩy về `/staff/order`** (không kẹt ở màn login, không mở được trang admin).
3. Gõ thẳng `…/mevo` → cũng bị đẩy về `/staff/order`.

- [ ] PASS / FAIL: ................

---

## Test 4 — Nhân viên vẫn bị chặn ghi ở tầng DB (RLS của SA-1 còn nguyên)

Đây là kiểm lại SA-1 chưa bị SA-2 làm hỏng. Nhanh nhất: nhờ Claude *"chạy sa1-verify.sql giúp anh"*
→ vẫn phải **15 dòng `: OK`**. (SA-2 không đụng RLS nên phải giữ nguyên PASS.)

- [ ] PASS / FAIL: ................

---

## Test 5 — Chủ quán vẫn vào được /staff để hỗ trợ

1. Đăng nhập lại bằng tài khoản **chủ quán** Pubu.
2. Gõ URL `…/staff/order` → **phải vào được** (chủ quán được phép vào khu nhân viên để hỗ trợ/test).

- [ ] PASS / FAIL: ................

---

## Test 6 — ⭐ Vô hiệu hoá → không đăng nhập được, và BẬT LẠI → làm việc lại được

1. Chủ quán vào `/admin` → **Nhân viên** → bấm **Vô hiệu hoá** ở dòng `nv1-pubu@mevo.test` → xác nhận.
2. Nhân viên **vẫn còn trong danh sách** nhưng gạch ngang + nhãn **"Đã tắt"**, nút đổi thành **Bật lại**.
3. Đăng xuất, thử đăng nhập bằng `nv1-pubu@mevo.test` + mật khẩu tạm.
   → **Phải báo "Tài khoản chưa được cấp quyền vận hành"** (đã bị tắt).
4. Chủ quán vào lại **Nhân viên** → bấm **Bật lại** dòng đó.
5. Đăng nhập lại bằng chính email + mật khẩu tạm đó → **phải vào được `/staff/order`** (làm việc lại bình thường).

- [ ] PASS / FAIL: ................

---

## Test 7 — (Tuỳ chọn) Không chiếm quyền tài khoản khác

Thử thêm nhân viên bằng **email của một chủ quán đang có** (vd email chủ quán Căng tin PUBU).
→ **Phải báo lỗi "Email này đã gắn với một tài khoản khác…"**, KHÔNG được biến chủ quán đó thành
nhân viên quán mình.

- [ ] PASS / FAIL: ................

---

## Dọn sau khi test

Chủ quán bấm **Vô hiệu hoá** các email test đã tạo. Nếu muốn xoá hẳn tài khoản đăng nhập:
Supabase Dashboard → Authentication → xoá user test. (Dòng `store_staff` test cũ của SA-1 —
`nhanvien-test@mevo.test` — giờ đăng nhập được vào `/staff`; vô hiệu hoá luôn nếu không dùng.)

---

## Sau khi PASS

Báo Claude *"SA-2 PASS"* → sang **SA-3**: UI mobile-first đặt hộ (chọn bàn/món/topping, checkout
CASH/`bank_transfer`, chống double-submit).
