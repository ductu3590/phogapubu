-- 040_tray_sessions.sql — Sprint 2 "Lớp Mâm cho khách đoàn"
-- Spec: docs/superpowers/specs/2026-08-30-bao-luong-tray-group-design.md §3
-- Nền:  mig 039 (phiên bàn). Quán đầu tiên dùng: Bia lẩu Bảo Lương (20 bàn, khách đoàn
--       ngồi 5-6 bàn, gọi theo 2-3 mâm, một người trả chung).
--
-- MÔ HÌNH: **Mâm = một table_session chiếm N bàn = một bill con.**
--   • Bàn lẻ  = phiên chiếm đúng 1 bàn, is_open_ordering=false → khoá chủ phiên như mig 039.
--   • Mâm đoàn = phiên chiếm N bàn, is_open_ordering=true  → BỎ khoá chủ phiên.
--     (Nhân viên đứng ra ghép bàn nên rủi ro đơn ma từ xa ≈ 0, và đúng bản chất đoàn nhậu
--      nhiều người cùng gọi — quyết định #2 ngày 2026-08-30.)
--   Một cơ chế, hai cách dùng. Đoàn = N mâm, gộp một lần lúc thanh toán.
--
-- THỨ TỰ BẮT BUỘC:
--   1) session_tables + is_open_ordering + nới close_reason
--   2) trigger đồng bộ is_open  (phải có TRƯỚC khi backfill/đổi index)
--   3) backfill phiên đang mở + THAY unique index cũ
--   4) open_session_id_for_table()  ← điểm mở rộng đã dựng sẵn ở mig 039
--   5) create_order v11 / staff_create_order (mở phiên thì ghi cả session_tables)
--   6) RPC mâm: ghép / thêm bàn / nhập vào mâm / gộp bill / bill để in
--   7) list_open_table_sessions trả danh sách bàn + is_open_ordering
--
-- Idempotent rerun-safe.

-- ============================================================
-- 1) Bảng nối + cờ mâm mở
-- ============================================================
create table if not exists session_tables (
  session_id uuid not null references table_sessions(id) on delete cascade,
  table_id   uuid not null references tables(id),
  -- Bản sao trạng thái "phiên còn mở" của session_tables.session_id.
  -- Vì sao phải denormalize: cần ràng buộc "MỘT bàn chỉ thuộc MỘT phiên ĐANG MỞ" ở tầng DB,
  -- mà partial unique index không nhìn được sang bảng khác. Trigger ở mục 2 giữ đồng bộ.
  -- Giữ lại dòng của phiên đã đóng (không xoá) để còn trả lời được "mâm tối qua gồm bàn nào".
  is_open    boolean not null default true,
  primary key (session_id, table_id)
);

comment on table session_tables is
  'Phiên chiếm những bàn nào. Bàn lẻ: đúng 1 dòng. Mâm đoàn: N dòng. is_open là bản sao của table_sessions.status, do trigger trg_session_tables_sync_open giữ đồng bộ.';

alter table table_sessions
  add column if not exists is_open_ordering boolean not null default false;

comment on column table_sessions.is_open_ordering is
  'true = mâm đoàn: create_order BỎ check chủ phiên (ai trong mâm quét QR bàn nào cũng gọi được). false = bàn lẻ, khoá chủ phiên như mig 039.';

-- Nới close_reason cho 'merged' (phiên lẻ được gom vào mâm)
alter table table_sessions drop constraint if exists table_sessions_close_reason_check;
alter table table_sessions add constraint table_sessions_close_reason_check
  check (close_reason is null or close_reason in ('paid','staff_reset','expired','merged'));

-- ============================================================
-- 2) Trigger đồng bộ is_open — phiên đóng thì mọi bàn của nó nhả ra
-- ============================================================
create or replace function sync_session_tables_open() returns trigger
language plpgsql as $$
begin
  update session_tables
     set is_open = (new.status = 'open')
   where session_id = new.id
     and is_open <> (new.status = 'open');
  return null;
end $$;

drop trigger if exists trg_session_tables_sync_open on table_sessions;
create trigger trg_session_tables_sync_open
  after update of status on table_sessions
  for each row
  when (old.status is distinct from new.status)
  execute function sync_session_tables_open();

-- ============================================================
-- 3) Backfill phiên đang mở + THAY unique index của mig 039
-- ============================================================
insert into session_tables (session_id, table_id, is_open)
select s.id, s.table_id, (s.status = 'open')
  from table_sessions s
 where not exists (select 1 from session_tables st where st.session_id = s.id);

