// Mig 122 — ca thu ngân + sổ thu chi.
//   Khối '122 nền' (Task 1): bảng, danh mục seed, hàm nội bộ require_open_cash_shift, cash_shift_totals,
//   cash_book_system_category, cash_book_create_internal, cash_book_void_internal, quyền đọc bảng.
import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { openCashShiftDb } from './helpers/cash-shift-db.mjs'
import { openCollectDb } from './helpers/collect-bill-db.mjs'

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

  test('require_open_cash_shift đọc công tắc có khoá, đúng thứ tự stores → settings như open_cash_shift', async () => {
    // Đổi công tắc giữa chừng không để lọt một khoản thu chưa gắn ca; cùng thứ tự khoá với set_require_cash_shift
    // (stores → settings) nên không deadlock với lần bật/tắt chạy song song.
    const d = await def('require_open_cash_shift(uuid)')
    const storesLock = d.search(/FROM public\.stores[^;]*FOR SHARE/)
    const settingsLock = d.search(/FROM public\.store_workflow_settings[^;]*FOR SHARE/)
    assert.ok(storesLock > 0 && settingsLock > storesLock, 'phải khoá stores rồi settings FOR SHARE')
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

// ---------------------------------------------------------------------------
// Task 2: RPC ca
// ---------------------------------------------------------------------------
async function rpc(uid, fn, ...args) {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ')
  return (await as(uid, `SELECT ${fn}(${ph}) AS v`, args)).rows[0].v
}
async function dayFrom(storeId = ids.store) {
  await db.exec('RESET ROLE')
  return (await one(`SELECT b.day_from FROM business_day_bounds($1, current_business_date($1)) b`, [storeId])).day_from
}
const shiftRow = (id) => one('SELECT * FROM cash_shifts WHERE id = $1', [id])
const MONEY_HIDDEN = ['cash_sales', 'bank_sales', 'expected_cash', 'difference', 'bills_count']

// Kịch bản két chuẩn: thu ngân mở ca 500k; bill TM 300k + CK 200k; phiếu thu TM 100k; phiếu chi TM 50k.
async function standardShift() {
  await setShiftRequired(ids.store, true)
  const { shift_id: shift } = await rpc(ids.cashier, 'open_cash_shift', ids.store, 500000, 'đầu ca')
  await bill(shift, { cash: 300000, bank: 200000 })
  await internal({ kind: 'receipt', category: await category(ids.store, 'Nộp thêm vào két'), amount: 100000,
    source: 'pos_drawer', actor: ids.cashier })
  await internal({ amount: 50000, source: 'pos_drawer', actor: ids.cashier })
  return shift
}

describe('122 ca', () => {
  test('kết ca lệch: đếm 840k so với 850k dự kiến → difference −10000, lưu vào ca', async () => {
    const shift = await standardShift()
    const r = await rpc(ids.cashier, 'close_cash_shift', shift, 840000, '  thiếu 10k  ')
    assert.deepEqual(r, {
      ok: true, already: false, shift_id: shift, opening_cash: 500000, cash_sales: 300000, cash_receipts: 100000,
      cash_payments: 50000, debt_cash: 0, expected_cash: 850000, counted_cash: 840000, difference: -10000,
    })
    const row = await shiftRow(shift)
    assert.equal(row.status, 'closed')
    assert.ok(row.closed_at)
    assert.equal(row.closed_by, ids.cashier)
    assert.deepEqual([row.counted_cash, row.expected_cash, row.difference].map(Number), [840000, 850000, -10000])
    assert.equal(row.close_note, 'thiếu 10k')
    assert.equal(row.open_note, 'đầu ca')
    assert.equal(row.opened_by, ids.cashier)
    // Ca đã đóng: phiếu TM mới báo Chưa mở ca.
    await assert.rejects(internal(), /Chưa mở ca/)
  })

  test('mỗi quán một ca mở: mở lần hai báo Đã có ca đang mở', async () => {
    await setShiftRequired(ids.store, true)
    await rpc(ids.owner, 'open_cash_shift', ids.store, 0, null)
    await assert.rejects(rpc(ids.cashier, 'open_cash_shift', ids.store, 100, null), /Đã có ca đang mở/)
    assert.equal(await count("cash_shifts WHERE status = 'open'"), 1)
  })

  test('công tắc tắt: open_cash_shift báo Quán chưa bật mở ca', async () => {
    await assert.rejects(rpc(ids.owner, 'open_cash_shift', ids.store, 0, null), /Quán chưa bật mở ca/)
    assert.equal(await count('cash_shifts'), 0)
  })

  test('tiền đầu ca, tiền đếm: NULL hoặc âm báo Số tiền không hợp lệ; 0 hợp lệ', async () => {
    await setShiftRequired(ids.store, true)
    for (const v of [null, -1, 2000000001]) {
      await assert.rejects(rpc(ids.cashier, 'open_cash_shift', ids.store, v, null), /Số tiền không hợp lệ/)
    }
    await assert.rejects(rpc(ids.cashier, 'open_cash_shift', ids.store, 0, 'x'.repeat(501)), /Ghi chú tối đa 500 ký tự/)
    const { shift_id: shift } = await rpc(ids.cashier, 'open_cash_shift', ids.store, 0, '   ')
    assert.equal((await shiftRow(shift)).open_note, null)
    for (const v of [null, -1]) {
      await assert.rejects(rpc(ids.cashier, 'close_cash_shift', shift, v, null), /Số tiền không hợp lệ/)
    }
    const r = await rpc(ids.cashier, 'close_cash_shift', shift, 0, null)
    assert.deepEqual([r.expected_cash, r.difference], [0, 0])
    await assert.rejects(rpc(ids.cashier, 'close_cash_shift', randomUUID(), 0, null), /Không tìm thấy ca/)
  })

  test('ca mở không lộ số: get_open_cash_shift và get_cash_shift_report không có cash_sales, bank_sales, expected_cash, difference, bills_count (vắng hoặc null)', async () => {
    const shift = await standardShift()
    for (const uid of [ids.owner, ids.manager, ids.cashier]) {
      const open = await rpc(uid, 'get_open_cash_shift', ids.store)
      assert.equal(open.shift.id, shift)
      for (const k of MONEY_HIDDEN) assert.equal(open.shift[k] ?? null, null, `get_open_cash_shift lộ ${k}`)
      for (const k of MONEY_HIDDEN) assert.equal(open[k] ?? null, null)
      const rep = await rpc(uid, 'get_cash_shift_report', shift)
      assert.equal(rep.status, 'open')
      for (const k of [...MONEY_HIDDEN, 'cash_receipts', 'cash_payments', 'debt_cash', 'counted_cash']) {
        assert.equal(rep[k] ?? null, null, `get_cash_shift_report lộ ${k}`)
      }
      const list = await rpc(uid, 'list_cash_shifts', ids.store, 60)
      const item = list.shifts.find((s) => s.id === shift)
      assert.equal(item.expected_cash, null)
      assert.equal(item.difference, null)
    }
    // Không có chuỗi 850000 ở bất kỳ đâu trong JSON trả về cho client.
    const all = JSON.stringify([await rpc(ids.owner, 'get_open_cash_shift', ids.store),
      await rpc(ids.owner, 'get_cash_shift_report', shift), await rpc(ids.owner, 'list_cash_shifts', ids.store, 60)])
    assert.ok(!all.includes('850000') && !all.includes('300000'))
  })

  test('get_open_cash_shift: dạng JSON, phiếu TM của ca mới nhất trước, gồm phiếu huỷ', async () => {
    await setShiftRequired(ids.store, true)
    const empty = await rpc(ids.cashier, 'get_open_cash_shift', ids.store)
    assert.deepEqual(empty, { required: true, can_manage_entries: false, shift: null })
    const { shift_id: shift } = await rpc(ids.cashier, 'open_cash_shift', ids.store, 200000, 'ca sáng')
    const a = await internal({ amount: 1000, note: 'đá', counterparty: 'Anh Ba', actor: ids.cashier, source: 'pos_drawer' })
    await db.query("UPDATE cash_book_entries SET created_at = now() - interval '1 minute' WHERE id = $1", [a])
    const b = await internal({ amount: 2000, actor: ids.owner })
    await voidInternal(b, 'nhầm')
    await internal({ method: 'bank', amount: 3000 })                 // CK: không thuộc ca
    const r = await rpc(ids.cashier, 'get_open_cash_shift', ids.store)
    assert.equal(r.required, true)
    assert.deepEqual(Object.keys(r.shift).sort(),
      ['entries', 'id', 'open_note', 'opened_at', 'opened_by_name', 'opening_cash', 'stale'])
    assert.equal(r.shift.opened_by_name, 'Thu ngân Lan')
    assert.equal(r.shift.opening_cash, 200000)
    assert.equal(r.shift.open_note, 'ca sáng')
    assert.equal(r.shift.stale, false)
    assert.deepEqual(r.shift.entries.map((e) => e.id), [b, a])
    const ea = r.shift.entries[1]
    assert.deepEqual(Object.keys(ea).sort(), ['amount', 'category_name', 'counterparty', 'created_at', 'created_by_name',
      'id', 'kind', 'method', 'note', 'source', 'voided_at'])
    assert.deepEqual([ea.kind, ea.method, ea.category_name, ea.amount, ea.note, ea.counterparty, ea.source,
      ea.created_by_name, ea.voided_at], ['payment', 'cash', 'Đá', 1000, 'đá', 'Anh Ba', 'pos_drawer', 'Thu ngân Lan', null])
    assert.equal(r.shift.entries[0].created_by_name, 'chu@quan.vn')
    assert.ok(r.shift.entries[0].voided_at)
  })

  test('kết ca lặp cùng số đếm: already true, đúng kết quả cũ; khác số đếm: Ca đã đóng, không ghi đè', async () => {
    const shift = await standardShift()
    const first = await rpc(ids.cashier, 'close_cash_shift', shift, 840000, 'a')
    const closedAt = (await shiftRow(shift)).closed_at
    const again = await rpc(ids.owner, 'close_cash_shift', shift, 840000, 'b')
    assert.deepEqual(again, { ...first, already: true })
    await assert.rejects(rpc(ids.cashier, 'close_cash_shift', shift, 850000, null), /Ca đã đóng/)
    const row = await shiftRow(shift)
    assert.deepEqual([Number(row.counted_cash), row.close_note, row.closed_by], [840000, 'a', ids.cashier])
    assert.equal(row.closed_at.getTime(), closedAt.getTime())
  })

  test('kết ca lặp trên ca người khác đã kết: thu ngân luôn nhận Ca đã đóng (không dò được số đếm); quản lý xem được', async () => {
    const shift = await standardShift()
    const first = await rpc(ids.owner, 'close_cash_shift', shift, 840000, null)
    // Đúng số đếm hay sai số đếm đều cùng một lỗi: không có "máy dò".
    await assert.rejects(rpc(ids.cashier, 'close_cash_shift', shift, 840000, null), /Ca đã đóng/)
    await assert.rejects(rpc(ids.cashier, 'close_cash_shift', shift, 1000, null), /Ca đã đóng/)
    assert.deepEqual(await rpc(ids.manager, 'close_cash_shift', shift, 840000, null), { ...first, already: true })
    // Thu ngân tự kết ca mình thì gửi lại vẫn nhận kết quả đã lưu.
    const { shift_id: own } = await rpc(ids.cashier, 'open_cash_shift', ids.store, 0, null)
    const mine = await rpc(ids.cashier, 'close_cash_shift', own, 0, null)
    assert.deepEqual(await rpc(ids.cashier, 'close_cash_shift', own, 0, null), { ...mine, already: true })
  })

  test('continue_stale_shift trên ca đã đóng: Ca đã đóng', async () => {
    const shift = await insertShift({ status: 'closed' })
    await assert.rejects(rpc(ids.cashier, 'continue_stale_shift', shift), /Ca đã đóng/)
    await assert.rejects(rpc(ids.cashier, 'continue_stale_shift', randomUUID()), /Không tìm thấy ca/)
  })

  test('stale: mở đúng day_from không stale, trước 1 giây thì stale; đổi giờ bắt đầu ngày thì tính lại', async () => {
    await setShiftRequired(ids.store, true)
    const df = await dayFrom()
    const shift = await insertShift({ openedAt: df })
    assert.equal((await rpc(ids.cashier, 'get_open_cash_shift', ids.store)).shift.stale, false)
    await db.query("UPDATE cash_shifts SET opened_at = $1::timestamptz - interval '1 second' WHERE id = $2", [df, shift])
    assert.equal((await rpc(ids.cashier, 'get_open_cash_shift', ids.store)).shift.stale, true)
    // Đổi giờ bắt đầu ngày: mốc mới, stale tính lại theo mốc mới (không lưu sẵn).
    for (const start of ['05:00', '12:00', '00:00']) {
      await setDayStart(ids.store, start)
      const dfNew = await dayFrom()
      await db.query("UPDATE cash_shifts SET opened_at = $1::timestamptz WHERE id = $2", [dfNew, shift])
      assert.equal((await rpc(ids.cashier, 'get_open_cash_shift', ids.store)).shift.stale, false, start)
      await db.query("UPDATE cash_shifts SET opened_at = $1::timestamptz - interval '1 second' WHERE id = $2", [dfNew, shift])
      assert.equal((await rpc(ids.cashier, 'get_open_cash_shift', ids.store)).shift.stale, true, start)
    }
  })

  test('continue_stale_shift: ghi người, giờ, stale tắt; continued_at của ngày kinh doanh trước thì stale lại; ca không stale: already true', async () => {
    await setShiftRequired(ids.store, true)
    const df = await dayFrom()
    const shift = await insertShift({ openedAt: new Date(df.getTime() - 3600_000) })
    assert.equal((await rpc(ids.manager, 'get_open_cash_shift', ids.store)).shift.stale, true)
    assert.deepEqual(await rpc(ids.manager, 'continue_stale_shift', shift), { ok: true, already: false })
    const row = await shiftRow(shift)
    assert.equal(row.continued_by, ids.manager)
    assert.ok(row.continued_at)
    assert.equal((await rpc(ids.cashier, 'get_open_cash_shift', ids.store)).shift.stale, false)
    // Gộp lần nữa trong cùng ngày: không ghi đè.
    assert.deepEqual(await rpc(ids.cashier, 'continue_stale_shift', shift), { ok: true, already: true })
    assert.equal((await shiftRow(shift)).continued_by, ids.manager)
    // continued_at rơi vào ngày kinh doanh trước → stale lại.
    await db.query("UPDATE cash_shifts SET continued_at = $1::timestamptz - interval '1 second' WHERE id = $2", [df, shift])
    assert.equal((await rpc(ids.cashier, 'get_open_cash_shift', ids.store)).shift.stale, true)
    assert.deepEqual(await rpc(ids.cashier, 'continue_stale_shift', shift), { ok: true, already: false })
    assert.equal((await shiftRow(shift)).continued_by, ids.cashier)

    // Ca không stale: already true, không ghi.
    await db.query("UPDATE cash_shifts SET status = 'closed', closed_at = now(), closed_by = $1, counted_cash = 0, expected_cash = 0, difference = 0 WHERE id = $2", [ids.cashier, shift])
    const fresh = await insertShift({ openedAt: df })
    assert.deepEqual(await rpc(ids.cashier, 'continue_stale_shift', fresh), { ok: true, already: true })
    assert.equal((await shiftRow(fresh)).continued_at, null)
  })

  test('carried_days = 3 khi ca mở từ 2 ngày kinh doanh trước rồi continue; 1 khi chưa continue', async () => {
    await setShiftRequired(ids.store, true)
    const df = await dayFrom()
    const shift = await insertShift({ openedAt: new Date(df.getTime() - 2 * 86400_000 + 3600_000) })
    assert.equal((await rpc(ids.owner, 'get_cash_shift_report', shift)).carried_days, 1)
    await rpc(ids.owner, 'continue_stale_shift', shift)
    const open = await rpc(ids.owner, 'get_cash_shift_report', shift)
    assert.equal(open.carried_days, 3)
    assert.equal(open.continued_by_name, 'chu@quan.vn')
    await rpc(ids.cashier, 'close_cash_shift', shift, 0, null)
    assert.equal((await rpc(ids.owner, 'get_cash_shift_report', shift)).carried_days, 3)
  })

  test('báo cáo ca đã đóng: đủ trường, phiếu gồm cả phiếu đã huỷ', async () => {
    const shift = await standardShift()
    const v = await internal({ amount: 7000, actor: ids.cashier, source: 'pos_drawer' })
    await voidInternal(v, 'nhầm', ids.owner)
    await rpc(ids.owner, 'close_cash_shift', shift, 850000, 'đủ')
    const rep = await rpc(ids.cashier, 'get_cash_shift_report', shift)
    assert.deepEqual(Object.keys(rep).sort(), ['bank_sales', 'bills_count', 'carried_days', 'cash_payments',
      'cash_receipts', 'cash_sales', 'close_note', 'closed_at', 'closed_by_name', 'continued_at', 'continued_by_name',
      'counted_cash', 'debt_cash', 'difference', 'entries', 'expected_cash', 'id', 'open_note', 'opened_at',
      'opened_by_name', 'opening_cash', 'status', 'store_id'])
    assert.deepEqual([rep.status, rep.store_id, rep.opened_by_name, rep.closed_by_name, rep.opening_cash, rep.cash_sales,
      rep.bank_sales, rep.cash_receipts, rep.cash_payments, rep.debt_cash, rep.expected_cash, rep.counted_cash,
      rep.difference, rep.bills_count, rep.carried_days, rep.continued_at, rep.continued_by_name, rep.close_note],
    ['closed', ids.store, 'Thu ngân Lan', 'chu@quan.vn', 500000, 300000, 200000, 100000, 50000, 0, 850000, 850000,
      0, 1, 1, null, null, 'đủ'])
    assert.equal(rep.entries.length, 3)
    assert.equal(rep.entries.filter((e) => e.voided_at).length, 1)
  })

  test('tắt công tắc khi còn ca mở: Còn ca đang mở, kết ca trước khi tắt; bật/tắt ghi store_workflow_setting_events', async () => {
    assert.deepEqual(await rpc(ids.owner, 'set_require_cash_shift', ids.store, true), { ok: true, require_cash_shift: true })
    const ev = await one(`SELECT before_value, after_value, changed_by, changed_via FROM store_workflow_setting_events
      WHERE store_id = $1 ORDER BY created_at DESC LIMIT 1`, [ids.store])
    assert.deepEqual([ev.before_value.require_cash_shift, ev.after_value.require_cash_shift, ev.changed_by, ev.changed_via],
      [false, true, ids.owner, 'owner'])
    const { shift_id: shift } = await rpc(ids.cashier, 'open_cash_shift', ids.store, 0, null)
    await assert.rejects(rpc(ids.owner, 'set_require_cash_shift', ids.store, false), /Còn ca đang mở, kết ca trước khi tắt/)
    assert.equal((await one('SELECT require_cash_shift FROM store_workflow_settings WHERE store_id = $1', [ids.store])).require_cash_shift, true)
    await rpc(ids.cashier, 'close_cash_shift', shift, 0, null)
    const before = await count('store_workflow_setting_events')
    assert.deepEqual(await rpc(ids.owner, 'set_require_cash_shift', ids.store, false), { ok: true, require_cash_shift: false })
    assert.equal(await count('store_workflow_setting_events'), before + 1)
    await assert.rejects(rpc(ids.owner, 'set_require_cash_shift', ids.store, null), /không hợp lệ/)
  })

  test('set_require_cash_shift: quản lý, thu ngân bị chặn', async () => {
    for (const uid of [ids.manager, ids.cashier, ids.staff, ids.otherOwner]) {
      await assert.rejects(rpc(uid, 'set_require_cash_shift', ids.store, true), /Chỉ chủ quán/)
    }
    assert.equal((await one('SELECT require_cash_shift FROM store_workflow_settings WHERE store_id = $1', [ids.store])).require_cash_shift, false)
  })

  test('list_cash_shifts: chủ quán và quản lý thấy mọi ca; thu ngân chỉ ca mình mở hoặc kết', async () => {
    await setShiftRequired(ids.store, true)
    const t = (h) => new Date(Date.now() - h * 3600_000)
    const a = await insertShift({ status: 'closed', openedBy: ids.owner, openedAt: t(5) })          // chủ quán mở + kết
    const c = await insertShift({ status: 'closed', openedBy: ids.manager, openedAt: t(3) })
    await db.query('UPDATE cash_shifts SET closed_by = $1 WHERE id = $2', [ids.cashier, c])          // thu ngân kết hộ
    const b = await insertShift({ openedBy: ids.cashier, openedAt: t(1) })                          // thu ngân đang mở
    await insertShift({ storeId: ids.otherStore, openedBy: ids.otherOwner })
    for (const uid of [ids.owner, ids.manager]) {
      const r = await rpc(uid, 'list_cash_shifts', ids.store, 60)
      assert.equal(r.required, true)
      assert.deepEqual(r.shifts.map((s) => s.id), [b, c, a])
    }
    const mine = await rpc(ids.cashier, 'list_cash_shifts', ids.store, 60)
    assert.deepEqual(mine.shifts.map((s) => s.id), [b, c])
    const item = mine.shifts[1]
    assert.deepEqual(Object.keys(item).sort(), ['closed_at', 'closed_by_name', 'counted_cash', 'difference',
      'expected_cash', 'id', 'opened_at', 'opened_by_name', 'opening_cash', 'status'])
    assert.deepEqual([item.status, item.opened_by_name, item.closed_by_name], ['closed', 'quanly@quan.vn', 'Thu ngân Lan'])
    assert.equal((await rpc(ids.owner, 'list_cash_shifts', ids.store, 1)).shifts.length, 1)
  })

  test('get_cash_shift_report: thu ngân xem ca người khác bị chặn Không có quyền xem ca này; quản lý xem được', async () => {
    const other = await insertShift({ status: 'closed', openedBy: ids.owner })
    await assert.rejects(rpc(ids.cashier, 'get_cash_shift_report', other), /Không có quyền xem ca này/)
    assert.equal((await rpc(ids.manager, 'get_cash_shift_report', other)).id, other)
    await assert.rejects(rpc(ids.otherOwner, 'get_cash_shift_report', other), /Không có quyền xem ca này/)
    await assert.rejects(rpc(ids.owner, 'get_cash_shift_report', randomUUID()), /Không tìm thấy ca/)
  })

  test('get_open_cash_shift: can_manage_entries true với chủ quán, quản lý; false với thu ngân', async () => {
    assert.equal((await rpc(ids.owner, 'get_open_cash_shift', ids.store)).can_manage_entries, true)
    assert.equal((await rpc(ids.manager, 'get_open_cash_shift', ids.store)).can_manage_entries, true)
    const c = await rpc(ids.cashier, 'get_open_cash_shift', ids.store)
    assert.deepEqual(c, { required: false, can_manage_entries: false, shift: null })
  })

  test('quyền: phục vụ và chủ quán quán khác bị chặn ở mọi RPC ca; anon không EXECUTE được', async () => {
    await setShiftRequired(ids.store, true)
    const shift = await insertShift()
    for (const uid of [ids.staff, ids.otherOwner]) {
      await assert.rejects(rpc(uid, 'open_cash_shift', ids.store, 0, null), /Không có quyền/)
      await assert.rejects(rpc(uid, 'close_cash_shift', shift, 0, null), /Không có quyền/)
      await assert.rejects(rpc(uid, 'continue_stale_shift', shift), /Không có quyền/)
      await assert.rejects(rpc(uid, 'get_open_cash_shift', ids.store), /Không có quyền/)
      await assert.rejects(rpc(uid, 'list_cash_shifts', ids.store, 60), /Không có quyền/)
      await assert.rejects(rpc(uid, 'get_cash_shift_report', shift), /Không có quyền/)
    }
    assert.equal((await shiftRow(shift)).status, 'open')
    for (const fn of ['open_cash_shift(uuid,bigint,text)', 'close_cash_shift(uuid,bigint,text)',
      'continue_stale_shift(uuid)', 'get_open_cash_shift(uuid)', 'list_cash_shifts(uuid,integer)',
      'get_cash_shift_report(uuid)', 'set_require_cash_shift(uuid,boolean)']) {
      assert.equal((await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE') AS v`)).v, false, fn)
      assert.equal((await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE') AS v`)).v, true, fn)
      const d = await def(fn)
      assert.match(d, /SECURITY DEFINER/, fn)
      assert.match(d, /SET search_path TO 'public'/, fn)
    }
  })

  test('cash_shift_report_json: service_role EXECUTE được, authenticated không', async () => {
    const shift = await insertShift({ status: 'closed' })
    for (const fn of ['cash_shift_report_json(uuid)', 'cash_shift_stale(uuid)', 'cash_shift_entries_json(uuid)',
      'cash_user_name(uuid)']) {
      for (const role of ['anon', 'authenticated', 'public']) {
        assert.equal((await one(`SELECT has_function_privilege($1, 'public.${fn}', 'EXECUTE') AS v`, [role])).v, false,
          `${role} gọi được ${fn}`)
      }
    }
    assert.equal((await one(`SELECT has_function_privilege('service_role', 'public.cash_shift_report_json(uuid)', 'EXECUTE') AS v`)).v, true)
    await db.exec('SET ROLE service_role')
    try {
      assert.equal((await one('SELECT cash_shift_report_json($1) AS r', [shift])).r.id, shift)
    } finally {
      await db.exec('RESET ROLE')
    }
    await assert.rejects(as(ids.owner, 'SELECT cash_shift_report_json($1)', [shift]), /permission denied/)
  })

  test('khoá: close_cash_shift lấy FOR UPDATE trên ca trước khi gọi cash_shift_totals; open/continue khoá đúng chỗ', async () => {
    const close = await def('close_cash_shift(uuid,bigint,text)')
    const lock = close.indexOf('FOR UPDATE')
    assert.ok(lock > 0 && lock < close.indexOf('cash_shift_totals('), 'close_cash_shift phải FOR UPDATE trước khi cộng két')
    assert.match(await def('continue_stale_shift(uuid)'), /FOR UPDATE/)
    // Mở ca khoá dòng cài đặt FOR SHARE: tắt công tắc (FOR UPDATE) không chen giữa kiểm và ghi.
    // Thứ tự khoá giống set_require_cash_shift (stores → settings) để không deadlock.
    const open = await def('open_cash_shift(uuid,bigint,text)')
    const storesLock = open.search(/FROM public\.stores[^;]*FOR SHARE/)
    const settingsLock = open.search(/FROM public\.store_workflow_settings[^;]*FOR SHARE/)
    assert.ok(storesLock > 0 && settingsLock > storesLock, 'open_cash_shift phải khoá stores trước settings')
    assert.match(await def('set_require_cash_shift(uuid,boolean)'), /store_workflow_settings[\s\S]*FOR UPDATE/)
  })

  test('snapshot cài đặt có require_cash_shift; neo store_workflow_snapshot khớp đúng 1 lần trong prod-defs/122', async () => {
    const snap = (await one('SELECT store_workflow_snapshot($1) AS s', [ids.store])).s
    assert.equal(snap.require_cash_shift, false)
    assert.equal(snap.business_day_start, '00:00')
    await setShiftRequired(ids.store, true)
    assert.equal((await one('SELECT store_workflow_snapshot($1) AS s', [ids.store])).s.require_cash_shift, true)
    const prod = (await readFile(new URL('./prod-defs/122/store_workflow_snapshot.sql', import.meta.url), 'utf8'))
      .replace(/\r\n/g, '\n')
    assert.equal(countOf(prod, "'business_day_start', to_char(w.business_day_start, 'HH24:MI')"), 1)
    assert.equal(createHash('md5').update(prod).digest('hex'), '51e3171bc7d4d5eb9075cf091d4e6c06')
  })
})

// ---------------------------------------------------------------------------
// Task 3: RPC sổ thu chi
// ---------------------------------------------------------------------------
// Gọi cash_book_create dưới uid. Mặc định: phiếu chi TM 10.000đ danh mục Đá, nguồn manual, mã mới.
async function create(uid, overrides = {}) {
  const p = {
    kind: 'payment', method: 'cash', category: null, amount: 10000, note: null, counterparty: null,
    requestId: randomUUID(), source: 'manual', store: ids.store, ...overrides,
  }
  const cat = p.category ?? (await category(p.store, 'Đá'))
  return rpc(uid, 'cash_book_create', p.kind, p.method, cat, p.amount, p.note, p.counterparty, p.requestId, p.source)
}
const list = (uid, from, to, filters = {}, storeId = ids.store) =>
  rpc(uid, 'cash_book_list', storeId, from, to, JSON.stringify(filters))
async function today(storeId = ids.store) {
  await db.exec('RESET ROLE')
  return (await one('SELECT current_business_date($1)::text AS d', [storeId])).d
}

describe('122 sổ', () => {
  test('thu ngân: phiếu chi TM pos_drawer được; CK bị chặn; nguồn manual bị chặn', async () => {
    await setShiftRequired(ids.store, true)
    const shift = await insertShift()
    const r = await create(ids.cashier, { source: 'pos_drawer', note: 'đá cây' })
    assert.deepEqual(Object.keys(r).sort(), ['already', 'business_date', 'cash_shift_id', 'id', 'ok'])
    assert.deepEqual([r.ok, r.already, r.cash_shift_id, r.business_date], [true, false, shift, await today()])
    const row = await entry(r.id)
    assert.deepEqual([row.created_by, row.source, row.method, row.store_id], [ids.cashier, 'pos_drawer', 'cash', ids.store])
    await create(ids.cashier, { kind: 'receipt', category: await category(ids.store, 'Nộp thêm vào két'), source: 'pos_drawer' })
    await assert.rejects(create(ids.cashier, { method: 'bank', source: 'pos_drawer' }), /Thu ngân chỉ ghi thu\/chi tiền mặt ở két/)
    await assert.rejects(create(ids.cashier, { method: 'cash', source: 'manual' }), /Thu ngân chỉ ghi thu\/chi tiền mặt ở két/)
    await assert.rejects(create(ids.cashier, { method: 'bank', source: 'manual' }), /Thu ngân chỉ ghi thu\/chi tiền mặt ở két/)
    assert.equal(await count('cash_book_entries'), 2)
  })

  test('quản lý: ghi CK không cần ca; ghi TM khi bật ca không có ca báo Chưa mở ca', async () => {
    await setShiftRequired(ids.store, true)
    const bank = await create(ids.manager, { method: 'bank', counterparty: 'NCC Bia', amount: 1500000 })
    assert.equal(bank.cash_shift_id, null)
    assert.equal((await entry(bank.id)).created_by, ids.manager)
    await assert.rejects(create(ids.manager), /Chưa mở ca/)
    await assert.rejects(create(ids.owner, { source: 'pos_drawer' }), /Chưa mở ca/)
    const shift = await insertShift()
    assert.equal((await create(ids.owner, { source: 'pos_drawer' })).cash_shift_id, shift)
    assert.equal((await create(ids.manager)).cash_shift_id, shift)
  })

  test('gửi lại cùng mã sau khi ca đã đóng: trả phiếu cũ already true, không báo Chưa mở ca', async () => {
    await setShiftRequired(ids.store, true)
    const shift = await insertShift()
    const requestId = randomUUID()
    const a = await create(ids.cashier, { requestId, source: 'pos_drawer' })
    await rpc(ids.cashier, 'close_cash_shift', shift, 0, null)
    const b = await create(ids.cashier, { requestId, source: 'pos_drawer' })
    assert.deepEqual(b, { ...a, already: true })
    assert.equal(await count('cash_book_entries'), 1)
    await assert.rejects(create(ids.cashier, { requestId, source: 'pos_drawer', amount: 9999 }),
      /Mã chống ghi trùng đã dùng cho phiếu khác/)
    await assert.rejects(create(ids.cashier, { requestId: null, source: 'pos_drawer' }), /Thiếu mã chống ghi trùng/)
  })

  test('p_source inventory_receipt từ client bị chặn; danh mục hệ thống Nhập hàng không ghi tay được', async () => {
    await assert.rejects(create(ids.owner, { source: 'inventory_receipt' }), /Nguồn phiếu không hợp lệ/)
    await assert.rejects(create(ids.owner, { source: null }), /Nguồn phiếu không hợp lệ/)
    const nhap = await category(ids.store, 'Nhập hàng')
    await assert.rejects(create(ids.owner, { category: nhap, method: 'bank' }), /Nhập hàng chỉ ghi qua phiếu nhập kho/)
    await assert.rejects(create(ids.cashier, { category: nhap, source: 'pos_drawer' }), /Nhập hàng chỉ ghi qua phiếu nhập kho/)
    // Mặc định nguồn manual khi không truyền p_source.
    const r = (await as(ids.owner, `SELECT cash_book_create('payment', 'bank', $1, 5000, NULL, NULL, $2) AS v`,
      [await category(ids.store, 'Đá'), randomUUID()])).rows[0].v
    assert.equal((await entry(r.id)).source, 'manual')
    assert.equal(await count("cash_book_entries WHERE category_id = $1", [nhap]), 0)
  })

  test('quyền ghi: phục vụ, chủ quán khác, danh mục lạ bị chặn; quán suy từ danh mục', async () => {
    await assert.rejects(create(ids.staff, { source: 'pos_drawer' }), /Không có quyền ghi sổ thu chi/)
    await assert.rejects(create(ids.otherOwner, { method: 'bank' }), /Không có quyền ghi sổ thu chi/)
    await assert.rejects(create(ids.owner, { category: randomUUID(), method: 'bank' }), /Danh mục không hợp lệ/)
    const r = await create(ids.otherOwner, { store: ids.otherStore, method: 'bank' })
    assert.equal((await entry(r.id)).store_id, ids.otherStore)
    // Chủ quán A không ghi được vào quán B bằng cách đưa danh mục của B.
    await assert.rejects(create(ids.owner, { store: ids.otherStore, method: 'bank' }), /Không có quyền ghi sổ thu chi/)
  })

  test('huỷ: thu ngân bị chặn; quản lý huỷ được; phiếu inventory_receipt báo Phiếu chi của phiếu nhập kho, huỷ ở trang Kho', async () => {
    const e = await create(ids.cashier, { source: 'pos_drawer' })
    await assert.rejects(rpc(ids.cashier, 'cash_book_void', e.id, 'nhầm'), /Chỉ chủ quán hoặc quản lý được huỷ phiếu/)
    await assert.rejects(rpc(ids.staff, 'cash_book_void', e.id, 'nhầm'), /Chỉ chủ quán hoặc quản lý được huỷ phiếu/)
    await assert.rejects(rpc(ids.otherOwner, 'cash_book_void', e.id, 'nhầm'), /Chỉ chủ quán hoặc quản lý được huỷ phiếu/)
    await assert.rejects(rpc(ids.manager, 'cash_book_void', e.id, '  '), /Cần ghi lý do huỷ/)
    assert.deepEqual(await rpc(ids.manager, 'cash_book_void', e.id, 'nhầm'), { ok: true, already: false })
    assert.equal((await entry(e.id)).voided_by, ids.manager)
    assert.deepEqual(await rpc(ids.owner, 'cash_book_void', e.id, 'lần hai'), { ok: true, already: true })
    const inv = await internal({ category: await category(ids.store, 'Nhập hàng'), method: 'bank',
      source: 'inventory_receipt', sourceRef: randomUUID() })
    await assert.rejects(rpc(ids.owner, 'cash_book_void', inv, 'x'), /Phiếu chi của phiếu nhập kho, huỷ ở trang Kho/)
    assert.equal((await entry(inv)).voided_at, null)
    await assert.rejects(rpc(ids.owner, 'cash_book_void', randomUUID(), 'x'), /Không tìm thấy phiếu/)
  })

  test('huỷ phiếu TM ca đã đóng: Ca của phiếu này đã kết, không huỷ được; phiếu CK huỷ được bất kỳ lúc nào', async () => {
    await setShiftRequired(ids.store, true)
    const shift = await insertShift()
    const cash = await create(ids.owner)
    const bank = await create(ids.owner, { method: 'bank' })
    await rpc(ids.owner, 'close_cash_shift', shift, 0, null)
    await assert.rejects(rpc(ids.owner, 'cash_book_void', cash.id, 'muộn'), /Ca của phiếu này đã kết, không huỷ được/)
    assert.deepEqual(await rpc(ids.manager, 'cash_book_void', bank.id, 'sai'), { ok: true, already: false })
  })

  test('phiếu huỷ không vào két và không vào totals của cash_book_list', async () => {
    await setShiftRequired(ids.store, true)
    const shift = await insertShift({ openingCash: 1000 })
    const keep = await create(ids.owner, { amount: 300 })
    const gone = await create(ids.owner, { amount: 200 })
    await create(ids.owner, { kind: 'receipt', category: await category(ids.store, 'Nộp thêm vào két'), amount: 50 })
    await create(ids.owner, { method: 'bank', amount: 7 })
    const goneBank = await create(ids.owner, { method: 'bank', kind: 'receipt', note: 'x',
      category: await category(ids.store, 'Thu khác'), amount: 9 })
    await rpc(ids.owner, 'cash_book_void', gone.id, 'nhầm')
    await rpc(ids.owner, 'cash_book_void', goneBank.id, 'nhầm')
    const t = await totals(shift)
    assert.deepEqual([t.cash_payments, t.cash_receipts, t.expected_cash], [300, 50, 750])
    const d = await today()
    const r = await list(ids.owner, d, d)
    assert.deepEqual(r.totals, { receipt_cash: 50, receipt_bank: 0, payment_cash: 300, payment_bank: 7 })
    assert.equal(r.entries.length, 5)
    const g = r.entries.find((e) => e.id === gone.id)
    assert.ok(g.voided_at)
    assert.deepEqual([g.voided_by_name, g.void_reason], ['chu@quan.vn', 'nhầm'])
    assert.ok(r.entries.find((e) => e.id === keep.id).voided_at === null)
  })

  test('cash_book_list: dạng JSON, mới nhất trước, có ca và người ghi', async () => {
    await setShiftRequired(ids.store, true)
    const shift = await insertShift()
    const a = await create(ids.cashier, { source: 'pos_drawer', note: 'đá', counterparty: 'Anh Ba' })
    await db.query("UPDATE cash_book_entries SET created_at = now() - interval '1 minute' WHERE id = $1", [a.id])
    const b = await create(ids.manager, { method: 'bank' })
    const d = await today()
    const r = await list(ids.owner, d, d)
    assert.deepEqual(Object.keys(r).sort(), ['entries', 'totals', 'truncated'])
    assert.equal(r.truncated, false)
    assert.deepEqual(r.entries.map((e) => e.id), [b.id, a.id])
    const e = r.entries[1]
    assert.deepEqual(Object.keys(e).sort(), ['amount', 'business_date', 'cash_shift_id', 'category_id', 'category_name',
      'counterparty', 'created_at', 'created_by_name', 'id', 'kind', 'method', 'note', 'report_group', 'shift_opened_at',
      'source', 'source_ref', 'void_reason', 'voided_at', 'voided_by_name'])
    assert.deepEqual([e.kind, e.method, e.category_name, e.report_group, e.amount, e.note, e.counterparty, e.business_date,
      e.created_by_name, e.cash_shift_id, e.source, e.source_ref, e.voided_at, e.voided_by_name, e.void_reason],
    ['payment', 'cash', 'Đá', 'operating_expense', 10000, 'đá', 'Anh Ba', d, 'Thu ngân Lan', shift, 'pos_drawer', null,
      null, null, null])
    assert.ok(e.shift_opened_at)
    assert.equal(r.entries[0].shift_opened_at, null)
  })

  test('cash_book_list: lọc ngày theo business_date, kind, method, category_id; quán khác bị chặn; thu ngân chỉ thấy phiếu mình tạo', async () => {
    const d = await today()
    const old = await create(ids.owner, { method: 'bank', amount: 1 })
    await db.query("UPDATE cash_book_entries SET business_date = business_date - 3 WHERE id = $1", [old.id])
    const mine = await create(ids.cashier, { source: 'pos_drawer', amount: 2 })
    const rec = await create(ids.manager, { kind: 'receipt', category: await category(ids.store, 'Nộp thêm vào két'), amount: 4 })
    const bank = await create(ids.owner, { method: 'bank', category: await category(ids.store, 'Điện nước'), amount: 8 })
    await create(ids.otherOwner, { store: ids.otherStore, method: 'bank', amount: 16 })
    const ids_ = async (uid, from, to, f) => (await list(uid, from, to, f)).entries.map((e) => e.id).sort()
    const minus = async (n) => (await one(`SELECT ($1::date - $2::int)::text AS d`, [d, n])).d
    assert.deepEqual(await ids_(ids.owner, d, d), [mine.id, rec.id, bank.id].sort())
    assert.deepEqual(await ids_(ids.manager, await minus(3), d), [old.id, mine.id, rec.id, bank.id].sort())
    assert.deepEqual(await ids_(ids.owner, await minus(3), await minus(3)), [old.id])
    assert.deepEqual(await ids_(ids.owner, d, d, { kind: 'receipt' }), [rec.id])
    assert.deepEqual(await ids_(ids.owner, d, d, { method: 'bank' }), [bank.id])
    assert.deepEqual(await ids_(ids.owner, d, d, { category_id: await category(ids.store, 'Điện nước') }), [bank.id])
    assert.deepEqual(await ids_(ids.owner, d, d, { kind: 'payment', method: 'cash' }), [mine.id])
    // Thu ngân: chỉ phiếu mình ghi, totals cũng chỉ của mình.
    const c = await list(ids.cashier, await minus(3), d)
    assert.deepEqual(c.entries.map((e) => e.id), [mine.id])
    assert.deepEqual(c.totals, { receipt_cash: 0, receipt_bank: 0, payment_cash: 2, payment_bank: 0 })
    for (const uid of [ids.otherOwner, ids.staff]) {
      await assert.rejects(list(uid, d, d), /Không có quyền xem sổ thu chi/)
    }
    await assert.rejects(list(ids.owner, d, d, { kind: 'transfer' }), /Bộ lọc không hợp lệ/)
    await assert.rejects(list(ids.owner, d, d, { category_id: 'abc' }), /Bộ lọc không hợp lệ/)
  })

  test('cash_book_list: khoảng ngày ngược hoặc dài hơn 366 ngày bị chặn', async () => {
    await assert.rejects(list(ids.owner, '2026-11-09', '2026-11-08'), /Khoảng ngày không hợp lệ/)
    await assert.rejects(list(ids.owner, '2025-11-07', '2026-11-09'), /Khoảng ngày không hợp lệ/)
    await assert.rejects(list(ids.owner, null, '2026-11-09'), /Khoảng ngày không hợp lệ/)
    assert.deepEqual((await list(ids.owner, '2025-11-08', '2026-11-09')).entries, [])
  })

  test('cash_book_list: tối đa 2000 phiếu, truncated true, totals vẫn tính đủ', async () => {
    const cat = await category(ids.store, 'Đá')
    await db.query(`INSERT INTO cash_book_entries(store_id, kind, method, category_id, amount, business_date, source,
        client_request_id, created_by)
      SELECT $1, 'payment', 'bank', $2, 1, current_business_date($1), 'manual', gen_random_uuid(), $3
        FROM generate_series(1, 2001)`, [ids.store, cat, ids.owner])
    const d = await today()
    const r = await list(ids.owner, d, d)
    assert.equal(r.entries.length, 2000)
    assert.equal(r.truncated, true)
    assert.equal(r.totals.payment_bank, 2001)
  })

  test('danh mục: tạo trùng tên (khác hoa thường) bị chặn; nhóm inventory_purchase bị chặn; nhóm sai loại bị chặn', async () => {
    const save = (uid, id, kind, name, group, storeId = ids.store) =>
      rpc(uid, 'cash_book_save_category', storeId, id, kind, name, group)
    const r = await save(ids.manager, null, 'payment', '  Thuê loa  ', null)
    assert.equal(r.ok, true)
    const row = await one('SELECT * FROM cash_book_categories WHERE id = $1', [r.id])
    assert.deepEqual([row.store_id, row.kind, row.name, row.report_group, row.is_system, row.is_active, row.requires_note],
      [ids.store, 'payment', 'Thuê loa', 'operating_expense', false, true, false])
    assert.ok(row.sort_order > 90)
    const rec = await save(ids.owner, null, 'receipt', 'Bán vỏ chai', null)
    assert.equal((await one('SELECT report_group FROM cash_book_categories WHERE id = $1', [rec.id])).report_group, 'other_income')
    await save(ids.owner, null, 'receipt', 'Rút ngân hàng', 'cash_transfer')
    await assert.rejects(save(ids.owner, null, 'payment', 'đá', null), /Danh mục đã có/)
    await assert.rejects(save(ids.owner, null, 'payment', 'THUÊ LOA', null), /Danh mục đã có/)
    await assert.rejects(save(ids.owner, null, 'payment', 'Nhập bia', 'inventory_purchase'), /Nhóm danh mục không hợp lệ/)
    await assert.rejects(save(ids.owner, null, 'receipt', 'Thu lạ', 'operating_expense'), /Nhóm danh mục không hợp lệ/)
    await assert.rejects(save(ids.owner, null, 'transfer', 'Lạ', null), /Loại danh mục không hợp lệ/)
    await assert.rejects(save(ids.owner, null, 'payment', '   ', null), /Tên danh mục/)
    await assert.rejects(save(ids.owner, null, 'payment', 'x'.repeat(61), null), /Tên danh mục/)
    // Cùng tên khác loại (thu / chi) thì được.
    await save(ids.owner, null, 'receipt', 'Đá', null)
  })

  test('danh mục hệ thống: đổi tên, ẩn đều bị chặn; danh mục thường đổi tên, ẩn, hiện lại được', async () => {
    const save = (uid, id, kind, name, group) => rpc(uid, 'cash_book_save_category', ids.store, id, kind, name, group)
    const nhap = await category(ids.store, 'Nhập hàng')
    await assert.rejects(save(ids.owner, nhap, 'payment', 'Mua hàng', 'inventory_purchase'), /Danh mục hệ thống không sửa được/)
    await assert.rejects(rpc(ids.owner, 'cash_book_set_category_active', nhap, false), /Danh mục hệ thống không sửa được/)
    const cho = await category(ids.store, 'Đi chợ')
    assert.deepEqual(await save(ids.manager, cho, 'payment', 'Đi chợ sáng', 'operating_expense'), { ok: true, id: cho })
    assert.equal((await one('SELECT name FROM cash_book_categories WHERE id = $1', [cho])).name, 'Đi chợ sáng')
    await assert.rejects(save(ids.manager, cho, 'payment', 'Đá', 'operating_expense'), /Danh mục đã có/)
    await assert.rejects(save(ids.manager, cho, 'receipt', 'Đi chợ sáng', 'other_income'), /Không đổi được loại thu\/chi/)
    await assert.rejects(save(ids.manager, cho, 'payment', 'Đi chợ sáng', 'inventory_purchase'), /Nhóm danh mục không hợp lệ/)
    // Đổi hoa thường của chính nó: không coi là trùng.
    await save(ids.manager, cho, 'payment', 'ĐI CHỢ SÁNG', 'operating_expense')
    assert.deepEqual(await rpc(ids.manager, 'cash_book_set_category_active', cho, false), { ok: true })
    assert.equal((await one('SELECT is_active FROM cash_book_categories WHERE id = $1', [cho])).is_active, false)
    await assert.rejects(create(ids.owner, { category: cho, method: 'bank' }), /Danh mục không hợp lệ/)
    assert.deepEqual(await rpc(ids.owner, 'cash_book_set_category_active', cho, true), { ok: true })
    await create(ids.owner, { category: cho, method: 'bank' })
    // Danh mục quán khác: không thấy.
    await assert.rejects(rpc(ids.owner, 'cash_book_save_category', ids.store, await category(ids.otherStore, 'Đá'),
      'payment', 'Lén', null), /Không tìm thấy danh mục/)
    await assert.rejects(rpc(ids.owner, 'cash_book_set_category_active', randomUUID(), false), /Không tìm thấy danh mục/)
  })

  test('gửi lại: already do hàm nội bộ quyết định; người khác dùng lại mã bị chặn', async () => {
    const requestId = randomUUID()
    const cat = await category(ids.store, 'Đá')
    const call = (actor) => one(`SELECT cash_book_create_internal_result($1, 'payment', 'bank', $2, 500, NULL, NULL,
      'manual', NULL, $3, $4) AS r`, [ids.store, cat, actor, requestId])
    const a = (await call(ids.owner)).r
    assert.equal(a.already, false)
    assert.deepEqual((await call(ids.owner)).r, { id: a.id, already: true })
    // Hàm hợp đồng vẫn trả đúng id.
    assert.equal((await one(`SELECT cash_book_create_internal($1, 'payment', 'bank', $2, 500, NULL, NULL, 'manual',
      NULL, $3, $4) AS id`, [ids.store, cat, ids.owner, requestId])).id, a.id)
    await assert.rejects(call(ids.manager), /Mã chống ghi trùng đã dùng cho phiếu khác/)
    // Qua RPC: quản lý gửi đúng mã + nội dung phiếu của chủ quán vẫn bị chặn.
    const r = await create(ids.owner, { method: 'bank', amount: 700 })
    const req2 = (await entry(r.id)).client_request_id
    await assert.rejects(create(ids.manager, { method: 'bank', amount: 700, requestId: req2 }),
      /Mã chống ghi trùng đã dùng cho phiếu khác/)
    assert.equal((await create(ids.owner, { method: 'bank', amount: 700, requestId: req2 })).already, true)
    // RPC không tự tra trước (đua song song sẽ cùng thấy "chưa có"): already lấy từ hàm nội bộ.
    const d = await def('cash_book_create(text,text,uuid,bigint,text,text,uuid,text)')
    assert.match(d, /cash_book_create_internal_result\(/)
    assert.doesNotMatch(d, /FROM public\.cash_book_entries e\s+WHERE e\.store_id = v_store AND e\.client_request_id/)
    for (const role of ['anon', 'authenticated', 'public']) {
      assert.equal((await one(`SELECT has_function_privilege($1,
        'public.cash_book_create_internal_result(uuid,text,text,uuid,bigint,text,text,text,uuid,uuid,uuid)', 'EXECUTE') AS v`,
      [role])).v, false)
    }
  })

  test('danh mục đã có phiếu: không đổi nhóm báo cáo, vẫn đổi tên được', async () => {
    const save = (id, name, group) => rpc(ids.owner, 'cash_book_save_category', ids.store, id, 'payment', name, group)
    const used = await category(ids.store, 'Sửa chữa')
    const e = await create(ids.owner, { category: used, method: 'bank' })
    await assert.rejects(save(used, 'Sửa chữa', 'owner_draw'),
      /Danh mục đã có phiếu — không đổi nhóm báo cáo được; tạo danh mục mới/)
    // Phiếu đã huỷ vẫn tính là "đã có phiếu".
    await rpc(ids.owner, 'cash_book_void', e.id, 'nhầm')
    await assert.rejects(save(used, 'Sửa chữa', 'owner_draw'), /Danh mục đã có phiếu/)
    assert.deepEqual(await save(used, 'Sửa chữa máy', null), { ok: true, id: used })
    assert.deepEqual(await save(used, 'Sửa chữa máy', 'operating_expense'), { ok: true, id: used })
    const unused = await category(ids.store, 'Ga - than')
    await save(unused, 'Ga - than', 'owner_draw')
    assert.equal((await one('SELECT report_group FROM cash_book_categories WHERE id = $1', [unused])).report_group, 'owner_draw')
  })

  test('danh mục: thu ngân, phục vụ bị chặn', async () => {
    const cho = await category(ids.store, 'Đi chợ')
    for (const uid of [ids.cashier, ids.staff, ids.otherOwner]) {
      await assert.rejects(rpc(uid, 'cash_book_save_category', ids.store, null, 'payment', 'Mới', null),
        /Chỉ chủ quán hoặc quản lý được sửa danh mục/)
      await assert.rejects(rpc(uid, 'cash_book_save_category', ids.store, cho, 'payment', 'Đổi', null),
        /Chỉ chủ quán hoặc quản lý được sửa danh mục/)
      await assert.rejects(rpc(uid, 'cash_book_set_category_active', cho, false),
        /Chỉ chủ quán hoặc quản lý được sửa danh mục/)
    }
    assert.equal((await one('SELECT name, is_active FROM cash_book_categories WHERE id = $1', [cho])).name, 'Đi chợ')
  })

  test('quyền hàm sổ: anon không EXECUTE, authenticated được, SECURITY DEFINER', async () => {
    for (const fn of ['cash_book_create(text,text,uuid,bigint,text,text,uuid,text)', 'cash_book_void(uuid,text)',
      'cash_book_list(uuid,date,date,jsonb)', 'cash_book_save_category(uuid,uuid,text,text,text)',
      'cash_book_set_category_active(uuid,boolean)']) {
      assert.equal((await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE') AS v`)).v, false, fn)
      assert.equal((await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE') AS v`)).v, true, fn)
      const d = await def(fn)
      assert.match(d, /SECURITY DEFINER/, fn)
      assert.match(d, /SET search_path TO 'public'/, fn)
    }
  })

  test('khoá: cash_book_void khoá phiếu FOR UPDATE và ca FOR SHARE', async () => {
    const d = await def('cash_book_void_internal(uuid,text,uuid)')
    assert.match(d, /FROM public\.cash_book_entries[^;]*FOR UPDATE/)
    assert.match(d, /FROM public\.cash_shifts[^;]*FOR SHARE/)
    assert.ok(d.indexOf('FOR UPDATE') < d.indexOf('FOR SHARE'))
    assert.match(await def('cash_book_void(uuid,text)'), /cash_book_void_internal\(/)
    assert.match(await def('cash_book_create(text,text,uuid,bigint,text,text,uuid,text)'), /cash_book_create_internal_result\(/)
  })
})

// ---------------------------------------------------------------------------
// Task 4: gác ba RPC thu tiền
// ---------------------------------------------------------------------------
const CASH = (amount) => ({ instrument: 'cash', amount })
const BANK = (amount) => ({ instrument: 'bank', amount })
const paymentsOf = () => db.query('SELECT * FROM bill_payments ORDER BY collected_at').then((r) => r.rows)
const orderRow = (id) => one('SELECT * FROM orders WHERE id = $1', [id])
const sessionRow = (id) => one('SELECT * FROM table_sessions WHERE id = $1', [id])

describe('122 gác thu', () => {
  test('công tắc tắt: cả 3 RPC thu như cũ, cash_shift_id NULL (kể cả khi đang có ca mở)', async () => {
    await insertShift()
    const s = await h.session(); await h.order(s, 1000)
    assert.equal((await h.collect([s], [CASH(1000)], null, randomUUID())).already, false)
    const o1 = await h.order(null, 2000, { method: 'cash' })
    assert.equal((await h.confirm(o1)).already, false)
    const o2 = await h.order(null, 3000, { method: 'bank_transfer' })
    assert.equal((await h.kitchenConfirm(o2)).ok, true)
    const rows = await paymentsOf()
    assert.deepEqual(rows.map((r) => [Number(r.total_amount), r.source, r.cash_shift_id]),
      [[1000, 'pos', null], [2000, 'manual_order', null], [3000, 'kitchen', null]])
  })

  test('bật, không ca: collect báo Chưa mở ca; không có dòng bill_payments; phiên vẫn mở; payment_received_at NULL', async () => {
    await setShiftRequired(ids.store, true)
    await insertShift({ status: 'closed' })
    const s = await h.session(); const o = await h.order(s, 1000)
    await assert.rejects(h.collect([s], [CASH(1000)], 1000, randomUUID()), /Chưa mở ca/)
    assert.equal(await count('bill_payments'), 0)
    assert.equal(await count('bill_payment_lines'), 0)
    assert.equal((await sessionRow(s)).status, 'open')
    assert.equal((await orderRow(o)).payment_received_at, null)
    const o1 = await h.order(null, 2000, { method: 'cash' })
    await assert.rejects(h.confirm(o1), /Chưa mở ca/)
    assert.equal((await orderRow(o1)).payment_received_at, null)
    const o2 = await h.order(null, 3000, { method: 'bank_transfer' })
    await assert.rejects(h.kitchenConfirm(o2), /Chưa mở ca/)
    assert.equal((await orderRow(o2)).payment_received_at, null)
    assert.equal(await count('bill_payments'), 0)
  })

  test('bật, có ca: cash_shift_id = ca; kết ca thấy cash_sales đúng phần TM, bank_sales đúng phần CK của bill kết hợp', async () => {
    await setShiftRequired(ids.store, true)
    const { shift_id: shift } = await rpc(ids.cashier, 'open_cash_shift', ids.store, 100000, null)
    const s = await h.session(); await h.order(s, 300000); await h.order(s, 200000)
    await h.collect([s], [CASH(300000), BANK(200000)], 500000, randomUUID())
    const o1 = await h.order(null, 40000, { method: 'cash' })
    await h.confirm(o1)
    const o2 = await h.order(null, 60000, { method: 'bank_transfer' })
    await h.kitchenConfirm(o2)
    const rows = await paymentsOf()
    assert.equal(rows.length, 3)
    assert.ok(rows.every((r) => r.cash_shift_id === shift))
    const r = await rpc(ids.cashier, 'close_cash_shift', shift, 440000, null)
    assert.deepEqual([r.cash_sales, r.expected_cash, r.difference], [340000, 440000, 0])
    const rep = await rpc(ids.owner, 'get_cash_shift_report', shift)
    assert.deepEqual([rep.cash_sales, rep.bank_sales, rep.bills_count], [340000, 260000, 3])
  })

  test('thu chuyển khoản cũng phải có ca', async () => {
    await setShiftRequired(ids.store, true)
    const s = await h.session(); await h.order(s, 5000)
    await assert.rejects(h.collect([s], [BANK(5000)], null, randomUUID()), /Chưa mở ca/)
    const shift = await insertShift()
    await h.collect([s], [BANK(5000)], null, randomUUID())
    assert.equal((await paymentsOf())[0].cash_shift_id, shift)
  })

  test('replay client_request_id sau khi ca đã đóng: trả kết quả cũ, không báo Chưa mở ca', async () => {
    await setShiftRequired(ids.store, true)
    const shift = await insertShift()
    const s = await h.session(); await h.order(s, 7000)
    const req = randomUUID()
    const first = await h.collect([s], [CASH(7000)], null, req)
    await rpc(ids.cashier, 'close_cash_shift', shift, 7000, null)
    const again = await h.collect([s], [CASH(7000)], null, req)
    assert.deepEqual([again.already, again.payment_id], [true, first.payment_id])
    // Máy khác (mã khác) bấm thu đúng nhóm đã thu: nhánh already "đã thu hết" cũng đứng trước cổng ca.
    const other = await h.collect([s], [CASH(7000)], null, randomUUID())
    assert.equal(other.already, true)
    assert.equal(await count('bill_payments'), 1)
  })

  test('confirm_manual_payment đơn đã thu: vẫn already, không báo Chưa mở ca', async () => {
    await setShiftRequired(ids.store, true)
    const o = await h.order(null, 2000, { method: 'cash', paid: true })
    assert.equal((await h.confirm(o)).already, true)
    const k = await h.order(null, 2000, { method: 'bank_transfer', paid: true })
    assert.equal((await h.kitchenConfirm(k)).already, true)
    assert.equal(await count('bill_payments'), 0)
  })

  test('kitchen_confirm_payment không có auth.uid(): gác vẫn chạy', async () => {
    await setShiftRequired(ids.store, true)
    const o = await h.order(null, 3000, { method: 'bank_transfer' })
    await assert.rejects(h.kitchenConfirm(o), /Chưa mở ca/)
    const shift = await insertShift()
    assert.equal((await h.kitchenConfirm(o)).ok, true)
    const [p] = await paymentsOf()
    assert.deepEqual([p.cash_shift_id, p.collected_by, p.source], [shift, null, 'kitchen'])
  })

  test('gộp bill N mâm: một bill_payments, một cash_shift_id', async () => {
    await setShiftRequired(ids.store, true)
    const shift = await insertShift()
    const a = await h.session({ table: ids.t1 }); await h.order(a, 1000)
    const b = await h.session({ table: ids.t2 }); await h.order(b, 2000)
    const c = await h.session({ table: ids.t3 }); await h.order(c, 3000)
    await h.collect([a, b, c], [CASH(6000)], null, randomUUID())
    const rows = await paymentsOf()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].cash_shift_id, shift)
    assert.equal(await count('table_sessions WHERE bill_payment_id = $1', [rows[0].id]), 3)
  })

  test('ca stale vẫn nhận tiền; thu ở ca mới không ăn vào ca cũ đã đóng', async () => {
    await setShiftRequired(ids.store, true)
    const df = await dayFrom()
    const stale = await insertShift({ openedAt: new Date(df.getTime() - 2 * 86400_000) })
    assert.equal((await rpc(ids.cashier, 'get_open_cash_shift', ids.store)).shift.stale, true)
    const s1 = await h.session(); await h.order(s1, 1000)
    await h.collect([s1], [CASH(1000)], null, randomUUID())
    await rpc(ids.cashier, 'close_cash_shift', stale, 1000, null)
    const { shift_id: fresh } = await rpc(ids.cashier, 'open_cash_shift', ids.store, 0, null)
    const s2 = await h.session({ table: ids.t2 }); await h.order(s2, 5000)
    await h.collect([s2], [CASH(5000)], null, randomUUID())
    assert.equal((await totals(stale)).cash_sales, 1000)
    assert.equal((await totals(fresh)).cash_sales, 5000)
    assert.deepEqual((await paymentsOf()).map((p) => p.cash_shift_id), [stale, fresh])
  })

  test('đơn lẻ 0đ không tạo khoản thu nên không bị gác (đúng hợp đồng plan A)', async () => {
    await setShiftRequired(ids.store, true)
    const o = await h.order(null, 0, { method: 'cash' })
    assert.equal((await h.confirm(o)).already, false)
    const k = await h.order(null, 0, { method: 'bank_transfer' })
    assert.equal((await h.kitchenConfirm(k)).ok, true)
    assert.equal(await count('bill_payments'), 0)
    assert.ok((await orderRow(o)).payment_received_at)
  })

  test('neo values của 3 hàm khớp đúng 1 lần trên pg_get_functiondef sau 112a+112b; cổng đứng sau mọi nhánh already', async () => {
    const src112a = (await readFile(new URL('../migrations/112a_collect_table_bill.sql', import.meta.url), 'utf8'))
      .replace(/\r\n/g, '\n')
    const anchors = [
      ['collect_table_bill(uuid[],jsonb,integer,uuid)',
        "    VALUES (v_store, NULL, p_client_request_id, v_sum, p_cash_given, v_change, v_uid, 'pos')",
        "    VALUES (v_store, public.require_open_cash_shift(v_store), p_client_request_id, v_sum, p_cash_given, v_change, v_uid, 'pos')"],
      ['confirm_manual_payment(uuid)',
        "    values (v_order.store_id, NULL, v_order.total_amount, auth.uid(), 'manual_order')",
        "    values (v_order.store_id, public.require_open_cash_shift(v_order.store_id), v_order.total_amount, auth.uid(), 'manual_order')"],
      ['kitchen_confirm_payment(uuid)',
        "    values (v_order.store_id, NULL, v_order.total_amount, NULL, 'kitchen')",
        "    values (v_order.store_id, public.require_open_cash_shift(v_order.store_id), v_order.total_amount, NULL, 'kitchen')"],
    ]
    // Bản 112a + 112b chưa vá (DB riêng, không nạp 122): neo phải khớp đúng 1 lần trên pg_get_functiondef.
    const pre = await openCollectDb({ lock: true })
    try {
      for (const [sig, from, to] of anchors) {
        assert.equal(countOf(src112a, from), 1, `neo ${sig} phải có đúng 1 lần trong 112a`)
        const raw = (await pre.one(`SELECT pg_get_functiondef('public.${sig}'::regprocedure) AS d`)).d
        assert.equal(countOf(raw.replace(/\r\n/g, '\n'), from), 1, `neo ${sig} phải khớp 1 lần sau 112a+112b`)
        const d = await def(sig)
        assert.equal(countOf(d, to), 1, `${sig} đã vá`)
        assert.equal(countOf(d, from), 0, `${sig} còn dòng NULL`)
        // Cổng ca đứng SAU mọi nhánh trả already.
        const gate = d.indexOf('require_open_cash_shift(')
        const lastAlready = d.lastIndexOf("'already', true")
        assert.ok(lastAlready > 0 && gate > lastAlready, `${sig}: cổng ca phải đứng sau nhánh already`)
      }
    } finally {
      await pre.db.close()
    }
  })
})

describe('122 điều kiện trước', () => {
  test('dừng nếu 112b chưa áp (đường thu cũ còn mở)', async () => {
    await assert.rejects(openCashShiftDb({ lock: false }), /mig 122: .*112b/)
  })
})
