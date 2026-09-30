import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { openTestDatabase, seedBl4Fixture, waitForBlock } from './helpers/bl4-postgres.mjs'

// Đây là cổng an toàn của Task 2: thiếu DB test/schema thì báo BLOCKED, không biến thành PASS giả.
const db = await openTestDatabase()
let fixture
let setupOwner
let setupAnon
const failures = []

const value = async (client, sql, args = []) => (await client.query(sql, args)).rows[0].value
const asCall = (sql, args) => client => value(client, sql, args)
const randomToken = () => randomUUID().replaceAll('-', '').repeat(2)

async function runCase(name, fn) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    failures.push({ name, error })
    console.error(`FAIL ${name}: ${error.stack ?? error.message}`)
  }
}

async function manualReservation({ tableIds = [], arrivalOffsetHours = null, arrivalAt = null, token = randomToken() } = {}) {
  if (!arrivalAt) {
    const offset = arrivalOffsetHours ?? 3 + fixture.bookingSequence++ * 6
    arrivalAt = (await db.observer.query(
      `SELECT now() + ($1::text || ' hours')::interval AS value`, [String(offset)],
    )).rows[0].value
  }
  const created = await value(setupOwner,
    'SELECT public.create_manual_reservation($1, $2::jsonb) AS value',
    [fixture.store_id, JSON.stringify({
      customer_name: `BL4 fixture ${randomUUID().slice(0, 8)}`,
      customer_phone: '0900000000',
      party_size: 4,
      arrival_at: arrivalAt,
      reason: 'Fixture kiểm thử PostgreSQL BL-4',
    })],
  )
  const reservationId = created.reservation_id
  await db.observer.query(
    `UPDATE reservations
     SET customer_token_hash = encode(extensions.digest($1, 'sha256'), 'hex')
     WHERE id = $2`, [token, reservationId],
  )
  if (tableIds.length) {
    await value(setupOwner,
      'SELECT public.confirm_reservation($1, $2::uuid[], NULL) AS value',
      [reservationId, tableIds],
    )
  }
  return { reservationId, token, arrivalAt }
}

async function submitPreorder(reservationId, token) {
  return value(setupAnon,
    'SELECT public.submit_reservation_preorder($1, $2, $3, $4::jsonb, $5) AS value',
    [reservationId, token, randomUUID(), JSON.stringify([{ menu_item_id: fixture.menu_item_id, quantity: 2 }]), 'BL4 concurrency'],
  )
}

function qrBatchCall(tableId, requestId = randomUUID(), expectedSessionId = null) {
  const args = [fixture.store_id, tableId,
    JSON.stringify([{ menu_item_id: fixture.menu_item_id, quantity: 1 }]),
    'cash', requestId, null, `bl4-device-${randomUUID()}`, null, null, expectedSessionId]
  return async client => value(client,
    'SELECT public.create_table_order_batch($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10) AS value', args)
}

async function closeQrSession(order, reason = 'resolved BL4 fixture') {
  if (!order?.id || !order.session_id) return
  const state = (await db.observer.query('SELECT status FROM orders WHERE id=$1', [order.id])).rows[0]
  if (!state || state.status === 'pending') {
    await value(setupOwner,
      'SELECT public.pos_reject_order($1, $2, NULL) AS value', [order.id, 'customer_requested'])
  }
  await value(setupOwner,
    'SELECT public.close_table_session($1, $2, NULL) AS value', [order.session_id, 'staff_reset'])
}

