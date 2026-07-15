# Sprint SA-1 — Database, role và RPC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng nền dữ liệu + phân quyền + RPC để nhân viên đặt món hộ khách, sao cho nhân viên **không** có quyền ghi ngang chủ quán và **không** tự xác nhận được tiền.

**Architecture:** Một migration `028` làm 4 việc theo đúng thứ tự: (1) siết RLS theo role **trước** khi role `store_staff` tồn tại, (2) thêm cột audit + idempotency, (3) mở `bank_transfer`, (4) hai RPC `staff_create_order` / `confirm_manual_payment`. Mọi ghi của staff đi qua RPC `SECURITY DEFINER`; không GRANT ghi trực tiếp. Kiểm thử RLS bằng cách giả lập JWT trong SQL (`set local request.jwt.claims`), chạy trong transaction rồi `rollback`.

**Tech Stack:** PostgreSQL 17 (Supabase), PL/pgSQL, Supabase MCP (`execute_sql` để thử, `apply_migration` để áp), TypeScript, Vitest.

**Spec:** [2026-07-15-staff-assisted-ordering-design.md](../specs/2026-07-15-staff-assisted-ordering-design.md)

---

## Mục tiêu của SA-1 (đọc kỹ trước khi làm)

SA-1 **không** tạo ra thứ gì nhân viên nhìn thấy được. Xong SA-1, mở trình duyệt sẽ **không thấy gì mới** — UI nằm ở SA-3. Đây là sprint hạ tầng, và giá trị của nó đo bằng **những việc KHÔNG làm được nữa**, không phải tính năng mới.

**Thứ SA-1 phải đạt:**

1. Thêm dòng `role='store_staff'` vào `mevo_operators` mà nhân viên đó **không** tự sửa được giá món, **không** xoá được bàn, **không** tạo được mã giảm giá, **không** tự đánh dấu đã nhận tiền — kể cả khi gọi thẳng Supabase REST, bỏ qua `admin-web`.
2. `staff_create_order` tạo được đơn với giá tính từ DB, gán `order_source`/`created_by` phía server, và bấm hai lần không ra hai đơn.
3. `confirm_manual_payment` chỉ chủ quán gọi được, và ghi lại ai xác nhận lúc nào.
4. Doanh thu đếm đúng đơn `bank_transfer` đã thu tiền.

**Cách vận hành sau khi SA-1 xong:**

```
Chủ quán (store_owner)  → /admin như hiện tại, không đổi gì
Nhân viên (store_staff) → CHƯA có gì để dùng — /staff dựng ở SA-3
MEVO (mevo_superadmin)  → /mevo như hiện tại, không đổi gì
Khách, bếp             → không đổi gì
```

Tài khoản staff được tạo bằng tay qua SQL (service role) trong SA-1. UI quản lý nhân viên nằm ở SA-2.

Kiểm chứng SA-1 xong = **chạy script kiểm thử ở Task 9 và thấy toàn bộ PASS**, không phải mở app bấm thử.

---

## Bối cảnh bắt buộc nắm trước khi code

**Đọc `CLAUDE.md` trước.** Vài điểm quyết định cách viết code:

- **Text người dùng thấy: tiếng Việt.** Thông báo lỗi trong RPC cũng vậy (`RAISE EXCEPTION 'Bàn không thuộc quán'`).
- **Tiền là `int`, đơn vị VNĐ.** Không dùng `decimal`, không nhân 100.
- **Snapshot tên + giá vào `order_items`** lúc tạo đơn, phòng menu đổi sau.
- **Không tin client** bất kỳ giá trị nào ảnh hưởng tiền hoặc quyền.

**Ba cạm bẫy đã biết của repo này:**

1. **`is_store_scoped_operator()` không đọc cột `role`** (`019:6`). Nó chỉ hỏi "có phải operator của quán này không". Thêm `store_staff` = cấp luôn quyền owner. Đây là lý do Task 1–3 phải làm **trước** Task 4.
2. **Số migration bị trùng trong lịch sử** (`002`, `006`, `017` đều có 2 file). Không sao, nhưng đừng bắt chước.
3. **`create_order` đã qua 5 lần sửa** (`003` → `010` → `012` → `027`). Bản đang chạy nằm ở `027:169`. Đọc **bản đó**, không đọc `003`.

**Cách chạy SQL:** dùng Supabase MCP, project id `dlkgdpexjtyynbotkwka`.
- Thử nghiệm / kiểm thử → `execute_sql` (chạy được `begin; ... rollback;`).
- Áp thật → `apply_migration`.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `supabase/migrations/028_staff_assisted_ordering.sql` | **Tạo mới.** Toàn bộ thay đổi DB của SA-1. Một file, chạy một lần, theo thứ tự Task 1→7. |
| `docs/superpowers/plans/sa1-verify.sql` | **Tạo mới.** Script kiểm thử RLS + RPC, chạy được lặp lại, tự rollback. Không phải migration. |
| `admin-web/types/database.types.ts` | **Sửa** dòng 3 — union `PaymentMethod`. |
| `mini-app/src/types/database.types.ts` | **Sửa** dòng 100 — union thứ hai, dễ quên. |
| `admin-web/lib/revenue.ts` | **Tạo mới.** Một luật doanh thu dùng chung, thay 2 chỗ đang tính lại bằng TS. |
| `admin-web/lib/revenue.test.ts` | **Tạo mới.** Vitest cho `revenue.ts`. |
| `admin-web/app/admin/orders/page.tsx` | **Sửa** dòng ~65 — dùng `revenue.ts`. |
| `admin-web/app/admin/dashboard/page.tsx` | **Sửa** — dùng `revenue.ts`. |

Migration là một file vì Postgres DDL chạy trong một transaction — vỡ giữa chừng thì rollback sạch. Tách nhiều file sẽ để lại DB nửa vời.

---

## Task 1: Helper phân quyền theo role

**Files:**
- Create: `supabase/migrations/028_staff_assisted_ordering.sql`

- [ ] **Step 1: Viết header + helper mới**

Tạo file với nội dung:

```sql
-- 028 — Staff Assisted Ordering: RLS theo role, audit đơn, RPC đặt hộ.
--
-- THỨ TỰ TRONG FILE NÀY QUAN TRỌNG:
--   1) Helper phân quyền + viết lại policy ghi   ← PHẢI xong trước
--   2) Nới role cho phép 'store_staff'            ← chỉ sau khi (1) xong
-- Đảo thứ tự = có cửa sổ mà staff có quyền owner.
--
-- Gốc rễ: is_store_scoped_operator() (019:6) KHÔNG đọc cột role — nó chỉ hỏi
-- "có phải operator của quán này không". Nên chỉ cần INSERT một dòng
-- role='store_staff' là nhân viên có ngay quyền ghi ngang chủ quán:
-- sửa giá món, xoá bàn, TỰ TẠO MÃ GIẢM GIÁ (vouchers FOR ALL), tự set
-- payment_received_at. Kể cả khi gọi thẳng Supabase REST, không qua admin-web.

-- ============================================================
-- 1) Helper GHI: có đọc role. Giữ is_store_scoped_operator() cho ĐỌC.
-- ============================================================
create or replace function is_store_owner_or_admin(target_store_id uuid)
  returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from mevo_operators
    where user_id = auth.uid()
      and (
        role = 'mevo_superadmin'
        or (role = 'store_owner' and store_id = target_store_id)
      )
  );
$$;
```

- [ ] **Step 2: Chạy thử helper, kiểm nó từ chối user lạ**

Dùng `execute_sql`:

