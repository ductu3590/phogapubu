import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { as, setupThrough118 } from './helpers/inventory-fixture.mjs'

// Test mig 118 (kho). Nhóm A: hàng hoá + liên kết món (Task 1). Các bài chạy nối tiếp, dùng chung dữ liệu:
// cuối nhóm A còn đúng 3 liên kết hiệu lực mBia→BIA ×1, mThap/vTo→TIGER ×5, mThap→TIGER ×3.
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const owner = id(1), manager = id(2), cashier = id(3), staff = id(4), ownerB = id(5), owner3 = id(6)
const s1 = id(10), s2 = id(11), s3 = id(12)
const mBia = id(31), mKet = id(32), mThap = id(33), mSting = id(34), mSting2 = id(35), mB2 = id(36)
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
    ($5, $8, 'store_owner'), ($6, $9, 'store_owner')`, [owner, manager, cashier, staff, ownerB, owner3, s1, s2, s3])
  await db.query(`INSERT INTO menu_items(id, store_id, name) VALUES
    ($1, $7, 'Bia Hà Nội'), ($2, $7, 'Két Hà Nội'), ($3, $7, 'Bia tháp'), ($4, $7, 'Sting'), ($5, $7, 'Sting lạnh'),
    ($6, $8, 'Bia quán B')`, [mBia, mKet, mThap, mSting, mSting2, mB2, s1, s2])
  await db.query(`INSERT INTO menu_item_variants(id, store_id, menu_item_id, name) VALUES
    ($1, $3, $4, 'Tháp to'), ($2, $3, $4, 'Tháp nhỏ')`, [vTo, vNho, s1, mThap])
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
  await fails(setActive(owner, newId(), false), 'Không tìm thấy hàng hoá')
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
  await fails(setLink(owner, newId(), null, it.bia, 1), 'Không tìm thấy món')
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
