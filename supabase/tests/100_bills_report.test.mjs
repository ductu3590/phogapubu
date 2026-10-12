import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Test mig 100 (A04-1): RPC get_bills_report cho trang "Hoá đơn & Báo cáo".
// Schema tối thiểu — chỉ các cột RPC đọc. Ngày cố định 2026-10-01 (giờ VN) cho bill đã thu;
// phần "Chờ thu" phụ thuộc hôm nay nên tính ngày hôm nay bằng SQL.
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const owner = id(1), cashier = id(2), staff = id(3), otherOwner = id(4)
const store = id(10), otherStore = id(11)
const t1 = id(21), t2 = id(22), t3 = id(23), t4 = id(24)
let seq = 1000
const newId = () => id(seq++)
const DAY = '2026-10-01'
const at = (hhmm) => `${DAY} ${hhmm}:00+07`

async function login(uid) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid])
  await db.exec('SET ROLE authenticated')
}
async function report(date = DAY, storeId = store) {
  await login(owner)
  try {
    return (await db.query('SELECT get_bills_report($1, $2::date) AS r', [storeId, date])).rows[0].r
  } finally {
    await db.exec('RESET ROLE')
  }
}
async function todayVn() {
  return (await db.query("SELECT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text AS d")).rows[0].d
}

