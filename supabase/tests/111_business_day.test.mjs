import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { apply111, setupBefore111 } from './helpers/business-day-fixture.mjs'

// Test mig 111: ngày kinh doanh theo quán, get_bills_report cắt theo mốc của quán, set_business_day_start.
// Quán s1 bắt đầu ngày lúc 05:00; s0 giữ 00:00 (và có báo cáo chụp TRƯỚC khi vá); sNoRow không có dòng cài đặt.
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()

const START = '05:00'
const DAY = '2026-11-01'
const NEXT = '2026-11-02'
const LAST = `${NEXT} 04:59:59+07` // giây cuối của ngày kinh doanh DAY ở quán 05:00
const FIRST = `${NEXT} 05:00:00+07` // giây đầu của ngày kinh doanh NEXT

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const owner = id(1), cashier = id(2), staff = id(3), owner0 = id(4), owner2 = id(5), admin = id(6)
const s1 = id(10), s0 = id(11), s2 = id(12), sNoRow = id(13)
const t1 = id(21), t0 = id(22)
let seq = 1000
const newId = () => id(seq++)
const ownerOf = { [s1]: owner, [s0]: owner0, [s2]: owner2 }

async function login(uid) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid])
  await db.exec('SET ROLE authenticated')
}
async function as(uid, fn) {
  await login(uid)
  try {
    return await fn()
  } finally {
    await db.exec('RESET ROLE')
  }
}
const report = (date = DAY, storeId = s1, uid = ownerOf[storeId]) =>
  as(uid, async () => (await db.query('SELECT get_bills_report($1, $2::date) AS r', [storeId, date])).rows[0].r)
const dateOf = async (storeId, at) =>
  (await db.query('SELECT business_date_of($1, $2::timestamptz)::text AS d', [storeId, at])).rows[0].d
const currentDate = async (storeId) =>
  (await db.query('SELECT current_business_date($1)::text AS d', [storeId])).rows[0].d
async function bounds(storeId, date) {
  const fmt = (col) => `to_char(${col} AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI:SS') || '+07'`
  const { rows } = await db.query(
    `SELECT ${fmt('day_from')} AS a, ${fmt('day_to')} AS b FROM business_day_bounds($1, $2::date)`, [storeId, date])
  return [rows[0].a, rows[0].b]
}
const setStart = (uid, storeId, start) => as(uid, async () =>
  (await db.query('SELECT set_business_day_start($1, $2::time) AS r', [storeId, start])).rows[0].r)
async function calendarToday() {
  return (await db.query("SELECT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text AS d")).rows[0].d
}
async function dayBefore(date) {
  return (await db.query('SELECT ($1::date - 1)::text AS d', [date])).rows[0].d
}

