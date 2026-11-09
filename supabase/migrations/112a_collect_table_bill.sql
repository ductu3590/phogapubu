-- ============================================================
-- Mig 112a — Thu tiền kết hợp (Đợt 1, Mục A): một lần thu ở quầy = một dòng bill_payments,
-- mỗi phương tiện (tiền mặt / chuyển khoản) = một dòng bill_payment_lines.
--   • Bảng bill_payments, bill_payment_lines; cột orders.bill_payment_id, table_sessions.bill_payment_id;
--     orders.payment_instrument thêm 'mixed'.
--   • Hàm nội bộ close_table_session_core: NHÂN từ close_table_session đang chạy trên prod
--     (pg_get_functiondef + thay chuỗi neo, mỗi neo khớp đúng 1 lần), thêm tham số p_payment_id.
--   • RPC collect_table_bill(uuid[], jsonb, integer, uuid): dùng cho cả một bàn lẫn gộp bill.
--
-- ⚠️ Mig này CHƯA khoá đường cũ: close_table_session(s) vẫn chạy như trước, vì tab POS đang mở còn
--    cầm bản code cũ. Áp mig này TRƯỚC khi Vercel lên code mới; khoá đường cũ ở mig 112b, áp SAU.
-- ⚠️ Không chạy lại file này: ADD COLUMN / CREATE TABLE không lặp được, và bản lõi nhân từ hàm prod.
-- Bọc cả file trong một transaction: neo lệch thì RAISE, không để lại nửa migration.
-- ============================================================
BEGIN;

-- ============================================================
-- 1) Bảng
-- ============================================================
CREATE TABLE public.bill_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  cash_shift_id uuid,            -- FK thêm ở mig ca làm việc (cash shift)
  client_request_id uuid,        -- NULL cho manual_order, kitchen: hai đường đó chống trùng bằng khoá đơn
  total_amount bigint NOT NULL CHECK (total_amount >= 0),
  cash_given integer CHECK (cash_given >= 0),
  change_amount integer CHECK (change_amount >= 0),
  collected_by uuid,             -- NULL khi bếp xác nhận: token bếp không có auth.uid()
  collected_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('pos','staff','a04','manual_order','kitchen')),
  -- Tên ràng buộc cố định: collect_table_bill bắt unique_violation theo tên này.
  CONSTRAINT bill_payments_store_id_client_request_id_key UNIQUE (store_id, client_request_id),
  UNIQUE (id, store_id)
);

CREATE TABLE public.bill_payment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.bill_payments(id) ON DELETE CASCADE,
  -- Tên cố định: mig 123 (công nợ) drop/thêm lại ràng buộc này để cho 'debt'.
  instrument text NOT NULL CONSTRAINT bill_payment_lines_instrument_check CHECK (instrument IN ('cash','bank')),
  amount integer NOT NULL CHECK (amount > 0),   -- tiền mặt: số RÒNG sau khi thối
  UNIQUE (payment_id, instrument)
);

CREATE INDEX bill_payments_store_collected_idx ON public.bill_payments (store_id, collected_at);

ALTER TABLE public.orders ADD COLUMN bill_payment_id uuid;
ALTER TABLE public.orders ADD CONSTRAINT orders_bill_payment_same_store
  FOREIGN KEY (bill_payment_id, store_id) REFERENCES public.bill_payments(id, store_id);
CREATE INDEX orders_bill_payment_id_idx ON public.orders (bill_payment_id) WHERE bill_payment_id IS NOT NULL;

ALTER TABLE public.table_sessions ADD COLUMN bill_payment_id uuid;
ALTER TABLE public.table_sessions ADD CONSTRAINT table_sessions_bill_payment_same_store
  FOREIGN KEY (bill_payment_id, store_id) REFERENCES public.bill_payments(id, store_id);
CREATE INDEX table_sessions_bill_payment_id_idx ON public.table_sessions (bill_payment_id) WHERE bill_payment_id IS NOT NULL;

