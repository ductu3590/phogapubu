# TESTING — Sprint SA-1: Database, role và RPC (spec 2026-07-15)

> Nhánh `worktree-sa1-staff-ordering`. Migration **028 ĐÃ áp prod** (2026-07-16).
> Code chưa merge vào `main` — chờ anh PASS đã.
>
> ### ⚠️ Sprint này KHÔNG có gì để bấm
> Nhân viên chưa có màn hình nào (UI `/staff` nằm ở SA-3). Đừng tìm nút mới trong `/admin`.
> SA-1 chỉ dựng **nền dữ liệu + phân quyền**, và giá trị của nó đo bằng **những việc nhân viên
> KHÔNG làm được nữa** — nên test chủ yếu là chạy SQL, không phải mở app.
>
> **Test 1 là bằng chứng chính. Test 2 là cái em lo nhất** (sợ khoá nhầm chủ quán Pubu).

---

## SA-1 đã đổi gì trên prod

| Thứ | Trước | Sau |
|---|---|---|
| Phân quyền GHI | `is_store_scoped_operator()` — **không đọc `role`** | `is_store_owner_or_admin()` — có đọc `role`, gác 11 policy / 6 bảng |
| Role cho phép | `mevo_superadmin`, `store_owner` | thêm **`store_staff`** |
| Phương thức trả tiền | `zalopay`, `cash` | thêm **`bank_transfer`** (staff-only tới hết SA-5) |
| Cột đơn hàng | — | `order_source`, `created_by`, `payment_received_at`, `payment_received_by`, `client_request_id` |
| RPC mới | — | `staff_create_order`, `confirm_manual_payment` |
| Doanh thu | ZaloPay trans_id + cash paid | thêm nhánh `payment_received_at` (cash/bank_transfer đã xác nhận) |

**Vì sao phải làm cái này trước khi có UI:** helper cũ chỉ hỏi *"có phải người của quán này
không"*, **không hỏi chức vụ**. Nên nếu thêm thẳng `store_staff` mà chưa siết, nhân viên phục vụ
sẽ có quyền ngang chủ quán ngay khi gọi thẳng Supabase (bỏ qua web app): sửa giá món, xoá bàn,
**tự tạo mã giảm giá 100% cho mình**, tự đánh dấu đã nhận tiền.

---

## Test 1 — ⭐ Script tự động (bằng chứng chính)

Mục tiêu: chứng minh 15 hành vi bảo mật + nghiệp vụ đúng, trong đó có cả những việc nhân viên
phải bị chặn.

**Cách chạy — chọn một trong hai:**

**Cách A (dễ nhất):** nhắn Claude *"chạy sa1-verify.sql giúp anh"* → Claude chạy qua Supabase MCP
và dán kết quả ra.

**Cách B (anh tự chạy):**
1. Mở https://supabase.com/dashboard → project **MEVO** → **SQL Editor** → **New query**.
2. Mở file `docs/superpowers/plans/sa1-verify.sql`, copy **toàn bộ**, dán vào ô SQL.
3. Bấm **Run**.

**Kết quả PASS:** đúng **15 dòng**, mọi dòng kết thúc bằng `: OK`, **không dòng nào chứa `SAI:`**.

```
SANITY 0 — set role co tac dung (staff=0 dong, postgres=1 dong): OK
TEST 1 — staff KHONG sua duoc gia mon (row_count=0, gia van 50000): OK
TEST 2 — staff KHONG tao duoc ma giam gia (bi chan...): OK
TEST 3 — staff KHONG tu set duoc payment_received_at (row_count=0): OK
TEST 4 — staff goi confirm_manual_payment bi tu choi...: OK
TEST 5 — owner xac nhan duoc, goi lai already=true...: OK
TEST 6 — staff_create_order bo qua item_price bia, total=100000...: OK
TEST 7 — goi 2 lan cung client_request_id: cung order_id...: OK
TEST 8 — staff quan A KHONG dat duoc vao ban quan B...: OK
TEST 9 — staff KHONG tao duoc don zalopay...: OK
TEST 9b — staff quan A KHONG doc duoc don quan B (count=0): OK
TEST 9c — staff KHONG xoa duoc ban quan minh (row_count=0...): OK
TEST 10 — don bank_transfer chua xac nhan KHONG vao doanh thu...: OK
TEST 11 — owner VAN sua duoc gia mon (row_count=1...): OK
TEST 12 — anon KHONG execute duoc staff_create_order va confirm_manual_payment: OK
```

**Để ý đặc biệt dòng `SANITY 0`.** Nó chứng minh test RLS *thật sự có tác dụng*: cùng một câu
lệnh sửa giá, tài khoản nhân viên được **0 dòng**, tài khoản quản trị được **1 dòng**. Không có
dòng này thì 12 test kia có thể "xanh giả" — vì nếu chạy nhầm quyền quản trị, mọi thứ đều thành
công và test vẫn báo PASS.

**Script tự dọn:** nó dựng quán giả / nhân viên giả rồi `rollback` — **không để lại rác** trong
DB thật. Chạy lại bao nhiêu lần cũng được.

- [ ] PASS / FAIL: ................
- Nếu FAIL: dán nguyên văn dòng `SAI:` cho Claude. **Đó là bug thật**, không phải test sai.

---

## Test 2 — ⭐ Chủ quán Pubu KHÔNG bị khoá nhầm

Mục tiêu: migration siết quyền nhân viên, nhưng **tuyệt đối không được siết nhầm chủ quán**.
Đây là rủi ro lớn nhất của sprint — nếu hỏng, anh mất quyền vào `/admin` của chính quán mình.

*(Claude đã chạy thử trên prod và thấy OK, nhưng anh phải tự bấm tay mới chắc — cái Claude test
là quyền ở tầng DB, còn anh test cả đường đi qua web app.)*