```sql
begin;

create or replace function is_store_owner_or_admin(target_store_id uuid)
  returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from mevo_operators
    where user_id = auth.uid()
      and (
        role = 'mevo_superadmin'
        or (role = 'store_owner' and store_id = target_store_id)
      )
  );
$$;

-- Không có JWT → auth.uid() NULL → phải false
select is_store_owner_or_admin(
  (select id from stores limit 1)
) as phai_la_false;

rollback;
```

Expected: `phai_la_false` = `false`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/028_staff_assisted_ordering.sql
git commit -m "feat(db): helper is_store_owner_or_admin doc role cho policy ghi"
```

---

## Task 2: Viết lại 11 policy ghi

**Files:**
- Modify: `supabase/migrations/028_staff_assisted_ordering.sql`

**Đây là task quan trọng nhất của SA-1.** Bỏ sót một policy là thủng toàn bộ.

- [ ] **Step 1: Đếm lại policy trên DB thật — đừng tin danh sách dưới đây**

Chạy bằng `execute_sql`:

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and 'authenticated' = any(roles)
  and cmd in ('ALL','INSERT','UPDATE','DELETE')
  and (coalesce(qual,'') like '%is_store_scoped_operator%'
       or coalesce(with_check,'') like '%is_store_scoped_operator%')
order by tablename, policyname;
```

Expected: đúng **11 dòng** (đo 2026-07-15):

| tablename | policyname | cmd |
|---|---|---|
| menu_categories | auth_insert_menu_categories | INSERT |
| menu_items | auth_delete_menu_items | DELETE |
| menu_items | auth_insert_menu_items | INSERT |
| menu_items | auth_update_menu_items | UPDATE |
| orders | auth_update_orders | UPDATE |
| spin_results | op_update_spin_results | UPDATE |
| spin_rewards | op_all_spin_rewards | ALL |
| tables | auth_delete_tables | DELETE |
| tables | auth_insert_tables | INSERT |
| tables | auth_update_tables | UPDATE |
| vouchers | op_all_vouchers | ALL |

Ra **khác 11** → có migration mới sau 2026-07-15. **Dừng lại, cập nhật plan**, đừng đoán.

- [ ] **Step 2: Thêm phần viết lại policy vào migration**

Nối vào cuối `028_staff_assisted_ordering.sql`:

```sql
-- ============================================================
-- 2) Viết lại MỌI policy GHI sang helper có kiểm role.
--    Đếm bằng pg_policies ngày 2026-07-15: 11 policy / 6 bảng.
--    ĐỌC vẫn dùng is_store_scoped_operator() — staff cần đọc menu/bàn/đơn.
-- ============================================================

-- ── tables (019) ────────────────────────────────────────────
drop policy if exists "auth_insert_tables" on tables;
create policy "auth_insert_tables" on tables
  for insert to authenticated with check (is_store_owner_or_admin(store_id));
drop policy if exists "auth_update_tables" on tables;
create policy "auth_update_tables" on tables
  for update to authenticated
  using (is_store_owner_or_admin(store_id))
  with check (is_store_owner_or_admin(store_id));
drop policy if exists "auth_delete_tables" on tables;
create policy "auth_delete_tables" on tables
  for delete to authenticated using (is_store_owner_or_admin(store_id));

-- ── menu_categories (019) ───────────────────────────────────
drop policy if exists "auth_insert_menu_categories" on menu_categories;
create policy "auth_insert_menu_categories" on menu_categories
  for insert to authenticated with check (is_store_owner_or_admin(store_id));

-- ── menu_items (019) ────────────────────────────────────────
drop policy if exists "auth_insert_menu_items" on menu_items;
create policy "auth_insert_menu_items" on menu_items
  for insert to authenticated with check (is_store_owner_or_admin(store_id));
drop policy if exists "auth_update_menu_items" on menu_items;
create policy "auth_update_menu_items" on menu_items
  for update to authenticated
  using (is_store_owner_or_admin(store_id))
  with check (is_store_owner_or_admin(store_id));
drop policy if exists "auth_delete_menu_items" on menu_items;
create policy "auth_delete_menu_items" on menu_items
  for delete to authenticated using (is_store_owner_or_admin(store_id));

-- ── orders (019) ────────────────────────────────────────────
-- Quan trọng nhất: không có dòng này thì staff tự set payment_received_at
-- qua REST, phá toàn bộ audit của §4.2 và quyền owner-only của §6.2.
drop policy if exists "auth_update_orders" on orders;
create policy "auth_update_orders" on orders
  for update to authenticated
  using (is_store_owner_or_admin(store_id))
  with check (is_store_owner_or_admin(store_id));

-- ── spin_rewards (025) — FOR ALL: staff sửa được tỉ lệ trúng ──
drop policy if exists "op_all_spin_rewards" on spin_rewards;
create policy "op_all_spin_rewards" on spin_rewards
  for all to authenticated
  using (is_store_owner_or_admin(store_id))
  with check (is_store_owner_or_admin(store_id));

-- ── spin_results (025) ──────────────────────────────────────
drop policy if exists "op_update_spin_results" on spin_results;
create policy "op_update_spin_results" on spin_results
  for update to authenticated
  using (is_store_owner_or_admin(store_id))
  with check (is_store_owner_or_admin(store_id));

-- ── vouchers (027) — FOR ALL: staff TỰ TẠO MÃ GIẢM GIÁ cho mình ──
-- Nguy hiểm nhất trong 11 cái. Bỏ sót cái này thì mọi thứ khác vô nghĩa.
drop policy if exists "op_all_vouchers" on vouchers;
create policy "op_all_vouchers" on vouchers
  for all to authenticated
  using (is_store_owner_or_admin(store_id))
  with check (is_store_owner_or_admin(store_id));

-- ============================================================
-- 3) Guard trong RPC — policy không gác được, phải sửa riêng.
--    Lịch sử có 2 định nghĩa (025:161, 027:413) nhưng CÙNG chữ ký nên
--    create-or-replace của 027 da de len 025 → DB chỉ có MỘT hàm sống.
--    Xác minh bằng pg_proc: đây là hàm DUY NHẤT còn gọi helper cũ.
--    Giữ nhánh kitchen (bếp phải đổi thưởng được), chỉ siết nhánh operator.
-- ============================================================
create or replace function redeem_spin_result(p_result_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_res spin_results%rowtype;
begin
  select * into v_res from spin_results where id = p_result_id;
  if not found then raise exception 'Không tìm thấy kết quả'; end if;
  if not (kitchen_store_id() = v_res.store_id
          or is_store_owner_or_admin(v_res.store_id)) then
    raise exception 'Không có quyền với quán này';
  end if;
  update spin_results set status='redeemed', redeemed_at=now()
    where id=p_result_id and status='won';
  return jsonb_build_object('ok', true, 'already', v_res.status='redeemed');
end $$;
```

- [ ] **Step 3: Kiểm không còn policy ghi nào dùng helper cũ**

Chạy lại query ở Step 1 **sau khi** áp migration (Task 8). Expected: **0 dòng**.

Chưa áp thì thử trong transaction:

```sql
begin;
-- dán toàn bộ nội dung 028 tới thời điểm này
-- rồi:
select count(*) as con_sot
from pg_policies
where schemaname='public' and 'authenticated' = any(roles)
  and cmd in ('ALL','INSERT','UPDATE','DELETE')
  and (coalesce(qual,'') like '%is_store_scoped_operator%'
       or coalesce(with_check,'') like '%is_store_scoped_operator%');
rollback;
```

Expected: `con_sot` = `0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/028_staff_assisted_ordering.sql
git commit -m "feat(db): viet lai 11 policy ghi sang helper co kiem role + guard redeem_spin_result"
```

---

## Task 3: Nới role cho `store_staff`

**Files:**
- Modify: `supabase/migrations/028_staff_assisted_ordering.sql`

