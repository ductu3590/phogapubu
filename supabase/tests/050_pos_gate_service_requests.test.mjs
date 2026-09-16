// Chạy với Node: PGLITE_MODULE trỏ tới module PGlite đã cài trong admin-web.
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
const owner = id(1)
const staff = id(2)
const otherOwner = id(3)
const disabledOwner = id(4)
const store = id(10)
const otherStore = id(11)
const table1 = id(20)
const table2 = id(21)
const table3 = id(22)
const table4 = id(23)
const otherTable = id(24)
const traySession = id(30)
const tableSession = id(31)
const otherSession = id(32)

async function login(uid) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid])
  await db.exec('SET LOCAL ROLE authenticated')
}

async function rejected(fn, message) {
  await db.exec('SAVEPOINT expected_error')
  await assert.rejects(fn, message)
  await db.exec('ROLLBACK TO SAVEPOINT expected_error')
}

async function ping(tableId, deviceId, type = 'call_staff') {
  await db.exec('RESET ROLE')
  await db.exec('SET LOCAL ROLE anon')
  return (await db.query(
    'SELECT ping_service_request($1, $2, $3) AS value',
    [tableId, type, deviceId],
  )).rows[0].value
}

async function resolve(requestId) {
  return (await db.query(
    'SELECT resolve_service_request($1) AS value',
    [requestId],
  )).rows[0].value
}

async function listRequests(storeId) {
  return (await db.query(
    'SELECT list_open_service_requests($1) AS value',
    [storeId],
  )).rows[0].value
}

async function close(sessionId, reason = 'paid', instrument = 'cash') {
  return (await db.query(
    'SELECT close_table_session($1, $2, $3) AS value',
    [sessionId, reason, instrument],
  )).rows[0].value
}

async function closeBulk(sessionIds, reason = 'paid', instrument = 'cash') {
  return (await db.query(
    'SELECT close_table_sessions_bulk($1::uuid[], $2, $3) AS value',
    [sessionIds, reason, instrument],
  )).rows[0].value
}

async function expire(storeId) {
  return (await db.query(
    'SELECT expire_stale_table_sessions($1) AS value',
    [storeId],
  )).rows[0].value
}

async function listSessions(storeId) {
  return (await db.query(
    'SELECT list_open_table_sessions($1) AS value',
    [storeId],
  )).rows[0].value
}

