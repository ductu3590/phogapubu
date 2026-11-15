import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Test mig 137: người còn cờ app_metadata.must_change_password trong JWT bị mọi chỗ quyết quyền vận hành trong DB từ
// chối (helper, RPC tự đọc mevo_operators, policy RLS). Người không cờ / cờ false / token cũ không có app_metadata
// giữ nguyên quyền.
//
// auth.uid() / auth.jwt() chép nguyên văn Supabase (đọc request.jwt.claims). 7 helper + get_store_workflow_settings,
// pos_get_floor_layout, revoke_reservation_customer_access là bản prod nguyên văn (2026-11-13). Bốn RPC lớn
// (update_store_workflow_settings, pos_save_floor_layout, requeue_reservation_zca_notification, staff_create_order) là
// KHUNG RÚT GỌN: giữ nguyên văn đoạn đọc operator + nhánh từ chối (chỗ mig 137 vá), lược phần nghiệp vụ phía sau.
// Neo của cả bốn đã chạy thử trên prod trong giao dịch tự huỷ (2026-11-13), khớp đủ 14 hàm.
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const owner = id(1), staff = id(2), cashier = id(3), manager = id(4), admin = id(5)
const sA = id(10), sB = id(11)
const tA = id(20)
const resA = id(30)

const migration = new URL('../migrations/137_db_must_change_password.sql', import.meta.url)
const load = async (url) => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')

