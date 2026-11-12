// Kịch bản 4 — Phiếu kho (inventory_post_document) dưới tranh chấp thật.
// Bất biến: số phiếu (PN-/PK-/PX-) trong một quán không trùng, không nhảy cóc; unique_violation không bao giờ
// lọt ra người gọi; cùng mã yêu cầu gửi nhiều lần chỉ ra MỘT phiếu.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { ITER, SKIP, assertClean, describe, openHarness, report, rid, tally } from './helpers.mjs'

let h

const POST = 'public.inventory_post_document($1::text, $2::jsonb, $3::jsonb, $4::uuid)'
const receipt = (actor, fx, item, { requestId = rid(), paid = null, qty = 3, cost = 10000 } = {}) => actor.call(POST, [
  'receipt',
  JSON.stringify({ store_id: fx.store, supplier_name: 'Đại lý', paid_status: paid ? 'paid' : 'unpaid', paid_method: paid }),
  JSON.stringify([{ inventory_item_id: item, qty, unit_cost: cost }]),
  requestId])
const writeoff = (actor, fx, item, requestId = rid()) => actor.call(POST, [
  'writeoff', JSON.stringify({ store_id: fx.store, note: 'vỡ' }),
  JSON.stringify([{ inventory_item_id: item, qty: 1 }]), requestId])
const count = (actor, fx, item, requestId = rid()) => actor.call(POST, [
  'count', JSON.stringify({ store_id: fx.store }),
  JSON.stringify([{ inventory_item_id: item, counted_qty: 10 }]), requestId])

const docNos = async (fx, kind) => (await h.sql(
  'SELECT doc_no FROM inventory_documents WHERE store_id = $1 AND kind = $2 ORDER BY doc_no', [fx.store, kind]))
  .map((r) => r.doc_no)

before(async () => { if (!SKIP) h = await openHarness() })
after(async () => { if (h) await h.close() })

test(`4a. bốn phiếu nhập cùng lúc trong một quán: số phiếu khác nhau, liền nhau (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const actors = [await fx.actor('owner', 'chủ quán (máy 1)'), await fx.actor('owner', 'chủ quán (máy 2)'),
    await fx.actor('manager', 'quản lý (máy 1)'), await fx.actor('manager', 'quản lý (máy 2)')]
  const item = await fx.newInventoryItem()
  const results = tally()
  for (let i = 0; i < ITER; i += 1) {
    // Cùng một hàng trong cả bốn phiếu: khoá FOR SHARE trên hàng không được chặn nhau.
    const outs = await h.race(actors.map((actor) => () => receipt(actor, fx, item)), 2)
    for (const o of outs) results.add(describe(o))
    assert.equal(outs.every((o) => o.ok && o.value.replayed === false), true,
      `vòng ${i}: cả bốn phiếu phải ghi được (${outs.map((o) => o.message).filter(Boolean).join('; ')})`)
    assert.equal(new Set(outs.map((o) => o.value.doc_no)).size, 4, `vòng ${i}: bốn số phiếu phải khác nhau`)
  }
  const nos = await docNos(fx, 'receipt')
  assert.equal(nos.length, 4 * ITER)
  assert.deepEqual(nos, Array.from({ length: 4 * ITER }, (_, n) => `PN-${String(n + 1).padStart(4, '0')}`),
    'số phiếu nhập phải liền nhau từ PN-0001, không trùng, không nhảy cóc')
  report('4a bốn phiếu nhập cùng lúc', { 'kết quả từng lời gọi': results })
  await assertClean(assert, fx, '4a')
}))

test(`4a. nhập ‖ nhập (đã trả CK) ‖ xuất huỷ ‖ kiểm kho cùng lúc trên cùng một hàng (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const owner1 = await fx.actor('owner', 'chủ quán (máy 1)')
  const owner2 = await fx.actor('owner', 'chủ quán (máy 2)')
  const manager1 = await fx.actor('manager', 'quản lý (máy 1)')
  const manager2 = await fx.actor('manager', 'quản lý (máy 2)')
  const item = await fx.newInventoryItem()
  const results = tally()
  for (let i = 0; i < ITER; i += 1) {
    const outs = await h.race([
      () => receipt(owner1, fx, item),
      () => receipt(owner2, fx, item, { paid: 'bank' }),
      () => writeoff(manager1, fx, item),
      () => count(manager2, fx, item),
    ], 2)
    for (const o of outs) results.add(describe(o))
    assert.equal(outs.every((o) => o.ok), true,
      `vòng ${i}: cả bốn phiếu phải ghi được (${outs.map((o) => o.message).filter(Boolean).join('; ')})`)
  }
  assert.equal((await docNos(fx, 'receipt')).length, 2 * ITER)
  assert.equal(new Set(await docNos(fx, 'receipt')).size, 2 * ITER)
  assert.equal((await docNos(fx, 'writeoff')).length, ITER)
  assert.equal((await docNos(fx, 'count')).length, ITER)
  // Mỗi phiếu nhập đã trả sinh đúng một phiếu chi (audit soát lại theo từng phiếu).
  assert.equal(await h.num(
    "SELECT count(*) FROM cash_book_entries WHERE store_id = $1 AND source = 'inventory_receipt'", [fx.store]), ITER)
  report('4a bốn loại phiếu cùng lúc', { 'kết quả từng lời gọi': results })
  await assertClean(assert, fx, '4a hỗn hợp')
}))

