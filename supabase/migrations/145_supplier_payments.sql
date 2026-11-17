-- ============================================================
-- Mig 145 — Trả nợ nhà cung cấp (NCC). Phần ba của công nợ NCC (143 = bảng + sổ thu chi, 144 = phiếu nhập gắn NCC).
-- Spec: docs/superpowers/specs/2026-11-17-cong-no-ncc-design.md §5.3. Plan: docs/superpowers/plans/2026-11-17-cong-no-ncc.md Task 3.
--
-- RPC (chỉ chủ quán + quản lý — is_store_back_office; NCC lạ và NCC quán khác cùng lỗi "Không có quyền"):
--   supplier_list(store)            NCC + tổng còn nợ + số phiếu nợ + ngày phiếu nợ cũ nhất (mọi NCC, kể cả đã ngừng)
--   supplier_detail(supplier)       NCC + phiếu Chưa trả từng dòng (tổng / đã trả / còn nợ) + lịch sử trả (có phân bổ)
--   supplier_upsert / supplier_set_active
--   supplier_pay(...)               một lần trả = phân bổ cũ nhất trước + ĐÚNG MỘT phiếu chi "Nhập hàng" (nguồn supplier_payment)
--   supplier_payment_void(id, lý do) huỷ lần trả + huỷ phiếu chi đi kèm (ca của phiếu tiền mặt đã kết → chặn)
-- Thứ tự khoá: NCC (FOR UPDATE) → phiếu nhập (theo id) → phiếu chi. Cùng thứ tự với inventory_void_document (mig 144).
-- Gửi lại cùng mã + cùng nội dung (NCC, số tiền, phương thức, tập phiếu yêu cầu, người ghi) → trả lần cũ, kể cả khi ca
-- đã kết; khác nội dung → "Mã chống ghi trùng đã dùng cho lần trả khác". Ghi chú không đưa vào phép so.
--
-- ⚠️ Cần 143 + 144 (và 123: debt_normalize_phone, debt_format_vnd). Bọc một transaction. Không chạy lại file này.
-- ============================================================
BEGIN;

DO $pre$
DECLARE v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.inventory_resolve_supplier(uuid,jsonb,uuid)',
    'public.debt_format_vnd(bigint)',
    'public.debt_normalize_phone(text)',
    'public.supplier_normalize_name(text)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'mig 145: thiếu hàm % (cần mig 123, 143, 144)', v_sig;
    END IF;
  END LOOP;
  IF to_regprocedure('public.supplier_pay(uuid,bigint,text,uuid[],text,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'mig 145: đã áp — không chạy lại file này';
  END IF;
END
$pre$;

-- ============================================================
-- 1) Hàm nội bộ
-- ============================================================

-- Phiếu Chưa trả (posted) của một NCC, cũ nhất trước, kèm số đã trả (lần trả chưa huỷ) và còn nợ. Gồm cả phiếu đã trả hết.
CREATE FUNCTION public.supplier_documents(p_supplier_id uuid)
RETURNS TABLE(document_id uuid, doc_no text, doc_date date, created_at timestamptz,
              total_amount bigint, paid_amount bigint, outstanding bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT d.id, d.doc_no, d.doc_date, d.created_at, d.total_amount, x.paid, d.total_amount - x.paid
    FROM public.inventory_documents d
    CROSS JOIN LATERAL (
      SELECT coalesce(sum(a.amount), 0)::bigint AS paid
        FROM public.supplier_payment_allocations a
        JOIN public.supplier_payments p ON p.id = a.supplier_payment_id
       WHERE a.inventory_document_id = d.id AND p.voided_at IS NULL) x
   WHERE d.supplier_id = p_supplier_id AND d.kind = 'receipt' AND d.status = 'posted' AND d.paid_status = 'unpaid'
   ORDER BY d.doc_date, d.created_at, d.id;
$$;

-- Một dòng NCC (danh sách + đầu ngăn kéo).
CREATE FUNCTION public.supplier_summary_json(p_supplier_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', s.id, 'name', s.name, 'phone', s.phone, 'note', s.note, 'is_active', s.is_active,
    'outstanding', coalesce((SELECT sum(o.outstanding) FROM public.supplier_documents(s.id) o WHERE o.outstanding > 0), 0),
    'open_docs', (SELECT count(*) FROM public.supplier_documents(s.id) o WHERE o.outstanding > 0),
    'oldest_open_date', (SELECT min(o.doc_date) FROM public.supplier_documents(s.id) o WHERE o.outstanding > 0))
    FROM public.suppliers s
   WHERE s.id = p_supplier_id;
$$;

-- Phân bổ của một lần trả, theo thứ tự phiếu (cũ nhất trước).
CREATE FUNCTION public.supplier_payment_allocations_json(p_payment_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('document_id', a.inventory_document_id, 'doc_no', d.doc_no, 'amount', a.amount)
                            ORDER BY d.doc_date, d.created_at, d.id), '[]'::jsonb)
    FROM public.supplier_payment_allocations a
    JOIN public.inventory_documents d ON d.id = a.inventory_document_id
   WHERE a.supplier_payment_id = p_payment_id;