async function paidOrder({ store = s1, paidAt, amount = 100000, instrument = 'cash', sessionId = null, table = null }) {
  const o = newId()
  await db.query(`INSERT INTO orders(id, store_id, table_id, session_id, status, total_amount, payment_method, payment_instrument,
    payment_received_at, order_type, created_at, updated_at) VALUES ($1, $2, $3, $4, 'paid', $5, 'cash', $6, $7, 'pickup', $7, $7)`,
  [o, store, table, sessionId, amount, instrument, paidAt])
  return o
}
// Đơn tiền mặt cũ không có payment_received_at: báo cáo rơi về completed_at.
async function legacyPaidOrder({ store = s1, completedAt }) {
  const o = newId()
  await db.query(`INSERT INTO orders(id, store_id, status, total_amount, payment_method, order_type, completed_at, created_at, updated_at)
    VALUES ($1, $2, 'paid', 50000, 'cash', 'pickup', $3, $3, $3)`, [o, store, completedAt])
  return o
}
async function expiredSession({ store = s1, table = t1, openedAt, amount = 70000 }) {
  const s = newId()
  await db.query(`INSERT INTO table_sessions(id, store_id, table_id, status, opened_at, closed_at, close_reason)
    VALUES ($1, $2, $3, 'closed', $4, $4::timestamptz + interval '6 hours', 'expired')`, [s, store, table, openedAt])
  await db.query('INSERT INTO session_tables(session_id, table_id, is_open) VALUES ($1, $2, false)', [s, table])
  await db.query(`INSERT INTO orders(id, store_id, table_id, session_id, status, total_amount, created_at)
    VALUES ($1, $2, $3, $4, 'confirmed', $5, $6)`, [newId(), store, table, s, amount, openedAt])
  return s
}
async function waitingOrder({ store = s1, createdAt }) {
  const o = newId()
  await db.query(`INSERT INTO orders(id, store_id, status, total_amount, payment_method, order_type, created_at, updated_at)
    VALUES ($1, $2, 'pending', 55000, 'bank_transfer', 'pickup', $3, $3)`, [o, store, createdAt])
  return o
}
async function rejectedOrder({ store = s1, rejectedAt }) {
  const o = newId()
  await db.query(`INSERT INTO orders(id, store_id, status, total_amount, rejected_at, created_at, updated_at)
    VALUES ($1, $2, 'cancelled', 45000, $3, $3, $3)`, [o, store, rejectedAt])
  return o
}
async function cancelledOrder({ store = s1, updatedAt }) {
  const o = newId()
  await db.query(`INSERT INTO orders(id, store_id, status, total_amount, created_at, updated_at)
    VALUES ($1, $2, 'cancelled', 30000, $3, $3)`, [o, store, updatedAt])
  return o
}
async function voidedItem({ store = s1, name, at }) {
  const o = await paidOrder({ store, paidAt: '2026-06-01 12:00:00+07' })
  await db.query(`INSERT INTO order_items(id, order_id, item_name, item_price, quantity, void_type, voided_at, voided_by, void_reason)
    VALUES ($1, $2, $3, 20000, 1, 'gift', $4, $5, 'Khách quen')`, [newId(), o, name, at, cashier])
}
async function quantityChange({ store = s1, name, at }) {
  const o = await paidOrder({ store, paidAt: '2026-06-01 12:00:00+07' })
  const item = newId()
  await db.query(`INSERT INTO order_items(id, order_id, item_name, item_price, quantity) VALUES ($1, $2, $3, 10000, 2)`, [item, o, name])
  await db.query(`INSERT INTO order_item_quantity_changes(id, store_id, order_id, order_item_id, item_name, old_quantity,
    new_quantity, reason, changed_by, changed_at) VALUES ($1, $2, $3, $4, $5, 3, 2, 'Bấm nhầm', $6, $7)`,
  [newId(), store, o, item, name, cashier, at])
}
async function openSession({ store = s1, table = t1 }) {
  const s = newId()
  await db.query(`INSERT INTO table_sessions(id, store_id, table_id, status) VALUES ($1, $2, $3, 'open')`, [s, store, table])
  await db.query('INSERT INTO session_tables(session_id, table_id, is_open) VALUES ($1, $2, true)', [s, table])
  await db.query(`INSERT INTO orders(id, store_id, table_id, session_id, status, total_amount)
    VALUES ($1, $2, $3, $4, 'confirmed', 150000)`, [newId(), store, table, s])
  return s
}
// Không giả được now(), nên thay tạm current_business_date để dựng tình huống "lịch đã sang ngày, ngày kinh doanh chưa sang".
async function withBusinessDate(date, fn) {
  const def = (await db.query(`SELECT pg_get_functiondef('public.current_business_date(uuid)'::regprocedure) AS d`)).rows[0].d
  await db.exec(`CREATE OR REPLACE FUNCTION public.current_business_date(p_store_id uuid) RETURNS date
    LANGUAGE sql STABLE SET search_path = public AS $$ SELECT date '${date}' $$`)
  try {
    return await fn()
  } finally {
    await db.exec(def)
  }
}

let reportBeforePatch, todayReportBeforePatch, today0

