import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Test mig 114: trạm in, hàng đợi in, máy in phần mềm, chế độ in.
const pgliteModule = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : '@electric-sql/pglite'
const { PGlite } = await import(pgliteModule)
const db = new PGlite()
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const owner = id(1), cashier = id(2), staff = id(3), otherOwner = id(4)
const store = id(10), otherStore = id(11), noStore = id(12)
const migrationSql = await readFile(new URL('../migrations/114_print_stations_jobs.sql', import.meta.url), 'utf8')

async function login(uid) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid])
  await db.exec('SET ROLE authenticated')
}
async function asAnon() {
  await db.exec('RESET ROLE')
  await db.exec('SET ROLE anon')
}
async function asRole(role) {
  await db.exec('RESET ROLE')
  await db.exec(`SET ROLE ${role}`)
}
// Chạy một lệnh với quyền superuser rồi trả lại role cũ
async function admin(sql, params = []) {
  await db.exec('RESET ROLE')
  return db.query(sql, params)
}
async function rpc(uid, sql, params = []) {
  await login(uid)
  try {
    return (await db.query(sql, params)).rows[0]
  } finally {
    await db.exec('RESET ROLE')
  }
}

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    -- Giả lập bẫy default privileges của Supabase: object mới tự cấp quyền cho anon/authenticated
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE stores(id uuid PRIMARY KEY, name text);
    CREATE TABLE mevo_operators(user_id uuid PRIMARY KEY, store_id uuid, role text, is_active boolean DEFAULT true);
    CREATE FUNCTION is_store_owner_of(p_store_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM mevo_operators WHERE user_id = auth.uid() AND store_id = p_store_id
        AND role = 'store_owner' AND is_active)
    $$;
    CREATE FUNCTION is_store_pos_operator(p_store_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM mevo_operators WHERE user_id = auth.uid() AND store_id = p_store_id
        AND role IN ('store_owner','store_cashier') AND is_active)
    $$;
    CREATE TABLE store_workflow_settings(
      store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
      kitchen_release_policy text NOT NULL DEFAULT 'automatic',
      staff_order_release_policy text NOT NULL DEFAULT 'automatic',
      updated_at timestamptz DEFAULT now(), updated_by uuid
    );
    CREATE TABLE menu_categories(id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE, name text);
    INSERT INTO stores VALUES ('${store}', 'Quán A'), ('${otherStore}', 'Quán B');
    INSERT INTO auth.users(id, email) VALUES ('${owner}','a@x'), ('${cashier}','b@x'), ('${staff}','c@x'), ('${otherOwner}','d@x'), ('${noStore}','e@x');
    INSERT INTO mevo_operators VALUES
      ('${owner}', '${store}', 'store_owner', true), ('${cashier}', '${store}', 'store_cashier', true),
      ('${staff}', '${store}', 'store_staff', true), ('${otherOwner}', '${otherStore}', 'store_owner', true);
    INSERT INTO store_workflow_settings(store_id, kitchen_release_policy, staff_order_release_policy)
      VALUES ('${store}', 'pos_confirmation', 'pos_confirmation'), ('${otherStore}', 'automatic', 'automatic');
  `)
  await db.exec(migrationSql)
  await db.exec('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role')
})

after(async () => db.close())

test('anon và authenticated không đọc được 3 bảng in', async () => {
  for (const role of ['anon', 'authenticated']) {
    for (const t of ['print_jobs', 'print_agents', 'print_stations']) {
      await asRole(role)
      await assert.rejects(db.query(`SELECT * FROM ${t}`), /permission denied/, `${role} đọc ${t}`)
    }
  }
  await db.exec('RESET ROLE')
})

test('set_print_mode: thu ngân bị từ chối, chủ quán được', async () => {
  for (const uid of [cashier, staff, otherOwner]) {
    await login(uid)
    await assert.rejects(db.query(`SELECT set_print_mode('${store}', 'agent')`), /Không có quyền/)
  }
  await db.exec('RESET ROLE')
  const r = await rpc(owner, `SELECT set_print_mode('${store}', 'agent') AS r`)
  assert.equal(r.r.mode, 'agent')
  await admin(`UPDATE store_workflow_settings SET print_mode = 'browser' WHERE store_id = '${store}'`)
})

test('bật agent tạo Quầy + Bếp đúng một lần', async () => {
  await rpc(owner, `SELECT set_print_mode('${store}', 'agent')`)
  await rpc(owner, `SELECT set_print_mode('${store}', 'agent')`)
  const c = (await admin(`SELECT count(*)::int n, count(*) FILTER (WHERE is_pos)::int pos,
    count(*) FILTER (WHERE is_default_kitchen)::int kit FROM print_stations WHERE store_id = '${store}'`)).rows[0]
  assert.deepEqual(c, { n: 2, pos: 1, kit: 1 })
})

test('không bật agent khi một trong hai policy là automatic', async () => {
  await login(otherOwner)
  await assert.rejects(db.query(`SELECT set_print_mode('${otherStore}', 'agent')`), /thu ngân xác nhận/)
  await db.exec('RESET ROLE')
  // Chỉ một trong hai là automatic cũng bị chặn
  await admin(`UPDATE store_workflow_settings SET kitchen_release_policy = 'pos_confirmation',
    staff_order_release_policy = 'automatic' WHERE store_id = '${otherStore}'`)
  await login(otherOwner)
  await assert.rejects(db.query(`SELECT set_print_mode('${otherStore}', 'agent')`), /thu ngân xác nhận/)
  await db.exec('RESET ROLE')
  assert.equal((await admin(`SELECT print_mode FROM store_workflow_settings WHERE store_id = '${otherStore}'`)).rows[0].print_mode, 'browser')
  await admin(`UPDATE store_workflow_settings SET kitchen_release_policy = 'automatic' WHERE store_id = '${otherStore}'`)
})

test('đang agent không đổi policy về automatic được', async () => {
  assert.equal((await admin(`SELECT print_mode FROM store_workflow_settings WHERE store_id = '${store}'`)).rows[0].print_mode, 'agent')
  await assert.rejects(
    admin(`UPDATE store_workflow_settings SET kitchen_release_policy = 'automatic' WHERE store_id = '${store}'`),
    /thu ngân xác nhận/)
  await assert.rejects(
    admin(`UPDATE store_workflow_settings SET staff_order_release_policy = 'automatic' WHERE store_id = '${store}'`),
    /thu ngân xác nhận/)
})

test('get_print_mode: mặc định browser, store_staff đọc được agent', async () => {
  assert.equal((await rpc(staff, 'SELECT get_print_mode() AS m')).m, 'agent')
  assert.equal((await rpc(cashier, 'SELECT get_print_mode() AS m')).m, 'agent')
  assert.equal((await rpc(otherOwner, 'SELECT get_print_mode() AS m')).m, 'browser')
  // Không có quán → browser
  assert.equal((await rpc(noStore, 'SELECT get_print_mode() AS m')).m, 'browser')
})

test('mỗi quán một trạm is_pos, một is_default_kitchen', async () => {
  await assert.rejects(
    admin(`INSERT INTO print_stations(store_id, name, is_pos) VALUES ('${store}', 'Quầy 2', true)`), /unique|duplicate/i)
  await assert.rejects(
    admin(`INSERT INTO print_stations(store_id, name, is_default_kitchen) VALUES ('${store}', 'Bếp 2', true)`), /unique|duplicate/i)
  // Trạm thường (không cờ) thêm thoải mái
  await admin(`INSERT INTO print_stations(store_id, name) VALUES ('${store}', 'Bar'), ('${store}', 'Nướng')`)
})

test('xoá trạm: danh mục về NULL, store_id giữ nguyên', async () => {
  const sid = (await admin(`SELECT id FROM print_stations WHERE store_id = '${store}' AND name = 'Bar'`)).rows[0].id
  await admin(`INSERT INTO menu_categories(id, store_id, name) VALUES ('${id(50)}', '${store}', 'Đồ uống')`)
  await admin(`UPDATE menu_categories SET print_station_id = '${sid}' WHERE id = '${id(50)}'`)
  await admin(`DELETE FROM print_stations WHERE id = '${sid}'`)
  const c = (await admin(`SELECT store_id, print_station_id FROM menu_categories WHERE id = '${id(50)}'`)).rows[0]
  assert.equal(c.store_id, store)
  assert.equal(c.print_station_id, null)
})

test('không gán được trạm của quán khác vào danh mục', async () => {
  const other = (await admin(`INSERT INTO print_stations(store_id, name) VALUES ('${otherStore}', 'Bếp B') RETURNING id`)).rows[0].id
  await assert.rejects(
    admin(`UPDATE menu_categories SET print_station_id = '${other}' WHERE id = '${id(50)}'`), /foreign key/i)
})

test('get_print_settings không lộ token_hash, pair_code_hash', async () => {
  await rpc(owner, `SELECT create_print_pair_code('${store}', 'Máy quầy')`)
  await admin(`INSERT INTO print_agents(store_id, name, token_hash, printers) VALUES ('${store}', 'Quầy chính', 'abc123secret', '[{"name":"XP-80"}]')`)
  const r = (await rpc(cashier, `SELECT get_print_settings('${store}') AS r`)).r
  const text = JSON.stringify(r)
  assert.ok(!/hash/i.test(text), text)
  assert.ok(!text.includes('abc123secret'))
  assert.equal(r.mode, 'agent')
  assert.equal(r.kitchen_release_policy, 'pos_confirmation')
  assert.equal(r.stations[0].is_pos, true)
  assert.equal(r.agent.name, 'Quầy chính')
  assert.equal(r.agent.online, false)
  // Nhân viên và quán khác bị từ chối
  for (const uid of [staff, otherOwner]) {
    await login(uid)
    await assert.rejects(db.query(`SELECT get_print_settings('${store}')`), /Không có quyền/)
  }
  await db.exec('RESET ROLE')
  await admin(`DELETE FROM print_agents WHERE store_id = '${store}'`)
})

test('mã ghép 6 chữ số, hết hạn sau 10 phút', async () => {
  const r = (await rpc(owner, `SELECT create_print_pair_code('${store}', 'Máy quầy') AS r`)).r
  assert.match(r.code, /^\d{6}$/)
  const mins = (new Date(r.expires_at).getTime() - Date.now()) / 60000
  assert.ok(mins > 9.5 && mins <= 10.01, `mins=${mins}`)
  // DB không giữ mã gốc
  const row = (await admin(`SELECT pair_code_hash FROM print_agents WHERE store_id = '${store}'`)).rows[0]
  assert.notEqual(row.pair_code_hash, r.code)
  // Thu ngân không tạo được
  await login(cashier)
  await assert.rejects(db.query(`SELECT create_print_pair_code('${store}', 'x')`), /Không có quyền/)
  await db.exec('RESET ROLE')
})

test('revoke_print_agent: chỉ chủ quán, đặt token_hash NULL', async () => {
  const a = (await admin(`INSERT INTO print_agents(store_id, name, token_hash) VALUES ('${store}', 'M', 'zzz') RETURNING id`)).rows[0].id
  await login(cashier)
  await assert.rejects(db.query(`SELECT revoke_print_agent('${a}')`), /Không có quyền/)
  await login(otherOwner)
  await assert.rejects(db.query(`SELECT revoke_print_agent('${a}')`), /Không có quyền/)
  await db.exec('RESET ROLE')
  await rpc(owner, `SELECT revoke_print_agent('${a}')`)
  assert.equal((await admin(`SELECT token_hash FROM print_agents WHERE id = '${a}'`)).rows[0].token_hash, null)
})

// ===================== Task 3: RPC của phần mềm in =====================
let keySeq = 0
async function resetPrint() {
  await admin(`DELETE FROM print_jobs`)
  await admin(`DELETE FROM print_agents`)
  await admin(`UPDATE print_stations SET printer_name = 'XP-80' WHERE is_default_kitchen OR is_pos`)
}
async function stationId(sid, flag = 'is_default_kitchen') {
  return (await admin(`SELECT id FROM print_stations WHERE store_id = $1 AND ${flag}`, [sid])).rows[0].id
}
async function anonRpc(sql, params = []) {
  await asAnon()
  try {
    return (await db.query(sql, params)).rows[0].r
  } finally {
    await db.exec('RESET ROLE')
  }
}
async function pairNew(sid = store, uid = owner, name = 'Máy quầy') {
  const { code } = (await rpc(uid, `SELECT create_print_pair_code($1, $2) AS r`, [sid, name])).r
  const r = await anonRpc(`SELECT print_agent_pair($1, $2, $3) AS r`, [code, name, '1.0.0'])
  assert.equal(r.ok, true, JSON.stringify(r))
  return { token: r.token, agentId: r.agent_id, code, r }
}
async function addJob({ sid = store, station, kind = 'kitchen_ticket', minsAgo = 0 } = {}) {
  const st = station === undefined ? await stationId(sid) : station
  const jid = (await admin(
    `INSERT INTO print_jobs(store_id, station_id, kind, ref, dedupe_key, created_by, created_at)
     VALUES ($1, $2, $3, '{"orderId":"o1"}', $4, $5, now() - ($6 || ' minutes')::interval) RETURNING id`,
    [sid, st, kind, `k${++keySeq}`, owner, String(minsAgo)])).rows[0].id
  return jid
}
const poll = (token, printers = null) =>
  anonRpc(`SELECT print_agent_poll($1, '1.0.0', $2::jsonb) AS r`, [token, printers && JSON.stringify(printers)])
const report = (token, jobId, ok, error = null, retryable = false) =>
  anonRpc(`SELECT print_agent_report($1, $2, $3, $4, $5) AS r`, [token, jobId, ok, error, retryable])
const jobRow = async (jid) => (await admin(`SELECT * FROM print_jobs WHERE id = $1`, [jid])).rows[0]

test('ghép đúng mã trả token, DB chỉ giữ hash; mã không dùng lại được', async () => {
  await resetPrint()
  const { token, code, r } = await pairNew()
  assert.match(token, /^[0-9a-f]{64}$/)
  assert.equal(r.store_name, 'Quán A')
  const rows = (await admin(`SELECT token_hash, pair_code_hash FROM print_agents WHERE store_id = $1`, [store])).rows
  assert.equal(rows.length, 1)
  assert.notEqual(rows[0].token_hash, token)
  assert.equal(rows[0].pair_code_hash, null)
  const again = await anonRpc(`SELECT print_agent_pair($1, 'x', '1') AS r`, [code])
  assert.equal(again.ok, false)
})

test('ghép máy mới: token máy cũ bị từ chối', async () => {
  await resetPrint()
  const a = await pairNew()
  assert.equal((await poll(a.token)).ok, true)
  const b = await pairNew()
  assert.deepEqual(await poll(a.token), { ok: false, error: 'revoked' })
  assert.equal((await poll(b.token)).ok, true)
  assert.deepEqual(await poll('khong-ton-tai'), { ok: false, error: 'revoked' })
  assert.deepEqual(await poll(''), { ok: false, error: 'revoked' })
})

test('sai 20 lần thì mã đang sống bị huỷ', async () => {
  await resetPrint()
  const { code } = (await rpc(owner, `SELECT create_print_pair_code($1, 'M') AS r`, [store])).r
  const wrong = code === '000000' ? '111111' : '000000'
  for (let i = 0; i < 20; i++) {
    const r = await anonRpc(`SELECT print_agent_pair($1, 'x', '1') AS r`, [wrong])
    assert.equal(r.ok, false)
  }
  const r = await anonRpc(`SELECT print_agent_pair($1, 'x', '1') AS r`, [code])
  assert.equal(r.ok, false)
  assert.equal((await admin(`SELECT count(*)::int n FROM print_agents WHERE token_hash IS NOT NULL`)).rows[0].n, 0)
})

test('sai mã cộng bộ đếm cho mã của quán khác (không biết nhắm mã nào)', async () => {
  await resetPrint()
  await rpc(otherOwner, `SELECT create_print_pair_code($1, 'B') AS r`, [otherStore])
  await anonRpc(`SELECT print_agent_pair('abcdef', 'x', '1') AS r`)
  const n = (await admin(`SELECT pair_fail_count n FROM print_agents WHERE store_id = $1`, [otherStore])).rows[0].n
  assert.equal(n, 1)
  await admin(`DELETE FROM print_agents`)
})

test('poll: một job chỉ giao một lần', async () => {
  await resetPrint()
  const { token } = await pairNew()
  const j = await addJob()
  const r1 = await poll(token)
  assert.equal(r1.job.id, j)
  assert.equal(r1.job.kind, 'kitchen_ticket')
  assert.equal(r1.job.printer_name, 'XP-80')
  assert.equal(r1.job.attempts, 1)
  assert.match(r1.job.render_token, /^[0-9a-f]{64}$/)
  const r2 = await poll(token)
  assert.equal(r2.ok, true)
  assert.equal(r2.job, null)
  assert.equal((await jobRow(j)).status, 'printing')
})

test('poll: FIFO theo created_at, đúng quán', async () => {
  await resetPrint()
  const { token } = await pairNew()
  const late = await addJob({ minsAgo: 1 })
  const early = await addJob({ minsAgo: 5 })
  const foreign = await addJob({ sid: otherStore, station: null, minsAgo: 20 })
  assert.equal((await poll(token)).job.id, early)
  assert.equal((await poll(token)).job.id, late)
  assert.equal((await poll(token)).job, null)
  assert.equal((await jobRow(foreign)).status, 'queued')
})

test('poll: trạm chưa có máy thì job failed, lấy job kế tiếp', async () => {
  await resetPrint()
  const { token } = await pairNew()
  const bar = (await admin(`INSERT INTO print_stations(store_id, name) VALUES ($1, 'Bar') RETURNING id`, [store])).rows[0].id
  const noPrinter = await addJob({ station: bar, minsAgo: 5 })
  const ok = await addJob({ minsAgo: 3 })
  const r = await poll(token)
  assert.equal(r.job.id, ok)
  assert.equal((await jobRow(noPrinter)).status, 'failed')
  assert.equal((await jobRow(noPrinter)).error, 'Trạm chưa chọn máy in')
  await admin(`DELETE FROM print_stations WHERE id = $1`, [bar])
})

test('poll: job mất trạm mà quán không có trạm thay thế thì failed "Trạm chưa chọn máy in"', async () => {
  await resetPrint()
  const { token } = await pairNew(otherStore, otherOwner, 'Máy B')
  const orphan = await addJob({ sid: otherStore, station: null, minsAgo: 4 })
  assert.equal((await poll(token)).job, null)
  const row = await jobRow(orphan)
  assert.equal(row.status, 'failed')
  assert.equal(row.error, 'Trạm chưa chọn máy in')
})

test('xoá trạm khi job đang queued: phiếu bếp ra trạm bếp mặc định, ghi lại station_id', async () => {
  await resetPrint()
  const { token } = await pairNew()
  const kitchen = await stationId(store)
  await admin(`UPDATE print_stations SET printer_name = 'BEP-1' WHERE id = $1`, [kitchen])
  const tmp = (await admin(`INSERT INTO print_stations(store_id, name, printer_name) VALUES ($1, 'Tạm', 'TAM-1') RETURNING id`, [store])).rows[0].id
  const j = await addJob({ station: tmp })
  await admin(`DELETE FROM print_stations WHERE id = $1`, [tmp])
  assert.equal((await jobRow(j)).station_id, null)
  const r = await poll(token)
  assert.equal(r.job.id, j)
  assert.equal(r.job.printer_name, 'BEP-1')
  assert.equal((await jobRow(j)).station_id, kitchen)
})

test('xoá trạm khi job queued: loại phiếu khác (phiếu bàn) về Quầy', async () => {
  await resetPrint()
  const { token } = await pairNew()
  const pos = await stationId(store, 'is_pos')
  await admin(`UPDATE print_stations SET printer_name = 'QUAY-1' WHERE id = $1`, [pos])
  const j = await addJob({ station: null, kind: 'table_slip' })
  const r = await poll(token)
  assert.equal(r.job.id, j)
  assert.equal(r.job.printer_name, 'QUAY-1')
  assert.equal((await jobRow(j)).station_id, pos)
})

test('thay thế đúng quán: không lấy trạm của quán khác', async () => {
  await resetPrint()
  const { token } = await pairNew(otherStore, otherOwner, 'Máy B')
  await admin(`UPDATE print_stations SET printer_name = 'XP-80' WHERE store_id = $1`, [store])
  const j = await addJob({ sid: otherStore, station: null })
  assert.equal((await poll(token)).job, null)
  assert.equal((await jobRow(j)).status, 'failed')
})

test('job chờ quá 30 phút: expired, không giao cho phần mềm', async () => {
  await resetPrint()
  const { token } = await pairNew()
  const j = await addJob({ minsAgo: 31 })
  const r = await poll(token)
  assert.equal(r.job, null)
  assert.equal((await jobRow(j)).status, 'expired')
})

test('job chờ 29 phút vẫn được giao', async () => {
  await resetPrint()
  const { token } = await pairNew()
  const j = await addJob({ minsAgo: 29 })
  assert.equal((await poll(token)).job.id, j)
})

test('printing quá 2 phút: failed "Không rõ đã in chưa", KHÔNG về queued', async () => {
  await resetPrint()
  const { token } = await pairNew()
  const j = await addJob()
  assert.equal((await poll(token)).job.id, j)
  await admin(`UPDATE print_jobs SET claimed_at = now() - interval '3 minutes' WHERE id = $1`, [j])
  const r = await poll(token)
  assert.equal(r.job, null)
  const row = await jobRow(j)
  assert.equal(row.status, 'failed')
  assert.equal(row.error, 'Không rõ đã in chưa, kiểm tra máy in rồi bấm In lại')
  // Báo cáo trễ sau khi đã bị coi là lỗi không được lật lại thành done
  const late = await report(token, j, true)
  assert.equal(late.ok, false)
  assert.equal((await jobRow(j)).status, 'failed')
})

test('report ok: done + printed_at', async () => {
  await resetPrint()
  const { token } = await pairNew()
  const j = await addJob()
  await poll(token)
  assert.equal((await report(token, j, true)).ok, true)
  const row = await jobRow(j)
  assert.equal(row.status, 'done')
  assert.ok(row.printed_at)
})

test('report lỗi retryable: lần 1, 2 về queued, lần 3 thành failed', async () => {
  await resetPrint()
  const { token } = await pairNew()
  const j = await addJob()
  for (const n of [1, 2]) {
    assert.equal((await poll(token)).job.attempts, n)
    await report(token, j, false, 'Máy in bận', true)
    assert.equal((await jobRow(j)).status, 'queued')
  }
  assert.equal((await poll(token)).job.attempts, 3)
  await report(token, j, false, 'Máy in bận', true)
  const row = await jobRow(j)
  assert.equal(row.status, 'failed')
  assert.equal(row.error, 'Máy in bận')
})

test('report không retryable: failed ngay', async () => {
  await resetPrint()
  const { token } = await pairNew()
  const j = await addJob()
  await poll(token)
  await report(token, j, false, 'Không tìm thấy máy in', false)
  const row = await jobRow(j)
  assert.equal(row.status, 'failed')
  assert.equal(row.error, 'Không tìm thấy máy in')
})

test('report của quán khác không đổi job', async () => {
  await resetPrint()
  const a = await pairNew()
  const b = await pairNew(otherStore, otherOwner, 'Máy B')
  const j = await addJob()
  await poll(a.token)
  const r = await report(b.token, j, true)
  assert.equal(r.ok, false)
  assert.equal((await jobRow(j)).status, 'printing')
  // job chưa nhận (queued) cũng không báo được
  const j2 = await addJob()
  assert.equal((await report(a.token, j2, true)).ok, false)
  assert.equal((await jobRow(j2)).status, 'queued')
})

test('token trang in: đúng job được, job khác NULL, quá 2 phút NULL', async () => {
  await resetPrint()
  const { token } = await pairNew()
  const j1 = await addJob({ minsAgo: 2 })
  const j2 = await addJob({ minsAgo: 1 })
  const p1 = (await poll(token)).job
  const p2 = (await poll(token)).job
  assert.equal(p1.id, j1)
  assert.equal(p2.id, j2)
  const render = async (jid, tk) => {
    await asRole('service_role')
    try {
      return (await db.query(`SELECT print_job_for_render($1, $2) AS r`, [jid, tk])).rows[0].r
    } finally {
      await db.exec('RESET ROLE')
    }
  }
  const ok = await render(j1, p1.render_token)
  assert.equal(ok.id, j1)
  assert.equal(ok.store_id, store)
  assert.equal(ok.kind, 'kitchen_ticket')
  assert.equal(ok.created_by, owner)
  assert.equal(ok.station_name, 'Bếp')
  assert.deepEqual(ok.ref, { orderId: 'o1' })
  assert.equal(await render(j2, p1.render_token), null)
  assert.equal(await render(j1, 'sai-token'), null)
  assert.equal(await render(j1, null), null)
  await admin(`UPDATE print_jobs SET render_token_expires_at = now() - interval '1 second' WHERE id = $1`, [j1])
  assert.equal(await render(j1, p1.render_token), null)
  // Sau khi báo xong, token trang in cũng hết dùng
  await report(token, j2, true)
  assert.equal(await render(j2, p2.render_token), null)
})

test('print_job_for_render: anon và authenticated không gọi được', async () => {
  const j = await addJob()
  for (const role of ['anon', 'authenticated']) {
    await asRole(role)
    await assert.rejects(db.query(`SELECT print_job_for_render($1, 'x')`, [j]), /permission denied/)
  }
  await db.exec('RESET ROLE')
})

test('expire_print_jobs nội bộ: anon và authenticated không gọi được', async () => {
  await asRole('anon')
  await assert.rejects(db.query(`SELECT expire_print_jobs($1)`, [store]), /permission denied/)
  await login(owner)
  await assert.rejects(db.query(`SELECT expire_print_jobs($1)`, [store]), /permission denied/)
  await db.exec('RESET ROLE')
})

test('get_print_status: thu ngân đọc được, quán khác và nhân viên bị từ chối', async () => {
  await resetPrint()
  await pairNew()
  await addJob()
  const r = (await rpc(cashier, `SELECT get_print_status($1) AS r`, [store])).r
  assert.equal(r.mode, 'agent')
  assert.equal(r.queued_count, 1)
  assert.equal(r.problem_jobs.length, 0)
  for (const uid of [staff, otherOwner]) {
    await login(uid)
    await assert.rejects(db.query(`SELECT get_print_status($1)`, [store]), /Không có quyền/)
  }
  await db.exec('RESET ROLE')
  assert.ok(!/hash/i.test(JSON.stringify(r)))
})

test('agent_online: last_seen 29 giây true, 31 giây false', async () => {
  await resetPrint()
  const { agentId } = await pairNew()
  await admin(`UPDATE print_agents SET last_seen_at = now() - interval '29 seconds' WHERE id = $1`, [agentId])
  assert.equal((await rpc(owner, `SELECT get_print_status($1) AS r`, [store])).r.agent_online, true)
  await admin(`UPDATE print_agents SET last_seen_at = now() - interval '31 seconds' WHERE id = $1`, [agentId])
  const r = (await rpc(owner, `SELECT get_print_status($1) AS r`, [store])).r
  assert.equal(r.agent_online, false)
  assert.ok(r.last_seen_at)
})

test('poll: last_seen_at chỉ ghi khi cũ hơn 10 giây', async () => {
  await resetPrint()
  const { token, agentId } = await pairNew()
  await poll(token)
  const t1 = (await admin(`SELECT last_seen_at FROM print_agents WHERE id = $1`, [agentId])).rows[0].last_seen_at
  await poll(token)
  const t2 = (await admin(`SELECT last_seen_at FROM print_agents WHERE id = $1`, [agentId])).rows[0].last_seen_at
  assert.equal(t1.getTime(), t2.getTime())
  await admin(`UPDATE print_agents SET last_seen_at = now() - interval '11 seconds' WHERE id = $1`, [agentId])
  await poll(token, [{ name: 'XP-80' }])
  const row = (await admin(`SELECT last_seen_at, printers FROM print_agents WHERE id = $1`, [agentId])).rows[0]
  assert.ok(Date.now() - row.last_seen_at.getTime() < 5000)
  assert.deepEqual(row.printers, [{ name: 'XP-80' }])
  // printers NULL = không đổi
  await poll(token, null)
  assert.deepEqual((await admin(`SELECT printers FROM print_agents WHERE id = $1`, [agentId])).rows[0].printers, [{ name: 'XP-80' }])
})

test('get_print_status chỉ liệt kê failed/expired chưa xử lý', async () => {
  await resetPrint()
  await pairNew()
  const f = await addJob({ minsAgo: 1 })
  const e = await addJob({ minsAgo: 40 })
  await addJob({ minsAgo: 0 })
  await admin(`UPDATE print_jobs SET status = 'failed', error = 'lỗi' WHERE id = $1`, [f])
  const r = (await rpc(owner, `SELECT get_print_status($1) AS r`, [store])).r
  const ids = r.problem_jobs.map((p) => p.id).sort()
  assert.deepEqual(ids, [f, e].sort())
  assert.equal(r.queued_count, 1)
  const p = r.problem_jobs.find((x) => x.id === f)
  assert.equal(p.kind, 'kitchen_ticket')
  assert.equal(p.status, 'failed')
  assert.equal(p.error, 'lỗi')
  // ref không có label/request: label rơi về nhãn theo kind, request null
  assert.equal(p.label, 'Phiếu bếp')
  assert.equal(p.request, null)
  // ref có sẵn label + request (PrintRequest) thì lấy nguyên văn
  const req = { kind: 'order', orderId: 'o1' }
  await admin(`UPDATE print_jobs SET ref = $2::jsonb WHERE id = $1`,
    [f, JSON.stringify({ label: 'Phiếu bếp Bàn 5', request: req })])
  const r2 = (await rpc(owner, `SELECT get_print_status($1) AS r`, [store])).r
  const p2 = r2.problem_jobs.find((x) => x.id === f)
  assert.equal(p2.label, 'Phiếu bếp Bàn 5')
  assert.deepEqual(p2.request, req)
})

test('retry_print_job: job mới queued, job cũ ẩn khỏi problem_jobs, gọi lại không tạo thêm', async () => {
  await resetPrint()
  const f = await addJob()
  await admin(`UPDATE print_jobs SET status = 'failed', error = 'lỗi' WHERE id = $1`, [f])
  const r1 = (await rpc(cashier, `SELECT retry_print_job($1) AS r`, [f])).r
  assert.equal(r1.ok, true)
  const nj = await jobRow(r1.job_id)
  assert.equal(nj.status, 'queued')
  assert.equal(nj.created_by, cashier)
  assert.equal(nj.kind, 'kitchen_ticket')
  assert.equal(nj.station_id, (await jobRow(f)).station_id)
  assert.match(nj.dedupe_key, /^k\d+:r[0-9a-f-]{36}$/)
  assert.ok((await jobRow(f)).resolved_at)
  const r2 = (await rpc(cashier, `SELECT retry_print_job($1) AS r`, [f])).r
  assert.deepEqual(r2, { ok: true, already: true })
  assert.equal((await admin(`SELECT count(*)::int n FROM print_jobs`)).rows[0].n, 2)
  const st = (await rpc(owner, `SELECT get_print_status($1) AS r`, [store])).r
  assert.equal(st.problem_jobs.length, 0)
})

test('retry_print_job: nhân viên và quán khác bị từ chối; job chưa lỗi không in lại được', async () => {
  await resetPrint()
  const f = await addJob()
  await admin(`UPDATE print_jobs SET status = 'failed' WHERE id = $1`, [f])
  for (const uid of [staff, otherOwner]) {
    await login(uid)
    await assert.rejects(db.query(`SELECT retry_print_job($1)`, [f]), /Không có quyền/)
    await assert.rejects(db.query(`SELECT dismiss_print_job($1)`, [f]), /Không có quyền/)
  }
  await db.exec('RESET ROLE')
  const q = await addJob()
  const r = (await rpc(owner, `SELECT retry_print_job($1) AS r`, [q])).r
  assert.equal(r.ok, false)
  assert.equal((await admin(`SELECT count(*)::int n FROM print_jobs`)).rows[0].n, 2)
})

test('retry_print_job: job mất trạm chép trạm thay thế, không chép NULL', async () => {
  await resetPrint()
  const f = await addJob({ station: null })
  await admin(`UPDATE print_jobs SET status = 'failed', error = 'Trạm chưa chọn máy in' WHERE id = $1`, [f])
  const r = (await rpc(owner, `SELECT retry_print_job($1) AS r`, [f])).r
  assert.equal(r.ok, true)
  assert.equal((await jobRow(r.job_id)).station_id, await stationId(store))
  // phiếu bàn về Quầy
  const g = await addJob({ station: null, kind: 'table_slip' })
  await admin(`UPDATE print_jobs SET status = 'expired' WHERE id = $1`, [g])
  const r2 = (await rpc(owner, `SELECT retry_print_job($1) AS r`, [g])).r
  assert.equal((await jobRow(r2.job_id)).station_id, await stationId(store, 'is_pos'))
})

test('dismiss_print_job: job queued/printing không có tác dụng', async () => {
  await resetPrint()
  const q = await addJob()
  const r = (await rpc(owner, `SELECT dismiss_print_job($1) AS r`, [q])).r
  assert.equal(r.ok, false)
  assert.equal((await jobRow(q)).resolved_at, null)
  await admin(`UPDATE print_jobs SET status = 'printing' WHERE id = $1`, [q])
  assert.equal((await rpc(owner, `SELECT dismiss_print_job($1) AS r`, [q])).r.ok, false)
  assert.equal((await jobRow(q)).resolved_at, null)
})

test('ghép bằng mã quá hạn bị từ chối', async () => {
  await resetPrint()
  const { code } = (await rpc(owner, `SELECT create_print_pair_code($1, 'M') AS r`, [store])).r
  await admin(`UPDATE print_agents SET pair_expires_at = now() - interval '1 second' WHERE store_id = $1`, [store])
  const r = await anonRpc(`SELECT print_agent_pair($1, 'x', '1') AS r`, [code])
  assert.equal(r.ok, false)
  assert.equal((await admin(`SELECT count(*)::int n FROM print_agents WHERE token_hash IS NOT NULL`)).rows[0].n, 0)
})

test('poll sau revoke_print_agent trả revoked', async () => {
  await resetPrint()
  const { token, agentId } = await pairNew()
  assert.equal((await poll(token)).ok, true)
  await rpc(owner, `SELECT revoke_print_agent($1)`, [agentId])
  assert.deepEqual(await poll(token), { ok: false, error: 'revoked' })
  assert.deepEqual(await report(token, id(999), true), { ok: false, error: 'revoked' })
})

test('dismiss_print_job: ẩn khỏi problem_jobs, không tạo job mới', async () => {
  await resetPrint()
  const f = await addJob()
  await admin(`UPDATE print_jobs SET status = 'failed' WHERE id = $1`, [f])
  assert.equal((await rpc(cashier, `SELECT dismiss_print_job($1) AS r`, [f])).r.ok, true)
  assert.equal((await rpc(owner, `SELECT get_print_status($1) AS r`, [store])).r.problem_jobs.length, 0)
  assert.equal((await admin(`SELECT count(*)::int n FROM print_jobs`)).rows[0].n, 1)
})

test('dedupe: INSERT trùng (store_id, dedupe_key) ON CONFLICT DO NOTHING không tạo dòng thứ hai', async () => {
  await resetPrint()
  const ins = () => admin(
    `INSERT INTO print_jobs(store_id, kind, dedupe_key, created_by) VALUES ($1, 'bill', 'same', $2)
     ON CONFLICT (store_id, dedupe_key) DO NOTHING`, [store, owner])
  await ins()
  await ins()
  assert.equal((await admin(`SELECT count(*)::int n FROM print_jobs`)).rows[0].n, 1)
  // Quán khác dùng cùng khoá thì vẫn được
  await admin(`INSERT INTO print_jobs(store_id, kind, dedupe_key, created_by) VALUES ($1, 'bill', 'same', $2)`, [otherStore, owner])
})

test('tĩnh: có FOR UPDATE SKIP LOCKED; mọi hàm mới có REVOKE ... FROM PUBLIC, anon, authenticated', () => {
  assert.match(migrationSql, /FOR UPDATE SKIP LOCKED/)
  const names = [...migrationSql.matchAll(/CREATE OR REPLACE FUNCTION\s+(\w+)\s*\(/g)].map((m) => m[1])
  assert.ok(names.length >= 14, names.join(','))
  for (const n of names) {
    assert.match(migrationSql, new RegExp(`REVOKE ALL ON FUNCTION ${n}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`), n)
  }
  // Chỉ 3 hàm của phần mềm được GRANT cho anon (khoá công khai)
  const anonGrants = [...migrationSql.matchAll(/GRANT EXECUTE ON FUNCTION\s+(\w+)\([^)]*\)\s+TO anon/g)].map((m) => m[1]).sort()
  assert.deepEqual(anonGrants, ['print_agent_pair', 'print_agent_poll', 'print_agent_report'])
  assert.match(migrationSql, /GRANT EXECUTE ON FUNCTION print_job_for_render\(uuid, text\) TO service_role;/)
})
