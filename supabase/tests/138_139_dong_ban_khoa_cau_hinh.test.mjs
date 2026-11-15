import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Test mig 138 (không cho đóng bàn đang có khách / đang giữ cho đặt bàn) và mig 139 (quy trình vận hành chỉ
// MEVO sửa; chủ quán chỉ đổi Đang nhận đơn + Giờ phục vụ). Mig 139 vá tại chỗ bản chụp prod
// prod-defs/139/update_store_workflow_settings.sql (đo 2026-11-13, sau mig 137).
// Checklist tay: docs/testing/yen-garden/FIX-BAN-CAU-HINH.md
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const owner = id(1), superadmin = id(2), otherOwner = id(3)
const store = id(10), otherStore = id(11)
const tBusy = id(20), tFree = id(21), tHeld = id(22), tTray = id(23)
const sessionBusy = id(30), sessionTray = id(31)
const reservation = id(40)

const defFile = new URL('./prod-defs/139/update_store_workflow_settings.sql', import.meta.url)
const PROD_MD5 = 'ad9e403977222d5237d054fc9f5ca538' // md5(pg_get_functiondef) trên prod 2026-11-13
const mig138 = new URL('../migrations/138_tables_close_guard.sql', import.meta.url)
const mig139 = new URL('../migrations/139_workflow_settings_superadmin_only.sql', import.meta.url)
// core.autocrlf trên Windows có thể đổi file migration sang CRLF — chuẩn hoá trước khi nạp
const load = async (url) => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')

const current = {
  payment_timing: 'postpay',
  payment_methods: ['cash'],
  is_accepting_orders: true,
  serving_hours: [],
  table_ordering_enabled: true,
  takeaway_enabled: false,
  shipping_enabled: false,
  reservations_enabled: true,
  reservation_preorder_enabled: true,
  minimum_advance_minutes: 30,
  booking_horizon_days: 7,
  slot_interval_minutes: 30,
  default_table_capacity: 6,
  planning_hold_minutes: 180,
  kitchen_release_policy: 'pos_confirmation',
  staff_order_release_policy: 'pos_confirmation',
  open_ordering_on_arrival: true,
  table_session_idle_timeout_minutes: 360,
  reservation_preorder_edit_cutoff_minutes: 30,
}

async function as(uid, fn) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid])
  await db.exec('SET ROLE authenticated')
  try {
    return await fn()
  } finally {
    await db.exec('RESET ROLE')
  }
}
const save = (uid, storeId, settings, via) =>
  as(uid, () => db.query('SELECT update_store_workflow_settings($1, $2::jsonb, $3) AS v',
    [storeId, JSON.stringify(settings), via]))
const snapshot = async (storeId) =>
  (await db.query('SELECT store_workflow_snapshot($1) AS v', [storeId])).rows[0].v