before(async () => {
  await setupBefore111(db)
  await db.exec(`
    INSERT INTO auth.users(id, email) VALUES ('${owner}', 'chu@quan.vn'), ('${cashier}', 'thungan@quan.vn'),
      ('${staff}', 'nv@quan.vn'), ('${owner0}', 'chu0@quan.vn'), ('${owner2}', 'chu2@quan.vn'), ('${admin}', 'mevo@mevo.vn');
    INSERT INTO stores(id) VALUES ('${s1}'), ('${s0}'), ('${s2}'), ('${sNoRow}');
    INSERT INTO store_workflow_settings(store_id) VALUES ('${s1}'), ('${s0}'), ('${s2}');
    INSERT INTO mevo_operators VALUES
      ('${owner}', '${s1}', 'store_owner', true), ('${cashier}', '${s1}', 'store_cashier', true),
      ('${staff}', '${s1}', 'store_staff', true), ('${owner0}', '${s0}', 'store_owner', true),
      ('${owner2}', '${s2}', 'store_owner', true), ('${admin}', NULL, 'mevo_superadmin', true);
    INSERT INTO tables VALUES ('${t1}', '${s1}', 'Bàn 1'), ('${t0}', '${s0}', 'Bàn 9');
  `)
  // Quán 00:00: đủ mọi loại dòng, sát cả hai mép ngày, chụp báo cáo bằng bản prod rồi mới chạy mig.
  for (const at of [`${DAY} 00:00:00+07`, `${DAY} 23:59:59+07`, `${NEXT} 00:00:00+07`, '2026-10-31 23:59:59+07']) {
    await paidOrder({ store: s0, paidAt: at })
    await legacyPaidOrder({ store: s0, completedAt: at })
    await expiredSession({ store: s0, table: t0, openedAt: at })
    await waitingOrder({ store: s0, createdAt: at })
    await rejectedOrder({ store: s0, rejectedAt: at })
    await cancelledOrder({ store: s0, updatedAt: at })
    await voidedItem({ store: s0, name: `Tặng ${at}`, at })
    await quantityChange({ store: s0, name: `Sửa ${at}`, at })
  }
  await openSession({ store: s0, table: t0 })
  today0 = await calendarToday()
  reportBeforePatch = await report(DAY, s0)
  todayReportBeforePatch = await report(today0, s0)

  await apply111(db)
  await db.query('UPDATE store_workflow_settings SET business_day_start = $1 WHERE store_id = $2', [START, s1])
})

after(async () => db.close())

test('biên ngày: 04:59:59 thuộc ngày cũ, 05:00:00 thuộc ngày mới, cả qua tháng', async () => {
  assert.equal(await dateOf(s1, LAST), DAY)
  assert.equal(await dateOf(s1, FIRST), NEXT)
  assert.equal(await dateOf(s1, '2026-12-01 04:00:00+07'), '2026-11-30')
  assert.deepEqual(await bounds(s1, DAY), ['2026-11-01 05:00:00+07', '2026-11-02 05:00:00+07'])
  assert.deepEqual(await bounds(s1, '2026-11-30'), ['2026-11-30 05:00:00+07', '2026-12-01 05:00:00+07'])
})

test('quán chưa có dòng cài đặt coi như 00:00', async () => {
  assert.equal(await dateOf(sNoRow, '2026-11-01 23:59:59+07'), DAY)
  assert.equal(await dateOf(sNoRow, '2026-11-02 00:00:00+07'), NEXT)
  assert.deepEqual(await bounds(sNoRow, DAY), ['2026-11-01 00:00:00+07', '2026-11-02 00:00:00+07'])
})

test('bill theo giờ nhận tiền: 04:59:59 hôm sau vào báo cáo D, 05:00:00 vào D+1', async () => {
  const last = await paidOrder({ paidAt: LAST })
  const first = await paidOrder({ paidAt: FIRST })
  const legacyLast = await legacyPaidOrder({ completedAt: LAST })
  const legacyFirst = await legacyPaidOrder({ completedAt: FIRST })
  const ids = (r) => r.bills.flatMap((b) => b.order_ids)
  const d = ids(await report(DAY)), n = ids(await report(NEXT))
  assert.ok(d.includes(last) && d.includes(legacyLast))
  assert.ok(!d.includes(first) && !d.includes(legacyFirst))
  assert.ok(n.includes(first) && n.includes(legacyFirst))
  assert.ok(!n.includes(last) && !n.includes(legacyLast))
})

test('phiên expired còn nợ theo opened_at', async () => {
  const last = await expiredSession({ openedAt: LAST })
  const first = await expiredSession({ openedAt: FIRST })
  const ids = (r) => r.waiting.flatMap((w) => w.session_ids)
  const d = ids(await report(DAY)), n = ids(await report(NEXT))
  assert.ok(d.includes(last) && !d.includes(first))
  assert.ok(n.includes(first) && !n.includes(last))
})

test('đơn chờ không phiên theo created_at', async () => {
  const last = await waitingOrder({ createdAt: LAST })
  const first = await waitingOrder({ createdAt: FIRST })
  const ids = (r) => r.waiting.flatMap((w) => w.order_ids)
  const d = ids(await report(DAY)), n = ids(await report(NEXT))
  assert.ok(d.includes(last) && !d.includes(first))
  assert.ok(n.includes(first) && !n.includes(last))
})

