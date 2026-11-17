// Mig 143 — công nợ nhà cung cấp (NCC): bảng suppliers / supplier_payments / phân bổ, phiếu nhập gắn NCC,
// trả nợ NCC tự sinh một phiếu chi "Nhập hàng" (nguồn supplier_payment). Spec: docs/superpowers/specs/2026-11-17-cong-no-ncc-design.md.
import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { openDebtDb } from './helpers/debt-db.mjs'

const migrations = ['143_supplier_debt.sql', '144_supplier_inventory_patch.sql', '145_supplier_payments.sql', '146_supplier_link_catchup.sql'].map((f) => new URL(`../migrations/${f}`, import.meta.url))
const load = async (u) => (await readFile(u, 'utf8')).replace(/\r\n/g, '\n')

const h = await openDebtDb({ through: '122b' })
const { db, ids, one, count, as } = h
after(async () => db.close())

// ---------------------------------------------------------------------------
// Phiếu nhập cũ (trước 143) cho backfill: chèn thẳng rồi mới nạp mig 143.
// ---------------------------------------------------------------------------
async function legacyDoc({ store = ids.store, supplier, paid = 'unpaid', total = 100000, no, at = '2026-11-10 09:00+07' }) {
  await db.exec('RESET ROLE')
  return (await one(`INSERT INTO inventory_documents(store_id, kind, doc_no, doc_date, effective_at, supplier_name, total_amount,
      paid_status, paid_method, client_request_id, created_by)
    VALUES ($1, 'receipt', $2, ($3::timestamptz)::date, $3::timestamptz, $4, $5, $6, $7, gen_random_uuid(), $8) RETURNING id`,
  [store, no, at, supplier, total, paid, paid === 'paid' ? 'bank' : null, ids.owner])).id
}
const legacy = {
  ha1: await legacyDoc({ supplier: 'Đại lý Hà', no: 'PN-9001', at: '2026-11-08 09:00+07' }),
  ha2: await legacyDoc({ supplier: '  đại lý   hà ', no: 'PN-9002', at: '2026-11-09 09:00+07' }),
  none: await legacyDoc({ supplier: null, no: 'PN-9003' }),
  other: await legacyDoc({ store: ids.otherStore, supplier: 'Đại lý Hà', no: 'PN-9001' }),
}
// Phiếu lưu trong khe giữa lúc áp 143 và 144 (hàm lưu phiếu chưa ghi supplier_id): mig 146 phải nối bù.
let gapDoc = null
for (const m of migrations) {
  await db.exec(await load(m))
  if (m.pathname.endsWith('143_supplier_debt.sql')) {
    gapDoc = await legacyDoc({ supplier: 'Đại lý trong khe', no: 'PN-9100' })
  }
}

const gapLinked = await one(`SELECT d.supplier_id, s.name FROM inventory_documents d LEFT JOIN suppliers s ON s.id = d.supplier_id
  WHERE d.id = $1`, [gapDoc])

const backfill = {
  docs: await db.query('SELECT id, supplier_id, supplier_name FROM inventory_documents').then((r) => r.rows),
  suppliers: await db.query('SELECT id, store_id, name, created_by FROM suppliers').then((r) => r.rows),
}

async function resetAll() {
  await db.exec('RESET ROLE')
  await db.exec('DELETE FROM supplier_payment_allocations; DELETE FROM supplier_payments;')
  await h.reset()
  await db.exec('DELETE FROM suppliers;')
}

const systemCategory = async () =>
  (await one("SELECT id FROM cash_book_categories WHERE store_id = $1 AND is_system AND report_group = 'inventory_purchase'", [ids.store])).id

describe('146 nối bù phiếu lưu giữa 143 và 144', () => {
  test('phiếu có tên NCC mà chưa có supplier_id → tạo NCC + nối', () => {
    assert.notEqual(gapLinked.supplier_id, null)
    assert.equal(gapLinked.name, 'Đại lý trong khe')
  })
})

