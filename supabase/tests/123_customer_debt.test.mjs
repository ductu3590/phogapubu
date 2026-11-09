// Mig 123 — công nợ khách hàng.
//   Task 1: bảng debt_customers / debt_payments / debt_payment_allocations, khách nợ, collect_table_bill nhận dòng
//   ghi nợ (instrument 'debt') + khách nợ (chọn sẵn hoặc tạo mới trong cùng lần thu).
import { after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { openDebtDb } from './helpers/debt-db.mjs'

const h = await openDebtDb()
const {
  db, ids, reset, login, session, order, collect, rid, one, count, debt, customer, collectDebtBill, outstanding,
  rpc, enableShift, openShift, closeShiftRow,
} = h
after(async () => db.close())

const cash = (amount) => ({ instrument: 'cash', amount })
const bank = (amount) => ({ instrument: 'bank', amount })
beforeEach(() => reset())

test('ghi nợ 100%: bill 350.000, phiên đóng paid, bàn trống, đơn ghi debt', async () => {
  const c = await customer(); const s = await session(); const o = await order(s, 350000)
  const r = await collectDebtBill([s], [debt(350000)], null, rid(), { customerId: c })
  assert.deepEqual([r.ok, r.already, r.total], [true, false, 350000])
  assert.equal((await one('SELECT debt_customer_id FROM bill_payments WHERE id = $1', [r.payment_id])).debt_customer_id, c)
  assert.equal((await one('SELECT payment_instrument FROM orders WHERE id = $1', [o])).payment_instrument, 'debt')
  assert.deepEqual(Object.values(await one('SELECT status, close_reason FROM table_sessions WHERE id = $1', [s])), ['closed', 'paid'])
  assert.equal(await count('session_tables WHERE session_id = $1 AND is_open', [s]), 0)
  assert.equal(await outstanding(c), 350000)
})

test('TM 500.000 + nợ 700.000 trên bill 1.200.000: mixed, thối 0', async () => {
  const c = await customer(); const s = await session(); await order(s, 1200000)
  const r = await collectDebtBill([s], [cash(500000), debt(700000)], 500000, rid(), { customerId: c })
  assert.equal(await count('bill_payment_lines WHERE payment_id = $1', [r.payment_id]), 2)
  assert.equal((await one('SELECT change_amount FROM bill_payments WHERE id = $1', [r.payment_id])).change_amount, 0)
  assert.equal(await outstanding(c), 700000)
})

test('TM 200.000 + CK 300.000 + nợ 500.000 = 1.000.000: 3 dòng, đơn mixed', async () => {
  const c = await customer(); const s = await session(); const o = await order(s, 1000000)
  const r = await collectDebtBill([s], [cash(200000), bank(300000), debt(500000)], null, rid(), { customerId: c })
  assert.equal(await count('bill_payment_lines WHERE payment_id = $1', [r.payment_id]), 3)
  assert.equal((await one('SELECT payment_instrument FROM orders WHERE id = $1', [o])).payment_instrument, 'mixed')
})

test('khách mới tạo trong cùng lần thu; gọi lại cùng mã không tạo khách thứ hai', async () => {
  const s = await session(); await order(s, 80000); const id = rid()
  const nc = { name: '  Anh Long  ', phone: '+84 912 345 678', kind: 'person' }
  const a = await collectDebtBill([s], [debt(80000)], null, id, { newCustomer: nc })
  const b = await collectDebtBill([s], [debt(80000)], null, id, { newCustomer: nc })
  assert.deepEqual([b.already, b.payment_id], [true, a.payment_id])
  const row = await one('SELECT * FROM debt_customers')
  assert.deepEqual([row.name, row.phone, row.kind, row.created_by], ['Anh Long', '0912345678', 'person', ids.cashier])
  assert.equal(await count('debt_customers'), 1)
})

test('có dòng nợ mà thiếu khách hoặc khách sai: lỗi, không ghi gì', async () => {
  const s = await session(); const o = await order(s, 100000)
  const other = await customer({ store: ids.otherStore }); const off = await customer({ active: false, phone: '0988000111' })
  const cases = [
    [{}, /Chọn khách ghi nợ/],
    [{ customerId: other }, /Không tìm thấy khách nợ/],
    [{ customerId: off }, /Không tìm thấy khách nợ/],
    [{ customerId: off, newCustomer: { name: 'X' } }, /Chỉ chọn một khách ghi nợ/],
    [{ newCustomer: { name: '   ' } }, /Tên khách nợ không được trống/],
    [{ newCustomer: { name: 'Y', phone: '12ab' } }, /SĐT không hợp lệ/],
    [{ newCustomer: { name: 'Z', phone: '0988 000 111' } }, /SĐT 0988000111 đã có khách/],
  ]
  for (const [who, err] of cases) await assert.rejects(collectDebtBill([s], [debt(100000)], null, rid(), who), err)
  assert.equal(await count('bill_payments'), 0)
  assert.equal(await count('debt_customers WHERE store_id = $1', [ids.store]), 1) // chỉ còn khách đã ngừng
  assert.equal((await one('SELECT payment_received_at FROM orders WHERE id = $1', [o])).payment_received_at, null)
  assert.equal((await one('SELECT status FROM table_sessions WHERE id = $1', [s])).status, 'open')
})

test('khách mới bị huỷ cùng giao dịch khi bước sau lỗi (số tiền không khớp bill)', async () => {
  const s = await session(); await order(s, 80000)
  await assert.rejects(collectDebtBill([s], [debt(90000)], null, rid(), { newCustomer: { name: 'Anh Long', phone: '0912345678' } }),
    /Số tiền không khớp/)
  assert.equal(await count('debt_customers'), 0)
  assert.equal(await count('bill_payments'), 0)
})

test('gắn khách mà không có dòng nợ: lỗi', async () => {
  const c = await customer(); const s = await session(); await order(s, 1000)
  await assert.rejects(collectDebtBill([s], [cash(1000)], null, rid(), { customerId: c }), /Không có phần ghi nợ để gắn khách/)
})

test('dòng nợ hợp lệ như dòng khác: 0, âm, lẻ, trùng bị chặn', async () => {
  const c = await customer(); const s = await session(); await order(s, 1000)
  for (const lines of [[debt(0)], [debt(-1)], [{ instrument: 'debt', amount: 1.5 }]]) {
    await assert.rejects(collectDebtBill([s], lines, null, rid(), { customerId: c }), /Khoản thu không hợp lệ/)
  }
  await assert.rejects(collectDebtBill([s], [debt(500), debt(500)], null, rid(), { customerId: c }), /Mỗi phương tiện chỉ ghi một khoản/)
  await assert.rejects(collectDebtBill([s], [debt(1000)], 1000, rid(), { customerId: c }), /Không có phần tiền mặt/)
})

test('chữ ký: bản 4 tham số đã drop; gọi 4 tham số tên vẫn chạy; anon không EXECUTE', async () => {
  assert.equal((await one("SELECT to_regprocedure('public.collect_table_bill(uuid[],jsonb,integer,uuid)') v")).v, null)
  const sig = 'collect_table_bill(uuid[],jsonb,integer,uuid,uuid,jsonb)'
  const can = async (role, fn) => (await one("SELECT has_function_privilege($1, $2, 'EXECUTE') v", [role, fn])).v
  assert.deepEqual([await can('anon', sig), await can('authenticated', sig)], [false, true])
  for (const fn of ['debt_customer_create_internal(uuid,text,text,text,text,uuid)', 'debt_customer_bills(uuid)', 'debt_normalize_phone(text)']) {
    assert.equal(await can('authenticated', fn), false)
  }
  const s = await session(); await order(s, 1000)
  await login(ids.cashier)
  const r = (await db.query('SELECT collect_table_bill(p_session_ids => $1, p_lines => $2, p_cash_given => NULL, p_client_request_id => $3) v',
    [[s], JSON.stringify([cash(1000)]), rid()])).rows[0].v
  await db.exec('RESET ROLE')
  assert.equal(r.total, 1000)
})

test('quyền: phục vụ và quán khác không ghi nợ được', async () => {
  const c = await customer(); const s = await session(); await order(s, 1000)
  for (const uid of [ids.staff, ids.otherOwner]) {
    await assert.rejects(collectDebtBill([s], [debt(1000)], null, rid(), { customerId: c }, uid), /Chỉ chủ quán hoặc thu ngân/)
  }
  assert.equal((await collectDebtBill([s], [debt(1000)], null, rid(), { customerId: c }, ids.manager)).total, 1000)
})

test('bảng công nợ: authenticated không đọc thẳng được', async () => {
  await login(ids.owner)
  try {
    for (const t of ['debt_customers', 'debt_payments', 'debt_payment_allocations']) {
      await assert.rejects(db.query(`SELECT 1 FROM ${t}`), /permission denied/)
    }
  } finally {
    await db.exec('RESET ROLE')
  }
})

// ---- Thêm ngoài plan: nhánh 'already', ca, chuẩn hoá SĐT, khách mới song song ----

test('gọi lại cùng mã: lines trả về có dòng nợ (nhánh already)', async () => {
  const c = await customer(); const s = await session(); await order(s, 300000); const id = rid()
  await collectDebtBill([s], [cash(100000), debt(200000)], null, id, { customerId: c })
  const again = await collectDebtBill([s], [cash(100000), debt(200000)], null, id, { customerId: c })
  assert.equal(again.already, true)
  const byInstrument = Object.fromEntries(again.lines.map((l) => [l.instrument, Number(l.amount)]))
  assert.deepEqual(byInstrument, { cash: 100000, debt: 200000 })
  // Máy khác thu xong cả nhóm (mã khác): nhánh already thứ hai cũng thấy dòng nợ.
  const other = await collectDebtBill([s], [debt(300000)], null, rid(), { customerId: c })
  assert.equal(other.already, true)
  assert.ok(other.lines.some((l) => l.instrument === 'debt' && Number(l.amount) === 200000))
})

test('bật ca: ghi nợ 100% vẫn cần ca mở; có ca thì gắn ca, két không cộng phần nợ', async () => {
  const c = await customer(); const s = await session(); await order(s, 400000)
  await h.enableShift()
  await assert.rejects(collectDebtBill([s], [debt(400000)], null, rid(), { customerId: c }), /Chưa mở ca/)
  const shift = await h.openShift(0)
  const r = await collectDebtBill([s], [cash(150000), debt(250000)], 150000, rid(), { customerId: c })
  assert.equal((await one('SELECT cash_shift_id FROM bill_payments WHERE id = $1', [r.payment_id])).cash_shift_id, shift)
  const t = (await one('SELECT cash_shift_totals($1) AS r', [shift])).r
  assert.deepEqual([Number(t.cash_sales), Number(t.bank_sales), Number(t.expected_cash)], [150000, 0, 150000])
})

test('debt_normalize_phone: bỏ ký tự lạ, +84 → 0, rỗng → NULL, sai → lỗi', async () => {
  const norm = async (p) => (await one('SELECT debt_normalize_phone($1) AS v', [p])).v
  assert.equal(await norm('+84 912.345.678'), '0912345678')
  assert.equal(await norm('84-912345678'), '0912345678')
  assert.equal(await norm('0212 3456 789'), '02123456789')
  assert.equal(await norm('   '), null)
  assert.equal(await norm(null), null)
  for (const bad of ['12345', '0912', '+1 650 555 0100', '091234567890']) {
    await assert.rejects(norm(bad), /SĐT không hợp lệ/)
  }
})

test('debt_customer_create_internal: tên dài, loại sai, trùng SĐT kể cả khách đã ngừng', async () => {
  const mk = (name, phone, kind) => one(
    'SELECT debt_customer_create_internal($1, $2, $3, $4, NULL, $5) AS id', [ids.store, name, phone, kind, ids.owner])
  await assert.rejects(mk('x'.repeat(121), null, null), /Tên khách nợ quá dài/)
  await assert.rejects(mk('Anh A', null, 'vip'), /Loại khách không hợp lệ/)
  const a = (await mk('Anh A', '0912 000 111', null)).id
  assert.equal((await one('SELECT kind FROM debt_customers WHERE id = $1', [a])).kind, 'person')
  await db.query('UPDATE debt_customers SET is_active = false WHERE id = $1', [a])
  await assert.rejects(mk('Anh B', '+84912000111', 'person'), /SĐT 0912000111 đã có khách Anh A, chọn khách đó/)
  // Không SĐT: tạo được nhiều khách trùng tên.
  await mk('Khách lẻ', null, null); await mk('Khách lẻ', '', null)
  assert.equal(await count("debt_customers WHERE name = 'Khách lẻ'"), 2)
})

test('debt_customer_bills: mỗi bill nợ một dòng, outstanding = nợ − trả còn hiệu lực', async () => {
  const c = await customer()
  const s1 = await session(); await order(s1, 500000)
  const s2 = await session({ table: ids.t2 }); await order(s2, 300000)
  const p1 = (await collectDebtBill([s1], [cash(200000), debt(300000)], null, rid(), { customerId: c })).payment_id
  const p2 = (await collectDebtBill([s2], [debt(300000)], null, rid(), { customerId: c })).payment_id
  await db.exec('RESET ROLE')
  const pay = async (amount, voided) => (await one(`INSERT INTO debt_payments(store_id, debt_customer_id, amount, method,
      business_date, client_request_id, created_by, voided_by, voided_at, void_reason)
    VALUES ($1, $2, $3, 'bank', current_date, gen_random_uuid(), $4,
      CASE WHEN $5 THEN $4::uuid END, CASE WHEN $5 THEN now() END, CASE WHEN $5 THEN 'nhầm' END) RETURNING id`,
  [ids.store, c, amount, ids.owner, voided])).id
  const live = await pay(100000, false); const dead = await pay(50000, true)
  await db.query('INSERT INTO debt_payment_allocations(debt_payment_id, bill_payment_id, amount) VALUES ($1, $2, 100000), ($3, $2, 50000)',
    [live, p1, dead])
  const rows = (await db.query('SELECT * FROM debt_customer_bills($1)', [c])).rows
  const byId = Object.fromEntries(rows.map((r) => [r.bill_payment_id, r]))
  assert.equal(rows.length, 2)
  assert.deepEqual([byId[p1].bill_total, byId[p1].debt_amount, byId[p1].paid_amount, byId[p1].outstanding].map(Number),
    [500000, 300000, 100000, 200000])
  assert.deepEqual([byId[p2].debt_amount, byId[p2].paid_amount, byId[p2].outstanding].map(Number), [300000, 0, 300000])
  assert.equal(await outstanding(c), 500000)
})

test('CHECK: phương tiện lạ vẫn bị chặn ở bảng; khách quán khác không gắn được bill (FK ghép quán)', async () => {
  const c = await customer({ store: ids.otherStore }); const s = await session(); await order(s, 1000)
  const p = (await collectDebtBill([s], [cash(1000)], null, rid())).payment_id
  await db.exec('RESET ROLE')
  await assert.rejects(db.query("INSERT INTO bill_payment_lines(payment_id, instrument, amount) VALUES ($1, 'momo', 1)", [p]), /bill_payment_lines_instrument_check/)
  await assert.rejects(db.query('UPDATE bill_payments SET debt_customer_id = $1 WHERE id = $2', [c, p]), /foreign key/)
})

// ============================================================
// Task 2: RPC thu nợ, huỷ, đọc, khách; két ca
// ============================================================

// Ba bill nợ của một khách, giờ thu cố định để thứ tự cũ nhất rõ ràng
async function threeBills(c) {
  const out = []
  for (const [amount, at] of [[200000, '2026-11-01 19:00+07'], [300000, '2026-11-02 19:00+07'], [150000, '2026-11-03 19:00+07']]) {
    const s = await session(); await order(s, amount)
    const r = await collectDebtBill([s], [debt(amount)], null, rid(), { customerId: c })
    await db.query('UPDATE bill_payments SET collected_at = $2 WHERE id = $1', [r.payment_id, at])
    out.push(r.payment_id)
  }
  return out
}
const pay = (c, amount, method = 'cash', allocations = null, id = rid(), uid = ids.cashier) =>
  rpc(uid, 'debt_collect', [c, amount, method, allocations && JSON.stringify(allocations), null, id])

test('trả nợ phân bổ bill cũ nhất trước; trả đúng hết; trả quá lỗi', async () => {
  const c = await customer(); const [b1, b2, b3] = await threeBills(c)
  const r = await pay(c, 350000)
  assert.deepEqual(r.allocations, [{ bill_payment_id: b1, amount: 200000 }, { bill_payment_id: b2, amount: 150000 }])
  assert.equal(r.remaining_debt, 300000)
  await assert.rejects(pay(c, 300001), /Số tiền trả vượt số nợ: còn nợ 300\.000đ/)
  assert.equal((await pay(c, 300000)).remaining_debt, 0)
  await assert.rejects(pay(c, 1), /vượt số nợ/)
  assert.equal(await count('debt_payments'), 2)
  assert.ok(b3)
})

test('chọn bill cụ thể: chỉ phân bổ vào bill được tick', async () => {
  const c = await customer(); const [b1, , b3] = await threeBills(c)
  await assert.rejects(pay(c, 200000, 'bank', [b3]), /còn nợ 150\.000đ/)
  const r = await pay(c, 150000, 'bank', [b3])
  assert.deepEqual(r.allocations, [{ bill_payment_id: b3, amount: 150000 }])
  const d = await rpc(ids.cashier, 'debt_customer_detail', [c])
  assert.equal(d.bills.find((b) => b.bill_payment_id === b1).outstanding, 200000)
  const other = await customer({ phone: '0911111111' }); const [x] = await threeBills(other)
  await assert.rejects(pay(c, 1000, 'cash', [x]), /Bill không thuộc khách này hoặc đã trả hết/)
})

test('đầu vào xấu', async () => {
  const c = await customer(); await threeBills(c)
  for (const a of [0, -5, 2000000001]) await assert.rejects(pay(c, a), /Số tiền không hợp lệ/)
  await assert.rejects(pay(c, 1000, 'wallet'), /Phương thức không hợp lệ/)
  await assert.rejects(rpc(ids.cashier, 'debt_collect', [c, 1000, 'cash', null, null, null]), /Thiếu mã chống thu trùng/)
})

test('gọi lại cùng mã: trả kết quả cũ; cùng mã khác số tiền thì lỗi', async () => {
  const c = await customer(); await threeBills(c); const id = rid()
  const a = await pay(c, 100000, 'cash', null, id); const b = await pay(c, 100000, 'cash', null, id)
  assert.deepEqual([b.already, b.debt_payment_id, b.allocations], [true, a.debt_payment_id, a.allocations])
  await assert.rejects(pay(c, 90000, 'cash', null, id), /Mã thu nợ đã dùng cho lần thu khác/)
  assert.equal(await count('debt_payments'), 1)
})

test('hai máy cùng thu nợ: máy sau thấy số đã giảm; hàm khoá khách trước khi tính', async () => {
  const c = await customer(); await threeBills(c)
  await pay(c, 600000, 'cash', null, rid(), ids.manager)
  await assert.rejects(pay(c, 100000), /còn nợ 50\.000đ/)
  const { def } = await one("SELECT pg_get_functiondef('public.debt_collect(uuid,bigint,text,jsonb,text,uuid)'::regprocedure) def")
  assert.match(def, /FROM public\.debt_customers[^;]*FOR UPDATE/i)
})

test('két: bật ca không có ca thì TM lỗi, CK được; có ca thì két tăng đúng', async () => {
  const c = await customer(); await threeBills(c); await enableShift()
  await assert.rejects(pay(c, 50000, 'cash'), /Chưa mở ca/)
  assert.equal((await pay(c, 50000, 'bank')).ok, true)
  const shift = await openShift(500000)
  const s = await session(); await order(s, 100000)
  await collect([s], [cash(100000)], null, rid())               // 100.000 TM bán hàng
  await pay(c, 250000, 'cash'); await pay(c, 100000, 'bank')
  const t = (await one('SELECT public.cash_shift_totals($1) v', [shift])).v
  assert.deepEqual([t.debt_cash, t.expected_cash], [250000, 850000]) // 500k + 100k + 250k
  const sum = await rpc(ids.cashier, 'get_debt_shift_summary', [shift])
  assert.deepEqual([sum.debt_cash, sum.debt_bank, sum.debt_recorded], [250000, 100000, 0])
})

test('get_debt_shift_summary: ghi nợ trong ca; quyền xem ca', async () => {
  await enableShift(); const shift = await openShift(0)
  const c = await customer(); const s = await session(); await order(s, 400000)
  await collectDebtBill([s], [cash(100000), debt(300000)], null, rid(), { customerId: c })
  assert.equal((await rpc(ids.manager, 'get_debt_shift_summary', [shift])).debt_recorded, 300000)
  await assert.rejects(rpc(ids.otherOwner, 'get_debt_shift_summary', [shift]), /Không có quyền xem ca này/)
})

test('huỷ lần trả nợ: nợ bill khôi phục; lý do bắt buộc; thu ngân không huỷ được; lần hai already', async () => {
  const c = await customer(); await threeBills(c)
  const r = await pay(c, 350000, 'bank')
  await assert.rejects(rpc(ids.owner, 'debt_payment_void', [r.debt_payment_id, '  ']), /Nhập lý do huỷ/)
  await assert.rejects(rpc(ids.cashier, 'debt_payment_void', [r.debt_payment_id, 'nhầm']), /Chỉ chủ quán hoặc quản lý/)
  assert.equal((await rpc(ids.manager, 'debt_payment_void', [r.debt_payment_id, 'nhầm khách'])).already, false)
  assert.equal((await rpc(ids.manager, 'debt_payment_void', [r.debt_payment_id, 'nhầm khách'])).already, true)
  assert.equal(await outstanding(c), 650000)
})

test('lần trả đã huỷ coi như chưa từng có ở mọi chỗ đọc', async () => {
  const c = await customer(); await threeBills(c); await enableShift(); const shift = await openShift(0)
  const r = await pay(c, 200000, 'cash')
  await rpc(ids.owner, 'debt_payment_void', [r.debt_payment_id, 'nhầm'])
  const d = await rpc(ids.cashier, 'debt_customer_detail', [c])
  assert.deepEqual(d.bills.map((b) => b.paid_amount), [0, 0, 0])
  assert.equal(d.payments[0].voided_at !== null, true)          // vẫn hiện trong lịch sử
  const row = (await rpc(ids.cashier, 'debt_list', [ids.store, true])).customers[0]
  assert.deepEqual([row.outstanding, row.last_payment_at], [650000, null])
  assert.equal((await one('SELECT public.cash_shift_totals($1) v', [shift])).v.debt_cash, 0)
  assert.equal((await rpc(ids.cashier, 'get_debt_shift_summary', [shift])).debt_cash, 0)
  // trả lại sau khi huỷ: phân bổ lại từ bill cũ nhất như chưa có lần huỷ
  assert.deepEqual((await pay(c, 200000, 'cash')).allocations.map((a) => a.amount), [200000])
})

test('huỷ lần trả TM: ca còn mở thì được, két giảm; ca đã kết thì lỗi, két đã lưu không đổi', async () => {
  const c = await customer(); await threeBills(c); await enableShift(); const shift = await openShift(0)
  const a = await pay(c, 100000, 'cash'); const b = await pay(c, 50000, 'cash')
  await rpc(ids.owner, 'debt_payment_void', [a.debt_payment_id, 'đếm nhầm'])
  assert.equal((await one('SELECT public.cash_shift_totals($1) v', [shift])).v.debt_cash, 50000)
  await db.query('UPDATE cash_shifts SET expected_cash = 50000 WHERE id = $1', [shift]); await closeShiftRow(shift)
  await assert.rejects(rpc(ids.owner, 'debt_payment_void', [b.debt_payment_id, 'x']), /Ca của lần thu này đã kết/)
  assert.equal(Number((await one('SELECT expected_cash FROM cash_shifts WHERE id = $1', [shift])).expected_cash), 50000)
})

test('khách: thu ngân không sửa được; ngừng khách còn nợ bị chặn; trả hết thì ngừng được', async () => {
  const c = await customer(); const s = await session(); await order(s, 90000)
  await collectDebtBill([s], [debt(90000)], null, rid(), { customerId: c })
  await assert.rejects(rpc(ids.cashier, 'debt_customer_upsert', [ids.store, c, 'Đổi', null, 'company', null]), /Chỉ chủ quán hoặc quản lý/)
  assert.equal((await rpc(ids.manager, 'debt_customer_upsert', [ids.store, c, 'Cty Hoà Bình mới', '0901 222 333', 'company', 'kế toán chị Lan'])).customer_id, c)
  await assert.rejects(rpc(ids.owner, 'debt_customer_set_active', [c, false]), /Khách còn nợ 90\.000đ, không ngừng được/)
  await pay(c, 90000)
  assert.equal((await rpc(ids.owner, 'debt_customer_set_active', [c, false])).is_active, false)
})

test('debt_list và detail: đúng số, lọc còn nợ, tên người thu', async () => {
  const c = await customer(); await threeBills(c); await customer({ name: 'Không nợ', phone: '0933333333' })
  await pay(c, 200000)
  const all = await rpc(ids.cashier, 'debt_list', [ids.store, false])
  const open = await rpc(ids.cashier, 'debt_list', [ids.store, true])
  assert.equal(all.customers.length, 2); assert.equal(open.customers.length, 1)
  const row = open.customers[0]
  assert.deepEqual([row.outstanding, row.open_bills], [450000, 2])
  const d = await rpc(ids.cashier, 'debt_customer_detail', [c])
  assert.deepEqual(d.bills.map((b) => b.outstanding), [0, 300000, 150000])
  assert.equal(d.payments.length, 1); assert.ok(d.payments[0].created_by_name)
})

test('quyền + cách ly quán ở mọi RPC công nợ', async () => {
  const c = await customer(); await threeBills(c)
  for (const uid of [ids.staff, ids.otherOwner]) {
    await assert.rejects(pay(c, 1000, 'cash', null, rid(), uid), /Chỉ chủ quán, quản lý hoặc thu ngân/)
    await assert.rejects(rpc(uid, 'debt_customer_detail', [c]), /Chỉ chủ quán, quản lý hoặc thu ngân/)
    await assert.rejects(rpc(uid, 'debt_list', [ids.store, false]), /Chỉ chủ quán, quản lý hoặc thu ngân/)
  }
  const can = async (fn) => (await one("SELECT has_function_privilege('anon', $1, 'EXECUTE') v", [fn])).v
  for (const fn of ['debt_customer_upsert(uuid,uuid,text,text,text,text)', 'debt_customer_set_active(uuid,boolean)',
    'debt_collect(uuid,bigint,text,jsonb,text,uuid)', 'debt_payment_void(uuid,text)', 'debt_list(uuid,boolean)',
    'debt_customer_detail(uuid)', 'get_debt_shift_summary(uuid)']) assert.equal(await can(fn), false)
})

// ---- Thêm ngoài plan (Task 2) ----

test('debt_customer_upsert: tạo mới, SĐT trùng khách khác, khách quán khác, sửa giữ SĐT của chính mình', async () => {
  const a = (await rpc(ids.owner, 'debt_customer_upsert', [ids.store, null, '  Anh Tùng ', '+84 977 000 111', null, null])).customer_id
  const row = await one('SELECT name, phone, kind, created_by FROM debt_customers WHERE id = $1', [a])
  assert.deepEqual(Object.values(row), ['Anh Tùng', '0977000111', 'person', ids.owner])
  const b = await customer({ name: 'Chị Mai', phone: '0977000222' })
  await assert.rejects(rpc(ids.owner, 'debt_customer_upsert', [ids.store, b, 'Chị Mai', '0977 000 111', 'person', null]),
    /SĐT 0977000111 đã có khách Anh Tùng, chọn khách đó/)
  assert.equal((await rpc(ids.owner, 'debt_customer_upsert', [ids.store, a, 'Anh Tùng', '0977000111', 'person', 'quen'])).customer_id, a)
  const foreign = await customer({ store: ids.otherStore, phone: '0977000333' })
  await assert.rejects(rpc(ids.owner, 'debt_customer_upsert', [ids.store, foreign, 'X', null, null, null]), /Không tìm thấy khách nợ/)
  await assert.rejects(rpc(ids.owner, 'debt_customer_upsert', [ids.otherStore, null, 'X', null, null, null]), /Chỉ chủ quán hoặc quản lý/)
  await assert.rejects(rpc(ids.owner, 'debt_customer_upsert', [ids.store, a, 'Anh Tùng', null, 'person', 'x'.repeat(501)]), /Ghi chú quá dài/)
})

test('debt_collect: ca CK gắn ca đang mở nếu có; business_date = ngày kinh doanh lúc ghi; ghi chú dài lỗi', async () => {
  const c = await customer(); await threeBills(c)
  const shift = await openShift(0)                     // ca mở nhưng quán không bật công tắc
  await pay(c, 10000, 'bank')
  const p = await one('SELECT cash_shift_id, business_date::text AS d, (business_date = public.business_date_of(store_id, created_at)) AS ok FROM debt_payments')
  assert.deepEqual([p.cash_shift_id, p.ok], [shift, true])
  await assert.rejects(rpc(ids.cashier, 'debt_collect', [c, 1000, 'cash', null, 'x'.repeat(501), rid()]), /Ghi chú quá dài/)
  await assert.rejects(pay(c, 1000, 'cash', []), /Danh sách bill không hợp lệ/)
  await assert.rejects(pay(c, 1000, 'cash', ['abc']), /Danh sách bill không hợp lệ/)
  await assert.rejects(rpc(ids.cashier, 'debt_collect', [rid(), 1000, 'cash', null, null, rid()]), /Không tìm thấy khách nợ/)
})

test('debt_customer_detail: nhãn bàn, phiên, tên người huỷ, phân bổ của lần đã huỷ vẫn trả về', async () => {
  const c = await customer(); const [b1] = await threeBills(c)
  const r = await pay(c, 50000, 'bank')
  await rpc(ids.owner, 'debt_payment_void', [r.debt_payment_id, 'nhầm'])
  const d = await rpc(ids.cashier, 'debt_customer_detail', [c])
  assert.equal(d.customer.id, c)
  assert.equal(d.bills[0].table_label, 'Bàn 1')
  assert.equal(d.bills[0].session_ids.length, 1)
  assert.equal(d.bills[0].business_date, '2026-11-01')
  const p = d.payments[0]
  assert.deepEqual([p.void_reason, p.voided_by_name, p.created_by_name], ['nhầm', 'chu@quan.vn', 'Thu ngân Lan'])
  assert.deepEqual(p.allocations, [{ bill_payment_id: b1, amount: 50000 }])
})

test('quyền: thu ngân, quản lý xem được ca của mình; thu ngân không xem ca người khác', async () => {
  await enableShift(); const shift = await openShift(0, ids.owner)
  await assert.rejects(rpc(ids.cashier, 'get_debt_shift_summary', [shift]), /Không có quyền xem ca này/)
  assert.equal((await rpc(ids.owner, 'get_debt_shift_summary', [shift])).debt_cash, 0)
  await assert.rejects(rpc(ids.owner, 'get_debt_shift_summary', [rid()]), /Không tìm thấy ca/)
})

// ---- Fold-in sau review Task 2 ----

test('gọi lại mã của lần trả đã bị huỷ: lỗi, không trả already, không ghi thêm', async () => {
  const c = await customer(); await threeBills(c); const id = rid()
  const a = await pay(c, 100000, 'bank', null, id)
  await rpc(ids.owner, 'debt_payment_void', [a.debt_payment_id, 'nhầm'])
  await assert.rejects(pay(c, 100000, 'bank', null, id), /Lần trả nợ này đã bị huỷ/)
  assert.equal(await count('debt_payments'), 1)
})

test('debt_collect: sau vòng phân bổ còn dư thì RAISE (phòng hờ, kiểm tĩnh)', async () => {
  const { def } = await one("SELECT pg_get_functiondef('public.debt_collect(uuid,bigint,text,jsonb,text,uuid)'::regprocedure) def")
  assert.match(def, /END LOOP;\s*--[^\n]*\n\s*IF v_left > 0 THEN\s*RAISE EXCEPTION/)
})

test('sửa khách: p_kind NULL giữ loại cũ; kiểm tên / loại / ghi chú dùng chung một hàm', async () => {
  const c = await customer({ kind: 'company' })
  await rpc(ids.owner, 'debt_customer_upsert', [ids.store, c, 'Cty Hoà Bình', null, null, null])
  assert.equal((await one('SELECT kind FROM debt_customers WHERE id = $1', [c])).kind, 'company')
  const n = (await rpc(ids.owner, 'debt_customer_upsert', [ids.store, null, 'Anh Hải', null, null, null])).customer_id
  assert.equal((await one('SELECT kind FROM debt_customers WHERE id = $1', [n])).kind, 'person')
  for (const [args, err] of [
    [['  ', null, null], /Tên khách nợ không được trống/],
    [['x'.repeat(121), null, null], /Tên khách nợ quá dài/],
    [['A', 'vip', null], /Loại khách không hợp lệ/],
    [['A', null, 'x'.repeat(501)], /Ghi chú quá dài/],
  ]) {
    const [name, kind, note] = args
    await assert.rejects(rpc(ids.owner, 'debt_customer_upsert', [ids.store, c, name, null, kind, note]), err)
    await assert.rejects(rpc(ids.owner, 'debt_customer_upsert', [ids.store, null, name, null, kind, note]), err)
  }
  for (const fn of ['public.debt_customer_create_internal(uuid,text,text,text,text,uuid)', 'public.debt_customer_upsert(uuid,uuid,text,text,text,text)']) {
    const { def } = await one('SELECT pg_get_functiondef($1::regprocedure) def', [fn])
    assert.match(def, /debt_customer_validate\(/)
    assert.doesNotMatch(def, /Tên khách nợ quá dài/)
  }
  assert.equal((await one("SELECT has_function_privilege('authenticated', 'debt_customer_validate(text,text,text)', 'EXECUTE') v")).v, false)
})
