import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { as, setupThrough118 } from './helpers/inventory-fixture.mjs'

// Test mig 118 (kho). Các bài chạy nối tiếp, dùng chung dữ liệu.
// Nhóm A: hàng hoá + liên kết món (Task 1). Cuối nhóm A còn đúng 3 liên kết hiệu lực mBia→BIA ×1,
//   mThap/vTo→TIGER ×5, mThap→TIGER ×3.
// Nhóm B: "bán" + tồn (giờ thật, s1 trả sau, chưa có dòng store_workflow_settings = automatic).
//   BIA đi 93 → 92 → 90 → 90 → 66 qua B1–B5; B7–B12 dùng hàng riêng nên C4 thấy đúng 66.
// Nhóm C: phiếu nhập / kiểm / huỷ.
// Nhóm E (giá vốn) rồi D (thẻ kho): quán s3, ngày kinh doanh bắt đầu 05:00, dữ liệu tháng 9–10/2026 dời mốc tay.
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const owner = id(1), manager = id(2), cashier = id(3), staff = id(4), ownerB = id(5), owner3 = id(6), cashier3 = id(7)
const s1 = id(10), s2 = id(11), s3 = id(12)
const mBia = id(31), mKet = id(32), mThap = id(33), mSting = id(34), mSting2 = id(35), mB2 = id(36), mHei = id(37)
const vTo = id(41), vNho = id(42)
let seq = 1000
const newId = () => id(seq++)

// Hàng hoá tạo trong các bài, bài sau dùng lại.
const it = {}

const one = (uid, sql, params) => as(db, uid, async () => (await db.query(sql, params)).rows[0].r)
const upsert = (uid, { store = s1, itemId = null, name, unit = 'lon', kind = 'goods', sku = null, min = null }) =>
  one(uid, 'SELECT inventory_upsert_item($1, $2, $3, $4, $5, $6, $7) AS r', [store, itemId, name, unit, kind, sku, min])
const setActive = (uid, itemId, active) =>
  one(uid, 'SELECT inventory_set_item_active($1, $2) AS r', [itemId, active])
const setLink = (uid, menu, variant, item, qty) =>
  one(uid, 'SELECT inventory_set_menu_link($1, $2, $3, $4) AS r', [menu, variant, item, qty])
const menuLinks = (uid, store = s1) => one(uid, 'SELECT inventory_menu_links($1) AS r', [store])
const fails = (promise, message) =>
  assert.rejects(promise, (e) => {
    assert.ok(e.message.includes(message), `mong lỗi "${message}", nhận "${e.message}"`)
    return true
  })
const item = async (itemId) => (await db.query('SELECT * FROM inventory_items WHERE id = $1', [itemId])).rows[0]
const linkRows = async (menu) =>
  (await db.query('SELECT * FROM menu_stock_links WHERE menu_item_id = $1 ORDER BY created_at, valid_from, valid_to NULLS LAST', [menu])).rows
const openLinks = (links, menu, variant = null) =>
  links.filter((l) => l.menu_item_id === menu && l.variant_id === variant)

before(async () => {
  await setupThrough118(db)
  await db.query(`INSERT INTO stores(id) VALUES ($1), ($2), ($3)`, [s1, s2, s3])
  await db.query(`INSERT INTO mevo_operators(user_id, store_id, role) VALUES
    ($1, $7, 'store_owner'), ($2, $7, 'store_manager'), ($3, $7, 'store_cashier'), ($4, $7, 'store_staff'),
    ($5, $8, 'store_owner'), ($6, $9, 'store_owner'), ($10, $9, 'store_cashier')`,
  [owner, manager, cashier, staff, ownerB, owner3, s1, s2, s3, cashier3])
  await db.query(`INSERT INTO menu_items(id, store_id, name) VALUES
    ($1, $7, 'Bia Hà Nội'), ($2, $7, 'Két Hà Nội'), ($3, $7, 'Bia tháp'), ($4, $7, 'Sting'), ($5, $7, 'Sting lạnh'),
    ($6, $8, 'Bia quán B')`, [mBia, mKet, mThap, mSting, mSting2, mB2, s1, s2])
  await db.query(`INSERT INTO menu_item_variants(id, store_id, menu_item_id, name) VALUES
    ($1, $3, $4, 'Tháp to'), ($2, $3, $4, 'Tháp nhỏ')`, [vTo, vNho, s1, mThap])
  // Nhóm B, C: món riêng cho bài liên kết theo thời gian; tên người tạo phiếu.
  await db.query(`INSERT INTO menu_items(id, store_id, name) VALUES ($1, $2, 'Heineken')`, [mHei, s1])
  await db.query(`INSERT INTO auth.users(id, email) VALUES ($1, 'owner@mevo.test'), ($2, 'manager@mevo.test')`, [owner, manager])
  await db.query(`UPDATE mevo_operators SET display_name = 'Chị Lan' WHERE user_id = $1`, [manager])
})

test('A1 chủ quán và quản lý tạo hàng; thu ngân, phục vụ, chủ quán khác bị chặn', async () => {
  const r = await upsert(owner, { name: 'Bia Hà Nội lon', unit: 'lon', kind: 'goods' })
  assert.equal(r.ok, true)
  it.bia = r.id
  const r2 = await upsert(manager, { name: 'Thịt ba chỉ', unit: 'kg', kind: 'ingredient', min: '2.5' })
  assert.equal(r2.ok, true)
  it.thit = r2.id
  const row = await item(it.thit)
  assert.equal(row.store_id, s1)
  assert.equal(row.kind, 'ingredient')
  assert.equal(Number(row.min_stock), 2.5)
  assert.equal(row.is_active, true)

  for (const uid of [cashier, staff, ownerB, owner3]) {
    await fails(upsert(uid, { name: 'Bia lạ' }), 'Không có quyền')
    await fails(upsert(uid, { itemId: it.bia, name: 'Đổi tên' }), 'Không có quyền')
    await fails(setActive(uid, it.bia, false), 'Không có quyền')
  }
  assert.equal((await item(it.bia)).name, 'Bia Hà Nội lon')
  assert.equal((await item(it.bia)).is_active, true)
})

test('A2 trùng tên (không phân biệt hoa thường) giữa hàng đang dùng bị chặn; ngừng dùng rồi tạo lại được', async () => {
  // lower() gập cả chữ có dấu ('À' → 'à') ở pglite lẫn prod (datctype en_US.UTF-8, đã kiểm 2026-11-09).
  await fails(upsert(owner, { name: 'BIA HÀ NỘI LON' }), 'Đã có hàng hoá tên này')
  await fails(upsert(owner, { name: 'bia hà nội lon' }), 'Đã có hàng hoá tên này')
  await fails(upsert(manager, { name: '  Bia Hà Nội lon  ' }), 'Đã có hàng hoá tên này')
  // Đổi tên hàng khác trùng vào cũng bị chặn; sửa chính nó giữ nguyên tên thì được.
  await fails(upsert(owner, { itemId: it.thit, name: 'BIA Hà Nội lon', unit: 'kg', kind: 'ingredient' }),
    'Đã có hàng hoá tên này')
  assert.equal((await upsert(owner, { itemId: it.bia, name: 'Bia Hà Nội lon', unit: 'lon' })).id, it.bia)
  // Quán khác được trùng tên.
  assert.equal((await upsert(ownerB, { store: s2, name: 'Bia Hà Nội lon' })).ok, true)

  const cam = (await upsert(owner, { name: 'Nước cam', unit: 'chai' })).id
  await fails(upsert(owner, { name: 'nước CAM', unit: 'chai' }), 'Đã có hàng hoá tên này')
  const off = await setActive(owner, cam, false)
  assert.deepEqual(off, { ok: true, id: cam, is_active: false, links_closed: 0 })
  const cam2 = (await upsert(owner, { name: 'nước CAM', unit: 'chai' })).id
  assert.notEqual(cam2, cam)
  // Bật lại hàng cũ khi đã có hàng đang dùng cùng tên → chặn.
  await fails(setActive(owner, cam, true), 'Đã có hàng hoá tên này')
  assert.equal((await item(cam)).is_active, false)
})

test('A3 dữ liệu sai: tên rỗng, kind lạ, min_stock âm, sửa hàng của quán khác', async () => {
  await fails(upsert(owner, { name: '   ' }), 'Tên hàng hoá không được để trống')
  await fails(upsert(owner, { name: null }), 'Tên hàng hoá không được để trống')
  await fails(upsert(owner, { name: 'x'.repeat(81) }), 'Tên hàng hoá tối đa 80 ký tự')
  await fails(upsert(owner, { name: 'Đá viên', unit: '  ' }), 'Đơn vị tính không được để trống')
  await fails(upsert(owner, { name: 'Đá viên', unit: 'u'.repeat(21) }), 'Đơn vị tính tối đa 20 ký tự')
  await fails(upsert(owner, { name: 'Đá viên', kind: 'other' }), 'Loại hàng hoá không hợp lệ')
  await fails(upsert(owner, { name: 'Đá viên', kind: null }), 'Loại hàng hoá không hợp lệ')
  await fails(upsert(owner, { name: 'Đá viên', sku: 's'.repeat(41) }), 'Mã hàng tối đa 40 ký tự')
  await fails(upsert(owner, { name: 'Đá viên', min: '-1' }), 'Mức tồn tối thiểu không được âm')
  await fails(upsert(owner, { name: 'Đá viên', min: '1000000' }), 'Mức tồn tối thiểu phải nhỏ hơn 1.000.000')
  await fails(upsert(owner, { name: 'Đá viên', min: '1.2345' }), 'Mức tồn tối thiểu tối đa 3 chữ số thập phân')

  // Cắt khoảng trắng; mã hàng rỗng thành null.
  const tiger = await upsert(owner, { name: '  Bia Tiger lon ', unit: ' lon ', sku: '   ', min: '0' })
  it.tiger = tiger.id
  const row = await item(it.tiger)
  assert.equal(row.name, 'Bia Tiger lon')
  assert.equal(row.unit, 'lon')
  assert.equal(row.sku, null)
  assert.equal(Number(row.min_stock), 0)
  await upsert(owner, { itemId: it.tiger, name: 'Bia Tiger lon', unit: 'lon', sku: ' TG-01 ' })
  assert.equal((await item(it.tiger)).sku, 'TG-01')

  // Hàng của quán khác: đúng quán mình nhưng id của quán B → không tìm thấy; quán B sửa hàng quán A cũng vậy.
  it.b2 = (await upsert(ownerB, { store: s2, name: 'Bia riêng quán B' })).id
  await fails(upsert(owner, { store: s1, itemId: it.b2, name: 'Cướp hàng' }), 'Không tìm thấy hàng hoá')
  await fails(upsert(ownerB, { store: s2, itemId: it.bia, name: 'Cướp hàng' }), 'Không tìm thấy hàng hoá')
  await fails(upsert(owner, { itemId: newId(), name: 'Không có' }), 'Không tìm thấy hàng hoá')
  // Hàng không tồn tại và hàng quán khác cùng một lỗi: không lộ id nào có thật.
  await fails(setActive(owner, newId(), false), 'Không có quyền')
  await fails(setActive(owner, it.b2, false), 'Không có quyền')
  assert.equal((await item(it.b2)).name, 'Bia riêng quán B')
  assert.equal((await item(it.bia)).name, 'Bia Hà Nội lon')
})