describe('143 backfill', () => {
  test('gộp tên NCC theo hoa thường + khoảng trắng, mỗi quán riêng; phiếu không tên giữ NULL', () => {
    const mine = backfill.suppliers.filter((s) => s.store_id === ids.store && s.name !== 'Đại lý trong khe')
    const theirs = backfill.suppliers.filter((s) => s.store_id === ids.otherStore)
    assert.equal(mine.length, 1)
    assert.equal(theirs.length, 1)
    // Giữ cách viết của phiếu mới nhất, đã chuẩn hoá khoảng trắng.
    assert.equal(mine[0].name, 'đại lý hà')
    assert.equal(mine[0].created_by, ids.owner)
    const doc = (id) => backfill.docs.find((d) => d.id === id)
    assert.equal(doc(legacy.ha1).supplier_id, mine[0].id)
    assert.equal(doc(legacy.ha2).supplier_id, mine[0].id)
    assert.equal(doc(legacy.other).supplier_id, theirs[0].id)
    assert.equal(doc(legacy.none).supplier_id, null)
    // Bản chụp tên trên phiếu cũ không đổi.
    assert.equal(doc(legacy.ha2).supplier_name, '  đại lý   hà ')
  })
})

describe('143 sổ thu chi nhận nguồn supplier_payment', () => {
  beforeEach(resetAll)

  const create = async (source, sourceRef, kind = 'payment', requestId = randomUUID()) =>
    one(`SELECT cash_book_create_internal($1, $2, 'bank', $3, 100000, 'x', 'NCC', $4, $5, $6, $7) AS id`,
      [ids.store, kind, kind === 'payment' ? await systemCategory() : (await h.category(ids.store, 'Thu khác')), source, sourceRef,
        ids.owner, requestId]).then((r) => r.id)

  test('ghi được phiếu chi nguồn supplier_payment có source_ref', async () => {
    const ref = randomUUID()
    const id = await create('supplier_payment', ref)
    const e = await one('SELECT source, source_ref, kind FROM cash_book_entries WHERE id = $1', [id])
    assert.deepEqual([e.source, e.source_ref, e.kind], ['supplier_payment', ref, 'payment'])
  })

  test('supplier_payment thiếu source_ref hoặc là phiếu thu → lỗi', async () => {
    await assert.rejects(create('supplier_payment', null), /gắn/)
    await assert.rejects(create('supplier_payment', randomUUID(), 'receipt'), /chỉ sinh phiếu chi/)
  })

  test('hai phiếu chi supplier_payment còn hiệu lực cùng source_ref → trùng khoá', async () => {
    const ref = randomUUID()
    await create('supplier_payment', ref)
    await assert.rejects(create('supplier_payment', ref), /duplicate key/)
  })

  test('cash_book_void chặn phiếu chi trả nợ NCC', async () => {
    const id = await create('supplier_payment', randomUUID())
    await assert.rejects(as(ids.owner, 'SELECT cash_book_void($1, $2)', [id, 'nhầm']), /huỷ ở trang Công nợ/)
    assert.equal((await one('SELECT voided_at FROM cash_book_entries WHERE id = $1', [id])).voided_at, null)
  })
})


