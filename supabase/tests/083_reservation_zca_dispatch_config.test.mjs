import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const modulePath = process.env.PGLITE_MODULE
const { PGlite } = await import(modulePath ? (modulePath.startsWith('file:') ? modulePath : pathToFileURL(modulePath).href) : '@electric-sql/pglite')
const baseMigrationUrl = new URL('../migrations/080_reservation_zca_dispatch.sql', import.meta.url)
const migrationUrl = new URL('../migrations/083_reservation_zca_dispatch_config.sql', import.meta.url)

test('dispatcher lấy URL từ schema kín và vẫn phát đúng một request mỗi dispatch token', async t => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA net;
    CREATE TABLE dispatch_capture(url text, body jsonb, headers jsonb, timeout_milliseconds integer);
    CREATE FUNCTION net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds integer)
    RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO dispatch_capture VALUES(url, body, headers, timeout_milliseconds); RETURN 1;
    END; $$;
    CREATE TABLE public.reservation_notification_deliveries(
      id uuid PRIMARY KEY, delivery_provider text NOT NULL, status text NOT NULL,
      dispatch_token uuid NOT NULL, provider_code text, last_error text,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await db.exec((await readFile(baseMigrationUrl, 'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pg_net;\n', ''))
  await db.exec(await readFile(migrationUrl, 'utf8'))
  await db.query(`INSERT INTO mevo_private.runtime_settings(setting_key,setting_value)
    VALUES('reservation_zca_notify_url','https://project.supabase.co/functions/v1/reservation-zca-notify')`)
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='trg_dispatch_reservation_zca_delivery_webhook'")).rows[0].n, 1)
  await db.exec('SET ROLE anon')
  await assert.rejects(db.query('SELECT * FROM mevo_private.runtime_settings'))
  await db.exec('RESET ROLE')

  const id = randomUUID(), token = randomUUID()
  await db.query(`INSERT INTO public.reservation_notification_deliveries(id,delivery_provider,status,dispatch_token)
    VALUES($1,'zca_group','queued',$2)`, [id, token])
  await db.query(`UPDATE public.reservation_notification_deliveries SET provider_code='noop' WHERE id=$1`, [id])
  const delivery = (await db.query('SELECT provider_code,last_error FROM public.reservation_notification_deliveries WHERE id=$1', [id])).rows[0]
  const sent = (await db.query('SELECT url,body,timeout_milliseconds FROM dispatch_capture')).rows
  assert.equal(sent.length, 1, JSON.stringify(delivery))
  assert.equal(sent[0].url, 'https://project.supabase.co/functions/v1/reservation-zca-notify')
  assert.equal(sent[0].body.delivery_id, id)
  assert.equal(sent[0].body.dispatch_token, token)
  assert.equal(sent[0].timeout_milliseconds, 20000)
})