test('A4 gắn món: món + null ×1; biến thể vTo ×5; mThap null ×3 → inventory_menu_links trả đủ 3 dòng', async () => {
  const a = await setLink(owner, mBia, null, it.bia, 1)
  assert.equal(a.ok, true)
  assert.equal(a.changed, true)
  assert.ok(a.link_id)
  assert.equal((await setLink(manager, mThap, vTo, it.tiger, '5')).changed, true)
  assert.equal((await setLink(owner, mThap, null, it.tiger, 3)).changed, true)

  const r = await menuLinks(manager)
  assert.equal(r.links.length, 3)
  const norm = (l) => ({ ...l, qty_per_sale: Number(l.qty_per_sale) })
  assert.deepEqual(norm(openLinks(r.links, mBia)[0]),
    { menu_item_id: mBia, variant_id: null, inventory_item_id: it.bia, qty_per_sale: 1 })
  assert.deepEqual(norm(openLinks(r.links, mThap, vTo)[0]),
    { menu_item_id: mThap, variant_id: vTo, inventory_item_id: it.tiger, qty_per_sale: 5 })
  assert.deepEqual(norm(openLinks(r.links, mThap)[0]),
    { menu_item_id: mThap, variant_id: null, inventory_item_id: it.tiger, qty_per_sale: 3 })

  // goods: chỉ hàng bán nguyên đang dùng của quán, sắp theo tên (không có Thịt ba chỉ, Nước cam cũ, hàng quán B).
  assert.deepEqual(r.goods.map((g) => g.name), ['Bia Hà Nội lon', 'Bia Tiger lon', 'nước CAM'])
  assert.deepEqual(Object.keys(r.goods[0]).sort(), ['id', 'name', 'unit'])
  assert.equal(r.goods[0].id, it.bia)
  assert.equal(r.goods[0].unit, 'lon')

  // Quán B chỉ thấy của quán B.
  const rb = await menuLinks(ownerB, s2)
  assert.deepEqual(rb.links, [])
  assert.deepEqual(rb.goods.map((g) => g.name), ['Bia Hà Nội lon', 'Bia riêng quán B'])
})

test('A5 đổi SL trừ đóng dòng cũ (valid_to = now) và mở dòng mới; gửi lại y hệt → changed false, không mở dòng', async () => {
  const [first] = await linkRows(mBia)
  const r = await setLink(owner, mBia, null, it.bia, '24')
  assert.equal(r.changed, true)
  assert.notEqual(r.link_id, first.id)

  let rows = await linkRows(mBia)
  assert.equal(rows.length, 2)
  const old = rows.find((l) => l.id === first.id)
  const cur = rows.find((l) => l.id === r.link_id)
  assert.ok(old.valid_to, 'dòng cũ phải bị đóng')
  assert.equal(old.valid_to.getTime(), cur.valid_from.getTime(), 'đóng cũ và mở mới cùng một mốc')
  assert.equal(Number(old.qty_per_sale), 1, 'dòng cũ giữ nguyên SL để tồn quá khứ không đổi')
  assert.equal(cur.valid_to, null)
  assert.equal(Number(cur.qty_per_sale), 24)
  assert.equal(cur.created_by, owner)

  // Gửi lại y hệt (24 và '24.000' là một) → không đổi gì.
  const again = await setLink(manager, mBia, null, it.bia, '24.000')
  assert.deepEqual(again, { ok: true, link_id: r.link_id, changed: false })
  rows = await linkRows(mBia)
  assert.equal(rows.length, 2)

  // Đổi hàng (cùng SL) cũng là đóng/mở.
  const swap = await setLink(owner, mBia, null, it.tiger, 24)
  assert.equal(swap.changed, true)
  // Trả về ×1 BIA để nhóm sau dùng.
  assert.equal((await setLink(owner, mBia, null, it.bia, 1)).changed, true)
  rows = await linkRows(mBia)
  assert.equal(rows.length, 4)
  assert.equal(rows.filter((l) => l.valid_to === null).length, 1)
  assert.equal(Number((await menuLinks(owner)).links.find((l) => l.menu_item_id === mBia).qty_per_sale), 1)
})

test('A6 p_inventory_item_id null = gỡ: dòng hiệu lực bị đóng, inventory_menu_links không còn dòng đó', async () => {
  const r = await setLink(owner, mThap, null, null, null)
  assert.deepEqual(r, { ok: true, link_id: null, changed: true })
  const links = (await menuLinks(owner)).links
  assert.equal(links.length, 2)
  assert.deepEqual(openLinks(links, mThap), [])
  assert.equal(openLinks(links, mThap, vTo).length, 1, 'gỡ món không đụng liên kết biến thể')
  const rows = await linkRows(mThap)
  assert.ok(rows.every((l) => l.variant_id === vTo || l.valid_to !== null))

  // Gỡ lần nữa / gỡ món chưa từng gắn → không có gì đổi.
  assert.deepEqual(await setLink(owner, mThap, null, null, null), { ok: true, link_id: null, changed: false })
  assert.deepEqual(await setLink(owner, mKet, null, null, 5), { ok: true, link_id: null, changed: false })

  // Gắn lại ×3 để nhóm sau dùng.
  assert.equal((await setLink(owner, mThap, null, it.tiger, 3)).changed, true)
  assert.equal((await menuLinks(owner)).links.length, 3)
})

test('A7 gắn vào nguyên liệu, hàng ngừng dùng, hàng quán khác, biến thể không thuộc món, qty 0 → bị chặn', async () => {
  await fails(setLink(owner, mKet, null, it.thit, 1), 'Chỉ gắn được hàng bán nguyên')
  const sg = (await upsert(owner, { name: 'Bia Sài Gòn lon' })).id
  await setActive(owner, sg, false)
  await fails(setLink(owner, mKet, null, sg, 1), 'Hàng hoá đã ngừng dùng')
  await fails(setLink(owner, mKet, null, it.b2, 1), 'Hàng hoá không thuộc quán này')
  await fails(setLink(owner, mKet, null, newId(), 1), 'Không tìm thấy hàng hoá')
  await fails(setLink(owner, mKet, vTo, it.bia, 1), 'Lựa chọn không thuộc món này')
  await fails(setLink(owner, mKet, newId(), it.bia, 1), 'Lựa chọn không thuộc món này')
  await fails(setLink(owner, mKet, null, it.bia, 0), 'Số lượng trừ phải lớn hơn 0')
  await fails(setLink(owner, mKet, null, it.bia, -2), 'Số lượng trừ phải lớn hơn 0')
  await fails(setLink(owner, mKet, null, it.bia, null), 'Số lượng trừ phải lớn hơn 0')
  await fails(setLink(owner, mKet, null, it.bia, '1000000'), 'Số lượng trừ phải nhỏ hơn 1.000.000')
  await fails(setLink(owner, mKet, null, it.bia, '0.0005'), 'Số lượng trừ tối đa 3 chữ số thập phân')
  // Món không tồn tại và món quán khác cùng một lỗi: không lộ id món nào có thật.
  await fails(setLink(owner, newId(), null, it.bia, 1), 'Không có quyền')
  await fails(setLink(owner, mB2, null, null, null), 'Không có quyền')
  // Món quán B gắn hàng quán A (ownerB có quyền trên món) → trigger chặn.
  await fails(setLink(ownerB, mB2, null, it.bia, 1), 'Hàng hoá không thuộc quán này')

  // Trigger là chốt chặn cả khi ghi thẳng (không qua RPC).
  await fails(db.query(`INSERT INTO menu_stock_links(store_id, menu_item_id, inventory_item_id, qty_per_sale)
    VALUES ($1, $2, $3, 1)`, [s1, mKet, it.thit]), 'Chỉ gắn được hàng bán nguyên')
  // Dòng liên kết chỉ được đóng, không sửa nội dung.
  const [cur] = (await linkRows(mBia)).filter((l) => l.valid_to === null)
  await fails(db.query('UPDATE menu_stock_links SET qty_per_sale = 9 WHERE id = $1', [cur.id]),
    'Liên kết kho chỉ được đóng, không sửa')

  assert.equal((await menuLinks(owner)).links.length, 3)
  assert.equal((await linkRows(mKet)).length, 0)
})

test('A8 đổi loại goods → ingredient khi đang gắn món bị chặn', async () => {
  await fails(upsert(owner, { itemId: it.bia, name: 'Bia Hà Nội lon', unit: 'lon', kind: 'ingredient' }),
    'Hàng đang gắn với món — gỡ liên kết trước khi đổi loại')
  assert.equal((await item(it.bia)).kind, 'goods')
  // Sửa thứ khác khi đang gắn thì được.
  await upsert(manager, { itemId: it.bia, name: 'Bia Hà Nội lon', unit: 'lon', kind: 'goods', min: 48 })
  assert.equal(Number((await item(it.bia)).min_stock), 48)
  // Hàng chưa gắn đổi loại qua lại được.
  await upsert(owner, { itemId: it.thit, name: 'Thịt ba chỉ', unit: 'kg', kind: 'goods' })
  assert.equal((await item(it.thit)).kind, 'goods')
  await upsert(owner, { itemId: it.thit, name: 'Thịt ba chỉ', unit: 'kg', kind: 'ingredient' })
  assert.equal((await item(it.thit)).kind, 'ingredient')
})

test('A9 ngừng dùng hàng đang gắn 2 món → links_closed 2, menu_links rỗng', async () => {
  it.sting = (await upsert(owner, { name: 'Sting chai', unit: 'chai' })).id
  await setLink(owner, mSting, null, it.sting, 1)
  await setLink(owner, mSting2, null, it.sting, 1)
  assert.equal((await menuLinks(owner)).links.filter((l) => l.inventory_item_id === it.sting).length, 2)

  const r = await setActive(manager, it.sting, false)
  assert.deepEqual(r, { ok: true, id: it.sting, is_active: false, links_closed: 2 })
  const after = await menuLinks(owner)
  assert.deepEqual(after.links.filter((l) => l.inventory_item_id === it.sting), [])
  assert.equal(after.links.length, 3, 'liên kết hàng khác giữ nguyên')
  assert.ok(!after.goods.some((g) => g.id === it.sting))
  const rows = [...await linkRows(mSting), ...await linkRows(mSting2)]
  assert.equal(rows.length, 2)
  assert.ok(rows.every((l) => l.valid_to !== null), 'dòng cũ vẫn còn (lịch sử), chỉ bị đóng')

  assert.equal((await setActive(owner, it.sting, false)).links_closed, 0)
  // Bật lại không tự gắn lại món.
  assert.deepEqual(await setActive(owner, it.sting, true), { ok: true, id: it.sting, is_active: true, links_closed: 0 })
  assert.equal((await menuLinks(owner)).links.length, 3)
})

