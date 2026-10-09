-- 099 (2026-10-09, Đợt 2 POS — A5 "Khách lẻ"): thu ngân chọn một bàn TRỐNG, chọn món hộ khách ngay.
-- MỘT giao dịch: mở phiên bàn + ghi món tay (pos_add_manual_items, order_source='pos', KHÔNG vào bếp — món ăn
-- sẵn như lạc, nem; món cần bếp thì khách gọi QR, hoặc in phiếu từ lịch sử). Gộp một giao dịch để không bao giờ
-- để lại phiên rỗng 0đ giữ bàn khi thu ngân bỏ ngang.
-- Idempotent theo client_request_id: bấm lại sau khi mạng chập chờn trả đúng đơn cũ, không mở phiên thứ hai.

CREATE OR REPLACE FUNCTION public.pos_walk_in_order(
  p_table_id uuid,
  p_items jsonb,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table public.tables%ROWTYPE;
  v_existing public.orders%ROWTYPE;
  v_session_id uuid;
  v_result jsonb;
BEGIN
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu mã chống tạo trùng';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cần ít nhất một món';
  END IF;

  SELECT * INTO v_table FROM public.tables WHERE id = p_table_id;
  IF NOT FOUND OR NOT v_table.is_active THEN
    RAISE EXCEPTION 'Bàn không tồn tại hoặc đã ngừng dùng';
  END IF;
  IF NOT public.is_store_pos_operator(v_table.store_id) THEN
    RAISE EXCEPTION 'Bạn không có quyền mở bàn';
  END IF;

  -- Lần bấm trước đã thành công → trả lại đúng kết quả cũ.
  SELECT * INTO v_existing FROM public.orders
  WHERE store_id = v_table.store_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('order_id', v_existing.id, 'session_id', v_existing.session_id,
                              'total_amount', v_existing.total_amount, 'already_created', true);
  END IF;

  PERFORM public.lock_table_for_session(p_table_id);
  IF public.open_session_id_for_table(p_table_id) IS NOT NULL THEN
    RAISE EXCEPTION '% vừa có khách. Chọn bàn khác hoặc thêm món vào bill bàn đó', v_table.table_number;
  END IF;

  INSERT INTO public.table_sessions (store_id, table_id, opened_by, is_open_ordering)
  VALUES (v_table.store_id, p_table_id, 'staff', false)
  RETURNING id INTO v_session_id;

  INSERT INTO public.session_tables (session_id, table_id) VALUES (v_session_id, p_table_id);

  v_result := public.pos_add_manual_items(v_session_id, p_items, p_client_request_id);
  RETURN v_result || jsonb_build_object('session_id', v_session_id);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_walk_in_order(uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_walk_in_order(uuid, jsonb, uuid) TO authenticated;
