-- 013 — Đơn mang về: "Đã nhận" + tự hoàn thành sau 30 phút
--
-- Thêm cột ready_at / completed_at vào orders (orthogonal với status, KHÔNG đụng enum).
-- - ready_at:     mốc bếp báo "xong" (để tính 30 phút).
-- - completed_at: mốc khách bấm "Đã nhận" HOẶC hệ thống tự hoàn thành sau 30 phút.
--
-- Phạm vi tính năng: CHỈ đơn mang về (pickup/delivery). Dine-in giữ nguyên.

-- ============================================================
-- 1) Cột mới
-- ============================================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ready_at     timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- ============================================================
-- 2) kitchen_set_status: set ready_at khi chuyển sang 'ready' (idempotent)
--    Giữ nguyên state-machine của 007a, chỉ thêm dòng set ready_at.
-- ============================================================
CREATE OR REPLACE FUNCTION kitchen_set_status(p_order_id uuid, p_status text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store uuid; v_current text;
BEGIN
  v_store := kitchen_store_id();                 -- từ JWT, fail-closed
  IF v_store IS NULL THEN RAISE EXCEPTION 'Token bếp không hợp lệ'; END IF;
  IF p_status NOT IN ('cooking','ready') THEN
    RAISE EXCEPTION 'Trạng thái không hợp lệ cho bếp: %', p_status;
  END IF;
  SELECT status INTO v_current FROM orders WHERE id = p_order_id AND store_id = v_store;
  IF NOT FOUND THEN RAISE EXCEPTION 'Đơn không thuộc quán'; END IF;
  -- Chỉ cho tiến theo state machine
  IF NOT ( (p_status='cooking' AND v_current IN ('confirmed','pending'))
        OR (p_status='ready'   AND v_current='cooking') ) THEN
    RAISE EXCEPTION 'Chuyển trạng thái không hợp lệ: % -> %', v_current, p_status;
  END IF;
  UPDATE orders
     SET status   = p_status,
         ready_at = CASE WHEN p_status = 'ready' AND ready_at IS NULL THEN now() ELSE ready_at END
   WHERE id = p_order_id AND store_id = v_store;
END $$;
REVOKE ALL ON FUNCTION kitchen_set_status(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION kitchen_set_status(uuid, text) TO kitchen;

-- ============================================================
-- 3) RPC get_takeaway_orders — lịch sử 30 ngày của khách (theo zalo_user_id + store)
--    Có bước "quét" tự hoàn thành đơn ready quá 30 phút (lazy-on-read) nên dùng plpgsql.
-- ============================================================
CREATE OR REPLACE FUNCTION get_takeaway_orders(
  p_zalo_user_id TEXT,
  p_store_id     UUID
)
RETURNS TABLE (
  id               UUID,
  store_id         UUID,
  status           TEXT,
  total_amount     INT,
  payment_method   TEXT,
  note             TEXT,
  order_type       TEXT,
  customer_name    TEXT,
  delivery_address TEXT,
  ready_at         TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Tự hoàn thành đơn mang về đã "ready" quá 30 phút mà khách chưa bấm "Đã nhận"
  UPDATE orders o
     SET completed_at = now()
   WHERE o.zalo_user_id = p_zalo_user_id
     AND o.store_id     = p_store_id
     AND o.order_type   IN ('pickup','delivery')
     AND o.status       = 'ready'
     AND o.completed_at IS NULL
     AND o.ready_at     IS NOT NULL
     AND o.ready_at     < now() - INTERVAL '30 minutes';

  RETURN QUERY
    SELECT
      o.id, o.store_id, o.status, o.total_amount, o.payment_method, o.note,
      o.order_type, o.customer_name, o.delivery_address,
      o.ready_at, o.completed_at, o.created_at, o.updated_at
    FROM orders o
    WHERE o.zalo_user_id = p_zalo_user_id
      AND o.store_id     = p_store_id
      AND o.order_type   IN ('pickup','delivery')
      AND o.created_at   > now() - INTERVAL '30 days'
      AND o.status       <> 'cancelled'
    ORDER BY o.created_at DESC;
END $$;

REVOKE ALL ON FUNCTION get_takeaway_orders(TEXT, UUID) FROM public;
GRANT EXECUTE ON FUNCTION get_takeaway_orders(TEXT, UUID) TO anon;

-- ============================================================
-- 4) RPC confirm_order_received — khách bấm "Đã nhận"
--    Guard bằng zalo_user_id (nhất quán với get_session_orders), không cần token.
-- ============================================================
CREATE OR REPLACE FUNCTION confirm_order_received(
  p_order_id     UUID,
  p_zalo_user_id TEXT
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE orders
     SET completed_at = now()
   WHERE id           = p_order_id
     AND zalo_user_id = p_zalo_user_id
     AND status       = 'ready'
     AND order_type   IN ('pickup','delivery')
     AND completed_at IS NULL;
END $$;

REVOKE ALL ON FUNCTION confirm_order_received(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION confirm_order_received(UUID, TEXT) TO anon;