test('A10 thu ngân, ownerB không gọi được inventory_set_menu_link / inventory_menu_links của s1', async () => {
  for (const uid of [cashier, staff, ownerB, owner3]) {
    await fails(setLink(uid, mKet, null, it.bia, 1), 'Không có quyền')
    await fails(setLink(uid, mBia, null, null, null), 'Không có quyền')
    await fails(menuLinks(uid, s1), 'Không có quyền')
  }
  await fails(menuLinks(owner, s2), 'Không có quyền')
  await fails(setLink(owner, mB2, null, it.b2, 1), 'Không có quyền')
  assert.equal((await menuLinks(owner)).links.length, 3)
  assert.equal((await linkRows(mKet)).length, 0)
})

test('A11 authenticated không SELECT/INSERT thẳng được 5 bảng kho', async () => {
  const tables = ['inventory_items', 'menu_stock_links', 'inventory_documents', 'inventory_document_lines',
    'inventory_doc_counters']
  for (const t of tables) {
    await fails(as(db, owner, () => db.query(`SELECT * FROM ${t}`)), 'permission denied')
    await db.exec('SET ROLE anon')
    try {
      await fails(db.query(`SELECT * FROM ${t}`), 'permission denied')
    } finally {
      await db.exec('RESET ROLE')
    }
  }
  await fails(as(db, owner, () => db.query(
    `INSERT INTO inventory_items(store_id, name, unit, kind) VALUES ($1, 'Lậu', 'lon', 'goods')`, [s1])),
  'permission denied')
  await fails(as(db, owner, () => db.query('UPDATE inventory_items SET name = $1', ['Hack'])), 'permission denied')

  // RPC: anon không gọi được; hàm trigger không ai ngoài chủ sở hữu gọi được.
  const priv = async (role, fn) =>
    (await db.query('SELECT has_function_privilege($1, $2, \'EXECUTE\') AS ok', [role, fn])).rows[0].ok
  for (const fn of ['inventory_upsert_item(uuid,uuid,text,text,text,text,numeric)',
    'inventory_set_item_active(uuid,boolean)', 'inventory_set_menu_link(uuid,uuid,uuid,numeric)',
    'inventory_menu_links(uuid)']) {
    assert.equal(await priv('anon', fn), false, `anon gọi được ${fn}`)
    assert.equal(await priv('authenticated', fn), true, `authenticated không gọi được ${fn}`)
  }
  assert.equal(await priv('authenticated', 'inventory_link_guard()'), false)
  assert.equal(await priv('anon', 'inventory_link_guard()'), false)
})

// ─── Nhóm B, C: helper ────────────────────────────────────────────────────────
const docs = {}
async function order({ store = s1, status = 'confirmed', source = 'customer_zalo', payMethod = 'cash', confirmedAt = null,
  rejectedAt = null, createdAt = null, items }) {
  const o = newId()
  await db.query(`INSERT INTO orders(id, store_id, status, order_source, payment_method, confirmed_at, rejected_at,
      created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()), now())`,
  [o, store, status, source, payMethod, confirmedAt, rejectedAt, createdAt])
  const itemIds = []
  for (const i of items) {
    const oi = newId()
    itemIds.push(oi)
    await db.query(`INSERT INTO order_items(id, order_id, menu_item_id, variant_id, item_name, item_price, quantity, void_type)
      VALUES ($1, $2, $3, $4, 'món', 0, $5, $6)`, [oi, o, i.menu, i.variant ?? null, i.qty, i.voidType ?? null])
  }
  return { id: o, items: itemIds }
}
const post = (uid, kind, doc, lines, reqId = newId()) =>
  one(uid, 'SELECT inventory_post_document($1, $2::jsonb, $3::jsonb, $4) AS r',
    [kind, JSON.stringify({ store_id: s1, ...doc }), lines === null ? null : JSON.stringify(lines), reqId])
const voidDoc = (uid, docId, reason) => one(uid, 'SELECT inventory_void_document($1, $2) AS r', [docId, reason])
const getDoc = (uid, docId) => one(uid, 'SELECT inventory_get_document($1) AS r', [docId])
const listDocs = (uid, store, kind, from, to) =>
  one(uid, 'SELECT inventory_list_documents($1, $2, $3::date, $4::date) AS r', [store, kind, from, to])
const levels = (uid = owner, store = s1, at = null) => at === null
  ? one(uid, 'SELECT inventory_stock_levels($1) AS r', [store])
  : one(uid, 'SELECT inventory_stock_levels($1, $2::timestamptz) AS r', [store, at])
const ownerOf = (store) => ({ [s1]: owner, [s2]: ownerB, [s3]: owner3 })[store]
const stockOf = async (itemId, store = s1, uid = ownerOf(store), at = null) => {
  const row = (await levels(uid, store, at)).items.find((i) => i.id === itemId)
  assert.ok(row, `không thấy hàng ${itemId} trong tồn kho`)
  return row.qty
}
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].v
const today = (store = s1) => scalar('SELECT current_business_date($1)::text AS v', [store])
const addDays = (date, n) => scalar('SELECT ($1::date + $2::int)::text AS v', [date, n])
const setPolicy = (kitchen, staffPolicy) => db.query(`INSERT INTO store_workflow_settings(store_id, kitchen_release_policy,
    staff_order_release_policy) VALUES ($1, $2, $3)
  ON CONFLICT (store_id) DO UPDATE SET kitchen_release_policy = $2, staff_order_release_policy = $3`, [s1, kitchen, staffPolicy])

// ─── Nhóm B: bán và tồn ──────────────────────────────────────────────────────
test('B1 tồn = nhập − huỷ − bán: nhập 100 BIA, huỷ 2, bán 5 → 93', async () => {
  docs.tStart = await scalar('SELECT now()::text AS v')
  const r = await post(owner, 'receipt', { paid_status: 'unpaid' }, [{ inventory_item_id: it.bia, qty: 100, unit_cost: 10000 }])
  assert.equal(r.ok, true)
  assert.equal(r.doc_no, 'PN-0001')
  assert.equal(r.replayed, false)
  docs.b1Receipt = r.id
  assert.equal((await post(owner, 'writeoff', { note: 'Vỡ 2 lon' }, [{ inventory_item_id: it.bia, qty: 2 }])).doc_no, 'PX-0001')
  assert.equal(await stockOf(it.bia), 98)
  await order({ items: [{ menu: mBia, qty: 5 }] })
  assert.equal(await stockOf(it.bia), 93)
  // Tồn tại một thời điểm trước mọi phiếu = 0.
  assert.equal(await stockOf(it.bia, s1, owner, docs.tStart), 0)
})

test('B2 món bị bỏ (void cancelled) qty 3 không trừ; món tặng qty 1 vẫn trừ → 92', async () => {
  await order({ status: 'paid', items: [{ menu: mBia, qty: 3, voidType: 'cancelled' }, { menu: mBia, qty: 1, voidType: 'gift' }] })
  assert.equal(await stockOf(it.bia), 92)
})

test('B3 sửa số lượng 4 → 2 (UPDATE quantity + dòng order_item_quantity_changes) chỉ trừ 2 → 90', async () => {
  const o = await order({ items: [{ menu: mBia, qty: 4 }] })
  assert.equal(await stockOf(it.bia), 88)
  await db.query('UPDATE order_items SET quantity = 2 WHERE id = $1', [o.items[0]])
  await db.query(`INSERT INTO order_item_quantity_changes(id, store_id, order_id, order_item_id, item_name, old_quantity,
    new_quantity, reason, changed_by, changed_at) VALUES ($1, $2, $3, $4, 'Bia', 4, 2, 'Khách đổi ý', $5, now())`,
  [newId(), s1, o.id, o.items[0], owner])
  assert.equal(await stockOf(it.bia), 90)
})

test('B4 đơn bị từ chối (cancelled + rejected_at) qty 10 và đơn huỷ thường không trừ → 90', async () => {
  await order({ status: 'cancelled', rejectedAt: new Date().toISOString(), items: [{ menu: mBia, qty: 10 }] })
  await order({ status: 'cancelled', items: [{ menu: mBia, qty: 10 }] })
  // Đơn đã duyệt rồi mới huỷ cũng không trừ.
  await order({ status: 'cancelled', confirmedAt: new Date().toISOString(), items: [{ menu: mBia, qty: 10 }] })
  assert.equal(await stockOf(it.bia), 90)
})

test('B5 Két Hà Nội ×24 qty 1 → 66', async () => {
  await setLink(owner, mKet, null, it.bia, 24)
  await order({ items: [{ menu: mKet, qty: 1 }] })
  assert.equal(await stockOf(it.bia), 66)
})

test('B6 biến thể: vTo qty 2 (liên kết riêng ×5) + vNho qty 1 (rơi về món ×3), nhập 48 TIGER → 35', async () => {
  await post(owner, 'receipt', { paid_status: 'unpaid' }, [{ inventory_item_id: it.tiger, qty: 48, unit_cost: 12000 }])
  await order({ items: [{ menu: mThap, variant: vTo, qty: 2 }, { menu: mThap, variant: vNho, qty: 1 }] })
  assert.equal(await stockOf(it.tiger), 35)
})

test('B7 đơn chờ duyệt: automatic + postpay cash trừ; đổi kitchen_release_policy pos_confirmation → không trừ; set confirmed_at → trừ lại', async () => {
  await setLink(owner, mSting, null, it.sting, 1)
  // Chưa có dòng store_workflow_settings = automatic.
  const cust = await order({ status: 'pending', items: [{ menu: mSting, qty: 1 }] })
  await order({ status: 'pending', payMethod: 'zalo_checkout', items: [{ menu: mSting, qty: 10 }] }) // chưa có tiền
  await order({ status: 'pending', source: 'staff', items: [{ menu: mSting, qty: 2 }] })
  assert.equal(await stockOf(it.sting), -3)

  await setPolicy('pos_confirmation', 'automatic')
  assert.equal(await stockOf(it.sting), -2, 'đơn khách chờ duyệt chưa trừ; đơn nhân viên theo chính sách riêng')
  await db.query('UPDATE orders SET confirmed_at = now() WHERE id = $1', [cust.id])
  assert.equal(await stockOf(it.sting), -3)

  await setPolicy('pos_confirmation', 'pos_confirmation')
  assert.equal(await stockOf(it.sting), -1)
  await setPolicy('automatic', 'automatic')
  assert.equal(await stockOf(it.sting), -3)

  // Quán trả trước: đơn tiền mặt chờ không trừ, có tiền thật thì trừ.
  await db.query(`UPDATE stores SET payment_timing = 'prepay' WHERE id = $1`, [s1])
  const pre = await order({ status: 'pending', items: [{ menu: mSting, qty: 4 }] })
  assert.equal(await stockOf(it.sting), -3)
  await db.query('UPDATE orders SET payment_received_at = now() WHERE id = $1', [pre.id])
  assert.equal(await stockOf(it.sting), -7)
  await db.query(`UPDATE stores SET payment_timing = 'postpay' WHERE id = $1`, [s1])
  await db.query('UPDATE orders SET status = $2 WHERE id = $1', [pre.id, 'cancelled'])
  assert.equal(await stockOf(it.sting), -3)
})

