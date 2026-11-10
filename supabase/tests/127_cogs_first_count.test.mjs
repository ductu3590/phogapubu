import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { as, setupThrough118 } from './helpers/inventory-fixture.mjs'

// Test mig 127: lần kiểm kho ĐẦU TIÊN trong kỳ, phần đếm dư = tồn đầu khai báo (không thành "dùng âm").
// Giờ +07, quán chưa có dòng store_workflow_settings → ngày kinh doanh bắt đầu 00:00.
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const owner = id(1), s = id(10), mBia = id(31)
let seq = 1000
const newId = () => id(seq++)
const k = {}

const one = (uid, sql, params) => as(db, uid, async () => (await db.query(sql, params)).rows[0].r)
const upsert = (name, kind, unit) =>
  one(owner, 'SELECT inventory_upsert_item($1, null, $2, $3, $4, null, null) AS r', [s, name, unit, kind])
const cogs = (from, to) => one(owner, 'SELECT inventory_cogs($1, $2::date, $3::date) AS r', [s, from, to])
const row = (r, itemId) => r.items.find((x) => x.inventory_item_id === itemId)

// Ghi phiếu bằng RPC (giờ thật) rồi dời mốc về `at` — chỉ dựng dữ liệu.
async function postAt(kind, at, doc, lines) {
  const r = await one(owner, 'SELECT inventory_post_document($1, $2::jsonb, $3::jsonb, $4) AS r',
    [kind, JSON.stringify({ store_id: s, ...doc }), JSON.stringify(lines), newId()])
  assert.equal(r.ok, true, JSON.stringify(r))
  await db.query(`UPDATE inventory_documents SET effective_at = $2::timestamptz, doc_date = business_date_of($3, $2::timestamptz)
    WHERE id = $1`, [r.id, at, s])
  return r
}
async function sell(menu, qty, at) {
  const o = newId()
  await db.query(`INSERT INTO orders(id, store_id, status, order_source, payment_method, created_at, updated_at)
    VALUES ($1, $2, 'confirmed', 'customer_zalo', 'cash', $3::timestamptz, now())`, [o, s, at])
  await db.query(`INSERT INTO order_items(id, order_id, menu_item_id, item_name, item_price, quantity)
    VALUES ($1, $2, $3, 'món', 0, $4)`, [newId(), o, menu, qty])
}

before(async () => {
  await setupThrough118(db)
  await db.query('INSERT INTO stores(id) VALUES ($1)', [s])
  await db.query(`INSERT INTO mevo_operators(user_id, store_id, role) VALUES ($1, $2, 'store_owner')`, [owner, s])
  await db.query(`INSERT INTO menu_items(id, store_id, name) VALUES ($1, $2, 'Bia HN')`, [mBia, s])
  k.thit = (await upsert('Thịt ba chỉ', 'ingredient', 'kg')).id
  k.rau = (await upsert('Rau', 'ingredient', 'kg')).id
  k.bia = (await upsert('Bia HN', 'goods', 'lon')).id
  await db.query(`INSERT INTO menu_stock_links(store_id, menu_item_id, inventory_item_id, qty_per_sale, valid_from)
    VALUES ($1, $2, $3, 1, '2026-09-01 00:00+07')`, [s, mBia, k.bia])

  // RAU: nhập trước kỳ, lần kiểm đầu trong kỳ đếm THIẾU (máy 4 → 1).
  await postAt('receipt', '2026-09-30 09:00+07', { paid_status: 'unpaid' }, [{ inventory_item_id: k.rau, qty: 4, unit_cost: 20000 }])
  // 01/10: kiểm đầu khai tồn (THIT 5 kg giá 120.000, BIA 100 lon giá 10.000), rồi nhập, bán, kiểm lại.
  await postAt('count', '2026-10-01 10:00+07', {}, [
    { inventory_item_id: k.thit, counted_qty: 5, unit_cost: 120000 },
    { inventory_item_id: k.bia, counted_qty: 100, unit_cost: 10000 },
    { inventory_item_id: k.rau, counted_qty: 1 }])
  await postAt('receipt', '2026-10-01 10:30+07', { paid_status: 'unpaid' }, [
    { inventory_item_id: k.thit, qty: 1.5, unit_cost: 126000 },
    { inventory_item_id: k.bia, qty: 200, unit_cost: 11500 }])
  await sell(mBia, 50, '2026-10-01 20:00+07')
  await postAt('count', '2026-10-01 23:00+07', {}, [{ inventory_item_id: k.thit, counted_qty: 6.5 }])
  // 02/10: dùng 2,5 kg thịt.
  await postAt('count', '2026-10-02 23:00+07', {}, [{ inventory_item_id: k.thit, counted_qty: 4 }])
})

