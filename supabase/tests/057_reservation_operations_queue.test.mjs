// BL-2A Task 1 — queue vận hành reservation, Snooze và đổi lịch/bàn của chủ quán.
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
    `SELECT (((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + $1::integer)::timestamp + $2::time)
      AT TIME ZONE 'Asia/Ho_Chi_Minh' AS value`,
    [daysFromToday, time],
  )).rows[0].value
}

async function createBooking(clientRequestId, { arrivalAt = null, partySize = 2 } = {}) {
  return (await db.query(
    'SELECT create_reservation($1, $2, $3, $4, $5, NULL, NULL, $6) AS value',
    [store, 'Nguyễn Văn A', '0900000000', partySize, arrivalAt ?? await localArrival(1), clientRequestId],
  )).rows[0].value
}

async function confirm(reservationId, tableIds) {
  return (await db.query(
    'SELECT confirm_reservation($1, string_to_array($2, $3)::uuid[], NULL) AS value',
    [reservationId, tableIds.join(','), ','],
  )).rows[0].value
}

async function arrive(reservationId) {
  return (await db.query('SELECT arrive_reservation($1) AS value', [reservationId])).rows[0].value
}

async function close(sessionId) {
  return (await db.query(
    "SELECT close_table_session($1, 'paid', 'cash') AS value",
    [sessionId],
  )).rows[0].value
}

async function activeTables(reservationId) {
  return (await db.query(
    `SELECT table_id
     FROM reservation_tables
     WHERE reservation_id = $1 AND released_at IS NULL
     ORDER BY table_id`,
    [reservationId],
  )).rows.map((row) => row.table_id)
}

async function listQueue(storeId, recentSince, futureUntil) {
  return (await db.query(
    'SELECT list_reservation_queue($1, $2, $3) AS value',
    [storeId, recentSince, futureUntil],
  )).rows[0].value
}

async function reschedule(reservationId, arrivalAt, partySize, tableIds, note = 'Chủ quán đổi lịch') {
  return (await db.query(
    'SELECT reschedule_reservation($1, $2, $3, string_to_array($4, $5)::uuid[], $6) AS value',
    [reservationId, arrivalAt, partySize, tableIds.join(','), ',', note],
  )).rows[0].value
}

