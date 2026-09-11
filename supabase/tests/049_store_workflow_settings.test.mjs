// Chạy với Node: PGLITE_MODULE trỏ tới module PGlite đã cài trong admin-web.
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
const otherOwner = id(2)
const staff = id(3)
const superadmin = id(4)
const pubu = id(10)
const baoLuong = id(11)
const otherStore = id(12)
const session = id(20)
const order = id(30)

const validPayload = {
  payment_timing: 'postpay',
  payment_methods: ['cash'],
  is_accepting_orders: true,
  serving_hours: [],
  table_ordering_enabled: true,
  takeaway_enabled: false,
  shipping_enabled: false,
  reservations_enabled: true,
  reservation_preorder_enabled: true,
  minimum_advance_minutes: 30,
  booking_horizon_days: 7,
  slot_interval_minutes: 15,
  default_table_capacity: 6,
  planning_hold_minutes: 180,
  kitchen_release_policy: 'pos_confirmation',
  staff_order_release_policy: 'pos_confirmation',
  open_ordering_on_arrival: true,
  table_session_idle_timeout_minutes: 360,
  reservation_preorder_edit_cutoff_minutes: 30,
}

async function login(uid) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid])
  await db.exec('SET LOCAL ROLE authenticated')
}

async function rejected(fn, message) {
  await db.exec('SAVEPOINT bad_input')
  await assert.rejects(fn, message)
  await db.exec('ROLLBACK TO SAVEPOINT bad_input')
}

async function workflow(storeId) {
  return (await db.query('SELECT get_public_store_workflow($1) AS value', [storeId])).rows[0].value
}

async function internalWorkflow(storeId) {
  return (await db.query('SELECT get_store_workflow_settings($1) AS value', [storeId])).rows[0].value
}

async function update(storeId, payload, changedVia = 'owner') {
  return (await db.query(
    'SELECT update_store_workflow_settings($1, $2::jsonb, $3) AS value',
    [storeId, JSON.stringify(payload), changedVia],
  )).rows[0].value
}

