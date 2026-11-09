import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { openFinanceDb } from './helpers/finance-report-fixture.mjs'

// Test mig 125 (báo cáo tài chính). Task 7: tổng ngày dùng chung (report_day_totals) + vá get_bills_report
// + doanh thu theo ngày / tháng. Dữ liệu: bảng seed của plan (quán bắt đầu ngày 05:00), dựng bằng RPC thật
// (collect_table_bill có dòng nợ, debt_collect, debt_payment_void, cash_book_create) rồi dời giờ.
// Chụp get_bills_report của 4 ngày TRƯỚC khi áp 125 (beforePatch); mọi test chạy SAU khi đã áp.
let h, ids, rpc, rpcAs, report, s1
let defBefore
const beforePatch = {}
const DATES = ['2026-10-20', '2026-11-20', '2026-12-01', '2026-12-02']
const KEYS = ['revenue', 'cash', 'bank', 'debt', 'other', 'bills_count', 'discount_total']

before(async () => {
  h = await openFinanceDb()
  ;({ ids, rpc, rpcAs, report } = h)
  s1 = ids.store
  defBefore = (await h.one("SELECT pg_get_functiondef('public.get_bills_report(uuid,date)'::regprocedure) AS d")).d
  await h.seedFinance()
  for (const d of DATES) beforePatch[d] = await report(d)
  await h.apply125()
})

after(async () => h?.db.close())

const pickTotals = (t) => Object.fromEntries(KEYS.map((k) => [k, t[k]]))

test('get_bills_report sau 125 giống hệt trước 125, totals chỉ thêm discount_total', async () => {
  for (const d of DATES) {
    const after = await report(d)
    const { discount_total, ...totals } = after.totals
    assert.equal(typeof discount_total, 'number', d)
    assert.deepEqual({ ...after, totals }, beforePatch[d], d)
    assert.equal(after.bills.length, after.totals.bills_count, d)
  }
})

test('ngày 12-01: TM + CK + nợ + khác = doanh thu', async () => {
  const t = (await report('2026-12-01')).totals
  assert.deepEqual([t.revenue, t.cash, t.bank, t.debt, t.other, t.bills_count, t.discount_total],
    [3170000, 1000000, 850000, 1200000, 120000, 6, 50000])
  assert.equal(t.cash + t.bank + t.debt + t.other, t.revenue)
  // 7 đơn (bill X gọi hai lượt) nhưng 6 bill: bills_count đếm khoá bill, không đếm đơn.
  const { day_from: from, day_to: to } = await report('2026-12-01')
  assert.equal(Number((await h.one('SELECT count(*) AS n FROM report_paid_orders($1, $2, $3)', [s1, from, to])).n), 7)
  // Ví Zalo không phiên: khoá O:, nhóm 'khác'.
  const r = await report('2026-12-01')
  assert.deepEqual(r.bills.filter((b) => b.key.startsWith('O:')).map((b) => [b.total, b.instrument]), [[120000, 'other']])
  // Tiền mặt kiểu cũ (status paid, không payment_received_at) ngày 11-20: rơi về completed_at, nhóm TM.
  const n = (await report('2026-11-20')).totals
  assert.deepEqual([n.revenue, n.cash, n.debt, n.bills_count], [180000, 80000, 100000, 2])
})

test('doanh thu theo ngày = get_bills_report từng ngày (so trực tiếp)', async () => {
  const s = await rpc('report_revenue_series', s1, '2026-12-01', '2026-12-03', 'day')
  assert.deepEqual([s.from, s.to, s.grain], ['2026-12-01', '2026-12-03', 'day'])
  assert.deepEqual(s.rows.map((r) => r.date), ['2026-12-01', '2026-12-02', '2026-12-03'])
  for (const r of s.rows) {
    const { revenue, cash, bank, debt, other, bills_count, discount_total } = (await report(r.date)).totals
    assert.deepEqual(r, { date: r.date, revenue, cash, bank, debt, other, bills_count, discount_total }, r.date)
  }
  assert.deepEqual(s.rows[2], { date: '2026-12-03', revenue: 0, cash: 0, bank: 0, debt: 0, other: 0, bills_count: 0, discount_total: 0 })
  assert.equal(s.totals.revenue, 3470000)
  assert.deepEqual(s.totals, { revenue: 3470000, cash: 1000000, bank: 1150000, debt: 1200000, other: 120000, bills_count: 7, discount_total: 50000 })
})

