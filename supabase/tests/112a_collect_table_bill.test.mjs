// Mig 112a — thu tiền kết hợp: bảng bill_payments/bill_payment_lines, lõi close_table_session_core (nhân từ
// close_table_session prod) và RPC collect_table_bill dùng cho cả một bàn lẫn gộp bill.
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { openCollectDb } from './helpers/collect-bill-db.mjs'

const migration = new URL('../migrations/112a_collect_table_bill.sql', import.meta.url)
const load = async (u) => (await readFile(u, 'utf8')).replace(/\r\n/g, '\n')

let h, ids, session, order, collect, rid, one, count
before(async () => {
  h = await openCollectDb()
  ;({ ids, session, order, collect, rid, one, count } = h)
})
beforeEach(async () => h.reset())
after(async () => h?.db.close())

const cash = (amount) => ({ instrument: 'cash', amount })
const bank = (amount) => ({ instrument: 'bank', amount })

test('một phương tiện: đóng phiên, tiền mặt lưu số ròng', async () => {
  const s = await session(); const o = await order(s, 100000)
  const r = await collect([s], [cash(100000)], 200000, rid())
  assert.deepEqual([r.ok, r.already, r.total, r.orders_settled], [true, false, 100000, 1])
  const p = await one('SELECT * FROM bill_payments WHERE id = $1', [r.payment_id])
  assert.deepEqual([Number(p.total_amount), p.cash_given, p.change_amount, p.source, p.collected_by],
    [100000, 200000, 100000, 'pos', ids.cashier])
  assert.equal(p.cash_shift_id, null)
  const line = await one('SELECT instrument, amount FROM bill_payment_lines WHERE payment_id = $1', [r.payment_id])
  assert.deepEqual([line.instrument, line.amount], ['cash', 100000])
  const row = await one('SELECT * FROM orders WHERE id = $1', [o])
  assert.deepEqual([row.payment_instrument, row.bill_payment_id, row.status], ['cash', r.payment_id, 'paid'])
  assert.equal(row.payment_received_by, ids.cashier)
  const ss = await one('SELECT * FROM table_sessions WHERE id = $1', [s])
  assert.deepEqual([ss.status, ss.close_reason, ss.bill_payment_id], ['closed', 'paid', r.payment_id])
})

test('kết hợp: 2 dòng, đơn ghi mixed, thối theo phần tiền mặt', async () => {
  const s = await session(); const o = await order(s, 1000000)
  const r = await collect([s], [cash(400000), bank(600000)], 500000, rid())
  assert.equal(await count('bill_payment_lines WHERE payment_id = $1', [r.payment_id]), 2)
  assert.equal((await one('SELECT change_amount FROM bill_payments WHERE id = $1', [r.payment_id])).change_amount, 100000)
  assert.equal((await one('SELECT payment_instrument FROM orders WHERE id = $1', [o])).payment_instrument, 'mixed')
})

test('chuyển khoản một phương tiện: đơn ghi bank, không có tiền khách đưa', async () => {
  const s = await session(); const o = await order(s, 50000)
  const r = await collect([s], [bank(50000)], null, rid())
  const p = await one('SELECT cash_given, change_amount FROM bill_payments WHERE id = $1', [r.payment_id])
  assert.deepEqual([p.cash_given, p.change_amount], [null, null])
  assert.equal((await one('SELECT payment_instrument FROM orders WHERE id = $1', [o])).payment_instrument, 'bank')
})

test('lệch một đồng: huỷ toàn bộ, không ghi gì', async () => {
  const s = await session(); const o = await order(s, 100000)
  await assert.rejects(collect([s], [cash(99999)], null, rid()), /Số tiền không khớp bill/)
  assert.equal(await count('bill_payments'), 0)
  assert.equal(await count('bill_payment_lines'), 0)
  assert.equal((await one('SELECT payment_received_at FROM orders WHERE id = $1', [o])).payment_received_at, null)
  assert.equal((await one('SELECT status FROM table_sessions WHERE id = $1', [s])).status, 'open')
})

