// BL-1 Task 3 — phân bổ và vòng đời reservation của chủ quán.
import { after, afterEach, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const pgliteModule = process.env.PGLITE_MODULE
  ? process.env.PGLITE_MODULE.startsWith('file:')
    ? process.env.PGLITE_MODULE
    : pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const owner = id(1)
const staff = id(2)
const otherOwner = id(3)
const superadmin = id(4)
const store = id(10)
const otherStore = id(11)
const table1 = id(20)
const table2 = id(21)
const table3 = id(22)
const table4 = id(23)
const otherTable = id(24)

async function rejected(fn, message) {
  await db.exec('SAVEPOINT expected_error')
  await assert.rejects(fn, message)
  await db.exec('ROLLBACK TO SAVEPOINT expected_error')
}

async function login(uid) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid])
  await db.exec('SET LOCAL ROLE authenticated')
}

async function localArrival(daysFromToday, time = '11:00') {
  return (await db.query(
    `SELECT ((
      ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + $1::integer)::timestamp + $2::time
    ) AT TIME ZONE 'Asia/Ho_Chi_Minh') AS value`,
    [daysFromToday, time],
  )).rows[0].value
}

async function createBooking(clientRequestId, partySize = 2) {
  return (await db.query(
    'SELECT create_reservation($1, $2, $3, $4, $5, NULL, NULL, $6) AS value',
    [store, 'Nguyễn Văn A', '0900000000', partySize, await localArrival(1), clientRequestId],
  )).rows[0].value
}

async function confirm(reservationId, tableIds, note = null) {
  return (await db.query(
    'SELECT confirm_reservation($1, string_to_array($2, $3)::uuid[], $4) AS value',
    [reservationId, tableIds.join(','), ',', note],
  )).rows[0].value
}

async function reservationStatus(reservationId) {
  return (await db.query('SELECT status FROM reservations WHERE id = $1', [reservationId])).rows[0].status
}

