-- 014 — Cashless-first: quán mới mặc định tắt tiền mặt + doanh thu = tiền THẬT đã nhận
--
-- Quyết định 2026-06-28: MEVO hướng ZaloPay-only. Bắt trả trước chống chơi xấu QR.
-- Độc lập với migration 013 (không phụ thuộc ready_at/completed_at).

-- ============================================================
-- 1) Quán MỚI mặc định chỉ ZaloPay (quán cũ giữ nguyên dữ liệu hiện có)
-- ============================================================
ALTER TABLE stores ALTER COLUMN payment_methods SET DEFAULT ARRAY['zalopay'];

-- ============================================================
-- 2) Doanh thu = tổng tiền THẬT đã nhận, không chỉ status='paid'
--    - ZaloPay: đã có zalopay_trans_id (notify thành công) và chưa huỷ
--    - Tiền mặt: nhân viên đã xác nhận thu (status='paid')
--    Hai vế loại trừ nhau theo payment_method → không tính trùng.
-- ============================================================
CREATE OR REPLACE FUNCTION get_daily_revenue(
  p_store_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  total_revenue BIGINT,
  total_orders BIGINT,
  paid_orders BIGINT,
  cash_pending BIGINT
) LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE(SUM(total_amount) FILTER (
      WHERE (payment_method = 'zalopay' AND zalopay_trans_id IS NOT NULL AND status <> 'cancelled')
         OR (payment_method = 'cash'    AND status = 'paid')
    ), 0) AS total_revenue,
    COUNT(*) AS total_orders,
    COUNT(*) FILTER (
      WHERE (payment_method = 'zalopay' AND zalopay_trans_id IS NOT NULL AND status <> 'cancelled')
         OR (payment_method = 'cash'    AND status = 'paid')
    ) AS paid_orders,
    COUNT(*) FILTER (WHERE payment_method = 'cash' AND status NOT IN ('paid','cancelled')) AS cash_pending
  FROM orders
  WHERE store_id = p_store_id
    AND created_at >= p_date::TIMESTAMPTZ
    AND created_at < (p_date + INTERVAL '1 day')::TIMESTAMPTZ;
$$;