test('chế độ tháng: 12 dòng từ 2026-01-01, tháng 12 = cộng các ngày tháng 12', async () => {
  // p_from bị bỏ qua ở chế độ tháng.
  const s = await rpc('report_revenue_series', s1, '2026-12-15', '2026-12-20', 'month')
  assert.equal(s.grain, 'month')
  assert.equal(s.rows.length, 12)
  assert.equal(s.rows[0].date, '2026-01-01')
  assert.equal(s.rows[11].date, '2026-12-01')
  const days = await rpc('report_revenue_series', s1, '2026-12-01', '2026-12-31', 'day')
  assert.deepEqual(pickTotals(s.rows[11]), days.totals)
  const byMonth = Object.fromEntries(s.rows.map((r) => [r.date, r.revenue]))
  assert.deepEqual([byMonth['2026-10-01'], byMonth['2026-11-01'], byMonth['2026-12-01'], byMonth['2026-09-01']],
    [250000, 180000, 3470000, 0])
  assert.equal(s.totals.revenue, 3900000)
  // Tháng 11 = cộng các ngày tháng 11, kể cả bill 04:30 sáng 01/12 (ngày kinh doanh 30/11 ở quán 05:00):
  // khoảng tháng phải chạy tới day_to của NGÀY CUỐI tháng. Bill tạm, xoá ngay sau khi đo.
  const tmp = h.rid()
  await h.db.query(`INSERT INTO orders(id, store_id, status, total_amount, payment_amount, payment_method, payment_instrument,
      payment_received_at, payment_received_via, payment_received_by, order_type, completed_at)
    VALUES ($1, $2, 'paid', 70000, 70000, 'cash', 'cash', '2026-12-01 04:30:00+07', 'owner', $3, 'pickup', '2026-12-01 04:30:00+07')`,
  [tmp, s1, ids.cashier])
  try {
    const m = await rpc('report_revenue_series', s1, '2026-12-20', '2026-12-20', 'month')
    const nov = await rpc('report_revenue_series', s1, '2026-11-01', '2026-11-30', 'day')
    assert.equal(nov.totals.revenue, 250000)
    assert.deepEqual(pickTotals(m.rows[10]), nov.totals)
    assert.equal(m.rows[11].revenue, 3470000)
  } finally {
    await h.db.query('DELETE FROM orders WHERE id = $1', [tmp])
  }
})

test('report_day_totals cắt đúng nửa khoảng [from, to)', async () => {
  // X thu 19:00, Y thu 20:00 ngày 12-01: khoảng [19:00, 20:00) chỉ có X.
  const t = (await h.one(`SELECT report_day_totals($1, '2026-12-01 19:00:00+07', '2026-12-01 20:00:00+07') AS t`, [s1])).t
  assert.deepEqual(pickTotals(t), { revenue: 500000, cash: 500000, bank: 0, debt: 0, other: 0, bills_count: 1, discount_total: 0 })
})

test('Σ theo món − giảm giá = doanh thu ngày có bill kết hợp và bill nợ', async () => {
  const r = await rpc('report_sales_by_item', s1, '2026-12-01', '2026-12-01')
  assert.equal(r.summary.items_amount - r.summary.discount_total, 3170000)
  assert.equal(r.summary.revenue, (await report('2026-12-01')).totals.revenue)
  assert.equal(r.summary.discount_total, (await report('2026-12-01')).totals.discount_total)
})

test('grain lạ bị chặn; kỳ ngược bị chặn', async () => {
  await assert.rejects(rpc('report_revenue_series', s1, '2026-12-01', '2026-12-03', 'week'), /Chế độ không hợp lệ/)
  await assert.rejects(rpc('report_revenue_series', s1, '2026-12-01', '2026-12-03', null), /Chế độ không hợp lệ/)
  await assert.rejects(rpc('report_revenue_series', s1, '2026-12-03', '2026-12-01', 'day'), /Kỳ báo cáo không hợp lệ/)
  await assert.rejects(rpc('report_revenue_series', s1, '2025-01-01', '2026-01-02', 'day'), /tối đa 366 ngày/)
  await assert.rejects(rpc('report_revenue_series', s1, null, '2026-12-03', 'day'), /Thiếu quán hoặc kỳ/)
  await assert.rejects(rpc('report_revenue_series', s1, '2026-12-01', null, 'month'), /Thiếu quán hoặc kỳ/)
  await assert.rejects(rpc('report_revenue_series', null, '2026-12-01', '2026-12-03', 'day'), /Thiếu quán hoặc kỳ/)
})

