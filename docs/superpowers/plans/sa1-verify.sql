-- ============================================================================
-- sa1-verify.sql — Bằng chứng SA-1 (Task 9)
--
-- CHẠY THẾ NÀO: dán TOÀN BỘ file này vào Supabase MCP execute_sql
-- (project dlkgdpexjtyynbotkwka). KHÔNG dùng apply_migration.
--
-- Script tự bọc `begin; ... rollback;` → chạy lặp lại bao nhiêu lần cũng được,
-- KHÔNG để lại gì trong DB (kể cả nội dung migration 028 nhúng ở PHẦN A).
--
-- ĐỌC KẾT QUẢ: PASS = MỌI dòng kết thúc bằng ': OK'.
--              Bất kỳ dòng nào chứa 'SAI:' = migration có lỗi thật.
--
-- ⚠️ CẠM BẪY SỐ 1 CỦA TEST RLS: script chạy bằng `postgres` (superuser) → RLS
-- bị BỎ QUA hoàn toàn. Test RLS mà quên `set local role authenticated` thì mọi
-- UPDATE đều thành công và test PASS GIẢ. Vì vậy mọi test RLS ở đây đều
-- `set local role authenticated` trước, và SANITY 0 tự chứng minh việc set role
-- thật sự có tác dụng (staff bị chặn / postgres thì không).
--   - Test RLS  → cần CẢ `set local role authenticated` LẪN request.jwt.claims
--   - Test RPC  → SECURITY DEFINER nên chỉ cần request.jwt.claims (cho auth.uid())
--
-- Ghi chú kỹ thuật: bảng sa1_res phải `disable row level security` — DB này có
-- event trigger tự bật RLS cho mọi bảng mới trong schema public, không tắt thì
-- chính bảng kết quả cũng chặn ghi khi đang ở role authenticated.
-- ============================================================================

begin;

-- ############################################################################
-- PHẦN A — Nhúng nguyên văn supabase/migrations/028_staff_assisted_ordering.sql
--          (prod CHƯA có 028; Task 8 mới lo việc áp thật)
-- ############################################################################

-- 1) Helper GHI: có đọc role.
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

-- 2) Viết lại MỌI policy GHI sang helper có kiểm role.
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

drop policy if exists "auth_insert_menu_categories" on menu_categories;
create policy "auth_insert_menu_categories" on menu_categories
  for insert to authenticated with check (is_store_owner_or_admin(store_id));

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

drop policy if exists "auth_update_orders" on orders;
create policy "auth_update_orders" on orders
  for update to authenticated
  using (is_store_owner_or_admin(store_id))
  with check (is_store_owner_or_admin(store_id));

drop policy if exists "op_all_spin_rewards" on spin_rewards;
create policy "op_all_spin_rewards" on spin_rewards
  for all to authenticated
  using (is_store_owner_or_admin(store_id))
  with check (is_store_owner_or_admin(store_id));

drop policy if exists "op_update_spin_results" on spin_results;
create policy "op_update_spin_results" on spin_results
  for update to authenticated
  using (is_store_owner_or_admin(store_id))
  with check (is_store_owner_or_admin(store_id));

drop policy if exists "op_all_vouchers" on vouchers;
create policy "op_all_vouchers" on vouchers
  for all to authenticated
  using (is_store_owner_or_admin(store_id))
  with check (is_store_owner_or_admin(store_id));

-- 3) Guard trong RPC redeem_spin_result
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

-- 4) Nới role — CHỈ sau khi policy ghi đã siết.
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

-- 5) Mở payment_method: thêm bank_transfer
alter table orders drop constraint if exists orders_payment_method_check;
alter table orders
  add constraint orders_payment_method_check
  check (payment_method in ('zalopay','cash','bank_transfer'));

-- 6) Cột audit + idempotency
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

create unique index if not exists orders_store_client_request_unique
  on orders(store_id, client_request_id)
  where client_request_id is not null;