-- Ràng buộc mới: MỘT bàn chỉ nằm trong MỘT phiên đang mở. Đây là thứ chặn race hai máy cùng
-- bấm đặt (thay vai trò của table_sessions_one_open_per_table ở mig 039).
create unique index if not exists session_tables_one_open_per_table
  on session_tables(table_id) where is_open;

-- Bỏ index cũ SAU khi index mới đã đứng, không phải trước.
drop index if exists table_sessions_one_open_per_table;

create index if not exists session_tables_session on session_tables(session_id);

alter table session_tables enable row level security;
revoke all on session_tables from anon;
revoke insert, update, delete on session_tables from authenticated;
drop policy if exists "auth_read_session_tables" on session_tables;
create policy "auth_read_session_tables" on session_tables
  for select to authenticated using (
    exists (select 1 from table_sessions s
             where s.id = session_tables.session_id and is_store_scoped_operator(s.store_id))
  );

-- table_sessions.table_id giữ nguyên làm "BÀN GỐC" (bàn đầu tiên của phiên) — dùng cho hiển
-- thị rút gọn và lịch sử. Nguồn sự thật về "phiên chiếm bàn nào" từ đây là session_tables.
comment on column table_sessions.table_id is
  'Bàn gốc (bàn đầu tiên mở phiên). Nguồn sự thật đầy đủ nằm ở session_tables — mâm chiếm N bàn.';

-- ============================================================
-- 4) open_session_id_for_table — ĐIỂM MỞ RỘNG đã dựng sẵn ở mig 039.
--    Mọi RPC đều gọi hàm này nên chỉ cần sửa đúng đây là cả hệ hiểu lớp Mâm.
-- ============================================================
create or replace function open_session_id_for_table(p_table_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select st.session_id
    from session_tables st
    join table_sessions s on s.id = st.session_id
   where st.table_id = p_table_id and st.is_open and s.status = 'open'
   limit 1;
$$;

-- Khoá theo BÀN để "tìm hoặc mở phiên" không bị hai máy chen nhau. Lấy trước mọi row lock,
-- luôn theo thứ tự table_id tăng dần khi khoá nhiều bàn (ghép mâm) → không deadlock.
create or replace function lock_table_for_session(p_table_id uuid)
returns void language sql security definer set search_path = public as $$
  select pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));
$$;
revoke all on function lock_table_for_session(uuid) from public;
grant execute on function lock_table_for_session(uuid) to anon, authenticated;

