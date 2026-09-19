// BL-1 Task 1 — contract cho schema reservation. Chạy với PGLITE_MODULE trỏ tới PGlite từ admin-web.
import { after, afterEach, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const pgliteModule = process.env.PGLITE_MODULE
  ? process.env.PGLITE_MODULE.startsWith('file:')
    ? process.env.PGLITE_MODULE
    : pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const store = id(10)
const otherStore = id(11)
const table = id(20)
const otherStoreTable = id(21)

async function rejected(fn, message) {
  await db.exec('SAVEPOINT expected_error')
  await assert.rejects(fn, message)
  await db.exec('ROLLBACK TO SAVEPOINT expected_error')
}

async function insertPendingReservation() {
  return (await db.query(
    `INSERT INTO reservations(
       store_id, status, customer_name, customer_phone, party_size, arrival_at,
       client_request_id, customer_token_hash, minimum_advance_minutes,
       booking_horizon_days, slot_interval_minutes, default_table_capacity, planning_hold_minutes,
       reservation_preorder_edit_cutoff_minutes
     ) VALUES($1, 'pending', 'Nguyễn Văn A', '0900000000', 2, now() + interval '1 day',
       $2, repeat('a', 64), 30, 7, 15, 6, 180, 30)
     RETURNING id`,
    [store, id(30)],
  )).rows[0].id
}

before(async () => {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    CREATE TABLE stores (id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE tables (
      id uuid PRIMARY KEY,
      store_id uuid NOT NULL REFERENCES stores(id),
      table_number text NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      UNIQUE(id, store_id)
    );
    CREATE TABLE table_sessions (
      id uuid PRIMARY KEY,
      store_id uuid NOT NULL REFERENCES stores(id),
      table_id uuid NOT NULL REFERENCES tables(id),
      status text NOT NULL DEFAULT 'open'
    );
    CREATE TABLE store_workflow_settings (
      store_id uuid PRIMARY KEY REFERENCES stores(id),
      reservations_enabled boolean NOT NULL DEFAULT true,
      reservation_preorder_enabled boolean NOT NULL DEFAULT true,
      minimum_advance_minutes integer NOT NULL DEFAULT 30,
      booking_horizon_days integer NOT NULL DEFAULT 7,
      slot_interval_minutes integer NOT NULL DEFAULT 15,
      default_table_capacity integer NOT NULL DEFAULT 6,
      planning_hold_minutes integer NOT NULL DEFAULT 180,
      reservation_preorder_edit_cutoff_minutes integer NOT NULL DEFAULT 30
    );
    CREATE TABLE mevo_operators (
      user_id uuid PRIMARY KEY REFERENCES auth.users(id),
      store_id uuid REFERENCES stores(id),
      role text NOT NULL,
      is_active boolean NOT NULL DEFAULT true
    );
    CREATE FUNCTION is_store_scoped_operator(p_store_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (
        SELECT 1 FROM mevo_operators
        WHERE user_id = auth.uid() AND store_id = p_store_id AND is_active
      )
    $$;
    CREATE PUBLICATION supabase_realtime;

    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
    INSERT INTO stores(id, name) VALUES ('${store}', 'Bảo Lương'), ('${otherStore}', 'Quán khác');
    INSERT INTO tables(id, store_id, table_number) VALUES
      ('${table}', '${store}', 'Bàn 1'),
      ('${otherStoreTable}', '${otherStore}', 'Bàn khác');
    INSERT INTO store_workflow_settings(store_id) VALUES ('${store}'), ('${otherStore}');
  `)

  const migration = await readFile(
    new URL('../migrations/052_reservation_schema.sql', import.meta.url),
    'utf8',
  )
  await db.exec(migration)
  await db.exec(migration) // Migration production phải chạy lại an toàn.
})

beforeEach(async () => {
  await db.exec('BEGIN')
})

afterEach(async () => {
  await db.exec('ROLLBACK')
  await db.exec('RESET ROLE')
})

after(async () => {
  await db.close()
})

test('anon/authenticated không SELECT, INSERT hoặc UPDATE trực tiếp reservation', async () => {
  await db.exec('SET LOCAL ROLE anon')
  await rejected(() => db.query('SELECT * FROM reservations'), /permission denied/)
  await rejected(
    () => db.query("INSERT INTO reservations(store_id, status) VALUES($1, 'pending')", [store]),
    /permission denied/,
  )
  await rejected(
    () => db.query("UPDATE reservations SET status = 'confirmed' WHERE id = $1", [id(99)]),
    /permission denied/,
  )
  await db.exec('RESET ROLE')
  await db.exec('SET LOCAL ROLE authenticated')
  await rejected(
    () => db.query("INSERT INTO reservations(store_id, status) VALUES($1, 'pending')", [store]),
    /permission denied/,
  )
})

test('booking mới chỉ bắt đầu pending', async () => {
  await rejected(
    () => db.query(
      `INSERT INTO reservations(
         store_id, status, customer_name, customer_phone, party_size, arrival_at,
         client_request_id, customer_token_hash, minimum_advance_minutes,
         booking_horizon_days, slot_interval_minutes, planning_hold_minutes,
         reservation_preorder_edit_cutoff_minutes
       ) VALUES($1, 'completed', 'A', '0900', 2, now(), $2, repeat('b', 64), 30, 7, 15, 180, 30)`,
      [store, id(31)],
    ),
    /pending|reservation_status_transition/,
  )
})

test('allocation không thể ghép reservation quán này với bàn quán khác', async () => {
  const reservation = await insertPendingReservation()
  await rejected(
    () => db.query(
      `INSERT INTO reservation_tables(
         reservation_id, store_id, table_id, hold_starts_at, hold_ends_at
       ) VALUES($1, $2, $3, now() + interval '1 day', now() + interval '1 day 3 hours')`,
      [reservation, store, otherStoreTable],
    ),
    /foreign key|cùng quán/,
  )
})
