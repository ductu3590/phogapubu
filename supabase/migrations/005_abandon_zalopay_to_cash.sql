-- 005 — Chuyển đơn ZaloPay bỏ dở sang tiền mặt (có guard chống đụng đơn đã trả).
-- Gọi khi khách huỷ/đóng sheet ZaloPay và xác nhận muốn trả tiền mặt.
CREATE OR REPLACE FUNCTION abandon_zalopay_to_cash(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
BEGIN
  UPDATE orders
     SET payment_method = 'cash'
   WHERE id = p_order_id
     AND status = 'pending'
     AND payment_method = 'zalopay'
     AND zalopay_trans_id IS NULL   -- chốt an toàn: KHÔNG đụng đơn đã trả thành công
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RETURN NULL;  -- no-op: đơn không đủ điều kiện (đã trả/đã xử lý)
  END IF;

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION abandon_zalopay_to_cash(uuid) FROM public;
GRANT EXECUTE ON FUNCTION abandon_zalopay_to_cash(uuid) TO anon;
