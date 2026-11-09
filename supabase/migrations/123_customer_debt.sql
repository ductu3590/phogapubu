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
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
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
  IF char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Ghi chú quá dài';
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
    VALUES (p_store_id, v_name, v_phone, v_kind, v_note, p_actor)
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

-- ============================================================
-- 4) Hàm đọc nội bộ cho RPC công nợ
-- ============================================================

-- Tiền kiểu VN cho câu lỗi: 300000 → '300.000đ'.
CREATE FUNCTION public.debt_format_vnd(p_amount bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT replace(to_char(p_amount, 'FM999,999,999,999,990'), ',', '.') || 'đ';
$$;

-- Một dòng khách (danh sách + đầu màn chi tiết). Lần trả đã huỷ không tính vào đâu.
CREATE FUNCTION public.debt_customer_json(p_customer_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'name', c.name, 'phone', c.phone, 'kind', c.kind, 'note', c.note, 'is_active', c.is_active,
    'outstanding', COALESCE(b.outstanding, 0),
    'open_bills', COALESCE(b.open_bills, 0),
    'oldest_open_at', b.oldest_open_at,
    'last_payment_at', (SELECT max(dp.created_at) FROM public.debt_payments dp
                         WHERE dp.debt_customer_id = c.id AND dp.voided_at IS NULL))
    FROM public.debt_customers c
    LEFT JOIN LATERAL (
      SELECT SUM(x.outstanding)::bigint AS outstanding,
             count(*) FILTER (WHERE x.outstanding > 0) AS open_bills,
             min(x.collected_at) FILTER (WHERE x.outstanding > 0) AS oldest_open_at
        FROM public.debt_customer_bills(c.id) x
    ) b ON true
   WHERE c.id = p_customer_id;
$$;

-- Phân bổ của một lần trả, theo thứ tự bill cũ nhất trước (đúng thứ tự lúc ghi).
CREATE FUNCTION public.debt_payment_allocations_json(p_debt_payment_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('bill_payment_id', a.bill_payment_id, 'amount', a.amount)
                            ORDER BY bp.collected_at, bp.id), '[]'::jsonb)
    FROM public.debt_payment_allocations a
    JOIN public.bill_payments bp ON bp.id = a.bill_payment_id
   WHERE a.debt_payment_id = p_debt_payment_id;
$$;