$$;

-- Kết quả trả về của supplier_pay (lần mới lẫn gửi lại). remaining = tổng còn nợ của NCC sau lần trả.
CREATE FUNCTION public.supplier_pay_result(p_payment_id uuid, p_already boolean)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ok', true, 'already', p_already, 'supplier_payment_id', p.id, 'cash_book_entry_id', p.cash_book_entry_id,
    'allocations', public.supplier_payment_allocations_json(p.id),
    'remaining', coalesce((SELECT sum(o.outstanding) FROM public.supplier_documents(p.supplier_id) o WHERE o.outstanding > 0), 0))
    FROM public.supplier_payments p
   WHERE p.id = p_payment_id;
$$;

-- Ghi chú phiếu chi: "Trả nợ NCC: PN-0003, PN-0005". Quá 500 ký tự (trần ghi chú sổ) → lược đuôi thành
-- ", … (+N phiếu)", luôn chừa đủ chỗ cho đuôi.
CREATE FUNCTION public.supplier_payment_note(p_doc_nos text[])
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text := 'Trả nợ NCC: ';
  v_try text;
  v_tail int;
  n int := coalesce(cardinality(p_doc_nos), 0);
BEGIN
  FOR i IN 1..n LOOP
    v_try := v || CASE WHEN i > 1 THEN ', ' ELSE '' END || p_doc_nos[i];
    -- Chỗ chừa cho đuôi nếu còn phiếu sau (tính riêng: IF của plpgsql đọc điều kiện tới chữ THEN đầu tiên).
    v_tail := CASE WHEN i < n THEN length(', … (+' || (n - i) || ' phiếu)') ELSE 0 END;
    IF length(v_try) + v_tail > 500 THEN
      RETURN v || ', … (+' || (n - i + 1) || ' phiếu)';
    END IF;
    v := v_try;
  END LOOP;
  RETURN v;
END;
$$;

-- ============================================================
-- 2) Đọc
-- ============================================================
CREATE FUNCTION public.supplier_list(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_store_id IS NULL OR NOT public.is_store_back_office(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(public.supplier_summary_json(s.id) ORDER BY lower(s.name), s.id)
                     FROM public.suppliers s WHERE s.store_id = p_store_id), '[]'::jsonb);
END;
$$;

CREATE FUNCTION public.supplier_detail(p_supplier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
BEGIN
  SELECT s.store_id INTO v_store FROM public.suppliers s WHERE s.id = p_supplier_id;
  IF v_store IS NULL OR NOT public.is_store_back_office(v_store) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;
  RETURN jsonb_build_object(
    'supplier', public.supplier_summary_json(p_supplier_id),
    'documents', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', o.document_id, 'doc_no', o.doc_no, 'doc_date', o.doc_date, 'created_at', o.created_at,
               'total_amount', o.total_amount, 'paid_amount', o.paid_amount, 'outstanding', o.outstanding)
             ORDER BY o.doc_date, o.created_at, o.document_id)
        FROM public.supplier_documents(p_supplier_id) o), '[]'::jsonb),
    'payments', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'amount', p.amount, 'method', p.method, 'note', p.note, 'business_date', p.business_date,
               'created_at', p.created_at, 'created_by_name', public.cash_user_name(p.created_by),
               'voided_at', p.voided_at, 'voided_by_name', public.cash_user_name(p.voided_by), 'void_reason', p.void_reason,
               'cash_book_entry_id', p.cash_book_entry_id,
               'allocations', public.supplier_payment_allocations_json(p.id))
             ORDER BY p.created_at DESC, p.id DESC)
        FROM public.supplier_payments p WHERE p.supplier_id = p_supplier_id), '[]'::jsonb));
END;
$$;