// ---------------------------------------------------------------------------
// Tiện ích phiếu nhập
// ---------------------------------------------------------------------------
let beer
async function freshItem() {
  await db.exec('RESET ROLE')
  return (await one(`INSERT INTO inventory_items(store_id, name, unit, kind) VALUES ($1, $2, 'thùng', 'goods') RETURNING id`,
    [ids.store, `Bia ${randomUUID().slice(0, 8)}`])).id
}
async function post(doc, lines = [[beer, 10, 50000]], { uid = ids.manager, requestId = randomUUID(), store = ids.store } = {}) {
  return (await as(uid, 'SELECT inventory_post_document($1, $2::jsonb, $3::jsonb, $4) AS r',
    ['receipt', JSON.stringify({ store_id: store, ...doc }),
      JSON.stringify(lines.map(([item, qty, cost]) => ({ inventory_item_id: item, qty, unit_cost: cost }))), requestId])).rows[0].r
}
const unpaid = (supplier_name, lines) => post({ paid_status: 'unpaid', supplier_name }, lines).then((r) => r.id)
const docRow = (id) => one('SELECT * FROM inventory_documents WHERE id = $1', [id])
const docJson = async (id) => (await as(ids.manager, 'SELECT inventory_get_document($1) AS r', [id])).rows[0].r
const voidDoc = (id, reason = 'nhầm') => as(ids.manager, 'SELECT inventory_void_document($1, $2) AS r', [id, reason]).then((r) => r.rows[0].r)
async function insertSupplier({ name = 'Đại lý bia Hà', store = ids.store, active = true } = {}) {
  await db.exec('RESET ROLE')
  return (await one('INSERT INTO suppliers(store_id, name, is_active, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
    [store, name, active, ids.owner])).id
}
// Lần trả chèn thẳng (bỏ qua RPC) để kiểm vá huỷ phiếu nhập độc lập với supplier_pay.
async function insertPayment(supplierId, docId, amount, { voided = false } = {}) {
  await db.exec('RESET ROLE')
  const pid = randomUUID()
  const entry = (await one(`SELECT cash_book_create_internal($1, 'payment', 'bank', $2, $3, 'x', 'NCC', 'supplier_payment', $4, $5, $4) AS id`,
    [ids.store, await systemCategory(), amount, pid, ids.owner])).id
  await db.query(`INSERT INTO supplier_payments(id, store_id, supplier_id, amount, method, business_date, cash_book_entry_id,
      client_request_id, created_by, voided_by, voided_at, void_reason)
    VALUES ($1, $2, $3, $4, 'bank', current_date, $5, gen_random_uuid(), $6, $7, $8, $9)`,
  [pid, ids.store, supplierId, amount, entry, ids.owner, voided ? ids.owner : null, voided ? new Date() : null, voided ? 'x' : null])
  await db.query('INSERT INTO supplier_payment_allocations(supplier_payment_id, inventory_document_id, amount) VALUES ($1, $2, $3)',
    [pid, docId, amount])
  return pid
}

