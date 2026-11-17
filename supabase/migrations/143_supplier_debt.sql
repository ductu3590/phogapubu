-- ============================================================
-- Mig 143 — Công nợ nhà cung cấp (NCC). Spec: docs/superpowers/specs/2026-11-17-cong-no-ncc-design.md.
-- Plan: docs/superpowers/plans/2026-11-17-cong-no-ncc.md.
--
--   1) Bảng suppliers (danh mục NCC mỗi quán), supplier_payments (lần trả nợ), supplier_payment_allocations (phân bổ
--      vào phiếu nhập). inventory_documents.supplier_id. RLS bật, không policy: mọi đọc / ghi qua RPC.
--      Số nợ KHÔNG lưu sẵn: nợ một phiếu = total_amount (phiếu nhập posted, unpaid, có NCC) − phân bổ của lần trả chưa huỷ.
--   2) Sổ thu chi nhận nguồn 'supplier_payment' (source_ref = id lần trả, chỉ phiếu chi, tối đa một phiếu còn hiệu
--      lực mỗi lần trả). cash_book_void chặn huỷ thẳng phiếu nguồn này (huỷ ở trang Công nợ).
--   3) Vá tại chỗ inventory_post_document (gắn / tạo NCC, Chưa trả bắt buộc có NCC), inventory_void_document (khoá NCC
--      trước, chặn huỷ phiếu đã trả nợ một phần), inventory_document_json (supplier_id, outstanding).
--   4) RPC NCC: supplier_list, supplier_detail, supplier_upsert, supplier_set_active, supplier_pay,
--      supplier_payment_void. Chỉ chủ quán + quản lý (is_store_back_office). Khoá NCC trước, phiếu nhập sau.
--   5) Backfill: NCC từ supplier_name đã có (gộp hoa thường + khoảng trắng), nối supplier_id.
--
-- ⚠️ Cần 118, 122, 122b, 123 (debt_normalize_phone) đã áp. Bọc một transaction: $pre$ hay neo lệch thì RAISE.
-- ⚠️ Không chạy lại file này: CREATE TABLE / CREATE FUNCTION / vá neo không lặp được.
-- ⚠️ Từ lúc áp, phiếu nhập Chưa trả không có NCC bị từ chối ("Phiếu chưa trả cần nhà cung cấp").
-- ============================================================
BEGIN;

-- ============================================================
-- 0) Điều kiện trước
-- ============================================================
DO $pre$
DECLARE v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.inventory_post_document(text,jsonb,jsonb,uuid)',
    'public.inventory_void_document(uuid,text)',
    'public.inventory_document_json(uuid)',
    'public.cash_book_create_internal_result(uuid,text,text,uuid,bigint,text,text,text,uuid,uuid,uuid)',
    'public.cash_book_create_internal(uuid,text,text,uuid,bigint,text,text,text,uuid,uuid,uuid)',
    'public.cash_book_void_internal(uuid,text,uuid)',
    'public.cash_book_void(uuid,text)',
    'public.cash_book_system_category(uuid,text)',
    'public.debt_normalize_phone(text)',
    'public.is_store_back_office(uuid)',
    'public.current_business_date(uuid)',
    'public.cash_user_name(uuid)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'mig 143: thiếu hàm %', v_sig;
    END IF;
  END LOOP;
  IF to_regclass('public.suppliers') IS NOT NULL THEN
    RAISE EXCEPTION 'mig 143: bảng suppliers đã có — không chạy lại file này';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_book_entries_source_check'
                    AND conrelid = 'public.cash_book_entries'::regclass) THEN
    RAISE EXCEPTION 'mig 143: thiếu ràng buộc cash_book_entries_source_check (mig 122)';
  END IF;
END
$pre$;

-- ============================================================
-- 1) Bảng
-- ============================================================

-- Tên chuẩn: bỏ khoảng trắng đầu/cuối, gộp khoảng trắng liền nhau. Rỗng → NULL.
CREATE FUNCTION public.supplier_normalize_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT nullif(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), '');
$$;

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  name text NOT NULL CHECK (name = public.supplier_normalize_name(name) AND char_length(name) <= 120),
  phone text CHECK (phone ~ '^0[0-9]{8,10}$'),           -- đã chuẩn hoá bởi debt_normalize_phone
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, store_id)
);
-- Một tên một NCC mỗi quán (không phân biệt hoa thường), kể cả NCC đã ngừng.
CREATE UNIQUE INDEX suppliers_store_name_uq ON public.suppliers (store_id, lower(name));

