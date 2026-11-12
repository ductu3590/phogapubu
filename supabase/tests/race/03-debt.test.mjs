// Kịch bản 3 — Công nợ khách hàng dưới tranh chấp thật.
// Bất biến chính: tổng phân bổ của các lần trả còn hiệu lực KHÔNG BAO GIỜ vượt số nợ của bill;
// mỗi lần trả có tổng phân bổ đúng bằng số tiền của nó (phép soát `audit`).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { ITER, SKIP, assertClean, describe, openHarness, report, rid, tally } from './helpers.mjs'

let h

const debtCollect = (actor, customer, amount, method = 'bank', requestId = rid()) => actor.call(
  'public.debt_collect($1::uuid, $2::bigint, $3::text, $4::jsonb, $5::text, $6::uuid)',
  [customer, amount, method, null, null, requestId])
const debtVoid = (actor, paymentId) =>
  actor.call('public.debt_payment_void($1::uuid, $2::text)', [paymentId, 'thu nhầm khách'])
const outstanding = (customer) => h.num(
  'SELECT COALESCE(sum(outstanding), 0) FROM public.debt_customer_bills($1)', [customer])

// Một bàn ăn xong ghi nợ toàn bộ cho khách → trả số tiền nợ vừa phát sinh.
async function billOnDebt(fx, cashier, customer) {
  const s = await fx.openSession()
  const res = await cashier.call(
    'public.collect_table_bill($1::uuid[], $2::jsonb, $3::integer, $4::uuid, $5::uuid, $6::jsonb)',
    [[s.session], JSON.stringify([{ instrument: 'debt', amount: s.total }]), null, rid(), customer, null])
  assert.equal(res.ok, true, res.message)
  return s.total
}

before(async () => { if (!SKIP) h = await openHarness() })
after(async () => { if (h) await h.close() })

// ---------------------------------------------------------------------------------------------------
// 3a. Hai máy cùng thu nợ một khách.
// ---------------------------------------------------------------------------------------------------
test(`3a. hai máy cùng thu nợ một khách: không bao giờ thu quá số nợ (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const { cashier1, cashier2 } = await fx.actors('cashier1', 'cashier2')
  const outcomes = { 'mỗi máy thu 100%': tally(), 'mỗi máy thu 60%': tally(), 'mỗi máy thu 50%': tally() }
  const PATTERNS = [['mỗi máy thu 100%', 1], ['mỗi máy thu 60%', 0.6], ['mỗi máy thu 50%', 0.5]]
  for (let i = 0; i < ITER; i += 1) {
    const [label, share] = PATTERNS[i % PATTERNS.length]
    const customer = await fx.newDebtCustomer()
    const debt = await billOnDebt(fx, cashier1, customer)
    const amount = Math.round(debt * share)
    const [a, b] = await h.race([
      () => debtCollect(cashier1, customer, amount, 'bank'),
      () => debtCollect(cashier2, customer, amount, 'bank'),
    ])
    const okCount = [a, b].filter((o) => o.ok).length
    for (const o of [a, b]) if (!o.ok) outcomes[label].add(describe(o))
    if (share === 0.5) {
      assert.equal(okCount, 2, `vòng ${i}: hai lần trả 50% đều phải được nhận (${a.message ?? ''} ${b.message ?? ''})`)
      outcomes[label].add('cả hai ok')
      assert.equal(await outstanding(customer), 0)
    } else {
      assert.equal(okCount, 1, `vòng ${i}: đúng một máy thu được (${label})`)
      const loser = a.ok ? b : a
      assert.match(loser.message, /Số tiền trả vượt số nợ/)
      assert.equal(await outstanding(customer), debt - amount)
    }
  }
  report('3a hai máy cùng thu nợ một khách', Object.fromEntries(
    Object.entries(outcomes).map(([k, t]) => [`${k} — bên thua nhận`, t])))
  await assertClean(assert, fx, '3a')
}))

test('3a. dựng xen kẽ: máy 1 chưa commit → máy 2 chờ khoá khách → thấy nợ đã hết', { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const { cashier1, cashier2 } = await fx.actors('cashier1', 'cashier2')
  const customer = await fx.newDebtCustomer()
  const debt = await billOnDebt(fx, cashier1, customer)
  await cashier1.begin()
  const first = await debtCollect(cashier1, customer, debt)
  assert.equal(first.ok, true, first.message)
  const pending = debtCollect(cashier2, customer, debt)
  await h.waitBlocked(cashier2)
  await cashier1.commit()
  const second = await pending
  assert.equal(second.ok, false)
  assert.match(second.message, /Số tiền trả vượt số nợ: còn nợ 0/)
  assert.equal(await outstanding(customer), 0)
  await assertClean(assert, fx, '3a xen kẽ commit')
}))

test('3a. dựng xen kẽ: máy 1 ROLLBACK → máy 2 đang chờ thu được trọn số nợ', { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const { cashier1, cashier2 } = await fx.actors('cashier1', 'cashier2')
  const customer = await fx.newDebtCustomer()
  const debt = await billOnDebt(fx, cashier1, customer)
  await cashier1.begin()
  assert.equal((await debtCollect(cashier1, customer, debt)).ok, true)
  const pending = debtCollect(cashier2, customer, debt)
  await h.waitBlocked(cashier2)
  await cashier1.rollback()
  const second = await pending
  assert.equal(second.ok, true, second.message)
  assert.equal(await outstanding(customer), 0)
  assert.equal(await h.num('SELECT count(*) FROM debt_payments WHERE debt_customer_id = $1', [customer]), 1)
  await assertClean(assert, fx, '3a xen kẽ rollback')
}))

test(`3a. cùng mã thu nợ gửi hai lần song song: một lần trả, lần kia already (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const tab1 = await fx.actor('cashier1', 'thu ngân 1 (tab 1)')
  const tab2 = await fx.actor('cashier1', 'thu ngân 1 (tab 2)')
  const customer = await fx.newDebtCustomer()
  const seconds = tally()
  for (let i = 0; i < ITER; i += 1) {
    const debt = await billOnDebt(fx, tab1, customer)
    const requestId = rid()
    const [a, b] = await h.race([
      () => debtCollect(tab1, customer, debt, 'bank', requestId),
      () => debtCollect(tab2, customer, debt, 'bank', requestId),
    ], 2)
    assert.equal(a.ok && b.ok, true, `vòng ${i}: ${a.message ?? ''} ${b.message ?? ''}`)
    assert.equal(a.value.debt_payment_id, b.value.debt_payment_id)
    assert.deepEqual([a.value.already, b.value.already].sort(), [false, true])
    seconds.add(describe(a.value.already ? a : b))
    assert.equal(await outstanding(customer), 0)
  }
  assert.equal(await h.num('SELECT count(*) FROM debt_payments WHERE debt_customer_id = $1', [customer]), ITER)
  report('3a cùng mã thu nợ', { 'lần gửi lặp nhận': seconds })
  await assertClean(assert, fx, '3a cùng mã')
}))

