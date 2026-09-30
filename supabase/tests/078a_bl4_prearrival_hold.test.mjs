import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const modulePath = process.env.PGLITE_MODULE
const { PGlite } = await import(modulePath
  ? modulePath.startsWith('file:') ? modulePath : pathToFileURL(modulePath).href
  : '@electric-sql/pglite')

// Chạy thân hàm phân bổ thật theo thứ tự migration. Helper phiên/summary được stub;
// bộ này chỉ kiểm thời gian và xung đột tuần tự, KHÔNG chứng minh race/khóa đồng thời.
const correction = '078a_bl4_restore_prearrival_hold.sql'
const migrations = ['075_reservation_prearrival_table_lock.sql', '078_bl4_concurrency_fixes.sql', correction]
async function fixture(t) {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    CREATE TABLE tables(id uuid PRIMARY KEY, store_id uuid, is_active boolean DEFAULT true);
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE reservations(id uuid PRIMARY KEY, store_id uuid, status text, arrival_at timestamptz);
    CREATE TABLE reservation_tables(
      reservation_id uuid, store_id uuid, table_id uuid, hold_starts_at timestamptz,
      hold_ends_at timestamptz, assigned_by uuid, assigned_at timestamptz DEFAULT now(),
      released_at timestamptz, released_by uuid, release_reason text,
      UNIQUE(reservation_id, table_id));
    CREATE FUNCTION open_session_id_for_table(uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION lock_table_for_session(uuid) RETURNS void LANGUAGE sql
      AS $$ SELECT pg_advisory_xact_lock(hashtext($1::text)) $$;
    CREATE FUNCTION reservation_active_table_summary(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '[]'::jsonb $$;
  `)
  for (const file of migrations) {
    const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')
    const allocation = sql.match(/CREATE OR REPLACE FUNCTION public\.assign_reservation_tables\([\s\S]*?END;\s*\$\$;/)?.[0]
    assert.ok(allocation, `${file}: thiếu hàm phân bổ`)
    await db.exec(allocation)
  }
  const storeId = randomUUID(), tableId = randomUUID()
  await db.query('INSERT INTO tables(id,store_id) VALUES($1,$2)', [tableId, storeId])
  async function assign(arrival) {
    const id = randomUUID()
    await db.query("INSERT INTO reservations VALUES($1,$2,'confirmed',$3)", [id, storeId, arrival])
    await db.query('SELECT assign_reservation_tables($1,$2,$3,180,$4::uuid[],NULL)', [id, storeId, arrival, [tableId]])
    return id
  }
  return { db, assign }
}

test('allocation mới giữ bàn từ trước giờ đến 60 phút sau toàn bộ override BL-4', async t => {
  const { db, assign } = await fixture(t)
  const id = await assign('2030-01-01T04:00:00Z')
  const { rows: [row] } = await db.query(`SELECT
    extract(epoch FROM (r.arrival_at-rt.hold_starts_at))::int AS advance_seconds,
    extract(epoch FROM (rt.hold_ends_at-r.arrival_at))::int AS planning_seconds
    FROM reservation_tables rt JOIN reservations r ON r.id=rt.reservation_id WHERE r.id=$1`, [id])
  assert.deepEqual(row, { advance_seconds: 3600, planning_seconds: 10800 })
})

test('booking sau bị chặn nếu chỉ khoảng giữ trước 60 phút chồng booking trước', async t => {
  const { assign } = await fixture(t)
  await assign('2030-01-01T04:00:00Z') // giữ 03:00–07:00 UTC
  await assert.rejects(() => assign('2030-01-01T07:30:00Z'), /Bàn đã được giữ/)
})

test('hai khoảng giữ liền kề không chồng nhau vẫn phân bổ được', async t => {
  const { db, assign } = await fixture(t)
  await assign('2030-01-01T04:00:00Z')
  await assign('2030-01-01T08:00:00Z') // giữ 07:00–11:00 UTC
  assert.equal((await db.query('SELECT count(*)::int AS n FROM reservation_tables')).rows[0].n, 2)
})

test('migration sửa phân bổ còn hiệu lực, không sửa lịch sử đã giải phóng/booking kết thúc', async t => {
  const { db, assign } = await fixture(t)
  const active = await assign('2030-01-01T04:00:00Z')
  const released = await assign('2030-01-02T04:00:00Z')
  const ended = await assign('2030-01-03T04:00:00Z')
  await db.exec(`UPDATE reservation_tables rt SET hold_starts_at=r.arrival_at
    FROM reservations r WHERE r.id=rt.reservation_id`)
  await db.query('UPDATE reservation_tables SET released_at=now() WHERE reservation_id=$1', [released])
  await db.query("UPDATE reservations SET status='no_show' WHERE id=$1", [ended])
  await db.exec(await readFile(new URL(`../migrations/${correction}`, import.meta.url), 'utf8'))
  const { rows } = await db.query(`SELECT r.id,
    extract(epoch FROM (r.arrival_at-rt.hold_starts_at))::int AS seconds
    FROM reservations r JOIN reservation_tables rt ON rt.reservation_id=r.id`)
  const seconds = new Map(rows.map(row => [row.id, row.seconds]))
  assert.equal(seconds.get(active), 3600)
  assert.equal(seconds.get(released), 0)
  assert.equal(seconds.get(ended), 0)
  const { rows: [permissions] } = await db.query(`SELECT
    has_function_privilege('anon','assign_reservation_tables(uuid,uuid,timestamptz,integer,uuid[],uuid)','execute') AS anon,
    has_function_privilege('authenticated','assign_reservation_tables(uuid,uuid,timestamptz,integer,uuid[],uuid)','execute') AS authenticated`)
  assert.deepEqual(permissions, { anon: false, authenticated: false })
})
