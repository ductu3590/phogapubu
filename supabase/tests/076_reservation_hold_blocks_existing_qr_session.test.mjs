import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../migrations/076_reservation_hold_blocks_existing_qr_session.sql', import.meta.url),
  'utf8',
);

test('QR customer order is rejected while its table has an active reservation hold', () => {
  assert.match(migration, /CREATE TRIGGER trg_reservation_hold_blocks_customer_order BEFORE INSERT ON public\.orders/);
  assert.match(migration, /NEW\.order_source = 'customer'/);
  assert.match(migration, /table_has_current_reservation_hold\(NEW\.table_id, now\(\)\)/);
  assert.match(migration, /Bàn đã được đặt trước/);
});

test('session state reports reserved before consulting an already-open session', () => {
  const holdCheck = migration.indexOf('IF public.table_has_current_reservation_hold(p_table_id,now())');
  const openSessionLookup = migration.indexOf('SELECT * INTO v_s FROM public.table_sessions');

  assert.ok(holdCheck >= 0, 'must check reservation hold');
  assert.ok(openSessionLookup >= 0, 'must still support normal open sessions');
  assert.ok(holdCheck < openSessionLookup, 'reservation hold must win over an existing session');
  assert.match(migration, /'state','reserved'/);
});
