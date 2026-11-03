CREATE OR REPLACE FUNCTION public.get_table_session_state(p_table_id uuid, p_zalo_user_id text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_store uuid; v_timing text; v_s public.table_sessions%ROWTYPE; v_moved_session uuid; v_moved_table uuid; v_count int; v_total bigint; v_table_names text;
BEGIN
 SELECT t.store_id INTO v_store FROM public.tables t WHERE t.id=p_table_id AND t.is_active;
 IF v_store IS NULL THEN RETURN jsonb_build_object('mode','prepay','state','free'); END IF;
 SELECT payment_timing INTO v_timing FROM public.stores WHERE id=v_store;
 IF v_timing<>'postpay' THEN RETURN jsonb_build_object('mode','prepay'); END IF;
 PERFORM public.expire_stale_table_sessions(v_store);
 -- mig 105: người gọi thuộc một phiên ĐANG MỞ vừa chuyển đi khỏi bàn này → báo app sang bàn mới.
 -- Kiểm SAU khi dọn phiên hết hạn (phiên chết không được kéo khách đi), TRƯỚC nhánh 'reserved' và trước
 -- tra phiên của bàn: bàn cũ đã có khách mới / đang giữ cho khách đặt thì chủ phiên cũ vẫn phải thấy 'moved'.
 SELECT m.session_id, m.table_id INTO v_moved_session, v_moved_table
   FROM public.moved_session_for_caller(p_table_id, p_zalo_user_id, p_device_id) m;
 IF v_moved_session IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.session_tables st
       WHERE st.session_id = v_moved_session AND st.table_id = p_table_id AND st.is_open) THEN
   RETURN jsonb_build_object('mode','postpay','state','moved','session_id',v_moved_session,
     'table_id',v_moved_table,
     'table_number',(SELECT t.table_number FROM public.tables t WHERE t.id = v_moved_table));
 END IF;
 IF public.table_has_current_reservation_hold(p_table_id,now()) THEN RETURN jsonb_build_object('mode','postpay','state','reserved'); END IF;
 SELECT * INTO v_s FROM public.table_sessions WHERE id=public.open_session_id_for_table(p_table_id);
 IF NOT FOUND THEN RETURN jsonb_build_object('mode','postpay','state','free'); END IF;
 IF NOT v_s.is_open_ordering AND NOT ((v_s.host_zalo_user_id IS NULL AND v_s.host_device_id IS NULL) OR (p_zalo_user_id IS NOT NULL AND v_s.host_zalo_user_id=p_zalo_user_id) OR (p_device_id IS NOT NULL AND v_s.host_device_id=p_device_id)) THEN RETURN jsonb_build_object('mode','postpay','state','locked','opened_at',v_s.opened_at); END IF;
 SELECT count(*),coalesce(sum(total_amount),0) INTO v_count,v_total FROM public.orders WHERE session_id=v_s.id AND status<>'cancelled';
 SELECT string_agg(t.table_number,', ' ORDER BY t.table_number) INTO v_table_names FROM public.session_tables st JOIN public.tables t ON t.id=st.table_id WHERE st.session_id=v_s.id AND st.is_open;
 RETURN jsonb_build_object('mode','postpay','state','owner','session_id',v_s.id,'opened_at',v_s.opened_at,'order_count',v_count,'total',v_total,'is_open_ordering',v_s.is_open_ordering,'table_names',v_table_names);
END; $function$
