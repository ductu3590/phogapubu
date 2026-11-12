// Kịch bản 1 — collect_table_bill dưới tranh chấp thật (nhiều kết nối).
// Test "tự nhiên": lặp ITER vòng, mỗi lời gọi trễ ngẫu nhiên vài ms. Test "dựng xen kẽ": ép đúng một thứ tự
// bằng giao dịch tường minh hoặc rào chắn trên dòng quán (helpers.mjs → holdStoreRow).
// Mỗi test dùng một quán riêng nên test đỏ không làm bẩn phép soát của test sau.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { DEADLOCK, ITER, SKIP, assertClean, describe, openHarness, report, rid, tally } from './helpers.mjs'

let h

const COLLECT = 'public.collect_table_bill($1::uuid[], $2::jsonb, $3::integer, $4::uuid)'
const collect = (actor, sessions, lines, requestId = rid()) =>
  actor.call(COLLECT, [sessions, JSON.stringify(lines), null, requestId])
const cash = (amount) => [{ instrument: 'cash', amount }]
const bank = (amount) => [{ instrument: 'bank', amount }]

const sessionRow = (id) => h.one(
  'SELECT status, close_reason, bill_payment_id, closed_by FROM table_sessions WHERE id = $1', [id])
const paymentsOf = (sessionIds) => h.sql(
  `SELECT p.id, p.total_amount, p.collected_by FROM bill_payments p
    WHERE p.id IN (SELECT bill_payment_id FROM table_sessions WHERE id = ANY($1::uuid[]))`, [sessionIds])
const paymentCount = (fx) => h.num('SELECT count(*) FROM bill_payments WHERE store_id = $1', [fx.store])
const unpaidOrders = (session) => h.sql(
  `SELECT order_source, status, total_amount FROM orders
    WHERE session_id = $1 AND status <> 'cancelled' AND payment_received_at IS NULL`, [session])

before(async () => { if (!SKIP) h = await openHarness() })
after(async () => { if (h) await h.close() })

