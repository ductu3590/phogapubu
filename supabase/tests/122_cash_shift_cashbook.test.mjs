// Mig 122 — ca thu ngân + sổ thu chi.
//   Khối '122 nền' (Task 1): bảng, danh mục seed, hàm nội bộ require_open_cash_shift, cash_shift_totals,
//   cash_book_system_category, cash_book_create_internal, cash_book_void_internal, quyền đọc bảng.
import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { openCashShiftDb } from './helpers/cash-shift-db.mjs'

const h = await openCashShiftDb({ through: '122' })
const { db, ids, one, count, as, setShiftRequired, setDayStart, insertShift, category } = h
beforeEach(async () => h.reset())
after(async () => db.close())

const ANCHOR = '  v_debt_cash := 0; -- mevo-anchor:123 cash_shift_totals.debt_cash'

async function newStore() {
  const id = randomUUID()
  await db.exec('RESET ROLE')
  await db.query('INSERT INTO stores(id, name) VALUES ($1, $2)', [id, 'Quán mới'])
  return id
}
async function totals(shiftId) {
  await db.exec('RESET ROLE')
  return (await one('SELECT cash_shift_totals($1) AS r', [shiftId])).r
}
async function def(sig) {
  await db.exec('RESET ROLE')
  return (await one(`SELECT pg_get_functiondef('public.${sig}'::regprocedure) AS d`)).d
}
const countOf = (text, needle) => text.split(needle).length - 1

// Gọi hàm nội bộ dưới postgres. Mặc định: phiếu chi tiền mặt 10.000đ danh mục Đá, mã chống trùng mới.
async function internal(overrides = {}) {
  const p = {
    store: ids.store, kind: 'payment', method: 'cash', category: null, amount: 10000, note: null,
    counterparty: null, source: 'manual', sourceRef: null, actor: ids.owner, requestId: randomUUID(),
    ...overrides,
  }
  const cat = p.category ?? (await category(p.store, 'Đá'))
  await db.exec('RESET ROLE')
  return (await one(`SELECT cash_book_create_internal($1, $2, $3, $4, $5::bigint, $6, $7, $8, $9, $10, $11) AS id`,
    [p.store, p.kind, p.method, cat, p.amount, p.note, p.counterparty, p.source, p.sourceRef, p.actor, p.requestId])).id
}
async function voidInternal(entryId, reason, actor = ids.owner) {
  await db.exec('RESET ROLE')
  return (await one('SELECT cash_book_void_internal($1, $2, $3) AS r', [entryId, reason, actor])).r
}
const entry = (id) => one('SELECT * FROM cash_book_entries WHERE id = $1', [id])

// Một lần thu bill gắn ca: chèn thẳng bill_payments + dòng phương tiện (bỏ qua RPC thu tiền, Task 4 kiểm).
async function bill(shiftId, lines, storeId = ids.store) {
  await db.exec('RESET ROLE')
  const total = Object.values(lines).reduce((a, b) => a + b, 0)
  const p = await one(`INSERT INTO bill_payments(store_id, cash_shift_id, client_request_id, total_amount, collected_by, source)
    VALUES ($1, $2, $3, $4, $5, 'pos') RETURNING id`, [storeId, shiftId, randomUUID(), total, ids.cashier])
  for (const [instrument, amount] of Object.entries(lines)) {
    await db.query('INSERT INTO bill_payment_lines(payment_id, instrument, amount) VALUES ($1, $2, $3)',
      [p.id, instrument, amount])
  }
  return p.id
}

