import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { setupThrough117 } from './helpers/sales-report-fixture.mjs'

// Test mig 117: báo cáo bán hàng theo món, danh mục, giờ. Phạm vi "đã bán" = đơn đã thu có giờ nhận tiền trong kỳ,
// cùng điều kiện với A04, nên Σ tiền món − giảm giá phải ra đúng doanh thu get_bills_report từng đồng.
// Quán s1 bắt đầu ngày 05:00, s2 00:00. Ngày D = 2026-03-20 (giờ VN). Mọi giờ trong dữ liệu là giờ VN (+07).
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()

// Ngày cố định ở QUÁ KHỨ: test 'phiên đang mở' dựng bill vào hôm nay thật (now()), không bao giờ trùng các ngày này.
const D = '2026-03-20'
const NEXT = '2026-03-21'
const DUP_DAY = '2026-03-25' // trùng tên khác danh mục
const ORPHAN_DAY = '2026-03-26' // món mất danh mục
const at = (date, hms) => `${date} ${hms}+07`

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const owner = id(1), cashier = id(2), staff = id(3), owner2 = id(4), manager = id(5), admin = id(6), owner3 = id(7)
const s1 = id(10), s2 = id(11), s3 = id(12) // s3 bắt đầu ngày 05:30
const tA1 = id(21), tA5 = id(22), tS2 = id(23)
const catLau = id(31), catNuong = id(32), catDo = id(33), catS2 = id(34), catGone = id(35)
const mLauThai = id(41), mLauRieu = id(42), mBaChi = id(43), mBiaHN = id(44), mBiaHoi = id(45), mS2 = id(46)
let seq = 1000
const newId = () => id(seq++)
const ownerOf = { [s1]: owner, [s2]: owner2, [s3]: owner3 }

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
const rpc = (name, store, from, to, uid = ownerOf[store] ?? owner) => as(uid, async () =>
  (await db.query(`SELECT ${name}($1, $2::date, $3::date) AS r`, [store, from, to])).rows[0].r)
const report = (date, storeId = s1) => as(ownerOf[storeId], async () =>
  (await db.query('SELECT get_bills_report($1, $2::date) AS r', [storeId, date])).rows[0].r)

