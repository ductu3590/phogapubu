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

-- ===== 7. RPC của phần mềm in (gọi bằng khoá công khai + token thiết bị) =====
-- Hash dùng chung: encode(sha256(convert_to(x,'UTF8')),'hex') — có sẵn, không cần pgcrypto.

-- Hết hạn kiểu lười (prod không có pg_cron): gọi ở đầu poll và get_print_status. Nội bộ, không GRANT ai.
--  * queued quá 30 phút        -> expired (không in muộn một phiếu đã lỗi thời)
--  * printing quá 2 phút       -> failed, KHÔNG về queued: phần mềm có thể đã in rồi mà chưa kịp báo,
--                                 tự in lại sẽ ra hai phiếu; để người bấm "In lại" quyết định.
CREATE OR REPLACE FUNCTION expire_print_jobs(p_store_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE print_jobs SET status = 'expired'
   WHERE store_id = p_store_id AND status = 'queued' AND created_at < now() - interval '30 minutes';
  UPDATE print_jobs SET status = 'failed',
         error = 'Không rõ đã in chưa, kiểm tra máy in rồi bấm In lại'
   WHERE store_id = p_store_id AND status = 'printing' AND claimed_at < now() - interval '2 minutes';
$$;
REVOKE ALL ON FUNCTION expire_print_jobs(uuid) FROM PUBLIC, anon, authenticated;

-- Ghép máy: lỗi trả {ok:false}, KHÔNG RAISE (RAISE sẽ huỷ luôn bộ đếm sai mã).
-- Sai mã thì cộng bộ đếm cho MỌI mã đang sống của mọi quán (lần đoán sai không biết nhắm mã nào);
-- mã nào chạm 20 thì huỷ → không dò nổi 1 triệu tổ hợp bằng khoá công khai.
CREATE OR REPLACE FUNCTION print_agent_pair(p_code text, p_name text, p_version text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hash text;
  a print_agents%ROWTYPE;
  v_token text;
  v_store_name text;
BEGIN
  v_hash := encode(sha256(convert_to(btrim(COALESCE(p_code, '')), 'UTF8')), 'hex');

  SELECT * INTO a FROM print_agents
   WHERE pair_code_hash = v_hash AND pair_expires_at > now() AND token_hash IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE print_agents SET pair_fail_count = pair_fail_count + 1
     WHERE pair_code_hash IS NOT NULL AND pair_expires_at > now() AND token_hash IS NULL;
    UPDATE print_agents SET pair_code_hash = NULL, pair_expires_at = NULL
     WHERE pair_code_hash IS NOT NULL AND token_hash IS NULL AND pair_fail_count >= 20;
    RETURN jsonb_build_object('ok', false, 'error', 'Mã không đúng hoặc đã hết hạn');
  END IF;

  -- Máy cũ cùng quán mất quyền ngay
  UPDATE print_agents SET token_hash = NULL WHERE store_id = a.store_id AND token_hash IS NOT NULL;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  UPDATE print_agents
     SET token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
         pair_code_hash = NULL, pair_expires_at = NULL, pair_fail_count = 0,
         version = p_version, last_seen_at = now(),
         name = COALESCE(NULLIF(btrim(p_name), ''), name)
   WHERE id = a.id;

  SELECT name INTO v_store_name FROM stores WHERE id = a.store_id;
  RETURN jsonb_build_object('ok', true, 'agent_id', a.id, 'token', v_token, 'store_name', v_store_name);
END $$;
REVOKE ALL ON FUNCTION print_agent_pair(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION print_agent_pair(text, text, text) TO anon;

-- Nhận việc. Thứ tự: tra token -> hết hạn -> cập nhật last_seen -> khoá job queued cũ nhất -> giao.
CREATE OR REPLACE FUNCTION print_agent_poll(p_token text, p_version text, p_printers jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a print_agents%ROWTYPE;
  j print_jobs%ROWTYPE;
  v_printer text;
  v_station uuid;
  v_render text;
  v_attempts integer;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revoked');
  END IF;
  SELECT * INTO a FROM print_agents
   WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revoked');
  END IF;

  PERFORM expire_print_jobs(a.store_id);

  -- Chỉ ghi khi cũ hơn 10 giây (đỡ ghi mỗi 2 giây; ngưỡng online 30 giây vẫn đúng)
  UPDATE print_agents
     SET last_seen_at = CASE WHEN last_seen_at IS NULL OR last_seen_at < now() - interval '10 seconds'
                             THEN now() ELSE last_seen_at END,
         version = COALESCE(p_version, version),
         printers = COALESCE(p_printers, printers)
   WHERE id = a.id
     AND (last_seen_at IS NULL OR last_seen_at < now() - interval '10 seconds'
          OR version IS DISTINCT FROM COALESCE(p_version, version)
          OR printers IS DISTINCT FROM COALESCE(p_printers, printers));

  LOOP
    SELECT * INTO j FROM print_jobs
     WHERE store_id = a.store_id AND status = 'queued'
     ORDER BY created_at, id
     LIMIT 1
     FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', true, 'job', NULL);
    END IF;

    -- Trạm đã bị xoá (FK đặt station_id về NULL) thì tra trạm thay thế của ĐÚNG quán:
    -- phiếu bếp về trạm bếp mặc định, loại khác về Quầy; rồi ghi lại station_id cho job.
    v_station := j.station_id;
    IF v_station IS NULL THEN
      SELECT id INTO v_station FROM print_stations
       WHERE store_id = j.store_id
         AND CASE WHEN j.kind = 'kitchen_ticket' THEN is_default_kitchen ELSE is_pos END
       LIMIT 1;
      IF v_station IS NOT NULL THEN
        UPDATE print_jobs SET station_id = v_station WHERE id = j.id;
      END IF;
    END IF;

    v_printer := NULL;
    IF v_station IS NOT NULL THEN
      SELECT printer_name INTO v_printer FROM print_stations
       WHERE id = v_station AND store_id = j.store_id;
    END IF;

    IF v_printer IS NULL OR btrim(v_printer) = '' THEN
      UPDATE print_jobs SET status = 'failed', error = 'Trạm chưa chọn máy in' WHERE id = j.id;
      CONTINUE;
    END IF;

    v_render := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    UPDATE print_jobs
       SET status = 'printing', attempts = attempts + 1, claimed_at = now(),
           render_token_hash = encode(sha256(convert_to(v_render, 'UTF8')), 'hex'),
           render_token_expires_at = now() + interval '2 minutes'
     WHERE id = j.id
    RETURNING attempts INTO v_attempts;

    RETURN jsonb_build_object('ok', true, 'job', jsonb_build_object(
      'id', j.id, 'kind', j.kind, 'printer_name', v_printer,
      'render_token', v_render, 'attempts', v_attempts));
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION print_agent_poll(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION print_agent_poll(text, text, jsonb) TO anon;

-- Báo kết quả. Chỉ nhận job đang printing của đúng quán.
CREATE OR REPLACE FUNCTION print_agent_report(
  p_token text, p_job_id uuid, p_ok boolean, p_error text, p_retryable boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a print_agents%ROWTYPE;
  j print_jobs%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revoked');
  END IF;
  SELECT * INTO a FROM print_agents
   WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revoked');
  END IF;

  -- Báo kết quả cũng là dấu hiệu máy còn sống (cùng ngưỡng 10 giây như poll): một job kẹt chặn tick poll
  -- 20-65 giây sẽ làm POS báo sai "Máy in chưa kết nối".
  UPDATE print_agents SET last_seen_at = now()
   WHERE id = a.id AND (last_seen_at IS NULL OR last_seen_at < now() - interval '10 seconds');

  SELECT * INTO j FROM print_jobs
   WHERE id = p_job_id AND store_id = a.store_id AND status = 'printing'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_printing');
  END IF;

  IF p_ok THEN
    UPDATE print_jobs SET status = 'done', printed_at = now(), error = NULL,
           render_token_hash = NULL, render_token_expires_at = NULL
     WHERE id = j.id;
  ELSIF COALESCE(p_retryable, false) AND j.attempts < 3 THEN
    UPDATE print_jobs SET status = 'queued', error = p_error, claimed_at = NULL,
           render_token_hash = NULL, render_token_expires_at = NULL
     WHERE id = j.id;
  ELSE
    UPDATE print_jobs SET status = 'failed', error = COALESCE(p_error, 'Lỗi không rõ'),
           render_token_hash = NULL, render_token_expires_at = NULL
     WHERE id = j.id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION print_agent_report(text, uuid, boolean, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION print_agent_report(text, uuid, boolean, text, boolean) TO anon;

-- Trang /print/agent đọc job bằng token trang in: đúng job, còn hạn, đang printing. Chỉ service_role.
CREATE OR REPLACE FUNCTION print_job_for_render(p_job_id uuid, p_render_token text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
           'id', j.id, 'store_id', j.store_id, 'kind', j.kind, 'ref', j.ref,
           'created_by', j.created_by, 'station_name', s.name)
    FROM print_jobs j
    LEFT JOIN print_stations s ON s.id = j.station_id AND s.store_id = j.store_id
   WHERE j.id = p_job_id
     AND p_render_token IS NOT NULL
     AND j.status = 'printing'
     AND j.render_token_hash = encode(sha256(convert_to(p_render_token, 'UTF8')), 'hex')
     AND j.render_token_expires_at > now()
$$;
REVOKE ALL ON FUNCTION print_job_for_render(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION print_job_for_render(uuid, text) TO service_role;

-- ===== 8. RPC trạng thái in cho POS =====
CREATE OR REPLACE FUNCTION get_print_status(p_store_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mode text;
  v_seen timestamptz;
  v_queued integer;
  v_problems jsonb;
BEGIN
  IF NOT is_store_pos_operator(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;
  PERFORM expire_print_jobs(p_store_id);

  SELECT print_mode INTO v_mode FROM store_workflow_settings WHERE store_id = p_store_id;
  SELECT last_seen_at INTO v_seen FROM print_agents
   WHERE store_id = p_store_id AND token_hash IS NOT NULL;
  SELECT count(*)::int INTO v_queued FROM print_jobs WHERE store_id = p_store_id AND status = 'queued';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', id, 'kind', kind, 'status', status, 'error', error, 'created_at', created_at,
           -- ref của mọi job có sẵn label + request (PrintRequest) do lớp enqueue ghi.
           -- label thiếu thì rơi về nhãn theo kind; request có thể null (vd. job in thử).
           'label', COALESCE(NULLIF(ref->>'label', ''), CASE kind
                      WHEN 'kitchen_ticket' THEN 'Phiếu bếp'
                      WHEN 'table_slip' THEN 'Phiếu bàn'
                      WHEN 'bill' THEN 'Hoá đơn'
                      WHEN 'day_report' THEN 'Báo cáo ngày'
                      WHEN 'shift_report' THEN 'Báo cáo ca'
                      ELSE 'In thử' END),
           'request', ref->'request')
           ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_problems
    FROM (SELECT * FROM print_jobs
           WHERE store_id = p_store_id AND status IN ('failed', 'expired') AND resolved_at IS NULL
           ORDER BY created_at DESC LIMIT 50) pj;

  RETURN jsonb_build_object(
    'mode', COALESCE(v_mode, 'browser'),
    'agent_online', COALESCE(v_seen > now() - interval '30 seconds', false),
    'last_seen_at', v_seen,
    'queued_count', v_queued,
    'problem_jobs', v_problems);
END $$;
REVOKE ALL ON FUNCTION get_print_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_print_status(uuid) TO authenticated;

-- In lại: tạo job MỚI cùng kind/ref/trạm, đánh dấu job cũ đã xử lý. Gọi lại lần hai không tạo thêm.
CREATE OR REPLACE FUNCTION retry_print_job(p_job_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j print_jobs%ROWTYPE;
  v_new uuid;
  v_station uuid;
BEGIN
  SELECT * INTO j FROM print_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR NOT is_store_pos_operator(j.store_id) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;
  IF j.resolved_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF j.status NOT IN ('failed', 'expired') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Phiếu này chưa lỗi, không cần in lại');
  END IF;

  -- Job mất trạm (trạm đã xoá) thì chép trạm thay thế, không chép NULL (sẽ lặp lỗi mãi)
  v_station := j.station_id;
  IF v_station IS NULL THEN
    SELECT id INTO v_station FROM print_stations
     WHERE store_id = j.store_id
       AND CASE WHEN j.kind = 'kitchen_ticket' THEN is_default_kitchen ELSE is_pos END
     LIMIT 1;
  END IF;

  INSERT INTO print_jobs (store_id, station_id, kind, ref, dedupe_key, created_by)
  VALUES (j.store_id, v_station, j.kind, j.ref, j.dedupe_key || ':r' || gen_random_uuid()::text, auth.uid())
  RETURNING id INTO v_new;

  UPDATE print_jobs SET resolved_at = now(), resolved_by = auth.uid() WHERE id = j.id;
  RETURN jsonb_build_object('ok', true, 'job_id', v_new);
END $$;
REVOKE ALL ON FUNCTION retry_print_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION retry_print_job(uuid) TO authenticated;

-- Bỏ qua phiếu lỗi (vd. đã in bằng trình duyệt thay thế)
CREATE OR REPLACE FUNCTION dismiss_print_job(p_job_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_store uuid;
BEGIN
  SELECT store_id INTO v_store FROM print_jobs WHERE id = p_job_id;
  IF v_store IS NULL OR NOT is_store_pos_operator(v_store) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;
  -- Chỉ phiếu lỗi mới bỏ qua được (như retry_print_job); phiếu đang chờ/đang in không bị ẩn
  UPDATE print_jobs SET resolved_at = now(), resolved_by = auth.uid()
   WHERE id = p_job_id AND resolved_at IS NULL AND status IN ('failed', 'expired');
  IF NOT FOUND AND EXISTS (SELECT 1 FROM print_jobs WHERE id = p_job_id AND status NOT IN ('failed', 'expired')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Phiếu này chưa lỗi, không cần bỏ qua');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION dismiss_print_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION dismiss_print_job(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
