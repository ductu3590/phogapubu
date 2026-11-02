-- 105_moved_session_redirect.sql — Không sinh "bill ma" ở bàn cũ sau khi thu ngân chuyển bàn.
-- Spec: docs/superpowers/specs/2026-11-02-chuyen-ban-giam-gia-bill-design.md §3.3, §5
-- Cần mig 104 (table_session_moves, orders.device_id, moved_session_for_caller) đã áp trước.
--
-- Vá TẠI CHỖ 3 RPC đang chạy bằng pg_get_functiondef + replace + EXECUTE (helper pg_temp bên dưới).
-- KHÔNG chép thân hàm từ file cũ: file migration của các hàm này đã cũ hơn prod. Chuỗi neo chép nguyên
-- văn từ pg_get_functiondef trên prod (2026-11-02); prod đổi khác thì helper RAISE và cả migration dừng.
--
--   1) get_table_session_state  — người gọi thuộc phiên đã chuyển đi khỏi bàn này → state 'moved'
--                                 (đứng TRƯỚC nhánh 'reserved' và trước tra phiên của bàn)
--   2) create_table_order_batch — app cũ còn gửi đơn ở bàn cũ → đổi sang bàn hiện tại của phiên
--                                 (sau khối replay chống gửi trùng; bản ghi chống trùng vẫn lưu bàn gốc)
--   3) create_order             — lớp phòng thủ cuối: chuyển hướng trước khi khoá/mở phiên ở bàn cũ,
--                                 và ghi orders.device_id để khách không cho Zalo UID vẫn được nhận ra
--
-- Phiên đang giữ lại CHÍNH bàn được hỏi (vd bàn cũ được thêm lại vào mâm) → không chuyển hướng gì,
-- chạy tiếp như bình thường.

-- ============================================================
-- 0) Điều kiện trước: thân plpgsql chỉ phân giải tên lúc CHẠY, nên thiếu mig 104 thì các bản vá vẫn
--    tạo được nhưng mọi đơn tại bàn sẽ lỗi. Chặn ngay ở đây.
-- ============================================================
DO $pre$
BEGIN
  PERFORM 'public.moved_session_for_caller(uuid,text,text)'::regprocedure;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'device_id'
  ) THEN
    RAISE EXCEPTION 'mig 105: thiếu cột orders.device_id — áp mig 104 trước';
  END IF;
END
$pre$;

-- ============================================================
-- Helper vá tại chỗ (chỉ sống trong phiên chạy migration). Mẫu mig 093, thêm 2 chốt:
--   • chuỗi neo phải khớp ĐÚNG MỘT lần (replace() thay mọi chỗ khớp — khớp 2 chỗ là vá nhầm);
--   • đổi CRLF → LF: repo bật core.autocrlf nên bản checkout trên Windows có thể là CRLF,
--     còn thân hàm trên prod là LF → neo nhiều dòng sẽ không bao giờ khớp.
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
    RAISE EXCEPTION 'mig 105: % không còn chuỗi cần vá: %', p_sig, v_from;
  END IF;
  IF v_hits > 1 THEN
    RAISE EXCEPTION 'mig 105: % có hơn một chỗ khớp chuỗi cần vá: %', p_sig, v_from;
  END IF;
  EXECUTE replace(v_def, v_from, v_to);
END
$patch$;

-- ============================================================
-- 1) get_table_session_state
-- ============================================================
SELECT pg_temp.mevo_patch('public.get_table_session_state(uuid,text,text)',
$a$DECLARE v_store uuid; v_timing text; v_s public.table_sessions%ROWTYPE;$a$,
$b$DECLARE v_store uuid; v_timing text; v_s public.table_sessions%ROWTYPE; v_moved_session uuid; v_moved_table uuid;$b$);

SELECT pg_temp.mevo_patch('public.get_table_session_state(uuid,text,text)',
$a$ PERFORM public.expire_stale_table_sessions(v_store);
 IF public.table_has_current_reservation_hold(p_table_id,now()) THEN RETURN jsonb_build_object('mode','postpay','state','reserved'); END IF;$a$,
$b$ PERFORM public.expire_stale_table_sessions(v_store);
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
 IF public.table_has_current_reservation_hold(p_table_id,now()) THEN RETURN jsonb_build_object('mode','postpay','state','reserved'); END IF;$b$);

-- ============================================================
-- 2) create_table_order_batch
-- ============================================================
SELECT pg_temp.mevo_patch('public.create_table_order_batch(uuid,uuid,jsonb,text,uuid,text,text,text,text,uuid)',
$a$  v_order public.orders%ROWTYPE; v_current_session_id uuid; v_created jsonb; v_actual_session_id uuid;
BEGIN$a$,
$b$  v_order public.orders%ROWTYPE; v_current_session_id uuid; v_created jsonb; v_actual_session_id uuid;
  v_request_table_id uuid := p_table_id; v_expected_session_id uuid := p_expected_session_id;
  v_moved_session uuid; v_moved_table uuid;
BEGIN$b$);

