-- ============================================================
-- Mig 144 — Phiếu nhập gắn nhà cung cấp (NCC). Phần hai của công nợ NCC (mig 143 = bảng + sổ thu chi, 145 = RPC trả nợ).
-- Spec: docs/superpowers/specs/2026-11-17-cong-no-ncc-design.md §5.2. Plan: docs/superpowers/plans/2026-11-17-cong-no-ncc.md Task 2.
--
--   • inventory_post_document: nhận supplier_id hoặc supplier_name; tên chưa có thì tạo NCC, NCC đã ngừng thì bật lại;
--     Chưa trả bắt buộc có NCC ("Phiếu chưa trả cần nhà cung cấp"); bản chụp supplier_name = tên chuẩn của NCC.
--   • inventory_void_document: khoá NCC TRƯỚC phiếu (cùng thứ tự với trả nợ); phiếu đã nhận tiền trả nợ (lần trả chưa
--     huỷ) → "Phiếu đã trả nợ một phần — huỷ lần trả trước".
--   • inventory_document_json trả thêm supplier_id, outstanding (số còn nợ tính lúc đọc).
--
-- ⚠️ Cần 143 đã áp. Bọc một transaction; neo lệch thì RAISE, không để lại nửa migration. Không chạy lại file này.
-- ============================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regclass('public.supplier_payment_allocations') IS NULL THEN
    RAISE EXCEPTION 'mig 144: thiếu bảng supplier_payment_allocations (cần mig 143)';
  END IF;
  IF to_regprocedure('public.inventory_resolve_supplier(uuid,jsonb,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'mig 144: đã áp — không chạy lại file này';
  END IF;
END
$pre$;

-- NCC của một phiếu nhập đang lưu: p_doc.supplier_id (đúng quán) hoặc p_doc.supplier_name (tên chuẩn, không phân biệt
-- hoa thường; chưa có thì tạo, đã ngừng thì bật lại). Không có gì → NULL. Ghi luôn khoá dòng NCC (UPDATE / ON CONFLICT
-- DO UPDATE) TRƯỚC khi chèn phiếu — cùng thứ tự khoá "NCC trước, phiếu sau" với supplier_pay.
-- Hai máy cùng gõ một tên mới: máy sau vấp ON CONFLICT và dùng NCC máy trước vừa tạo.
CREATE FUNCTION public.inventory_resolve_supplier(p_store_id uuid, p_doc jsonb, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_raw text := nullif(btrim(coalesce(p_doc ->> 'supplier_id', '')), '');
  v_name text := public.supplier_normalize_name(p_doc ->> 'supplier_name');
  v_id uuid;
BEGIN
  IF v_raw IS NOT NULL THEN
    IF v_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Nhà cung cấp không hợp lệ';
    END IF;
    UPDATE public.suppliers SET is_active = true
     WHERE id = v_raw::uuid AND store_id = p_store_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Nhà cung cấp không hợp lệ';
    END IF;
    RETURN v_id;
  END IF;
  IF v_name IS NULL THEN
    RETURN NULL;
  END IF;
  IF char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Tên nhà cung cấp tối đa 120 ký tự';
  END IF;
  INSERT INTO public.suppliers (store_id, name, created_by)
  VALUES (p_store_id, v_name, p_actor)
  ON CONFLICT (store_id, lower(name)) DO UPDATE SET is_active = true
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Số còn nợ của một phiếu nhập: chỉ phiếu nhập posted, Chưa trả, có NCC; còn lại NULL. Lần trả đã huỷ không tính.
CREATE FUNCTION public.inventory_receipt_outstanding(p_doc_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT d.total_amount - coalesce((
           SELECT sum(a.amount)
             FROM public.supplier_payment_allocations a
             JOIN public.supplier_payments p ON p.id = a.supplier_payment_id
            WHERE a.inventory_document_id = d.id AND p.voided_at IS NULL), 0)::bigint
    FROM public.inventory_documents d
   WHERE d.id = p_doc_id AND d.kind = 'receipt' AND d.status = 'posted' AND d.paid_status = 'unpaid'
     AND d.supplier_id IS NOT NULL;
$$;

-- Vá tại chỗ. Mẫu mig 122b: neo khớp ĐÚNG MỘT lần, CRLF → LF.
CREATE OR REPLACE FUNCTION pg_temp.mevo_patch(p_sig text, p_from text, p_to text)
RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text; v_from text; v_to text; v_hits int;
BEGIN
  v_from := replace(p_from, E'\r\n', E'\n');
  v_to   := replace(p_to,   E'\r\n', E'\n');
  v_def  := replace(pg_get_functiondef(p_sig::regprocedure), E'\r\n', E'\n');
  v_hits := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
  IF v_hits = 0 THEN
    RAISE EXCEPTION 'mig 144: % không còn chuỗi cần vá: %', p_sig, v_from;
  END IF;
  IF v_hits > 1 THEN
    RAISE EXCEPTION 'mig 144: % có hơn một chỗ khớp chuỗi cần vá: %', p_sig, v_from;
  END IF;
  EXECUTE replace(v_def, v_from, v_to);
END
$patch$;

-- 1) inventory_post_document: biến NCC; gắn / tạo NCC sau khi kiểm trạng thái trả; Chưa trả bắt buộc có NCC;
--    ghi supplier_id ngay sau khi chèn phiếu.
SELECT pg_temp.mevo_patch('public.inventory_post_document(text,jsonb,jsonb,uuid)',
$a$  v_before text;$a$,
$b$  v_before text;
  v_supplier_id uuid; -- mig 144$b$);

SELECT pg_temp.mevo_patch('public.inventory_post_document(text,jsonb,jsonb,uuid)',
$a$      RAISE EXCEPTION 'Phiếu chưa trả không có phương thức trả';
    END IF;$a$,
$b$      RAISE EXCEPTION 'Phiếu chưa trả không có phương thức trả';
    END IF;
    -- mig 144: NCC của phiếu nhập.
    v_supplier_id := public.inventory_resolve_supplier(v_store_id, p_doc, auth.uid());
    IF v_supplier_id IS NOT NULL THEN
      SELECT s.name INTO v_supplier FROM public.suppliers s WHERE s.id = v_supplier_id;
    END IF;
    IF v_paid_status = 'unpaid' AND v_supplier_id IS NULL THEN
      RAISE EXCEPTION 'Phiếu chưa trả cần nhà cung cấp';
    END IF;$b$);

SELECT pg_temp.mevo_patch('public.inventory_post_document(text,jsonb,jsonb,uuid)',
$a$  RETURNING id INTO v_doc_id;$a$,
$b$  RETURNING id INTO v_doc_id;
  IF v_supplier_id IS NOT NULL THEN
    UPDATE public.inventory_documents SET supplier_id = v_supplier_id WHERE id = v_doc_id; -- mig 144
  END IF;$b$);

-- 2) inventory_void_document: khoá NCC của phiếu TRƯỚC khi khoá phiếu; phiếu đã nhận tiền trả nợ thì không huỷ được.
SELECT pg_temp.mevo_patch('public.inventory_void_document(uuid,text)',
$a$  SELECT * INTO v_doc FROM public.inventory_documents WHERE id = v_doc_id FOR UPDATE;$a$,
$b$  -- mig 144: khoá NCC trước phiếu (cùng thứ tự với supplier_pay / supplier_payment_void).
  PERFORM 1 FROM public.suppliers s
   WHERE s.id = (SELECT d.supplier_id FROM public.inventory_documents d WHERE d.id = v_doc_id)
   FOR UPDATE;
  SELECT * INTO v_doc FROM public.inventory_documents WHERE id = v_doc_id FOR UPDATE;$b$);

SELECT pg_temp.mevo_patch('public.inventory_void_document(uuid,text)',
$a$  IF v_reason = '' THEN$a$,
$b$  IF EXISTS (SELECT 1 FROM public.supplier_payment_allocations a
               JOIN public.supplier_payments p ON p.id = a.supplier_payment_id
              WHERE a.inventory_document_id = v_doc_id AND p.voided_at IS NULL) THEN
    RAISE EXCEPTION 'Phiếu đã trả nợ một phần — huỷ lần trả trước';
  END IF;
  IF v_reason = '' THEN$b$);

-- 3) JSON phiếu kho (danh sách + chi tiết) trả thêm supplier_id và số còn nợ.
SELECT pg_temp.mevo_patch('public.inventory_document_json(uuid)',
$a$'cash_book_entry_id', d.cash_book_entry_id)$a$,
$b$'cash_book_entry_id', d.cash_book_entry_id,
    'supplier_id', d.supplier_id, 'outstanding', public.inventory_receipt_outstanding(d.id))$b$);

REVOKE ALL ON FUNCTION public.inventory_resolve_supplier(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inventory_receipt_outstanding(uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
