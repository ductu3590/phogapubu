-- ============================================================
-- Mig 122 — Ca thu ngân + Sổ thu chi (Yên Garden, module CA).
-- Spec: docs/superpowers/specs/2026-11-09-yg-so-thu-chi-design.md, 2026-11-05-dot1-thanh-toan-ca-in-vietqr-design.md §4 B2, B4.
-- Plan: docs/superpowers/plans/2026-11-09-yg-ca-so-thu-chi.md. Hợp đồng chung: 2026-11-09-yg-hop-dong-chung.md.
--
--   1) store_workflow_settings.require_cash_shift (mặc định false: quán không bật thì không đổi gì).
--   2) Bảng cash_shifts (mỗi quán mỗi lúc một ca mở, chung một két), FK ghép bill_payments.cash_shift_id → ca.
--   3) Bảng cash_book_categories (11 danh mục seed mỗi quán, "Nhập hàng" là danh mục hệ thống) + trigger seed
--      cho quán mới, cash_book_entries (phiếu thu / chi ngoài bán hàng, tiền mặt hoặc chuyển khoản).
--   4) Hàm nội bộ (REVOKE khỏi client, chỉ RPC SECURITY DEFINER gọi): require_open_cash_shift, cash_shift_totals,
--      cash_book_system_category, cash_book_create_internal, cash_book_void_internal, seed_cash_book_categories.
--
-- Công thức két (một chỗ duy nhất, TS không tính lại):
--   expected_cash = opening_cash + cash_sales + debt_cash + cash_receipts − cash_payments
--   debt_cash = 0 cho tới mig 123 (công nợ) vá tại dòng neo trong cash_shift_totals.
--
-- ⚠️ Cần 112a + 112b (bill_payments, collect_table_bill, đường thu cũ đã khoá), 111 (ngày kinh doanh), 116 (vai
--    Quản lý, is_store_back_office). Bọc một transaction: $pre$ dừng là không có gì đổi.
-- ⚠️ Không chạy lại file này: CREATE TABLE / ADD COLUMN không lặp được.
-- ============================================================
BEGIN;

-- ============================================================
-- 0) Điều kiện trước
-- ============================================================
DO $pre$
DECLARE v_sig text;
BEGIN
  IF to_regclass('public.bill_payments') IS NULL OR to_regclass('public.bill_payment_lines') IS NULL THEN
    RAISE EXCEPTION 'mig 122: thiếu bảng bill_payments / bill_payment_lines (cần mig 112a)';
  END IF;
  FOREACH v_sig IN ARRAY ARRAY[
    'public.collect_table_bill(uuid[],jsonb,integer,uuid)',
    'public.current_business_date(uuid)',
    'public.is_store_back_office(uuid)',
    'public.is_store_pos_operator(uuid)',
    'public.close_table_session(uuid,text,text)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'mig 122: thiếu hàm %', v_sig;
    END IF;
  END LOOP;
  -- 112b khoá nhánh 'paid' của close_table_session bằng câu báo "tải lại trang". Chưa có câu đó = đường thu cũ
  -- còn mở, tiền thu qua đó sẽ không có bill_payments nên không vào ca nào.
  IF position('tải lại trang rồi thu lại' IN pg_get_functiondef('public.close_table_session(uuid,text,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'mig 122: cần áp mig 112b trước (close_table_session còn nhận ''paid'')';
  END IF;
END
$pre$;

-- ============================================================
-- 1) Công tắc bắt buộc mở ca (chỉ chủ quán bật/tắt, RPC ở phần sau)
-- ============================================================
ALTER TABLE public.store_workflow_settings
  ADD COLUMN require_cash_shift boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2) Ca. Một ca đóng một lần, không mở lại, không sửa.
-- ============================================================
CREATE TABLE public.cash_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  status text NOT NULL DEFAULT 'open',
  opened_by uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_cash bigint NOT NULL DEFAULT 0,
  open_note text,
  -- "Tiếp tục gộp vào ca cũ" (ca quên kết qua ngày kinh doanh mới): ghi người và giờ chọn.
  continued_by uuid,
  continued_at timestamptz,
  closed_by uuid,
  closed_at timestamptz,
  counted_cash bigint,
  expected_cash bigint,
  difference bigint,            -- counted_cash − expected_cash, âm = thiếu
  close_note text,
  CONSTRAINT cash_shifts_id_store_unique UNIQUE (id, store_id),
  CONSTRAINT cash_shifts_status_check CHECK (status IN ('open', 'closed')),
  CONSTRAINT cash_shifts_closed_state CHECK ((status = 'open') = (closed_at IS NULL)),
  CONSTRAINT cash_shifts_closed_numbers CHECK (
    status = 'open'
    OR (closed_by IS NOT NULL AND counted_cash IS NOT NULL AND expected_cash IS NOT NULL AND difference IS NOT NULL)),
  CONSTRAINT cash_shifts_continued_pair CHECK ((continued_by IS NULL) = (continued_at IS NULL)),
  CONSTRAINT cash_shifts_opening_cash_check CHECK (opening_cash >= 0),
  CONSTRAINT cash_shifts_counted_cash_check CHECK (counted_cash >= 0),
  CONSTRAINT cash_shifts_note_length CHECK (length(open_note) <= 500 AND length(close_note) <= 500)
);

