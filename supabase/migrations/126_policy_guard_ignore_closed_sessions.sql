-- Mig 126: đổi chính sách quy trình không còn bị chặn bởi đơn của PHIÊN ĐÃ ĐÓNG.
--
-- Vì sao: update_store_workflow_settings (mig 049) từ chối đổi payment_timing / chính sách xuống bếp / ... khi quán
-- còn đơn 'pending/confirmed/cooking/ready'. Đơn của phiên đã đóng (hết hạn còn nợ, Bỏ bàn) KHÔNG BAO GIỜ rời
-- các trạng thái đó: chỉ close_table_session(paid) mới chuyển đơn sang 'paid' (mig 085), không có nút nào khác.
-- Bảo Lương bị khoá vĩnh viễn bởi 2 đơn 'confirmed' của một phiên hết hạn ngày 14/10 (test CFG bài 5/7).
-- Đơn của phiên đã đóng không còn vào bếp, không nhận thêm món → đổi chính sách không ảnh hưởng chúng. Tiền còn nợ
-- vẫn nằm ở "Chờ thu" (A04) / mục phiên hết hạn ở /staff/tables như cũ.
--
-- Vá tại chỗ (pg_get_functiondef + replace + EXECUTE), KHÔNG chép thân hàm từ file cũ. Neo một dòng, phải khớp đúng
-- một lần; không khớp thì RAISE (đã vá rồi cũng RAISE — không chạy lại lần hai).

DO $mig$
DECLARE
  v_sig    regprocedure := 'public.update_store_workflow_settings(uuid,jsonb,text)'::regprocedure;
  v_def    text := pg_get_functiondef(v_sig);
  v_anchor text := $a$      AND status IN ('pending', 'confirmed', 'cooking', 'ready')$a$;
  v_new    text := $n$      AND status IN ('pending', 'confirmed', 'cooking', 'ready')
      -- mig 126: đơn của phiên đã đóng không bao giờ rời các trạng thái này → không tính là "đang hoạt động"
      AND NOT EXISTS (
        SELECT 1 FROM public.table_sessions ts
        WHERE ts.id = orders.session_id AND ts.status = 'closed'
      )$n$;
  v_count  integer;
BEGIN
  IF position('mig 126:' in v_def) > 0 THEN
    RAISE EXCEPTION 'mig 126: update_store_workflow_settings đã được vá rồi';
  END IF;
  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'mig 126: neo khớp % lần (cần đúng 1) — thân hàm prod đã khác, không vá', v_count;
  END IF;
  EXECUTE replace(v_def, v_anchor, v_new);
END
$mig$;