ALTER TABLE public.inventory_documents ADD COLUMN supplier_id uuid;
ALTER TABLE public.inventory_documents ADD CONSTRAINT inventory_documents_supplier_same_store
  FOREIGN KEY (supplier_id, store_id) REFERENCES public.suppliers(id, store_id);
ALTER TABLE public.inventory_documents ADD CONSTRAINT inventory_documents_supplier_receipt_only
  CHECK (supplier_id IS NULL OR kind = 'receipt');
CREATE INDEX inventory_documents_supplier_idx ON public.inventory_documents (supplier_id) WHERE supplier_id IS NOT NULL;

CREATE TABLE public.supplier_payments (
  id uuid PRIMARY KEY,                                   -- cấp trước để phiếu chi trỏ source_ref về
  store_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0 AND amount <= 2000000000),
  method text NOT NULL CHECK (method IN ('cash', 'bank')),
  business_date date NOT NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  cash_book_entry_id uuid NOT NULL UNIQUE REFERENCES public.cash_book_entries(id),
  client_request_id uuid NOT NULL,
  requested_document_ids uuid[],                         -- tập phiếu người dùng chọn (đã sắp, khử trùng); NULL = mọi phiếu
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  voided_by uuid, voided_at timestamptz, void_reason text,
  CHECK ((voided_at IS NULL) = (voided_by IS NULL) AND (voided_at IS NULL) = (void_reason IS NULL)),
  FOREIGN KEY (supplier_id, store_id) REFERENCES public.suppliers(id, store_id),
  UNIQUE (store_id, client_request_id)
);
CREATE INDEX supplier_payments_supplier_idx ON public.supplier_payments (supplier_id);

CREATE TABLE public.supplier_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_payment_id uuid NOT NULL REFERENCES public.supplier_payments(id) ON DELETE CASCADE,
  inventory_document_id uuid NOT NULL REFERENCES public.inventory_documents(id),
  amount bigint NOT NULL CHECK (amount > 0),
  UNIQUE (supplier_payment_id, inventory_document_id)
);
CREATE INDEX supplier_payment_allocations_document_idx ON public.supplier_payment_allocations (inventory_document_id);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payment_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.suppliers FROM anon, authenticated;
REVOKE ALL ON public.supplier_payments FROM anon, authenticated;
REVOKE ALL ON public.supplier_payment_allocations FROM anon, authenticated;

-- ============================================================
-- 2) Sổ thu chi: nguồn 'supplier_payment'
-- ============================================================
ALTER TABLE public.cash_book_entries DROP CONSTRAINT cash_book_entries_source_check;
ALTER TABLE public.cash_book_entries ADD CONSTRAINT cash_book_entries_source_check
  CHECK (source IN ('manual', 'pos_drawer', 'inventory_receipt', 'supplier_payment'));
ALTER TABLE public.cash_book_entries DROP CONSTRAINT cash_book_entries_source_ref_pair;
ALTER TABLE public.cash_book_entries ADD CONSTRAINT cash_book_entries_source_ref_pair
  CHECK ((source IN ('inventory_receipt', 'supplier_payment')) = (source_ref IS NOT NULL));
ALTER TABLE public.cash_book_entries DROP CONSTRAINT cash_book_entries_inventory_payment_only;
ALTER TABLE public.cash_book_entries ADD CONSTRAINT cash_book_entries_inventory_payment_only
  CHECK (source NOT IN ('inventory_receipt', 'supplier_payment') OR kind = 'payment');
-- Một lần trả nợ NCC chỉ có một phiếu chi còn hiệu lực.
CREATE UNIQUE INDEX cash_book_entries_supplier_payment_once ON public.cash_book_entries (source_ref)
  WHERE source = 'supplier_payment' AND voided_at IS NULL;