test('B8 reservation_preorder pending không trừ; order_source pos pending vẫn trừ', async () => {
  await order({ status: 'pending', source: 'reservation_preorder', items: [{ menu: mSting, qty: 5 }] })
  assert.equal(await stockOf(it.sting), -3)
  await order({ status: 'pending', source: 'pos', items: [{ menu: mSting, qty: 1 }] })
  assert.equal(await stockOf(it.sting), -4)
  await order({ status: 'confirmed', source: 'reservation_preorder', items: [{ menu: mSting, qty: 1 }] })
  assert.equal(await stockOf(it.sting), -5)
})

test('B9 liên kết theo thời gian: đơn tạo trước khi gắn món không trừ; đổi BIA ×1 → ×2 sau đơn cũ, đơn mới qty 1 trừ 2, đơn cũ giữ ×1', async () => {
  // Hàng riêng (Heineken) để không làm lệch BIA của nhóm C; cùng kịch bản với BIA.
  it.hei = (await upsert(owner, { name: 'Heineken lon' })).id
  await order({ createdAt: await scalar(`SELECT (now() - interval '1 minute')::text AS v`), items: [{ menu: mHei, qty: 7 }] })
  const l1 = await setLink(owner, mHei, null, it.hei, 1)
  assert.equal(await stockOf(it.hei), 0, 'gắn món muộn không trừ ngược đơn đã bán')
  await order({ items: [{ menu: mHei, qty: 1 }] })
  assert.equal(await stockOf(it.hei), -1)

  const l2 = await setLink(owner, mHei, null, it.hei, 2)
  assert.notEqual(l2.link_id, l1.link_id)
  // Đơn tạo đúng khoảnh khắc đóng dòng cũ / mở dòng mới: chỉ tính một lần, theo dòng mới.
  const instant = await scalar('SELECT valid_from::text AS v FROM menu_stock_links WHERE id = $1', [l2.link_id])
  assert.equal(await scalar('SELECT valid_to::text AS v FROM menu_stock_links WHERE id = $1', [l1.link_id]), instant)
  await order({ createdAt: instant, items: [{ menu: mHei, qty: 1 }] })
  await order({ items: [{ menu: mHei, qty: 1 }] })
  assert.equal(await stockOf(it.hei), -5, 'đơn cũ ×1, đơn ở khoảnh khắc đổi ×2, đơn mới ×2')

  const lines = (await db.query(`SELECT qty FROM inventory_sales_lines($1, '-infinity', 'infinity')
    WHERE inventory_item_id = $2 ORDER BY sold_at`, [s1, it.hei])).rows.map((r) => Number(r.qty))
  assert.deepEqual(lines, [1, 2, 2])
})

test('B10 inventory_sales_qty khớp tổng inventory_sales_lines; anon và authenticated không EXECUTE được 6 hàm nội bộ', async () => {
  const sum = async (sql) => Object.fromEntries((await db.query(sql, [s1])).rows.map((r) => [r.inventory_item_id, Number(r.qty)]))
  const fromQty = await sum(`SELECT inventory_item_id, qty FROM inventory_sales_qty($1, '-infinity', 'infinity')`)
  const fromLines = await sum(`SELECT inventory_item_id, sum(qty) AS qty FROM inventory_sales_lines($1, '-infinity', 'infinity')
    GROUP BY inventory_item_id`)
  assert.deepEqual(fromQty, fromLines)
  // BIA: 5 + 1 (tặng) + 2 + 24 = 32.
  assert.equal(fromQty[it.bia], 32)
  // Khoảng nửa mở [from, to): to = giờ đơn đầu tiên thì không có gì.
  const first = await scalar(`SELECT min(sold_at)::text AS v FROM inventory_sales_lines($1, '-infinity', 'infinity')`, [s1])
  assert.equal(await scalar(`SELECT count(*)::int AS v FROM inventory_sales_lines($1, '-infinity', $2)`, [s1, first]), 0)

  const priv = async (role, fn) =>
    (await db.query(`SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok`, [role, fn])).rows[0].ok
  for (const fn of ['inventory_sales_lines(uuid,timestamptz,timestamptz)', 'inventory_sales_qty(uuid,timestamptz,timestamptz)',
    'inventory_stock_at(uuid,timestamptz)', 'inventory_next_doc_no(uuid,text)', 'inventory_json_numeric(jsonb)',
    'inventory_document_json(uuid)']) {
    assert.equal(await priv('anon', fn), false, `anon gọi được ${fn}`)
    assert.equal(await priv('authenticated', fn), false, `authenticated gọi được ${fn}`)
  }
  await fails(as(db, owner, () => db.query(`SELECT * FROM inventory_stock_at($1, now())`, [s1])), 'permission denied')
  for (const fn of ['inventory_post_document(text,jsonb,jsonb,uuid)', 'inventory_void_document(uuid,text)',
    'inventory_stock_levels(uuid,timestamptz)', 'inventory_list_documents(uuid,text,date,date)', 'inventory_get_document(uuid)']) {
    assert.equal(await priv('anon', fn), false, `anon gọi được ${fn}`)
    assert.equal(await priv('authenticated', fn), true, `authenticated không gọi được ${fn}`)
  }
})

test('B11 thu ngân xem được inventory_stock_levels; phục vụ và ownerB (s1) bị chặn', async () => {
  const r = await levels(cashier)
  assert.ok(r.at)
  const bia = r.items.find((i) => i.id === it.bia)
  assert.deepEqual(Object.keys(bia).sort(),
    ['id', 'is_active', 'kind', 'last_unit_cost', 'min_stock', 'name', 'qty', 'sku', 'stock_value', 'unit'])
  assert.equal(bia.qty, 66)
  assert.equal(bia.last_unit_cost, 10000)
  assert.equal(bia.stock_value, 660000)
  const tiger = r.items.find((i) => i.id === it.tiger)
  assert.equal(tiger.stock_value, 35 * 12000)
  const thit = r.items.find((i) => i.id === it.thit)
  assert.equal(thit.qty, 0)
  assert.equal(thit.last_unit_cost, null)
  assert.equal(thit.stock_value, 0)
  // Hàng ngừng dùng vẫn có trong danh sách, xếp sau hàng đang dùng.
  const idx = r.items.findIndex((i) => !i.is_active)
  assert.ok(idx > 0 && r.items.slice(idx).every((i) => !i.is_active))
  assert.equal((await levels(manager)).items.length, r.items.length)

  for (const uid of [staff, ownerB, owner3]) await fails(levels(uid), 'Không có quyền')
  await fails(levels(cashier, s2), 'Không có quyền')
})

test('B12 hàng dưới min_stock và tồn âm vẫn trả đúng số (−3), không lỗi', async () => {
  it.coca = (await upsert(owner, { name: 'Coca lon', min: 10 })).id
  await setLink(owner, mSting2, null, it.coca, 1)
  await post(owner, 'receipt', { paid_status: 'unpaid' }, [{ inventory_item_id: it.coca, qty: 2, unit_cost: 8000 }])
  await order({ items: [{ menu: mSting2, qty: 5 }] })
  const row = (await levels(cashier)).items.find((i) => i.id === it.coca)
  assert.equal(row.qty, -3)
  assert.equal(row.min_stock, 10)
  assert.equal(row.last_unit_cost, 8000)
  assert.equal(row.stock_value, 0, 'tồn âm không có giá trị âm')
})

// ─── Nhóm C: phiếu ───────────────────────────────────────────────────────────
test('C1 phiếu nhập: 2,5 kg × 126.000 + 24 lon × 10.500 → total_amount 567.000, line_amount 315.000 và 252.000', async () => {
  const r = await post(owner, 'receipt', { supplier_name: '  Đại lý Hà Nội ', note: ' Nhập sáng ', paid_status: 'unpaid' },
    [{ inventory_item_id: it.thit, qty: 2.5, unit_cost: 126000 }, { inventory_item_id: it.tiger, qty: '24', unit_cost: 10500 }])
  assert.equal(r.before_count_doc_no, null)
  const d = await getDoc(manager, r.id)
  assert.equal(d.total_amount, 567000)
  assert.equal(d.kind, 'receipt')
  assert.equal(d.status, 'posted')
  assert.equal(d.supplier_name, 'Đại lý Hà Nội')
  assert.equal(d.note, 'Nhập sáng')
  assert.equal(d.paid_status, 'unpaid')
  assert.equal(d.paid_method, null)
  assert.equal(d.line_count, 2)
  assert.equal(d.doc_date, await today())
  assert.equal(d.created_by_name, 'owner@mevo.test')
  const byItem = Object.fromEntries(d.lines.map((l) => [l.inventory_item_id, l]))
  assert.deepEqual(byItem[it.thit], { inventory_item_id: it.thit, name: 'Thịt ba chỉ', unit: 'kg', qty: 2.5,
    unit_cost: 126000, counted_qty: null, system_qty: null, line_amount: 315000 })
  assert.equal(byItem[it.tiger].line_amount, 252000)

  // Làm tròn nửa lên: 0,5 × 3 = 1,5 → 2; 1,333 × 10.001 = 13.331,333 → 13.331.
  const r2 = await post(owner, 'receipt', { paid_status: 'unpaid' },
    [{ inventory_item_id: it.thit, qty: 0.5, unit_cost: 3 }, { inventory_item_id: it.tiger, qty: 1.333, unit_cost: 10001 }])
  const d2 = await getDoc(owner, r2.id)
  assert.equal(d2.total_amount, 13333)
  assert.deepEqual(d2.lines.map((l) => l.line_amount).sort((a, b) => a - b), [2, 13331])
})

test('C2 số phiếu: s1 PN-0001, PN-0002, PK-0001, PX-0001; s2 bắt đầu lại PN-0001', async () => {
  // s1 đã dùng PN-0001/PX-0001 ở nhóm B (đã kiểm ở B1); kiểm dãy số đầy đủ trên quán s3 còn trắng.
  const i3 = (await upsert(owner3, { store: s3, name: 'Bia quán 3' })).id
  const p3 = (kind, doc, lines) => post(owner3, kind, { store_id: s3, ...doc }, lines)
  assert.equal((await p3('receipt', { paid_status: 'unpaid' }, [{ inventory_item_id: i3, qty: 10, unit_cost: 1000 }])).doc_no, 'PN-0001')
  assert.equal((await p3('receipt', { paid_status: 'unpaid' }, [{ inventory_item_id: i3, qty: 10, unit_cost: 1000 }])).doc_no, 'PN-0002')
  assert.equal((await p3('count', {}, [{ inventory_item_id: i3, counted_qty: 20 }])).doc_no, 'PK-0001')
  assert.equal((await p3('writeoff', { note: 'Vỡ' }, [{ inventory_item_id: i3, qty: 1 }])).doc_no, 'PX-0001')
  assert.equal((await post(ownerB, 'receipt', { store_id: s2, paid_status: 'unpaid' },
    [{ inventory_item_id: it.b2, qty: 10, unit_cost: 9000 }])).doc_no, 'PN-0001')
  // Quá 9999 thì dài thêm, không cắt số.
  await db.query(`UPDATE inventory_doc_counters SET last_no = 9999 WHERE store_id = $1 AND kind = 'writeoff'`, [s3])
  assert.equal((await p3('writeoff', { note: 'Vỡ' }, [{ inventory_item_id: i3, qty: 1 }])).doc_no, 'PX-10000')
})