test('gộp 2 mâm có giảm giá: chia xong mới so ở cấp cả nhóm', async () => {
  const a = await session({ discount: ['percent', 10] }); await order(a, 155000)
  const b = await session(); await order(b, 60000)
  const r = await collect([a, b], [cash(100000), bank(99500)], null, rid())
  assert.equal(r.total, 199500)
  assert.equal(r.orders_settled, 2)
  assert.equal((await one('SELECT sum(bill_discount_amount)::int v FROM orders WHERE session_id = $1', [a])).v, 15500)
  assert.equal(await count('table_sessions WHERE bill_payment_id = $1', [r.payment_id]), 2)
})

test('chỉ tính phần thu lần này: đơn đã thu trước không vào tổng', async () => {
  const s = await session(); const old = await order(s, 50000, { paid: true }); await order(s, 80000)
  await assert.rejects(collect([s], [cash(130000)], null, rid()), /Số tiền không khớp bill/)
  const r = await collect([s], [cash(80000)], null, rid())
  assert.equal(r.total, 80000)
  assert.equal((await one('SELECT bill_payment_id FROM orders WHERE id = $1', [old])).bill_payment_id, null)
})

test('gọi lại cùng mã: trả kết quả cũ, không tạo khoản thứ hai', async () => {
  const s = await session(); await order(s, 100000); const id = rid()
  const a = await collect([s], [cash(100000)], null, id)
  const b = await collect([s], [cash(100000)], null, id)
  assert.deepEqual([b.already, b.payment_id, b.total, b.orders_settled], [true, a.payment_id, 100000, 1])
  assert.equal(await count('bill_payments'), 1)
  const other = await session(); await order(other, 1000)
  await assert.rejects(collect([other], [cash(1000)], null, id), /đã dùng cho bill khác/)
})

test('cùng mã, hai nhóm phiên khác nhau, chạy song song: máy sau vấp UNIQUE → lỗi tiếng Việt, không ghi gì', async () => {
  // PGlite một kết nối nên không chạy song song thật. Giả lập: máy kia commit khoản thu cùng mã đúng lúc
  // máy này đã qua bước 4 (tra mã) — trigger chèn trước một dòng trùng (store_id, client_request_id).
  await h.db.exec(`
    CREATE FUNCTION pg_temp.race_dup() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF pg_trigger_depth() = 1 THEN
        INSERT INTO public.bill_payments (store_id, client_request_id, total_amount, source)
        VALUES (NEW.store_id, NEW.client_request_id, 0, 'pos');
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER race_dup BEFORE INSERT ON public.bill_payments FOR EACH ROW EXECUTE FUNCTION pg_temp.race_dup();
  `)
  try {
    const s = await session(); await order(s, 1000)
    await assert.rejects(collect([s], [cash(1000)], null, rid()), (e) => {
      assert.match(e.message, /^Mã thu tiền đã dùng cho bill khác$/)
      return true
    })
  } finally {
    await h.db.exec('DROP TRIGGER race_dup ON public.bill_payments')
  }
  assert.equal(await count('bill_payments'), 0)
})

test('hai máy: một mâm đã thu thì không thu nửa nhóm; thu hết rồi thì báo already', async () => {
  const a = await session(); await order(a, 1000); const b = await session(); await order(b, 2000)
  await collect([a], [cash(1000)], null, rid())
  await assert.rejects(collect([a, b], [cash(2000)], null, rid()), /vừa được thu ở máy khác/)
  assert.equal((await one('SELECT status FROM table_sessions WHERE id = $1', [b])).status, 'open')
  await collect([b], [cash(2000)], null, rid())
  const r = await collect([a, b], [cash(3000)], null, rid())
  assert.deepEqual([r.already, r.orders_settled, r.total, r.payment_id], [true, 0, 3000, null])
  assert.equal(await count('bill_payments'), 2)
})

test('phiên hết hạn: thu được, bỏ qua giảm giá; số sau giảm bị từ chối', async () => {
  const s = await session({ expired: true, discount: ['amount', 10000] }); await order(s, 100000)
  await assert.rejects(collect([s], [cash(90000)], null, rid()), /Số tiền không khớp bill/)
  assert.equal((await collect([s], [cash(100000)], null, rid())).total, 100000)
  const ss = await one('SELECT status, close_reason FROM table_sessions WHERE id = $1', [s])
  assert.deepEqual([ss.status, ss.close_reason], ['closed', 'paid'])
})