// ---------------------------------------------------------------------------------------------------
// 3b. Thu nợ ‖ huỷ một lần trả trước đó.
// ---------------------------------------------------------------------------------------------------
test(`3b. thu nợ ‖ huỷ lần trả trước đó: không thu quá, không mất phân bổ (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const { owner, cashier1, cashier2 } = await fx.actors('owner', 'cashier1', 'cashier2')
  const collects = tally()
  for (let i = 0; i < ITER; i += 1) {
    const customer = await fx.newDebtCustomer()
    const debt = await billOnDebt(fx, cashier1, customer)
    const half = debt / 2
    const earlier = await debtCollect(cashier1, customer, half)
    assert.equal(earlier.ok, true, earlier.message)
    // Vòng chẵn: thu nốt nửa còn lại (đúng dù huỷ tới trước hay sau).
    // Vòng lẻ: thu TOÀN BỘ số nợ gốc — chỉ đúng nếu lần huỷ đã xong trước.
    const amount = i % 2 ? debt : half
    const [v, c] = await h.race([
      () => debtVoid(owner, earlier.value.debt_payment_id),
      () => debtCollect(cashier2, customer, amount),
    ])
    assert.equal(v.ok && v.value.already === false, true, `vòng ${i}: huỷ lần trả phải thành công (${v.message})`)
    collects.add(`${i % 2 ? 'thu 100% nợ gốc' : 'thu 50% còn lại'}: ${describe(c)}`)
    if (c.ok) {
      assert.equal(await outstanding(customer), debt - amount)
    } else {
      assert.equal(i % 2, 1, `vòng ${i}: thu nửa còn lại không được phép thất bại (${c.message})`)
      assert.match(c.message, /Số tiền trả vượt số nợ/)
      assert.equal(await outstanding(customer), debt)
    }
  }
  report('3b thu nợ ‖ huỷ lần trả trước', { 'bên thu nợ nhận': collects })
  await assertClean(assert, fx, '3b')
}))

test(`3b. hai người cùng huỷ một lần trả: huỷ một lần, bên kia already (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const { owner, manager, cashier1 } = await fx.actors('owner', 'manager', 'cashier1')
  const customer = await fx.newDebtCustomer()
  const seconds = tally()
  for (let i = 0; i < ITER; i += 1) {
    const debt = await billOnDebt(fx, cashier1, customer)
    const paid = await debtCollect(cashier1, customer, debt)
    assert.equal(paid.ok, true, paid.message)
    const [a, b] = await h.race([
      () => debtVoid(owner, paid.value.debt_payment_id),
      () => debtVoid(manager, paid.value.debt_payment_id),
    ], 2)
    assert.equal(a.ok && b.ok, true, `vòng ${i}: ${a.message ?? ''} ${b.message ?? ''}`)
    assert.deepEqual([a.value.already, b.value.already].sort(), [false, true])
    seconds.add(describe(a.value.already ? a : b))
    // Trả lại cho đủ để vòng sau bắt đầu từ nợ 0.
    assert.equal((await debtCollect(cashier1, customer, debt)).ok, true)
  }
  report('3b hai người cùng huỷ một lần trả', { 'bên thua nhận': seconds })
  await assertClean(assert, fx, '3b huỷ đôi')
}))