-- Mỗi quán mỗi lúc một ca mở: hai người bấm "Mở ca" cùng lúc thì một người nhận unique_violation.
CREATE UNIQUE INDEX cash_shifts_one_open ON public.cash_shifts (store_id) WHERE status = 'open';
CREATE INDEX cash_shifts_store_opened_idx ON public.cash_shifts (store_id, opened_at DESC);

-- bill_payments.cash_shift_id có sẵn từ 112a (chưa FK). Ghép theo quán: bill quán A không gắn được vào ca quán B.
ALTER TABLE public.bill_payments ADD CONSTRAINT bill_payments_cash_shift_same_store
  FOREIGN KEY (cash_shift_id, store_id) REFERENCES public.cash_shifts(id, store_id);
CREATE INDEX bill_payments_cash_shift_id_idx ON public.bill_payments (cash_shift_id) WHERE cash_shift_id IS NOT NULL;

-- ============================================================
-- 3) Sổ thu chi
-- ============================================================
CREATE TABLE public.cash_book_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  kind text NOT NULL,
  name text NOT NULL,
  -- report_group quyết định dòng nào vào báo cáo lãi lỗ (mig 125).
  report_group text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  requires_note boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_book_categories_id_store_unique UNIQUE (id, store_id),
  CONSTRAINT cash_book_categories_name_check CHECK (btrim(name) <> '' AND length(name) <= 60),
  -- Cặp loại – nhóm: kiểm luôn kind hợp lệ.
  CONSTRAINT cash_book_categories_kind_group_check CHECK (
    (kind = 'payment' AND report_group IN ('operating_expense', 'inventory_purchase', 'owner_draw', 'cash_transfer'))
    OR (kind = 'receipt' AND report_group IN ('other_income', 'cash_transfer')))
);
CREATE UNIQUE INDEX cash_book_categories_store_kind_name ON public.cash_book_categories (store_id, kind, lower(name));
-- Mỗi nhóm có tối đa một danh mục hệ thống: cash_book_system_category tra theo nhóm.
CREATE UNIQUE INDEX cash_book_categories_one_system ON public.cash_book_categories (store_id, report_group) WHERE is_system;

