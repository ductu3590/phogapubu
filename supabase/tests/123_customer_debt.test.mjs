// Mig 123 — công nợ khách hàng.
//   Task 1: bảng debt_customers / debt_payments / debt_payment_allocations, khách nợ, collect_table_bill nhận dòng
//   ghi nợ (instrument 'debt') + khách nợ (chọn sẵn hoặc tạo mới trong cùng lần thu).
import { after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { openDebtDb } from './helpers/debt-db.mjs'

const h = await openDebtDb()
const { db, ids, reset, login, session, order, rid, one, count, debt, customer, collectDebtBill, outstanding } = h
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
