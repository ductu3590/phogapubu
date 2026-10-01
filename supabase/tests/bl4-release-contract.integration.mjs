import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { openTestDatabase, seedBl4Fixture } from './helpers/bl4-postgres.mjs'

const db = await openTestDatabase()
let fixture, owner, anon
try {
  fixture = await seedBl4Fixture(db)
  owner = await db.connectActor({ userId: fixture.owner_id, role: 'authenticated' })
  anon = await db.connectActor({ userId: null, role: 'anon' })
  await owner.query('SELECT public.confirm_reservation($1,$2,$3)', [fixture.reservation_id, [fixture.table_id], null])
  const before = await anon.query('SELECT public.get_customer_reservation($1,$2) AS value', [fixture.reservation_id, fixture.customerToken])
  assert.equal(before.rows[0].value.reservation_id, fixture.reservation_id)

  // Công tắc phải chặn yêu cầu MỚI nhưng không làm booking đã tồn tại biến mất.
  await db.observer.query(`UPDATE stores SET is_accepting_orders=false WHERE id=$1`, [fixture.store_id])
  await assert.rejects(
    anon.query('SELECT public.create_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [fixture.store_id, fixture.table_id, JSON.stringify([{ menu_item_id: fixture.menu_item_id, quantity: 1 }]), 'cash', null, null, 'dine_in', null, null, null, null, randomUUID()]),
    /tạm nghỉ|không nhận đơn/i,
  )
  await db.observer.query(`UPDATE store_workflow_settings SET reservation_preorder_enabled=false,reservations_enabled=false WHERE store_id=$1`, [fixture.store_id])
  await assert.rejects(anon.query('SELECT public.prepare_reservation_request($1,$2)', [fixture.store_id, randomUUID()]), /đặt bàn|cấu hình/i)
  const after = await anon.query('SELECT public.get_customer_reservation($1,$2) AS value', [fixture.reservation_id, fixture.customerToken])
  assert.equal(after.rows[0].value.reservation_id, fixture.reservation_id)
  const arrived = await owner.query('SELECT public.arrive_reservation($1) AS value', [fixture.reservation_id])
  assert.equal(arrived.rows[0].value.status, 'arrived')
  console.log('BL-4 release contract PASS: server switches block new traffic and preserve existing reservation')
} finally {
  await owner?.end().catch(() => {})
  await anon?.end().catch(() => {})
  await fixture?.cleanup().catch(() => {})
  await db.close()
}
