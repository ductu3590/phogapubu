// BL-1 Task 1 — contract cho schema reservation. Chạy với PGLITE_MODULE trỏ tới PGlite từ admin-web.
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
const store = id(10)
const otherStore = id(11)
const table = id(20)
const otherStoreTable = id(21)

async function rejected(fn, message) {
  await db.exec('SAVEPOINT expected_error')
  await assert.rejects(fn, message)
  await db.exec('ROLLBACK TO SAVEPOINT expected_error')
}

async function insertPendingReservation() {
  return (await db.query(
    `INSERT INTO reservations(
       store_id, status, customer_name, customer_phone, party_size, arrival_at,
       client_request_id, customer_token_hash, minimum_advance_minutes,
       booking_horizon_days, slot_interval_minutes, default_table_capacity, planning_hold_minutes,
       reservation_preorder_edit_cutoff_minutes
     ) VALUES($1, 'pending', 'Nguyễn Văn A', '0900000000', 2, now() + interval '1 day',
       $2, repeat('a', 64), 30, 7, 15, 6, 180, 30)
     RETURNING id`,
    [store, id(30)],
  )).rows[0].id
}

async function localDate(daysFromToday) {
  return (await db.query(
    `SELECT to_char(
       ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + $1::integer),
       'YYYY-MM-DD'
     ) AS value`,
    [daysFromToday],
  )).rows[0].value
}

async function localArrival(daysFromToday, time) {
  return (await db.query(
    `SELECT (($1::date + $2::time) AT TIME ZONE 'Asia/Ho_Chi_Minh') AS value`,
    [await localDate(daysFromToday), time],
  )).rows[0].value
}

async function slotsFor(daysFromToday = 1) {
  return (await db.query(
    'SELECT get_reservation_slots($1, $2::date) AS value',
    [store, await localDate(daysFromToday)],
  )).rows[0].value
}

