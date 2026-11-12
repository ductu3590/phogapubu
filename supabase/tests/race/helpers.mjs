// Dùng chung cho bộ test tranh chấp (race) của các RPC tiền.
//
// Khác các test trong supabase/tests/*.test.mjs (PGlite, MỘT kết nối): ở đây mỗi "người" là một kết nối
// Postgres thật riêng, nên khoá dòng (FOR UPDATE / FOR SHARE), advisory lock và unique index chạy đúng như prod.
//
// Chỉ chạy qua `node scripts/test-race.mjs` (hoặc `npm run test:race` trong admin-web): script đó dựng
// container Postgres tạm trên 127.0.0.1, nạp toàn bộ migration rồi truyền cổng + mật khẩu qua biến môi trường.
// Thiếu biến môi trường → mọi test tự bỏ qua (để `node --test` quét cả thư mục supabase/tests không bị đỏ).
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const enabled = Boolean(process.env.RACE_PG_PORT && process.env.RACE_PG_MODULE)
export const SKIP = enabled ? false : 'chỉ chạy qua scripts/test-race.mjs (cần Postgres thật trong Docker)'
// Số vòng lặp của mỗi kịch bản "chạy song song tự nhiên". Một lần chạy may mắn không chứng minh được gì.
export const ITER = Math.max(1, Number(process.env.RACE_ITERATIONS ?? 25))

export const DEADLOCK = '40P01'
// RAISE EXCEPTION không ghi mã → P0001: lỗi nghiệp vụ có câu chữ tiếng Việt cho người dùng.
export const BUSINESS_ERROR = 'P0001'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const rid = () => randomUUID()

async function loadPg() {
  const mod = await import(pathToFileURL(process.env.RACE_PG_MODULE).href)
  return mod.default ?? mod
}

// Một kết nối = một người (hoặc một máy POS). call() KHÔNG ném lỗi: trả { ok, value } hoặc { ok:false, code, message }
// để test xem được bên thua nhận gì.
class Actor {
  constructor(sink, client, label) {
    this.sink = sink // nơi gom kết quả (fixture của một quán)
    this.client = client
    this.label = label
    this.pid = client.processID
  }

  async call(expr, params = []) {
    const started = performance.now()
    let out
    try {
      const res = await this.client.query(`SELECT ${expr} AS r`, params)
      out = { ok: true, value: res.rows[0].r }
    } catch (err) {
      out = { ok: false, code: err.code ?? 'NO_CODE', message: err.message }
    }
    out.by = this.label
    out.expr = expr.slice(0, expr.indexOf('('))
    out.ms = Math.round(performance.now() - started)
    this.sink.outcomes.push(out)
    return out
  }

  // Giao dịch tường minh: giữ khoá của RPC cho tới khi commit() / rollback() → dựng xen kẽ có chủ đích.
  async begin() { await this.client.query('BEGIN') }
  async commit() { await this.client.query('COMMIT') }
  async rollback() { await this.client.query('ROLLBACK') }
}

