// BL-3 Task 1 — RPC customer booking có thể khôi phục an toàn sau mất response.
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
const owner = id(12)

async function rejected(fn, message) {
  await db.exec('SAVEPOINT expected_error')
  await assert.rejects(fn, message)
  await db.exec('ROLLBACK TO SAVEPOINT expected_error')
}

async function localDate(days = 0) {
  return (await db.query(
    `SELECT to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + $1::integer, 'YYYY-MM-DD') AS value`,
    [days],
  )).rows[0].value
}

async function localArrival(days, time) {
  return (await db.query(
    `SELECT (($1::date + $2::time) AT TIME ZONE 'Asia/Ho_Chi_Minh') AS value`,
    [await localDate(days), time],
  )).rows[0].value
}

async function callAsAnon(sql, args) {
  await db.exec('SET LOCAL ROLE anon')
  return (await db.query(sql, args)).rows[0].value
}

async function prepare(requestId = id(100)) {
  return callAsAnon('SELECT prepare_reservation_request($1, $2) AS value', [store, requestId])
}

async function create(requestId, token, arrivalAt = null, overrides = {}) {
  return callAsAnon(
    'SELECT create_customer_reservation($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',
    [store, requestId, token, overrides.name ?? '  Nguyễn Văn A  ', overrides.phone ?? '0900000000',
      overrides.partySize ?? 4, arrivalAt ?? await localArrival(1, '19:00'), overrides.note ?? null, null,
    ],
  )
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
      LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT decode(md5(p_value) || md5('reservation-token:' || p_value), 'hex') $$;
    CREATE FUNCTION extensions.gen_random_bytes(p_length integer) RETURNS bytea
      LANGUAGE sql VOLATILE AS $$
        SELECT substring(decode(string_agg(md5(gen_random_uuid()::text), ''), 'hex') FROM 1 FOR p_length)
        FROM generate_series(1, ceil(p_length / 16.0)::integer)
      $$;

    CREATE TABLE stores (
      id uuid PRIMARY KEY, name text NOT NULL, is_active boolean NOT NULL DEFAULT true,
      is_accepting_orders boolean NOT NULL DEFAULT true, serving_hours jsonb NOT NULL DEFAULT '[]'::jsonb
    );
    CREATE TABLE tables (
      id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id), table_number text NOT NULL,
      is_active boolean NOT NULL DEFAULT true, UNIQUE(id, store_id)
    );
    CREATE TABLE table_sessions (id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id), table_id uuid NOT NULL REFERENCES tables(id), status text NOT NULL DEFAULT 'open');
    CREATE TABLE store_workflow_settings (
      store_id uuid PRIMARY KEY REFERENCES stores(id), reservations_enabled boolean NOT NULL DEFAULT true,
      reservation_preorder_enabled boolean NOT NULL DEFAULT true, minimum_advance_minutes integer NOT NULL DEFAULT 30,
      booking_horizon_days integer NOT NULL DEFAULT 7, slot_interval_minutes integer NOT NULL DEFAULT 15,
      default_table_capacity integer NOT NULL DEFAULT 6, planning_hold_minutes integer NOT NULL DEFAULT 180,
      reservation_preorder_edit_cutoff_minutes integer NOT NULL DEFAULT 30
    );
    CREATE TABLE mevo_operators (user_id uuid PRIMARY KEY REFERENCES auth.users(id), store_id uuid, role text NOT NULL, is_active boolean NOT NULL DEFAULT true);
    CREATE FUNCTION is_store_scoped_operator(p_store_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM mevo_operators WHERE user_id=auth.uid() AND store_id=p_store_id AND is_active) $$;
    CREATE PUBLICATION supabase_realtime;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
    INSERT INTO stores(id,name,serving_hours) VALUES ('${store}','Bảo Lương','[{"open":"11:00","close":"22:00"}]');
    INSERT INTO store_workflow_settings(store_id) VALUES ('${store}');
    INSERT INTO auth.users(id) VALUES ('${owner}');
    INSERT INTO mevo_operators(user_id,store_id,role) VALUES ('${owner}','${store}','store_owner');
  `)

  for (const file of ['052_reservation_schema.sql', '053_reservation_customer_rpcs.sql', '065_reservation_customer_access.sql']) {
    const migration = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')
    await db.exec(migration)
    if (file === '065_reservation_customer_access.sql') await db.exec(migration)
  }
})

beforeEach(async () => { await db.exec('BEGIN') })
afterEach(async () => { await db.exec('ROLLBACK'); await db.exec('RESET ROLE') })
after(async () => { await db.close() })

test('prepare chỉ tạo intent kín, không booking/event và không đọc trực tiếp được', async () => {
  const requestId = id(101)
  const intent = await prepare(requestId)
  assert.match(intent.customer_token, /^[0-9a-f]{64}$/)
  assert.ok(Date.parse(intent.expires_at) > Date.now())
  await db.exec('RESET ROLE')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM reservations')).rows[0].n, 0)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM reservation_events')).rows[0].n, 0)
  await db.exec('RESET ROLE')
  await db.exec('SET LOCAL ROLE anon')
  await rejected(() => db.query('SELECT * FROM reservation_customer_requests'), /permission denied/)
  await rejected(() => db.query('INSERT INTO reservation_customer_requests(store_id,client_request_id,token_hash,expires_at) VALUES($1,$2,repeat(\'a\',64),now())', [store, requestId]), /permission denied/)
  await rejected(() => db.query('UPDATE reservation_customer_requests SET token_hash=repeat(\'b\',64) WHERE store_id=$1', [store]), /permission denied/)
})

test('prepare lặp không trả lại token; cần request ID mới nếu response prepare bị mất', async () => {
  const requestId = id(106)
  const first = await prepare(requestId)
  const retry = await prepare(requestId)
  assert.equal(retry.customer_token, null)
  assert.equal(retry.already_prepared, true)
  assert.notEqual(first.customer_token, retry.customer_token)
})

test('create retry sau mất response khôi phục cùng booking và chỉ ghi một event', async () => {
  const requestId = id(102)
  const intent = await prepare(requestId)
  const first = await create(requestId, intent.customer_token)
  const replay = await create(requestId, intent.customer_token)
  await db.exec('RESET ROLE')
  assert.equal(first.created, true)
  assert.equal(replay.created, false)
  assert.equal(first.reservation.reservation_id, replay.reservation.reservation_id)
  assert.equal('customer_token' in first, false)
  assert.equal('customer_token_hash' in first.reservation, false)
  assert.equal((await db.query("SELECT count(*)::int AS n FROM reservation_events WHERE event_type='created'")).rows[0].n, 1)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM reservations')).rows[0].n, 1)
})

test('sai token và RPC create cũ không thể replay để đọc dữ liệu khách', async () => {
  const requestId = id(103)
  const intent = await prepare(requestId)
  await create(requestId, intent.customer_token)
  await rejected(() => create(requestId, 'f'.repeat(64)), /Không có quyền/)
  assert.equal((await db.query("SELECT has_function_privilege('anon','create_reservation(uuid,text,text,integer,timestamptz,text,text,uuid)','EXECUTE') AS allowed")).rows[0].allowed, false)
  await db.exec('RESET ROLE')
  await db.exec('SET LOCAL ROLE anon')
  const arrivalAt = await localArrival(1, '19:00')
  await rejected(() => db.query('SELECT create_reservation($1,$2,$3,$4,$5,$6,$7,$8)', [store,'Attacker','0900000',2,arrivalAt,null,null,requestId]), /permission denied/)
})

test('slot qua đêm thuộc đúng ngày lịch HCM, có thứ tự; horizon là 7 ngày lịch', async () => {
  await db.query("UPDATE stores SET serving_hours='[{\"open\":\"22:00\",\"close\":\"02:00\"}]' WHERE id=$1", [store])
  const date = await localDate(1)
  const slots = (await db.query('SELECT get_reservation_slots($1,$2::date) AS value', [store,date])).rows[0].value
  assert.ok(slots.some((slot) => slot.local_time === '00:15'))
  assert.ok(slots.some((slot) => slot.local_time === '23:45'))
  const localDates = await db.query(
    `SELECT array_agg(((slot->>'arrival_at')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text) AS values
     FROM jsonb_array_elements($1::jsonb) AS slot`, [JSON.stringify(slots)],
  )
  assert.ok(localDates.rows[0].values.every((slotDate) => slotDate === date))
  const instants = slots.map((slot) => Date.parse(slot.arrival_at))
  assert.deepEqual(instants, [...new Set(instants)].sort((a,b) => a-b))
  const config = (await db.query('SELECT get_public_reservation_config($1) AS value', [store])).rows[0].value
  assert.equal(config.timezone, 'Asia/Ho_Chi_Minh')
  assert.equal(config.maximum_date, await localDate(6))
  const beyond = await db.query('SELECT get_reservation_slots($1,$2::date) AS value', [store, await localDate(7)])
  assert.deepEqual(beyond.rows[0].value, [])
})

test('config công khai không phụ thuộc giờ mở hiện tại và snapshot booking không đổi', async () => {
  await db.query('UPDATE stores SET is_accepting_orders=false WHERE id=$1', [store])
  const config = (await db.query('SELECT get_public_reservation_config($1) AS value', [store])).rows[0].value
  assert.equal(config.reservations_enabled, true)
  assert.equal(config.preorder_enabled, true)
  await db.exec('RESET ROLE')
  const requestId = id(104)
  const intent = await prepare(requestId)
  const created = await create(requestId, intent.customer_token)
  const deadlineBefore = created.reservation.preorder_edit_deadline
  await db.exec('RESET ROLE')
  await db.query('UPDATE store_workflow_settings SET reservation_preorder_edit_cutoff_minutes=60 WHERE store_id=$1', [store])
  const reread = (await db.query('SELECT get_customer_reservation($1,$2) AS value', [created.reservation.reservation_id,intent.customer_token])).rows[0].value
  assert.equal(reread.preorder_edit_deadline, deadlineBefore)
  assert.equal(reread.server_now !== undefined, true)
  assert.equal(reread.can_cancel, true)
})

test('yêu cầu đổi chờ quán không biến thành xác nhận và khóa gửi yêu cầu đổi trùng', async () => {
  const requestId = id(108)
  const intent = await prepare(requestId)
  const created = await create(requestId, intent.customer_token)
  await db.exec('RESET ROLE')
  await db.query("UPDATE reservations SET requested_arrival_at=arrival_at + interval '1 hour', requested_party_size=5 WHERE id=$1", [created.reservation.reservation_id])
  const reread = (await db.query('SELECT get_customer_reservation($1,$2) AS value', [created.reservation.reservation_id,intent.customer_token])).rows[0].value
  assert.equal(reread.status, 'pending')
  assert.equal(reread.has_change_request, true)
  assert.equal(reread.can_request_change, false)
  assert.equal(reread.customer_message, 'Yêu cầu đổi đang chờ quán xác nhận; lịch cũ vẫn còn hiệu lực')
})

test('hủy thành công trả projection trạng thái mới, không lộ hash hoặc note vận hành', async () => {
  const requestId = id(110)
  const intent = await prepare(requestId)
  const created = await create(requestId, intent.customer_token)
  await db.exec('RESET ROLE; SET LOCAL ROLE anon')
  const cancelled = (await db.query('SELECT cancel_customer_reservation($1,$2,$3) AS value',
    [created.reservation.reservation_id,intent.customer_token,'Đổi kế hoạch'])).rows[0].value
  assert.equal(cancelled.status, 'cancelled_by_customer')
  assert.equal(cancelled.can_cancel, false)
  assert.equal(cancelled.customer_message, 'Đặt bàn đã kết thúc. Vui lòng gọi quán nếu cần hỗ trợ.')
  assert.equal('customer_token_hash' in cancelled, false)
})

test('migration giữ nguyên các loại audit của Snooze và điều chỉnh POS hiện có', async () => {
  const requestId = id(111)
  const intent = await prepare(requestId)
  const created = await create(requestId, intent.customer_token)
  await db.exec('RESET ROLE')
  for (const eventType of ['reminder_snoozed', 'rescheduled_by_store']) {
    await db.query('SELECT append_reservation_event($1,$2,NULL,$3,$4,$5,$6,$7)',
      [created.reservation.reservation_id,store,'owner',eventType,{}, {}, null])
  }
  assert.equal((await db.query("SELECT count(*)::int AS n FROM reservation_events WHERE event_type IN ('reminder_snoozed','rescheduled_by_store')")).rows[0].n, 2)
})

test('tắt nhận booking mới không chặn sửa booking cũ theo snapshot giờ/giới hạn', async () => {
  const requestId = id(109)
  const intent = await prepare(requestId)
  const created = await create(requestId, intent.customer_token)
  const nextArrival = await localArrival(2, '19:15')
  await db.exec('RESET ROLE')
  await db.query("UPDATE stores SET serving_hours='[{\"open\":\"22:00\",\"close\":\"02:00\"}]', is_accepting_orders=false WHERE id=$1", [store])
  await db.query('UPDATE store_workflow_settings SET reservations_enabled=false, slot_interval_minutes=30 WHERE store_id=$1', [store])
  await db.exec('SET LOCAL ROLE anon')
  const changed = await db.query('SELECT request_reservation_change($1,$2,$3,$4,$5) AS value',
    [created.reservation.reservation_id,intent.customer_token,nextArrival,5,'Xin đổi giờ'])
  assert.equal(Date.parse(changed.rows[0].value.requested_arrival_at), Date.parse(nextArrival))
  assert.equal(changed.rows[0].value.has_change_request, true)
})

test('chỉ chủ đúng quán được thu hồi token và lần thu hồi để lại audit', async () => {
  const requestId = id(105)
  const intent = await prepare(requestId)
  const created = await create(requestId, intent.customer_token)
  await db.exec('RESET ROLE; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.sub" = ' + `'${owner}'`)
  const result = (await db.query('SELECT revoke_reservation_customer_access($1,$2) AS value', [created.reservation.reservation_id,'Khách báo mất thiết bị'])).rows[0].value
  assert.equal(result.revoked, true)
  assert.equal((await db.query("SELECT count(*)::int AS n FROM reservation_events WHERE event_type='customer_access_revoked'")).rows[0].n, 1)
  await db.exec('RESET ROLE; SET LOCAL ROLE anon')
  await rejected(() => db.query('SELECT get_customer_reservation($1,$2)', [created.reservation.reservation_id,intent.customer_token]), /Không có quyền/)
  await rejected(() => create(requestId,intent.customer_token), /Không có quyền/)
})

test('authenticated không có operator không thể thu hồi quyền khách', async () => {
  const requestId = id(107)
  const intent = await prepare(requestId)
  const created = await create(requestId, intent.customer_token)
  await db.exec('RESET ROLE; SET LOCAL ROLE authenticated')
  await rejected(
    () => db.query('SELECT revoke_reservation_customer_access($1,$2)', [created.reservation.reservation_id,'không có quyền']),
    /Chỉ chủ đúng quán/,
  )
})
