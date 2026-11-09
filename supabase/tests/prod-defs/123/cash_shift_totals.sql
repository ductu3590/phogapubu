-- Chụp từ nhánh tích hợp sau mig 122 (PGlite: 112a + 112b + 122 trên bản chụp prod-defs/112). Controller PHẢI đối chiếu pg_get_functiondef trên prod trước khi áp mig 123.
CREATE OR REPLACE FUNCTION public.cash_shift_totals(p_shift_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
