// BL-2B Task 1 — outbox thông báo booking mới cho đúng OA/chủ quán.
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

async function configureRecipient(targetStore = store, oaUserId = 'oa-owner-a') {
  const recipient = (await db.query(`
    INSERT INTO store_zalo_notification_recipients(
      store_id, purpose, oa_id, oa_user_id, status, verified_at
    ) VALUES($1, 'reservation_owner_alert', $2, $3, 'verified', now())
    RETURNING id
  `, [targetStore, targetStore === store ? 'oa-a' : 'oa-b', oaUserId])).rows[0]
  await db.query(`
    INSERT INTO store_zalo_configs(store_id, zalo_oa_access_token, zalo_app_secret_key, is_enabled)
    VALUES($1, 'token-test', 'secret-test', true)
    ON CONFLICT(store_id) DO UPDATE SET
      zalo_oa_access_token = excluded.zalo_oa_access_token,
      zalo_app_secret_key = excluded.zalo_app_secret_key,
      is_enabled = true
  `, [targetStore])
  return recipient.id
}

async function insertManualEvent() {
  const reservationId = id(80)
  await db.query(`
    INSERT INTO reservations(
      id, store_id, customer_name, customer_phone, party_size, arrival_at,
      client_request_id, customer_token_hash, minimum_advance_minutes,
      booking_horizon_days, slot_interval_minutes, default_table_capacity,
      planning_hold_minutes, reservation_preorder_edit_cutoff_minutes
    ) VALUES($1, $2, 'Khách gọi điện', '0911111111', 2, now() + interval '1 day',
      $3, repeat('a', 64), 30, 7, 15, 6, 180, 30)
  `, [reservationId, store, id(81)])
  return (await db.query(`
    SELECT append_reservation_event(
      $1, $2, NULL, 'owner', 'manual_created', '{}', '{}', 'Chủ quán tạo tay'
    ) AS value
  `, [reservationId, store])).rows[0].value
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
    INSERT INTO stores(id, name, zalo_oa_id, serving_hours) VALUES
      ('${store}', 'Bảo Lương', 'oa-a', '[{"open":"11:00","close":"22:00"}]'),
      ('${otherStore}', 'Quán khác', 'oa-b', '[{"open":"11:00","close":"22:00"}]');
    INSERT INTO store_workflow_settings(store_id) VALUES ('${store}'), ('${otherStore}');
  `)

  for (const migration of [
    '052_reservation_schema.sql',
    '053_reservation_customer_rpcs.sql',
    '059_reservation_owner_oa_notifications.sql',
    '059a_reservation_owner_oa_notification_indexes.sql',
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

test('booking khách tạo đúng một delivery; booking tạo tay không tạo delivery', async () => {
  await configureRecipient()
  const booking = await createCustomerBooking()
  const delivery = (await db.query(`
    SELECT d.*, e.actor_kind, e.event_type
    FROM reservation_notification_deliveries d
    JOIN reservation_events e ON e.id = d.reservation_event_id
    WHERE d.reservation_id = $1
  `, [booking.reservation_id])).rows
  assert.equal(delivery.length, 1)
  assert.equal(delivery[0].store_id, store)
  assert.equal(delivery[0].kind, 'owner_new_reservation')
  assert.equal(delivery[0].status, 'queued')
  assert.equal(delivery[0].actor_kind, 'customer')

  await insertManualEvent()
  assert.equal((await db.query(`
    SELECT count(*)::integer AS n FROM reservation_notification_deliveries
    WHERE reservation_id = $1
  `, [id(80)])).rows[0].n, 0)
})

test('enqueue idempotent theo event và vẫn audit action_required khi thiếu cấu hình', async () => {
  const booking = await createCustomerBooking(id(31))
  const row = (await db.query(`
    SELECT id, reservation_event_id, status, idempotency_key
    FROM reservation_notification_deliveries WHERE reservation_id = $1
  `, [booking.reservation_id])).rows[0]
  assert.equal(row.status, 'action_required')

  const replay = (await db.query(
    'SELECT enqueue_reservation_owner_notification($1) AS value',
    [row.reservation_event_id],
  )).rows[0].value
  assert.equal(replay, row.id)
  assert.equal((await db.query(`
    SELECT count(*)::integer AS n FROM reservation_notification_deliveries
    WHERE idempotency_key = $1
  `, [row.idempotency_key])).rows[0].n, 1)
})

test('anon/authenticated không đọc hoặc ghi trực tiếp recipient, challenge và delivery', async () => {
  for (const role of ['anon', 'authenticated']) {
    for (const table of [
      'store_zalo_notification_recipients',
      'zalo_oa_onboarding_challenges',
      'reservation_notification_deliveries',
    ]) {
      const privileges = (await db.query(`
        SELECT
          has_table_privilege($1, $2, 'SELECT') AS can_select,
          has_table_privilege($1, $2, 'INSERT') AS can_insert,
          has_table_privilege($1, $2, 'UPDATE') AS can_update
      `, [role, `public.${table}`])).rows[0]
      assert.deepEqual(privileges, { can_select: false, can_insert: false, can_update: false })
    }
  }
})

test('các khóa ngoại của outbox có index phủ để xử lý hàng đợi ổn định', async () => {
  const rows = (await db.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'store_zalo_notification_recipients_operator_user',
        'zalo_oa_onboarding_challenges_recipient_store',
        'zalo_oa_onboarding_challenges_created_by',
        'reservation_notification_deliveries_reservation_store',
        'reservation_notification_deliveries_event_store',
        'reservation_notification_deliveries_recipient_store'
      )
    ORDER BY indexname
  `)).rows.map((row) => row.indexname)

  assert.deepEqual(rows, [
    'reservation_notification_deliveries_event_store',
    'reservation_notification_deliveries_recipient_store',
    'reservation_notification_deliveries_reservation_store',
    'store_zalo_notification_recipients_operator_user',
    'zalo_oa_onboarding_challenges_created_by',
    'zalo_oa_onboarding_challenges_recipient_store',
  ])
})

