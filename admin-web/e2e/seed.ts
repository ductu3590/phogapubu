// Dữ liệu thử + phiên đăng nhập cho e2e POS tab "Sơ đồ".
//
// LUẬT AN TOÀN (đọc trước khi sửa):
// - CHỈ đụng quán Bảo Lương: tra store_id theo slug, kiểm tên có "Bảo Lương", không thấy thì dừng.
// - Chỉ xoá dòng e2e tạo: khu tên ĐÚNG "Khu E2E", bàn "E2E-01..18" (theo id đã ghi), yêu cầu gọi NV theo id,
//   phiên mở SAU lúc bắt đầu chạy mà không có trong ảnh chụp trước khi chạy, đặt bàn tên khách bắt đầu "E2E "
//   tạo sau lúc bắt đầu chạy. Mọi lệnh ghi/xoá đều kèm `.eq('store_id', storeId)`.
// - Bàn E2E-xx chỉ để kiểm bố cục / lọc: KHÔNG mở phiên / đặt bàn trên chúng (đơn trỏ tới bàn bằng khoá ngoại
//   NO ACTION → bàn có đơn không xoá thẳng được). Kịch bản tạo phiên / đặt bàn dùng bàn thật đang trống của quán.
// - Không in token / key ra log. Lỗi trả về chỉ mang câu báo của Supabase.

import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { createChunks, stringToBase64URL } from '@supabase/ssr'
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>

export const ADMIN_WEB_DIR = path.resolve(__dirname, '..')
export const AUTH_DIR = path.join(__dirname, '.auth')
export const STORAGE_STATE_PATH = path.join(AUTH_DIR, 'owner.json')
export const RUN_STATE_PATH = path.join(AUTH_DIR, 'run.json')

export const STORE_SLUG = 'bia-lau-bao-luong'
export const STORE_NAME_MARK = 'Bảo Lương'
export const OWNER_EMAIL = 'baoluong@mevo.vn'
export const E2E_AREA_NAME = 'Khu E2E'
export const E2E_TABLE_PREFIX = 'E2E-'
export const E2E_TABLE_COUNT = 18
/** Tên khách của mọi đặt bàn e2e tạo — teardown chỉ huỷ đặt bàn có tên bắt đầu bằng chuỗi này. */
export const E2E_CUSTOMER_PREFIX = 'E2E '

export const e2eTableName = (i: number) => `${E2E_TABLE_PREFIX}${String(i).padStart(2, '0')}`

export type RunState = {
  storeId: string
  storeName: string
  /** ISO — mốc để teardown nhận ra phiên / đặt bàn do lượt chạy này tạo. */
  startedAt: string
  /** Phiên đang mở TRƯỚC khi chạy: teardown không bao giờ đóng các phiên này. */
  preOpenSessionIds: string[]
  areaId: string | null
  tableIds: string[]
  /** Tổng bàn đang hoạt động của quán sau khi seed (mục tiêu 43). */
  totalTables: number
  reservationsEnabled: boolean
  slotIntervalMinutes: number
  /** "Chờ duyệt" + "Gọi NV" seed bằng đúng RPC Mini App; null + lý do nếu không seed được. */
  pending: { tableId: string; tableName: string; sessionId: string | null; serviceRequestId: string | null } | null
  pendingSkipReason: string | null
  serviceRequestIds: string[]
}

type Env = { url: string; anonKey: string; serviceKey: string }

let envCache: Env | null = null

/** Đọc admin-web/.env.local (cùng cách Next đọc). Thiếu biến → lỗi tiếng Việt rõ ràng, KHÔNG in giá trị. */
export function loadEnv(): Env {
  if (envCache) return envCache
  loadEnvConfig(ADMIN_WEB_DIR, true, { info: () => {}, error: () => {} })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const missing = [
    !url && 'NEXT_PUBLIC_SUPABASE_URL',
    !anonKey && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean)
  if (missing.length > 0 || !url || !anonKey || !serviceKey) {
    throw new Error(
      `Thiếu admin-web/.env.local — e2e cần ${missing.join(', ')} để đăng nhập chủ quán Bảo Lương và dựng dữ liệu thử. ` +
        'Chép .env.local của admin-web vào worktree này rồi chạy lại.',
    )
  }
  envCache = { url, anonKey, serviceKey }
  return envCache
}

