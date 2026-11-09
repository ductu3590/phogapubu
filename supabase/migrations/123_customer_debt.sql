-- ============================================================
-- Mig 123 — Công nợ khách hàng (Yên Garden, module NỢ). Task 1: bảng, khách nợ, collect_table_bill nhận dòng nợ.
-- Spec: docs/superpowers/specs/2026-11-09-yg-cong-no-design.md. Plan: docs/superpowers/plans/2026-11-09-yg-cong-no.md.
-- Hợp đồng chung: docs/superpowers/plans/2026-11-09-yg-hop-dong-chung.md.
--
--   1) Bảng debt_customers, debt_payments, debt_payment_allocations (RLS bật, không policy: mọi đọc qua RPC).
--      bill_payments.debt_customer_id (FK ghép quán). CHECK: bill_payment_lines thêm 'debt', orders.payment_instrument
--      thêm 'debt' (bill 100% nợ; hơn một phương tiện vẫn là 'mixed').
--   2) Hàm nội bộ (REVOKE khỏi client): debt_normalize_phone, debt_customer_create_internal, debt_customer_bills.
--      Số nợ KHÔNG lưu sẵn: luôn = dòng 'debt' − phân bổ của các lần trả chưa huỷ (debt_customer_bills).
--   3) Vá tại chỗ close_table_session_core (nhận 'debt') và collect_table_bill: thêm p_debt_customer_id,
--      p_new_debt_customer (DEFAULT NULL), dòng 'debt', tối đa 3 dòng. Bản 4 tham số bị DROP trong cùng giao dịch:
--      có mặc định nên lời gọi 4 tham số tên (tab POS cũ) và 4 tham số vị trí (gg-verify.sql) vẫn chạy; giữ hai bản
--      cùng tên thì PostgREST báo mơ hồ.
--
-- Neo vá collect_table_bill (chép nguyên văn từ supabase/tests/prod-defs/123/collect_table_bill.sql — bản chụp nhánh
-- tích hợp sau 112a + 112b + 122; controller PHẢI đối chiếu pg_get_functiondef prod trước khi áp):
--   | Neo (khớp đúng 1 lần)                                                                           | Thay bằng                    |
--   |-------------------------------------------------------------------------------------------------|------------------------------|
--   | CREATE OR REPLACE FUNCTION public.collect_table_bill(p_session_ids uuid[], p_lines jsonb,         | + 2 tham số DEFAULT NULL     |
--   |   p_cash_given integer, p_client_request_id uuid)  (một dòng)                                    |                              |
--   |   v_bank integer;                                                                               | + v_debt_line integer        |
--   | ... OR jsonb_array_length(p_lines) > 2 THEN                                                     | > 3                          |
--   |        OR (v_line ->> 'instrument') NOT IN ('cash', 'bank')                                     | + 'debt'                     |
--   |       IF v_bank IS NOT NULL THEN RAISE EXCEPTION 'Mỗi phương tiện chỉ ghi một khoản'; END IF;   | kiểm trùng theo bank / debt  |
--   |       v_bank := v_amount;                                                                       | bank → v_bank, debt → v_debt |
--   |     FROM (VALUES ('cash', v_cash), ('bank', v_bank)) AS l(instrument, amount)                    | + ('debt', v_debt_line)      |
--   |   FOREACH v_sid IN ARRAY v_ids LOOP                                                             | khối khách nợ, rồi giữ neo   |
-- Bốn neo ngoài plan (khai báo, hai dòng nhánh "không phải cash", VALUES): không vá thì dòng 'debt' rơi vào nhánh
-- bank và không ghi được vào bill_payment_lines. Mọi neo nằm gọn MỘT dòng: bản chụp lẫn CRLF (fixture nạp 112a
-- nguyên file checkout Windows), prod có thể LF — neo một dòng khớp cả hai.
--
-- ⚠️ Áp SAU 122 (cần cash_shifts, require_open_cash_shift, cash_shift_totals, gate ca trên INSERT bill_payments)
--    và 116 (is_store_back_office). Đường cũ vẫn chạy: hai tham số mới có mặc định.
-- ⚠️ Không chạy lại file này: CREATE TABLE / ADD COLUMN không lặp được, và collect_table_bill nhân từ hàm đang chạy.
-- Bọc một transaction: $pre$ hay neo lệch thì RAISE, không để lại nửa migration.
-- ============================================================
BEGIN;

