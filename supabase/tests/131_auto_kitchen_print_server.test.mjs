import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Test mig 131: server tự xếp phiếu bếp cho đơn "tự vào bếp" (auto_kitchen_print_enqueue) + print_agent_poll gọi nó.
// Chạy: PGLITE_MODULE=<đường dẫn tới admin-web/node_modules/@electric-sql/pglite/dist/index.js>
//       node --test supabase/tests/131_auto_kitchen_print_server.test.mjs
//
// Các job mong đợi ở đây CHÉP TAY kết quả của planOrderJobs (admin-web/lib/print/print-plan.ts) + enqueuePrint
// (admin-web/lib/actions/print-jobs.ts) cho { kind: 'order', orderId } không in lại — file .mjs không import được TS.
// Đổi hình dạng job ở TS thì phải đổi SQL mig 131 và các literal trong test này.
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const owner = id(1), cashier = id(2), staff = id(3), manager = id(4), owner2 = id(5), otherOwner = id(6)
const store = id(10), otherStore = id(11), emptyStore = id(12)
const catFood = id(20), catDrink = id(21), catGone = id(22), otherCat = id(23)
const pho = id(30), bia = id(31), nem = id(32), lau = id(33), otherDish = id(34)
const t1 = id(40), t2 = id(41), t10 = id(42), tBan2 = id(43), tBan10 = id(44), otherTable = id(45)
const sql114 = await readFile(new URL('../migrations/114_print_stations_jobs.sql', import.meta.url), 'utf8')
const sql121 = await readFile(new URL('../migrations/121_drop_print_mode_policy_guard.sql', import.meta.url), 'utf8')
const sql131 = await readFile(new URL('../migrations/131_auto_kitchen_print_server.sql', import.meta.url), 'utf8')

async function login(uid) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid])
  await db.exec('SET ROLE authenticated')
}
async function admin(sql, params = []) {
  await db.exec('RESET ROLE')
  return db.query(sql, params)
}
// Nhiều lệnh trong một chuỗi (db.query chỉ nhận một lệnh)
async function adminExec(sql) {
  await db.exec('RESET ROLE')
  return db.exec(sql)
}
async function anonRpc(sql, params = []) {
  await db.exec('RESET ROLE')
  await db.exec('SET ROLE anon')
  try {
    return (await db.query(sql, params)).rows[0].r
  } finally {
    await db.exec('RESET ROLE')
  }
}

