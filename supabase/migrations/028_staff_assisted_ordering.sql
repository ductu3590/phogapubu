-- 028 — Staff Assisted Ordering: RLS theo role, audit đơn, RPC đặt hộ.
--
-- THỨ TỰ TRONG FILE NÀY QUAN TRỌNG — siết quyền (mục 1-3) PHẢI đứng trước
-- khi nới role (mục 4). Đảo lại = có cửa sổ mà staff có quyền owner.
--   1) Helper phân quyền có đọc role
--   2) Viết lại 11 policy ghi sang helper đó
--   3) Guard trong RPC redeem_spin_result
--   4) Nới role cho phép 'store_staff'   ← chỉ sau khi 1-3 xong
--
-- Gốc rễ: is_store_scoped_operator() (019:6) KHÔNG đọc cột role — nó chỉ hỏi
-- "có phải operator của quán này không". Nên chỉ cần INSERT một dòng
-- role='store_staff' là nhân viên có ngay quyền ghi ngang chủ quán:
-- sửa giá món, xoá bàn, TỰ TẠO MÃ GIẢM GIÁ (vouchers FOR ALL), tự set
-- payment_received_at. Kể cả khi gọi thẳng Supabase REST, không qua admin-web.
--
-- ⚠️ HỆ QUẢ CHO SA-3 (UI staff): vouchers và spin_rewards chỉ có ĐÚNG MỘT
-- policy `authenticated` là `FOR ALL` — mà FOR ALL bao gồm cả SELECT. Nên sau
-- file này, store_staff KHÔNG ĐỌC được vouchers/spin_rewards qua REST, chứ
-- không chỉ mất quyền ghi. Hiện không phá gì (mini-app đọc voucher qua RPC
-- security definer, bếp có policy riêng, /admin/vouchers là màn của owner).
-- Nếu màn staff sau này cần hiện mã giảm giá → phải thêm policy SELECT riêng,
-- ĐỪNG nới FOR ALL trở lại.

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
-- qua REST, phá toàn bộ audit và quyền owner-only của confirm_manual_payment.
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
--    Lịch sử có 2 định nghĩa (025:161, 027:413) nhưng CÙNG chữ ký, nên
--    create-or-replace của 027 đã đè lên 025 → DB chỉ có MỘT hàm sống.
--    Đã xác minh bằng pg_proc: đây là hàm DUY NHẤT còn gọi helper cũ.
--    Bản 027 (đang chạy) cho cả bếp lẫn operator; giữ bếp, siết operator.
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

-- ============================================================
-- 5) Mở payment_method: thêm bank_transfer
-- ============================================================
alter table orders drop constraint if exists orders_payment_method_check;
alter table orders
  add constraint orders_payment_method_check
  check (payment_method in ('zalopay','cash','bank_transfer'));

-- stores.payment_methods: KHÔNG đụng vào.
--
-- ⚠️ LỆCH CÓ CHỦ Ý so với spec §4.1 (bảng ở đó bảo drop/recreate
--    stores_payment_methods_valid để thêm bank_transfer).
-- Lý do: stores.payment_methods là danh sách phương thức KHÁCH thấy trong
-- mini-app. bank_transfer là staff-only tới hết SA-5, và staff_create_order
-- không đọc cột này (nó tự whitelist cash|bank_transfer ở Task 5).
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
-- Partial index: đơn khách (client_request_id NULL) không bị ràng buộc.
create unique index if not exists orders_store_client_request_unique
  on orders(store_id, client_request_id)
  where client_request_id is not null;