-- ============================================================
-- 3) Danh mục NCC
-- ============================================================
CREATE FUNCTION public.supplier_upsert(p_store_id uuid, p_supplier_id uuid, p_name text, p_phone text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := public.supplier_normalize_name(p_name);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_phone text;
  v_id uuid;
BEGIN
  IF p_store_id IS NULL OR NOT public.is_store_back_office(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Tên nhà cung cấp không được trống';
  END IF;
  IF char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Tên nhà cung cấp quá dài';
  END IF;
  IF char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Ghi chú quá dài';
  END IF;
  v_phone := public.debt_normalize_phone(p_phone);

  IF EXISTS (SELECT 1 FROM public.suppliers s
              WHERE s.store_id = p_store_id AND lower(s.name) = lower(v_name) AND s.id IS DISTINCT FROM p_supplier_id) THEN
    RAISE EXCEPTION 'Đã có nhà cung cấp tên này';
  END IF;

  BEGIN
    IF p_supplier_id IS NULL THEN
      INSERT INTO public.suppliers (store_id, name, phone, note, created_by)
      VALUES (p_store_id, v_name, v_phone, v_note, auth.uid())
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.suppliers SET name = v_name, phone = v_phone, note = v_note
       WHERE id = p_supplier_id AND store_id = p_store_id
      RETURNING id INTO v_id;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Không có quyền';
      END IF;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    -- Hai máy cùng tạo một tên: máy sau lọt qua kiểm trên rồi vấp unique index → cùng câu báo.
    RAISE EXCEPTION 'Đã có nhà cung cấp tên này';
  END;
  RETURN jsonb_build_object('supplier_id', v_id);
END;
$$;

CREATE FUNCTION public.supplier_set_active(p_supplier_id uuid, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
BEGIN
  SELECT s.store_id INTO v_store FROM public.suppliers s WHERE s.id = p_supplier_id;
  IF v_store IS NULL OR NOT public.is_store_back_office(v_store) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;
  UPDATE public.suppliers SET is_active = coalesce(p_active, false) WHERE id = p_supplier_id;
  RETURN jsonb_build_object('is_active', coalesce(p_active, false));
END;
$$;

-- ============================================================
-- 4) Trả nợ / huỷ lần trả
-- ============================================================
CREATE FUNCTION public.supplier_pay(
  p_supplier_id uuid, p_amount bigint, p_method text, p_document_ids uuid[], p_note text, p_client_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
  v_name text;
  v_req uuid[];
  v_prev public.supplier_payments%ROWTYPE;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_doc record;
  v_total bigint;
  v_left bigint;
  v_take bigint;
  v_ids uuid[] := '{}';
  v_amounts bigint[] := '{}';
  v_nos text[] := '{}';
  v_payment uuid;
  v_entry uuid;
BEGIN
  -- Quyền kiểm bằng SELECT không khoá; NCC lạ và NCC quán khác cùng một lỗi.
  SELECT s.store_id INTO v_store FROM public.suppliers s WHERE s.id = p_supplier_id;
  IF v_store IS NULL OR NOT public.is_store_back_office(v_store) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu mã chống ghi trùng';
  END IF;
  -- Tập phiếu yêu cầu: khử trùng, sắp — để so lần gửi lại. NULL = mọi phiếu còn nợ.
  IF p_document_ids IS NOT NULL THEN
    SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[]) INTO v_req
      FROM unnest(p_document_ids) AS x WHERE x IS NOT NULL;
  END IF;

  -- Gửi lại (mạng rớt, bấm hai lần): khoá theo mã, có lần trả rồi thì trả lại lần đó (không kiểm ca, không ghi thêm).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_client_request_id::text, 0));
  SELECT * INTO v_prev FROM public.supplier_payments p
   WHERE p.store_id = v_store AND p.client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_prev.supplier_id IS DISTINCT FROM p_supplier_id OR v_prev.amount IS DISTINCT FROM p_amount
       OR v_prev.method IS DISTINCT FROM p_method OR v_prev.requested_document_ids IS DISTINCT FROM v_req
       OR v_prev.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Mã chống ghi trùng đã dùng cho lần trả khác';
    END IF;
    RETURN public.supplier_pay_result(v_prev.id, true);
  END IF;

  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 2000000000 THEN
    RAISE EXCEPTION 'Số tiền phải từ 1đ đến 2.000.000.000đ';
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('cash', 'bank') THEN
    RAISE EXCEPTION 'Phương thức không hợp lệ';
  END IF;
  IF v_req IS NOT NULL AND cardinality(v_req) = 0 THEN
    RAISE EXCEPTION 'Chọn ít nhất một phiếu';
  END IF;
  IF char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Ghi chú tối đa 500 ký tự';
  END IF;

  -- Khoá NCC rồi các phiếu Chưa trả của NCC (theo id). Huỷ phiếu nhập cũng khoá NCC trước nên không chen giữa được.
  SELECT s.name INTO v_name FROM public.suppliers s WHERE s.id = p_supplier_id FOR UPDATE;
  PERFORM 1 FROM public.inventory_documents d
   WHERE d.supplier_id = p_supplier_id AND d.kind = 'receipt' AND d.status = 'posted' AND d.paid_status = 'unpaid'
     AND (v_req IS NULL OR d.id = ANY (v_req))
   ORDER BY d.id
   FOR UPDATE;

  -- Đọc lại số dư sau khi có khoá. Phiếu yêu cầu không còn là phiếu nợ của NCC này → từ chối cả lần trả.
  IF v_req IS NOT NULL AND EXISTS (
       SELECT 1 FROM unnest(v_req) AS r(id)
        WHERE NOT EXISTS (SELECT 1 FROM public.supplier_documents(p_supplier_id) o
                           WHERE o.document_id = r.id AND o.outstanding > 0)) THEN
    RAISE EXCEPTION 'Danh sách phiếu đã thay đổi, tải lại trang';
  END IF;
  SELECT coalesce(sum(o.outstanding), 0) INTO v_total
    FROM public.supplier_documents(p_supplier_id) o
   WHERE o.outstanding > 0 AND (v_req IS NULL OR o.document_id = ANY (v_req));
  IF v_total = 0 THEN
    RAISE EXCEPTION 'Nhà cung cấp không còn nợ';
  END IF;
  IF p_amount > v_total THEN
    RAISE EXCEPTION 'Số tiền vượt số còn nợ (%)', public.debt_format_vnd(v_total);
  END IF;

  -- Phân bổ: ngày phiếu cũ nhất trước, cùng ngày theo giờ tạo rồi id.
  v_left := p_amount;
  FOR v_doc IN
    SELECT o.document_id, o.doc_no, o.outstanding
      FROM public.supplier_documents(p_supplier_id) o
     WHERE o.outstanding > 0 AND (v_req IS NULL OR o.document_id = ANY (v_req))
     ORDER BY o.doc_date, o.created_at, o.document_id
  LOOP
    EXIT WHEN v_left = 0;
    v_take := least(v_left, v_doc.outstanding);
    v_ids := v_ids || v_doc.document_id;
    v_amounts := v_amounts || v_take;
    v_nos := v_nos || v_doc.doc_no;
    v_left := v_left - v_take;
  END LOOP;

  -- Một phiếu chi "Nhập hàng" cho cả lần trả. Tiền mặt + quán bật ca: cần ca mở ("Chưa mở ca" → huỷ cả giao dịch).
  v_payment := gen_random_uuid();
  v_entry := public.cash_book_create_internal(
    v_store, 'payment', p_method, public.cash_book_system_category(v_store, 'inventory_purchase'),
    p_amount, public.supplier_payment_note(v_nos), v_name, 'supplier_payment', v_payment, auth.uid(), v_payment);

  INSERT INTO public.supplier_payments (
    id, store_id, supplier_id, amount, method, business_date, note, cash_book_entry_id, client_request_id,
    requested_document_ids, created_by)
  SELECT v_payment, v_store, p_supplier_id, p_amount, p_method, e.business_date, v_note, v_entry, p_client_request_id,
         v_req, auth.uid()
    FROM public.cash_book_entries e WHERE e.id = v_entry;

  INSERT INTO public.supplier_payment_allocations (supplier_payment_id, inventory_document_id, amount)
  SELECT v_payment, u.id, u.amount FROM unnest(v_ids, v_amounts) AS u(id, amount);

  RETURN public.supplier_pay_result(v_payment, false);