ALTER TABLE public.orders DROP CONSTRAINT orders_payment_instrument_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_instrument_check
  CHECK (payment_instrument IN ('wallet','bank','momo','vnpay','cash','mixed'));

-- RLS: chỉ đọc, đúng quán. Ghi chỉ qua RPC SECURITY DEFINER.
ALTER TABLE public.bill_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_payment_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bill_payments FROM anon, authenticated;
REVOKE ALL ON public.bill_payment_lines FROM anon, authenticated;
GRANT SELECT ON public.bill_payments TO authenticated;
GRANT SELECT ON public.bill_payment_lines TO authenticated;

CREATE POLICY bill_payments_select_pos ON public.bill_payments
  FOR SELECT TO authenticated
  USING (public.is_store_pos_operator(store_id));
CREATE POLICY bill_payment_lines_select_pos ON public.bill_payment_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bill_payments p
     WHERE p.id = bill_payment_lines.payment_id
       AND public.is_store_pos_operator(p.store_id)
  ));

-- ============================================================
-- 2) Lõi close_table_session_core — nhân từ close_table_session đang chạy
-- Helper (chỉ sống trong phiên chạy migration). Mẫu mig 110:
--   • chuỗi neo phải khớp ĐÚNG MỘT lần (replace() thay mọi chỗ khớp — khớp 2 chỗ là vá nhầm);
--   • đổi CRLF → LF cho chuỗi neo/thay thế: bản checkout trên Windows có thể là CRLF. Định nghĩa trên
--     prod KHÔNG bị chuẩn hoá (hàm nào lẫn CRLF thì neo phải nằm trên một dòng).
-- ============================================================
CREATE OR REPLACE FUNCTION pg_temp.mevo_sub(p_text text, p_from text, p_to text)
RETURNS text LANGUAGE plpgsql AS $sub$
DECLARE v_from text; v_to text; v_hits int;
BEGIN
  v_from := replace(p_from, E'\r\n', E'\n');
  v_to   := replace(p_to,   E'\r\n', E'\n');
  v_hits := (length(p_text) - length(replace(p_text, v_from, ''))) / length(v_from);
  IF v_hits = 0 THEN
    RAISE EXCEPTION 'mig 112a: không còn chuỗi cần vá: %', v_from;
  END IF;
  IF v_hits > 1 THEN
    RAISE EXCEPTION 'mig 112a: có hơn một chỗ khớp chuỗi cần vá: %', v_from;
  END IF;
  RETURN replace(p_text, v_from, v_to);
END
$sub$;

CREATE OR REPLACE FUNCTION pg_temp.mevo_patch(p_sig text, p_from text, p_to text)
RETURNS void LANGUAGE plpgsql AS $patch$
BEGIN
  EXECUTE pg_temp.mevo_sub(pg_get_functiondef(p_sig::regprocedure), p_from, p_to);
END
$patch$;

DO $core$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.close_table_session(uuid,text,text)'::regprocedure);
  v_def := pg_temp.mevo_sub(v_def,
$a$CREATE OR REPLACE FUNCTION public.close_table_session(p_session_id uuid, p_reason text, p_instrument text DEFAULT NULL::text)$a$,
$b$CREATE OR REPLACE FUNCTION public.close_table_session_core(p_session_id uuid, p_reason text, p_instrument text, p_payment_id uuid)$b$);
  v_def := pg_temp.mevo_sub(v_def,
$a$    IF p_instrument IS NULL OR p_instrument NOT IN ('cash', 'bank') THEN$a$,
$b$    IF p_payment_id IS NULL THEN RAISE EXCEPTION 'Thiếu khoản thu'; END IF;
    IF p_instrument IS NULL OR p_instrument NOT IN ('cash', 'bank', 'mixed') THEN$b$);
  v_def := pg_temp.mevo_sub(v_def,
$a$        payment_instrument = p_instrument$a$,
$b$        payment_instrument = p_instrument,
        bill_payment_id = p_payment_id$b$);
  v_def := pg_temp.mevo_sub(v_def,
$a$      close_reason = p_reason$a$,
$b$      close_reason = p_reason,
      bill_payment_id = p_payment_id$b$);
  EXECUTE v_def;