const noPersist = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }

export function serviceClient(): Db {
  const env = loadEnv()
  return createClient(env.url, env.serviceKey, noPersist)
}

/** Client khách (anon) — đúng quyền Mini App dùng. */
export function anonClient(): Db {
  const env = loadEnv()
  return createClient(env.url, env.anonKey, noPersist)
}

/** Client mang phiên chủ quán — gọi RPC đúng như server action của POS (auth.uid() = chủ quán). */
export function userClient(session: Session): Db {
  const env = loadEnv()
  return createClient(env.url, env.anonKey, {
    ...noPersist,
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  })
}

/** Mint phiên chủ quán: generate_link magiclink (service key) → verify token_hash (anon). Không gửi email. */
export async function mintOwnerSession(): Promise<Session> {
  const admin = serviceClient()
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: OWNER_EMAIL })
  if (error) throw new Error(`Không tạo được link đăng nhập cho ${OWNER_EMAIL}: ${error.message}`)
  const tokenHash = data.properties?.hashed_token
  if (!tokenHash) throw new Error('generate_link không trả hashed_token')
  const { data: verified, error: verifyError } = await anonClient().auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
  if (verifyError) throw new Error(`Không xác thực được link đăng nhập: ${verifyError.message}`)
  if (!verified.session) throw new Error('Xác thực link đăng nhập không trả phiên')
  return verified.session
}

let ownerSessionCache: Promise<Session> | null = null
/** Một phiên chủ quán dùng lại trong cùng tiến trình (test helper gọi nhiều lần). */
export function ownerSession(): Promise<Session> {
  ownerSessionCache ??= mintOwnerSession()
  return ownerSessionCache
}

/**
 * Cookie phiên đúng định dạng @supabase/ssr 0.10: tên `sb-<project-ref>-auth-token`, giá trị
 * "base64-" + base64url(JSON phiên), quá 3180 ký tự thì chia khúc `.0/.1…` (dùng chính createChunks của thư viện).
 */
export function sessionCookies(session: Session, baseURL: string) {
  const env = loadEnv()
  const ref = new URL(env.url).hostname.split('.')[0]
  const key = `sb-${ref}-auth-token`
  const value = 'base64-' + stringToBase64URL(JSON.stringify(session))
  const domain = new URL(baseURL).hostname
  const expires = Math.floor(Date.now() / 1000) + 400 * 24 * 60 * 60
  return createChunks(key, value).map((c) => ({
    name: c.name,
    value: c.value,
    domain,
    path: '/',
    expires,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax' as const,
  }))
}

/** Tra quán theo slug + kiểm tên. Không thấy / tên lạ → dừng hẳn, không đụng gì. */
export async function resolveStore(admin: Db): Promise<{ id: string; name: string }> {
  const { data, error } = await admin.from('stores').select('id, name, slug').eq('slug', STORE_SLUG).maybeSingle()
  if (error) throw new Error(`Không đọc được quán ${STORE_SLUG}: ${error.message}`)
  if (!data) throw new Error(`Không thấy quán slug "${STORE_SLUG}" — dừng e2e, không đụng dữ liệu.`)
  if (typeof data.name !== 'string' || !data.name.includes(STORE_NAME_MARK)) {
    throw new Error(`Quán slug "${STORE_SLUG}" có tên "${data.name}", không phải Bảo Lương — dừng e2e.`)
  }
  return { id: data.id as string, name: data.name }
}

