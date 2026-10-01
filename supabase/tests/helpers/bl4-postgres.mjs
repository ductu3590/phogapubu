import { createRequire } from 'node:module'
import os from 'node:os'
import { loadBl4TestEnvironment } from '../../../scripts/bl4-test-env.mjs'
const require = createRequire(new URL('../../../admin-web/package.json', import.meta.url))
const { Client } = require('pg')

const TEST_MARKER = 'mevo_bl4_test_database'

function hostnameOf(value) {
  return new URL(value).hostname
}

export function requireTestDatabaseUrl() {
  loadBl4TestEnvironment()
  const value = process.env.BL4_TEST_DATABASE_URL
  if (!value) throw new Error('BLOCKED: thiếu BL4_TEST_DATABASE_URL; không chạy concurrency trên database thật.')
  const host = hostnameOf(value)
  const allowedHost = process.env.BL4_TEST_ALLOWED_HOST
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host)
  if (!loopback && host !== allowedHost) {
    throw new Error(`BLOCKED: hostname PostgreSQL chưa được cho phép (${host}); cần BL4_TEST_ALLOWED_HOST khớp chính xác.`)
  }
  return value
}

export async function openTestDatabase() {
  const connectionString = requireTestDatabaseUrl()
  const observer = new Client({ connectionString })
  await observer.connect()
  const marker = await observer.query(`
    SELECT marker
    FROM bl4_test.database_marker
    WHERE marker = $1
  `, [TEST_MARKER]).catch(() => ({ rows: [] }))
  if (marker.rows.length !== 1) {
    await observer.end()
    throw new Error(`BLOCKED: database không có marker ${TEST_MARKER}; refuse chạy fixture.`)
  }
  const connectActor = async ({ userId, role }) => {
    if (!['anon', 'authenticated', 'service_role'].includes(role)) throw new Error(`role test không hợp lệ: ${role}`)
    const client = new Client({ connectionString, application_name: `mevo-bl4-${os.hostname()}-${role}` })
    await client.connect()
    await client.query(`SET ROLE ${role}`)
    await client.query('SELECT set_config($1, $2, false)', ['request.jwt.claim.sub', userId ?? ''])
    await client.query('SELECT set_config($1, $2, false)', ['request.jwt.claim.role', role])
    return client
  }
  return {
    observer,
    connectActor,
    close: async () => observer.end(),
  }
}

export async function waitForBlock(observer, blockedPid, blockerPid, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await observer.query(`
      SELECT 1
      FROM pg_stat_activity blocked
      WHERE blocked.pid = $1
        AND $2 = ANY(pg_blocking_pids(blocked.pid))
    `, [blockedPid, blockerPid])
    if (result.rowCount === 1) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`Không quan sát được pg_blocking_pids(${blockedPid}, ${blockerPid}) trong ${timeoutMs}ms`)
}

