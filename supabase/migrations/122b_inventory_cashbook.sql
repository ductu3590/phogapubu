-- ============================================================
-- Mig 122b — Nối phiếu nhập kho (mig 118) ↔ sổ thu chi (mig 122).
-- Plan: docs/superpowers/plans/2026-11-09-yg-ca-so-thu-chi.md (Task 11). Spec: 2026-11-09-yg-so-thu-chi-design.md,
-- 2026-11-09-yg-kho-design.md §4, §6, §7.
--
--   • Phiếu nhập "đã trả" (tiền mặt hoặc chuyển khoản, tổng > 0) tự sinh MỘT phiếu chi danh mục hệ thống "Nhập hàng",
--     nguồn 'inventory_receipt', source_ref = id phiếu nhập, TRONG CÙNG giao dịch của inventory_post_document.
--     Tiền mặt + quán bật ca: bắt buộc có ca mở (cash_book_create_internal) — không có ca thì "Chưa mở ca" và
--     KHÔNG lưu phiếu nhập nào (cả giao dịch huỷ).
--   • Huỷ phiếu nhập (inventory_void_document) huỷ luôn phiếu chi đi kèm trong cùng giao dịch. Phiếu chi tiền mặt mà ca
--     đã kết → "Ca của phiếu này đã kết, không huỷ được", phiếu nhập giữ nguyên 'posted'. Phiếu chi nguồn kho không huỷ
--     thẳng ở sổ được (cash_book_void, mig 122).
--   • Vá tại chỗ hai RPC kho ở hai dòng neo mig 118 đặt sẵn (mỗi neo một dòng, khớp ĐÚNG MỘT lần, nhãn 'mig 122b'),
--     và inventory_document_json trả thêm cash_book_entry_id (hộp huỷ phiếu ở trang Kho đọc trường này).
--   • FK inventory_documents.cash_book_entry_id → cash_book_entries(id).
--   • Backfill phiếu nhập đã trả có từ trước (theo doc_date, không gắn ca), chạy lại không nhân đôi.
--
-- ⚠️ Cần 118 + 122 đã áp. Bọc một transaction: $pre$ dừng là không có gì đổi. Không chạy lại cả file: CREATE FUNCTION /
--    ADD CONSTRAINT không lặp được (đoạn backfill thì lặp được).
-- ⚠️ Phiếu nhập trên 2.000.000.000đ không sinh phiếu chi được (trần phiếu sổ thu chi) → lưu phiếu nhập "đã trả" lỗi; backfill
--    bỏ qua và báo số phiếu bỏ qua.
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
    'public.cash_book_create_internal(uuid,text,text,uuid,bigint,text,text,text,uuid,uuid,uuid)',
    'public.cash_book_void_internal(uuid,text,uuid)',
    'public.cash_book_system_category(uuid,text)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'mig 122b: thiếu hàm % (cần mig 118 + 122)', v_sig;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'inventory_documents' AND column_name = 'paid_method') THEN
    RAISE EXCEPTION 'mig 122b: thiếu cột inventory_documents.paid_method (mig 118)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'inventory_documents' AND column_name = 'cash_book_entry_id') THEN
    RAISE EXCEPTION 'mig 122b: thiếu cột inventory_documents.cash_book_entry_id (mig 118)';
  END IF;
END
$pre$;

-- ============================================================
-- 1) Hàm nội bộ
-- ============================================================

