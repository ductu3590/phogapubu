-- 108_bill_discount_patch_rpcs.sql — Giảm giá bill: trừ vào đơn lúc thu tiền + trả giảm giá cho POS, in, A04, Mini App.
-- Spec: docs/superpowers/specs/2026-11-02-chuyen-ban-giam-gia-bill-design.md §4, §6 (7–11, 13)
-- Cần mig 107 (cột ý định trên table_sessions, orders.bill_discount_amount, nhật ký, 2 helper) đã áp trước.
--
-- Vá TẠI CHỖ 8 RPC đang chạy bằng pg_get_functiondef + replace + EXECUTE (helper pg_temp bên dưới).
-- KHÔNG chép thân hàm từ file cũ: nhiều hàm đã bị 093/098/100/104/105 vá nên file trên đĩa cũ hơn prod.
-- Chuỗi neo chép nguyên văn từ pg_get_functiondef trên prod (2026-11-03); prod đổi khác thì helper RAISE
-- và cả migration dừng. recompute_order_total và get_sessions_bill trên prod lẫn CRLF trong thân hàm, còn
-- helper chỉ chuẩn hoá chuỗi neo → neo của 2 hàm này cố ý nằm gọn trên MỘT dòng.
--
--   1) close_table_session(paid)  — chia giảm giá của phiên vào các đơn CHƯA thu trước khi ghi nhận tiền:
--                                   total_amount/payment_amount = tiền SAU giảm → doanh thu tự đúng.
--                                   Giảm giá > tiền hàng (vd bỏ món sau khi đặt giảm VNĐ) → không cho thu.
--                                   Phiên hết hạn ('expired') bỏ qua giảm giá; staff_reset không đụng giảm giá.
--                                   close_table_sessions_bulk gọi lại hàm này nên tự đúng (không vá).
--   2) recompute_order_total      — tổng = món còn hiệu lực − bill_discount_amount (không cộng ngược tiền đã giảm)
--   3) merge_session_into_tray    — nhập phiên vào mâm khác: bỏ giảm giá của phiên nguồn + ghi nhật ký
--   4) list_open_table_sessions   — mỗi phiên thêm bill_discount_type / bill_discount_value (POS vẽ bill)
--   5) get_sessions_bill          — mỗi phiên thêm discount, discount_label; subtotal là tiền hàng TRƯỚC giảm;
--                                   grand_total = sau giảm; thêm grand_discount
--   6) get_bills_report           — discount_total gồm cả giảm giá bill; mỗi bill thêm bill_discount
--   7) get_table_session_bill     — thêm bill_discount (Mini App tab Đơn gọi)
--   8) get_table_session_state    — nhánh owner thêm bill_discount
--
-- Chữ ký các hàm KHÔNG đổi, chỉ thêm trường JSON. Helper luôn gọi kèm schema public.bill_discount_amount(...)
-- vì trùng tên với cột orders.bill_discount_amount.

-- ============================================================
-- 0) Điều kiện trước: thân plpgsql chỉ phân giải tên lúc CHẠY, nên thiếu mig 107 thì các bản vá vẫn
--    tạo được nhưng thu tiền / đọc bill sẽ lỗi. Chặn ngay ở đây.
-- ============================================================
DO $pre$
BEGIN
  PERFORM 'public.bill_discount_amount(bigint,text,integer)'::regprocedure;
  PERFORM 'public.session_unpaid_subtotal(uuid)'::regprocedure;
  IF to_regclass('public.table_session_discount_changes') IS NULL THEN
    RAISE EXCEPTION 'mig 108: thiếu bảng table_session_discount_changes — áp mig 107 trước';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'table_sessions'
         AND column_name IN ('bill_discount_type', 'bill_discount_value')) <> 2 THEN
    RAISE EXCEPTION 'mig 108: thiếu cột table_sessions.bill_discount_type/value — áp mig 107 trước';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'bill_discount_amount'
  ) THEN
    RAISE EXCEPTION 'mig 108: thiếu cột orders.bill_discount_amount — áp mig 107 trước';
  END IF;
