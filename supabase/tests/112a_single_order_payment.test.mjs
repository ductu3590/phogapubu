// Mig 112a (Task 2) — đơn không phiên xác nhận tay (chủ quán: confirm_manual_payment, bếp: kitchen_confirm_payment)
// cũng ghi một bill_payments một dòng, phương tiện suy từ payment_method, để két và báo cáo đọc một nguồn.
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { openCollectDb } from './helpers/collect-bill-db.mjs'

const migration = new URL('../migrations/112a_collect_table_bill.sql', import.meta.url)
const load = async (u) => (await readFile(u, 'utf8')).replace(/\r\n/g, '\n')

let h, ids, session, order, confirm, kitchenConfirm, one, count
before(async () => {
  h = await openCollectDb()
  ;({ ids, session, order, confirm, kitchenConfirm, one, count } = h)
})
beforeEach(async () => h.reset())
after(async () => h?.db.close())

test('owner xác nhận đơn tiền mặt: một khoản một dòng, gọi lại không tạo thêm', async () => {
  const o = await order(null, 70000, { method: 'cash' })
  await confirm(o)
  const again = await confirm(o)
  assert.equal(again.already, true)
  assert.equal(await count('bill_payments'), 1)
  const p = await one('SELECT * FROM bill_payments')
  assert.deepEqual([p.source, p.collected_by, Number(p.total_amount)], ['manual_order', ids.owner, 70000])
  assert.deepEqual([p.cash_shift_id, p.client_request_id, p.cash_given, p.change_amount], [null, null, null, null])
  const l = await one('SELECT * FROM bill_payment_lines WHERE payment_id = $1', [p.id])
  assert.deepEqual([l.instrument, l.amount], ['cash', 70000])
  const row = await one('SELECT bill_payment_id, payment_instrument FROM orders WHERE id = $1', [o])
  assert.deepEqual([row.bill_payment_id, row.payment_instrument], [p.id, 'cash'])
})

test('phương tiện suy từ payment_method, không đọc payment_instrument ghi sẵn', async () => {
  const a = await order(null, 1000, { method: 'bank_transfer', instrument: 'cash' })
  const b = await order(null, 2000, { method: 'zalo_checkout', instrument: null })
  await confirm(a); await confirm(b)
  assert.equal(await count("bill_payment_lines WHERE instrument = 'bank'"), 2)
  assert.equal(await count("orders WHERE payment_instrument = 'bank' AND bill_payment_id IS NOT NULL"), 2)
})

test('bếp xác nhận: source kitchen, collected_by NULL', async () => {
  const o = await order(null, 3000, { method: 'zalo_checkout', instrument: 'bank' })
  await kitchenConfirm(o)
  const p = await one('SELECT id, source, collected_by FROM bill_payments')
  assert.deepEqual([p.source, p.collected_by], ['kitchen', null])
  const row = await one('SELECT bill_payment_id, payment_received_via, payment_received_by FROM orders WHERE id = $1', [o])
  assert.deepEqual([row.bill_payment_id, row.payment_received_via, row.payment_received_by], [p.id, 'kitchen', null])
  assert.equal((await kitchenConfirm(o)).already, true)
  assert.equal(await count('bill_payments'), 1)
})

test('đơn 0đ: ghi nhận tiền, không tạo khoản thu', async () => {
  const o = await order(null, 0, { method: 'cash' })
  await confirm(o)
  assert.equal(await count('bill_payments'), 0)
  const row = await one('SELECT payment_received_at, bill_payment_id FROM orders WHERE id = $1', [o])
  assert.ok(row.payment_received_at)
  assert.equal(row.bill_payment_id, null)
})

test('mig 110 vẫn chặn thu lẻ đơn của phiên đang mở', async () => {
  // bank_transfer: bếp không vướng cờ "không được xác nhận tiền mặt" trước khi tới chặn của mig 110
  const s = await session(); const o = await order(s, 1000, { method: 'bank_transfer' })
  await assert.rejects(confirm(o), /thu cả bàn một lần/)
  await assert.rejects(kitchenConfirm(o), /thu cả bàn một lần/)
  assert.equal(await count('bill_payments'), 0)
})

test('hai hàm khoá dòng đơn trước khi đọc, chống ghi hai khoản khi bấm song song', async () => {
  for (const fn of ['confirm_manual_payment(uuid)', 'kitchen_confirm_payment(uuid)']) {
    const { def } = await one('SELECT pg_get_functiondef($1::regprocedure) def', [fn])
    assert.match(def, /select \* into v_order from orders where id = p_order_id[^;]*for update;/)
  }
})

test('quyền: attach_order_payment là nội bộ; quyền EXECUTE của 2 hàm vá giữ nguyên', async () => {
  const can = async (role, fn) => (await one('SELECT has_function_privilege($1, $2, \'EXECUTE\') v', [role, fn])).v
  for (const role of ['anon', 'authenticated', 'kitchen']) {
    assert.equal(await can(role, 'attach_order_payment(uuid,uuid)'), false, role)
  }
  assert.equal(await can('authenticated', 'confirm_manual_payment(uuid)'), true)
  assert.equal(await can('kitchen', 'kitchen_confirm_payment(uuid)'), true)
  assert.equal(await can('anon', 'confirm_manual_payment(uuid)'), false)
})

test('mig 112a: vá 2 hàm bằng mevo_patch; INSERT bill_payments một dòng, cash_shift_id NULL, sau nhánh already', async () => {
  const sql = await load(migration)
  assert.doesNotMatch(sql, /^CREATE OR REPLACE FUNCTION public\.(confirm_manual_payment|kitchen_confirm_payment)\b/m)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.attach_order_payment\(uuid, ?uuid\) FROM PUBLIC, anon, authenticated;/)
  const patched = [...sql.matchAll(/pg_temp\.mevo_patch\(\s*'([^']+)'/g)].map((m) => m[1])
  assert.deepEqual([...new Set(patched)].sort(), ['public.confirm_manual_payment(uuid)', 'public.kitchen_confirm_payment(uuid)'])
  assert.ok(sql.indexOf('pg_temp.mevo_patch(') < sql.indexOf('COMMIT;'))

  for (const [fn, who, src] of [['confirm_manual_payment(uuid)', 'auth.uid()', 'manual_order'],
    ['kitchen_confirm_payment(uuid)', 'NULL', 'kitchen']]) {
    const { def } = await one('SELECT pg_get_functiondef($1::regprocedure) def', [fn])
    const ins = def.match(/insert into public\.bill_payments \(([^)\n]*)\)\n\s*values \(([^\n]*)\)/)
    assert.ok(ins, `${fn}: INSERT bill_payments phải nằm gọn cột một dòng, giá trị một dòng`)
    const cols = ins[1].split(',').map((c) => c.trim())
    const vals = ins[2].split(',').map((c) => c.trim())
    assert.equal(vals[cols.indexOf('cash_shift_id')], 'NULL')
    assert.equal(vals[cols.indexOf('collected_by')], who)
    assert.equal(vals[cols.indexOf('source')], `'${src}'`)
    assert.equal(def.split('insert into public.bill_payments').length - 1, 1, `${fn}: đúng một INSERT`)
    assert.ok(def.lastIndexOf("'already', true") < def.indexOf('insert into public.bill_payments'),
      `${fn}: INSERT phải đứng sau nhánh already`)
  }
})
