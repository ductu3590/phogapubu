# MEVO Plan 2 — Siết bảo mật 2a + 2b (Thiết kế)

> Ngày: 2026-06-24 (đã sửa theo review vòng 1: P0 PUBLIC-policy leak, P1 update-scope, P1 cancel capability, P1 rollout race, P2 fail-closed)
> Phạm vi: Task 2a (operator allowlist cho admin) + 2b (khoá anon UPDATE orders + token bếp theo quán).
> Quyết định nền: **giữ 1 Supabase chung, phân tách theo `store_id` bằng RLS** (xác nhận lại 2026-06-24, hợp với quyết định 2026-06-22 trong CLAUDE.md). Bỏ phương án mỗi quán 1 database riêng.

---

## 1. Mục tiêu & bối cảnh

Plan 1 đã đóng các lỗ về toàn vẹn đơn (RPC `create_order` server-side, chặn anon set `confirmed`, chặn anon insert trực tiếp). Plan 2 đóng nốt 2 lỗ còn lại:

- **2a** — Hiện *bất kỳ ai đăng nhập Supabase Auth* đều là super-admin: RLS role `authenticated` đang `USING(true)`, và `proxy.ts`/`admin/layout.tsx` chỉ kiểm tra "đã đăng nhập". ⇒ Cần allowlist: chỉ operator của MEVO mới vào được admin.
- **2b** — `anon key` là **public** (nằm trong bundle mini-app, ai cũng moi được). RLS orders đang cho anon/PUBLIC SELECT & UPDATE `USING(true)` ⇒ cầm anon key có thể đọc/sửa đơn **mọi quán** bằng cách đổi `store_id`. URL `/kitchen/[slug]` chỉ là quy ước hiển thị, **không khoá**. ⇒ Cần: khoá anon UPDATE orders, và cấp cho bếp một danh tính scope đúng 1 quán mà vẫn giữ realtime.

### Non-goals
- **2c** (scope quyền đọc order-status của khách): **hoãn**. Anon SELECT orders giữ `USING(true)` (giới hạn `TO anon`). Lý do: anon + realtime khó scope theo từng khách; `order.id` là UUID khó đoán.
- Per-store database: **đã bác**.
- Admin tự phục vụ cho quán: hoãn (v1 MEVO vận hành).

---

## 2. Nguyên tắc RLS cốt lõi (gốc rễ của P0)

**Trong Postgres, policy KHÔNG ghi `TO <role>` mặc định là `PUBLIC` → áp cho MỌI role, kể cả role `kitchen` mới.** Nhiều permissive policy cùng command/role được gộp bằng **OR**. Vì vậy một policy `USING(true)` kiểu PUBLIC sẽ **thắng** mọi policy scoped mình thêm cho `kitchen`.

⇒ Quy tắc bắt buộc cho Plan 2: **mọi policy `public_*` phải được giới hạn `TO anon`** (đối tượng thật của chúng là khách dùng anon). Sau đó mỗi role khác (`authenticated`/operator, `kitchen`) có policy riêng của nó. Không để policy nào "rộng" rò sang role khác.

Ma trận quyền mục tiêu (SELECT/ghi) sau Plan 2:

| Bảng | anon (khách) | authenticated (operator) | kitchen (token bếp) |
|---|---|---|---|
| stores | SELECT is_active (TO anon) | SELECT is_operator() | SELECT đúng store của token |
| tables | SELECT is_active (TO anon) | full is_operator() | SELECT đúng store |
| menu_categories | SELECT is_active (TO anon) | full is_operator() | — (không cần) |
| menu_items | SELECT (TO anon) | full is_operator() | — (không cần) |
| orders | SELECT (TO anon, 2c hoãn) · INSERT/UPDATE qua RPC | SELECT + UPDATE is_operator() | SELECT đúng store · đổi status qua RPC |
| order_items | SELECT (TO anon) | SELECT is_operator() | SELECT đơn của store |

> Lưu ý: admin hiện đọc `orders`/`order_items` **chỉ nhờ** policy PUBLIC `public_read_*`. Khi siết các policy này về `TO anon`, **phải thêm** policy đọc cho `authenticated` (operator), nếu không admin mất quyền đọc đơn.

---

## 3. Task 2a — Operator allowlist

### 3.1 Bảng `mevo_operators`
```sql
create table mevo_operators (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  store_id   uuid references stores(id) on delete cascade,  -- NULL = super (mọi quán); v1 MEVO = NULL
  created_at timestamptz default now()
);
alter table mevo_operators enable row level security;
create policy "operator_read_self" on mevo_operators
  for select to authenticated using (user_id = auth.uid());  -- app đọc dòng của chính mình
```

