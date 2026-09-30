import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const pgliteModule = process.env.PGLITE_MODULE
  ? (process.env.PGLITE_MODULE.startsWith('file:') ? process.env.PGLITE_MODULE : pathToFileURL(process.env.PGLITE_MODULE).href)
  : '@electric-sql/pglite';
const { PGlite } = await import(pgliteModule);

const legacyMigration = readFileSync(
  new URL('../migrations/076_reservation_hold_blocks_existing_qr_session.sql', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL('../migrations/078_bl4_concurrency_fixes.sql', import.meta.url),
  'utf8',
);

test('QR customer order is rejected while its table has an active reservation hold', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.reservation_hold_blocks_customer_order/);
  assert.match(migration, /NEW\.order_source = 'customer_zalo'/);
  assert.match(migration, /table_has_current_reservation_hold\(NEW\.table_id, now\(\)\)/);
  assert.match(migration, /Bàn đã được đặt trước/);
});

test('booking table allocation shares the QR advisory lock before taking row locks', () => {
  const allocation = migration.match(
    /CREATE OR REPLACE FUNCTION public\.assign_reservation_tables\([\s\S]*?END;\s*\$\$;/,
  )?.[0];
  assert.ok(allocation, 'migration must replace reservation table allocation');
  const advisoryLock = allocation.indexOf('public.lock_table_for_session(v_table_id)');
  const rowLock = allocation.indexOf('FOR UPDATE');
  assert.ok(advisoryLock >= 0, 'booking allocation must use the lock shared with QR');
  assert.ok(rowLock >= 0, 'keep the existing table row lock');
  assert.ok(advisoryLock < rowLock, 'take the common advisory lock before table row lock');
  assert.match(allocation, /array_agg\(id ORDER BY id\)/);
});

test('session state reports reserved before consulting an already-open session', () => {
  const holdCheck = legacyMigration.indexOf('IF public.table_has_current_reservation_hold(p_table_id,now())');
  const openSessionLookup = legacyMigration.indexOf('SELECT * INTO v_s FROM public.table_sessions');

  assert.ok(holdCheck >= 0, 'must check reservation hold');
  assert.ok(openSessionLookup >= 0, 'must still support normal open sessions');
  assert.ok(holdCheck < openSessionLookup, 'reservation hold must win over an existing session');
  assert.match(legacyMigration, /'state','reserved'/);
});

test('order_source QR thật customer_zalo bị trigger chặn khi booking đang giữ bàn', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE public.orders(id uuid PRIMARY KEY, table_id uuid, order_source text NOT NULL);
      CREATE FUNCTION public.table_has_current_reservation_hold(uuid, timestamptz DEFAULT now())
      RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    `);
    const triggerFunction = migration.match(
      /CREATE OR REPLACE FUNCTION public\.reservation_hold_blocks_customer_order\(\)[\s\S]*?END;\s*\$\$;/,
    )?.[0];
    assert.ok(triggerFunction, 'migration phải định nghĩa trigger chặn QR');
    await db.exec(triggerFunction);
    await db.exec(`CREATE TRIGGER trg_reservation_hold_blocks_customer_order
      BEFORE INSERT ON public.orders FOR EACH ROW
      EXECUTE FUNCTION public.reservation_hold_blocks_customer_order()`);

    await assert.rejects(
      () => db.query("INSERT INTO public.orders VALUES(gen_random_uuid(),gen_random_uuid(),'customer_zalo')"),
      /Bàn đã được đặt trước/,
    );
  } finally {
    await db.close();
  }
});
