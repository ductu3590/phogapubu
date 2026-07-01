-- 019 — RLS phải scope theo store_id, không chỉ "có phải operator không".
-- Trước file này: store_owner của quán A gọi thẳng Supabase (không qua admin-web) vẫn
-- đọc/sửa được dữ liệu quán B, vì is_operator() không phân biệt quán nào.
-- Giữ nguyên is_operator() (còn dùng ở nơi khác/tương lai) — thêm hàm mới, không sửa hàm cũ.

create or replace function is_store_scoped_operator(target_store_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from mevo_operators
    where user_id = auth.uid()
      and (role = 'mevo_superadmin' or store_id = target_store_id)
  );
$$;

-- ── stores ──────────────────────────────────────────────────────────────
drop policy if exists "auth_read_all_stores" on stores;
create policy "auth_read_all_stores" on stores
  for select to authenticated using (is_store_scoped_operator(id));

-- ── tables ──────────────────────────────────────────────────────────────
drop policy if exists "auth_read_all_tables" on tables;
create policy "auth_read_all_tables" on tables
  for select to authenticated using (is_store_scoped_operator(store_id));
drop policy if exists "auth_insert_tables" on tables;
create policy "auth_insert_tables" on tables
  for insert to authenticated with check (is_store_scoped_operator(store_id));
drop policy if exists "auth_update_tables" on tables;
create policy "auth_update_tables" on tables
  for update to authenticated using (is_store_scoped_operator(store_id)) with check (is_store_scoped_operator(store_id));
drop policy if exists "auth_delete_tables" on tables;
create policy "auth_delete_tables" on tables
  for delete to authenticated using (is_store_scoped_operator(store_id));

-- ── menu_categories ─────────────────────────────────────────────────────
drop policy if exists "auth_read_all_categories" on menu_categories;
create policy "auth_read_all_categories" on menu_categories
  for select to authenticated using (is_store_scoped_operator(store_id));
drop policy if exists "auth_insert_menu_categories" on menu_categories;
create policy "auth_insert_menu_categories" on menu_categories
  for insert to authenticated with check (is_store_scoped_operator(store_id));

-- ── menu_items ──────────────────────────────────────────────────────────
drop policy if exists "auth_read_all_items" on menu_items;
create policy "auth_read_all_items" on menu_items
  for select to authenticated using (is_store_scoped_operator(store_id));
drop policy if exists "auth_insert_menu_items" on menu_items;
create policy "auth_insert_menu_items" on menu_items
  for insert to authenticated with check (is_store_scoped_operator(store_id));
drop policy if exists "auth_update_menu_items" on menu_items;
create policy "auth_update_menu_items" on menu_items
  for update to authenticated using (is_store_scoped_operator(store_id)) with check (is_store_scoped_operator(store_id));
drop policy if exists "auth_delete_menu_items" on menu_items;
create policy "auth_delete_menu_items" on menu_items
  for delete to authenticated using (is_store_scoped_operator(store_id));

-- ── orders / order_items ────────────────────────────────────────────────
drop policy if exists "auth_update_orders" on orders;
create policy "auth_update_orders" on orders
  for update to authenticated using (is_store_scoped_operator(store_id)) with check (is_store_scoped_operator(store_id));
drop policy if exists "auth_read_orders" on orders;
create policy "auth_read_orders" on orders
  for select to authenticated using (is_store_scoped_operator(store_id));
drop policy if exists "auth_read_order_items" on order_items;
create policy "auth_read_order_items" on order_items
  for select to authenticated using (
    exists (select 1 from orders o where o.id = order_items.order_id and is_store_scoped_operator(o.store_id))
  );

-- ── service_requests / toppings / menu_item_toppings ───────────────────
drop policy if exists "auth_select_service_requests" on service_requests;
create policy "auth_select_service_requests" on service_requests
  for select to authenticated using (is_store_scoped_operator(store_id));
drop policy if exists "auth_read_toppings" on toppings;
create policy "auth_read_toppings" on toppings
  for select to authenticated using (is_store_scoped_operator(store_id));
drop policy if exists "auth_read_mit" on menu_item_toppings;
create policy "auth_read_mit" on menu_item_toppings
  for select to authenticated using (is_store_scoped_operator(store_id));