// flag: undefined = JWT không có app_metadata (token cũ); null = có app_metadata nhưng thiếu khoá; còn lại = giá trị cờ.
function claims(uid, flag) {
  const c = { sub: uid, role: 'authenticated' }
  if (flag === null) c.app_metadata = { provider: 'email' }
  else if (flag !== undefined) c.app_metadata = { provider: 'email', must_change_password: flag }
  return JSON.stringify(c)
}
async function as(uid, flag, fn) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [claims(uid, flag)])
  await db.exec('SET ROLE authenticated')
  try {
    return await fn()
  } finally {
    await db.exec('RESET ROLE')
  }
}
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].v
const call = (uid, flag, sql, params = []) => as(uid, flag, () => scalar(sql, params))

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    -- Supabase cấp thẳng EXECUTE cho 3 role này trên mọi hàm mới; REVOKE ... FROM PUBLIC một mình không gỡ được.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    CREATE SCHEMA extensions;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
    -- Nguyên văn Supabase (prod 2026-11-13).
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $function$
      select
        coalesce(
            nullif(current_setting('request.jwt.claim', true), ''),
            nullif(current_setting('request.jwt.claims', true), '')
        )::jsonb
    $function$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $function$
      select
      coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid
    $function$;
    GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO anon, authenticated;
    -- pgcrypto không có trên PGlite: hai hàm giả đủ cho revoke_reservation_customer_access.
    CREATE FUNCTION extensions.gen_random_bytes(n int) RETURNS bytea LANGUAGE sql AS $$ SELECT '\\x00'::bytea $$;
    CREATE FUNCTION extensions.digest(t text, a text) RETURNS bytea LANGUAGE sql AS $$ SELECT '\\x01'::bytea $$;

    CREATE TABLE mevo_operators(user_id uuid PRIMARY KEY, store_id uuid, role text, is_active boolean DEFAULT true);
    CREATE TABLE stores(id uuid PRIMARY KEY, table_layout_version integer NOT NULL DEFAULT 1);
    CREATE TABLE table_areas(id uuid PRIMARY KEY, store_id uuid, name text, color text, sort_order integer DEFAULT 0);
    CREATE TABLE tables(
      id uuid PRIMARY KEY, store_id uuid, table_number text, area_id uuid, pos_x integer, pos_y integer,
      is_active boolean DEFAULT true
    );
    CREATE TABLE store_workflow_settings(store_id uuid PRIMARY KEY, print_mode text NOT NULL DEFAULT 'browser');
    CREATE TABLE store_workflow_setting_events(id serial PRIMARY KEY, store_id uuid NOT NULL);
    CREATE TABLE reservations(id uuid PRIMARY KEY, store_id uuid, customer_token_hash text, updated_at timestamptz);
    CREATE TABLE reservation_customer_requests(reservation_id uuid, token_hash text);
    CREATE FUNCTION store_workflow_snapshot(p_store_id uuid) RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT jsonb_build_object('store_id', p_store_id) $$;
    CREATE FUNCTION append_reservation_event(uuid, uuid, uuid, text, text, jsonb, jsonb, text) RETURNS void
      LANGUAGE sql AS $$ SELECT $$;

    -- 7 helper, nguyên văn prod 2026-11-13.
    CREATE FUNCTION public.is_store_scoped_operator(target_store_id uuid) RETURNS boolean
     LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
      select exists (
        select 1 from mevo_operators
        where user_id = auth.uid()
          and is_active
          and (role = 'mevo_superadmin' or store_id = target_store_id)
      );
    $function$;
    CREATE FUNCTION public.is_store_owner_or_admin(target_store_id uuid) RETURNS boolean
     LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
      select exists (
        select 1 from mevo_operators
        where user_id = auth.uid()
          and is_active
          and (
            role = 'mevo_superadmin'
            or (role = 'store_owner' and store_id = target_store_id)
          )
      );
    $function$;
    CREATE FUNCTION public.is_store_pos_operator(p_store_id uuid) RETURNS boolean
     LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
      select exists (
        select 1 from mevo_operators
         where user_id = auth.uid()
           and is_active
           and role in ('store_owner', 'store_cashier', 'store_manager')
           and store_id = p_store_id
      );
    $function$;
    CREATE FUNCTION public.is_store_back_office(p_store_id uuid) RETURNS boolean
     LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
      select exists (
        select 1 from mevo_operators
         where user_id = auth.uid()
           and is_active
           and role in ('store_owner', 'store_manager')
           and store_id = p_store_id
      );
    $function$;
    CREATE FUNCTION public.is_store_owner_of(p_store_id uuid) RETURNS boolean
     LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
      select exists (
        select 1 from mevo_operators
         where user_id = auth.uid()
           and is_active
           and role = 'store_owner'
           and store_id = p_store_id
      );
    $function$;
    CREATE FUNCTION public.get_print_mode() RETURNS text
     LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
      SELECT COALESCE(
        (SELECT s.print_mode
           FROM mevo_operators o
           JOIN store_workflow_settings s ON s.store_id = o.store_id
          WHERE o.user_id = auth.uid() AND o.is_active AND o.store_id IS NOT NULL
          LIMIT 1),
        'browser')
    $function$;
    CREATE FUNCTION public.reservation_operator_actor_kind(p_store_id uuid) RETURNS text
     LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
    DECLARE
      v_role text;
      v_operator_store uuid;
    BEGIN
      SELECT role, store_id INTO v_role, v_operator_store
      FROM public.mevo_operators
      WHERE user_id = auth.uid() AND is_active IS TRUE;

      IF v_role = 'mevo_superadmin' THEN RETURN 'mevo'; END IF;
      IF v_role IN ('store_owner', 'store_cashier', 'store_manager') AND v_operator_store = p_store_id THEN RETURN 'owner'; END IF;
      IF v_role = 'store_staff' AND v_operator_store = p_store_id THEN
        RAISE EXCEPTION 'Chỉ chủ quán mới được quản lý đặt bàn';
      END IF;
      RAISE EXCEPTION 'Không có quyền quản lý đặt bàn của quán này';
    END;
    $function$;

    -- Ba RPC nguyên văn prod 2026-11-13.
    CREATE FUNCTION public.get_store_workflow_settings(p_store_id uuid) RETURNS jsonb
     LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
    DECLARE
      v_role text;
      v_operator_store uuid;
      v_result jsonb;
    BEGIN
      SELECT role, store_id
      INTO v_role, v_operator_store
      FROM public.mevo_operators
      WHERE user_id = auth.uid() AND is_active = true;

      IF v_role NOT IN ('store_owner', 'mevo_superadmin') OR v_role IS NULL THEN
        RAISE EXCEPTION 'Chỉ chủ quán hoặc MEVO được xem cấu hình quy trình';
      END IF;
      IF v_role = 'store_owner' AND v_operator_store IS DISTINCT FROM p_store_id THEN
        RAISE EXCEPTION 'Chỉ được xem quán của mình';
      END IF;

      v_result := public.store_workflow_snapshot(p_store_id);
      IF v_result IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy cấu hình quy trình của quán';
      END IF;
      RETURN v_result;
    END;
    $function$;
    CREATE FUNCTION public.pos_get_floor_layout() RETURNS jsonb
     LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
    DECLARE v_store uuid; v_result jsonb;
    BEGIN
      SELECT store_id INTO v_store FROM public.mevo_operators
      WHERE user_id = auth.uid() AND role IN ('store_owner', 'store_cashier', 'store_manager') AND is_active = true;
      IF v_store IS NULL THEN RAISE EXCEPTION 'Chỉ chủ quán được xem sơ đồ POS'; END IF;
      SELECT jsonb_build_object(
        'version', s.table_layout_version,
        'areas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'color', a.color)
          ORDER BY a.sort_order, a.id) FROM public.table_areas a WHERE a.store_id = s.id), '[]'::jsonb),
        'tables', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', t.id, 'table_number', t.table_number, 'area_id', t.area_id, 'pos_x', t.pos_x, 'pos_y', t.pos_y
        ) ORDER BY t.id) FROM public.tables t WHERE t.store_id = s.id AND t.is_active), '[]'::jsonb)
      ) INTO v_result FROM public.stores s WHERE s.id = v_store;
      RETURN v_result;
    END;
    $function$;
    CREATE FUNCTION public.revoke_reservation_customer_access(p_reservation_id uuid, p_reason text) RETURNS jsonb
     LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
    DECLARE
      v_reservation public.reservations%ROWTYPE;
      v_actor_store uuid;
      v_actor_role text;
    BEGIN
      IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
        RAISE EXCEPTION 'Cần ghi lý do thu hồi quyền (1–500 ký tự)';
      END IF;
      SELECT store_id, role INTO v_actor_store, v_actor_role FROM public.mevo_operators
      WHERE user_id = auth.uid() AND is_active IS TRUE;
      SELECT * INTO v_reservation FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
      IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'store_owner'
         OR v_actor_store IS DISTINCT FROM v_reservation.store_id THEN
        RAISE EXCEPTION 'Chỉ chủ đúng quán mới được thu hồi quyền khách';
      END IF;
      PERFORM 1 FROM public.reservation_customer_requests
      WHERE reservation_id = v_reservation.id FOR UPDATE;
      UPDATE public.reservations SET customer_token_hash = encode(extensions.digest(encode(extensions.gen_random_bytes(32),'hex'),'sha256'),'hex'), updated_at = now()
      WHERE id = v_reservation.id RETURNING * INTO v_reservation;
      UPDATE public.reservation_customer_requests SET token_hash = NULL
      WHERE reservation_id = v_reservation.id;
      PERFORM public.append_reservation_event(v_reservation.id, v_reservation.store_id, auth.uid(), 'owner',
        'customer_access_revoked', '{}'::jsonb, jsonb_build_object('revoked', true), btrim(p_reason));
      RETURN jsonb_build_object('revoked', true, 'reservation_id', v_reservation.id);
    END;
    $function$;

    -- Bốn khung rút gọn: đoạn đọc operator + nhánh từ chối nguyên văn prod; phần sau lược thành RETURN.
    CREATE FUNCTION public.update_store_workflow_settings(p_store_id uuid, p_settings jsonb, p_changed_via text)
     RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
    DECLARE
      v_uid uuid := auth.uid();
      v_role text;
      v_operator_store uuid;
    BEGIN
      SELECT role, store_id
      INTO v_role, v_operator_store
      FROM public.mevo_operators
      WHERE user_id = v_uid AND is_active = true;

      IF v_role NOT IN ('store_owner', 'mevo_superadmin') OR v_role IS NULL THEN
        RAISE EXCEPTION 'Chỉ chủ quán hoặc MEVO được sửa cấu hình quy trình';
      END IF;
      RETURN jsonb_build_object('ok', true);
    END;
    $function$;
    CREATE FUNCTION public.pos_save_floor_layout(p_version integer, p_areas jsonb, p_tables jsonb)
     RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
    DECLARE v_store uuid;
    BEGIN
      SELECT store_id INTO v_store FROM public.mevo_operators
      WHERE user_id = auth.uid() AND role = 'store_owner' AND is_active = true;
      IF v_store IS NULL THEN RAISE EXCEPTION 'Chỉ chủ quán được sửa sơ đồ POS'; END IF;
      RETURN jsonb_build_object('ok', true);
    END;
    $function$;
    CREATE FUNCTION public.requeue_reservation_zca_notification(p_store_id uuid, p_delivery_id uuid,
      p_expected_updated_at timestamp with time zone, p_request_id uuid, p_reason text)
     RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
    DECLARE
      v_actor uuid := auth.uid();
    BEGIN
      IF p_request_id IS NULL OR p_expected_updated_at IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 300 THEN
        RAISE EXCEPTION 'Mã thao tác hoặc lý do gửi lại không hợp lệ';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.mevo_operators op
        WHERE op.user_id = v_actor AND op.role = 'mevo_superadmin' AND op.store_id IS NULL AND op.is_active) THEN
        RAISE EXCEPTION 'Chỉ MEVO superadmin được gửi lại thông báo nội bộ';
      END IF;
      RETURN jsonb_build_object('ok', true);
    END;
    $function$;
    CREATE FUNCTION public.staff_create_order(p_table_id uuid, p_items jsonb, p_payment_method text,
      p_client_request_id uuid, p_note text)
     RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
    declare
      v_uid          uuid := auth.uid();
      v_store        uuid;
      v_role         text;
    begin
      select store_id, role into v_store, v_role
      from mevo_operators where user_id = v_uid and is_active;
      if v_store is null or v_role not in ('store_owner','store_staff','store_cashier','store_manager') then
        raise exception 'Không có quyền đặt món hộ';
      end if;
      return jsonb_build_object('ok', true);
    end;
    $function$;

    -- RLS: policy tables qua helper (như prod), hai policy workflow viết thẳng điều kiện (nguyên văn prod trước mig 137).
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
    ALTER TABLE mevo_operators ENABLE ROW LEVEL SECURITY;
    CREATE POLICY operator_read_self ON mevo_operators FOR SELECT TO authenticated USING (user_id = auth.uid());
    ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
    CREATE POLICY auth_read_all_tables ON tables FOR SELECT TO authenticated USING (is_store_scoped_operator(store_id));
    ALTER TABLE store_workflow_settings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY workflow_settings_operator_read ON store_workflow_settings FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM mevo_operators o WHERE o.user_id = auth.uid() AND o.is_active = true
        AND ((o.role = 'store_owner' AND o.store_id = store_workflow_settings.store_id) OR o.role = 'mevo_superadmin')));
    ALTER TABLE store_workflow_setting_events ENABLE ROW LEVEL SECURITY;
    CREATE POLICY workflow_events_operator_read ON store_workflow_setting_events FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM mevo_operators o WHERE o.user_id = auth.uid() AND o.is_active = true
        AND ((o.role = 'store_owner' AND o.store_id = store_workflow_setting_events.store_id) OR o.role = 'mevo_superadmin')));
  `)
  await db.query(
    `INSERT INTO mevo_operators(user_id, store_id, role) VALUES
       ($1, $6, 'store_owner'), ($2, $6, 'store_staff'), ($3, $6, 'store_cashier'), ($4, $6, 'store_manager'),
       ($5, NULL, 'mevo_superadmin')`,
    [owner, staff, cashier, manager, admin, sA],
  )
  await db.query(`INSERT INTO stores(id) VALUES ($1), ($2)`, [sA, sB])
  await db.query(`INSERT INTO tables(id, store_id, table_number) VALUES ($1, $2, 'B1')`, [tA, sA])
  await db.query(`INSERT INTO store_workflow_settings(store_id, print_mode) VALUES ($1, 'agent')`, [sA])
  await db.query(`INSERT INTO store_workflow_setting_events(store_id) VALUES ($1)`, [sA])
  await db.query(`INSERT INTO reservations(id, store_id) VALUES ($1, $2)`, [resA, sA])

  await db.exec(await load(migration))
})

// Cờ không chặn: thiếu app_metadata (token cũ), thiếu khoá, false, và cả chuỗi lạ — chỉ đúng true mới chặn.
const PASS_FLAGS = [undefined, null, false, 'false', 'yes']
const HELPERS = ['is_store_scoped_operator', 'is_store_owner_or_admin', 'is_store_pos_operator', 'is_store_back_office',
  'is_store_owner_of']

test('helper quyền: chủ quán không cờ giữ quyền, còn cờ true thì mất hết', async () => {
  for (const fn of HELPERS) {
    for (const flag of PASS_FLAGS) {
      assert.equal(await call(owner, flag, `SELECT ${fn}($1) AS v`, [sA]), true, `${fn} flag=${flag}`)
    }
    assert.equal(await call(owner, true, `SELECT ${fn}($1) AS v`, [sA]), false, `${fn} flag=true`)
    // Chuỗi "true" trong JSON cũng là bật (->> trả text).
    assert.equal(await call(owner, 'true', `SELECT ${fn}($1) AS v`, [sA]), false, `${fn} flag="true"`)
  }
})

test('helper quyền: superadmin, thu ngân, quản lý, phục vụ còn cờ cũng bị chặn', async () => {
  assert.equal(await call(admin, undefined, 'SELECT is_store_owner_or_admin($1) AS v', [sB]), true)
  assert.equal(await call(admin, true, 'SELECT is_store_owner_or_admin($1) AS v', [sB]), false)
  assert.equal(await call(admin, true, 'SELECT is_store_scoped_operator($1) AS v', [sB]), false)
  assert.equal(await call(cashier, false, 'SELECT is_store_pos_operator($1) AS v', [sA]), true)
  assert.equal(await call(cashier, true, 'SELECT is_store_pos_operator($1) AS v', [sA]), false)
  assert.equal(await call(manager, null, 'SELECT is_store_back_office($1) AS v', [sA]), true)
  assert.equal(await call(manager, true, 'SELECT is_store_back_office($1) AS v', [sA]), false)
  assert.equal(await call(staff, undefined, 'SELECT is_store_scoped_operator($1) AS v', [sA]), true)
  assert.equal(await call(staff, true, 'SELECT is_store_scoped_operator($1) AS v', [sA]), false)
})

test('get_print_mode: còn cờ rơi về browser, không lộ cấu hình quán', async () => {
  assert.equal(await call(owner, false, 'SELECT get_print_mode() AS v'), 'agent')
  assert.equal(await call(owner, true, 'SELECT get_print_mode() AS v'), 'browser')
})

test('reservation_operator_actor_kind: còn cờ → không có quyền', async () => {
  assert.equal(await call(owner, undefined, 'SELECT reservation_operator_actor_kind($1) AS v', [sA]), 'owner')
  assert.equal(await call(admin, false, 'SELECT reservation_operator_actor_kind($1) AS v', [sA]), 'mevo')
  await assert.rejects(call(owner, true, 'SELECT reservation_operator_actor_kind($1) AS v', [sA]),
    /Không có quyền quản lý đặt bàn/)
  await assert.rejects(call(admin, true, 'SELECT reservation_operator_actor_kind($1) AS v', [sA]),
    /Không có quyền quản lý đặt bàn/)
})

test('RPC tự đọc mevo_operators: không cờ chạy được, còn cờ bị từ chối', async () => {
  const cases = [
    [owner, 'SELECT get_store_workflow_settings($1) AS v', [sA], /Chỉ chủ quán hoặc MEVO được xem/],
    [owner, "SELECT update_store_workflow_settings($1, '{}'::jsonb, 'owner') AS v", [sA],
      /Chỉ chủ quán hoặc MEVO được sửa/],
    [cashier, 'SELECT pos_get_floor_layout() AS v', [], /Chỉ chủ quán được xem sơ đồ POS/],
    [owner, "SELECT pos_save_floor_layout(1, '[]'::jsonb, '[]'::jsonb) AS v", [], /Chỉ chủ quán được sửa sơ đồ POS/],
    [owner, "SELECT revoke_reservation_customer_access($1, 'khách đổi ý') AS v", [resA],
      /Chỉ chủ đúng quán mới được thu hồi/],
    [admin, "SELECT requeue_reservation_zca_notification($1, $2, now(), $3, 'gửi lại') AS v", [sA, id(99), id(98)],
      /Chỉ MEVO superadmin được gửi lại/],
    [staff, "SELECT staff_create_order($1, '[]'::jsonb, 'cash', $2, null) AS v", [tA, id(97)],
      /Không có quyền đặt món hộ/],
  ]
  for (const [uid, sql, params, denied] of cases) {
    const ok = await call(uid, false, sql, params)
    assert.ok(ok, `không cờ phải chạy được: ${sql}`)
    await assert.rejects(call(uid, true, sql, params), denied, `còn cờ phải bị chặn: ${sql}`)
  }
})

test('RLS: còn cờ không đọc được bảng quán, vẫn đọc được dòng mevo_operators của chính mình', async () => {
  const count = (uid, flag, table) => call(uid, flag, `SELECT count(*)::int AS v FROM ${table}`)
  for (const table of ['tables', 'store_workflow_settings', 'store_workflow_setting_events']) {
    assert.equal(await count(owner, false, table), 1, `${table} không cờ`)
    assert.equal(await count(owner, true, table), 0, `${table} còn cờ`)
  }
  assert.equal(await count(admin, undefined, 'store_workflow_settings'), 1)
  assert.equal(await count(admin, true, 'store_workflow_settings'), 0)
  // Trang /change-password, loadOperator, changeInitialPassword đọc dòng này bằng phiên người dùng.
  assert.equal(await count(owner, true, 'mevo_operators'), 1)
})

test('hai policy workflow giờ đi qua is_store_owner_or_admin (cùng nghĩa: chủ đúng quán hoặc superadmin)', async () => {
  const { rows } = await db.query(
    `SELECT policyname, qual FROM pg_policies
      WHERE policyname IN ('workflow_settings_operator_read', 'workflow_events_operator_read') ORDER BY 1`)
  assert.equal(rows.length, 2)
  for (const r of rows) assert.match(r.qual, /^is_store_owner_or_admin\(store_id\)$/)
  // Thu ngân / phục vụ không thấy cấu hình (như trước).
  assert.equal(await call(cashier, false, 'SELECT count(*)::int AS v FROM store_workflow_settings'), 0)
  assert.equal(await call(staff, false, 'SELECT count(*)::int AS v FROM store_workflow_settings'), 0)
})

test('operator_password_ok là hàm nội bộ: anon / authenticated không gọi thẳng được', async () => {
  for (const role of ['anon', 'authenticated']) {
    assert.equal(
      await scalar(`SELECT has_function_privilege('${role}', 'public.operator_password_ok()', 'execute') AS v`),
      false, role)
  }
})

test('chạy lại mig 137 thì lỗi, không vá chồng', async () => {
  // Dừng ngay ở CREATE FUNCTION operator_password_ok (đã có).
  await assert.rejects(db.exec(await load(migration)), /operator_password_ok.*already exists/)
  // Bỏ qua chặn đó thì từng lệnh vá tự RAISE vì thân hàm đã mang dấu "mig 137".
  const patchOnly = (await load(migration)).replace(/CREATE FUNCTION public\.operator_password_ok[\s\S]*?FROM PUBLIC, anon, authenticated;/, '')
    .replace('CREATE FUNCTION pg_temp.mig137_patch', 'CREATE OR REPLACE FUNCTION pg_temp.mig137_patch')
  await assert.rejects(db.exec(patchOnly), /mig 137: public\.is_store_scoped_operator\(uuid\) đã được vá rồi/)
})