async function cleanupBl4Store(client, storeId, ownerId) {
  await client.query('BEGIN')
  try {
    await client.query(`
      DELETE FROM reservation_notification_recovery_events
      WHERE store_id = $1
    `, [storeId])
    await client.query(`
      DELETE FROM reservation_notification_deliveries
      WHERE store_id = $1
    `, [storeId])
    await client.query(`
      DELETE FROM store_reservation_notification_channels
      WHERE store_id = $1
    `, [storeId])
    await client.query('DELETE FROM reservation_customer_call_tasks WHERE store_id = $1', [storeId])
    await client.query('DELETE FROM reservation_preorder_waste_resolutions WHERE store_id = $1', [storeId])
    await client.query('DELETE FROM reservation_preorder_print_jobs WHERE store_id = $1', [storeId])
    await client.query('DELETE FROM orders WHERE store_id = $1', [storeId])
    await client.query('DELETE FROM reservations WHERE store_id = $1', [storeId])
    await client.query(`
      DELETE FROM session_tables
      WHERE session_id IN (SELECT id FROM table_sessions WHERE store_id = $1)
    `, [storeId])
    await client.query('DELETE FROM table_sessions WHERE store_id = $1', [storeId])
    await client.query('DELETE FROM mevo_operators WHERE user_id = $1 AND store_id = $2', [ownerId, storeId])
    await client.query('DELETE FROM menu_items WHERE store_id = $1', [storeId])
    await client.query('DELETE FROM tables WHERE store_id = $1', [storeId])
    await client.query('DELETE FROM stores WHERE id = $1', [storeId])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

export async function seedBl4Fixture(database) {
  const client = database.observer
  const ownerId = process.env.BL4_TEST_OWNER_ID
  if (!ownerId) throw new Error('BLOCKED: thiếu BL4_TEST_OWNER_ID; lấy UUID user test trong Authentication → Users.')

  // Một lần test cũ có thể đã tạo fixture nhưng vấp ở cleanup. Chỉ thu hồi
  // đúng store BL4 do owner test này sở hữu, trong DB đã qua marker gate phía trên.
  const staleFixtures = await client.query(`
    SELECT s.id
    FROM stores s
    JOIN mevo_operators op ON op.store_id = s.id
    WHERE op.user_id = $1
      AND op.role = 'store_owner'
      AND s.name = 'BL4 Test Store'
      AND s.slug LIKE 'bl4-%'
      AND EXISTS (SELECT 1 FROM tables t WHERE t.store_id = s.id AND t.table_number LIKE 'BL4-%')
      AND NOT EXISTS (SELECT 1 FROM tables t WHERE t.store_id = s.id AND t.table_number NOT LIKE 'BL4-%')
      AND EXISTS (SELECT 1 FROM menu_items m WHERE m.store_id = s.id AND m.name = 'Món kiểm thử BL4')
      AND NOT EXISTS (SELECT 1 FROM menu_items m WHERE m.store_id = s.id AND m.name <> 'Món kiểm thử BL4')
  `, [ownerId])
  for (const stale of staleFixtures.rows) {
    await cleanupBl4Store(client, stale.id, ownerId)
    console.warn(`Recovered stale BL4 test fixture ${stale.id}`)
  }

  const ids = (await client.query(`
    SELECT gen_random_uuid() AS store_id,
           ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 8)) AS table_ids,
           gen_random_uuid() AS menu_item_id,
           $1::uuid AS owner_id, gen_random_uuid() AS reservation_id
  `, [ownerId])).rows[0]
  const tableId = ids.table_ids[0]
  await client.query('BEGIN')
  try {
    await client.query(`
      INSERT INTO stores(id, name, slug, payment_methods, payment_timing)
      VALUES ($1, 'BL4 Test Store', $2, ARRAY['cash']::text[], 'postpay')
    `, [ids.store_id, `bl4-${ids.store_id}`])
    await client.query(`
      INSERT INTO tables(id, store_id, table_number)
      SELECT table_id, $1, 'BL4-' || ordinal::text
      FROM unnest($2::uuid[]) WITH ORDINALITY AS seeded(table_id, ordinal)
    `, [ids.store_id, ids.table_ids])
    await client.query(`
      INSERT INTO menu_items(id, store_id, name, price, is_available)
      VALUES ($1, $2, 'Món kiểm thử BL4', 10000, true)
    `, [ids.menu_item_id, ids.store_id])
    await client.query(`
      INSERT INTO mevo_operators(user_id, store_id, role, is_active)
      VALUES ($1, $2, 'store_owner', true)
    `, [ids.owner_id, ids.store_id])
    await client.query(`
      INSERT INTO store_workflow_settings(store_id)
      VALUES ($1)
      ON CONFLICT (store_id) DO NOTHING
    `, [ids.store_id])
    await client.query(`
      INSERT INTO reservations(
        id, store_id, status, customer_name, customer_phone, party_size,
        arrival_at, client_request_id, customer_token_hash,
        minimum_advance_minutes, booking_horizon_days, slot_interval_minutes,
        default_table_capacity, planning_hold_minutes,
        reservation_preorder_edit_cutoff_minutes
      ) VALUES (
        $1, $2, 'pending', 'BL4 Test', '0900000000', 2,
        now() + interval '2 hours', gen_random_uuid(), encode(extensions.digest(repeat('a', 64), 'sha256'), 'hex'),
        30, 7, 15, 6, 180, 30
      )
    `, [ids.reservation_id, ids.store_id])
    await client.query(`
      UPDATE store_workflow_settings
      SET reservations_enabled = true,
          reservation_preorder_enabled = true,
          table_ordering_enabled = true
      WHERE store_id = $1
    `, [ids.store_id])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
  return {
    ...ids,
    table_id: tableId,
    otherStoreId: null,
    staffId: null,
    superadminId: null,
    customerToken: 'a'.repeat(64),
    preorderId: null,
    orderId: null,
    tableIds: [tableId],
    allTableIds: ids.table_ids,
    cleanup: () => cleanupBl4Store(client, ids.store_id, ids.owner_id),
  }
}