REVOKE ALL ON FUNCTION public.debt_format_vnd(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.debt_customer_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.debt_payment_allocations_json(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 5) RPC công nợ. Quyền: thu nợ / xem = is_store_pos_operator (chủ quán, quản lý, thu ngân);
--    huỷ lần trả, thêm / sửa / ngừng khách = is_store_back_office (chủ quán, quản lý).
-- ============================================================

-- Khách trả nợ (một phần hoặc gộp nhiều bill). p_allocations NULL = mọi bill còn nợ, cũ nhất trước; hoặc mảng id
-- bill_payments được tick. Không cho trả quá số nợ. TM khi quán bật ca: bắt buộc ca mở, tiền vào két ca đó.
CREATE FUNCTION public.debt_collect(
  p_customer_id uuid, p_amount bigint, p_method text, p_allocations jsonb, p_note text, p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store uuid;
  v_cust public.debt_customers%ROWTYPE;
  v_old public.debt_payments%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_alloc jsonb := NULLIF(p_allocations, 'null'::jsonb);
  v_targets uuid[];
  v_n integer;
  v_open bigint;
  v_shift uuid;
  v_id uuid;
  v_left bigint;
  v_take bigint;
  v_bill record;
  v_constraint text;
BEGIN
  -- 1.
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu mã chống thu trùng';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Thiếu danh tính người thu';
  END IF;

  -- 2. Khoá khách: hai máy cùng thu nợ một khách thì máy sau chờ rồi thấy số nợ đã giảm.
  --    Khoá quán (FOR SHARE) TRƯỚC khách, cùng thứ tự với collect_table_bill (require_open_cash_shift khoá stores
  --    rồi khối ghi nợ mới khoá khách): không deadlock. store_id của khách không bao giờ đổi nên đọc trước được.
  SELECT c.store_id INTO v_store FROM public.debt_customers c WHERE c.id = p_customer_id;
  IF v_store IS NOT NULL THEN
    PERFORM 1 FROM public.stores s WHERE s.id = v_store FOR SHARE;
  END IF;
  SELECT * INTO v_cust FROM public.debt_customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy khách nợ';
  END IF;
  IF NOT public.is_store_pos_operator(v_cust.store_id) THEN
    RAISE EXCEPTION 'Chỉ chủ quán, quản lý hoặc thu ngân được xem / thu nợ';
  END IF;

  -- 3. Gọi lại cùng mã (mạng đứt sau khi server đã ghi): trả kết quả cũ, không ghi lần hai.
  SELECT * INTO v_old FROM public.debt_payments
   WHERE store_id = v_cust.store_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_old.debt_customer_id <> v_cust.id OR v_old.amount IS DISTINCT FROM p_amount
       OR v_old.method IS DISTINCT FROM p_method THEN
      RAISE EXCEPTION 'Mã thu nợ đã dùng cho lần thu khác';
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'already', true, 'debt_payment_id', v_old.id,
      'allocations', public.debt_payment_allocations_json(v_old.id),
      'remaining_debt', (SELECT COALESCE(SUM(b.outstanding), 0) FROM public.debt_customer_bills(v_cust.id) b)
    );
  END IF;

  -- 4. Đầu vào
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 2000000000 THEN
    RAISE EXCEPTION 'Số tiền không hợp lệ';
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('cash', 'bank') THEN
    RAISE EXCEPTION 'Phương thức không hợp lệ';
  END IF;
  IF char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Ghi chú quá dài';
  END IF;

  -- 5. Bill được tick: mảng không rỗng các chuỗi UUID không trùng, mỗi bill của khách này và còn nợ.
  IF v_alloc IS NOT NULL THEN
    IF jsonb_typeof(v_alloc) IS DISTINCT FROM 'array' OR jsonb_array_length(v_alloc) = 0
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_alloc) e
                   WHERE jsonb_typeof(e) IS DISTINCT FROM 'string'
                      OR (e #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'Danh sách bill không hợp lệ';
    END IF;
    SELECT array_agg(DISTINCT (e #>> '{}')::uuid), count(*) INTO v_targets, v_n
      FROM jsonb_array_elements(v_alloc) e;
    IF array_length(v_targets, 1) <> v_n THEN
      RAISE EXCEPTION 'Danh sách bill không hợp lệ';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_targets) t(id)
                WHERE NOT EXISTS (SELECT 1 FROM public.debt_customer_bills(v_cust.id) b
                                   WHERE b.bill_payment_id = t.id AND b.outstanding > 0)) THEN
      RAISE EXCEPTION 'Bill không thuộc khách này hoặc đã trả hết';
    END IF;
  END IF;

  -- 6. Không trả quá số nợ của tập bill đích.
  SELECT COALESCE(SUM(b.outstanding), 0) INTO v_open
    FROM public.debt_customer_bills(v_cust.id) b
   WHERE b.outstanding > 0 AND (v_targets IS NULL OR b.bill_payment_id = ANY(v_targets));
  IF p_amount > v_open THEN
    RAISE EXCEPTION 'Số tiền trả vượt số nợ: còn nợ %', public.debt_format_vnd(v_open);
  END IF;

  -- 7. Ca: TM thì ca mở bắt buộc khi quán bật (tắt → NULL); CK thì ca đang mở nếu có, chỉ để xem, không khoá.
  IF p_method = 'cash' THEN
    v_shift := public.require_open_cash_shift(v_cust.store_id);
  ELSE
    SELECT s.id INTO v_shift FROM public.cash_shifts s
     WHERE s.store_id = v_cust.store_id AND s.status = 'open';
  END IF;

  -- 8. Ghi lần trả (ngày kinh doanh lúc ghi) rồi phân bổ: bill cũ nhất trước, mỗi bill tối đa phần còn nợ.
  BEGIN
    INSERT INTO public.debt_payments (store_id, debt_customer_id, amount, method, cash_shift_id, business_date,
                                      note, client_request_id, created_by)
    VALUES (v_cust.store_id, v_cust.id, p_amount, p_method, v_shift, public.business_date_of(v_cust.store_id, now()),
            v_note, p_client_request_id, v_uid)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- Cùng mã cho hai khách khác nhau cùng lúc: khoá khách không chặn nhau, máy sau vấp UNIQUE.
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'debt_payments_store_id_client_request_id_key' THEN
      RAISE EXCEPTION 'Mã thu nợ đã dùng cho lần thu khác';
    END IF;
    RAISE;
  END;

  v_left := p_amount;
  FOR v_bill IN
    SELECT b.bill_payment_id, b.outstanding
      FROM public.debt_customer_bills(v_cust.id) b
     WHERE b.outstanding > 0 AND (v_targets IS NULL OR b.bill_payment_id = ANY(v_targets))
     ORDER BY b.collected_at, b.bill_payment_id
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_bill.outstanding, v_left);
    INSERT INTO public.debt_payment_allocations (debt_payment_id, bill_payment_id, amount)
    VALUES (v_id, v_bill.bill_payment_id, v_take);
    v_left := v_left - v_take;
  END LOOP;

  -- 9.
  RETURN jsonb_build_object(
    'ok', true, 'already', false, 'debt_payment_id', v_id,
    'allocations', public.debt_payment_allocations_json(v_id),
    'remaining_debt', (SELECT COALESCE(SUM(b.outstanding), 0) FROM public.debt_customer_bills(v_cust.id) b)
  );
