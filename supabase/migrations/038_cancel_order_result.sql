-- 038_cancel_order_result.sql
-- cancel_order (mig 007a) RETURNS void: UPDATE trúng 0 dòng KHÔNG sinh lỗi → client tưởng đã
-- huỷ trong khi đơn còn nguyên. Ca hỏng: khách bấm "Sửa món" đúng lúc bếp bấm "Đã nhận tiền"
-- → banner tắt, khách đặt đơn mới, quán ôm 2 đơn mà 1 đơn đã thu tiền.
-- Sửa: trả jsonb {result, reason} + chặn hẳn đơn đã có payment_received_at.
-- Đổi kiểu trả về đòi DROP trước (Postgres không cho CREATE OR REPLACE khi đổi return type).
-- An toàn: useCancelOrder ở mini-app hiện CHƯA nơi nào gọi.

drop function if exists cancel_order(uuid, text);

create function cancel_order(p_order_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype;
begin
  select * into v_order from orders
   where id = p_order_id and capability_token = p_token;
  if not found then
    return jsonb_build_object('result','blocked','reason','not_found_or_bad_token');
  end if;

  -- Idempotent: bấm hai lần không thành lỗi
  if v_order.status = 'cancelled' then
    return jsonb_build_object('result','already_cancelled');
  end if;

  -- Không bao giờ huỷ đơn đã có tiền thật
  if v_order.payment_received_at is not null then
    return jsonb_build_object('result','blocked','reason','already_paid');
  end if;

  if v_order.status <> 'pending' then
    return jsonb_build_object('result','blocked','reason','in_progress');
  end if;

  update orders set status = 'cancelled'
   where id = p_order_id and status = 'pending' and payment_received_at is null;
  if not found then
    -- Đơn đổi trạng thái giữa lúc đọc và ghi
    return jsonb_build_object('result','blocked','reason','race');
  end if;

  return jsonb_build_object('result','cancelled');
end $$;

revoke all on function cancel_order(uuid, text) from public;
grant execute on function cancel_order(uuid, text) to anon;