const setActive = (tableId, active) =>
  db.query('UPDATE tables SET is_active = $2 WHERE id = $1', [tableId, active])

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;

    CREATE TABLE mevo_operators(user_id uuid PRIMARY KEY, store_id uuid, role text, is_active boolean DEFAULT true);
    CREATE TABLE stores(id uuid PRIMARY KEY, payment_timing text, payment_methods text[],
      is_accepting_orders boolean, serving_hours jsonb);
    CREATE TABLE store_workflow_settings(
      store_id uuid PRIMARY KEY REFERENCES stores(id),
      table_ordering_enabled boolean DEFAULT true, takeaway_enabled boolean DEFAULT false,
      shipping_enabled boolean DEFAULT false, reservations_enabled boolean DEFAULT true,
      reservation_preorder_enabled boolean DEFAULT true, minimum_advance_minutes int DEFAULT 30,
      booking_horizon_days int DEFAULT 7, slot_interval_minutes int DEFAULT 30,
      default_table_capacity int DEFAULT 6, planning_hold_minutes int DEFAULT 180,
      kitchen_release_policy text DEFAULT 'pos_confirmation', staff_order_release_policy text DEFAULT 'pos_confirmation',
      open_ordering_on_arrival boolean DEFAULT true, table_session_idle_timeout_minutes int DEFAULT 360,
      reservation_preorder_edit_cutoff_minutes int DEFAULT 30, business_day_start time DEFAULT '00:00',
      require_cash_shift boolean DEFAULT false, updated_at timestamptz, updated_by uuid);
    CREATE TABLE store_workflow_setting_events(store_id uuid, before_value jsonb, after_value jsonb,
      changed_by uuid, changed_via text);
    CREATE TABLE tables(id uuid PRIMARY KEY, store_id uuid, table_number text, is_active boolean DEFAULT true);
    CREATE TABLE table_sessions(id uuid PRIMARY KEY, store_id uuid, table_id uuid, status text);
    CREATE TABLE session_tables(session_id uuid, table_id uuid, is_open boolean DEFAULT true);
    CREATE TABLE orders(id uuid PRIMARY KEY, store_id uuid, status text, session_id uuid);
    CREATE TABLE reservations(id uuid PRIMARY KEY, store_id uuid, status text);
    CREATE TABLE reservation_tables(reservation_id uuid, store_id uuid, table_id uuid,
      hold_starts_at timestamptz, hold_ends_at timestamptz, released_at timestamptz);

    -- Hai hàm phụ đúng định nghĩa prod (đo 2026-11-13).
    CREATE FUNCTION public.operator_password_ok() RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS $function$
      SELECT coalesce(
        coalesce(
          nullif(current_setting('request.jwt.claim', true), ''),
          nullif(current_setting('request.jwt.claims', true), '')
        )::jsonb -> 'app_metadata' ->> 'must_change_password',
        ''
      ) IS DISTINCT FROM 'true'
    $function$;
    CREATE FUNCTION public.store_workflow_snapshot(p_store_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path TO 'public' AS $function$
      SELECT jsonb_build_object(
        'payment_timing', s.payment_timing,
        'payment_methods', to_jsonb(s.payment_methods),
        'is_accepting_orders', s.is_accepting_orders,
        'serving_hours', s.serving_hours,
        'table_ordering_enabled', w.table_ordering_enabled,
        'takeaway_enabled', w.takeaway_enabled,
        'shipping_enabled', w.shipping_enabled,
        'reservations_enabled', w.reservations_enabled,
        'reservation_preorder_enabled', w.reservation_preorder_enabled,
        'minimum_advance_minutes', w.minimum_advance_minutes,
        'booking_horizon_days', w.booking_horizon_days,
        'slot_interval_minutes', w.slot_interval_minutes,
        'default_table_capacity', w.default_table_capacity,
        'planning_hold_minutes', w.planning_hold_minutes,
        'kitchen_release_policy', w.kitchen_release_policy,
        'staff_order_release_policy', w.staff_order_release_policy,
        'open_ordering_on_arrival', w.open_ordering_on_arrival,
        'table_session_idle_timeout_minutes', w.table_session_idle_timeout_minutes,
        'reservation_preorder_edit_cutoff_minutes', w.reservation_preorder_edit_cutoff_minutes,
        'business_day_start', to_char(w.business_day_start, 'HH24:MI'),
        'require_cash_shift', w.require_cash_shift
      )
      FROM public.stores s
      JOIN public.store_workflow_settings w ON w.store_id = s.id
      WHERE s.id = p_store_id;
    $function$;

    INSERT INTO mevo_operators VALUES
      ('${owner}', '${store}', 'store_owner', true),
      ('${otherOwner}', '${otherStore}', 'store_owner', true),
      ('${superadmin}', NULL, 'mevo_superadmin', true);
    INSERT INTO stores VALUES
      ('${store}', 'postpay', ARRAY['cash'], true, '[]'::jsonb),
      ('${otherStore}', 'postpay', ARRAY['cash'], true, '[]'::jsonb);
    INSERT INTO store_workflow_settings(store_id) VALUES ('${store}'), ('${otherStore}');

    INSERT INTO tables(id, store_id, table_number) VALUES
      ('${tBusy}', '${store}', 'Bàn mẫu 1'), ('${tFree}', '${store}', 'Bàn mẫu 2'),
      ('${tHeld}', '${store}', 'Bàn 3'), ('${tTray}', '${store}', 'Bàn 4');
    -- Bàn mẫu 1: phiên bàn lẻ đang mở. Bàn 4: thuộc mâm ghép (chỉ có dòng session_tables, phiên đặt ở bàn khác).
    INSERT INTO table_sessions VALUES
      ('${sessionBusy}', '${store}', '${tBusy}', 'open'),
      ('${sessionTray}', '${store}', '${tFree}', 'closed');
    INSERT INTO session_tables VALUES ('${sessionBusy}', '${tBusy}', true), ('${sessionTray}', '${tTray}', true);
    INSERT INTO reservations VALUES ('${reservation}', '${store}', 'confirmed');
    INSERT INTO reservation_tables VALUES
      ('${reservation}', '${store}', '${tHeld}', now() + interval '1 hour', now() + interval '4 hours', NULL);
  `)
  await db.exec(await readFile(defFile, 'utf8'))
  await db.exec(await load(mig138))
  await db.exec(await load(mig139))
})

after(async () => db.close())

// ---------- mig 139 ----------

test('139: bản chụp đúng byte prod, neo khớp đúng 1 lần, đúng mẫu vá tại chỗ', async () => {
  const raw = await readFile(defFile)
  assert.equal(createHash('md5').update(raw).digest('hex'), PROD_MD5)
  const sql = await load(mig139)
  const anchor = sql.match(/\$a\$([\s\S]*?)\$a\$/)[1]
  assert.equal(raw.toString('utf8').split(anchor).length - 1, 1)
  assert.doesNotMatch(sql, /rerun-safe/i)
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\./)
  assert.match(sql, /NOTIFY pgrst, 'reload schema';\s*$/)
})

test('139: chạy lại lần hai thì RAISE, không vá chồng', async () => {
  // PGlite giữ một phiên nên hàm pg_temp của lần nạp đầu vẫn còn; prod mỗi lần áp là phiên mới.
  await db.exec('DROP FUNCTION pg_temp.mig139_patch(text, text, text)')
  await assert.rejects(db.exec(await load(mig139)), /mig 139: .* đã được vá rồi/)
})

test('139: chủ quán đổi Đang nhận đơn + Giờ phục vụ → lưu được', async () => {
  const next = { ...current, is_accepting_orders: false, serving_hours: [{ open: '16:00', close: '23:30' }] }
  await save(owner, store, next, 'owner')
  const snap = await snapshot(store)
  assert.equal(snap.is_accepting_orders, false)
  assert.deepEqual(snap.serving_hours, [{ open: '16:00', close: '23:30' }])
  // trả lại như cũ cho các test sau
  await save(owner, store, current, 'owner')
})

test('139: chủ quán gửi lại y nguyên cấu hình → không bị chặn', async () => {
  await save(owner, store, current, 'owner')
})

test('139: chủ quán đổi BẤT KỲ mục khoá nào → bị từ chối, DB không đổi', async () => {
  const locked = {
    payment_timing: 'prepay',
    payment_methods: ['cash', 'zalo_checkout'],
    table_ordering_enabled: false,
    takeaway_enabled: true,
    shipping_enabled: true,
    reservations_enabled: false,
    reservation_preorder_enabled: false,
    minimum_advance_minutes: 60,
    booking_horizon_days: 14,
    slot_interval_minutes: 15,
    default_table_capacity: 8,
    planning_hold_minutes: 120,
    kitchen_release_policy: 'automatic',
    staff_order_release_policy: 'automatic',
    open_ordering_on_arrival: false,
    table_session_idle_timeout_minutes: 600,
    reservation_preorder_edit_cutoff_minutes: 60,
  }
  const before = await snapshot(store)
  for (const [key, value] of Object.entries(locked)) {
    const next = { ...current, [key]: value }
    if (key === 'reservations_enabled') next.reservation_preorder_enabled = false
    await assert.rejects(save(owner, store, next, 'owner'), /Chủ quán chỉ đổi được Đang nhận đơn và Giờ phục vụ/, key)
  }
  assert.deepEqual(await snapshot(store), before)
})

test('139: chủ quán đổi mục khoá KÈM Đang nhận đơn → từ chối cả lần lưu', async () => {
  await assert.rejects(
    save(owner, store, { ...current, is_accepting_orders: false, kitchen_release_policy: 'automatic' }, 'owner'),
    /Chủ quán chỉ đổi được/,
  )
  assert.equal((await snapshot(store)).is_accepting_orders, true)
})

test('139: chủ quán quán khác vẫn bị chặn như cũ', async () => {
  await assert.rejects(save(otherOwner, store, current, 'owner'), /Chỉ được sửa quán của mình/)
})

test('139: superadmin vẫn sửa được mục khoá (quán không còn phiên mở)', async () => {
  await assert.rejects(
    save(superadmin, store, { ...current, kitchen_release_policy: 'automatic' }, 'mevo'),
    /Còn phiên đang hoạt động/, // luật cũ của hàm: phiên bàn mẫu 1 đang mở
  )
  const next = { ...current, slot_interval_minutes: 15, takeaway_enabled: true }
  await save(superadmin, otherStore, next, 'mevo')
  const snap = await snapshot(otherStore)
  assert.equal(snap.slot_interval_minutes, 15)
  assert.equal(snap.takeaway_enabled, true)
})

// ---------- mig 138 ----------

test('138: không đóng được bàn đang có khách (phiên bàn lẻ)', async () => {
  await assert.rejects(setActive(tBusy, false), /Bàn "Bàn mẫu 1" đang có khách/)
})

test('138: không đóng được bàn đang nằm trong mâm ghép đang mở', async () => {
  await assert.rejects(setActive(tTray, false), /Bàn "Bàn 4" đang có khách/)
})

test('138: không đóng được bàn đang giữ cho lượt đặt bàn sắp tới', async () => {
  await assert.rejects(setActive(tHeld, false), /đang được giữ cho một lượt đặt bàn/)
})

test('138: bàn trống đóng được và mở lại được', async () => {
  await setActive(tFree, false)
  await setActive(tFree, true)
  const r = await db.query('SELECT is_active FROM tables WHERE id = $1', [tFree])
  assert.equal(r.rows[0].is_active, true)
})

test('138: phiên đóng / giữ bàn đã nhả → đóng được', async () => {
  await db.query(`UPDATE table_sessions SET status = 'closed' WHERE id = $1`, [sessionBusy])
  await db.query(`UPDATE session_tables SET is_open = false WHERE table_id = $1`, [tBusy])
  await setActive(tBusy, false)
  await db.query(`UPDATE reservation_tables SET released_at = now() WHERE table_id = $1`, [tHeld])
  await setActive(tHeld, false)
})

test('138: đổi cột khác của bàn đang có khách không bị trigger chặn', async () => {
  await db.query(`UPDATE session_tables SET is_open = true WHERE table_id = $1`, [tTray])
  await db.query(`UPDATE tables SET table_number = 'Bàn 4A' WHERE id = $1`, [tTray])
})

test('138: hàm trigger không gọi được từ client', async () => {
  const r = await db.query(`SELECT
    has_function_privilege('anon', 'public.tables_guard_close()', 'EXECUTE') AS anon,
    has_function_privilege('authenticated', 'public.tables_guard_close()', 'EXECUTE') AS auth`)
  assert.deepEqual(r.rows[0], { anon: false, auth: false })
})
