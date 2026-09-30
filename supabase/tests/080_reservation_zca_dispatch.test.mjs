import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const modulePath = process.env.PGLITE_MODULE
const { PGlite } = await import(modulePath ? (modulePath.startsWith('file:') ? modulePath : pathToFileURL(modulePath).href) : '@electric-sql/pglite')
const migrationUrl = new URL('../migrations/080_reservation_zca_dispatch.sql', import.meta.url)

async function setup(t) {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA net;
    CREATE TABLE dispatch_capture(url text, body jsonb, headers jsonb, timeout_milliseconds integer);
    CREATE FUNCTION net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds integer)
    RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO dispatch_capture VALUES(url, body, headers, timeout_milliseconds); RETURN 1;
    END; $$;
    CREATE TABLE reservation_notification_deliveries(
      id uuid PRIMARY KEY, delivery_provider text NOT NULL, status text NOT NULL,
      dispatch_token uuid NOT NULL, provider_code text, last_error text,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  const source = await readFile(migrationUrl, 'utf8')
  await db.exec(source.replace('CREATE EXTENSION IF NOT EXISTS pg_net;\n', ''))
  return db
}

test('dispatcher chỉ bắn một lần cho token mới, và giữ queued khi chưa có URL', async t => {
  const db = await setup(t)
  const missing = randomUUID()
  await db.query(`INSERT INTO reservation_notification_deliveries(id,delivery_provider,status,dispatch_token)
    VALUES($1,'zca_group','queued',$2)`, [missing, randomUUID()])
  const blocked = (await db.query('SELECT status,provider_code,last_error FROM reservation_notification_deliveries WHERE id=$1', [missing])).rows[0]
  assert.deepEqual(blocked, { status: 'queued', provider_code: 'DISPATCH_URL_MISSING', last_error: 'Chưa cấu hình URL dispatch' })
  assert.equal((await db.query('SELECT count(*)::int AS n FROM dispatch_capture')).rows[0].n, 0)

  await db.query(`SELECT set_config('app.settings.reservation_zca_notify_url','https://relay.example.test/notify',false)`)
  const id = randomUUID(), firstToken = randomUUID(), secondToken = randomUUID()
  await db.query(`INSERT INTO reservation_notification_deliveries(id,delivery_provider,status,dispatch_token)
    VALUES($1,'zca_group','queued',$2)`, [id, firstToken])
  await db.query(`UPDATE reservation_notification_deliveries SET provider_code='noop' WHERE id=$1`, [id])
  await db.query(`UPDATE reservation_notification_deliveries SET status='queued',dispatch_token=$2 WHERE id=$1`, [id, secondToken])
  const sent = (await db.query('SELECT body,timeout_milliseconds FROM dispatch_capture ORDER BY ctid')).rows
  assert.equal(sent.length, 2)
  assert.deepEqual(sent.map(row => row.body.dispatch_token), [firstToken, secondToken])
  assert.equal(sent[0].timeout_milliseconds, 20000)
})