Chỉ làm **sau** Task 2. Trước đó, thêm role = mở lỗ hổng.

- [ ] **Step 1: Nối vào migration**

```sql
-- ============================================================
-- 4) Nới role — CHỈ sau khi policy ghi đã siết (mục 2).
--    018 có HAI constraint liệt kê role tường minh. Quên cái thứ hai
--    thì store_staff bị chặn ngay lúc INSERT.
-- ============================================================
alter table mevo_operators drop constraint if exists mevo_operators_role_check;
alter table mevo_operators
  add constraint mevo_operators_role_check
  check (role in ('mevo_superadmin', 'store_owner', 'store_staff'));

alter table mevo_operators drop constraint if exists mevo_operators_role_store_check;
alter table mevo_operators
  add constraint mevo_operators_role_store_check
  check (
    (role = 'mevo_superadmin' and store_id is null)
    or (role in ('store_owner','store_staff') and store_id is not null)
  );
```

- [ ] **Step 2: Kiểm cả hai constraint cùng cho phép**

```sql
begin;
alter table mevo_operators drop constraint if exists mevo_operators_role_check;
alter table mevo_operators
  add constraint mevo_operators_role_check
  check (role in ('mevo_superadmin', 'store_owner', 'store_staff'));
alter table mevo_operators drop constraint if exists mevo_operators_role_store_check;
alter table mevo_operators
  add constraint mevo_operators_role_store_check
  check (
    (role = 'mevo_superadmin' and store_id is null)
    or (role in ('store_owner','store_staff') and store_id is not null)
  );

-- store_staff + có store_id → PHẢI chèn được
insert into mevo_operators (user_id, store_id, role)
values (gen_random_uuid(), (select id from stores limit 1), 'store_staff');
select 'chen store_staff: OK' as ket_qua;

-- store_staff + store_id NULL → PHẢI bị chặn
do $$ begin
  insert into mevo_operators (user_id, store_id, role)
  values (gen_random_uuid(), null, 'store_staff');
  raise exception 'SAI: le ra phai bi chan';
exception when check_violation then
  raise notice 'chan store_staff store_id NULL: OK';
end $$;

rollback;
```

Expected: `chen store_staff: OK`, và notice `chan store_staff store_id NULL: OK`. Không có exception `SAI:`.

> Lưu ý: `user_id` tham chiếu `auth.users(id)`. Nếu FK chặn `gen_random_uuid()`, đổi sang một
> user thật đang có: `(select id from auth.users limit 1)` — và bọc trong `rollback` như trên.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/028_staff_assisted_ordering.sql
git commit -m "feat(db): noi mevo_operators.role cho store_staff (ca 2 constraint)"
```

---

## Task 4: Cột audit + idempotency + `bank_transfer`

**Files:**
- Modify: `supabase/migrations/028_staff_assisted_ordering.sql`

- [ ] **Step 1: Tìm tên thật của CHECK constraint trên `orders.payment_method`**

`001_init.sql:76` khai inline nên Postgres tự sinh tên. Chạy:

```sql
select conname, pg_get_constraintdef(oid) as dinh_nghia
from pg_constraint
where conrelid = 'orders'::regclass
  and contype = 'c'
  and pg_get_constraintdef(oid) like '%payment_method%';
```

Ghi lại `conname` — dùng ở Step 2.

- [ ] **Step 2: Nối vào migration**

Thay `<TEN_CONSTRAINT_TU_STEP_1>` bằng tên thật vừa tìm được:

```sql
-- ============================================================
-- 5) Mở payment_method: thêm bank_transfer
-- ============================================================
alter table orders drop constraint if exists <TEN_CONSTRAINT_TU_STEP_1>;
alter table orders
  add constraint orders_payment_method_check
  check (payment_method in ('zalopay','cash','bank_transfer'));

-- stores.payment_methods: KHÔNG đụng vào.
--
-- ⚠️ LỆCH CÓ CHỦ Ý so với spec §4.1 (bảng ở đó bảo drop/recreate
--    stores_payment_methods_valid để thêm bank_transfer).
-- Lý do: stores.payment_methods là danh sách phương thức KHÁCH thấy trong
-- mini-app. bank_transfer là staff-only tới hết SA-5, và staff_create_order
-- không đọc cột này (nó tự whitelist cash|bank_transfer ở mục 7).
-- Thêm vào = mở đúng cái §4.1 dặn phải chặn. Ít thay đổi hơn, an toàn hơn.
-- PM-4 mới mở bank_transfer cho khách; lúc đó constraint này mới cần sửa.

-- ============================================================
-- 6) Cột audit + idempotency
-- ============================================================
alter table orders
  add column if not exists order_source text not null default 'customer_zalo',
  add column if not exists created_by uuid null references auth.users(id),
  add column if not exists payment_received_at timestamptz null,
  add column if not exists payment_received_by uuid null references auth.users(id),
  add column if not exists client_request_id uuid null;

alter table orders drop constraint if exists orders_order_source_check;
alter table orders
  add constraint orders_order_source_check
  check (order_source in ('customer_zalo', 'staff'));

-- Idempotency: một client_request_id chỉ ra một đơn cho mỗi quán.
create unique index if not exists orders_store_client_request_unique
  on orders(store_id, client_request_id)
  where client_request_id is not null;
```

- [ ] **Step 3: Kiểm unique index thật sự chặn**

```sql
begin;
alter table orders
  add column if not exists client_request_id uuid null;
create unique index if not exists orders_store_client_request_unique
  on orders(store_id, client_request_id)
  where client_request_id is not null;

-- Hai đơn cùng store + cùng request id → cái thứ hai PHẢI vỡ
do $$
declare v_store uuid; v_req uuid := gen_random_uuid();
begin
  select id into v_store from stores limit 1;
  insert into orders (store_id, total_amount, payment_method, status, client_request_id)
  values (v_store, 1000, 'cash', 'pending', v_req);
  begin
    insert into orders (store_id, total_amount, payment_method, status, client_request_id)
    values (v_store, 1000, 'cash', 'pending', v_req);
    raise exception 'SAI: le ra phai bi chan trung';
  exception when unique_violation then
    raise notice 'chan trung client_request_id: OK';
  end;
end $$;

-- NULL không bị chặn (partial index) — nhiều đơn khách đều NULL
do $$
declare v_store uuid;
begin
  select id into v_store from stores limit 1;
  insert into orders (store_id, total_amount, payment_method, status, client_request_id)
  values (v_store, 1000, 'cash', 'pending', null);
  insert into orders (store_id, total_amount, payment_method, status, client_request_id)
  values (v_store, 1000, 'cash', 'pending', null);
  raise notice 'nhieu NULL cung ton tai: OK';
end $$;

rollback;
```

Expected: hai notice `OK`, không có exception `SAI:`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/028_staff_assisted_ordering.sql
git commit -m "feat(db): cot audit don + client_request_id + bank_transfer"
```

---

## Task 5: RPC `staff_create_order`

**Files:**
- Modify: `supabase/migrations/028_staff_assisted_ordering.sql`

- [ ] **Step 1: Đọc `create_order` bản đang chạy**

```bash
sed -n '169,240p' supabase/migrations/027_vouchers.sql
```

Nắm: cách kiểm `store_accepting_now`, cách tính giá từ DB, cách snapshot topping vào `order_items`. `staff_create_order` phải **cùng luật** với nó, trừ voucher và trừ `zalopay`.

- [ ] **Step 2: Nối RPC vào migration**