describe('122 nền', () => {
  test('seed: quán có sẵn và quán tạo mới đều có 11 danh mục, Nhập hàng là hệ thống', async () => {
    for (const s of [ids.store, await newStore()]) {
      const rows = (await db.query(`SELECT kind, name, is_system, report_group, requires_note, is_active
        FROM cash_book_categories WHERE store_id = $1 ORDER BY kind, sort_order`, [s])).rows
      assert.equal(rows.length, 11)
      assert.deepEqual(rows.filter((r) => r.is_system).map((r) => [r.name, r.report_group]),
        [['Nhập hàng', 'inventory_purchase']])
      assert.deepEqual(rows.filter((r) => r.requires_note).map((r) => r.name).sort(), ['Khác', 'Thu khác'])
      assert.deepEqual(rows.map((r) => `${r.kind}:${r.name}:${r.report_group}`), [
        'payment:Nhập hàng:inventory_purchase', 'payment:Đi chợ:operating_expense', 'payment:Ga - than:operating_expense',
        'payment:Đá:operating_expense', 'payment:Điện nước:operating_expense',
        'payment:Lương - thưởng:operating_expense', 'payment:Sửa chữa:operating_expense',
        'payment:Khác:operating_expense', 'payment:Chủ quán rút:owner_draw',
        'receipt:Nộp thêm vào két:cash_transfer', 'receipt:Thu khác:other_income',
      ])
      assert.ok(rows.every((r) => r.is_active))
    }
  })

  test('seed chạy lại không nhân đôi; trùng tên khác hoa thường bị chặn', async () => {
    const s = await newStore()
    await db.query('SELECT seed_cash_book_categories($1)', [s])
    assert.equal(await count('cash_book_categories WHERE store_id = $1', [s]), 11)
    await assert.rejects(db.query(`INSERT INTO cash_book_categories(store_id, kind, name, report_group)
      VALUES ($1, 'payment', 'ĐÁ', 'operating_expense')`, [s]), /duplicate key/)
  })

  test('danh mục: CHECK cặp loại–nhóm, tên rỗng, hai danh mục hệ thống cùng nhóm', async () => {
    const s = await newStore()
    const ins = (kind, name, group, system = false) => db.query(`INSERT INTO cash_book_categories(store_id, kind, name,
      report_group, is_system) VALUES ($1, $2, $3, $4, $5)`, [s, kind, name, group, system])
    await assert.rejects(ins('receipt', 'Thu lạ', 'operating_expense'), /check/)
    await assert.rejects(ins('payment', 'Chi lạ', 'other_income'), /check/)
    await assert.rejects(ins('payment', '   ', 'operating_expense'), /check/)
    await assert.rejects(ins('payment', 'x'.repeat(61), 'operating_expense'), /check/)
    await assert.rejects(ins('payment', 'Nhập hàng 2', 'inventory_purchase', true), /duplicate key/)
    await ins('receipt', 'Rút từ ngân hàng', 'cash_transfer')
  })

  test('cash_book_system_category trả đúng Nhập hàng; nhóm không có danh mục hệ thống thì raise', async () => {
    const r = await one("SELECT cash_book_system_category($1, 'inventory_purchase') AS id", [ids.store])
    assert.equal(r.id, await category(ids.store, 'Nhập hàng'))
    await assert.rejects(db.query("SELECT cash_book_system_category($1, 'operating_expense')", [ids.store]),
      /mig 122: quán chưa có danh mục hệ thống operating_expense/)
  })

  test('require_open_cash_shift: tắt trả NULL; bật không ca raise Chưa mở ca; bật có ca trả id', async () => {
    const call = () => db.query('SELECT require_open_cash_shift($1) AS id', [ids.store])
    await insertShift({ status: 'closed' })
    assert.equal((await call()).rows[0].id, null)
    // Tắt + đang có ca mở: vẫn NULL (quán không bật thì không gắn ca).
    const open = await insertShift()
    assert.equal((await call()).rows[0].id, null)
    await setShiftRequired(ids.store, true)
    assert.equal((await call()).rows[0].id, open)
    await db.query("UPDATE cash_shifts SET status = 'closed', closed_at = now(), closed_by = $1, counted_cash = 0, expected_cash = 0, difference = 0 WHERE id = $2", [ids.cashier, open])
    await assert.rejects(call(), /Chưa mở ca/)
    // Quán không có dòng cài đặt: coi như tắt.
    const s = await newStore()
    await db.query('DELETE FROM store_workflow_settings WHERE store_id = $1', [s])
    assert.equal((await db.query('SELECT require_open_cash_shift($1) AS id', [s])).rows[0].id, null)
  })

  test('cash_shifts: mỗi quán một ca mở; CHECK tiền âm và trạng thái', async () => {
    await insertShift()
    await assert.rejects(insertShift(), /duplicate key/)
    await insertShift({ storeId: ids.otherStore, openedBy: ids.otherOwner })
    await assert.rejects(insertShift({ storeId: ids.otherStore, status: 'closed', openingCash: -1 }), /check/)
    // Quán chưa có ca mở: chỉ CHECK trạng thái mới chặn được (không lẫn với unique một-ca-mở).
    const fresh = await newStore()
    await assert.rejects(db.query(`INSERT INTO cash_shifts(store_id, status, opened_by, closed_at)
      VALUES ($1, 'open', $2, now())`, [fresh, ids.owner]), /cash_shifts_closed_state/)
    await assert.rejects(db.query(`INSERT INTO cash_shifts(store_id, status, opened_by, closed_at, closed_by)
      VALUES ($1, 'closed', $2, now(), $2)`, [fresh, ids.owner]), /cash_shifts_closed_numbers/)
    await assert.rejects(db.query(`INSERT INTO cash_shifts(store_id, status, opened_by)
      VALUES ($1, 'closed', $2)`, [ids.otherStore, ids.otherOwner]), /check/)
  })

  test('bill_payments.cash_shift_id: FK ghép theo quán', async () => {
    const shift = await insertShift()
    await bill(shift, { cash: 1000 })
    await assert.rejects(bill(randomUUID(), { cash: 1000 }), /foreign key/)
    await assert.rejects(bill(shift, { cash: 1000 }, ids.otherStore), /foreign key/)
  })

  test('công thức két: 500k đầu + 300k TM bill + 100k phiếu thu TM − 50k phiếu chi TM = 850k', async () => {
    await setShiftRequired(ids.store, true)
    await setShiftRequired(ids.otherStore, true)
    const old = await insertShift({ status: 'closed', openingCash: 999 })
    await bill(old, { cash: 40000 })                                         // bill TM của ca khác
    const shift = await insertShift({ openingCash: 500000 })
    await bill(shift, { cash: 300000, bank: 200000 })                       // dòng bank cùng bill không vào két
    await internal({ kind: 'receipt', category: await category(ids.store, 'Nộp thêm vào két'), amount: 100000 })
    await internal({ amount: 50000 })
    await internal({ method: 'bank', amount: 70000 })                         // phiếu chi CK
    const voided = await internal({ amount: 20000 })                          // phiếu chi TM đã huỷ
    await voidInternal(voided, 'ghi nhầm')
    await insertShift({ storeId: ids.otherStore, openedBy: ids.otherOwner })
    await internal({ store: ids.otherStore, kind: 'receipt', category: await category(ids.otherStore, 'Thu khác'),
      note: 'quán khác', amount: 777, actor: ids.otherOwner })                // phiếu TM quán khác

    const t = await totals(shift)
    assert.deepEqual(t, {
      opening_cash: 500000, cash_sales: 300000, cash_receipts: 100000, cash_payments: 50000,
      debt_cash: 0, expected_cash: 850000, bills_count: 1, bank_sales: 200000,
    })
    assert.deepEqual(await totals(old), {
      opening_cash: 999, cash_sales: 40000, cash_receipts: 0, cash_payments: 0,
      debt_cash: 0, expected_cash: 40999, bills_count: 1, bank_sales: 0,
    })
    await assert.rejects(totals(randomUUID()), /Không tìm thấy ca/)
  })

  test('neo debt_cash có đúng 1 lần trong cash_shift_totals (mig 123 vá vào đây) và đi vào expected_cash', async () => {
    const d = await def('cash_shift_totals(uuid)')
    assert.equal(countOf(d, ANCHOR), 1)
    assert.equal(countOf(d, `\n${ANCHOR}\n`), 1, 'neo phải đứng một mình một dòng')
    // Thay neo bằng số khác 0 trong một giao dịch rồi huỷ: tiền nợ thu TM phải cộng vào tiền dự kiến.
    const shift = await insertShift({ openingCash: 1000 })
    await db.exec('BEGIN')
    try {
      await db.exec(d.replace(ANCHOR, '  v_debt_cash := 7;'))
      const t = await totals(shift)
      assert.equal(t.debt_cash, 7)
      assert.equal(t.expected_cash, 1007)
    } finally {
      await db.exec('ROLLBACK')
    }
    assert.equal(countOf(await def('cash_shift_totals(uuid)'), ANCHOR), 1)
  })

  test('create_internal: phiếu TM khi bật ca gắn ca; phiếu CK cash_shift_id NULL; business_date theo ngày kinh doanh 05:00', async () => {
    // Tắt ca: phiếu TM không gắn ca.
    const off = await entry(await internal())
    assert.equal(off.cash_shift_id, null)

    await setShiftRequired(ids.store, true)
    await setDayStart(ids.store, '05:00')
    await assert.rejects(internal(), /Chưa mở ca/)
    const bankNoShift = await entry(await internal({ method: 'bank' }))
    assert.equal(bankNoShift.cash_shift_id, null)

    const shift = await insertShift()
    const cash = await entry(await internal({ note: '  bao đá  ', counterparty: '   ' }))
    assert.equal(cash.cash_shift_id, shift)
    assert.equal(cash.note, 'bao đá')
    assert.equal(cash.counterparty, null)
    assert.equal(cash.created_by, ids.owner)
    assert.equal(cash.source, 'manual')
    const bank = await entry(await internal({ method: 'bank', counterparty: 'Anh Hùng' }))
    assert.equal(bank.cash_shift_id, null)
    assert.equal(bank.counterparty, 'Anh Hùng')

    // Ngày kinh doanh: giờ VN lùi 5 tiếng.
    const expected = new Date(Date.now() + (7 - 5) * 3600_000).toISOString().slice(0, 10)
    const day = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))
    const bd = (await one('SELECT business_date::text AS d FROM cash_book_entries WHERE id = $1', [cash.id])).d
    assert.equal(day(bd), expected)
  })

  test('create_internal: pos_drawer chỉ tiền mặt; inventory_receipt bắt source_ref; loại/phương thức/nguồn lạ bị chặn', async () => {
    await assert.rejects(internal({ method: 'bank', source: 'pos_drawer' }), /check|Phiếu tại két chỉ nhận tiền mặt/)
    await assert.rejects(internal({ category: await category(ids.store, 'Nhập hàng'), source: 'inventory_receipt' }),
      /check|phiếu nhập/)
    await assert.rejects(internal({ kind: 'transfer' }), /Loại phiếu không hợp lệ/)
    await assert.rejects(internal({ method: 'momo' }), /Phương thức không hợp lệ/)
    await assert.rejects(internal({ source: 'api' }), /Nguồn phiếu không hợp lệ/)
    await assert.rejects(internal({ requestId: null }), /Thiếu mã chống ghi trùng/)
    const ok = await entry(await internal({ source: 'pos_drawer' }))
    assert.equal(ok.source, 'pos_drawer')
    // Phiếu nhập kho chỉ sinh phiếu chi: hàm chặn, CHECK chặn cả khi ghi thẳng.
    await assert.rejects(internal({ kind: 'receipt', category: await category(ids.store, 'Nộp thêm vào két'),
      source: 'inventory_receipt', sourceRef: randomUUID() }), /Phiếu nhập kho chỉ sinh phiếu chi/)
    await assert.rejects(db.query(`INSERT INTO cash_book_entries(store_id, kind, method, category_id, amount,
        business_date, source, source_ref, client_request_id, created_by)
      VALUES ($1, 'receipt', 'bank', $2, 1, current_date, 'inventory_receipt', $3, $3, $4)`,
    [ids.store, await category(ids.store, 'Nộp thêm vào két'), randomUUID(), ids.owner]),
    /cash_book_entries_inventory_payment_only/)
    // Người ghi bắt buộc.
    await assert.rejects(internal({ actor: null }), /Thiếu người ghi phiếu/)
    await assert.rejects(db.query(`INSERT INTO cash_book_entries(store_id, kind, method, category_id, amount,
        business_date, source, client_request_id)
      VALUES ($1, 'payment', 'bank', $2, 1, current_date, 'manual', $3)`,
    [ids.store, await category(ids.store, 'Đá'), randomUUID()]), /created_by/)
  })

  test('create_internal: danh mục sai loại thu/chi, danh mục quán khác, danh mục ẩn đều bị chặn', async () => {
    await assert.rejects(internal({ category: await category(ids.store, 'Nộp thêm vào két') }), /Danh mục không hợp lệ/)
    await assert.rejects(internal({ category: await category(ids.otherStore, 'Đá') }), /Danh mục không hợp lệ/)
    await assert.rejects(internal({ category: randomUUID() }), /Danh mục không hợp lệ/)
    const s = await newStore()
    const hidden = await category(s, 'Đi chợ')
    await db.query('UPDATE cash_book_categories SET is_active = false WHERE id = $1', [hidden])
    await assert.rejects(internal({ store: s, category: hidden }), /Danh mục không hợp lệ/)
    assert.equal(await count('cash_book_entries'), 0)
  })

  test('create_internal: số tiền 0, âm, 2.000.000.001 bị chặn; Khác thiếu ghi chú (hoặc toàn dấu cách) bị chặn', async () => {
    for (const amount of [0, -1, 2000000001]) {
      await assert.rejects(internal({ amount }), /Số tiền/)
    }
    await assert.rejects(internal({ amount: null }), /Số tiền/)
    const max = await entry(await internal({ amount: 2000000000 }))
    assert.equal(Number(max.amount), 2000000000)
    const khac = await category(ids.store, 'Khác')
    await assert.rejects(internal({ category: khac }), /Danh mục này cần ghi chú/)
    await assert.rejects(internal({ category: khac, note: '   ' }), /Danh mục này cần ghi chú/)
    await internal({ category: khac, note: 'mua chổi' })
    await assert.rejects(internal({ kind: 'receipt', category: await category(ids.store, 'Thu khác') }),
      /Danh mục này cần ghi chú/)
    await assert.rejects(internal({ note: 'x'.repeat(501) }), /Ghi chú/)
    await assert.rejects(internal({ counterparty: 'x'.repeat(121) }), /người nhận/)
  })

  test('create_internal: cùng client_request_id trả cùng id, không thêm dòng; khác nội dung thì raise', async () => {
    const requestId = randomUUID()
    const a = await internal({ requestId, amount: 30000 })
    const b = await internal({ requestId, amount: 30000, note: 'gửi lại' })
    assert.equal(a, b)
    assert.equal(await count('cash_book_entries'), 1)
    await assert.rejects(internal({ requestId, amount: 31000 }), /Mã chống ghi trùng đã dùng cho phiếu khác/)
    await assert.rejects(internal({ requestId, amount: 30000, method: 'bank' }), /Mã chống ghi trùng đã dùng cho phiếu khác/)
    await assert.rejects(internal({ requestId, amount: 30000, source: 'pos_drawer' }),
      /Mã chống ghi trùng đã dùng cho phiếu khác/)
    // Phiếu từ phiếu nhập kho: cùng mã nhưng khác phiếu nhập là phiếu khác.
    const nhap = await category(ids.store, 'Nhập hàng')
    const docReq = randomUUID(), doc = randomUUID()
    const d = await internal({ requestId: docReq, category: nhap, method: 'bank', source: 'inventory_receipt', sourceRef: doc })
    assert.equal(await internal({ requestId: docReq, category: nhap, method: 'bank', source: 'inventory_receipt',
      sourceRef: doc }), d)
    await assert.rejects(internal({ requestId: docReq, category: nhap, method: 'bank', source: 'inventory_receipt',
      sourceRef: randomUUID() }), /Mã chống ghi trùng đã dùng cho phiếu khác/)
    await assert.rejects(internal({ requestId: docReq, category: nhap, method: 'bank' }),
      /Mã chống ghi trùng đã dùng cho phiếu khác/)
    // Cùng mã ở quán khác là phiếu khác.
    const other = await internal({ requestId, store: ids.otherStore, actor: ids.otherOwner, amount: 30000 })
    assert.notEqual(other, a)
  })

  test('create_internal: gửi lại sau khi ca đã đóng vẫn trả phiếu cũ', async () => {
    await setShiftRequired(ids.store, true)
    const shift = await insertShift()
    const requestId = randomUUID()
    const a = await internal({ requestId })
    await db.query("UPDATE cash_shifts SET status = 'closed', closed_at = now(), closed_by = $1, counted_cash = 0, expected_cash = 0, difference = 0 WHERE id = $2", [ids.cashier, shift])
    assert.equal(await internal({ requestId }), a)
    await assert.rejects(internal(), /Chưa mở ca/)
  })

  test('void_internal: phiếu TM ca đã đóng raise; lý do rỗng raise; huỷ lần hai already true; ghi người, giờ, lý do', async () => {
    await setShiftRequired(ids.store, true)
    const shift = await insertShift()
    const e = await internal()
    await assert.rejects(voidInternal(e, '   '), /Cần ghi lý do huỷ/)
    await assert.rejects(voidInternal(e, null), /Cần ghi lý do huỷ/)
    await assert.rejects(voidInternal(randomUUID(), 'x'), /Không tìm thấy phiếu/)
    assert.deepEqual(await voidInternal(e, '  ghi nhầm số  ', ids.manager), { ok: true, already: false })
    const row = await entry(e)
    assert.equal(row.voided_by, ids.manager)
    assert.ok(row.voided_at)
    assert.equal(row.void_reason, 'ghi nhầm số')
    assert.deepEqual(await voidInternal(e, 'lần hai', ids.owner), { ok: true, already: true })
    assert.equal((await entry(e)).voided_by, ids.manager)

    const kept = await internal()
    const bankEntry = await internal({ method: 'bank' })
    await db.query("UPDATE cash_shifts SET status = 'closed', closed_at = now(), closed_by = $1, counted_cash = 0, expected_cash = 0, difference = 0 WHERE id = $2", [ids.cashier, shift])
    await assert.rejects(voidInternal(kept, 'muộn'), /Ca của phiếu này đã kết, không huỷ được/)
    assert.equal((await entry(kept)).voided_at, null)
    // Phiếu CK không gắn ca: huỷ được bất kỳ lúc nào.
    assert.deepEqual(await voidInternal(bankEntry, 'sai'), { ok: true, already: false })
  })

  test('hàm nội bộ: anon và authenticated không EXECUTE được', async () => {
    for (const fn of ['require_open_cash_shift(uuid)', 'cash_shift_totals(uuid)', 'cash_book_system_category(uuid,text)',
      'cash_book_create_internal(uuid,text,text,uuid,bigint,text,text,text,uuid,uuid,uuid)',
      'cash_book_void_internal(uuid,text,uuid)', 'seed_cash_book_categories(uuid)',
      'seed_cash_book_categories_on_store_insert()']) {
      for (const role of ['anon', 'authenticated', 'public']) {
        const r = await one(`SELECT has_function_privilege($1, 'public.${fn}', 'EXECUTE') AS v`, [role])
        assert.equal(r.v, false, `${role} gọi được ${fn}`)
      }
    }
    await assert.rejects(as(ids.owner, 'SELECT cash_shift_totals($1)', [randomUUID()]), /permission denied/)
  })

  test('client không đọc thẳng được cash_shifts, cash_book_entries; đọc được danh mục quán mình, không đọc quán khác', async () => {
    await insertShift()
    await internal()
    for (const uid of [ids.owner, ids.manager, ids.cashier]) {
      await assert.rejects(as(uid, 'SELECT * FROM cash_shifts'), /permission denied/)
      await assert.rejects(as(uid, 'SELECT * FROM cash_book_entries'), /permission denied/)
      const rows = (await as(uid, 'SELECT store_id FROM cash_book_categories')).rows
      assert.equal(rows.length, 11, `vai ${uid} phải thấy 11 danh mục quán mình`)
      assert.ok(rows.every((r) => r.store_id === ids.store))
    }
    assert.equal((await as(ids.staff, 'SELECT 1 FROM cash_book_categories')).rows.length, 0)
    const other = (await as(ids.otherOwner, 'SELECT store_id FROM cash_book_categories')).rows
    assert.ok(other.length === 11 && other.every((r) => r.store_id === ids.otherStore))
    await assert.rejects(as(ids.owner, `INSERT INTO cash_book_categories(store_id, kind, name, report_group)
      VALUES ($1, 'payment', 'Lén', 'operating_expense')`, [ids.store]), /permission denied/)
    await assert.rejects(as(ids.owner, 'UPDATE cash_book_categories SET name = name'), /permission denied/)
  })

  test('store_workflow_settings.require_cash_shift mặc định false', async () => {
    const s = await newStore()
    assert.equal((await one('SELECT require_cash_shift FROM store_workflow_settings WHERE store_id = $1', [s])).require_cash_shift, false)
  })
})

describe('122 điều kiện trước', () => {
  test('dừng nếu 112b chưa áp (đường thu cũ còn mở)', async () => {
    await assert.rejects(openCashShiftDb({ lock: false }), /mig 122: .*112b/)
  })
})