test('C3 gửi lại cùng client_request_id → cùng id, replayed true, chỉ 1 phiếu; cùng id nhưng khác kind → lỗi', async () => {
  const req = newId()
  const lines = [{ inventory_item_id: it.tiger, qty: 1, unit_cost: 12000 }]
  const before = await stockOf(it.tiger)
  const a = await post(owner, 'receipt', { paid_status: 'unpaid' }, lines, req)
  const b = await post(manager, 'receipt', { paid_status: 'unpaid' }, lines, req)
  assert.equal(a.replayed, false)
  assert.deepEqual(b, { ok: true, id: a.id, doc_no: a.doc_no, replayed: true, before_count_doc_no: null })
  assert.equal(await scalar('SELECT count(*)::int AS v FROM inventory_documents WHERE client_request_id = $1', [req]), 1)
  assert.equal(await stockOf(it.tiger), before + 1)
  await fails(post(owner, 'writeoff', { note: 'x' }, [{ inventory_item_id: it.tiger, qty: 1 }], req),
    'Mã yêu cầu đã dùng cho phiếu khác')
  // Cùng mã ở quán khác là phiếu khác.
  const c = await post(ownerB, 'receipt', { store_id: s2, paid_status: 'unpaid' },
    [{ inventory_item_id: it.b2, qty: 1, unit_cost: 9000 }], req)
  assert.equal(c.replayed, false)
})

test('C4 phiếu kiểm giờ thật: tồn máy 66, đếm 60 → system_qty 66; tồn sau kiểm 60; bán thêm 1 → 59', async () => {
  assert.equal(await stockOf(it.bia), 66)
  const r = await post(owner, 'count', { note: 'Kiểm cuối ca' }, [{ inventory_item_id: it.bia, counted_qty: 60 }])
  assert.equal(r.doc_no, 'PK-0001')
  docs.c4Count = r.id
  const d = await getDoc(owner, r.id)
  assert.equal(d.lines[0].system_qty, 66)
  assert.equal(d.lines[0].counted_qty, 60)
  assert.equal(d.lines[0].qty, null)
  assert.equal(d.total_amount, 0)
  assert.equal(d.paid_status, null)
  assert.equal(await stockOf(it.bia), 60)
  await order({ items: [{ menu: mBia, qty: 1 }] })
  assert.equal(await stockOf(it.bia), 59)
})

test('C5 huỷ phiếu nhập TRƯỚC phiếu kiểm không đổi tồn sau kiểm (vẫn 59); huỷ phiếu kiểm → tồn quay về công thức không neo', async () => {
  assert.deepEqual(await voidDoc(owner, docs.b1Receipt, 'Nhập nhầm'), { ok: true, id: docs.b1Receipt, already: false })
  assert.equal(await stockOf(it.bia), 59)
  await voidDoc(owner, docs.c4Count, 'Đếm sai')
  // Không neo: nhập 0 (đã huỷ) − huỷ 2 − bán (5 + 1 + 2 + 24 + 1) = −35.
  assert.equal(await stockOf(it.bia), -35)
})

test('C6 huỷ: lý do rỗng bị chặn; huỷ lần hai → already true; người huỷ + giờ + lý do được ghi', async () => {
  const r = await post(owner, 'writeoff', { note: 'Hỏng' }, [{ inventory_item_id: it.tiger, qty: 1 }])
  await fails(voidDoc(owner, r.id, '   '), 'Cần lý do huỷ phiếu')
  await fails(voidDoc(owner, r.id, null), 'Cần lý do huỷ phiếu')
  await fails(voidDoc(owner, newId(), 'x'), 'Không có quyền') // không lộ phiếu có tồn tại
  await fails(getDoc(owner, newId()), 'Không có quyền')
  assert.deepEqual(await voidDoc(manager, r.id, ' Ghi nhầm '), { ok: true, id: r.id, already: false })
  const row = (await db.query('SELECT * FROM inventory_documents WHERE id = $1', [r.id])).rows[0]
  assert.equal(row.status, 'voided')
  assert.equal(row.voided_by, manager)
  assert.ok(row.voided_at)
  assert.equal(row.void_reason, 'Ghi nhầm')
  assert.deepEqual(await voidDoc(owner, r.id, 'Lần hai'), { ok: true, id: r.id, already: true })
  const again = (await db.query('SELECT * FROM inventory_documents WHERE id = $1', [r.id])).rows[0]
  assert.equal(again.void_reason, 'Ghi nhầm')
  assert.equal(again.voided_by, manager)
  const d = await getDoc(owner, r.id)
  assert.equal(d.status, 'voided')
  assert.equal(d.void_reason, 'Ghi nhầm')
})

test('C7 phiếu nhập đã trả: thiếu paid_method → lỗi; unpaid kèm paid_method → lỗi; huỷ phiếu đã trả giữ paid_status, cash_book_entry_id NULL', async () => {
  const lines = [{ inventory_item_id: it.tiger, qty: 1, unit_cost: 12000 }]
  await fails(post(owner, 'receipt', { paid_status: 'paid' }, lines), 'Chọn phương thức trả tiền')
  await fails(post(owner, 'receipt', { paid_status: 'unpaid', paid_method: 'cash' }, lines),
    'Phiếu chưa trả không có phương thức trả')
  await fails(post(owner, 'receipt', { paid_status: 'paid', paid_method: 'momo' }, lines), 'Phương thức trả tiền không hợp lệ')
  await fails(post(owner, 'receipt', {}, lines), 'Chọn đã trả hay chưa trả')
  const r = await post(owner, 'receipt', { paid_status: 'paid', paid_method: 'bank' }, lines)
  await voidDoc(owner, r.id, 'Trả hàng')
  const row = (await db.query('SELECT * FROM inventory_documents WHERE id = $1', [r.id])).rows[0]
  assert.equal(row.paid_status, 'paid')
  assert.equal(row.paid_method, 'bank')
  assert.equal(row.cash_book_entry_id, null)
  assert.equal(row.status, 'voided')
  // Phiếu không phải nhập: trạng thái trả bị bỏ qua.
  const w = await post(owner, 'writeoff', { note: 'Vỡ', paid_status: 'paid', paid_method: 'cash' },
    [{ inventory_item_id: it.tiger, qty: 1 }])
  const wd = await getDoc(owner, w.id)
  assert.equal(wd.paid_status, null)
  assert.equal(wd.paid_method, null)
})

const POST_ANCHOR = '  -- mevo-anchor:122b inventory_post_document.cash_book(v_doc_id)'
const VOID_ANCHOR = '  -- mevo-anchor:122b inventory_void_document.cash_book(v_doc_id)'
const POST_SIG = 'public.inventory_post_document(text,jsonb,jsonb,uuid)'
const VOID_SIG = 'public.inventory_void_document(uuid,text)'
const fnDef = (sig) => scalar('SELECT pg_get_functiondef($1::regprocedure) AS v', [sig])

test('C8 neo 122b: mỗi hàm có đúng 1 dòng neo, không có khối EXCEPTION', async () => {
  for (const [sig, anchor] of [[POST_SIG, POST_ANCHOR], [VOID_SIG, VOID_ANCHOR]]) {
    const def = await fnDef(sig)
    const lines = def.split(/\r?\n/)
    assert.equal(lines.filter((l) => l === anchor).length, 1, `${sig}: neo phải đứng một mình đúng 1 lần`)
    assert.equal(def.split('mevo-anchor:122b').length - 1, 1, `${sig}: không có neo thứ hai`)
    // RAISE EXCEPTION là báo lỗi, không phải khối bắt lỗi; khối bắt lỗi là dòng "EXCEPTION" + "WHEN".
    assert.ok(!/^\s*EXCEPTION\s*$/im.test(def), `${sig}: có khối EXCEPTION`)
    assert.ok(!/EXCEPTION\s+WHEN/i.test(def), `${sig}: có EXCEPTION WHEN`)
  }
  assert.match(await fnDef(POST_SIG), /DECLARE[\s\S]*\bv_doc_id uuid;/)
  assert.match(await fnDef(VOID_SIG), /\bv_doc_id uuid := p_id;/)
})

test('C8b neo đặt đúng chỗ: vá neo thành RAISE như 122b sẽ làm → phiếu mới huỷ cả giao dịch, nhánh gọi lại / đã huỷ không đi qua neo', async () => {
  const postDef = await fnDef(POST_SIG)
  const voidDef = await fnDef(VOID_SIG)
  const patch = (def, anchor) => {
    assert.equal(def.split(anchor).length - 1, 1)
    return def.replace(anchor, "  RAISE EXCEPTION 'neo %', v_doc_id;")
  }
  const lines = [{ inventory_item_id: it.tiger, qty: 1, unit_cost: 12000 }]
  const req = newId()
  const old = await post(owner, 'receipt', { paid_status: 'paid', paid_method: 'cash' }, lines, req)
  const toVoid = await post(owner, 'writeoff', { note: 'Vỡ' }, [{ inventory_item_id: it.tiger, qty: 1 }])
  const voided = await post(owner, 'writeoff', { note: 'Vỡ' }, [{ inventory_item_id: it.tiger, qty: 1 }])
  await voidDoc(owner, voided.id, 'Nhầm')
  const countDocs = () => scalar('SELECT count(*)::int AS v FROM inventory_documents WHERE store_id = $1', [s1])
  const counter = () => scalar(`SELECT last_no AS v FROM inventory_doc_counters WHERE store_id = $1 AND kind = 'receipt'`, [s1])
  const nDocs = await countDocs()
  const nCounter = await counter()

  await db.exec(patch(postDef, POST_ANCHOR))
  await db.exec(patch(voidDef, VOID_ANCHOR))
  try {
    await fails(post(owner, 'receipt', { paid_status: 'unpaid' }, lines), 'neo ')
    await fails(post(owner, 'count', {}, [{ inventory_item_id: it.tiger, counted_qty: 1 }]), 'neo ')
    assert.equal(await countDocs(), nDocs, 'phiếu lỗi ở neo không được để lại')
    assert.equal(await counter(), nCounter, 'số phiếu cũng quay lại')
    assert.equal((await post(owner, 'receipt', { paid_status: 'paid', paid_method: 'cash' }, lines, req)).replayed, true)

    assert.deepEqual(await voidDoc(owner, voided.id, 'Lần nữa'), { ok: true, id: voided.id, already: true })
    await fails(voidDoc(owner, toVoid.id, 'Huỷ'), 'neo ')
    assert.equal(await scalar('SELECT status AS v FROM inventory_documents WHERE id = $1', [toVoid.id]), 'posted')
  } finally {
    await db.exec(postDef)
    await db.exec(voidDef)
  }
  assert.equal(old.replayed, false)
  assert.equal((await voidDoc(owner, toVoid.id, 'Huỷ')).already, false)
})