END;
$$;

-- Huỷ một lần trả nợ (nhầm khách, đếm nhầm). Lần trả TM gắn ca: chỉ huỷ khi ca còn mở — ca đã kết thì két đã chốt.
CREATE FUNCTION public.debt_payment_void(p_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_p public.debt_payments%ROWTYPE;
  v_status text;
BEGIN
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Nhập lý do huỷ';
  END IF;
  IF char_length(v_reason) > 300 THEN
    RAISE EXCEPTION 'Lý do quá dài';
  END IF;
  SELECT * INTO v_p FROM public.debt_payments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy lần thu nợ';
  END IF;
  IF auth.uid() IS NULL OR NOT public.is_store_back_office(v_p.store_id) THEN
    RAISE EXCEPTION 'Chỉ chủ quán hoặc quản lý được làm việc này';
  END IF;
  IF v_p.voided_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_p.method = 'cash' AND v_p.cash_shift_id IS NOT NULL THEN
    -- FOR SHARE: người khác bấm Kết ca (FOR UPDATE) chờ lần huỷ này xong rồi mới tính két.
    SELECT s.status INTO v_status FROM public.cash_shifts s WHERE s.id = v_p.cash_shift_id FOR SHARE;
    IF v_status IS DISTINCT FROM 'open' THEN
      RAISE EXCEPTION 'Ca của lần thu này đã kết, không huỷ được';
    END IF;
  END IF;
  UPDATE public.debt_payments
     SET voided_by = auth.uid(), voided_at = now(), void_reason = v_reason
   WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'already', false);
END;
$$;

-- Thêm (p_customer_id NULL) hoặc sửa khách nợ.
CREATE FUNCTION public.debt_customer_upsert(
  p_store_id uuid, p_customer_id uuid, p_name text, p_phone text, p_kind text, p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text := btrim(COALESCE(p_name, ''));
  v_kind text := COALESCE(p_kind, 'person');
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_phone text;
  v_old_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_store_back_office(p_store_id) THEN
    RAISE EXCEPTION 'Chỉ chủ quán hoặc quản lý được làm việc này';
  END IF;
  IF p_customer_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'customer_id',
      public.debt_customer_create_internal(p_store_id, p_name, p_phone, p_kind, p_note, auth.uid()));
  END IF;

  PERFORM 1 FROM public.debt_customers c WHERE c.id = p_customer_id AND c.store_id = p_store_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy khách nợ';
  END IF;
  -- Kiểm như debt_customer_create_internal, cùng thứ tự và câu báo.
  IF v_name = '' THEN
    RAISE EXCEPTION 'Tên khách nợ không được trống';
  END IF;
  IF char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Tên khách nợ quá dài';
  END IF;
  IF v_kind NOT IN ('company', 'person') THEN
    RAISE EXCEPTION 'Loại khách không hợp lệ';
  END IF;
  IF char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Ghi chú quá dài';
  END IF;
  v_phone := public.debt_normalize_phone(p_phone);
  IF v_phone IS NOT NULL THEN
    SELECT c.name INTO v_old_name FROM public.debt_customers c
     WHERE c.store_id = p_store_id AND c.phone = v_phone AND c.id <> p_customer_id;
    IF FOUND THEN
      RAISE EXCEPTION 'SĐT % đã có khách %, chọn khách đó', v_phone, v_old_name;
    END IF;
  END IF;

  BEGIN
    UPDATE public.debt_customers
       SET name = v_name, phone = v_phone, kind = v_kind, note = v_note
     WHERE id = p_customer_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT c.name INTO v_old_name FROM public.debt_customers c
     WHERE c.store_id = p_store_id AND c.phone = v_phone AND c.id <> p_customer_id;
    RAISE EXCEPTION 'SĐT % đã có khách %, chọn khách đó', v_phone, v_old_name;
  END;
  RETURN jsonb_build_object('ok', true, 'customer_id', p_customer_id);
