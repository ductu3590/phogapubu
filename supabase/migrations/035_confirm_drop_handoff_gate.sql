-- 035: BỎ điều kiện bank_handoff_at khi xác nhận đơn khách chuyển khoản.
-- Lý do: notify BANK của Zalo về rất chập chờn (nhiều đơn không được set bank_handoff_at) →
-- gán điều kiện này làm owner/bếp KHÔNG xác nhận được đơn khách đã trả tiền thật → đơn kẹt.
-- Giờ: cho xác nhận MỌI đơn zalo_checkout chưa thu tiền + KHÔNG phải ví (ví do callback tự lo).
-- Owner/bếp tự nhìn app ngân hàng rồi bấm; đơn khách bỏ dở không trả sẽ tự huỷ sau 30' (sweep).

-- (a) kitchen_confirm_payment — bỏ check bank_handoff_at
create or replace function kitchen_confirm_payment(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_store uuid := kitchen_store_id();
  v_can_cash boolean;
begin
  select * into v_order from orders where id = p_order_id and store_id = v_store;
  if not found then raise exception 'Không tìm thấy đơn'; end if;
  if v_order.status = 'cancelled' then raise exception 'Đơn đã huỷ'; end if;

  if v_order.payment_received_at is not null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  if v_order.payment_method = 'cash' then
    select kitchen_can_confirm_cash into v_can_cash from stores where id = v_store;
    if not coalesce(v_can_cash, false) then
      raise exception 'Bếp không được xác nhận tiền mặt (bật trong cài đặt quán nếu cần)';
    end if;
  elsif v_order.payment_method = 'zalo_checkout' then
    if v_order.payment_instrument = 'wallet' then
      raise exception 'Đơn ví đã tự xác nhận, không cần bấm';
    end if;
  end if;

  update orders
     set payment_received_at = now(),
         payment_received_via = 'kitchen'
   where id = p_order_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function kitchen_confirm_payment(uuid) from public;
revoke all on function kitchen_confirm_payment(uuid) from anon;
grant execute on function kitchen_confirm_payment(uuid) to kitchen;

-- (b) confirm_manual_payment (owner) — bỏ check bank_handoff_at
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

  if v_order.payment_method not in ('cash','bank_transfer')
     and not (v_order.payment_method = 'zalo_checkout'
              and v_order.payment_instrument is distinct from 'wallet') then
    raise exception 'Đơn ví Zalo tự xác nhận, không xác nhận tay';
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