test('quyền: thu ngân, phục vụ, superadmin bị chặn, quản lý và chủ quán được; chủ quán khác bị chặn', async () => {
  const call = (uid) => rpcAs(uid, 'report_revenue_series', s1, '2026-12-01', '2026-12-01', 'day')
  for (const uid of [ids.owner, ids.manager]) assert.equal((await call(uid)).totals.revenue, 3170000, uid)
  for (const uid of [ids.cashier, ids.staff, ids.otherOwner, ids.admin]) {
    await assert.rejects(call(uid), /Không có quyền xem báo cáo quán này/, uid)
  }
  const can = async (role) => (await h.one(
    "SELECT has_function_privilege($1, 'public.report_revenue_series(uuid,date,date,text)', 'EXECUTE') AS ok", [role])).ok
  assert.equal(await can('anon'), false)
  assert.equal(await can('authenticated'), true)
  // A04 vẫn mở cho thu ngân (get_bills_report kiểm is_store_pos_operator, không đổi).
  assert.equal((await report('2026-12-01', s1, ids.cashier)).totals.revenue, 3170000)
})

test('hàm nội bộ report_day_totals, report_cash_book_by_category: authenticated không EXECUTE được', async () => {
  const calls = [
    ['report_day_totals(uuid,timestamptz,timestamptz)', "SELECT report_day_totals($1, now() - interval '1 day', now())"],
    ['report_cash_book_by_category(uuid,date,date)', "SELECT * FROM report_cash_book_by_category($1, '2026-12-01', '2026-12-03')"],
  ]
  for (const [sig, sql] of calls) {
    for (const role of ['anon', 'authenticated']) {
      await h.db.exec(`SET ROLE ${role}`)
      await assert.rejects(h.db.query(sql, [s1]), /permission denied for function/, `${role} ${sig}`)
      await h.db.exec('RESET ROLE')
      const ok = (await h.one("SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok", [role, `public.${sig}`])).ok
      assert.equal(ok, false, `${role} ${sig}`)
    }
  }
})

// --- Kiểm tĩnh migration + bản chụp ---
const load = async (u) => (await readFile(u, 'utf8')).replace(/\r\n/g, '\n')
const migration = new URL('../migrations/125_financial_reports.sql', import.meta.url)
const snapshot = new URL('./prod-defs/125/get_bills_report.sql', import.meta.url)

function patches(sql, sig) {
  const out = []
  const re = /pg_temp\.mevo_patch\(\s*'([^']+)',\s*\$a\$([\s\S]*?)\$a\$,\s*\$b\$([\s\S]*?)\$b\$\s*\)/g
  for (const m of sql.matchAll(re)) if (m[1] === sig) out.push({ from: m[2], to: m[3] })
  return out
}

test('bản chụp prod-defs/125 = get_bills_report của chuỗi migration trước 125 (byte, bỏ CRLF)', async () => {
  assert.equal(await load(snapshot), defBefore.replace(/\r\n/g, '\n'))
})