-- ============================================================
-- 0) Điều kiện trước
-- ============================================================
DO $pre$
DECLARE v_sig text;
BEGIN
  IF to_regclass('public.bill_payments') IS NULL OR to_regclass('public.bill_payment_lines') IS NULL THEN
    RAISE EXCEPTION 'mig 123: thiếu bảng bill_payments / bill_payment_lines (cần mig 112a)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'bill_payment_lines_instrument_check'
                    AND conrelid = 'public.bill_payment_lines'::regclass) THEN
    RAISE EXCEPTION 'mig 123: thiếu ràng buộc bill_payment_lines_instrument_check (cần mig 112a)';
  END IF;
  IF to_regclass('public.cash_shifts') IS NULL THEN
    RAISE EXCEPTION 'mig 123: thiếu bảng cash_shifts (cần mig 122)';
  END IF;
  FOREACH v_sig IN ARRAY ARRAY[
    'public.require_open_cash_shift(uuid)',
    'public.cash_shift_totals(uuid)',
    'public.is_store_back_office(uuid)',
    'public.collect_table_bill(uuid[],jsonb,integer,uuid)',
    'public.close_table_session_core(uuid,text,text,uuid)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'mig 123: thiếu hàm %', v_sig;
    END IF;
  END LOOP;
END
$pre$;

-- ============================================================
-- 1) Bảng
-- ============================================================
CREATE TABLE public.debt_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  name text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 120),
  phone text CHECK (phone ~ '^0[0-9]{8,10}$'),          -- đã chuẩn hoá bởi debt_normalize_phone
  kind text NOT NULL DEFAULT 'person' CHECK (kind IN ('company','person')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (id, store_id)
);
-- Một SĐT một khách mỗi quán, kể cả khách đã ngừng (khách quen gõ lại thành "khách mới" phải bị nhận ra).
CREATE UNIQUE INDEX debt_customers_store_phone_uq ON public.debt_customers (store_id, phone) WHERE phone IS NOT NULL;

CREATE TABLE public.debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  debt_customer_id uuid NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0 AND amount <= 2000000000),
  method text NOT NULL CHECK (method IN ('cash','bank')),
  cash_shift_id uuid REFERENCES public.cash_shifts(id),  -- TM khi bật ca: bắt buộc; CK: ca đang mở nếu có, chỉ để xem
  business_date date NOT NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  client_request_id uuid NOT NULL,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  voided_by uuid, voided_at timestamptz, void_reason text,
  CHECK ((voided_at IS NULL) = (voided_by IS NULL) AND (voided_at IS NULL) = (void_reason IS NULL)),
  FOREIGN KEY (debt_customer_id, store_id) REFERENCES public.debt_customers(id, store_id),
  UNIQUE (store_id, client_request_id)
);

CREATE TABLE public.debt_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_payment_id uuid NOT NULL REFERENCES public.debt_payments(id) ON DELETE CASCADE,
  bill_payment_id uuid NOT NULL REFERENCES public.bill_payments(id),
  amount bigint NOT NULL CHECK (amount > 0),
  UNIQUE (debt_payment_id, bill_payment_id)
);

CREATE INDEX debt_payments_store_business_date_idx ON public.debt_payments (store_id, business_date);
CREATE INDEX debt_payments_debt_customer_id_idx ON public.debt_payments (debt_customer_id);
CREATE INDEX debt_payments_cash_shift_id_idx ON public.debt_payments (cash_shift_id) WHERE cash_shift_id IS NOT NULL;
CREATE INDEX debt_payment_allocations_bill_payment_id_idx ON public.debt_payment_allocations (bill_payment_id);

-- Khách nợ của một lần thu. FK ghép quán: bill quán A không gắn được khách quán B.
ALTER TABLE public.bill_payments ADD COLUMN debt_customer_id uuid;
ALTER TABLE public.bill_payments ADD CONSTRAINT bill_payments_debt_customer_same_store
  FOREIGN KEY (debt_customer_id, store_id) REFERENCES public.debt_customers(id, store_id);