test('C9 ghi lùi ngày: nhập hôm qua OK (effective_at = cuối ngày KD hôm qua − 1s); 8 ngày trước → lỗi; ngày mai → lỗi; phiếu kiểm khác hôm nay → lỗi', async () => {
  const t = await today()
  const yesterday = await addDays(t, -1)
  const lines = [{ inventory_item_id: it.tiger, qty: 1, unit_cost: 12000 }]
  const r = await post(owner, 'receipt', { doc_date: yesterday, paid_status: 'unpaid' }, lines)
  assert.equal(r.before_count_doc_no, null)
  const row = (await db.query(`SELECT doc_date::text AS d,
      effective_at = (SELECT day_to - interval '1 second' FROM business_day_bounds($2, $3::date)) AS ok
    FROM inventory_documents WHERE id = $1`, [r.id, s1, yesterday])).rows[0]
  assert.equal(row.d, yesterday)
  assert.equal(row.ok, true)

  docs.c9Week = (await post(owner, 'receipt', { doc_date: await addDays(t, -7), paid_status: 'unpaid' }, lines)).id
  await fails(post(owner, 'receipt', { doc_date: await addDays(t, -8), paid_status: 'unpaid' }, lines), 'Chỉ ghi lùi tối đa 7 ngày')
  await fails(post(owner, 'receipt', { doc_date: await addDays(t, 1), paid_status: 'unpaid' }, lines),
    'Không ghi phiếu cho ngày chưa tới')
  assert.ok((await post(owner, 'writeoff', { doc_date: yesterday, note: 'Hỏng hôm qua' }, [{ inventory_item_id: it.tiger, qty: 1 }])).ok)
  await fails(post(owner, 'count', { doc_date: yesterday }, [{ inventory_item_id: it.tiger, counted_qty: 1 }]),
    'Phiếu kiểm kho chỉ ghi cho hôm nay')
  await fails(post(owner, 'count', { doc_date: await addDays(t, 1) }, [{ inventory_item_id: it.tiger, counted_qty: 1 }]),
    'Phiếu kiểm kho chỉ ghi cho hôm nay')

  // Ngày hôm nay (gửi rõ hoặc bỏ trống) → mốc là lúc ghi.
  const now1 = await post(owner, 'receipt', { doc_date: t, paid_status: 'unpaid' }, lines)
  const now2 = await post(owner, 'receipt', { paid_status: 'unpaid' }, lines)
  for (const d of [now1, now2]) {
    const x = (await db.query(`SELECT doc_date::text AS d, now() - effective_at < interval '1 minute' AS recent
      FROM inventory_documents WHERE id = $1`, [d.id])).rows[0]
    assert.equal(x.d, t)
    assert.equal(x.recent, true)
  }
})

test('C10 nhập lùi ngày khi đã có phiếu kiểm sau mốc đó → before_count_doc_no = "PK-0001", tồn hiện tại không đổi', async () => {
  const yesterday = await addDays(await today(s2), -1)
  const c = await post(ownerB, 'count', { store_id: s2 }, [{ inventory_item_id: it.b2, counted_qty: 7 }])
  assert.equal(c.doc_no, 'PK-0001')
  assert.equal(await stockOf(it.b2, s2), 7)
  const r = await post(ownerB, 'receipt', { store_id: s2, doc_date: yesterday, paid_status: 'unpaid' },
    [{ inventory_item_id: it.b2, qty: 5, unit_cost: 9000 }])
  assert.equal(r.before_count_doc_no, 'PK-0001')
  assert.equal(await stockOf(it.b2, s2), 7, 'số đếm là sự thật')
  // Hàng không có trong phiếu kiểm → không báo.
  const nuoc = (await upsert(ownerB, { store: s2, name: 'Nước B' })).id
  const w = await post(ownerB, 'receipt', { store_id: s2, doc_date: yesterday, paid_status: 'unpaid' },
    [{ inventory_item_id: nuoc, qty: 5, unit_cost: 1000 }])
  assert.equal(w.before_count_doc_no, null)
  // Phiếu hôm nay (sau phiếu kiểm) cộng bình thường.
  const n = await post(ownerB, 'receipt', { store_id: s2, paid_status: 'unpaid' }, [{ inventory_item_id: it.b2, qty: 5, unit_cost: 9000 }])
  assert.equal(n.before_count_doc_no, null)
  assert.equal(await stockOf(it.b2, s2), 12)
})

test('C11 dòng sai: rỗng, trùng hàng, qty 0, qty 1.2345, đơn giá âm, phiếu huỷ thiếu ghi chú, hàng ngừng dùng, hàng quán khác → lỗi', async () => {
  const n0 = await scalar('SELECT count(*)::int AS v FROM inventory_documents')
  const rc = (lines, doc = {}) => post(owner, 'receipt', { paid_status: 'unpaid', ...doc }, lines)
  const ok = { inventory_item_id: it.tiger, qty: 1, unit_cost: 1000 }
  await fails(rc([]), 'Phiếu cần ít nhất một dòng')
  await fails(rc(null), 'Phiếu cần ít nhất một dòng')
  await fails(rc([ok, { ...ok, qty: 2 }]), 'Một hàng chỉ một dòng trong phiếu')
  const qtyMsg = 'Số lượng phải lớn hơn 0 và tối đa 3 chữ số thập phân'
  await fails(rc([{ ...ok, qty: 0 }]), qtyMsg)
  await fails(rc([{ ...ok, qty: -1 }]), qtyMsg)
  await fails(rc([{ ...ok, qty: 1.2345 }]), qtyMsg)
  await fails(rc([{ ...ok, qty: 'abc' }]), qtyMsg)
  await fails(rc([{ ...ok, qty: null }]), qtyMsg)
  await fails(rc([{ ...ok, qty: 1000000 }]), 'Số lượng phải nhỏ hơn 1.000.000')
  await fails(rc([{ ...ok, unit_cost: -1 }]), 'Đơn giá không hợp lệ')
  await fails(rc([{ ...ok, unit_cost: 100000001 }]), 'Đơn giá không hợp lệ')
  await fails(rc([{ ...ok, unit_cost: 10.5 }]), 'Đơn giá không hợp lệ')
  await fails(rc([{ inventory_item_id: it.tiger, qty: 1 }]), 'Đơn giá không hợp lệ')
  await fails(post(owner, 'writeoff', {}, [{ inventory_item_id: it.tiger, qty: 1 }]), 'Phiếu xuất huỷ cần lý do')
  await fails(post(owner, 'writeoff', { note: '   ' }, [{ inventory_item_id: it.tiger, qty: 1 }]), 'Phiếu xuất huỷ cần lý do')
  const itemMsg = 'Hàng hoá không thuộc quán hoặc đã ngừng dùng'
  const off = (await db.query(`SELECT id FROM inventory_items WHERE store_id = $1 AND NOT is_active LIMIT 1`, [s1])).rows[0].id
  await fails(rc([{ ...ok, inventory_item_id: off }]), itemMsg)
  await fails(rc([{ ...ok, inventory_item_id: it.b2 }]), itemMsg)
  await fails(rc([{ ...ok, inventory_item_id: newId() }]), itemMsg)
  await fails(rc([{ qty: 1, unit_cost: 1 }]), itemMsg)
  await fails(post(owner, 'count', {}, [{ inventory_item_id: it.tiger, counted_qty: -1 }]),
    'Số lượng đếm phải từ 0 và tối đa 3 chữ số thập phân')
  await fails(post(owner, 'count', {}, [{ inventory_item_id: it.tiger, counted_qty: 1, unit_cost: -5 }]), 'Đơn giá không hợp lệ')
  await fails(post(owner, 'transfer', {}, [ok]), 'Loại phiếu không hợp lệ')
  await fails(rc([ok], { note: 'x'.repeat(501) }), 'Ghi chú tối đa 500 ký tự')
  assert.equal(await scalar('SELECT count(*)::int AS v FROM inventory_documents'), n0)
})

test('C12 quyền: thu ngân, phục vụ không post/void; ownerB không post vào s1 (store_id trong p_doc), không void/get phiếu s1; quản lý post được', async () => {
  const w = { note: 'Vỡ' }
  const line = [{ inventory_item_id: it.tiger, qty: 1 }]
  const target = await post(owner, 'writeoff', w, line)
  const t = await today()
  for (const uid of [cashier, staff, ownerB, owner3]) {
    await fails(post(uid, 'writeoff', w, line), 'Không có quyền')
    await fails(voidDoc(uid, target.id, 'x'), 'Không có quyền')
    await fails(getDoc(uid, target.id), 'Không có quyền')
    await fails(listDocs(uid, s1, null, t, t), 'Không có quyền')
  }
  await fails(post(owner, 'writeoff', { ...w, store_id: null }, line), 'Không có quyền')
  assert.equal(await scalar('SELECT status AS v FROM inventory_documents WHERE id = $1', [target.id]), 'posted')
  const m = await post(manager, 'writeoff', w, line)
  assert.equal(m.ok, true)
  assert.equal((await getDoc(manager, m.id)).created_by_name, 'Chị Lan')
})

test('C13 list_documents: lọc kind + ngày, khoảng > 93 ngày lỗi, suppliers không trùng, created_by_name ưu tiên display_name', async () => {
  const t = await today()
  const line = [{ inventory_item_id: it.tiger, qty: 1, unit_cost: 12000 }]
  await post(manager, 'receipt', { supplier_name: 'Chợ Cốc Lếu', paid_status: 'unpaid' }, line)
  const gone = await post(owner, 'receipt', { supplier_name: 'NCC đã huỷ', paid_status: 'unpaid' }, line)
  await voidDoc(owner, gone.id, 'Nhầm')
  await post(owner, 'receipt', { supplier_name: ' đại lý hà nội ', paid_status: 'unpaid' }, line)

  const r = await listDocs(owner, s1, 'receipt', t, t)
  assert.ok(r.documents.length > 0)
  assert.ok(r.documents.every((d) => d.kind === 'receipt' && d.doc_date === t))
  assert.deepEqual(Object.keys(r.documents[0]).sort(), ['created_at', 'created_by_name', 'doc_date', 'doc_no', 'effective_at',
    'id', 'kind', 'line_count', 'note', 'paid_method', 'paid_status', 'status', 'supplier_name', 'total_amount',
    'void_reason', 'voided_at'])
  // Mới nhất trước.
  const times = r.documents.map((d) => Date.parse(d.effective_at))
  assert.deepEqual(times, [...times].sort((a, b) => b - a))
  assert.equal(r.documents[0].supplier_name, 'đại lý hà nội')
  assert.equal(r.documents.find((d) => d.supplier_name === 'Chợ Cốc Lếu').created_by_name, 'Chị Lan')
  assert.equal(r.documents[0].created_by_name, 'owner@mevo.test')
  assert.equal(r.documents.find((d) => d.id === gone.id).status, 'voided')
  assert.ok(!r.documents.some((d) => d.id === docs.c9Week), 'phiếu 7 ngày trước nằm ngoài khoảng')

  const all = await listDocs(owner, s1, null, await addDays(t, -7), t)
  assert.ok(all.documents.some((d) => d.id === docs.c9Week))
  assert.deepEqual([...new Set(all.documents.map((d) => d.kind))].sort(), ['count', 'receipt', 'writeoff'])
  assert.ok(all.documents.every((d) => d.line_count >= 1))

  // Tên nhà cung cấp: phiếu nhập còn hiệu lực, không trùng (không phân biệt hoa thường), mới nhất trước.
  assert.deepEqual(r.suppliers, ['đại lý hà nội', 'Chợ Cốc Lếu'])
  assert.deepEqual((await listDocs(ownerB, s2, 'receipt', t, t)).suppliers, [])

  assert.ok((await listDocs(owner, s1, 'count', await addDays(t, -92), t)).documents)
  await fails(listDocs(owner, s1, null, await addDays(t, -93), t), 'Chỉ xem tối đa 93 ngày')
  await fails(listDocs(owner, s1, null, t, await addDays(t, -1)), 'Khoảng ngày không hợp lệ')
  await fails(listDocs(owner, s1, 'abc', t, t), 'Loại phiếu không hợp lệ')
})

