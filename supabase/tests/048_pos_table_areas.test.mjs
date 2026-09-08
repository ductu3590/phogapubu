// Chạy với Node: PGLITE_MODULE trỏ tới module PGlite đã cài trong thư mục kiểm thử.
import { before, after, beforeEach, afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite')
const db = new PGlite()
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const owner = id(1), staff = id(2), disabled = id(3), store = id(10), otherStore = id(11)
const areas = [{ id: id(20), name: 'Tầng 1' }, { id: id(21), name: 'Sân' }]
const tables = [
  { id: id(30), area_id: id(20), pos_x: 0, pos_y: 0 },
  { id: id(31), area_id: id(21), pos_x: 0, pos_y: 0 },
]
const login = uid => db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid])
const snapshot = async () => (await db.query('SELECT pos_get_floor_layout() AS value')).rows[0].value
const save = async (version, a = areas, t = tables) => (await db.query(
  'SELECT pos_save_floor_layout($1, $2::jsonb, $3::jsonb) AS value', [version, JSON.stringify(a), JSON.stringify(t)],
)).rows[0].value
async function rejected(fn, message) {
  await db.exec('SAVEPOINT bad_input')
  await assert.rejects(fn, message)
  await db.exec('ROLLBACK TO SAVEPOINT bad_input')
}

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE stores(id uuid PRIMARY KEY);
    CREATE TABLE mevo_operators(user_id uuid PRIMARY KEY, store_id uuid, role text, is_active boolean);
    CREATE TABLE tables(id uuid PRIMARY KEY, store_id uuid REFERENCES stores(id), table_number text,
      is_active boolean DEFAULT true, pos_x smallint, pos_y smallint);
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT SELECT ON mevo_operators TO authenticated;
    CREATE PUBLICATION supabase_realtime;
  `)
  const migration = await readFile(new URL('../migrations/048_pos_table_areas.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration) // Chạy lại phải an toàn.
})
beforeEach(async () => {
  await db.exec('BEGIN')
  await db.query('INSERT INTO stores(id) VALUES ($1), ($2)', [store, otherStore])
  await db.query(`INSERT INTO mevo_operators VALUES ($1,$4,'store_owner',true), ($2,$4,'store_staff',true), ($3,$4,'store_owner',false)`, [owner, staff, disabled, store])
  await db.query("INSERT INTO tables(id,store_id,table_number) VALUES ($1,$3,'Bàn 1'), ($2,$3,'Bàn 2')", [id(30), id(31), store])
  await login(owner)
})
afterEach(async () => { await db.exec('ROLLBACK'); await db.exec('RESET ROLE') })
after(async () => { await db.close() })

test('bàn cũ chưa phân khu; lưu và đọc lại hai khu có cùng tọa độ', async () => {
  const initial = await snapshot()
  assert.equal(initial.tables.length, 2)
  assert.equal(initial.tables[0].area_id, null)
  const saved = await save(initial.version)
  assert.ok(saved.version > initial.version)
  assert.deepEqual(saved.areas, areas)
  assert.equal(saved.tables[0].area_id, areas[0].id)
  assert.equal(saved.tables[1].area_id, areas[1].id)
  assert.deepEqual(await snapshot(), saved)
})
test('bản cũ không ghi đè bản đã lưu ở máy khác', async () => {
  const version = (await snapshot()).version
  const saved = await save(version)
  await rejected(() => save(version), /máy khác/)
  assert.deepEqual(await snapshot(), saved)
})
test('ghi từ quản lý bàn cũng làm bản POS cũ hết hiệu lực', async () => {
  const saved = await save((await snapshot()).version)
  await db.query('UPDATE tables SET pos_x = 4 WHERE id = $1', [id(30)])
  await rejected(() => save(saved.version), /máy khác/)
  assert.equal((await snapshot()).tables[0].pos_x, 4)
})
test('không lưu nửa chừng khi hai bàn chồng nhau trong cùng khu', async () => {
  const initial = await snapshot()
  await rejected(() => save(initial.version, areas, tables.map(t => ({ ...t, area_id: areas[0].id }))), /chồng nhau/)
  assert.deepEqual(await snapshot(), initial)
})
test('từ chối bàn/khu khác quán, tên trùng, tọa độ lẻ và ID bàn trùng', async () => {
  const initial = await snapshot()
  await db.query('INSERT INTO table_areas(id,store_id,name) VALUES ($1,$2,$3)', [id(25), otherStore, 'Khu khác'])
  const badInputs = [
    [[...areas, { id: id(25), name: 'Khu khác' }], tables, /không thuộc quán/],
    [areas, [{ ...tables[0], id: id(99) }, tables[1]], /Danh sách bàn/],
    [[areas[0], { ...areas[1], name: ' TẦNG 1 ' }], tables, /không trùng/],
    [areas, [{ ...tables[0], pos_x: 0.5 }, tables[1]], /Vị trí bàn/],
    [areas, [{ ...tables[0], pos_y: 200 }, tables[1]], /Vị trí bàn/],
    [areas, [{ ...tables[0], area_id: id(99) }, tables[1]], /Vị trí bàn/],
    [areas, [tables[0], { ...tables[1], id: tables[0].id }], /Vị trí bàn/],
  ]
  for (const [a, t, error] of badInputs) await rejected(() => save(initial.version, a, t), error)
  assert.deepEqual(await snapshot(), initial)
})
test('nhân viên, chủ quán bị khóa và người chưa đăng nhập không gọi được RPC', async () => {
  for (const uid of [staff, disabled, '']) {
    await login(uid)
    await rejected(() => snapshot(), /Chỉ chủ quán/)
    await rejected(() => save(0), /Chỉ chủ quán/)
  }
})
test('RLS chỉ đọc khu của mình; authenticated không ghi trực tiếp khu vực', async () => {
  await save((await snapshot()).version)
  await db.query('INSERT INTO table_areas(id,store_id,name) VALUES ($1,$2,$3)', [id(25), otherStore, 'Khu khác'])
  await db.exec('SET LOCAL ROLE authenticated')
  assert.equal((await db.query('SELECT * FROM table_areas')).rows.length, 2)
  await rejected(() => db.query("UPDATE table_areas SET name = 'Sai'"), /permission denied/)
  await login(staff)
  assert.equal((await db.query('SELECT * FROM table_areas')).rows.length, 0)
})
test('khóa ghép chặn gán bàn vào khu quán khác', async () => {
  await db.query('INSERT INTO table_areas(id,store_id,name) VALUES ($1,$2,$3)', [id(25), otherStore, 'Khu khác'])
  await rejected(() => db.query('UPDATE tables SET area_id = $1 WHERE id = $2', [id(25), id(30)]), /foreign key/)
})
