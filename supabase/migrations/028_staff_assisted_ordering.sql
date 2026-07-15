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
