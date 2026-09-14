import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const modulePath = process.env.PGLITE_MODULE
const { PGlite } = await import(modulePath ? (modulePath.startsWith('file:') ? modulePath : pathToFileURL(modulePath).href) : '@electric-sql/pglite')

test('kitchen đọc queue đúng quán, token bị thu hồi không đọc được, không được ghi', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE kitchen NOLOGIN;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
        $$ SELECT current_setting('request.jwt.claims', true)::jsonb $$;
      CREATE TABLE stores(id uuid PRIMARY KEY, kitchen_token_version integer NOT NULL);
      CREATE TABLE service_requests(id uuid PRIMARY KEY, store_id uuid REFERENCES stores(id), resolved_at timestamptz);
      ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA public TO kitchen;
      INSERT INTO stores VALUES ('00000000-0000-0000-0000-000000000001', 1), ('00000000-0000-0000-0000-000000000002', 1);
      INSERT INTO service_requests VALUES
        ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', NULL),
        ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002', NULL);
    `)
    const isolation = await readFile(new URL('../migrations/007a_kitchen_isolation.sql', import.meta.url), 'utf8')
    const helper = isolation.match(/CREATE OR REPLACE FUNCTION kitchen_store_id\(\)[\s\S]*?END \$\$;/)?.[0]
    assert.ok(helper, 'dùng helper token thật của migration 007a')
    await db.exec(helper)
    const migration = await readFile(new URL('../migrations/050a_kitchen_service_request_queue.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration) // Chạy lại an toàn.
    const claims = { role: 'kitchen', store_id: '00000000-0000-0000-0000-000000000001', kv: 1 }
    await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)])
    await db.exec('SET ROLE kitchen')
    assert.deepEqual((await db.query('SELECT id FROM service_requests WHERE resolved_at IS NULL')).rows, [{ id: '00000000-0000-0000-0000-000000000011' }])
    await assert.rejects(() => db.exec('UPDATE service_requests SET resolved_at = now()'), /permission denied/)
    await assert.rejects(() => db.exec('DELETE FROM service_requests'), /permission denied/)
    await assert.rejects(() => db.exec("INSERT INTO service_requests VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', NULL)"), /permission denied/)
    await db.exec('RESET ROLE')
    await db.exec("UPDATE stores SET kitchen_token_version = 2 WHERE id = '00000000-0000-0000-0000-000000000001'")
    await db.exec('SET ROLE kitchen')
    assert.equal((await db.query('SELECT * FROM service_requests')).rows.length, 0)
    await db.exec('RESET ROLE')
    await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify({ ...claims, store_id: 'invalid' })])
    await db.exec('SET ROLE kitchen')
    assert.equal((await db.query('SELECT * FROM service_requests')).rows.length, 0)
  } finally {
    await db.close()
  }
})