-- 7) RPC: nhân viên đặt món hộ khách.
create or replace function staff_create_order(
  p_table_id          uuid,
  p_items             jsonb,
  p_payment_method    text,
  p_client_request_id uuid,
  p_note              text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid          uuid := auth.uid();
  v_store        uuid;
  v_role         text;
  v_order_id     uuid;
  v_total        int := 0;
  v_item         jsonb;
  v_menu         menu_items%rowtype;
  v_qty          int;
  v_topping_ids  uuid[];
  v_item_tops    jsonb;
  v_top_total    int;
  v_top_count    int;
begin
  select store_id, role into v_store, v_role
  from mevo_operators where user_id = v_uid;
  if v_store is null or v_role not in ('store_owner','store_staff') then
    raise exception 'Không có quyền đặt món hộ';
  end if;

  if p_client_request_id is null then
    raise exception 'Thiếu client_request_id';
  end if;

  select id into v_order_id from orders
  where store_id = v_store and client_request_id = p_client_request_id;
  if v_order_id is not null then
    return jsonb_build_object(
      'order_id',   v_order_id,
      'total',      (select total_amount from orders where id = v_order_id),
      'idempotent', true,
      'items',      coalesce((select jsonb_agg(to_jsonb(oi))
                              from order_items oi where oi.order_id = v_order_id), '[]'::jsonb)
    );
  end if;

  if not store_accepting_now(v_store) then
    raise exception 'Quán đang tạm nghỉ hoặc ngoài giờ phục vụ';
  end if;

  if not exists (
    select 1 from tables
    where id = p_table_id and store_id = v_store and is_active
  ) then
    raise exception 'Bàn không thuộc quán hoặc đã ngừng dùng';
  end if;

  if p_payment_method not in ('cash','bank_transfer') then
    raise exception 'Phương thức không hợp lệ cho đơn đặt hộ: %', p_payment_method;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Đơn phải có ít nhất một món';
  end if;

  insert into orders (
    store_id, table_id, total_amount, payment_method, status,
    note, order_source, created_by, client_request_id
  ) values (
    v_store, p_table_id, 0, p_payment_method, 'pending',
    p_note, 'staff', v_uid, p_client_request_id
  )
  on conflict (store_id, client_request_id) where client_request_id is not null
  do nothing
  returning id into v_order_id;

  if v_order_id is null then
    select id into v_order_id from orders
    where store_id = v_store and client_request_id = p_client_request_id;
    return jsonb_build_object(
      'order_id',   v_order_id,
      'total',      (select total_amount from orders where id = v_order_id),
      'idempotent', true,
      'items',      coalesce((select jsonb_agg(to_jsonb(oi))
                              from order_items oi where oi.order_id = v_order_id), '[]'::jsonb)
    );
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty <= 0 then raise exception 'Số lượng không hợp lệ'; end if;

    select * into v_menu from menu_items
    where id = (v_item->>'menu_item_id')::uuid
      and store_id = v_store
      and is_available = true;
    if not found then
      raise exception 'Món không thuộc quán hoặc ngừng bán: %', v_item->>'menu_item_id';
    end if;

    v_item_tops := '[]'::jsonb; v_top_total := 0;
    if v_item ? 'topping_ids' and jsonb_typeof(v_item->'topping_ids') = 'array'
       and jsonb_array_length(v_item->'topping_ids') > 0 then
      select array_agg(distinct value::uuid) into v_topping_ids
        from jsonb_array_elements_text(v_item->'topping_ids');
      select
        coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'price',t.price)
                 order by t.sort_order, t.created_at), '[]'::jsonb),
        coalesce(sum(t.price),0), count(*)
      into v_item_tops, v_top_total, v_top_count
      from toppings t
      join menu_item_toppings mit on mit.topping_id = t.id and mit.menu_item_id = v_menu.id
      where t.id = any(v_topping_ids) and t.store_id = v_store and t.is_available = true;
      if v_top_count <> array_length(v_topping_ids,1) then
        raise exception 'Topping không hợp lệ / chưa gán cho món / ngừng bán: %', v_menu.name;
      end if;
    end if;

    insert into order_items (order_id, menu_item_id, item_name, item_price, quantity, note, selected_toppings)
    values (v_order_id, v_menu.id, v_menu.name, v_menu.price, v_qty,
            nullif(v_item->>'note',''), v_item_tops);

    v_total := v_total + (v_menu.price + v_top_total) * v_qty;
  end loop;

  update orders set total_amount = v_total where id = v_order_id;

  return jsonb_build_object(
    'order_id',   v_order_id,
    'total',      v_total,
    'idempotent', false,
    'items',      coalesce((select jsonb_agg(to_jsonb(oi))
                            from order_items oi where oi.order_id = v_order_id), '[]'::jsonb)
  );
