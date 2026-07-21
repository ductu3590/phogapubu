-- 030_multi_method_payment.sql — PM-1 ADDITIVE
-- Spec: docs/superpowers/specs/2026-07-15-multi-method-payment-design.md
-- Vá bug "notify = đã trả tiền", gộp mọi luật doanh thu về payment_received_at, dựng nền
-- (instrument, đuôi) cho thanh toán đa phương thức.
-- ⚠️ KHÔNG rename kênh zalopay→zalo_checkout, KHÔNG siết CHECK payment_method/payment_methods
--    (mini-app prod còn gửi 'zalopay'; rename ở rollout backward-compatible riêng — callout §5).

-- ============================================================
-- 1) Cột mới (§5.1) — additive
-- ============================================================
alter table orders
  add column if not exists payment_instrument   text null,
  add column if not exists payment_received_via  text null,
  add column if not exists bank_handoff_at        timestamptz null,
  add column if not exists has_payment_tail       boolean not null default false,
  add column if not exists payment_amount         int null;   -- default 0 + NOT NULL ở mục 3

alter table stores
  add column if not exists kitchen_can_confirm_cash boolean not null default false;

-- CHECK instrument (chỉ để BÁO CÁO — §3; không logic nào rẽ nhánh theo nó)
alter table orders drop constraint if exists orders_payment_instrument_check;
alter table orders add constraint orders_payment_instrument_check
  check (payment_instrument in ('wallet','bank','momo','vnpay','cash'));

-- CHECK payment_received_via
alter table orders drop constraint if exists orders_payment_received_via_check;
alter table orders add constraint orders_payment_received_via_check
  check (payment_received_via in ('zalo_callback','sepay','kitchen','owner','legacy'));

-- ============================================================
-- 2) Backfill (KHÔNG có bước rename kênh)
-- ============================================================
-- Instrument suy ngược (chỉ báo cáo). bank_transfer KHÔNG có zalopay_trans_id → nhánh riêng (§3.2)
update orders set payment_instrument = 'bank'
  where zalopay_trans_id like 'BANK:%';
update orders set payment_instrument = 'wallet'
  where zalopay_trans_id is not null and zalopay_trans_id not like 'BANK:%';
update orders set payment_instrument = 'cash'
  where payment_method = 'cash';
update orders set payment_instrument = 'bank'
  where payment_method = 'bank_transfer' and payment_instrument is null;

-- Đơn ví đã có tiền thật → nguồn sự thật mới
update orders set payment_received_at = updated_at, payment_received_via = 'zalo_callback'
  where payment_instrument = 'wallet';

-- Legacy tiền mặt đã thu — via='legacy' (dữ liệu cũ không ghi ai thu)
update orders set payment_received_at = updated_at, payment_received_via = 'legacy'
  where payment_method = 'cash' and status = 'paid' and payment_received_at is null;

-- ⚠️ Đơn do confirm_manual_payment (028) xác nhận: có at+by nhưng CHƯA có via → 'owner'.
--    Không có bước này thì constraint 3 trạng thái VỠ NGAY lúc ADD.
update orders set payment_received_via = 'owner'
  where payment_received_at is not null
    and payment_received_via is null
    and payment_received_by is not null;

-- 7 đơn BANK cũ: có handoff, KHÔNG bằng chứng tiền về (§1.1) → rời doanh thu
update orders
  set zalopay_trans_id     = null,
      bank_handoff_at       = updated_at,
      payment_received_at   = null,
      payment_received_via  = null
  where payment_instrument = 'bank' and zalopay_trans_id like 'BANK:%';

-- payment_amount đơn cũ = total_amount (has_payment_tail giữ default false)
update orders set payment_amount = total_amount where payment_amount is null;

-- ============================================================
-- 3) Constraint 3 trạng thái + default 0 + NOT NULL + index (SAU backfill)
-- ============================================================
-- Không tách 2 constraint riêng: nhánh "via is null" sẽ cho lọt (at=NULL, via=NULL, by=<user>)
alter table orders drop constraint if exists orders_payment_received_state_check;
alter table orders add constraint orders_payment_received_state_check check (
  (
    payment_received_at is null
    and payment_received_via is null
    and payment_received_by is null
  )
  or (
    payment_received_at is not null
    and payment_received_via = 'owner'
    and payment_received_by is not null
  )
  or (
    payment_received_at is not null
    and payment_received_via in ('zalo_callback','sepay','kitchen','legacy')
    and payment_received_by is null
  )
);

-- default 0 để INSERT đầu của create_order qua được NOT NULL; UPDATE cuối set số thật (§5.3a)
alter table orders alter column payment_amount set default 0;
alter table orders alter column payment_amount set not null;