-- Phiếu chi của một phiếu nhập. Không phải phiếu nhập / không 'posted' / chưa trả / tổng 0đ / đã có phiếu chi → trả
-- cash_book_entry_id hiện có (có thể NULL), không làm gì. client_request_id = id phiếu nhập nên gọi lại không nhân đôi.
-- Người ghi phiếu chi = người ghi phiếu nhập. Lỗi (Chưa mở ca, số tiền vượt trần…) để nguyên → huỷ cả giao dịch.
CREATE FUNCTION public.inventory_receipt_cash_book(p_doc_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_doc public.inventory_documents%ROWTYPE;
  v_entry uuid;
BEGIN
  SELECT * INTO v_doc FROM public.inventory_documents d WHERE d.id = p_doc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mig 122b: không tìm thấy phiếu kho %', p_doc_id;
  END IF;
  IF v_doc.kind <> 'receipt' OR v_doc.status <> 'posted' OR v_doc.paid_status IS DISTINCT FROM 'paid'
     OR v_doc.total_amount <= 0 OR v_doc.cash_book_entry_id IS NOT NULL THEN
    RETURN v_doc.cash_book_entry_id;
  END IF;

  v_entry := public.cash_book_create_internal(
    v_doc.store_id, 'payment', v_doc.paid_method,
    public.cash_book_system_category(v_doc.store_id, 'inventory_purchase'),
    v_doc.total_amount, 'Phiếu nhập ' || v_doc.doc_no, v_doc.supplier_name,
    'inventory_receipt', p_doc_id, v_doc.created_by, p_doc_id);

  UPDATE public.inventory_documents SET cash_book_entry_id = v_entry WHERE id = p_doc_id;
  RETURN v_entry;
END;
$$;

-- Huỷ phiếu chi đi kèm phiếu nhập (nếu có). Lý do = "Huỷ phiếu nhập <số>: <lý do>" (cắt 500 ký tự — trần lý do huỷ).
-- Lỗi của cash_book_void_internal (ca đã kết…) để nguyên → huỷ cả giao dịch, phiếu nhập giữ 'posted'.
CREATE FUNCTION public.inventory_receipt_cash_book_void(p_doc_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_entry uuid;
  v_doc_no text;
BEGIN
  SELECT d.cash_book_entry_id, d.doc_no INTO v_entry, v_doc_no FROM public.inventory_documents d WHERE d.id = p_doc_id;
  IF v_entry IS NULL THEN
    RETURN;
  END IF;
  PERFORM public.cash_book_void_internal(
    v_entry, left('Huỷ phiếu nhập ' || v_doc_no || ': ' || btrim(coalesce(p_reason, '')), 500), auth.uid());
END;
$$;

-- ============================================================
-- 2) Vá tại chỗ hai RPC kho ở dòng neo mig 118. Mẫu mig 110/111: neo khớp ĐÚNG MỘT lần, CRLF → LF.
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
    RAISE EXCEPTION 'mig 122b: % không còn chuỗi cần vá: %', p_sig, v_from;
  END IF;
  IF v_hits > 1 THEN
    RAISE EXCEPTION 'mig 122b: % có hơn một chỗ khớp chuỗi cần vá: %', p_sig, v_from;
  END IF;
  EXECUTE replace(v_def, v_from, v_to);
END
$patch$;

-- Sau khi đã chèn phiếu + mọi dòng, sau nhánh gửi lại cùng mã (nhánh đó RETURN sớm, không tới đây).
SELECT pg_temp.mevo_patch('public.inventory_post_document(text,jsonb,jsonb,uuid)',
$a$  -- mevo-anchor:122b inventory_post_document.cash_book(v_doc_id)$a$,
$b$  -- mevo-anchor:122b inventory_post_document.cash_book(v_doc_id)
  PERFORM public.inventory_receipt_cash_book(v_doc_id);$b$);

-- Sau kiểm quyền, sau nhánh "phiếu đã huỷ → already", sau UPDATE status = 'voided', trước RETURN cuối.
SELECT pg_temp.mevo_patch('public.inventory_void_document(uuid,text)',
$a$  -- mevo-anchor:122b inventory_void_document.cash_book(v_doc_id)$a$,
$b$  -- mevo-anchor:122b inventory_void_document.cash_book(v_doc_id)
  PERFORM public.inventory_receipt_cash_book_void(v_doc_id, p_reason);$b$);

-- JSON phiếu kho (danh sách + chi tiết) trả thêm cash_book_entry_id: hộp "Huỷ phiếu nhập" ở trang Kho báo "Phiếu chi tương
-- ứng trong sổ thu chi sẽ huỷ cùng" (admin-web đọc trường này từ mig 118 nhưng 118 chưa trả).
SELECT pg_temp.mevo_patch('public.inventory_document_json(uuid)',
$a$'voided_at', d.voided_at, 'void_reason', d.void_reason)$a$,
$b$'voided_at', d.voided_at, 'void_reason', d.void_reason, 'cash_book_entry_id', d.cash_book_entry_id)$b$);

-- ============================================================
-- 3) FK phiếu nhập → phiếu chi
-- ============================================================
ALTER TABLE public.inventory_documents ADD CONSTRAINT inventory_documents_cash_book_entry_fkey
  FOREIGN KEY (cash_book_entry_id) REFERENCES public.cash_book_entries(id);

-- ============================================================
-- 4) Backfill phiếu nhập đã trả có từ trước 122b. Không gọi cash_book_create_internal: hàm đó gắn ngày kinh doanh HÔM NAY
--    và đòi ca mở. Ngày = doc_date của phiếu nhập, không gắn ca, người + giờ ghi = của phiếu nhập. Chạy lại không nhân đôi
--    (client_request_id = id phiếu nhập, ON CONFLICT DO NOTHING; chỉ nối phiếu chưa có cash_book_entry_id).
-- ============================================================
-- backfill-start
DO $backfill$
DECLARE
  v_inserted int;
  v_linked int;
  v_skipped int;
BEGIN
  INSERT INTO public.cash_book_entries (
    store_id, kind, method, category_id, amount, note, counterparty, business_date, cash_shift_id,
    source, source_ref, client_request_id, created_by, created_at)
  SELECT d.store_id, 'payment', d.paid_method, c.id, d.total_amount, 'Phiếu nhập ' || d.doc_no,
         nullif(btrim(d.supplier_name), ''), d.doc_date, NULL,
         'inventory_receipt', d.id, d.id, d.created_by, d.created_at
    FROM public.inventory_documents d
    JOIN public.cash_book_categories c
      ON c.store_id = d.store_id AND c.is_system AND c.report_group = 'inventory_purchase'
   WHERE d.kind = 'receipt' AND d.status = 'posted' AND d.paid_status = 'paid'
     AND d.total_amount BETWEEN 1 AND 2000000000 AND d.cash_book_entry_id IS NULL
  ON CONFLICT (store_id, client_request_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE public.inventory_documents d
     SET cash_book_entry_id = e.id
    FROM public.cash_book_entries e
   WHERE e.source = 'inventory_receipt' AND e.source_ref = d.id AND e.store_id = d.store_id
     AND e.voided_at IS NULL AND d.cash_book_entry_id IS NULL;
  GET DIAGNOSTICS v_linked = ROW_COUNT;

  SELECT count(*) INTO v_skipped
    FROM public.inventory_documents d
   WHERE d.kind = 'receipt' AND d.status = 'posted' AND d.paid_status = 'paid' AND d.total_amount > 2000000000
     AND d.cash_book_entry_id IS NULL;

  RAISE NOTICE 'mig 122b: backfill % phiếu chi (nối % phiếu nhập, bỏ qua % phiếu vượt trần)', v_inserted, v_linked, v_skipped;
END
$backfill$;
-- backfill-end

-- ============================================================
-- 5) Quyền hàm nội bộ. REVOKE FROM PUBLIC một mình không gỡ quyền Supabase cấp thẳng cho anon/authenticated.
-- ============================================================
REVOKE ALL ON FUNCTION public.inventory_receipt_cash_book(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inventory_receipt_cash_book_void(uuid, text) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