END;
$$;

-- Ngừng / dùng lại khách. Không ngừng được khách còn nợ (không có xoá khách).
CREATE FUNCTION public.debt_customer_set_active(p_customer_id uuid, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_store uuid;
  v_open bigint;
BEGIN
  IF p_active IS NULL THEN
    RAISE EXCEPTION 'Trạng thái không hợp lệ';
  END IF;
  -- FOR UPDATE: lần thu bill ghi nợ cho khách này (FOR SHARE) chờ, hoặc thấy khách đã ngừng.
  SELECT c.store_id INTO v_store FROM public.debt_customers c WHERE c.id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy khách nợ';
  END IF;
  IF auth.uid() IS NULL OR NOT public.is_store_back_office(v_store) THEN
    RAISE EXCEPTION 'Chỉ chủ quán hoặc quản lý được làm việc này';
  END IF;
  IF NOT p_active THEN
    SELECT COALESCE(SUM(b.outstanding), 0) INTO v_open FROM public.debt_customer_bills(p_customer_id) b;
    IF v_open > 0 THEN
      RAISE EXCEPTION 'Khách còn nợ %, không ngừng được', public.debt_format_vnd(v_open);
    END IF;
  END IF;
  UPDATE public.debt_customers SET is_active = p_active WHERE id = p_customer_id;
  RETURN jsonb_build_object('ok', true, 'is_active', p_active);
END;
$$;

-- Danh sách khách nợ của quán. p_only_open = chỉ khách còn nợ. Sắp nợ nhiều trước, rồi tên.
CREATE FUNCTION public.debt_list(p_store_id uuid, p_only_open boolean)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_store_pos_operator(p_store_id) THEN
    RAISE EXCEPTION 'Chỉ chủ quán, quản lý hoặc thu ngân được xem / thu nợ';
  END IF;
  RETURN jsonb_build_object('customers', (
    SELECT COALESCE(jsonb_agg(q.j ORDER BY (q.j ->> 'outstanding')::bigint DESC, q.j ->> 'name', q.j ->> 'id'), '[]'::jsonb)
      FROM (SELECT public.debt_customer_json(c.id) AS j
              FROM public.debt_customers c WHERE c.store_id = p_store_id) q
     WHERE NOT COALESCE(p_only_open, false) OR (q.j ->> 'outstanding')::bigint > 0));
END;
$$;

-- Chi tiết một khách: các bill nợ (cũ trước) và các lần trả (mới trước). Lần trả đã huỷ vẫn liệt kê kèm phân bổ
-- để đối chiếu, nhưng không cộng vào paid_amount / outstanding (debt_customer_bills bỏ qua nó).
CREATE FUNCTION public.debt_customer_detail(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_store uuid;
BEGIN
  SELECT c.store_id INTO v_store FROM public.debt_customers c WHERE c.id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy khách nợ';
  END IF;
  IF NOT public.is_store_pos_operator(v_store) THEN
    RAISE EXCEPTION 'Chỉ chủ quán, quản lý hoặc thu ngân được xem / thu nợ';
  END IF;
  RETURN jsonb_build_object(
    'customer', public.debt_customer_json(p_customer_id),
    'bills', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'bill_payment_id', b.bill_payment_id,
               'collected_at', b.collected_at,
               'business_date', public.business_date_of(v_store, b.collected_at),
               'table_label', public.bills_report_table_label(COALESCE(s.ids, '{}'::uuid[]), COALESCE(o.ids, '{}'::uuid[]), o.order_type),
               'session_ids', COALESCE(s.ids, '{}'::uuid[]),
               'bill_total', b.bill_total,
               'debt_amount', b.debt_amount,
               'paid_amount', b.paid_amount,
               'outstanding', b.outstanding)
             ORDER BY b.collected_at, b.bill_payment_id), '[]'::jsonb)
        FROM public.debt_customer_bills(p_customer_id) b
        LEFT JOIN LATERAL (SELECT array_agg(ts.id ORDER BY ts.id) AS ids
                             FROM public.table_sessions ts WHERE ts.bill_payment_id = b.bill_payment_id) s ON true
        LEFT JOIN LATERAL (SELECT array_agg(od.id ORDER BY od.id) AS ids, min(od.order_type) AS order_type
                             FROM public.orders od WHERE od.bill_payment_id = b.bill_payment_id) o ON true),
    'payments', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', dp.id, 'amount', dp.amount, 'method', dp.method, 'business_date', dp.business_date,
               'created_at', dp.created_at, 'created_by_name', public.cash_user_name(dp.created_by),
               'note', dp.note, 'voided_at', dp.voided_at, 'void_reason', dp.void_reason,
               'voided_by_name', public.cash_user_name(dp.voided_by),
               'allocations', public.debt_payment_allocations_json(dp.id))
             ORDER BY dp.created_at DESC, dp.id DESC), '[]'::jsonb)
        FROM public.debt_payments dp WHERE dp.debt_customer_id = p_customer_id)
  );
