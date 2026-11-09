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
--   5) Ca: hàm đọc nội bộ cash_user_name, cash_shift_stale, cash_shift_entries_json, cash_shift_report_json
--      (service_role cho /print/agent); RPC open_cash_shift, close_cash_shift, continue_stale_shift,
--      get_open_cash_shift, list_cash_shifts, get_cash_shift_report, set_require_cash_shift; vá tại chỗ
--      store_workflow_snapshot thêm require_cash_shift. Ca đang mở: server KHÔNG trả tiền bán / dự kiến / lệch.
--   6) Sổ thu chi: RPC cash_book_create (manual | pos_drawer), cash_book_void, cash_book_list,
--      cash_book_save_category, cash_book_set_category_active. Thu ngân chỉ ghi tiền mặt tại két, không huỷ,
--      chỉ xem phiếu mình ghi; danh mục hệ thống "Nhập hàng" không ghi tay, không sửa, không ẩn.
--
-- ⚠️ Không chặn ở RLS: thu ngân đọc thẳng bill_payments vẫn tính được tiền dự kiến — quy tắc "đếm trước thấy sau"
--    chỉ ở giao diện, chấp nhận (spec B2: A04 vốn cho thu ngân xem tiền mặt theo ngày).
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
  created_by uuid NOT NULL,
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
  -- Phiếu nhập kho chỉ sinh phiếu CHI.
  CONSTRAINT cash_book_entries_inventory_payment_only CHECK (source <> 'inventory_receipt' OR kind = 'payment'),
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

-- Ghi một phiếu. Không kiểm quyền (RPC gọi nó kiểm). Trả {id, already}: gửi lại cùng client_request_id trả id cũ
-- với already = true. "already" do CHÍNH hàm này quyết định (không tra trước ở RPC): hai lần gọi song song cùng mã
-- thì lần thua ON CONFLICT quay lại bước 1 và nhận already = true.
CREATE FUNCTION public.cash_book_create_internal_result(
  p_store_id uuid, p_kind text, p_method text, p_category_id uuid, p_amount bigint, p_note text,
  p_counterparty text, p_source text, p_source_ref uuid, p_actor uuid, p_client_request_id uuid)
RETURNS jsonb
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
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'Thiếu người ghi phiếu';
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
         OR v_existing.amount IS DISTINCT FROM p_amount
         OR v_existing.source IS DISTINCT FROM p_source
         OR v_existing.source_ref IS DISTINCT FROM p_source_ref
         -- Người khác gửi trùng mã (dù cùng nội dung) không được "nhận" phiếu của người ghi đầu.
         OR v_existing.created_by IS DISTINCT FROM p_actor THEN
        RAISE EXCEPTION 'Mã chống ghi trùng đã dùng cho phiếu khác';
      END IF;
      RETURN jsonb_build_object('id', v_existing.id, 'already', true);
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
    IF p_source = 'inventory_receipt' AND p_kind <> 'payment' THEN
      RAISE EXCEPTION 'Phiếu nhập kho chỉ sinh phiếu chi';
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
      RETURN jsonb_build_object('id', v_id, 'already', false);
    END IF;
  END LOOP;

  RAISE EXCEPTION 'Không ghi được phiếu, thử lại';
END;
$$;

-- Chữ ký hợp đồng chung (kho 122b gọi): chỉ trả id.
CREATE FUNCTION public.cash_book_create_internal(
  p_store_id uuid, p_kind text, p_method text, p_category_id uuid, p_amount bigint, p_note text,
  p_counterparty text, p_source text, p_source_ref uuid, p_actor uuid, p_client_request_id uuid)
RETURNS uuid
LANGUAGE sql
SET search_path = public
AS $$
  SELECT (public.cash_book_create_internal_result(
    p_store_id, p_kind, p_method, p_category_id, p_amount, p_note, p_counterparty, p_source, p_source_ref,
    p_actor, p_client_request_id)->>'id')::uuid;
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
REVOKE ALL ON FUNCTION public.cash_book_create_internal_result(uuid, text, text, uuid, bigint, text, text, text, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
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

-- ============================================================
-- 8) Ca: hàm đọc nội bộ
--    Quy tắc xuyên suốt (spec B2): server KHÔNG trả tiền dự kiến (cũng như tiền bán, số bill, lệch) của ca đang
--    mở cho client, kể cả chủ quán. Đếm trước, thấy sau.
-- ============================================================

-- Tên người như get_bills_report: full_name, rỗng thì email.
CREATE FUNCTION public.cash_user_name(p_uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), u.email) FROM auth.users u WHERE u.id = p_uid;
$$;