export async function openHarness() {
  const pg = await loadPg()
  const config = {
    host: process.env.RACE_PG_HOST ?? '127.0.0.1',
    port: Number(process.env.RACE_PG_PORT),
    user: 'postgres',
    password: process.env.RACE_PG_PASSWORD,
    database: 'postgres',
  }
  // Chốt an toàn: chỉ nối vào máy này (container tạm của scripts/test-race.mjs), không bao giờ ra ngoài.
  if (!['127.0.0.1', 'localhost', '::1'].includes(config.host)) {
    throw new Error(`Bộ test race chỉ chạy trên Postgres cục bộ, không phải ${config.host}`)
  }

  const clients = new Set()
  async function connect() {
    const client = new pg.Client(config)
    client.on('error', () => {}) // container bị xoá giữa chừng: đừng làm sập tiến trình test
    await client.connect()
    clients.add(client)
    return client
  }

  const admin = await connect() // role postgres: dựng dữ liệu mẫu + soi kết quả, bỏ qua RLS như prod
  const h = {}

  h.sql = async (text, params = []) => (await admin.query(text, params)).rows
  h.one = async (text, params = []) => (await admin.query(text, params)).rows[0]
  h.num = async (text, params = []) => Number(Object.values((await admin.query(text, params)).rows[0])[0])

  // Kết nối đăng nhập như PostgREST: SET ROLE + claim JWT. Ảnh supabase/postgres trần (không có GoTrue) có
  // auth.uid() đọc `request.jwt.claim.sub`; bản mới đọc `request.jwt.claims` → đặt cả hai.
  async function login(sink, uid, label, role = 'authenticated') {
    const client = await connect()
    await client.query("SET statement_timeout = '30s'") // treo thật thì test đỏ chứ không đứng mãi
    await client.query(
      `SELECT set_config('request.jwt.claim.sub', $1, false),
              set_config('request.jwt.claim.role', $2, false),
              set_config('request.jwt.claims', $3, false)`,
      [uid ?? '', role, JSON.stringify(uid ? { sub: uid, role } : { role })])
    await client.query(`SET ROLE ${role === 'anon' ? 'anon' : 'authenticated'}`)
    return new Actor(sink, client, label)
  }

  // ----------------------------------------------------------------------------------------------
  // Dữ liệu mẫu. Mỗi TEST tự tạo một quán riêng (withStore) → test trước hỏng không làm bẩn phép soát
  // bất biến của test sau, dù tất cả chung một DB.
  // ----------------------------------------------------------------------------------------------
  h.newStore = async ({ requireShift = false } = {}) => {
    const tag = rid().slice(0, 8)
    const store = (await h.one(
      `INSERT INTO stores(name, slug, payment_timing, payment_methods)
       VALUES ($1, $2, 'postpay', '{cash}') RETURNING id`, [`Quán race ${tag}`, `race-${tag}`])).id
    const users = {}
    for (const [key, role] of [['owner', 'store_owner'], ['manager', 'store_manager'],
      ['cashier1', 'store_cashier'], ['cashier2', 'store_cashier'], ['staff', 'store_staff']]) {
      users[key] = rid()
      await h.sql('INSERT INTO auth.users(id, email) VALUES ($1, $2)', [users[key], `${key}-${tag}@race.test`])
      await h.sql('INSERT INTO mevo_operators(user_id, store_id, role, is_active) VALUES ($1, $2, $3, true)',
        [users[key], store, role])
    }
    const category = (await h.one(
      "INSERT INTO menu_categories(store_id, name) VALUES ($1, 'Món race') RETURNING id", [store])).id
    const menu = {}
    for (const [key, name, price] of [['beer', 'Bia hơi', 15000], ['hotpot', 'Lẩu bò', 250000]]) {
      menu[key] = { price, name }
      menu[key].id = (await h.one(
        'INSERT INTO menu_items(store_id, category_id, name, price) VALUES ($1, $2, $3, $4) RETURNING id',
        [store, category, name, price])).id
    }
    if (requireShift) {
      await h.sql(
        `INSERT INTO store_workflow_settings(store_id, require_cash_shift) VALUES ($1, true)
         ON CONFLICT (store_id) DO UPDATE SET require_cash_shift = true`, [store])
    }
    let tableNo = 0
    const fixture = { store, users, menu, requireShift, outcomes: [] }
    const LABELS = { owner: 'chủ quán', manager: 'quản lý', cashier1: 'thu ngân 1', cashier2: 'thu ngân 2',
      staff: 'nhân viên' }
    const opened = []

    // Một kết nối mới đăng nhập bằng vai `key`. Gọi hai lần cùng vai = hai máy / hai tab của cùng một người.
    fixture.actor = async (key, label) => {
      const actor = key === 'customer'
        ? await login(fixture, null, label ?? 'khách (anon)', 'anon')
        : await login(fixture, users[key], label ?? LABELS[key])
      opened.push(actor)
      return actor
    }
    fixture.actors = async (...keys) => Object.fromEntries(
      await Promise.all(keys.map(async (key) => [key, await fixture.actor(key)])))
    fixture.close = async () => {
      await Promise.all(opened.map(async (a) => {
        clients.delete(a.client)
        await a.client.end().catch(() => {})
      }))
    }

    fixture.audit = () => h.audit(store)
    fixture.deadlocks = () => fixture.outcomes.filter((o) => !o.ok && o.code === DEADLOCK)
    // Lỗi "bẩn": mọi thứ không phải lỗi nghiệp vụ có câu chữ (unique_violation trần, deadlock, timeout…).
    fixture.dirtyErrors = () => fixture.outcomes.filter((o) => !o.ok && o.code !== BUSINESS_ERROR)

    // Mỗi vòng lặp dùng một bàn MỚI: vòng trước hỏng (phiên còn mở) không làm vòng sau vấp unique index.
    fixture.newTable = async () => {
      tableNo += 1
      return (await h.one('INSERT INTO tables(store_id, table_number) VALUES ($1, $2) RETURNING id',
        [store, `R${tableNo}`])).id
    }

    // Bàn đang có khách: một phiên mở + một đơn đã vào bếp. lines = [[món, số lượng], …]; tổng đơn khớp dòng món.
    fixture.openSession = async ({ lines = [['hotpot', 1], ['beer', 2]], table } = {}) => {
      const tableId = table ?? await fixture.newTable()
      const session = (await h.one(
        "INSERT INTO table_sessions(store_id, table_id, opened_by) VALUES ($1, $2, 'staff') RETURNING id",
        [store, tableId])).id
      await h.sql('INSERT INTO session_tables(session_id, table_id) VALUES ($1, $2)', [session, tableId])
      const total = lines.reduce((sum, [key, qty]) => sum + menu[key].price * qty, 0)
      const order = (await h.one(
        `INSERT INTO orders(store_id, table_id, session_id, status, total_amount, payment_amount, payment_method,
                            order_source, confirmed_at)
         VALUES ($1, $2, $3, 'confirmed', $4, $4, 'cash', 'staff', now()) RETURNING id`,
        [store, tableId, session, total])).id
      const items = []
      for (const [key, qty] of lines) {
        items.push((await h.one(
          `INSERT INTO order_items(order_id, menu_item_id, item_name, item_price, quantity)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [order, menu[key].id, menu[key].name, menu[key].price, qty])).id)
      }
      return { session, table: tableId, order, items, total }
    }

    // Khách ghi nợ / hàng trong kho: ghi thẳng (không qua RPC) cho gọn, đúng CHECK của bảng.
    let seq = 0
    fixture.newDebtCustomer = async () => {
      seq += 1
      return (await h.one(
        "INSERT INTO debt_customers(store_id, name, phone, kind) VALUES ($1, $2, $3, 'person') RETURNING id",
        [store, `Khách nợ ${seq}`, `09${String(Date.now() % 100000000 + seq).padStart(8, '0')}`])).id
    }
    fixture.newInventoryItem = async (kind = 'goods') => {
      seq += 1
      return (await h.one(
        "INSERT INTO inventory_items(store_id, name, unit, kind) VALUES ($1, $2, 'lon', $3) RETURNING id",
        [store, `Hàng race ${seq}`, kind])).id
    }
    // Danh mục chi không phải danh mục hệ thống, không bắt ghi chú (seed của mig 122).
    fixture.paymentCategory = async () => (await h.one(
      `SELECT id FROM cash_book_categories
        WHERE store_id = $1 AND kind = 'payment' AND NOT is_system AND is_active
        ORDER BY requires_note, name LIMIT 1`, [store])).id

    return fixture
  }

  // ----------------------------------------------------------------------------------------------
  // Rào chắn: giữ khoá FOR UPDATE trên dòng quán (đúng khoá set_require_cash_shift giữ ở prod).
  // collect_table_bill khoá phiên ở bước 2 rồi mới đụng dòng quán ở bước 9 (require_open_cash_shift) →
  // dựng rào là "đóng băng" được lần thu ở đúng chỗ: ĐÃ giữ khoá phiên, CHƯA ghi gì.
  // ----------------------------------------------------------------------------------------------
  h.holdStoreRow = async (store) => {
    const client = await connect()
    await client.query('BEGIN')
    await client.query('SELECT 1 FROM stores WHERE id = $1 FOR UPDATE', [store])
    let released = false
    return async () => {
      if (released) return
      released = true
      await client.query('COMMIT')
      clients.delete(client)
      await client.end().catch(() => {})
    }
  }

  // Chờ tới khi kết nối của actor đang đứng chờ một khoá (dòng hoặc advisory).
  h.waitBlocked = async (actor, timeoutMs = 8000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const row = await h.one('SELECT wait_event_type, state FROM pg_stat_activity WHERE pid = $1', [actor.pid])
      if (row?.wait_event_type === 'Lock' && row.state === 'active') return
      await sleep(15)
    }
    throw new Error(`${actor.label}: không thấy đứng chờ khoá sau ${timeoutMs}ms (xen kẽ dựng sai)`)
  }

  // Chạy song song "tự nhiên": mỗi lời gọi trễ ngẫu nhiên 0–jitter ms để thứ tự tới server đổi qua từng vòng.
  h.race = (thunks, jitterMs = 3) => Promise.all(thunks.map(async (thunk) => {
    if (jitterMs > 0) await sleep(Math.random() * jitterMs)
    return thunk()
  }))

  // ----------------------------------------------------------------------------------------------
  // Soát bất biến tiền của cả quán. Trả mảng câu mô tả vi phạm (rỗng = sạch).
  // ----------------------------------------------------------------------------------------------
  h.audit = async (store) => {
    const checks = [
      ['Khoản thu lệch tổng các dòng phương tiện', `
        SELECT p.id::text AS ref, p.total_amount AS a,
               COALESCE((SELECT sum(l.amount) FROM bill_payment_lines l WHERE l.payment_id = p.id), 0) AS b
          FROM bill_payments p WHERE p.store_id = $1
           AND p.total_amount <> COALESCE((SELECT sum(l.amount) FROM bill_payment_lines l WHERE l.payment_id = p.id), 0)`],
      ['Khoản thu lệch tổng các đơn gắn vào nó', `
        SELECT p.id::text AS ref, p.total_amount AS a,
               COALESCE((SELECT sum(o.total_amount) FROM orders o WHERE o.bill_payment_id = p.id), 0) AS b
          FROM bill_payments p WHERE p.store_id = $1
           AND p.total_amount <> COALESCE((SELECT sum(o.total_amount) FROM orders o WHERE o.bill_payment_id = p.id), 0)`],
      ['Phiên ĐÃ THU còn đơn chưa thu bên trong', `
        SELECT s.id::text || ' / đơn ' || o.id::text || ' (' || o.order_source || ', ' || o.status || ', '
               || o.total_amount || 'đ)' AS ref
          FROM table_sessions s JOIN orders o ON o.session_id = s.id
         WHERE s.store_id = $1 AND s.status = 'closed' AND s.close_reason = 'paid'
           AND o.status <> 'cancelled' AND o.payment_received_at IS NULL`],
      ['Đơn của phiên đã thu gắn khoản thu khác với phiên', `
        SELECT s.id::text || ' / đơn ' || o.id::text AS ref
          FROM table_sessions s JOIN orders o ON o.session_id = s.id
         WHERE s.store_id = $1 AND s.status = 'closed' AND s.close_reason = 'paid' AND o.status <> 'cancelled'
           AND o.payment_received_at IS NOT NULL AND o.bill_payment_id IS DISTINCT FROM s.bill_payment_id`],
      ['Phiên đã thu không có khoản thu', `
        SELECT s.id::text AS ref FROM table_sessions s
         WHERE s.store_id = $1 AND s.status = 'closed' AND s.close_reason = 'paid' AND s.bill_payment_id IS NULL`],
      ['Phiên CHƯA thu mà đã gắn khoản thu / có đơn đã gắn khoản thu', `
        SELECT s.id::text AS ref FROM table_sessions s
         WHERE s.store_id = $1 AND NOT (s.status = 'closed' AND s.close_reason = 'paid')
           AND (s.bill_payment_id IS NOT NULL
                OR EXISTS (SELECT 1 FROM orders o WHERE o.session_id = s.id AND o.bill_payment_id IS NOT NULL))`],
      ['Khoản thu không gắn phiên nào (mồ côi)', `
        SELECT p.id::text AS ref FROM bill_payments p
         WHERE p.store_id = $1 AND p.source = 'pos'
           AND NOT EXISTS (SELECT 1 FROM table_sessions s WHERE s.bill_payment_id = p.id)`],
      ['Tổng đơn lệch tổng các dòng món còn hiệu lực', `
        SELECT o.id::text AS ref, o.total_amount + o.bill_discount_amount AS a, x.items AS b
          FROM orders o
          JOIN LATERAL (SELECT COALESCE(sum(oi.item_price * oi.quantity), 0) AS items
                          FROM order_items oi WHERE oi.order_id = o.id AND oi.void_type IS NULL) x ON true
         WHERE o.store_id = $1 AND o.total_amount + o.bill_discount_amount <> x.items`],
      ['Quán có hơn một ca đang mở', `
        SELECT count(*)::text AS ref FROM cash_shifts WHERE store_id = $1 AND status = 'open' HAVING count(*) > 1`],
      ['Ca đã kết: tiền két dự kiến ĐÃ LƯU lệch số tính lại (có khoản lọt vào sau khi kết)', `
        SELECT s.id::text AS ref, s.expected_cash AS a, (public.cash_shift_totals(s.id)->>'expected_cash')::bigint AS b
          FROM cash_shifts s
         WHERE s.store_id = $1 AND s.status = 'closed'
           AND (s.expected_cash <> (public.cash_shift_totals(s.id)->>'expected_cash')::bigint
                OR s.difference <> s.counted_cash - s.expected_cash)`],
      ['Quán bật ca mà có khoản thu / phiếu tiền mặt / lần trả nợ tiền mặt không gắn ca', `
        SELECT x.ref FROM (
          SELECT 'bill_payments ' || p.id::text AS ref FROM bill_payments p
           WHERE p.store_id = $1 AND p.cash_shift_id IS NULL
          UNION ALL
          SELECT 'cash_book_entries ' || e.id::text FROM cash_book_entries e
           WHERE e.store_id = $1 AND e.method = 'cash' AND e.cash_shift_id IS NULL
          UNION ALL
          SELECT 'debt_payments ' || d.id::text FROM debt_payments d
           WHERE d.store_id = $1 AND d.method = 'cash' AND d.cash_shift_id IS NULL
        ) x WHERE (SELECT w.require_cash_shift FROM store_workflow_settings w WHERE w.store_id = $1)`],
      ['Bill ghi nợ bị phân bổ trả QUÁ số nợ', `
        SELECT bp.id::text AS ref, l.amount AS a, x.paid AS b
          FROM bill_payments bp
          JOIN bill_payment_lines l ON l.payment_id = bp.id AND l.instrument = 'debt'
          JOIN LATERAL (SELECT COALESCE(sum(a.amount), 0) AS paid
                          FROM debt_payment_allocations a JOIN debt_payments dp ON dp.id = a.debt_payment_id
                         WHERE a.bill_payment_id = bp.id AND dp.voided_at IS NULL) x ON true
         WHERE bp.store_id = $1 AND x.paid > l.amount`],
      ['Lần trả nợ lệch tổng phân bổ của nó', `
        SELECT dp.id::text AS ref, dp.amount AS a,
               COALESCE((SELECT sum(a.amount) FROM debt_payment_allocations a WHERE a.debt_payment_id = dp.id), 0) AS b
          FROM debt_payments dp WHERE dp.store_id = $1
           AND dp.amount <> COALESCE((SELECT sum(a.amount) FROM debt_payment_allocations a WHERE a.debt_payment_id = dp.id), 0)`],
      ['Bộ đếm số phiếu kho lệch số phiếu thật', `
        SELECT c.kind AS ref, c.last_no AS a,
               (SELECT count(*) FROM inventory_documents d WHERE d.store_id = c.store_id AND d.kind = c.kind) AS b
          FROM inventory_doc_counters c WHERE c.store_id = $1
           AND c.last_no <> (SELECT count(*) FROM inventory_documents d WHERE d.store_id = c.store_id AND d.kind = c.kind)`],
      ['Phiếu nhập kho đã trả không có đúng MỘT phiếu chi còn hiệu lực', `
        SELECT d.doc_no AS ref FROM inventory_documents d
         WHERE d.store_id = $1 AND d.kind = 'receipt' AND d.paid_status = 'paid' AND d.status = 'posted'
           AND d.total_amount > 0
           AND (SELECT count(*) FROM cash_book_entries e
                 WHERE e.source = 'inventory_receipt' AND e.source_ref = d.id AND e.voided_at IS NULL) <> 1`],
    ]
    const violations = []
    for (const [title, query] of checks) {
      const rows = await h.sql(query, [store])
      for (const row of rows) {
        const detail = row.a === undefined ? '' : ` (${row.a} ≠ ${row.b})`
        violations.push(`${title}: ${row.ref}${detail}`)
      }
    }
    return violations
  }

  // Chạy thân test với một quán riêng, đóng mọi kết nối của quán đó khi xong (kể cả khi test đỏ).
  h.withStore = async (options, body) => {
    const fixture = await h.newStore(options)
    try {
      return await body(fixture)
    } finally {
      await fixture.close()
    }
  }

  h.close = async () => {
    await Promise.all([...clients].map((c) => c.end().catch(() => {})))
  }
  return h
}

// Gom "bên thua nhận gì" qua các vòng lặp, in một dòng cho từng kịch bản.
export function tally() {
  const counts = new Map()
  const add = (key) => counts.set(key, (counts.get(key) ?? 0) + 1)
  const text = () => [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n}× ${k}`).join(' | ')
  return { add, text, counts }
}

// Tóm tắt một kết quả thành nhãn ngắn cho bảng đếm.
export function describe(outcome, okLabel = (v) => (v?.already || v?.replayed || v?.idempotent || v?.already_created
  ? 'ok, trả kết quả cũ (already)' : 'ok')) {
  if (outcome.ok) return okLabel(outcome.value)
  const text = outcome.message.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>').replace(/\d[\d.]*/g, 'N')
  return outcome.code === BUSINESS_ERROR ? `lỗi "${text}"` : `LỖI BẨN ${outcome.code} "${text}"`
}

export function report(name, lines) {
  console.log(`[race] ${name}`)
  for (const [label, t] of Object.entries(lines)) console.log(`[race]     ${label}: ${typeof t === 'string' ? t : t.text()}`)
}

// Ba điều mọi kịch bản đều phải giữ: bất biến tiền sạch, không deadlock, không lỗi "bẩn" lọt ra người gọi.
// knownBug: câu chú thích in kèm khi đỏ, cho các kịch bản từng lộ lỗi thật đã vá (xem RACE.md) — đỏ lại là hồi quy.
export async function assertClean(assert, fixture, label, knownBug = '') {
  const note = knownBug ? ` — HỒI QUY lỗi đã vá: ${knownBug}` : ''
  assert.deepEqual(await fixture.audit(), [], `${label}: bất biến tiền bị vỡ${note}`)
  assert.deepEqual(fixture.deadlocks().map((o) => `${o.by} → ${o.expr}`), [],
    `${label}: có deadlock (SQLSTATE 40P01)${note}`)
  assert.deepEqual(fixture.dirtyErrors().map((o) => `${o.by} → ${o.expr}: ${o.code} ${o.message}`), [],
    `${label}: lỗi không phải lỗi nghiệp vụ lọt ra người gọi${note}`)
}