test('recipient khác quán không thể gắn vào delivery', async () => {
  const otherRecipient = await configureRecipient(otherStore, 'oa-owner-b')
  const booking = await createCustomerBooking(id(32))
  const eventId = (await db.query(`
    SELECT id FROM reservation_events WHERE reservation_id = $1 AND event_type = 'created'
  `, [booking.reservation_id])).rows[0].id

  await rejected(() => db.query(`
    INSERT INTO reservation_notification_deliveries(
      store_id, reservation_id, reservation_event_id, recipient_id,
      kind, status, idempotency_key
    ) VALUES($1, $2, $3, $4, 'owner_new_reservation', 'queued', 'cross-store-test')
  `, [store, booking.reservation_id, eventId, otherRecipient]), /foreign key|violates/i)
})

test('claim cần đúng token, chỉ chạy một lần và không dùng recipient khác store', async () => {
  await configureRecipient()
  const booking = await createCustomerBooking(id(33))
  const delivery = (await db.query(`
    SELECT id, dispatch_token FROM reservation_notification_deliveries WHERE reservation_id = $1
  `, [booking.reservation_id])).rows[0]

  await db.exec('SET LOCAL ROLE service_role')
  const wrong = (await db.query(
    'SELECT claim_reservation_owner_notification($1, $2) AS value',
    [delivery.id, id(999)],
  )).rows[0].value
  assert.equal(wrong, null)
  const claimed = (await db.query(
    'SELECT claim_reservation_owner_notification($1, $2) AS value',
    [delivery.id, delivery.dispatch_token],
  )).rows[0].value
  assert.equal(claimed.store_id, store)
  assert.equal(claimed.reservation_id, booking.reservation_id)
  assert.equal(claimed.oa_user_id, 'oa-owner-a')
  assert.equal(claimed.customer_phone, '0900000000')
  const replay = (await db.query(
    'SELECT claim_reservation_owner_notification($1, $2) AS value',
    [delivery.id, delivery.dispatch_token],
  )).rows[0].value
  assert.equal(replay, null)
})

test('finish chỉ chốt delivery đang processing và chỉ nhận trạng thái kết thúc hợp lệ', async () => {
  await configureRecipient()
  const booking = await createCustomerBooking(id(34))
  const delivery = (await db.query(`
    SELECT id, dispatch_token FROM reservation_notification_deliveries WHERE reservation_id = $1
  `, [booking.reservation_id])).rows[0]

  await db.exec('SET LOCAL ROLE service_role')
  const beforeClaim = (await db.query(`
    SELECT finish_reservation_owner_notification($1, $2, 'sent', '0', 'message-1') AS value
  `, [delivery.id, delivery.dispatch_token])).rows[0].value
  assert.equal(beforeClaim, false)
  await db.query('SELECT claim_reservation_owner_notification($1, $2)', [delivery.id, delivery.dispatch_token])
  const finished = (await db.query(`
    SELECT finish_reservation_owner_notification($1, $2, 'sent', '0', 'message-1') AS value
  `, [delivery.id, delivery.dispatch_token])).rows[0].value
  assert.equal(finished, true)
  const retry = (await db.query(`
    SELECT finish_reservation_owner_notification($1, $2, 'failed', '-1', 'late retry') AS value
  `, [delivery.id, delivery.dispatch_token])).rows[0].value
  assert.equal(retry, false)
  await rejected(() => db.query(`
    SELECT finish_reservation_owner_notification($1, $2, 'queued', NULL, NULL)
  `, [delivery.id, delivery.dispatch_token]), /trạng thái kết thúc/i)
})

test('RPC nội bộ chỉ cấp service_role', async () => {
  const privileges = (await db.query(`
    SELECT
      has_function_privilege('anon', 'public.claim_reservation_owner_notification(uuid,uuid)', 'EXECUTE') AS anon_claim,
      has_function_privilege('authenticated', 'public.claim_reservation_owner_notification(uuid,uuid)', 'EXECUTE') AS auth_claim,
      has_function_privilege('service_role', 'public.claim_reservation_owner_notification(uuid,uuid)', 'EXECUTE') AS service_claim,
      has_function_privilege('anon', 'public.finish_reservation_owner_notification(uuid,uuid,text,text,text)', 'EXECUTE') AS anon_finish,
      has_function_privilege('service_role', 'public.finish_reservation_owner_notification(uuid,uuid,text,text,text)', 'EXECUTE') AS service_finish
  `)).rows[0]
  assert.deepEqual(privileges, {
    anon_claim: false,
    auth_claim: false,
    service_claim: true,
    anon_finish: false,
    service_finish: true,
  })
})
