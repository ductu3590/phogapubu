import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { openTestDatabase, seedBl4Fixture, waitForBlock } from './helpers/bl4-postgres.mjs'

const db = await openTestDatabase()
let fixture
let first
let second
try {
  fixture = await seedBl4Fixture(db)
  const now = (await db.observer.query('SELECT now() AS value')).rows[0].value
  const deliveryId = randomUUID(), eventId = randomUUID(), requestId = randomUUID(), token = randomUUID()
  // mevo_operators dùng user_id làm khóa chính: tạm nâng đúng fixture owner,
  // thay vì thêm một dòng superadmin trùng khóa, rồi hoàn nguyên trước cleanup.
  await db.observer.query(`
    UPDATE mevo_operators
    SET store_id=NULL, role='mevo_superadmin', is_active=true
    WHERE user_id=$1 AND store_id=$2 AND role='store_owner'
  `, [fixture.owner_id, fixture.store_id])
  await db.observer.query(`
    INSERT INTO reservation_events(id,reservation_id,store_id,actor_kind,event_type)
    VALUES($1,$2,$3,'customer','created')
  `, [eventId, fixture.reservation_id, fixture.store_id])
  await db.observer.query(`
    INSERT INTO store_reservation_notification_channels(
      store_id,provider,is_enabled,destination_group_id,retry_contract_verified_at,retry_contract_evidence,retry_contract_version
    ) VALUES($1,'zca_group',true,'bl4-recovery-group',now(),'BL4 relay dedup contract',1)
  `, [fixture.store_id])
  await db.observer.query(`
    INSERT INTO reservation_notification_deliveries(
      id,store_id,reservation_id,reservation_event_id,kind,status,idempotency_key,delivery_provider,destination_group_id,
      dispatch_token,recovery_version,message_snapshot,queued_at,updated_at
    ) VALUES($1,$2,$3,$4,'owner_new_reservation','failed',$5,'zca_group','bl4-recovery-group',$6,1,$7::jsonb,now()-interval '2 minutes',now()-interval '2 minutes')
  `, [deliveryId, fixture.store_id, fixture.reservation_id, eventId, `bl4-recovery-${deliveryId}`, token,
    JSON.stringify({ version: 1, kind: 'owner_new_reservation', customer_name: 'BL4 Test', party_size: 2, arrival_at: new Date(Date.now() + 7200000).toISOString() })])
  // pg chuyển timestamptz sang Date và làm mất microseconds; UI Supabase gửi ISO string.
  // Lấy text nguyên vẹn để test optimistic version đúng như RPC thực nhận.
  const expected = (await db.observer.query('SELECT updated_at::text AS updated_at FROM reservation_notification_deliveries WHERE id=$1', [deliveryId])).rows[0].updated_at
  first = await db.connectActor({ userId: fixture.owner_id, role: 'authenticated' })
  second = await db.connectActor({ userId: fixture.owner_id, role: 'authenticated' })
  await Promise.all([first.query('BEGIN'), second.query('BEGIN')])
  const pidFirst = (await first.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
  const pidSecond = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
  assert.notEqual(pidFirst, pidSecond, 'cần hai PostgreSQL backend thật')
  const sql = 'SELECT public.requeue_reservation_zca_notification($1,$2,$3,$4,$5) AS value'
  const winner = await first.query(sql, [fixture.store_id, deliveryId, expected, requestId, 'Relay timeout BL4'])
  const loser = second.query(sql, [fixture.store_id, deliveryId, expected, randomUUID(), 'Relay timeout BL4'])
  await waitForBlock(db.observer, pidSecond, pidFirst)
  await first.query('COMMIT')
  await assert.rejects(loser, /Delivery đã thay đổi/)
  await second.query('ROLLBACK')
  const row = (await db.observer.query(`
    SELECT status,requeue_count,(SELECT count(*)::int FROM reservation_notification_recovery_events WHERE delivery_id=$1) AS audit_count
    FROM reservation_notification_deliveries WHERE id=$1
  `, [deliveryId])).rows[0]
  assert.deepEqual(row, { status: 'queued', requeue_count: 1, audit_count: 1 })
  console.log(`BL-4 PostgreSQL delivery recovery PASS: requeue lock ${pidFirst} -> ${pidSecond}`)
} finally {
  await first?.end().catch(() => {})
  await second?.end().catch(() => {})
  if (fixture) {
    await db.observer.query(`
      UPDATE mevo_operators
      SET store_id=$2, role='store_owner', is_active=true
      WHERE user_id=$1 AND store_id IS NULL AND role='mevo_superadmin'
    `, [fixture.owner_id, fixture.store_id]).catch(() => {})
    await fixture.cleanup().catch(() => {})
  }
  await db.close()
}
