import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const modulePath = process.env.PGLITE_MODULE
const { PGlite } = await import(modulePath ? (modulePath.startsWith('file:') ? modulePath : pathToFileURL(modulePath).href) : '@electric-sql/pglite')
const migration = new URL('../migrations/079_reservation_delivery_recovery.sql', import.meta.url)

async function setup(t) {
  const db = new PGlite(); t.after(() => db.close())
  const store = randomUUID(), delivery = randomUUID(), operator = randomUUID()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    CREATE TABLE stores(id uuid PRIMARY KEY);
    CREATE TABLE reservations(id uuid PRIMARY KEY, store_id uuid, status text, arrival_at timestamptz, customer_name text, party_size integer);
    CREATE TABLE reservation_events(id uuid PRIMARY KEY, store_id uuid, reservation_id uuid, actor_kind text, event_type text);
    CREATE TABLE mevo_operators(user_id uuid, store_id uuid, role text, is_active boolean);
    CREATE TABLE store_reservation_notification_channels(store_id uuid PRIMARY KEY, provider text, is_enabled boolean, destination_group_id text, updated_at timestamptz DEFAULT now());
    CREATE TABLE reservation_notification_deliveries(
      id uuid PRIMARY KEY, store_id uuid, reservation_id uuid, reservation_event_id uuid, recipient_id uuid, kind text, status text,
      idempotency_key text UNIQUE, dispatch_token uuid, attempt_count integer DEFAULT 0,
      processing_started_at timestamptz, last_attempt_at timestamptz, provider_code text, last_error text,
      delivery_provider text, destination_group_id text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE FUNCTION reservation_operator_actor_kind(uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'mevo' $$;
    INSERT INTO auth.users VALUES ('${operator}');
    INSERT INTO stores VALUES ('${store}');
    INSERT INTO reservations VALUES ('${randomUUID()}','${store}','pending',now()+interval '2 hours','Khách test',4);
    INSERT INTO store_reservation_notification_channels VALUES ('${store}','zca_group',true,'group-one',now());
  `)
  await db.exec(await readFile(migration, 'utf8'))
  return { db, store, delivery, operator }
}

test('delivery mới freeze payload bất biến và chỉ service role được freeze', async t => {
  const { db, store, delivery } = await setup(t)
  const reservation = (await db.query('SELECT id FROM reservations')).rows[0].id
  const token = randomUUID()
  await db.query(`INSERT INTO reservation_notification_deliveries(id,store_id,reservation_id,kind,status,idempotency_key,dispatch_token,delivery_provider,destination_group_id,recovery_version,message_snapshot,queued_at)
    VALUES($1,$2,$3,'owner_new_reservation','processing',$5,$4,'zca_group','group-one',1,$6::jsonb,now())`,
  [delivery, store, reservation, token, `key-${delivery}`, JSON.stringify({ version: 1, kind: 'owner_new_reservation', customer_name: 'Khách test', party_size: 4, arrival_at: '2030-01-01T04:00:00Z' })])
  await db.exec('SET LOCAL ROLE service_role')
  const first = (await db.query('SELECT freeze_reservation_zca_payload($1,$2,$3) AS value', [delivery, token, 'Nội dung đầu'])).rows[0].value
  const replay = (await db.query('SELECT freeze_reservation_zca_payload($1,$2,$3) AS value', [delivery, token, 'Nội dung khác'])).rows[0].value
  assert.equal(first.text, 'Nội dung đầu')
  assert.deepEqual(replay, first)
  await db.exec('RESET ROLE')
  const privileges = (await db.query(`SELECT
    has_function_privilege('anon','freeze_reservation_zca_payload(uuid,uuid,text)','execute') AS anon,
    has_function_privilege('authenticated','freeze_reservation_zca_payload(uuid,uuid,text)','execute') AS authenticated,
    has_function_privilege('service_role','freeze_reservation_zca_payload(uuid,uuid,text)','execute') AS service`)).rows[0]
  assert.deepEqual(privileges, { anon: false, authenticated: false, service: true })
})

test('requeue chỉ superadmin, một request id chỉ có một audit và legacy bị chặn', async t => {
  const { db, store, delivery, operator } = await setup(t)
  const reservation = (await db.query('SELECT id FROM reservations')).rows[0].id
  const old = randomUUID(), request = randomUUID()
  await db.query("UPDATE store_reservation_notification_channels SET retry_contract_verified_at=now(), retry_contract_evidence='relay revision test', retry_contract_version=1")
  await db.query(`INSERT INTO mevo_operators VALUES($1,NULL,'mevo_superadmin',true)`, [operator])
  await db.query(`INSERT INTO reservation_notification_deliveries(id,store_id,reservation_id,kind,status,idempotency_key,dispatch_token,delivery_provider,destination_group_id,recovery_version,message_snapshot,queued_at,updated_at)
    VALUES($1,$2,$3,'owner_new_reservation','failed',$5,$4,'zca_group','group-one',1,$6::jsonb,now()-interval '2 minutes',now()-interval '2 minutes')`,
  [delivery, store, reservation, old, `key-${delivery}`, JSON.stringify({ version: 1, kind: 'owner_new_reservation', customer_name: 'Khách test', party_size: 4, arrival_at: '2030-01-01T04:00:00Z' })])
  const updatedAt = (await db.query('SELECT updated_at FROM reservation_notification_deliveries WHERE id=$1', [delivery])).rows[0].updated_at
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${operator}',false)`)
  const first = (await db.query('SELECT requeue_reservation_zca_notification($1,$2,$3,$4,$5) AS value', [store, delivery, updatedAt, request, 'Relay hết kết nối'])).rows[0].value
  const replay = (await db.query('SELECT requeue_reservation_zca_notification($1,$2,$3,$4,$5) AS value', [store, delivery, updatedAt, request, 'Relay hết kết nối'])).rows[0].value
  assert.equal(first.ok, true); assert.equal(replay.already, true)
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM reservation_notification_recovery_events')).rows[0].n, 1)
  await assert.rejects(() => db.query('SELECT requeue_reservation_zca_notification($1,$2,$3,$4,$5)', [store, delivery, updatedAt, request, 'Lý do khác']), /Mã thao tác/)
})

test('đổi nhóm đích xóa bằng chứng retry để không gửi nhầm nhóm', async t => {
  const { db } = await setup(t)
  await db.query("UPDATE store_reservation_notification_channels SET retry_contract_verified_at=now(), retry_contract_evidence='relay revision test', retry_contract_version=1")
  await db.query("UPDATE store_reservation_notification_channels SET destination_group_id='group-two'")
  const channel = (await db.query('SELECT retry_contract_verified_at,retry_contract_evidence,retry_contract_version FROM store_reservation_notification_channels')).rows[0]
  assert.deepEqual(channel, { retry_contract_verified_at: null, retry_contract_evidence: null, retry_contract_version: null })
})
