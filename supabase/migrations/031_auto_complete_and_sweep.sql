-- 031_auto_complete_and_sweep.sql
-- (a) Item 4: đơn TẠI BÀN — bếp xong (ready) + đã nhận tiền → TỰ hoàn tất (status='paid'),
--     khỏi bấm nút "Hoàn tất". Takeaway GIỮ luồng "Đã nhận"/tự-30-phút (mig 013), không đụng.
-- (b) Item 1: quét huỷ đơn khách tự đặt online 'pending' bỏ dở > 30 phút (lazy on-read, theo
--     nếp get_takeaway_orders — KHÔNG dùng pg_cron).

-- ============================================================
-- (a) Trigger tự hoàn tất đơn tại bàn khi ready + đã nhận tiền
-- ============================================================
create or replace function auto_complete_dine_in() returns trigger
language plpgsql as $$
begin
  -- WHEN clause đã lọc điều kiện; ở đây chỉ đóng đơn.
  new.status := 'paid';
  new.completed_at := coalesce(new.completed_at, now());
  return new;
end $$;

drop trigger if exists trg_auto_complete_dine_in on orders;
create trigger trg_auto_complete_dine_in
  before update on orders
  for each row
  when (
    new.order_type = 'dine_in'
    and new.status = 'ready'
    and new.payment_received_at is not null
  )
  execute function auto_complete_dine_in();

-- ============================================================
-- (b) Quét huỷ đơn khách online bỏ dở (lazy on-read từ admin)
-- ============================================================
create or replace function sweep_abandoned_orders(p_store_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not is_store_owner_or_admin(p_store_id) then
    raise exception 'Không có quyền';
  end if;

  update orders set status = 'cancelled'
  where store_id = p_store_id
    and order_source = 'customer_zalo'
    and payment_method = 'zalopay'          -- chỉ đơn online; đơn cash khách vào bếp ngay, KHÔNG quét
    and status = 'pending'
    and payment_received_at is null
    and created_at < now() - interval '30 minutes';
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function sweep_abandoned_orders(uuid) from public;
revoke all on function sweep_abandoned_orders(uuid) from anon;
grant execute on function sweep_abandoned_orders(uuid) to authenticated;