// ---------------------------------------------------------------------------------------------------
// 3c. Thu nợ TIỀN MẶT ‖ kết ca (quán bật ca): tiền trả nợ nằm trong két đã lưu (debt_cash), hoặc bị từ chối.
// ---------------------------------------------------------------------------------------------------
test(`3c. thu nợ tiền mặt ‖ kết ca: tiền nằm trong két đã lưu, hoặc bị từ chối (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({ requireShift: true }, async (fx) => {
  const { owner, cashier1, cashier2 } = await fx.actors('owner', 'cashier1', 'cashier2')
  const OPENING = 100000
  const collects = tally()
  for (let i = 0; i < ITER; i += 1) {
    const opened = await cashier1.call('public.open_cash_shift($1::uuid, $2::bigint, $3::text)', [fx.store, OPENING, null])
    assert.equal(opened.ok, true, opened.message)
    const shift = opened.value.shift_id
    const customer = await fx.newDebtCustomer()
    const debt = await billOnDebt(fx, cashier1, customer) // bill ghi nợ: không có tiền mặt vào két
    const [c, k] = await h.race([
      () => debtCollect(cashier2, customer, debt, 'cash'),
      () => owner.call('public.close_cash_shift($1::uuid, $2::bigint, $3::text)', [shift, OPENING, null]),
    ], 4)
    assert.equal(k.ok, true, k.message)
    collects.add(describe(c))
    const expected = Number((await h.one('SELECT expected_cash FROM cash_shifts WHERE id = $1', [shift])).expected_cash)
    if (c.ok) {
      const pay = await h.one('SELECT cash_shift_id FROM debt_payments WHERE id = $1', [c.value.debt_payment_id])
      assert.equal(pay.cash_shift_id, shift)
      assert.equal(expected, OPENING + debt, `vòng ${i}: két đã lưu phải GỒM tiền trả nợ vừa lọt vào ca`)
    } else {
      assert.match(c.message, /Chưa mở ca/)
      assert.equal(expected, OPENING)
      assert.equal(await outstanding(customer), debt)
    }
  }
  report('3c thu nợ tiền mặt ‖ kết ca', { 'bên thu nợ nhận': collects })
  await assertClean(assert, fx, '3c')
}))

test(`3c. huỷ lần trả nợ tiền mặt ‖ kết ca: két đã lưu khớp trạng thái lần trả (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({ requireShift: true }, async (fx) => {
  const { owner, manager, cashier1 } = await fx.actors('owner', 'manager', 'cashier1')
  const OPENING = 100000
  const voids = tally()
  for (let i = 0; i < ITER; i += 1) {
    const opened = await cashier1.call('public.open_cash_shift($1::uuid, $2::bigint, $3::text)', [fx.store, OPENING, null])
    assert.equal(opened.ok, true, opened.message)
    const shift = opened.value.shift_id
    const customer = await fx.newDebtCustomer()
    const debt = await billOnDebt(fx, cashier1, customer)
    const paid = await debtCollect(cashier1, customer, debt, 'cash')
    assert.equal(paid.ok, true, paid.message)
    const [v, k] = await h.race([
      () => debtVoid(manager, paid.value.debt_payment_id),
      () => owner.call('public.close_cash_shift($1::uuid, $2::bigint, $3::text)', [shift, OPENING, null]),
    ], 4)
    assert.equal(k.ok, true, k.message)
    voids.add(describe(v))
    const expected = Number((await h.one('SELECT expected_cash FROM cash_shifts WHERE id = $1', [shift])).expected_cash)
    if (v.ok) {
      assert.equal(expected, OPENING, `vòng ${i}: lần trả đã huỷ thì két không tính nữa`)
      assert.equal(await outstanding(customer), debt)
    } else {
      assert.match(v.message, /Ca của lần thu này đã kết/)
      assert.equal(expected, OPENING + debt)
      assert.equal(await outstanding(customer), 0)
    }
  }
  report('3c huỷ lần trả nợ tiền mặt ‖ kết ca', { 'bên huỷ nhận': voids })
  await assertClean(assert, fx, '3c huỷ')
}))
