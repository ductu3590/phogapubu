import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Test mig 114: trạm in, hàng đợi in, máy in phần mềm, chế độ in.
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const owner = id(1), cashier = id(2), staff = id(3), otherOwner = id(4)
const store = id(10), otherStore = id(11), noStore = id(12)
const migrationSql = await readFile(new URL('../migrations/114_print_stations_jobs.sql', import.meta.url), 'utf8')

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
  await db.exec('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role')
})

after(async () => db.close())

test('anon và authenticated không đọc được 3 bảng in', async () => {
  for (const role of ['anon', 'authenticated']) {
    for (const t of ['print_jobs', 'print_agents', 'print_stations']) {
      await asRole(role)
      await assert.rejects(db.query(`SELECT * FROM ${t}`), /permission denied/, `${role} đọc ${t}`)
    }
  }
  await db.exec('RESET ROLE')
})

test('set_print_mode: thu ngân bị từ chối, chủ quán được', async () => {
  for (const uid of [cashier, staff, otherOwner]) {
    await login(uid)
    await assert.rejects(db.query(`SELECT set_print_mode('${store}', 'agent')`), /Không có quyền/)
  }
  await db.exec('RESET ROLE')
  const r = await rpc(owner, `SELECT set_print_mode('${store}', 'agent') AS r`)
  assert.equal(r.r.mode, 'agent')
  await admin(`UPDATE store_workflow_settings SET print_mode = 'browser' WHERE store_id = '${store}'`)
})

test('bật agent tạo Quầy + Bếp đúng một lần', async () => {
  await rpc(owner, `SELECT set_print_mode('${store}', 'agent')`)
  await rpc(owner, `SELECT set_print_mode('${store}', 'agent')`)
  const c = (await admin(`SELECT count(*)::int n, count(*) FILTER (WHERE is_pos)::int pos,
    count(*) FILTER (WHERE is_default_kitchen)::int kit FROM print_stations WHERE store_id = '${store}'`)).rows[0]
  assert.deepEqual(c, { n: 2, pos: 1, kit: 1 })
})

test('không bật agent khi một trong hai policy là automatic', async () => {
  await login(otherOwner)
  await assert.rejects(db.query(`SELECT set_print_mode('${otherStore}', 'agent')`), /thu ngân xác nhận/)
  await db.exec('RESET ROLE')
  // Chỉ một trong hai là automatic cũng bị chặn
  await admin(`UPDATE store_workflow_settings SET kitchen_release_policy = 'pos_confirmation',
    staff_order_release_policy = 'automatic' WHERE store_id = '${otherStore}'`)
  await login(otherOwner)
  await assert.rejects(db.query(`SELECT set_print_mode('${otherStore}', 'agent')`), /thu ngân xác nhận/)
  await db.exec('RESET ROLE')
  assert.equal((await admin(`SELECT print_mode FROM store_workflow_settings WHERE store_id = '${otherStore}'`)).rows[0].print_mode, 'browser')
  await admin(`UPDATE store_workflow_settings SET kitchen_release_policy = 'automatic' WHERE store_id = '${otherStore}'`)
})

test('đang agent không đổi policy về automatic được', async () => {
  assert.equal((await admin(`SELECT print_mode FROM store_workflow_settings WHERE store_id = '${store}'`)).rows[0].print_mode, 'agent')
  await assert.rejects(
    admin(`UPDATE store_workflow_settings SET kitchen_release_policy = 'automatic' WHERE store_id = '${store}'`),
    /thu ngân xác nhận/)
  await assert.rejects(
    admin(`UPDATE store_workflow_settings SET staff_order_release_policy = 'automatic' WHERE store_id = '${store}'`),
    /thu ngân xác nhận/)
})

test('get_print_mode: mặc định browser, store_staff đọc được agent', async () => {
  assert.equal((await rpc(staff, 'SELECT get_print_mode() AS m')).m, 'agent')
  assert.equal((await rpc(cashier, 'SELECT get_print_mode() AS m')).m, 'agent')
  assert.equal((await rpc(otherOwner, 'SELECT get_print_mode() AS m')).m, 'browser')
  // Không có quán → browser
  assert.equal((await rpc(noStore, 'SELECT get_print_mode() AS m')).m, 'browser')
})