export function writeRunState(state: RunState) {
  fs.mkdirSync(AUTH_DIR, { recursive: true })
  fs.writeFileSync(RUN_STATE_PATH, JSON.stringify(state, null, 2))
}

export function readRunState(): RunState {
  if (!fs.existsSync(RUN_STATE_PATH)) throw new Error('Chưa có e2e/.auth/run.json — global-setup chưa chạy xong.')
  return JSON.parse(fs.readFileSync(RUN_STATE_PATH, 'utf8')) as RunState
}

async function openSessionIds(admin: Db, storeId: string): Promise<string[]> {
  const { data, error } = await admin.from('table_sessions').select('id').eq('store_id', storeId).eq('status', 'open')
  if (error) throw new Error(`Không đọc được phiên đang mở: ${error.message}`)
  return (data ?? []).map((r) => r.id as string)
}

/**
 * Dọn đồ e2e sót từ lượt chạy trước bị ngắt giữa chừng (teardown không kịp chạy): bàn "E2E-xx" + khu "Khu E2E"
 * của RIÊNG Bảo Lương. Bàn đã có lịch sử thì DB từ chối (khoá ngoại) → báo lỗi, không ép.
 */
async function removeLeftoverFixtures(admin: Db, storeId: string) {
  const { data: tables, error } = await admin
    .from('tables')
    .select('id, table_number')
    .eq('store_id', storeId)
    .like('table_number', `${E2E_TABLE_PREFIX}%`)
  if (error) throw new Error(`Không đọc được bàn E2E cũ: ${error.message}`)
  const ids = (tables ?? []).filter((t) => /^E2E-\d{2}$/.test(t.table_number as string)).map((t) => t.id as string)
  if (ids.length > 0) {
    const { error: delErr } = await admin.from('tables').delete().eq('store_id', storeId).in('id', ids)
    if (delErr) throw new Error(`Không xoá được bàn E2E sót từ lần trước: ${delErr.message}`)
  }
  const { error: areaErr } = await admin.from('table_areas').delete().eq('store_id', storeId).eq('name', E2E_AREA_NAME)
  if (areaErr) throw new Error(`Không xoá được "${E2E_AREA_NAME}" sót từ lần trước: ${areaErr.message}`)
}

/** Một món bán được, không bắt chọn loại (variant) — để đặt món qua RPC trong test. */
export async function simpleMenuItemId(admin: Db, storeId: string): Promise<string> {
  const { data, error } = await admin
    .from('menu_items')
    .select('id')
    .eq('store_id', storeId)
    .eq('is_available', true)
    .is('variant_group_name', null)
    .order('sort_order')
    .limit(1)
  if (error) throw new Error(`Không đọc được thực đơn: ${error.message}`)
  const id = data?.[0]?.id as string | undefined
  if (!id) throw new Error('Quán không có món nào đang bán (không cần chọn loại)')
  return id
}

/** Bàn thật (không phải E2E-xx) đang hoạt động của quán, theo tên. */
async function realTables(admin: Db, storeId: string): Promise<{ id: string; table_number: string }[]> {
  const { data, error } = await admin
    .from('tables')
    .select('id, table_number')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('table_number')
  if (error) throw new Error(`Không đọc được bàn: ${error.message}`)
  return ((data ?? []) as { id: string; table_number: string }[]).filter((t) => !t.table_number.startsWith(E2E_TABLE_PREFIX))
}

/**
 * "Chờ duyệt" + "Gọi NV" bằng đúng đường khách: create_table_order_batch + ping_service_request (anon, như Mini App).
 * Không được (kênh QR tắt, bàn đang giữ…) → trả lý do; kịch bản đó tự bỏ qua và chuyển sang checklist tay.
 */
