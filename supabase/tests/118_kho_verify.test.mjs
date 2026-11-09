import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { as, setupThrough118 } from './helpers/inventory-fixture.mjs'

// Chạy docs/testing/yen-garden/sql/kho-verify.sql trên fixture 118 có dữ liệu thật (nhập, kiểm, huỷ, bán, liên kết theo
// biến thể) để chắc file kiểm tra tay chạy được và bắt được lệch. Không phải test logic kho (đã ở 118_inventory).
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()
const script = await readFile(new URL('../../docs/testing/yen-garden/sql/kho-verify.sql', import.meta.url), 'utf8')

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const owner = id(1), store = id(10), mBia = id(31), mThap = id(33), vTo = id(41)
let seq = 1000
const newId = () => id(seq++)
const one = (sql, params) => as(db, owner, async () => (await db.query(sql, params)).rows[0].r)
const post = (kind, doc, lines) => one('SELECT inventory_post_document($1, $2::jsonb, $3::jsonb, $4) AS r',
  [kind, JSON.stringify({ store_id: store, ...doc }), JSON.stringify(lines), newId()])

async function order(items, extra = {}) {
  const o = newId()
  await db.query(`INSERT INTO orders(id, store_id, status, order_source, payment_method, created_at, updated_at)
    VALUES ($1, $2, $3, 'customer_zalo', 'cash', now(), now())`, [o, store, extra.status ?? 'confirmed'])
  for (const i of items) {
    await db.query(`INSERT INTO order_items(id, order_id, menu_item_id, variant_id, item_name, item_price, quantity, void_type)
      VALUES ($1, $2, $3, $4, 'món', 0, $5, $6)`, [newId(), o, i.menu, i.variant ?? null, i.qty, i.voidType ?? null])
  }
}

/** Chạy file; trả null khi mọi ca PASS, trả thông báo lỗi khi có FAIL (giao dịch được dọn). */
async function runVerify() {
  try {
    await db.exec(script)
    return null
  } catch (e) {
    await db.exec('ROLLBACK')
    return e.message
  }
}

before(async () => {
  await setupThrough118(db)
  await db.exec(`ALTER TABLE stores ADD COLUMN name text, ADD COLUMN created_at timestamptz NOT NULL DEFAULT now()`)
  await db.query(`INSERT INTO stores(id, name) VALUES ($1, 'Yên Garden'), ($2, 'Quán khác')`, [store, id(11)])
  await db.query(`INSERT INTO mevo_operators(user_id, store_id, role) VALUES ($1, $2, 'store_owner')`, [owner, store])
  await db.query(`INSERT INTO menu_items(id, store_id, name) VALUES ($1, $3, 'Bia Hà Nội'), ($2, $3, 'Bia tháp')`, [mBia, mThap, store])
  await db.query(`INSERT INTO menu_item_variants(id, store_id, menu_item_id, name) VALUES ($1, $2, $3, 'Tháp to')`, [vTo, store, mThap])

  const up = (name, kind, unit) => one('SELECT inventory_upsert_item($1, null, $2, $3, $4, null, null) AS r', [store, name, unit, kind])
  const bia = (await up('Bia Hà Nội lon', 'goods', 'lon')).id
  const tiger = (await up('Tiger lon', 'goods', 'lon')).id
  const thit = (await up('Thịt ba chỉ', 'ingredient', 'kg')).id
  const link = (menu, variant, item, qty) => one('SELECT inventory_set_menu_link($1, $2, $3, $4) AS r', [menu, variant, item, qty])
  await link(mBia, null, bia, 1)
  await link(mThap, null, tiger, 3)
  await link(mThap, vTo, tiger, 5)

  await post('count', {}, [{ inventory_item_id: bia, counted_qty: 100, unit_cost: 10000 }, { inventory_item_id: thit, counted_qty: 5, unit_cost: 120000 }])
  await post('receipt', { paid_status: 'paid', paid_method: 'cash' }, [{ inventory_item_id: thit, qty: 1.5, unit_cost: 126000 }, { inventory_item_id: tiger, qty: 48, unit_cost: 12000 }])
  await post('writeoff', { note: 'Vỡ' }, [{ inventory_item_id: bia, qty: 2 }])
  await order([{ menu: mBia, qty: 5 }, { menu: mBia, qty: 3, voidType: 'cancelled' }, { menu: mBia, qty: 1, voidType: 'gift' }])
  await order([{ menu: mThap, variant: vTo, qty: 2 }, { menu: mThap, qty: 1 }])
  await order([{ menu: mBia, qty: 10 }], { status: 'cancelled' })
})

test('kho-verify.sql: dữ liệu đúng → mọi ca PASS, không để lại gì (ROLLBACK)', async () => {
  const docs = (await db.query('SELECT count(*)::int AS n FROM inventory_documents')).rows[0].n
  assert.equal(await runVerify(), null)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM inventory_documents')).rows[0].n, docs)
})

test('kho-verify.sql: tổng tiền phiếu nhập lệch Σ dòng → FAIL receipt_totals', async () => {
  await db.query(`UPDATE inventory_documents SET total_amount = total_amount + 1 WHERE kind = 'receipt'`)
  try {
    const err = await runVerify()
    assert.ok(err?.includes('FAIL receipt_totals'), `mong FAIL receipt_totals, nhận: ${err}`)
  } finally {
    await db.query(`UPDATE inventory_documents SET total_amount = total_amount - 1 WHERE kind = 'receipt'`)
  }
})

test('kho-verify.sql: liên kết trỏ nguyên liệu (lách trigger) → FAIL links_valid', async () => {
  await db.exec('ALTER TABLE menu_stock_links DISABLE TRIGGER inventory_link_guard')
  const thit = (await db.query(`SELECT id FROM inventory_items WHERE name = 'Thịt ba chỉ'`)).rows[0].id
  const tmpMenu = newId()
  await db.query(`INSERT INTO menu_items(id, store_id, name) VALUES ($1, $2, 'Lẩu')`, [tmpMenu, store])
  await db.query(`INSERT INTO menu_stock_links(store_id, menu_item_id, inventory_item_id, qty_per_sale) VALUES ($1, $2, $3, 1)`,
    [store, tmpMenu, thit])
  await db.exec('ALTER TABLE menu_stock_links ENABLE TRIGGER inventory_link_guard')
  try {
    const err = await runVerify()
    assert.ok(err?.includes('FAIL links_valid'), `mong FAIL links_valid, nhận: ${err}`)
  } finally {
    await db.query('DELETE FROM menu_stock_links WHERE menu_item_id = $1', [tmpMenu])
  }
  assert.equal(await runVerify(), null)
})