SELECT pg_temp.mevo_patch('public.create_table_order_batch(uuid,uuid,jsonb,text,uuid,text,text,text,text,uuid)',
$a$    RETURN to_jsonb(v_order);
  END IF;
  SELECT * INTO v_table FROM public.tables WHERE id = p_table_id AND store_id = p_store_id AND is_active FOR SHARE;$a$,
$b$    RETURN to_jsonb(v_order);
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
  SELECT * INTO v_table FROM public.tables WHERE id = p_table_id AND store_id = p_store_id AND is_active FOR SHARE;$b$);

SELECT pg_temp.mevo_patch('public.create_table_order_batch(uuid,uuid,jsonb,text,uuid,text,text,text,text,uuid)',
$a$  IF p_expected_session_id IS NOT NULL AND p_expected_session_id IS DISTINCT FROM v_current_session_id THEN
    RAISE EXCEPTION 'Phiên bàn đã thay đổi, vui lòng kiểm tra lại trước khi gửi món'; END IF;
  IF v_current_session_id IS NOT NULL AND p_expected_session_id IS NULL THEN$a$,
$b$  IF v_expected_session_id IS NOT NULL AND v_expected_session_id IS DISTINCT FROM v_current_session_id THEN
    RAISE EXCEPTION 'Phiên bàn đã thay đổi, vui lòng kiểm tra lại trước khi gửi món'; END IF;
  IF v_current_session_id IS NOT NULL AND v_expected_session_id IS NULL THEN$b$);

-- Bản ghi chống gửi trùng lưu bàn GỐC app gửi lên (replay so p_table_id gốc); expected giữ nguyên.
SELECT pg_temp.mevo_patch('public.create_table_order_batch(uuid,uuid,jsonb,text,uuid,text,text,text,text,uuid)',
$a$    p_store_id, p_client_request_id, p_table_id, v_order.id, p_expected_session_id,$a$,
$b$    p_store_id, p_client_request_id, v_request_table_id, v_order.id, p_expected_session_id,$b$);

-- ============================================================
-- 3) create_order
-- ============================================================
SELECT pg_temp.mevo_patch('public.create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text)',
$a$  v_skip_method_check boolean := false;
$a$,
$b$  v_skip_method_check boolean := false;
  v_moved_session uuid; v_moved_table uuid;
$b$);

SELECT pg_temp.mevo_patch('public.create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text)',
$a$    -- Khoá theo BÀN trước khi tìm-hoặc-mở: hai máy bấm cùng lúc thì máy sau phải nhìn thấy
    -- phiên máy trước vừa tạo, không được tạo phiên thứ hai (rủi ro #1).
    PERFORM lock_table_for_session(p_table_id);$a$,
$b$    -- mig 105: người gọi thuộc một phiên ĐANG MỞ đã chuyển đi khỏi bàn này → gắn đơn vào đúng phiên đó
    -- ở bàn hiện tại, KHÔNG mở phiên mới ở bàn cũ (bill ma). Đứng trước cả trường hợp bàn cũ đã có khách
    -- mới. Phiên đã giữ lại chính bàn này (thêm lại vào mâm) → không đổi gì.
    SELECT m.session_id, m.table_id INTO v_moved_session, v_moved_table
      FROM moved_session_for_caller(p_table_id, p_zalo_user_id, p_device_id) m;
    IF v_moved_session IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM session_tables st
          WHERE st.session_id = v_moved_session AND st.table_id = p_table_id AND st.is_open) THEN
      p_table_id := v_moved_table;
    END IF;

    -- Khoá theo BÀN trước khi tìm-hoặc-mở: hai máy bấm cùng lúc thì máy sau phải nhìn thấy
    -- phiên máy trước vừa tạo, không được tạo phiên thứ hai (rủi ro #1).
    PERFORM lock_table_for_session(p_table_id);$b$);

-- device_id: cùng zalo_user_id, moved_session_for_caller dùng để nhận ra khách thuộc phiên đã chuyển bàn.
SELECT pg_temp.mevo_patch('public.create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text)',
$a$    order_type, customer_name, customer_phone, delivery_address, session_id)
  VALUES (p_store_id, p_table_id, 0, p_zalo_user_id, p_note, p_payment_method, 'pending', v_token,
    p_order_type, p_customer_name, p_customer_phone, p_delivery_address, v_session_id)$a$,
$b$    order_type, customer_name, customer_phone, delivery_address, session_id, device_id)
  VALUES (p_store_id, p_table_id, 0, p_zalo_user_id, p_note, p_payment_method, 'pending', v_token,
    p_order_type, p_customer_name, p_customer_phone, p_delivery_address, v_session_id, NULLIF(btrim(p_device_id), ''))$b$);

NOTIFY pgrst, 'reload schema';