-- Ca quên kết: mở trước mốc bắt đầu ngày kinh doanh hiện tại và chưa ai chọn "tiếp tục" trong ngày này.
-- Tính lúc đọc (không lưu) nên đổi giờ bắt đầu ngày thì tự tính lại. Ca đóng không stale; không thấy ca → NULL.
CREATE FUNCTION public.cash_shift_stale(p_shift_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_store uuid;
  v_status text;
  v_opened_at timestamptz;
  v_continued_at timestamptz;
  v_day_from timestamptz;
BEGIN
  SELECT s.store_id, s.status, s.opened_at, s.continued_at INTO v_store, v_status, v_opened_at, v_continued_at
    FROM public.cash_shifts s WHERE s.id = p_shift_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_status <> 'open' THEN
    RETURN false;
  END IF;
  SELECT b.day_from INTO v_day_from
    FROM public.business_day_bounds(v_store, public.current_business_date(v_store)) b;
  RETURN v_opened_at < v_day_from AND (v_continued_at IS NULL OR v_continued_at < v_day_from);
END;
$$;

-- Phiếu tiền mặt gắn ca (gồm cả phiếu đã huỷ), mới nhất trước.
CREATE FUNCTION public.cash_shift_entries_json(p_shift_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', e.id,
           'kind', e.kind,
           'method', e.method,
           'category_name', c.name,
           'amount', e.amount,
           'note', e.note,
           'counterparty', e.counterparty,
           'source', e.source,
           'created_at', e.created_at,
           'created_by_name', public.cash_user_name(e.created_by),
           'voided_at', e.voided_at
         ) ORDER BY e.created_at DESC, e.id DESC), '[]'::jsonb)
    FROM public.cash_book_entries e
    JOIN public.cash_book_categories c ON c.id = e.category_id
   WHERE e.cash_shift_id = p_shift_id AND e.method = 'cash';
$$;