test('mỗi quán một trạm is_pos, một is_default_kitchen', async () => {
  await assert.rejects(
    admin(`INSERT INTO print_stations(store_id, name, is_pos) VALUES ('${store}', 'Quầy 2', true)`), /unique|duplicate/i)
  await assert.rejects(
    admin(`INSERT INTO print_stations(store_id, name, is_default_kitchen) VALUES ('${store}', 'Bếp 2', true)`), /unique|duplicate/i)
  // Trạm thường (không cờ) thêm thoải mái
  await admin(`INSERT INTO print_stations(store_id, name) VALUES ('${store}', 'Bar'), ('${store}', 'Nướng')`)
})

test('xoá trạm: danh mục về NULL, store_id giữ nguyên', async () => {
  const sid = (await admin(`SELECT id FROM print_stations WHERE store_id = '${store}' AND name = 'Bar'`)).rows[0].id
  await admin(`INSERT INTO menu_categories(id, store_id, name) VALUES ('${id(50)}', '${store}', 'Đồ uống')`)
  await admin(`UPDATE menu_categories SET print_station_id = '${sid}' WHERE id = '${id(50)}'`)
  await admin(`DELETE FROM print_stations WHERE id = '${sid}'`)
  const c = (await admin(`SELECT store_id, print_station_id FROM menu_categories WHERE id = '${id(50)}'`)).rows[0]
  assert.equal(c.store_id, store)
  assert.equal(c.print_station_id, null)
})

test('không gán được trạm của quán khác vào danh mục', async () => {
  const other = (await admin(`INSERT INTO print_stations(store_id, name) VALUES ('${otherStore}', 'Bếp B') RETURNING id`)).rows[0].id
  await assert.rejects(
    admin(`UPDATE menu_categories SET print_station_id = '${other}' WHERE id = '${id(50)}'`), /foreign key/i)
})

test('get_print_settings không lộ token_hash, pair_code_hash', async () => {
  await rpc(owner, `SELECT create_print_pair_code('${store}', 'Máy quầy')`)
  await admin(`INSERT INTO print_agents(store_id, name, token_hash, printers) VALUES ('${store}', 'Quầy chính', 'abc123secret', '[{"name":"XP-80"}]')`)
  const r = (await rpc(cashier, `SELECT get_print_settings('${store}') AS r`)).r
  const text = JSON.stringify(r)
  assert.ok(!/hash/i.test(text), text)
  assert.ok(!text.includes('abc123secret'))
  assert.equal(r.mode, 'agent')
  assert.equal(r.kitchen_release_policy, 'pos_confirmation')
  assert.equal(r.stations[0].is_pos, true)
  assert.equal(r.agent.name, 'Quầy chính')
  assert.equal(r.agent.online, false)
  // Nhân viên và quán khác bị từ chối
  for (const uid of [staff, otherOwner]) {
    await login(uid)
    await assert.rejects(db.query(`SELECT get_print_settings('${store}')`), /Không có quyền/)
  }
  await db.exec('RESET ROLE')
  await admin(`DELETE FROM print_agents WHERE store_id = '${store}'`)
})

test('mã ghép 6 chữ số, hết hạn sau 10 phút', async () => {
  const r = (await rpc(owner, `SELECT create_print_pair_code('${store}', 'Máy quầy') AS r`)).r
  assert.match(r.code, /^\d{6}$/)
  const mins = (new Date(r.expires_at).getTime() - Date.now()) / 60000
  assert.ok(mins > 9.5 && mins <= 10.01, `mins=${mins}`)
  // DB không giữ mã gốc
  const row = (await admin(`SELECT pair_code_hash FROM print_agents WHERE store_id = '${store}'`)).rows[0]
  assert.notEqual(row.pair_code_hash, r.code)
  // Thu ngân không tạo được
  await login(cashier)
  await assert.rejects(db.query(`SELECT create_print_pair_code('${store}', 'x')`), /Không có quyền/)
  await db.exec('RESET ROLE')
})

test('revoke_print_agent: chỉ chủ quán, đặt token_hash NULL', async () => {
  const a = (await admin(`INSERT INTO print_agents(store_id, name, token_hash) VALUES ('${store}', 'M', 'zzz') RETURNING id`)).rows[0].id
  await login(cashier)
  await assert.rejects(db.query(`SELECT revoke_print_agent('${a}')`), /Không có quyền/)
  await login(otherOwner)
  await assert.rejects(db.query(`SELECT revoke_print_agent('${a}')`), /Không có quyền/)
  await db.exec('RESET ROLE')
  await rpc(owner, `SELECT revoke_print_agent('${a}')`)
  assert.equal((await admin(`SELECT token_hash FROM print_agents WHERE id = '${a}'`)).rows[0].token_hash, null)
})