test('phiên đã bỏ hoặc đã nhập mâm: không thu', async () => {
  for (const reason of ['staff_reset', 'merged']) {
    const s = await session({ closeReason: reason })
    await assert.rejects(collect([s], [], null, rid()), /Phiên đã đóng/)
  }
})

test('bill 0đ: lines rỗng thu được; còn tiền mà lines rỗng thì không', async () => {
  const s = await session(); await order(s, 0)
  const r = await collect([s], [], null, rid())
  assert.deepEqual([r.ok, r.total], [true, 0])
  assert.equal(await count('bill_payment_lines WHERE payment_id = $1', [r.payment_id]), 0)
  const t = await session(); await order(t, 5000)
  await assert.rejects(collect([t], [], null, rid()), /Số tiền không khớp bill/)
})

test('đầu vào xấu bị chặn, lỗi tiếng Việt', async () => {
  const s = await session(); await order(s, 1000)
  for (const lines of [[{ instrument: 'wallet', amount: 1000 }], [cash(0)], [cash(-1)], [{ instrument: 'cash', amount: 1.5 }],
    [{ instrument: 'cash', amount: '1000' }], {}, null, [cash(1), bank(1), cash(1)], [cash(2000000001)]]) {
    await assert.rejects(collect([s], lines, null, rid()), /Khoản thu không hợp lệ/)
  }
  await assert.rejects(collect([s], [cash(500), cash(500)], null, rid()), /Mỗi phương tiện chỉ ghi một khoản/)
  await assert.rejects(collect([s], [cash(1000)], 999, rid()), /Tiền khách đưa thiếu/)
  await assert.rejects(collect([s], [bank(1000)], 1000, rid()), /Không có phần tiền mặt/)
  await assert.rejects(collect([s], [cash(1000)], null, null), /Thiếu mã chống thu trùng/)
  await assert.rejects(collect([], [cash(1000)], null, rid()), /Chưa chọn phiên nào/)
  await assert.rejects(collect([rid()], [cash(1000)], null, rid()), /Không tìm thấy phiên/)
  assert.equal(await count('bill_payments'), 0)
})

test('còn lượt chờ duyệt thì không thu', async () => {
  const s = await session(); await order(s, 1000, { status: 'pending' })
  await assert.rejects(collect([s], [cash(1000)], null, rid()), /chưa được chủ quán xác nhận/)
  assert.equal(await count('bill_payments'), 0)
})

test('phiên khác quán trong cùng nhóm: chặn', async () => {
  const s = await session()
  const x = rid()
  await h.db.query(`INSERT INTO table_sessions(id, store_id, status) VALUES ($1, $2, 'open')`, [x, ids.otherStore])
  await assert.rejects(collect([s, x], [], null, rid()), /không cùng một quán/)
})

test('quyền: phục vụ, quán khác bị chặn; anon không gọi được; lõi không ai gọi thẳng được', async () => {
  const s = await session(); await order(s, 1000)
  for (const uid of [ids.staff, ids.otherOwner]) {
    await assert.rejects(collect([s], [cash(1000)], null, rid(), uid), /Chỉ chủ quán hoặc thu ngân/)
  }
  await assert.rejects(collect([s], [cash(1000)], null, rid(), null), /Thiếu danh tính người chốt bill/)
  // chủ quán thu được như thu ngân
  assert.equal((await collect([s], [cash(1000)], null, rid(), ids.owner)).ok, true)
  const can = async (role, fn) => (await one('SELECT has_function_privilege($1, $2, \'EXECUTE\') v', [role, fn])).v
  const collectSig = 'collect_table_bill(uuid[],jsonb,integer,uuid)'
  const coreSig = 'close_table_session_core(uuid,text,text,uuid)'
  assert.equal(await can('anon', collectSig), false)
  assert.equal(await can('authenticated', collectSig), true)
  assert.equal(await can('anon', coreSig), false)
  assert.equal(await can('authenticated', coreSig), false)
})