before(async () => {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE SCHEMA extensions;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION extensions.digest(p_value text, p_algorithm text) RETURNS bytea
      LANGUAGE sql IMMUTABLE STRICT AS $$
        SELECT decode(md5(p_value) || md5('reservation-token:' || p_value), 'hex')
      $$;

    CREATE TABLE stores (
      id uuid PRIMARY KEY, name text NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      is_accepting_orders boolean NOT NULL DEFAULT true,
      serving_hours jsonb NOT NULL DEFAULT '[]'::jsonb
    );
    CREATE TABLE tables (
      id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id),
      table_number text NOT NULL, is_active boolean NOT NULL DEFAULT true,
      UNIQUE(id, store_id)
    );
    CREATE TABLE table_sessions (
      id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id),
      table_id uuid NOT NULL REFERENCES tables(id), status text NOT NULL DEFAULT 'open'
    );
    CREATE TABLE session_tables (
      session_id uuid NOT NULL REFERENCES table_sessions(id),
      table_id uuid NOT NULL REFERENCES tables(id), is_open boolean NOT NULL DEFAULT true,
      PRIMARY KEY(session_id, table_id)
    );
    CREATE TABLE store_workflow_settings (
      store_id uuid PRIMARY KEY REFERENCES stores(id),
      reservations_enabled boolean NOT NULL DEFAULT true,
      reservation_preorder_enabled boolean NOT NULL DEFAULT true,
      minimum_advance_minutes integer NOT NULL DEFAULT 30,
      booking_horizon_days integer NOT NULL DEFAULT 7,
      slot_interval_minutes integer NOT NULL DEFAULT 15,
      default_table_capacity integer NOT NULL DEFAULT 6,
      planning_hold_minutes integer NOT NULL DEFAULT 180,
      reservation_preorder_edit_cutoff_minutes integer NOT NULL DEFAULT 30
    );
    CREATE TABLE mevo_operators (
      user_id uuid PRIMARY KEY REFERENCES auth.users(id), store_id uuid REFERENCES stores(id),
      role text NOT NULL, is_active boolean NOT NULL DEFAULT true
    );
    CREATE FUNCTION is_store_scoped_operator(p_store_id uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
        SELECT EXISTS (SELECT 1 FROM mevo_operators
          WHERE user_id = auth.uid() AND is_active
            AND (store_id = p_store_id OR role = 'mevo_superadmin'))
      $$;
    CREATE FUNCTION is_store_owner_of(p_store_id uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
        SELECT EXISTS (SELECT 1 FROM mevo_operators
          WHERE user_id = auth.uid() AND is_active AND role = 'store_owner' AND store_id = p_store_id)
      $$;
    CREATE FUNCTION open_session_id_for_table(p_table_id uuid) RETURNS uuid
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
        SELECT st.session_id FROM session_tables st JOIN table_sessions s ON s.id = st.session_id
        WHERE st.table_id = p_table_id AND st.is_open AND s.status = 'open' LIMIT 1
      $$;
    CREATE PUBLICATION supabase_realtime;

    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
    INSERT INTO auth.users(id) VALUES ('${owner}'), ('${staff}'), ('${otherOwner}'), ('${superadmin}');
    INSERT INTO stores(id, name, serving_hours) VALUES
      ('${store}', 'Bảo Lương', '[{"open":"11:00","close":"22:00"}]'),
      ('${otherStore}', 'Quán khác', '[{"open":"11:00","close":"22:00"}]');
    INSERT INTO tables(id, store_id, table_number) VALUES
      ('${table1}', '${store}', 'Bàn 1'), ('${table2}', '${store}', 'Bàn 2'),
      ('${table3}', '${store}', 'Bàn 3'), ('${table4}', '${store}', 'Bàn 4'),
      ('${otherTable}', '${otherStore}', 'Bàn khác');
    INSERT INTO store_workflow_settings(store_id) VALUES ('${store}'), ('${otherStore}');
    INSERT INTO mevo_operators(user_id, store_id, role) VALUES
      ('${owner}', '${store}', 'store_owner'), ('${staff}', '${store}', 'store_staff'),
      ('${otherOwner}', '${otherStore}', 'store_owner'), ('${superadmin}', NULL, 'mevo_superadmin');
  `)

  for (const migration of ['052_reservation_schema.sql', '053_reservation_customer_rpcs.sql', '054_reservation_operator_rpcs.sql', '054a_reservation_operator_grants.sql']) {
    await db.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
  }
})

beforeEach(async () => { await db.exec('BEGIN') })
afterEach(async () => { await db.exec('ROLLBACK'); await db.exec('RESET ROLE') })
after(async () => { await db.close() })

test('staff và owner quán khác không xác nhận hoặc no-show được', async () => {
  const reservation = await createBooking(id(30))
  await login(staff)
  await rejected(() => confirm(reservation.reservation_id, [table1]), /chủ quán/i)

  await login(otherOwner)
  await rejected(
    () => db.query('SELECT mark_reservation_no_show($1, NULL)', [reservation.reservation_id]),
    /Không có quyền/,
  )
})

test('confirm khóa đúng bàn, chặn booking trùng và bàn đang có khách', async () => {
  const first = await createBooking(id(31), 10)
  const second = await createBooking(id(32))
  await login(owner)
  const confirmed = await confirm(first.reservation_id, [table1, table2], 'Đoàn 10 khách')
  assert.equal(confirmed.status, 'confirmed')
  assert.equal(confirmed.suggested_table_count, 2)
  assert.deepEqual(confirmed.table_numbers, ['Bàn 1', 'Bàn 2'])

  await rejected(() => confirm(second.reservation_id, [table1]), /đã được giữ/)
  assert.equal(await reservationStatus(second.reservation_id), 'pending')

  await db.exec('RESET ROLE')
  await db.query(
    'INSERT INTO table_sessions(id, store_id, table_id) VALUES($1, $2, $3)',
    [id(80), store, table3],
  )
  await db.query('INSERT INTO session_tables(session_id, table_id) VALUES($1, $2)', [id(80), table3])
  await login(owner)
  await rejected(() => confirm(second.reservation_id, [table3]), /đang có khách/)
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM reservation_tables WHERE reservation_id = $1', [second.reservation_id])).rows[0].n, 0)
})

test('manual ngoài giới hạn, xử lý yêu cầu đổi và no-show đều có audit', async () => {
  await login(owner)
  const manual = (await db.query(
    'SELECT create_manual_reservation($1, $2::jsonb) AS value',
    [store, JSON.stringify({
      customer_name: 'Khách vãng lai', customer_phone: '0912345678', party_size: 8,
      arrival_at: await localArrival(12), note: 'Khách quen', reason: 'Đặt trực tiếp tại quầy',
    })],
  )).rows[0].value
  assert.equal(manual.status, 'pending')
  assert.equal((await db.query("SELECT count(*)::integer AS n FROM reservation_events WHERE reservation_id = $1 AND event_type = 'manual_created'", [manual.reservation_id])).rows[0].n, 1)

  await db.exec('RESET ROLE')
  const requested = await createBooking(id(33))
  const requestedArrival = await localArrival(2, '11:15')
  await db.query('SELECT request_reservation_change($1, $2, $3, $4, NULL)', [
    requested.reservation_id, requested.customer_token, requestedArrival, 4,
  ])
  await login(owner)
  const resolved = (await db.query(
    'SELECT resolve_reservation_change($1, true, string_to_array($2, $3)::uuid[], $4) AS value',
    [requested.reservation_id, table4, ',', 'Đồng ý đổi theo yêu cầu'],
  )).rows[0].value
  assert.equal(resolved.status, 'confirmed')
  assert.equal(resolved.party_size, 4)
  assert.equal((await db.query("SELECT count(*)::integer AS n FROM reservation_events WHERE reservation_id = $1 AND event_type = 'change_accepted'", [requested.reservation_id])).rows[0].n, 1)

  const noShow = (await db.query('SELECT mark_reservation_no_show($1, $2) AS value', [requested.reservation_id, 'Khách không tới'])).rows[0].value
  assert.equal(noShow.status, 'no_show')
  assert.equal((await db.query("SELECT count(*)::integer AS n FROM reservation_events WHERE reservation_id = $1 AND event_type = 'no_show'", [requested.reservation_id])).rows[0].n, 1)
})

test('MEVO xem được đúng quán; owner không đọc booking quán khác', async () => {
  const reservation = await createBooking(id(34))
  await login(owner)
  await rejected(
    () => db.query('SELECT list_store_reservations($1, now(), now() + interval \'2 days\')', [otherStore]),
    /Không có quyền/,
  )
  await login(superadmin)
  const listed = (await db.query(
    'SELECT list_store_reservations($1, now(), now() + interval \'2 days\') AS value',
    [store],
  )).rows[0].value
  assert.equal(listed[0].reservation_id, reservation.reservation_id)
})

test('anon không gọi được RPC owner hoặc helper SECURITY DEFINER', async () => {
  const result = (await db.query(`
    SELECT
      has_function_privilege('anon', 'public.confirm_reservation(uuid,uuid[],text)', 'EXECUTE') AS owner_rpc,
      has_function_privilege('anon', 'public.assign_reservation_tables(uuid,uuid,timestamptz,integer,uuid[],uuid)', 'EXECUTE') AS helper_rpc,
      has_function_privilege('authenticated', 'public.confirm_reservation(uuid,uuid[],text)', 'EXECUTE') AS authenticated_rpc
  `)).rows[0]
  assert.equal(result.owner_rpc, false)
  assert.equal(result.helper_rpc, false)
  assert.equal(result.authenticated_rpc, true)
})