end $$;

revoke all on function staff_create_order(uuid, jsonb, text, uuid, text) from public;
revoke all on function staff_create_order(uuid, jsonb, text, uuid, text) from anon;
grant execute on function staff_create_order(uuid, jsonb, text, uuid, text) to authenticated;

-- 8) RPC: chủ quán xác nhận đã nhận tiền.
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
revoke all on function confirm_manual_payment(uuid) from anon;
grant execute on function confirm_manual_payment(uuid) to authenticated;

-- 9) Doanh thu: thêm nhánh bank_transfer/cash đã xác nhận tay.
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
        or (payment_method = 'cash' and status = 'paid')
        or (payment_method in ('cash','bank_transfer')
            and payment_received_at is not null and status <> 'cancelled')
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

-- ############################################################################
-- PHẦN B — Bảng kết quả + dữ liệu giả
-- ############################################################################

create table sa1_res (id numeric primary key, ket_qua text);
-- DB này tự bật RLS cho bảng mới trong public → phải tắt, không thì chính
-- bảng kết quả chặn ghi khi đang ở role authenticated.
alter table sa1_res disable row level security;
grant all on sa1_res to authenticated;

-- 2 quán, 1 owner quán A, 1 staff quán A, 2 bàn quán A, 1 bàn quán B, 1 món 50k.
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'sa1-owner@test.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'sa1-staff@test.local');

insert into stores (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'SA1 Quán A', 'sa1-test-quan-a'),
  ('22222222-2222-2222-2222-222222222222', 'SA1 Quán B', 'sa1-test-quan-b');

-- role='store_staff' CHỈ insert được sau khi PHẦN A nới constraint (mục 4).
insert into mevo_operators (user_id, store_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', 'store_owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', 'store_staff');

insert into tables (id, store_id, table_number, is_active) values
  ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'A1', true),
  -- bàn A2 KHÔNG bao giờ có đơn → TEST 9c đo đúng RLS, không dính lỗi FK
  ('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', 'A2', true),
  ('44444444-4444-4444-4444-444444444441', '22222222-2222-2222-2222-222222222222', 'B1', true);

insert into menu_items (id, store_id, name, price, is_available) values
  ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', 'Phở gà SA1', 50000, true);

-- ############################################################################
-- PHẦN C — Các test
-- ############################################################################

do $test$
declare
  c_store_a  constant uuid := '11111111-1111-1111-1111-111111111111';
  c_store_b  constant uuid := '22222222-2222-2222-2222-222222222222';
  c_owner    constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  c_staff    constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
  c_table_a  constant uuid := '33333333-3333-3333-3333-333333333331';
  c_table_a2 constant uuid := '33333333-3333-3333-3333-333333333332';
  c_table_b  constant uuid := '44444444-4444-4444-4444-444444444441';
  c_menu_a   constant uuid := '55555555-5555-5555-5555-555555555551';

  v_n        int;
  v_n2       int;
  v_order_a  uuid;
  v_order_b  uuid;
  v_order_bt uuid;
  v_res      jsonb;
  v_res2     jsonb;
  v_pra1     timestamptz;
  v_pra2     timestamptz;
  v_crid     uuid := '66666666-6666-6666-6666-666666666661';
  v_crid2    uuid := '66666666-6666-6666-6666-666666666662';
  v_rev0     bigint;
  v_rev1     bigint;
  v_rev2     bigint;
  v_price    int;
begin

