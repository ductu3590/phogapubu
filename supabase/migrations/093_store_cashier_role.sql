-- 093 (PA-2, 2026-10-08): vai trò Thu ngân (store_cashier).
-- Thu ngân làm được MỌI thao tác POS / đặt bàn / báo cáo như chủ quán; KHÔNG sửa cấu hình (menu, giá,
-- bàn, sơ đồ, cài đặt, nhân viên, ưu đãi, vòng quay) — các quyền đó dùng is_store_owner_or_admin / service-role.
--
-- ⚠️ Cách sửa hàm sống: đọc định nghĩa ĐANG CHẠY (pg_get_functiondef) → thay chuỗi → EXECUTE. Không chép
-- thân hàm từ file migration cũ (chạy lại file cũ sẽ lùi hàm về bản cũ — quyết định 2026-09-01). File này
-- vì thế KHÔNG tự đứng một mình: nó vá lên prod hiện tại; chuỗi cần thay không còn thì DỪNG (raise).

-- 1. Vai trò mới
ALTER TABLE public.mevo_operators DROP CONSTRAINT IF EXISTS mevo_operators_role_check;
ALTER TABLE public.mevo_operators ADD CONSTRAINT mevo_operators_role_check
  CHECK (role = ANY (ARRAY['mevo_superadmin', 'store_owner', 'store_staff', 'store_cashier']));
ALTER TABLE public.mevo_operators DROP CONSTRAINT IF EXISTS mevo_operators_role_store_check;
ALTER TABLE public.mevo_operators ADD CONSTRAINT mevo_operators_role_store_check
  CHECK ((role = 'mevo_superadmin' AND store_id IS NULL)
      OR (role = ANY (ARRAY['store_owner', 'store_staff', 'store_cashier']) AND store_id IS NOT NULL));

-- 2. Người vận hành POS của quán = chủ quán HOẶC thu ngân (đang bật).
CREATE OR REPLACE FUNCTION public.is_store_pos_operator(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from mevo_operators
     where user_id = auth.uid()
       and is_active
       and role in ('store_owner', 'store_cashier')
       and store_id = p_store_id
  );
$function$;
REVOKE ALL ON FUNCTION public.is_store_pos_operator(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_pos_operator(uuid) TO authenticated;

-- 3. Helper vá tại chỗ (chỉ sống trong phiên chạy migration).
CREATE OR REPLACE FUNCTION pg_temp.mevo_patch(p_sig text, p_from text, p_to text)
RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef(p_sig::regprocedure);
  IF position(p_from IN v_def) = 0 THEN
    RAISE EXCEPTION 'mig 093: % không còn chuỗi cần vá: %', p_sig, p_from;
  END IF;
  EXECUTE replace(v_def, p_from, p_to);
END
$patch$;

-- 4. 16 RPC POS / đặt bàn / báo cáo: chủ quán → chủ quán hoặc thu ngân.
SELECT pg_temp.mevo_patch(sig, 'is_store_owner_of(', 'is_store_pos_operator(')
FROM unnest(ARRAY[
  'public.cancel_store_reservation(uuid,text)',
  'public.close_table_session(uuid,text,text)',
  'public.get_daily_report(uuid,date)',
  'public.get_reservation_preorder_print_job(uuid)',
  'public.list_prearrival_reserved_table_ids(uuid)',
  'public.list_reservation_customer_calls(uuid)',
  'public.list_reservation_preorder_queue(uuid)',
  'public.pos_add_manual_items(uuid,jsonb,uuid)',
  'public.pos_confirm_order(uuid)',
  'public.pos_reject_order(uuid,text,text)',
  'public.pos_restore_order_item(uuid)',
  'public.pos_void_order_item(uuid,text,text)',
  'public.release_reservation_preorder(uuid,integer,uuid)',
  'public.request_reservation_preorder_print(uuid,integer,text,uuid,text)',
  'public.resolve_preorder_waste(uuid,text,uuid)',
  'public.resolve_reservation_customer_call(uuid,text)'
]) AS sig;

-- 5. Ba hàm có literal vai trò.
-- Nhật ký đặt bàn: thu ngân ghi actor_kind 'owner' (CHECK chỉ nhận customer/owner/mevo/system); uid vẫn là thu ngân.
SELECT pg_temp.mevo_patch('public.reservation_operator_actor_kind(uuid)',
  $$IF v_role = 'store_owner' AND v_operator_store = p_store_id THEN RETURN 'owner'; END IF;$$,
  $$IF v_role IN ('store_owner', 'store_cashier') AND v_operator_store = p_store_id THEN RETURN 'owner'; END IF;$$);
-- Sơ đồ POS: thu ngân XEM được; lưu sơ đồ (pos_save_floor_layout) vẫn chỉ chủ quán.
SELECT pg_temp.mevo_patch('public.pos_get_floor_layout()',
  $$AND role = 'store_owner' AND is_active = true;$$,
  $$AND role IN ('store_owner', 'store_cashier') AND is_active = true;$$);
-- Đặt hộ ở khu /staff: thu ngân vào được khu nhân viên nên cũng đặt hộ được.
SELECT pg_temp.mevo_patch('public.staff_create_order(uuid,jsonb,text,uuid,text)',
  $$v_role not in ('store_owner','store_staff')$$,
  $$v_role not in ('store_owner','store_staff','store_cashier')$$);

-- 6. Sơ đồ khu: POS (chủ quán + thu ngân) nghe realtime bảng table_areas.
DROP POLICY IF EXISTS owner_read_table_areas ON public.table_areas;
DROP POLICY IF EXISTS pos_read_table_areas ON public.table_areas;
CREATE POLICY pos_read_table_areas ON public.table_areas
  FOR SELECT TO authenticated USING (public.is_store_pos_operator(store_id));

-- 7. Bật/tắt "Tạm hết" — RPC riêng, KHÔNG mở RLS UPDATE menu_items cho thu ngân (sẽ sửa được giá).
CREATE OR REPLACE FUNCTION public.set_menu_item_available(p_item_id uuid, p_available boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_store uuid;
BEGIN
  IF p_item_id IS NULL OR p_available IS NULL THEN RAISE EXCEPTION 'Thiếu món hoặc trạng thái'; END IF;
  SELECT store_id INTO v_store FROM public.menu_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy món'; END IF;
  IF NOT public.is_store_pos_operator(v_store) THEN RAISE EXCEPTION 'Không có quyền đổi trạng thái món'; END IF;
  UPDATE public.menu_items SET is_available = p_available WHERE id = p_item_id;
  RETURN jsonb_build_object('ok', true, 'is_available', p_available);
END;
$function$;
REVOKE ALL ON FUNCTION public.set_menu_item_available(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_menu_item_available(uuid, boolean) TO authenticated;