// Đơn đã thu. Có phiên thì dine_in, không phiên thì pickup (như brief).
async function paidOrder({ store = s1, sessionId = null, table = null, total, billDiscount = 0, receivedAt,
  createdAt = receivedAt, confirmedAt = null, instrument = 'cash' }) {
  const o = newId()
  await db.query(`INSERT INTO orders(id, store_id, table_id, session_id, status, total_amount, bill_discount_amount,
    payment_method, payment_instrument, payment_received_at, payment_received_by, order_type, created_at, updated_at, confirmed_at)
    VALUES ($1, $2, $3, $4, 'paid', $5, $6, $7, $8, $9, $10, $11, $12, $9, $13)`,
  [o, store, table, sessionId, total, billDiscount, instrument === 'bank' ? 'bank_transfer' : 'cash', instrument,
    receivedAt, cashier, sessionId ? 'dine_in' : 'pickup', createdAt, confirmedAt])
  return o
}
async function line(orderId, { name, price, qty = 1, menu = null, toppings = [], voidType = null, voidedAt = null,
  voidedBy = null, voidReason = null }) {
  const i = newId()
  await db.query(`INSERT INTO order_items(id, order_id, menu_item_id, item_name, item_price, quantity, selected_toppings,
    void_type, voided_at, voided_by, void_reason) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
  [i, orderId, menu, name, price, qty, JSON.stringify(toppings), voidType, voidedAt, voidedBy, voidReason])
  return i
}
async function qtyChange({ store = s1, orderId, itemId, name, from, to, reason, changedAt }) {
  await db.query(`INSERT INTO order_item_quantity_changes(id, store_id, order_id, order_item_id, item_name, old_quantity,
    new_quantity, reason, changed_by, changed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
  [newId(), store, orderId, itemId, name, from, to, reason, cashier, changedAt])
}

before(async () => {
  await setupThrough117(db)
  await db.exec(`
    INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
      ('${owner}', 'chu@quan.vn', '{"full_name":"Chủ quán"}'), ('${cashier}', 'thungan@quan.vn', '{"full_name":"Thu ngân"}'),
      ('${staff}', 'nv@quan.vn', '{}'), ('${owner2}', 'chu2@quan.vn', '{}'), ('${manager}', 'ql@quan.vn', '{}'),
      ('${admin}', 'mevo@mevo.vn', '{}'), ('${owner3}', 'chu3@quan.vn', '{}');
    INSERT INTO stores(id) VALUES ('${s1}'), ('${s2}'), ('${s3}');
    INSERT INTO store_workflow_settings(store_id, business_day_start) VALUES ('${s1}', '05:00'), ('${s2}', '00:00'), ('${s3}', '05:30');
    INSERT INTO mevo_operators VALUES
      ('${owner}', '${s1}', 'store_owner', true), ('${cashier}', '${s1}', 'store_cashier', true),
      ('${staff}', '${s1}', 'store_staff', true), ('${manager}', '${s1}', 'store_manager', true),
      ('${owner2}', '${s2}', 'store_owner', true), ('${owner3}', '${s3}', 'store_owner', true), ('${admin}', NULL, 'mevo_superadmin', true);
    INSERT INTO tables VALUES ('${tA1}', '${s1}', 'A1'), ('${tA5}', '${s1}', 'A5'), ('${tS2}', '${s2}', 'B1');
    INSERT INTO menu_categories(id, store_id, name, sort_order) VALUES
      ('${catLau}', '${s1}', 'Lẩu', 1), ('${catNuong}', '${s1}', 'Nướng', 2), ('${catDo}', '${s1}', 'Đồ uống', 3),
      ('${catS2}', '${s2}', 'Lẩu', 1);
    INSERT INTO menu_items(id, store_id, category_id, name, price) VALUES
      ('${mLauThai}', '${s1}', '${catLau}', 'Lẩu thái', 300000), ('${mLauRieu}', '${s1}', '${catLau}', 'Lẩu riêu', 250000),
      ('${mBaChi}', '${s1}', '${catNuong}', 'Ba chỉ nướng', 120000),
      ('${mBiaHN}', '${s1}', '${catDo}', 'Bia Hà Nội lon', 20000), ('${mBiaHoi}', '${s1}', '${catDo}', 'Bia hơi', 100000),
      ('${mS2}', '${s2}', '${catS2}', 'Lẩu thái', 999000);
  `)

  // Bill A: phiên bàn A1, thu D 19:00, giảm giá bill 40.000 ghi trên đơn A1.
  const sA = newId()
  await db.query(`INSERT INTO table_sessions(id, store_id, table_id, status, opened_at, closed_at, closed_by, close_reason)
    VALUES ($1, $2, $3, 'closed', $4, $5, $6, 'paid')`, [sA, s1, tA1, at(D, '18:00:00'), at(D, '19:00:00'), cashier])
  await db.query('INSERT INTO session_tables(session_id, table_id, is_open) VALUES ($1, $2, false)', [sA, tA1])
  const a1 = await paidOrder({ sessionId: sA, table: tA1, total: 700000, billDiscount: 40000, receivedAt: at(D, '19:00:00'),
    createdAt: at(D, '18:05:00'), confirmedAt: at(D, '18:10:00') })
  await line(a1, { name: 'Lẩu thái', price: 300000, menu: mLauThai })
  const biaA1 = await line(a1, { name: 'Bia Hà Nội lon', price: 20000, qty: 10, menu: mBiaHN })
  await qtyChange({ orderId: a1, itemId: biaA1, name: 'Bia Hà Nội lon', from: 12, to: 10, reason: 'Khách trả lại',
    changedAt: at(D, '18:40:00') })
  await line(a1, { name: 'Ba chỉ nướng', price: 120000, qty: 2, menu: mBaChi })
  await line(a1, { name: 'Ba chỉ nướng', price: 120000, menu: mBaChi, voidType: 'gift', voidedAt: at(D, '18:30:00'),
    voidedBy: owner })
  const a2 = await paidOrder({ sessionId: sA, table: tA1, total: 100000, receivedAt: at(D, '19:00:00'),
    createdAt: at(D, '18:48:00'), confirmedAt: at(D, '18:50:00') })
  const biaA2 = await line(a2, { name: 'Bia Hà Nội lon', price: 20000, qty: 5, menu: mBiaHN })
  await qtyChange({ orderId: a2, itemId: biaA2, name: 'Bia Hà Nội lon', from: 4, to: 5, reason: 'Khách gọi thêm',
    changedAt: at(D, '18:52:00') })
  await line(a2, { name: 'Lẩu riêu', price: 250000, menu: mLauRieu, voidType: 'cancelled', voidedAt: at(D, '18:55:00'),
    voidedBy: cashier, voidReason: 'Bếp hết' })

  // Bill B: không phiên, chuyển khoản, thu giây cuối ngày D (04:59:59 hôm sau).
  const b1 = await paidOrder({ total: 210000, instrument: 'bank', receivedAt: at(NEXT, '04:59:59'),
    createdAt: at(NEXT, '04:25:00'), confirmedAt: at(NEXT, '04:30:00') })
  await line(b1, { name: 'Bia hơi (Tháp)', price: 150000, menu: mBiaHoi })
  await line(b1, { name: 'Món cũ', price: 50000, toppings: [{ price: 10000 }] })

  // Bill C: thu đúng giây đầu ngày NEXT.
  const c1 = await paidOrder({ total: 300000, receivedAt: at(NEXT, '05:00:00') })
  await line(c1, { name: 'Lẩu thái', price: 300000, menu: mLauThai })

  // Phiên đang mở, chưa thu: không được vào số.
  const sOpen = newId()
  await db.query(`INSERT INTO table_sessions(id, store_id, table_id, status, opened_at) VALUES ($1, $2, $3, 'open', $4)`,
    [sOpen, s1, tA5, at(D, '20:00:00')])
  await db.query('INSERT INTO session_tables(session_id, table_id, is_open) VALUES ($1, $2, true)', [sOpen, tA5])
  const oOpen = newId()
  await db.query(`INSERT INTO orders(id, store_id, table_id, session_id, status, total_amount, created_at, confirmed_at)
    VALUES ($1, $2, $3, $4, 'confirmed', 300000, $5, $5)`, [oOpen, s1, tA5, sOpen, at(D, '20:05:00')])
  await line(oOpen, { name: 'Lẩu thái', price: 300000, menu: mLauThai })

  // Quán s2 (00:00): bill cùng ngày D.
  const z1 = await paidOrder({ store: s2, total: 999000, receivedAt: at(D, '19:00:00'), confirmedAt: at(D, '18:00:00') })
  await line(z1, { name: 'Lẩu thái', price: 999000, menu: mS2 })
})

after(async () => db.close())

test('Theo món: đúng SL bán, SL tặng, tiền; món bỏ không có dòng', async () => {
  const r = await rpc('report_sales_by_item', s1, D, D)
  assert.deepEqual(r.rows.map((x) => [x.item_name, x.category_name, x.qty_sold, x.qty_gift, x.amount]), [
    ['Bia Hà Nội lon', 'Đồ uống', 15, 0, 300000], // cùng tiền với Lẩu thái: SL lớn hơn đứng trước
    ['Lẩu thái', 'Lẩu', 1, 0, 300000],
    ['Ba chỉ nướng', 'Nướng', 2, 1, 240000],
    ['Bia hơi (Tháp)', 'Đồ uống', 1, 0, 150000],
    ['Món cũ', 'Khác', 1, 0, 60000],
  ])
  assert.deepEqual(r.summary, { items_amount: 1050000, discount_total: 40000, revenue: 1010000, qty_sold: 20, qty_gift: 1, open_tables_count: 0 })
  assert.equal(r.rows[0].category_id, catDo)
  assert.equal(r.rows[4].category_id, null)
})

test('Σ theo món − giảm giá = doanh thu A04 ngày D', async () => {
  const r = await rpc('report_sales_by_item', s1, D, D)
  const a04 = await report(D, s1)
  assert.equal(r.summary.items_amount - r.summary.discount_total, a04.totals.revenue)
  assert.equal(r.summary.revenue, a04.totals.revenue)
  assert.equal(r.rows.reduce((s, x) => s + x.amount, 0), r.summary.items_amount)
})

test('phần đầu chung: from, to và mốc cắt đúng ngày kinh doanh của A04', async () => {
  const r = await rpc('report_sales_by_item', s1, D, NEXT)
  const [a, b] = [await report(D, s1), await report(NEXT, s1)]
  assert.equal(r.from, D)
  assert.equal(r.to, NEXT)
  assert.equal(new Date(r.period_from).getTime(), new Date(a.day_from).getTime())
  assert.equal(new Date(r.period_to).getTime(), new Date(b.day_to).getTime())
  assert.equal(new Date(r.period_from).getTime(), new Date(at(D, '05:00:00')).getTime())
  for (const name of ['report_sales_by_category', 'report_sales_by_hour']) {
    const x = await rpc(name, s1, D, NEXT)
    assert.deepEqual([x.from, x.to, x.period_from, x.period_to, x.summary], [r.from, r.to, r.period_from, r.period_to, r.summary], name)
  }
})

test('Theo danh mục = Σ theo món; xổ ra món trong danh mục', async () => {
  const r = await rpc('report_sales_by_category', s1, D, D)
  assert.deepEqual(r.rows.map((x) => [x.category_name, x.qty_sold, x.amount]),
    [['Đồ uống', 16, 450000], ['Lẩu', 1, 300000], ['Nướng', 2, 240000], ['Khác', 1, 60000]])
  assert.deepEqual(r.rows[0].items.map((i) => i.item_name), ['Bia Hà Nội lon', 'Bia hơi (Tháp)'])
  assert.deepEqual(r.rows[2], {
    category_id: catNuong, category_name: 'Nướng', qty_sold: 2, qty_gift: 1, amount: 240000,
    items: [{ item_name: 'Ba chỉ nướng', qty_sold: 2, qty_gift: 1, amount: 240000 }],
  })
  assert.equal(r.rows[3].category_id, null)
  assert.equal(r.rows.reduce((s, x) => s + x.amount, 0), 1050000)
})

test('Theo giờ theo giờ vào bếp, 18h trước 04h ở quán 05:00', async () => {
  const r = await rpc('report_sales_by_hour', s1, D, D)
  assert.deepEqual(r.rows, [
    { hour: 18, orders_count: 2, items_qty: 19, amount: 840000 },
    { hour: 4, orders_count: 1, items_qty: 2, amount: 210000 },
  ])
  assert.equal(r.rows.reduce((s, x) => s + x.amount, 0), r.summary.items_amount)
})

test('quán 05:30: khung 5h (chứa giờ bắt đầu ngày) đứng đầu, 18h, rồi 4h và 5h sáng hôm sau gộp khung 5h', async () => {
  // Kỳ ngày D ở s3 = [D 05:30, D+1 05:30). Khung 5h nhận cả 05:40 hôm D lẫn 05:10 hôm sau.
  const o1 = await paidOrder({ store: s3, total: 10000, receivedAt: at(D, '06:00:00'), confirmedAt: at(D, '05:40:00') })
  await line(o1, { name: 'Trà đá', price: 10000 })
  const o2 = await paidOrder({ store: s3, total: 50000, receivedAt: at(D, '19:00:00'), confirmedAt: at(D, '18:00:00') })
  await line(o2, { name: 'Lạc rang', price: 25000, qty: 2 })
  const o3 = await paidOrder({ store: s3, total: 30000, receivedAt: at(NEXT, '04:20:00'), confirmedAt: at(NEXT, '04:10:00') })
  await line(o3, { name: 'Mì xào', price: 30000 })
  const o4 = await paidOrder({ store: s3, total: 20000, receivedAt: at(NEXT, '05:20:00'), confirmedAt: at(NEXT, '05:10:00') })
  await line(o4, { name: 'Trà đá', price: 10000, qty: 2 })
  const r = await rpc('report_sales_by_hour', s3, D, D)
  assert.deepEqual(r.rows, [
    { hour: 5, orders_count: 2, items_qty: 3, amount: 30000 },
    { hour: 18, orders_count: 1, items_qty: 2, amount: 50000 },
    { hour: 4, orders_count: 1, items_qty: 1, amount: 30000 },
  ])
  assert.equal(r.summary.revenue, (await report(D, s3)).totals.revenue)
  assert.equal(r.rows.reduce((s, x) => s + x.amount, 0), r.summary.items_amount)
})

test('quán 00:00: vào bếp 23:50, thu 00:10 hôm sau → bill thuộc D+1, hiện ở khung 23h', async () => {
  const o = await paidOrder({ store: s2, total: 45000, receivedAt: at(NEXT, '00:10:00'), confirmedAt: at(D, '23:50:00') })
  await line(o, { name: 'Ngô chiên', price: 45000 })
  const h = await rpc('report_sales_by_hour', s2, NEXT, NEXT)
  assert.deepEqual(h.rows, [{ hour: 23, orders_count: 1, items_qty: 1, amount: 45000 }])
  assert.equal(h.summary.revenue, 45000)
  assert.equal(h.summary.revenue, (await report(NEXT, s2)).totals.revenue)
  const d = await rpc('report_sales_by_item', s2, D, D)
  assert.ok(!d.rows.some((x) => x.item_name === 'Ngô chiên'), 'không lọt về ngày vào bếp')
  assert.equal(d.summary.revenue, (await report(D, s2)).totals.revenue)
})

test('đơn thiếu cả confirmed_at lẫn created_at: giờ rơi về giờ nhận tiền, không có khung null', async () => {
  const day = '2026-03-28'
  await db.exec('ALTER TABLE orders ALTER COLUMN created_at DROP NOT NULL') // prod cho NULL
  const o = await paidOrder({ store: s3, total: 15000, receivedAt: at(day, '21:15:00'), createdAt: null })
  await line(o, { name: 'Khoai lang', price: 15000 })
  const h = await rpc('report_sales_by_hour', s3, day, day)
  assert.deepEqual(h.rows, [{ hour: 21, orders_count: 1, items_qty: 1, amount: 15000 }])
})

test('biên ngày: 04:59:59 vào D, 05:00:00 vào D+1', async () => {
  const r = await rpc('report_sales_by_item', s1, NEXT, NEXT)
  assert.deepEqual(r.rows.map((x) => [x.item_name, x.amount]), [['Lẩu thái', 300000]])
  assert.equal(r.summary.revenue, (await report(NEXT, s1)).totals.revenue)
})

test('kỳ hai ngày = cộng hai ngày A04', async () => {
  const r = await rpc('report_sales_by_item', s1, D, NEXT)
  const revenue = (await report(D, s1)).totals.revenue + (await report(NEXT, s1)).totals.revenue
  assert.equal(r.summary.items_amount, 1350000)
  assert.equal(r.summary.revenue, revenue)
  assert.equal(r.summary.items_amount - r.summary.discount_total, revenue)
  assert.deepEqual(r.rows.slice(0, 2).map((x) => [x.item_name, x.qty_sold, x.amount]),
    [['Lẩu thái', 2, 600000], ['Bia Hà Nội lon', 15, 300000]])
  const h = await rpc('report_sales_by_hour', s1, D, NEXT)
  assert.equal(h.rows.reduce((s, x) => s + x.amount, 0), 1350000)
  assert.deepEqual(h.rows.map((x) => x.hour), [5, 18, 4]) // C1 vào bếp 05:00 đứng đầu ngày kinh doanh
})

test('trùng tên khác danh mục: hai dòng, tổng danh mục vẫn bằng tổng món', async () => {
  const mDup = newId()
  await db.query(`INSERT INTO menu_items(id, store_id, category_id, name, price) VALUES ($1, $2, $3, 'Lẩu thái', 30000)`,
    [mDup, s1, catDo])
  const o = await paidOrder({ total: 360000, receivedAt: at(DUP_DAY, '12:00:00') })
  await line(o, { name: 'Lẩu thái', price: 300000, menu: mLauThai })
  await line(o, { name: 'Lẩu thái', price: 30000, qty: 2, menu: mDup })
  const r = await rpc('report_sales_by_item', s1, DUP_DAY, DUP_DAY)
  assert.deepEqual(r.rows.map((x) => [x.item_name, x.category_name, x.qty_sold, x.amount]),
    [['Lẩu thái', 'Lẩu', 1, 300000], ['Lẩu thái', 'Đồ uống', 2, 60000]])
  const c = await rpc('report_sales_by_category', s1, DUP_DAY, DUP_DAY)
  assert.deepEqual(c.rows.map((x) => [x.category_name, x.amount]), [['Lẩu', 300000], ['Đồ uống', 60000]])
  assert.equal(c.rows.reduce((s, x) => s + x.amount, 0), r.summary.items_amount)
  assert.equal(r.summary.items_amount - r.summary.discount_total, (await report(DUP_DAY, s1)).totals.revenue)
})

test('món mất danh mục (category_id NULL) vào Khác', async () => {
  const mNoCat = newId(), mGoneCat = newId()
  await db.query(`INSERT INTO menu_items(id, store_id, category_id, name, price) VALUES
    ($1, $3, NULL, 'Nem chua', 40000), ($2, $3, $4, 'Gà rán', 70000)`, [mNoCat, mGoneCat, s1, catGone]) // catGone không tồn tại
  const o = await paidOrder({ total: 110000, receivedAt: at(ORPHAN_DAY, '12:00:00') })
  await line(o, { name: 'Nem chua', price: 40000, menu: mNoCat })
  await line(o, { name: 'Gà rán', price: 70000, menu: mGoneCat })
  const r = await rpc('report_sales_by_item', s1, ORPHAN_DAY, ORPHAN_DAY)
  assert.deepEqual(r.rows.map((x) => [x.item_name, x.category_id, x.category_name, x.amount]),
    [['Gà rán', null, 'Khác', 70000], ['Nem chua', null, 'Khác', 40000]])
  const c = await rpc('report_sales_by_category', s1, ORPHAN_DAY, ORPHAN_DAY)
  assert.deepEqual(c.rows.map((x) => [x.category_id, x.category_name, x.amount, x.items.length]), [[null, 'Khác', 110000, 2]])
})

test('phiên đang mở: không vào số; open_tables_count = 1 khi kỳ chứa hôm nay', async () => {
  const today = (await db.query('SELECT current_business_date($1)::text AS d', [s1])).rows[0].d
  const o = await paidOrder({ total: 35000, receivedAt: new Date().toISOString() })
  await line(o, { name: 'Khoai tây chiên', price: 35000 })
  const r = await rpc('report_sales_by_item', s1, today, today)
  assert.deepEqual(r.rows.map((x) => [x.item_name, x.amount]), [['Khoai tây chiên', 35000]])
  assert.equal(r.summary.open_tables_count, 1)
  assert.equal(r.summary.revenue, (await report(today, s1)).totals.revenue)
  assert.equal((await report(today, s1)).open.tables_count, 1)
  // Kỳ không chứa hôm nay: không đếm bàn đang mở.
  assert.equal((await rpc('report_sales_by_item', s1, D, D)).summary.open_tables_count, 0)
})

test('kỳ ngược và kỳ 367 ngày bị chặn', async () => {
  await assert.rejects(rpc('report_sales_by_item', s1, NEXT, D), /Kỳ báo cáo không hợp lệ/)
  await assert.rejects(rpc('report_sales_by_item', s1, '2025-01-01', '2026-01-02'), /tối đa 366 ngày/)
  // 366 ngày (năm nhuận) vẫn được.
  await rpc('report_sales_by_item', s1, '2024-01-01', '2024-12-31')
  for (const name of ['report_sales_by_category', 'report_sales_by_hour']) {
    await assert.rejects(rpc(name, s1, NEXT, D), /Kỳ báo cáo không hợp lệ/, name)
    await assert.rejects(rpc(name, s1, null, D), /Thiếu quán hoặc kỳ/, name)
  }
  await assert.rejects(rpc('report_sales_by_item', null, D, D), /Thiếu quán hoặc kỳ/)
  await assert.rejects(rpc('report_sales_by_item', s1, D, null), /Thiếu quán hoặc kỳ/)
})

test('quyền: chủ quán, thu ngân, quản lý được; phục vụ và chủ quán s2 bị chặn; anon không EXECUTE', async () => {
  for (const name of ['report_sales_by_item', 'report_sales_by_category', 'report_sales_by_hour']) {
    for (const uid of [owner, cashier, manager]) {
      const r = await rpc(name, s1, D, D, uid)
      assert.equal(r.summary.revenue, 1010000, `${name} ${uid}`)
    }
    for (const uid of [staff, owner2, admin]) {
      await assert.rejects(rpc(name, s1, D, D, uid), /Không có quyền xem báo cáo quán này/, `${name} ${uid}`)
    }
    const sig = `public.${name}(uuid,date,date)`
    const can = async (role) => (await db.query("SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok", [role, sig])).rows[0].ok
    assert.equal(await can('anon'), false, `anon ${name}`)
    assert.equal(await can('authenticated'), true, `authenticated ${name}`)
    await db.exec('SET ROLE anon')
    await assert.rejects(db.query(`SELECT ${name}($1, $2::date, $2::date)`, [s1, D]), /permission denied for function/)
    await db.exec('RESET ROLE')
  }
})

test('cách ly: số của s2 không lọt vào s1 và ngược lại', async () => {
  const r2 = await rpc('report_sales_by_item', s2, D, D)
  assert.deepEqual(r2.rows.map((x) => [x.item_name, x.category_name, x.amount]), [['Lẩu thái', 'Lẩu', 999000]])
  assert.equal(r2.summary.revenue, (await report(D, s2)).totals.revenue)
  assert.equal(r2.summary.revenue, 999000)
  const h2 = await rpc('report_sales_by_hour', s2, D, D)
  assert.deepEqual(h2.rows, [{ hour: 18, orders_count: 1, items_qty: 1, amount: 999000 }])
  const r1 = await rpc('report_sales_by_item', s1, D, D)
  assert.ok(!r1.rows.some((x) => x.amount === 999000))
  assert.equal(r1.summary.items_amount, 1050000)
})

test('5 hàm nội bộ: authenticated không EXECUTE được', async () => {
  const from = at(D, '05:00:00'), to = at(NEXT, '05:00:00')
  const calls = [
    ['report_period_bounds(uuid,date,date)', 'SELECT * FROM report_period_bounds($1, $2::date, $2::date)', [s1, D]],
    ['report_paid_orders(uuid,timestamptz,timestamptz)', 'SELECT * FROM report_paid_orders($1, $2, $3)', [s1, from, to]],
    ['report_sold_lines(uuid,timestamptz,timestamptz)', 'SELECT * FROM report_sold_lines($1, $2, $3)', [s1, from, to]],
    ['report_item_groups(uuid,timestamptz,timestamptz)', 'SELECT * FROM report_item_groups($1, $2, $3)', [s1, from, to]],
    ['report_sales_summary(uuid,timestamptz,timestamptz)', 'SELECT report_sales_summary($1, $2, $3)', [s1, from, to]],
  ]
  for (const [sig, sql, params] of calls) {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`)
      await assert.rejects(db.query(sql, params), /permission denied for function/, `${role} ${sig}`)
      await db.exec('RESET ROLE')
      const { rows } = await db.query("SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok", [role, `public.${sig}`])
      assert.equal(rows[0].ok, false, `${role} ${sig}`)
    }
  }
})

test('hàm nội bộ: report_paid_orders trả đúng cột, kitchen_at rơi về created_at', async () => {
  const { rows } = await db.query(`SELECT order_id, session_id, total_amount, discount_amount, bill_discount_amount,
      kitchen_at = COALESCE((SELECT confirmed_at FROM orders WHERE id = order_id), (SELECT created_at FROM orders WHERE id = order_id)) AS k
    FROM report_paid_orders($1, $2, $3) ORDER BY total_amount DESC`, [s1, at(D, '05:00:00'), at(NEXT, '05:00:00')])
  assert.deepEqual(rows.map((x) => [Number(x.total_amount), Number(x.bill_discount_amount), x.k]),
    [[700000, 40000, true], [210000, 0, true], [100000, 0, true]])
  const lines = (await db.query(`SELECT item_name, quantity, is_gift, amount FROM report_sold_lines($1, $2, $3)
    ORDER BY item_name, is_gift`, [s1, at(D, '05:00:00'), at(NEXT, '05:00:00')])).rows
  assert.ok(!lines.some((l) => l.item_name === 'Lẩu riêu'), 'món bỏ không có dòng')
  assert.deepEqual(lines.filter((l) => l.is_gift).map((l) => [l.item_name, l.quantity, Number(l.amount)]), [['Ba chỉ nướng', 1, 0]])
})
