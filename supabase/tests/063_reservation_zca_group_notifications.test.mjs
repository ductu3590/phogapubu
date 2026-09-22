// BL-2B ZCA Task 1 — channel nhóm Zalo và outbox relay theo từng quán.
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
const group = '3531071701486961908'

async function rejected(fn, message) {
  await db.exec('SAVEPOINT expected_error')
  await assert.rejects(fn, message)
  await db.exec('ROLLBACK TO SAVEPOINT expected_error')
}

async function localArrival() {
  return (await db.query(`
    SELECT ((((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1)::timestamp + '11:00'::time)
      AT TIME ZONE 'Asia/Ho_Chi_Minh') AS value
  `)).rows[0].value
}

async function createCustomerBooking(clientRequestId = id(30)) {
  await db.exec('SET LOCAL ROLE anon')
  const value = (await db.query(
    'SELECT create_reservation($1, $2, $3, $4, $5, NULL, $6, $7) AS value',
    [store, 'Nguyễn Văn A', '0900000000', 4, await localArrival(), 'zalo-customer', clientRequestId],
  )).rows[0].value
  await db.exec('RESET ROLE')
  return value
}

async function configureChannel(targetStore = store, enabled = true, destination = group) {
  await db.query(`
    INSERT INTO store_reservation_notification_channels(
      store_id, provider, is_enabled, destination_group_id
    ) VALUES($1, 'zca_group', $2, $3)
  `, [targetStore, enabled, destination])
}