```sql
-- ============================================================
-- 7) RPC: nhân viên đặt món hộ khách.
--    SECURITY DEFINER — staff KHÔNG có quyền INSERT orders trực tiếp.
-- ============================================================
create or replace function staff_create_order(
  p_table_id          uuid,
  p_items             jsonb,
  p_payment_method    text,
  p_client_request_id uuid,
  p_note              text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_store     uuid;
  v_role      text;
  v_order_id  uuid;
  v_total     int := 0;
  v_item      jsonb;
  v_mi        menu_items%rowtype;
  v_qty       int;
  v_line      int;
  v_top_total int;
begin
  -- 1) Ai đang gọi? store_id suy từ operator, KHÔNG tin client.
  select store_id, role into v_store, v_role
  from mevo_operators where user_id = v_uid;
  if v_store is null or v_role not in ('store_owner','store_staff') then
    raise exception 'Không có quyền đặt món hộ';
  end if;

  -- 2) Idempotent: request cũ thì trả đơn cũ, không tạo thêm.
  --    Trả ĐỦ total + items như lần đầu — retry sau lỗi mạng cũng phải đủ dữ liệu
  --    để UI hiện màn thành công (§7 spec: "Success dùng response RPC").
  select id into v_order_id from orders
  where store_id = v_store and client_request_id = p_client_request_id;
  if v_order_id is not null then
    return jsonb_build_object(
      'order_id',   v_order_id,
      'total',      (select total_amount from orders where id = v_order_id),
      'idempotent', true,
      'items',      (select jsonb_agg(to_jsonb(oi))
                     from order_items oi where oi.order_id = v_order_id)
    );
  end if;

  -- 3) Quán còn nhận đơn không (dùng chung helper với create_order)
  if not store_accepting_now(v_store) then
    raise exception 'Quán đang tạm nghỉ hoặc ngoài giờ phục vụ';
  end if;

  -- 4) Bàn phải active và thuộc đúng quán
  if not exists (
    select 1 from tables
    where id = p_table_id and store_id = v_store and is_active
  ) then
    raise exception 'Bàn không thuộc quán hoặc đã ngừng dùng';
  end if;

  -- 5) Staff chỉ nhận tiền mặt / chuyển khoản. KHÔNG nhận zalopay:
  --    staff không thu hộ tiền online.
  if p_payment_method not in ('cash','bank_transfer') then
    raise exception 'Phương thức không hợp lệ cho đơn đặt hộ: %', p_payment_method;
  end if;

  -- 6) Tạo đơn. total_amount tính ở bước 8, tạm 0.
  --    order_source/created_by do SERVER gán — client không gửi được.
  insert into orders (
    store_id, table_id, total_amount, payment_method, status,
    note, order_source, created_by, client_request_id
  ) values (
    v_store, p_table_id, 0, p_payment_method, 'pending',
    p_note, 'staff', v_uid, p_client_request_id
  )
  on conflict (store_id, client_request_id) do nothing
  returning id into v_order_id;

  -- Hai request đồng thời cùng client_request_id: cái thua race rơi vào đây.
  -- Trả đơn của cái thắng, KHÔNG insert order_items lần hai.
  if v_order_id is null then
    select id into v_order_id from orders
    where store_id = v_store and client_request_id = p_client_request_id;
    return jsonb_build_object(
      'order_id',   v_order_id,
      'total',      (select total_amount from orders where id = v_order_id),
      'idempotent', true,
      'items',      (select jsonb_agg(to_jsonb(oi))
                     from order_items oi where oi.order_id = v_order_id)
    );
  end if;

  -- 7) Từng món: giá LẤY TỪ DB, không tin client.
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_mi from menu_items
    where id = (v_item->>'menu_item_id')::uuid
      and store_id = v_store
      and is_available;
    if not found then
      raise exception 'Món không bán hoặc không thuộc quán: %', v_item->>'menu_item_id';
    end if;

    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));

    -- Topping: cộng giá từ DB, chặn topping của quán khác + topping đã tắt.
    -- toppings(store_id, price, is_available) — xem 016_toppings_shared.sql:6-20
    select coalesce(sum(t.price), 0) into v_top_total
    from toppings t
    where t.store_id = v_store
      and t.is_available
      and t.id in (
        select (jsonb_array_elements_text(coalesce(v_item->'topping_ids','[]'::jsonb)))::uuid
      );

    v_line := (v_mi.price + v_top_total) * v_qty;
    v_total := v_total + v_line;

    -- Snapshot tên + giá lúc order (CLAUDE.md §9)
    insert into order_items (order_id, menu_item_id, item_name, item_price, quantity, note)
    values (v_order_id, v_mi.id, v_mi.name, v_mi.price + v_top_total, v_qty,
            nullif(v_item->>'note',''));
  end loop;

  if v_total <= 0 then
    raise exception 'Đơn phải có ít nhất một món';
  end if;

  update orders set total_amount = v_total where id = v_order_id;

  -- 8) Trả đủ để UI hiện ngay, không phải query lại (§7 spec)
  return jsonb_build_object(
    'order_id',   v_order_id,
    'total',      v_total,
    'idempotent', false,
    'items',      (select jsonb_agg(to_jsonb(oi))
                   from order_items oi where oi.order_id = v_order_id)
  );
end $$;

revoke all on function staff_create_order(uuid, jsonb, text, uuid, text) from public;
grant execute on function staff_create_order(uuid, jsonb, text, uuid, text) to authenticated;
```

> **Kiểm trước khi chạy:** tên cột topping trong `015_menu_toppings.sql` / `016_toppings_shared.sql`
> phải khớp (`toppings.price`, `toppings.store_id`). Nếu lệch, sửa theo schema thật —
> đừng sửa schema theo plan.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/028_staff_assisted_ordering.sql
git commit -m "feat(db): RPC staff_create_order idempotent, gia tinh tu DB"
```

---

## Task 6: RPC `confirm_manual_payment`

**Files:**
- Modify: `supabase/migrations/028_staff_assisted_ordering.sql`

- [ ] **Step 1: Nối vào migration**

```sql
-- ============================================================
-- 8) RPC: chủ quán xác nhận đã nhận tiền.
--    CHỈ owner — staff gọi phải bị từ chối (§5 spec).
--    KHÔNG đụng orders.status: thanh toán và tiến độ bếp là hai trục
--    độc lập (§4.3 spec).
-- ============================================================
create or replace function confirm_manual_payment(p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then raise exception 'Không tìm thấy đơn'; end if;

  if not is_store_owner_or_admin(v_order.store_id) then
    raise exception 'Chỉ chủ quán được xác nhận nhận tiền';
  end if;

  if v_order.payment_method not in ('cash','bank_transfer') then
    raise exception 'Đơn thanh toán online không xác nhận tay';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Đơn đã huỷ';
  end if;

  -- Idempotent: giữ nguyên người xác nhận ĐẦU TIÊN, không ghi đè.
  if v_order.payment_received_at is not null then
    return jsonb_build_object(
      'ok', true, 'already', true,
      'received_at', v_order.payment_received_at
    );
  end if;

  update orders
  set payment_received_at = now(),
      payment_received_by = auth.uid()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'already', false);
end $$;

