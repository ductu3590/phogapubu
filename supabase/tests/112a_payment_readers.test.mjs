// Mig 112a (Task 3) — báo cáo A04 (get_bills_report) và hoá đơn in (get_sessions_bill) đọc từng khoản thu.
// Bill có bill_payment_id gom theo khoá P:<payment_id>, TM/CK lấy từ bill_payment_lines; bill cũ giữ đường cũ.
// Bất biến: totals.cash + bank + other = revenue.
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { openCollectDb } from './helpers/collect-bill-db.mjs'

const migration = new URL('../migrations/112a_collect_table_bill.sql', import.meta.url)
const load = async (u) => (await readFile(u, 'utf8')).replace(/\r\n/g, '\n')

let h, session, order, collect, confirm, rid, report, sessionsBill, legacyPaidSession, legacyCashPaid, walletOrder
before(async () => {
  h = await openCollectDb()
  ;({ session, order, collect, confirm, rid, report, sessionsBill, legacyPaidSession, legacyCashPaid, walletOrder } = h)
})
beforeEach(async () => h.reset())
after(async () => h?.db.close())

const cash = (amount) => ({ instrument: 'cash', amount })
const bank = (amount) => ({ instrument: 'bank', amount })
const invariant = (t) => assert.equal(t.cash + t.bank + t.other, t.revenue, 'TM + CK + khác phải bằng doanh thu')

test('bill kết hợp: một dòng, đúng từng khoản, TM + CK + khác = doanh thu', async () => {
  const s = await session(); await order(s, 1000000)
  const { payment_id } = await collect([s], [cash(400000), bank(600000)], 500000, rid())
  const r = await report()
  const b = r.bills.find((x) => x.key === `P:${payment_id}`)
  assert.equal(b.instrument, 'mixed')
  assert.deepEqual(b.payments, [{ instrument: 'cash', amount: 400000 }, { instrument: 'bank', amount: 600000 }])
  assert.deepEqual([b.cash_given, b.change_amount], [500000, 100000])
  assert.deepEqual([r.totals.cash, r.totals.bank, r.totals.other, r.totals.revenue], [400000, 600000, 0, 1000000])
  assert.equal(r.totals.bills_count, 1)
})

test('gộp N mâm thu một lần: MỘT dòng bill', async () => {
  const a = await session(); await order(a, 1000); const b = await session(); await order(b, 2000)
  await collect([a, b], [cash(3000)], null, rid())
  const r = await report()
  assert.equal(r.bills.length, 1); assert.equal(r.bills[0].merged, true); assert.equal(r.bills[0].instrument, 'cash')
  assert.deepEqual(r.bills[0].payments, [{ instrument: 'cash', amount: 3000 }])
  assert.equal(r.bills[0].total, 3000)
})

test('bill cũ chưa có bill_payment_id: khoá và số giữ nguyên như trước', async () => {
  const s = await legacyPaidSession({ amount: 5000, instrument: 'bank' })
  const r = await report()
  const b = r.bills.find((x) => x.session_ids.includes(s))
  assert.match(b.key, /^C:/); assert.equal(b.instrument, 'bank'); assert.deepEqual(b.payments, [])
  assert.deepEqual([b.cash_given, b.change_amount], [null, null])
  assert.deepEqual([r.totals.bank, r.totals.revenue], [5000, 5000])
})

test('đơn tiền mặt legacy (paid, không có payment_received_at) vẫn vào TM; ví vào khác', async () => {
  await legacyCashPaid(7000); await walletOrder(9000)
  const r = await report()
  assert.deepEqual([r.totals.cash, r.totals.other, r.totals.revenue], [7000, 9000, 16000])
})

test('đơn đã ghi sẵn cash nhưng chưa thu không vào doanh thu', async () => {
  const s = await session(); await order(s, 4000, { instrument: 'cash' })
  assert.equal((await report()).totals.revenue, 0)
})

test('xác nhận tay đơn zalo_checkout chưa ghi phương tiện: dòng bill và tổng đều là bank', async () => {
  const o = await order(null, 2000, { method: 'zalo_checkout', instrument: null })
  await confirm(o)
  const r = await report()
  assert.equal(r.totals.bank, 2000); assert.equal(r.bills[0].instrument, 'bank')
  assert.match(r.bills[0].key, /^P:/)
})

test('cả ngày lẫn lộn mọi kiểu thu: bất biến TM + CK + khác = doanh thu, mỗi đồng vào đúng một ngăn', async () => {
  const s = await session({ discount: ['amount', 10000] }); await order(s, 110000)
  await collect([s], [cash(30000), bank(70000)], 50000, rid())          // kết hợp, sau giảm 100.000
  const t = await session(); await order(t, 40000)
  await collect([t], [bank(40000)], null, rid())                          // CK một phương tiện
  await legacyPaidSession({ amount: 5000, instrument: 'cash' })           // bill cũ TM
  await legacyCashPaid(6000)                                              // TM kiểu cũ
  await walletOrder(9000)                                                 // ví → khác
  const o = await order(null, 8000, { method: 'cash' }); await confirm(o) // xác nhận tay TM
  const r = await report()
  invariant(r.totals)
  assert.ok(r.totals.other >= 0, `'khác' là phần còn lại, không được âm: ${r.totals.other}`)
  assert.deepEqual([r.totals.cash, r.totals.bank, r.totals.other, r.totals.revenue],
    [30000 + 5000 + 6000 + 8000, 70000 + 40000, 9000, 168000])
  assert.equal(r.totals.bills_count, 6)
})

test('get_sessions_bill: bill đã thu trả khoản; bill chưa thu trả rỗng', async () => {
  const s = await session(); await order(s, 1000000)
  const before = await sessionsBill([s])
  assert.deepEqual(before.payments, [])
  assert.deepEqual([before.cash_given, before.change_amount], [null, null])
  await collect([s], [cash(400000), bank(600000)], 500000, rid())
  const b = await sessionsBill([s])
  assert.deepEqual(b.payments, [{ instrument: 'cash', amount: 400000 }, { instrument: 'bank', amount: 600000 }])
  assert.deepEqual([b.cash_given, b.change_amount], [500000, 100000])
})

test('get_sessions_bill nhiều khoản thu: cộng theo phương tiện, tiền khách đưa/thối để NULL', async () => {
  const a = await session(); await order(a, 1000); const c = await session(); await order(c, 2000)
  await collect([a], [cash(1000)], 5000, rid())
  await collect([c], [cash(500), bank(1500)], null, rid())
  const b = await sessionsBill([a, c])
  assert.deepEqual(b.payments, [{ instrument: 'cash', amount: 1500 }, { instrument: 'bank', amount: 1500 }])
  assert.deepEqual([b.cash_given, b.change_amount], [null, null])
})

test('mig 112a: 2 hàm đọc chỉ được vá bằng mevo_patch, không CREATE OR REPLACE', async () => {
  const sql = await load(migration)
  assert.doesNotMatch(sql, /^CREATE OR REPLACE FUNCTION public\.(get_bills_report|get_sessions_bill)\b/m)
  const patched = [...sql.matchAll(/pg_temp\.mevo_patch\(\s*'([^']+)'/g)].map((m) => m[1])
  // Ghim số neo: thêm/bớt một lời vá mà quên test là lộ ra ở đây.
  assert.equal(patched.filter((p) => p === 'public.get_bills_report(uuid, date)').length, 9)
  assert.equal(patched.filter((p) => p === 'public.get_sessions_bill(uuid[])').length, 1)
})
