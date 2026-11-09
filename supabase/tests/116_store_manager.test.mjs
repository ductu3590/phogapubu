import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Test mig 116: vai Quản lý (store_manager) + helper is_store_back_office.
// Bốn hàm sống được vá tại chỗ từ bản chụp prod (prod-defs/116, 2026-11-09); hai hàm còn lại chụp để chứng minh
// chúng KHÔNG đổi mà vẫn chạy đúng với Quản lý (set_menu_item_available đi qua is_store_pos_operator,
// pos_save_floor_layout giữ chỉ chủ quán).
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const ownerA = id(1), managerA = id(2), cashierA = id(3), staffA = id(4), managerOff = id(5)
const managerB = id(6), admin = id(7), ownerB = id(8)
const sA = id(10), sB = id(11)
const areaA = id(20), areaB = id(21)
const tableA = id(30), tableB = id(31)
const itemA = id(40), itemB = id(41)

const migration = new URL('../migrations/116_store_manager_role.sql', import.meta.url)
const defs = new URL('./prod-defs/116/', import.meta.url)
const load = async (url) => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')

async function login(uid) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid])
  await db.exec('SET ROLE authenticated')
}
async function as(uid, fn) {
  await login(uid)
  try {
    return await fn()
  } finally {
    await db.exec('RESET ROLE')
  }
}
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].v
const helper = (fn, uid, storeId = sA) => as(uid, () => scalar(`SELECT ${fn}($1) AS v`, [storeId]))

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    -- Supabase cấp thẳng EXECUTE cho 3 role này trên mọi hàm mới; REVOKE ... FROM PUBLIC một mình không gỡ được.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;

    -- Hai CHECK đúng định nghĩa prod hiện tại (bản mig 093, đo 2026-11-09).
    CREATE TABLE mevo_operators(
      user_id uuid PRIMARY KEY, store_id uuid, role text, is_active boolean DEFAULT true, display_name text,
      CONSTRAINT mevo_operators_role_check
        CHECK (role = ANY (ARRAY['mevo_superadmin', 'store_owner', 'store_staff', 'store_cashier'])),
      CONSTRAINT mevo_operators_role_store_check
        CHECK ((role = 'mevo_superadmin' AND store_id IS NULL)
            OR (role = ANY (ARRAY['store_owner', 'store_staff', 'store_cashier']) AND store_id IS NOT NULL))
    );
    CREATE TABLE stores(id uuid PRIMARY KEY, table_layout_version int DEFAULT 1);
    CREATE TABLE table_areas(id uuid PRIMARY KEY, store_id uuid, name text, color text, sort_order int DEFAULT 0);
    CREATE TABLE tables(id uuid PRIMARY KEY, store_id uuid, table_number text, area_id uuid,
      pos_x smallint, pos_y smallint, is_active boolean DEFAULT true);
    CREATE TABLE menu_items(id uuid PRIMARY KEY, store_id uuid, name text, price int, is_available boolean DEFAULT true);
    CREATE TABLE menu_item_variants(id uuid PRIMARY KEY);
    CREATE TABLE orders(id uuid PRIMARY KEY, store_id uuid, client_request_id uuid, total_amount int);
    CREATE TABLE order_items(order_id uuid);

    -- Hai hàm dưới đúng định nghĩa prod (như helpers/business-day-fixture.mjs).
    CREATE FUNCTION public.is_store_owner_of(p_store_id uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
      select exists (
        select 1 from mevo_operators
         where user_id = auth.uid()
           and is_active
           and role = 'store_owner'
           and store_id = p_store_id
      );
    $$;
    CREATE FUNCTION public.is_store_owner_or_admin(target_store_id uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
      select exists (
        select 1 from mevo_operators
        where user_id = auth.uid()
          and is_active
          and (
            role = 'mevo_superadmin'
            or (role = 'store_owner' and store_id = target_store_id)
          )
      );
    $$;

    -- RLS menu_items như prod: chỉ chủ quán (hoặc MEVO) sửa được món. SELECT mở cho fixture.
    ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
    CREATE POLICY auth_update_menu_items ON menu_items FOR UPDATE TO authenticated
      USING (is_store_owner_or_admin(store_id)) WITH CHECK (is_store_owner_or_admin(store_id));
    CREATE POLICY fixture_read_menu_items ON menu_items FOR SELECT TO authenticated USING (true);
    GRANT SELECT, UPDATE ON menu_items TO authenticated;
  `)
  for (const f of ['is_store_pos_operator', 'reservation_operator_actor_kind', 'pos_get_floor_layout',
    'pos_save_floor_layout', 'set_menu_item_available']) {
    await db.exec(await readFile(new URL(`${f}.sql`, defs), 'utf8'))
  }
  // staff_create_order tham chiếu nhiều bảng/hàm fixture không dựng (toppings, store_accepting_now…).
  await db.exec('SET check_function_bodies = off')
  await db.exec(await readFile(new URL('staff_create_order.sql', defs), 'utf8'))
  await db.exec('SET check_function_bodies = on')

  await db.exec(await readFile(migration, 'utf8'))

  await db.exec(`
    INSERT INTO stores(id) VALUES ('${sA}'), ('${sB}');
    INSERT INTO mevo_operators(user_id, store_id, role, is_active) VALUES
      ('${ownerA}', '${sA}', 'store_owner', true), ('${managerA}', '${sA}', 'store_manager', true),
      ('${cashierA}', '${sA}', 'store_cashier', true), ('${staffA}', '${sA}', 'store_staff', true),
      ('${managerOff}', '${sA}', 'store_manager', false), ('${managerB}', '${sB}', 'store_manager', true),
      ('${ownerB}', '${sB}', 'store_owner', true), ('${admin}', NULL, 'mevo_superadmin', true);
    INSERT INTO table_areas(id, store_id, name, color) VALUES
      ('${areaA}', '${sA}', 'Sân', 'violet'), ('${areaB}', '${sB}', 'Tầng 1', 'pink');
    INSERT INTO tables(id, store_id, table_number, area_id, pos_x, pos_y) VALUES
      ('${tableA}', '${sA}', 'Bàn 1', '${areaA}', 0, 0), ('${tableB}', '${sB}', 'Bàn 1', '${areaB}', 0, 0);
    INSERT INTO menu_items(id, store_id, name, price) VALUES
      ('${itemA}', '${sA}', 'Bia hơi', 15000), ('${itemB}', '${sB}', 'Lẩu', 200000);
  `)
})

test('CHECK: store_manager cần store_id; vai lạ bị chặn', async () => {
  await assert.rejects(
    db.query("INSERT INTO mevo_operators(user_id, store_id, role) VALUES ($1, NULL, 'store_manager')", [id(90)]),
    /mevo_operators_role_store_check/)
  await assert.rejects(
    db.query("INSERT INTO mevo_operators(user_id, store_id, role) VALUES ($1, $2, 'store_kitchen')", [id(91), sA]),
    /mevo_operators_role_check/)
  await db.query("INSERT INTO mevo_operators(user_id, store_id, role) VALUES ($1, $2, 'store_manager')", [id(92), sA])
  await db.query('DELETE FROM mevo_operators WHERE user_id = $1', [id(92)])
  // Vai cũ vẫn giữ nguyên luật.
  await assert.rejects(
    db.query("INSERT INTO mevo_operators(user_id, store_id, role) VALUES ($1, $2, 'mevo_superadmin')", [id(93), sA]),
    /mevo_operators_role_store_check/)
})

test('is_store_pos_operator(sA): chủ, quản lý, thu ngân = true; phục vụ, quản lý tắt, quản lý B, superadmin = false', async () => {
  for (const uid of [ownerA, managerA, cashierA]) assert.equal(await helper('is_store_pos_operator', uid), true, uid)
  for (const uid of [staffA, managerOff, managerB, admin]) assert.equal(await helper('is_store_pos_operator', uid), false, uid)
  assert.equal(await helper('is_store_pos_operator', managerB, sB), true)
})

test('is_store_back_office(sA): chủ, quản lý = true; thu ngân, phục vụ, quản lý tắt, quản lý B, superadmin = false', async () => {
  for (const uid of [ownerA, managerA]) assert.equal(await helper('is_store_back_office', uid), true, uid)
  for (const uid of [cashierA, staffA, managerOff, managerB, admin, ownerB]) {
    assert.equal(await helper('is_store_back_office', uid), false, uid)
  }
  assert.equal(await helper('is_store_back_office', managerB, sB), true)
  assert.equal(await helper('is_store_back_office', managerA, null), false)
  // Không đăng nhập (auth.uid() rỗng) → false.
  assert.equal(await helper('is_store_back_office', ''), false)
})

test('is_store_back_office: đúng hợp đồng (sql, STABLE, SECURITY DEFINER, search_path = public)', async () => {
  const { rows } = await db.query(`SELECT l.lanname, p.provolatile, p.prosecdef, p.proconfig, p.prorettype::regtype::text AS ret
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
    WHERE p.oid = 'public.is_store_back_office(uuid)'::regprocedure`)
  assert.deepEqual(rows[0], { lanname: 'sql', provolatile: 's', prosecdef: true, proconfig: ['search_path=public'], ret: 'boolean' })
})

test('is_store_owner_of / is_store_owner_or_admin giữ nghĩa: quản lý A = false cả hai', async () => {
  assert.equal(await helper('is_store_owner_of', managerA), false)
  assert.equal(await helper('is_store_owner_or_admin', managerA), false)
  assert.equal(await helper('is_store_owner_of', ownerA), true)
  assert.equal(await helper('is_store_owner_or_admin', ownerA), true)
})

test('set_menu_item_available: quản lý A đổi món A được; món B bị "Không có quyền đổi trạng thái món"', async () => {
  const call = (uid, item, on) => as(uid, () => scalar('SELECT set_menu_item_available($1, $2) AS v', [item, on]))
  assert.deepEqual(await call(managerA, itemA, false), { ok: true, is_available: false })
  assert.equal(await scalar('SELECT is_available AS v FROM menu_items WHERE id = $1', [itemA]), false)
  await call(managerA, itemA, true)
  await assert.rejects(call(managerA, itemB, false), /Không có quyền đổi trạng thái món/)
  await assert.rejects(call(managerOff, itemA, false), /Không có quyền đổi trạng thái món/)
  assert.equal(await scalar('SELECT is_available AS v FROM menu_items WHERE id = $1', [itemB]), true)
})

test('RLS menu_items: quản lý A UPDATE price món A → 0 dòng, giá giữ nguyên; chủ quán A → 1 dòng', async () => {
  const bump = (uid) => as(uid, async () =>
    (await db.query('UPDATE menu_items SET price = 99000 WHERE id = $1', [itemA])).affectedRows)
  assert.equal(await bump(managerA), 0)
  assert.equal(await scalar('SELECT price AS v FROM menu_items WHERE id = $1', [itemA]), 15000)
  assert.equal(await bump(ownerA), 1)
  await db.query('UPDATE menu_items SET price = 15000 WHERE id = $1', [itemA])
})

test('pos_get_floor_layout: quản lý A nhận sơ đồ quán A; phục vụ bị "Chỉ chủ quán được xem sơ đồ POS"', async () => {
  const layout = (uid) => as(uid, () => scalar('SELECT pos_get_floor_layout() AS v'))
  const got = await layout(managerA)
  assert.equal(got.version, 1)
  assert.deepEqual(got.areas.map((a) => a.id), [areaA])
  assert.deepEqual(got.tables.map((t) => t.id), [tableA])
  await assert.rejects(layout(staffA), /Chỉ chủ quán được xem sơ đồ POS/)
  await assert.rejects(layout(managerOff), /Chỉ chủ quán được xem sơ đồ POS/)
})

test('pos_save_floor_layout vẫn chỉ chủ quán: quản lý A bị từ chối', async () => {
  const save = (uid) => as(uid, () => scalar('SELECT pos_save_floor_layout(1, $1::jsonb, $2::jsonb) AS v', [
    JSON.stringify([{ id: areaA, name: 'Sân' }]), JSON.stringify([{ id: tableA, area_id: areaA, pos_x: 1, pos_y: 0 }])]))
  await assert.rejects(save(managerA), /Chỉ chủ quán được sửa sơ đồ POS/)
  assert.equal(await scalar('SELECT pos_x AS v FROM tables WHERE id = $1', [tableA]), 0)
})

test('reservation_operator_actor_kind: quản lý A với sA → owner; với sB → "Không có quyền quản lý đặt bàn của quán này"', async () => {
  const kind = (uid, storeId) => as(uid, () => scalar('SELECT reservation_operator_actor_kind($1) AS v', [storeId]))
  assert.equal(await kind(managerA, sA), 'owner')
  assert.equal(await kind(cashierA, sA), 'owner')
  await assert.rejects(kind(managerA, sB), /Không có quyền quản lý đặt bàn của quán này/)
  await assert.rejects(kind(managerOff, sA), /Không có quyền quản lý đặt bàn của quán này/)
})

test('staff_create_order: quản lý A qua cổng vai (lỗi kế tiếp "Thiếu client_request_id"); quản lý tắt → "Không có quyền đặt món hộ"', async () => {
  // p_client_request_id = null để dừng ngay sau cổng vai.
  const order = (uid) => as(uid, () => scalar(
    "SELECT staff_create_order($1, '[]'::jsonb, 'cash', NULL) AS v", [tableA]))
  await assert.rejects(order(managerA), /Thiếu client_request_id/)
  await assert.rejects(order(staffA), /Thiếu client_request_id/)
  await assert.rejects(order(managerOff), /Không có quyền đặt món hộ/)
})

test('EXECUTE: anon gọi is_store_back_office bị permission denied; authenticated gọi được', async () => {
  await db.exec('SET ROLE anon')
  await assert.rejects(db.query('SELECT is_store_back_office($1)', [sA]), /permission denied for function/)
  await db.exec('RESET ROLE')
  const can = async (role) => scalar(
    "SELECT has_function_privilege($1, 'public.is_store_back_office(uuid)', 'EXECUTE') AS v", [role])
  assert.equal(await can('anon'), false)
  assert.equal(await can('authenticated'), true)
  // PUBLIC cũng bị gỡ.
  const { rows } = await db.query(`SELECT array_to_string(proacl, ',') AS acl FROM pg_proc
    WHERE oid = 'public.is_store_back_office(uuid)'::regprocedure`)
  assert.doesNotMatch(rows[0].acl, /(^|,)=X/)
})

// --- Kiểm tĩnh migration + bản chụp prod ---
const MD5 = {
  'is_store_pos_operator.sql': '1b6a40e5a006e2ec952c0061e21930ba',
  'reservation_operator_actor_kind.sql': '4658db73231706dda4cad4a449908598',
  'pos_get_floor_layout.sql': '1f26e4d3d3ce07b48419aebb81d60ebd',
  'pos_save_floor_layout.sql': 'f436d5710305c7242ec9e835052c45d4',
  'staff_create_order.sql': '334a01c4383234d24078bc8bb1518506',
  'set_menu_item_available.sql': 'ee5b12c05bd061da8e1d218c5e4627d1',
}
const SIG = {
  'public.is_store_pos_operator(uuid)': { file: 'is_store_pos_operator.sql', count: 1 },
  'public.reservation_operator_actor_kind(uuid)': { file: 'reservation_operator_actor_kind.sql', count: 1 },
  'public.pos_get_floor_layout()': { file: 'pos_get_floor_layout.sql', count: 1 },
  'public.staff_create_order(uuid,jsonb,text,uuid,text)': { file: 'staff_create_order.sql', count: 1 },
}

function patches(sql, sig) {
  const out = []
  const re = /pg_temp\.mevo_patch\(\s*'([^']+)',\s*\$a\$([\s\S]*?)\$a\$,\s*\$b\$([\s\S]*?)\$b\$\s*\)/g
  for (const m of sql.matchAll(re)) if (m[1] === sig) out.push({ from: m[2], to: m[3] })
  return out
}

test('chuỗi neo khớp đúng 1 lần trong prod-defs/116, md5 khớp prod', async () => {
  for (const [file, md5] of Object.entries(MD5)) {
    const raw = await readFile(new URL(file, defs)) // bản chụp giữ nguyên byte, md5 đo trên prod 2026-11-09
    assert.equal(createHash('md5').update(raw).digest('hex'), md5, `${file}: lệch byte so với prod`)
  }
  const sql = await load(migration)
  const patched = new Set([...sql.matchAll(/pg_temp\.mevo_patch\(\s*'([^']+)'/g)].map((m) => m[1]))
  assert.deepEqual([...patched].sort(), Object.keys(SIG).sort())
  for (const [sig, { file, count }] of Object.entries(SIG)) {
    let def = (await readFile(new URL(file, defs))).toString('utf8')
    const ps = patches(sql, sig)
    assert.equal(ps.length, count, `${sig}: số lời vá`)
    for (const { from, to } of ps) {
      const n = def.split(from).length - 1
      assert.equal(n, 1, `${sig}: chuỗi neo phải khớp đúng 1 lần, đang khớp ${n}:\n${from}`)
      def = def.replace(from, () => to)
      assert.match(to, /'store_manager'/, `${sig}: lời vá phải thêm store_manager`)
    }
  }
})

test('migration: đúng mẫu vá tại chỗ', async () => {
  const sql = await load(migration)
  assert.match(sql, /mig 116: % không còn chuỗi cần vá/)
  assert.match(sql, /mig 116: % có hơn một chỗ khớp chuỗi cần vá/)
  assert.match(sql, /mig 116: thiếu hàm %/)
  assert.doesNotMatch(sql, /rerun-safe/i)
  assert.match(sql, /NOTIFY pgrst, 'reload schema';\s*$/)
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.is_store_owner_of\b/)
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.is_store_owner_or_admin\b/)
  // Hai hàm cấu hình giữ nguyên byte (không bị vá).
  for (const [sig, file] of [['public.pos_save_floor_layout(integer,jsonb,jsonb)', 'pos_save_floor_layout.sql'],
    ['public.set_menu_item_available(uuid,boolean)', 'set_menu_item_available.sql']]) {
    assert.doesNotMatch(sql, new RegExp(sig.replace(/[().]/g, '\\$&')), `${file} không được vá`)
  }
  // Hàm đã vá trong DB có store_manager.
  for (const sig of Object.keys(SIG)) {
    const def = await scalar('SELECT pg_get_functiondef($1::regprocedure) AS v', [sig])
    assert.match(def, /'store_manager'/, sig)
  }
})

// Để cuối file: lần chạy hỏng rollback cả khối nhưng giữ thứ tự cho dễ đọc.
test('chạy lại mig 116 lần hai thì dừng ở helper vá', async () => {
  await assert.rejects(db.exec(await readFile(migration, 'utf8')), /mig 116: .* không còn chuỗi cần vá/)
  // Không đổi gì: Quản lý vẫn là người vận hành POS.
  assert.equal(await helper('is_store_pos_operator', managerA), true)
})
