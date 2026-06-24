-- 006 — Plan 2 / Task 2a (phần 1): Bảng allowlist operator.
-- CHƯA siết RLS admin ở file này — để còn cửa sổ seed tài khoản trước,
-- tránh tự khoá mình ra ngoài. Việc siết RLS nằm ở 006b (apply SAU khi seed).
--
-- Nguồn sự thật: chỉ user có trong mevo_operators mới được coi là operator của MEVO.
-- store_id = NULL  → super (thấy mọi quán); v1 các tài khoản MEVO để NULL.

CREATE TABLE IF NOT EXISTS mevo_operators (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id   uuid REFERENCES stores(id) ON DELETE CASCADE,   -- NULL = super
  created_at timestamptz DEFAULT now()
);

ALTER TABLE mevo_operators ENABLE ROW LEVEL SECURITY;

-- App (role authenticated) chỉ đọc được dòng của CHÍNH mình — đủ để biết có phải operator
-- và store_id của mình. Ghi vào bảng này chỉ qua service_role (bỏ qua RLS).
DROP POLICY IF EXISTS "operator_read_self" ON mevo_operators;
CREATE POLICY "operator_read_self" ON mevo_operators
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Helper: user hiện tại có phải operator không.
-- SECURITY DEFINER để đọc mevo_operators bỏ qua RLS (tránh đệ quy policy).
CREATE OR REPLACE FUNCTION is_operator() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM mevo_operators WHERE user_id = auth.uid());
$$;