async function createAsAnon({
  clientRequestId,
  arrivalAt = null,
  name = 'Nguyễn Văn A',
  phone = '0900000000',
  partySize = 2,
  note = null,
  zaloUserId = 'zalo-test-user',
}) {
  await db.exec('SET LOCAL ROLE anon')
  return (await db.query(
    'SELECT create_reservation($1, $2, $3, $4, $5, $6, $7, $8) AS value',
    [store, name, phone, partySize, arrivalAt ?? await localArrival(1, '11:00'), note, zaloUserId, clientRequestId],
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
      id uuid PRIMARY KEY,
      name text NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      is_accepting_orders boolean NOT NULL DEFAULT true,
      serving_hours jsonb NOT NULL DEFAULT '[]'::jsonb
    );
    CREATE TABLE tables (
      id uuid PRIMARY KEY,
      store_id uuid NOT NULL REFERENCES stores(id),
      table_number text NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      UNIQUE(id, store_id)
    );
    CREATE TABLE table_sessions (
      id uuid PRIMARY KEY,
      store_id uuid NOT NULL REFERENCES stores(id),
      table_id uuid NOT NULL REFERENCES tables(id),
      status text NOT NULL DEFAULT 'open'
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
      user_id uuid PRIMARY KEY REFERENCES auth.users(id),
      store_id uuid REFERENCES stores(id),
      role text NOT NULL,
      is_active boolean NOT NULL DEFAULT true
    );
    CREATE FUNCTION is_store_scoped_operator(p_store_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (
        SELECT 1 FROM mevo_operators
        WHERE user_id = auth.uid() AND store_id = p_store_id AND is_active
      )
    $$;
    CREATE PUBLICATION supabase_realtime;

    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
    INSERT INTO stores(id, name, serving_hours) VALUES
      ('${store}', 'Bảo Lương', '[{"open":"11:00","close":"22:00"}]'),
      ('${otherStore}', 'Quán khác', '[{"open":"11:00","close":"22:00"}]');
    INSERT INTO tables(id, store_id, table_number) VALUES
      ('${table}', '${store}', 'Bàn 1'),
      ('${otherStoreTable}', '${otherStore}', 'Bàn khác');
    INSERT INTO store_workflow_settings(store_id) VALUES ('${store}'), ('${otherStore}');
  `)

  const migration = await readFile(
    new URL('../migrations/052_reservation_schema.sql', import.meta.url),
    'utf8',
  )
  await db.exec(migration)
  await db.exec(migration) // Migration production phải chạy lại an toàn.

  const customerRpcMigration = await readFile(
    new URL('../migrations/053_reservation_customer_rpcs.sql', import.meta.url),
    'utf8',
  )
  await db.exec(customerRpcMigration)
  await db.exec(customerRpcMigration)
})

beforeEach(async () => {
  await db.exec('BEGIN')
})

afterEach(async () => {
  await db.exec('ROLLBACK')
  await db.exec('RESET ROLE')
})

after(async () => {
  await db.close()
})

test('anon/authenticated không SELECT, INSERT hoặc UPDATE trực tiếp reservation', async () => {
  await db.exec('SET LOCAL ROLE anon')
  await rejected(() => db.query('SELECT * FROM reservations'), /permission denied/)
  await rejected(
    () => db.query("INSERT INTO reservations(store_id, status) VALUES($1, 'pending')", [store]),
    /permission denied/,
  )
  await rejected(
    () => db.query("UPDATE reservations SET status = 'confirmed' WHERE id = $1", [id(99)]),
    /permission denied/,
  )
  await db.exec('RESET ROLE')
  await db.exec('SET LOCAL ROLE authenticated')
  await rejected(
    () => db.query("INSERT INTO reservations(store_id, status) VALUES($1, 'pending')", [store]),
    /permission denied/,
  )
})

test('booking mới chỉ bắt đầu pending', async () => {
  await rejected(
    () => db.query(
      `INSERT INTO reservations(
         store_id, status, customer_name, customer_phone, party_size, arrival_at,
         client_request_id, customer_token_hash, minimum_advance_minutes,
         booking_horizon_days, slot_interval_minutes, planning_hold_minutes,
         reservation_preorder_edit_cutoff_minutes
       ) VALUES($1, 'completed', 'A', '0900', 2, now(), $2, repeat('b', 64), 30, 7, 15, 180, 30)`,
      [store, id(31)],
    ),
    /pending|reservation_status_transition/,
  )
})

test('allocation không thể ghép reservation quán này với bàn quán khác', async () => {
  const reservation = await insertPendingReservation()
  await rejected(
    () => db.query(
      `INSERT INTO reservation_tables(
         reservation_id, store_id, table_id, hold_starts_at, hold_ends_at
       ) VALUES($1, $2, $3, now() + interval '1 day', now() + interval '1 day 3 hours')`,
      [reservation, store, otherStoreTable],
    ),
    /foreign key|cùng quán/,
  )
})

test('slot theo Asia/Ho_Chi_Minh, 15 phút và nằm trong ca phục vụ', async () => {
  const slots = await slotsFor()
  assert.equal(slots[0].local_time, '11:00')
  assert.equal(slots.at(-1).local_time, '21:45')
  assert.ok(slots.every((slot) => slot.local_time.endsWith(':00') || slot.local_time.endsWith(':15') || slot.local_time.endsWith(':30') || slot.local_time.endsWith(':45')))
})

test('booking khách idempotent, bỏ qua tạm nghỉ và không lộ hash token', async () => {
  await db.query('UPDATE stores SET is_accepting_orders = false WHERE id = $1', [store])
  const requestId = id(40)
  const first = await createAsAnon({ clientRequestId: requestId })
  const retry = await createAsAnon({ clientRequestId: requestId })
  await db.exec('RESET ROLE')

  assert.equal(first.reservation_id, retry.reservation_id)
  assert.match(first.customer_token, /^[0-9a-f]{64}$/)
  assert.equal('customer_token_hash' in first, false)
  assert.equal('customer_token_hash' in retry, false)
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM reservation_events')).rows[0].n, 1)
  assert.equal((await db.query('SELECT count(*)::integer AS n FROM reservations')).rows[0].n, 1)
})

test('khách chỉ xem, đổi và hủy booking của mình bằng opaque token', async () => {
  const created = await createAsAnon({ clientRequestId: id(41) })
  const nextArrival = await localArrival(2, '11:15')
  const mine = (await db.query(
    'SELECT get_customer_reservation($1, $2) AS value',
    [created.reservation_id, created.customer_token],
  )).rows[0].value
  assert.equal(mine.reservation_id, created.reservation_id)
  assert.equal('customer_token_hash' in mine, false)

  await rejected(
    () => db.query('SELECT get_customer_reservation($1, $2)', [created.reservation_id, 'wrong-token']),
    /Không có quyền/,
  )
  const changed = (await db.query(
    'SELECT request_reservation_change($1, $2, $3, $4, $5) AS value',
    [created.reservation_id, created.customer_token, nextArrival, 4, 'Đổi giờ đến'],
  )).rows[0].value
  assert.equal(changed.requested_party_size, 4)
  const cancelled = (await db.query(
    'SELECT cancel_customer_reservation($1, $2, $3) AS value',
    [created.reservation_id, created.customer_token, 'Khách đổi kế hoạch'],
  )).rows[0].value
  assert.equal(cancelled.status, 'cancelled_by_customer')
})

test('server chặn arrival ngoài slot, dưới thời gian tối thiểu và quá 7 ngày', async () => {
  const outsideShift = await localArrival(1, '10:07')
  const tooSoon = (await db.query("SELECT now() + interval '10 minutes' AS value")).rows[0].value
  const tooFar = await localArrival(8, '11:00')
  await rejected(
    () => createAsAnon({ clientRequestId: id(42), arrivalAt: outsideShift }),
    /khung giờ phục vụ/,
  )
  await rejected(
    () => createAsAnon({ clientRequestId: id(43), arrivalAt: tooSoon }),
    /ít nhất/,
  )
  await rejected(
    () => createAsAnon({ clientRequestId: id(44), arrivalAt: tooFar }),
    /7 ngày/,
  )
})

test('quán tắt đặt bàn thì anon không tạo được booking', async () => {
  await db.query('UPDATE store_workflow_settings SET reservations_enabled = false WHERE store_id = $1', [store])
  await rejected(
    () => createAsAnon({ clientRequestId: id(45) }),
    /chưa bật nhận đặt bàn/,
  )
})
