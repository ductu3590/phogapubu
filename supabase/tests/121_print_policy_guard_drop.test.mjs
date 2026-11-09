import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Test mig 121: gỡ trigger khoá chế độ phần mềm in với chính sách vào bếp.
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const owner = id(1), cashier = id(2), staff = id(3), otherOwner = id(4)
const store = id(10), otherStore = id(11), noStore = id(12)
const migrationSql = await readFile(new URL('../migrations/114_print_stations_jobs.sql', import.meta.url), 'utf8')
const sql121 = await readFile(new URL('../migrations/121_drop_print_mode_policy_guard.sql', import.meta.url), 'utf8')

async function login(uid) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid])
  await db.exec('SET ROLE authenticated')
}
async function asAnon() {
  await db.exec('RESET ROLE')
  await db.exec('SET ROLE anon')
}
async function asRole(role) {
  await db.exec('RESET ROLE')
  await db.exec(`SET ROLE ${role}`)
}
// Chạy một lệnh với quyền superuser rồi trả lại role cũ
async function admin(sql, params = []) {
  await db.exec('RESET ROLE')
  return db.query(sql, params)
}
async function rpc(uid, sql, params = []) {
  await login(uid)
  try {
    return (await db.query(sql, params)).rows[0]
  } finally {
    await db.exec('RESET ROLE')
  }
}

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
    CREATE TABLE stores(id uuid PRIMARY KEY, name text);
    CREATE TABLE mevo_operators(user_id uuid PRIMARY KEY, store_id uuid, role text, is_active boolean DEFAULT true);
    CREATE FUNCTION is_store_owner_of(p_store_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM mevo_operators WHERE user_id = auth.uid() AND store_id = p_store_id
        AND role = 'store_owner' AND is_active)
    $$;
    CREATE FUNCTION is_store_pos_operator(p_store_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM mevo_operators WHERE user_id = auth.uid() AND store_id = p_store_id
        AND role IN ('store_owner','store_cashier') AND is_active)
    $$;
    CREATE TABLE store_workflow_settings(
      store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
      kitchen_release_policy text NOT NULL DEFAULT 'automatic',
      staff_order_release_policy text NOT NULL DEFAULT 'automatic',
      updated_at timestamptz DEFAULT now(), updated_by uuid
    );
    CREATE TABLE menu_categories(id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE, name text);
    INSERT INTO stores VALUES ('${store}', 'Quán A'), ('${otherStore}', 'Quán B');
    INSERT INTO auth.users(id, email) VALUES ('${owner}','a@x'), ('${cashier}','b@x'), ('${staff}','c@x'), ('${otherOwner}','d@x'), ('${noStore}','e@x');
    INSERT INTO mevo_operators VALUES
      ('${owner}', '${store}', 'store_owner', true), ('${cashier}', '${store}', 'store_cashier', true),
      ('${staff}', '${store}', 'store_staff', true), ('${otherOwner}', '${otherStore}', 'store_owner', true);
    INSERT INTO store_workflow_settings(store_id, kitchen_release_policy, staff_order_release_policy)
      VALUES ('${store}', 'pos_confirmation', 'pos_confirmation'), ('${otherStore}', 'automatic', 'automatic');
  `)
  await db.exec(migrationSql)
  await db.exec(sql121)
  await db.exec('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role')
})

after(async () => db.close())

test('trigger và hàm print_mode_policy_guard không còn', async () => {
  const t = (await admin(`SELECT count(*)::int n FROM pg_trigger WHERE tgname = 'print_mode_policy_guard'`)).rows[0]
  assert.equal(t.n, 0)
  const f = (await admin(`SELECT to_regprocedure('public.print_mode_policy_guard()') AS f`)).rows[0]
  assert.equal(f.f, null)
})

test('bật agent được khi cả hai policy là automatic', async () => {
  const r = await rpc(otherOwner, `SELECT set_print_mode('${otherStore}', 'agent') AS r`)
  assert.equal(r.r.mode, 'agent')
  const c = (await admin(`SELECT count(*)::int n FROM print_stations WHERE store_id = '${otherStore}'`)).rows[0]
  assert.equal(c.n, 2)
})

test('đang agent đổi policy về automatic được', async () => {
  await rpc(owner, `SELECT set_print_mode('${store}', 'agent')`)
  await admin(`UPDATE store_workflow_settings SET kitchen_release_policy = 'automatic',
    staff_order_release_policy = 'automatic' WHERE store_id = '${store}'`)
  const s = (await admin(`SELECT print_mode, kitchen_release_policy k, staff_order_release_policy s
    FROM store_workflow_settings WHERE store_id = '${store}'`)).rows[0]
  assert.deepEqual(s, { print_mode: 'agent', k: 'automatic', s: 'automatic' })
})

test('set_print_mode vẫn chỉ cho chủ quán', async () => {
  await login(cashier)
  await assert.rejects(db.query(`SELECT set_print_mode('${store}', 'browser')`), /Không có quyền/)
  await db.exec('RESET ROLE')
})

test('chạy lại 121 lần hai không lỗi', async () => {
  await db.exec(sql121)
})
