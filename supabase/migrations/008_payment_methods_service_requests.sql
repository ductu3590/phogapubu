-- 008 — payment_methods per store + service_requests + get_session_orders RPC

-- 1. Thêm payment_methods vào stores
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS payment_methods TEXT[]
    NOT NULL DEFAULT ARRAY['zalopay','cash'];

ALTER TABLE stores
  ADD CONSTRAINT stores_payment_methods_valid
    CHECK (
      array_length(payment_methods, 1) >= 1
      AND payment_methods <@ ARRAY['zalopay','cash']
    );

-- 2. Tạo bảng service_requests
CREATE TABLE IF NOT EXISTS service_requests (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  table_id     UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'payment'
                 CHECK (type IN ('payment','help')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_service_requests" ON service_requests
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "auth_select_service_requests" ON service_requests
  FOR SELECT TO authenticated USING (true);

-- 3. RPC get_session_orders — anon lấy đơn của mình trong phiên (6 tiếng)
CREATE OR REPLACE FUNCTION get_session_orders(
  p_zalo_user_id TEXT,
  p_table_id     UUID
)
RETURNS TABLE (
  id             UUID,
  store_id       UUID,
  table_id       UUID,
  status         TEXT,
  total_amount   INT,
  payment_method TEXT,
  note           TEXT,
  created_at     TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id, o.store_id, o.table_id, o.status,
    o.total_amount, o.payment_method, o.note,
    o.created_at, o.updated_at
  FROM orders o
  WHERE o.zalo_user_id = p_zalo_user_id
    AND o.table_id     = p_table_id
    AND o.created_at   > NOW() - INTERVAL '6 hours'
    AND o.status NOT IN ('cancelled')
  ORDER BY o.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_session_orders TO anon;
