-- ============================================================
-- Mig 146 — Nối bù NCC cho phiếu nhập lưu trong khe giữa lúc áp 143 và 144.
-- Review cuối nhánh công nợ NCC: backfill nằm ở 143, nhưng inventory_post_document chỉ bắt đầu ghi supplier_id từ 144 →
-- phiếu lưu trong khe có supplier_name mà supplier_id NULL, phiếu Chưa trả như vậy không bao giờ trả được ở Công nợ.
-- Lặp lại đúng backfill của 143 (tạo NCC còn thiếu, nối phiếu chưa nối). Chạy lại được, không đổi phiếu đã có NCC.
-- ⚠️ Cần 143 (+ 144, 145) đã áp.
-- ============================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regclass('public.suppliers') IS NULL OR to_regprocedure('public.supplier_normalize_name(text)') IS NULL THEN
    RAISE EXCEPTION 'mig 146: thiếu bảng suppliers / supplier_normalize_name (cần mig 143)';
  END IF;
END
$pre$;

INSERT INTO public.suppliers (store_id, name, created_by, created_at)
SELECT DISTINCT ON (d.store_id, lower(left(public.supplier_normalize_name(d.supplier_name), 120)))
       d.store_id, left(public.supplier_normalize_name(d.supplier_name), 120), d.created_by, d.created_at
  FROM public.inventory_documents d
 WHERE d.kind = 'receipt' AND d.supplier_id IS NULL AND public.supplier_normalize_name(d.supplier_name) IS NOT NULL
 ORDER BY d.store_id, lower(left(public.supplier_normalize_name(d.supplier_name), 120)), d.effective_at DESC, d.created_at DESC
ON CONFLICT (store_id, lower(name)) DO NOTHING;

UPDATE public.inventory_documents d
   SET supplier_id = s.id
  FROM public.suppliers s
 WHERE d.kind = 'receipt' AND d.supplier_id IS NULL AND s.store_id = d.store_id
   AND lower(s.name) = lower(left(public.supplier_normalize_name(d.supplier_name), 120));

COMMIT;
