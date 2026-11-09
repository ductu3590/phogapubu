-- ============================================================
-- Mig 112b — Khoá đường thu cũ (Đợt 1, Mục A, quy tắc A3 số 7): không còn đường nào cho client
-- thu phiên mà không tạo bill_payments.
--   • close_table_session chỉ còn nhánh 'staff_reset' (Bỏ bàn). 'paid' báo tải lại trang: tab POS cũ còn
--     cầm code cũ gọi hàm này thì thu ngân thấy lỗi, tải lại, thu bằng collect_table_bill.
--     close_table_sessions_bulk gọi lại hàm này nên tự bị chặn theo. Chữ ký giữ nguyên → không có bản cũ
--     phải drop, quyền EXECUTE giữ nguyên.
--   • Trigger chặn client (anon / authenticated / kitchen) UPDATE thẳng cột tiền của đơn, và huỷ / sửa tiền
--     (total_amount, bill_discount_amount, discount_amount) của đơn ĐÃ THU — RLS
--     auth_update_orders vẫn cho chủ quán sửa orders (chỗ hở CLAUDE.md 2026-11-03 đã ghi). RPC SECURITY DEFINER
--     chạy quyền chủ hàm (postgres), checkout-notify chạy service_role → không bị chặn.
--   table_sessions chỉ có policy đọc nên không cần chặn. File này chỉ có hàm và trigger, không đụng dữ liệu.
--
-- ⚠️ CHỈ áp SAU khi Vercel đã lên code gọi collect_table_bill VÀ các tab POS đang mở đã tải lại.
--    Áp sớm hơn thì tab cũ bấm Thanh toán sẽ gặp lỗi "tải lại trang".
-- ⚠️ Cần mig 112a đã áp (close_table_session_core, collect_table_bill). Bọc một transaction: $pre$ dừng là
--    không có gì đổi.
-- ============================================================
BEGIN;

-- ============================================================
-- 0) Điều kiện trước
--   • 112a đã áp.
--   • Không có hàm SECURITY INVOKER nào client gọi được mà ghi cột tiền của đơn: hàm đó chạy quyền người gọi
--     nên trigger bên dưới sẽ làm hỏng nó. Hàm nội bộ đã REVOKE khỏi client (vd. attach_order_payment, chỉ
--     được gọi từ hàm SECURITY DEFINER) không tính. Prod 2026-11-09: không có hàm nào như vậy.
-- ============================================================
DO $pre$
DECLARE v_bad text;
BEGIN
  IF to_regprocedure('public.collect_table_bill(uuid[],jsonb,integer,uuid)') IS NULL
     OR to_regprocedure('public.close_table_session_core(uuid,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'mig 112b: thiếu public.collect_table_bill / close_table_session_core — áp mig 112a trước';
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO v_bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND NOT p.prosecdef
     AND pg_get_functiondef(p.oid) ~* '(payment_received_(at|via|by)|payment_instrument|bill_payment_id)\s*:?='
     AND EXISTS (
       SELECT 1 FROM pg_roles r
        WHERE r.rolname IN ('anon', 'authenticated', 'kitchen')
          AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
     );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'mig 112b: hàm SECURITY INVOKER ghi cột tiền: %', v_bad;
  END IF;
END
$pre$;

-- ============================================================
-- 1) close_table_session: chỉ còn Bỏ bàn
-- ============================================================
CREATE OR REPLACE FUNCTION public.close_table_session(p_session_id uuid, p_reason text, p_instrument text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- mig 112b: thu tiền chỉ qua collect_table_bill (ghi bill_payments). p_instrument giữ trong chữ ký cho
  -- tab POS cũ gọi được tới đây và nhận lời nhắc tải lại.
  IF p_reason = 'paid' THEN
    RAISE EXCEPTION 'Màn thu tiền đã cập nhật, tải lại trang rồi thu lại';
  END IF;
  RETURN public.close_table_session_core(p_session_id, p_reason, NULL, NULL);
END;
$function$;

-- ============================================================
-- 2) Chặn client ghi thẳng cột tiền của đơn
-- current_user trong hàm SECURITY DEFINER là chủ hàm, nên RPC không bị chặn; chỉ câu UPDATE client gửi
-- thẳng qua PostgREST (role anon / authenticated / kitchen) mới vấp.
-- ============================================================
CREATE OR REPLACE FUNCTION public.block_client_money_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated', 'kitchen') THEN
    RETURN NEW;
  END IF;
  IF NEW.payment_received_at IS DISTINCT FROM OLD.payment_received_at
     OR NEW.payment_received_via IS DISTINCT FROM OLD.payment_received_via
     OR NEW.payment_received_by IS DISTINCT FROM OLD.payment_received_by
     OR NEW.payment_instrument IS DISTINCT FROM OLD.payment_instrument
     OR NEW.bill_payment_id IS DISTINCT FROM OLD.bill_payment_id THEN
    RAISE EXCEPTION 'Không ghi tiền trực tiếp vào đơn';
  END IF;
  -- Đơn ĐÃ THU: báo cáo (CTE pay của get_bills_report) cộng nguyên dòng khoản thu, nên huỷ đơn hay sửa số tiền
  -- của nó làm ngăn 'khác' âm. Chuyển sang 'paid' (completeOrder đóng đơn) vẫn được.
  IF OLD.payment_received_at IS NOT NULL
     AND ((NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
          OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
          OR NEW.bill_discount_amount IS DISTINCT FROM OLD.bill_discount_amount
          OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount) THEN
    RAISE EXCEPTION 'Đơn đã thu tiền, không huỷ hay sửa số tiền được';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_orders_block_client_money_write
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.block_client_money_write();

NOTIFY pgrst, 'reload schema';

COMMIT;