-- Index cấp đuôi — lọc theo has_payment_tail (đóng băng), KHÔNG đọc stores config (§5.3).
-- Trống tới PM-2 (has_payment_tail toàn false). KHÔNG dùng now() (Postgres cấm trong predicate).
create unique index if not exists orders_pending_payment_amount_unique
  on orders(store_id, payment_amount)
  where has_payment_tail = true and payment_received_at is null and status <> 'cancelled';

-- ============================================================
-- 4) create_order v6 = 027 v5 + set payment_amount ở UPDATE cuối (§5.3a)
--    GIỮ NGUYÊN 'zalopay' (rename ở rollout riêng). Chỉ khác 027 ở dòng payment_amount.
-- ============================================================
CREATE OR REPLACE FUNCTION create_order(
  p_store_id uuid, p_table_id uuid DEFAULT NULL, p_items jsonb DEFAULT NULL,
  p_payment_method text DEFAULT 'zalopay', p_zalo_user_id text DEFAULT NULL, p_note text DEFAULT NULL,
  p_order_type text DEFAULT 'dine_in', p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL, p_delivery_address text DEFAULT NULL,
  p_voucher_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE; v_total int := 0; v_token text := gen_random_uuid()::text;
  v_item jsonb; v_menu menu_items%ROWTYPE; v_qty int;
  v_topping_ids uuid[]; v_item_toppings jsonb; v_topping_total int; v_topping_count int;
  v_voucher vouchers%ROWTYPE; v_discount int := 0; v_reason text;
BEGIN
  IF p_payment_method NOT IN ('zalopay','cash') THEN RAISE EXCEPTION 'payment_method không hợp lệ: %', p_payment_method; END IF;
  IF p_order_type NOT IN ('dine_in','pickup','delivery') THEN RAISE EXCEPTION 'order_type không hợp lệ: %', p_order_type; END IF;

  -- Chặn khi quán tạm nghỉ / ngoài giờ phục vụ (áp cho mọi loại đơn)
  IF NOT store_accepting_now(p_store_id) THEN
    RAISE EXCEPTION 'Quán đang tạm nghỉ hoặc ngoài giờ phục vụ';
  END IF;

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
    IF p_payment_method <> 'zalopay' THEN RAISE EXCEPTION 'Đơn mang về chỉ chấp nhận ZaloPay'; END IF;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Đơn không có món nào'; END IF;

  INSERT INTO orders (store_id, table_id, total_amount, zalo_user_id, note, payment_method, status, capability_token,
    order_type, customer_name, customer_phone, delivery_address)
  VALUES (p_store_id, p_table_id, 0, p_zalo_user_id, p_note, p_payment_method, 'pending', v_token,
    p_order_type, p_customer_name, p_customer_phone, p_delivery_address)
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

  -- ── Voucher: validate + kích hoạt lần đầu + tính giảm (FOR UPDATE chống 2 đơn đồng thời) ──
  IF p_voucher_code IS NOT NULL AND trim(p_voucher_code) <> '' THEN
    SELECT * INTO v_voucher FROM vouchers
     WHERE store_id = p_store_id AND upper(code) = upper(trim(p_voucher_code))
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mã giảm giá không tồn tại'; END IF;
    v_reason := voucher_reject_reason(v_voucher, p_zalo_user_id);
    IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%', v_reason; END IF;
    -- Kích hoạt lần đầu: mã shipper chưa có chủ → khoá vĩnh viễn vào UID này
    IF v_voucher.zalo_user_id IS NULL THEN
      UPDATE vouchers SET zalo_user_id = p_zalo_user_id WHERE id = v_voucher.id;
    END IF;
    v_discount := voucher_discount(v_voucher, v_total);
    IF v_total - v_discount < 1000 THEN RAISE EXCEPTION 'Đơn quá nhỏ để áp mã giảm giá'; END IF;
  END IF;

  UPDATE orders SET total_amount = v_total - v_discount,
                    payment_amount = v_total - v_discount,   -- ← THÊM (PM-1: = total, chưa đuôi)
                    discount_amount = v_discount,
                    voucher_id = v_voucher.id
   WHERE id = v_order.id RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END; $$;
REVOKE ALL ON FUNCTION create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text) TO anon;

-- ============================================================
-- 5) staff_create_order = 029 + payment_instrument (INSERT) + payment_amount (UPDATE cuối)
--    GIỮ NGUYÊN kiểm mevo_operators.is_active + idempotency + store_accepting_now của 029.
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
BEGIN
  -- 1) Ai đang gọi? store_id suy từ operator, KHÔNG tin client. is_active=false = không có quyền.
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
    note, order_source, created_by, client_request_id, payment_instrument   -- ← thêm instrument (§3.2)
  ) values (
    v_store, p_table_id, 0, p_payment_method, 'pending',
    p_note, 'staff', v_uid, p_client_request_id,
    case p_payment_method when 'bank_transfer' then 'bank' else 'cash' end
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

  update orders set total_amount = v_total, payment_amount = v_total where id = v_order_id;  -- ← thêm payment_amount

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
-- 6) confirm_manual_payment = 028 + payment_received_via='owner' (P0: không có = vỡ 3-state)
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
      payment_received_via = 'owner',        -- ← THÊM (P0): 3-state cần via khi có at+by
      payment_received_by = auth.uid()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'already', false);
