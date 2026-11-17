// Mig 143 — công nợ nhà cung cấp (NCC): bảng suppliers / supplier_payments / phân bổ, phiếu nhập gắn NCC,
// trả nợ NCC tự sinh một phiếu chi "Nhập hàng" (nguồn supplier_payment). Spec: docs/superpowers/specs/2026-11-17-cong-no-ncc-design.md.
import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { openDebtDb } from './helpers/debt-db.mjs'

const migration = new URL('../migrations/143_supplier_debt.sql', import.meta.url)
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
await db.exec(await load(migration))

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

