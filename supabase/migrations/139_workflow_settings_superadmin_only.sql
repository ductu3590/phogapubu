-- Mig 139: quy trình vận hành chỉ MEVO (superadmin) sửa; chủ quán chỉ còn đổi "Đang nhận đơn" + "Giờ phục vụ".
--
-- Vì sao (anh Tú, 2026-11-13): chủ quán sửa nhầm chính sách (thời điểm thanh toán, xuống bếp, phiên bàn…) là gây lỗi
-- vận hành; v1 mọi cấu hình quán do MEVO làm. Anh chọn chừa hai mục chủ quán vẫn tự đổi hằng ngày — tạm ngưng nhận
-- đơn và giờ phục vụ — vì chúng không sửa được ở chỗ nào khác. Giao diện /admin đã khoá các mục còn lại; mig này chặn
-- cả ở DB vì chủ quán vẫn gọi thẳng RPC update_store_workflow_settings bằng phiên đăng nhập của mình.
--
-- Cách chặn: RPC vẫn nhận đủ 19 khoá (giữ nguyên hợp đồng). Với vai store_owner, mọi khoá TRỪ is_accepting_orders /
-- serving_hours phải giữ NGUYÊN giá trị đang lưu (so với store_workflow_snapshot, jsonb so sánh đúng kiểu và thứ tự
-- mảng); khác một khoá là từ chối cả lần lưu. Superadmin không đổi gì.
--
-- Vá tại chỗ (pg_get_functiondef + replace + EXECUTE). Neo là MỘT dòng nguyên văn trên prod (đo 2026-11-13, sau mig 137),
-- phải khớp đúng một lần; đã vá rồi thì RAISE — không chạy lại lần hai. Áp NGUYÊN VĂN file.
--
-- Thứ tự áp so với deploy: áp TRƯỚC khi code mới lên Vercel cũng an toàn — trang /admin cũ gửi đủ 19 khoá lấy từ giá
-- trị đang lưu, nên chủ quán chỉ đổi Đang nhận đơn / Giờ phục vụ vẫn lưu được; đổi mục khác thì bị từ chối (trang cũ
-- ném lỗi nên Next production chỉ hiện câu lỗi chung, không hiện câu tiếng Việt dưới đây).

CREATE FUNCTION pg_temp.mig139_patch(p_sig text, p_anchor text, p_new text) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_def   text := pg_get_functiondef(p_sig::regprocedure);
  v_count integer;
BEGIN
  IF position('mig 139' in v_def) > 0 THEN
    RAISE EXCEPTION 'mig 139: % đã được vá rồi', p_sig;
  END IF;
  v_count := (length(v_def) - length(replace(v_def, p_anchor, ''))) / length(p_anchor);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'mig 139: % — neo "%" khớp % lần (cần đúng 1), thân hàm prod đã khác, không vá',
      p_sig, p_anchor, v_count;
  END IF;
  EXECUTE replace(v_def, p_anchor, p_new);
END
$fn$;

SELECT pg_temp.mig139_patch(
  'public.update_store_workflow_settings(uuid,jsonb,text)',
  $a$  v_before := public.store_workflow_snapshot(p_store_id);$a$,
  $n$  v_before := public.store_workflow_snapshot(p_store_id);
  -- mig 139: chủ quán chỉ đổi được Đang nhận đơn + Giờ phục vụ; mọi khoá khác phải giữ nguyên giá trị đang lưu.
  IF v_role = 'store_owner' AND EXISTS (
    SELECT 1
    FROM unnest(v_expected_keys) AS locked(key)
    WHERE locked.key NOT IN ('is_accepting_orders', 'serving_hours')
      AND (v_before -> locked.key) IS DISTINCT FROM (p_settings -> locked.key)
  ) THEN
    RAISE EXCEPTION 'Chủ quán chỉ đổi được Đang nhận đơn và Giờ phục vụ. Các mục quy trình khác do MEVO cấu hình — cần đổi thì liên hệ MEVO.';
  END IF;$n$);

NOTIFY pgrst, 'reload schema';