// ─── Nhóm E, D: giá vốn và thẻ kho (quán s3) ─────────────────────────────────
const k = {} // hàng + món của s3
const m3 = { bia: id(51), coca: id(52), suoi: id(53) }
const cogs = (uid, from, to, store = s3) =>
  one(uid, 'SELECT inventory_cogs($1, $2::date, $3::date) AS r', [store, from, to])
const ledger = (uid, itemId, from, to) =>
  one(uid, 'SELECT inventory_item_ledger($1, $2::date, $3::date) AS r', [itemId, from, to])
const row = (r, itemId) => r.items.find((x) => x.inventory_item_id === itemId)
// Ghi phiếu bằng RPC (giờ thật, ngày hôm nay) rồi dời mốc về `at` — chỉ là dựng dữ liệu; RPC đọc tự tính từ effective_at.
async function postAt(kind, at, doc, lines) {
  const r = await post(owner3, kind, { store_id: s3, ...doc }, lines)
  await db.query(`UPDATE inventory_documents SET effective_at = $2::timestamptz, doc_date = business_date_of($3, $2::timestamptz)
    WHERE id = $1`, [r.id, at, s3])
  return r
}
const sell = (menu, qty, at) => order({ store: s3, createdAt: at, items: [{ menu, qty }] })

test('E0 dựng dữ liệu quán s3 (ngày kinh doanh 05:00)', async () => {
  await db.query(`INSERT INTO store_workflow_settings(store_id, business_day_start) VALUES ($1, '05:00')
    ON CONFLICT (store_id) DO UPDATE SET business_day_start = '05:00'`, [s3])
  const mk = async (name, kind, unit) => (await upsert(owner3, { store: s3, name, kind, unit })).id
  k.bia = await mk('Bia HN', 'goods', 'lon')
  k.thit = await mk('Thịt ba chỉ', 'ingredient', 'kg')
  k.coca = await mk('Coca', 'goods', 'lon')
  k.suoi = await mk('Nước suối', 'goods', 'chai')
  k.rau = await mk('Rau', 'ingredient', 'kg')
  await db.query(`INSERT INTO menu_items(id, store_id, name) VALUES ($1, $4, 'Bia HN'), ($2, $4, 'Coca'), ($3, $4, 'Suối')`,
    [m3.bia, m3.coca, m3.suoi, s3])
  // Liên kết có hiệu lực từ trước dữ liệu bán (chèn thẳng: RPC luôn mở liên kết từ now()).
  for (const [menu, item] of [[m3.bia, k.bia], [m3.coca, k.coca], [m3.suoi, k.suoi]]) {
    await db.query(`INSERT INTO menu_stock_links(store_id, menu_item_id, inventory_item_id, qty_per_sale, valid_from)
      VALUES ($1, $2, $3, 1, '2026-09-01 00:00+07')`, [s3, menu, item])
  }

  await postAt('count', '2026-09-30 10:00+07', {}, [
    { inventory_item_id: k.bia, counted_qty: 100, unit_cost: 10000 },
    { inventory_item_id: k.thit, counted_qty: 5, unit_cost: 120000 }])
  k.cocaReceipt = (await postAt('receipt', '2026-09-30 11:00+07', { paid_status: 'unpaid' },
    [{ inventory_item_id: k.coca, qty: 24, unit_cost: 8000 }])).id
  await sell(m3.coca, 24, '2026-09-30 20:00+07')
  await postAt('receipt', '2026-10-01 10:00+07', { paid_status: 'unpaid' }, [
    { inventory_item_id: k.bia, qty: 200, unit_cost: 11500 },
    { inventory_item_id: k.thit, qty: 10, unit_cost: 126000 }])
  await sell(m3.coca, 3, '2026-10-01 20:00+07')
  await sell(m3.suoi, 5, '2026-10-01 20:00+07')
  await sell(m3.bia, 119, '2026-10-01 21:00+07')
  await postAt('writeoff', '2026-10-01 22:00+07', { note: 'Vỡ, ôi' }, [
    { inventory_item_id: k.bia, qty: 2 }, { inventory_item_id: k.thit, qty: 1 }])
  await postAt('count', '2026-10-01 23:00+07', {}, [{ inventory_item_id: k.thit, counted_qty: 3 }])
  await sell(m3.bia, 1, '2026-10-02 02:00+07')
  await sell(m3.bia, 1, '2026-10-02 05:00+07')
  await postAt('receipt', '2026-10-02 06:00+07', { paid_status: 'unpaid' }, [{ inventory_item_id: k.rau, qty: 4, unit_cost: 20000 }])
  await postAt('count', '2026-10-02 23:00+07', {}, [{ inventory_item_id: k.rau, counted_qty: 1 }])
  assert.equal(await scalar(`SELECT business_date_of($1, '2026-10-02 02:00+07')::text AS v`, [s3]), '2026-10-01')
})

test('E1 giá vốn 01/10: BIA qty_used 120, unit_cost 11.000, cogs 1.320.000', async () => {
  const r = await cogs(owner3, '2026-10-01', '2026-10-01')
  assert.equal(r.from, '2026-10-01')
  assert.equal(r.to, '2026-10-01')
  assert.deepEqual(row(r, k.bia), { inventory_item_id: k.bia, name: 'Bia HN', unit: 'lon', kind: 'goods', qty_used: 120,
    unit_cost: 11000, cogs: 1320000, missing_cost: false, writeoff_qty: 2, writeoff_cost: 22000, counted: false })
})

test('E2 COCA mẫu số 0 → giá nhập gần nhất: qty_used 3, unit_cost 8.000, cogs 24.000', async () => {
  const c = row(await cogs(owner3, '2026-10-01', '2026-10-01'), k.coca)
  assert.equal(c.qty_used, 3)
  assert.equal(c.unit_cost, 8000)
  assert.equal(c.cogs, 24000)
  assert.equal(c.missing_cost, false)
})

test('E3 SUOI chưa có giá: qty_used 5, cogs 0, missing_cost true; missing_cost_items 1; goods_cogs 1.344.000', async () => {
  const r = await cogs(owner3, '2026-10-01', '2026-10-01')
  const s = row(r, k.suoi)
  assert.equal(s.qty_used, 5)
  assert.equal(s.unit_cost, 0)
  assert.equal(s.cogs, 0)
  assert.equal(s.missing_cost, true)
  assert.equal(r.missing_cost_items, 1)
  assert.equal(r.goods_cogs, 1344000)
  // Hàng không biến động trong kỳ (RAU 01/10, hàng cũ "Bia quán 3") không có dòng.
  assert.equal(row(r, k.rau), undefined)
  assert.deepEqual(r.items.map((x) => x.kind), ['goods', 'goods', 'goods', 'ingredient'], 'hàng bán trước, nguyên liệu sau')
})

test('E4 THIT nguyên liệu: qty_used 11, unit_cost 124.000, cogs 1.364.000, counted true; ingredient_cogs 1.364.000; ingredient_uncounted false', async () => {
  const r = await cogs(owner3, '2026-10-01', '2026-10-01')
  assert.deepEqual(row(r, k.thit), { inventory_item_id: k.thit, name: 'Thịt ba chỉ', unit: 'kg', kind: 'ingredient',
    qty_used: 11, unit_cost: 124000, cogs: 1364000, missing_cost: false, writeoff_qty: 1, writeoff_cost: 124000, counted: true })
  assert.equal(r.ingredient_cogs, 1364000)
  assert.equal(r.ingredient_uncounted, false)
})

test('E5 writeoff_cost 146.000 (BIA 2 × 11.000 + THIT 1 × 124.000)', async () => {
  const r = await cogs(owner3, '2026-10-01', '2026-10-01')
  assert.equal(r.writeoff_cost, 146000)
  assert.deepEqual(Object.keys(r).sort(), ['from', 'goods_cogs', 'ingredient_cogs', 'ingredient_uncounted', 'items',
    'missing_cost_items', 'to', 'writeoff_cost'])
})

test('E6 kỳ 02/10: BIA qty_used 1 (bán 05:00), unit_cost 11.000 (tồn đầu 178, giá đầu kỳ bình quân 11.000), goods_cogs 11.000', async () => {
  const r = await cogs(owner3, '2026-10-02', '2026-10-02')
  const b = row(r, k.bia)
  assert.equal(b.qty_used, 1)
  assert.equal(b.unit_cost, 11000)
  assert.equal(b.cogs, 11000)
  assert.equal(r.goods_cogs, 11000)
  // COCA tồn đầu âm (−3), không bán: vẫn có dòng (tồn đầu ≠ 0), giá vốn 0, không thiếu giá.
  const c = row(r, k.coca)
  assert.equal(c.qty_used, 0)
  assert.equal(c.cogs, 0)
  assert.equal(c.missing_cost, false)
  assert.equal(r.missing_cost_items, 0, 'SUOI không bán trong kỳ thì không tính thiếu giá')
})

test('E6b kỳ 02/10 có nguyên liệu chưa kiểm: ingredient_uncounted true, ingredient_cogs 0 (không cộng dở); THIT vẫn có dòng với counted false, qty_used null, cogs 0; RAU counted true, qty_used 3, cogs 60.000 hiện ở dòng nhưng không vào ingredient_cogs', async () => {
  const r = await cogs(owner3, '2026-10-02', '2026-10-02')
  assert.equal(r.ingredient_uncounted, true)
  assert.equal(r.ingredient_cogs, 0)
  const t = row(r, k.thit)
  assert.equal(t.counted, false)
  assert.equal(t.qty_used, null)
  assert.equal(t.cogs, 0)
  assert.equal(t.missing_cost, false)
  const rau = row(r, k.rau)
  assert.equal(rau.counted, true)
  assert.equal(rau.qty_used, 3)
  assert.equal(rau.unit_cost, 20000)
  assert.equal(rau.cogs, 60000)
})

test('E6c kỳ 01/10–02/10 (THIT có kiểm 01/10 23:00, RAU có kiểm 02/10): ingredient_uncounted false, ingredient_cogs 1.424.000 (THIT 11 × 124.000 = 1.364.000 + RAU 3 × 20.000 = 60.000)', async () => {
  const r = await cogs(owner3, '2026-10-01', '2026-10-02')
  assert.equal(r.ingredient_uncounted, false)
  assert.equal(r.ingredient_cogs, 1424000)
  assert.equal(row(r, k.thit).qty_used, 11)
  assert.equal(row(r, k.rau).qty_used, 3)
  // Hàng bán: BIA 121 × 11.000 + COCA 3 × 8.000.
  assert.equal(r.goods_cogs, 121 * 11000 + 24000)
})

