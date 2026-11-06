-- Mig 114: In hai nơi (Đợt 1 mục C) — trạm in, hàng đợi in, máy in phần mềm, chế độ in.
--
-- Chỉ TẠO đối tượng mới (bảng, hàm, trigger) và thêm cột; KHÔNG vá hàm sống nào
-- (không CREATE OR REPLACE đè RPC đang chạy) và không phụ thuộc mig 111-113, nên áp trước được.
-- Mọi hàm mới: REVOKE khỏi PUBLIC, anon, authenticated rồi mới GRANT đúng vai (bẫy default
-- privileges của Supabase, như mig 110). Bảng mới: bật RLS, thu hết quyền anon/authenticated;
-- chỉ đi qua RPC SECURITY DEFINER.

-- ===== 1. Cột cấu hình chế độ in =====
ALTER TABLE store_workflow_settings
  ADD COLUMN IF NOT EXISTS print_mode text NOT NULL DEFAULT 'browser';
ALTER TABLE store_workflow_settings
  DROP CONSTRAINT IF EXISTS store_workflow_settings_print_mode_check;
ALTER TABLE store_workflow_settings
  ADD CONSTRAINT store_workflow_settings_print_mode_check CHECK (print_mode IN ('browser', 'agent'));

-- ===== 2. Trạm in =====
CREATE TABLE IF NOT EXISTS print_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_pos boolean NOT NULL DEFAULT false,
  is_default_kitchen boolean NOT NULL DEFAULT false,
  printer_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, store_id)
);
-- Mỗi quán một trạm quầy và một trạm bếp mặc định
CREATE UNIQUE INDEX IF NOT EXISTS print_stations_one_pos ON print_stations (store_id) WHERE is_pos;
CREATE UNIQUE INDEX IF NOT EXISTS print_stations_one_default_kitchen ON print_stations (store_id) WHERE is_default_kitchen;
ALTER TABLE print_stations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE print_stations FROM PUBLIC, anon, authenticated;

-- Danh mục món gán trạm in. FK ghép (id, store_id) để không gán được trạm của quán khác;
-- xoá trạm chỉ đặt print_station_id về NULL, giữ nguyên store_id (NOT NULL của danh mục).
ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS print_station_id uuid;
ALTER TABLE menu_categories DROP CONSTRAINT IF EXISTS menu_categories_print_station_fk;
ALTER TABLE menu_categories
  ADD CONSTRAINT menu_categories_print_station_fk
  FOREIGN KEY (print_station_id, store_id) REFERENCES print_stations (id, store_id)
  ON DELETE SET NULL (print_station_id);

-- ===== 3. Hàng đợi in =====
CREATE TABLE IF NOT EXISTS print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  station_id uuid,
  kind text NOT NULL CHECK (kind IN ('kitchen_ticket', 'table_slip', 'bill', 'day_report', 'shift_report', 'test')),
  ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'printing', 'done', 'failed', 'expired')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  printed_at timestamptz,
  render_token_hash text,
  render_token_expires_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  UNIQUE (store_id, dedupe_key),
  FOREIGN KEY (station_id, store_id) REFERENCES print_stations (id, store_id)
    ON DELETE SET NULL (station_id)
);
CREATE INDEX IF NOT EXISTS print_jobs_store_status_created ON print_jobs (store_id, status, created_at);
ALTER TABLE print_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE print_jobs FROM PUBLIC, anon, authenticated;

-- ===== 4. Máy in phần mềm (agent) =====
-- Một dòng = một lần ghép. Chưa ghép xong thì token_hash NULL và có pair_code_hash.
-- DB chỉ giữ hash của token và của mã ghép.
CREATE TABLE IF NOT EXISTS print_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text UNIQUE,
  last_seen_at timestamptz,
  version text,
  printers jsonb NOT NULL DEFAULT '[]'::jsonb,
  pair_code_hash text,
  pair_expires_at timestamptz,
  pair_fail_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Mỗi quán chỉ một máy đang sống
CREATE UNIQUE INDEX IF NOT EXISTS print_agents_one_live ON print_agents (store_id) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS print_agents_pair_live ON print_agents (pair_code_hash) WHERE pair_code_hash IS NOT NULL;
ALTER TABLE print_agents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE print_agents FROM PUBLIC, anon, authenticated;

-- ===== 5. Khoá hai chiều print_mode <-> kitchen_release_policy =====
-- Chế độ phần mềm in chỉ in được khi đơn xuống bếp qua nút "Duyệt & in bếp" của thu ngân.
-- Đơn nhân viên 'automatic' cũng không qua nút đó nên mất phiếu y như đơn khách → kiểm cả hai.
CREATE OR REPLACE FUNCTION print_mode_policy_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.print_mode = 'agent'
     AND (NEW.kitchen_release_policy = 'automatic' OR NEW.staff_order_release_policy = 'automatic') THEN
    RAISE EXCEPTION 'Chế độ phần mềm in cần cả đơn khách và đơn nhân viên xuống bếp theo thu ngân xác nhận';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION print_mode_policy_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS print_mode_policy_guard ON store_workflow_settings;
CREATE TRIGGER print_mode_policy_guard
  BEFORE INSERT OR UPDATE ON store_workflow_settings
  FOR EACH ROW EXECUTE FUNCTION print_mode_policy_guard();

-- ===== 6. RPC cho chủ quán / thu ngân =====

-- Chế độ in của quán người gọi (mọi vai có store_id, kể cả nhân viên). Không có quán → 'browser'.
CREATE OR REPLACE FUNCTION get_print_mode() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT s.print_mode
       FROM mevo_operators o
       JOIN store_workflow_settings s ON s.store_id = o.store_id
      WHERE o.user_id = auth.uid() AND o.is_active AND o.store_id IS NOT NULL
      LIMIT 1),
    'browser')