test('trước mig 127: lần kiểm đầu khai tồn làm giá vốn nguyên liệu ÂM (tái hiện lỗi Bảo Lương)', async () => {
  const r = await cogs('2026-10-01', '2026-10-01')
  assert.equal(row(r, k.thit).qty_used, -5)
  assert.ok(r.ingredient_cogs < 0)
})

test('áp mig 127; chạy lại lần hai thì RAISE "đã được vá rồi"', async () => {
  const sql = await readFile(new URL('../migrations/127_cogs_first_count_opening.sql', import.meta.url), 'utf8')
  await db.exec(sql)
  await assert.rejects(db.exec(sql), /đã được vá rồi/)
})

test('THIT kỳ 01/10: phần dư lần kiểm đầu là tồn đầu → SL dùng 0, giá vốn 0; giá kỳ gồm tồn khai báo', async () => {
  const r = await cogs('2026-10-01', '2026-10-01')
  const t = row(r, k.thit)
  assert.equal(t.qty_used, 0)
  assert.equal(t.cogs, 0)
  // (5 × 120.000 + 1,5 × 126.000) / 6,5 = 121.384,6…
  assert.equal(t.unit_cost, 121385)
  assert.equal(t.counted, true)
  assert.equal(r.ingredient_uncounted, false)
})

test('RAU: lần kiểm đầu đếm THIẾU giữ nguyên là hao hụt → SL dùng 3, giá vốn 60.000; ingredient_cogs 60.000', async () => {
  const r = await cogs('2026-10-01', '2026-10-01')
  const v = row(r, k.rau)
  assert.equal(v.qty_used, 3)
  assert.equal(v.cogs, 60000)
  assert.equal(r.ingredient_cogs, 60000)
})

test('BIA (hàng bán): SL dùng = SL bán; tồn khai báo có giá vào bình quân (100 × 10.000 + 200 × 11.500) / 300 = 11.000', async () => {
  const r = await cogs('2026-10-01', '2026-10-01')
  const b = row(r, k.bia)
  assert.equal(b.qty_used, 50)
  assert.equal(b.unit_cost, 11000)
  assert.equal(b.cogs, 550000)
  assert.equal(r.goods_cogs, 550000)
})

test('kỳ 02/10 (lần kiểm đầu nằm TRƯỚC kỳ): như mig 118 — THIT dùng 2,5 kg theo giá đầu kỳ', async () => {
  const r = await cogs('2026-10-02', '2026-10-02')
  const t = row(r, k.thit)
  assert.equal(t.qty_used, 2.5)
  assert.equal(t.unit_cost, 121385)
  assert.equal(t.cogs, 303462) // round(2,5 × 789.000 / 6,5)
  // RAU còn 1 kg mà không kiểm ngày 02/10 → chưa kiểm, ingredient_cogs 0 cả khối (quy tắc 118 giữ nguyên).
  assert.equal(r.ingredient_uncounted, true)
  assert.equal(r.ingredient_cogs, 0)
})

test('kỳ 01/10–02/10: tổng THIT dùng 2,5 kg, không âm', async () => {
  const r = await cogs('2026-10-01', '2026-10-02')
  const t = row(r, k.thit)
  assert.equal(t.qty_used, 2.5)
  assert.equal(t.cogs, 303462)
  assert.equal(r.ingredient_cogs, 303462 + 60000)
})

test('lần kiểm đầu không ghi giá: vẫn bù SL dùng, giá kỳ chỉ từ phiếu nhập', async () => {
  const ca = (await upsert('Cá', 'ingredient', 'kg')).id
  await postAt('count', '2026-10-05 10:00+07', {}, [{ inventory_item_id: ca, counted_qty: 3 }])
  await postAt('receipt', '2026-10-05 11:00+07', { paid_status: 'unpaid' }, [{ inventory_item_id: ca, qty: 2, unit_cost: 50000 }])
  await postAt('count', '2026-10-05 22:00+07', {}, [{ inventory_item_id: ca, counted_qty: 4 }])
  const c = row(await cogs('2026-10-05', '2026-10-05'), ca)
  assert.equal(c.qty_used, 1) // 0 + 2 + 3 − 4
  assert.equal(c.unit_cost, 50000)
  assert.equal(c.cogs, 50000)
})