-- ============================================================
-- 3) Vá tại chỗ. Mẫu mig 122b: neo khớp ĐÚNG MỘT lần, CRLF → LF.
-- ============================================================
CREATE OR REPLACE FUNCTION pg_temp.mevo_patch(p_sig text, p_from text, p_to text)
RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text; v_from text; v_to text; v_hits int;
BEGIN
  v_from := replace(p_from, E'\r\n', E'\n');
  v_to   := replace(p_to,   E'\r\n', E'\n');
  v_def  := replace(pg_get_functiondef(p_sig::regprocedure), E'\r\n', E'\n');
  v_hits := (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from);
  IF v_hits = 0 THEN
    RAISE EXCEPTION 'mig 143: % không còn chuỗi cần vá: %', p_sig, v_from;
  END IF;
  IF v_hits > 1 THEN
    RAISE EXCEPTION 'mig 143: % có hơn một chỗ khớp chuỗi cần vá: %', p_sig, v_from;
  END IF;
  EXECUTE replace(v_def, v_from, v_to);
END
$patch$;

-- 3a) cash_book_create_internal_result nhận nguồn supplier_payment (giống inventory_receipt: có source_ref, chỉ phiếu chi).
SELECT pg_temp.mevo_patch(
  'public.cash_book_create_internal_result(uuid,text,text,uuid,bigint,text,text,text,uuid,uuid,uuid)',
$a$NOT IN ('manual', 'pos_drawer', 'inventory_receipt') THEN$a$,
$b$NOT IN ('manual', 'pos_drawer', 'inventory_receipt', 'supplier_payment') THEN$b$);
SELECT pg_temp.mevo_patch(
  'public.cash_book_create_internal_result(uuid,text,text,uuid,bigint,text,text,text,uuid,uuid,uuid)',
$a$IF (p_source = 'inventory_receipt') <> (p_source_ref IS NOT NULL) THEN$a$,
$b$IF (p_source IN ('inventory_receipt', 'supplier_payment')) <> (p_source_ref IS NOT NULL) THEN$b$);
SELECT pg_temp.mevo_patch(
  'public.cash_book_create_internal_result(uuid,text,text,uuid,bigint,text,text,text,uuid,uuid,uuid)',
$a$IF p_source = 'inventory_receipt' AND p_kind <> 'payment' THEN$a$,
$b$IF p_source IN ('inventory_receipt', 'supplier_payment') AND p_kind <> 'payment' THEN$b$);

-- 3b) cash_book_void: phiếu chi trả nợ NCC huỷ ở trang Công nợ (huỷ lần trả huỷ luôn phiếu chi).
SELECT pg_temp.mevo_patch('public.cash_book_void(uuid,text)',
$a$  IF v_source = 'inventory_receipt' THEN$a$,
$b$  IF v_source = 'supplier_payment' THEN
    RAISE EXCEPTION 'Phiếu chi trả nợ nhà cung cấp, huỷ ở trang Công nợ';
  END IF;
  IF v_source = 'inventory_receipt' THEN$b$);

-- mevo-143:part-inventory

-- mevo-143:part-rpc

-- ============================================================
-- 9) Backfill NCC từ tên đã gõ trên phiếu nhập (gộp hoa thường + khoảng trắng; giữ cách viết của phiếu mới nhất).
-- ============================================================
INSERT INTO public.suppliers (store_id, name, created_by, created_at)
SELECT DISTINCT ON (d.store_id, lower(public.supplier_normalize_name(d.supplier_name)))
       d.store_id, left(public.supplier_normalize_name(d.supplier_name), 120), d.created_by, d.created_at
  FROM public.inventory_documents d
 WHERE d.kind = 'receipt' AND public.supplier_normalize_name(d.supplier_name) IS NOT NULL
 ORDER BY d.store_id, lower(public.supplier_normalize_name(d.supplier_name)), d.effective_at DESC, d.created_at DESC;

UPDATE public.inventory_documents d
   SET supplier_id = s.id
  FROM public.suppliers s
 WHERE d.kind = 'receipt' AND s.store_id = d.store_id
   AND lower(s.name) = lower(left(public.supplier_normalize_name(d.supplier_name), 120));

-- ============================================================
-- 10) Quyền hàm nội bộ
-- ============================================================
REVOKE ALL ON FUNCTION public.supplier_normalize_name(text) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