test('E7 phiếu huỷ (voided) không vào giá vốn: huỷ phiếu nhập COCA → E2 thành missing_cost', async () => {
  await voidDoc(owner3, k.cocaReceipt, 'Nhập nhầm')
  const r = await cogs(owner3, '2026-10-01', '2026-10-01')
  const c = row(r, k.coca)
  assert.equal(c.qty_used, 3)
  assert.equal(c.unit_cost, 0)
  assert.equal(c.cogs, 0)
  assert.equal(c.missing_cost, true)
  assert.equal(r.missing_cost_items, 2)
  assert.equal(r.goods_cogs, 1320000)
})

test('E8 quyền: thu ngân s3 và owner (s1) gọi inventory_cogs(s3) bị chặn; khoảng > 366 ngày, from > to → lỗi', async () => {
  for (const uid of [cashier3, owner, ownerB, staff]) await fails(cogs(uid, '2026-10-01', '2026-10-01'), 'Không có quyền')
  await fails(cogs(owner3, '2026-10-01', '2026-10-01', null), 'Không có quyền')
  await fails(cogs(owner3, '2026-10-02', '2026-10-01'), 'Khoảng ngày không hợp lệ')
  await fails(cogs(owner3, '2025-10-01', '2026-10-02'), 'Chỉ xem tối đa 366 ngày')
  assert.ok((await cogs(owner3, '2025-10-01', '2026-10-01')).items, '366 ngày tính cả hai đầu vẫn được')
  const priv = async (role, fn) =>
    (await db.query(`SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok`, [role, fn])).rows[0].ok
  for (const fn of ['inventory_cogs(uuid,date,date)', 'inventory_item_ledger(uuid,date,date)']) {
    assert.equal(await priv('anon', fn), false)
    assert.equal(await priv('authenticated', fn), true)
  }
})

const pick = (rows) => rows.map((x) => ({ type: x.type, business_date: x.business_date, qty_change: x.qty_change,
  counted_qty: x.counted_qty, balance: x.balance }))

test('D1 thẻ kho BIA 01/10–02/10: opening 100; nhập +200; bán ngày 01/10 −120 (gộp 21:00 + 02:00); huỷ −2; bán ngày 02/10 −1; closing 177', async () => {
  const r = await ledger(owner3, k.bia, '2026-10-01', '2026-10-02')
  assert.deepEqual(r.item, { id: k.bia, name: 'Bia HN', unit: 'lon', kind: 'goods' })
  assert.equal(r.from, '2026-10-01')
  assert.equal(r.to, '2026-10-02')
  assert.equal(r.opening_qty, 100)
  assert.equal(r.closing_qty, 177)
  // Sắp theo giờ: phiếu huỷ 22:00 đứng trước nhóm bán ngày 01/10 (giờ bán cuối 02:00 hôm sau).
  assert.deepEqual(pick(r.rows), [
    { type: 'receipt', business_date: '2026-10-01', qty_change: 200, counted_qty: null, balance: 300 },
    { type: 'writeoff', business_date: '2026-10-01', qty_change: -2, counted_qty: null, balance: 298 },
    { type: 'sales', business_date: '2026-10-01', qty_change: -120, counted_qty: null, balance: 178 },
    { type: 'sales', business_date: '2026-10-02', qty_change: -1, counted_qty: null, balance: 177 }])
  assert.equal(Date.parse(r.rows[2].at), Date.parse('2026-10-02T02:00:00+07:00'))
  assert.equal(r.rows[2].document_id, null)
  assert.equal(r.rows[2].doc_no, null)
  assert.ok(r.rows[0].document_id)
  assert.match(r.rows[0].doc_no, /^PN-/)
  assert.deepEqual(Object.keys(r.rows[0]).sort(), ['at', 'balance', 'business_date', 'counted_qty', 'doc_no', 'document_id',
    'qty_change', 'type'])
})

test('D2 thẻ kho THIT 01/10: dòng kiểm 23:00 qty_change −11 (từ 14 về 3), balance 3', async () => {
  const r = await ledger(owner3, k.thit, '2026-10-01', '2026-10-01')
  assert.equal(r.opening_qty, 5)
  assert.deepEqual(pick(r.rows), [
    { type: 'receipt', business_date: '2026-10-01', qty_change: 10, counted_qty: null, balance: 15 },
    { type: 'writeoff', business_date: '2026-10-01', qty_change: -1, counted_qty: null, balance: 14 },
    { type: 'count', business_date: '2026-10-01', qty_change: -11, counted_qty: 3, balance: 3 }])
  assert.match(r.rows[2].doc_no, /^PK-/)
  assert.equal(r.closing_qty, 3)
})

test('D3 dòng bán tách ở phiếu kiểm giữa ngày: thêm bán BIA trước và sau một phiếu kiểm ngày 03/10 → 2 dòng bán, balance tại dòng kiểm = SL đếm', async () => {
  await sell(m3.bia, 2, '2026-10-03 10:00+07')
  await postAt('count', '2026-10-03 12:00+07', {}, [{ inventory_item_id: k.bia, counted_qty: 170 }])
  await sell(m3.bia, 3, '2026-10-03 14:00+07')
  await sell(m3.bia, 1, '2026-10-03 15:00+07')
  const r = await ledger(owner3, k.bia, '2026-10-03', '2026-10-03')
  assert.equal(r.opening_qty, 177)
  assert.deepEqual(pick(r.rows), [
    { type: 'sales', business_date: '2026-10-03', qty_change: -2, counted_qty: null, balance: 175 },
    { type: 'count', business_date: '2026-10-03', qty_change: -5, counted_qty: 170, balance: 170 },
    { type: 'sales', business_date: '2026-10-03', qty_change: -4, counted_qty: null, balance: 166 }])
  assert.equal(Date.parse(r.rows[2].at), Date.parse('2026-10-03T15:00:00+07:00'))
  assert.equal(r.closing_qty, 166)
})

test('D4 closing_qty của thẻ kho = qty của inventory_stock_levels(s3, day_to) cho cùng hàng', async () => {
  const dayTo = await scalar(`SELECT day_to::text AS v FROM business_day_bounds($1, '2026-10-03')`, [s3])
  const lv = await levels(owner3, s3, dayTo)
  for (const itemId of [k.bia, k.thit, k.coca, k.rau, k.suoi]) {
    const r = await ledger(owner3, itemId, '2026-10-01', '2026-10-03')
    assert.equal(r.closing_qty, lv.items.find((x) => x.id === itemId).qty, `hàng ${itemId}`)
    const last = r.rows.length ? r.rows[r.rows.length - 1].balance : r.opening_qty
    assert.equal(last, r.closing_qty, 'tồn chạy cuối = tồn cuối kỳ')
  }
})

test('D5 thu ngân, ownerB gọi thẻ kho hàng s3 bị chặn; khoảng > 93 ngày lỗi', async () => {
  for (const uid of [cashier3, ownerB, owner, staff]) {
    await fails(ledger(uid, k.bia, '2026-10-01', '2026-10-01'), 'Không có quyền')
  }
  // Hàng không tồn tại và hàng quán khác cùng một lỗi: không lộ hàng có tồn tại hay không.
  await fails(ledger(owner3, newId(), '2026-10-01', '2026-10-01'), 'Không có quyền')
  await fails(ledger(owner, newId(), '2026-10-01', '2026-10-01'), 'Không có quyền')
  await fails(ledger(owner3, k.bia, '2026-07-01', '2026-10-02'), 'Chỉ xem tối đa 93 ngày')
  assert.ok((await ledger(owner3, k.bia, '2026-07-01', '2026-10-01')).rows, '93 ngày tính cả hai đầu vẫn được')
  await fails(ledger(owner3, k.bia, '2026-10-02', '2026-10-01'), 'Khoảng ngày không hợp lệ')
})

test('E9 tiền = round(SL × tử / mẫu), không chia trước: giá 500/6 × huỷ 0,006 = 0,5 → 1đ (chia trước ra 0,4999… → 0)', async () => {
  const da = (await upsert(owner3, { store: s3, name: 'Đá viên', unit: 'kg' })).id
  await postAt('receipt', '2026-10-05 10:00+07', { paid_status: 'unpaid' }, [{ inventory_item_id: da, qty: 5, unit_cost: 84 }])
  await postAt('receipt', '2026-10-05 11:00+07', { paid_status: 'unpaid' }, [{ inventory_item_id: da, qty: 1, unit_cost: 80 }])
  await postAt('writeoff', '2026-10-05 12:00+07', { note: 'Tan' }, [{ inventory_item_id: da, qty: 0.006 }])
  const d = row(await cogs(owner3, '2026-10-05', '2026-10-05'), da)
  assert.equal(d.unit_cost, 83) // 500 / 6 = 83,33…
  assert.equal(d.writeoff_qty, 0.006)
  assert.equal(d.writeoff_cost, 1)
})

test('E10 giá nhập mới nhất hoà mốc thời gian → chọn dòng id lớn hơn (ổn định giữa các lần gọi)', async () => {
  const tie = (await upsert(owner3, { store: s3, name: 'Hàng hoà giờ' })).id
  const mTie = id(54)
  await db.query(`INSERT INTO menu_items(id, store_id, name) VALUES ($1, $2, 'Hàng hoà giờ')`, [mTie, s3])
  await db.query(`INSERT INTO menu_stock_links(store_id, menu_item_id, inventory_item_id, qty_per_sale, valid_from)
    VALUES ($1, $2, $3, 1, '2026-09-01 00:00+07')`, [s3, mTie, tie])
  const a = await postAt('receipt', '2026-10-06 10:00+07', { paid_status: 'unpaid' }, [{ inventory_item_id: tie, qty: 1, unit_cost: 1000 }])
  const b = await postAt('receipt', '2026-10-06 10:00+07', { paid_status: 'unpaid' }, [{ inventory_item_id: tie, qty: 1, unit_cost: 2000 }])
  await db.query(`UPDATE inventory_documents SET created_at = '2026-10-06 10:00+07' WHERE id IN ($1, $2)`, [a.id, b.id])
  // Dòng giá 1.000 (phiếu ghi trước) mang id lớn nhất → phải thắng dù ghi trước.
  await db.query(`UPDATE inventory_document_lines SET id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' WHERE document_id = $1`, [a.id])
  await db.query(`UPDATE inventory_document_lines SET id = '00000000-0000-0000-0000-0000000000ff' WHERE document_id = $1`, [b.id])
  await sell(mTie, 5, '2026-10-06 12:00+07') // tồn đầu 07/10 = −3 → mẫu ≤ 0 → giá nhập mới nhất
  await sell(mTie, 1, '2026-10-07 12:00+07')
  for (let i = 0; i < 3; i++) {
    const c = row(await cogs(owner3, '2026-10-07', '2026-10-07'), tie)
    assert.equal(c.unit_cost, 1000)
    assert.equal(c.cogs, 1000)
    const dayTo = await scalar(`SELECT day_to::text AS v FROM business_day_bounds($1, '2026-10-07')`, [s3])
    assert.equal((await levels(owner3, s3, dayTo)).items.find((x) => x.id === tie).last_unit_cost, 1000)
  }
})
