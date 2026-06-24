# MEVO Plan 2 — Siết bảo mật 2a + 2b (Thiết kế)

> Ngày: 2026-06-24
> Phạm vi: Task 2a (operator allowlist cho admin) + 2b (khoá anon UPDATE orders + token bếp theo quán).
> Quyết định nền: **giữ 1 Supabase chung, phân tách theo `store_id` bằng RLS** (xác nhận lại 2026-06-24, hợp với quyết định 2026-06-22 trong CLAUDE.md). Bỏ phương án mỗi quán 1 database riêng.

---

## 1. Mục tiêu & bối cảnh

Plan 1 đã đóng các lỗ liên quan toàn vẹn đơn (RPC `create_order` server-side, chặn anon set `confirmed`, chặn anon insert trực tiếp). Plan 2 đóng nốt 2 lỗ còn lại:

- **2a** — Hiện *bất kỳ ai đăng nhập Supabase Auth* đều là super-admin: RLS role `authenticated` đang `USING(true)`, và `proxy.ts`/`admin/layout.tsx` chỉ kiểm tra "đã đăng nhập". ⇒ Cần allowlist: chỉ operator của MEVO mới vào được admin.
- **2b** — `anon key` là **public** (nằm trong bundle mini-app, ai cũng moi được). RLS orders đang cho anon SELECT/UPDATE `USING(true)` ⇒ cầm anon key có thể đọc/sửa đơn **mọi quán** bằng cách đổi `store_id`. URL `/kitchen/[slug]` chỉ là quy ước hiển thị, **không khoá**. ⇒ Cần: khoá anon UPDATE orders, và cấp cho bếp một danh tính scope đúng 1 quán mà vẫn giữ realtime.

### Non-goals (ngoài phạm vi lần này)
- **2c** (scope quyền đọc order-status của khách): **hoãn**. Anon SELECT orders giữ `USING(true)`. Lý do: anon + realtime khó scope theo từng khách; `order.id` là UUID khó đoán nên rủi ro thực tế thấp.
- Per-store database: **đã bác**.
- Admin tự phục vụ cho quán (login/phân quyền cho chủ quán): vẫn hoãn (v1 MEVO vận hành).

---

## 2. Mô hình mối đe doạ (tóm tắt)

| Tác nhân | Có gì trong tay | Lỗ hiện tại | Sau Plan 2 |
|---|---|---|---|
| Người lạ lập tài khoản Supabase Auth | session `authenticated` | Vào admin = super-admin | Bị chặn (không có trong `mevo_operators`) |
| Người moi `anon key` từ bundle mini-app | anon key (public) | Đọc/sửa đơn **mọi quán** | Không UPDATE được; đọc vẫn được (2c hoãn) |
| Tablet bếp quán A | token bếp quán A | (chưa có khái niệm token) | Chỉ đọc/sửa đơn quán A; realtime cũng chỉ quán A |

---

## 3. Task 2a — Operator allowlist

### 3.1 Bảng `mevo_operators` (nguồn sự thật)
```sql
create table mevo_operators (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  store_id   uuid references stores(id) on delete cascade,  -- NULL = super (mọi quán); v1 MEVO = NULL
  created_at timestamptz default now()
);
alter table mevo_operators enable row level security;
-- Operator đọc được dòng của chính mình (để app biết store_id); ghi chỉ qua service_role.
create policy "operator_read_self" on mevo_operators
  for select to authenticated using (user_id = auth.uid());
```

### 3.2 Helper
```sql
create or replace function is_operator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from mevo_operators where user_id = auth.uid());
$$;
```

### 3.3 Viết lại RLS role `authenticated`
Đổi mọi policy `authenticated` từ `USING(true)` / `WITH CHECK(true)` sang `USING(is_operator())` / `WITH CHECK(is_operator())`. Áp cho: `stores`, `tables`, `menu_categories`, `menu_items`, `orders` (các policy `auth_*` trong migration 002). Một `authenticated` user không nằm trong allowlist sẽ không đọc/ghi được gì.

> v1: operator của MEVO là super (`store_id = NULL`) nên vẫn thấy mọi quán — giữ nguyên hành vi admin tập trung hiện tại. Scope admin theo từng quán để dành cho sau (không làm bây giờ — YAGNI).

### 3.4 Cổng ứng dụng (admin-web)
- `proxy.ts`: sau `getUser()`, nếu là route `/admin` và user **không** phải operator → redirect `/login?error=not_operator`. Kiểm tra bằng query `mevo_operators` (anon client + cookie session vẫn đọc được dòng self qua policy `operator_read_self`).
- `app/admin/layout.tsx`: kiểm tra tương tự (defense-in-depth) — không phải operator → `signOut()` + redirect `/login`.
- `app/(auth)/login/page.tsx`: hiển thị thông báo khi `error=not_operator` ("Tài khoản chưa được cấp quyền vận hành").

