-- 029_staff_active_toggle.sql — Bật/tắt (vô hiệu hoá + bật lại) tài khoản nhân viên.
--
-- SA-2 bản đầu "vô hiệu hoá = xoá row mevo_operators" (biến mất). Theo yêu cầu: giữ tài khoản,
-- chỉ TẮT rồi BẬT lại được. Thêm cột is_active + siết mọi cửa quyền phải đọc is_active để nhân
-- viên đã tắt mất quyền NGAY ở tầng DB (không chỉ ở web app).
--
-- Nhân viên đã tắt (is_active=false) phải:
--   - không đăng nhập được vào /staff (app đọc is_active);
--   - không đọc được dữ liệu quán qua REST  → is_store_scoped_operator (SELECT);
--   - không ghi được gì                       → is_store_owner_or_admin (WRITE);
--   - không đặt món hộ được                    → staff_create_order (SECURITY DEFINER, tự đọc operator).
--
-- Owner/superadmin mặc định is_active=true nên không đổi hành vi.

-- 1) Cột trạng thái. Mọi operator hiện có = đang bật.
alter table mevo_operators
  add column if not exists is_active boolean not null default true;

-- 2) Helper SELECT (staff đọc dữ liệu quán) — thêm điều kiện is_active.
create or replace function is_store_scoped_operator(target_store_id uuid)
  returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from mevo_operators
    where user_id = auth.uid()
      and is_active
      and (role = 'mevo_superadmin' or store_id = target_store_id)
  );
$$;

-- 3) Helper WRITE (owner/superadmin ghi) — thêm điều kiện is_active.
create or replace function is_store_owner_or_admin(target_store_id uuid)
  returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from mevo_operators
    where user_id = auth.uid()
      and is_active
      and (
        role = 'mevo_superadmin'
        or (role = 'store_owner' and store_id = target_store_id)
      )
  );
$$;

-- 4) staff_create_order — CHỈ đổi 1 chỗ: operator lookup thêm `and is_active`.
--    (Giữ nguyên toàn bộ logic còn lại của bản prod hiện tại.)
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
  -- 1) Ai đang gọi? store_id suy từ operator, KHÔNG tin client. Nhân viên đã tắt (is_active=false)
  --    coi như không có quyền.
  select store_id, role into v_store, v_role
  from mevo_operators where user_id = v_uid and is_active;
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