// ---------------------------------------------------------------------------------------------------
// 1a. Hai thu ngân thu CÙNG một bàn cùng lúc, mã chống trùng KHÁC nhau.
// ---------------------------------------------------------------------------------------------------
test(`1a. hai thu ngân thu cùng một bàn, khác mã: đúng một khoản thu (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const { cashier1, cashier2 } = await fx.actors('cashier1', 'cashier2')
  const losers = tally()
  for (let i = 0; i < ITER; i += 1) {
    const s = await fx.openSession()
    const before = await paymentCount(fx)
    // Vòng lẻ: hai máy chọn hai phương tiện khác nhau → bên thua phải thấy đúng cái ĐÃ GHI.
    const [a, b] = await h.race([
      () => collect(cashier1, [s.session], cash(s.total)),
      () => collect(cashier2, [s.session], i % 2 ? bank(s.total) : cash(s.total)),
    ])
    assert.equal(await paymentCount(fx), before + 1, `vòng ${i}: phải có đúng MỘT khoản thu mới`)
    const row = await sessionRow(s.session)
    assert.equal(row.status, 'closed')
    assert.equal(row.close_reason, 'paid')

    const winners = [a, b].filter((o) => o.ok && o.value.already === false)
    assert.equal(winners.length, 1, `vòng ${i}: đúng một bên thu thật`)
    assert.equal(winners[0].value.payment_id, row.bill_payment_id)
    assert.equal(Number(winners[0].value.total), s.total)
    const loser = [a, b].find((o) => o !== winners[0])
    losers.add(describe(loser))
    if (loser.ok) {
      // Bên thua nhận 'already' kèm đúng khoản đã ghi của bên thắng, không phải thứ nó vừa gửi.
      assert.equal(loser.value.already, true)
      assert.equal(loser.value.payment_id, row.bill_payment_id)
      const recorded = winners[0] === a || i % 2 === 0 ? 'cash' : 'bank'
      assert.deepEqual(loser.value.lines, [{ instrument: recorded, amount: s.total }])
    }
  }
  report('1a hai thu ngân, cùng bàn, khác mã', { 'bên thua nhận': losers })
  await assertClean(assert, fx, '1a')
}))

test('1a. dựng xen kẽ: máy 1 chưa commit → máy 2 chờ; máy 1 commit → máy 2 nhận already', { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const { cashier1, cashier2 } = await fx.actors('cashier1', 'cashier2')
  const s = await fx.openSession()
  await cashier1.begin()
  const first = await collect(cashier1, [s.session], cash(s.total))
  assert.equal(first.ok && first.value.already, false, first.message)
  const pending = collect(cashier2, [s.session], bank(s.total))
  await h.waitBlocked(cashier2)
  await cashier1.commit()
  const second = await pending
  assert.equal(second.ok, true, second.message)
  assert.equal(second.value.already, true)
  assert.equal(second.value.payment_id, first.value.payment_id)
  assert.deepEqual(second.value.lines, [{ instrument: 'cash', amount: s.total }])
  assert.equal((await paymentsOf([s.session])).length, 1)
  await assertClean(assert, fx, '1a xen kẽ commit')
}))

test('1a. dựng xen kẽ: máy 1 ROLLBACK (mất mạng giữa chừng) → máy 2 thu trọn vẹn', { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const { cashier1, cashier2 } = await fx.actors('cashier1', 'cashier2')
  const s = await fx.openSession()
  await cashier1.begin()
  const first = await collect(cashier1, [s.session], cash(s.total))
  assert.equal(first.ok, true, first.message)
  const pending = collect(cashier2, [s.session], bank(s.total))
  await h.waitBlocked(cashier2)
  await cashier1.rollback()
  const second = await pending
  assert.equal(second.ok && second.value.already, false, second.message)
  const pays = await paymentsOf([s.session])
  assert.equal(pays.length, 1)
  assert.equal(pays[0].collected_by, fx.users.cashier2)
  await assertClean(assert, fx, '1a xen kẽ rollback')
}))

// ---------------------------------------------------------------------------------------------------
// 1b. CÙNG mã chống trùng gửi hai lần song song (bấm đúp / mạng gửi lại).
// ---------------------------------------------------------------------------------------------------
test(`1b. cùng mã chống trùng gửi hai lần song song: một khoản thu, lần kia already (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const tab1 = await fx.actor('cashier1', 'thu ngân 1 (tab 1)')
  const tab2 = await fx.actor('cashier1', 'thu ngân 1 (tab 2)')
  const losers = tally()
  for (let i = 0; i < ITER; i += 1) {
    const s = await fx.openSession()
    const before = await paymentCount(fx)
    const requestId = rid()
    const [a, b] = await h.race([
      () => collect(tab1, [s.session], cash(s.total), requestId),
      () => collect(tab2, [s.session], cash(s.total), requestId),
    ], 2)
    assert.equal(await paymentCount(fx), before + 1, `vòng ${i}: đúng MỘT khoản thu`)
    assert.equal(a.ok && b.ok, true, `vòng ${i}: ${a.message ?? ''} ${b.message ?? ''}`)
    assert.deepEqual([a.value.already, b.value.already].sort(), [false, true])
    assert.equal(a.value.payment_id, b.value.payment_id)
    losers.add(describe(a.value.already ? a : b))
  }
  report('1b cùng mã, cùng bàn', { 'lần gửi lặp nhận': losers })
  await assertClean(assert, fx, '1b')
}))