END;
$$;

-- Công nợ trong một ca (phiếu bàn giao ca): ghi nợ lúc thu bill, khách trả nợ TM / CK (bỏ lần đã huỷ).
-- Xem được: chủ quán / quản lý; thu ngân chỉ ca mình mở hoặc kết.
CREATE FUNCTION public.get_debt_shift_summary(p_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_s public.cash_shifts%ROWTYPE;
BEGIN
  SELECT * INTO v_s FROM public.cash_shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy ca';
  END IF;
  IF NOT (public.is_store_back_office(v_s.store_id)
          OR (public.is_store_pos_operator(v_s.store_id)
              AND COALESCE(auth.uid() IN (v_s.opened_by, v_s.closed_by), false))) THEN
    RAISE EXCEPTION 'Không có quyền xem ca này';
  END IF;
  RETURN jsonb_build_object(
    'debt_recorded', (SELECT COALESCE(SUM(l.amount), 0)::bigint
                        FROM public.bill_payment_lines l
                        JOIN public.bill_payments p ON p.id = l.payment_id
                       WHERE p.cash_shift_id = p_shift_id AND l.instrument = 'debt'),
    'debt_cash', (SELECT COALESCE(SUM(dp.amount), 0)::bigint FROM public.debt_payments dp
                   WHERE dp.cash_shift_id = p_shift_id AND dp.method = 'cash' AND dp.voided_at IS NULL),
    'debt_bank', (SELECT COALESCE(SUM(dp.amount), 0)::bigint FROM public.debt_payments dp
                   WHERE dp.cash_shift_id = p_shift_id AND dp.method = 'bank' AND dp.voided_at IS NULL)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.debt_collect(uuid, bigint, text, jsonb, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.debt_payment_void(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.debt_customer_upsert(uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.debt_customer_set_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.debt_list(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.debt_customer_detail(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_debt_shift_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.debt_collect(uuid, bigint, text, jsonb, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debt_payment_void(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debt_customer_upsert(uuid, uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debt_customer_set_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debt_list(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debt_customer_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_debt_shift_summary(uuid) TO authenticated;

-- ============================================================
-- 6) Két ca: tiền mặt khách trả nợ trong ca (bỏ lần đã huỷ). Neo ghim trong hợp đồng chung, đặt sẵn ở mig 122;
--    expected_cash của 122 đã cộng v_debt_cash nên không vá gì thêm.
-- ============================================================
SELECT pg_temp.mevo_patch('public.cash_shift_totals(uuid)',
$a$  v_debt_cash := 0; -- mevo-anchor:123 cash_shift_totals.debt_cash$a$,
$b$  v_debt_cash := (SELECT COALESCE(SUM(dp.amount), 0) FROM public.debt_payments dp WHERE dp.cash_shift_id = p_shift_id AND dp.method = 'cash' AND dp.voided_at IS NULL)::bigint; -- mig 123$b$);

NOTIFY pgrst, 'reload schema';

COMMIT;