before(async () => {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    CREATE TABLE stores (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      slug text NOT NULL UNIQUE,
      is_active boolean NOT NULL DEFAULT true,
      payment_timing text NOT NULL DEFAULT 'prepay',
      payment_methods text[] NOT NULL DEFAULT ARRAY['zalo_checkout']::text[],
      is_accepting_orders boolean NOT NULL DEFAULT true,
      serving_hours jsonb NOT NULL DEFAULT '[]'::jsonb
    );
    CREATE TABLE mevo_operators (
      user_id uuid PRIMARY KEY,
      store_id uuid REFERENCES stores(id),
      role text NOT NULL,
      is_active boolean NOT NULL DEFAULT true
    );
    CREATE TABLE table_sessions (
      id uuid PRIMARY KEY,
      store_id uuid NOT NULL REFERENCES stores(id),
      status text NOT NULL DEFAULT 'open'
    );
    CREATE TABLE orders (
      id uuid PRIMARY KEY,
      store_id uuid NOT NULL REFERENCES stores(id),
      session_id uuid,
      status text NOT NULL DEFAULT 'pending',
      order_type text NOT NULL DEFAULT 'dine_in'
    );

    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
    GRANT SELECT ON mevo_operators TO authenticated;
  `)

  await db.query(`
    INSERT INTO stores(id, name, slug, payment_timing, payment_methods)
    VALUES
      ($1, 'Phở Gà Pubu', 'pho-ga-pubu', 'prepay', ARRAY['zalo_checkout']),
      ($2, 'Bia lẩu Bảo Lương', 'bia-lau-bao-luong', 'prepay', ARRAY['zalo_checkout']),
      ($3, 'Quán tương thích cũ', 'quan-tuong-thich-cu', 'postpay', ARRAY['cash'])
  `, [pubu, baoLuong, otherStore])
  await db.query(`
    INSERT INTO mevo_operators(user_id, store_id, role, is_active)
    VALUES
      ($1, $5, 'store_owner', true),
      ($2, $6, 'store_owner', true),
      ($3, $5, 'store_staff', true),
      ($4, NULL, 'mevo_superadmin', true)
  `, [owner, otherOwner, staff, superadmin, pubu, otherStore])

  const migration = await readFile(
    new URL('../migrations/049_store_workflow_settings.sql', import.meta.url),
    'utf8',
  )
  await db.exec(migration)
  await db.exec(migration) // Chạy lại phải an toàn và không ghi audit giả.
})

beforeEach(async () => {
  await db.exec('BEGIN')
  await db.query("SELECT set_config('request.jwt.claim.sub', '', false)")
})

afterEach(async () => {
  await db.exec('ROLLBACK')
  await db.exec('RESET ROLE')
})

after(async () => {
  await db.close()
})

test('backfill Pubu và Bảo Lương đúng policy, quán khác giữ default tương thích', async () => {
  const p = await workflow(pubu)
  assert.equal(p.payment_timing, 'prepay')
  assert.equal(p.table_ordering_enabled, true)
  assert.equal(p.takeaway_enabled, true)
  assert.equal(p.shipping_enabled, true)
  assert.equal(p.reservations_enabled, false)
  assert.equal(p.kitchen_release_policy, 'automatic')
  assert.equal(p.staff_order_release_policy, 'automatic')

  const b = await workflow(baoLuong)
  assert.equal(b.payment_timing, 'postpay')
  assert.deepEqual(b.payment_methods, ['cash'])
  assert.equal(b.table_ordering_enabled, true)
  assert.equal(b.takeaway_enabled, false)
  assert.equal(b.shipping_enabled, false)
  assert.equal(b.reservations_enabled, true)
  assert.equal(b.reservation_preorder_enabled, true)
  assert.equal(b.kitchen_release_policy, 'pos_confirmation')
  assert.equal(b.staff_order_release_policy, 'pos_confirmation')

  const other = await workflow(otherStore)
  assert.equal(other.payment_timing, 'postpay')
  assert.equal(other.takeaway_enabled, true)
  assert.equal(other.shipping_enabled, true)
  assert.equal(other.kitchen_release_policy, 'automatic')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM store_workflow_setting_events')).rows[0].n, 0)
})

test('quán tạo sau migration tự có workflow tương thích Pubu', async () => {
  const newStore = id(13)
  await db.query(`
    INSERT INTO stores(id, name, slug)
    VALUES($1, 'Quán mới', 'quan-moi')
  `, [newStore])
  const value = await workflow(newStore)
  assert.equal(value.payment_timing, 'prepay')
  assert.equal(value.table_ordering_enabled, true)
  assert.equal(value.takeaway_enabled, true)
  assert.equal(value.shipping_enabled, true)
  assert.equal(value.kitchen_release_policy, 'automatic')
})

test('public reader không lộ audit hay operator', async () => {
  await db.exec('SET LOCAL ROLE anon')
  const value = (await db.query(
    'SELECT get_public_store_workflow($1) AS value',
    [pubu],
  )).rows[0].value
  assert.equal(value.store_id, undefined)
  assert.equal(value.updated_at, undefined)
  assert.equal(value.updated_by, undefined)
  assert.equal(value.changed_by, undefined)
  assert.equal(value.payment_timing, 'prepay')
})

test('reader nội bộ chỉ cho owner quán mình và superadmin', async () => {
  await login(owner)
  assert.equal((await internalWorkflow(pubu)).payment_timing, 'prepay')
  await rejected(() => internalWorkflow(otherStore), /Chỉ được xem quán của mình/)

  await login(superadmin)
  assert.equal((await internalWorkflow(otherStore)).payment_timing, 'postpay')

  await login(staff)
  await rejected(() => internalWorkflow(pubu), /Chỉ chủ quán/)
})

test('owner chỉ sửa quán mình; staff và owner khác bị chặn', async () => {
  await login(owner)
  await rejected(
    () => update(otherStore, validPayload),
    /Chỉ được sửa quán của mình/,
  )

  await login(otherOwner)
  await rejected(
    () => update(pubu, validPayload),
    /Chỉ được sửa quán của mình/,
  )

  await login(staff)
  await rejected(
    () => update(pubu, validPayload),
    /Chỉ chủ quán/,
  )
})

test('RPC cập nhật nguyên tử và ghi đúng một event', async () => {
  await login(owner)
  const beforeValue = await workflow(pubu)
  const saved = await update(pubu, validPayload)
  assert.deepEqual(saved, validPayload)
  assert.deepEqual(await workflow(pubu), saved)

  const events = (await db.query(`
    SELECT before_value, after_value, changed_by, changed_via
    FROM store_workflow_setting_events
    WHERE store_id = $1
  `, [pubu])).rows
  assert.equal(events.length, 1)
  assert.deepEqual(events[0].before_value, beforeValue)
  assert.deepEqual(events[0].after_value, saved)
  assert.equal(events[0].changed_by, owner)
  assert.equal(events[0].changed_via, 'owner')

  await rejected(
    () => update(pubu, { ...validPayload, slot_interval_minutes: -1 }),
    /Bước chọn giờ/,
  )
  assert.deepEqual(await workflow(pubu), saved)
  assert.equal((await db.query(`
    SELECT count(*)::int AS n FROM store_workflow_setting_events WHERE store_id = $1
  `, [pubu])).rows[0].n, 1)
})

test('RPC bắt buộc full snapshot đúng key và validate giờ phục vụ', async () => {
  await login(owner)
  const beforeValue = await workflow(pubu)
  const { slot_interval_minutes: _missing, ...partial } = validPayload
  await rejected(() => update(pubu, partial), /Thiếu cấu hình/)
  await rejected(
    () => update(pubu, { ...validPayload, khong_duoc_ho_tro: true }),
    /Cấu hình không hỗ trợ/,
  )
  await rejected(
    () => update(pubu, {
      ...validPayload,
      serving_hours: [{ open: '25:00', close: '02:00' }],
    }),
    /Giờ phục vụ/,
  )
  assert.deepEqual(await workflow(pubu), beforeValue)
})

test('superadmin dùng nguồn mevo và client không thể giả nhãn audit', async () => {
  await login(superadmin)
  const saved = await update(otherStore, validPayload, 'mevo')
  assert.equal(saved.reservations_enabled, true)
  const event = (await db.query(`
    SELECT changed_by, changed_via
    FROM store_workflow_setting_events
    WHERE store_id = $1
  `, [otherStore])).rows[0]
  assert.equal(event.changed_by, superadmin)
  assert.equal(event.changed_via, 'mevo')
  await rejected(
    () => update(otherStore, validPayload, 'owner'),
    /Nguồn thay đổi không hợp lệ/,
  )

  await login(owner)
  await rejected(
    () => update(pubu, validPayload, 'mevo'),
    /Nguồn thay đổi không hợp lệ/,
  )
})

test('đổi policy nguy hiểm bị chặn khi còn phiên mở', async () => {
  await db.query(
    'INSERT INTO table_sessions(id, store_id, status) VALUES($1, $2, $3)',
    [session, pubu, 'open'],
  )
  await login(owner)
  await rejected(
    () => update(pubu, { ...validPayload, kitchen_release_policy: 'pos_confirmation' }),
    /Còn phiên đang hoạt động/,
  )
})

test('đổi policy nguy hiểm bị chặn khi còn đơn chờ xử lý', async () => {
  await db.query(`
    INSERT INTO orders(id, store_id, status, order_type)
    VALUES($1, $2, 'pending', 'dine_in')
  `, [order, pubu])
  await login(owner)
  await rejected(
    () => update(pubu, validPayload),
    /Còn đơn đang hoạt động/,
  )
})

test('RLS chỉ cho owner/superadmin đọc và không cho ghi trực tiếp', async () => {
  await login(owner)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM store_workflow_settings')).rows[0].n, 1)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM store_workflow_setting_events')).rows[0].n, 0)
  await rejected(
    () => db.query('UPDATE store_workflow_settings SET takeaway_enabled = false WHERE store_id = $1', [pubu]),
    /permission denied/,
  )

  await login(superadmin)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM store_workflow_settings')).rows[0].n, 3)
  await rejected(
    () => db.query(`
      INSERT INTO store_workflow_setting_events(
        store_id, before_value, after_value, changed_by, changed_via
      ) VALUES($1, '{}'::jsonb, '{}'::jsonb, $2, 'mevo')
    `, [pubu, superadmin]),
    /permission denied/,
  )
})

test('capability chặn Mang về/Ship của Bảo Lương và giữ đủ ba kênh Pubu', async () => {
  for (const orderType of ['dine_in', 'pickup', 'delivery']) {
    await db.query('SELECT assert_order_channel_enabled($1, $2)', [pubu, orderType])
  }
  await rejected(
    () => db.query("SELECT assert_order_channel_enabled($1, 'pickup')", [baoLuong]),
    /Quán hiện không nhận đơn Mang về/,
  )
  await rejected(
    () => db.query("SELECT assert_order_channel_enabled($1, 'delivery')", [baoLuong]),
    /Quán hiện không nhận đơn Ship/,
  )
  await db.query("SELECT assert_order_channel_enabled($1, 'dine_in')", [baoLuong])
})

test('trigger trên orders không cho đường ghi khác bypass capability', async () => {
  await rejected(
    () => db.query(`
      INSERT INTO orders(id, store_id, status, order_type)
      VALUES($1, $2, 'pending', 'pickup')
    `, [order, baoLuong]),
    /Quán hiện không nhận đơn Mang về/,
  )
  assert.equal((await db.query('SELECT count(*)::int AS n FROM orders WHERE id = $1', [order])).rows[0].n, 0)
})