CREATE TABLE public.cash_book_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  kind text NOT NULL CHECK (kind IN ('receipt', 'payment')),
  method text NOT NULL CHECK (method IN ('cash', 'bank')),
  category_id uuid NOT NULL,
  amount bigint NOT NULL,
  note text,
  counterparty text,
  business_date date NOT NULL,
  cash_shift_id uuid,
  source text NOT NULL CHECK (source IN ('manual', 'pos_drawer', 'inventory_receipt')),
  source_ref uuid,
  client_request_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_by uuid,
  voided_at timestamptz,
  void_reason text,
  CONSTRAINT cash_book_entries_category_same_store
    FOREIGN KEY (category_id, store_id) REFERENCES public.cash_book_categories(id, store_id),
  CONSTRAINT cash_book_entries_shift_same_store
    FOREIGN KEY (cash_shift_id, store_id) REFERENCES public.cash_shifts(id, store_id),
  CONSTRAINT cash_book_entries_amount_check CHECK (amount BETWEEN 1 AND 2000000000),
  CONSTRAINT cash_book_entries_note_length CHECK (length(note) <= 500),
  CONSTRAINT cash_book_entries_counterparty_length CHECK (length(counterparty) <= 120),
  CONSTRAINT cash_book_entries_void_reason_length CHECK (length(void_reason) <= 500),
  -- Phiếu chuyển khoản không bao giờ gắn ca (không đụng két).
  CONSTRAINT cash_book_entries_shift_cash_only CHECK (method = 'cash' OR cash_shift_id IS NULL),
  CONSTRAINT cash_book_entries_drawer_cash_only CHECK (source <> 'pos_drawer' OR method = 'cash'),
  CONSTRAINT cash_book_entries_source_ref_pair CHECK ((source = 'inventory_receipt') = (source_ref IS NOT NULL)),
  CONSTRAINT cash_book_entries_void_pair CHECK ((voided_at IS NULL) = (void_reason IS NULL)),
  CONSTRAINT cash_book_entries_store_request_unique UNIQUE (store_id, client_request_id)
);
CREATE INDEX cash_book_entries_store_date_idx ON public.cash_book_entries (store_id, business_date);
CREATE INDEX cash_book_entries_shift_idx ON public.cash_book_entries (cash_shift_id) WHERE cash_shift_id IS NOT NULL;
-- Một phiếu nhập kho chỉ có một phiếu chi còn hiệu lực (122b).
CREATE UNIQUE INDEX cash_book_entries_inventory_receipt_once ON public.cash_book_entries (source_ref)
  WHERE source = 'inventory_receipt' AND voided_at IS NULL;

