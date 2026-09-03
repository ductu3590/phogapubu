-- 045_pos_confirm_order.sql — thu ngân xác nhận đơn rồi in 2 liên (phiếu bếp + phiếu bàn)
-- Spec: docs/superpowers/specs/2026-09-03-pos-cashier-bill-edit-design.md (bổ sung 2026-09-04)
--
-- Bối cảnh: Bia lẩu Bảo Lương KHÔNG dùng màn hình bếp. Đơn khách gọi từ mini-app về thẳng máy
-- thu ngân; thu ngân xem món, bấm Xác nhận, máy in ra 2 liên — một cho bếp, một đặt ở bàn khách
-- để nhân viên bưng món ra thì gạch bút. Vậy "vào bếp" ở quán này = "thu ngân đã bấm xác nhận".
--
-- File này chỉ tạo HÀM MỚI (pos_confirm_order, is_store_owner_of) + thêm cột, KHÔNG chứa
-- CREATE OR REPLACE của bất kỳ RPC đang chạy thật → chạy lại an toàn (quyết định 2026-09-01).

-- ============================================================
-- 1) Dấu vết xác nhận
-- ============================================================
alter table orders add column if not exists confirmed_at timestamptz;
alter table orders add column if not exists confirmed_by uuid references auth.users(id);

comment on column orders.confirmed_at is
  'Lúc thu ngân bấm Xác nhận ở /admin/cashier (in phiếu bếp). NULL = chưa ai xác nhận.';
comment on column orders.confirmed_by is
  'Ai bấm Xác nhận. Trả lời "ai cho đơn này vào bếp" khi đối chiếu cuối ca.';

-- ============================================================
-- 2) Helper: đúng CHỦ QUÁN của quán đó
--    is_store_scoped_operator (mig 019) cho cả store_staff — không đủ chặt cho việc quyết định
--    đơn nào vào bếp và (sprint sau) sửa bill.
-- ============================================================
create or replace function is_store_owner_of(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from mevo_operators
     where user_id = auth.uid()
       and is_active
       and role = 'store_owner'
       and store_id = p_store_id
  );
$$;
revoke all on function is_store_owner_of(uuid) from public;
revoke all on function is_store_owner_of(uuid) from anon;
grant execute on function is_store_owner_of(uuid) to authenticated;

-- ============================================================
-- 3) pos_confirm_order — pending -> confirmed, chỉ chủ quán, idempotent
--    KHÔNG dùng kitchen_set_status: hàm đó lấy quán từ JWT bếp (kitchen_store_id) và cố tình
--    không cho set 'confirmed'. Đây là cửa khác, danh tính khác.
-- ============================================================
create or replace function pos_confirm_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_o orders%rowtype;
begin
  select * into v_o from orders where id = p_order_id for update;
  if not found then raise exception 'Không tìm thấy đơn'; end if;
  if not is_store_owner_of(v_o.store_id) then
    raise exception 'Chỉ chủ quán mới xác nhận đơn';
  end if;
  if v_o.status = 'cancelled' then raise exception 'Đơn đã huỷ, không xác nhận được'; end if;

  -- Bấm hai lần / hai máy cùng bấm: giữ nguyên người xác nhận ĐẦU TIÊN (nếp confirm_manual_payment).
  if v_o.status <> 'pending' then
    return jsonb_build_object('ok', true, 'already', true, 'status', v_o.status);
  end if;

  update orders
     set status       = 'confirmed',
         confirmed_at = coalesce(confirmed_at, now()),
         confirmed_by = coalesce(confirmed_by, auth.uid())
   where id = p_order_id;

  return jsonb_build_object('ok', true, 'already', false, 'status', 'confirmed');
end $$;
revoke all on function pos_confirm_order(uuid) from public;
revoke all on function pos_confirm_order(uuid) from anon;
grant execute on function pos_confirm_order(uuid) to authenticated;

notify pgrst, 'reload schema';
