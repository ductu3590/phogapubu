import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const owner = id(1), staff = id(2), store = id(10)

async function login(uid) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid])
  await db.exec('SET LOCAL ROLE authenticated')
}

async function rejectOrder(orderId, code, note = null) {
  return (await db.query('SELECT pos_reject_order($1,$2,$3) AS value', [orderId, code, note])).rows[0].value
}

before(async () => {
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE stores(id uuid PRIMARY KEY);
    CREATE TABLE mevo_operators(user_id uuid PRIMARY KEY, store_id uuid, role text, is_active boolean DEFAULT true);
    CREATE TABLE orders(
      id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id), status text NOT NULL,
      order_source text NOT NULL, updated_at timestamptz DEFAULT now()
    );
    INSERT INTO auth.users VALUES ('${owner}'),('${staff}');
    INSERT INTO stores VALUES ('${store}');
    INSERT INTO mevo_operators VALUES
      ('${owner}','${store}','store_owner',true),
      ('${staff}','${store}','store_staff',true);
    CREATE FUNCTION is_store_owner_of(p_store_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS(SELECT 1 FROM mevo_operators WHERE user_id=auth.uid() AND store_id=p_store_id AND role='store_owner' AND is_active)
    $$;
  `)
  const migration = await readFile(new URL('../migrations/077_pos_reject_pending_order.sql', import.meta.url), 'utf8').catch(() => '')
  if (migration) await db.exec(migration)
})

after(async () => db.close())

test('owner từ chối đơn pending và giữ audit lý do', async () => {
  const order = id(20)
  await db.query("INSERT INTO orders(id,store_id,status,order_source) VALUES($1,$2,'pending','customer')", [order, store])
  await login(owner)
  const result = await rejectOrder(order, 'out_of_stock')
  assert.deepEqual(result, { ok: true, already: false, status: 'cancelled' })
  const row = (await db.query('SELECT status,rejection_reason_code,rejection_reason_note,rejected_by,rejected_at IS NOT NULL AS stamped FROM orders WHERE id=$1', [order])).rows[0]
  assert.deepEqual(row, { status: 'cancelled', rejection_reason_code: 'out_of_stock', rejection_reason_note: null, rejected_by: owner, stamped: true })
})

test('staff không được từ chối đơn', async () => {
  const order = id(21)
  await db.query("INSERT INTO orders(id,store_id,status,order_source) VALUES($1,$2,'pending','customer')", [order, store])
  await login(staff)
  await assert.rejects(() => rejectOrder(order, 'duplicate'), /Chỉ chủ quán/)
})

test('không từ chối đơn đã xác nhận hoặc món đặt trước', async () => {
  const confirmed = id(22), preorder = id(23)
  await db.query("INSERT INTO orders(id,store_id,status,order_source) VALUES($1,$2,'confirmed','customer'),($3,$2,'pending','reservation_preorder')", [confirmed, store, preorder])
  await login(owner)
  await assert.rejects(() => rejectOrder(confirmed, 'duplicate'), /đang chờ xác nhận/)
  await assert.rejects(() => rejectOrder(preorder, 'out_of_stock'), /món đặt trước/)
})

test('lý do khác bắt buộc nội dung và thao tác lặp là idempotent', async () => {
  const order = id(24)
  await db.query("INSERT INTO orders(id,store_id,status,order_source) VALUES($1,$2,'pending','customer')", [order, store])
  await login(owner)
  await assert.rejects(() => rejectOrder(order, 'other', '  '), /Nhập lý do khác/)
  await rejectOrder(order, 'customer_requested', null)
  assert.deepEqual(await rejectOrder(order, 'out_of_stock', null), { ok: true, already: true, status: 'cancelled' })
  const row = (await db.query('SELECT rejection_reason_code FROM orders WHERE id=$1', [order])).rows[0]
  assert.equal(row.rejection_reason_code, 'customer_requested')
})