### 3.2 Helper
```sql
create or replace function is_operator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from mevo_operators where user_id = auth.uid());
$$;
```

### 3.3 Siết RLS role `authenticated` + thêm policy đọc còn thiếu
- Viết lại các policy `auth_*` (migration 002) từ `USING(true)`/`WITH CHECK(true)` → `USING(is_operator())`/`WITH CHECK(is_operator())`. Áp cho `stores`, `tables`, `menu_categories`, `menu_items`, `orders` (update).
- **Thêm mới** (vì sẽ siết public read về `TO anon` ở mục 4):
```sql
create policy "auth_read_orders"      on orders      for select to authenticated using (is_operator());
create policy "auth_read_order_items" on order_items for select to authenticated using (is_operator());
```
⇒ `authenticated` không nằm trong allowlist → không đọc/ghi được gì.

> v1: operator MEVO là super (`store_id = NULL`) nên vẫn thấy mọi quán — giữ hành vi admin tập trung. Scope admin theo từng quán để dành sau (YAGNI).

### 3.4 Cổng ứng dụng (admin-web)
- `proxy.ts`: route `/admin` mà user **không** là operator → redirect `/login?error=not_operator` (query `mevo_operators` qua policy `operator_read_self`).
- `app/admin/layout.tsx`: kiểm tra tương tự (defense-in-depth) → không phải operator thì `signOut()` + redirect.
- `login/page.tsx`: hiện thông báo khi `error=not_operator`.

### 3.5 Seed operator hiện tại (chạy tay 1 lần, trước khi siết RLS)
```sql
insert into mevo_operators (user_id, store_id)
select id, null from auth.users where email = '<email-admin-cua-anh>'
on conflict (user_id) do nothing;
```

---

## 4. Task 2b — Token bếp theo quán + khoá anon UPDATE

### 4.1 Role Postgres riêng `kitchen` (chỉ đọc + execute RPC)
**Không** dùng lại `authenticated`. Role chỉ có **SELECT** (không GRANT UPDATE — mọi ghi đi qua RPC để không sửa được cột nhạy cảm như `total_amount`, `payment_method`, `table_id`):
```sql
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'kitchen') then
    create role kitchen nologin;
  end if;
end $$;
grant kitchen to authenticator;            -- để PostgREST/Realtime SET ROLE
grant usage on schema public to kitchen;
grant select on stores, tables, orders, order_items to kitchen;
-- KHÔNG grant update on orders; bếp đổi status qua kitchen_set_status()
```

### 4.2 Cột version để thu hồi token
```sql
alter table stores add column if not exists kitchen_token_version int not null default 1;
```
Thu hồi 1 quán = `kitchen_token_version += 1` (token cũ chết ngay), không ảnh hưởng quán khác.

### 4.3 Helper lấy store của token bếp — **fail-closed** (P2)
Bọc plpgsql, bắt lỗi cast (claim thiếu/sai kiểu → trả NULL thay vì throw làm hỏng cả query):
```sql
create or replace function kitchen_store_id() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_store uuid; v_kv int;
begin
  begin
    v_store := (auth.jwt() ->> 'store_id')::uuid;
    v_kv    := (auth.jwt() ->> 'kv')::int;
  exception when others then
    return null;                  -- fail-closed
  end;
  return (select s.id from stores s
          where s.id = v_store and s.kitchen_token_version = v_kv);
end $$;
```

### 4.4 Siết public read → `TO anon` + policy đọc cho `kitchen` (P0)
```sql
-- 1) Gỡ các policy PUBLIC, dựng lại CHỈ cho anon (để không rò sang role kitchen)
drop policy if exists "public_read_orders"      on orders;
drop policy if exists "public_read_order_items" on order_items;
drop policy if exists "public_read_stores"      on stores;
drop policy if exists "public_read_tables"      on tables;
drop policy if exists "public_read_categories"  on menu_categories;
drop policy if exists "public_read_items"       on menu_items;

create policy "anon_read_orders"      on orders          for select to anon using (true);       -- 2c hoãn
create policy "anon_read_order_items" on order_items     for select to anon using (true);
create policy "anon_read_stores"      on stores          for select to anon using (is_active);
create policy "anon_read_tables"      on tables          for select to anon using (is_active);
create policy "anon_read_categories"  on menu_categories for select to anon using (is_active);
create policy "anon_read_items"       on menu_items      for select to anon using (true);

-- 2) Policy đọc cho kitchen — chỉ đúng store của token
create policy "kitchen_read_stores" on stores      for select to kitchen using (id = kitchen_store_id());
create policy "kitchen_read_tables" on tables      for select to kitchen using (store_id = kitchen_store_id());
create policy "kitchen_read_orders" on orders      for select to kitchen using (store_id = kitchen_store_id());
create policy "kitchen_read_items"  on order_items for select to kitchen
  using (exists (select 1 from orders o where o.id = order_items.order_id and o.store_id = kitchen_store_id()));
```
(`auth_read_orders`/`auth_read_order_items` cho operator đã thêm ở 3.3.)

