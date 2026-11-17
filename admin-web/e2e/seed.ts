// Dữ liệu thử + phiên đăng nhập cho e2e POS tab "Sơ đồ".
//
// LUẬT AN TOÀN (đọc trước khi sửa):
// - CHỈ đụng quán Bảo Lương: tra store_id theo slug, kiểm tên có "Bảo Lương", không thấy thì dừng.
//   Mọi lệnh ghi/xoá đều kèm `.eq('store_id', storeId)`.
// - Teardown chỉ đụng thứ lượt chạy GHI LẠI trong run.json, KHÔNG suy theo khung giờ (khách / chủ quán dùng
//   Bảo Lương cùng lúc không bị đóng bàn oan, lệch đồng hồ máy ↔ DB không làm sót):
//     • phiên: id do RPC trả (seed chờ duyệt, helper Khách lẻ) + phiên mở trên bàn mà test GHI LÀ ĐÃ ĐỤNG
//       (bàn đó đang trống lúc ghi) — trừ phiên đã mở trước khi chạy;
//     • đơn chờ duyệt: id do RPC trả (từ chối bằng pos_reject_order trước khi đóng phiên — close_table_session
//       không đóng phiên còn đơn khách chưa duyệt);
//     • yêu cầu gọi NV: id do RPC trả;
//     • đặt bàn: id ghi lại theo tên khách duy nhất của lượt chạy + mọi đặt bàn còn hiệu lực tên bắt đầu "E2E ";
//     • khu tên ĐÚNG "Khu E2E" + bàn "E2E-01..18" theo id.
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
/** Tên khách của mọi đặt bàn e2e tạo bắt đầu bằng chuỗi này (teardown huỷ đặt bàn còn hiệu lực mang tên này). */
export const E2E_CUSTOMER_PREFIX = 'E2E '
const ACTIVE_RESERVATION = ['pending', 'confirmed', 'change_requested']

export const e2eTableName = (i: number) => `${E2E_TABLE_PREFIX}${String(i).padStart(2, '0')}`

export type RunState = {
  storeId: string
  storeName: string
  /** Mã ngắn của lượt chạy — gắn vào tên khách đặt bàn để tra id chính xác. */
  runTag: string
  startedAt: string
  /** Phiên đang mở TRƯỚC khi chạy: teardown không bao giờ đóng các phiên này. */
  preOpenSessionIds: string[]
  areaId: string | null
  tableIds: string[]
  /** Tổng bàn đang hoạt động của quán sau khi seed (mục tiêu 43). */
  totalTables: number
  reservationsEnabled: boolean
  /** "Chờ duyệt" + "Gọi NV" seed bằng đúng RPC Mini App; null + lý do nếu không seed được. */
  pending: { tableId: string; tableName: string; sessionId: string | null; orderId: string; serviceRequestId: string | null } | null
  pendingSkipReason: string | null
  /** Phiên lượt chạy mở (id do RPC trả). */
  sessionIds: string[]
  /** Bàn thật test đã thao tác qua giao diện (đang trống lúc ghi) — phiên mở trên đó do lượt chạy tạo. */
  touchedTableIds: string[]
  /** Đơn khách (chờ duyệt) lượt chạy tạo — từ chối trước khi đóng phiên. */
  pendingOrderIds: string[]
  serviceRequestIds: string[]
  reservationIds: string[]
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
  const s = JSON.parse(fs.readFileSync(RUN_STATE_PATH, 'utf8')) as Partial<RunState>
  // run.json bản cũ (trước khi ghi id chính xác) thiếu mảng → coi như rỗng.
  return {
    sessionIds: [], touchedTableIds: [], pendingOrderIds: [], serviceRequestIds: [], reservationIds: [], runTag: '',
    ...s,
  } as RunState
}

/** Ghi thêm vào run.json (workers: 1 → không có hai tiến trình ghi cùng lúc). */
function appendRunState(key: 'sessionIds' | 'touchedTableIds' | 'reservationIds', ids: string[]) {
  const state = readRunState()
  state[key] = [...new Set([...state[key], ...ids])]
  writeRunState(state)
}

/**
 * Test vừa mở phiên THÀNH CÔNG trên một bàn thật (qua giao diện / RPC) → ghi id phiên đang mở trên bàn đó + ghi bàn.
 * Bàn chỉ là lưới an toàn cho teardown CÙNG lượt (xem cleanup); id phiên mới là thứ được tin.
 */
