import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Test mig 141 (cờ giữ nguyên updated_at) + mig 142 (xoá bàn kể cả bàn đã có đơn, lịch sử dồn sang bàn nhận).
// Khoá ngoại dựng giống prod (đo 2026-11-16): NO ACTION cho orders / table_sessions / session_tables /
// table_order_batch_requests / table_session_moves, ghép (store_id, table_id) RESTRICT cho reservation_tables,
// CASCADE cho service_requests. Checklist tay: docs/testing/pos-rail/RAIL-1.md nhóm G.
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const store = id(10), otherStore = id(11)
const t1 = id(21), t2 = id(22), t3 = id(23), t4 = id(24), tOther = id(29)

const defFile = new URL('./prod-defs/141/update_updated_at.sql', import.meta.url)
const PROD_MD5 = '7cabb96ed1db297859033aecc70c9312' // md5(pg_get_functiondef) trên prod 2026-11-16
const mig141 = new URL('../migrations/141_updated_at_keep_flag.sql', import.meta.url)
const mig142 = new URL('../migrations/142_delete_tables_keep_history.sql', import.meta.url)
const load = async (url) => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')

const OLD_TS = '2026-01-02T03:04:05Z'
const del = (ids, target, storeId = store) =>
  db.query('SELECT delete_tables_keep_history($1, $2::uuid[], $3) AS r', [storeId, ids, target]).then((x) => x.rows[0].r)
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0]
const count = async (sql, params = []) => Number((await one(sql, params)).n)

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE tables(id uuid PRIMARY KEY, store_id uuid NOT NULL, table_number text, is_active boolean DEFAULT true,
      UNIQUE (store_id, id));
    CREATE TABLE table_sessions(id uuid PRIMARY KEY, store_id uuid, table_id uuid REFERENCES tables(id), status text);
    CREATE TABLE session_tables(session_id uuid REFERENCES table_sessions(id), table_id uuid REFERENCES tables(id),
      is_open boolean DEFAULT false, PRIMARY KEY (session_id, table_id));
    CREATE UNIQUE INDEX session_tables_one_open_per_table ON session_tables(table_id) WHERE is_open;
    CREATE TABLE orders(id uuid PRIMARY KEY, store_id uuid, table_id uuid REFERENCES tables(id), session_id uuid,
      status text, total_amount int, updated_at timestamptz DEFAULT now());
    CREATE TABLE reservations(id uuid PRIMARY KEY, store_id uuid, status text);
    CREATE TABLE reservation_tables(reservation_id uuid, store_id uuid, table_id uuid,
      hold_starts_at timestamptz, hold_ends_at timestamptz, released_at timestamptz,
      PRIMARY KEY (reservation_id, table_id),
      FOREIGN KEY (store_id, table_id) REFERENCES tables(store_id, id) ON DELETE RESTRICT);
    CREATE TABLE table_order_batch_requests(store_id uuid, client_request_id text, table_id uuid REFERENCES tables(id),
      PRIMARY KEY (store_id, client_request_id));
    CREATE TABLE table_session_moves(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      from_table_id uuid REFERENCES tables(id), to_table_id uuid REFERENCES tables(id));
    CREATE TABLE service_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      table_id uuid REFERENCES tables(id) ON DELETE CASCADE);
  `)
  await db.exec(await readFile(defFile, 'utf8'))
  await db.exec('CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at()')
  await db.exec(await load(mig141))
  await db.exec(await load(mig142))
})

after(async () => db.close())

// Mỗi test dựng lại dữ liệu sạch: 4 bàn của quán + 1 bàn quán khác.
beforeEach(async () => {
  await db.exec(`
    DELETE FROM service_requests; DELETE FROM table_session_moves; DELETE FROM table_order_batch_requests;
    DELETE FROM reservation_tables; DELETE FROM reservations; DELETE FROM orders; DELETE FROM session_tables;
    DELETE FROM table_sessions; DELETE FROM tables;
    INSERT INTO tables(id, store_id, table_number) VALUES
      ('${t1}', '${store}', 'Bàn 1'), ('${t2}', '${store}', 'Bàn 2'), ('${t3}', '${store}', 'Bàn 3'),
      ('${t4}', '${store}', 'Bàn 4'), ('${tOther}', '${otherStore}', 'Bàn 1');
  `)
})

// ---------- mig 141 ----------

test('141: bản chụp đúng byte prod, neo khớp đúng 1 lần, đúng mẫu vá tại chỗ', async () => {
  const raw = await readFile(defFile)
  assert.equal(createHash('md5').update(raw).digest('hex'), PROD_MD5)
  const sql = await load(mig141)
  const anchor = sql.match(/\$a\$([\s\S]*?)\$a\$/)[1]
  assert.equal(raw.toString('utf8').split(anchor).length - 1, 1)
  assert.doesNotMatch(sql, /rerun-safe/i)
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\./)
})

test('141: chạy lại lần hai thì RAISE, không vá chồng', async () => {
  await db.exec('DROP FUNCTION pg_temp.mig141_patch(text, text, text)')
  await assert.rejects(db.exec(await load(mig141)), /mig 141: .* đã được vá rồi/)
})

test('141: không bật cờ → updated_at vẫn = now() như cũ; bật cờ trong giao dịch → giữ nguyên', async () => {
  await db.query(`INSERT INTO orders(id, store_id, table_id, status, total_amount, updated_at) VALUES ($1, $2, $3, 'paid', 1, $4)`,
    [id(100), store, t1, OLD_TS])
  await db.query(`UPDATE orders SET total_amount = 2 WHERE id = $1`, [id(100)])
  const plain = await one('SELECT updated_at FROM orders WHERE id = $1', [id(100)])
  assert.ok(new Date(plain.updated_at).getTime() > new Date(OLD_TS).getTime())

  // Trigger chỉ chạy khi UPDATE → chèn dòng mới mang updated_at cũ, rồi cập nhật trong giao dịch có bật cờ
  await db.query(`INSERT INTO orders(id, store_id, table_id, status, total_amount, updated_at) VALUES ($1, $2, $3, 'paid', 1, $4)`,
    [id(101), store, t1, OLD_TS])
  await db.exec(`BEGIN; SELECT set_config('mevo.keep_updated_at', 'on', true);
    UPDATE orders SET total_amount = 3 WHERE id = '${id(101)}'; COMMIT;`)
  const kept = await one('SELECT updated_at, total_amount FROM orders WHERE id = $1', [id(101)])
  assert.equal(new Date(kept.updated_at).toISOString(), new Date(OLD_TS).toISOString())
  assert.equal(kept.total_amount, 3)
  // Cờ chỉ sống trong giao dịch: giao dịch sau lại về now()
  await db.query(`UPDATE orders SET total_amount = 4 WHERE id = $1`, [id(101)])
  assert.ok(new Date((await one('SELECT updated_at FROM orders WHERE id = $1', [id(101)])).updated_at).getTime() > new Date(OLD_TS).getTime())
})

// ---------- mig 142 ----------

test('142: bàn chưa từng có đơn → xoá luôn, không cần bàn nhận', async () => {
  const r = await del([t4], null)
  assert.equal(r.deleted, 1)
  assert.equal(r.target_table_id, null)
  assert.equal(await count('SELECT count(*) n FROM tables WHERE id = $1', [t4]), 0)
})

test('142: bàn đã có đơn → đơn, phiên, mâm, đặt bàn cũ, lô gọi món, lịch sử chuyển bàn dồn sang bàn nhận; updated_at giữ nguyên', async () => {
  const s = id(200), r = id(300)
  await db.exec(`
    INSERT INTO table_sessions VALUES ('${s}', '${store}', '${t2}', 'closed');
    INSERT INTO session_tables VALUES ('${s}', '${t2}', false), ('${s}', '${t3}', false);
    INSERT INTO orders(id, store_id, table_id, session_id, status, total_amount, updated_at) VALUES
      ('${id(101)}', '${store}', '${t2}', '${s}', 'paid', 150000, '${OLD_TS}'),
      ('${id(102)}', '${store}', '${t2}', '${s}', 'cancelled', 50000, '${OLD_TS}'),
      ('${id(103)}', '${store}', '${t3}', NULL, 'paid', 30000, '${OLD_TS}');
    INSERT INTO reservations VALUES ('${r}', '${store}', 'completed');
    INSERT INTO reservation_tables VALUES ('${r}', '${store}', '${t2}', now() - interval '3 days', now() - interval '2 days', NULL);
    INSERT INTO table_order_batch_requests VALUES ('${store}', 'req-1', '${t3}');
    INSERT INTO table_session_moves(from_table_id, to_table_id) VALUES ('${t2}', '${t3}');
    INSERT INTO service_requests(table_id) VALUES ('${t2}');
  `)
  const before = await one(`SELECT sum(total_amount) n FROM orders WHERE store_id = $1 AND status = 'paid'`, [store])

  const res = await del([t2, t3], t1)
  assert.equal(res.deleted, 2)
  assert.equal(res.moved_orders, 3)
  assert.equal(res.moved_sessions, 1)
  assert.equal(res.target_table_id, t1)

  assert.equal(await count('SELECT count(*) n FROM tables WHERE id = ANY($1::uuid[])', [[t2, t3]]), 0)
  assert.equal(await count('SELECT count(*) n FROM orders WHERE table_id = $1', [t1]), 3)
  const after = await one(`SELECT sum(total_amount) n FROM orders WHERE store_id = $1 AND status = 'paid'`, [store])
  assert.equal(after.n, before.n, 'doanh thu không đổi')
  const ts = await db.query('SELECT DISTINCT updated_at FROM orders')
  assert.deepEqual(ts.rows.map((x) => new Date(x.updated_at).toISOString()), [new Date(OLD_TS).toISOString()])
  assert.equal((await one('SELECT table_id FROM table_sessions WHERE id = $1', [s])).table_id, t1)
  // Mâm cũ ghép Bàn 2 + Bàn 3 (cả hai bị xoá) → còn MỘT dòng, trỏ bàn nhận
  assert.deepEqual((await db.query('SELECT table_id FROM session_tables WHERE session_id = $1', [s])).rows, [{ table_id: t1 }])
  assert.equal((await one('SELECT table_id FROM reservation_tables WHERE reservation_id = $1', [r])).table_id, t1)
  assert.equal((await one(`SELECT table_id FROM table_order_batch_requests WHERE client_request_id = 'req-1'`)).table_id, t1)
  assert.deepEqual(await one('SELECT from_table_id, to_table_id FROM table_session_moves'), { from_table_id: t1, to_table_id: t1 })
  assert.equal(await count('SELECT count(*) n FROM service_requests'), 0, 'gọi nhân viên của bàn xoá mất theo (CASCADE)')
})

test('142: mâm cũ đã có sẵn bàn nhận → xoá dòng của bàn bị xoá, không trùng khoá', async () => {
  const s = id(201)
  await db.exec(`
    INSERT INTO table_sessions VALUES ('${s}', '${store}', '${t1}', 'closed');
    INSERT INTO session_tables VALUES ('${s}', '${t1}', false), ('${s}', '${t2}', false);
  `)
  await del([t2], t1)
  assert.deepEqual((await db.query('SELECT table_id FROM session_tables WHERE session_id = $1', [s])).rows, [{ table_id: t1 }])
})

test('142: chặn bàn đang có khách (phiên mở, kể cả bàn trong mâm ghép)', async () => {
  const s = id(202)
  await db.exec(`
    INSERT INTO table_sessions VALUES ('${s}', '${store}', '${t1}', 'open');
    INSERT INTO session_tables VALUES ('${s}', '${t1}', true), ('${s}', '${t3}', true);
  `)
  await assert.rejects(del([t3], t2), /Bàn "Bàn 3" đang có khách/)
  assert.equal(await count('SELECT count(*) n FROM tables WHERE id = $1', [t3]), 1)
})

test('142: chặn bàn đang giữ cho lượt đặt bàn sắp tới; lượt đã qua thì không chặn', async () => {
  const r = id(301)
  await db.exec(`
    INSERT INTO reservations VALUES ('${r}', '${store}', 'confirmed');
    INSERT INTO reservation_tables VALUES ('${r}', '${store}', '${t2}', now() + interval '1 hour', now() + interval '3 hours', NULL);
  `)
  await assert.rejects(del([t2], t1), /đang được giữ cho một lượt đặt bàn/)
  await db.query(`UPDATE reservation_tables SET hold_starts_at = now() - interval '5 hours', hold_ends_at = now() - interval '1 hour'`)
  const res = await del([t2], t1)
  assert.equal(res.deleted, 1)
})

test('142: chặn bàn có đơn trả trước đang làm dở (không thuộc phiên)', async () => {
  await db.query(`INSERT INTO orders(id, store_id, table_id, status, total_amount) VALUES ($1, $2, $3, 'cooking', 1)`, [id(110), store, t2])
  await assert.rejects(del([t2], t1), /còn đơn đang làm dở/)
})

test('142: bàn có lịch sử mà không có / sai bàn nhận → từ chối, không xoá gì', async () => {
  await db.query(`INSERT INTO orders(id, store_id, table_id, status, total_amount) VALUES ($1, $2, $3, 'paid', 1)`, [id(111), store, t2])
  await assert.rejects(del([t2], null), /cần giữ lại ít nhất một bàn/)
  await assert.rejects(del([t2], t2), /không được nằm trong danh sách xoá/)
  await assert.rejects(del([t2], tOther), /Không tìm thấy bàn nhận/)
  assert.equal(await count('SELECT count(*) n FROM tables WHERE id = $1', [t2]), 1)
})

test('142: bàn của quán khác hoặc danh sách rỗng → từ chối', async () => {
  await assert.rejects(del([tOther], t1), /không thuộc quán/)
  await assert.rejects(del([t2, tOther], t1), /không thuộc quán/)
  await assert.rejects(del([], t1), /Chưa chọn bàn/)
  assert.equal(await count('SELECT count(*) n FROM tables'), 5)
})

test('142: chỉ service_role gọi được', async () => {
  const acl = await one(`SELECT proacl::text a FROM pg_proc WHERE proname = 'delete_tables_keep_history'`)
  assert.match(acl.a, /service_role=X/)
  assert.doesNotMatch(acl.a, /(^|[{,])=X/)
  assert.doesNotMatch(acl.a, /anon=X|authenticated=X/)
})