-- ============================================================
-- 5) create_order v11 = v10 (mig 039) + lớp Mâm
--    Chỉ khác v10 ở KHỐI PHIÊN: khoá theo bàn, ghi session_tables khi mở phiên, và bỏ check
--    chủ phiên khi phiên là mâm đoàn. Chữ ký KHÔNG đổi -> CREATE OR REPLACE là đủ.
-- ============================================================
CREATE OR REPLACE FUNCTION create_order(
  p_store_id uuid, p_table_id uuid DEFAULT NULL, p_items jsonb DEFAULT NULL,
  p_payment_method text DEFAULT 'zalo_checkout', p_zalo_user_id text DEFAULT NULL, p_note text DEFAULT NULL,
  p_order_type text DEFAULT 'dine_in', p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL, p_delivery_address text DEFAULT NULL,
  p_voucher_code text DEFAULT NULL,
  p_device_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE; v_total int := 0; v_token text := gen_random_uuid()::text;
  v_item jsonb; v_menu menu_items%ROWTYPE; v_qty int;
  v_topping_ids uuid[]; v_item_toppings jsonb; v_topping_total int; v_topping_count int;
  v_voucher vouchers%ROWTYPE; v_discount int := 0; v_reason text;
  v_timing text; v_session table_sessions%ROWTYPE; v_session_id uuid;
  v_skip_method_check boolean := false;
BEGIN
  IF p_payment_method = 'zalopay' THEN p_payment_method := 'zalo_checkout'; END IF;
  IF p_payment_method NOT IN ('zalo_checkout','cash') THEN RAISE EXCEPTION 'payment_method không hợp lệ: %', p_payment_method; END IF;

  IF p_order_type NOT IN ('dine_in','pickup','delivery') THEN RAISE EXCEPTION 'order_type không hợp lệ: %', p_order_type; END IF;

  IF p_order_type = 'dine_in' THEN
    IF p_table_id IS NULL THEN RAISE EXCEPTION 'Đơn tại bàn cần có table_id'; END IF;
    IF NOT EXISTS (SELECT 1 FROM tables WHERE id = p_table_id AND store_id = p_store_id AND is_active = true) THEN
      RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động'; END IF;
  END IF;

  IF p_order_type IN ('pickup','delivery') THEN
    IF p_customer_name IS NULL THEN RAISE EXCEPTION 'Đơn mang về cần tên khách hàng'; END IF;
    IF p_order_type = 'delivery' THEN
      IF p_customer_phone IS NULL THEN RAISE EXCEPTION 'Đơn ship cần số điện thoại'; END IF;
      IF p_delivery_address IS NULL THEN RAISE EXCEPTION 'Đơn ship cần địa chỉ giao hàng'; END IF;
    END IF;
    IF p_payment_method <> 'zalo_checkout' THEN RAISE EXCEPTION 'Đơn mang về chỉ chấp nhận thanh toán online'; END IF;
  END IF;

  -- ---------- KHỐI PHIÊN BÀN ----------
  SELECT payment_timing INTO v_timing FROM stores WHERE id = p_store_id;
  IF v_timing IS NULL THEN RAISE EXCEPTION 'Không tìm thấy quán'; END IF;

  IF v_timing = 'postpay' AND p_order_type = 'dine_in' THEN
    p_payment_method := 'cash';
    v_skip_method_check := true;

    -- Khoá theo BÀN trước khi tìm-hoặc-mở: hai máy bấm cùng lúc thì máy sau phải nhìn thấy
    -- phiên máy trước vừa tạo, không được tạo phiên thứ hai (rủi ro #1).
    PERFORM lock_table_for_session(p_table_id);

    v_session_id := open_session_id_for_table(p_table_id);
    IF v_session_id IS NULL THEN
      INSERT INTO table_sessions (store_id, table_id, host_zalo_user_id, host_device_id, opened_by)
      VALUES (p_store_id, p_table_id, p_zalo_user_id, p_device_id, 'customer')
      RETURNING id INTO v_session_id;
      -- unique index session_tables_one_open_per_table là chốt chặn cuối nếu advisory lock hở
      INSERT INTO session_tables (session_id, table_id) VALUES (v_session_id, p_table_id);
    END IF;

    SELECT * INTO v_session FROM table_sessions WHERE id = v_session_id FOR UPDATE;
    IF NOT FOUND OR v_session.status <> 'open' THEN
      RAISE EXCEPTION 'Bàn vừa được đóng, vui lòng quét lại QR';
    END IF;

    -- Mâm đoàn: nhân viên đã đứng ra ghép bàn nên KHÔNG khoá chủ phiên — ai trong mâm quét QR
    -- bàn nào cũng gọi thêm được (quyết định #2 ngày 2026-08-30). Bàn lẻ vẫn khoá như mig 039.
    IF NOT v_session.is_open_ordering THEN
      IF v_session.host_zalo_user_id IS NULL AND v_session.host_device_id IS NULL THEN
        UPDATE table_sessions
           SET host_zalo_user_id = p_zalo_user_id, host_device_id = p_device_id
         WHERE id = v_session.id RETURNING * INTO v_session;
      END IF;

      IF NOT (
           (p_zalo_user_id IS NOT NULL AND v_session.host_zalo_user_id = p_zalo_user_id)
        OR (p_device_id   IS NOT NULL AND v_session.host_device_id   = p_device_id)
      ) THEN
        RAISE EXCEPTION 'Bàn này đang có khách khác gọi món. Nhờ nhân viên mở bàn giúp bạn.';
      END IF;
    END IF;

  ELSIF v_timing = 'prepay' AND p_order_type = 'dine_in' THEN
    IF p_payment_method <> 'zalo_checkout' THEN
      RAISE EXCEPTION 'Quán yêu cầu thanh toán trước khi bếp làm.';
    END IF;
  END IF;
  -- ---------- HẾT KHỐI PHIÊN ----------

  IF NOT v_skip_method_check THEN
    IF NOT EXISTS (
      SELECT 1 FROM stores WHERE id = p_store_id AND p_payment_method = ANY(payment_methods)
    ) THEN
      RAISE EXCEPTION 'Quán không nhận phương thức thanh toán này, vui lòng chọn lại';
    END IF;
  END IF;

  IF NOT store_accepting_now(p_store_id)
     AND NOT (v_session_id IS NOT NULL AND v_session.opened_at > now() - interval '2 hours') THEN
    RAISE EXCEPTION 'Quán đang tạm nghỉ hoặc ngoài giờ phục vụ';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Đơn không có món nào'; END IF;

  INSERT INTO orders (store_id, table_id, total_amount, zalo_user_id, note, payment_method, status, capability_token,
    order_type, customer_name, customer_phone, delivery_address, session_id)
  VALUES (p_store_id, p_table_id, 0, p_zalo_user_id, p_note, p_payment_method, 'pending', v_token,
    p_order_type, p_customer_name, p_customer_phone, p_delivery_address, v_session_id)
  RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Số lượng không hợp lệ'; END IF;

    SELECT * INTO v_menu FROM menu_items
    WHERE id = (v_item->>'menu_item_id')::uuid AND store_id = p_store_id AND is_available = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Món không thuộc quán hoặc ngừng bán: %', v_item->>'menu_item_id'; END IF;

    v_item_toppings := '[]'::jsonb; v_topping_total := 0;
    IF v_item ? 'topping_ids' AND jsonb_typeof(v_item->'topping_ids') = 'array'
       AND jsonb_array_length(v_item->'topping_ids') > 0 THEN
      SELECT array_agg(DISTINCT value::uuid) INTO v_topping_ids
        FROM jsonb_array_elements_text(v_item->'topping_ids');
      SELECT
        COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'price',t.price) ORDER BY t.sort_order, t.created_at), '[]'::jsonb),
        COALESCE(SUM(t.price),0), COUNT(*)
      INTO v_item_toppings, v_topping_total, v_topping_count
      FROM toppings t
      JOIN menu_item_toppings mit ON mit.topping_id = t.id AND mit.menu_item_id = v_menu.id
      WHERE t.id = ANY(v_topping_ids) AND t.store_id = p_store_id AND t.is_available = true;
      IF v_topping_count <> array_length(v_topping_ids,1) THEN
        RAISE EXCEPTION 'Topping không hợp lệ / chưa gán cho món / ngừng bán: %', v_menu.name; END IF;
    END IF;

    INSERT INTO order_items (order_id, menu_item_id, item_name, item_price, quantity, note, selected_toppings)
    VALUES (v_order.id, v_menu.id, v_menu.name, v_menu.price, v_qty, v_item->>'note', v_item_toppings);
    v_total := v_total + (v_menu.price + v_topping_total) * v_qty;
  END LOOP;

  IF p_voucher_code IS NOT NULL AND trim(p_voucher_code) <> '' THEN
    SELECT * INTO v_voucher FROM vouchers
     WHERE store_id = p_store_id AND upper(code) = upper(trim(p_voucher_code))
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mã giảm giá không tồn tại'; END IF;
    v_reason := voucher_reject_reason(v_voucher, p_zalo_user_id);
    IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%', v_reason; END IF;
    IF v_voucher.zalo_user_id IS NULL THEN
      UPDATE vouchers SET zalo_user_id = p_zalo_user_id WHERE id = v_voucher.id;
    END IF;
    v_discount := voucher_discount(v_voucher, v_total);
    IF v_total - v_discount < 1000 THEN RAISE EXCEPTION 'Đơn quá nhỏ để áp mã giảm giá'; END IF;
  END IF;

  UPDATE orders SET total_amount = v_total - v_discount,
                    payment_amount = v_total - v_discount,
                    discount_amount = v_discount,
                    voucher_id = v_voucher.id
   WHERE id = v_order.id RETURNING * INTO v_order;

  IF v_session_id IS NOT NULL THEN
    UPDATE table_sessions SET last_activity_at = now() WHERE id = v_session_id;
  END IF;

  RETURN to_jsonb(v_order);