export async function recordOpenSessionOnTable(tableId: string): Promise<string | null> {
  appendRunState('touchedTableIds', [tableId])
  const state = readRunState()
  const { data, error } = await serviceClient()
    .from('table_sessions')
    .select('id')
    .eq('store_id', state.storeId)
    .eq('table_id', tableId)
    .eq('status', 'open')
  if (error) throw new Error(`Không tra được phiên vừa mở: ${error.message}`)
  const ids = (data ?? []).map((r) => r.id as string)
  appendRunState('sessionIds', ids)
  return ids[0] ?? null
}

/** Quá mốc này thì run.json là đồ sót của lượt cũ: không suy phiên theo bàn nữa (có thể là khách thật mở sau). */
const TOUCHED_TABLE_TRUST_MS = 60 * 60 * 1000

/** Tên khách đặt bàn duy nhất của lượt chạy (để tra id sau khi tạo qua giao diện). */
export function e2eCustomerName(label: string) {
  return `${E2E_CUSTOMER_PREFIX}${readRunState().runTag} ${label}`
}

/** Tạo đặt bàn qua giao diện xong → tra id theo tên khách duy nhất, ghi vào run.json. Trả số id tìm thấy. */
export async function recordReservationByName(customerName: string): Promise<number> {
  const state = readRunState()
  const { data, error } = await serviceClient()
    .from('reservations')
    .select('id')
    .eq('store_id', state.storeId)
    .eq('customer_name', customerName)
  if (error) throw new Error(`Không tra được đặt bàn vừa tạo: ${error.message}`)
  const ids = (data ?? []).map((r) => r.id as string)
  appendRunState('reservationIds', ids)
  return ids.length
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

/** Một món đang bán, danh mục đang hiện, không bắt chọn loại (variant) — để đặt món qua RPC. */
export async function simpleMenuItemId(admin: Db, storeId: string): Promise<string> {
  const { data, error } = await admin
    .from('menu_items')
    .select('id, menu_categories!inner(is_active)')
    .eq('store_id', storeId)
    .eq('is_available', true)
    .is('variant_group_name', null)
    .eq('menu_categories.is_active', true)
    .order('sort_order')
    .limit(1)
  if (error) throw new Error(`Không đọc được thực đơn: ${error.message}`)
  const id = data?.[0]?.id as string | undefined
  if (!id) throw new Error('Quán không có món nào đang bán (danh mục đang hiện, không cần chọn loại)')
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
 * Ghi id phiên / đơn / yêu cầu vào state NGAY khi RPC trả về. Không được → lý do (ngoài giờ phục vụ, kênh tắt…).
 */
async function seedPendingAndCall(admin: Db, state: RunState, busy: Set<string>): Promise<void> {
  const storeId = state.storeId
  let menuItemId: string
  try {
    menuItemId = await simpleMenuItemId(admin, storeId)
  } catch (e) {
    state.pendingSkipReason = e instanceof Error ? e.message : String(e)
    return
  }
  const anon = anonClient()
  const deviceId = `e2e-${randomUUID()}`
  let lastError = 'không có bàn thật nào đang trống'
  for (const table of await realTables(admin, storeId)) {
    if (busy.has(table.id)) continue
    const { data, error } = await anon.rpc('create_table_order_batch', {
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
      if (/ngoài giờ phục vụ|tạm nghỉ/i.test(error.message)) {
        state.pendingSkipReason = `Quán đang ngoài giờ phục vụ — không seed được chờ duyệt (${error.message})`
        return
      }
      lastError = error.message
      // Lỗi theo bàn (đang giữ cho đặt bàn / vừa có phiên) → thử bàn khác; lỗi khác (kênh tắt…) → thôi.
      if (/đặt trước|Phiên bàn đã thay đổi|không hoạt động/i.test(error.message)) continue
      break
    }
    const order = data as { id?: string; session_id?: string | null } | null
    if (!order?.id) {
      state.pendingSkipReason = 'create_table_order_batch không trả id đơn'
      return
    }
    state.pendingOrderIds.push(order.id)
    if (order.session_id) state.sessionIds.push(order.session_id)
    state.pending = { tableId: table.id, tableName: table.table_number, sessionId: order.session_id ?? null, orderId: order.id, serviceRequestId: null }
    writeRunState(state)

    const { data: ping, error: pingErr } = await anon.rpc('ping_service_request', {
      p_table_id: table.id,
      p_type: 'call_staff',
      p_device_id: deviceId,
    })
    const pingId = (ping as { id?: string } | null)?.id ?? null
    if (pingId) {
      state.serviceRequestIds.push(pingId)
      state.pending.serviceRequestId = pingId
    } else {
      state.pendingSkipReason = `Gọi NV không seed được: ${pingErr?.message ?? 'RPC không trả id'}`
    }
    writeRunState(state)
    return
  }
  state.pendingSkipReason = `Không tạo được đơn chờ duyệt qua RPC Mini App: ${lastError}`
}

/** Dựng toàn bộ dữ liệu thử. Lỗi giữa chừng → tự dọn phần đã tạo rồi ném lại. */
export async function seed(): Promise<RunState> {
  const admin = serviceClient()
  const store = await resolveStore(admin)
  const preOpenSessionIds = await openSessionIds(admin, store.id)

  const { data: settings, error: settingsErr } = await admin
    .from('store_workflow_settings')
    .select('reservations_enabled, require_cash_shift')
    .eq('store_id', store.id)
    .maybeSingle()
  if (settingsErr) throw new Error(`Không đọc được cấu hình vận hành của quán: ${settingsErr.message}`)
  if (!settings) throw new Error('Bảo Lương chưa có store_workflow_settings')
  // Quán bắt mở ca mà chưa có ca mở → POS hiện hộp thoại mở ca chặn mọi thao tác. Dừng sớm, nói rõ.
  if (settings.require_cash_shift === true) {
    const { data: shift, error: shiftErr } = await admin
      .from('cash_shifts')
      .select('id')
      .eq('store_id', store.id)
      .eq('status', 'open')
      .limit(1)
    if (shiftErr) throw new Error(`Không đọc được ca thu ngân: ${shiftErr.message}`)
    if (!shift || shift.length === 0) {
      throw new Error('Bảo Lương đang bật "bắt buộc mở ca" mà chưa có ca nào mở — mở ca ở POS (hoặc tắt bắt buộc mở ca) rồi chạy lại e2e.')
    }
  }

  await removeLeftoverFixtures(admin, store.id)

  const state: RunState = {
    storeId: store.id,
    storeName: store.name,
    runTag: randomUUID().slice(0, 6),
    startedAt: new Date().toISOString(),
    preOpenSessionIds,
    areaId: null,
    tableIds: [],
    totalTables: 0,
    reservationsEnabled: settings.reservations_enabled === true,
    pending: null,
    pendingSkipReason: null,
    sessionIds: [],
    touchedTableIds: [],
    pendingOrderIds: [],
    serviceRequestIds: [],
    reservationIds: [],
  }
  // Ghi sớm để teardown biết đường dọn kể cả khi phần dưới hỏng.
  writeRunState(state)

  try {
    const { data: areas, error: areasErr } = await admin.from('table_areas').select('sort_order').eq('store_id', store.id)
    if (areasErr) throw new Error(`Không đọc được khu: ${areasErr.message}`)
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

    const { count, error: countErr } = await admin
      .from('tables')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .eq('is_active', true)
    if (countErr) throw new Error(`Không đếm được bàn: ${countErr.message}`)
    state.totalTables = count ?? 0

    const { data: busyRows, error: busyErr } = await admin.from('table_sessions').select('table_id').eq('store_id', store.id).eq('status', 'open')
    if (busyErr) throw new Error(`Không đọc được phiên đang mở: ${busyErr.message}`)
    const busy = new Set(((busyRows ?? []) as { table_id: string }[]).map((r) => r.table_id))
    await seedPendingAndCall(admin, state, busy)
    writeRunState(state)
    return state
  } catch (e) {
    // Dọn sạch thì bỏ run.json; dọn hỏng thì giữ để lượt sau (global-setup) dọn nốt.
    if (await cleanup(state).then(() => true, () => false)) fs.rmSync(RUN_STATE_PATH, { force: true })
    throw e
  }
}

/**
 * Dọn mọi thứ lượt chạy GHI LẠI. Chạy hết các bước dù bước trước lỗi; cuối cùng ném gộp lỗi (để lượt chạy báo đỏ).
 * Thứ tự: từ chối đơn chờ duyệt → xoá gọi NV → đóng phiên (staff_reset) → huỷ đặt bàn → xoá bàn E2E → xoá khu.
 */
export async function cleanup(state: RunState): Promise<void> {
  const admin = serviceClient()
  const store = await resolveStore(admin)
  if (store.id !== state.storeId) throw new Error('run.json trỏ tới quán khác Bảo Lương — không dọn.')
  const storeId = store.id
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
  const ownerDb = (): Db => {
    if (!owner) throw new Error('không có phiên chủ quán')
    return owner
  }

  // Phiên cần đóng: id RPC trả + phiên đang mở trên bàn test đã đụng (trừ phiên mở trước khi chạy).
  const pre = new Set(state.preOpenSessionIds)
  const sessionsToClose = new Set<string>()
  await step('Tra phiên e2e đang mở', async () => {
    const ids = new Set(state.sessionIds)
    const fresh = Date.now() - new Date(state.startedAt).getTime() <= TOUCHED_TABLE_TRUST_MS
    if (!fresh && state.touchedTableIds.length > 0) {
      // run.json sót từ lượt cũ (dọn hỏng, chạy lại sau): chỉ đóng phiên theo id đã ghi, KHÔNG đụng phiên đang mở trên
      // các bàn này — có thể là khách thật mở sau đó. Để người kiểm tay.
      const { data: names } = await admin.from('tables').select('table_number').eq('store_id', storeId).in('id', state.touchedTableIds)
      console.warn(
        `[e2e] run.json cũ (bắt đầu ${state.startedAt}): không tự đóng phiên theo bàn. Kiểm tay các bàn: ` +
          ((names ?? []) as { table_number: string }[]).map((t) => t.table_number).join(', '),
      )
    }
    if (fresh && state.touchedTableIds.length > 0) {
      const { data, error } = await admin
        .from('table_sessions')
        .select('id')
        .eq('store_id', storeId)
        .eq('status', 'open')
        .in('table_id', state.touchedTableIds)
      if (error) throw new Error(error.message)
      for (const r of data ?? []) ids.add(r.id as string)
    }
    if (ids.size === 0) return
    const { data, error } = await admin
      .from('table_sessions')
      .select('id')
      .eq('store_id', storeId)
      .eq('status', 'open')
      .in('id', [...ids])
    if (error) throw new Error(error.message)
    for (const r of data ?? []) if (!pre.has(r.id as string)) sessionsToClose.add(r.id as string)
  })

  await step('Từ chối đơn chờ duyệt e2e', async () => {
    // Đơn khách còn chờ duyệt chặn close_table_session ("Còn % đơn chưa được chủ quán xác nhận").
    const orderIds = new Set(state.pendingOrderIds)
    if (sessionsToClose.size > 0) {
      const { data, error } = await admin
        .from('orders')
        .select('id')
        .eq('store_id', storeId)
        .eq('status', 'pending')
        // Null-safe: đơn có order_source NULL cũng là đơn khách (neq bỏ sót NULL).
        .or('order_source.is.null,order_source.neq.pos')
        .in('session_id', [...sessionsToClose])
      if (error) throw new Error(error.message)
      for (const r of data ?? []) orderIds.add(r.id as string)
    }
    if (orderIds.size === 0) return
    const { data: live, error } = await admin
      .from('orders')
      .select('id')
      .eq('store_id', storeId)
      .eq('status', 'pending')
      .in('id', [...orderIds])
    if (error) throw new Error(error.message)
    const fails: string[] = []
    for (const r of live ?? []) {
      const { error: rpcErr } = await ownerDb().rpc('pos_reject_order', {
        p_order_id: r.id,
        p_reason_code: 'customer_requested',
        p_reason_note: null,
      })
      if (rpcErr) fails.push(rpcErr.message)
    }
    if (fails.length) throw new Error(fails.join('; '))
  })

  await step('Xoá yêu cầu gọi nhân viên e2e', async () => {
    if (state.serviceRequestIds.length === 0) return
    const { error } = await admin.from('service_requests').delete().eq('store_id', storeId).in('id', state.serviceRequestIds)
    if (error) throw new Error(error.message)
  })

  await step('Đóng phiên e2e', async () => {
    const fails: string[] = []
    for (const id of sessionsToClose) {
      const { error } = await ownerDb().rpc('close_table_session', { p_session_id: id, p_reason: 'staff_reset', p_instrument: null })
      if (error) fails.push(error.message)
    }
    if (fails.length) throw new Error(fails.join('; '))
  })

  await step('Huỷ đặt bàn e2e', async () => {
    const ids = new Set(state.reservationIds)
    // Lưới an toàn: đặt bàn còn hiệu lực mang tên "E2E …" (khách thật không đặt tên này).
    const { data, error } = await admin
      .from('reservations')
      .select('id')
      .eq('store_id', storeId)
      .like('customer_name', `${E2E_CUSTOMER_PREFIX}%`)
      .in('status', ACTIVE_RESERVATION)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) ids.add(r.id as string)
    if (ids.size === 0) return
    const { data: live, error: liveErr } = await admin
      .from('reservations')
      .select('id')
      .eq('store_id', storeId)
      .in('status', ACTIVE_RESERVATION)
      .in('id', [...ids])
    if (liveErr) throw new Error(liveErr.message)
    const fails: string[] = []
    for (const r of live ?? []) {
      const { error: rpcErr } = await ownerDb().rpc('cancel_store_reservation', { p_reservation_id: r.id, p_reason: 'E2E dọn dữ liệu thử' })
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
  appendRunState('sessionIds', [sessionId])
  appendRunState('touchedTableIds', [tableId])
  return sessionId
}
