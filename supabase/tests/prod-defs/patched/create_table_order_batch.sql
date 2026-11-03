CREATE OR REPLACE FUNCTION public.create_table_order_batch(p_store_id uuid, p_table_id uuid, p_items jsonb, p_payment_method text, p_client_request_id uuid, p_zalo_user_id text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_voucher_code text DEFAULT NULL::text, p_expected_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_table public.tables%ROWTYPE; v_request public.table_order_batch_requests%ROWTYPE;
  v_order public.orders%ROWTYPE; v_current_session_id uuid; v_created jsonb; v_actual_session_id uuid;
  v_request_table_id uuid := p_table_id; v_expected_session_id uuid := p_expected_session_id;
  v_moved_session uuid; v_moved_table uuid;
BEGIN
  IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'Thiếu mã gửi đơn'; END IF;
  IF NULLIF(btrim(p_zalo_user_id), '') IS NULL AND NULLIF(btrim(p_device_id), '') IS NULL THEN
    RAISE EXCEPTION 'Thiếu ngữ cảnh thiết bị, vui lòng quét lại QR'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_client_request_id::text, 0));
  SELECT * INTO v_request FROM public.table_order_batch_requests
    WHERE store_id = p_store_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.table_id IS DISTINCT FROM p_table_id OR v_request.expected_session_id IS DISTINCT FROM p_expected_session_id THEN
      RAISE EXCEPTION 'Mã gửi đơn không hợp lệ'; END IF;
    IF (v_request.device_id IS NOT NULL AND v_request.device_id IS DISTINCT FROM p_device_id)
       OR (v_request.zalo_user_id IS NOT NULL AND v_request.zalo_user_id IS DISTINCT FROM p_zalo_user_id) THEN
      RAISE EXCEPTION 'batch request không thuộc ngữ cảnh thiết bị này'; END IF;
    SELECT * INTO v_order FROM public.orders WHERE id = v_request.order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn đã gửi'; END IF;
    RETURN to_jsonb(v_order);
  END IF;
  -- mig 105: app chưa biết bàn đã chuyển (chưa zmp deploy / chưa kịp poll) vẫn gửi đơn ở bàn cũ.
  -- Đứng SAU khối replay để lần gửi lại so đúng table_id gốc. Người gọi thuộc phiên đã chuyển đi khỏi
  -- bàn này (bất kể bàn cũ đã có khách mới hay chưa) → làm việc trên bàn hiện tại của phiên đó;
  -- expected_session_id chỉ được là NULL (app chưa có phiên) hoặc chính phiên đã chuyển.
  SELECT m.session_id, m.table_id INTO v_moved_session, v_moved_table
    FROM public.moved_session_for_caller(p_table_id, p_zalo_user_id, p_device_id) m;
  IF v_moved_session IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.session_tables st
        WHERE st.session_id = v_moved_session AND st.table_id = p_table_id AND st.is_open) THEN
    IF p_expected_session_id IS NOT NULL AND p_expected_session_id IS DISTINCT FROM v_moved_session THEN
      RAISE EXCEPTION 'Phiên bàn đã thay đổi, vui lòng kiểm tra lại trước khi gửi món'; END IF;
    p_table_id := v_moved_table;
    v_expected_session_id := v_moved_session;
  END IF;
  SELECT * INTO v_table FROM public.tables WHERE id = p_table_id AND store_id = p_store_id AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động'; END IF;
  PERFORM public.lock_table_for_session(p_table_id);
  v_current_session_id := public.open_session_id_for_table(p_table_id);
  IF v_current_session_id IS NULL AND public.table_has_current_reservation_hold(p_table_id, now()) THEN
    RAISE EXCEPTION 'Bàn đã được đặt trước. Vui lòng báo chủ quán để mở bàn.'; END IF;
  IF v_expected_session_id IS NOT NULL AND v_expected_session_id IS DISTINCT FROM v_current_session_id THEN
    RAISE EXCEPTION 'Phiên bàn đã thay đổi, vui lòng kiểm tra lại trước khi gửi món'; END IF;
  IF v_current_session_id IS NOT NULL AND v_expected_session_id IS NULL THEN
    RAISE EXCEPTION 'Phiên bàn đã thay đổi, vui lòng kiểm tra lại trước khi gửi món'; END IF;
  v_created := public.create_order(p_store_id, p_table_id, p_items, p_payment_method, p_zalo_user_id, p_note,
    'dine_in', NULL, NULL, NULL, p_voucher_code, p_device_id);
  SELECT * INTO v_order FROM public.orders WHERE id = (v_created->>'id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tạo đơn thất bại'; END IF;
  v_actual_session_id := v_order.session_id;
  INSERT INTO public.table_order_batch_requests(
    store_id, client_request_id, table_id, order_id, expected_session_id, actual_session_id, zalo_user_id, device_id
  ) VALUES (
    p_store_id, p_client_request_id, v_request_table_id, v_order.id, p_expected_session_id,
    v_actual_session_id, NULLIF(btrim(p_zalo_user_id), ''), NULLIF(btrim(p_device_id), '')
  );
  RETURN to_jsonb(v_order);
END;
$function$
