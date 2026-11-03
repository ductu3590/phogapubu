CREATE OR REPLACE FUNCTION public.confirm_manual_payment(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if v_order.status = 'cancelled' then raise exception 'Đơn đã huỷ'; end if;
  if v_order.payment_received_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'received_at', v_order.payment_received_at);
  end if;
  update orders
  set payment_received_at = now(), payment_received_via = 'owner', payment_received_by = auth.uid()
  where id = p_order_id;
  return jsonb_build_object('ok', true, 'already', false);
end $function$