1. Đăng nhập `/admin` bằng tài khoản chủ quán **Phở Gà Pubu** thật.
2. Trang **Menu**: sửa giá một món bất kỳ → bấm Lưu → **phải lưu được**. (Sửa lại giá cũ sau khi test.)
3. Trang **Bàn**: thêm một bàn test → **phải thêm được** → xoá nó đi → **phải xoá được**.
4. Trang **Ưu đãi** (`/admin/vouchers`): tạo một mã shipper → **phải tạo được**. (Xoá sau khi test.)
5. Trang **Cửa hàng**: đổi một cấu hình bất kỳ (vd giờ phục vụ) → **phải lưu được**.

- [ ] PASS / FAIL: ................
- Nếu FAIL ở **bất kỳ bước nào**: báo Claude NGAY. Migration đã khoá nhầm chủ quán → phải sửa
  hoặc lùi migration liền, không chờ.

---

## Test 3 — Doanh thu hai màn hình khớp nhau

Mục tiêu: luật "đơn này đã có tiền chưa" trước đây bị chép ở nhiều chỗ; SA-1 gộp về một. Hai màn
hình phải ra cùng một số.

1. Mở `/admin` → **Dashboard**, ghi lại số **doanh thu hôm nay**.
2. Mở `/admin` → **Đơn hàng**, xem số doanh thu/đã thu ở đầu trang.
3. Hai số **phải khớp nhau**.

- [ ] PASS / FAIL: ................
- Ghi số nếu lệch: Dashboard = ............ / Đơn hàng = ............

---

## Test 4 — Khách vẫn đặt món bình thường (không regression)

Mục tiêu: SA-1 đụng vào bảng `orders` và luật doanh thu — phải chắc luồng khách thật không vỡ.

1. Mở mini-app quán Pubu (quét QR bàn thật).
2. Đặt một đơn **tiền mặt** → đơn vào bếp bình thường, màn bếp kêu chuông + loa đọc đơn như trước.
3. Đặt một đơn **ZaloPay/chuyển khoản** → thanh toán → đơn vào bếp bình thường.
4. Bếp bấm "Bắt đầu làm" → "Xong" → trạng thái đổi bình thường.
5. Vòng quay (nếu đang bật) vẫn quay được sau khi thanh toán.

- [ ] PASS / FAIL: ................

---

## Test 5 — (Tuỳ chọn) Tự tay thử tài khoản nhân viên

Chỉ làm nếu anh muốn **thấy tận mắt** nhân viên bị chặn, thay vì tin script. Mất khoảng 10 phút.

**Bước 1 — tạo tài khoản nhân viên thật:**
1. Supabase Dashboard → **Authentication** → **Add user** → tạo email test, vd `nhanvien-test@mevo.test`, đặt mật khẩu.
2. Copy `user id` vừa tạo.
3. SQL Editor, chạy (chỉ cần thay `<user-id>`; câu này tự tìm quán Pubu theo slug):
```sql
insert into mevo_operators (user_id, store_id, role)
select '<user-id>', id, 'store_staff' from stores where slug = 'pho-ga-pubu';

-- Kiểm đã gắn đúng chưa:
select o.role, s.name from mevo_operators o
join stores s on s.id = o.store_id
where o.user_id = '<user-id>';
```
→ phải thấy `store_staff | Phở Gà Pubu`.

**Bước 2 — thử quyền:**
4. Đăng nhập `/admin` bằng tài khoản nhân viên đó.
   → Hiện tại **chưa có gì chặn ở tầng web** (điều hướng theo role làm ở SA-2), nên có thể vào
   được `/admin`. **Đó không phải lỗi của SA-1.** Nhưng:
5. Thử **sửa giá một món** → **phải báo lỗi / không lưu được** (RLS chặn ở tầng DB).
6. Thử **tạo mã giảm giá** ở `/admin/vouchers` → **phải không tạo được**.

**Bước 3 — dọn:**
```sql
delete from mevo_operators where user_id = '<user-id>';
```
Rồi xoá user trong Authentication.

- [ ] PASS / FAIL: ................
- Ghi rõ nếu nhân viên **làm được** việc gì lẽ ra không được.

---

## Nếu phải lùi (rollback)

Migration 028 **đã ở trên prod**. Nếu test FAIL nặng và cần lùi, báo Claude — **đừng tự chạy SQL
lùi**, vì thứ tự lùi quan trọng (phải trả policy về helper cũ TRƯỚC khi xoá helper mới, và phải
chắc không còn dòng `store_staff` nào trong `mevo_operators`).

Tin tốt: migration này **cộng thêm** chứ không xoá gì (thêm cột, thêm role, đổi helper trong
policy) → lùi được, không mất dữ liệu.

---

## Sau khi PASS

Báo Claude *"SA-1 PASS"* → Claude sẽ:
1. Merge nhánh `worktree-sa1-staff-ordering` vào `main`.
2. Sang **SA-2** — tài khoản nhân viên + điều hướng theo role (chỗ chặn `/admin` ở Test 5 bước 4).

---

## Ghi chú cho SA-3 (chưa cần test bây giờ)

Sau migration này, tài khoản `store_staff` **không đọc được** bảng `vouchers` và `spin_rewards`
qua Supabase REST — vì policy hai bảng đó là `FOR ALL`, mà `FOR ALL` gồm cả quyền đọc.

Hiện **không phá gì**: mini-app khách đọc voucher qua RPC riêng, bếp có policy riêng,
`/admin/vouchers` là màn của chủ quán. Chỉ cần nhớ khi làm màn hình nhân viên ở SA-3 — nếu nó
cần hiện mã giảm giá thì phải thêm policy đọc riêng, **đừng nới `FOR ALL` trở lại**.