-- ============================================================
-- 4) Danh mục seed: quán đang có (backfill) + quán tạo mới (trigger)
-- ============================================================
CREATE FUNCTION public.seed_cash_book_categories(p_store_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.cash_book_categories (store_id, kind, name, report_group, is_system, requires_note, sort_order)
  SELECT p_store_id, c.kind, c.name, c.report_group, c.is_system, c.requires_note, c.sort_order
    FROM (VALUES
      ('payment', 'Nhập hàng',        'inventory_purchase', true,  false, 10),
      ('payment', 'Đi chợ',           'operating_expense',  false, false, 20),
      ('payment', 'Ga - than',        'operating_expense',  false, false, 30),
      ('payment', 'Đá',               'operating_expense',  false, false, 40),
      ('payment', 'Điện nước',        'operating_expense',  false, false, 50),
      ('payment', 'Lương - thưởng',   'operating_expense',  false, false, 60),
      ('payment', 'Sửa chữa',         'operating_expense',  false, false, 70),
      ('payment', 'Khác',             'operating_expense',  false, true,  80),
      ('payment', 'Chủ quán rút',     'owner_draw',         false, false, 90),
      ('receipt', 'Nộp thêm vào két', 'cash_transfer',      false, false, 10),
      ('receipt', 'Thu khác',         'other_income',       false, true,  20)
    ) AS c(kind, name, report_group, is_system, requires_note, sort_order)
  ON CONFLICT (store_id, kind, lower(name)) DO NOTHING;
$$;

SELECT public.seed_cash_book_categories(id) FROM public.stores;

-- Theo mẫu trg_stores_ensure_workflow_settings (mig 049).
CREATE FUNCTION public.seed_cash_book_categories_on_store_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_cash_book_categories(NEW.id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_stores_seed_cash_book_categories
  AFTER INSERT ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.seed_cash_book_categories_on_store_insert();

-- ============================================================
-- 5) Hàm nội bộ
-- ============================================================

-- Ca đang mở của quán. Quán không bật công tắc (hoặc chưa có dòng cài đặt) → NULL: tiền không gắn ca.
-- Bật mà không có ca mở → 'Chưa mở ca'. FOR SHARE: người khác bấm Kết ca (FOR UPDATE) phải chờ giao dịch này
-- xong, nên khoản tiền vừa ghi nằm trọn trong ca cũ chứ không rơi ra ngoài két.
-- Không kiểm quyền: bếp gọi qua kitchen_confirm_payment bằng token, không có auth.uid().
CREATE FUNCTION public.require_open_cash_shift(p_store_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_required boolean;
  v_shift uuid;
BEGIN
  SELECT w.require_cash_shift INTO v_required
    FROM public.store_workflow_settings w
   WHERE w.store_id = p_store_id;
  IF NOT COALESCE(v_required, false) THEN
    RETURN NULL;
  END IF;

  SELECT s.id INTO v_shift
    FROM public.cash_shifts s
   WHERE s.store_id = p_store_id AND s.status = 'open'
   FOR SHARE;
  IF v_shift IS NULL THEN
    RAISE EXCEPTION 'Chưa mở ca';
  END IF;
  RETURN v_shift;
END;
$$;

-- Số liệu két của một ca (đang mở hoặc đã đóng). Đều là số nguyên VNĐ.
CREATE FUNCTION public.cash_shift_totals(p_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_opening_cash bigint;
  v_cash_sales bigint;
  v_bank_sales bigint;
  v_bills_count bigint;
  v_cash_receipts bigint;
  v_cash_payments bigint;
  v_debt_cash bigint;
BEGIN
  SELECT s.opening_cash INTO v_opening_cash FROM public.cash_shifts s WHERE s.id = p_shift_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy ca';
  END IF;

  -- Thu bill gắn ca: tiền mặt là số RÒNG sau khi thối (bill_payment_lines.amount).
  SELECT count(*),
         COALESCE((SELECT SUM(l.amount) FROM public.bill_payment_lines l
                    JOIN public.bill_payments p2 ON p2.id = l.payment_id
                   WHERE p2.cash_shift_id = p_shift_id AND l.instrument = 'cash'), 0),
         COALESCE((SELECT SUM(l.amount) FROM public.bill_payment_lines l
                    JOIN public.bill_payments p2 ON p2.id = l.payment_id
                   WHERE p2.cash_shift_id = p_shift_id AND l.instrument = 'bank'), 0)
    INTO v_bills_count, v_cash_sales, v_bank_sales
    FROM public.bill_payments p
   WHERE p.cash_shift_id = p_shift_id;

  -- Phiếu thu / chi tiền mặt của ca, bỏ phiếu đã huỷ. Phiếu CK không bao giờ gắn ca (CHECK).
  SELECT COALESCE(SUM(e.amount) FILTER (WHERE e.kind = 'receipt'), 0),
         COALESCE(SUM(e.amount) FILTER (WHERE e.kind = 'payment'), 0)
    INTO v_cash_receipts, v_cash_payments
    FROM public.cash_book_entries e
   WHERE e.cash_shift_id = p_shift_id AND e.method = 'cash' AND e.voided_at IS NULL;

  -- Tiền mặt khách trả nợ trong ca: mig 123 (công nợ) vá đúng dòng neo dưới đây.
  v_debt_cash := 0; -- mevo-anchor:123 cash_shift_totals.debt_cash

  RETURN jsonb_build_object(
    'opening_cash', v_opening_cash,
    'cash_sales', v_cash_sales,
    'cash_receipts', v_cash_receipts,
    'cash_payments', v_cash_payments,
    'debt_cash', v_debt_cash,
    'expected_cash', v_opening_cash + v_cash_sales + v_debt_cash + v_cash_receipts - v_cash_payments,
    'bills_count', v_bills_count,
    'bank_sales', v_bank_sales
  );
END;
$$;

-- Danh mục hệ thống của một nhóm (hiện chỉ có 'inventory_purchase' = "Nhập hàng"), cho kho gọi (122b).
CREATE FUNCTION public.cash_book_system_category(p_store_id uuid, p_report_group text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT c.id INTO v_id
    FROM public.cash_book_categories c
   WHERE c.store_id = p_store_id AND c.report_group = p_report_group AND c.is_system;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'mig 122: quán chưa có danh mục hệ thống %', p_report_group;
  END IF;
  RETURN v_id;
END;
$$;

-- Ghi một phiếu. Không kiểm quyền (RPC gọi nó kiểm). Trả id phiếu; gửi lại cùng client_request_id trả id cũ.
CREATE FUNCTION public.cash_book_create_internal(
  p_store_id uuid, p_kind text, p_method text, p_category_id uuid, p_amount bigint, p_note text,
  p_counterparty text, p_source text, p_source_ref uuid, p_actor uuid, p_client_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_existing public.cash_book_entries%ROWTYPE;
  v_category public.cash_book_categories%ROWTYPE;
  v_note text := NULLIF(btrim(p_note), '');
  v_counterparty text := NULLIF(btrim(p_counterparty), '');
  v_shift uuid;
  v_id uuid;
BEGIN
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu mã chống ghi trùng';
  END IF;

  -- Vòng thứ hai chỉ chạy khi một lần gửi song song cùng mã vừa ghi xong (ON CONFLICT DO NOTHING không ra id).
  FOR v_try IN 1..2 LOOP
    -- 1) Gửi lại (mạng rớt, bấm hai lần): làm TRƯỚC bước kiểm ca để ca đã đóng giữa hai lần vẫn trả phiếu cũ.
    SELECT * INTO v_existing
      FROM public.cash_book_entries e
     WHERE e.store_id = p_store_id AND e.client_request_id = p_client_request_id;
    IF FOUND THEN
      IF v_existing.kind IS DISTINCT FROM p_kind
         OR v_existing.method IS DISTINCT FROM p_method
         OR v_existing.category_id IS DISTINCT FROM p_category_id
         OR v_existing.amount IS DISTINCT FROM p_amount THEN
        RAISE EXCEPTION 'Mã chống ghi trùng đã dùng cho phiếu khác';
      END IF;
      RETURN v_existing.id;
    END IF;

    -- 2) Kiểm đầu vào
    IF p_kind IS NULL OR p_kind NOT IN ('receipt', 'payment') THEN
      RAISE EXCEPTION 'Loại phiếu không hợp lệ';
    END IF;
    IF p_method IS NULL OR p_method NOT IN ('cash', 'bank') THEN
      RAISE EXCEPTION 'Phương thức không hợp lệ';
    END IF;
    IF p_source IS NULL OR p_source NOT IN ('manual', 'pos_drawer', 'inventory_receipt') THEN
      RAISE EXCEPTION 'Nguồn phiếu không hợp lệ';
    END IF;
    IF p_source = 'pos_drawer' AND p_method <> 'cash' THEN
      RAISE EXCEPTION 'Phiếu tại két chỉ nhận tiền mặt';
    END IF;
    IF (p_source = 'inventory_receipt') <> (p_source_ref IS NOT NULL) THEN
      RAISE EXCEPTION 'Chỉ phiếu chi từ phiếu nhập kho mới gắn phiếu nhập';
    END IF;
    IF p_amount IS NULL OR p_amount < 1 OR p_amount > 2000000000 THEN
      RAISE EXCEPTION 'Số tiền phải từ 1đ đến 2.000.000.000đ';
    END IF;

    -- FOR SHARE: không ai ẩn / đổi danh mục giữa lúc kiểm và lúc ghi.
    SELECT * INTO v_category
      FROM public.cash_book_categories c
     WHERE c.id = p_category_id AND c.store_id = p_store_id
     FOR SHARE;
    IF NOT FOUND OR NOT v_category.is_active OR v_category.kind <> p_kind THEN
      RAISE EXCEPTION 'Danh mục không hợp lệ';
    END IF;
    IF v_category.requires_note AND v_note IS NULL THEN
      RAISE EXCEPTION 'Danh mục này cần ghi chú';
    END IF;
    IF length(v_note) > 500 THEN
      RAISE EXCEPTION 'Ghi chú tối đa 500 ký tự';
    END IF;
    IF length(v_counterparty) > 120 THEN
      RAISE EXCEPTION 'Tên người nhận / người nộp tối đa 120 ký tự';
    END IF;

    -- 4) Tiền mặt: quán bật ca thì bắt buộc gắn ca đang mở (khoá FOR SHARE tới hết giao dịch).
    IF p_method = 'cash' THEN
      v_shift := public.require_open_cash_shift(p_store_id);
    ELSE
      v_shift := NULL;
    END IF;

    -- 5) Ghi. Ngày kinh doanh lấy lúc ghi, không có tham số ngày (không ghi lùi).
    INSERT INTO public.cash_book_entries (
      store_id, kind, method, category_id, amount, note, counterparty, business_date, cash_shift_id,
      source, source_ref, client_request_id, created_by)
    VALUES (
      p_store_id, p_kind, p_method, p_category_id, p_amount, v_note, v_counterparty,
      public.current_business_date(p_store_id), v_shift,
      p_source, p_source_ref, p_client_request_id, p_actor)
    ON CONFLICT (store_id, client_request_id) DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'Không ghi được phiếu, thử lại';
END;
$$;

-- Huỷ một phiếu. Không kiểm quyền và KHÔNG chặn nguồn inventory_receipt (RPC sổ chặn; huỷ phiếu nhập gọi thẳng).
-- Trả {ok, already}. Phiếu tiền mặt gắn ca chỉ huỷ được khi ca còn mở: két đã chốt thì không đổi quá khứ.
CREATE FUNCTION public.cash_book_void_internal(p_entry_id uuid, p_reason text, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_entry public.cash_book_entries%ROWTYPE;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_shift_status text;
BEGIN
  SELECT * INTO v_entry FROM public.cash_book_entries e WHERE e.id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiếu';
  END IF;
  IF v_entry.voided_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Cần ghi lý do huỷ';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Lý do huỷ tối đa 500 ký tự';
  END IF;

  IF v_entry.cash_shift_id IS NOT NULL THEN
    -- FOR SHARE: Kết ca (FOR UPDATE) chờ lần huỷ này xong mới tính két, hoặc lần huỷ thấy ca đã đóng.
    SELECT s.status INTO v_shift_status FROM public.cash_shifts s WHERE s.id = v_entry.cash_shift_id FOR SHARE;
    IF v_shift_status <> 'open' THEN
      RAISE EXCEPTION 'Ca của phiếu này đã kết, không huỷ được';
    END IF;
  END IF;

  UPDATE public.cash_book_entries
     SET voided_by = p_actor, voided_at = now(), void_reason = v_reason
   WHERE id = p_entry_id;
  RETURN jsonb_build_object('ok', true, 'already', false);
END;
$$;

-- ============================================================
-- 6) Quyền hàm nội bộ. REVOKE FROM PUBLIC một mình không gỡ quyền Supabase cấp thẳng cho anon/authenticated.
-- ============================================================
REVOKE ALL ON FUNCTION public.require_open_cash_shift(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cash_shift_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cash_book_system_category(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cash_book_create_internal(uuid, text, text, uuid, bigint, text, text, text, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cash_book_void_internal(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_cash_book_categories(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_cash_book_categories_on_store_insert() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 7) Quyền bảng. Ca và phiếu chỉ đọc qua RPC (server không trả tiền dự kiến của ca đang mở); danh mục đọc
--    thẳng được cho ai có quyền POS của đúng quán (hộp Thu/Chi két cần danh sách), ghi qua RPC.
-- ============================================================
ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_book_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_book_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cash_shifts FROM anon, authenticated;
REVOKE ALL ON TABLE public.cash_book_categories FROM anon, authenticated;
REVOKE ALL ON TABLE public.cash_book_entries FROM anon, authenticated;

GRANT SELECT ON TABLE public.cash_book_categories TO authenticated;
CREATE POLICY cash_book_categories_pos_select ON public.cash_book_categories
  FOR SELECT TO authenticated
  USING (public.is_store_pos_operator(store_id));

NOTIFY pgrst, 'reload schema';

COMMIT;
