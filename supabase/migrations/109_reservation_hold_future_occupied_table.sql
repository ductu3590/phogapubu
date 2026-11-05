-- 109 (2026-11-03): đặt bàn được giữ một bàn ĐANG CÓ KHÁCH nếu giờ hẹn còn xa (hơn 60 phút).
--
-- Vì sao cần: assign_reservation_tables chặn MỌI bàn có phiên mở, bất kể giờ hẹn. Trên Timeline POS,
-- nút "+ Đặt lúc HH:MM" của bàn đang có khách nằm sau thanh phiên; bấm vào thì đặt bàn được tạo nhưng
-- bước giữ bàn bị từ chối ("Bàn đang có khách") → rơi về "Chưa xếp bàn", thu ngân phải xác nhận lại.
-- Khách ngồi lúc 18:00 không có lý do gì chặn đặt bàn đó cho 21:00.
--
-- Luật mới: phiên mở chỉ chặn khi khung giữ bàn ĐÃ BẮT ĐẦU (v_hold_starts_at = giờ hẹn − 60 phút,
-- khớp khoá trước giờ hẹn mig 075 và CONFLICT_LEAD_MINUTES của POS). Tới khung đó mà khách cũ chưa
-- đứng dậy thì POS báo xung đột như mọi đặt bàn khác.
--
-- ⚠️ Vá TẠI CHỖ (pg_get_functiondef → replace → EXECUTE), không chép thân hàm từ file cũ. Chuỗi cần vá
-- không còn thì DỪNG.

CREATE OR REPLACE FUNCTION pg_temp.mevo_patch(p_sig text, p_from text, p_to text)
RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef(p_sig::regprocedure);
  IF position(p_from IN v_def) = 0 THEN
    RAISE EXCEPTION 'mig 109: % không còn chuỗi cần vá: %', p_sig, p_from;
  END IF;
  EXECUTE replace(v_def, p_from, p_to);
END
$patch$;

SELECT pg_temp.mevo_patch(
  'public.assign_reservation_tables(uuid,uuid,timestamptz,integer,uuid[],uuid)',
  $from$IF public.open_session_id_for_table(v_table_id) IS NOT NULL THEN$from$,
  $to$IF v_hold_starts_at <= now() AND public.open_session_id_for_table(v_table_id) IS NOT NULL THEN$to$
);