async function seedPendingAndCall(
  admin: Db,
  storeId: string,
  busy: Set<string>,
): Promise<{ pending: RunState['pending']; reason: string | null; requestIds: string[] }> {
  let menuItemId: string
  try {
    menuItemId = await simpleMenuItemId(admin, storeId)
  } catch (e) {
    return { pending: null, reason: e instanceof Error ? e.message : String(e), requestIds: [] }
  }
  const anon = anonClient()
  const deviceId = `e2e-${randomUUID()}`
  let lastError = 'không có bàn trống'
  for (const table of await realTables(admin, storeId)) {
    if (busy.has(table.id)) continue
    const { error } = await anon.rpc('create_table_order_batch', {
      p_store_id: storeId,
      p_table_id: table.id,
      p_items: [{ menu_item_id: menuItemId, quantity: 1, note: null, topping_ids: [], variant_id: null }],
      // Quán trả sau gọi tại bàn: Mini App gửi 'cash' (pages/checkout/index.tsx).
      p_payment_method: 'cash',
      p_client_request_id: randomUUID(),
      p_zalo_user_id: null,
      p_device_id: deviceId,
      p_note: 'E2E chờ duyệt',
      p_voucher_code: null,
      p_expected_session_id: null,
    })
    if (error) {
      lastError = error.message
      // Lỗi theo bàn (đang giữ / đang có phiên) → thử bàn khác; lỗi khác (kênh tắt…) → thôi.
      if (/đặt trước|Phiên bàn đã thay đổi|không hoạt động/i.test(error.message)) continue
      break
    }
    const { data: session } = await admin
      .from('table_sessions')
      .select('id')
      .eq('store_id', storeId)
      .eq('table_id', table.id)
      .eq('status', 'open')
      .maybeSingle()
    const requestIds: string[] = []
    const { data: ping, error: pingErr } = await anon.rpc('ping_service_request', {
      p_table_id: table.id,
      p_type: 'call_staff',
      p_device_id: deviceId,
    })
    let pingId = (ping as { id?: string } | null)?.id ?? null
    if (!pingErr && !pingId) {
      // RPC không trả id → tra dòng vừa tạo trên bàn này.
      const { data: rows } = await admin
        .from('service_requests')
        .select('id')
        .eq('store_id', storeId)
        .eq('table_id', table.id)
        .order('created_at', { ascending: false })
        .limit(1)
      pingId = (rows?.[0]?.id as string | undefined) ?? null
    }
    if (pingId) requestIds.push(pingId)
    return {
      pending: { tableId: table.id, tableName: table.table_number, sessionId: (session?.id as string) ?? null, serviceRequestId: pingId },
      reason: pingErr ? `Gọi NV không seed được: ${pingErr.message}` : null,
      requestIds,
    }
  }
  return { pending: null, reason: `Không tạo được đơn chờ duyệt qua RPC Mini App: ${lastError}`, requestIds: [] }
}

