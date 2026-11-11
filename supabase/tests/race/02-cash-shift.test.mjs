// Kịch bản 2 — Ca thu ngân (quán bật require_cash_shift) dưới tranh chấp thật.
// Bất biến chính: một khoản tiền mặt hoặc (a) gắn vào ca TRƯỚC khi ca kết và nằm trong số két đã lưu của ca đó,
// hoặc (b) bị từ chối "Chưa mở ca". Không bao giờ có khoản trỏ vào ca đã kết mà số két đã lưu không tính nó.
// Phép soát `audit` tính lại cash_shift_totals của mọi ca đã kết và so với expected_cash ĐÃ LƯU.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { ITER, SKIP, assertClean, describe, openHarness, report, rid, tally } from './helpers.mjs'

let h
const OPENING = 100000

const openShift = (actor, fx, opening = OPENING) =>
  actor.call('public.open_cash_shift($1::uuid, $2::bigint, $3::text)', [fx.store, opening, null])
const closeShift = (actor, shift, counted) =>
  actor.call('public.close_cash_shift($1::uuid, $2::bigint, $3::text)', [shift, counted, null])
const collectCash = (actor, s) => actor.call(
  'public.collect_table_bill($1::uuid[], $2::jsonb, $3::integer, $4::uuid)',
  [[s.session], JSON.stringify([{ instrument: 'cash', amount: s.total }]), null, rid()])
const drawerPayment = (actor, category, amount) => actor.call(
  'public.cash_book_create($1::text, $2::text, $3::uuid, $4::bigint, $5::text, $6::text, $7::uuid, $8::text)',
  ['payment', 'cash', category, amount, 'mua đá', null, rid(), 'pos_drawer'])
const shiftRow = (id) => h.one(
  'SELECT status, expected_cash::int AS expected, counted_cash::int AS counted, difference::int AS diff FROM cash_shifts WHERE id = $1', [id])

async function mustOpen(actor, fx) {
  const res = await openShift(actor, fx)
  assert.equal(res.ok, true, res.message)
  return res.value.shift_id
}

before(async () => { if (!SKIP) h = await openHarness() })
after(async () => { if (h) await h.close() })

