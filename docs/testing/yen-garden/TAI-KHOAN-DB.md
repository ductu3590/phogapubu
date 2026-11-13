# Yên Garden — DB chặn người chưa đổi mật khẩu lần đầu (mig 137)

Ngày làm: 2026-11-13. Nhánh `claude/sleepy-hertz-e2461e`, cắt từ `claude/yg-accounts-force-password-8d711a`
(chứa luôn phần [TAI-KHOAN.md](TAI-KHOAN.md)). Chưa merge, chưa push.

## Đã làm gì

Trước đây cờ `app_metadata.must_change_password` chỉ chặn ở admin-web (proxy + `requireOperator`). Người còn cờ vẫn
gọi thẳng Supabase bằng JWT của mình (đọc bảng, RPC, Realtime), ví dụ các lượt đọc POS trong
`lib/pos-browser-reads.ts`, và lách được cổng.

- **Mig 137** (`supabase/migrations/137_db_must_change_password.sql`): hàm nội bộ `operator_password_ok()` đọc cờ từ
  JWT. Vá tại chỗ 14 hàm: 7 helper quyền (`is_store_scoped_operator`, `is_store_owner_or_admin`,
  `is_store_pos_operator`, `is_store_back_office`, `is_store_owner_of`, `reservation_operator_actor_kind`,
  `get_print_mode`) và 7 RPC tự đọc thẳng `mevo_operators` (cấu hình quy trình, sơ đồ POS, thu hồi quyền khách đặt
  bàn, gửi lại thông báo đặt bàn, đặt món hộ). Hai policy cấu hình quy trình chuyển sang `is_store_owner_or_admin`
  (cùng nghĩa). Khoảng 50 RPC còn lại và mọi policy RLS đều đi qua các helper này.
- **Không chặn**: người còn cờ vẫn đọc được dòng `mevo_operators` của chính mình (trang đổi mật khẩu cần dòng này).
  Bếp, phần mềm in và khách Mini App không mang cờ nên không bị ảnh hưởng.
- **Đổi mật khẩu xong dùng được ngay**: JWT đang cầm vẫn mang cờ cũ tới lần làm mới kế tiếp (tối đa 1 giờ). Vì vậy
  `changeInitialPassword` gọi `refreshSession()` ngay sau khi gỡ cờ. Nếu làm mới phiên lỗi, màn hình báo
  "Đã đổi mật khẩu. Bấm Đăng xuất rồi đăng nhập lại…".

Claude đã kiểm:

- Test PGlite `supabase/tests/137_db_must_change_password.test.mjs`: 9/9.
- Unit test admin-web `app/(auth)` + `lib/auth`: 81/81.
- Chạy thử mig 137 trên prod trong một giao dịch tự huỷ: đủ 14 neo khớp, chủ quán Bảo Lương không cờ dùng bình
  thường, cùng người đó mang cờ thì mọi helper trả false, RPC bị từ chối, đọc bàn / đơn / cấu hình ra 0 dòng. Sau
  đó prod không đổi gì.
- `npm run test:race` (Postgres thật, nạp toàn bộ migration): xem kết quả ở cuối file.

## Mig 137 đã áp prod (2026-11-13)

Áp nguyên văn file, đã kiểm ngay sau khi áp: 14 hàm mang dấu `mig 137`, hai policy cấu hình quy trình là
`is_store_owner_or_admin(store_id)`, `authenticated` không gọi thẳng được `operator_password_ok()`. Chủ quán Bảo Lương
(token không cờ) vẫn có quyền POS và đọc được sơ đồ. Thu ngân Yên Garden (cờ `true`) mất quyền, sơ đồ báo "Chỉ chủ
quán được xem sơ đồ POS".

⚠️ `mevo.vn` vẫn chạy bản `main`, chưa có màn Đổi mật khẩu. Tài khoản Yên Garden còn cờ mà vào `mevo.vn` sẽ thấy POS
trống / "không có quyền" và không tự gỡ cờ được, cho tới khi nhánh được merge và deploy. Muốn dùng một tài khoản Yên
Garden trên `mevo.vn` trước lúc đó thì đổi mật khẩu của nó ở bản chạy local trước. Bảo Lương và superadmin không có cờ.

## Cách chạy

```bash
cd admin-web && npm run dev
```

Mở `http://localhost:3000/login` bằng cửa sổ ẩn danh, **mỗi lần một tài khoản**.

## Test 1. Đổi mật khẩu xong dùng được ngay, không phải đăng nhập lại

Đây là bài chính. Nếu thiếu bước làm mới phiên thì POS sẽ trống tới một giờ.

1. Đăng nhập **yg-pos** (thu ngân, còn cờ) bằng mật khẩu ban đầu → sang màn Đổi mật khẩu.
2. Đổi mật khẩu → vào `/admin/pos`.
3. Sơ đồ bàn Yên Garden hiện đủ bàn, **không** báo "Chỉ chủ quán được xem sơ đồ POS", không trống.
4. Chờ khoảng 30 giây (POS tự đọc lại định kỳ) rồi bấm F5: vẫn đủ bàn, không lỗi.
5. Mở một bàn và thêm một món: được.
6. Làm lại bước 1–3 với **yg-nv1** (phục vụ) → `/staff/order` hiện danh sách bàn và menu, đặt hộ một món được.

