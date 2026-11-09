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
    [3050000, 1000000, 850000, 1200000, 0, 5, 50000])
  assert.equal(t.cash + t.bank + t.debt + t.other, t.revenue)
  // 6 đơn (bill X gọi hai lượt) nhưng 5 bill: bills_count đếm khoá bill, không đếm đơn.
  const { day_from: from, day_to: to } = await report('2026-12-01')
  assert.equal(Number((await h.one('SELECT count(*) AS n FROM report_paid_orders($1, $2, $3)', [s1, from, to])).n), 6)
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
  assert.equal(s.totals.revenue, 3350000)
  assert.deepEqual(s.totals, { revenue: 3350000, cash: 1000000, bank: 1150000, debt: 1200000, other: 0, bills_count: 6, discount_total: 50000 })
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
    [250000, 100000, 3350000, 0])
  assert.equal(s.totals.revenue, 3700000)
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
    assert.equal(nov.totals.revenue, 170000)
    assert.deepEqual(pickTotals(m.rows[10]), nov.totals)
    assert.equal(m.rows[11].revenue, 3350000)
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
  assert.equal(r.summary.items_amount - r.summary.discount_total, 3050000)
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

test('quyền: thu ngân và phục vụ bị chặn, quản lý và chủ quán được; chủ quán khác bị chặn', async () => {
  const call = (uid) => rpcAs(uid, 'report_revenue_series', s1, '2026-12-01', '2026-12-01', 'day')
  for (const uid of [ids.owner, ids.manager]) assert.equal((await call(uid)).totals.revenue, 3050000, uid)
  for (const uid of [ids.cashier, ids.staff, ids.otherOwner]) {
    await assert.rejects(call(uid), /Không có quyền xem báo cáo quán này/, uid)
  }
  const can = async (role) => (await h.one(
    "SELECT has_function_privilege($1, 'public.report_revenue_series(uuid,date,date,text)', 'EXECUTE') AS ok", [role])).ok
  assert.equal(await can('anon'), false)
  assert.equal(await can('authenticated'), true)
  // A04 vẫn mở cho thu ngân (get_bills_report kiểm is_store_pos_operator, không đổi).
  assert.equal((await report('2026-12-01', s1, ids.cashier)).totals.revenue, 3050000)
})

test('report_day_totals: authenticated không EXECUTE được', async () => {
  for (const role of ['anon', 'authenticated']) {
    await h.db.exec(`SET ROLE ${role}`)
    await assert.rejects(
      h.db.query("SELECT report_day_totals($1, now() - interval '1 day', now())", [s1]),
      /permission denied for function/, role)
    await h.db.exec('RESET ROLE')
    const ok = (await h.one("SELECT has_function_privilege($1, 'public.report_day_totals(uuid,timestamptz,timestamptz)', 'EXECUTE') AS ok", [role])).ok
    assert.equal(ok, false, role)
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