### 3.5 Seed operator hiện tại
Cung cấp SQL để anh Tú chạy 1 lần (tra theo email tài khoản admin đang dùng):
```sql
insert into mevo_operators (user_id, store_id)
select id, null from auth.users where email = '<email-admin-cua-anh>'
on conflict (user_id) do nothing;
```

---

## 4. Task 2b — Token bếp theo quán + khoá anon UPDATE

### 4.1 Role Postgres riêng `kitchen`
**Không** dùng lại role `authenticated` (nếu dùng lại, token bếp sẽ trúng policy admin → thành toàn quyền). Tạo role riêng, quyền tối thiểu:
```sql
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'kitchen') then
    create role kitchen nologin;
  end if;
end $$;
grant kitchen to authenticator;            -- cho PostgREST/Realtime SET ROLE
grant usage on schema public to kitchen;
grant select on stores, tables, orders, order_items to kitchen;
grant update on orders to kitchen;
```

### 4.2 Cột version để thu hồi
```sql
alter table stores add column if not exists kitchen_token_version int not null default 1;
```
Token mang claim `kv`. Thu hồi 1 quán = `kitchen_token_version = kitchen_token_version + 1` (token cũ hết hiệu lực ngay), không ảnh hưởng quán khác.

### 4.3 Helper lấy store của token bếp (kèm kiểm tra version)
```sql
create or replace function kitchen_store_id() returns uuid
language sql stable security definer set search_path = public as $$
  select s.id from stores s
  where s.id = (auth.jwt() ->> 'store_id')::uuid
    and s.kitchen_token_version = (auth.jwt() ->> 'kv')::int;
$$;
```
Token bị thu hồi (version lệch) ⇒ trả NULL ⇒ không thấy/sửa được gì.

### 4.4 RLS cho role `kitchen`
```sql
create policy "kitchen_read_own_store"   on stores      for select to kitchen using (id = kitchen_store_id());
create policy "kitchen_read_own_tables"  on tables      for select to kitchen using (store_id = kitchen_store_id());
create policy "kitchen_read_own_orders"  on orders      for select to kitchen using (store_id = kitchen_store_id());
create policy "kitchen_update_orders"    on orders      for update to kitchen
  using (store_id = kitchen_store_id())
  with check (store_id = kitchen_store_id() and status <> 'confirmed');  -- bếp không tự xác nhận thanh toán
create policy "kitchen_read_own_items"   on order_items for select to kitchen
  using (exists (select 1 from orders o where o.id = order_items.order_id and o.store_id = kitchen_store_id()));
```

### 4.5 Khoá anon UPDATE
```sql
drop policy if exists "public_update_orders" on orders;
```
Sau bước này anon **không** UPDATE orders được nữa.

### 4.6 RPC thay cho anon UPDATE (mini-app huỷ đơn)
Mini-app `cancelOrder` hiện UPDATE trực tiếp → thay bằng RPC SECURITY DEFINER, chỉ huỷ đơn `pending`:
```sql
create or replace function cancel_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update orders set status = 'cancelled'
  where id = p_order_id and status = 'pending';
end $$;
revoke all on function cancel_order(uuid) from public;
grant execute on function cancel_order(uuid) to anon;
```

### 4.7 admin-web — sinh & thu hồi token bếp
- Thêm dependency `jose` (ký/verify JWT, chạy được cả Node lẫn Edge).
- `lib/kitchen-token.ts` (server-only): ký HS256 bằng `process.env.SUPABASE_JWT_SECRET`. Claims:
  ```json
  { "role": "kitchen", "store_id": "<uuid>", "kv": <version>, "iat": <now>, "exp": <now + ~1 năm> }
  ```
- Server actions (gated bởi operator, dùng `createAdminClient()` service_role để đọc store + version):
  - `generateKitchenLink(storeId)` → trả URL `'/kitchen/<slug>?k=<token>'`.
  - `revokeKitchenToken(storeId)` → `kitchen_token_version += 1` rồi cấp token mới.
- UI tối thiểu: một mục trong `/admin/tables` (hoặc trang `/admin/kitchen` nhỏ) — nút **"Lấy link bếp"** (copy) + **"Thu hồi & cấp lại"**. Đủ cho v1.

### 4.8 kitchen-display.tsx — dùng token
- Đọc `?k=<token>` từ URL; nếu có thì lưu `localStorage['mevo_kitchen_token_<slug>']` và xoá query khỏi URL (đỡ lộ khi screenshot). Lần sau mở không cần query.
- Tạo Supabase client gắn token:
  ```ts
  createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    accessToken: async () => token,   // supabase-js v2: ép token cho REST
  })
  // realtime: supabase.realtime.setAuth(token) trước khi subscribe
  ```