before(async () => {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE kitchen;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION kitchen_store_id() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('test.kitchen_store_id', true), '')::uuid $$;

    CREATE TABLE stores (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      address text,
      phone text
    );
    CREATE TABLE tables (
      id uuid PRIMARY KEY,
      store_id uuid NOT NULL REFERENCES stores(id),
      table_number text NOT NULL,
      is_active boolean NOT NULL DEFAULT true
    );
    CREATE TABLE mevo_operators (
      user_id uuid PRIMARY KEY REFERENCES auth.users(id),
      store_id uuid REFERENCES stores(id),
      role text NOT NULL,
      is_active boolean NOT NULL DEFAULT true
    );
    CREATE TABLE table_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id uuid NOT NULL REFERENCES stores(id),
      table_id uuid NOT NULL REFERENCES tables(id),
      status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      host_zalo_user_id text,
      host_device_id text,
      opened_by text NOT NULL DEFAULT 'staff',
      opened_at timestamptz NOT NULL DEFAULT now(),
      last_activity_at timestamptz NOT NULL DEFAULT now(),
      closed_at timestamptz,
      closed_by uuid,
      close_reason text,
      is_open_ordering boolean NOT NULL DEFAULT false
    );
    CREATE TABLE session_tables (
      session_id uuid NOT NULL REFERENCES table_sessions(id),
      table_id uuid NOT NULL REFERENCES tables(id),
      is_open boolean NOT NULL DEFAULT true,
      PRIMARY KEY(session_id, table_id)
    );
    CREATE UNIQUE INDEX session_tables_one_open_per_table
      ON session_tables(table_id) WHERE is_open;
    CREATE TABLE orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id uuid NOT NULL REFERENCES stores(id),
      table_id uuid REFERENCES tables(id),
      session_id uuid REFERENCES table_sessions(id),
      status text NOT NULL DEFAULT 'pending',
      total_amount integer NOT NULL DEFAULT 0,
      order_source text NOT NULL DEFAULT 'customer_zalo',
      payment_received_at timestamptz,
      payment_received_via text,
      payment_received_by uuid,
      payment_instrument text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE order_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES orders(id),
      item_name text NOT NULL,
      item_price integer NOT NULL,
      quantity integer NOT NULL DEFAULT 1,
      selected_toppings jsonb NOT NULL DEFAULT '[]'::jsonb,
      void_type text,
      void_reason text,
      voided_at timestamptz
    );
    CREATE TABLE store_workflow_settings (
      store_id uuid PRIMARY KEY REFERENCES stores(id),
      table_session_idle_timeout_minutes integer NOT NULL DEFAULT 360
    );
    CREATE TABLE service_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id uuid NOT NULL REFERENCES stores(id),
      table_id uuid NOT NULL REFERENCES tables(id),
      table_number text NOT NULL,
      type text NOT NULL DEFAULT 'payment' CHECK (type IN ('payment', 'help')),
      created_at timestamptz DEFAULT now()
    );

    ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
    ALTER TABLE table_sessions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE session_tables ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
    CREATE POLICY kitchen_read_tables ON tables FOR SELECT TO kitchen
      USING (store_id = kitchen_store_id());
    CREATE POLICY anon_insert_service_requests ON service_requests
      FOR INSERT TO anon WITH CHECK (true);

    CREATE FUNCTION is_store_scoped_operator(target_store_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (
        SELECT 1 FROM mevo_operators
        WHERE user_id = auth.uid()
          AND store_id = target_store_id
          AND role IN ('store_owner', 'store_staff')
          AND is_active
      )
    $$;
    CREATE FUNCTION is_store_owner_of(target_store_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (
        SELECT 1 FROM mevo_operators
        WHERE user_id = auth.uid()
          AND store_id = target_store_id
          AND role = 'store_owner'
          AND is_active
      )
    $$;
    CREATE FUNCTION open_session_id_for_table(p_table_id uuid)
    RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT st.session_id
      FROM session_tables st
      JOIN table_sessions s ON s.id = st.session_id
      WHERE st.table_id = p_table_id AND st.is_open AND s.status = 'open'
      LIMIT 1
    $$;
    CREATE FUNCTION expire_stale_table_sessions(p_store_id uuid)
    RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE v_count integer;
    BEGIN
      UPDATE table_sessions
      SET status = 'closed', closed_at = now(), close_reason = 'expired'
      WHERE store_id = p_store_id
        AND status = 'open'
        AND last_activity_at < now() - interval '6 hours';
      GET DIAGNOSTICS v_count = ROW_COUNT;
      RETURN v_count;
    END
    $$;

    CREATE FUNCTION sync_session_tables_open() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      UPDATE session_tables
      SET is_open = (NEW.status = 'open')
      WHERE session_id = NEW.id;
      RETURN NULL;
    END
    $$;
    CREATE TRIGGER trg_session_tables_sync_open
      AFTER UPDATE OF status ON table_sessions
      FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status)
      EXECUTE FUNCTION sync_session_tables_open();

    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, kitchen;
    GRANT SELECT ON mevo_operators TO authenticated;
    GRANT SELECT ON tables TO kitchen;
    GRANT INSERT, SELECT, UPDATE ON service_requests TO anon;
    GRANT SELECT ON service_requests TO authenticated;
    GRANT EXECUTE ON FUNCTION open_session_id_for_table(uuid) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION expire_stale_table_sessions(uuid) TO anon, authenticated;
  `)

  const readerMigration = await readFile(
    new URL('../migrations/047_bill_read_voids.sql', import.meta.url),
    'utf8',
  )
  await db.exec(readerMigration)

  const migration = await readFile(
    new URL('../migrations/050_pos_gate_service_requests.sql', import.meta.url),
    'utf8',
  )
  await db.exec(migration)
  await db.exec(migration) // Chạy lại phải an toàn.

  const sessionLabels = await readFile(
    new URL('../migrations/051_session_labels_and_kitchen_tray_read.sql', import.meta.url),
    'utf8',
  )
  await db.exec(sessionLabels)
  await db.exec(sessionLabels) // Chạy lại phải an toàn.
})

beforeEach(async () => {
  await db.exec('BEGIN')
  await db.query(
    'INSERT INTO auth.users(id) VALUES($1), ($2), ($3), ($4)',
    [owner, staff, otherOwner, disabledOwner],
  )
  await db.query(
    "INSERT INTO stores(id, name) VALUES($1, 'Bảo Lương'), ($2, 'Quán khác')",
    [store, otherStore],
  )
  await db.query(`
    INSERT INTO mevo_operators(user_id, store_id, role, is_active) VALUES
      ($1, $5, 'store_owner', true),
      ($2, $5, 'store_staff', true),
      ($3, $6, 'store_owner', true),
      ($4, $5, 'store_owner', false)
  `, [owner, staff, otherOwner, disabledOwner, store, otherStore])
  await db.query(`
    INSERT INTO tables(id, store_id, table_number) VALUES
      ($1, $6, 'Bàn 1'), ($2, $6, 'Bàn 2'),
      ($3, $6, 'Bàn 3'), ($4, $6, 'Bàn 4'),
      ($5, $7, 'Bàn khác')
  `, [table1, table2, table3, table4, otherTable, store, otherStore])
  await db.query(`
    INSERT INTO store_workflow_settings(store_id, table_session_idle_timeout_minutes)
    VALUES($1, 360), ($2, 60)
  `, [store, otherStore])
  await db.query(`
    INSERT INTO table_sessions(id, store_id, table_id, is_open_ordering)
    VALUES($1, $4, $2, true), ($3, $4, $5, false)
  `, [traySession, table1, tableSession, store, table3])
  await db.query(`
    INSERT INTO table_sessions(id, store_id, table_id)
    VALUES($1, $2, $3)
  `, [otherSession, otherStore, otherTable])
  await db.query(`
    INSERT INTO session_tables(session_id, table_id) VALUES
      ($1, $2), ($1, $3), ($4, $5), ($6, $7)
  `, [traySession, table1, table2, tableSession, table3, otherSession, otherTable])
  await db.query("SELECT set_config('request.jwt.claim.sub', '', false)")
})

afterEach(async () => {
  await db.exec('ROLLBACK')
  await db.exec('RESET ROLE')
})

after(async () => {
  await db.close()
})

test('hai QR trong cùng mâm chỉ tạo một request mở', async () => {
  const first = await ping(table1, 'device-a')
  await db.exec('RESET ROLE')
  await db.exec("UPDATE service_requests SET last_ping_at = now() - interval '61 seconds'")
  const second = await ping(table2, 'device-b')
  await db.exec('RESET ROLE')

  const rows = (await db.query(`
    SELECT * FROM service_requests
    WHERE store_id = $1 AND resolved_at IS NULL
  `, [store])).rows
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, first.id)
  assert.equal(second.id, first.id)
  assert.equal(rows[0].session_id, traySession)
  assert.equal(rows[0].table_id, table2)
  assert.equal(rows[0].table_number, 'Bàn 2')
  assert.equal(rows[0].ping_count, 2)
  assert.equal(rows[0].last_device_id, 'device-b')
})

test('ping dưới 10 giây bị throttle và không đổi request', async () => {
  const first = await ping(table1, 'device-a')
  await rejected(() => ping(table1, 'device-a'), /Vui lòng chờ/)
  await db.exec('RESET ROLE')

  const rows = (await db.query(`
    SELECT id, ping_count FROM service_requests
    WHERE store_id = $1 AND resolved_at IS NULL
  `, [store])).rows
  assert.deepEqual(rows, [{ id: first.id, ping_count: 1 }])
})

test('bàn chưa có phiên giữ request mở riêng theo từng bàn', async () => {
  const first = await ping(table4, 'device-a')
  await db.exec('RESET ROLE')
  await db.exec("UPDATE service_requests SET last_ping_at = now() - interval '11 seconds'")
  const repeated = await ping(table4, 'device-b')
  await db.exec('RESET ROLE')

  assert.equal(repeated.id, first.id)
  const rows = (await db.query(`
    SELECT session_id, table_id, ping_count FROM service_requests
    WHERE store_id = $1 AND resolved_at IS NULL
  `, [store])).rows
  assert.deepEqual(rows, [{ session_id: null, table_id: table4, ping_count: 2 }])
})

test('resolve rồi ping tạo lượt mới; staff chỉ xử lý đúng quán', async () => {
  const first = await ping(table1, 'device-a')
  await login(staff)
  assert.equal((await listRequests(store)).length, 1)
  await rejected(() => listRequests(otherStore), /Không có quyền/)

  const resolved = await resolve(first.id)
  assert.equal(resolved.already, false)
  const saved = (await db.query(`
    SELECT resolved_at, resolved_by FROM service_requests WHERE id = $1
  `, [first.id])).rows[0]
  assert.ok(saved.resolved_at)
  assert.equal(saved.resolved_by, staff)
  assert.deepEqual(await listRequests(store), [])

  const second = await ping(table2, 'device-b')
  assert.notEqual(second.id, first.id)

  await login(otherOwner)
  await rejected(() => resolve(second.id), /Không có quyền/)
})

test('chỉ chấp nhận call_staff và bàn đang hoạt động', async () => {
  await rejected(() => ping(table1, 'device-a', 'payment'), /Loại yêu cầu không hợp lệ/)
  await db.exec('RESET ROLE')
  await db.query('UPDATE tables SET is_active = false WHERE id = $1', [table4])
  await rejected(() => ping(table4, 'device-a'), /Bàn không thuộc quán hoặc không hoạt động/)
})

test('anon gọi RPC được nhưng không INSERT hoặc UPDATE trực tiếp', async () => {
  const request = await ping(table1, 'device-a')
  await rejected(
    () => db.query(`
      INSERT INTO service_requests(store_id, table_id, table_number, type)
      VALUES($1, $2, 'Bàn 1', 'call_staff')
    `, [store, table1]),
    /permission denied/,
  )
  await rejected(
    () => db.query('UPDATE service_requests SET ping_count = 99 WHERE id = $1', [request.id]),
    /permission denied/,
  )

  await login(owner)
  await rejected(
    () => db.query(`
      INSERT INTO service_requests(store_id, table_id, table_number, type)
      VALUES($1, $2, 'Bàn 1', 'call_staff')
    `, [store, table1]),
    /permission denied/,
  )
  await rejected(
    () => db.query('UPDATE service_requests SET resolved_at = now() WHERE id = $1', [request.id]),
    /permission denied/,
  )
})

test('staff không đóng bill; owner không đóng khi còn đơn pending ngoài POS', async () => {
  const order = id(40)
  await db.query(`
    INSERT INTO orders(id, store_id, table_id, session_id, status, total_amount, order_source)
    VALUES($1, $2, $3, $4, 'pending', 120000, 'staff')
  `, [order, store, table1, traySession])

  await login(staff)
  for (const reason of ['paid', 'staff_reset']) {
    await rejected(() => close(traySession, reason), /Chỉ chủ quán/)
  }
  await login(disabledOwner)
  await rejected(() => close(traySession), /Chỉ chủ quán/)

  await login(owner)
  await rejected(
    () => close(traySession),
    /Còn 1 đơn chưa được chủ quán xác nhận/,
  )

  await db.exec('RESET ROLE')
  await db.query("UPDATE orders SET order_source = 'pos' WHERE id = $1", [order])
  await login(owner)
  const result = await close(traySession)
  assert.equal(result.already, false)
  assert.equal(result.orders_settled, 1)

  await db.exec('RESET ROLE')
  const savedOrder = (await db.query(`
    SELECT payment_received_via, payment_received_by, payment_instrument
    FROM orders WHERE id = $1
  `, [order])).rows[0]
  assert.deepEqual(savedOrder, {
    payment_received_via: 'owner',
    payment_received_by: owner,
    payment_instrument: 'cash',
  })
  assert.equal((await db.query(`
    SELECT status FROM table_sessions WHERE id = $1
  `, [traySession])).rows[0].status, 'closed')
  assert.equal((await db.query(`
    SELECT count(*)::int AS n FROM session_tables
    WHERE session_id = $1 AND is_open
  `, [traySession])).rows[0].n, 0)
  assert.equal((await db.query(
    'SELECT open_session_id_for_table($1) AS id',
    [table2],
  )).rows[0].id, null)
})

test('owner staff_reset giữ hành vi huỷ đơn chưa nấu và nhả bàn', async () => {
  const order = id(44)
  await db.query(`
    INSERT INTO orders(id, store_id, table_id, session_id, status, total_amount, order_source)
    VALUES($1, $2, $3, $4, 'confirmed', 70000, 'staff')
  `, [order, store, table3, tableSession])

  await login(owner)
  const result = await close(tableSession, 'staff_reset')
  assert.equal(result.already, false)
  assert.equal(result.orders_cancelled, 1)

  await db.exec('RESET ROLE')
  assert.equal((await db.query(
    'SELECT status FROM orders WHERE id = $1',
    [order],
  )).rows[0].status, 'cancelled')
  assert.equal((await db.query(`
    SELECT is_open FROM session_tables WHERE session_id = $1
  `, [tableSession])).rows[0].is_open, false)
})

test('đóng nhiều mâm là nguyên tử và vẫn dùng đúng ánh xạ session_tables', async () => {
  const trayOrder = id(41)
  const tableOrder = id(42)
  await db.query(`
    INSERT INTO orders(id, store_id, table_id, session_id, status, total_amount, order_source)
    VALUES
      ($1, $3, $4, $5, 'pending', 100000, 'pos'),
      ($2, $3, $6, $7, 'pending', 50000, 'staff')
  `, [trayOrder, tableOrder, store, table1, traySession, table3, tableSession])
  await login(owner)
  await rejected(
    () => closeBulk([traySession, tableSession]),
    /Còn 1 đơn chưa được chủ quán xác nhận/,
  )
  await db.exec('RESET ROLE')
  assert.equal((await db.query(`
    SELECT count(*)::int AS n FROM table_sessions
    WHERE id = ANY($1::uuid[]) AND status = 'open'
  `, [[traySession, tableSession]])).rows[0].n, 2)
  assert.equal((await db.query(`
    SELECT count(*)::int AS n FROM orders
    WHERE id = ANY($1::uuid[]) AND payment_received_at IS NOT NULL
  `, [[trayOrder, tableOrder]])).rows[0].n, 0)

  await db.exec('RESET ROLE')
  await db.query("UPDATE orders SET order_source = 'pos' WHERE id = $1", [tableOrder])
  await login(owner)
  const result = await closeBulk([tableSession, traySession, traySession])
  assert.equal(result.sessions, 2)
  assert.equal(result.orders_settled, 2)
  await db.exec('RESET ROLE')
  assert.equal((await db.query(`
    SELECT count(*)::int AS n FROM session_tables
    WHERE session_id = ANY($1::uuid[]) AND is_open
  `, [[traySession, tableSession]])).rows[0].n, 0)
})

test('timeout đọc theo từng quán và phiên hết hạn còn nợ vẫn được review', async () => {
  const unpaidOrder = id(43)
  await db.query(`
    INSERT INTO orders(id, store_id, table_id, session_id, status, total_amount, order_source)
    VALUES($1, $2, $3, $4, 'confirmed', 90000, 'staff')
  `, [unpaidOrder, store, table1, traySession])
  await db.query(`
    UPDATE table_sessions
    SET last_activity_at = now() - interval '61 minutes'
    WHERE id IN ($1, $2)
  `, [traySession, otherSession])

  assert.equal(await expire(store), 0)
  assert.equal(await expire(otherStore), 1)
  assert.equal((await db.query(`
    SELECT status FROM table_sessions WHERE id = $1
  `, [traySession])).rows[0].status, 'open')

  await db.query(`
    UPDATE table_sessions
    SET last_activity_at = now() - interval '361 minutes'
    WHERE id = $1
  `, [traySession])
  assert.equal(await expire(store), 1)

  await login(owner)
  const sessions = await listSessions(store)
  const expired = sessions.find((item) => item.session_id === traySession)
  assert.ok(expired)
  assert.equal(expired.status, 'closed')
  assert.equal(expired.needs_review, true)
  assert.equal(expired.unpaid_total, 90000)
  assert.equal(expired.table_number, 'Bàn 1, Bàn 2')
})

test('kitchen chỉ đọc nhãn mâm của đúng quán', async () => {
  await db.query("SELECT set_config('test.kitchen_store_id', $1, false)", [store])
  await db.exec('SET ROLE kitchen')
  const rows = (await db.query(`
    SELECT st.session_id, t.table_number
    FROM session_tables st
    JOIN tables t ON t.id = st.table_id
    ORDER BY t.table_number
  `)).rows
  assert.deepEqual(rows, [
    { session_id: traySession, table_number: 'Bàn 1' },
    { session_id: traySession, table_number: 'Bàn 2' },
    { session_id: tableSession, table_number: 'Bàn 3' },
  ])
  await db.exec('RESET ROLE')
})
