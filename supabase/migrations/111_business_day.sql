-- 111_business_day.sql — Ngày kinh doanh theo quán: báo cáo A04, Excel, phiếu cuối ngày cắt theo giờ bắt đầu
-- ngày của quán thay vì nửa đêm.
--
-- 1) Cột store_workflow_settings.business_day_start, mặc định 00:00 nên quán không đổi gì thì báo cáo ra đúng số cũ.
-- 2) Ba hàm nội bộ business_date_of, current_business_date, business_day_bounds. Ngày kinh doanh D chạy từ
--    D + giờ bắt đầu tới đúng 24 giờ sau; giao dịch đúng giờ bắt đầu thuộc ngày mới. Ngày không lưu vào giao dịch,
--    chỉ tính lúc đọc, nên đổi giờ thì báo cáo cũ tính lại theo mốc mới.
-- 3) Vá tại chỗ get_bills_report: mọi CTE đã cắt qua v_from, v_to, v_today nên chỉ vá ba biến đó và thêm
--    day_from, day_to vào kết quả. get_daily_revenue để nguyên.
-- 4) Vá tại chỗ store_workflow_snapshot để get_public_store_workflow trả business_day_start: thu ngân mở A04 không
--    đọc được get_store_workflow_settings và RLS của store_workflow_settings (chỉ chủ quán + superadmin).
-- 5) RPC riêng set_business_day_start, KHÔNG thêm khoá vào update_store_workflow_settings: hàm đó bắt đủ 19 khoá và
--    từ chối khoá lạ, thêm khoá thì Vercel bản cũ hoặc bản mới chạy lệch migration đều không lưu được cài đặt.
--
-- Chuỗi neo chép nguyên văn từ pg_get_functiondef trên prod (2026-11-06, cả 2 hàm không lẫn CRLF, bản chụp ở
-- supabase/tests/prod-defs/111). Prod đổi khác thì helper RAISE và cả migration dừng. Chữ ký các hàm cũ KHÔNG đổi.

-- ============================================================
-- 0) Điều kiện trước
-- ============================================================
DO $pre$
BEGIN
  IF to_regclass('public.store_workflow_settings') IS NULL THEN
    RAISE EXCEPTION 'mig 111: thiếu bảng store_workflow_settings';
  END IF;
  IF to_regprocedure('public.get_bills_report(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'mig 111: thiếu hàm get_bills_report(uuid,date)';
  END IF;
END
$pre$;

-- ============================================================
-- 1) Cột giờ bắt đầu ngày: 00:00 tới 12:00, bước 30 phút
-- ============================================================
ALTER TABLE public.store_workflow_settings
  ADD COLUMN business_day_start time NOT NULL DEFAULT '00:00'
  CONSTRAINT store_workflow_business_day_start_check CHECK (
    business_day_start BETWEEN time '00:00' AND time '12:00'
    AND EXTRACT(SECOND FROM business_day_start) = 0
    AND EXTRACT(MINUTE FROM business_day_start) IN (0, 30));

-- ============================================================
-- 2) Hàm tính ngày. Thiếu dòng cài đặt thì coi như 00:00.
-- ============================================================
CREATE FUNCTION public.business_date_of(p_store_id uuid, p_at timestamptz)
RETURNS date
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT ((p_at AT TIME ZONE 'Asia/Ho_Chi_Minh') - COALESCE(
    (SELECT w.business_day_start FROM public.store_workflow_settings w WHERE w.store_id = p_store_id),
    time '00:00')::interval)::date;
$$;

CREATE FUNCTION public.current_business_date(p_store_id uuid)
RETURNS date
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT public.business_date_of(p_store_id, now());
$$;

CREATE FUNCTION public.business_day_bounds(p_store_id uuid, p_date date)
RETURNS TABLE(day_from timestamptz, day_to timestamptz)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT b.day_from, b.day_from + interval '24 hours'
  FROM (
    SELECT ((p_date + COALESCE(
      (SELECT w.business_day_start FROM public.store_workflow_settings w WHERE w.store_id = p_store_id),
      time '00:00')) AT TIME ZONE 'Asia/Ho_Chi_Minh') AS day_from
  ) b;
$$;