test(`1b. cùng mã chống trùng cho HAI bàn khác nhau song song: một bàn được thu, bàn kia báo lỗi rõ (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const { cashier1, cashier2 } = await fx.actors('cashier1', 'cashier2')
  const losers = tally()
  for (let i = 0; i < ITER; i += 1) {
    const s1 = await fx.openSession()
    const s2 = await fx.openSession()
    const before = await paymentCount(fx)
    const requestId = rid()
    const [a, b] = await h.race([
      () => collect(cashier1, [s1.session], cash(s1.total), requestId),
      () => collect(cashier2, [s2.session], cash(s2.total), requestId),
    ], 2)
    assert.equal(await paymentCount(fx), before + 1, `vòng ${i}: đúng MỘT khoản thu`)
    assert.equal([a, b].filter((o) => o.ok).length, 1, `vòng ${i}: đúng một bàn được thu`)
    const loser = a.ok ? b : a
    losers.add(describe(loser))
    assert.match(loser.message, /Mã thu tiền đã dùng cho bill khác/)
    const open = a.ok ? s2 : s1
    assert.equal((await sessionRow(open.session)).status, 'open', 'bàn thua phải còn mở để thu lại')
  }
  report('1b cùng mã, hai bàn khác nhau', { 'bên thua nhận': losers })
  await assertClean(assert, fx, '1b hai bàn')
}))

// ---------------------------------------------------------------------------------------------------
// 1c. Một máy thu tiền trong lúc máy khác thêm món vào CÙNG phiên.
//     Bất biến: không bao giờ có phiên đã thu mà còn đơn chưa thu bên trong.
// ---------------------------------------------------------------------------------------------------
const beers = (fx) => JSON.stringify([{ menu_item_id: fx.menu.beer.id, quantity: 2 }])
const ADDED = 2 * 15000 // 2 bia
const ADDERS = {
  'pos_add_manual_items (thu ngân ghi món tay)': {
    role: 'owner',
    run: (actor, fx, s) => actor.call('public.pos_add_manual_items($1::uuid, $2::jsonb, $3::uuid)',
      [s.session, beers(fx), rid()]),
  },
  'create_order (khách quét QR gọi thêm)': {
    role: 'customer',
    run: (actor, fx, s) => actor.call(
      `public.create_order(p_store_id => $1::uuid, p_table_id => $2::uuid, p_items => $3::jsonb,
                           p_payment_method => 'cash', p_device_id => $4::text)`,
      [fx.store, s.table, beers(fx), `device-${s.session}`]),
  },
  'staff_create_order (nhân viên gọi món hộ)': {
    role: 'staff',
    knownBug: 'staff_create_order phải kiểm lại status = open sau khi chờ khoá phiên (mig 132)',
    run: (actor, fx, s) => actor.call('public.staff_create_order($1::uuid, $2::jsonb, $3::text, $4::uuid)',
      [s.table, beers(fx), 'cash', rid()]),
  },
}

for (const [name, adder] of Object.entries(ADDERS)) {
  test(`1c. thu tiền ‖ ${name}: song song tự nhiên (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
    const cashier = await fx.actor('cashier1')
    const other = await fx.actor(adder.role)
    const collects = tally()
    const adds = tally()
    const leaks = []
    for (let i = 0; i < ITER; i += 1) {
      const s = await fx.openSession()
      // Vòng chẵn: thu ngân bấm thu số CŨ (chưa thấy món mới). Vòng lẻ: thu số ĐÃ GỒM món mới.
      const amount = i % 2 ? s.total + ADDED : s.total
      const [c, a] = await h.race([
        () => collect(cashier, [s.session], cash(amount)),
        () => adder.run(other, fx, s),
      ], 4)
      collects.add(`thu ${i % 2 ? 'số mới' : 'số cũ'}: ${describe(c)}`)
      adds.add(describe(a))
      const row = await sessionRow(s.session)
      if (c.ok) {
        assert.equal(row.close_reason, 'paid')
        const unpaid = await unpaidOrders(s.session)
        if (unpaid.length) leaks.push(`vòng ${i}: thu ${amount}đ xong, còn ${JSON.stringify(unpaid)}; bên thêm món nhận: ${describe(a)}`)
      } else {
        assert.equal(row.status, 'open', `vòng ${i}: thu thất bại thì phiên phải còn mở`)
        assert.match(c.message, /Số tiền không khớp bill/)
      }
    }
    report(`1c thu tiền ‖ ${name} (tự nhiên)`, {
      'bên thu tiền nhận': collects, 'bên thêm món nhận': adds,
      'số vòng lọt đơn chưa thu vào phiên đã thu': `${leaks.length}/${ITER}`,
    })
    assert.deepEqual(leaks, [],
      `phiên ĐÃ THU còn đơn chưa thu bên trong${adder.knownBug ? ` — HỒI QUY lỗi đã vá: ${adder.knownBug}` : ''}`)
    await assertClean(assert, fx, `1c ${name}`, adder.knownBug)
  }))

  test(`1c. thu tiền ‖ ${name}: dựng xen kẽ — lần thu đã giữ khoá phiên, lần thêm món chờ rồi chạy tiếp`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
    const cashier = await fx.actor('cashier1')
    const other = await fx.actor(adder.role)
    const s = await fx.openSession()
    const release = await h.holdStoreRow(fx.store)
    let c, a
    try {
      // (1) Lần thu khoá phiên rồi đứng ở bước 9 (đụng dòng quán đang bị rào).
      const collecting = collect(cashier, [s.session], cash(s.total))
      await h.waitBlocked(cashier)
      // (2) Lần thêm món thấy phiên còn mở, đứng chờ khoá phiên.
      const adding = adder.run(other, fx, s)
      await h.waitBlocked(other)
      // (3) Mở rào: lần thu chạy xong và commit → lần thêm món được chạy tiếp.
      await release()
      c = await collecting
      a = await adding
    } finally {
      await release()
    }
    assert.equal(c.ok && c.value.already, false, c.message)
    report(`1c thu tiền ‖ ${name} (dựng xen kẽ)`, { 'bên thêm món nhận': describe(a) })
    assert.deepEqual(await unpaidOrders(s.session), [],
      'lần thêm món phải bị từ chối vì phiên vừa được thu; thay vào đó đơn mới đã lọt vào phiên ĐÃ THU'
      + (adder.knownBug ? ` — HỒI QUY lỗi đã vá: ${adder.knownBug}` : ''))
    assert.equal(a.ok, false, 'lần thêm món phải nhận lỗi nghiệp vụ')
    await assertClean(assert, fx, `1c xen kẽ ${name}`, adder.knownBug)
  }))
}