END
$pre$;

-- ============================================================
-- Helper vá tại chỗ (chỉ sống trong phiên chạy migration). Mẫu mig 105:
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
    RAISE EXCEPTION 'mig 108: % không còn chuỗi cần vá: %', p_sig, v_from;
  END IF;
  IF v_hits > 1 THEN
    RAISE EXCEPTION 'mig 108: % có hơn một chỗ khớp chuỗi cần vá: %', p_sig, v_from;
  END IF;
  EXECUTE replace(v_def, v_from, v_to);
END
$patch$;

-- ============================================================
-- 1) close_table_session
--    Chia giảm giá đúng thuật toán allocateDiscount (admin-web/lib/bill-discount.ts), phần = đơn chưa thu:
--      mỗi đơn = floor(giảm * total_amount / tổng) (div() trên numeric); phần dư dồn vào đơn total_amount lớn
--      nhất, hoà thì id nhỏ nhất theo so sánh CHUỖI (id::text COLLATE "C"); tổng = 0 → dồn hết vào đơn thắng.
--    Đặt TRƯỚC UPDATE ghi payment_received_*: tập "đơn chưa thu" lúc chia đúng bằng tập sắp được ghi nhận tiền.
--    Dòng phiên đã khoá FOR UPDATE ở đầu hàm nên không ai đổi giảm giá/chen đơn giữa lúc chia.
-- ============================================================
SELECT pg_temp.mevo_patch('public.close_table_session(uuid,text,text)',
$a$  v_before jsonb;
BEGIN$a$,
$b$  v_before jsonb;
  v_sub bigint := 0;
  v_disc bigint := 0;
BEGIN$b$);

SELECT pg_temp.mevo_patch('public.close_table_session(uuid,text,text)',
$a$      RAISE EXCEPTION 'Phương tiện thanh toán không hợp lệ: %', COALESCE(p_instrument, '(trống)');
    END IF;
$a$,
$b$      RAISE EXCEPTION 'Phương tiện thanh toán không hợp lệ: %', COALESCE(p_instrument, '(trống)');
    END IF;

    -- mig 108: giảm giá bill. Phiên hết hạn còn nợ thu đúng tiền đang ghi (spec §6.11) → bỏ qua giảm giá.
    IF v_session.close_reason IS DISTINCT FROM 'expired' AND v_session.bill_discount_type IS NOT NULL THEN
      v_sub := public.session_unpaid_subtotal(p_session_id);
      v_disc := public.bill_discount_amount(v_sub, v_session.bill_discount_type, v_session.bill_discount_value);
      IF v_disc > v_sub THEN
        RAISE EXCEPTION 'Giảm giá lớn hơn tiền hàng — sửa lại giảm giá';
      END IF;
      IF v_disc > 0 THEN
        WITH parts AS (
          SELECT o.id, o.total_amount::bigint AS amt
            FROM public.orders o
           WHERE o.session_id = p_session_id
             AND o.status <> 'cancelled'
             AND o.payment_received_at IS NULL
        ),
        tot AS (SELECT coalesce(sum(amt), 0) AS total FROM parts),
        win AS (
          SELECT id FROM parts ORDER BY amt DESC, id::text COLLATE "C" LIMIT 1
        ),
        shares AS (
          SELECT p.id,
                 CASE WHEN t.total = 0 THEN 0::numeric
                      ELSE div(v_disc::numeric * p.amt, t.total) END AS share
            FROM parts p CROSS JOIN tot t
        ),
        alloc AS (
          SELECT sh.id,
                 (sh.share + CASE WHEN sh.id = w.id THEN v_disc - sum(sh.share) OVER () ELSE 0 END)::integer AS part
            FROM shares sh CROSS JOIN win w
        )
        UPDATE public.orders o
           SET bill_discount_amount = o.bill_discount_amount + a.part,
               total_amount = o.total_amount - a.part,
               payment_amount = o.total_amount - a.part,
               updated_at = now()
          FROM alloc a
         WHERE o.id = a.id
           AND a.part <> 0;
      END IF;
    END IF;
$b$);