-- Đơn sẵn có để test: 1 đơn quán A (cash), 1 đơn quán B.
insert into orders (store_id, table_id, total_amount, payment_method, status)
values (c_store_a, c_table_a, 50000, 'cash', 'pending') returning id into v_order_a;
insert into orders (store_id, table_id, total_amount, payment_method, status)
values (c_store_b, c_table_b, 90000, 'cash', 'pending') returning id into v_order_b;

-- ========================================================================
-- SANITY 0 — CHỨNG MINH `set local role` THẬT SỰ CÓ TÁC DỤNG.
-- Cùng một câu UPDATE: staff+authenticated phải 0 dòng, postgres phải >0 dòng.
-- Cả hai đều >0 ⇒ set role không ăn ⇒ TOÀN BỘ script vô giá trị (BLOCKED).
-- ========================================================================
perform set_config('request.jwt.claims',
  json_build_object('sub', c_staff, 'role', 'authenticated')::text, true);
execute 'set local role authenticated';
update menu_items set price = 1 where id = c_menu_a;
get diagnostics v_n = row_count;

execute 'set local role postgres';
update menu_items set price = 1 where id = c_menu_a;
get diagnostics v_n2 = row_count;
update menu_items set price = 50000 where id = c_menu_a;  -- trả giá về 50k

insert into sa1_res values (0, case
  when v_n = 0 and v_n2 > 0
    then 'SANITY 0 — set role co tac dung (staff=0 dong, postgres=' || v_n2 || ' dong): OK'
  when v_n > 0 and v_n2 > 0
    then 'SANITY 0 — SAI: BLOCKED! set role KHONG an, RLS bi bo qua (staff='
         || v_n || ' dong). Moi test RLS duoi day vo nghia.'
  else 'SANITY 0 — SAI: ket qua la (staff=' || v_n || ', postgres=' || v_n2 || ')'
end);

-- ========================================================================
-- TEST 1 — staff KHÔNG sửa được giá món của CHÍNH quán mình
-- ========================================================================
perform set_config('request.jwt.claims',
  json_build_object('sub', c_staff, 'role', 'authenticated')::text, true);
execute 'set local role authenticated';
update menu_items set price = 1 where id = c_menu_a;
get diagnostics v_n = row_count;
execute 'set local role postgres';
select price into v_price from menu_items where id = c_menu_a;

insert into sa1_res values (1, case
  when v_n = 0 and v_price = 50000
    then 'TEST 1 — staff KHONG sua duoc gia mon (row_count=0, gia van 50000): OK'
  else 'TEST 1 — SAI: staff sua duoc gia mon! row_count=' || v_n || ', gia=' || v_price
end);

-- ========================================================================
-- TEST 2 — staff KHÔNG tạo được mã giảm giá (nguy hiểm nhất: giảm 100% = trộm tiền)
-- ========================================================================
perform set_config('request.jwt.claims',
  json_build_object('sub', c_staff, 'role', 'authenticated')::text, true);
execute 'set local role authenticated';
begin
  insert into vouchers (store_id, code, kind, label, discount_type, discount_value)
  values (c_store_a, 'SA1HACK', 'shipper', 'Staff tu tao', 'percent', 100);
  insert into sa1_res values (2,
    'TEST 2 — SAI: staff TAO DUOC ma giam gia 100%! vouchers khong bi chan.');
exception when others then
  insert into sa1_res values (2,
    'TEST 2 — staff KHONG tao duoc ma giam gia (bi chan: ' || sqlerrm || '): OK');
end;
execute 'set local role postgres';

-- ========================================================================
-- TEST 3 — staff KHÔNG tự set payment_received_at qua UPDATE trực tiếp
-- ========================================================================
perform set_config('request.jwt.claims',
  json_build_object('sub', c_staff, 'role', 'authenticated')::text, true);
execute 'set local role authenticated';
update orders set payment_received_at = now() where id = v_order_a;
get diagnostics v_n = row_count;
execute 'set local role postgres';
select payment_received_at into v_pra1 from orders where id = v_order_a;

