-- 103 (2026-10-13): trang Đặt bàn làm lại (phương án B) — lịch "khách đã đến + bill đã đóng" coi là XONG,
-- rời bảng đang xử lý, vào cột "Đã qua" + thống kê.
--
-- Vì sao cần: close_table_session chỉ chuyển đặt bàn arrived → completed khi đóng bằng 'paid' (mig 056).
-- Bill đóng vì 'staff_reset' (Bỏ bàn) / 'expired' (job 6 giờ) để đặt bàn kẹt ở 'arrived' MÃI — prod có 7 lịch
-- như vậy, trang cũ giữ chúng vĩnh viễn với nút "Mở bill trên POS" không còn bill nào để mở.
-- KHÔNG đổi status trong DB (comment mig 056: expiry/merge không được giả vờ khách đã xong bữa) — chỉ đọc
-- thêm trạng thái bill để màn hình phân loại.
--
-- ⚠️ list_reservation_queue vá TẠI CHỖ (pg_get_functiondef → replace → EXECUTE), không chép thân hàm từ file cũ
-- (quyết định 2026-09-01). Chuỗi cần vá không còn thì DỪNG.

-- 1. Hàng đợi trả thêm `session_closed`.
CREATE OR REPLACE FUNCTION pg_temp.mevo_patch(p_sig text, p_from text, p_to text)
RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef(p_sig::regprocedure);
  IF position(p_from IN v_def) = 0 THEN
    RAISE EXCEPTION 'mig 103: % không còn chuỗi cần vá: %', p_sig, p_from;
  END IF;
  EXECUTE replace(v_def, p_from, p_to);
END
$patch$;

SELECT pg_temp.mevo_patch(
  'public.list_reservation_queue(uuid,timestamptz,timestamptz)',
  $from$'session_id', r.session_id$from$,
  $to$'session_id', r.session_id,
        'session_closed', (r.session_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.table_sessions s WHERE s.id = r.session_id AND s.status = 'closed'))$to$
);

-- 2. Lịch sử đặt bàn từ p_since: mọi lượt đã kết thúc + lượt đã đến mà bill đã đóng.
--    Bàn lấy CẢ bàn đã nhả (released_at) — đặt bàn đã xong thì bàn nào cũng đã nhả.
CREATE OR REPLACE FUNCTION public.list_reservation_history(p_store_id uuid, p_since timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.reservation_operator_actor_kind(p_store_id);
  IF p_since IS NULL THEN
    RAISE EXCEPTION 'Thiếu mốc thời gian lịch sử đặt bàn';
  END IF;

  SELECT COALESCE(jsonb_agg(h.item ORDER BY h.arrival_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'reservation_id', r.id,
      'status', r.status,
      'customer_name', r.customer_name,
      'customer_phone', r.customer_phone,
      'party_size', r.party_size,
      'arrival_at', r.arrival_at,
      'note', r.note,
      'session_closed', (s.status = 'closed'),
      'table_numbers', COALESCE((
        SELECT jsonb_agg(DISTINCT t.table_number)
        FROM public.reservation_tables rt
        JOIN public.tables t ON t.id = rt.table_id AND t.store_id = rt.store_id
        WHERE rt.reservation_id = r.id
      ), '[]'::jsonb)
    ) AS item,
    r.arrival_at
    FROM public.reservations r
    LEFT JOIN public.table_sessions s ON s.id = r.session_id
    WHERE r.store_id = p_store_id
      AND r.arrival_at >= p_since
      AND (
        r.status IN ('completed', 'no_show', 'cancelled_by_customer', 'cancelled_by_store', 'rejected')
        OR (r.status = 'arrived' AND s.status = 'closed')
      )
    ORDER BY r.arrival_at DESC
    LIMIT 2000
  ) h;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_reservation_history(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_reservation_history(uuid, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
