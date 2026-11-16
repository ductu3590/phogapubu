-- Mig 142: xoá bàn (một hoặc nhiều) KỂ CẢ bàn đã từng có đơn — lịch sử + doanh thu cũ chuyển sang một bàn còn lại.
--
-- Vì sao (anh Tú, 2026-11-16): trước đây bàn đã có đơn chỉ "Đóng" được, không xoá được (orders.table_id là khoá ngoại
-- NO ACTION); quán đổi sơ đồ thì danh sách bàn cũ cứ nằm đó. Anh chọn: xoá được, doanh thu cũ dồn sang "bàn số 1" để
-- không mất doanh thu. Bàn nhận do server action chọn (bàn đầu tiên theo thứ tự tên tự nhiên trong số bàn còn lại,
-- lib/table-delete.ts) và hiện rõ trong câu xác nhận; hàm này chỉ kiểm bàn đó hợp lệ.
--
-- Chặn (giống luật Đóng bàn, mig 138): bàn đang có khách (phiên mở), bàn đang giữ cho lượt đặt bàn sắp tới, bàn có đơn
-- trả trước đang làm dở (đơn không thuộc phiên nào, còn ở pending/confirmed/cooking/ready).
--
-- Chuyển sang bàn nhận (mọi bảng trỏ tới tables.id, đo prod 2026-11-16):
--   orders.table_id, table_sessions.table_id, session_tables (PK session_id+table_id), reservation_tables
--   (PK reservation_id+table_id, khoá ngoại ghép store_id+table_id), table_order_batch_requests.table_id,
--   table_session_moves.from_table_id / to_table_id. Dòng session_tables / reservation_tables đã có sẵn bàn nhận
--   (mâm ghép cả hai bàn) thì xoá dòng của bàn bị xoá thay vì trùng khoá.
--   service_requests: khoá ngoại CASCADE — yêu cầu gọi nhân viên của bàn bị xoá mất theo (như xoá bàn trước đây).
-- orders.updated_at giữ nguyên (cờ mevo.keep_updated_at, mig 141) để đơn cũ không nhảy sang báo cáo hôm nay.
--
-- Khoá: FOR UPDATE mọi bàn của quán trước khi kiểm → phiên / đơn mới trên bàn sắp xoá (FK lấy KEY SHARE) phải chờ,
-- xong giao dịch thì bàn đã mất và lệnh của họ hỏng khoá ngoại, không có đơn mồ côi.
--
-- Hàm nội bộ: chỉ service_role (server action deleteTables đã kiểm chủ quán + lọc store_id).