END
$core$;

-- Nội bộ: chỉ collect_table_bill (SECURITY DEFINER) gọi được.
REVOKE ALL ON FUNCTION public.close_table_session_core(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3a) Các khoản đã ghi của một tập khoản thu, cộng theo phương tiện (tiền mặt trước) — nhánh 'already' của
--     collect_table_bill trả kèm để thu ngân thấy ĐÃ GHI GÌ (vd. bấm lại bằng Chuyển khoản nhưng lần trước đã ghi
--     Tiền mặt). Nội bộ.
-- ============================================================
CREATE OR REPLACE FUNCTION public.bill_payment_lines_json(p_payment_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('instrument', x.instrument, 'amount', x.amount) ORDER BY x.instrument DESC), '[]'::jsonb)
    FROM (SELECT l.instrument, SUM(l.amount)::bigint AS amount
            FROM public.bill_payment_lines l
           WHERE l.payment_id = ANY(p_payment_ids)
           GROUP BY l.instrument) x;
$function$;

REVOKE ALL ON FUNCTION public.bill_payment_lines_json(uuid[]) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3) RPC collect_table_bill
-- p_lines: mảng 0–2 phần tử {instrument: 'cash'|'bank', amount: số nguyên > 0}. Tiền mặt là số RÒNG.
-- p_cash_given: tiền khách đưa, so với PHẦN TIỀN MẶT (không so cả bill). NULL = không ghi.
-- Server tự tính số phải thu sau khi khoá phiên + chia giảm giá, so ở cấp cả nhóm. Lệch → huỷ toàn bộ.
-- ============================================================
CREATE OR REPLACE FUNCTION public.collect_table_bill(
  p_session_ids uuid[], p_lines jsonb, p_cash_given integer, p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_found integer;
  v_store_count integer;
  v_store uuid;
  v_dead integer;
  v_paid integer;
  v_common_payment uuid;
  v_payment_count integer;
  v_existing public.bill_payments%ROWTYPE;
  v_existing_ids uuid[];
  v_line jsonb;
  v_num numeric;
  v_amount integer;
  v_cash integer;
  v_bank integer;
  v_line_count integer := 0;
  v_sum bigint := 0;
  v_change integer;
  v_instrument text;
  v_payment_id uuid;
  v_sid uuid;
  v_res jsonb;
  v_settled integer := 0;
  v_due bigint;
  v_constraint text;
  v_pids uuid[];
  v_one public.bill_payments%ROWTYPE;
BEGIN
  -- 1. Tham số bắt buộc
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu mã chống thu trùng';
  END IF;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids
    FROM unnest(p_session_ids) AS x WHERE x IS NOT NULL;
  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'Chưa chọn phiên nào';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Thiếu danh tính người chốt bill';
  END IF;

  -- 2. Khoá phiên theo thứ tự id tăng dần: hai máy gộp chéo nhau không deadlock.
  PERFORM 1 FROM public.table_sessions WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;

  -- 3. Có đủ phiên, cùng một quán, đúng người
  SELECT count(*), count(DISTINCT store_id), (array_agg(store_id))[1]
    INTO v_found, v_store_count, v_store
    FROM public.table_sessions WHERE id = ANY(v_ids);
  IF v_found < array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'Không tìm thấy phiên';
  END IF;
  IF v_store_count > 1 THEN
    RAISE EXCEPTION 'Các phiên không cùng một quán';
  END IF;
  IF NOT public.is_store_pos_operator(v_store) THEN
    RAISE EXCEPTION 'Chỉ chủ quán hoặc thu ngân được thu tiền';
  END IF;

  -- 4. Gọi lại cùng mã (mạng đứt sau khi server đã thu xong): trả kết quả cũ. Tìm SAU khi khoá
  --    để lần gọi song song chờ khoá rồi thấy được kết quả lần đầu.
  SELECT * INTO v_existing FROM public.bill_payments
   WHERE store_id = v_store AND client_request_id = p_client_request_id;
  IF FOUND THEN
    SELECT array_agg(id ORDER BY id) INTO v_existing_ids
      FROM public.table_sessions WHERE bill_payment_id = v_existing.id;
    IF v_existing_ids IS DISTINCT FROM v_ids THEN
      RAISE EXCEPTION 'Mã thu tiền đã dùng cho bill khác';
    END IF;
    -- Trả kèm các khoản ĐÃ GHI: lần trước có thể là phương tiện khác lần bấm này (mất phản hồi rồi đổi cách thu).
    RETURN jsonb_build_object(
      'ok', true, 'already', true, 'payment_id', v_existing.id,
      'total', v_existing.total_amount,
      'orders_settled', (SELECT count(*) FROM public.orders WHERE bill_payment_id = v_existing.id),
      'lines', public.bill_payment_lines_json(ARRAY[v_existing.id]),
      'cash_given', v_existing.cash_given,
      'change_amount', v_existing.change_amount
    );
  END IF;

  -- 5. Trạng thái phiên: mở hoặc hết hạn còn nợ thì thu được.
  SELECT count(*) FILTER (WHERE close_reason IN ('staff_reset', 'merged')),
         count(*) FILTER (WHERE status = 'closed' AND close_reason = 'paid'),
         count(DISTINCT bill_payment_id), (array_agg(bill_payment_id))[1]
    INTO v_dead, v_paid, v_payment_count, v_common_payment
    FROM public.table_sessions WHERE id = ANY(v_ids);
  IF v_dead > 0 THEN
    RAISE EXCEPTION 'Phiên đã đóng, không thu được';
  END IF;
  IF v_paid = v_found THEN
    -- Máy khác đã thu hết nhóm này. payment_id (và khách đưa / tiền thối) chỉ khi mọi phiên cùng MỘT khoản thu.
    IF v_payment_count = 1 AND NOT EXISTS (SELECT 1 FROM public.table_sessions
                                            WHERE id = ANY(v_ids) AND bill_payment_id IS NULL) THEN
      SELECT * INTO v_one FROM public.bill_payments WHERE id = v_common_payment;
    END IF;
    -- Các khoản đã ghi (cộng theo phương tiện) của mọi khoản thu của nhóm; phiên thu trước mig 112a không có dòng.
    SELECT array_agg(DISTINCT bill_payment_id) FILTER (WHERE bill_payment_id IS NOT NULL) INTO v_pids
      FROM public.table_sessions WHERE id = ANY(v_ids);
    RETURN jsonb_build_object(
      'ok', true, 'already', true,
      'payment_id', v_one.id,
      'total', (SELECT COALESCE(sum(total_amount), 0) FROM public.orders
                 WHERE session_id = ANY(v_ids) AND status <> 'cancelled'),
      'orders_settled', 0,
      'lines', public.bill_payment_lines_json(COALESCE(v_pids, '{}'::uuid[])),
      'cash_given', v_one.cash_given,
      'change_amount', v_one.change_amount
    );
  END IF;
  IF v_paid > 0 THEN
    RAISE EXCEPTION 'Có mâm vừa được thu ở máy khác, tải lại bill';
  END IF;

  -- 6. Đọc khoản thu
  IF p_lines IS NULL OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) > 2 THEN
    RAISE EXCEPTION 'Khoản thu không hợp lệ';
  END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF jsonb_typeof(v_line) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_line -> 'instrument') IS DISTINCT FROM 'string'
       OR (v_line ->> 'instrument') NOT IN ('cash', 'bank')
       OR jsonb_typeof(v_line -> 'amount') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Khoản thu không hợp lệ';
    END IF;
    v_num := (v_line ->> 'amount')::numeric;
    IF v_num <> trunc(v_num) OR v_num < 1 OR v_num > 2000000000 THEN
      RAISE EXCEPTION 'Khoản thu không hợp lệ';
    END IF;
    v_amount := v_num::integer;
    IF v_line ->> 'instrument' = 'cash' THEN
      IF v_cash IS NOT NULL THEN RAISE EXCEPTION 'Mỗi phương tiện chỉ ghi một khoản'; END IF;
      v_cash := v_amount;
    ELSE
      IF v_bank IS NOT NULL THEN RAISE EXCEPTION 'Mỗi phương tiện chỉ ghi một khoản'; END IF;
      v_bank := v_amount;
    END IF;
    v_line_count := v_line_count + 1;
    v_sum := v_sum + v_amount;
  END LOOP;

  -- 7. Tiền khách đưa / tiền thối theo phần tiền mặt
  IF p_cash_given IS NOT NULL THEN
    IF v_cash IS NULL THEN
      RAISE EXCEPTION 'Không có phần tiền mặt để nhận tiền khách đưa';
    END IF;
    IF p_cash_given < v_cash THEN
      RAISE EXCEPTION 'Tiền khách đưa thiếu so với phần tiền mặt';
    END IF;
    v_change := p_cash_given - v_cash;
  END IF;

  -- 8. Phương tiện ghi lên đơn
  v_instrument := CASE
    WHEN v_line_count = 2 THEN 'mixed'
    WHEN v_cash IS NOT NULL THEN 'cash'
    WHEN v_bank IS NOT NULL THEN 'bank'
    ELSE 'cash'   -- bill 0đ: không có khoản nào
  END;

  -- 9. Ghi khoản thu. ⚠️ Mig ca làm việc (cash shift) vá tại chỗ câu INSERT này: giữ cột một dòng, giá trị một dòng,
  --    cash_shift_id là chữ NULL, và câu này phải đứng SAU mọi nhánh trả 'already'.
  -- Hai máy dùng chung một mã cho HAI nhóm phiên khác nhau: khoá phiên không chặn nhau, cả hai cùng
  -- lọt qua bước 4 → máy sau vấp UNIQUE (store_id, client_request_id). Đổi lỗi đó sang tiếng Việt.
  BEGIN
    INSERT INTO public.bill_payments (store_id, cash_shift_id, client_request_id, total_amount, cash_given, change_amount, collected_by, source)
    VALUES (v_store, NULL, p_client_request_id, v_sum, p_cash_given, v_change, v_uid, 'pos')
    RETURNING id INTO v_payment_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'bill_payments_store_id_client_request_id_key' THEN
      RAISE EXCEPTION 'Mã thu tiền đã dùng cho bill khác';
    END IF;
    RAISE;
  END;

  INSERT INTO public.bill_payment_lines (payment_id, instrument, amount)
  SELECT v_payment_id, l.instrument, l.amount
    FROM (VALUES ('cash', v_cash), ('bank', v_bank)) AS l(instrument, amount)
   WHERE l.amount IS NOT NULL;

  -- 10. Đóng từng phiên qua lõi (chia giảm giá, ghi đã thu, hoàn tất đơn, hoàn tất đặt bàn)
  FOREACH v_sid IN ARRAY v_ids LOOP
    v_res := public.close_table_session_core(v_sid, 'paid', v_instrument, v_payment_id);
    v_settled := v_settled + COALESCE((v_res ->> 'orders_settled')::integer, 0);
  END LOOP;

  -- 11. So số phải thu (server tự tính, chỉ phần thu lần này) với số client gửi, ở cấp cả nhóm.
  --     RAISE huỷ cả giao dịch: tất cả hoặc không có gì.
  SELECT COALESCE(sum(total_amount), 0) INTO v_due
    FROM public.orders WHERE bill_payment_id = v_payment_id;
  IF v_due <> v_sum THEN
    RAISE EXCEPTION 'Số tiền không khớp bill: cần thu %, đang ghi %. Tải lại bill rồi thu lại', v_due, v_sum;
  END IF;

  -- 12.
  RETURN jsonb_build_object(
    'ok', true, 'already', false, 'payment_id', v_payment_id,
    'total', v_due, 'orders_settled', v_settled
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.collect_table_bill(uuid[], jsonb, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collect_table_bill(uuid[], jsonb, integer, uuid) TO authenticated;

-- ============================================================
-- 4) Đơn không phiên xác nhận tay cũng ghi một khoản thu một dòng (két + báo cáo đọc một nguồn)
--   confirm_manual_payment (chủ quán, A04 / completeOrder) → source 'manual_order', collected_by = auth.uid()
--   kitchen_confirm_payment (bếp, token không có auth.uid()) → source 'kitchen', collected_by NULL
-- Phương tiện suy từ payment_method: 'cash' → cash, còn lại (bank_transfer, zalo_checkout chuyển khoản) → bank.
-- Hai đường này không có client_request_id: chống ghi trùng bằng khoá dòng đơn (FOR UPDATE) + nhánh already.
-- ============================================================
CREATE OR REPLACE FUNCTION public.attach_order_payment(p_order_id uuid, p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_instrument text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đơn';
  END IF;
  -- Không đọc payment_instrument ghi sẵn trên đơn: chỉ payment_method nói tiền vào két hay vào tài khoản.
  -- Nhãn họ ví (wallet/momo/vnpay) không tới được đây: callback của ví đã ghi payment_received_at → nhánh already.
  v_instrument := CASE WHEN v_order.payment_method = 'cash' THEN 'cash' ELSE 'bank' END;
  UPDATE public.orders
     SET payment_instrument = v_instrument,
         bill_payment_id = p_payment_id
   WHERE id = p_order_id;
  -- Đơn 0đ không có khoản thu (amount của dòng phải > 0).
  IF p_payment_id IS NOT NULL THEN
    INSERT INTO public.bill_payment_lines (payment_id, instrument, amount)
    VALUES (p_payment_id, v_instrument, v_order.total_amount);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.attach_order_payment(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Vá tại chỗ (neo đã đối chiếu prod-defs/112, khớp đúng 1 lần). ⚠️ Mig ca làm việc (cash shift) neo vào
-- câu INSERT bill_payments dưới đây: giữ cột một dòng, giá trị một dòng, cash_shift_id là chữ NULL.
SELECT pg_temp.mevo_patch('public.confirm_manual_payment(uuid)',
$a$  select * into v_order from orders where id = p_order_id;$a$,
$b$  select * into v_order from orders where id = p_order_id for update;$b$);
SELECT pg_temp.mevo_patch('public.confirm_manual_payment(uuid)',
$a$declare v_order orders%rowtype;$a$,
$b$declare v_order orders%rowtype;
  v_payment_id uuid;$b$);
SELECT pg_temp.mevo_patch('public.confirm_manual_payment(uuid)',
$a$  return jsonb_build_object('ok', true, 'already', false);$a$,
$b$  -- mig 112a: ghi khoản thu một dòng. Đơn 0đ không có khoản thu.
  if v_order.total_amount > 0 then
    insert into public.bill_payments (store_id, cash_shift_id, total_amount, collected_by, source)
    values (v_order.store_id, NULL, v_order.total_amount, auth.uid(), 'manual_order')
    returning id into v_payment_id;
  end if;
  perform public.attach_order_payment(p_order_id, v_payment_id);
  return jsonb_build_object('ok', true, 'already', false);$b$);

SELECT pg_temp.mevo_patch('public.kitchen_confirm_payment(uuid)',
$a$  select * into v_order from orders where id = p_order_id and store_id = v_store;$a$,
$b$  select * into v_order from orders where id = p_order_id and store_id = v_store for update;$b$);
SELECT pg_temp.mevo_patch('public.kitchen_confirm_payment(uuid)',
$a$  v_can_cash boolean;$a$,
$b$  v_can_cash boolean;
  v_payment_id uuid;$b$);
SELECT pg_temp.mevo_patch('public.kitchen_confirm_payment(uuid)',
$a$  return jsonb_build_object('ok', true);$a$,
$b$  -- mig 112a: ghi khoản thu một dòng. Đơn 0đ không có khoản thu.
  if v_order.total_amount > 0 then
    insert into public.bill_payments (store_id, cash_shift_id, total_amount, collected_by, source)
    values (v_order.store_id, NULL, v_order.total_amount, NULL, 'kitchen')
    returning id into v_payment_id;
  end if;
  perform public.attach_order_payment(p_order_id, v_payment_id);
  return jsonb_build_object('ok', true);$b$);

-- ============================================================
-- 5) Báo cáo A04 (get_bills_report) đọc từng khoản thu
--   • Bill có bill_payment_id: khoá 'P:<payment_id>' (gộp N mâm thu một lần = MỘT dòng), kèm payments,
--     cash_given, change_amount. TM/CK của tổng ngày lấy từ bill_payment_lines.
--   • Bill cũ (chưa có bill_payment_id): khoá và cách chia TM/CK giữ nguyên như trước.
--   • Bất biến TM + CK + khác = doanh thu: 'other' là phần còn lại (mig công nợ sẽ thêm ngăn 'debt').
-- ============================================================
SELECT pg_temp.mevo_patch('public.get_bills_report(uuid, date)',
$a$      SELECT o.id, o.session_id, o.order_type, o.total_amount, o.created_at,$a$,
$b$      SELECT o.id, o.session_id, o.order_type, o.total_amount, o.created_at,
             o.bill_payment_id,$b$);
SELECT pg_temp.mevo_patch('public.get_bills_report(uuid, date)',
$a$               WHEN o.payment_instrument = 'cash' THEN 'cash'$a$,
$b$               WHEN o.payment_instrument = 'mixed' THEN 'mixed'
               WHEN o.payment_instrument = 'cash' THEN 'cash'$b$);
SELECT pg_temp.mevo_patch('public.get_bills_report(uuid, date)',
$a$               WHEN session_id IS NOT NULL AND close_reason = 'paid' AND session_paid_at IS NOT NULL$a$,
$b$               WHEN bill_payment_id IS NOT NULL THEN 'P:' || bill_payment_id::text
               WHEN session_id IS NOT NULL AND close_reason = 'paid' AND session_paid_at IS NOT NULL$b$);
SELECT pg_temp.mevo_patch('public.get_bills_report(uuid, date)',
$a$    bills AS ($a$,
$b$    -- mig 112a: pay cộng NGUYÊN các dòng khoản thu, còn doanh thu cộng đơn trong keyed. Hai số chỉ khớp
    -- vì đơn đã thu không bị huỷ / sửa tiền nữa (chặn ở mig 038 cancel_order, 046 bỏ/tặng món, 098 sửa
    -- số lượng, server action cancelOrder của admin-web lọc payment_received_at IS NULL, và mig 112b: trigger
    -- trg_orders_block_client_money_write chặn client huỷ / sửa tiền đơn đã thu). Mở đường nào huỷ/sửa đơn đã
    -- thu thì phải sửa cả chỗ này, không thì 'other' âm.
    pay AS (
      SELECT bp.id AS payment_id, bp.cash_given, bp.change_amount,
             COALESCE(SUM(l.amount) FILTER (WHERE l.instrument = 'cash'), 0)::bigint AS cash,
             COALESCE(SUM(l.amount) FILTER (WHERE l.instrument = 'bank'), 0)::bigint AS bank,
             COALESCE(jsonb_agg(jsonb_build_object('instrument', l.instrument, 'amount', l.amount)
                      ORDER BY l.instrument DESC) FILTER (WHERE l.id IS NOT NULL), '[]'::jsonb) AS lines
      FROM public.bill_payments bp
      LEFT JOIN public.bill_payment_lines l ON l.payment_id = bp.id
      WHERE bp.id IN (SELECT bill_payment_id FROM keyed WHERE bill_payment_id IS NOT NULL)
      GROUP BY bp.id
    ),
    bills AS ($b$);
SELECT pg_temp.mevo_patch('public.get_bills_report(uuid, date)',
$a$             MIN(order_type) AS order_type$a$,
$b$             MIN(order_type) AS order_type,
             (array_agg(bill_payment_id))[1] AS payment_id$b$);
SELECT pg_temp.mevo_patch('public.get_bills_report(uuid, date)',
$a$          'cash',    COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'cash'), 0),$a$,
$b$          'cash',    COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'cash' AND bill_payment_id IS NULL), 0)
                     + (SELECT COALESCE(SUM(cash), 0) FROM pay),$b$);