/** Dựng toàn bộ dữ liệu thử. Lỗi giữa chừng → tự dọn phần đã tạo rồi ném lại. */
export async function seed(): Promise<RunState> {
  const admin = serviceClient()
  const store = await resolveStore(admin)
  const startedAt = new Date(Date.now() - 5_000).toISOString() // trừ lệch đồng hồ máy ↔ DB
  const preOpenSessionIds = await openSessionIds(admin, store.id)

  await removeLeftoverFixtures(admin, store.id)

  const { data: settings } = await admin
    .from('store_workflow_settings')
    .select('reservations_enabled, slot_interval_minutes')
    .eq('store_id', store.id)
    .maybeSingle()

  const state: RunState = {
    storeId: store.id,
    storeName: store.name,
    startedAt,
    preOpenSessionIds,
    areaId: null,
    tableIds: [],
    totalTables: 0,
    reservationsEnabled: settings?.reservations_enabled === true,
    slotIntervalMinutes: Number(settings?.slot_interval_minutes ?? 30),
    pending: null,
    pendingSkipReason: null,
    serviceRequestIds: [],
  }
  // Ghi sớm để teardown biết đường dọn kể cả khi phần dưới hỏng.
  writeRunState(state)

  try {
    const { data: areas } = await admin.from('table_areas').select('sort_order').eq('store_id', store.id)
    const sortOrder = Math.max(0, ...((areas ?? []) as { sort_order: number }[]).map((a) => a.sort_order)) + 1
    const { data: area, error: areaErr } = await admin
      .from('table_areas')
      .insert({ store_id: store.id, name: E2E_AREA_NAME, color: 'pink', sort_order: sortOrder })
      .select('id')
      .single()
    if (areaErr || !area) throw new Error(`Không tạo được "${E2E_AREA_NAME}": ${areaErr?.message}`)
    state.areaId = area.id as string
    writeRunState(state)

    // Không đặt pos_x/pos_y: POS tự xếp như bàn tạo hàng loạt (lib/actions/tables.ts).
    const rows = Array.from({ length: E2E_TABLE_COUNT }, (_, i) => ({
      store_id: store.id,
      table_number: e2eTableName(i + 1),
      is_active: true,
      area_id: state.areaId,
    }))
    const { data: tables, error: tablesErr } = await admin.from('tables').insert(rows).select('id, table_number')
    if (tablesErr || !tables) throw new Error(`Không tạo được bàn E2E: ${tablesErr?.message}`)
    // tableIds[i] = bàn E2E-(i+1) — test dựa vào thứ tự này.
    state.tableIds = (tables as { id: string; table_number: string }[])
      .sort((a, b) => a.table_number.localeCompare(b.table_number))
      .map((t) => t.id)
    writeRunState(state)

    const { count } = await admin
      .from('tables')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .eq('is_active', true)
    state.totalTables = count ?? 0

    const { data: busyRows } = await admin.from('table_sessions').select('table_id').eq('store_id', store.id).eq('status', 'open')
    const busy = new Set(((busyRows ?? []) as { table_id: string }[]).map((r) => r.table_id))
    const seeded = await seedPendingAndCall(admin, store.id, busy)
    state.pending = seeded.pending
    state.pendingSkipReason = seeded.reason
    state.serviceRequestIds = seeded.requestIds
    writeRunState(state)
    return state
  } catch (e) {
    // Dọn sạch thì bỏ run.json; dọn hỏng thì giữ để lượt sau (global-setup) dọn nốt.
    if (await cleanup(state).then(() => true, () => false)) fs.rmSync(RUN_STATE_PATH, { force: true })
    throw e
  }
}

/**
 * Dọn mọi thứ lượt chạy tạo. Chạy hết các bước dù bước trước lỗi; cuối cùng ném gộp lỗi (để lượt chạy báo đỏ).
 * Thứ tự: gọi NV → đóng phiên (staff_reset) → huỷ đặt bàn → xoá bàn E2E → xoá khu E2E.
 */