CREATE FUNCTION public.delete_tables_keep_history(p_store_id uuid, p_table_ids uuid[], p_target_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ids      uuid[];
  v_found    integer;
  v_name     text;
  v_history  boolean;
  v_orders   integer := 0;
  v_sessions integer := 0;
  v_deleted  integer := 0;
BEGIN
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_table_ids) AS x WHERE x IS NOT NULL;
  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'Chưa chọn bàn nào để xoá';
  END IF;
  IF cardinality(v_ids) > 500 THEN
    RAISE EXCEPTION 'Mỗi lần xoá tối đa 500 bàn';
  END IF;

  PERFORM 1 FROM public.tables WHERE store_id = p_store_id ORDER BY id FOR UPDATE;

  SELECT count(*) INTO v_found FROM public.tables WHERE store_id = p_store_id AND id = ANY (v_ids);
  IF v_found <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Có bàn không thuộc quán hoặc đã bị xoá. Tải lại trang rồi chọn lại.';
  END IF;

  SELECT t.table_number INTO v_name
  FROM public.tables t
  WHERE t.id = ANY (v_ids)
    AND (EXISTS (SELECT 1 FROM public.session_tables st WHERE st.table_id = t.id AND st.is_open)
         OR EXISTS (SELECT 1 FROM public.table_sessions ts WHERE ts.table_id = t.id AND ts.status = 'open'))
  ORDER BY t.table_number LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Bàn "%" đang có khách (phiên chưa đóng). Thu tiền hoặc đóng phiên ở POS rồi mới xoá bàn.', v_name;
  END IF;

  SELECT t.table_number INTO v_name
  FROM public.tables t
  JOIN public.reservation_tables rt ON rt.table_id = t.id
  JOIN public.reservations r ON r.id = rt.reservation_id
  WHERE t.id = ANY (v_ids)
    AND rt.released_at IS NULL
    AND rt.hold_ends_at > now()
    AND r.status IN ('pending', 'confirmed', 'change_requested')
  ORDER BY t.table_number LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Bàn "%" đang được giữ cho một lượt đặt bàn sắp tới. Đổi bàn cho lượt đặt đó trước rồi mới xoá bàn.', v_name;
  END IF;

  SELECT t.table_number INTO v_name
  FROM public.tables t
  JOIN public.orders o ON o.table_id = t.id
  WHERE t.id = ANY (v_ids)
    AND o.session_id IS NULL
    AND o.status IN ('pending', 'confirmed', 'cooking', 'ready')
  ORDER BY t.table_number LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Bàn "%" còn đơn đang làm dở. Hoàn tất hoặc huỷ đơn đó rồi mới xoá bàn.', v_name;
  END IF;

  v_history := EXISTS (SELECT 1 FROM public.orders WHERE table_id = ANY (v_ids))
    OR EXISTS (SELECT 1 FROM public.table_sessions WHERE table_id = ANY (v_ids))
    OR EXISTS (SELECT 1 FROM public.session_tables WHERE table_id = ANY (v_ids))
    OR EXISTS (SELECT 1 FROM public.reservation_tables WHERE table_id = ANY (v_ids))
    OR EXISTS (SELECT 1 FROM public.table_order_batch_requests WHERE table_id = ANY (v_ids))
    OR EXISTS (SELECT 1 FROM public.table_session_moves WHERE from_table_id = ANY (v_ids) OR to_table_id = ANY (v_ids));

  IF v_history THEN
    IF p_target_table_id IS NULL THEN
      RAISE EXCEPTION 'Bàn đã có đơn cũ: cần giữ lại ít nhất một bàn để nhận doanh thu cũ.';
    END IF;
    IF p_target_table_id = ANY (v_ids) THEN
      RAISE EXCEPTION 'Bàn nhận doanh thu cũ không được nằm trong danh sách xoá.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tables WHERE id = p_target_table_id AND store_id = p_store_id) THEN
      RAISE EXCEPTION 'Không tìm thấy bàn nhận doanh thu cũ. Tải lại trang rồi thử lại.';
    END IF;

    PERFORM set_config('mevo.keep_updated_at', 'on', true);
    UPDATE public.orders SET table_id = p_target_table_id WHERE table_id = ANY (v_ids);
    GET DIAGNOSTICS v_orders = ROW_COUNT;
    PERFORM set_config('mevo.keep_updated_at', '', true);

    UPDATE public.table_sessions SET table_id = p_target_table_id WHERE table_id = ANY (v_ids);
    GET DIAGNOSTICS v_sessions = ROW_COUNT;

    DELETE FROM public.session_tables st
    WHERE st.table_id = ANY (v_ids)
      AND EXISTS (SELECT 1 FROM public.session_tables x WHERE x.session_id = st.session_id AND x.table_id = p_target_table_id);
    -- Phiên cũ ghép nhiều bàn bị xoá cùng lúc: giữ một dòng cho mỗi phiên rồi mới đổi sang bàn nhận.
    DELETE FROM public.session_tables st
    WHERE st.table_id = ANY (v_ids)
      AND EXISTS (SELECT 1 FROM public.session_tables x
                  WHERE x.session_id = st.session_id AND x.table_id = ANY (v_ids) AND x.table_id < st.table_id);
    UPDATE public.session_tables SET table_id = p_target_table_id WHERE table_id = ANY (v_ids);

    DELETE FROM public.reservation_tables rt
    WHERE rt.table_id = ANY (v_ids)
      AND EXISTS (SELECT 1 FROM public.reservation_tables x WHERE x.reservation_id = rt.reservation_id AND x.table_id = p_target_table_id);
    DELETE FROM public.reservation_tables rt
    WHERE rt.table_id = ANY (v_ids)
      AND EXISTS (SELECT 1 FROM public.reservation_tables x
                  WHERE x.reservation_id = rt.reservation_id AND x.table_id = ANY (v_ids) AND x.table_id < rt.table_id);
    UPDATE public.reservation_tables SET table_id = p_target_table_id WHERE table_id = ANY (v_ids);

    UPDATE public.table_order_batch_requests SET table_id = p_target_table_id WHERE table_id = ANY (v_ids);
    UPDATE public.table_session_moves SET from_table_id = p_target_table_id WHERE from_table_id = ANY (v_ids);
    UPDATE public.table_session_moves SET to_table_id = p_target_table_id WHERE to_table_id = ANY (v_ids);
  END IF;

  DELETE FROM public.tables WHERE store_id = p_store_id AND id = ANY (v_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('deleted', v_deleted, 'moved_orders', v_orders, 'moved_sessions', v_sessions,
    'target_table_id', CASE WHEN v_history THEN p_target_table_id END);
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_tables_keep_history(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tables_keep_history(uuid, uuid[], uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