### 4.5 Bếp đổi trạng thái qua RPC (state machine) — thay GRANT UPDATE (P1)
```sql
create or replace function kitchen_set_status(p_order_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_store uuid; v_current text;
begin
  v_store := kitchen_store_id();                 -- từ JWT, fail-closed
  if v_store is null then raise exception 'Token bếp không hợp lệ'; end if;
  if p_status not in ('cooking','ready') then
    raise exception 'Trạng thái không hợp lệ cho bếp: %', p_status;
  end if;
  select status into v_current from orders where id = p_order_id and store_id = v_store;
  if not found then raise exception 'Đơn không thuộc quán'; end if;
  -- Chỉ cho phép tiến theo state machine
  if not ( (p_status='cooking' and v_current in ('confirmed','pending'))
        or (p_status='ready'   and v_current='cooking') ) then
    raise exception 'Chuyển trạng thái không hợp lệ: % -> %', v_current, p_status;
  end if;
  update orders set status = p_status where id = p_order_id and store_id = v_store;
end $$;
revoke all on function kitchen_set_status(uuid, text) from public;
grant execute on function kitchen_set_status(uuid, text) to kitchen;
```
Bếp **không** set được `paid`/`cancelled`/`confirmed`, **không** sửa được cột tiền/bàn.

### 4.6 Khoá anon UPDATE — tách riêng để zero-downtime (P1 rollout)
`public_update_orders` (PUBLIC, từ 002_tighten) là cái anon-kitchen cũ đang dùng để ghi. **Chỉ drop SAU khi** client mới (bếp dùng token+RPC, mini-app dùng RPC) đã deploy và tablet đã nạp token:
```sql
-- migration 007b, chạy ở bước rollout cuối
drop policy if exists "public_update_orders" on orders;
```

### 4.7 RPC huỷ đơn có capability guard (P1)
`capability_token` đã có sẵn (003) và nằm trong row trả về của `create_order`. Bắt buộc khớp token để anon không huỷ đơn người khác chỉ bằng UUID:
```sql
create or replace function cancel_order(p_order_id uuid, p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update orders set status = 'cancelled'
  where id = p_order_id and status = 'pending' and capability_token = p_token;
end $$;
revoke all on function cancel_order(uuid, text) from public;
grant execute on function cancel_order(uuid, text) to anon;
```
> Hardening kèm theo (cùng class lỗ): `abandon_zalopay_to_cash(p_order_id)` cũng là write-primitive công khai chỉ dựa UUID. Bổ sung tham số `p_token` và check `capability_token = p_token` tương tự. Mini-app đã có order id; chỉ cần truyền thêm token (xem 4.10).

### 4.8 admin-web — sinh & thu hồi token bếp
- Thêm dependency `jose`.
- `lib/kitchen-token.ts` (server-only): ký HS256 bằng `process.env.SUPABASE_JWT_SECRET`. Claims: `{ role:'kitchen', store_id, kv:<version>, iat, exp:<+~1 năm> }`.
- Server actions (gated operator, dùng `createAdminClient()` service_role đọc store+version):
  - `generateKitchenLink(storeId)` → `'/kitchen/<slug>?k=<token>'`
  - `revokeKitchenToken(storeId)` → `kitchen_token_version += 1` rồi cấp token mới.
- UI tối thiểu trong `/admin/tables` (hoặc `/admin/kitchen`): nút **"Lấy link bếp"** (copy) + **"Thu hồi & cấp lại"**.

### 4.9 kitchen-display.tsx — dùng token
- Đọc `?k=<token>` → lưu `localStorage['mevo_kitchen_token_<slug>']`, xoá query khỏi URL. Lần sau không cần query.
- Tạo Supabase client gắn token: `global.headers.Authorization = Bearer <token>`, `accessToken: async () => token`, và `supabase.realtime.setAuth(token)` trước khi subscribe.
- Đổi `updateStatus` từ `.from('orders').update(...)` → `supabase.rpc('kitchen_set_status', { p_order_id, p_status })`.
- Không có token → màn hình "Chưa cấu hình bếp — liên hệ MEVO".