test('huỷ theo rejected_at; đơn huỷ không rejected_at theo updated_at', async () => {
  const rLast = await rejectedOrder({ rejectedAt: LAST })
  const rFirst = await rejectedOrder({ rejectedAt: FIRST })
  const cLast = await cancelledOrder({ updatedAt: LAST })
  const cFirst = await cancelledOrder({ updatedAt: FIRST })
  const ids = (r) => r.cancelled.map((c) => c.order_id)
  const d = ids(await report(DAY)), n = ids(await report(NEXT))
  assert.ok(d.includes(rLast) && d.includes(cLast))
  assert.ok(!d.includes(rFirst) && !d.includes(cFirst))
  assert.ok(n.includes(rFirst) && n.includes(cFirst))
  assert.ok(!n.includes(rLast) && !n.includes(cLast))
})

test('điều chỉnh theo voided_at và changed_at', async () => {
  await voidedItem({ name: 'Tặng cuối', at: LAST })
  await voidedItem({ name: 'Tặng đầu', at: FIRST })
  await quantityChange({ name: 'Sửa cuối', at: LAST })
  await quantityChange({ name: 'Sửa đầu', at: FIRST })
  const names = (r) => r.adjustments.map((a) => a.item_name)
  const d = names(await report(DAY)), n = names(await report(NEXT))
  assert.ok(d.includes('Tặng cuối') && d.includes('Sửa cuối'))
  assert.ok(!d.includes('Tặng đầu') && !d.includes('Sửa đầu'))
  assert.ok(n.includes('Tặng đầu') && n.includes('Sửa đầu'))
  assert.ok(!n.includes('Tặng cuối') && !n.includes('Sửa cuối'))
})

test('phiên đang mở chỉ có trong Chờ thu khi xem current_business_date', async () => {
  const s = await openSession({})
  const inWaiting = (r) => r.waiting.some((w) => w.session_ids.includes(s))

  const current = await currentDate(s1)
  assert.equal(current, await dateOf(s1, new Date().toISOString()))
  assert.ok(inWaiting(await report(current)))
  assert.ok(!inWaiting(await report(await dayBefore(current))))

  // v_today đi theo ngày kinh doanh, không theo ngày lịch: lịch đã sang nhưng ngày kinh doanh còn ở hôm trước.
  const calendar = await calendarToday()
  const previous = await dayBefore(calendar)
  await withBusinessDate(previous, async () => {
    assert.ok(inWaiting(await report(previous)))
    assert.ok(!inWaiting(await report(calendar)))
  })
})

test('quán 00:00: báo cáo sau mig 111 giống hệt trước mig, chỉ thêm day_from, day_to', async () => {
  const { day_from, day_to, ...rest } = await report(DAY, s0)
  assert.deepEqual(rest, reportBeforePatch)
  assert.equal(new Date(day_from).toISOString(), new Date('2026-11-01T00:00:00+07:00').toISOString())
  assert.equal(new Date(day_to).toISOString(), new Date('2026-11-02T00:00:00+07:00').toISOString())
  assert.ok(rest.bills.length > 0 && rest.waiting.length > 0 && rest.cancelled.length > 0 && rest.adjustments.length > 0)

  const { day_from: _from, day_to: _to, ...todayRest } = await report(today0, s0)
  assert.deepEqual(todayRest, todayReportBeforePatch)
  assert.ok(todayRest.waiting.length > 0, 'hôm nay phải có phiên đang mở')
})

test('báo cáo trả mốc cắt của quán, thu ngân vẫn xem được dù không có quyền gọi hàm nội bộ', async () => {
  const r = await report(DAY, s1, cashier)
  assert.equal(new Date(r.day_from).toISOString(), new Date('2026-11-01T05:00:00+07:00').toISOString())
  assert.equal(new Date(r.day_to).toISOString(), new Date('2026-11-02T05:00:00+07:00').toISOString())
  assert.equal(r.date, DAY)
})

