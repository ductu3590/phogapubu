-- Mig 137: người còn cờ bắt đổi mật khẩu lần đầu bị DB từ chối, không chỉ admin-web.
--
-- Vì sao (YG 2026-11-13): cờ app_metadata.must_change_password (admin-web lib/auth/password-gate.ts) trước đây chỉ
-- chặn ở proxy + guard requireOperator. Người còn cờ vẫn gọi thẳng Supabase REST / RPC / Realtime bằng JWT của mình
-- (vd. các lượt đọc POS trong lib/pos-browser-reads.ts) và lách qua cổng. Mig này cho mọi chỗ quyết quyền vận hành
-- trong DB đọc cờ từ JWT (auth.jwt() -> app_metadata).
--
-- Đọc từ JWT, không từ auth.users: JWT mang cờ CŨ tới khi được làm mới (≤ 1 giờ). Vì vậy changeInitialPassword
-- (admin-web app/(auth)/change-password/actions.ts) gọi supabase.auth.refreshSession() ngay sau khi gỡ cờ, để người
-- vừa đổi xong dùng được ngay. Chiều ngược lại (chủ quán đặt lại mật khẩu → bật cờ) JWT cũ chưa mang cờ tới lần làm
-- mới kế tiếp; trong lúc đó admin-web vẫn chặn vì đọc cờ từ auth.getUser().
--
-- Phạm vi (đã rà prod 2026-11-13: mọi hàm public đọc mevo_operators theo auth.uid(), mọi policy authenticated):
--   * 7 helper quyền: is_store_scoped_operator, is_store_owner_or_admin, is_store_pos_operator, is_store_back_office,
--     is_store_owner_of, reservation_operator_actor_kind, get_print_mode. ~50 RPC còn lại và mọi policy RLS đọc bảng
--     quán đều đi qua các helper này.
--   * 7 RPC tự đọc thẳng mevo_operators: get_store_workflow_settings, update_store_workflow_settings,
--     pos_get_floor_layout, pos_save_floor_layout, revoke_reservation_customer_access,
--     requeue_reservation_zca_notification, staff_create_order.
--   * 2 policy viết thẳng điều kiện (store_workflow_settings, store_workflow_setting_events) → đổi sang
--     is_store_owner_or_admin(store_id), cùng nghĩa (đang bật, chủ đúng quán hoặc superadmin).
--   * KHÔNG đổi: policy operator_read_self trên mevo_operators (người còn cờ vẫn đọc dòng của mình — trang
--     /change-password, loadOperator và changeInitialPassword cần nó). Token bếp / phần mềm in / khách Mini App không
--     mang app_metadata nên không bị ảnh hưởng.
--
-- Vá tại chỗ (pg_get_functiondef + replace + EXECUTE). Neo là một đoạn nguyên văn trên prod, phải khớp đúng một lần;
-- đã vá rồi thì RAISE — không chạy lại lần hai. Áp NGUYÊN VĂN file.