-- ============================================================
-- Helper vá tại chỗ (chỉ sống trong phiên chạy migration). Mẫu mig 110:
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
    RAISE EXCEPTION 'mig 111: % không còn chuỗi cần vá: %', p_sig, v_from;
  END IF;
  IF v_hits > 1 THEN
    RAISE EXCEPTION 'mig 111: % có hơn một chỗ khớp chuỗi cần vá: %', p_sig, v_from;
  END IF;
  EXECUTE replace(v_def, v_from, v_to);
END
$patch$;

-- ============================================================
-- 3) get_bills_report: cắt theo ngày kinh doanh, trả mốc cắt cho giao diện
-- ============================================================
SELECT pg_temp.mevo_patch('public.get_bills_report(uuid,date)',
$a$  v_from  := (p_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_to    := ((p_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_today := p_date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;$a$,
$b$  SELECT b.day_from, b.day_to INTO v_from, v_to FROM public.business_day_bounds(p_store_id, p_date) b;
  v_today := p_date = public.current_business_date(p_store_id);$b$);

SELECT pg_temp.mevo_patch('public.get_bills_report(uuid,date)',
$a$'date', p_date,$a$,
$b$'date', p_date, 'day_from', v_from, 'day_to', v_to,$b$);

-- ============================================================
-- 4) store_workflow_snapshot: thêm business_day_start, sự kiện cài đặt thấy được trước và sau
-- ============================================================
SELECT pg_temp.mevo_patch('public.store_workflow_snapshot(uuid)',
$a$'reservation_preorder_edit_cutoff_minutes', w.reservation_preorder_edit_cutoff_minutes$a$,
$b$'reservation_preorder_edit_cutoff_minutes', w.reservation_preorder_edit_cutoff_minutes,
    'business_day_start', to_char(w.business_day_start, 'HH24:MI')$b$);

-- ============================================================
-- 5) set_business_day_start: chỉ chủ quán (hoặc MEVO). Thứ tự khoá stores → settings như update_store_workflow_settings.
-- ============================================================
CREATE FUNCTION public.set_business_day_start(p_store_id uuid, p_start time)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.is_store_owner_or_admin(p_store_id) THEN
    RAISE EXCEPTION 'Chỉ chủ quán được đổi giờ bắt đầu ngày';
  END IF;
  IF p_start IS NULL
     OR p_start > time '12:00'
     OR EXTRACT(SECOND FROM p_start) <> 0
     OR EXTRACT(MINUTE FROM p_start) NOT IN (0, 30) THEN
    RAISE EXCEPTION 'Giờ bắt đầu ngày phải từ 00:00 đến 12:00, bước 30 phút';
  END IF;

  PERFORM 1 FROM public.stores WHERE id = p_store_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy quán';
  END IF;

  INSERT INTO public.store_workflow_settings(store_id)
  VALUES (p_store_id)
  ON CONFLICT (store_id) DO NOTHING;
  PERFORM 1 FROM public.store_workflow_settings WHERE store_id = p_store_id FOR UPDATE;

  v_before := public.store_workflow_snapshot(p_store_id);

  UPDATE public.store_workflow_settings
  SET business_day_start = p_start,
      updated_at = now(),
      updated_by = v_uid
  WHERE store_id = p_store_id;

  v_after := public.store_workflow_snapshot(p_store_id);
  INSERT INTO public.store_workflow_setting_events(store_id, before_value, after_value, changed_by, changed_via)
  VALUES (
    p_store_id, v_before, v_after, v_uid,
    CASE WHEN public.is_store_owner_of(p_store_id) THEN 'owner' ELSE 'mevo' END
  );

  RETURN jsonb_build_object('ok', true, 'business_day_start', to_char(p_start, 'HH24:MI'));
END;
$$;

-- ============================================================
-- 6) Quyền. Hàm nội bộ chỉ gọi từ RPC SECURITY DEFINER; REVOKE FROM PUBLIC một mình không gỡ quyền cấp thẳng cho anon/authenticated.
-- ============================================================
REVOKE ALL ON FUNCTION public.business_date_of(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_business_date(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_day_bounds(uuid, date) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_business_day_start(uuid, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_business_day_start(uuid, time) TO authenticated;

NOTIFY pgrst, 'reload schema';