// ---------------------------------------------------------------------------------------------------
// 1d. Gộp bill [A, B] ‖ thu lẻ A.
// ---------------------------------------------------------------------------------------------------
test(`1d. gộp bill [A,B] ‖ thu lẻ A: đúng một khoản thu chạm vào A (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const { cashier1, cashier2 } = await fx.actors('cashier1', 'cashier2')
  const merges = tally()
  const singles = tally()
  for (let i = 0; i < ITER; i += 1) {
    const a = await fx.openSession()
    const b = await fx.openSession({ lines: [['beer', 4]] })
    const before = await paymentCount(fx)
    const [m, s] = await h.race([
      () => collect(cashier1, [a.session, b.session], cash(a.total + b.total)),
      () => collect(cashier2, [a.session], bank(a.total)),
    ])
    merges.add(describe(m))
    singles.add(describe(s))
    assert.equal(await paymentCount(fx), before + 1, `vòng ${i}: đúng MỘT khoản thu`)
    const rowA = await sessionRow(a.session)
    const rowB = await sessionRow(b.session)
    assert.equal(rowA.close_reason, 'paid')
    if (m.ok && m.value.already === false) {
      // Gộp thắng: cả hai phiên chung một khoản thu; máy thu lẻ nhận already trỏ đúng khoản đó.
      assert.equal(rowB.bill_payment_id, rowA.bill_payment_id)
      assert.equal(Number(m.value.total), a.total + b.total)
      assert.equal(s.ok && s.value.already, true, s.message)
      assert.equal(s.value.payment_id, rowA.bill_payment_id)
    } else {
      // Thu lẻ thắng: B còn mở nguyên vẹn; máy gộp nhận lỗi rõ ràng.
      assert.equal(s.ok && s.value.already, false, s.message)
      assert.equal(rowB.status, 'open')
      assert.equal(m.ok, false)
      assert.match(m.message, /Có mâm vừa được thu ở máy khác/)
    }
  }
  report('1d gộp [A,B] ‖ thu lẻ A', { 'máy gộp bill nhận': merges, 'máy thu lẻ nhận': singles })
  await assertClean(assert, fx, '1d')
}))

test(`1d. ba lần gộp chéo [A,B] ‖ [B,C] ‖ [C,A]: không deadlock, đúng một khoản thu (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
  const { cashier1, cashier2, owner } = await fx.actors('cashier1', 'cashier2', 'owner')
  const losers = tally()
  for (let i = 0; i < ITER; i += 1) {
    const [a, b, c] = [await fx.openSession(), await fx.openSession(), await fx.openSession()]
    const before = await paymentCount(fx)
    // Truyền id theo thứ tự ngược nhau: RPC phải tự sắp trước khi khoá.
    const results = await h.race([
      () => collect(cashier1, [a.session, b.session], cash(a.total + b.total)),
      () => collect(cashier2, [c.session, b.session], cash(b.total + c.total)),
      () => collect(owner, [c.session, a.session], cash(c.total + a.total)),
    ])
    assert.equal(results.filter((o) => o.ok && o.value.already === false).length, 1, `vòng ${i}: đúng một lần gộp thắng`)
    assert.equal(await paymentCount(fx), before + 1)
    for (const o of results) if (!(o.ok && o.value.already === false)) losers.add(describe(o))
    const open = await h.num(
      "SELECT count(*) FROM table_sessions WHERE id = ANY($1::uuid[]) AND status = 'open'",
      [[a.session, b.session, c.session]])
    assert.equal(open, 1, `vòng ${i}: đúng một phiên còn mở`)
  }
  report('1d ba lần gộp chéo', { 'hai bên thua nhận': losers })
  await assertClean(assert, fx, '1d gộp chéo')
}))

