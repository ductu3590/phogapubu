// Mig 112b — khoá đường thu cũ sau khi Vercel đã lên code gọi collect_table_bill:
//   • close_table_session(s) chỉ còn nhánh 'staff_reset' (Bỏ bàn); 'paid' báo tải lại trang.
//   • Trigger chặn client (anon / authenticated / kitchen) UPDATE thẳng cột tiền của đơn.
import { after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { openCollectDb } from './helpers/collect-bill-db.mjs'

const migration = new URL('../migrations/112b_lock_old_paid_path.sql', import.meta.url)
const load = async (u) => (await readFile(u, 'utf8')).replace(/\r\n/g, '\n')

const h = await openCollectDb({ lock: true })
const { db, ids, login, session, order, collect, confirm, kitchenConfirm, rid, one, count } = h
beforeEach(async () => h.reset())
after(async () => db.close())

test('thu bằng đường cũ bị từ chối, đơn không đổi', async () => {
  const s = await session(); const o = await order(s, 1000)
  await login(ids.cashier)
  await assert.rejects(db.query("SELECT close_table_session($1, 'paid', 'cash')", [s]), /tải lại trang/)
  await assert.rejects(db.query("SELECT close_table_sessions_bulk($1::uuid[], 'paid', 'cash')", [[s]]), /tải lại trang/)
  await db.exec('RESET ROLE')
  assert.equal((await one('SELECT payment_received_at FROM orders WHERE id = $1', [o])).payment_received_at, null)
  assert.equal((await one('SELECT status FROM table_sessions WHERE id = $1', [s])).status, 'open')
  assert.equal(await count('bill_payments'), 0)
})

test('Bỏ bàn vẫn chạy, không tạo khoản thu', async () => {
  const s = await session(); await order(s, 1000)
  await login(ids.cashier)
  const r = (await db.query("SELECT close_table_session($1, 'staff_reset', NULL) v", [s])).rows[0].v
  await db.exec('RESET ROLE')
  assert.equal(r.orders_cancelled, 1)
  assert.equal((await one('SELECT close_reason FROM table_sessions WHERE id = $1', [s])).close_reason, 'staff_reset')
  assert.equal(await count('bill_payments'), 0)
})

test('Bỏ bàn hàng loạt vẫn chạy; phục vụ vẫn bị chặn như trước', async () => {
  const a = await session(); await order(a, 1000); const b = await session(); await order(b, 2000)
  await login(ids.staff)
  await assert.rejects(db.query("SELECT close_table_session($1, 'staff_reset', NULL)", [a]), /Chỉ chủ quán/)
  await login(ids.cashier)
  const r = (await db.query("SELECT close_table_sessions_bulk($1::uuid[], 'staff_reset') v", [[a, b]])).rows[0].v
  await db.exec('RESET ROLE')
  assert.deepEqual([r.sessions, r.orders_cancelled], [2, 2])
})

test('chủ quán không UPDATE thẳng được cột tiền của đơn', async () => {
  const o = await order(null, 1000, { method: 'cash' })
  await login(ids.owner)
  for (const set of ['payment_received_at = now()', "payment_received_via = 'owner'", `payment_received_by = '${ids.owner}'`,
    "payment_instrument = 'bank'", `bill_payment_id = '${rid()}'`]) {
    await assert.rejects(db.query(`UPDATE orders SET ${set} WHERE id = $1`, [o]), /Không ghi tiền trực tiếp/, set)
  }
  await db.query("UPDATE orders SET status = 'confirmed' WHERE id = $1", [o]) // cột khác vẫn sửa được
  await db.query('UPDATE orders SET payment_instrument = payment_instrument WHERE id = $1', [o]) // không đổi giá trị: không chặn
  await db.exec('RESET ROLE')
  assert.equal((await one('SELECT status FROM orders WHERE id = $1', [o])).status, 'confirmed')
})

test('anon và bếp (role kitchen) cũng bị chặn; service_role (checkout-notify) thì không', async () => {
  const o = await order(null, 1000, { method: 'zalo_checkout', instrument: 'wallet' })
  await db.exec('GRANT SELECT, UPDATE ON orders TO anon, kitchen')
  try {
    for (const role of ['anon', 'kitchen']) {
      await db.exec(`SET ROLE ${role}`)
      await assert.rejects(db.query('UPDATE orders SET payment_received_at = now() WHERE id = $1', [o]),
        /Không ghi tiền trực tiếp/, role)
      await db.exec('RESET ROLE')
    }
  } finally {
    await db.exec('RESET ROLE')
    await db.exec('REVOKE SELECT, UPDATE ON orders FROM anon, kitchen')
  }
  await db.exec('SET ROLE service_role')
  await db.query("UPDATE orders SET payment_received_at = now(), payment_received_via = 'zalo_callback' WHERE id = $1", [o])
  await db.exec('RESET ROLE')
  assert.ok((await one('SELECT payment_received_at FROM orders WHERE id = $1', [o])).payment_received_at)
})

test('đường mới vẫn thu được sau khi khoá: collect, chủ quán xác nhận tay, bếp xác nhận', async () => {
  const s = await session(); await order(s, 1000)
  assert.equal((await collect([s], [{ instrument: 'bank', amount: 1000 }], null, rid())).total, 1000)
  const a = await order(null, 2000, { method: 'cash' })
  assert.equal((await confirm(a)).ok, true)
  const b = await order(null, 3000, { method: 'bank_transfer' })
  assert.equal((await kitchenConfirm(b)).ok, true)
  assert.equal(await count('bill_payments'), 3)
})

test('khối $pre$: dừng khi thiếu collect_table_bill hoặc có hàm SECURITY INVOKER client gọi được ghi tiền', async () => {
  const x = await openCollectDb()
  try {
    const sql = await readFile(migration, 'utf8')
    // Hàm thường (SECURITY INVOKER), authenticated gọi được, ghi thẳng payment_received_at → trigger sẽ làm hỏng nó.
    await x.db.exec(`CREATE FUNCTION public.bad_mark_paid(p uuid) RETURNS void LANGUAGE sql AS
      $$ UPDATE public.orders SET payment_received_at = now() WHERE id = p $$;`)
    await assert.rejects(x.db.exec(sql), /mig 112b: hàm SECURITY INVOKER ghi cột tiền: (public\.)?bad_mark_paid\(uuid\)/)
    await x.db.exec('ROLLBACK')
    // Hàm nội bộ đã REVOKE khỏi client (như attach_order_payment) thì không tính.
    await x.db.exec('REVOKE ALL ON FUNCTION public.bad_mark_paid(uuid) FROM PUBLIC, anon, authenticated, service_role')
    await x.db.exec('DROP FUNCTION public.collect_table_bill(uuid[], jsonb, integer, uuid)')
    await assert.rejects(x.db.exec(sql), /mig 112b: thiếu public\.collect_table_bill/)
    await x.db.exec('ROLLBACK')
    // Lỗi ở $pre$ thì không có gì đổi: close_table_session vẫn là bản cũ.
    const { def } = await x.one("SELECT pg_get_functiondef('public.close_table_session(uuid,text,text)'::regprocedure) def")
    assert.doesNotMatch(def, /tải lại trang/)
  } finally {
    await x.db.close()
  }
})

test('block_client_money_write phải là SECURITY INVOKER: DEFINER thì current_user luôn là chủ hàm, chặn mất tác dụng', async () => {
  const r = await one("SELECT prosecdef FROM pg_proc WHERE oid = 'public.block_client_money_write()'::regprocedure")
  assert.equal(r.prosecdef, false)
})

test('quyền EXECUTE của close_table_session(s) giữ nguyên sau khi thay thân', async () => {
  const can = async (role, fn) => (await one('SELECT has_function_privilege($1, $2, \'EXECUTE\') v', [role, fn])).v
  assert.equal(await can('authenticated', 'close_table_session(uuid,text,text)'), true)
  assert.equal(await can('authenticated', 'close_table_sessions_bulk(uuid[],text,text)'), true)
})

test('mig 112b: cấu trúc file', async () => {
  const sql = await load(migration)
  assert.match(sql, /^(--[^\n]*\n|\s*\n)*BEGIN;/)
  assert.match(sql, /COMMIT;\s*$/)
  assert.match(sql, /NOTIFY pgrst, 'reload schema';/)
  assert.doesNotMatch(sql, /rerun-safe/i)
  assert.match(sql, /SAU khi Vercel/)
  assert.ok(sql.indexOf('DO $pre$') < sql.indexOf('CREATE OR REPLACE FUNCTION public.close_table_session('))
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.close_table_session\(p_session_id uuid, p_reason text, p_instrument text DEFAULT NULL::text\)/)
  assert.doesNotMatch(sql, /DROP FUNCTION/i)
  // Không đụng dữ liệu
  assert.doesNotMatch(sql, /^\s*(UPDATE|DELETE|INSERT)\b/im)
})
