-- 110_block_session_order_single_payment.sql — Bàn trả sau thu CẢ BÀN một lần: chặn thu lẻ từng lượt của
-- phiên bàn + khoá 2 hàm nội bộ tính tiền đơn khỏi anon/authenticated.
-- Số 110 vì 109 đã có trên prod (109_reservation_hold_future_occupied_table, nhánh khác).
--
-- 1) Vá TẠI CHỖ confirm_manual_payment + kitchen_confirm_payment (pg_get_functiondef + replace + EXECUTE, helper
--    pg_temp bên dưới). Đây là MỌI hàm sống ghi payment_received_at cho MỘT đơn (đã quét pg_proc trên prod
--    2026-11-03: các hàm khác có chữ payment_received_at chỉ ĐỌC, trừ close_table_session — thu cả phiên —
--    và close_table_sessions_bulk gọi lại nó; 2 hàm này giữ nguyên). checkout-notify (edge function, ví/CK
--    của khách quán trả trước) ghi thẳng bảng, không qua RPC, và không bao giờ chạm đơn có phiên bàn.
--    Vì sao: quyết định 2026-10-13 "bàn trả sau thu CẢ BÀN một lần ở POS". Một lượt thu lẻ trước khi chốt bill
--    làm phiếu in "Khách cần trả" (get_sessions_bill cộng mọi đơn chưa huỷ) cao hơn số POS thu (chỉ đơn chưa
--    thu) — kể cả khi không giảm giá. Prod lúc viết: 6 đơn / 4 phiên ĐÃ ĐÓNG (cuối 2026-10-13), 0 phiên mở.
--    Chặn khi phiên của đơn còn được thu ở POS: đang mở, HOẶC đã đóng vì hết hạn ('expired' — còn nợ, POS/A04
--    vẫn thu bằng close_table_session). Đơn không thuộc phiên (trả trước / mang về) không đổi gì.
--    Lời gọi lặp lại cho đơn ĐÃ thu vẫn trả 'already' như cũ (chặn đặt SAU nhánh đó).
-- 2) REVOKE recompute_order_total(uuid) + add_order_line(uuid,uuid,jsonb) khỏi PUBLIC/anon/authenticated:
--    SECURITY DEFINER, có từ mig 046, default privileges của schema public cấp EXECUTE cho anon → ai cầm khoá
--    công khai cũng tính lại / thêm dòng vào đơn bất kỳ. Không client nào gọi thẳng; mọi hàm gọi chúng là
--    SECURITY DEFINER của postgres (kiểm ở khối $pre$ bên dưới, có hàm SECURITY INVOKER nào gọi thì dừng).
--
-- Chuỗi neo chép nguyên văn từ pg_get_functiondef trên prod (2026-11-03, cả 2 hàm không lẫn CRLF);
-- prod đổi khác thì helper RAISE và cả migration dừng. Chữ ký các hàm KHÔNG đổi.

-- ============================================================
-- 0) Điều kiện trước: mọi hàm gọi 2 hàm sắp REVOKE phải là SECURITY DEFINER (chạy quyền chủ hàm), không thì
--    REVOKE làm hỏng chính hàm đó khi người dùng gọi.
-- ============================================================
DO $pre$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO v_bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND NOT p.prosecdef
     AND (pg_get_functiondef(p.oid) ~ 'recompute_order_total\s*\('
          OR pg_get_functiondef(p.oid) ~ 'add_order_line\s*\(');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'mig 110: hàm SECURITY INVOKER gọi recompute_order_total/add_order_line: %', v_bad;
  END IF;
END
$pre$;

-- ============================================================
-- Helper vá tại chỗ (chỉ sống trong phiên chạy migration). Mẫu mig 105/108:
--   • chuỗi neo phải khớp ĐÚNG MỘT lần (replace() thay mọi chỗ khớp — khớp 2 chỗ là vá nhầm);
--   • đổi CRLF → LF cho chuỗi neo/thay thế: repo bật core.autocrlf nên bản checkout trên Windows có thể là
--     CRLF. Định nghĩa trên prod KHÔNG bị chuẩn hoá (hàm nào lẫn CRLF thì neo phải nằm trên một dòng).
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
    RAISE EXCEPTION 'mig 110: % không còn chuỗi cần vá: %', p_sig, v_from;
  END IF;
  IF v_hits > 1 THEN
    RAISE EXCEPTION 'mig 110: % có hơn một chỗ khớp chuỗi cần vá: %', p_sig, v_from;
  END IF;
  EXECUTE replace(v_def, v_from, v_to);
END
$patch$;

-- ============================================================
-- 1a) confirm_manual_payment — chủ quán bấm "Đã nhận tiền" cho MỘT đơn (A04 / completeOrder)
-- ============================================================
SELECT pg_temp.mevo_patch('public.confirm_manual_payment(uuid)',
$a$  update orders
  set payment_received_at = now(), payment_received_via = 'owner', payment_received_by = auth.uid()$a$,
$b$  -- mig 110: lượt thuộc phiên bàn còn thu ở POS → thu cả bàn bằng close_table_session, không thu lẻ.
  if v_order.session_id is not null and exists (
    select 1 from public.table_sessions s
     where s.id = v_order.session_id
       and (s.status = 'open' or s.close_reason = 'expired')
  ) then
    raise exception 'Bàn trả sau thu cả bàn một lần ở POS (Thanh toán)';
  end if;
  update orders
  set payment_received_at = now(), payment_received_via = 'owner', payment_received_by = auth.uid()$b$);

-- ============================================================
-- 1b) kitchen_confirm_payment — bếp bấm "Đã nhận tiền" cho MỘT đơn (màn bếp, token bếp)
-- ============================================================
SELECT pg_temp.mevo_patch('public.kitchen_confirm_payment(uuid)',
$a$  update orders
     set payment_received_at = now(), payment_received_via = 'kitchen'$a$,
$b$  -- mig 110: lượt thuộc phiên bàn còn thu ở POS → thu cả bàn bằng close_table_session, không thu lẻ.
  if v_order.session_id is not null and exists (
    select 1 from public.table_sessions s
     where s.id = v_order.session_id
       and (s.status = 'open' or s.close_reason = 'expired')
  ) then
    raise exception 'Bàn trả sau thu cả bàn một lần ở POS (Thanh toán)';
  end if;
  update orders
     set payment_received_at = now(), payment_received_via = 'kitchen'$b$);

-- ============================================================
-- 2) Khoá 2 hàm nội bộ tính tiền đơn — chỉ gọi được từ trong RPC SECURITY DEFINER (chạy quyền postgres)
-- ============================================================
REVOKE ALL ON FUNCTION public.recompute_order_total(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_order_line(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