-- Phiếu bàn giao ca. Không kiểm quyền (get_cash_shift_report kiểm; /print/agent gọi bằng service_role).
-- Ca đang mở: mọi con số thu/chi, dự kiến, đếm, lệch, số bill đều null.
CREATE FUNCTION public.cash_shift_report_json(p_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift public.cash_shifts%ROWTYPE;
  v_totals jsonb;
  v_carried integer := 1;
BEGIN
  SELECT * INTO v_shift FROM public.cash_shifts s WHERE s.id = p_shift_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy ca';
  END IF;
  IF v_shift.status = 'closed' THEN
    v_totals := public.cash_shift_totals(p_shift_id);
  END IF;
  -- "Ca gộp qua N ngày": chỉ tính khi đã có người chọn tiếp tục.
  IF v_shift.continued_at IS NOT NULL THEN
    v_carried := public.business_date_of(v_shift.store_id, COALESCE(v_shift.closed_at, now()))
               - public.business_date_of(v_shift.store_id, v_shift.opened_at) + 1;
  END IF;

  RETURN jsonb_build_object(
    'id', v_shift.id,
    'store_id', v_shift.store_id,
    'status', v_shift.status,
    'opened_at', v_shift.opened_at,
    'closed_at', v_shift.closed_at,
    'opened_by_name', public.cash_user_name(v_shift.opened_by),
    'closed_by_name', public.cash_user_name(v_shift.closed_by),
    'opening_cash', v_shift.opening_cash,
    'open_note', v_shift.open_note,
    'close_note', v_shift.close_note,
    'cash_sales', v_totals->'cash_sales',
    'bank_sales', v_totals->'bank_sales',
    'cash_receipts', v_totals->'cash_receipts',
    'cash_payments', v_totals->'cash_payments',
    'debt_cash', v_totals->'debt_cash',
    -- Ba số dưới là số đã LƯU lúc kết ca (ca mở: null).
    'expected_cash', v_shift.expected_cash,
    'counted_cash', v_shift.counted_cash,
    'difference', v_shift.difference,
    'bills_count', v_totals->'bills_count',
    'carried_days', v_carried,
    'continued_at', v_shift.continued_at,
    'continued_by_name', public.cash_user_name(v_shift.continued_by),
    'entries', public.cash_shift_entries_json(p_shift_id)
  );
END;
$$;

-- ============================================================
-- 9) Ca: RPC. Ai có quyền POS (chủ quán, quản lý, thu ngân) mở, kết, tiếp tục ca của quán mình.
-- ============================================================
CREATE FUNCTION public.open_cash_shift(p_store_id uuid, p_opening_cash bigint, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note text := NULLIF(btrim(p_note), '');
  v_required boolean;
  v_id uuid;
BEGIN
  IF NOT public.is_store_pos_operator(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền thao tác ca';
  END IF;
  IF p_opening_cash IS NULL OR p_opening_cash < 0 OR p_opening_cash > 2000000000 THEN
    RAISE EXCEPTION 'Số tiền không hợp lệ';
  END IF;
  IF length(v_note) > 500 THEN
    RAISE EXCEPTION 'Ghi chú tối đa 500 ký tự';
  END IF;

  -- FOR SHARE: chủ quán tắt công tắc (set_require_cash_shift khoá FOR UPDATE) không chen giữa kiểm và ghi.
  -- Khoá đúng thứ tự stores → settings như set_require_cash_shift để hai bên không deadlock.
  PERFORM 1 FROM public.stores WHERE id = p_store_id FOR SHARE;
  SELECT w.require_cash_shift INTO v_required
    FROM public.store_workflow_settings w
   WHERE w.store_id = p_store_id
   FOR SHARE;
  IF NOT COALESCE(v_required, false) THEN
    RAISE EXCEPTION 'Quán chưa bật mở ca';
  END IF;

  IF EXISTS (SELECT 1 FROM public.cash_shifts s WHERE s.store_id = p_store_id AND s.status = 'open') THEN
    RAISE EXCEPTION 'Đã có ca đang mở';
  END IF;
  BEGIN
    INSERT INTO public.cash_shifts (store_id, status, opened_by, opening_cash, open_note)
    VALUES (p_store_id, 'open', auth.uid(), p_opening_cash, v_note)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- Hai người bấm "Mở ca" cùng lúc: index cash_shifts_one_open chặn người sau.
    RAISE EXCEPTION 'Đã có ca đang mở';
  END;

  RETURN jsonb_build_object('ok', true, 'shift_id', v_id);
END;
$$;

-- Kết ca: đếm trước, thấy sau. Khoá ca FOR UPDATE TRƯỚC khi cộng két: lần thu / ghi phiếu đang chạy (giữ
-- FOR SHARE qua require_open_cash_shift) xong hẳn mới cộng; lần tới sau thấy ca đã đóng và nhận "Chưa mở ca".
-- Gọi lại cùng số đếm (mạng rớt, bấm hai lần) trả kết quả đã lưu, already = true.
CREATE FUNCTION public.close_cash_shift(p_shift_id uuid, p_counted_cash bigint, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift public.cash_shifts%ROWTYPE;
  v_note text := NULLIF(btrim(p_note), '');
  v_totals jsonb;
  v_expected bigint;
  v_already boolean := false;
BEGIN
  SELECT * INTO v_shift FROM public.cash_shifts s WHERE s.id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy ca';
  END IF;
  IF NOT public.is_store_pos_operator(v_shift.store_id) THEN
    RAISE EXCEPTION 'Không có quyền thao tác ca';
  END IF;
  IF p_counted_cash IS NULL OR p_counted_cash < 0 OR p_counted_cash > 2000000000 THEN
    RAISE EXCEPTION 'Số tiền không hợp lệ';
  END IF;
  IF length(v_note) > 500 THEN
    RAISE EXCEPTION 'Ghi chú tối đa 500 ký tự';
  END IF;

  IF v_shift.status = 'closed' THEN
    -- Chỉ người đã kết ca này hoặc chủ quán / quản lý mới nhận lại số đã lưu. Người khác LUÔN nhận "Ca đã đóng",
    -- dù số đếm đúng hay sai: không thì thu ngân dò số đếm từng 1.000đ để đọc két ca của người khác (B4).
    IF NOT (COALESCE(v_shift.closed_by = auth.uid(), false) OR public.is_store_back_office(v_shift.store_id))
       OR v_shift.counted_cash IS DISTINCT FROM p_counted_cash THEN
      RAISE EXCEPTION 'Ca đã đóng';
    END IF;
    -- Phiếu và bill của ca đã đóng không đổi được nữa nên đọc lại khớp lúc kết.
    v_already := true;
    v_totals := public.cash_shift_totals(p_shift_id);
  ELSE
    v_totals := public.cash_shift_totals(p_shift_id);
    v_expected := (v_totals->>'expected_cash')::bigint;
    UPDATE public.cash_shifts
       SET status = 'closed',
           closed_by = auth.uid(),
           closed_at = now(),
           counted_cash = p_counted_cash,
           expected_cash = v_expected,
           difference = p_counted_cash - v_expected,
           close_note = v_note
     WHERE id = p_shift_id
    RETURNING * INTO v_shift;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already', v_already,
    'shift_id', v_shift.id,
    'opening_cash', v_totals->'opening_cash',
    'cash_sales', v_totals->'cash_sales',
    'cash_receipts', v_totals->'cash_receipts',
    'cash_payments', v_totals->'cash_payments',
    'debt_cash', v_totals->'debt_cash',
    'expected_cash', v_shift.expected_cash,
    'counted_cash', v_shift.counted_cash,
    'difference', v_shift.difference
  );
END;
$$;

-- "Tiếp tục gộp vào ca đó" cho ca quên kết: ghi người và giờ, cảnh báo không hiện lại trong ngày kinh doanh này.
-- Gộp nhiều lần (qua nhiều ngày) chỉ giữ người và giờ của lần gần nhất — chấp nhận, carried_days vẫn tính từ opened_at.
CREATE FUNCTION public.continue_stale_shift(p_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
  v_status text;
BEGIN
  SELECT s.store_id, s.status INTO v_store, v_status FROM public.cash_shifts s WHERE s.id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy ca';
  END IF;
  IF NOT public.is_store_pos_operator(v_store) THEN
    RAISE EXCEPTION 'Không có quyền thao tác ca';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Ca đã đóng';
  END IF;
  IF NOT public.cash_shift_stale(p_shift_id) THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  UPDATE public.cash_shifts SET continued_by = auth.uid(), continued_at = now() WHERE id = p_shift_id;
  RETURN jsonb_build_object('ok', true, 'already', false);
END;
$$;

-- Trạng thái ca cho POS. Không có tiền bán / dự kiến (ca đang mở).
CREATE FUNCTION public.get_open_cash_shift(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_required boolean;
  v_shift public.cash_shifts%ROWTYPE;
BEGIN
  IF NOT public.is_store_pos_operator(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền thao tác ca';
  END IF;
  SELECT w.require_cash_shift INTO v_required FROM public.store_workflow_settings w WHERE w.store_id = p_store_id;
  SELECT * INTO v_shift FROM public.cash_shifts s WHERE s.store_id = p_store_id AND s.status = 'open';

  RETURN jsonb_build_object(
    'required', COALESCE(v_required, false),
    -- Chủ quán + quản lý ghi phiếu chuyển khoản và huỷ phiếu; thu ngân chỉ thu/chi tiền mặt tại két.
    'can_manage_entries', public.is_store_back_office(p_store_id),
    'shift', CASE WHEN v_shift.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_shift.id,
      'opened_at', v_shift.opened_at,
      'opened_by_name', public.cash_user_name(v_shift.opened_by),
      'opening_cash', v_shift.opening_cash,
      'open_note', v_shift.open_note,
      'stale', public.cash_shift_stale(v_shift.id),
      'entries', public.cash_shift_entries_json(v_shift.id)
    ) END
  );
END;
$$;

-- Danh sách ca (tab Ca ở Hoá đơn & Báo cáo). Chủ quán + quản lý xem mọi ca; thu ngân chỉ ca mình mở hoặc kết.
-- expected_cash / counted_cash / difference là số đã lưu lúc kết, ca mở luôn null.
CREATE FUNCTION public.list_cash_shifts(p_store_id uuid, p_limit integer DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_all boolean;
  v_required boolean;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 60), 1), 200);
  v_shifts jsonb;
BEGIN
  IF NOT public.is_store_pos_operator(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền thao tác ca';
  END IF;
  v_all := public.is_store_back_office(p_store_id);
  SELECT w.require_cash_shift INTO v_required FROM public.store_workflow_settings w WHERE w.store_id = p_store_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', x.id,
           'status', x.status,
           'opened_at', x.opened_at,
           'closed_at', x.closed_at,
           'opened_by_name', public.cash_user_name(x.opened_by),
           'closed_by_name', public.cash_user_name(x.closed_by),
           'opening_cash', x.opening_cash,
           'expected_cash', x.expected_cash,
           'counted_cash', x.counted_cash,
           'difference', x.difference
         ) ORDER BY x.opened_at DESC, x.id DESC), '[]'::jsonb)
    INTO v_shifts
    FROM (SELECT s.* FROM public.cash_shifts s
           WHERE s.store_id = p_store_id
             AND (v_all OR s.opened_by = v_uid OR s.closed_by = v_uid)
           ORDER BY s.opened_at DESC, s.id DESC
           LIMIT v_limit) x;

  RETURN jsonb_build_object('required', COALESCE(v_required, false), 'shifts', v_shifts);