describe('143 phiếu nhập gắn NCC', () => {
  beforeEach(async () => {
    await resetAll()
    beer = await freshItem()
  })

  test('Chưa trả không có NCC → "Phiếu chưa trả cần nhà cung cấp", không lưu gì', async () => {
    await assert.rejects(post({ paid_status: 'unpaid' }), /Phiếu chưa trả cần nhà cung cấp/)
    await assert.rejects(post({ paid_status: 'unpaid', supplier_name: '   ' }), /Phiếu chưa trả cần nhà cung cấp/)
    assert.equal(await count("inventory_documents WHERE kind = 'receipt'"), 0)
  })

  test('Đã trả không NCC vẫn lưu được, supplier_id NULL', async () => {
    const r = await post({ paid_status: 'paid', paid_method: 'bank' })
    assert.equal((await docRow(r.id)).supplier_id, null)
  })

  test('tên khác hoa thường / thừa khoảng trắng → dùng NCC có sẵn, bản chụp = tên chuẩn', async () => {
    const s = await insertSupplier()
    const id = await unpaid('  đại lý   BIA hà ')
    const d = await docRow(id)
    assert.equal(d.supplier_id, s)
    assert.equal(d.supplier_name, 'Đại lý bia Hà')
    assert.equal(await count('suppliers'), 1)
  })

  test('NCC đã ngừng gõ lại tên → dùng lại và bật lại', async () => {
    const s = await insertSupplier({ active: false })
    await unpaid('Đại lý bia Hà')
    assert.equal((await one('SELECT is_active FROM suppliers WHERE id = $1', [s])).is_active, true)
  })

  test('tên mới → tạo NCC, người tạo = người lập phiếu; Đã trả có tên cũng gắn NCC', async () => {
    const id = await unpaid('Chợ Cốc Lếu')
    const s = await one('SELECT * FROM suppliers WHERE id = (SELECT supplier_id FROM inventory_documents WHERE id = $1)', [id])
    assert.deepEqual([s.name, s.created_by, s.store_id], ['Chợ Cốc Lếu', ids.manager, ids.store])
    const paid = await post({ paid_status: 'paid', paid_method: 'bank', supplier_name: 'chợ cốc lếu' })
    assert.equal((await docRow(paid.id)).supplier_id, s.id)
  })

  test('supplier_id gửi lên: đúng quán thì gắn; quán khác / lạ → "Nhà cung cấp không hợp lệ"', async () => {
    const s = await insertSupplier()
    const r = await post({ paid_status: 'unpaid', supplier_id: s })
    assert.equal((await docRow(r.id)).supplier_id, s)
    const foreign = await insertSupplier({ store: ids.otherStore })
    await assert.rejects(post({ paid_status: 'unpaid', supplier_id: foreign }), /Nhà cung cấp không hợp lệ/)
    await assert.rejects(post({ paid_status: 'unpaid', supplier_id: randomUUID() }), /Nhà cung cấp không hợp lệ/)
  })

  test('JSON phiếu: outstanding tính theo phân bổ chưa huỷ; đã trả / thiếu NCC → null', async () => {
    const s = await insertSupplier()
    const id = await unpaid('Đại lý bia Hà') // 10 × 50.000 = 500.000
    let j = await docJson(id)
    assert.deepEqual([j.supplier_id, j.outstanding], [s, 500000])
    await insertPayment(s, id, 200000)
    await insertPayment(s, id, 100000, { voided: true })
    j = await docJson(id)
    assert.equal(j.outstanding, 300000)
    const paid = await post({ paid_status: 'paid', paid_method: 'bank', supplier_name: 'Đại lý bia Hà' })
    assert.equal((await docJson(paid.id)).outstanding, null)
    await db.exec('RESET ROLE')
    await db.query('UPDATE inventory_documents SET supplier_id = NULL WHERE id = $1', [id])
    assert.equal((await docJson(id)).outstanding, null)
  })

  test('huỷ phiếu Chưa trả còn phân bổ chưa huỷ → chặn; chỉ phân bổ đã huỷ → huỷ được', async () => {
    const s = await insertSupplier()
    const a = await unpaid('Đại lý bia Hà')
    await insertPayment(s, a, 100000)
    await assert.rejects(voidDoc(a), /Phiếu đã trả nợ một phần — huỷ lần trả trước/)
    assert.equal((await docRow(a)).status, 'posted')
    const b = await unpaid('Đại lý bia Hà')
    await insertPayment(s, b, 100000, { voided: true })
    assert.equal((await voidDoc(b)).already, false)
    assert.equal((await docRow(b)).status, 'voided')
    // Phiếu chưa trả đồng nào → huỷ bình thường, outstanding thành null.
    const c = await unpaid('Đại lý bia Hà')
    await voidDoc(c)
    assert.equal((await docJson(c)).outstanding, null)
  })
})

// ---------------------------------------------------------------------------
// RPC NCC (mig 145)
// ---------------------------------------------------------------------------
const pay = (supplierId, amount, { method = 'bank', docs = null, note = null, requestId = randomUUID(), uid = ids.manager } = {}) =>
  as(uid, 'SELECT supplier_pay($1::uuid, $2::bigint, $3::text, $4::uuid[], $5::text, $6::uuid) AS r',
    [supplierId, amount, method, docs, note, requestId]).then((r) => r.rows[0].r)
const voidPay = (id, reason = 'trả nhầm', uid = ids.manager) =>
  as(uid, 'SELECT supplier_payment_void($1, $2) AS r', [id, reason]).then((r) => r.rows[0].r)
const detail = (id, uid = ids.manager) => as(uid, 'SELECT supplier_detail($1) AS r', [id]).then((r) => r.rows[0].r)
const list = (uid = ids.manager, store = ids.store) => as(uid, 'SELECT supplier_list($1) AS r', [store]).then((r) => r.rows[0].r)
const outstandingOf = async (docId) => {
  await db.exec('RESET ROLE')
  const n = (await one('SELECT inventory_receipt_outstanding($1) AS n', [docId])).n
  return n === null ? null : Number(n)
}