revoke all on function confirm_manual_payment(uuid) from public;
grant execute on function confirm_manual_payment(uuid) to authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/028_staff_assisted_ordering.sql
git commit -m "feat(db): RPC confirm_manual_payment chi owner, idempotent"
```

---

## Task 7: Doanh thu đếm `bank_transfer`

**Files:**
- Modify: `supabase/migrations/028_staff_assisted_ordering.sql`

> **Tạm thời có chủ ý.** Luật ba nhánh dưới đây sẽ bị PM-1 (spec multi-method) thay bằng
> **một** luật `payment_received_at IS NOT NULL`. SA-1 vẫn phải đúng khi đứng một mình,
> nên làm bản ba nhánh trước. Đừng "tối ưu sớm" sang bản một luật — PM-1 còn đổi cả
> `payment_method` sang `zalo_checkout`.

- [ ] **Step 1: Nối vào migration**

```sql
-- ============================================================
-- 9) Doanh thu: thêm nhánh bank_transfer/cash đã xác nhận tay.
--    (PM-1 sẽ gộp cả 3 nhánh về payment_received_at — xem spec multi-method §4)
-- ============================================================
create or replace function get_daily_revenue(
  p_store_id uuid,
  p_date date default current_date
)
returns table (
  total_revenue bigint,
  total_orders  bigint,
  paid_orders   bigint,
  cash_pending  bigint
) language sql stable as $$
  with tinh as (
    select
      total_amount,
      (
        (payment_method = 'zalopay' and zalopay_trans_id is not null and status <> 'cancelled')
        or (payment_method = 'cash' and status = 'paid')                      -- legacy
        or (payment_method in ('cash','bank_transfer')
            and payment_received_at is not null and status <> 'cancelled')    -- mới
      ) as da_co_tien,
      (payment_method in ('cash','bank_transfer')
       and payment_received_at is null
       and status not in ('paid','cancelled')) as cho_thu
    from orders
    where store_id = p_store_id
      and created_at >= p_date::timestamptz
      and created_at <  (p_date + interval '1 day')::timestamptz
  )
  select
    coalesce(sum(total_amount) filter (where da_co_tien), 0)::bigint,
    count(*)::bigint,
    count(*) filter (where da_co_tien)::bigint,
    count(*) filter (where cho_thu)::bigint
  from tinh;
$$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/028_staff_assisted_ordering.sql
git commit -m "feat(db): doanh thu dem don bank_transfer da xac nhan"
```

---

## Task 8: Chạy thử toàn bộ migration rồi áp

**Files:**
- Modify: `supabase/migrations/028_staff_assisted_ordering.sql`

- [ ] **Step 1: Chạy khan toàn bộ migration trong transaction**

Dùng `execute_sql`, dán **toàn bộ** nội dung `028_staff_assisted_ordering.sql`, bọc:

```sql
begin;
-- <toàn bộ nội dung 028 dán vào đây>
select 'migration chay khan: OK' as ket_qua;
rollback;
```

Expected: `migration chay khan: OK`, không lỗi.

Có lỗi → sửa file, chạy lại. **Không** đi tiếp khi còn lỗi.

- [ ] **Step 2: Áp thật**

Dùng `apply_migration`, name `028_staff_assisted_ordering`, query = toàn bộ nội dung file (**không** có `begin`/`rollback`).

- [ ] **Step 3: Kiểm không còn policy ghi nào dùng helper cũ**

```sql
select count(*) as con_sot
from pg_policies
where schemaname='public' and 'authenticated' = any(roles)
  and cmd in ('ALL','INSERT','UPDATE','DELETE')
  and (coalesce(qual,'') like '%is_store_scoped_operator%'
       or coalesce(with_check,'') like '%is_store_scoped_operator%');
```

Expected: `con_sot` = **0**. Khác 0 → có policy bị bỏ sót, quay lại Task 2.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/028_staff_assisted_ordering.sql
git commit -m "chore(db): ap migration 028 len prod"
```

---

## Task 9: Script kiểm thử RLS + RPC

**Files:**
- Create: `docs/superpowers/plans/sa1-verify.sql`

Đây là **bằng chứng SA-1 xong**. Chạy được lặp lại, tự dọn.

Cách giả lập đăng nhập trong SQL: `auth.uid()` đọc từ `request.jwt.claims`, nên
`set local request.jwt.claims = '{"sub":"<uuid>"}'` là "đăng nhập" bằng user đó.

- [ ] **Step 1: Viết script**