insert into sa1_res values (3, case
  when v_n = 0 and v_pra1 is null
    then 'TEST 3 — staff KHONG tu set duoc payment_received_at (row_count=0): OK'
  else 'TEST 3 — SAI: staff tu danh dau da nhan tien! row_count=' || v_n
       || ', payment_received_at=' || coalesce(v_pra1::text, 'NULL')
end);

-- ========================================================================
-- TEST 4 — staff gọi confirm_manual_payment → phải bị từ chối
-- ========================================================================
perform set_config('request.jwt.claims',
  json_build_object('sub', c_staff, 'role', 'authenticated')::text, true);
execute 'set local role authenticated';
begin
  v_res := confirm_manual_payment(v_order_a);
  insert into sa1_res values (4,
    'TEST 4 — SAI: staff goi confirm_manual_payment THANH CONG! tra ve ' || v_res::text);
exception when others then
  insert into sa1_res values (4, case
    when sqlerrm like '%Chỉ chủ quán%'
      then 'TEST 4 — staff goi confirm_manual_payment bi tu choi ("' || sqlerrm || '"): OK'
    else 'TEST 4 — SAI: raise nhung sai thong bao: ' || sqlerrm
  end);
end;
execute 'set local role postgres';

-- ========================================================================
-- TEST 5 — owner gọi confirm_manual_payment được; gọi lần 2 idempotent
-- ========================================================================
perform set_config('request.jwt.claims',
  json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
execute 'set local role authenticated';
v_res := confirm_manual_payment(v_order_a);
execute 'set local role postgres';
select payment_received_at into v_pra1 from orders where id = v_order_a;

perform pg_sleep(0.01);  -- để now() lần 2 khác lần 1 nếu bị ghi đè (now() cố định trong txn nhưng vẫn giữ cho chắc)

perform set_config('request.jwt.claims',
  json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
execute 'set local role authenticated';
v_res2 := confirm_manual_payment(v_order_a);
execute 'set local role postgres';
select payment_received_at into v_pra2 from orders where id = v_order_a;

insert into sa1_res values (5, case
  when (v_res->>'ok')::boolean and not (v_res->>'already')::boolean
       and v_pra1 is not null
       and (v_res2->>'ok')::boolean and (v_res2->>'already')::boolean
       and v_pra2 = v_pra1
    then 'TEST 5 — owner xac nhan duoc (already=false), goi lai already=true va '
         || 'payment_received_at KHONG doi: OK'
  else 'TEST 5 — SAI: lan1=' || v_res::text || ', lan2=' || v_res2::text
       || ', pra1=' || coalesce(v_pra1::text,'NULL') || ', pra2=' || coalesce(v_pra2::text,'NULL')
end);

-- ========================================================================
-- TEST 6 — staff_create_order: giá LẤY TỪ DB, không tin client.
-- Client gửi item_price bịa = 1, quantity 2, món giá 50000 → total phải = 100000.
-- ========================================================================
perform set_config('request.jwt.claims',
  json_build_object('sub', c_staff, 'role', 'authenticated')::text, true);
execute 'set local role authenticated';
v_res := staff_create_order(
  c_table_a,
  jsonb_build_array(jsonb_build_object(
    'menu_item_id', c_menu_a, 'quantity', 2, 'item_price', 1)),
  'cash',
  v_crid,
  null);
execute 'set local role postgres';

insert into sa1_res values (6, case
  when (v_res->>'total')::int = 100000
    then 'TEST 6 — staff_create_order bo qua item_price bia, total=100000 (2 x 50000 tu DB): OK'
  else 'TEST 6 — SAI: total=' || coalesce(v_res->>'total','NULL') || ' (ky vong 100000). '
       || 'Gia co the dang lay tu client! response=' || v_res::text
end);

-- ========================================================================
-- TEST 7 — staff_create_order idempotent theo client_request_id
-- ========================================================================
perform set_config('request.jwt.claims',
  json_build_object('sub', c_staff, 'role', 'authenticated')::text, true);
execute 'set local role authenticated';
v_res := staff_create_order(
  c_table_a,
  jsonb_build_array(jsonb_build_object('menu_item_id', c_menu_a, 'quantity', 1)),
  'cash', v_crid2, null);
v_res2 := staff_create_order(
  c_table_a,
  jsonb_build_array(jsonb_build_object('menu_item_id', c_menu_a, 'quantity', 1)),
  'cash', v_crid2, null);
execute 'set local role postgres';

select count(*) into v_n from orders
 where store_id = c_store_a and client_request_id = v_crid2;
select count(*) into v_n2 from order_items
 where order_id = (v_res->>'order_id')::uuid;

insert into sa1_res values (7, case
  when (v_res->>'order_id') = (v_res2->>'order_id')
       and not (v_res->>'idempotent')::boolean
       and (v_res2->>'idempotent')::boolean
       and v_n = 1 and v_n2 = 1
    then 'TEST 7 — goi 2 lan cung client_request_id: cung order_id, lan2 idempotent=true, '
         || 'DB co dung 1 don + 1 order_items: OK'
  else 'TEST 7 — SAI: order_id1=' || coalesce(v_res->>'order_id','NULL')
       || ', order_id2=' || coalesce(v_res2->>'order_id','NULL')
       || ', idem1=' || coalesce(v_res->>'idempotent','NULL')
       || ', idem2=' || coalesce(v_res2->>'idempotent','NULL')
       || ', so don=' || v_n || ', so order_items=' || v_n2
end);

-- ========================================================================
-- TEST 8 — staff quán A đặt vào bàn của quán B → phải RAISE
-- ========================================================================
perform set_config('request.jwt.claims',
  json_build_object('sub', c_staff, 'role', 'authenticated')::text, true);
execute 'set local role authenticated';
begin
  v_res := staff_create_order(
    c_table_b,
    jsonb_build_array(jsonb_build_object('menu_item_id', c_menu_a, 'quantity', 1)),
    'cash', gen_random_uuid(), null);
  insert into sa1_res values (8,
    'TEST 8 — SAI: staff quan A dat duoc vao ban quan B! response=' || v_res::text);
exception when others then
  insert into sa1_res values (8, case
    when sqlerrm like '%Bàn không thuộc quán%'
      then 'TEST 8 — staff quan A KHONG dat duoc vao ban quan B ("' || sqlerrm || '"): OK'
    else 'TEST 8 — SAI: raise nhung sai thong bao: ' || sqlerrm
  end);
end;
execute 'set local role postgres';

-- ========================================================================
-- TEST 9 — staff_create_order với payment_method='zalopay' → phải RAISE
-- ========================================================================
perform set_config('request.jwt.claims',
  json_build_object('sub', c_staff, 'role', 'authenticated')::text, true);
execute 'set local role authenticated';
begin
  v_res := staff_create_order(
    c_table_a,
    jsonb_build_array(jsonb_build_object('menu_item_id', c_menu_a, 'quantity', 1)),
    'zalopay', gen_random_uuid(), null);
  insert into sa1_res values (9,
    'TEST 9 — SAI: staff tao duoc don zalopay! response=' || v_res::text);
exception when others then
  insert into sa1_res values (9, case
    when sqlerrm like '%Phương thức không hợp lệ%'
      then 'TEST 9 — staff KHONG tao duoc don zalopay ("' || sqlerrm || '"): OK'
    else 'TEST 9 — SAI: raise nhung sai thong bao: ' || sqlerrm
  end);
end;
execute 'set local role postgres';

-- ========================================================================
-- TEST 9b — staff quán A KHÔNG đọc được đơn của quán B
-- ========================================================================
perform set_config('request.jwt.claims',
  json_build_object('sub', c_staff, 'role', 'authenticated')::text, true);
execute 'set local role authenticated';
select count(*) into v_n from orders where id = v_order_b;
execute 'set local role postgres';

insert into sa1_res values (9.1, case
  when v_n = 0
    then 'TEST 9b — staff quan A KHONG doc duoc don quan B (count=0): OK'
  else 'TEST 9b — SAI: staff quan A doc duoc don quan B! count=' || v_n
end);

-- ========================================================================
-- TEST 9c — staff KHÔNG xoá được bàn của chính quán mình
-- (dùng bàn A2 — không có đơn nào tham chiếu → 0 dòng là do RLS, không phải FK)
-- ========================================================================
perform set_config('request.jwt.claims',
  json_build_object('sub', c_staff, 'role', 'authenticated')::text, true);
execute 'set local role authenticated';
delete from tables where id = c_table_a2;
get diagnostics v_n = row_count;
execute 'set local role postgres';
select count(*) into v_n2 from tables where id = c_table_a2;

insert into sa1_res values (9.2, case
  when v_n = 0 and v_n2 = 1
    then 'TEST 9c — staff KHONG xoa duoc ban quan minh (row_count=0, ban van con): OK'
  else 'TEST 9c — SAI: staff xoa duoc ban! row_count=' || v_n || ', ban con lai=' || v_n2
end);

-- ========================================================================
-- TEST 10 — doanh thu: đơn bank_transfer chưa xác nhận KHÔNG tính;
--           sau khi set payment_received_at thì tăng ĐÚNG 77000.
-- ========================================================================
select total_revenue into v_rev0 from get_daily_revenue(c_store_a, current_date);

insert into orders (store_id, table_id, total_amount, payment_method, status)
values (c_store_a, c_table_a, 77000, 'bank_transfer', 'pending') returning id into v_order_bt;

select total_revenue into v_rev1 from get_daily_revenue(c_store_a, current_date);

update orders set payment_received_at = now() where id = v_order_bt;

select total_revenue into v_rev2 from get_daily_revenue(c_store_a, current_date);

insert into sa1_res values (10, case
  when v_rev1 = v_rev0 and v_rev2 = v_rev0 + 77000
    then 'TEST 10 — don bank_transfer chua xac nhan KHONG vao doanh thu (' || v_rev0
         || '), xac nhan xong tang dung 77000 (-> ' || v_rev2 || '): OK'
  when v_rev1 <> v_rev0
    then 'TEST 10 — SAI: don bank_transfer CHUA xac nhan da vao doanh thu! '
         || v_rev0 || ' -> ' || v_rev1
  else 'TEST 10 — SAI: sau xac nhan doanh thu = ' || v_rev2
       || ' (ky vong ' || (v_rev0 + 77000) || ')'
end);

-- ========================================================================
-- TEST 11 — owner VẪN sửa được giá món (chống khoá nhầm chủ quán / phá /admin)
-- ========================================================================
perform set_config('request.jwt.claims',
  json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
execute 'set local role authenticated';
update menu_items set price = 60000 where id = c_menu_a;
get diagnostics v_n = row_count;
execute 'set local role postgres';
select price into v_price from menu_items where id = c_menu_a;

insert into sa1_res values (11, case
  when v_n = 1 and v_price = 60000
    then 'TEST 11 — owner VAN sua duoc gia mon (row_count=1, gia=60000): OK'
  else 'TEST 11 — SAI: migration khoa nham CHU QUAN, /admin se hong! row_count='
       || v_n || ', gia=' || v_price
end);

-- ========================================================================
-- TEST 12 — anon KHÔNG được EXECUTE 2 RPC staff
-- ========================================================================
insert into sa1_res values (12, case
  when not has_function_privilege('anon', 'staff_create_order(uuid,jsonb,text,uuid,text)', 'EXECUTE')
   and not has_function_privilege('anon', 'confirm_manual_payment(uuid)', 'EXECUTE')
    then 'TEST 12 — anon KHONG execute duoc staff_create_order va confirm_manual_payment: OK'
  else 'TEST 12 — SAI: anon con quyen EXECUTE! staff_create_order='
       || has_function_privilege('anon', 'staff_create_order(uuid,jsonb,text,uuid,text)', 'EXECUTE')::text
       || ', confirm_manual_payment='
       || has_function_privilege('anon', 'confirm_manual_payment(uuid)', 'EXECUTE')::text
end);

end $test$;

-- ############################################################################
-- PHẦN D — Kết quả. PASS = mọi dòng kết thúc ': OK', không dòng nào có 'SAI:'.
-- ############################################################################
select ket_qua from sa1_res order by id;

rollback;