- Không có token (chưa setup) → màn hình "Chưa cấu hình bếp — liên hệ MEVO để lấy link".
- Bỏ filter `store_id` dựa trên slug như "khoá" — giờ RLS mới là lớp khoá thật; filter giữ lại chỉ để truy vấn gọn.

### 4.9 mini-app — đổi cancelOrder
`mini-app/src/services/order/order.api.ts`: `cancelOrder` gọi `supabase.rpc('cancel_order', { p_order_id })` thay cho `.from('orders').update(...)`. Cập nhật `database.types.ts` (mini-app) thêm function `cancel_order`.

---

## 5. Realtime
- **Trang trạng thái đơn của khách** (mini-app): vẫn anon SELECT orders `USING(true)` → realtime khách giữ nguyên (2c hoãn).
- **Bếp**: realtime chạy dưới role `kitchen` + `kitchen_store_id()` → chỉ nhận sự kiện đơn của đúng quán. Đây là phần thay thế cho "lọc theo slug" trước đây (vốn không an toàn).

---

## 6. Danh sách migration (đề xuất)
- `006_operator_table.sql` — bảng `mevo_operators`, hàm `is_operator()`, policy `operator_read_self`. **Chưa** đụng RLS `authenticated` (admin vẫn chạy bình thường) → để có cửa sổ seed tài khoản trước, tránh tự khoá mình ra ngoài.
- `006b_tighten_admin_rls.sql` — viết lại các policy `authenticated` từ `USING(true)` → `USING(is_operator())`. **Chỉ apply sau khi đã seed `mevo_operators` cho tài khoản admin và xác nhận đăng nhập OK.**
- `007_kitchen_role_token.sql` — role `kitchen` + grants, `stores.kitchen_token_version`, `kitchen_store_id()`, RLS `kitchen`, drop `public_update_orders`, RPC `cancel_order`.

Tách file để 2a/2b kiểm thử độc lập, rollback dễ, và loại bỏ rủi ro tự khoá khi siết RLS admin.

---

## 7. Điều kiện tiên quyết
1. **`SUPABASE_JWT_SECRET`** (Supabase Dashboard → Settings → API → JWT Secret) đặt vào env admin-web (server-only, **không** `NEXT_PUBLIC_`). Phải xác nhận project vẫn nhận token HS256 tự ký (nếu project đã bật signing keys bất đối xứng, cần dùng đúng khoá tương ứng).
2. Cài `jose` trong admin-web.
3. Biết email tài khoản admin hiện tại để seed `mevo_operators`.

---

## 8. Rủi ro & điểm cần test kỹ (checkpoint TESTING.md)
- **Role `kitchen` tự tạo + Realtime** là phần rủi ro nhất: phải kiểm thực tế rằng (a) token bếp đọc/cập nhật được đơn đúng quán, (b) **không** đọc được quán khác, (c) realtime "ding" đơn mới đúng quán, (d) thu hồi version làm token cũ chết ngay.
- **Khoá anon UPDATE** không được làm hỏng: mini-app huỷ đơn (qua RPC mới), luồng ZaloPay→tiền mặt (`abandon_zalopay_to_cash`), xác nhận thanh toán (service_role edge function).
- **Cổng operator** không khoá nhầm tài khoản hợp lệ; tài khoản ngoài allowlist bị chặn.

---

## 9. Thứ tự rollout (quan trọng)
1. Apply `006_operator_table.sql` (chưa siết RLS admin → admin vẫn chạy).
2. **Seed `mevo_operators`** cho tài khoản admin, đăng nhập thử để chắc chắn còn vào được.
3. Apply `006b_tighten_admin_rls.sql` → kiểm tra: operator vào được, tài khoản ngoài allowlist bị chặn. (Nếu lỡ khoá nhầm: rollback `006b` hoặc thêm dòng vào `mevo_operators` bằng service_role.)
4. Apply `007_kitchen_role_token.sql`.
5. Deploy **đồng thời**: admin-web (token minter + kitchen-display dùng token) **và** mini-app (cancel_order). Nếu `007` lên mà kitchen-display chưa kịp dùng token → bếp mất quyền UPDATE giữa chừng.
6. MEVO sinh link bếp cho từng quán pilot, setup lại tablet.

---

## 10. Tuân thủ quy tắc test (CLAUDE.md)
Sau khi code xong **mỗi** task (2a, rồi 2b), DỪNG và báo anh Tú test theo checklist tương ứng trong TESTING.md trước khi tiếp tục. Không tự động chuyển task.