```sql
-- sa1-verify.sql — kiểm thử SA-1. Chạy bằng execute_sql. Tự rollback, không bẩn DB.
-- PASS = chạy hết, không có exception 'SAI:'.
begin;

-- ── Dựng dữ liệu giả ────────────────────────────────────────
do $$
declare
  v_store_a uuid; v_store_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_staff_a uuid := gen_random_uuid();
  v_table_a uuid; v_item_a uuid;
  v_order   uuid;
begin
  select id into v_store_a from stores limit 1;
  select id into v_store_b from stores where id <> v_store_a limit 1;
  if v_store_b is null then
    insert into stores (name, slug) values ('Quan B Test', 'quan-b-test-'||substr(v_store_a::text,1,8))
    returning id into v_store_b;
  end if;

  insert into auth.users (id, email) values
    (v_owner_a, 'owner-a-test@mevo.test'),
    (v_staff_a, 'staff-a-test@mevo.test');
  insert into mevo_operators (user_id, store_id, role) values
    (v_owner_a, v_store_a, 'store_owner'),
    (v_staff_a, v_store_a, 'store_staff');

  insert into tables (store_id, table_number, is_active)
  values (v_store_a, 'Ban Test', true) returning id into v_table_a;
  insert into menu_items (store_id, name, price, is_available)
  values (v_store_a, 'Pho Test', 50000, true) returning id into v_item_a;

  -- Nhớ lại để các bước sau dùng
  create temp table sa1_ctx as select
    v_store_a as store_a, v_store_b as store_b,
    v_owner_a as owner_a, v_staff_a as staff_a,
    v_table_a as table_a, v_item_a as item_a;
end $$;

-- ── TEST 1: staff KHÔNG sửa được giá món của CHÍNH quán mình ──
do $$
declare v_ctx record; v_n int;
begin
  select * into v_ctx from sa1_ctx;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ctx.staff_a, 'role','authenticated')::text, true);

  update menu_items set price = 1 where id = v_ctx.item_a;
  get diagnostics v_n = row_count;
  if v_n > 0 then raise exception 'SAI: staff sua duoc gia mon'; end if;
  raise notice 'TEST 1 staff khong sua duoc gia: PASS';

  reset role;
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ── TEST 2: staff KHÔNG tạo được mã giảm giá (vouchers FOR ALL) ──
do $$
declare v_ctx record;
begin
  select * into v_ctx from sa1_ctx;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ctx.staff_a, 'role','authenticated')::text, true);

  begin
    insert into vouchers (store_id, code, kind, discount_type, discount_value)
    values (v_ctx.store_a, 'STAFF-TU-TAO', 'shipper', 'fixed', 999000);
    raise exception 'SAI: staff tu tao duoc ma giam gia';
  exception when insufficient_privilege then
    raise notice 'TEST 2 staff khong tao duoc voucher: PASS';
  end;

  reset role;
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ── TEST 3: staff KHÔNG tự set payment_received_at qua REST ──
do $$
declare v_ctx record; v_order uuid; v_n int;
begin
  select * into v_ctx from sa1_ctx;
  insert into orders (store_id, table_id, total_amount, payment_method, status, order_source)
  values (v_ctx.store_a, v_ctx.table_a, 50000, 'cash', 'pending', 'staff')
  returning id into v_order;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ctx.staff_a, 'role','authenticated')::text, true);

  update orders set payment_received_at = now() where id = v_order;
  get diagnostics v_n = row_count;
  if v_n > 0 then raise exception 'SAI: staff tu xac nhan duoc tien'; end if;
  raise notice 'TEST 3 staff khong tu set payment_received_at: PASS';

  reset role;
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ── TEST 4: staff gọi confirm_manual_payment → từ chối ──
do $$
declare v_ctx record; v_order uuid;
begin
  select * into v_ctx from sa1_ctx;
  insert into orders (store_id, table_id, total_amount, payment_method, status, order_source)
  values (v_ctx.store_a, v_ctx.table_a, 50000, 'cash', 'pending', 'staff')
  returning id into v_order;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ctx.staff_a, 'role','authenticated')::text, true);

  begin
    perform confirm_manual_payment(v_order);
    raise exception 'SAI: staff xac nhan duoc tien qua RPC';
  exception when raise_exception then
    if sqlerrm like 'SAI:%' then raise; end if;
    raise notice 'TEST 4 staff khong goi duoc confirm_manual_payment: PASS';
  end;

  reset role;
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ── TEST 5: owner gọi confirm_manual_payment → được, và idempotent ──
do $$
declare v_ctx record; v_order uuid; v_r1 jsonb; v_r2 jsonb; v_at timestamptz;
begin
  select * into v_ctx from sa1_ctx;
  insert into orders (store_id, table_id, total_amount, payment_method, status, order_source)
  values (v_ctx.store_a, v_ctx.table_a, 50000, 'bank_transfer', 'pending', 'staff')
  returning id into v_order;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ctx.owner_a, 'role','authenticated')::text, true);

  v_r1 := confirm_manual_payment(v_order);
  if (v_r1->>'already')::boolean then raise exception 'SAI: lan dau da bao already'; end if;
  select payment_received_at into v_at from orders where id = v_order;
  if v_at is null then raise exception 'SAI: khong ghi payment_received_at'; end if;

  v_r2 := confirm_manual_payment(v_order);
  if not (v_r2->>'already')::boolean then raise exception 'SAI: lan hai phai bao already'; end if;

  raise notice 'TEST 5 owner xac nhan duoc + idempotent: PASS';
  reset role;
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ── TEST 6: staff_create_order — giá lấy từ DB, không tin client ──
do $$
declare v_ctx record; v_res jsonb; v_req uuid := gen_random_uuid(); v_total int;
begin
  select * into v_ctx from sa1_ctx;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ctx.staff_a, 'role','authenticated')::text, true);

  -- Client gửi giá bịa 1đ — phải bị bỏ qua, lấy 50000 từ DB
  v_res := staff_create_order(
    v_ctx.table_a,
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', v_ctx.item_a, 'quantity', 2, 'item_price', 1)),
    'cash', v_req, null);

  v_total := (v_res->>'total')::int;
  if v_total <> 100000 then
    raise exception 'SAI: total = % (phai la 100000, gia tu DB)', v_total;
  end if;
  raise notice 'TEST 6 gia lay tu DB: PASS';

  reset role;
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ── TEST 7: staff_create_order idempotent — double tap không ra 2 đơn ──
do $$
declare v_ctx record; v_r1 jsonb; v_r2 jsonb; v_req uuid := gen_random_uuid(); v_n int;
begin
  select * into v_ctx from sa1_ctx;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ctx.staff_a, 'role','authenticated')::text, true);

  v_r1 := staff_create_order(v_ctx.table_a,
    jsonb_build_array(jsonb_build_object('menu_item_id', v_ctx.item_a, 'quantity', 1)),
    'cash', v_req, null);
  v_r2 := staff_create_order(v_ctx.table_a,
    jsonb_build_array(jsonb_build_object('menu_item_id', v_ctx.item_a, 'quantity', 1)),
    'cash', v_req, null);

  if (v_r1->>'order_id') <> (v_r2->>'order_id') then
    raise exception 'SAI: hai lan goi ra hai don khac nhau';
  end if;
  if not (v_r2->>'idempotent')::boolean then
    raise exception 'SAI: lan hai phai bao idempotent';
  end if;

  select count(*) into v_n from orders
  where store_id = v_ctx.store_a and client_request_id = v_req;
  if v_n <> 1 then raise exception 'SAI: co % don trong DB (phai 1)', v_n; end if;

  raise notice 'TEST 7 idempotent: PASS';
  reset role;
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ── TEST 8: staff_create_order — bàn quán khác bị từ chối ──
do $$
declare v_ctx record; v_table_b uuid;
begin
  select * into v_ctx from sa1_ctx;
  insert into tables (store_id, table_number, is_active)
  values (v_ctx.store_b, 'Ban Quan B', true) returning id into v_table_b;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ctx.staff_a, 'role','authenticated')::text, true);

  begin
    perform staff_create_order(v_table_b,
      jsonb_build_array(jsonb_build_object('menu_item_id', v_ctx.item_a, 'quantity', 1)),
      'cash', gen_random_uuid(), null);
    raise exception 'SAI: staff quan A dat duoc don vao ban quan B';
  exception when raise_exception then
    if sqlerrm like 'SAI:%' then raise; end if;
    raise notice 'TEST 8 chan ban quan khac: PASS';
  end;

  reset role;
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ── TEST 9: staff_create_order từ chối zalopay ──
do $$
declare v_ctx record;
begin
  select * into v_ctx from sa1_ctx;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ctx.staff_a, 'role','authenticated')::text, true);

  begin
    perform staff_create_order(v_ctx.table_a,
      jsonb_build_array(jsonb_build_object('menu_item_id', v_ctx.item_a, 'quantity', 1)),
      'zalopay', gen_random_uuid(), null);
    raise exception 'SAI: staff dat duoc don zalopay';
  exception when raise_exception then
    if sqlerrm like 'SAI:%' then raise; end if;
    raise notice 'TEST 9 chan zalopay o don staff: PASS';
  end;

  reset role;
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ── TEST 9b: staff quán A KHÔNG đọc được đơn quán B (cross-store) ──
do $$
declare v_ctx record; v_order_b uuid; v_n int;
begin
  select * into v_ctx from sa1_ctx;
  insert into orders (store_id, total_amount, payment_method, status)
  values (v_ctx.store_b, 99000, 'cash', 'pending') returning id into v_order_b;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ctx.staff_a, 'role','authenticated')::text, true);

  select count(*) into v_n from orders where id = v_order_b;
  if v_n > 0 then raise exception 'SAI: staff quan A doc duoc don quan B'; end if;
  raise notice 'TEST 9b cross-store read bi chan: PASS';

  reset role;
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ── TEST 9c: staff KHÔNG xoá được bàn của chính quán mình ──
do $$
declare v_ctx record; v_n int;
begin
  select * into v_ctx from sa1_ctx;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ctx.staff_a, 'role','authenticated')::text, true);

  delete from tables where id = v_ctx.table_a;
  get diagnostics v_n = row_count;
  if v_n > 0 then raise exception 'SAI: staff xoa duoc ban'; end if;
  raise notice 'TEST 9c staff khong xoa duoc ban: PASS';

  reset role;
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ── TEST 10: doanh thu đếm bank_transfer đã xác nhận ──
do $$
declare v_ctx record; v_order uuid; v_rev bigint; v_rev2 bigint;
begin
  select * into v_ctx from sa1_ctx;
  select total_revenue into v_rev from get_daily_revenue(v_ctx.store_a, current_date);

  insert into orders (store_id, table_id, total_amount, payment_method, status, order_source)
  values (v_ctx.store_a, v_ctx.table_a, 77000, 'bank_transfer', 'pending', 'staff')
  returning id into v_order;

  -- chưa xác nhận → doanh thu KHÔNG đổi
  select total_revenue into v_rev2 from get_daily_revenue(v_ctx.store_a, current_date);
  if v_rev2 <> v_rev then raise exception 'SAI: don chua thu tien da vao doanh thu'; end if;

  -- xác nhận → doanh thu +77000
  update orders set payment_received_at = now(), payment_received_by = v_ctx.owner_a
  where id = v_order;
  select total_revenue into v_rev2 from get_daily_revenue(v_ctx.store_a, current_date);
  if v_rev2 <> v_rev + 77000 then
    raise exception 'SAI: doanh thu = % (phai = %)', v_rev2, v_rev + 77000;
  end if;

  raise notice 'TEST 10 doanh thu bank_transfer: PASS';
end $$;

rollback;
```