test('cash + bank + other = revenue ở quán 05:00', async () => {
  const day = '2026-11-10'
  await paidOrder({ paidAt: `${day} 04:59:59+07`, amount: 1000, instrument: 'cash' }) // thuộc ngày trước
  await paidOrder({ paidAt: `${day} 05:00:00+07`, amount: 20000, instrument: 'cash' })
  await paidOrder({ paidAt: `${day} 12:00:00+07`, amount: 300000, instrument: 'bank' })
  await paidOrder({ paidAt: '2026-11-11 04:59:59+07', amount: 4000000, instrument: 'wallet' })
  await paidOrder({ paidAt: '2026-11-11 05:00:00+07', amount: 50000000, instrument: 'cash' }) // thuộc ngày sau
  const { totals } = await report(day)
  assert.deepEqual(totals, { revenue: 4320000, cash: 20000, bank: 300000, other: 4000000, bills_count: 3 })
  assert.equal(totals.cash + totals.bank + totals.other, totals.revenue)
})

test('set_business_day_start: chủ quán ghi được, có event before/after, changed_via owner', async () => {
  const r = await setStart(owner2, s2, '05:30')
  assert.deepEqual(r, { ok: true, business_day_start: '05:30' })
  const { rows: [w] } = await db.query(`SELECT to_char(business_day_start, 'HH24:MI') AS start, updated_by, updated_at
    FROM store_workflow_settings WHERE store_id = $1`, [s2])
  assert.equal(w.start, '05:30')
  assert.equal(w.updated_by, owner2)
  assert.ok(Math.abs(Date.now() - new Date(w.updated_at).getTime()) < 60000)
  const { rows } = await db.query('SELECT * FROM store_workflow_setting_events WHERE store_id = $1', [s2])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].before_value.business_day_start, '00:00')
  assert.equal(rows[0].after_value.business_day_start, '05:30')
  assert.equal(rows[0].changed_by, owner2)
  assert.equal(rows[0].changed_via, 'owner')
})

test('set_business_day_start: superadmin ghi changed_via mevo; quán thiếu dòng cài đặt được tạo; quán không có thì báo lỗi', async () => {
  await setStart(admin, s2, '06:00')
  const { rows } = await db.query(`SELECT changed_via FROM store_workflow_setting_events
    WHERE store_id = $1 AND after_value->>'business_day_start' = '06:00'`, [s2])
  assert.deepEqual(rows.map((x) => x.changed_via), ['mevo'])

  assert.deepEqual(await setStart(admin, sNoRow, '04:00'), { ok: true, business_day_start: '04:00' })
  assert.equal(await dateOf(sNoRow, '2026-11-02 03:59:59+07'), DAY)
  await db.query('DELETE FROM store_workflow_setting_events WHERE store_id = $1', [sNoRow])
  await db.query('DELETE FROM store_workflow_settings WHERE store_id = $1', [sNoRow])

  await assert.rejects(setStart(admin, id(99), '05:00'), /Không tìm thấy quán/)
})

test('set_business_day_start: thu ngân, phục vụ, chủ quán khác bị chặn', async () => {
  for (const uid of [cashier, staff, owner0]) {
    await assert.rejects(setStart(uid, s1, '06:00'), /Chỉ chủ quán được đổi giờ bắt đầu ngày/)
  }
  const { rows } = await db.query(`SELECT to_char(business_day_start, 'HH24:MI') AS start FROM store_workflow_settings WHERE store_id = $1`, [s1])
  assert.equal(rows[0].start, START)
  assert.equal((await db.query('SELECT 1 FROM store_workflow_setting_events WHERE store_id = $1', [s1])).rows.length, 0)
})

test('set_business_day_start: 12:30 và 05:15 bị chặn', async () => {
  const msg = /Giờ bắt đầu ngày phải từ 00:00 đến 12:00, bước 30 phút/
  for (const start of ['12:30', '05:15', '05:00:30', '23:00', null]) {
    await assert.rejects(setStart(owner2, s2, start), msg, String(start))
  }
  for (const start of ['00:00', '12:00', '11:30']) {
    assert.equal((await setStart(owner2, s2, start)).business_day_start, start)
  }
  // Cột tự chặn cả đường ghi không qua RPC.
  for (const start of ['12:30', '05:15', '05:00:30']) {
    await assert.rejects(db.query('UPDATE store_workflow_settings SET business_day_start = $1 WHERE store_id = $2', [start, s2]),
      /store_workflow_business_day_start_check/)
  }
})