### 4.10 mini-app — đổi RPC ghi
- `cancelOrder` → `rpc('cancel_order', { p_order_id, p_token })`. Cần thread `capability_token` từ kết quả `create_order` (map vào `Order`, lưu cùng đơn). Cập nhật `database.types.ts` (mini-app) signature mới.
- `abandonToCash` → truyền thêm `p_token` (theo hardening 4.7).

---

## 5. Realtime
- **Khách (order-status)**: anon SELECT orders (`TO anon` USING(true)) → realtime khách giữ nguyên (2c hoãn).
- **Bếp**: realtime dưới role `kitchen` + `kitchen_store_id()` → chỉ nhận đơn đúng quán. Thay cho "lọc theo slug" cũ (không an toàn).

---

## 6. Danh sách migration
- `006_operator_table.sql` — `mevo_operators`, `is_operator()`, `operator_read_self`. (Chưa siết RLS admin → còn cửa sổ seed, tránh tự khoá.)
- `006b_tighten_admin_rls.sql` — viết lại `auth_*` về `is_operator()`; **thêm** `auth_read_orders`, `auth_read_order_items`. (Apply **sau** khi seed operator & đăng nhập OK.)
- `007a_kitchen_isolation.sql` — role `kitchen` + grants; `stores.kitchen_token_version`; `kitchen_store_id()` (fail-closed); siết public read → `TO anon`; policy đọc `kitchen`; `kitchen_set_status()`; `cancel_order(uuid,text)`; hardening `abandon_zalopay_to_cash`. **KHÔNG** drop `public_update_orders` (giữ tương thích anon-kitchen cũ).
- `007b_lock_anon_update.sql` — `drop policy public_update_orders`. Chạy **sau** khi client mới đã deploy + tablet đã nạp token.

---

## 7. Điều kiện tiên quyết
1. **`SUPABASE_JWT_SECRET`** (Settings → API → JWT Secret) vào env admin-web (server-only, **không** `NEXT_PUBLIC_`). Xác nhận project vẫn nhận token HS256 tự ký (nếu đã bật signing keys bất đối xứng → dùng khoá tương ứng).
2. Cài `jose` trong admin-web.
3. Email tài khoản admin để seed `mevo_operators`.

---

## 8. Rủi ro & điểm test kỹ (checkpoint TESTING.md)
- **PUBLIC→anon đúng chưa**: với token `kitchen`, thử đọc đơn **quán khác** → phải **rỗng**; đọc đơn quán mình → có. (Đây là P0, test trước nhất.)
- **Role `kitchen` + Realtime**: (a) token bếp đọc/đổi-status đơn đúng quán; (b) không thấy quán khác; (c) realtime "ding" đúng quán; (d) `kitchen_set_status` từ chối `paid`/`cancelled`/chuyển sai; (e) thu hồi version → token cũ chết ngay.
- **Khoá anon UPDATE** không hỏng luồng: mini-app huỷ đơn (RPC + token), ZaloPay→tiền mặt (`abandon` + token), xác nhận thanh toán (service_role edge function), admin mark paid/cancel.
- **Cổng operator**: tài khoản trong allowlist vào được; ngoài allowlist bị chặn; không tự khoá nhầm.
- **Admin vẫn đọc được đơn** sau khi siết public→anon (nhờ `auth_read_orders`/`auth_read_order_items`).

---

## 9. Thứ tự rollout (zero-downtime)
1. Apply `006` (chưa siết RLS admin → admin vẫn chạy).
2. **Seed `mevo_operators`** cho tài khoản admin; đăng nhập thử chắc chắn còn vào được.
3. Apply `006b` → test: operator vào được, người ngoài bị chặn, admin vẫn đọc đơn. (Lỡ khoá nhầm: rollback `006b` hoặc thêm dòng operator bằng service_role.)
4. Apply `007a` (additive + siết read; **chưa** drop anon update). Bếp cũ (anon) vẫn đọc & ghi bình thường ⇒ không gián đoạn.
5. Deploy client mới: admin-web (token minter + kitchen-display token+RPC) **và** mini-app (cancel_order/abandon + token).
6. MEVO sinh link bếp từng quán pilot, **setup lại toàn bộ tablet**, xác nhận chạy bằng token.
7. Apply `007b` (`drop public_update_orders`). Sau bước này tablet nào chưa nạp token sẽ mất quyền ghi → phải hoàn tất bước 6 trước.

---

## 10. Tuân thủ quy tắc test (CLAUDE.md)
Sau khi code xong **mỗi** task (2a, rồi 2b), DỪNG và báo anh Tú test theo checklist tương ứng trong TESTING.md trước khi tiếp tục. Không tự động chuyển task.
