-- 028 — Staff Assisted Ordering: RLS theo role, audit đơn, RPC đặt hộ.
--
-- THỨ TỰ TRONG FILE NÀY QUAN TRỌNG — siết quyền (mục 1-3) PHẢI đứng trước
-- khi nới role (mục 4). Đảo lại = có cửa sổ mà staff có quyền owner.
--   1) Helper phân quyền có đọc role
--   2) Viết lại 11 policy ghi sang helper đó
--   3) Guard trong RPC redeem_spin_result
--   4) Nới role cho phép 'store_staff'   ← chỉ sau khi 1-3 xong
--
-- Gốc rễ: is_store_scoped_operator() (019:6) KHÔNG đọc cột role — nó chỉ hỏi
-- "có phải operator của quán này không". Nên chỉ cần INSERT một dòng
-- role='store_staff' là nhân viên có ngay quyền ghi ngang chủ quán:
-- sửa giá món, xoá bàn, TỰ TẠO MÃ GIẢM GIÁ (vouchers FOR ALL), tự set
-- payment_received_at. Kể cả khi gọi thẳng Supabase REST, không qua admin-web.
--
-- ⚠️ HỆ QUẢ CHO SA-3 (UI staff): vouchers và spin_rewards chỉ có ĐÚNG MỘT
-- policy `authenticated` là `FOR ALL` — mà FOR ALL bao gồm cả SELECT. Nên sau
-- file này, store_staff KHÔNG ĐỌC được vouchers/spin_rewards qua REST, chứ
-- không chỉ mất quyền ghi. Hiện không phá gì (mini-app đọc voucher qua RPC
-- security definer, bếp có policy riêng, /admin/vouchers là màn của owner).
-- Nếu màn staff sau này cần hiện mã giảm giá → phải thêm policy SELECT riêng,
-- ĐỪNG nới FOR ALL trở lại.

-- ============================================================
-- 1) Helper GHI: có đọc role. Giữ is_store_scoped_operator() cho ĐỌC.
-- ============================================================
create or replace function is_store_owner_or_admin(target_store_id uuid)
  returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from mevo_operators
    where user_id = auth.uid()
      and (
        role = 'mevo_superadmin'
        or (role = 'store_owner' and store_id = target_store_id)
      )
  );
$$;

-- ============================================================
-- 2) Viết lại MỌI policy GHI sang helper có kiểm role.
--    Đếm bằng pg_policies ngày 2026-07-15: 11 policy / 6 bảng.
--    ĐỌC vẫn dùng is_store_scoped_operator() — staff cần đọc menu/bàn/đơn.
-- ============================================================

-- ── tables (019) ────────────────────────────────────────────
drop policy if exists "auth_insert_tables" on tables;
create policy "auth_insert_tables" on tables
  for insert to authenticated with check (is_store_owner_or_admin(store_id));
drop policy if exists "auth_update_tables" on tables;
create policy "auth_update_tables" on tables
  for update to authenticated
  using (is_store_owner_or_admin(store_id))
  with check (is_store_owner_or_admin(store_id));
drop policy if exists "auth_delete_tables" on tables;
create policy "auth_delete_tables" on tables
  for delete to authenticated using (is_store_owner_or_admin(store_id));

-- ── menu_categories (019) ───────────────────────────────────
drop policy if exists "auth_insert_menu_categories" on menu_categories;
create policy "auth_insert_menu_categories" on menu_categories
  for insert to authenticated with check (is_store_owner_or_admin(store_id));

-- ── menu_items (019) ────────────────────────────────────────
drop policy if exists "auth_insert_menu_items" on menu_items;
create policy "auth_insert_menu_items" on menu_items
  for insert to authenticated with check (is_store_owner_or_admin(store_id));
drop policy if exists "auth_update_menu_items" on menu_items;
create policy "auth_update_menu_items" on menu_items
  for update to authenticated
  using (is_store_owner_or_admin(store_id))
  with check (is_store_owner_or_admin(store_id));
drop policy if exists "auth_delete_menu_items" on menu_items;
create policy "auth_delete_menu_items" on menu_items
  for delete to authenticated using (is_store_owner_or_admin(store_id));

-- ── orders (019) ────────────────────────────────────────────
-- Quan trọng nhất: không có dòng này thì staff tự set payment_received_at
-- qua REST, phá toàn bộ audit và quyền owner-only của confirm_manual_payment.
drop policy if exists "auth_update_orders" on orders;
create policy "auth_update_orders" on orders
  for update to authenticated
  using (is_store_owner_or_admin(store_id))
  with check (is_store_owner_or_admin(store_id));