-- ============================================================
-- 7) RPC: nhân viên đặt món hộ khách.
--    SECURITY DEFINER — staff KHÔNG có quyền INSERT orders trực tiếp (mục 2).
--
--    Cùng luật với create_order v5 (027:169), TRỪ voucher và TRỪ zalopay.
--    Ba chỗ BẮT BUỘC giống bản đang chạy, đừng "đơn giản hoá":
--      a) item_price = giá món CHƯA gồm topping; phụ thu topping nằm trong
--         selected_toppings. Cộng topping vào item_price = bếp/hoá đơn cộng
--         topping lần hai (spec 2026-06-30-menu-toppings-design.md §2.2).
--      b) Topping phải JOIN menu_item_toppings — topping đúng quán nhưng
--         chưa gán cho món này vẫn là topping bịa.
--      c) Đếm topping khớp số id gửi lên — id rác/đã tắt bị lọc âm thầm
--         thì khách bị tính thiếu tiền, không ai biết.
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
  -- 1) Ai đang gọi? store_id suy từ operator, KHÔNG tin client.
  select store_id, role into v_store, v_role
  from mevo_operators where user_id = v_uid;
  if v_store is null or v_role not in ('store_owner','store_staff') then
    raise exception 'Không có quyền đặt món hộ';
  end if;

  -- client_request_id là khoá chống trùng. NULL = partial index không áp,
  -- bấm hai lần thành hai đơn. Bắt buộc có.
  if p_client_request_id is null then
    raise exception 'Thiếu client_request_id';
  end if;

  -- 2) Idempotent: request cũ thì trả đơn cũ, không tạo thêm.
  --    Trả ĐỦ total + items như lần đầu — retry sau lỗi mạng cũng phải đủ
  --    dữ liệu để UI hiện màn thành công.
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

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Đơn phải có ít nhất một món';
  end if;

  -- 6) Tạo đơn. total_amount tính ở bước 7, tạm 0.
  --    order_source/created_by do SERVER gán — client không gửi được.
  --    ON CONFLICT phải kèm WHERE khớp predicate của partial index (mục 6)
  --    thì Postgres mới suy ra được index đó.
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

  -- Hai request đồng thời cùng client_request_id: cái thua race rơi vào đây.
  -- Trả đơn của cái thắng, KHÔNG insert order_items lần hai.
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

  -- 7) Từng món: giá LẤY TỪ DB, không tin client.
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

    -- Topping: giá + tên lấy từ DB, chặn topping quán khác / đã tắt /
    -- chưa gán cho món này.
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

    -- Snapshot tên + giá lúc order (CLAUDE.md quy tắc bắt buộc).
    -- item_price = giá món, CHƯA gồm topping — xem chú thích (a) đầu mục 7.
    insert into order_items (order_id, menu_item_id, item_name, item_price, quantity, note, selected_toppings)
    values (v_order_id, v_menu.id, v_menu.name, v_menu.price, v_qty,
            nullif(v_item->>'note',''), v_item_tops);

    v_total := v_total + (v_menu.price + v_top_total) * v_qty;
  end loop;

  update orders set total_amount = v_total where id = v_order_id;

  -- 8) Trả đủ để UI hiện ngay, không phải query lại
  return jsonb_build_object(
    'order_id',   v_order_id,
    'total',      v_total,
    'idempotent', false,
    'items',      coalesce((select jsonb_agg(to_jsonb(oi))
                            from order_items oi where oi.order_id = v_order_id), '[]'::jsonb)
  );
end $$;

-- ⚠️ `revoke ... from public` KHÔNG đủ ở Supabase. ALTER DEFAULT PRIVILEGES của
-- Supabase cấp EXECUTE THẲNG cho `anon` (và service_role) trên MỌI function mới
-- trong schema public — đã xác minh bằng pg_default_acl. Grant thẳng cho role thì
-- revoke từ `public` không gỡ được. Không revoke anon = mini-app cầm anon key gọi
-- được staff_create_order. Hiện chưa khai thác được (auth.uid() null → không có
-- dòng mevo_operators → raise), nhưng đó là phòng tuyến DUY NHẤT — đừng bỏ lớp thứ hai.
revoke all on function staff_create_order(uuid, jsonb, text, uuid, text) from public;
revoke all on function staff_create_order(uuid, jsonb, text, uuid, text) from anon;
grant execute on function staff_create_order(uuid, jsonb, text, uuid, text) to authenticated;
