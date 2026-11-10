-- Mig 129: thu tiền / bỏ bàn không còn bị chặn bởi đơn "tự vào bếp" đang ở status 'pending'.
--
-- Vì sao: close_table_session_core (gọi từ collect_table_bill, Bỏ bàn, gộp bill) từ chối 'Còn N đơn chưa được chủ quán
-- xác nhận' khi phiên còn đơn 'pending'. Đơn của kênh có chính sách xuống bếp = automatic KHÔNG BAO GIỜ được ai bấm duyệt
-- (đã vào bếp, phiếu tự in) nên nằm 'pending' mãi → bàn không thu tiền được (test CFG bài 7, Bảo Lương: đơn nhân viên với
-- staff_order_release_policy = automatic). Cùng luật với cờ needs_pos_confirmation của mig 128: chỉ đơn mà chính sách của
-- KÊNH đơn (nhân viên → staff_order_release_policy, còn lại → kitchen_release_policy) KHÁC 'automatic' mới chặn.
-- Đóng phiên 'paid' vẫn chuyển mọi đơn chưa huỷ sang 'paid' như mig 085.
--
-- Vá tại chỗ (pg_get_functiondef + replace + EXECUTE). Neo một dòng, phải khớp đúng một lần; không khớp thì RAISE
-- (đã vá rồi cũng RAISE — không chạy lại lần hai).

DO $mig$
DECLARE
  v_sig    regprocedure := 'public.close_table_session_core(uuid,text,text,uuid)'::regprocedure;
  v_def    text := pg_get_functiondef(v_sig);
  v_anchor text := $a$    AND order_source <> 'pos';$a$;
  v_new    text := $n$    AND order_source <> 'pos'
    -- mig 129: đơn của kênh "tự vào bếp" vẫn 'pending' nhưng không chờ ai duyệt → không chặn thu tiền
    AND CASE WHEN order_source = 'staff'
             THEN public.store_workflow_snapshot(v_session.store_id) ->> 'staff_order_release_policy'
             ELSE public.store_workflow_snapshot(v_session.store_id) ->> 'kitchen_release_policy' END
        IS DISTINCT FROM 'automatic';$n$;
  v_count  integer;
BEGIN
  IF position('mig 129' in v_def) > 0 THEN
    RAISE EXCEPTION 'mig 129: close_table_session_core đã được vá rồi';
  END IF;
  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'mig 129: neo khớp % lần (cần đúng 1) — thân hàm prod đã khác, không vá', v_count;
  END IF;
  EXECUTE replace(v_def, v_anchor, v_new);
END
$mig$;