SELECT pg_temp.mevo_patch('public.get_bills_report(uuid, date)',
$a$          'bank',    COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'bank'), 0),$a$,
$b$          'bank',    COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'bank' AND bill_payment_id IS NULL), 0)
                     + (SELECT COALESCE(SUM(bank), 0) FROM pay),$b$);
SELECT pg_temp.mevo_patch('public.get_bills_report(uuid, date)',
$a$          'other',   COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'other'), 0),$a$,
$b$          -- Bất biến TM + CK + khác = doanh thu đúng theo cách tính: khác = phần còn lại.
          'other',   COALESCE(SUM(total_amount), 0)
                     - COALESCE(SUM(total_amount) FILTER (WHERE bucket IN ('cash', 'bank') AND bill_payment_id IS NULL), 0)
                     - (SELECT COALESCE(SUM(cash + bank), 0) FROM pay),$b$);
SELECT pg_temp.mevo_patch('public.get_bills_report(uuid, date)',
$a$          'instrument', b.instrument,$a$,
$b$          'instrument', b.instrument,
          'payments', COALESCE((SELECT p.lines FROM pay p WHERE p.payment_id = b.payment_id), '[]'::jsonb),
          'cash_given', (SELECT p.cash_given FROM pay p WHERE p.payment_id = b.payment_id),
          'change_amount', (SELECT p.change_amount FROM pay p WHERE p.payment_id = b.payment_id),$b$);