test('snapshot trả business_day_start HH:MM', async () => {
  const snap = async (fn, storeId) => (await db.query(`SELECT ${fn}($1) AS r`, [storeId])).rows[0].r
  assert.equal((await snap('store_workflow_snapshot', s1)).business_day_start, '05:00')
  assert.equal((await snap('store_workflow_snapshot', s0)).business_day_start, '00:00')
  const pub = await snap('get_public_store_workflow', s1)
  assert.equal(pub.business_day_start, '05:00')
  assert.equal(pub.reservation_preorder_edit_cutoff_minutes, 30)
  assert.equal(Object.keys(pub).length, 20)
})

test('3 hàm nội bộ: role authenticated và anon không EXECUTE được', async () => {
  const calls = [
    ['business_date_of(uuid,timestamptz)', 'SELECT business_date_of($1, now())'],
    ['current_business_date(uuid)', 'SELECT current_business_date($1)'],
    ['business_day_bounds(uuid,date)', 'SELECT * FROM business_day_bounds($1, current_date)'],
  ]
  for (const [sig, sql] of calls) {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`)
      await assert.rejects(db.query(sql, [s1]), /permission denied for function/, `${role} ${sig}`)
      await db.exec('RESET ROLE')
      const { rows } = await db.query('SELECT has_function_privilege($1, $2, \'EXECUTE\') AS ok', [role, `public.${sig}`])
      assert.equal(rows[0].ok, false, `${role} ${sig}`)
    }
  }
  const can = async (role) => (await db.query(
    "SELECT has_function_privilege($1, 'public.set_business_day_start(uuid,time)', 'EXECUTE') AS ok", [role])).rows[0].ok
  assert.equal(await can('anon'), false)
  assert.equal(await can('authenticated'), true)
})

// --- Kiểm tĩnh migration + bản chụp prod ---
const migration = new URL('../migrations/111_business_day.sql', import.meta.url)
const defs = new URL('./prod-defs/111/', import.meta.url)
const load = async (url) => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')
const SIG = {
  'public.get_bills_report(uuid,date)': { file: 'get_bills_report.sql', count: 2, md5: '264c5deeaf1377abd508ad8abba4851d' },
  'public.store_workflow_snapshot(uuid)': { file: 'store_workflow_snapshot.sql', count: 1, md5: '843a28abd74697aebd2ed9f770cd00e3' },
}

function patches(sql, sig) {
  const out = []
  const re = /pg_temp\.mevo_patch\(\s*'([^']+)',\s*\$a\$([\s\S]*?)\$a\$,\s*\$b\$([\s\S]*?)\$b\$\s*\)/g
  for (const m of sql.matchAll(re)) if (m[1] === sig) out.push({ from: m[2], to: m[3] })
  return out
}

test('chuỗi neo khớp đúng 1 lần trong prod-defs/111', async () => {
  const sql = await load(migration)
  const patched = new Set([...sql.matchAll(/pg_temp\.mevo_patch\(\s*'([^']+)'/g)].map((m) => m[1]))
  assert.deepEqual([...patched].sort(), Object.keys(SIG).sort())
  for (const [sig, { file, count, md5 }] of Object.entries(SIG)) {
    const raw = await readFile(new URL(file, defs)) // bản chụp giữ nguyên byte, md5 khớp prod 2026-11-06
    assert.equal(createHash('md5').update(raw).digest('hex'), md5, `${file}: lệch byte so với prod`)
    let def = raw.toString('utf8')
    const ps = patches(sql, sig)
    assert.equal(ps.length, count, `${sig}: số lời vá`)
    for (const { from, to } of ps) {
      const n = def.split(from).length - 1
      assert.equal(n, 1, `${sig}: chuỗi neo phải khớp đúng 1 lần, đang khớp ${n}:\n${from}`)
      def = def.replace(from, () => to)
    }
  }
})

test('migration: hàm đã vá không còn mốc ngày lịch, đúng mẫu vá tại chỗ', async () => {
  const sql = await load(migration)
  assert.match(sql, /mig 111: % không còn chuỗi cần vá/)
  assert.match(sql, /mig 111: % có hơn một chỗ khớp chuỗi cần vá/)
  assert.doesNotMatch(sql, /rerun-safe/i)
  assert.match(sql, /NOTIFY pgrst, 'reload schema';\s*$/)
  const { rows } = await db.query(`SELECT pg_get_functiondef('public.get_bills_report(uuid,date)'::regprocedure) AS d`)
  assert.doesNotMatch(rows[0].d, /p_date \+ 1/)
  assert.doesNotMatch(rows[0].d, /now\(\)/)
})