- [ ] **Step 2: Chạy script**

Dùng `execute_sql` với toàn bộ nội dung file.

Expected: **12 notice `PASS`**, không có exception nào bắt đầu bằng `SAI:`.

Có `SAI:` → **đó là bug thật**, quay lại task tương ứng. Đừng sửa test cho vừa code.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/sa1-verify.sql
git commit -m "test(db): script kiem thu RLS + RPC cho SA-1"
```

---

## Task 10: TypeScript types

**Files:**
- Modify: `admin-web/types/database.types.ts:3`
- Modify: `mini-app/src/types/database.types.ts:100`

- [ ] **Step 1: Sửa union ở admin-web**

`admin-web/types/database.types.ts` dòng 3:

```ts
export type PaymentMethod = 'zalopay' | 'cash' | 'bank_transfer'
```

- [ ] **Step 2: Sửa union thứ hai ở mini-app**

`mini-app/src/types/database.types.ts` dòng ~100 — union bị lặp, dễ quên:

```ts
          payment_method: 'zalopay' | 'cash' | 'bank_transfer'
```

- [ ] **Step 3: Type-check cả hai**

```bash
cd admin-web && npx tsc --noEmit
```
Expected: không lỗi mới.

```bash
cd mini-app && npx tsc --noEmit
```
Expected: không lỗi mới. (Repo này từng có lỗi tsc tồn đọng — chỉ cần **không thêm lỗi mới**.)

- [ ] **Step 4: Commit**

```bash
git add admin-web/types/database.types.ts mini-app/src/types/database.types.ts
git commit -m "feat(types): them bank_transfer vao ca hai union PaymentMethod"
```

---

## Task 11: Gộp luật doanh thu về một chỗ (TDD)

**Files:**
- Create: `admin-web/lib/revenue.ts`
- Create: `admin-web/lib/revenue.test.ts`
- Modify: `admin-web/app/admin/orders/page.tsx:65`
- Modify: `admin-web/app/admin/dashboard/page.tsx`

Luật "đã có tiền" đang bị chép ở 2 chỗ TypeScript. Thêm `bank_transfer` mà quên một chỗ =
dashboard và trang Đơn hàng báo hai số khác nhau.

- [ ] **Step 1: Viết test trước — nó phải fail**

Tạo `admin-web/lib/revenue.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hasRealMoney } from './revenue'

describe('hasRealMoney', () => {
  it('ZaloPay có trans_id → đã có tiền', () => {
    expect(hasRealMoney({
      payment_method: 'zalopay', status: 'confirmed',
      zalopay_trans_id: 'ZP123', payment_received_at: null,
    })).toBe(true)
  })

  it('ZaloPay chưa có trans_id → chưa có tiền', () => {
    expect(hasRealMoney({
      payment_method: 'zalopay', status: 'pending',
      zalopay_trans_id: null, payment_received_at: null,
    })).toBe(false)
  })

  it('bank_transfer đã xác nhận → đã có tiền', () => {
    expect(hasRealMoney({
      payment_method: 'bank_transfer', status: 'ready',
      zalopay_trans_id: null, payment_received_at: '2026-07-15T10:00:00Z',
    })).toBe(true)
  })

  it('bank_transfer chưa xác nhận → chưa có tiền', () => {
    expect(hasRealMoney({
      payment_method: 'bank_transfer', status: 'ready',
      zalopay_trans_id: null, payment_received_at: null,
    })).toBe(false)
  })

  it('cash legacy status=paid → đã có tiền', () => {
    expect(hasRealMoney({
      payment_method: 'cash', status: 'paid',
      zalopay_trans_id: null, payment_received_at: null,
    })).toBe(true)
  })

  it('cash đã xác nhận kiểu mới → đã có tiền', () => {
    expect(hasRealMoney({
      payment_method: 'cash', status: 'cooking',
      zalopay_trans_id: null, payment_received_at: '2026-07-15T10:00:00Z',
    })).toBe(true)
  })

  it('đơn cancelled dù đã xác nhận → KHÔNG tính', () => {
    expect(hasRealMoney({
      payment_method: 'bank_transfer', status: 'cancelled',
      zalopay_trans_id: null, payment_received_at: '2026-07-15T10:00:00Z',
    })).toBe(false)
  })

  it('ZaloPay có trans_id nhưng cancelled → KHÔNG tính', () => {
    expect(hasRealMoney({
      payment_method: 'zalopay', status: 'cancelled',
      zalopay_trans_id: 'ZP123', payment_received_at: null,
    })).toBe(false)
  })
})
```

- [ ] **Step 2: Chạy test, xác nhận nó FAIL**

```bash
cd admin-web && npx vitest run lib/revenue.test.ts
```
Expected: FAIL — `Cannot find module './revenue'`.

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `admin-web/lib/revenue.ts`:

```ts
// Luật "đơn này đã có TIỀN THẬT chưa" — một chỗ duy nhất.
// Trước đây luật này bị chép ở admin/orders/page.tsx và admin/dashboard/page.tsx,
// thêm phương thức mới mà quên một chỗ là hai màn hình báo hai số khác nhau.
//
// Ba nhánh (tạm thời — PM-1 của spec multi-method sẽ gộp về payment_received_at):
//   1. ZaloPay:  có zalopay_trans_id (callback thành công)
//   2. Legacy:   cash + status='paid' (dữ liệu cũ, code mới không ghi nữa)
//   3. Mới:      cash/bank_transfer + payment_received_at (owner đã xác nhận)
// Đơn cancelled không bao giờ tính.

export type MoneyFields = {
  payment_method: string
  status: string
  zalopay_trans_id: string | null
  payment_received_at: string | null
}

export function hasRealMoney(o: MoneyFields): boolean {
  if (o.status === 'cancelled') return false

  if (o.payment_method === 'zalopay') return o.zalopay_trans_id !== null

  if (o.payment_method === 'cash' && o.status === 'paid') return true

  if (o.payment_method === 'cash' || o.payment_method === 'bank_transfer') {
    return o.payment_received_at !== null
  }

  return false
}

