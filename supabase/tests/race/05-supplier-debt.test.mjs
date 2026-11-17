// Kịch bản 5 — Công nợ nhà cung cấp (mig 143–145) dưới tranh chấp thật.
// Bất biến: tổng phân bổ của các lần trả còn hiệu lực KHÔNG BAO GIỜ vượt tiền phiếu nhập; mỗi lần trả còn hiệu lực có
// đúng một phiếu chi và tổng phân bổ bằng số tiền của nó; không có phân bổ còn hiệu lực trỏ vào phiếu nhập đã huỷ.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { ITER, SKIP, assertClean, describe, openHarness, report, rid, tally } from './helpers.mjs'

let h

const POST = 'public.inventory_post_document($1::text, $2::jsonb, $3::jsonb, $4::uuid)'
const PAY = 'public.supplier_pay($1::uuid, $2::bigint, $3::text, $4::uuid[], $5::text, $6::uuid)'

// Phiếu nhập Chưa trả của NCC "Đại lý race" (tạo NCC nếu chưa có) → { doc, supplier, total }.
async function unpaidReceipt(actor, fx, item, total = 300000) {
  const r = await actor.call(POST, ['receipt',
    JSON.stringify({ store_id: fx.store, supplier_name: 'Đại lý race', paid_status: 'unpaid' }),
    JSON.stringify([{ inventory_item_id: item, qty: 1, unit_cost: total }]), rid()])
  assert.equal(r.ok, true, r.message)
  const supplier = (await h.one('SELECT supplier_id FROM inventory_documents WHERE id = $1', [r.value.id])).supplier_id
  return { doc: r.value.id, supplier, total }
}
const pay = (actor, supplier, amount, docs, requestId = rid()) => actor.call(PAY, [supplier, amount, 'bank', docs, null, requestId])

before(async () => { if (!SKIP) h = await openHarness() })
after(async () => { if (h) await h.close() })

test(`5a. hai máy cùng trả hết khoản nợ cuối bằng hai mã khác nhau: đúng một lần trả (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const { owner, manager } = await fx.actors('owner', 'manager')
  const owner2 = await fx.actor('owner', 'chủ quán (máy 2)')
  const item = await fx.newInventoryItem()
  const results = tally()
  for (let i = 0; i < ITER; i += 1) {
    const { doc, supplier, total } = await unpaidReceipt(owner, fx, item)
    const outs = await h.race([
      () => pay(manager, supplier, total, [doc]),
      () => pay(owner2, supplier, total, null),
    ])
    for (const o of outs) results.add(describe(o))
    assert.equal(outs.filter((o) => o.ok).length, 1, `vòng ${i}: đúng một lần trả thành công (${outs.map((o) => o.message).join('; ')})`)
    const loser = outs.find((o) => !o.ok)
    assert.match(loser.message, /tải lại trang|không còn nợ|vượt số còn nợ/)
  }
  assert.equal(await h.num(
    "SELECT count(*) FROM cash_book_entries WHERE store_id = $1 AND source = 'supplier_payment'", [fx.store]), ITER)
  report('5a hai máy trả khoản nợ cuối', { 'kết quả từng lời gọi': results })
  await assertClean(assert, fx, '5a')
}))

test(`5b. trả nợ ‖ huỷ phiếu nhập cùng phiếu: không bao giờ phân bổ vào phiếu đã huỷ (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const { owner, manager } = await fx.actors('owner', 'manager')
  const item = await fx.newInventoryItem()
  const results = tally()
  for (let i = 0; i < ITER; i += 1) {
    const { doc, supplier, total } = await unpaidReceipt(owner, fx, item)
    const outs = await h.race([
      () => pay(manager, supplier, total, [doc]),
      () => owner.call('public.inventory_void_document($1::uuid, $2::text)', [doc, 'nhập nhầm']),
    ])
    for (const o of outs) results.add(describe(o))
    assert.equal(outs.filter((o) => o.ok).length, 1, `vòng ${i}: đúng một bên thắng (${outs.map((o) => o.message).join('; ')})`)
  }
  report('5b trả nợ ‖ huỷ phiếu nhập', { 'kết quả từng lời gọi': results })
  await assertClean(assert, fx, '5b')
}))

test(`5c. trả nợ ‖ huỷ lần trả trước của cùng NCC: số nợ luôn khớp phân bổ (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const { owner, manager } = await fx.actors('owner', 'manager')
  const item = await fx.newInventoryItem()
  const results = tally()
  for (let i = 0; i < ITER; i += 1) {
    const { doc, supplier, total } = await unpaidReceipt(owner, fx, item)
    const first = await pay(manager, supplier, total / 2, [doc])
    assert.equal(first.ok, true, first.message)
    const outs = await h.race([
      () => pay(owner, supplier, total / 2, [doc]),
      () => manager.call('public.supplier_payment_void($1::uuid, $2::text)', [first.value.supplier_payment_id, 'trả nhầm']),
    ])
    for (const o of outs) results.add(describe(o))
    assert.equal(outs.every((o) => o.ok), true, `vòng ${i}: cả hai phải ghi được (${outs.map((o) => o.message).join('; ')})`)
  }
  report('5c trả nợ ‖ huỷ lần trả', { 'kết quả từng lời gọi': results })
  await assertClean(assert, fx, '5c')
}))