-- Hàm nội bộ: TRUE = được phép (JWT không mang cờ). Chỉ đúng chuỗi 'true' mới chặn, khớp mustChangePassword() ở TS
-- (thiếu cờ / false = không chặn, tài khoản cũ giữ nguyên hành vi). Chỉ gọi từ hàm SECURITY DEFINER (chủ = postgres).
-- Đọc claims đúng như thân auth.jwt() của Supabase (request.jwt.claim rồi request.jwt.claims) nhưng KHÔNG gọi
-- auth.jwt(): hàm đó do GoTrue tạo, ảnh supabase/postgres trần của test race (scripts/test-race.mjs) không có.
CREATE FUNCTION public.operator_password_ok() RETURNS boolean
LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT coalesce(
    coalesce(
      nullif(current_setting('request.jwt.claim', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb -> 'app_metadata' ->> 'must_change_password',
    ''
  ) IS DISTINCT FROM 'true'
$$;
REVOKE ALL ON FUNCTION public.operator_password_ok() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION pg_temp.mig137_patch(p_sig text, p_anchor text, p_new text) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_def   text := pg_get_functiondef(p_sig::regprocedure);
  v_count integer;
BEGIN
  IF position('mig 137' in v_def) > 0 THEN
    RAISE EXCEPTION 'mig 137: % đã được vá rồi', p_sig;
  END IF;
  v_count := (length(v_def) - length(replace(v_def, p_anchor, ''))) / length(p_anchor);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'mig 137: % — neo "%" khớp % lần (cần đúng 1), thân hàm prod đã khác, không vá',
      p_sig, p_anchor, v_count;
  END IF;
  EXECUTE replace(v_def, p_anchor, p_new);
END
$fn$;

-- 1. Helper quyền (LANGUAGE sql). Neo "where user_id = auth.uid()" nằm cuối dòng, các điều kiện còn lại nối bằng AND.
SELECT pg_temp.mig137_patch('public.is_store_scoped_operator(uuid)',
  $a$where user_id = auth.uid()$a$,
  $n$where user_id = auth.uid() and public.operator_password_ok() /* mig 137 */$n$);
SELECT pg_temp.mig137_patch('public.is_store_owner_or_admin(uuid)',
  $a$where user_id = auth.uid()$a$,
  $n$where user_id = auth.uid() and public.operator_password_ok() /* mig 137 */$n$);
SELECT pg_temp.mig137_patch('public.is_store_pos_operator(uuid)',
  $a$where user_id = auth.uid()$a$,
  $n$where user_id = auth.uid() and public.operator_password_ok() /* mig 137 */$n$);
SELECT pg_temp.mig137_patch('public.is_store_back_office(uuid)',
  $a$where user_id = auth.uid()$a$,
  $n$where user_id = auth.uid() and public.operator_password_ok() /* mig 137 */$n$);
SELECT pg_temp.mig137_patch('public.is_store_owner_of(uuid)',
  $a$where user_id = auth.uid()$a$,
  $n$where user_id = auth.uid() and public.operator_password_ok() /* mig 137 */$n$);
-- Còn cờ → không thấy dòng operator → rơi về 'browser' (mặc định), không lộ cấu hình quán.
SELECT pg_temp.mig137_patch('public.get_print_mode()',
  $a$WHERE o.user_id = auth.uid() AND o.is_active$a$,
  $n$WHERE o.user_id = auth.uid() AND o.is_active AND public.operator_password_ok() /* mig 137 */$n$);

-- 2. Hàm plpgsql đọc dòng operator vào biến: còn cờ → không có dòng → nhánh từ chối sẵn có của từng hàm.
SELECT pg_temp.mig137_patch('public.reservation_operator_actor_kind(uuid)',
  $a$WHERE user_id = auth.uid() AND is_active IS TRUE;$a$,
  $n$WHERE user_id = auth.uid() AND is_active IS TRUE AND public.operator_password_ok() /* mig 137 */;$n$);
SELECT pg_temp.mig137_patch('public.revoke_reservation_customer_access(uuid,text)',
  $a$WHERE user_id = auth.uid() AND is_active IS TRUE;$a$,
  $n$WHERE user_id = auth.uid() AND is_active IS TRUE AND public.operator_password_ok() /* mig 137 */;$n$);
SELECT pg_temp.mig137_patch('public.get_store_workflow_settings(uuid)',
  $a$WHERE user_id = auth.uid() AND is_active = true;$a$,
  $n$WHERE user_id = auth.uid() AND is_active = true AND public.operator_password_ok() /* mig 137 */;$n$);
SELECT pg_temp.mig137_patch('public.update_store_workflow_settings(uuid,jsonb,text)',
  $a$WHERE user_id = v_uid AND is_active = true;$a$,
  $n$WHERE user_id = v_uid AND is_active = true AND public.operator_password_ok() /* mig 137 */;$n$);
SELECT pg_temp.mig137_patch('public.pos_get_floor_layout()',
  $a$WHERE user_id = auth.uid() AND role IN ('store_owner', 'store_cashier', 'store_manager') AND is_active = true;$a$,
  $n$WHERE user_id = auth.uid() AND role IN ('store_owner', 'store_cashier', 'store_manager') AND is_active = true AND public.operator_password_ok() /* mig 137 */;$n$);
SELECT pg_temp.mig137_patch('public.pos_save_floor_layout(integer,jsonb,jsonb)',
  $a$WHERE user_id = auth.uid() AND role = 'store_owner' AND is_active = true;$a$,
  $n$WHERE user_id = auth.uid() AND role = 'store_owner' AND is_active = true AND public.operator_password_ok() /* mig 137 */;$n$);
SELECT pg_temp.mig137_patch('public.requeue_reservation_zca_notification(uuid,uuid,timestamp with time zone,uuid,text)',
  $a$AND op.store_id IS NULL AND op.is_active) THEN$a$,
  $n$AND op.store_id IS NULL AND op.is_active AND public.operator_password_ok() /* mig 137 */) THEN$n$);
SELECT pg_temp.mig137_patch('public.staff_create_order(uuid,jsonb,text,uuid,text)',
  $a$from mevo_operators where user_id = v_uid and is_active;$a$,
  $n$from mevo_operators where user_id = v_uid and is_active and public.operator_password_ok() /* mig 137 */;$n$);

-- 3. Hai policy viết thẳng điều kiện → đi qua helper đã vá (cùng nghĩa).
DROP POLICY workflow_settings_operator_read ON public.store_workflow_settings;
CREATE POLICY workflow_settings_operator_read ON public.store_workflow_settings
  FOR SELECT TO authenticated USING (public.is_store_owner_or_admin(store_id));
DROP POLICY workflow_events_operator_read ON public.store_workflow_setting_events;
CREATE POLICY workflow_events_operator_read ON public.store_workflow_setting_events
  FOR SELECT TO authenticated USING (public.is_store_owner_or_admin(store_id));

NOTIFY pgrst, 'reload schema';
