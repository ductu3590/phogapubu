CREATE OR REPLACE FUNCTION public.kitchen_confirm_payment(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- mig 110: lượt thuộc phiên bàn còn thu ở POS → thu cả bàn bằng close_table_session, không thu lẻ.
  if v_order.session_id is not null and exists (
    select 1 from public.table_sessions s
     where s.id = v_order.session_id
       and (s.status = 'open' or s.close_reason = 'expired')
  ) then
    raise exception 'Bàn trả sau thu cả bàn một lần ở POS (Thanh toán)';
  end if;
  update orders
     set payment_received_at = now(), payment_received_via = 'kitchen'
   where id = p_order_id;
  return jsonb_build_object('ok', true);
end $function$