CREATE INDEX bill_payments_debt_customer_id_idx ON public.bill_payments (debt_customer_id) WHERE debt_customer_id IS NOT NULL;

-- Ghi nợ là phương tiện thứ ba của một lần thu.
ALTER TABLE public.bill_payment_lines DROP CONSTRAINT bill_payment_lines_instrument_check;
ALTER TABLE public.bill_payment_lines ADD CONSTRAINT bill_payment_lines_instrument_check
  CHECK (instrument IN ('cash','bank','debt'));

-- Bill 100% nợ ghi 'debt'; người đọc cột này (revenue.ts, orders.ts, kitchen-display.tsx) chỉ so với 'wallet'.
ALTER TABLE public.orders DROP CONSTRAINT orders_payment_instrument_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_instrument_check
  CHECK (payment_instrument IN ('wallet','bank','momo','vnpay','cash','mixed','debt'));

-- RLS: bật, không policy. Mọi đọc / ghi qua RPC SECURITY DEFINER.
ALTER TABLE public.debt_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payment_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.debt_customers FROM anon, authenticated;
REVOKE ALL ON public.debt_payments FROM anon, authenticated;
REVOKE ALL ON public.debt_payment_allocations FROM anon, authenticated;

-- ============================================================
-- 2) Hàm nội bộ
-- ============================================================

-- SĐT về dạng 0xxxxxxxxx: bỏ mọi ký tự không phải số, 84… → 0…. Rỗng → NULL. Sai dạng → lỗi.
CREATE FUNCTION public.debt_normalize_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE v text;
BEGIN
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN
    RETURN NULL;
  END IF;
  v := regexp_replace(p_phone, '[^0-9]', '', 'g');
  v := regexp_replace(v, '^84([0-9]{9,10})$', '0\1');
  IF v !~ '^0[0-9]{8,10}$' THEN
    RAISE EXCEPTION 'SĐT không hợp lệ';
  END IF;
  RETURN v;
END;
$$;