END; $$;
REVOKE ALL ON FUNCTION create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text) TO anon;

-- ============================================================
-- 6) staff_create_order — mở phiên thì ghi cả session_tables
-- ============================================================
CREATE OR REPLACE FUNCTION staff_create_order(
  p_table_id          uuid,
  p_items             jsonb,
  p_payment_method    text,
  p_client_request_id uuid,
  p_note              text default null
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
BEGIN
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
end $$;
revoke all on function staff_create_order(uuid, jsonb, text, uuid, text) from public;
revoke all on function staff_create_order(uuid, jsonb, text, uuid, text) from anon;
grant execute on function staff_create_order(uuid, jsonb, text, uuid, text) to authenticated;

-- ============================================================
-- 7) get_table_session_state / _bill — mâm đoàn không khoá ai cả
-- ============================================================
create or replace function get_table_session_state(
  p_table_id uuid, p_zalo_user_id text default null, p_device_id text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_store uuid; v_timing text; v_s table_sessions%rowtype;
  v_count int; v_total bigint; v_tables text;
begin
  select t.store_id into v_store from tables t where t.id = p_table_id and t.is_active;
  if v_store is null then return jsonb_build_object('mode','prepay','state','free'); end if;

  select payment_timing into v_timing from stores where id = v_store;
  if v_timing <> 'postpay' then return jsonb_build_object('mode','prepay'); end if;

  perform expire_stale_table_sessions(v_store);

  select * into v_s from table_sessions where id = open_session_id_for_table(p_table_id);
  if not found then
    return jsonb_build_object('mode','postpay','state','free');
  end if;

  -- Mâm đoàn: KHÔNG khoá ai — nhân viên đã đứng ra ghép bàn, cả đoàn cùng gọi vào một bill.
  if not v_s.is_open_ordering and not (
       (v_s.host_zalo_user_id is null and v_s.host_device_id is null)
    or (p_zalo_user_id is not null and v_s.host_zalo_user_id = p_zalo_user_id)
    or (p_device_id   is not null and v_s.host_device_id   = p_device_id)
  ) then
    return jsonb_build_object('mode','postpay','state','locked','opened_at',v_s.opened_at);
  end if;

  select count(*), coalesce(sum(total_amount),0) into v_count, v_total
    from orders where session_id = v_s.id and status <> 'cancelled';

  -- Tên các bàn của phiên, để mini-app hiện "Mâm (Bàn 5, 6, 7)" thay vì chỉ một bàn.
  select string_agg(t.table_number, ', ' order by t.table_number) into v_tables
    from session_tables st join tables t on t.id = st.table_id
   where st.session_id = v_s.id and st.is_open;

  return jsonb_build_object(
    'mode','postpay', 'state','owner',
    'session_id', v_s.id, 'opened_at', v_s.opened_at,
    'order_count', v_count, 'total', v_total,
    'is_open_ordering', v_s.is_open_ordering,
    'table_names', coalesce(v_tables, '')
  );
end $$;
revoke all on function get_table_session_state(uuid,text,text) from public;
grant execute on function get_table_session_state(uuid,text,text) to anon, authenticated;

create or replace function get_table_session_bill(
  p_table_id uuid, p_zalo_user_id text default null, p_device_id text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_s table_sessions%rowtype; v_orders jsonb; v_total bigint;
begin
  select * into v_s from table_sessions where id = open_session_id_for_table(p_table_id);
  if not found then return jsonb_build_object('found', false); end if;

  if not v_s.is_open_ordering and not (
       (v_s.host_zalo_user_id is null and v_s.host_device_id is null)
    or (p_zalo_user_id is not null and v_s.host_zalo_user_id = p_zalo_user_id)
    or (p_device_id   is not null and v_s.host_device_id   = p_device_id)
  ) then
    return jsonb_build_object('found', false);
  end if;

  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb),
         coalesce(sum(x.total_amount), 0)
    into v_orders, v_total
  from (
    select o.id, o.status, o.created_at, o.total_amount, o.order_source,
           o.payment_received_at,
           coalesce((select jsonb_agg(jsonb_build_object(
                       'id', oi.id, 'name', oi.item_name, 'quantity', oi.quantity,
                       'price', oi.item_price, 'toppings', oi.selected_toppings))
                     from order_items oi where oi.order_id = o.id), '[]'::jsonb) as items
      from orders o
     where o.session_id = v_s.id and o.status <> 'cancelled'
  ) x;

  return jsonb_build_object(
    'found', true, 'session_id', v_s.id, 'opened_at', v_s.opened_at,
    'total', v_total, 'orders', v_orders
  );
end $$;
revoke all on function get_table_session_bill(uuid,text,text) from public;
grant execute on function get_table_session_bill(uuid,text,text) to anon, authenticated;

-- ============================================================
-- 8) list_open_table_sessions — trả danh sách BÀN của phiên + cờ mâm
-- ============================================================
create or replace function list_open_table_sessions(p_store_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows jsonb;
begin
  if not is_store_scoped_operator(p_store_id) then
    raise exception 'Không có quyền';
  end if;

  perform expire_stale_table_sessions(p_store_id);

  select coalesce(jsonb_agg(r order by r.opened_at), '[]'::jsonb) into v_rows
  from (
    select s.id             as session_id,
           s.table_id,
           s.is_open_ordering,
           coalesce(tb.table_names, '[]'::jsonb) as tables,
           coalesce(tb.label, '?')               as table_number,
           s.status,
           s.close_reason,
           s.opened_at,
           s.opened_by,
           s.last_activity_at,
           (s.host_zalo_user_id is not null or s.host_device_id is not null) as has_host,
           (s.status = 'closed') as needs_review,
           coalesce(a.order_count, 0)   as order_count,
           coalesce(a.total, 0)          as total,
           coalesce(a.unpaid_total, 0)   as unpaid_total,
           coalesce(a.cooking_count, 0)  as cooking_count,
           coalesce(a.orders, '[]'::jsonb) as orders
      from table_sessions s
      left join lateral (
        select jsonb_agg(jsonb_build_object('id', t.id, 'table_number', t.table_number)
                         order by t.table_number) as table_names,
               string_agg(t.table_number, ', ' order by t.table_number)     as label
          from session_tables st join tables t on t.id = st.table_id
         where st.session_id = s.id and st.is_open
      ) tb on true
      left join lateral (
        select count(*)                                                   as order_count,
               sum(o.total_amount)                                        as total,
               sum(o.total_amount) filter (where o.payment_received_at is null) as unpaid_total,
               count(*) filter (where o.status in ('pending','confirmed','cooking'))   as cooking_count,
               jsonb_agg(jsonb_build_object(
                 'id', o.id, 'status', o.status, 'created_at', o.created_at,
                 'total_amount', o.total_amount, 'order_source', o.order_source,
                 'payment_received_at', o.payment_received_at,
                 'items', coalesce((select jsonb_agg(jsonb_build_object(
                             'name', oi.item_name, 'quantity', oi.quantity))
                           from order_items oi where oi.order_id = o.id), '[]'::jsonb)
               ) order by o.created_at) as orders
          from orders o
         where o.session_id = s.id and o.status <> 'cancelled'
      ) a on true
     where s.store_id = p_store_id
       and (
         s.status = 'open'
         or (s.close_reason = 'expired' and exists (
              select 1 from orders o
               where o.session_id = s.id and o.status <> 'cancelled'
                 and o.payment_received_at is null))
       )
  ) r;

  return v_rows;
end $$;
revoke all on function list_open_table_sessions(uuid) from public;
revoke all on function list_open_table_sessions(uuid) from anon;
grant execute on function list_open_table_sessions(uuid) to authenticated;

-- ============================================================
-- 9) Ghép mâm — chọn N bàn TRỐNG, mở một phiên chiếm cả N bàn
-- ============================================================
create or replace function create_tray_session(p_store_id uuid, p_table_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_tid uuid;
  v_session_id uuid;
  v_busy text;
begin
  if not is_store_scoped_operator(p_store_id) then raise exception 'Không có quyền'; end if;
  if p_table_ids is null or array_length(p_table_ids,1) is null then
    raise exception 'Chưa chọn bàn nào';
  end if;

  -- Khoá theo thứ tự id tăng dần: hai nhân viên ghép mâm chồng bàn nhau vẫn không deadlock.
  select array_agg(distinct x order by x) into v_ids from unnest(p_table_ids) x;
  foreach v_tid in array v_ids loop
    perform lock_table_for_session(v_tid);
  end loop;

  foreach v_tid in array v_ids loop
    if not exists (select 1 from tables where id = v_tid and store_id = p_store_id and is_active) then
      raise exception 'Bàn không thuộc quán hoặc đã ngừng dùng';
    end if;
    if open_session_id_for_table(v_tid) is not null then
      select table_number into v_busy from tables where id = v_tid;
      raise exception '% đang có khách, đóng bàn đó trước hoặc dùng "Nhập vào mâm"', v_busy;
    end if;
  end loop;

  -- is_open_ordering = true: mâm đoàn KHÔNG khoá chủ phiên (quyết định #2, 2026-08-30)
  insert into table_sessions (store_id, table_id, opened_by, is_open_ordering, closed_by)
  values (p_store_id, v_ids[1], 'staff', true, null)
  returning id into v_session_id;

  insert into session_tables (session_id, table_id)
  select v_session_id, x from unnest(v_ids) x;

  return jsonb_build_object('ok', true, 'session_id', v_session_id,
                            'table_count', array_length(v_ids,1), 'by', v_uid);
end $$;
revoke all on function create_tray_session(uuid, uuid[]) from public;
revoke all on function create_tray_session(uuid, uuid[]) from anon;
grant execute on function create_tray_session(uuid, uuid[]) to authenticated;

-- Thêm một bàn trống vào mâm đang mở (đoàn đông thêm người)
create or replace function add_table_to_session(p_session_id uuid, p_table_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_s table_sessions%rowtype; v_busy text;
begin
  select * into v_s from table_sessions where id = p_session_id for update;
  if not found then raise exception 'Không tìm thấy phiên'; end if;
  if not is_store_scoped_operator(v_s.store_id) then raise exception 'Không có quyền'; end if;
  if v_s.status <> 'open' then raise exception 'Phiên đã đóng'; end if;

  perform lock_table_for_session(p_table_id);
  if not exists (select 1 from tables where id = p_table_id and store_id = v_s.store_id and is_active) then
    raise exception 'Bàn không thuộc quán hoặc đã ngừng dùng';
  end if;
  if open_session_id_for_table(p_table_id) is not null then
    select table_number into v_busy from tables where id = p_table_id;
    raise exception '% đang có khách', v_busy;
  end if;

  insert into session_tables (session_id, table_id) values (p_session_id, p_table_id)
  on conflict (session_id, table_id) do update set is_open = true;

  -- Thêm bàn = thành mâm, bỏ khoá chủ phiên cho cả nhóm.
  update table_sessions
     set is_open_ordering = true, last_activity_at = now()
   where id = p_session_id;

  return jsonb_build_object('ok', true);
end $$;
revoke all on function add_table_to_session(uuid, uuid) from public;
revoke all on function add_table_to_session(uuid, uuid) from anon;
grant execute on function add_table_to_session(uuid, uuid) to authenticated;

-- ============================================================
-- 10) Nhập phiên lẻ vào mâm — khách quét QR trước khi nhân viên kịp ghép bàn
-- ============================================================
create or replace function merge_session_into_tray(p_session_id uuid, p_target_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_src table_sessions%rowtype; v_dst table_sessions%rowtype;
  v_first uuid; v_second uuid;
  v_orders int; v_tables int;
begin
  if p_session_id = p_target_session_id then raise exception 'Không thể nhập phiên vào chính nó'; end if;

  -- Khoá hai phiên theo thứ tự id tăng dần → không deadlock khi hai nhân viên gom chéo nhau.
  v_first  := least(p_session_id, p_target_session_id);
  v_second := greatest(p_session_id, p_target_session_id);
  perform 1 from table_sessions where id = v_first  for update;
  perform 1 from table_sessions where id = v_second for update;

  select * into v_src from table_sessions where id = p_session_id;
  if not found then raise exception 'Không tìm thấy phiên nguồn'; end if;
  select * into v_dst from table_sessions where id = p_target_session_id;
  if not found then raise exception 'Không tìm thấy mâm đích'; end if;

  if not is_store_scoped_operator(v_src.store_id) then raise exception 'Không có quyền'; end if;
  if v_src.store_id <> v_dst.store_id then raise exception 'Hai phiên không cùng quán'; end if;
  if v_src.status <> 'open' or v_dst.status <> 'open' then raise exception 'Chỉ gom được phiên đang mở'; end if;

  -- Chuyển đơn sang mâm TRƯỚC, rồi mới chuyển bàn, rồi mới đóng phiên nguồn: đóng trước là
  -- trigger sẽ nhả bàn ra trong lúc đơn còn treo ở phiên cũ.
  update orders set session_id = p_target_session_id where session_id = p_session_id;
  get diagnostics v_orders = row_count;

  update session_tables set session_id = p_target_session_id
   where session_id = p_session_id and is_open;
  get diagnostics v_tables = row_count;

  update table_sessions
     set status = 'closed', closed_at = now(), closed_by = v_uid, close_reason = 'merged'
   where id = p_session_id;

  update table_sessions
     set is_open_ordering = true, last_activity_at = now()
   where id = p_target_session_id;

  return jsonb_build_object('ok', true, 'orders_moved', v_orders, 'tables_moved', v_tables);
end $$;
revoke all on function merge_session_into_tray(uuid, uuid) from public;
revoke all on function merge_session_into_tray(uuid, uuid) from anon;
grant execute on function merge_session_into_tray(uuid, uuid) to authenticated;

-- ============================================================
-- 11) Gộp bill — chốt N mâm trong MỘT giao dịch, cùng một phương tiện thanh toán
--     Tách bill là mặc định (mỗi mâm vốn là một bill con) — hàm này chỉ dùng khi trưởng đoàn
--     trả chung. Một transaction: hoặc thu hết, hoặc không mâm nào bị đánh dấu đã thu.
-- ============================================================
create or replace function close_table_sessions_bulk(
  p_session_ids uuid[], p_reason text, p_instrument text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_ids uuid[]; v_one jsonb;
  v_settled int := 0; v_cancelled int := 0; v_left int := 0; v_total bigint := 0; v_n int := 0;
begin
  if p_session_ids is null or array_length(p_session_ids,1) is null then
    raise exception 'Chưa chọn phiên nào';
  end if;
  -- Khoá theo id tăng dần cho nhất quán với merge_session_into_tray.
  select array_agg(distinct x order by x) into v_ids from unnest(p_session_ids) x;

  foreach v_id in array v_ids loop
    v_one := close_table_session(v_id, p_reason, p_instrument);
    v_n         := v_n + 1;
    v_settled   := v_settled   + coalesce((v_one->>'orders_settled')::int, 0);
    v_cancelled := v_cancelled + coalesce((v_one->>'orders_cancelled')::int, 0);
    v_left      := v_left      + coalesce((v_one->>'orders_left_in_kitchen')::int, 0);
    v_total     := v_total     + coalesce((v_one->>'total')::bigint, 0);
  end loop;

  return jsonb_build_object('ok', true, 'sessions', v_n,
    'orders_settled', v_settled, 'orders_cancelled', v_cancelled,
    'orders_left_in_kitchen', v_left, 'total', v_total);
end $$;
revoke all on function close_table_sessions_bulk(uuid[], text, text) from public;
revoke all on function close_table_sessions_bulk(uuid[], text, text) from anon;
grant execute on function close_table_sessions_bulk(uuid[], text, text) to authenticated;

-- ============================================================
-- 12) Dữ liệu in hoá đơn — một hoặc nhiều mâm trên MỘT tờ
-- ============================================================
create or replace function get_sessions_bill(p_session_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_store uuid; v_n int; v_store_row stores%rowtype; v_sessions jsonb; v_total bigint;
begin
  if p_session_ids is null or array_length(p_session_ids,1) is null then
    raise exception 'Chưa chọn phiên nào';
  end if;

  -- KHÔNG dùng min(store_id): Postgres không có aggregate min() cho uuid.
  select count(distinct store_id) into v_n from table_sessions where id = any(p_session_ids);
  if v_n = 0 then raise exception 'Không tìm thấy phiên'; end if;
  if v_n > 1 then raise exception 'Các phiên không cùng một quán'; end if;
  select store_id into v_store from table_sessions where id = any(p_session_ids) limit 1;
  if not is_store_scoped_operator(v_store) then raise exception 'Không có quyền'; end if;

  select * into v_store_row from stores where id = v_store;

  select coalesce(jsonb_agg(x order by x.opened_at), '[]'::jsonb), coalesce(sum(x.subtotal),0)
    into v_sessions, v_total
  from (
    select s.id as session_id, s.opened_at, s.is_open_ordering,
           coalesce((select string_agg(t.table_number, ', ' order by t.table_number)
                       from session_tables st join tables t on t.id = st.table_id
                      where st.session_id = s.id), '?') as tables,
           coalesce((select sum(o.total_amount) from orders o
                      where o.session_id = s.id and o.status <> 'cancelled'), 0) as subtotal,
           coalesce((select jsonb_agg(jsonb_build_object(
                       'name', d.item_name, 'quantity', d.qty, 'price', d.item_price,
                       'line_total', d.qty * d.item_price) order by d.item_name)
                     from (
                       select oi.item_name, oi.item_price, sum(oi.quantity) as qty
                         from orders o join order_items oi on oi.order_id = o.id
                        where o.session_id = s.id and o.status <> 'cancelled'
                        group by oi.item_name, oi.item_price
                     ) d), '[]'::jsonb) as items
      from table_sessions s
     where s.id = any(p_session_ids)
  ) x;

  return jsonb_build_object(
    'store', jsonb_build_object('name', v_store_row.name, 'address', v_store_row.address,
                                'phone', v_store_row.phone),
    'printed_at', now(),
    'sessions', v_sessions,
    'grand_total', v_total
  );
end $$;
revoke all on function get_sessions_bill(uuid[]) from public;
revoke all on function get_sessions_bill(uuid[]) from anon;
grant execute on function get_sessions_bill(uuid[]) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'session_tables') then
    alter publication supabase_realtime add table session_tables;
  end if;
end $$;

notify pgrst, 'reload schema';