-- ============================================================
-- 6) Hoá đơn in (get_sessions_bill) trả các khoản thu của nhóm phiên: cộng theo phương tiện.
-- cash_given / change_amount chỉ có nghĩa khi nhóm phiên đúng MỘT khoản thu, không thì NULL.
-- Hàm này lẫn CRLF trên prod: neo nằm gọn một dòng.
-- ============================================================
SELECT pg_temp.mevo_patch('public.get_sessions_bill(uuid[])',
$a$    'grand_discount', v_discount$a$,
$b$    'grand_discount', v_discount,
    'payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('instrument', x.instrument, 'amount', x.amount) ORDER BY x.instrument DESC)
        FROM (SELECT l.instrument, SUM(l.amount)::bigint AS amount
                FROM public.bill_payment_lines l
               WHERE l.payment_id IN (SELECT ts.bill_payment_id FROM public.table_sessions ts
                                       WHERE ts.id = ANY(p_session_ids))
               GROUP BY l.instrument) x), '[]'::jsonb),
    'cash_given', (
      SELECT CASE WHEN count(*) = 1 THEN max(bp.cash_given) END
        FROM public.bill_payments bp
       WHERE bp.id IN (SELECT ts.bill_payment_id FROM public.table_sessions ts WHERE ts.id = ANY(p_session_ids))),
    'change_amount', (
      SELECT CASE WHEN count(*) = 1 THEN max(bp.change_amount) END
        FROM public.bill_payments bp
       WHERE bp.id IN (SELECT ts.bill_payment_id FROM public.table_sessions ts WHERE ts.id = ANY(p_session_ids)))$b$);

NOTIFY pgrst, 'reload schema';

COMMIT;
