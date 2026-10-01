import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadBl4TestEnvironment } from './bl4-test-env.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
loadBl4TestEnvironment()
const require = createRequire(resolve(root, 'admin-web', 'package.json'))
const { Client } = require('pg')
const markerName = 'mevo_bl4_test_database'
const connectionString = process.env.BL4_TEST_DATABASE_URL
if (!connectionString) throw new Error('BLOCKED: thiếu BL4_TEST_DATABASE_URL.')

const host = new URL(connectionString).hostname
const allowedHost = process.env.BL4_TEST_ALLOWED_HOST
if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1' && host !== allowedHost) {
  throw new Error(`BLOCKED: host ${host} không khớp BL4_TEST_ALLOWED_HOST.`)
}

const client = new Client({ connectionString, application_name: 'mevo-bl4-test-db-prepare' })
await client.connect()
try {
  const marker = await client.query(`
    SELECT marker FROM bl4_test.database_marker WHERE marker = $1
  `, [markerName]).catch(() => ({ rows: [] }))
  if (marker.rows.length !== 1) {
    throw new Error(`BLOCKED: database thiếu marker ${markerName}; chưa ghi schema.`)
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS bl4_test.applied_migrations (
      file_name text PRIMARY KEY,
      sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS bl4_test.dispatch_log (
      delivery_id uuid NOT NULL,
      captured_at timestamptz NOT NULL DEFAULT now()
    );
  `)

  const appliedCount = Number((await client.query('SELECT count(*) FROM bl4_test.applied_migrations')).rows[0].count)
  const hasStores = (await client.query("SELECT to_regclass('public.stores') AS relation")).rows[0].relation !== null
  if (appliedCount === 0 && hasStores) {
    throw new Error('BLOCKED: public.stores đã tồn tại nhưng BL-4 migration manifest rỗng; không thể biết schema có thuộc lần setup này không.')
  }

  const migrationDir = resolve(root, 'supabase', 'migrations')
  const files = (await readdir(migrationDir, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /^\d+[a-z]?_.+\.sql$/i.test(entry.name))
    .map(entry => {
      const match = entry.name.match(/^(\d+)([a-z]?)_/i)
      return { name: entry.name, version: Number(match[1]), suffix: match[2].toLowerCase() }
    })
    .filter(entry => entry.version >= 1 && entry.version <= 83)
    .sort((a, b) => a.version - b.version || a.suffix.localeCompare(b.suffix) || a.name.localeCompare(b.name))

  for (const migration of files) {
    const path = resolve(migrationDir, migration.name)
    const sql = await readFile(path, 'utf8')
    const sha256 = createHash('sha256').update(sql).digest('hex')
    const previous = await client.query(
      'SELECT sha256 FROM bl4_test.applied_migrations WHERE file_name = $1',
      [migration.name],
    )
    if (previous.rowCount) {
      if (previous.rows[0].sha256 !== sha256) throw new Error(`BLOCKED: migration đã áp bị thay đổi: ${migration.name}`)
      continue
    }

    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query(
        'INSERT INTO bl4_test.applied_migrations(file_name, sha256) VALUES ($1, $2)',
        [migration.name, sha256],
      )
      await client.query('COMMIT')
      console.log(`Applied ${migration.name}`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw new Error(`Migration lỗi, đã rollback riêng migration ${migration.name}: ${error.message}`, { cause: error })
    }
  }

  // Migration 064 normally calls the production Edge Function. Replace only this test
  // project's transport trigger before integration fixtures can enqueue any delivery.
  await client.query(`
    CREATE OR REPLACE FUNCTION bl4_test.capture_reservation_dispatch()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, bl4_test AS $$
    BEGIN
      INSERT INTO bl4_test.dispatch_log(delivery_id) VALUES (NEW.id);
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS trg_dispatch_reservation_zca_delivery_webhook
      ON public.reservation_notification_deliveries;
    CREATE TRIGGER trg_dispatch_reservation_zca_delivery_webhook
      AFTER INSERT ON public.reservation_notification_deliveries
      FOR EACH ROW EXECUTE FUNCTION bl4_test.capture_reservation_dispatch();
  `)
  console.log(`BL-4 test schema ready: ${files.length} migration files through ${files.at(-1).name}; outbound notification captured locally.`)
} finally {
  await client.end()
}