// Hai phiếu nợ: phiếu A 5.000.000 (đã trả 2.000.000 → còn 3.000.000) và phiếu B 4.200.000, cùng NCC "Đại lý bia Hà".
async function twoDebts() {
  const s = await insertSupplier()
  const a = await unpaid('Đại lý bia Hà', [[beer, 100, 50000]])
  const b = await unpaid('Đại lý bia Hà', [[beer, 84, 50000]])
  await pay(s, 2000000, { docs: [a] })
  return { s, a, b }
}

describe('145 trả nợ NCC', () => {
  beforeEach(async () => {
    await resetAll()
    beer = await freshItem()
  })

  test('chọn 2 phiếu (3tr + 4,2tr), CK 4tr: phân bổ cũ trước, một phiếu chi bank có cả hai số phiếu', async () => {
    const { s, a, b } = await twoDebts()
    const nos = [(await docRow(a)).doc_no, (await docRow(b)).doc_no]
    const r = await pay(s, 4000000, { docs: [b, a], note: 'CK Vietcombank' })
    assert.equal(r.ok, true)
    assert.equal(r.already, false)
    assert.deepEqual(r.allocations.map((x) => [x.document_id, x.amount]), [[a, 3000000], [b, 1000000]])
    assert.equal(r.remaining, 3200000)
    assert.equal(await outstandingOf(a), 0)
    assert.equal(await outstandingOf(b), 3200000)
    const e = await one('SELECT * FROM cash_book_entries WHERE id = $1', [r.cash_book_entry_id])
    assert.deepEqual([e.kind, e.method, Number(e.amount), e.source, e.source_ref, e.counterparty, e.cash_shift_id],
      ['payment', 'bank', 4000000, 'supplier_payment', r.supplier_payment_id, 'Đại lý bia Hà', null])
    assert.equal(e.category_id, await systemCategory())
    assert.equal(e.note, `Trả nợ NCC: ${nos[0]}, ${nos[1]}`)
    const p = await one('SELECT * FROM supplier_payments WHERE id = $1', [r.supplier_payment_id])
    assert.equal(p.note, 'CK Vietcombank')
    assert.deepEqual(p.requested_document_ids, [a, b].sort())
  })

  test('trả một phần: ghi chú chỉ liệt kê phiếu thực nhận tiền', async () => {
    const { s, a, b } = await twoDebts()
    const r = await pay(s, 1000000, { docs: [a, b] })
    assert.deepEqual(r.allocations.map((x) => x.document_id), [a])
    const e = await one('SELECT note FROM cash_book_entries WHERE id = $1', [r.cash_book_entry_id])
    assert.equal(e.note, `Trả nợ NCC: ${(await docRow(a)).doc_no}`)
    assert.equal(await outstandingOf(b), 4200000)
  })

  test('docs NULL = mọi phiếu còn nợ; vượt tổng còn nợ → từ chối, không ghi gì', async () => {
    const { s } = await twoDebts()
    const before = await count('cash_book_entries')
    await assert.rejects(pay(s, 7200001), /Số tiền vượt số còn nợ/)
    assert.equal(await count('cash_book_entries'), before)
    const r = await pay(s, 7200000)
    assert.equal(r.remaining, 0)
  })

  test('phiếu chọn đã hết nợ / đã huỷ / NCC khác / mảng rỗng → từ chối toàn bộ', async () => {
    const { s, a, b } = await twoDebts()
    await pay(s, 3000000, { docs: [a] })
    await assert.rejects(pay(s, 100000, { docs: [a, b] }), /tải lại trang/)
    const other = await insertSupplier({ name: 'Chợ Cốc Lếu' })
    const c = await unpaid('Chợ Cốc Lếu')
    await assert.rejects(pay(s, 100000, { docs: [c] }), /tải lại trang/)
    const d = await unpaid('Đại lý bia Hà')
    await voidDoc(d)
    await assert.rejects(pay(s, 100000, { docs: [d] }), /tải lại trang/)
    await assert.rejects(pay(s, 100000, { docs: [] }), /Chọn ít nhất một phiếu/)
    await assert.rejects(pay(other, 0), /Số tiền/)
  })

  test('NCC không còn nợ → "Nhà cung cấp không còn nợ"', async () => {
    const s = await insertSupplier()
    await assert.rejects(pay(s, 1000), /không còn nợ/)
  })

  test('tiền mặt khi bật ca: không ca → Chưa mở ca, không ghi gì; có ca → gắn ca, két giảm', async () => {
    const { s, b } = await twoDebts()
    await h.setShiftRequired(ids.store, true)
    const before = await count('supplier_payments')
    await assert.rejects(pay(s, 500000, { method: 'cash', docs: [b] }), /Chưa mở ca/)
    assert.equal(await count('supplier_payments'), before)
    assert.equal(await outstandingOf(b), 4200000)
    const shift = await h.insertShift({ openingCash: 1000000 })
    const r = await pay(s, 500000, { method: 'cash', docs: [b] })
    const e = await one('SELECT cash_shift_id FROM cash_book_entries WHERE id = $1', [r.cash_book_entry_id])
    assert.equal(e.cash_shift_id, shift)
    const t = (await one('SELECT cash_shift_totals($1) AS t', [shift])).t
    assert.equal(t.cash_payments, 500000)
  })

  test('gửi lại cùng mã: trả lần cũ kể cả sau khi kết ca; khác nội dung → lỗi', async () => {
    const { s, b } = await twoDebts()
    await h.setShiftRequired(ids.store, true)
    const shift = await h.insertShift({ openingCash: 1000000 })
    const req = randomUUID()
    const first = await pay(s, 500000, { method: 'cash', docs: [b], requestId: req, note: 'lần 1' })
    await h.closeShiftRow(shift)
    const again = await pay(s, 500000, { method: 'cash', docs: [b], requestId: req, note: 'ghi chú khác' })
    assert.equal(again.already, true)
    assert.equal(again.supplier_payment_id, first.supplier_payment_id)
    assert.equal((await one('SELECT note FROM supplier_payments WHERE id = $1', [first.supplier_payment_id])).note, 'lần 1')
    await assert.rejects(pay(s, 600000, { method: 'cash', docs: [b], requestId: req }), /đã dùng cho lần trả khác/)
    await assert.rejects(pay(s, 500000, { method: 'cash', docs: null, requestId: req }), /đã dùng cho lần trả khác/)
    await assert.rejects(pay(s, 500000, { method: 'cash', docs: [b], requestId: req, uid: ids.owner }), /đã dùng cho lần trả khác/)
    assert.equal(await count("cash_book_entries WHERE source = 'supplier_payment'"), 2)
  })

  test('huỷ lần trả: ca mở → khôi phục nợ, huỷ phiếu chi; ca đã kết → từ chối, giữ nguyên', async () => {
    const { s, b } = await twoDebts()
    await h.setShiftRequired(ids.store, true)
    const shift = await h.insertShift({ openingCash: 1000000 })
    const r = await pay(s, 500000, { method: 'cash', docs: [b] })
    assert.deepEqual(await voidPay(r.supplier_payment_id, 'trả nhầm NCC'), { ok: true, already: false })
    assert.equal(await outstandingOf(b), 4200000)
    const e = await one('SELECT voided_at, void_reason FROM cash_book_entries WHERE id = $1', [r.cash_book_entry_id])
    assert.notEqual(e.voided_at, null)
    assert.equal(e.void_reason, 'Huỷ trả nợ NCC: trả nhầm NCC')
    assert.equal((await voidPay(r.supplier_payment_id)).already, true)
    const r2 = await pay(s, 300000, { method: 'cash', docs: [b] })
    await h.closeShiftRow(shift)
    await assert.rejects(voidPay(r2.supplier_payment_id), /Ca của phiếu này đã kết/)
    assert.equal(await outstandingOf(b), 3900000)
    assert.equal((await one('SELECT voided_at FROM supplier_payments WHERE id = $1', [r2.supplier_payment_id])).voided_at, null)
    const r3 = await pay(s, 1000, { docs: [b] })
    await assert.rejects(voidPay(r3.supplier_payment_id, '  '), /lý do/)
  })

  test('ghi chú phiếu chi nhiều phiếu: ≤ 500 ký tự, đuôi "… (+N phiếu)"', async () => {
    const s = await insertSupplier()
    for (let i = 0; i < 60; i += 1) await unpaid('Đại lý bia Hà', [[beer, 1, 1000]])
    const r = await pay(s, 60000)
    assert.equal(r.allocations.length, 60)
    const note = (await one('SELECT note FROM cash_book_entries WHERE id = $1', [r.cash_book_entry_id])).note
    assert.ok(note.length <= 500, `dài ${note.length}`)
    assert.match(note, /^Trả nợ NCC: PN-\d{4}, /)
    assert.match(note, /… \(\+\d+ phiếu\)$/)
    const shown = note.replace(/^Trả nợ NCC: /, '').replace(/,? … \(\+\d+ phiếu\)$/, '').split(', ').length
    const hidden = Number(note.match(/\(\+(\d+) phiếu\)$/)[1])
    assert.equal(shown + hidden, 60)
  })

  test('quyền: thu ngân, chủ quán khác, NCC lạ → Không có quyền', async () => {
    const { s } = await twoDebts()
    await assert.rejects(pay(s, 1000, { uid: ids.cashier }), /Không có quyền/)
    await assert.rejects(pay(s, 1000, { uid: ids.otherOwner }), /Không có quyền/)
    await assert.rejects(pay(randomUUID(), 1000), /Không có quyền/)
    await assert.rejects(detail(s, ids.cashier), /Không có quyền/)
    await assert.rejects(list(ids.cashier), /Không có quyền/)
  })

  test('supplier_list / supplier_detail: số khớp; NCC ngừng vẫn trả được', async () => {
    const { s, a, b } = await twoDebts()
    await as(ids.manager, 'SELECT supplier_set_active($1, false)', [s])
    const row = (await list()).find((x) => x.id === s)
    assert.deepEqual([row.name, row.is_active, row.outstanding, row.open_docs], ['Đại lý bia Hà', false, 7200000, 2])
    assert.equal(typeof row.oldest_open_date, 'string')
    const r = await pay(s, 3000000, { docs: [a] })
    const d = await detail(s)
    assert.equal(d.supplier.outstanding, 4200000)
    assert.deepEqual(d.documents.map((x) => [x.id, x.total_amount, x.paid_amount, x.outstanding]),
      [[a, 5000000, 5000000, 0], [b, 4200000, 0, 4200000]])
    assert.equal(d.payments.length, 2)
    assert.equal(d.payments[0].id, r.supplier_payment_id)
    assert.deepEqual(d.payments[0].allocations.map((x) => [x.document_id, x.amount]), [[a, 3000000]])
    assert.equal(typeof d.payments[0].allocations[0].doc_no, 'string')
    // Phiếu lưu Đã trả không có trong documents.
    await post({ paid_status: 'paid', paid_method: 'bank', supplier_name: 'Đại lý bia Hà' })
    assert.equal((await detail(s)).documents.length, 2)
  })

  test('supplier_upsert: tạo, sửa, trùng tên → lỗi; SĐT chuẩn hoá', async () => {
    const up = (id, name, phone = null, note = null) =>
      as(ids.manager, 'SELECT supplier_upsert($1, $2, $3, $4, $5) AS r', [ids.store, id, name, phone, note]).then((r) => r.rows[0].r)
    const { supplier_id: id } = await up(null, '  Đại lý  Hà ', '+84 912 345 678')
    const s = await one('SELECT name, phone FROM suppliers WHERE id = $1', [id])
    assert.deepEqual([s.name, s.phone], ['Đại lý Hà', '0912345678'])
    await up(id, 'Đại lý Hà Nội', null, 'giao thứ 2')
    assert.equal((await one('SELECT name FROM suppliers WHERE id = $1', [id])).name, 'Đại lý Hà Nội')
    await up(null, 'Chợ')
    await assert.rejects(up(null, 'đại lý hà nội'), /Đã có nhà cung cấp tên này/)
    await assert.rejects(up(null, '   '), /Tên nhà cung cấp/)
    await assert.rejects(as(ids.cashier, 'SELECT supplier_upsert($1, NULL, $2, NULL, NULL)', [ids.store, 'X']), /Không có quyền/)
  })
})