export async function cleanup(state: RunState): Promise<void> {
  const admin = serviceClient()
  const store = await resolveStore(admin)
  if (store.id !== state.storeId) throw new Error('run.json trỏ tới quán khác Bảo Lương — không dọn.')
  const storeId = store.id
  // Chặn trên của cửa sổ "do lượt này tạo": dọn run.json sót từ hôm trước không được đụng phiên / đặt bàn thật
  // mở sau đó. Một lượt chạy e2e không kéo dài quá 3 giờ.
  const windowEnd = new Date(Math.min(Date.now(), new Date(state.startedAt).getTime() + 3 * 60 * 60 * 1000)).toISOString()
  const errors: string[] = []
  const step = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  let owner: Db | null = null
  await step('Đăng nhập chủ quán để dọn', async () => {
    owner = userClient(await mintOwnerSession())
  })

  await step('Xoá yêu cầu gọi nhân viên e2e', async () => {
    const ids = new Set(state.serviceRequestIds)
    // Phòng hờ RPC không trả id: yêu cầu trên bàn đã seed, tạo trong lượt này.
    if (state.pending) {
      const { data } = await admin
        .from('service_requests')
        .select('id')
        .eq('store_id', storeId)
        .eq('table_id', state.pending.tableId)
        .gte('created_at', state.startedAt)
        .lte('created_at', windowEnd)
      for (const r of data ?? []) ids.add(r.id as string)
    }
    if (ids.size === 0) return
    const { error } = await admin.from('service_requests').delete().eq('store_id', storeId).in('id', [...ids])
    if (error) throw new Error(error.message)
  })

  await step('Đóng phiên e2e mở', async () => {
    const { data, error } = await admin
      .from('table_sessions')
      .select('id')
      .eq('store_id', storeId)
      .eq('status', 'open')
      .gte('opened_at', state.startedAt)
      .lte('opened_at', windowEnd)
    if (error) throw new Error(error.message)
    const pre = new Set(state.preOpenSessionIds)
    const fails: string[] = []
    for (const row of data ?? []) {
      if (pre.has(row.id as string)) continue
      if (!owner) throw new Error('không có phiên chủ quán')
      const { error: rpcErr } = await (owner as Db).rpc('close_table_session', {
        p_session_id: row.id,
        p_reason: 'staff_reset',
        p_instrument: null,
      })
      if (rpcErr) fails.push(rpcErr.message)
    }
    if (fails.length) throw new Error(fails.join('; '))
  })

  await step('Huỷ đặt bàn e2e', async () => {
    const { data, error } = await admin
      .from('reservations')
      .select('id')
      .eq('store_id', storeId)
      .like('customer_name', `${E2E_CUSTOMER_PREFIX}%`)
      .gte('created_at', state.startedAt)
      .lte('created_at', windowEnd)
      .in('status', ['pending', 'confirmed', 'change_requested'])
    if (error) throw new Error(error.message)
    const fails: string[] = []
    for (const row of data ?? []) {
      if (!owner) throw new Error('không có phiên chủ quán')
      const { error: rpcErr } = await (owner as Db).rpc('cancel_store_reservation', {
        p_reservation_id: row.id,
        p_reason: 'E2E dọn dữ liệu thử',
      })
      if (rpcErr) fails.push(rpcErr.message)
    }
    if (fails.length) throw new Error(fails.join('; '))
  })

  await step('Xoá bàn E2E', async () => {
    if (state.tableIds.length === 0) return
    const { error } = await admin.from('tables').delete().eq('store_id', storeId).in('id', state.tableIds)
    if (error) throw new Error(error.message)
  })

  await step(`Xoá ${E2E_AREA_NAME}`, async () => {
    if (!state.areaId) return
    const { error } = await admin.from('table_areas').delete().eq('store_id', storeId).eq('id', state.areaId).eq('name', E2E_AREA_NAME)
    if (error) throw new Error(error.message)
  })

  if (errors.length > 0) throw new Error(`Dọn dữ liệu e2e chưa sạch:\n- ${errors.join('\n- ')}`)
}

// ---------- Helper cho test: thao tác "đường thật" như server action của POS ----------

/** Mở phiên ở một bàn trống bằng Khách lẻ (pos_walk_in_order, mig 099) — đúng RPC nút "Gọi món & mở bàn" gọi. */
export async function openWalkInSession(tableId: string): Promise<string> {
  const state = readRunState()
  const admin = serviceClient()
  const owner = userClient(await ownerSession())
  const menuItemId = await simpleMenuItemId(admin, state.storeId)
  const { data, error } = await owner.rpc('pos_walk_in_order', {
    p_table_id: tableId,
    p_items: [{ menu_item_id: menuItemId, quantity: 1 }],
    p_client_request_id: randomUUID(),
  })
  if (error) throw new Error(`Không mở được bàn bằng Khách lẻ: ${error.message}`)
  const sessionId = (data as { session_id?: string } | null)?.session_id
  if (!sessionId) throw new Error('pos_walk_in_order không trả session_id')
  return sessionId
}