// Phiên trả sau đã thu: các đơn nhận tiền cùng lúc `paidAt` (như close_table_session ghi now()).
async function paidSession({ tables, paidAt, closedAt = paidAt, instrument = 'cash', amounts = [100000], openedAt = at('17:00') }) {
  const s = newId()
  await db.query(`INSERT INTO table_sessions(id, store_id, table_id, status, opened_at, closed_at, closed_by, close_reason)
    VALUES ($1, $2, $3, 'closed', $4, $5, $6, 'paid')`, [s, store, tables[0], openedAt, closedAt, cashier])
  for (const t of tables) await db.query('INSERT INTO session_tables(session_id, table_id, is_open) VALUES ($1, $2, false)', [s, t])
  for (const amount of amounts) {
    await db.query(`INSERT INTO orders(id, store_id, table_id, session_id, status, total_amount, payment_method, payment_instrument,
      payment_received_at, payment_received_by, order_type, order_source, created_at)
      VALUES ($1, $2, $3, $4, 'paid', $5, 'cash', $6, $7, $8, 'dine_in', 'customer', $9)`,
    [newId(), store, tables[0], s, amount, instrument, paidAt, cashier, openedAt])
  }
  return s
}

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE stores(id uuid PRIMARY KEY);
    CREATE TABLE mevo_operators(user_id uuid PRIMARY KEY, store_id uuid, role text, is_active boolean DEFAULT true);
    CREATE FUNCTION is_store_pos_operator(p_store_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS(SELECT 1 FROM mevo_operators WHERE user_id = auth.uid() AND store_id = p_store_id
        AND role IN ('store_owner','store_cashier') AND is_active)
    $$;
    CREATE TABLE tables(id uuid PRIMARY KEY, store_id uuid, table_number text);
    CREATE TABLE table_sessions(
      id uuid PRIMARY KEY, store_id uuid NOT NULL, table_id uuid, status text NOT NULL DEFAULT 'open',
      opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, closed_by uuid, close_reason text,
      is_open_ordering boolean NOT NULL DEFAULT false
    );
    CREATE TABLE session_tables(session_id uuid, table_id uuid, is_open boolean NOT NULL DEFAULT true);
    CREATE TABLE reservations(id uuid PRIMARY KEY, store_id uuid, session_id uuid, customer_name text, party_size integer, arrived_at timestamptz);
    CREATE TABLE orders(
      id uuid PRIMARY KEY, store_id uuid NOT NULL, table_id uuid, session_id uuid, status text NOT NULL,
      total_amount integer NOT NULL DEFAULT 0, discount_amount integer DEFAULT 0, payment_method text NOT NULL DEFAULT 'cash',
      payment_instrument text, payment_received_at timestamptz, payment_received_by uuid,
      order_type text NOT NULL DEFAULT 'dine_in', order_source text NOT NULL DEFAULT 'customer',
      customer_name text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz, rejected_at timestamptz, rejection_reason_code text, rejection_reason_note text
    );
    CREATE TABLE order_items(
      id uuid PRIMARY KEY, order_id uuid NOT NULL, item_name text NOT NULL, item_price integer NOT NULL,
      quantity integer NOT NULL, selected_toppings jsonb, void_type text, voided_at timestamptz, voided_by uuid, void_reason text
    );
    CREATE TABLE order_item_quantity_changes(
      id uuid PRIMARY KEY, store_id uuid, order_id uuid, order_item_id uuid, item_name text,
      old_quantity integer, new_quantity integer, reason text, changed_by uuid, changed_at timestamptz
    );
    INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
      ('${owner}', 'chu@quan.vn', '{}'), ('${cashier}', 'thungan@quan.vn', '{"full_name":"Thu ngân Lan"}'),
      ('${staff}', 'nv@quan.vn', '{}'), ('${otherOwner}', 'khac@quan.vn', '{}');
    INSERT INTO stores VALUES ('${store}'), ('${otherStore}');
    INSERT INTO mevo_operators VALUES
      ('${owner}', '${store}', 'store_owner', true), ('${cashier}', '${store}', 'store_cashier', true),
      ('${staff}', '${store}', 'store_staff', true), ('${otherOwner}', '${otherStore}', 'store_owner', true);
    INSERT INTO tables VALUES ('${t1}', '${store}', 'Bàn 1'), ('${t2}', '${store}', 'Bàn 2'),
      ('${t3}', '${store}', 'Bàn 3'), ('${t4}', '${store}', 'Bàn 4');
  `)
  await db.exec(await readFile(new URL('../migrations/100_bills_report.sql', import.meta.url), 'utf8'))
  await db.exec('GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated')
})

after(async () => db.close())

test('quyền: chủ quán + thu ngân xem được; phục vụ và chủ quán khác bị chặn', async () => {
  for (const uid of [owner, cashier]) {
    await login(uid)
    await db.query('SELECT get_bills_report($1, $2::date)', [store, DAY])
  }
  for (const uid of [staff, otherOwner]) {
    await login(uid)
    await assert.rejects(db.query('SELECT get_bills_report($1, $2::date)', [store, DAY]), /Không có quyền/)
  }
  await db.exec('RESET ROLE')
})

test('gộp bill 2 mâm thu trong một lần → MỘT dòng, đủ 2 phiên, tổng cộng dồn', async () => {
  const paid = at('18:30')
  const a = await paidSession({ tables: [t1], paidAt: paid, amounts: [100000, 50000] })
  const b = await paidSession({ tables: [t2], paidAt: paid, amounts: [200000] })
  const r = await report()
  const bill = r.bills.find((x) => x.session_ids.includes(a))
  assert.ok(bill)
  assert.deepEqual([...bill.session_ids].sort(), [a, b].sort())
  assert.equal(bill.merged, true)
  assert.equal(bill.total, 350000)
  assert.equal(bill.table_label, 'Bàn 1, Bàn 2')
  assert.equal(bill.received_by_name, 'Thu ngân Lan')
})

test('phiên hết hạn (cùng closed_at) rồi thu RIÊNG từng bàn → HAI dòng (vá lỗi gom bill của 092)', async () => {
  const expiredAt = at('15:00')
  const a = await paidSession({ tables: [t3], closedAt: expiredAt, paidAt: at('19:00'), amounts: [70000] })
  const b = await paidSession({ tables: [t4], closedAt: expiredAt, paidAt: at('19:05'), amounts: [80000] })
  const r = await report()
  const billA = r.bills.find((x) => x.session_ids.includes(a))
  const billB = r.bills.find((x) => x.session_ids.includes(b))
  assert.notEqual(billA.key, billB.key)
  assert.equal(billA.total, 70000)
  assert.equal(billB.total, 80000)
})

test('tổng tiền tách tiền mặt / chuyển khoản / khác; giờ vào lấy từ phiên', async () => {
  const s = await paidSession({ tables: [t1], paidAt: at('20:00'), instrument: 'bank', amounts: [120000], openedAt: at('18:45') })
  const r = await report()
  const bill = r.bills.find((x) => x.session_ids.includes(s))
  assert.equal(bill.instrument, 'bank')
  assert.equal(new Date(bill.opened_at).toISOString(), new Date(at('18:45')).toISOString())
  assert.equal(r.totals.revenue, r.totals.cash + r.totals.bank + r.totals.other)
  assert.ok(r.totals.bank >= 120000)
})

test('đơn mang về trả trước đã nhận tiền → dòng riêng, nhãn "Mang về", có tên khách + giảm giá', async () => {
  const o = newId()
  await db.query(`INSERT INTO orders(id, store_id, status, total_amount, discount_amount, payment_method, payment_received_at,
    order_type, customer_name, created_at) VALUES ($1, $2, 'paid', 90000, 10000, 'cash', $3, 'pickup', 'Chị Hoa', $4)`,
  [o, store, at('12:10'), at('12:00')])
  const r = await report()
  const bill = r.bills.find((x) => x.order_ids.includes(o))
  assert.deepEqual(bill.session_ids, [])
  assert.equal(bill.table_label, 'Mang về')
  assert.equal(bill.customer_name, 'Chị Hoa')
  assert.equal(bill.discount_total, 10000)
})

test('khách đặt bàn: bill lấy tên + số khách từ đặt bàn', async () => {
  const s = await paidSession({ tables: [t2], paidAt: at('21:00'), amounts: [300000] })
  await db.query(`INSERT INTO reservations(id, store_id, session_id, customer_name, party_size, arrived_at)
    VALUES ($1, $2, $3, 'Anh Tú', 6, $4)`, [newId(), store, s, at('18:00')])
  const bill = (await report()).bills.find((x) => x.session_ids.includes(s))
  assert.equal(bill.customer_name, 'Anh Tú')
  assert.equal(bill.party_size, 6)
})

test('lịch sử điều chỉnh: Bỏ/Tặng + Sửa số lượng, mới nhất trước; bill đếm số điều chỉnh', async () => {
  const s = await paidSession({ tables: [t3], paidAt: at('22:00'), amounts: [60000] })
  const orderId = (await db.query('SELECT id FROM orders WHERE session_id = $1', [s])).rows[0].id
  const gift = newId(), beer = newId()
  await db.query(`INSERT INTO order_items(id, order_id, item_name, item_price, quantity, void_type, voided_at, voided_by, void_reason)
    VALUES ($1, $2, 'Rau rừng', 50000, 1, 'gift', $3, $4, 'Khách quen')`, [gift, orderId, at('21:10'), cashier])
  await db.query(`INSERT INTO order_items(id, order_id, item_name, item_price, quantity, selected_toppings)
    VALUES ($1, $2, 'Bia hơi', 10000, 4, '[{"price":2000}]')`, [beer, orderId])
  await db.query(`INSERT INTO order_item_quantity_changes(id, store_id, order_id, order_item_id, item_name, old_quantity,
    new_quantity, reason, changed_by, changed_at) VALUES ($1, $2, $3, $4, 'Bia hơi', 6, 4, 'Bấm nhầm', $5, $6)`,
  [newId(), store, orderId, beer, cashier, at('21:20')])
  const r = await report()
  const mine = r.adjustments.filter((a) => a.table_label === 'Bàn 3' && ['Rau rừng', 'Bia hơi'].includes(a.item_name))
  assert.deepEqual(mine.map((a) => a.type), ['quantity', 'gift'])
  assert.equal(mine[0].old_quantity, 6)
  assert.equal(mine[0].new_quantity, 4)
  assert.equal(mine[0].amount, -24000) // (4 − 6) × (10.000 + topping 2.000)
  assert.equal(mine[0].reason, 'Bấm nhầm')
  assert.equal(mine[1].amount, 50000)
  assert.equal(mine[1].by_name, 'Thu ngân Lan')
  assert.equal(r.bills.find((x) => x.session_ids.includes(s)).adjustments_count, 2)
})

test('đơn huỷ / bị từ chối trong ngày → danh sách "cancelled" kèm lý do; không tính vào doanh thu', async () => {
  const rejected = newId(), cancelled = newId()
  await db.query(`INSERT INTO orders(id, store_id, table_id, status, total_amount, rejected_at, rejection_reason_code,
    rejection_reason_note, created_at, updated_at) VALUES ($1, $2, $3, 'cancelled', 45000, $4, 'out_of_stock', 'Hết lẩu', $5, $4)`,
  [rejected, store, t1, at('13:05'), at('13:00')])
  await db.query(`INSERT INTO orders(id, store_id, table_id, status, total_amount, created_at, updated_at)
    VALUES ($1, $2, $3, 'cancelled', 30000, $4, $5)`, [cancelled, store, t2, at('14:00'), at('14:20')])
  const r = await report()
  const rj = r.cancelled.find((x) => x.order_id === rejected)
  assert.equal(rj.kind, 'rejected')
  assert.equal(rj.reason_code, 'out_of_stock')
  assert.equal(rj.reason_note, 'Hết lẩu')
  assert.equal(rj.table_label, 'Bàn 1')
  assert.equal(r.cancelled.find((x) => x.order_id === cancelled).kind, 'cancelled')
  assert.ok(!r.bills.some((b) => b.order_ids.includes(rejected) || b.order_ids.includes(cancelled)))
})

test('Chờ thu (hôm nay): phiên đang mở có tạm tính + số món + khách đặt bàn; đơn trả trước chưa thu', async () => {
  const today = await todayVn()
  const s = newId()
  await db.query(`INSERT INTO table_sessions(id, store_id, table_id, status, is_open_ordering) VALUES ($1, $2, $3, 'open', true)`, [s, store, t4])
  await db.query('INSERT INTO session_tables(session_id, table_id, is_open) VALUES ($1, $2, true), ($1, $3, true)', [s, t4, t3])
  await db.query(`INSERT INTO reservations(id, store_id, session_id, customer_name, party_size) VALUES ($1, $2, $3, 'Đoàn Nghệ An', 20)`, [newId(), store, s])
  const o1 = newId(), o2 = newId()
  await db.query(`INSERT INTO orders(id, store_id, table_id, session_id, status, total_amount) VALUES
    ($1, $3, $4, $5, 'confirmed', 150000), ($2, $3, $4, $5, 'cancelled', 999000)`, [o1, o2, store, t4, s])
  await db.query(`INSERT INTO order_items(id, order_id, item_name, item_price, quantity) VALUES ($1, $2, 'Lẩu', 150000, 1),
    ($3, $2, 'Nem', 0, 2)`, [newId(), o1, newId()])
  await db.query(`UPDATE order_items SET void_type = 'cancelled' WHERE item_name = 'Nem' AND order_id = $1`, [o1])
  const prepay = newId(), wallet = newId(), preorder = newId()
  await db.query(`INSERT INTO orders(id, store_id, status, total_amount, payment_method, payment_instrument, order_type, customer_name, order_source)
    VALUES ($1, $4, 'pending', 55000, 'bank_transfer', NULL, 'delivery', 'Anh Ship', 'customer'),
           ($2, $4, 'pending', 66000, 'zalo_checkout', 'wallet', 'pickup', NULL, 'customer'),
           ($3, $4, 'pending', 77000, 'cash', NULL, 'dine_in', NULL, 'reservation_preorder')`, [prepay, wallet, preorder, store])

  const r = await report(today)
  const w = r.waiting.find((x) => x.session_ids?.includes(s))
  assert.equal(w.provisional_total, 150000)
  assert.equal(w.items_count, 1)
  assert.equal(w.table_label, 'Bàn 3, Bàn 4')
  assert.equal(w.tables_count, 2)
  assert.equal(w.is_tray, true)
  assert.equal(w.customer_name, 'Đoàn Nghệ An')
  assert.equal(w.party_size, 20)
  const p = r.waiting.find((x) => x.order_ids.includes(prepay))
  assert.equal(p.table_label, 'Ship')
  assert.equal(p.customer_name, 'Anh Ship')
  assert.equal(p.provisional_total, 55000)
  assert.ok(!r.waiting.some((x) => x.order_ids.includes(wallet)), 'ví đã tự xác nhận — không chờ thu tay')
  assert.ok(!r.waiting.some((x) => x.order_ids.includes(preorder)), 'món đặt trước không phải đơn chờ thu')
  assert.equal(r.open.tables_count >= 2, true)

  // Ngày cũ: không có phiên đang mở trong "Chờ thu".
  const past = await report()
  assert.ok(!past.waiting.some((x) => x.session_ids?.includes(s)))
})

test('phiên HẾT HẠN còn nợ → vẫn nằm trong Chờ thu của ngày mở phiên (cờ expired); hết hạn đã trả đủ thì không', async () => {
  const debt = newId(), clean = newId()
  for (const [sid, table] of [[debt, t1], [clean, t2]]) {
    await db.query(`INSERT INTO table_sessions(id, store_id, table_id, status, opened_at, closed_at, close_reason)
      VALUES ($1, $2, $3, 'closed', $4, $5, 'expired')`, [sid, store, table, at('07:30'), at('14:01')])
    await db.query('INSERT INTO session_tables(session_id, table_id, is_open) VALUES ($1, $2, false)', [sid, table])
  }
  await db.query(`INSERT INTO orders(id, store_id, table_id, session_id, status, total_amount, created_at) VALUES
    ($1, $3, $4, $5, 'confirmed', 513000, $6), ($2, $3, $4, $5, 'confirmed', 320000, $6)`,
  [newId(), newId(), store, t1, debt, at('07:30')])
  await db.query(`INSERT INTO orders(id, store_id, table_id, session_id, status, total_amount, payment_received_at, created_at)
    VALUES ($1, $2, $3, $4, 'paid', 90000, $5, $6)`, [newId(), store, t2, clean, at('09:00'), at('08:00')])

  const r = await report()
  const w = r.waiting.find((x) => x.session_ids.includes(debt))
  assert.ok(w, 'phiên hết hạn còn nợ phải hiện trong Chờ thu')
  assert.equal(w.expired, true)
  assert.equal(w.provisional_total, 833000)
  assert.equal(w.table_label, 'Bàn 1')
  assert.ok(!r.waiting.some((x) => x.session_ids.includes(clean)))
  assert.ok(!(await report('2026-10-02')).waiting.some((x) => x.session_ids.includes(debt)), 'chỉ thuộc ngày mở phiên')
})