-- Tạo một khách nợ. Không kiểm quyền: người gọi (RPC SECURITY DEFINER) đã kiểm.
CREATE FUNCTION public.debt_customer_create_internal(
  p_store_id uuid, p_name text, p_phone text, p_kind text, p_note text, p_actor uuid
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(COALESCE(p_name, ''));
  v_kind text := COALESCE(p_kind, 'person');
  v_phone text;
  v_old_name text;
  v_id uuid;
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'Tên khách nợ không được trống';
  END IF;
  IF char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Tên khách nợ quá dài';
  END IF;
  IF v_kind NOT IN ('company', 'person') THEN
    RAISE EXCEPTION 'Loại khách không hợp lệ';
  END IF;
  v_phone := public.debt_normalize_phone(p_phone);

  IF v_phone IS NOT NULL THEN
    SELECT c.name INTO v_old_name FROM public.debt_customers c
     WHERE c.store_id = p_store_id AND c.phone = v_phone;
    IF FOUND THEN
      RAISE EXCEPTION 'SĐT % đã có khách %, chọn khách đó', v_phone, v_old_name;
    END IF;
  END IF;

  -- Hai máy tạo cùng SĐT cùng lúc: cả hai lọt qua kiểm trên, máy sau vấp unique index → cùng câu báo.
  BEGIN
    INSERT INTO public.debt_customers (store_id, name, phone, kind, note, created_by)
    VALUES (p_store_id, v_name, v_phone, v_kind, p_note, p_actor)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT c.name INTO v_old_name FROM public.debt_customers c
     WHERE c.store_id = p_store_id AND c.phone = v_phone;
    RAISE EXCEPTION 'SĐT % đã có khách %, chọn khách đó', v_phone, v_old_name;
  END;
  RETURN v_id;
END;
$$;

-- Các bill nợ của một khách. Lần trả đã huỷ coi như chưa từng có.
CREATE FUNCTION public.debt_customer_bills(p_customer_id uuid)
RETURNS TABLE(bill_payment_id uuid, collected_at timestamptz, bill_total bigint, debt_amount bigint,
              paid_amount bigint, outstanding bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT bp.id, bp.collected_at, bp.total_amount, l.amount::bigint,
         COALESCE(a.paid, 0)::bigint, (l.amount - COALESCE(a.paid, 0))::bigint
    FROM public.bill_payments bp
    JOIN public.bill_payment_lines l ON l.payment_id = bp.id AND l.instrument = 'debt'
    LEFT JOIN LATERAL (
      SELECT SUM(x.amount) AS paid
        FROM public.debt_payment_allocations x
        JOIN public.debt_payments dp ON dp.id = x.debt_payment_id
       WHERE x.bill_payment_id = bp.id AND dp.voided_at IS NULL
    ) a ON true
   WHERE bp.debt_customer_id = p_customer_id
   ORDER BY bp.collected_at, bp.id;
$$;

REVOKE ALL ON FUNCTION public.debt_normalize_phone(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.debt_customer_create_internal(uuid, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.debt_customer_bills(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3) Vá tại chỗ. Helper chỉ sống trong phiên chạy migration (mẫu mig 110 / 112a):
--   • chuỗi neo phải khớp ĐÚNG MỘT lần (replace() thay mọi chỗ khớp — khớp 2 chỗ là vá nhầm);
--   • đổi CRLF → LF cho chuỗi neo / thay thế: bản checkout trên Windows có thể là CRLF.
-- ============================================================
CREATE OR REPLACE FUNCTION pg_temp.mevo_sub(p_text text, p_from text, p_to text)
RETURNS text LANGUAGE plpgsql AS $sub$
DECLARE v_from text; v_to text; v_hits int;
BEGIN
  v_from := replace(p_from, E'\r\n', E'\n');
  v_to   := replace(p_to,   E'\r\n', E'\n');
  v_hits := (length(p_text) - length(replace(p_text, v_from, ''))) / length(v_from);
  IF v_hits = 0 THEN
    RAISE EXCEPTION 'mig 123: không còn chuỗi cần vá: %', v_from;
  END IF;
  IF v_hits > 1 THEN
    RAISE EXCEPTION 'mig 123: có hơn một chỗ khớp chuỗi cần vá: %', v_from;
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

-- 3a) Lõi đóng phiên nhận phương tiện 'debt' (bill 100% nợ).
SELECT pg_temp.mevo_patch('public.close_table_session_core(uuid,text,text,uuid)',
$a$    IF p_instrument IS NULL OR p_instrument NOT IN ('cash', 'bank', 'mixed') THEN$a$,
$b$    IF p_instrument IS NULL OR p_instrument NOT IN ('cash', 'bank', 'mixed', 'debt') THEN$b$);

-- 3b) collect_table_bill: dòng 'debt' + khách nợ. Khối khách nợ đứng SAU INSERT bill_payments (dùng v_payment_id,
--     sau gate ca) và SAU mọi nhánh 'already' (gọi lại cùng mã không tạo khách thứ hai).
DO $collect$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.collect_table_bill(uuid[],jsonb,integer,uuid)'::regprocedure);
  v_def := pg_temp.mevo_sub(v_def,
$a$CREATE OR REPLACE FUNCTION public.collect_table_bill(p_session_ids uuid[], p_lines jsonb, p_cash_given integer, p_client_request_id uuid)$a$,
$b$CREATE OR REPLACE FUNCTION public.collect_table_bill(p_session_ids uuid[], p_lines jsonb, p_cash_given integer, p_client_request_id uuid, p_debt_customer_id uuid DEFAULT NULL::uuid, p_new_debt_customer jsonb DEFAULT NULL::jsonb)$b$);
  v_def := pg_temp.mevo_sub(v_def,
$a$  v_bank integer;$a$,
$b$  v_bank integer;
  v_debt_line integer; -- mig 123: phần ghi nợ$b$);
  v_def := pg_temp.mevo_sub(v_def,
$a$OR jsonb_array_length(p_lines) > 2 THEN$a$,
$b$OR jsonb_array_length(p_lines) > 3 THEN$b$);
  v_def := pg_temp.mevo_sub(v_def,
$a$       OR (v_line ->> 'instrument') NOT IN ('cash', 'bank')$a$,
$b$       OR (v_line ->> 'instrument') NOT IN ('cash', 'bank', 'debt')$b$);
  -- Nhánh "không phải cash" của vòng đọc khoản thu: tách bank / debt. Hai neo một dòng (hàm có thể lẫn CRLF).
  v_def := pg_temp.mevo_sub(v_def,
$a$      IF v_bank IS NOT NULL THEN RAISE EXCEPTION 'Mỗi phương tiện chỉ ghi một khoản'; END IF;$a$,
$b$      IF (v_line ->> 'instrument' = 'bank' AND v_bank IS NOT NULL)
         OR (v_line ->> 'instrument' = 'debt' AND v_debt_line IS NOT NULL) THEN
        RAISE EXCEPTION 'Mỗi phương tiện chỉ ghi một khoản';
      END IF;$b$);
  v_def := pg_temp.mevo_sub(v_def,
$a$      v_bank := v_amount;$a$,
$b$      IF v_line ->> 'instrument' = 'bank' THEN v_bank := v_amount; ELSE v_debt_line := v_amount; END IF;$b$);
  v_def := pg_temp.mevo_sub(v_def,
$a$    FROM (VALUES ('cash', v_cash), ('bank', v_bank)) AS l(instrument, amount)$a$,
$b$    FROM (VALUES ('cash', v_cash), ('bank', v_bank), ('debt', v_debt_line)) AS l(instrument, amount)$b$);
  v_def := pg_temp.mevo_sub(v_def,
$a$  FOREACH v_sid IN ARRAY v_ids LOOP$a$,
$b$  -- mig 123: phần ghi nợ. Lỗi ở đây huỷ cả giao dịch, kể cả khách vừa tạo.
  DECLARE v_debt bigint; v_cust uuid; v_new jsonb;
  BEGIN
    v_debt := COALESCE(v_debt_line, 0);
    v_new := NULLIF(p_new_debt_customer, 'null'::jsonb);
    IF v_debt = 0 THEN
      IF p_debt_customer_id IS NOT NULL OR v_new IS NOT NULL THEN
        RAISE EXCEPTION 'Không có phần ghi nợ để gắn khách';
      END IF;
    ELSE
      IF p_debt_customer_id IS NOT NULL AND v_new IS NOT NULL THEN
        RAISE EXCEPTION 'Chỉ chọn một khách ghi nợ';
      END IF;
      IF p_debt_customer_id IS NOT NULL THEN
        -- FOR SHARE: máy khác đang ngừng khách này phải chờ lần thu xong.
        SELECT c.id INTO v_cust FROM public.debt_customers c
         WHERE c.id = p_debt_customer_id AND c.store_id = v_store AND c.is_active
         FOR SHARE;
        IF v_cust IS NULL THEN
          RAISE EXCEPTION 'Không tìm thấy khách nợ, tải lại danh sách';
        END IF;
      ELSIF v_new IS NOT NULL THEN
        IF jsonb_typeof(v_new) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'Thông tin khách nợ không hợp lệ';
        END IF;
        v_cust := public.debt_customer_create_internal(
          v_store, v_new ->> 'name', v_new ->> 'phone', v_new ->> 'kind', NULL, auth.uid());
      ELSE
        RAISE EXCEPTION 'Chọn khách ghi nợ';
      END IF;
      UPDATE public.bill_payments SET debt_customer_id = v_cust WHERE id = v_payment_id;
    END IF;
    -- Thay kết quả bước 8 (bước 8 không biết 'debt'): giá trị dưới đây là giá trị ghi lên đơn.
    -- Phương tiện ghi lên đơn: hơn một dòng → 'mixed'; một dòng → đúng phương tiện đó (kể cả 'debt'); bill 0đ → 'cash'.
    v_instrument := CASE WHEN jsonb_array_length(p_lines) > 1 THEN 'mixed'
                         WHEN jsonb_array_length(p_lines) = 1 THEN p_lines->0->>'instrument'
                         ELSE 'cash' END;
  END;

  FOREACH v_sid IN ARRAY v_ids LOOP$b$);

  DROP FUNCTION public.collect_table_bill(uuid[], jsonb, integer, uuid);
  EXECUTE v_def;
END
$collect$;

REVOKE ALL ON FUNCTION public.collect_table_bill(uuid[], jsonb, integer, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collect_table_bill(uuid[], jsonb, integer, uuid, uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
