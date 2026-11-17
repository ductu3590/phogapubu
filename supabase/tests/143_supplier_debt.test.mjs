// Mig 143 — công nợ nhà cung cấp (NCC): bảng suppliers / supplier_payments / phân bổ, phiếu nhập gắn NCC,
// trả nợ NCC tự sinh một phiếu chi "Nhập hàng" (nguồn supplier_payment). Spec: docs/superpowers/specs/2026-11-17-cong-no-ncc-design.md.
import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { openDebtDb } from './helpers/debt-db.mjs'

const migrations = ['143_supplier_debt.sql', '144_supplier_inventory_patch.sql'].map((f) => new URL(`../migrations/${f}`, import.meta.url))
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
for (const m of migrations) await db.exec(await load(m))

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

describe('143 backfill', () => {
  test('gộp tên NCC theo hoa thường + khoảng trắng, mỗi quán riêng; phiếu không tên giữ NULL', () => {
    const mine = backfill.suppliers.filter((s) => s.store_id === ids.store)
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