test('bảng mới: bật RLS, authenticated chỉ SELECT, anon không có quyền', async () => {
  for (const t of ['bill_payments', 'bill_payment_lines']) {
    assert.equal((await one('SELECT relrowsecurity v FROM pg_class WHERE oid = $1::regclass', [t])).v, true)
    const priv = async (role, p) => (await one('SELECT has_table_privilege($1, $2, $3) v', [role, t, p])).v
    assert.equal(await priv('authenticated', 'SELECT'), true)
    assert.equal(await priv('authenticated', 'INSERT'), false)
    assert.equal(await priv('anon', 'SELECT'), false)
  }
  // Ràng buộc phương tiện có tên cố định: mig 123 (công nợ) sẽ drop/thêm lại để cho 'debt'.
  assert.ok(await one(`SELECT 1 FROM pg_constraint WHERE conname = 'bill_payment_lines_instrument_check'`))
})

test('RLS: thu ngân thấy khoản thu quán mình, chủ quán khác không thấy', async () => {
  const s = await session(); await order(s, 1000)
  await collect([s], [cash(1000)], null, rid())
  const seen = async (uid) => {
    await h.login(uid)
    try {
      return [await count('bill_payments'), await count('bill_payment_lines')]
    } finally { await h.db.exec('RESET ROLE') }
  }
  assert.deepEqual(await seen(ids.cashier), [1, 1])
  assert.deepEqual(await seen(ids.otherOwner), [0, 0])
})

test('lõi bắt buộc có khoản thu; close_table_session cũ vẫn chạy như trước (chưa khoá đường cũ)', async () => {
  const s = await session(); await order(s, 1000)
  // Gọi lõi bằng quyền chủ DB (authenticated không có EXECUTE), danh tính thu ngân vẫn giữ trong claim.
  await h.login(ids.cashier); await h.db.exec('RESET ROLE')
  await assert.rejects(h.db.query(`SELECT close_table_session_core($1, 'paid', 'cash', NULL)`, [s]), /Thiếu khoản thu/)
  await h.login(ids.cashier)
  try {
    const r = (await h.db.query(`SELECT close_table_session($1, 'paid', 'cash') r`, [s])).rows[0].r
    assert.equal(r.ok, true)
  } finally { await h.db.exec('RESET ROLE') }
  assert.equal((await one('SELECT bill_payment_id FROM table_sessions WHERE id = $1', [s])).bill_payment_id, null)
})

test('mig 112a: cấu trúc file — bọc transaction, neo từ prod, INSERT bill_payments một dòng sau mọi nhánh already', async () => {
  const sql = await load(migration)
  assert.match(sql, /^(--[^\n]*\n|\s*\n)*BEGIN;/)
  assert.match(sql, /COMMIT;\s*$/)
  assert.doesNotMatch(sql, /rerun-safe/i)
  // close_table_session không đổi ở mig này (chuỗi neo $a$...$a$ không tính: nó không đứng đầu dòng)
  assert.doesNotMatch(sql, /^CREATE OR REPLACE FUNCTION public\.close_table_sessions?\(/m)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.close_table_session_core\(uuid, ?text, ?text, ?uuid\) FROM PUBLIC, anon, authenticated;/)
  // Chỉ thân collect_table_bill: dừng ở $function$; của chính nó, khối nối thêm sau không ảnh hưởng.
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.collect_table_bill(')
  const end = sql.indexOf('$function$;', start)
  assert.ok(start > 0 && end > start)
  const body = sql.slice(start, end)
  const ins = body.match(/INSERT INTO public\.bill_payments \(([^)\n]*)\)\n\s*VALUES \(([^\n]*)\)/)
  assert.ok(ins, 'INSERT INTO public.bill_payments (...) VALUES (...) phải nằm gọn: cột một dòng, giá trị một dòng')
  const cols = ins[1].split(',').map((c) => c.trim())
  const vals = ins[2].split(',').map((c) => c.trim())
  assert.equal(cols.length, vals.length)
  assert.equal(vals[cols.indexOf('cash_shift_id')], 'NULL')
  assert.equal(body.split('INSERT INTO public.bill_payments').length - 1, 1)
  const iInsert = body.indexOf('INSERT INTO public.bill_payments')
  const lastAlready = body.lastIndexOf("'already', true")
  assert.ok(lastAlready > 0 && lastAlready < iInsert, 'INSERT phải đứng sau mọi nhánh already')
})
