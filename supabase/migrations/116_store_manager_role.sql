-- 116_store_manager_role.sql — Vai Quản lý (store_manager) cho Yên Garden.
-- Quản lý làm được mọi việc của thu ngân (POS, thu tiền, đặt bàn, báo cáo, bật/tắt Tạm hết, gọi món hộ ở /staff)
-- cộng việc hậu cần (kho, sổ thu chi, công nợ, báo cáo tài chính — module sau, kiểm bằng is_store_back_office),
-- nhưng KHÔNG đụng cấu hình quán. Spec: docs/superpowers/specs/2026-11-09-yg-vai-quan-ly-design.md.
--
-- 1) Hai CHECK của mevo_operators nhận thêm store_manager (bắt buộc có store_id).
-- 2) Helper mới is_store_back_office(p_store_id) = chủ quán HOẶC quản lý đang bật của đúng quán. KHÔNG gồm
--    superadmin (đúng hợp đồng chung). Module kho / thu chi / công nợ / báo cáo tài chính dùng hàm này.
-- 3) Vá tại chỗ 4 hàm so chuỗi vai trực tiếp (rà pg_proc + pg_policies trên prod 2026-11-09):
--    • is_store_pos_operator: nhận store_manager → mọi RPC POS / đặt bàn / báo cáo / set_menu_item_available tự có quyền;
--    • reservation_operator_actor_kind: Quản lý ghi actor_kind = 'owner' như thu ngân (CHECK nhật ký chỉ nhận
--      customer/owner/mevo/system);
--    • pos_get_floor_layout: Quản lý xem sơ đồ POS;
--    • staff_create_order: Quản lý gọi món hộ ở /staff.
--    GIỮ NGUYÊN (chỉ chủ quán): pos_save_floor_layout (sơ đồ là cấu hình), revoke_reservation_customer_access,
--    get/update_store_workflow_settings + RLS workflow_settings_operator_read / workflow_events_operator_read,
--    is_store_owner_of, is_store_owner_or_admin. Không so vai nên Quản lý tự có như mọi operator của quán:
--    is_store_scoped_operator, get_print_mode, is_operator. RLS table_areas.pos_read_table_areas và
--    order_item_quantity_changes.pos_read_qty_changes gọi is_store_pos_operator nên tự nhận Quản lý.
--
-- Chuỗi neo chép nguyên văn từ pg_get_functiondef trên prod (2026-11-09, cả 4 hàm không lẫn CRLF, bản chụp ở
-- supabase/tests/prod-defs/116). Prod đổi khác thì helper RAISE và cả migration dừng. Chữ ký và quyền
-- EXECUTE của 4 hàm cũ KHÔNG đổi (CREATE OR REPLACE giữ nguyên privilege).

-- ============================================================
-- 0) Điều kiện trước
-- ============================================================
DO $pre$
DECLARE v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.is_store_pos_operator(uuid)',
    'public.reservation_operator_actor_kind(uuid)',
    'public.pos_get_floor_layout()',
    'public.staff_create_order(uuid,jsonb,text,uuid,text)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'mig 116: thiếu hàm %', v_sig;
    END IF;
  END LOOP;
END
$pre$;

-- ============================================================
-- 1) Vai mới trong mevo_operators
-- ============================================================
ALTER TABLE public.mevo_operators DROP CONSTRAINT IF EXISTS mevo_operators_role_check;
ALTER TABLE public.mevo_operators ADD CONSTRAINT mevo_operators_role_check
  CHECK (role = ANY (ARRAY['mevo_superadmin', 'store_owner', 'store_staff', 'store_cashier', 'store_manager']));
ALTER TABLE public.mevo_operators DROP CONSTRAINT IF EXISTS mevo_operators_role_store_check;
ALTER TABLE public.mevo_operators ADD CONSTRAINT mevo_operators_role_store_check
  CHECK ((role = 'mevo_superadmin' AND store_id IS NULL)
      OR (role = ANY (ARRAY['store_owner', 'store_staff', 'store_cashier', 'store_manager']) AND store_id IS NOT NULL));

-- ============================================================
-- 2) Hậu cần của quán = chủ quán HOẶC quản lý (đang bật). Superadmin KHÔNG tính.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_store_back_office(p_store_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select exists (
    select 1 from mevo_operators
     where user_id = auth.uid()
       and is_active
       and role in ('store_owner', 'store_manager')
       and store_id = p_store_id
  );
$$;

-- ============================================================
-- Helper vá tại chỗ (chỉ sống trong phiên chạy migration). Mẫu mig 111:
--   • chuỗi neo phải khớp ĐÚNG MỘT lần (replace() thay mọi chỗ khớp, khớp 2 chỗ là vá nhầm);
--   • đổi CRLF → LF cho chuỗi neo/thay thế: repo bật core.autocrlf nên bản checkout trên Windows có thể là CRLF.
-- ============================================================
CREATE OR REPLACE FUNCTION pg_temp.mevo_patch(p_sig text, p_from text, p_to text)
RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text; v_from text; v_to text; v_hits int;
BEGIN
  v_from := replace(p_from, E'\r\n', E'\n');
  v_to   := replace(p_to,   E'\r\n', E'\n');
  v_def  := pg_get_functiondef(p_sig::regprocedure);
  v_hits := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
  IF v_hits = 0 THEN
    RAISE EXCEPTION 'mig 116: % không còn chuỗi cần vá: %', p_sig, v_from;
  END IF;
  IF v_hits > 1 THEN
    RAISE EXCEPTION 'mig 116: % có hơn một chỗ khớp chuỗi cần vá: %', p_sig, v_from;
  END IF;
  EXECUTE replace(v_def, v_from, v_to);
END
$patch$;

-- ============================================================
-- 3) Bốn hàm so chuỗi vai: thêm store_manager
-- ============================================================
SELECT pg_temp.mevo_patch('public.is_store_pos_operator(uuid)',
$a$role in ('store_owner', 'store_cashier')$a$,
$b$role in ('store_owner', 'store_cashier', 'store_manager')$b$);

SELECT pg_temp.mevo_patch('public.reservation_operator_actor_kind(uuid)',
$a$IF v_role IN ('store_owner', 'store_cashier') AND v_operator_store = p_store_id THEN RETURN 'owner'; END IF;$a$,
$b$IF v_role IN ('store_owner', 'store_cashier', 'store_manager') AND v_operator_store = p_store_id THEN RETURN 'owner'; END IF;$b$);

SELECT pg_temp.mevo_patch('public.pos_get_floor_layout()',
$a$AND role IN ('store_owner', 'store_cashier') AND is_active = true;$a$,
$b$AND role IN ('store_owner', 'store_cashier', 'store_manager') AND is_active = true;$b$);

SELECT pg_temp.mevo_patch('public.staff_create_order(uuid,jsonb,text,uuid,text)',
$a$v_role not in ('store_owner','store_staff','store_cashier')$a$,
$b$v_role not in ('store_owner','store_staff','store_cashier','store_manager')$b$);

-- ============================================================
-- 4) Quyền. Hàm mới dùng trong RLS của module sau: chỉ authenticated gọi được (như is_store_pos_operator mig 093).
-- ============================================================
REVOKE ALL ON FUNCTION public.is_store_back_office(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_back_office(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