-- ============================================================
-- 2) recompute_order_total — thân hàm trên prod là CRLF: neo một dòng.
--    Trả về tổng SAU giảm (người gọi trả số này ra làm total_amount của đơn).
-- ============================================================
SELECT pg_temp.mevo_patch('public.recompute_order_total(uuid)',
$a$  SET total_amount = v_total,$a$,
$b$  SET total_amount = v_total - bill_discount_amount,$b$);

SELECT pg_temp.mevo_patch('public.recompute_order_total(uuid)',
$a$      payment_amount = v_total,$a$,
$b$      payment_amount = v_total - bill_discount_amount,$b$);

SELECT pg_temp.mevo_patch('public.recompute_order_total(uuid)',
$a$  WHERE id = p_order_id;$a$,
$b$  WHERE id = p_order_id
  RETURNING total_amount INTO v_total; -- mig 108: tổng sau giảm giá bill$b$);

-- ============================================================
-- 3) merge_session_into_tray — giảm giá của phiên nguồn bị bỏ (spec §4.1); mâm đích giữ nguyên
-- ============================================================
SELECT pg_temp.mevo_patch('public.merge_session_into_tray(uuid,uuid)',
$a$  update table_sessions
     set status = 'closed', closed_at = now(), closed_by = v_uid, close_reason = 'merged'
   where id = p_session_id;$a$,
$b$  -- mig 108: phiên nguồn đang có giảm giá → bỏ, ghi nhật ký (new NULL) để còn dấu vết ai đã đặt.
  if v_src.bill_discount_type is not null then
    insert into public.table_session_discount_changes
      (store_id, session_id, old_type, old_value, new_type, new_value, changed_by, changed_at)
    values
      (v_src.store_id, p_session_id, v_src.bill_discount_type, v_src.bill_discount_value, NULL, NULL, v_uid,
       clock_timestamp());
  end if;

  update table_sessions
     set status = 'closed', closed_at = now(), closed_by = v_uid, close_reason = 'merged',
         bill_discount_type = NULL, bill_discount_value = NULL,
         bill_discount_set_by = NULL, bill_discount_set_at = NULL
   where id = p_session_id;$b$);

-- ============================================================
-- 4) list_open_table_sessions — ý định giảm giá của từng phiên
-- ============================================================
SELECT pg_temp.mevo_patch('public.list_open_table_sessions(uuid)',
$a$           (s.host_zalo_user_id IS NOT NULL OR s.host_device_id IS NOT NULL) AS has_host,$a$,
$b$           (s.host_zalo_user_id IS NOT NULL OR s.host_device_id IS NOT NULL) AS has_host,
           s.bill_discount_type,
           s.bill_discount_value,$b$);

-- ============================================================
-- 5) get_sessions_bill — thân hàm trên prod lẫn CRLF: neo một dòng.
--    discount: phiên đang mở → tính từ ý định trên tiền hàng chưa thu; phiên đã đóng → tổng bill_discount_amount
--    đã chia vào đơn (phiên hết hạn / staff_reset = 0). subtotal = tiền hàng TRƯỚC giảm (cộng lại phần đã chia).
-- ============================================================
SELECT pg_temp.mevo_patch('public.get_sessions_bill(uuid[])',
$a$  v_total bigint;$a$,
$b$  v_total bigint;
  v_discount bigint;$b$);

SELECT pg_temp.mevo_patch('public.get_sessions_bill(uuid[])',
$a$         COALESCE(SUM(session_data.subtotal), 0)$a$,
$b$         COALESCE(SUM(session_data.subtotal), 0) - COALESCE(SUM(session_data.discount), 0),
         COALESCE(SUM(session_data.discount), 0)$b$);

SELECT pg_temp.mevo_patch('public.get_sessions_bill(uuid[])',
$a$  INTO v_sessions, v_total$a$,
$b$  INTO v_sessions, v_total, v_discount$b$);