test('neo của mig 125 khớp đúng 1 lần trong prod-defs/125/get_bills_report.sql', async () => {
  const sql = await load(migration)
  const snap = await load(snapshot)
  const sigs = new Set([...sql.matchAll(/pg_temp\.mevo_patch\(\s*'([^']+)'/g)].map((m) => m[1]))
  assert.deepEqual([...sigs], ['public.get_bills_report(uuid,date)'])
  const list = patches(sql, 'public.get_bills_report(uuid,date)')
  assert.equal(list.length, 2)
  for (const { from } of list) assert.equal(snap.split(from).length - 1, 1, from.slice(0, 60))
  assert.match(list[0].from, /WHERE o\.store_id = p_store_id/)
  assert.match(list[1].from, /^ {6}'totals', \(/)
})

test('migration: chỉ CREATE FUNCTION hàm mới, không ghi "rerun-safe", hàm sau vá gọi hai hàm dùng chung', async () => {
  const sql = await load(migration)
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\./)
  assert.doesNotMatch(sql, /rerun-safe/i)
  const def = (await h.one("SELECT pg_get_functiondef('public.get_bills_report(uuid,date)'::regprocedure) AS d")).d
  assert.match(def, /WHERE o\.id IN \(SELECT r\.order_id FROM public\.report_paid_orders\(p_store_id, v_from, v_to\) r\)/)
  assert.match(def, /'totals', public\.report_day_totals\(p_store_id, v_from, v_to\),/)
  assert.doesNotMatch(def, /COALESCE\(o\.payment_received_at, o\.completed_at, o\.updated_at\) >= v_from/)
})

// ================================================================================================================
// Task 8 — Thu chi và Lãi lỗ (kỳ 12-01 … 12-03)
// ================================================================================================================
const P = ['2026-12-01', '2026-12-03']
const cogsStub = (o) => ({ items: [], goods_cogs: 520000, ingredient_cogs: 900000, writeoff_cost: 60000,
  ingredient_uncounted: false, missing_cost_items: 0, ...o })
// Stub inventory_cogs chỉ sống trong fn: lỗi giữa chừng vẫn nạp lại bản 118, không lây sang test sau.
async function withCogs(stub, fn) {
  await h.stubCogs(stub)
  try {
    return await fn()
  } finally {
    await h.restoreCogs()
  }
}

test('thu chi: hai quỹ, ghi nợ không là tiền vào, phiếu huỷ không tính', async () => {
  const r = await rpc('report_cash_flow', s1, ...P)
  assert.deepEqual([r.from, r.to], P)
  // Ngân hàng vào = bill 1.150.000 + ví 120.000 + trả nợ 500.000 + thu khác 50.000.
  assert.deepEqual(r.funds, { cash: { in: 2400000, out: 2900000, net: -500000 }, bank: { in: 1820000, out: 500000, net: 1320000 } })
  assert.deepEqual(r.inflows.slice(0, 3).map((x) => [x.key, x.label, x.cash, x.bank]),
    [['bills', 'Thu bill', 1000000, 1150000], ['wallet', 'Thu qua ví', 0, 120000], ['debt', 'Thu nợ', 400000, 500000]])
  assert.deepEqual(r.inflows.slice(3).map((x) => [x.label, x.cash, x.bank]), [['Nộp thêm vào két', 1000000, 0], ['Thu khác', 0, 50000]])
  assert.ok(r.inflows.slice(3).every((x) => /^cat:[0-9a-f-]{36}$/.test(x.key)))
  assert.deepEqual(r.outflows.map((x) => [x.label, x.report_group, x.cash, x.bank]), [
    ['Nhập hàng', 'inventory_purchase', 600000, 0], ['Đi chợ', 'operating_expense', 300000, 0],
    ['Lương - thưởng', 'operating_expense', 0, 500000], ['Chủ quán rút', 'owner_draw', 2000000, 0],
  ])
  assert.ok(!r.outflows.some((x) => x.label === 'Đá'))
  // Cộng các dòng = quỹ (không có tiền rơi ngoài dòng).
  const sum = (rows, k) => rows.reduce((s, x) => s + x[k], 0)
  assert.deepEqual([sum(r.inflows, 'cash'), sum(r.inflows, 'bank'), sum(r.outflows, 'cash'), sum(r.outflows, 'bank')],
    [r.funds.cash.in, r.funds.bank.in, r.funds.cash.out, r.funds.bank.out])
})

test('thu chi: kỳ không có ví thì không có dòng "Thu qua ví"; ghi nợ không là tiền vào', async () => {
  const r = await rpc('report_cash_flow', s1, '2026-12-02', '2026-12-02')
  assert.deepEqual(r.inflows.slice(0, 2).map((x) => [x.key, x.cash, x.bank]), [['bills', 0, 300000], ['debt', 400000, 500000]])
  assert.ok(!r.inflows.some((x) => x.key === 'wallet'))
  // Ngày 12-01 có bill ghi nợ 1.200.000 nhưng không có lần trả: Thu nợ = 0.
  const d1 = await rpc('report_cash_flow', s1, '2026-12-01', '2026-12-01')
  assert.deepEqual(d1.inflows.find((x) => x.key === 'debt'), { key: 'debt', label: 'Thu nợ', cash: 0, bank: 0 })
  assert.equal(d1.funds.cash.in + d1.funds.bank.in, 1000000 + 850000 + 120000 + 1000000)
})

test('lãi lỗ với số cụ thể', async () => {
  const p = await withCogs(cogsStub(), () => rpc('report_profit_loss', s1, ...P))
  assert.deepEqual([p.from, p.to], P)
  // Doanh thu 3.470.000 (gồm ví 120.000) − giá vốn 1.420.000 − chi phí 800.000 − hao hụt 60.000 + thu khác 50.000.
  assert.deepEqual([p.revenue, p.cogs_goods, p.cogs_ingredient, p.cogs_total, p.gross_profit, p.operating_expenses.total,
    p.writeoff_cost, p.other_income.total, p.net_profit],
  [3470000, 520000, 900000, 1420000, 2050000, 800000, 60000, 50000, 1240000])
  assert.deepEqual(p.excluded, { inventory_purchase: 600000, owner_draw: 2000000, cash_transfer: 1000000 })
  assert.deepEqual(p.operating_expenses.rows.map((x) => [x.name, x.amount]), [['Lương - thưởng', 500000], ['Đi chợ', 300000]])
  assert.deepEqual(p.other_income.rows.map((x) => [x.name, x.amount]), [['Thu khác', 50000]])
  assert.ok(p.operating_expenses.rows.every((x) => typeof x.category_id === 'string'))
  assert.deepEqual(p.warnings, { ingredient_uncounted: false, missing_cost_items: [] })
  // Doanh thu lãi lỗ = cộng A04 từng ngày.
  assert.equal(p.revenue, (await rpc('report_revenue_series', s1, ...P, 'day')).totals.revenue)
})

test('nguyên liệu chưa kiểm kho: không tính giá vốn nguyên liệu, có cảnh báo; không cộng lại các dòng items', async () => {
  // items của nguyên liệu vẫn mang cogs riêng (hợp đồng KHO) — báo cáo đọc tổng, không cộng dòng.
  const p = await withCogs(cogsStub({
    ingredient_uncounted: true, ingredient_cogs: 0,
    items: [{ inventory_item_id: '00000000-0000-0000-0000-0000000000a3', name: 'Thịt bò', kind: 'ingredient', cogs: 777000, missing_cost: false }],
  }), () => rpc('report_profit_loss', s1, ...P))
  assert.deepEqual([p.cogs_ingredient, p.cogs_total, p.net_profit, p.warnings.ingredient_uncounted], [0, 520000, 2140000, true])
  // Kể cả khi inventory_cogs lỡ trả ingredient_cogs khác 0 mà vẫn đánh dấu chưa kiểm: lãi lỗ vẫn tính 0.
  const q = await withCogs(cogsStub({ ingredient_uncounted: true }), () => rpc('report_profit_loss', s1, ...P))
  assert.equal(q.cogs_ingredient, 0)
})

test('hàng thiếu giá nhập được liệt kê', async () => {
  const p = await withCogs(cogsStub({
    missing_cost_items: 1,
    items: [
      { inventory_item_id: '00000000-0000-0000-0000-0000000000a1', name: 'Đá viên', kind: 'ingredient', cogs: 0, missing_cost: true },
      { inventory_item_id: '00000000-0000-0000-0000-0000000000a2', name: 'Bia lon', kind: 'goods', cogs: 520000, missing_cost: false },
    ],
  }), () => rpc('report_profit_loss', s1, ...P))
  assert.deepEqual(p.warnings.missing_cost_items, [{ inventory_item_id: '00000000-0000-0000-0000-0000000000a1', name: 'Đá viên' }])
})

test('tích hợp mig 118 thật: cogs_goods + cogs_ingredient khớp inventory_cogs cùng kỳ', async () => {
  const { db, rid } = h
  const item = rid()
  const doc = rid()
  await db.exec('RESET ROLE')
  // Bia lon trong kho gắn món Bia Hà Nội lon (1 lon / phần), nhập 100 lon × 12.000 trước kỳ.
  await db.query(`INSERT INTO inventory_items(id, store_id, name, unit, kind) VALUES ($1, $2, 'Bia lon kho', 'lon', 'goods')`, [item, s1])
  await db.query(`INSERT INTO menu_stock_links(store_id, menu_item_id, inventory_item_id, qty_per_sale, valid_from)
    VALUES ($1, $2, $3, 1, '2026-01-01')`, [s1, ids.mBiaHN, item])
  await db.query(`INSERT INTO inventory_documents(id, store_id, kind, doc_no, doc_date, effective_at, total_amount, paid_status,
      client_request_id, created_by) VALUES ($1, $2, 'receipt', 'PN-T125', '2026-11-25', '2026-11-25 10:00:00+07', 1200000, 'unpaid', $3, $4)`,
  [doc, s1, rid(), ids.owner])
  await db.query(`INSERT INTO inventory_document_lines(document_id, store_id, inventory_item_id, qty, unit_cost, line_amount)
    VALUES ($1, $2, $3, 100, 12000, 1200000)`, [doc, s1, item])
  try {
    const cogs = await rpc('inventory_cogs', s1, ...P)
    const p = await rpc('report_profit_loss', s1, ...P)
    // Bán trong kỳ: X 25 + Z 10 + ví 6 + V 15 = 56 lon × 12.000.
    assert.equal(cogs.goods_cogs, 672000)
    assert.deepEqual([p.cogs_goods, p.cogs_ingredient, p.writeoff_cost],
      [cogs.goods_cogs, cogs.ingredient_uncounted ? 0 : cogs.ingredient_cogs, cogs.writeoff_cost])
    assert.equal(p.cogs_total, p.cogs_goods + p.cogs_ingredient)
    assert.equal(p.gross_profit, p.revenue - p.cogs_total)
    // Quản lý xem được (inventory_cogs bên trong vẫn kiểm quyền theo người gọi).
    assert.equal((await rpcAs(ids.manager, 'report_profit_loss', s1, ...P)).cogs_goods, 672000)
  } finally {
    await db.exec('RESET ROLE')
    await db.query('DELETE FROM menu_stock_links WHERE inventory_item_id = $1', [item])
    await db.query('DELETE FROM inventory_document_lines WHERE document_id = $1', [doc])
    await db.query('DELETE FROM inventory_documents WHERE id = $1', [doc])
    await db.query('DELETE FROM inventory_items WHERE id = $1', [item])
  }
})

test('quyền: thu ngân, phục vụ, superadmin, chủ quán khác bị chặn cả hai RPC; kỳ sai bị chặn', async () => {
  await withCogs(cogsStub(), async () => {
    for (const fn of ['report_cash_flow', 'report_profit_loss']) {
      assert.ok(await rpcAs(ids.manager, fn, s1, ...P), `${fn} quản lý`)
      for (const uid of [ids.cashier, ids.staff, ids.admin, ids.otherOwner]) {
        await assert.rejects(rpcAs(uid, fn, s1, ...P), /Không có quyền xem báo cáo quán này/, `${fn} ${uid}`)
      }
      await assert.rejects(rpc(fn, s1, '2026-12-03', '2026-12-01'), /Kỳ báo cáo không hợp lệ/)
      await assert.rejects(rpc(fn, s1, null, '2026-12-01'), /Thiếu quán hoặc kỳ/)
      const ok = (await h.one("SELECT has_function_privilege('anon', $1, 'EXECUTE') AS ok", [`public.${fn}(uuid,date,date)`])).ok
      assert.equal(ok, false, fn)
    }
  })
})

// ================================================================================================================
// Task 9 — Công nợ phải thu
// ================================================================================================================
// [opening, incurred, collected, closing, oldest_open_date, age_0_7, age_8_30, age_over_30]
const pick = (x) => [x.opening, x.incurred, x.collected, x.closing, x.oldest_open_date, x.age_0_7, x.age_8_30, x.age_over_30]
const rowOf = (r, n) => r.rows.find((x) => x.name === n)

test('kỳ 12-02..12-03: đầu kỳ + phát sinh − thu = cuối kỳ, tuổi nợ', async () => {
  const r = await rpc('report_receivables', s1, '2026-12-02', '2026-12-03')
  assert.deepEqual([r.from, r.to], ['2026-12-02', '2026-12-03'])
  assert.deepEqual(pick(rowOf(r, 'Cty Điện lực')), [800000, 0, 500000, 300000, '2026-12-01', 300000, 0, 0])
  assert.deepEqual(pick(rowOf(r, 'Anh Hùng')), [400000, 0, 400000, 0, null, 0, 0, 0])
  assert.deepEqual(pick(rowOf(r, 'Cô Lan')), [250000, 0, 0, 250000, '2026-10-20', 0, 0, 250000])
  assert.deepEqual(pick(rowOf(r, 'Chú Bình')), [100000, 0, 0, 100000, '2026-11-20', 0, 100000, 0])
  assert.deepEqual(r.totals, { opening: 1550000, incurred: 0, collected: 900000, closing: 650000, age_0_7: 300000, age_8_30: 100000, age_over_30: 250000 })
  for (const x of r.rows) assert.equal(x.opening + x.incurred - x.collected, x.closing, x.name)
  // Sắp: cuối kỳ giảm dần, rồi tên.
  assert.deepEqual(r.rows.map((x) => x.name), ['Cty Điện lực', 'Cô Lan', 'Chú Bình', 'Anh Hùng'])
  const hung = rowOf(r, 'Anh Hùng')
  assert.deepEqual([hung.customer_id, hung.phone, hung.kind], [hung.customer_id, '0912345678', 'person'])
  assert.equal(rowOf(r, 'Cty Điện lực').kind, 'company')
})

test('kỳ 12-01..12-03: phát sinh 1.200.000 của Điện lực + Anh Hùng', async () => {
  const r = await rpc('report_receivables', s1, '2026-12-01', '2026-12-03')
  assert.deepEqual(pick(rowOf(r, 'Cty Điện lực')), [0, 800000, 500000, 300000, '2026-12-01', 300000, 0, 0])
  assert.deepEqual(pick(rowOf(r, 'Anh Hùng')), [0, 400000, 400000, 0, null, 0, 0, 0])
  assert.deepEqual(r.totals, { opening: 350000, incurred: 1200000, collected: 900000, closing: 650000, age_0_7: 300000, age_8_30: 100000, age_over_30: 250000 })
  // Cuối kỳ cộng các tuổi nợ = cuối kỳ (không bill nào âm).
  assert.equal(r.totals.age_0_7 + r.totals.age_8_30 + r.totals.age_over_30, r.totals.closing)
  // Cuối kỳ hôm nay = số nợ "lúc này" của 123 (không lần trả nào sau 12-03).
  for (const x of r.rows) {
    const now = Number((await h.one('SELECT COALESCE(SUM(outstanding), 0) AS n FROM debt_customer_bills($1)', [x.customer_id])).n)
    assert.equal(x.closing, now, x.name)
  }
})

test('lần trả đã huỷ không giảm nợ, kể cả khi huỷ sau kỳ', async () => {
  // Đẩy giờ huỷ của lần trả 100.000 sang năm sau: vẫn coi như chưa từng có.
  await h.db.exec('RESET ROLE')
  await h.db.query("UPDATE debt_payments SET voided_at = '2027-01-15 10:00:00+07' WHERE voided_at IS NOT NULL")
  const r = await rpc('report_receivables', s1, '2026-12-02', '2026-12-02')
  assert.deepEqual(pick(rowOf(r, 'Anh Hùng')), [400000, 0, 400000, 0, null, 0, 0, 0])
  const before = await rpc('report_receivables', s1, '2026-12-01', '2026-12-01')
  assert.deepEqual(pick(rowOf(before, 'Anh Hùng')), [0, 400000, 0, 400000, '2026-12-01', 400000, 0, 0])
})

test('khách không có số nào khác 0 không có dòng', async () => {
  assert.deepEqual((await rpc('report_receivables', s1, '2026-10-01', '2026-10-19')).rows, [])
  const empty = await rpc('report_receivables', s1, '2026-10-01', '2026-10-19')
  assert.deepEqual(empty.totals, { opening: 0, incurred: 0, collected: 0, closing: 0, age_0_7: 0, age_8_30: 0, age_over_30: 0 })
  // Sau khi Anh Hùng trả hết: kỳ sau đó không còn dòng Anh Hùng; ba khách còn nợ vẫn có (đầu kỳ = cuối kỳ).
  const later = await rpc('report_receivables', s1, '2026-12-04', '2026-12-05')
  assert.deepEqual(later.rows.map((x) => x.name), ['Cty Điện lực', 'Cô Lan', 'Chú Bình'])
  assert.deepEqual(pick(rowOf(later, 'Cty Điện lực')), [300000, 0, 0, 300000, '2026-12-01', 300000, 0, 0])
})

test('ngày phát sinh theo giờ thu (dời theo giờ bắt đầu ngày); ngày trả nợ đọc thẳng business_date (không dời)', async () => {
  // Chấp nhận có chủ đích (hợp đồng chung): bill tính ngày từ bill_payments.collected_at qua business_date_of, nên
  // đổi giờ bắt đầu ngày thì bill dời ngày; lần trả nợ lưu sẵn business_date lúc ghi nên KHÔNG dời.
  const { db } = h
  const dien = (await h.one("SELECT id FROM debt_customers WHERE store_id = $1 AND name = 'Cty Điện lực'", [s1])).id
  const bill = (await h.one('SELECT id, collected_at FROM bill_payments WHERE debt_customer_id = $1', [dien]))
  await db.exec('RESET ROLE')
  await db.query("UPDATE bill_payments SET collected_at = '2026-12-02 04:30:00+07' WHERE id = $1", [bill.id])
  try {
    // Quán 05:00: 04:30 sáng 12-02 vẫn thuộc ngày 12-01.
    let r = await rpc('report_receivables', s1, '2026-12-02', '2026-12-02')
    assert.deepEqual(pick(rowOf(r, 'Cty Điện lực')).slice(0, 4), [800000, 0, 500000, 300000])
    // Đổi về 00:00: bill dời sang ngày 12-02, lần trả 500.000 vẫn ngày 12-02.
    await h.setDayStart(s1, '00:00')
    r = await rpc('report_receivables', s1, '2026-12-02', '2026-12-02')
    assert.deepEqual(pick(rowOf(r, 'Cty Điện lực')), [0, 800000, 500000, 300000, '2026-12-02', 300000, 0, 0])
  } finally {
    await h.setDayStart(s1, '05:00')
    await db.query('UPDATE bill_payments SET collected_at = $2 WHERE id = $1', [bill.id, bill.collected_at])
  }
})

test('quyền + cách ly quán', async () => {
  const call = (uid, store = s1) => rpcAs(uid, 'report_receivables', store, '2026-12-02', '2026-12-03')
  assert.equal((await call(ids.manager)).totals.closing, 650000)
  for (const uid of [ids.cashier, ids.staff, ids.admin, ids.otherOwner]) {
    await assert.rejects(call(uid), /Không có quyền xem báo cáo quán này/, uid)
  }
  await assert.rejects(rpc('report_receivables', s1, '2026-12-03', '2026-12-02'), /Kỳ báo cáo không hợp lệ/)
  await assert.rejects(rpc('report_receivables', s1, '2025-01-01', '2026-01-02'), /tối đa 366 ngày/)
  await assert.rejects(rpc('report_receivables', s1, null, '2026-12-02'), /Thiếu quán hoặc kỳ/)
  assert.equal((await h.one("SELECT has_function_privilege('anon', 'public.report_receivables(uuid,date,date)', 'EXECUTE') AS ok")).ok, false)

  // Quán khác có một khách nợ: chỉ chủ quán đó thấy, số không lọt sang quán s1 và ngược lại.
  const { db, rid } = h
  await db.exec('RESET ROLE')
  const other = ids.otherStore
  const cust = (await h.one(`INSERT INTO debt_customers(store_id, name, kind, created_by) VALUES ($1, 'Khách quán khác', 'person', $2)
    RETURNING id`, [other, ids.otherOwner])).id
  const bp = (await h.one(`INSERT INTO bill_payments(store_id, client_request_id, total_amount, collected_by, collected_at, source,
      debt_customer_id) VALUES ($1, $2, 90000, $3, '2026-12-02 20:00:00+07', 'pos', $4) RETURNING id`,
  [other, rid(), ids.otherOwner, cust])).id
  await db.query("INSERT INTO bill_payment_lines(payment_id, instrument, amount) VALUES ($1, 'debt', 90000)", [bp])
  try {
    const mine = await rpc('report_receivables', s1, '2026-12-02', '2026-12-03')
    assert.ok(!mine.rows.some((x) => x.name === 'Khách quán khác'))
    assert.equal(mine.totals.closing, 650000)
    const theirs = await rpcAs(ids.otherOwner, 'report_receivables', other, '2026-12-02', '2026-12-03')
    assert.deepEqual(theirs.rows.map((x) => [x.name, x.incurred, x.closing]), [['Khách quán khác', 90000, 90000]])
    assert.equal(theirs.totals.closing, 90000)
  } finally {
    await db.query('DELETE FROM bill_payment_lines WHERE payment_id = $1', [bp])
    await db.query('DELETE FROM bill_payments WHERE id = $1', [bp])
    await db.query('DELETE FROM debt_customers WHERE id = $1', [cust])
  }
})