// ---------------------------------------------------------------------------------------------------
// 2a. Nhiều người bấm "Mở ca" cùng lúc.
// ---------------------------------------------------------------------------------------------------
test(`2a. ba người mở ca cùng lúc: đúng một ca mở (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({ requireShift: true }, async (fx) => {
  const { owner, cashier1, cashier2 } = await fx.actors('owner', 'cashier1', 'cashier2')
  const losers = tally()
  for (let i = 0; i < ITER; i += 1) {
    const results = await h.race([
      () => openShift(cashier1, fx, 100000),
      () => openShift(cashier2, fx, 200000),
      () => openShift(owner, fx, 300000),
    ], 2)
    const winners = results.filter((o) => o.ok)
    assert.equal(winners.length, 1, `vòng ${i}: đúng một người mở được ca`)
    assert.equal(await h.num("SELECT count(*) FROM cash_shifts WHERE store_id = $1 AND status = 'open'", [fx.store]), 1)
    for (const o of results) {
      if (o.ok) continue
      losers.add(describe(o))
      assert.match(o.message, /Đã có ca đang mở/)
    }
    const closed = await closeShift(owner, winners[0].value.shift_id, 0)
    assert.equal(closed.ok, true, closed.message)
  }
  assert.equal(await h.num('SELECT count(*) FROM cash_shifts WHERE store_id = $1', [fx.store]), ITER)
  report('2a ba người mở ca cùng lúc', { 'hai bên thua nhận': losers })
  await assertClean(assert, fx, '2a')
}))

// ---------------------------------------------------------------------------------------------------
// 2b. Thu bill tiền mặt ‖ Kết ca.
// ---------------------------------------------------------------------------------------------------
test(`2b. thu bill tiền mặt ‖ kết ca: khoản thu nằm trong két đã lưu, hoặc bị từ chối (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({ requireShift: true }, async (fx) => {
  const { owner, cashier1 } = await fx.actors('owner', 'cashier1')
  const collects = tally()
  for (let i = 0; i < ITER; i += 1) {
    const shift = await mustOpen(cashier1, fx)
    const s = await fx.openSession()
    const [c, k] = await h.race([
      () => collectCash(cashier1, s),
      () => closeShift(owner, shift, OPENING + s.total),
    ], 4)
    assert.equal(k.ok, true, `vòng ${i}: kết ca phải thành công (${k.message})`)
    collects.add(describe(c))
    const row = await shiftRow(shift)
    assert.equal(row.status, 'closed')
    if (c.ok) {
      const pay = await h.one('SELECT cash_shift_id FROM bill_payments WHERE id = $1', [c.value.payment_id])
      assert.equal(pay.cash_shift_id, shift, `vòng ${i}: khoản thu phải gắn đúng ca`)
      assert.equal(row.expected, OPENING + s.total, `vòng ${i}: két đã lưu phải GỒM khoản thu vừa lọt vào ca`)
      assert.equal(Number(k.value.cash_sales), s.total)
    } else {
      assert.match(c.message, /Chưa mở ca/)
      assert.equal(row.expected, OPENING, `vòng ${i}: khoản thu bị từ chối thì két chỉ có tiền đầu ca`)
      assert.equal((await h.one('SELECT status FROM table_sessions WHERE id = $1', [s.session])).status, 'open')
    }
  }
  report('2b thu bill tiền mặt ‖ kết ca', { 'bên thu tiền nhận': collects })
  await assertClean(assert, fx, '2b')
}))

test('2b. dựng xen kẽ: lần thu chưa commit → kết ca chờ → két đã lưu gồm khoản thu', { skip: SKIP }, () => h.withStore({ requireShift: true }, async (fx) => {
  const { owner, cashier1 } = await fx.actors('owner', 'cashier1')
  const shift = await mustOpen(cashier1, fx)
  const s = await fx.openSession()
  await cashier1.begin()
  const c = await collectCash(cashier1, s)
  assert.equal(c.ok, true, c.message)
  const closing = closeShift(owner, shift, OPENING + s.total)
  await h.waitBlocked(owner)
  await cashier1.commit()
  const k = await closing
  assert.equal(k.ok, true, k.message)
  assert.equal(Number(k.value.expected_cash), OPENING + s.total)
  assert.equal(Number(k.value.difference), 0)
  await assertClean(assert, fx, '2b xen kẽ thu trước')
}))

test('2b. dựng xen kẽ: kết ca chưa commit → lần thu chờ → bị từ chối "Chưa mở ca"', { skip: SKIP }, () => h.withStore({ requireShift: true }, async (fx) => {
  const { owner, cashier1 } = await fx.actors('owner', 'cashier1')
  const shift = await mustOpen(cashier1, fx)
  const s = await fx.openSession()
  await owner.begin()
  const k = await closeShift(owner, shift, OPENING)
  assert.equal(k.ok, true, k.message)
  const collecting = collectCash(cashier1, s)
  await h.waitBlocked(cashier1)
  await owner.commit()
  const c = await collecting
  assert.equal(c.ok, false, 'lần thu chờ ca đang kết phải bị từ chối')
  assert.match(c.message, /Chưa mở ca/)
  assert.equal(await h.num('SELECT count(*) FROM bill_payments WHERE store_id = $1', [fx.store]), 0)
  assert.equal((await shiftRow(shift)).expected, OPENING)
  await assertClean(assert, fx, '2b xen kẽ kết ca trước')
}))

test('2b. dựng xen kẽ: kết ca ROLLBACK → lần thu đang chờ vẫn vào đúng ca', { skip: SKIP }, () => h.withStore({ requireShift: true }, async (fx) => {
  const { owner, cashier1 } = await fx.actors('owner', 'cashier1')
  const shift = await mustOpen(cashier1, fx)
  const s = await fx.openSession()
  await owner.begin()
  assert.equal((await closeShift(owner, shift, OPENING)).ok, true)
  const collecting = collectCash(cashier1, s)
  await h.waitBlocked(cashier1)
  await owner.rollback()
  const c = await collecting
  assert.equal(c.ok, true, c.message)
  const k = await closeShift(owner, shift, OPENING + s.total)
  assert.equal(Number(k.value.expected_cash), OPENING + s.total)
  await assertClean(assert, fx, '2b xen kẽ kết ca rollback')
}))

// ---------------------------------------------------------------------------------------------------
// 2c. Phiếu chi tiền mặt tại két (cash_book_create) ‖ Kết ca.
// ---------------------------------------------------------------------------------------------------
test(`2c. phiếu chi tiền mặt tại két ‖ kết ca: phiếu nằm trong két đã lưu, hoặc bị từ chối (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({ requireShift: true }, async (fx) => {
  const { owner, cashier1 } = await fx.actors('owner', 'cashier1')
  const category = await fx.paymentCategory()
  const creates = tally()
  const SPEND = 20000
  for (let i = 0; i < ITER; i += 1) {
    const shift = await mustOpen(cashier1, fx)
    const [e, k] = await h.race([
      () => drawerPayment(cashier1, category, SPEND),
      () => closeShift(owner, shift, OPENING),
    ], 4)
    assert.equal(k.ok, true, `vòng ${i}: kết ca phải thành công (${k.message})`)
    creates.add(describe(e))
    const row = await shiftRow(shift)
    if (e.ok) {
      assert.equal(e.value.cash_shift_id, shift, `vòng ${i}: phiếu phải gắn đúng ca`)
      assert.equal(row.expected, OPENING - SPEND, `vòng ${i}: két đã lưu phải TRỪ phiếu chi vừa lọt vào ca`)
    } else {
      assert.match(e.message, /Chưa mở ca/)
      assert.equal(row.expected, OPENING)
    }
  }
  report('2c phiếu chi tại két ‖ kết ca', { 'bên ghi phiếu nhận': creates })
  await assertClean(assert, fx, '2c')
}))

test('2c. dựng xen kẽ: kết ca chưa commit → phiếu chi chờ → bị từ chối "Chưa mở ca"', { skip: SKIP }, () => h.withStore({ requireShift: true }, async (fx) => {
  const { owner, cashier1 } = await fx.actors('owner', 'cashier1')
  const category = await fx.paymentCategory()
  const shift = await mustOpen(cashier1, fx)
  await owner.begin()
  assert.equal((await closeShift(owner, shift, OPENING)).ok, true)
  const creating = drawerPayment(cashier1, category, 20000)
  await h.waitBlocked(cashier1)
  await owner.commit()
  const e = await creating
  assert.equal(e.ok, false)
  assert.match(e.message, /Chưa mở ca/)
  assert.equal(await h.num('SELECT count(*) FROM cash_book_entries WHERE store_id = $1', [fx.store]), 0)
  await assertClean(assert, fx, '2c xen kẽ')
}))

test(`2c. cùng mã chống trùng của phiếu chi gửi hai lần song song: một phiếu (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({ requireShift: true }, async (fx) => {
  const tab1 = await fx.actor('cashier1', 'thu ngân 1 (tab 1)')
  const tab2 = await fx.actor('cashier1', 'thu ngân 1 (tab 2)')
  const category = await fx.paymentCategory()
  await mustOpen(tab1, fx)
  const seconds = tally()
  const send = (actor, requestId) => actor.call(
    'public.cash_book_create($1::text, $2::text, $3::uuid, $4::bigint, $5::text, $6::text, $7::uuid, $8::text)',
    ['payment', 'cash', category, 15000, 'mua chanh', null, requestId, 'pos_drawer'])
  for (let i = 0; i < ITER; i += 1) {
    const requestId = rid()
    const [a, b] = await h.race([() => send(tab1, requestId), () => send(tab2, requestId)], 2)
    assert.equal(a.ok && b.ok, true, `vòng ${i}: ${a.message ?? ''} ${b.message ?? ''}`)
    assert.equal(a.value.id, b.value.id)
    assert.deepEqual([a.value.already, b.value.already].sort(), [false, true])
    seconds.add(describe(a.value.already ? a : b))
  }
  assert.equal(await h.num('SELECT count(*) FROM cash_book_entries WHERE store_id = $1', [fx.store]), ITER)
  report('2c cùng mã phiếu chi', { 'lần gửi lặp nhận': seconds })
  await assertClean(assert, fx, '2c cùng mã')
}))

// ---------------------------------------------------------------------------------------------------
// 2d. Huỷ phiếu tiền mặt ‖ Kết ca.
// ---------------------------------------------------------------------------------------------------
test(`2d. huỷ phiếu chi tiền mặt ‖ kết ca: két đã lưu khớp trạng thái phiếu (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({ requireShift: true }, async (fx) => {
  const { owner, manager, cashier1 } = await fx.actors('owner', 'manager', 'cashier1')
  const category = await fx.paymentCategory()
  const voids = tally()
  const SPEND = 20000
  for (let i = 0; i < ITER; i += 1) {
    const shift = await mustOpen(cashier1, fx)
    const entry = await drawerPayment(cashier1, category, SPEND)
    assert.equal(entry.ok, true, entry.message)
    const [v, k] = await h.race([
      () => manager.call('public.cash_book_void($1::uuid, $2::text)', [entry.value.id, 'ghi nhầm']),
      () => closeShift(owner, shift, OPENING),
    ], 4)
    assert.equal(k.ok, true, k.message)
    voids.add(describe(v))
    const row = await shiftRow(shift)
    const voided = (await h.one('SELECT voided_at FROM cash_book_entries WHERE id = $1', [entry.value.id])).voided_at
    if (v.ok) {
      assert.notEqual(voided, null)
      assert.equal(row.expected, OPENING, `vòng ${i}: phiếu đã huỷ thì két không trừ nữa`)
    } else {
      assert.match(v.message, /Ca của phiếu này đã kết/)
      assert.equal(voided, null)
      assert.equal(row.expected, OPENING - SPEND)
    }
  }
  report('2d huỷ phiếu chi ‖ kết ca', { 'bên huỷ phiếu nhận': voids })
  await assertClean(assert, fx, '2d')
}))

// ---------------------------------------------------------------------------------------------------
// 2e. Phiếu nhập kho trả tiền mặt (mig 122b: tự sinh phiếu chi trong cùng giao dịch) ‖ Kết ca.
// ---------------------------------------------------------------------------------------------------
test(`2e. phiếu nhập kho trả tiền mặt ‖ kết ca: phiếu chi nằm trong két đã lưu, hoặc cả phiếu nhập bị từ chối (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({ requireShift: true }, async (fx) => {
  const { owner, manager, cashier1 } = await fx.actors('owner', 'manager', 'cashier1')
  const item = await fx.newInventoryItem()
  const posts = tally()
  const COST = 2 * 12000
  let posted = 0
  for (let i = 0; i < ITER; i += 1) {
    const shift = await mustOpen(cashier1, fx)
    const [p, k] = await h.race([
      () => manager.call('public.inventory_post_document($1::text, $2::jsonb, $3::jsonb, $4::uuid)', [
        'receipt',
        JSON.stringify({ store_id: fx.store, supplier_name: 'Đại lý bia', paid_status: 'paid', paid_method: 'cash' }),
        JSON.stringify([{ inventory_item_id: item, qty: 2, unit_cost: 12000 }]),
        rid()]),
      () => closeShift(owner, shift, OPENING),
    ], 4)
    assert.equal(k.ok, true, k.message)
    posts.add(describe(p))
    const row = await shiftRow(shift)
    if (p.ok) {
      posted += 1
      const entry = await h.one(
        "SELECT cash_shift_id, amount::int AS amount FROM cash_book_entries WHERE source = 'inventory_receipt' AND source_ref = $1",
        [p.value.id])
      assert.equal(entry.cash_shift_id, shift)
      assert.equal(entry.amount, COST)
      assert.equal(row.expected, OPENING - COST, `vòng ${i}: két đã lưu phải TRỪ phiếu chi của phiếu nhập`)
    } else {
      assert.match(p.message, /Chưa mở ca/)
      assert.equal(row.expected, OPENING)
    }
  }
  // Phiếu nhập bị từ chối thì không để lại phiếu, cũng không "đốt" số phiếu.
  assert.equal(await h.num("SELECT count(*) FROM inventory_documents WHERE store_id = $1", [fx.store]), posted)
  report('2e phiếu nhập trả tiền mặt ‖ kết ca', { 'bên ghi phiếu nhập nhận': posts })
  await assertClean(assert, fx, '2e')
}))