| Tài khoản | Bước 3 | Bước 4 | Bước 5 / 6 |
|---|---|---|---|
| yg-pos | | | |
| yg-nv1 | | | |

## Test 2. Người còn cờ gọi thẳng Supabase bị từ chối

Dùng một tài khoản **còn cờ, chưa đổi**, ví dụ **yg-quanly**.

1. Đăng nhập yg-quanly ở localhost → dừng ở màn Đổi mật khẩu, **đừng đổi**.
2. Mở DevTools (F12) → tab Console. Dán đoạn dưới, thay `ANON_KEY` bằng giá trị
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` trong `admin-web/.env.local`, rồi Enter:

```js
const ANON_KEY = 'dán-anon-key-vào-đây'
const URL_ = 'https://dlkgdpexjtyynbotkwka.supabase.co'
const raw = document.cookie.split('; ').filter((c) => c.startsWith('sb-dlkgdpexjtyynbotkwka-auth-token'))
  .sort().map((c) => c.slice(c.indexOf('=') + 1)).join('')
const b64 = decodeURIComponent(raw).replace(/^base64-/, '').replace(/-/g, '+').replace(/_/g, '/')
const token = JSON.parse(atob(b64)).access_token
const h = { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
console.log('co trong JWT:', JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).app_metadata)
console.log('ban:', await (await fetch(`${URL_}/rest/v1/tables?select=id`, { headers: h })).json())
console.log('don:', await (await fetch(`${URL_}/rest/v1/orders?select=id&limit=5`, { headers: h })).json())
console.log('so do:', await (await fetch(`${URL_}/rest/v1/rpc/pos_get_floor_layout`, { method: 'POST', headers: h, body: '{}' })).json())
console.log('cua minh:', await (await fetch(`${URL_}/rest/v1/mevo_operators?select=role`, { headers: h })).json())
```

Kết quả đúng:

| Dòng | Phải thấy |
|---|---|
| `co trong JWT` | có `must_change_password: true` |
| `ban` | `[]` |
| `don` | `[]` |
| `so do` | lỗi có câu "Chỉ chủ quán được xem sơ đồ POS" |
| `cua minh` | `[{ role: "store_manager" }]` (dòng của chính mình vẫn đọc được) |

3. Bấm **Đăng xuất** ở màn Đổi mật khẩu.

> Nếu dòng đầu báo lỗi đọc cookie (trình duyệt đổi định dạng), bỏ qua Test 2 và báo Claude: Claude tự chạy lại bài
> này bằng phiên tạo từ service key.

## Test 3. Bảo Lương và superadmin không bị ảnh hưởng

Helper quyền dùng chung cho mọi quán, nên phải kiểm lại quán đang chạy.

1. Trên **mevo.vn**, đăng nhập tài khoản chủ quán hoặc thu ngân **Bảo Lương**: POS hiện đủ bàn, duyệt đơn / thêm
   món / thu tiền một bàn thử được như thường.
2. Nhân viên phục vụ Bảo Lương mở `/staff/order`: thấy bàn, đặt hộ được.
3. Superadmin vào `/mevo`: danh sách quán, cấu hình quy trình của một quán mở được.
4. Chủ quán Bảo Lương mở hộp thoại **Cấu hình** → phần quy trình đọc và lưu được.

## Test 4. Đặt lại mật khẩu thì DB chặn lại

1. Superadmin đặt lại mật khẩu cho **yg-pos** ở `/mevo/accounts` (sau Test 1).
2. Đăng nhập yg-pos bằng mật khẩu vừa đặt ở localhost → sang màn Đổi mật khẩu. Làm lại Test 2 với yg-pos: `ban` và
   `don` ra `[]`.
3. Đổi mật khẩu → POS hiện đủ bàn ngay (như Test 1).

## Kiểm bằng SQL (tuỳ chọn)

Cờ hiện tại của 5 tài khoản Yên Garden:

```sql
select u.email, o.role, u.raw_app_meta_data->>'must_change_password' as phai_doi
from auth.users u join mevo_operators o on o.user_id = u.id
where o.store_id = 'e1847559-f1c3-4778-acfd-2f1ec6347af7'
order by o.role, u.email;
```

Mig 137 đã áp đủ chưa (phải ra 14):

```sql
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosrc like '%mig 137%';
```

## Kết quả test race

2026-11-13, `cd admin-web && npm run test:race` (ảnh `supabase/postgres:17.11.0.004`, nạp toàn bộ migration tới 137):
**40/40 xanh**, 25 vòng. Lần chạy đầu bắt được lỗi `auth.jwt() does not exist` (ảnh Postgres trần không có hàm do
GoTrue tạo) → `operator_password_ok()` đọc thẳng `request.jwt.claims` như thân `auth.jwt()`.