SELECT pg_temp.mevo_patch('public.get_sessions_bill(uuid[])',
$a$             SELECT SUM(o.total_amount)$a$,
$b$             SELECT SUM(o.total_amount + o.bill_discount_amount)$b$);

SELECT pg_temp.mevo_patch('public.get_sessions_bill(uuid[])',
$a$           ), 0) AS subtotal,$a$,
$b$           ), 0) AS subtotal,
           disc_data.amount AS discount,
           CASE WHEN s.bill_discount_type = 'percent' AND disc_data.amount > 0
                THEN s.bill_discount_value::text || '%' END AS discount_label,$b$);

SELECT pg_temp.mevo_patch('public.get_sessions_bill(uuid[])',
$a$    FROM public.table_sessions s$a$,
$b$    FROM public.table_sessions s
    CROSS JOIN LATERAL (
      SELECT (CASE WHEN s.status = 'open'
                THEN public.bill_discount_amount(public.session_unpaid_subtotal(s.id),
                                                 s.bill_discount_type, s.bill_discount_value)
                ELSE COALESCE((SELECT SUM(o.bill_discount_amount)
                                 FROM public.orders o
                                WHERE o.session_id = s.id
                                  AND o.status <> 'cancelled'), 0)
              END)::bigint AS amount
    ) AS disc_data$b$);

SELECT pg_temp.mevo_patch('public.get_sessions_bill(uuid[])',
$a$    'grand_total', v_total$a$,
$b$    'grand_total', v_total,
    'grand_discount', v_discount$b$);

-- ============================================================
-- 6) get_bills_report — doanh thu vẫn = SUM(total_amount) của đơn đã nhận tiền (đã là tiền SAU giảm)
-- ============================================================
SELECT pg_temp.mevo_patch('public.get_bills_report(uuid,date)',
$a$             COALESCE(o.discount_amount, 0) AS discount_amount,$a$,
$b$             COALESCE(o.discount_amount, 0) + o.bill_discount_amount AS discount_amount,
             o.bill_discount_amount AS bill_disc,$b$);

SELECT pg_temp.mevo_patch('public.get_bills_report(uuid,date)',
$a$             SUM(discount_amount)::bigint AS discount_total,$a$,
$b$             SUM(discount_amount)::bigint AS discount_total,
             SUM(bill_disc)::bigint AS bill_discount,$b$);

SELECT pg_temp.mevo_patch('public.get_bills_report(uuid,date)',
$a$          'discount_total', b.discount_total,$a$,
$b$          'discount_total', b.discount_total,
          'bill_discount', b.bill_discount,$b$);

-- ============================================================
-- 7) get_table_session_bill — phiên luôn đang mở (open_session_id_for_table) → tính từ ý định
-- ============================================================
SELECT pg_temp.mevo_patch('public.get_table_session_bill(uuid,text,text)',
$a$    'total', v_total, 'orders', v_orders);$a$,
$b$    'total', v_total, 'orders', v_orders,
    'bill_discount', public.bill_discount_amount(public.session_unpaid_subtotal(v_session.id),
                                                 v_session.bill_discount_type, v_session.bill_discount_value));$b$);

-- ============================================================
-- 8) get_table_session_state — chỉ nhánh owner (người được xem bill)
-- ============================================================
SELECT pg_temp.mevo_patch('public.get_table_session_state(uuid,text,text)',
$a$'state','owner','session_id',v_s.id,'opened_at',v_s.opened_at,'order_count',v_count,'total',v_total,'is_open_ordering',v_s.is_open_ordering,'table_names',v_table_names);$a$,
$b$'state','owner','session_id',v_s.id,'opened_at',v_s.opened_at,'order_count',v_count,'total',v_total,'is_open_ordering',v_s.is_open_ordering,'table_names',v_table_names,'bill_discount',public.bill_discount_amount(public.session_unpaid_subtotal(v_s.id),v_s.bill_discount_type,v_s.bill_discount_value));$b$);

NOTIFY pgrst, 'reload schema';