async function snooze(reservationIds, minutes) {
  return (await db.query(
    'SELECT snooze_reservation_reminders(string_to_array($1, $2)::uuid[], $3) AS value',
    [reservationIds.join(','), ',', minutes],
  )).rows[0].value
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
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES stores(id),
      table_id uuid NOT NULL REFERENCES tables(id), status text NOT NULL DEFAULT 'open',
      opened_by text NOT NULL DEFAULT 'customer', opened_at timestamptz NOT NULL DEFAULT now(),
      last_activity_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
      closed_by uuid, close_reason text, is_open_ordering boolean NOT NULL DEFAULT false
    );
    CREATE TABLE session_tables (
      session_id uuid NOT NULL REFERENCES table_sessions(id),
      table_id uuid NOT NULL REFERENCES tables(id), is_open boolean NOT NULL DEFAULT true,
      PRIMARY KEY(session_id, table_id)
    );
    CREATE TABLE orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES stores(id),
      session_id uuid REFERENCES table_sessions(id), status text NOT NULL DEFAULT 'pending',
      total_amount integer NOT NULL DEFAULT 0, order_source text NOT NULL DEFAULT 'customer',
      payment_received_at timestamptz, payment_received_via text, payment_received_by uuid,
      payment_instrument text
    );
    CREATE TABLE store_workflow_settings (
      store_id uuid PRIMARY KEY REFERENCES stores(id), reservations_enabled boolean NOT NULL DEFAULT true,
      reservation_preorder_enabled boolean NOT NULL DEFAULT true,
      minimum_advance_minutes integer NOT NULL DEFAULT 30, booking_horizon_days integer NOT NULL DEFAULT 7,
      slot_interval_minutes integer NOT NULL DEFAULT 15, default_table_capacity integer NOT NULL DEFAULT 6,
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
    CREATE FUNCTION lock_table_for_session(p_table_id uuid) RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        BEGIN RETURN; END
      $$;
    CREATE PUBLICATION supabase_realtime;

    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
    GRANT SELECT ON table_sessions, session_tables, orders TO authenticated;
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

  for (const migration of [
    '052_reservation_schema.sql',
    '053_reservation_customer_rpcs.sql',
    '054_reservation_operator_rpcs.sql',
    '054a_reservation_operator_grants.sql',
    '055_reservation_arrival.sql',
    '056_reservation_session_completion.sql',
    '057_reservation_operations_queue.sql',
    '058_reservation_queue_hold_window.sql',
    '068_reservation_queue_session_id.sql',
  ]) {
    try {
      await db.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
})

beforeEach(async () => { await db.exec('BEGIN') })
afterEach(async () => { await db.exec('ROLLBACK'); await db.exec('RESET ROLE') })
after(async () => { await db.close() })

test('queue giữ booking unresolved cũ, nhưng bỏ terminal ngoài cửa sổ vận hành', async () => {
  const oldPending = await createBooking(id(30))
  const oldConfirmed = await createBooking(id(31), { arrivalAt: await localArrival(1, '11:15') })
  const terminal = await createBooking(id(32), { arrivalAt: await localArrival(1, '11:30') })
  await login(owner)
  await confirm(oldConfirmed.reservation_id, [table1])
  await confirm(terminal.reservation_id, [table2])
  const arrived = await arrive(terminal.reservation_id)
  await close(arrived.session_id)
  await db.exec('RESET ROLE')

  await db.query(
    "UPDATE reservations SET arrival_at = now() - interval '2 days' WHERE id = ANY(string_to_array($1, ',')::uuid[])",
    [[oldPending.reservation_id, oldConfirmed.reservation_id].join(',')],
  )
  await db.query(
    "UPDATE reservations SET updated_at = now() - interval '2 days' WHERE id = $1",
    [terminal.reservation_id],
  )

  await login(owner)
  const queue = await listQueue(store, new Date(Date.now() - 86_400_000).toISOString(), new Date(Date.now() + 7 * 86_400_000).toISOString())
  assert.ok(queue.some((row) => row.reservation_id === oldPending.reservation_id))
  assert.ok(queue.some((row) => row.reservation_id === oldConfirmed.reservation_id))
  assert.ok(!queue.some((row) => row.reservation_id === terminal.reservation_id))
})

test('queue trả snapshot thời lượng giữ bàn để client chỉ khóa đúng khung giờ chồng nhau', async () => {
  const booking = await createBooking(id(38), { arrivalAt: await localArrival(1, '11:00') })
  await login(owner)
  await confirm(booking.reservation_id, [table1])

  const queue = await listQueue(store, new Date(Date.now() - 86_400_000).toISOString(), new Date(Date.now() + 7 * 86_400_000).toISOString())
  const item = queue.find((row) => row.reservation_id === booking.reservation_id)
  assert.equal(item.planning_hold_minutes, 180)
})

test('queue trả session id sau khi nhận khách để Admin mở đúng bill POS', async () => {
  const booking = await createBooking(id(39), { arrivalAt: await localArrival(1, '11:30') })
  await login(owner)
  await confirm(booking.reservation_id, [table1])
  const arrived = await arrive(booking.reservation_id)

  const queue = await listQueue(store, new Date(Date.now() - 86_400_000).toISOString(), new Date(Date.now() + 7 * 86_400_000).toISOString())
  const item = queue.find((row) => row.reservation_id === booking.reservation_id)
  assert.equal(item.session_id, arrived.session_id)
})

test('reschedule conflict không làm mất allocation cũ, thành công thì thay allocation nguyên tử', async () => {
  const booking = await createBooking(id(33), { arrivalAt: await localArrival(1, '11:00') })
  const blocking = await createBooking(id(34), { arrivalAt: await localArrival(1, '11:15') })
  await login(owner)
  await confirm(booking.reservation_id, [table1])
  await confirm(blocking.reservation_id, [table2])
  const blockedArrival = await localArrival(1, '11:15')

  await rejected(
    () => reschedule(booking.reservation_id, blockedArrival, 4, [table2]),
    /đã được giữ|đang có khách/i,
  )
  assert.deepEqual(await activeTables(booking.reservation_id), [table1])

  const changed = await reschedule(booking.reservation_id, await localArrival(2, '11:00'), 8, [table3])
  assert.equal(changed.status, 'confirmed')
  assert.equal(changed.party_size, 8)
  assert.deepEqual(await activeTables(booking.reservation_id), [table3])
  assert.equal((await db.query(
    "SELECT count(*)::integer AS n FROM reservation_events WHERE reservation_id = $1 AND event_type = 'rescheduled_by_store'",
    [booking.reservation_id],
  )).rows[0].n, 1)
})

test('Snooze chỉ cho confirmed cùng quán, lưu thời điểm và audit từng booking', async () => {
  const first = await createBooking(id(35))
  const second = await createBooking(id(36), { arrivalAt: await localArrival(1, '11:15') })
  await login(owner)
  await confirm(first.reservation_id, [table1])
  await confirm(second.reservation_id, [table2])

  await rejected(() => snooze([first.reservation_id], 5), /10, 15 hoặc 30/)
  const result = await snooze([first.reservation_id, second.reservation_id], 15)
  assert.equal(result.updated_count, 2)
  const rows = (await db.query(
    'SELECT id, reminder_snoozed_until FROM reservations WHERE id = ANY(string_to_array($1, $2)::uuid[]) ORDER BY id',
    [[first.reservation_id, second.reservation_id].sort().join(','), ','],
  )).rows
  assert.equal(rows.length, 2)
  assert.ok(rows.every((row) => row.reminder_snoozed_until !== null))
  assert.equal((await db.query(
    "SELECT count(*)::integer AS n FROM reservation_events WHERE reservation_id = ANY(string_to_array($1, $2)::uuid[]) AND event_type = 'reminder_snoozed'",
    [[first.reservation_id, second.reservation_id].join(','), ','],
  )).rows[0].n, 2)
})

test('staff, owner quán khác và direct UPDATE không lách queue/Snooze/reschedule', async () => {
  const booking = await createBooking(id(37))
  await login(owner)
  await confirm(booking.reservation_id, [table1])

  await login(staff)
  await rejected(
    () => listQueue(store, new Date(Date.now() - 86_400_000).toISOString(), new Date(Date.now() + 86_400_000).toISOString()),
    /chủ quán/i,
  )
  await rejected(() => snooze([booking.reservation_id], 10), /chủ quán/i)

  await login(otherOwner)
  const otherArrival = await localArrival(2)
  await rejected(
    () => reschedule(booking.reservation_id, otherArrival, 3, [table1]),
    /Không có quyền/i,
  )

  await login(owner)
  await rejected(
    () => db.query("UPDATE reservations SET reminder_snoozed_until = now() WHERE id = $1", [booking.reservation_id]),
    /permission denied/i,
  )
})

test('new RPC chỉ cấp authenticated, anon không có EXECUTE', async () => {
  const privileges = (await db.query(`
    SELECT
      has_function_privilege('anon', 'public.list_reservation_queue(uuid,timestamptz,timestamptz)', 'EXECUTE') AS anon_queue,
      has_function_privilege('anon', 'public.reschedule_reservation(uuid,timestamptz,integer,uuid[],text)', 'EXECUTE') AS anon_reschedule,
      has_function_privilege('anon', 'public.snooze_reservation_reminders(uuid[],integer)', 'EXECUTE') AS anon_snooze,
      has_function_privilege('authenticated', 'public.snooze_reservation_reminders(uuid[],integer)', 'EXECUTE') AS authenticated_snooze
  `)).rows[0]
  assert.deepEqual(privileges, {
    anon_queue: false,
    anon_reschedule: false,
    anon_snooze: false,
    authenticated_snooze: true,
  })
})