let posStation, kitchenStation, barStation, otherKitchen

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    -- Giả lập bẫy default privileges của Supabase: object mới tự cấp quyền cho anon/authenticated
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE stores(id uuid PRIMARY KEY, name text, payment_timing text NOT NULL DEFAULT 'prepay');
    CREATE TABLE mevo_operators(
      user_id uuid PRIMARY KEY, store_id uuid, role text NOT NULL, is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz DEFAULT now());
    CREATE FUNCTION is_store_owner_of(p_store_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM mevo_operators WHERE user_id = auth.uid() AND store_id = p_store_id
        AND role = 'store_owner' AND is_active)
    $$;
    CREATE FUNCTION is_store_pos_operator(p_store_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM mevo_operators WHERE user_id = auth.uid() AND store_id = p_store_id
        AND role IN ('store_owner','store_cashier','store_manager') AND is_active)
    $$;
    CREATE TABLE store_workflow_settings(
      store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
      kitchen_release_policy text NOT NULL DEFAULT 'automatic',
      staff_order_release_policy text NOT NULL DEFAULT 'automatic',
      updated_at timestamptz DEFAULT now(), updated_by uuid
    );
    CREATE TABLE menu_categories(id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE, name text);
    CREATE TABLE menu_items(id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id), category_id uuid REFERENCES menu_categories(id), name text);
    CREATE TABLE tables(id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id), table_number text);
    CREATE TABLE table_sessions(id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id));
    CREATE TABLE session_tables(
      session_id uuid NOT NULL REFERENCES table_sessions(id), table_id uuid NOT NULL REFERENCES tables(id),
      is_open boolean NOT NULL DEFAULT true, PRIMARY KEY (session_id, table_id));
    CREATE TABLE orders(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES stores(id),
      table_id uuid REFERENCES tables(id), session_id uuid REFERENCES table_sessions(id),
      status text NOT NULL DEFAULT 'pending', order_source text NOT NULL DEFAULT 'customer_zalo',
      payment_method text DEFAULT 'cash', payment_received_at timestamptz, confirmed_at timestamptz,
      completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE INDEX idx_orders_store_created ON orders(store_id, created_at DESC);
    CREATE TABLE order_items(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      menu_item_id uuid REFERENCES menu_items(id) ON DELETE SET NULL, item_name text NOT NULL, void_type text);

    INSERT INTO stores VALUES ('${store}', 'Quán A', 'postpay'), ('${otherStore}', 'Quán B', 'postpay'), ('${emptyStore}', 'Quán C', 'postpay');
    INSERT INTO auth.users(id) VALUES ('${owner}'), ('${cashier}'), ('${staff}'), ('${manager}'), ('${owner2}'), ('${otherOwner}');
    INSERT INTO mevo_operators(user_id, store_id, role, is_active, created_at) VALUES
      ('${owner}', '${store}', 'store_owner', true, now() - interval '10 days'),
      ('${owner2}', '${store}', 'store_owner', true, now() - interval '2 days'),
      ('${manager}', '${store}', 'store_manager', true, now() - interval '20 days'),
      ('${cashier}', '${store}', 'store_cashier', true, now() - interval '30 days'),
      ('${staff}', '${store}', 'store_staff', true, now() - interval '40 days'),
      ('${otherOwner}', '${otherStore}', 'store_owner', true, now());
    INSERT INTO store_workflow_settings(store_id) VALUES ('${store}'), ('${otherStore}'), ('${emptyStore}');
    INSERT INTO menu_categories(id, store_id, name) VALUES
      ('${catFood}', '${store}', 'Món ăn'), ('${catDrink}', '${store}', 'Đồ uống'), ('${catGone}', '${store}', 'Lẩu'),
      ('${otherCat}', '${otherStore}', 'Món B');
    INSERT INTO menu_items(id, store_id, category_id, name) VALUES
      ('${pho}', '${store}', '${catFood}', 'Phở'), ('${nem}', '${store}', '${catFood}', 'Nem'),
      ('${bia}', '${store}', '${catDrink}', 'Bia'), ('${lau}', '${store}', '${catGone}', 'Lẩu'),
      ('${otherDish}', '${otherStore}', '${otherCat}', 'Món B');
    INSERT INTO tables(id, store_id, table_number) VALUES
      ('${t1}', '${store}', '1'), ('${t2}', '${store}', '2'), ('${t10}', '${store}', '10'),
      ('${tBan2}', '${store}', 'Bàn 2'), ('${tBan10}', '${store}', 'Bàn 10'), ('${otherTable}', '${otherStore}', 'B1');
  `)
  await db.exec(sql114)
  await db.exec(sql121)
  await db.exec(sql131)
  await db.exec('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role')

  // Quán A + B: phần mềm in, có trạm Quầy + Bếp (+ Bar ở quán A, danh mục Đồ uống ra Bar). Quán C: agent, không trạm.
  await admin(`UPDATE store_workflow_settings SET print_mode = 'agent'`)
  const st = async (sid, name, flag) => (await admin(
    `INSERT INTO print_stations(store_id, name, printer_name${flag ? `, ${flag}` : ''}) VALUES ($1, $2, 'XP-80'${flag ? ', true' : ''}) RETURNING id`,
    [sid, name])).rows[0].id
  posStation = await st(store, 'Quầy', 'is_pos')
  kitchenStation = await st(store, 'Bếp', 'is_default_kitchen')
  barStation = await st(store, 'Bar', null)
  await st(otherStore, 'Quầy B', 'is_pos')
  otherKitchen = await st(otherStore, 'Bếp B', 'is_default_kitchen')
  await admin(`UPDATE menu_categories SET print_station_id = $1 WHERE id = $2`, [barStation, catDrink])
})

after(async () => db.close())

// ---------- helper ----------
async function reset({ kitchen = 'automatic', staffPolicy = 'automatic', timing = 'postpay', mode = 'agent' } = {}) {
  await admin(`DELETE FROM print_jobs`)
  await admin(`DELETE FROM print_agents`)
  await admin(`DELETE FROM order_items`)
  await admin(`DELETE FROM orders`)
  await admin(`DELETE FROM session_tables`)
  await admin(`DELETE FROM table_sessions`)
  await admin(`UPDATE store_workflow_settings SET kitchen_release_policy = $1, staff_order_release_policy = $2, print_mode = $3 WHERE store_id = $4`,
    [kitchen, staffPolicy, mode, store])
  await admin(`UPDATE stores SET payment_timing = $1 WHERE id = $2`, [timing, store])
}
let seq = 100
async function addOrder({
  sid = store, source = 'customer_zalo', status = 'pending', method = 'cash', minsAgo = 1, paidMinsAgo = null,
  confirmed = false, table = t1, session = null, items = [{ dish: pho }],
} = {}) {
  const oid = id(++seq)
  await admin(
    `INSERT INTO orders(id, store_id, table_id, session_id, status, order_source, payment_method, payment_received_at, confirmed_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
             CASE WHEN $8::text IS NULL THEN NULL ELSE now() - ($8 || ' minutes')::interval END,
             CASE WHEN $9 THEN now() ELSE NULL END,
             now() - ($10 || ' minutes')::interval)`,
    [oid, sid, table, session, status, source, method, paidMinsAgo === null ? null : String(paidMinsAgo), confirmed, String(minsAgo)])
  const keys = []
  for (const it of items) {
    const iid = id(++seq)
    await admin(`INSERT INTO order_items(id, order_id, menu_item_id, item_name, void_type) VALUES ($1, $2, $3, $4, $5)`,
      [iid, oid, it.dish ?? null, it.name ?? 'Món', it.void ?? null])
    keys.push(iid)
  }
  return { oid, keys }
}
const enqueue = async (sid = store) => (await admin(`SELECT auto_kitchen_print_enqueue($1) AS n`, [sid])).rows[0].n
const jobsOf = async (oid) => (await admin(
  `SELECT station_id, kind, ref, dedupe_key, status, created_by FROM print_jobs
    WHERE store_id = $1 AND dedupe_key LIKE $2 ORDER BY dedupe_key`, [store, `order:${oid}:%`])).rows
const jobCount = async () => (await admin(`SELECT count(*)::int AS n FROM print_jobs`)).rows[0].n
const request = (oid) => ({ kind: 'order', orderId: oid })

// ---------- chế độ / chính sách ----------
test('chế độ in browser: không xếp phiếu nào', async () => {
  await reset({ mode: 'browser' })
  await addOrder()
  assert.equal(await enqueue(), 0)
  assert.equal(await jobCount(), 0)
})

test('quán chưa có dòng cài đặt quy trình: 0', async () => {
  await reset()
  assert.equal(await enqueue(id(999)), 0)
})

test('trả sau + automatic, đơn khách: một phiếu bếp mỗi trạm + một phiếu bàn, đúng khoá và hình dạng ref', async () => {
  await reset()
  const { oid, keys } = await addOrder({ items: [{ dish: pho }, { dish: nem }] })
  assert.equal(await enqueue(), 2)
  const jobs = await jobsOf(oid)
  // Mong đợi = planOrderJobs (admin-web/lib/print/print-plan.ts) cho đơn này
  assert.deepEqual(jobs, [
    {
      station_id: kitchenStation,
      kind: 'kitchen_ticket',
      ref: { label: 'Phiếu bếp · Bếp · 1', request: request(oid), source: `order:${oid}`, itemKeys: [...keys].sort() },
      dedupe_key: `order:${oid}:kitchen:${kitchenStation}`,
      status: 'queued',
      created_by: owner,
    },
    {
      station_id: posStation,
      kind: 'table_slip',
      ref: { label: 'Phiếu bàn · 1', request: request(oid), source: `order:${oid}` },
      dedupe_key: `order:${oid}:table`,
      status: 'queued',
      created_by: owner,
    },
  ])
  // Phiếu bàn không mang itemKeys (đủ món); request không có reprint
  assert.deepEqual(Object.keys(jobs[1].ref).sort(), ['label', 'request', 'source'])
  assert.deepEqual(Object.keys(jobs[0].ref).sort(), ['itemKeys', 'label', 'request', 'source'])
})

test('món của danh mục gán trạm thứ hai: tách thành hai phiếu bếp', async () => {
  await reset()
  const { oid, keys } = await addOrder({ items: [{ dish: pho }, { dish: bia }, { dish: nem }] })
  assert.equal(await enqueue(), 3)
  const jobs = await jobsOf(oid)
  const byKey = Object.fromEntries(jobs.map((j) => [j.dedupe_key, j]))
  assert.deepEqual(Object.keys(byKey).sort(), [
    `order:${oid}:kitchen:${barStation}`, `order:${oid}:kitchen:${kitchenStation}`, `order:${oid}:table`].sort())
  const bar = byKey[`order:${oid}:kitchen:${barStation}`]
  assert.equal(bar.station_id, barStation)
  assert.deepEqual(bar.ref, { label: 'Phiếu bếp · Bar · 1', request: request(oid), source: `order:${oid}`, itemKeys: [keys[1]] })
  const kit = byKey[`order:${oid}:kitchen:${kitchenStation}`]
  assert.equal(kit.station_id, kitchenStation)
  assert.deepEqual(kit.ref.itemKeys, [keys[0], keys[2]].sort())
  assert.equal(byKey[`order:${oid}:table`].station_id, posStation)
})

test('món đã xoá khỏi menu / danh mục chưa gán trạm / trạm của danh mục đã xoá: ra trạm bếp mặc định', async () => {
  await reset()
  const gone = (await admin(`INSERT INTO print_stations(store_id, name, printer_name) VALUES ($1, 'Nướng', 'XP-80') RETURNING id`, [store])).rows[0].id
  await admin(`UPDATE menu_categories SET print_station_id = $1 WHERE id = $2`, [gone, catGone])
  await admin(`DELETE FROM print_stations WHERE id = $1`, [gone]) // FK đặt print_station_id về NULL
  const { oid, keys } = await addOrder({ items: [{ dish: null, name: 'Món đã xoá' }, { dish: lau }, { dish: pho }] })
  assert.equal(await enqueue(), 2)
  const jobs = await jobsOf(oid)
  assert.equal(jobs[0].dedupe_key, `order:${oid}:kitchen:${kitchenStation}`)
  assert.deepEqual(jobs[0].ref.itemKeys, [...keys].sort())
})

test('món Khách bỏ không vào phiếu, món tặng vẫn vào; đơn chỉ còn món đã bỏ thì bỏ qua', async () => {
  await reset()
  const a = await addOrder({ items: [{ dish: pho, void: 'cancelled' }, { dish: nem, void: 'gift' }, { dish: bia, void: 'cancelled' }] })
  const b = await addOrder({ items: [{ dish: pho, void: 'cancelled' }] })
  const c = await addOrder({ items: [] })
  assert.equal(await enqueue(), 2)
  const jobs = await jobsOf(a.oid)
  // Bia (trạm Bar) đã bỏ nên không có phiếu Bar
  assert.deepEqual(jobs.map((j) => j.dedupe_key), [`order:${a.oid}:kitchen:${kitchenStation}`, `order:${a.oid}:table`])
  assert.deepEqual(jobs[0].ref.itemKeys, [a.keys[1]])
  assert.equal((await jobsOf(b.oid)).length, 0)
  assert.equal((await jobsOf(c.oid)).length, 0)
})

test('đơn vào bếp quá 30 phút bị bỏ qua, 29 phút vẫn in', async () => {
  await reset()
  const old = await addOrder({ minsAgo: 31 })
  const fresh = await addOrder({ minsAgo: 29 })
  assert.equal(await enqueue(), 2)
  assert.equal((await jobsOf(old.oid)).length, 0)
  assert.equal((await jobsOf(fresh.oid)).length, 2)
})

test('đơn pos / reservation_preorder không bao giờ tự in', async () => {
  await reset()
  await addOrder({ source: 'pos' })
  await addOrder({ source: 'reservation_preorder' })
  assert.equal(await enqueue(), 0)
  assert.equal(await jobCount(), 0)
})

test('chính sách pos_confirmation: đơn khách không tự in', async () => {
  await reset({ kitchen: 'pos_confirmation' })
  await addOrder()
  assert.equal(await enqueue(), 0)
  // Cả hai kênh pos_confirmation cũng 0
  await reset({ kitchen: 'pos_confirmation', staffPolicy: 'pos_confirmation' })
  await addOrder()
  await addOrder({ source: 'staff' })
  assert.equal(await enqueue(), 0)
  assert.equal(await jobCount(), 0)
})

test('đơn nhân viên theo staff_order_release_policy, không theo kitchen_release_policy', async () => {
  await reset({ kitchen: 'pos_confirmation', staffPolicy: 'automatic' })
  const s = await addOrder({ source: 'staff' })
  const c = await addOrder()
  assert.equal(await enqueue(), 2)
  assert.equal((await jobsOf(s.oid)).length, 2)
  assert.equal((await jobsOf(c.oid)).length, 0)

  await reset({ kitchen: 'automatic', staffPolicy: 'pos_confirmation' })
  const s2 = await addOrder({ source: 'staff' })
  const c2 = await addOrder()
  assert.equal(await enqueue(), 2)
  assert.equal((await jobsOf(s2.oid)).length, 0)
  assert.equal((await jobsOf(c2.oid)).length, 2)
})

test('đơn nhân viên vào bếp ngay cả ở quán trả trước chưa có tiền; giờ vào bếp là lúc tạo đơn', async () => {
  await reset({ timing: 'prepay' })
  const s = await addOrder({ source: 'staff', method: 'bank_transfer' })
  // Đơn nhân viên tạo 40 phút trước, vừa nhận tiền: vẫn tính theo lúc tạo → bỏ qua
  const sOld = await addOrder({ source: 'staff', minsAgo: 40, paidMinsAgo: 1 })
  assert.equal(await enqueue(), 2)
  assert.equal((await jobsOf(s.oid)).length, 2)
  assert.equal((await jobsOf(sOld.oid)).length, 0)
})

test('quán trả trước: đơn khách chưa có tiền không in, có tiền thì in; giờ vào bếp là lúc nhận tiền', async () => {
  await reset({ timing: 'prepay' })
  const unpaid = await addOrder({ method: 'zalo_checkout' })
  const unpaidCash = await addOrder({ method: 'cash' }) // tiền mặt ở quán trả TRƯỚC không tự vào bếp
  const paid = await addOrder({ method: 'zalo_checkout', paidMinsAgo: 0 })
  // Tạo 45 phút trước, trả tiền 5 phút trước → mới vào bếp 5 phút
  const paidLate = await addOrder({ method: 'zalo_checkout', minsAgo: 45, paidMinsAgo: 5 })
  // Trả tiền 31 phút trước → quá hạn
  const paidOld = await addOrder({ method: 'zalo_checkout', minsAgo: 45, paidMinsAgo: 31 })
  assert.equal(await enqueue(), 4)
  assert.equal((await jobsOf(unpaid.oid)).length, 0)
  assert.equal((await jobsOf(unpaidCash.oid)).length, 0)
  assert.equal((await jobsOf(paid.oid)).length, 2)
  assert.equal((await jobsOf(paidLate.oid)).length, 2)
  assert.equal((await jobsOf(paidOld.oid)).length, 0)
})

test('quán trả sau: đơn khách không phải tiền mặt và chưa có tiền thì không in', async () => {
  await reset()
  const o = await addOrder({ method: 'zalo_checkout' })
  assert.equal(await enqueue(), 0)
  assert.equal((await jobsOf(o.oid)).length, 0)
})

test('đơn đã được thu ngân duyệt (confirmed_at) hoặc đã xong / đã huỷ: không tự in', async () => {
  await reset()
  await addOrder({ confirmed: true })
  await addOrder({ status: 'paid' })
  await addOrder({ status: 'cancelled' })
  assert.equal(await enqueue(), 0)
  // Màn bếp đã đẩy sang cooking / ready trước khi phần mềm hỏi việc: vẫn in
  const cooking = await addOrder({ status: 'cooking' })
  const ready = await addOrder({ status: 'ready' })
  const confirmedStatus = await addOrder({ status: 'confirmed' })
  assert.equal(await enqueue(), 6)
  for (const o of [cooking, ready, confirmedStatus]) assert.equal((await jobsOf(o.oid)).length, 2)
})

// ---------- chống trùng ----------
test('gọi lần hai không thêm gì', async () => {
  await reset()
  await addOrder({ items: [{ dish: pho }, { dish: bia }] })
  assert.equal(await enqueue(), 3)
  assert.equal(await enqueue(), 0)
  assert.equal(await jobCount(), 3)
})

test('đơn đã có phiếu cùng tiền tố (nút Duyệt & in bếp, in lại, đã bỏ qua) thì không tạo lại', async () => {
  await reset()
  const viaButton = await addOrder()
  const reprinted = await addOrder()
  const dismissed = await addOrder()
  const untouched = await addOrder()
  await admin(`INSERT INTO print_jobs(store_id, station_id, kind, dedupe_key, created_by) VALUES ($1, $2, 'table_slip', $3, $4)`,
    [store, posStation, `order:${viaButton.oid}:table`, cashier])
  await admin(`INSERT INTO print_jobs(store_id, station_id, kind, dedupe_key, created_by) VALUES ($1, $2, 'kitchen_ticket', $3, $4)`,
    [store, kitchenStation, `order:${reprinted.oid}:kitchen:${kitchenStation}:rabc`, cashier])
  await admin(`INSERT INTO print_jobs(store_id, station_id, kind, dedupe_key, created_by, status, resolved_at) VALUES ($1, $2, 'kitchen_ticket', $3, $4, 'failed', now())`,
    [store, kitchenStation, `order:${dismissed.oid}:kitchen:${kitchenStation}`, cashier])
  // Khoá của đơn KHÁC hoặc loại khác không chặn
  await admin(`INSERT INTO print_jobs(store_id, station_id, kind, dedupe_key, created_by) VALUES ($1, $2, 'bill', $3, $4)`,
    [store, posStation, `bill:${untouched.oid}`, cashier])
  // Phiếu cùng khoá nhưng của QUÁN KHÁC không chặn
  await admin(`INSERT INTO print_jobs(store_id, kind, dedupe_key, created_by) VALUES ($1, 'table_slip', $2, $3)`,
    [otherStore, `order:${untouched.oid}:table`, otherOwner])
  assert.equal(await enqueue(), 2)
  assert.equal((await jobsOf(viaButton.oid)).length, 1)
  assert.equal((await jobsOf(reprinted.oid)).length, 1)
  assert.equal((await jobsOf(dismissed.oid)).length, 1)
  assert.equal((await jobsOf(untouched.oid)).length, 2)
})

// ---------- người đứng tên, trạm, quán ----------
test('created_by: chủ quán đang bật cũ nhất; không có thì quản lý, rồi thu ngân; không ai thì 0', async () => {
  const pick = async () => {
    await reset()
    const { oid } = await addOrder()
    const n = await enqueue()
    return { n, by: (await jobsOf(oid))[0]?.created_by ?? null }
  }
  try {
    assert.deepEqual(await pick(), { n: 2, by: owner })
    await admin(`UPDATE mevo_operators SET is_active = false WHERE user_id = $1`, [owner])
    assert.deepEqual(await pick(), { n: 2, by: owner2 })
    await admin(`UPDATE mevo_operators SET is_active = false WHERE user_id = $1`, [owner2])
    assert.deepEqual(await pick(), { n: 2, by: manager })
    await admin(`UPDATE mevo_operators SET is_active = false WHERE user_id = $1`, [manager])
    assert.deepEqual(await pick(), { n: 2, by: cashier })
    await admin(`UPDATE mevo_operators SET is_active = false WHERE user_id = $1`, [cashier])
    // Chỉ còn nhân viên phục vụ (không in được phiếu đơn) → không xếp
    assert.deepEqual(await pick(), { n: 0, by: null })
    assert.equal(await jobCount(), 0)
  } finally {
    await admin(`UPDATE mevo_operators SET is_active = true WHERE store_id = $1`, [store])
  }
})

test('quán không có người vận hành / không có trạm: 0', async () => {
  await reset()
  await admin(`UPDATE store_workflow_settings SET print_mode = 'agent' WHERE store_id = $1`, [emptyStore])
  const t = id(46)
  await admin(`INSERT INTO tables(id, store_id, table_number) VALUES ($1, $2, 'C1') ON CONFLICT DO NOTHING`, [t, emptyStore])
  await addOrder({ sid: emptyStore, table: t, items: [{ dish: null }] })
  // Chưa có trạm
  assert.equal(await enqueue(emptyStore), 0)
  await admin(`INSERT INTO print_stations(store_id, name, is_pos) VALUES ($1, 'Quầy C', true)`, [emptyStore])
  // Mới có Quầy, thiếu Bếp
  assert.equal(await enqueue(emptyStore), 0)
  await admin(`INSERT INTO print_stations(store_id, name, is_default_kitchen) VALUES ($1, 'Bếp C', true)`, [emptyStore])
  // Đủ trạm nhưng không có người vận hành
  assert.equal(await enqueue(emptyStore), 0)
  assert.equal(await jobCount(), 0)
  await admin(`DELETE FROM print_stations WHERE store_id = $1`, [emptyStore])
})

test('chỉ đụng đơn của đúng quán; món của quán khác không kéo trạm quán khác', async () => {
  await reset()
  const mine = await addOrder()
  const theirs = await addOrder({ sid: otherStore, table: otherTable, items: [{ dish: otherDish }] })
  assert.equal(await enqueue(), 2)
  assert.equal((await admin(`SELECT count(*)::int AS n FROM print_jobs WHERE store_id = $1`, [otherStore])).rows[0].n, 0)
  assert.equal(await enqueue(otherStore), 2)
  const rows = (await admin(`SELECT station_id, dedupe_key, created_by FROM print_jobs WHERE store_id = $1 ORDER BY dedupe_key`, [otherStore])).rows
  assert.equal(rows[0].dedupe_key, `order:${theirs.oid}:kitchen:${otherKitchen}`)
  assert.equal(rows[0].created_by, otherOwner)
  assert.equal((await jobsOf(mine.oid)).length, 2)
})

// ---------- nhãn bàn ----------
test('nhãn bàn: mâm lấy các bàn đang mở của phiên, xếp theo số; không phiên thì bàn của đơn; không có thì —', async () => {
  await reset()
  const s1 = id(60), s2 = id(61)
  await admin(`INSERT INTO table_sessions(id, store_id) VALUES ($1, $3), ($2, $3)`, [s1, s2, store])
  await admin(`INSERT INTO session_tables(session_id, table_id, is_open) VALUES ($1, $2, true), ($1, $3, true), ($1, $4, true)`, [s1, t10, t2, t1])
  // Phiên 2: "Bàn 10" + "Bàn 2" đang mở, bàn "1" đã rời mâm (is_open = false)
  await admin(`INSERT INTO session_tables(session_id, table_id, is_open) VALUES ($1, $2, true), ($1, $3, true), ($1, $4, false)`, [s2, tBan10, tBan2, t1])
  const tray = await addOrder({ session: s1, table: t10 })
  const named = await addOrder({ session: s2, table: tBan10 })
  const single = await addOrder({ table: t2 })
  const noTable = await addOrder({ table: null })
  assert.equal(await enqueue(), 8)
  const label = async (o) => (await jobsOf(o.oid)).map((j) => j.ref.label)
  assert.deepEqual(await label(tray), ['Phiếu bếp · Bếp · 1, 2, 10', 'Phiếu bàn · 1, 2, 10'])
  assert.deepEqual(await label(named), ['Phiếu bếp · Bếp · Bàn 2, Bàn 10', 'Phiếu bàn · Bàn 2, Bàn 10'])
  assert.deepEqual(await label(single), ['Phiếu bếp · Bếp · 2', 'Phiếu bàn · 2'])
  assert.deepEqual(await label(noTable), ['Phiếu bếp · Bếp · —', 'Phiếu bàn · —'])
})

// ---------- print_agent_poll ----------
async function pairNew() {
  await login(owner)
  let code
  try {
    code = (await db.query(`SELECT create_print_pair_code($1, 'Máy quầy') AS r`, [store])).rows[0].r.code
  } finally {
    await db.exec('RESET ROLE')
  }
  const r = await anonRpc(`SELECT print_agent_pair($1, 'Máy quầy', '1.0.0') AS r`, [code])
  assert.equal(r.ok, true, JSON.stringify(r))
  return r.token
}
const poll = (token) => anonRpc(`SELECT print_agent_poll($1, '1.0.0', NULL::jsonb) AS r`, [token])

test('print_agent_poll tự xếp phiếu rồi giao ngay phiếu đầu tiên; lần hỏi sau không xếp thêm', async () => {
  await reset()
  const token = await pairNew()
  const { oid } = await addOrder({ items: [{ dish: pho }, { dish: bia }] })
  const r = await poll(token)
  assert.equal(r.ok, true)
  assert.ok(r.job, 'poll phải giao một phiếu vừa được xếp')
  assert.ok(['kitchen_ticket', 'table_slip'].includes(r.job.kind))
  const jobs = await jobsOf(oid)
  assert.equal(jobs.length, 3)
  assert.deepEqual(jobs.map((j) => j.status).sort(), ['printing', 'queued', 'queued'])
  await poll(token)
  await poll(token)
  const done = await poll(token)
  assert.equal(done.job, null)
  assert.equal(await jobCount(), 3)
})

test('print_agent_poll: token sai không xếp phiếu', async () => {
  await reset()
  await addOrder()
  const r = await poll('sai-token')
  assert.deepEqual(r, { ok: false, error: 'revoked' })
  assert.equal(await jobCount(), 0)
})

test('lỗi bên trong hàm xếp phiếu không làm hỏng poll: phiếu khác vẫn được giao', async () => {
  await reset()
  const token = await pairNew()
  await addOrder()
  // Phiếu có sẵn trong hàng đợi (vd. hoá đơn) phải vẫn in được
  const bill = (await admin(
    `INSERT INTO print_jobs(store_id, station_id, kind, dedupe_key, created_by) VALUES ($1, $2, 'bill', 'bill:x', $3) RETURNING id`,
    [store, posStation, owner])).rows[0].id
  // Lỗi theo từng đơn: trigger chặn mọi phiếu bếp / phiếu bàn
  await adminExec(`
    CREATE FUNCTION test_block_order_jobs() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.kind IN ('kitchen_ticket', 'table_slip') THEN RAISE EXCEPTION 'lỗi giả lập'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER test_block_order_jobs BEFORE INSERT ON print_jobs FOR EACH ROW EXECUTE FUNCTION test_block_order_jobs();
  `)
  try {
    assert.equal(await enqueue(), 0)
    const r = await poll(token)
    assert.equal(r.ok, true)
    assert.equal(r.job.id, bill)
    assert.equal(await jobCount(), 1)
  } finally {
    await adminExec(`DROP TRIGGER test_block_order_jobs ON print_jobs; DROP FUNCTION test_block_order_jobs();`)
  }

  // Lỗi ngoài vòng lặp đơn (câu truy vấn hỏng hẳn): vẫn trả 0, poll vẫn chạy
  await admin(`ALTER TABLE order_items RENAME COLUMN void_type TO void_type_x`)
  try {
    assert.equal(await enqueue(), 0)
    const r = await poll(token)
    assert.deepEqual(r, { ok: true, job: null })
  } finally {
    await admin(`ALTER TABLE order_items RENAME COLUMN void_type_x TO void_type`)
  }
  // Hết lỗi thì đơn (còn trong 30 phút) được xếp bình thường
  assert.equal(await enqueue(), 2)
})

test('một đơn lỗi không chặn phiếu của đơn khác', async () => {
  await reset()
  const bad = await addOrder({ table: t2 })
  const good = await addOrder({ table: t1 })
  await adminExec(`
    CREATE FUNCTION test_block_one() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.dedupe_key LIKE 'order:${bad.oid}:%' THEN RAISE EXCEPTION 'lỗi giả lập'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER test_block_one BEFORE INSERT ON print_jobs FOR EACH ROW EXECUTE FUNCTION test_block_one();
  `)
  try {
    assert.equal(await enqueue(), 2)
    assert.equal((await jobsOf(bad.oid)).length, 0)
    assert.equal((await jobsOf(good.oid)).length, 2)
  } finally {
    await adminExec(`DROP TRIGGER test_block_one ON print_jobs; DROP FUNCTION test_block_one();`)
  }
})

// ---------- quyền + tĩnh ----------
test('hàm nội bộ: anon và authenticated không gọi được; poll vẫn cho anon', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec('RESET ROLE')
    await db.exec(`SET ROLE ${role}`)
    await assert.rejects(db.query(`SELECT auto_kitchen_print_enqueue($1)`, [store]), /permission denied/i)
  }
  await db.exec('RESET ROLE')
  const acl = (await admin(`
    SELECT has_function_privilege('anon', 'public.print_agent_poll(text,text,jsonb)', 'EXECUTE') AS anon_poll,
           has_function_privilege('authenticated', 'public.print_agent_poll(text,text,jsonb)', 'EXECUTE') AS auth_poll,
           (SELECT prosecdef FROM pg_proc WHERE oid = 'public.print_agent_poll(text,text,jsonb)'::regprocedure) AS poll_definer,
           (SELECT prosecdef FROM pg_proc WHERE oid = 'public.auto_kitchen_print_enqueue(uuid)'::regprocedure) AS helper_definer`)).rows[0]
  assert.deepEqual(acl, { anon_poll: true, auth_poll: false, poll_definer: true, helper_definer: true })
})

test('print_agent_poll được vá đúng một dòng, ngay sau expire_print_jobs', async () => {
  const def = (await admin(`SELECT pg_get_functiondef('public.print_agent_poll(text,text,jsonb)'::regprocedure) AS d`)).rows[0].d
  assert.equal(def.split('auto_kitchen_print_enqueue').length - 1, 1)
  assert.match(def, /  PERFORM expire_print_jobs\(a\.store_id\);\r?\n  PERFORM auto_kitchen_print_enqueue\(a\.store_id\);\r?\n/)
})

test('tĩnh: file không ghi rerun-safe, có REVOKE đủ ba vai, không CREATE OR REPLACE; chạy lại bước vá thì RAISE', async () => {
  assert.match(sql131, /REVOKE ALL ON FUNCTION public\.auto_kitchen_print_enqueue\(uuid\) FROM PUBLIC, anon, authenticated;/)
  assert.doesNotMatch(sql131, /CREATE OR REPLACE/)
  assert.doesNotMatch(sql131, /GRANT EXECUTE/)
  const patch = sql131.slice(sql131.indexOf('DO $mig$'), sql131.indexOf('$mig$;') + '$mig$;'.length)
  await assert.rejects(admin(patch), /đã được vá rồi/)
})