$$;
REVOKE ALL ON FUNCTION get_print_mode() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_print_mode() TO authenticated;

CREATE OR REPLACE FUNCTION set_print_mode(p_store_id uuid, p_mode text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_created boolean := false;
BEGIN
  IF NOT is_store_owner_of(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('browser', 'agent') THEN
    RAISE EXCEPTION 'Chế độ in không hợp lệ';
  END IF;

  -- Trigger print_mode_policy_guard chặn ở đây nếu policy còn 'automatic'
  -- UPDATE trước: INSERT ... ON CONFLICT chạy trigger BEFORE INSERT với giá trị mặc định
  -- (policy 'automatic') của dòng đề xuất trước khi phát hiện trùng, nên sẽ bị chặn nhầm.
  UPDATE store_workflow_settings
     SET print_mode = p_mode, updated_at = now(), updated_by = auth.uid()
   WHERE store_id = p_store_id;
  IF NOT FOUND THEN
    INSERT INTO store_workflow_settings (store_id, print_mode, updated_at, updated_by)
    VALUES (p_store_id, p_mode, now(), auth.uid())
    ON CONFLICT (store_id) DO UPDATE
      SET print_mode = EXCLUDED.print_mode, updated_at = now(), updated_by = auth.uid();
  END IF;

  -- Bật agent mà chưa có trạm nào: tạo sẵn Quầy + Bếp
  IF p_mode = 'agent' AND NOT EXISTS (SELECT 1 FROM print_stations WHERE store_id = p_store_id) THEN
    INSERT INTO print_stations (store_id, name, is_pos) VALUES (p_store_id, 'Quầy', true);
    INSERT INTO print_stations (store_id, name, is_default_kitchen) VALUES (p_store_id, 'Bếp', true);
    v_created := true;
  END IF;

  RETURN jsonb_build_object('mode', p_mode, 'stations_created', v_created);
END $$;
REVOKE ALL ON FUNCTION set_print_mode(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_print_mode(uuid, text) TO authenticated;

-- Cấu hình in cho trang cài đặt. KHÔNG bao giờ trả cột hash.
CREATE OR REPLACE FUNCTION get_print_settings(p_store_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mode text;
  v_kitchen text;
  v_staff text;
  v_stations jsonb;
  v_agent jsonb;
BEGIN
  IF NOT is_store_pos_operator(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;

  SELECT print_mode, kitchen_release_policy, staff_order_release_policy
    INTO v_mode, v_kitchen, v_staff
    FROM store_workflow_settings WHERE store_id = p_store_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', id, 'name', name, 'is_pos', is_pos,
           'is_default_kitchen', is_default_kitchen, 'printer_name', printer_name)
           ORDER BY is_pos DESC, is_default_kitchen DESC, created_at, id), '[]'::jsonb)
    INTO v_stations FROM print_stations WHERE store_id = p_store_id;

  SELECT jsonb_build_object(
           'id', a.id, 'name', a.name, 'version', a.version, 'last_seen_at', a.last_seen_at,
           'online', COALESCE(a.last_seen_at > now() - interval '30 seconds', false),
           'printers', a.printers)
    INTO v_agent
    FROM print_agents a WHERE a.store_id = p_store_id AND a.token_hash IS NOT NULL;

  RETURN jsonb_build_object(
    'mode', COALESCE(v_mode, 'browser'),
    'stations', v_stations,
    'agent', v_agent,
    'kitchen_release_policy', COALESCE(v_kitchen, 'automatic'),
    'staff_order_release_policy', COALESCE(v_staff, 'automatic'));
END $$;
REVOKE ALL ON FUNCTION get_print_settings(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_print_settings(uuid) TO authenticated;

-- Mã ghép 6 số, hạn 10 phút. Sinh từ gen_random_uuid() (không dùng random()).
-- Mã đang sống của mọi quán phải khác nhau vì phần mềm ghép chỉ gửi mã, không gửi quán.
CREATE OR REPLACE FUNCTION create_print_pair_code(p_store_id uuid, p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text;
  v_hash text;
  v_expires timestamptz := now() + interval '10 minutes';
  v_try integer := 0;
BEGIN
  IF NOT is_store_owner_of(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Cần đặt tên cho máy in phần mềm';
  END IF;

  -- Mã chờ cũ của quán không còn dùng được
  DELETE FROM print_agents
   WHERE store_id = p_store_id AND token_hash IS NULL;

  LOOP
    v_try := v_try + 1;
    v_code := lpad(
      ((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 1000000)::text,
      6, '0');
    v_hash := encode(sha256(convert_to(v_code, 'UTF8')), 'hex');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM print_agents
       WHERE pair_code_hash = v_hash AND pair_expires_at > now() AND token_hash IS NULL);
    IF v_try >= 50 THEN
      RAISE EXCEPTION 'Không sinh được mã ghép, thử lại';
    END IF;
  END LOOP;

  INSERT INTO print_agents (store_id, name, pair_code_hash, pair_expires_at, created_by)
  VALUES (p_store_id, btrim(p_name), v_hash, v_expires, auth.uid());

  RETURN jsonb_build_object('code', v_code, 'expires_at', v_expires);
END $$;
REVOKE ALL ON FUNCTION create_print_pair_code(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_print_pair_code(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION revoke_print_agent(p_agent_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_store uuid;
BEGIN
  SELECT store_id INTO v_store FROM print_agents WHERE id = p_agent_id;
  IF v_store IS NULL OR NOT is_store_owner_of(v_store) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;
  UPDATE print_agents SET token_hash = NULL, pair_code_hash = NULL WHERE id = p_agent_id;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION revoke_print_agent(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION revoke_print_agent(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