-- ── spin_rewards (025) — FOR ALL: staff sửa được tỉ lệ trúng ──
drop policy if exists "op_all_spin_rewards" on spin_rewards;
create policy "op_all_spin_rewards" on spin_rewards
  for all to authenticated
  using (is_store_owner_or_admin(store_id))
  with check (is_store_owner_or_admin(store_id));

-- ── spin_results (025) ──────────────────────────────────────
drop policy if exists "op_update_spin_results" on spin_results;
create policy "op_update_spin_results" on spin_results
  for update to authenticated
  using (is_store_owner_or_admin(store_id))
  with check (is_store_owner_or_admin(store_id));

-- ── vouchers (027) — FOR ALL: staff TỰ TẠO MÃ GIẢM GIÁ cho mình ──
-- Nguy hiểm nhất trong 11 cái. Bỏ sót cái này thì mọi thứ khác vô nghĩa.
drop policy if exists "op_all_vouchers" on vouchers;
create policy "op_all_vouchers" on vouchers
  for all to authenticated
  using (is_store_owner_or_admin(store_id))
  with check (is_store_owner_or_admin(store_id));

-- ============================================================
-- 3) Guard trong RPC — policy không gác được, phải sửa riêng.
--    Lịch sử có 2 định nghĩa (025:161, 027:413) nhưng CÙNG chữ ký, nên
--    create-or-replace của 027 đã đè lên 025 → DB chỉ có MỘT hàm sống.
--    Đã xác minh bằng pg_proc: đây là hàm DUY NHẤT còn gọi helper cũ.
--    Bản 027 (đang chạy) cho cả bếp lẫn operator; giữ bếp, siết operator.
-- ============================================================
create or replace function redeem_spin_result(p_result_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_res spin_results%rowtype;
begin
  select * into v_res from spin_results where id = p_result_id;
  if not found then raise exception 'Không tìm thấy kết quả'; end if;
  if not (kitchen_store_id() = v_res.store_id
          or is_store_owner_or_admin(v_res.store_id)) then
    raise exception 'Không có quyền với quán này';
  end if;
  update spin_results set status='redeemed', redeemed_at=now()
    where id=p_result_id and status='won';
  return jsonb_build_object('ok', true, 'already', v_res.status='redeemed');
end $$;

-- ============================================================
-- 4) Nới role — CHỈ sau khi policy ghi đã siết (mục 2).
--    018 có HAI constraint liệt kê role tường minh. Quên cái thứ hai
--    thì store_staff bị chặn ngay lúc INSERT.
-- ============================================================
alter table mevo_operators drop constraint if exists mevo_operators_role_check;
alter table mevo_operators
  add constraint mevo_operators_role_check
  check (role in ('mevo_superadmin', 'store_owner', 'store_staff'));

alter table mevo_operators drop constraint if exists mevo_operators_role_store_check;
alter table mevo_operators
  add constraint mevo_operators_role_store_check
  check (
    (role = 'mevo_superadmin' and store_id is null)
    or (role in ('store_owner','store_staff') and store_id is not null)
  );

-- ============================================================
-- 5) Mở payment_method: thêm bank_transfer
-- ============================================================
alter table orders drop constraint if exists orders_payment_method_check;
alter table orders
  add constraint orders_payment_method_check
  check (payment_method in ('zalopay','cash','bank_transfer'));

-- stores.payment_methods: KHÔNG đụng vào.
--
-- ⚠️ LỆCH CÓ CHỦ Ý so với spec §4.1 (bảng ở đó bảo drop/recreate
--    stores_payment_methods_valid để thêm bank_transfer).
-- Lý do: stores.payment_methods là danh sách phương thức KHÁCH thấy trong
-- mini-app. bank_transfer là staff-only tới hết SA-5, và staff_create_order
-- không đọc cột này (nó tự whitelist cash|bank_transfer ở Task 5).
-- Thêm vào = mở đúng cái §4.1 dặn phải chặn. Ít thay đổi hơn, an toàn hơn.
-- PM-4 mới mở bank_transfer cho khách; lúc đó constraint này mới cần sửa.

-- ============================================================
-- 6) Cột audit + idempotency
-- ============================================================
alter table orders
  add column if not exists order_source text not null default 'customer_zalo',
  add column if not exists created_by uuid null references auth.users(id),
  add column if not exists payment_received_at timestamptz null,
  add column if not exists payment_received_by uuid null references auth.users(id),
  add column if not exists client_request_id uuid null;

alter table orders drop constraint if exists orders_order_source_check;
alter table orders
  add constraint orders_order_source_check
  check (order_source in ('customer_zalo', 'staff'));

-- Idempotency: một client_request_id chỉ ra một đơn cho mỗi quán.
-- Partial index: đơn khách (client_request_id NULL) không bị ràng buộc.
create unique index if not exists orders_store_client_request_unique
  on orders(store_id, client_request_id)
  where client_request_id is not null;
