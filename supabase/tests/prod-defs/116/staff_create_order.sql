CREATE OR REPLACE FUNCTION public.staff_create_order(p_table_id uuid, p_items jsonb, p_payment_method text, p_client_request_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
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
  v_timing       text;
  v_session_id   uuid;
  v_instrument   text;
  v_variant      menu_item_variants%ROWTYPE;
  v_variant_id   uuid;
  v_variant_cnt  int;
  v_item_price   int;
  v_item_name    text;
  v_variant_name text;
  v_orig_price   int;
  v_menu_discount_id uuid;
BEGIN
  select store_id, role into v_store, v_role
  from mevo_operators where user_id = v_uid and is_active;
  if v_store is null or v_role not in ('store_owner','store_staff','store_cashier') then
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

  if not exists (
    select 1 from tables
    where id = p_table_id and store_id = v_store and is_active
  ) then
    raise exception 'Bàn không thuộc quán hoặc đã ngừng dùng';
  end if;

  select payment_timing into v_timing from stores where id = v_store;

  if v_timing = 'postpay' then
    p_payment_method := 'cash';
    v_instrument     := null;

    perform lock_table_for_session(p_table_id);
    v_session_id := open_session_id_for_table(p_table_id);
    if v_session_id is null then
      -- host để NULL: khách quét QR sau đó sẽ nhận quyền (create_order)
      insert into table_sessions (store_id, table_id, opened_by)
      values (v_store, p_table_id, 'staff')
      returning id into v_session_id;
      insert into session_tables (session_id, table_id) values (v_session_id, p_table_id);
    end if;
    perform 1 from table_sessions where id = v_session_id for update;
  else
    if p_payment_method not in ('cash','bank_transfer') then
      raise exception 'Phương thức không hợp lệ cho đơn đặt hộ: %', p_payment_method;
    end if;
    v_instrument := case p_payment_method when 'bank_transfer' then 'bank' else 'cash' end;
  end if;

  if not store_accepting_now(v_store)
     and not exists (
       select 1 from table_sessions
        where id = v_session_id and opened_at > now() - interval '2 hours'
     ) then
    raise exception 'Quán đang tạm nghỉ hoặc ngoài giờ phục vụ';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Đơn phải có ít nhất một món';
  end if;

  insert into orders (
    store_id, table_id, total_amount, payment_method, status,
    note, order_source, created_by, client_request_id, payment_instrument, session_id
  ) values (
    v_store, p_table_id, 0, p_payment_method, 'pending',
    p_note, 'staff', v_uid, p_client_request_id, v_instrument, v_session_id
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

    -- ─── Biến thể: chọn 1, bắt buộc, giá tuyệt đối thay giá món ─────────────
    -- Reset CẢ NĂM biến mỗi vòng: món trước có biến thể, món sau không, mà quên reset
    -- thì món sau thừa hưởng giá/tên của món trước.
    v_variant_id   := nullif(v_item->>'variant_id','')::uuid;
    v_item_price   := v_menu.price;
    v_item_name    := v_menu.name;
    v_variant_name := null;
    v_variant      := null;

    -- Đếm TỔNG biến thể, KHÔNG lọc is_available. Nếu lọc thì món đã tắt bán
    -- hết mọi lựa chọn sẽ rơi vào nhánh "món thường" và bán được ở giá cũ,
    -- trong khi mini-app đã ẩn món đi.
    -- Không cần lọc store_id ở đây (câu tra bên dưới thì có): FK ghép
    -- miv_item_store_fkey (mig 042) đã chặn biến thể quán khác gắn vào món quán này.
    select count(*) into v_variant_cnt
      from menu_item_variants where menu_item_id = v_menu.id;

    if v_variant_cnt = 0 then
      if v_variant_id is not null then
        raise exception 'Món "%" vừa đổi tuỳ chọn, mời bạn chọn lại', v_menu.name;
      end if;
    else
      if v_variant_id is null then
        raise exception 'Món "%" cần chọn loại, mời bạn chọn lại', v_menu.name;
      end if;
      select * into v_variant from menu_item_variants
       where id = v_variant_id and menu_item_id = v_menu.id
         and store_id = v_store and is_available = true;
      if not found then
        raise exception 'Lựa chọn cho món "%" không còn, mời bạn chọn lại', v_menu.name;
      end if;
      v_item_price   := v_variant.price;
      v_variant_name := v_variant.name;
      v_item_name    := v_menu.name || ' (' || v_variant.name || ')';
    end if;

    -- mig 115: giảm giá theo món / danh mục, tính trên giá món hoặc giá lựa chọn (topping giữ giá).
    v_orig_price := v_item_price;
    select md.discount_id, md.discounted_price into v_menu_discount_id, v_item_price
      from menu_item_discounted_price(v_menu.id, v_item_price) md;

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

    insert into order_items (order_id, menu_item_id, item_name, item_price, quantity, note,
                             selected_toppings, variant_id, variant_name, item_original_price, menu_discount_id)
    values (v_order_id, v_menu.id, v_item_name, v_item_price, v_qty,
            nullif(v_item->>'note',''), v_item_tops, v_variant_id, v_variant_name,
            case when v_menu_discount_id is null then null else v_orig_price end, v_menu_discount_id);

    v_total := v_total + (v_item_price + v_top_total) * v_qty;
  end loop;

  update orders set total_amount = v_total, payment_amount = v_total where id = v_order_id;

  if v_session_id is not null then
    update table_sessions set last_activity_at = now() where id = v_session_id;
  end if;

  return jsonb_build_object(
    'order_id',   v_order_id,
    'total',      v_total,
    'idempotent', false,
    'items',      coalesce((select jsonb_agg(to_jsonb(oi))
                            from order_items oi where oi.order_id = v_order_id), '[]'::jsonb)
  );
end $function$
