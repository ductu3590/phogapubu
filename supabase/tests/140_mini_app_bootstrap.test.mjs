import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Test mig 140: get_mini_app_bootstrap lọc bàn theo quán. Schema giả tối thiểu (stores, tables,
// hai hàm con là stub) — hàm cần test được nạp từ file migration thật.
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const sA = id(1), sB = id(2), sOff = id(3), tA = id(11), tB = id(12)

async function load(db, file) {
  const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')
  await db.exec(sql.replace(/\r?\n/g, '\n'))
}

async function makeDb(file) {
  const db = new PGlite()
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    END $$;
    CREATE TABLE stores (
      id uuid PRIMARY KEY, name text, slug text UNIQUE, logo_url text, address text, google_maps_url text,
      phone text, zalo_oa_id text, zalo_oa_url text, payment_methods text[], payment_timing text,
      takeaway_banner_url text, about_text text, wifi_name text, wifi_password text, primary_color text,
      mini_app_theme text, is_accepting_orders boolean DEFAULT true, serving_hours jsonb,
      delivery_area_note text, terms_of_use text, is_active boolean DEFAULT true);
    CREATE TABLE tables (id uuid PRIMARY KEY, store_id uuid REFERENCES stores(id),
      table_number text, is_active boolean DEFAULT true);
    CREATE FUNCTION get_public_store_workflow(p uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"w":1}'::jsonb $$;
    CREATE FUNCTION get_active_menu_discounts(p uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '[]'::jsonb $$;
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    GRANT SELECT ON stores, tables TO anon, authenticated;
    INSERT INTO stores (id, name, slug, is_active) VALUES
      ('${sA}', 'Quán A', 'quan-a', true), ('${sB}', 'Quán B', 'quan-b', true), ('${sOff}', 'Quán Tắt', 'quan-tat', false);
    INSERT INTO tables (id, store_id, table_number) VALUES ('${tA}', '${sA}', 'A1'), ('${tB}', '${sB}', 'B1');
  `)
  await load(db, file)
  return db
}

const call = async (db, slug, table = null) => {
  await db.exec('SET ROLE anon')
  try {
    return (await db.query('SELECT get_mini_app_bootstrap($1, $2::uuid) AS r', [slug, table])).rows[0].r
  } finally {
    await db.exec('RESET ROLE')
  }
}

let db
before(async () => { db = await makeDb('140_mini_app_bootstrap_table_store.sql') })
after(async () => { await db.close() })

test('slug đúng -> có quán, workflow, discounts', async () => {
  const r = await call(db, 'quan-a')
  assert.equal(r.store.name, 'Quán A')
  assert.deepEqual(r.workflow, { w: 1 })
  assert.deepEqual(r.discounts, [])
  assert.equal(r.table, null)
})

test('quán is_active=false -> NULL', async () => {
  assert.equal(await call(db, 'quan-tat'), null)
})

test('slug sai -> NULL', async () => {
  assert.equal(await call(db, 'khong-co'), null)
})

test('bàn đúng quán -> có table', async () => {
  const r = await call(db, 'quan-a', tA)
  assert.deepEqual(r.table, { id: tA, table_number: 'A1' })
})

test('p_table_id của quán khác -> table null', async () => {
  const r = await call(db, 'quan-a', tB)
  assert.equal(r.store.name, 'Quán A')
  assert.equal(r.table, null)
})

test('bàn đã tắt -> table null', async () => {
  await db.exec(`UPDATE tables SET is_active=false WHERE id='${tA}'`)
  assert.equal((await call(db, 'quan-a', tA)).table, null)
  await db.exec(`UPDATE tables SET is_active=true WHERE id='${tA}'`)
})

test('chứng minh: thân hàm 135 để lọt bàn quán khác (ca đỏ)', async () => {
  const old = await makeDb('135_mini_app_bootstrap.sql')
  try {
    const r = await call(old, 'quan-a', tB)
    assert.notEqual(r.table, null, '135 phải trả bàn của quán B (lỗi cũ)')
  } finally { await old.close() }
})