// ---------------------------------------------------------------------------------------------------
// 1e (thêm ngoài đề bài). Thu tiền ‖ sửa bill (bỏ món / sửa số lượng) trên cùng phiên.
//     Hai bên khoá NGƯỢC thứ tự: sửa bill khoá đơn → rồi mới ghi phiên; thu tiền khoá phiên → rồi mới ghi đơn.
// ---------------------------------------------------------------------------------------------------
const EDIT_BUG = 'pos_void_order_item / pos_set_order_item_quantity / pos_restore_order_item phải khoá PHIÊN trước '
  + 'rồi mới khoá ĐƠN, cùng thứ tự với collect_table_bill (mig 132)'
const EDITS = {
  'pos_void_order_item (bỏ món)': (actor, s) => actor.call(
    'public.pos_void_order_item($1::uuid, $2::text, $3::text)', [s.items[1], 'cancelled', 'khách đổi ý']),
  'pos_set_order_item_quantity (sửa số lượng)': (actor, s) => actor.call(
    'public.pos_set_order_item_quantity($1::uuid, $2::integer, $3::text)', [s.items[1], 1, 'ghi nhầm']),
}

for (const [name, edit] of Object.entries(EDITS)) {
  test(`1e. thu tiền ‖ ${name}: song song tự nhiên (${ITER} vòng)`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
    const { cashier1, owner } = await fx.actors('cashier1', 'owner')
    const collects = tally()
    const edits = tally()
    let deadlocked = 0
    for (let i = 0; i < ITER; i += 1) {
      const s = await fx.openSession()
      const [c, e] = await h.race([
        () => collect(cashier1, [s.session], cash(s.total)),
        () => edit(owner, s),
      ], 4)
      collects.add(describe(c))
      edits.add(describe(e))
      if ([c, e].some((o) => !o.ok && o.code === DEADLOCK)) deadlocked += 1
      const row = await sessionRow(s.session)
      if (c.ok) assert.equal(row.close_reason, 'paid')
      else assert.equal(row.status, 'open', `vòng ${i}: thu thất bại thì phiên phải còn mở`)
    }
    report(`1e thu tiền ‖ ${name} (tự nhiên)`, {
      'bên thu tiền nhận': collects, 'bên sửa bill nhận': edits, 'số vòng deadlock': `${deadlocked}/${ITER}`,
    })
    await assertClean(assert, fx, `1e ${name}`, EDIT_BUG)
  }))

  test(`1e. thu tiền ‖ ${name}: dựng xen kẽ — mỗi bên giữ khoá bên kia cần`, { skip: SKIP }, () => h.withStore({}, async (fx) => {
    const { cashier1, owner } = await fx.actors('cashier1', 'owner')
    const s = await fx.openSession()
    const release = await h.holdStoreRow(fx.store)
    let c, e
    try {
      // (1) Lần thu khoá PHIÊN rồi đứng ở bước 9.
      const collecting = collect(cashier1, [s.session], cash(s.total))
      await h.waitBlocked(cashier1)
      // (2) Lần sửa bill khoá ĐƠN rồi đứng chờ: bỏ món chờ khoá PHIÊN (UPDATE last_activity_at); sửa số lượng
      //     chờ sớm hơn ở dòng quán (FK của order_item_quantity_changes) nhưng vẫn đang giữ khoá ĐƠN.
      const editing = edit(owner, s)
      await h.waitBlocked(owner)
      // (3) Mở rào: lần thu đi tiếp tới UPDATE orders → cần khoá ĐƠN mà lần sửa bill đang giữ.
      await release()
      c = await collecting
      e = await editing
    } finally {
      await release()
    }
    report(`1e thu tiền ‖ ${name} (dựng xen kẽ)`, { 'bên thu tiền nhận': describe(c), 'bên sửa bill nhận': describe(e) })
    await assertClean(assert, fx, `1e xen kẽ ${name}`, EDIT_BUG)
  }))
}
