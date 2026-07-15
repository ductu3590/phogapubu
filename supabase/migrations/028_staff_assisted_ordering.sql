-- 028 — Staff Assisted Ordering: RLS theo role, audit đơn, RPC đặt hộ.
--
-- THỨ TỰ TRONG FILE NÀY QUAN TRỌNG:
--   1) Helper phân quyền + viết lại policy ghi   ← PHẢI xong trước
--   2) Nới role cho phép 'store_staff'            ← chỉ sau khi (1) xong
-- Đảo thứ tự = có cửa sổ mà staff có quyền owner.
--
-- Gốc rễ: is_store_scoped_operator() (019:6) KHÔNG đọc cột role — nó chỉ hỏi
-- "có phải operator của quán này không". Nên chỉ cần INSERT một dòng
-- role='store_staff' là nhân viên có ngay quyền ghi ngang chủ quán:
-- sửa giá món, xoá bàn, TỰ TẠO MÃ GIẢM GIÁ (vouchers FOR ALL), tự set
-- payment_received_at. Kể cả khi gọi thẳng Supabase REST, không qua admin-web.

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
--    redeem_spin_result có 2 bản: 025:167 và overload 027:419.
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