END;
$$;

CREATE FUNCTION public.supplier_payment_void(p_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
  v_supplier uuid;
  v_payment public.supplier_payments%ROWTYPE;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  SELECT p.store_id, p.supplier_id INTO v_store, v_supplier FROM public.supplier_payments p WHERE p.id = p_id;
  IF v_store IS NULL OR NOT public.is_store_back_office(v_store) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;
  -- NCC trước, lần trả sau, phiếu chi cuối (trong cash_book_void_internal).
  PERFORM 1 FROM public.suppliers s WHERE s.id = v_supplier FOR UPDATE;
  SELECT * INTO v_payment FROM public.supplier_payments p WHERE p.id = p_id FOR UPDATE;
  IF v_payment.voided_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Cần ghi lý do huỷ';
  END IF;
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Lý do huỷ tối đa 500 ký tự';
  END IF;

  -- Phiếu chi tiền mặt mà ca đã kết → "Ca của phiếu này đã kết, không huỷ được", cả giao dịch huỷ.
  PERFORM public.cash_book_void_internal(v_payment.cash_book_entry_id, left('Huỷ trả nợ NCC: ' || v_reason, 500), auth.uid());
  UPDATE public.supplier_payments SET voided_by = auth.uid(), voided_at = now(), void_reason = v_reason WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'already', false);
END;
$$;

-- ============================================================
-- 5) Quyền
-- ============================================================
REVOKE ALL ON FUNCTION public.supplier_documents(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supplier_summary_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supplier_payment_allocations_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supplier_pay_result(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supplier_payment_note(text[]) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.supplier_list(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supplier_detail(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supplier_upsert(uuid, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supplier_set_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supplier_pay(uuid, bigint, text, uuid[], text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supplier_payment_void(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supplier_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_upsert(uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_set_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_pay(uuid, bigint, text, uuid[], text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_payment_void(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