test(`4b. cùng mã yêu cầu gửi ba lần song song: một phiếu, hai lần kia nhận lại đúng phiếu đó (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const tabs = [await fx.actor('owner', 'chủ quán (tab 1)'), await fx.actor('owner', 'chủ quán (tab 2)'),
    await fx.actor('owner', 'chủ quán (tab 3)')]
  const item = await fx.newInventoryItem()
  const replays = tally()
  for (let i = 0; i < ITER; i += 1) {
    const requestId = rid()
    const outs = await h.race(tabs.map((tab) => () => receipt(tab, fx, item, { requestId, paid: 'bank' })), 2)
    assert.equal(outs.every((o) => o.ok), true,
      `vòng ${i}: ${outs.map((o) => o.message).filter(Boolean).join('; ')}`)
    assert.equal(new Set(outs.map((o) => o.value.id)).size, 1, `vòng ${i}: ba lời gọi phải trả cùng một phiếu`)
    assert.equal(outs.filter((o) => o.value.replayed === false).length, 1, `vòng ${i}: đúng một lời gọi ghi thật`)
    for (const o of outs) if (o.value.replayed) replays.add(describe(o))
  }
  assert.equal(await h.num('SELECT count(*) FROM inventory_documents WHERE store_id = $1', [fx.store]), ITER)
  assert.equal(await h.num(
    "SELECT count(*) FROM cash_book_entries WHERE store_id = $1 AND source = 'inventory_receipt'", [fx.store]), ITER)
  report('4b cùng mã yêu cầu ×3', { 'các lần gửi lặp nhận': replays })
  await assertClean(assert, fx, '4b')
}))

test(`4b. cùng mã yêu cầu cho hai LOẠI phiếu khác nhau song song: một phiếu, bên kia báo lỗi rõ (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const { owner, manager } = await fx.actors('owner', 'manager')
  const item = await fx.newInventoryItem()
  const losers = tally()
  for (let i = 0; i < ITER; i += 1) {
    const requestId = rid()
    const [a, b] = await h.race([
      () => receipt(owner, fx, item, { requestId }),
      () => writeoff(manager, fx, item, requestId),
    ], 2)
    assert.equal([a, b].filter((o) => o.ok).length, 1, `vòng ${i}: đúng một phiếu được ghi`)
    const loser = a.ok ? b : a
    losers.add(describe(loser))
    assert.match(loser.message, /Mã yêu cầu đã dùng cho phiếu khác/)
  }
  assert.equal(await h.num('SELECT count(*) FROM inventory_documents WHERE store_id = $1', [fx.store]), ITER)
  report('4b cùng mã, hai loại phiếu', { 'bên thua nhận': losers })
  await assertClean(assert, fx, '4b hai loại')
}))

test('4b. dựng xen kẽ: lần gửi đầu chưa commit → lần gửi lặp chờ → nhận lại đúng phiếu', { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const tab1 = await fx.actor('owner', 'chủ quán (tab 1)')
  const tab2 = await fx.actor('owner', 'chủ quán (tab 2)')
  const item = await fx.newInventoryItem()
  const requestId = rid()
  await tab1.begin()
  const first = await receipt(tab1, fx, item, { requestId })
  assert.equal(first.ok, true, first.message)
  const pending = receipt(tab2, fx, item, { requestId })
  await h.waitBlocked(tab2)
  await tab1.commit()
  const second = await pending
  assert.equal(second.ok, true, second.message)
  assert.equal(second.value.replayed, true)
  assert.equal(second.value.id, first.value.id)
  assert.equal(second.value.doc_no, first.value.doc_no)
  await assertClean(assert, fx, '4b xen kẽ')
}))