END;
$$;

CREATE FUNCTION public.get_cash_shift_report(p_shift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store uuid;
  v_opened_by uuid;
  v_closed_by uuid;
BEGIN
  SELECT s.store_id, s.opened_by, s.closed_by INTO v_store, v_opened_by, v_closed_by
    FROM public.cash_shifts s WHERE s.id = p_shift_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy ca';
  END IF;
  -- COALESCE: closed_by NULL (ca mở) không được làm cả điều kiện thành NULL rồi lọt qua IF.
  IF NOT (public.is_store_back_office(v_store)
          OR (public.is_store_pos_operator(v_store)
              AND (COALESCE(v_opened_by = v_uid, false) OR COALESCE(v_closed_by = v_uid, false)))) THEN
    RAISE EXCEPTION 'Không có quyền xem ca này';
  END IF;
  RETURN public.cash_shift_report_json(p_shift_id);
END;
$$;

-- Công tắc bắt buộc mở ca: chỉ chủ quán (hoặc MEVO). Mẫu set_business_day_start (mig 111): khoá stores → settings,
-- ghi sự kiện cài đặt trước / sau.
CREATE FUNCTION public.set_require_cash_shift(p_store_id uuid, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.is_store_owner_or_admin(p_store_id) THEN
    RAISE EXCEPTION 'Chỉ chủ quán được bật/tắt bắt buộc mở ca';
  END IF;
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Giá trị không hợp lệ';
  END IF;

  PERFORM 1 FROM public.stores WHERE id = p_store_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy quán';
  END IF;

  INSERT INTO public.store_workflow_settings(store_id)
  VALUES (p_store_id)
  ON CONFLICT (store_id) DO NOTHING;
  PERFORM 1 FROM public.store_workflow_settings WHERE store_id = p_store_id FOR UPDATE;

  -- Tắt khi còn ca mở thì ca đó không ai kết được trên POS (POS ẩn mọi nút ca khi tắt).
  IF NOT p_enabled AND EXISTS (SELECT 1 FROM public.cash_shifts s WHERE s.store_id = p_store_id AND s.status = 'open') THEN
    RAISE EXCEPTION 'Còn ca đang mở, kết ca trước khi tắt';
  END IF;

  v_before := public.store_workflow_snapshot(p_store_id);

  UPDATE public.store_workflow_settings
  SET require_cash_shift = p_enabled,
      updated_at = now(),
      updated_by = v_uid
  WHERE store_id = p_store_id;

  v_after := public.store_workflow_snapshot(p_store_id);
  INSERT INTO public.store_workflow_setting_events(store_id, before_value, after_value, changed_by, changed_via)
  VALUES (
    p_store_id, v_before, v_after, v_uid,
    CASE WHEN public.is_store_owner_of(p_store_id) THEN 'owner' ELSE 'mevo' END
  );

  RETURN jsonb_build_object('ok', true, 'require_cash_shift', p_enabled);
END;
$$;

-- ============================================================
-- 10) store_workflow_snapshot: thêm require_cash_shift (sự kiện cài đặt thấy trước / sau, POS đọc qua
--     get_public_store_workflow). Helper vá tại chỗ theo mẫu mig 110/111: neo khớp ĐÚNG MỘT lần, CRLF → LF.
--     Neo chép từ pg_get_functiondef prod sau mig 111 (bản chụp supabase/tests/prod-defs/122).
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
    RAISE EXCEPTION 'mig 122: % không còn chuỗi cần vá: %', p_sig, v_from;
  END IF;
  IF v_hits > 1 THEN
    RAISE EXCEPTION 'mig 122: % có hơn một chỗ khớp chuỗi cần vá: %', p_sig, v_from;
  END IF;
  EXECUTE replace(v_def, v_from, v_to);
END
$patch$;

SELECT pg_temp.mevo_patch('public.store_workflow_snapshot(uuid)',
$a$'business_day_start', to_char(w.business_day_start, 'HH24:MI')$a$,
$b$'business_day_start', to_char(w.business_day_start, 'HH24:MI'),
    'require_cash_shift', w.require_cash_shift$b$);

-- ============================================================
-- 11) Quyền hàm ca
-- ============================================================
REVOKE ALL ON FUNCTION public.cash_user_name(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cash_shift_stale(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cash_shift_entries_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cash_shift_report_json(uuid) FROM PUBLIC, anon, authenticated;
-- /print/agent (plan C) render phiếu bàn giao không có phiên đăng nhập.
GRANT EXECUTE ON FUNCTION public.cash_shift_report_json(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.open_cash_shift(uuid, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_cash_shift(uuid, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.continue_stale_shift(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_open_cash_shift(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_cash_shifts(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_cash_shift_report(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_require_cash_shift(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_cash_shift(uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_shift(uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.continue_stale_shift(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_open_cash_shift(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_cash_shifts(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_shift_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_require_cash_shift(uuid, boolean) TO authenticated;

-- ============================================================
-- 12) Sổ thu chi: RPC
--    Quyền (bảng vai Quản lý §2): chủ quán + quản lý (is_store_back_office) ghi TM + CK, huỷ, sửa danh mục, xem
--    cả sổ. Thu ngân chỉ ghi TIỀN MẶT tại két (nguồn pos_drawer), không huỷ, chỉ xem phiếu mình ghi. Phục vụ: không.
-- ============================================================

-- Ghi phiếu. Quán suy từ danh mục (client không tự chọn quán). p_source chỉ manual | pos_drawer: phiếu
-- inventory_receipt chỉ sinh trong giao dịch phiếu nhập kho (122b), danh mục hệ thống "Nhập hàng" cũng vậy.
CREATE FUNCTION public.cash_book_create(
  p_kind text, p_method text, p_category_id uuid, p_amount bigint, p_note text, p_counterparty text,
  p_client_request_id uuid, p_source text DEFAULT 'manual')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
  v_is_system boolean;
  v_result jsonb;
  v_entry public.cash_book_entries%ROWTYPE;
BEGIN
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu mã chống ghi trùng';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('manual', 'pos_drawer') THEN
    RAISE EXCEPTION 'Nguồn phiếu không hợp lệ';
  END IF;

  SELECT c.store_id, c.is_system INTO v_store, v_is_system
    FROM public.cash_book_categories c WHERE c.id = p_category_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Danh mục không hợp lệ';
  END IF;

  IF public.is_store_back_office(v_store) THEN
    NULL;  -- mọi phương thức, mọi nguồn trong danh sách trên
  ELSIF public.is_store_pos_operator(v_store) THEN
    IF p_method IS DISTINCT FROM 'cash' OR p_source <> 'pos_drawer' THEN
      RAISE EXCEPTION 'Thu ngân chỉ ghi thu/chi tiền mặt ở két';
    END IF;
  ELSE
    RAISE EXCEPTION 'Không có quyền ghi sổ thu chi';
  END IF;

  IF v_is_system THEN
    RAISE EXCEPTION 'Danh mục Nhập hàng chỉ ghi qua phiếu nhập kho';
  END IF;

  -- Gửi lại (mạng rớt, bấm hai lần): hàm nội bộ tự trả id cũ với already = true (kể cả khi ca đã đóng giữa hai
  -- lần, kể cả hai lần gọi song song) hoặc raise khi cùng mã mà khác nội dung / khác người ghi.
  v_result := public.cash_book_create_internal_result(
    v_store, p_kind, p_method, p_category_id, p_amount, p_note, p_counterparty, p_source, NULL, auth.uid(),
    p_client_request_id);

  SELECT * INTO v_entry FROM public.cash_book_entries e WHERE e.id = (v_result->>'id')::uuid;
  RETURN jsonb_build_object(
    'ok', true,
    'already', (v_result->>'already')::boolean,
    'id', v_entry.id,
    'cash_shift_id', v_entry.cash_shift_id,
    'business_date', v_entry.business_date
  );
END;
$$;

-- Huỷ phiếu: chỉ chủ quán / quản lý. Phiếu chi sinh từ phiếu nhập kho huỷ bằng cách huỷ phiếu nhập (kho và sổ
-- luôn khớp). Khoá phiếu FOR UPDATE và ca FOR SHARE nằm trong cash_book_void_internal.
CREATE FUNCTION public.cash_book_void(p_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
  v_source text;
BEGIN
  SELECT e.store_id, e.source INTO v_store, v_source FROM public.cash_book_entries e WHERE e.id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiếu';
  END IF;
  IF NOT public.is_store_back_office(v_store) THEN
    RAISE EXCEPTION 'Chỉ chủ quán hoặc quản lý được huỷ phiếu';
  END IF;
  IF v_source = 'inventory_receipt' THEN
    RAISE EXCEPTION 'Phiếu chi của phiếu nhập kho, huỷ ở trang Kho';
  END IF;
  RETURN public.cash_book_void_internal(p_id, p_reason, auth.uid());
END;
$$;

-- Xem sổ theo khoảng ngày kinh doanh (business_date). Thu ngân chỉ thấy phiếu mình ghi (totals cũng vậy).
-- totals chỉ tính phiếu chưa huỷ, trên TOÀN BỘ phiếu khớp lọc (không chỉ 2000 dòng trả về).
CREATE FUNCTION public.cash_book_list(p_store_id uuid, p_from date, p_to date, p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_all boolean;
  v_filters jsonb := COALESCE(p_filters, '{}'::jsonb);
  v_kind text;
  v_method text;
  v_cat_text text;
  v_cat uuid;
  v_entries jsonb;
  v_totals jsonb;
  v_truncated boolean;
BEGIN
  IF public.is_store_back_office(p_store_id) THEN
    v_all := true;
  ELSIF public.is_store_pos_operator(p_store_id) THEN
    v_all := false;
  ELSE
    RAISE EXCEPTION 'Không có quyền xem sổ thu chi';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to OR p_to - p_from > 366 THEN
    RAISE EXCEPTION 'Khoảng ngày không hợp lệ';
  END IF;

  IF jsonb_typeof(v_filters) <> 'object' THEN
    RAISE EXCEPTION 'Bộ lọc không hợp lệ';
  END IF;
  v_kind := NULLIF(v_filters->>'kind', '');
  v_method := NULLIF(v_filters->>'method', '');
  v_cat_text := NULLIF(v_filters->>'category_id', '');
  IF (v_kind IS NOT NULL AND v_kind NOT IN ('receipt', 'payment'))
     OR (v_method IS NOT NULL AND v_method NOT IN ('cash', 'bank'))
     OR (v_cat_text IS NOT NULL
         AND v_cat_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'Bộ lọc không hợp lệ';
  END IF;
  v_cat := v_cat_text::uuid;

  WITH f AS (
    SELECT e.*
      FROM public.cash_book_entries e
     WHERE e.store_id = p_store_id
       AND e.business_date BETWEEN p_from AND p_to
       AND (v_all OR e.created_by = v_uid)
       AND (v_kind IS NULL OR e.kind = v_kind)
       AND (v_method IS NULL OR e.method = v_method)
       AND (v_cat IS NULL OR e.category_id = v_cat)
  )
  SELECT
    (SELECT COALESCE(jsonb_agg(x.j ORDER BY x.created_at DESC, x.id DESC), '[]'::jsonb)
       FROM (SELECT f.id, f.created_at, jsonb_build_object(
                     'id', f.id,
                     'kind', f.kind,
                     'method', f.method,
                     'category_id', f.category_id,
                     'category_name', c.name,
                     'report_group', c.report_group,
                     'amount', f.amount,
                     'note', f.note,
                     'counterparty', f.counterparty,
                     'business_date', f.business_date,
                     'created_at', f.created_at,
                     'created_by_name', public.cash_user_name(f.created_by),
                     'cash_shift_id', f.cash_shift_id,
                     'shift_opened_at', s.opened_at,
                     'source', f.source,
                     'source_ref', f.source_ref,
                     'voided_at', f.voided_at,
                     'voided_by_name', public.cash_user_name(f.voided_by),
                     'void_reason', f.void_reason) AS j
               FROM f
               JOIN public.cash_book_categories c ON c.id = f.category_id
               LEFT JOIN public.cash_shifts s ON s.id = f.cash_shift_id
              ORDER BY f.created_at DESC, f.id DESC
              LIMIT 2000) x),
    (SELECT jsonb_build_object(
              'receipt_cash', COALESCE(SUM(f.amount) FILTER (WHERE f.kind = 'receipt' AND f.method = 'cash'), 0),
              'receipt_bank', COALESCE(SUM(f.amount) FILTER (WHERE f.kind = 'receipt' AND f.method = 'bank'), 0),
              'payment_cash', COALESCE(SUM(f.amount) FILTER (WHERE f.kind = 'payment' AND f.method = 'cash'), 0),
              'payment_bank', COALESCE(SUM(f.amount) FILTER (WHERE f.kind = 'payment' AND f.method = 'bank'), 0))
       FROM f WHERE f.voided_at IS NULL),
    (SELECT count(*) > 2000 FROM f)
  INTO v_entries, v_totals, v_truncated;

  RETURN jsonb_build_object('entries', v_entries, 'totals', v_totals, 'truncated', v_truncated);
END;
$$;

-- Thêm / sửa danh mục (p_id NULL = thêm). Không chọn được nhóm inventory_purchase (chỉ danh mục hệ thống),
-- không đổi loại thu/chi (phiếu cũ đã ghi theo loại), danh mục hệ thống không sửa.
CREATE FUNCTION public.cash_book_save_category(
  p_store_id uuid, p_id uuid, p_kind text, p_name text, p_report_group text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(p_name);
  v_kind text;
  v_group text;
  v_cat public.cash_book_categories%ROWTYPE;
  v_id uuid;
BEGIN
  IF NOT public.is_store_back_office(p_store_id) THEN
    RAISE EXCEPTION 'Chỉ chủ quán hoặc quản lý được sửa danh mục';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_cat FROM public.cash_book_categories c
     WHERE c.id = p_id AND c.store_id = p_store_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Không tìm thấy danh mục';
    END IF;
    IF v_cat.is_system THEN
      RAISE EXCEPTION 'Danh mục hệ thống không sửa được';
    END IF;
    IF p_kind IS NOT NULL AND p_kind <> v_cat.kind THEN
      RAISE EXCEPTION 'Không đổi được loại thu/chi của danh mục';
    END IF;
    v_kind := v_cat.kind;
    v_group := COALESCE(NULLIF(p_report_group, ''), v_cat.report_group);
    -- Đổi nhóm báo cáo của danh mục đã có phiếu sẽ âm thầm dời phiếu cũ sang dòng khác của báo cáo lãi lỗ.
    IF v_group <> v_cat.report_group
       AND EXISTS (SELECT 1 FROM public.cash_book_entries e WHERE e.category_id = p_id) THEN
      RAISE EXCEPTION 'Danh mục đã có phiếu — không đổi nhóm báo cáo được; tạo danh mục mới';
    END IF;
  ELSE
    IF p_kind IS NULL OR p_kind NOT IN ('receipt', 'payment') THEN
      RAISE EXCEPTION 'Loại danh mục không hợp lệ';
    END IF;
    v_kind := p_kind;
    v_group := COALESCE(NULLIF(p_report_group, ''),
                        CASE WHEN p_kind = 'payment' THEN 'operating_expense' ELSE 'other_income' END);
  END IF;

  IF v_name IS NULL OR v_name = '' OR length(v_name) > 60 THEN
    RAISE EXCEPTION 'Tên danh mục từ 1 đến 60 ký tự';
  END IF;
  IF NOT ((v_kind = 'payment' AND v_group IN ('operating_expense', 'owner_draw', 'cash_transfer'))
          OR (v_kind = 'receipt' AND v_group IN ('other_income', 'cash_transfer'))) THEN
    RAISE EXCEPTION 'Nhóm danh mục không hợp lệ';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cash_book_categories c
              WHERE c.store_id = p_store_id AND c.kind = v_kind AND lower(c.name) = lower(v_name)
                AND c.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'Danh mục đã có';
  END IF;

  BEGIN
    IF p_id IS NULL THEN
      INSERT INTO public.cash_book_categories (store_id, kind, name, report_group, sort_order)
      VALUES (p_store_id, v_kind, v_name, v_group,
              COALESCE((SELECT max(c.sort_order) FROM public.cash_book_categories c
                         WHERE c.store_id = p_store_id AND c.kind = v_kind), 0) + 10)
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.cash_book_categories SET name = v_name, report_group = v_group WHERE id = p_id;
      v_id := p_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    -- Hai người cùng thêm một tên đúng lúc.
    RAISE EXCEPTION 'Danh mục đã có';
  END;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- Ẩn / hiện danh mục. Ẩn không xoá: phiếu cũ vẫn giữ danh mục, chỉ không chọn được khi ghi phiếu mới.
CREATE FUNCTION public.cash_book_set_category_active(p_id uuid, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat public.cash_book_categories%ROWTYPE;
BEGIN
  SELECT * INTO v_cat FROM public.cash_book_categories c WHERE c.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy danh mục';
  END IF;
  IF NOT public.is_store_back_office(v_cat.store_id) THEN
    RAISE EXCEPTION 'Chỉ chủ quán hoặc quản lý được sửa danh mục';
  END IF;
  IF v_cat.is_system THEN
    RAISE EXCEPTION 'Danh mục hệ thống không sửa được';
  END IF;
  IF p_active IS NULL THEN
    RAISE EXCEPTION 'Giá trị không hợp lệ';
  END IF;
  UPDATE public.cash_book_categories SET is_active = p_active WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cash_book_create(text, text, uuid, bigint, text, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cash_book_void(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cash_book_list(uuid, date, date, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cash_book_save_category(uuid, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cash_book_set_category_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_book_create(text, text, uuid, bigint, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cash_book_void(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cash_book_list(uuid, date, date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cash_book_save_category(uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cash_book_set_category_active(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
