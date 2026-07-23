-- 033_kitchen_confirm_payment.sql — PM-3
-- (a) kitchen_confirm_payment: bếp bấm "Đã nhận tiền" trên màn bếp (role kitchen, không auth.uid).
-- (b) Nới confirm_manual_payment (owner): cho phép xác nhận đơn KHÁCH chuyển khoản (zalo_checkout
--     đã sang app ngân hàng) — trước đây bị kẹt vì hàm chỉ nhận cash/bank_transfer.

-- ============================================================
-- (a) kitchen_confirm_payment — role kitchen
-- ============================================================
create or replace function kitchen_confirm_payment(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_store uuid := kitchen_store_id();   -- từ JWT, fail-closed
  v_can_cash boolean;
begin
  select * into v_order from orders where id = p_order_id and store_id = v_store;
  if not found then raise exception 'Không tìm thấy đơn'; end if;
  if v_order.status = 'cancelled' then raise exception 'Đơn đã huỷ'; end if;

  -- Idempotent: đã có tiền rồi thì thôi (ví callback / owner / lần bấm trước) — không ghi đè.
  if v_order.payment_received_at is not null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  -- Gate theo kênh:
  if v_order.payment_method = 'cash' then
    select kitchen_can_confirm_cash into v_can_cash from stores where id = v_store;
    if not coalesce(v_can_cash, false) then
      raise exception 'Bếp không được xác nhận tiền mặt (bật trong cài đặt quán nếu cần)';
    end if;
  elsif v_order.payment_method = 'zalo_checkout' then
    -- Chỉ cho xác nhận đơn khách ĐÃ sang app ngân hàng (bank_handoff_at). Đơn ví (instrument
    -- 'wallet') do callback tự lo → không cho bấm tay.
    if v_order.bank_handoff_at is null then
      raise exception 'Khách chưa chuyển khoản';
    end if;
    if v_order.payment_instrument = 'wallet' then
      raise exception 'Đơn ví đã tự xác nhận, không cần bấm';
    end if;
  end if;
  -- bank_transfer (đơn staff): luôn cho phép.

  update orders
     set payment_received_at = now(),
         payment_received_via = 'kitchen'   -- by = null (3-state: nhánh via in kitchen/... + by null)
   where id = p_order_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function kitchen_confirm_payment(uuid) from public;
revoke all on function kitchen_confirm_payment(uuid) from anon;
grant execute on function kitchen_confirm_payment(uuid) to kitchen;

-- ============================================================
-- (b) confirm_manual_payment (owner) — nới cho zalo_checkout đã bank_handoff
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

  -- Cho phép: cash, bank_transfer (như cũ); THÊM: zalo_checkout khi khách đã sang app ngân hàng
  -- (bank_handoff_at) và KHÔNG phải ví (ví do callback lo). Từ chối đơn ví / đơn chưa chọn gì.
  if v_order.payment_method not in ('cash','bank_transfer')
     and not (v_order.payment_method = 'zalo_checkout'
              and v_order.bank_handoff_at is not null
              and v_order.payment_instrument is distinct from 'wallet') then
    raise exception 'Đơn này không xác nhận tay được (ví Zalo tự xác nhận / khách chưa chuyển khoản)';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Đơn đã huỷ';
  end if;

  if v_order.payment_received_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'received_at', v_order.payment_received_at);
  end if;

  update orders
  set payment_received_at = now(),
      payment_received_via = 'owner',
      payment_received_by = auth.uid()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'already', false);
end $$;
revoke all on function confirm_manual_payment(uuid) from public;
revoke all on function confirm_manual_payment(uuid) from anon;
grant execute on function confirm_manual_payment(uuid) to authenticated;