// Đơn đã vào bếp/đang phục vụ nhưng chưa thu được tiền.
export function isAwaitingPayment(o: MoneyFields): boolean {
  if (o.status === 'cancelled' || o.status === 'paid') return false
  if (o.payment_method !== 'cash' && o.payment_method !== 'bank_transfer') return false
  return o.payment_received_at === null
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

```bash
cd admin-web && npx vitest run lib/revenue.test.ts
```
Expected: 8 passed.

- [ ] **Step 5: Thay chỗ tính lại ở trang Đơn hàng**

Mở `admin-web/app/admin/orders/page.tsx`, tìm dòng ~65:

```ts
    (o.payment_method === 'cash' && o.status === 'paid')
```

Thay toàn bộ biểu thức tính "đã có tiền" tại chỗ đó bằng `hasRealMoney(o)`, và biểu thức
`isCashUnpaid` ở dòng ~94 bằng `isAwaitingPayment(order)`. Thêm import:

```ts
import { hasRealMoney, isAwaitingPayment } from '@/lib/revenue'
```

- [ ] **Step 6: Thay chỗ tính lại ở dashboard**

Mở `admin-web/app/admin/dashboard/page.tsx`, tìm biểu thức dùng `zalopay_trans_id`, thay bằng
`hasRealMoney(o)` + import như trên.

- [ ] **Step 7: Type-check + test lại**

```bash
cd admin-web && npx tsc --noEmit && npx vitest run
```
Expected: không lỗi type, toàn bộ test pass.

- [ ] **Step 8: Commit**

```bash
git add admin-web/lib/revenue.ts admin-web/lib/revenue.test.ts \
        admin-web/app/admin/orders/page.tsx admin-web/app/admin/dashboard/page.tsx
git commit -m "refactor(admin): gop luat doanh thu ve lib/revenue.ts (TDD)"
```

---

## Task 12: Regression — không được làm hỏng thứ đang chạy

**Files:** không sửa gì. Đây là bước kiểm.

- [ ] **Step 1: `create_order` của khách vẫn chạy, và vẫn từ chối `bank_transfer`**

> **Chữ ký thật** (`027:169-175`) — 11 tham số, và **RETURNS jsonb**, không phải uuid:
> `create_order(p_store_id, p_table_id, p_items, p_payment_method, p_zalo_user_id, p_note,`
> `p_order_type, p_customer_name, p_customer_phone, p_delivery_address, p_voucher_code)`.
> Sáu tham số đầu là đủ, phần còn lại có default.

```sql
begin;
do $$
declare v_store uuid; v_table uuid; v_item uuid; v_res jsonb;
begin
  select id into v_store from stores where is_active limit 1;
  select id into v_table from tables where store_id = v_store and is_active limit 1;
  select id into v_item  from menu_items where store_id = v_store and is_available limit 1;

  -- Khách đặt cash: vẫn phải chạy. create_order RETURNS jsonb.
  v_res := create_order(v_store, v_table,
    jsonb_build_array(jsonb_build_object('menu_item_id', v_item, 'quantity', 1)),
    'cash', null, null);
  raise notice 'REG 1 create_order cash: PASS';

  -- Khách KHÔNG được dùng bank_transfer (§4.1: staff-only tới hết SA-5)
  begin
    perform create_order(v_store, v_table,
      jsonb_build_array(jsonb_build_object('menu_item_id', v_item, 'quantity', 1)),
      'bank_transfer', null, null);
    raise exception 'SAI: khach dat duoc bank_transfer';
  exception when raise_exception then
    if sqlerrm like 'SAI:%' then raise; end if;
    raise notice 'REG 2 create_order chan bank_transfer: PASS';
  end;
end $$;
rollback;
```

Expected: `REG 1`, `REG 2` PASS.

> `create_order` ở `027:182` đã có `IF p_payment_method NOT IN ('zalopay','cash')` → tự chặn.
> **Không sửa nó** ở SA-1.

- [ ] **Step 2: Đơn staff không lọt vào vòng quay**

```sql
begin;
do $$
declare v_store uuid; v_table uuid; v_order uuid; v_state jsonb;
begin
  select id into v_store from stores limit 1;
  select id into v_table from tables where store_id = v_store limit 1;
  insert into orders (store_id, table_id, total_amount, payment_method, status,
                      order_source, payment_received_at)
  values (v_store, v_table, 50000, 'bank_transfer', 'ready', 'staff', now())
  returning id into v_order;

  v_state := get_spin_state(v_order);
  if (v_state->>'status') <> 'not_eligible' then
    raise exception 'SAI: don staff quay duoc vong quay, status=%', v_state->>'status';
  end if;
  raise notice 'REG 3 don staff khong quay duoc: PASS';
end $$;
rollback;
```

Expected: `REG 3` PASS.

> Vì sao tự đúng: `get_spin_state` (`027:287`) tính
> `v_paid := (zalopay AND trans_id) OR (cash AND paid)` — không biết `bank_transfer`, nên đơn
> staff rơi vào `not_eligible`. **Đây là hành vi mong muốn** (đơn staff không có
> `zalo_user_id`, khách không ở trong app, không ai quay được).
> **KHÔNG "sửa" `get_spin_state` ở SA-1.** PM-1 mới đụng, và khi đó phải thêm điều kiện
> `order_source='customer_zalo'` (Rủi ro #6 của spec multi-method).

- [ ] **Step 3: Owner vẫn làm được mọi việc như trước**

```sql
begin;
do $$
declare v_owner uuid; v_store uuid; v_item uuid; v_n int;
begin
  select user_id, store_id into v_owner, v_store
  from mevo_operators where role = 'store_owner' limit 1;
  if v_owner is null then raise notice 'REG 4 BO QUA: chua co store_owner nao'; return; end if;

  select id into v_item from menu_items where store_id = v_store limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner, 'role','authenticated')::text, true);

  update menu_items set sort_order = sort_order where id = v_item;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'SAI: owner khong sua duoc menu nua'; end if;
  raise notice 'REG 4 owner van sua duoc menu: PASS';

  reset role;
  perform set_config('request.jwt.claims', null, true);
end $$;
rollback;
```

Expected: `REG 4` PASS. **Fail = migration khoá nhầm chủ quán** — nghiêm trọng, sửa ngay.

- [ ] **Step 4: Kiểm bằng tay trên admin web**

Đăng nhập `/admin` bằng tài khoản chủ quán thật:
- Trang Menu: sửa giá một món → lưu được.
- Trang Bàn: thêm/xoá một bàn test → được.
- Trang Ưu đãi: tạo một mã shipper → được.
- Trang Đơn hàng + Dashboard: **hai số doanh thu khớp nhau**.

- [ ] **Step 5: Commit (nếu có sửa gì)**

```bash
git add -A && git commit -m "test: regression SA-1 - create_order, spin, quyen owner"
```

---

## Điểm dừng SA-1

**Theo `CLAUDE.md`: dừng ở đây. KHÔNG tự chuyển sang SA-2.**

Báo anh Tú:

> Xong SA-1 rồi anh. Test theo `TESTING.md` — Sprint SA-1 nhé.
> Script tự động: chạy `docs/superpowers/plans/sa1-verify.sql` → phải thấy 12 PASS, không có `SAI:`.
> Kiểm tay: đăng nhập `/admin` bằng tài khoản chủ quán, sửa giá món + tạo mã shipper — phải vẫn làm được như trước.

Chờ **PASS** rồi mới đi tiếp.

### Cách tạo một tài khoản staff để thử (chạy bằng service role)

```sql
-- 1) Tạo user trong Supabase Auth (Dashboard → Authentication → Add user)
-- 2) Gắn role:
insert into mevo_operators (user_id, store_id, role)
values ('<user-id-vua-tao>', '<store-id>', 'store_staff');
```

Tài khoản này **chưa dùng được gì** cho tới SA-3 (UI `/staff`). Ở SA-1 nó chỉ để chứng minh
các test ở Task 9 chặn đúng.

---

## Cập nhật `TESTING.md`

- [ ] Thêm mục Sprint SA-1 vào `TESTING.md`:

```markdown
## Sprint SA-1 — Database, role và RPC

Sprint này không có UI. Kiểm bằng script + đối chiếu quyền chủ quán.

**Test 1 — Script tự động**
Chạy `docs/superpowers/plans/sa1-verify.sql` qua Supabase.
PASS = 12 dòng notice `PASS`, không dòng nào `SAI:`.

**Test 2 — Chủ quán không bị khoá nhầm**
Đăng nhập `/admin` bằng tài khoản chủ quán thật:
- [ ] Sửa giá một món → lưu được
- [ ] Thêm rồi xoá một bàn test → được
- [ ] Tạo một mã shipper ở trang Ưu đãi → được

**Test 3 — Doanh thu khớp**
- [ ] Số doanh thu ở Dashboard = số ở trang Đơn hàng

**Test 4 — Khách vẫn đặt được món**
- [ ] Mở mini-app, đặt một đơn tiền mặt → vào bếp bình thường
- [ ] Đặt một đơn ZaloPay → thanh toán → vào bếp bình thường
```

- [ ] Commit:

```bash
git add TESTING.md && git commit -m "docs: checklist test Sprint SA-1"
```