async function runRpcRace({ name, firstRole = 'authenticated', secondRole = 'authenticated',
  firstUserId, secondUserId,
  firstCall, secondCall, secondError = null }) {
  const a = await db.connectActor({
    userId: firstUserId ?? (firstRole === 'anon' ? null : fixture.owner_id), role: firstRole,
  })
  const b = await db.connectActor({
    userId: secondUserId ?? (secondRole === 'anon' ? null : fixture.owner_id), role: secondRole,
  })
  let aInTransaction = false
  let bInTransaction = false
  let competing
  let pidA
  let pidB
  try {
    await a.query('BEGIN')
    aInTransaction = true
    await b.query('BEGIN')
    bInTransaction = true
    await a.query("SET LOCAL statement_timeout = '10s'")
    await b.query("SET LOCAL statement_timeout = '10s'")
    await a.query("SET LOCAL lock_timeout = '9s'")
    await b.query("SET LOCAL lock_timeout = '9s'")
    pidA = (await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    pidB = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    assert.notEqual(pidA, pidB, `${name}: actors phải dùng hai backend PostgreSQL khác nhau`)

    const firstValue = await firstCall(a)
    competing = secondCall(b).then(result => ({ result }), error => ({ error }))
    await waitForBlock(db.observer, pidB, pidA)
    console.log(`  PostgreSQL backends ${pidA} -> ${pidB}`)
    await a.query('COMMIT')
    aInTransaction = false
    const secondResult = await competing
    if (secondResult.error) {
      assert.ok(!['40P01', '57014', '55P03'].includes(secondResult.error.code),
        `${name}: deadlock/timeout/lock-timeout không phải lỗi nghiệp vụ: ${secondResult.error.code} ${secondResult.error.message}`)
      if (secondError) assert.match(secondResult.error.message, secondError)
      await b.query('ROLLBACK')
      bInTransaction = false
      if (!secondError) throw secondResult.error
      return { firstValue, secondError: secondResult.error, pidA, pidB }
    }
    if (secondError) assert.fail(`${name}: RPC cạnh tranh đáng lẽ bị từ chối nhưng đã thành công`)
    await b.query('COMMIT')
    bInTransaction = false
    return { firstValue, secondValue: secondResult.result, pidA, pidB }
  } catch (error) {
    if (competing && aInTransaction) {
      await db.observer.query('SELECT pg_cancel_backend($1)', [pidB]).catch(() => {})
      await competing.catch(() => {})
    }
    throw error
  } finally {
    if (aInTransaction) await a.query('ROLLBACK').catch(() => {})
    if (bInTransaction) await b.query('ROLLBACK').catch(() => {})
    await Promise.all([a.end(), b.end()])
  }
}

async function expectNoShowOrArrival(reservationId, winner) {
  const arrive = asCall('SELECT public.arrive_reservation($1) AS value', [reservationId])
  const noShow = asCall('SELECT public.mark_reservation_no_show($1, $2) AS value', [reservationId, 'BL4 race test'])
  const race = await runRpcRace({
    name: `no-show/${winner} vs arrival`,
    firstCall: winner === 'arrive' ? arrive : noShow,
    secondCall: winner === 'arrive' ? noShow : arrive,
    secondError: winner === 'arrive' ? /Chỉ đánh dấu no-show cho đặt bàn đã xác nhận/ : /Chỉ nhận khách cho đặt bàn đã xác nhận/,
  })
  const row = (await db.observer.query(
    'SELECT status, session_id FROM reservations WHERE id=$1', [reservationId],
  )).rows[0]
  assert.equal(row.status, winner === 'arrive' ? 'arrived' : 'no_show')
  assert.equal(Boolean(row.session_id), winner === 'arrive')
  const events = (await db.observer.query(
    `SELECT count(*) FILTER (WHERE event_type='arrived')::int AS arrived,
            count(*) FILTER (WHERE event_type='no_show')::int AS no_show
     FROM reservation_events WHERE reservation_id=$1`, [reservationId],
  )).rows[0]
  assert.equal(events.arrived, winner === 'arrive' ? 1 : 0)
  assert.equal(events.no_show, winner === 'arrive' ? 0 : 1)
  if (winner === 'arrive') {
    await value(setupOwner, 'SELECT public.close_table_session($1,$2,NULL) AS value',
      [row.session_id, 'staff_reset'])
  }
  return race
}

async function expectCancelOrArrival(reservation, winner) {
  const arrive = asCall('SELECT public.arrive_reservation($1) AS value', [reservation.reservationId])
  const cancel = asCall('SELECT public.cancel_customer_reservation($1,$2,$3) AS value',
    [reservation.reservationId, reservation.token, 'BL4 race test'])
  const race = await runRpcRace({
    name: `customer-cancel/${winner} vs arrival`,
    firstRole: winner === 'cancel' ? 'anon' : 'authenticated',
    secondRole: winner === 'cancel' ? 'authenticated' : 'anon',
    secondUserId: winner === 'cancel' ? fixture.owner_id : null,
    firstCall: winner === 'cancel' ? cancel : arrive,
    secondCall: winner === 'cancel' ? arrive : cancel,
    secondError: winner === 'cancel' ? /Chỉ nhận khách cho đặt bàn đã xác nhận/ : /không còn có thể hủy/,
  })
  const row = (await db.observer.query(
    'SELECT status, session_id FROM reservations WHERE id=$1', [reservation.reservationId],
  )).rows[0]
  assert.equal(row.status, winner === 'cancel' ? 'cancelled_by_customer' : 'arrived')
  assert.equal(Boolean(row.session_id), winner === 'arrive')
  if (winner === 'arrive') {
    await value(setupOwner, 'SELECT public.close_table_session($1,$2,NULL) AS value',
      [row.session_id, 'staff_reset'])
  }
  return race
}

async function expectPreorderLifecycleRace({ action, winner }) {
  const tableId = fixture.allTableIds[fixture.bookingSequence % fixture.allTableIds.length]
  const reservation = await manualReservation({ tableIds: [tableId] })
  const preorder = await submitPreorder(reservation.reservationId, reservation.token)
  const orderId = preorder.order_id
  const release = asCall('SELECT public.release_reservation_preorder($1,$2,$3) AS value',
    [orderId, 1, randomUUID()])
  const noShow = asCall('SELECT public.mark_reservation_no_show($1,$2) AS value',
    [reservation.reservationId, 'BL4 no-show/release race'])
  const cancel = asCall('SELECT public.cancel_customer_reservation($1,$2,$3) AS value',
    [reservation.reservationId, reservation.token, 'BL4 cancel/release race'])
  const terminal = action === 'no-show' ? noShow : cancel
  const firstRole = winner === 'release' || action === 'no-show' ? 'authenticated' : 'anon'
  const secondRole = winner === 'release' ? (action === 'no-show' ? 'authenticated' : 'anon') : 'authenticated'
  const race = await runRpcRace({
    name: `${action}/preorder-release (${winner} first)`,
    firstRole,
    secondRole,
    firstUserId: firstRole === 'anon' ? null : fixture.owner_id,
    secondUserId: secondRole === 'authenticated' ? fixture.owner_id : null,
    firstCall: winner === 'release' ? release : terminal,
    secondCall: winner === 'release' ? terminal : release,
    secondError: winner === 'release'
      ? action === 'customer-cancel' ? /Món đặt trước đã được quán chuẩn bị/ : null
      : /Đặt bàn đã kết thúc|Món đặt trước đã huỷ/,
  })
  const state = (await db.observer.query(`
    SELECT r.status AS reservation_status, o.status AS order_status,
           o.released_preorder_revision, o.waste_review_required,
           (SELECT count(*)::int FROM reservation_events e WHERE e.reservation_id=r.id AND e.event_type=$2) AS terminal_events
    FROM reservations r JOIN orders o ON o.reservation_id=r.id WHERE r.id=$1
  `, [reservation.reservationId, action === 'no-show' ? 'no_show' : 'cancelled_by_customer'])).rows[0]
  if (action === 'customer-cancel' && winner === 'release') {
    assert.equal(state.reservation_status, 'confirmed', 'release thắng thì booking vẫn phải còn hiệu lực')
    assert.equal(state.order_status, 'confirmed', 'release thắng thì preorder đã được duyệt, không bị hủy')
    assert.equal(Number(state.released_preorder_revision), 1)
    assert.equal(state.terminal_events, 0)
  } else {
    assert.equal(state.reservation_status, action === 'no-show' ? 'no_show' : 'cancelled_by_customer')
    assert.equal(state.order_status, 'cancelled', `${action}: preorder không được treo sau khi đặt bàn kết thúc`)
    assert.equal(state.terminal_events, 1)
  }
  return race
}

async function expectChangeVsQr(winner) {
  const [oldTable, targetTable] = await dedicatedTables(2)
  const reservation = await manualReservation({ tableIds: [oldTable], arrivalOffsetHours: 6 })
  // Tạo giờ hợp lệ theo slot 15 phút và đủ trước hạn tối thiểu; giờ này đã nằm
  // trong cửa sổ khóa 60 phút nên việc đổi bàn thắng phải chặn QR ngay.
  const requestedArrival = await value(db.observer, `
    SELECT (
      date_trunc('hour', timezone('Asia/Ho_Chi_Minh', now()))
      + ((ceil(extract(minute FROM timezone('Asia/Ho_Chi_Minh', now()))::numeric / 15)::int + 3)
         * interval '15 minutes')
    ) AT TIME ZONE 'Asia/Ho_Chi_Minh' AS value
  `)
  await value(setupAnon,
    'SELECT public.request_reservation_change($1,$2,$3,$4,$5) AS value',
    [reservation.reservationId, reservation.token, requestedArrival, 4, 'BL4 concurrency fixture'],
  )
  const qrRequestId = randomUUID()
  const qr = qrBatchCall(targetTable, qrRequestId)
  const resolveChange = asCall('SELECT public.resolve_reservation_change($1,true,$2::uuid[],$3) AS value',
    [reservation.reservationId, [targetTable], 'BL4 race winner'])

  const race = await runRpcRace({
    name: `table-change/QR (${winner} first)`,
    firstRole: winner === 'change' ? 'authenticated' : 'anon',
    secondRole: winner === 'change' ? 'anon' : 'authenticated',
    firstUserId: winner === 'change' ? fixture.owner_id : null,
    secondUserId: winner === 'change' ? null : fixture.owner_id,
    firstCall: winner === 'change' ? resolveChange : qr,
    secondCall: winner === 'change' ? qr : resolveChange,
    secondError: winner === 'change' ? /Bàn đã được đặt trước/ : /Bàn đang có khách/,
  })
  const target = (await db.observer.query(`
    SELECT public.open_session_id_for_table($1) AS session_id,
           (SELECT count(*)::int FROM reservation_tables WHERE reservation_id=$2 AND table_id=$1 AND released_at IS NULL) AS allocated
  `, [targetTable, reservation.reservationId])).rows[0]
  if (winner === 'change') {
    assert.equal(target.session_id, null)
    assert.equal(target.allocated, 1)
  } else {
    assert.ok(target.session_id)
    assert.equal(target.allocated, 0)
    const order = (await db.observer.query(
      `SELECT o.id, o.session_id FROM table_order_batch_requests b
       JOIN orders o ON o.id=b.order_id WHERE b.store_id=$1 AND b.client_request_id=$2`,
      [fixture.store_id, qrRequestId],
    )).rows[0]
    await closeQrSession(order)
  }
  return race
}

async function expectConfirmRejectRace(winner) {
  const tableId = fixture.allTableIds[fixture.bookingSequence % fixture.allTableIds.length]
  const order = await qrBatchCall(tableId)(setupAnon)
  const confirm = asCall('SELECT public.pos_confirm_order($1) AS value', [order.id])
  const reject = asCall('SELECT public.pos_reject_order($1,$2,NULL) AS value', [order.id, 'out_of_stock'])
  const race = await runRpcRace({
    name: `POS confirm/reject (${winner} first)`,
    firstCall: winner === 'confirm' ? confirm : reject,
    secondCall: winner === 'confirm' ? reject : confirm,
    secondError: winner === 'confirm' ? /đang chờ xác nhận/ : /Đơn đã huỷ/,
  })
  const status = (await db.observer.query('SELECT status FROM orders WHERE id=$1', [order.id])).rows[0].status
  assert.equal(status, winner === 'confirm' ? 'confirmed' : 'cancelled')
  await closeQrSession(order)
  return race
}

async function checkSchema() {
  const schema = await db.observer.query(`
    SELECT to_regclass('public.stores') AS stores,
           to_regclass('public.reservations') AS reservations,
           to_regclass('public.mevo_operators') AS operators,
           to_regclass('public.table_order_batch_requests') AS qr_requests
  `)
  if (!schema.rows[0].stores || !schema.rows[0].reservations || !schema.rows[0].operators || !schema.rows[0].qr_requests) {
    throw new Error('BLOCKED: schema MEVO chưa áp đủ migrations. Chạy `npm run test:bl4:prepare-db` trước trên project test.')
  }
  const version = await db.observer.query('SELECT current_setting(\'server_version\') AS version')
  console.log(`BL-4 PostgreSQL target: ${version.rows[0].version}`)
}

// Ca giữ bàn gần giờ đến không dùng bàn chung: booking của ca trước vẫn còn
// hiệu lực là dữ liệu hợp lệ, nhưng không được làm sai tiền điều kiện của ca sau.
async function dedicatedTables(count) {
  const ids = Array.from({ length: count }, () => randomUUID())
  await db.observer.query(`INSERT INTO tables(id,store_id,table_number)
    SELECT id,$1,'BL4-' || id::text FROM unnest($2::uuid[]) AS seeded(id)`, [fixture.store_id, ids])
  return ids
}

try {
  await checkSchema()
  fixture = await seedBl4Fixture(db)
  fixture.bookingSequence = 0
  setupOwner = await db.connectActor({ userId: fixture.owner_id, role: 'authenticated' })
  setupAnon = await db.connectActor({ userId: null, role: 'anon' })

  await runCase('confirm reservation thật bị serialize qua hai backend', async () => {
    const call = asCall('SELECT public.confirm_reservation($1,$2::uuid[],NULL) AS value',
      [fixture.reservation_id, fixture.tableIds])
    const race = await runRpcRace({ name: 'confirm/confirm', firstCall: call, secondCall: call })
    assert.equal(race.firstValue.status, 'confirmed')
    assert.equal(race.secondValue.status, 'confirmed')
    assert.equal(race.secondValue.already, true)
    const counts = (await db.observer.query(`
      SELECT count(*) FILTER (WHERE released_at IS NULL)::int AS active_tables,
             (SELECT count(*)::int FROM reservation_events WHERE reservation_id=$1 AND event_type='confirmed') AS confirmed_events
      FROM reservation_tables WHERE reservation_id=$1
    `, [fixture.reservation_id])).rows[0]
    assert.deepEqual(counts, { active_tables: 1, confirmed_events: 1 })
  })

  await runCase('arrival cùng booking chỉ mở một session/mâm', async () => {
    const booking = await manualReservation({ tableIds: [fixture.allTableIds[1]] })
    const arrive = asCall('SELECT public.arrive_reservation($1) AS value', [booking.reservationId])
    const race = await runRpcRace({ name: 'arrive/arrive', firstCall: arrive, secondCall: arrive })
    assert.equal(race.firstValue.session_id, race.secondValue.session_id)
    assert.equal(race.secondValue.already, true)
    const state = (await db.observer.query(`
      SELECT r.status, count(DISTINCT s.id)::int AS sessions,
             (SELECT count(*)::int FROM reservation_events WHERE reservation_id=r.id AND event_type='arrived') AS arrive_events
      FROM reservations r LEFT JOIN table_sessions s ON s.id=r.session_id WHERE r.id=$1 GROUP BY r.id
    `, [booking.reservationId])).rows[0]
    assert.deepEqual(state, { status: 'arrived', sessions: 1, arrive_events: 1 })
    await value(setupOwner, 'SELECT public.close_table_session($1,$2,NULL) AS value',
      [race.firstValue.session_id, 'staff_reset'])
  })

  await runCase('no-show thắng arrival; loser nhận lỗi nghiệp vụ, không tạo session', async () => {
    const booking = await manualReservation({ tableIds: [fixture.allTableIds[2]] })
    await expectNoShowOrArrival(booking.reservationId, 'no_show')
  })
  await runCase('arrival thắng no-show; loser không đổi trạng thái', async () => {
    const booking = await manualReservation({ tableIds: [fixture.allTableIds[3]] })
    await expectNoShowOrArrival(booking.reservationId, 'arrive')
  })
  await runCase('khách hủy thắng nhận khách', async () => {
    const booking = await manualReservation({ tableIds: [fixture.allTableIds[4]] })
    await expectCancelOrArrival(booking, 'cancel')
  })
  await runCase('nhận khách thắng khách hủy', async () => {
    const booking = await manualReservation({ tableIds: [fixture.allTableIds[5]] })
    await expectCancelOrArrival(booking, 'arrive')
  })

  await runCase('no-show kết thúc preorder khi no-show commit trước release', async () => {
    await expectPreorderLifecycleRace({ action: 'no-show', winner: 'no-show' })
  })
  await runCase('release và no-show hội tụ, không để preorder mồ côi', async () => {
    await expectPreorderLifecycleRace({ action: 'no-show', winner: 'release' })
  })
  await runCase('khách hủy booking commit trước release thì release bị từ chối', async () => {
    await expectPreorderLifecycleRace({ action: 'customer-cancel', winner: 'customer-cancel' })
  })
  await runCase('release thắng phải chặn hủy booking cạnh tranh', async () => {
    await expectPreorderLifecycleRace({ action: 'customer-cancel', winner: 'release' })
  })

  await runCase('đổi bàn thắng QR và QR bị chặn trong khoảng khóa 60 phút', async () => {
    await expectChangeVsQr('change')
  })
  await runCase('QR thắng đổi bàn; chủ quán không thể phân bàn đang có phiên', async () => {
    await expectChangeVsQr('qr')
  })

  await runCase('POS xác nhận thắng từ chối đồng thời', async () => {
    await expectConfirmRejectRace('confirm')
  })
  await runCase('POS từ chối thắng xác nhận đồng thời', async () => {
    await expectConfirmRejectRace('reject')
  })

  await runCase('QR retry đồng thời cùng request ID chỉ tạo một order', async () => {
    const tableId = fixture.allTableIds[fixture.bookingSequence % fixture.allTableIds.length]
    const requestId = randomUUID()
    const sameCall = qrBatchCall(tableId, requestId)
    const race = await runRpcRace({ name: 'QR same-request retry', firstRole: 'anon', secondRole: 'anon',
      firstUserId: null, secondUserId: null, firstCall: sameCall, secondCall: sameCall })
    assert.equal(race.firstValue.id, race.secondValue.id)
    const counts = (await db.observer.query(`
      SELECT count(DISTINCT b.order_id)::int AS mapped_orders,
             count(DISTINCT o.id)::int AS orders
      FROM table_order_batch_requests b
      JOIN orders o ON o.id = b.order_id
      WHERE b.store_id=$1 AND b.client_request_id=$2
    `, [fixture.store_id, requestId])).rows[0]
    assert.deepEqual(counts, { mapped_orders: 1, orders: 1 })
    await closeQrSession(race.firstValue)
  })

  await runCase('hai xác nhận mâm lấy bàn theo thứ tự lock ổn định, không deadlock', async () => {
    const ids = await dedicatedTables(2)
    const sameArrivalAt = (await db.observer.query("SELECT now() + interval '6 hours' AS value")).rows[0].value
    const firstBooking = await manualReservation({ arrivalAt: sameArrivalAt })
    const secondBooking = await manualReservation({ arrivalAt: sameArrivalAt })
    const first = asCall('SELECT public.confirm_reservation($1,$2::uuid[],NULL) AS value', [firstBooking.reservationId, ids])
    const second = asCall('SELECT public.confirm_reservation($1,$2::uuid[],NULL) AS value', [secondBooking.reservationId, [...ids].reverse()])
    const race = await runRpcRace({ name: 'opposite-table-order confirm allocation', firstCall: first, secondCall: second,
      secondError: /Bàn đã được giữ cho đặt bàn khác/ })
    assert.equal(race.firstValue.status, 'confirmed')
    const statuses = (await db.observer.query(
      'SELECT status FROM reservations WHERE id=ANY($1::uuid[]) ORDER BY status',
      [[firstBooking.reservationId, secondBooking.reservationId]],
    )).rows.map(row => row.status)
    assert.deepEqual(statuses, ['confirmed', 'pending'])
    const active = (await db.observer.query(
      'SELECT count(*)::int AS n FROM reservation_tables WHERE table_id=ANY($1::uuid[]) AND released_at IS NULL', [ids],
    )).rows[0].n
    assert.equal(active, 2)
  })

  await runCase('booking khóa QR trong 60 phút kể cả khi đã có session cũ', async () => {
    const [tableId] = await dedicatedTables(1)
    const booking = await manualReservation({ tableIds: [tableId], arrivalOffsetHours: 0.5 })
    const sessionId = randomUUID()
    await db.observer.query(`
      INSERT INTO table_sessions(id,store_id,table_id,opened_by,is_open_ordering)
      VALUES($1,$2,$3,'staff',true)
    `, [sessionId, fixture.store_id, tableId])
    await db.observer.query('INSERT INTO session_tables(session_id,table_id) VALUES($1,$2)', [sessionId, tableId])
    const state = await value(setupAnon,
      'SELECT public.get_table_session_state($1,NULL,$2) AS value', [tableId, 'bl4-old-session'])
    assert.equal(state.state, 'reserved')
    await assert.rejects(() => qrBatchCall(tableId, randomUUID(), sessionId)(setupAnon),
      /Bàn đã được đặt trước/)
    const count = (await db.observer.query('SELECT count(*)::int AS n FROM orders WHERE table_id=$1', [tableId])).rows[0].n
    assert.equal(count, 0)
    await value(setupOwner, 'SELECT public.close_table_session($1,$2,NULL) AS value', [sessionId, 'staff_reset'])
    assert.ok(booking.reservationId)
  })

  const outbound = await db.observer.query('SELECT count(*)::int AS n FROM bl4_test.dispatch_log')
  assert.equal(outbound.rows[0].n, 0, 'fixture không được gửi HTTP ra ngoài test database')
} finally {
  if (setupAnon) await setupAnon.end().catch(() => {})
  if (setupOwner) await setupOwner.end().catch(() => {})
  if (fixture) {
    try {
      await fixture.cleanup()
      console.log('PostgreSQL fixture cleanup PASS')
    } catch (error) {
      failures.push({ name: 'fixture cleanup', error })
      console.error(`FAIL fixture cleanup: ${error.stack ?? error.message}`)
    }
  }
  await db.close()
}

if (failures.length) {
  throw new AggregateError(failures.map(item => item.error),
    `BL-4 PostgreSQL concurrency: ${failures.length} case(s) failed: ${failures.map(item => item.name).join('; ')}`)
}
console.log('BL-4 PostgreSQL concurrency PASS: full lock/race matrix')