before(async () => {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
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
      id uuid PRIMARY KEY, name text NOT NULL, zalo_oa_id text,
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
      table_id uuid REFERENCES tables(id), status text NOT NULL DEFAULT 'open'
    );
    CREATE TABLE store_workflow_settings (
      store_id uuid PRIMARY KEY REFERENCES stores(id), reservations_enabled boolean NOT NULL DEFAULT true,
      reservation_preorder_enabled boolean NOT NULL DEFAULT true,
      minimum_advance_minutes integer NOT NULL DEFAULT 30, booking_horizon_days integer NOT NULL DEFAULT 7,
      slot_interval_minutes integer NOT NULL DEFAULT 15, default_table_capacity integer NOT NULL DEFAULT 6,
      planning_hold_minutes integer NOT NULL DEFAULT 180,
      reservation_preorder_edit_cutoff_minutes integer NOT NULL DEFAULT 30
    );
    CREATE TABLE store_zalo_configs (
      store_id uuid PRIMARY KEY REFERENCES stores(id), zalo_oa_access_token text,
      zalo_app_secret_key text, is_enabled boolean NOT NULL DEFAULT true
    );
    CREATE FUNCTION is_store_scoped_operator(p_store_id uuid) RETURNS boolean
      LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE PUBLICATION supabase_realtime;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    INSERT INTO stores(id, name, serving_hours) VALUES
      ('${store}', 'Bảo Lương', '[{"open":"11:00","close":"22:00"}]'),
      ('${otherStore}', 'Quán khác', '[{"open":"11:00","close":"22:00"}]');
    INSERT INTO store_workflow_settings(store_id) VALUES ('${store}'), ('${otherStore}');
  `)

  for (const migration of [
    '052_reservation_schema.sql',
    '053_reservation_customer_rpcs.sql',
    '059_reservation_owner_oa_notifications.sql',
    '059a_reservation_owner_oa_notification_indexes.sql',
    '063_reservation_zca_group_notifications.sql',
  ]) {
    await db.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
  }
})

beforeEach(async () => { await db.exec('BEGIN') })
afterEach(async () => { await db.exec('ROLLBACK'); await db.exec('RESET ROLE') })
after(async () => { await db.close() })

test('channel zca đang bật tạo một delivery snapshot không cần OA recipient', async () => {
  await configureChannel()
  const booking = await createCustomerBooking()
  const rows = (await db.query(`
    SELECT delivery_provider, destination_group_id, recipient_id, status
    FROM reservation_notification_deliveries
    WHERE reservation_id = $1
  `, [booking.reservation_id])).rows
  assert.deepEqual(rows, [{
    delivery_provider: 'zca_group',
    destination_group_id: group,
    recipient_id: null,
    status: 'queued',
  }])
})

test('channel tắt hoặc provider none không tạo delivery và không có gì để gọi relay', async () => {
  await configureChannel(store, false)
  const disabled = await createCustomerBooking(id(31))
  assert.equal((await db.query(
    'SELECT count(*)::integer AS n FROM reservation_notification_deliveries WHERE reservation_id = $1',
    [disabled.reservation_id],
  )).rows[0].n, 0)

  await db.query(`UPDATE store_reservation_notification_channels SET provider = 'none', destination_group_id = NULL WHERE store_id = $1`, [store])
  const none = await createCustomerBooking(id(32))
  assert.equal((await db.query(
    'SELECT count(*)::integer AS n FROM reservation_notification_deliveries WHERE reservation_id = $1',
    [none.reservation_id],
  )).rows[0].n, 0)
})

test('event replay giữ một notification_id và destination snapshot ban đầu', async () => {
  await configureChannel()
  const booking = await createCustomerBooking(id(33))
  const first = (await db.query(`
    SELECT id, reservation_event_id, idempotency_key, destination_group_id
    FROM reservation_notification_deliveries WHERE reservation_id = $1
  `, [booking.reservation_id])).rows[0]
  await db.query(`UPDATE store_reservation_notification_channels SET destination_group_id = 'different-group' WHERE store_id = $1`, [store])
  const replay = (await db.query('SELECT enqueue_reservation_owner_notification($1) AS value', [first.reservation_event_id])).rows[0].value
  assert.equal(replay, first.id)
  const rows = (await db.query(`
    SELECT id, destination_group_id FROM reservation_notification_deliveries WHERE idempotency_key = $1
  `, [first.idempotency_key])).rows
  assert.deepEqual(rows, [{ id: first.id, destination_group_id: group }])
})

test('channel và delivery relay không cho anon/authenticated đọc hoặc ghi trực tiếp', async () => {
  for (const role of ['anon', 'authenticated']) {
    for (const table of ['store_reservation_notification_channels', 'reservation_notification_deliveries']) {
      const privileges = (await db.query(`
        SELECT has_table_privilege($1, $2, 'SELECT') AS can_select,
               has_table_privilege($1, $2, 'INSERT') AS can_insert,
               has_table_privilege($1, $2, 'UPDATE') AS can_update
      `, [role, `public.${table}`])).rows[0]
      assert.deepEqual(privileges, { can_select: false, can_insert: false, can_update: false })
    }
  }
})

test('claim relay chỉ service role, đúng token và không trả phone khách', async () => {
  await configureChannel()
  const booking = await createCustomerBooking(id(34))
  const delivery = (await db.query(`
    SELECT id, dispatch_token FROM reservation_notification_deliveries WHERE reservation_id = $1
  `, [booking.reservation_id])).rows[0]

  await db.exec('SET LOCAL ROLE service_role')
  const wrong = (await db.query(
    'SELECT claim_reservation_zca_notification($1, $2) AS value', [delivery.id, id(999)],
  )).rows[0].value
  assert.equal(wrong, null)
  const claimed = (await db.query(
    'SELECT claim_reservation_zca_notification($1, $2) AS value', [delivery.id, delivery.dispatch_token],
  )).rows[0].value
  assert.equal(claimed.store_id, store)
  assert.equal(claimed.destination_group_id, group)
  assert.equal(claimed.customer_phone, undefined)
  assert.equal(claimed.customer_note, undefined)

  const replay = (await db.query(
    'SELECT claim_reservation_zca_notification($1, $2) AS value', [delivery.id, delivery.dispatch_token],
  )).rows[0].value
  assert.equal(replay, null)
  await rejected(() => db.query(
    'SELECT finish_reservation_zca_notification($1, $2, $3, $4, $5)',
    [delivery.id, delivery.dispatch_token, 'queued', null, null],
  ), /trạng thái kết thúc/i)
})