end $$;
revoke all on function confirm_manual_payment(uuid) from public;
revoke all on function confirm_manual_payment(uuid) from anon;
grant execute on function confirm_manual_payment(uuid) to authenticated;

-- ============================================================
-- 7) get_daily_revenue: gộp về một luật payment_received_at (giữ nhánh legacy cash+paid,
--    khớp y hệt admin-web/lib/revenue.ts để dashboard == trang Đơn hàng). Giữ chữ ký 028.
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
        (payment_received_at is not null and status <> 'cancelled')
        or (payment_method = 'cash' and status = 'paid')                 -- legacy
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

-- ============================================================
-- 8) voucher_uses: GIỮ nhánh payment_method='cash' (đơn cash vào bếp ngay = chiếm lượt ngay;
--    bỏ nhánh này = đơn cash đã làm/giao sau 30' nhả lượt → vượt max_uses). NOT predicate "đã trả".
-- ============================================================
CREATE OR REPLACE FUNCTION voucher_uses(p_voucher_id uuid, p_since timestamptz DEFAULT NULL)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM orders o
  WHERE o.voucher_id = p_voucher_id
    AND o.status <> 'cancelled'
    AND (o.payment_method = 'cash'
         OR o.payment_received_at IS NOT NULL
         OR o.created_at > now() - interval '30 minutes')
    AND (p_since IS NULL OR o.created_at >= p_since)
$$;

-- ============================================================
-- 9) get_spin_state + spin_wheel: v_paid → payment_received_at + chặn đơn staff (Rủi ro #6)
--    (chỉ đổi dòng v_paid; phần còn lại y hệt 027)
-- ============================================================
CREATE OR REPLACE FUNCTION get_spin_state(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_enabled boolean;
  v_paid boolean;
  v_existing spin_results%ROWTYPE;
  v_rewards jsonb;
  v_voucher_json jsonb;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_eligible'); END IF;

  v_paid := v_order.payment_received_at IS NOT NULL AND v_order.status <> 'cancelled'
            AND v_order.order_source = 'customer_zalo' AND v_order.zalo_user_id IS NOT NULL;
  IF NOT v_paid THEN RETURN jsonb_build_object('status','not_eligible'); END IF;

  SELECT spin_enabled INTO v_enabled FROM stores WHERE id = v_order.store_id;

  -- Đơn không có UID → ẩn ô voucher (không thể phát mã đúng người)
  SELECT jsonb_agg(jsonb_build_object('id',id,'label',label,'type',type) ORDER BY sort_order, id)
    INTO v_rewards FROM spin_rewards
   WHERE store_id=v_order.store_id AND is_active
     AND (v_order.zalo_user_id IS NOT NULL OR type <> 'voucher');

  IF NOT COALESCE(v_enabled,false) OR v_rewards IS NULL THEN
    RETURN jsonb_build_object('status','disabled');
  END IF;

  SELECT * INTO v_existing FROM spin_results WHERE order_id = p_order_id;
  IF FOUND THEN
    SELECT jsonb_build_object('code', vc.code, 'label', vc.label, 'expires_at', vc.expires_at)
      INTO v_voucher_json FROM vouchers vc WHERE vc.spin_result_id = v_existing.id;
    RETURN jsonb_build_object('status','done','already',true,'rewards',v_rewards,
      'result', jsonb_build_object('result_id',v_existing.id,'reward_id',v_existing.reward_id,
        'label',v_existing.reward_label,'type',v_existing.reward_type,
        'code',upper(left(v_existing.id::text,6)),'redeem_status',v_existing.status,
        'voucher', v_voucher_json));
  END IF;

  RETURN jsonb_build_object('status','available','rewards',v_rewards);
END; $$;

CREATE OR REPLACE FUNCTION spin_wheel(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_enabled boolean;
  v_paid boolean;
  v_existing spin_results%ROWTYPE;
  v_rewards jsonb;
  v_total int;
  v_r numeric;
  v_pick spin_rewards%ROWTYPE;
  v_new spin_results%ROWTYPE;
  v_voucher vouchers%ROWTYPE;
  v_voucher_json jsonb;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_eligible'); END IF;

  v_paid := v_order.payment_received_at IS NOT NULL AND v_order.status <> 'cancelled'
            AND v_order.order_source = 'customer_zalo' AND v_order.zalo_user_id IS NOT NULL;
  IF NOT v_paid THEN RETURN jsonb_build_object('status','not_eligible'); END IF;

  SELECT spin_enabled INTO v_enabled FROM stores WHERE id = v_order.store_id;
  IF NOT COALESCE(v_enabled,false) THEN RETURN jsonb_build_object('status','disabled'); END IF;

  SELECT jsonb_agg(jsonb_build_object('id',id,'label',label,'type',type) ORDER BY sort_order, id)
    INTO v_rewards FROM spin_rewards
   WHERE store_id=v_order.store_id AND is_active
     AND (v_order.zalo_user_id IS NOT NULL OR type <> 'voucher');
  IF v_rewards IS NULL THEN RETURN jsonb_build_object('status','disabled'); END IF;

  -- Idempotent: đã quay rồi → trả kết quả cũ (kèm voucher nếu có)
  SELECT * INTO v_existing FROM spin_results WHERE order_id = p_order_id;
  IF FOUND THEN
    SELECT jsonb_build_object('code', vc.code, 'label', vc.label, 'expires_at', vc.expires_at)
      INTO v_voucher_json FROM vouchers vc WHERE vc.spin_result_id = v_existing.id;
    RETURN jsonb_build_object('status','done','already',true,'rewards',v_rewards,
      'result', jsonb_build_object('result_id',v_existing.id,'reward_id',v_existing.reward_id,
        'label',v_existing.reward_label,'type',v_existing.reward_type,
        'code',upper(left(v_existing.id::text,6)),'redeem_status',v_existing.status,
        'voucher', v_voucher_json));
  END IF;

  -- Random theo weight — cùng bộ lọc với v_rewards (loại voucher nếu đơn không UID)
  SELECT sum(weight) INTO v_total FROM spin_rewards
   WHERE store_id=v_order.store_id AND is_active
     AND (v_order.zalo_user_id IS NOT NULL OR type <> 'voucher');
  v_r := random() * v_total;
  SELECT s.* INTO v_pick FROM (
    SELECT sr.*, sum(sr.weight) OVER (ORDER BY sr.sort_order, sr.id) AS running
    FROM spin_rewards sr
    WHERE sr.store_id=v_order.store_id AND sr.is_active
      AND (v_order.zalo_user_id IS NOT NULL OR sr.type <> 'voucher')
  ) s WHERE v_r < s.running ORDER BY s.running ASC LIMIT 1;
  IF v_pick.id IS NULL THEN
    SELECT * INTO v_pick FROM spin_rewards
     WHERE store_id=v_order.store_id AND is_active
       AND (v_order.zalo_user_id IS NOT NULL OR type <> 'voucher')
     ORDER BY sort_order, id LIMIT 1;
  END IF;

  INSERT INTO spin_results (store_id, order_id, zalo_user_id, reward_id, reward_label, reward_type)
  VALUES (v_order.store_id, p_order_id, v_order.zalo_user_id, v_pick.id, v_pick.label, v_pick.type)
  ON CONFLICT (order_id) DO NOTHING
  RETURNING * INTO v_new;
  IF v_new.id IS NULL THEN
    SELECT * INTO v_new FROM spin_results WHERE order_id = p_order_id;
  END IF;

  -- Trúng ô voucher → phát mã gắn UID của đơn, cùng transaction.
  IF v_new.reward_type = 'voucher'
     AND NOT EXISTS (SELECT 1 FROM vouchers WHERE spin_result_id = v_new.id) THEN
    INSERT INTO vouchers (store_id, code, kind, label, discount_type, discount_value,
                          max_discount, zalo_user_id, max_uses, expires_at, spin_result_id)
    SELECT v_order.store_id, upper(left(v_new.id::text, 6)), 'spin', sr.label,
           COALESCE(sr.discount_type, 'fixed'), COALESCE(sr.discount_value, 0),
           sr.max_discount, v_order.zalo_user_id, 1,
           now() + make_interval(days => COALESCE(sr.voucher_days, 30)), v_new.id
    FROM spin_rewards sr WHERE sr.id = v_new.reward_id
      AND COALESCE(sr.discount_value, 0) > 0;
  END IF;

  SELECT jsonb_build_object('code', vc.code, 'label', vc.label, 'expires_at', vc.expires_at)
    INTO v_voucher_json FROM vouchers vc WHERE vc.spin_result_id = v_new.id;

  RETURN jsonb_build_object('status','done','already',false,'rewards',v_rewards,
    'result', jsonb_build_object('result_id',v_new.id,'reward_id',v_new.reward_id,
      'label',v_new.reward_label,'type',v_new.reward_type,
      'code',upper(left(v_new.id::text,6)),'redeem_status',v_new.status,
      'voucher', v_voucher_json));
END; $$;
