// Đọc dữ liệu POS ĐỊNH KỲ thẳng từ trình duyệt (client Supabase mang phiên đăng nhập), KHÔNG qua
// server action. Lý do (2026-10-04): POS hỏi lại 5 nguồn dữ liệu mỗi 2–15 giây; mỗi server action Next
// xếp chung hàng đợi với điều hướng → mở / đổi tab hộp thoại cấu hình (ST-3) phải chờ 4–10 giây, có lúc
// kẹt hẳn. Các RPC dưới đây tự kiểm quyền theo quán (is_store_owner_of / is_store_scoped_operator) nên
// đọc thẳng từ trình duyệt không mở thêm quyền nào. Ghi (thu tiền, duyệt…) vẫn đi server action.

import type { createClient } from '@/lib/supabase/client'
import type { ListSessionsResult, OpenTableSession } from '@/lib/actions/table-session'
import type { FloorResult } from '@/lib/actions/floor-layout'
import type { FloorSnapshot } from '@/lib/area-layout'
import type { ServiceRequestRow } from '@/lib/actions/service-requests'
import type { ListReservationsResult, ReservationQueueRange } from '@/lib/actions/reservations'
import type { ReservationPreorderRow } from '@/lib/actions/reservation-preorders'
import type { ReservationCustomerCallTask } from '@/lib/actions/reservation-customer-calls'
import type { BankAccountFields } from '@/lib/vietqr'
import type { PrintRequest } from '@/lib/print/print-request'
import { parseCashShiftReport, parseCashShiftState, type CashShiftReport, type CashShiftState } from '@/lib/cash-shift'
import { CASH_BOOK_CATEGORY_COLUMNS, parseCashBookCategories, type CashBookCategory } from '@/lib/cash-book'
import { parseDebtList, type DebtCustomerSummary } from '@/lib/debts'
import { toCustomerCallTask, toPreorderRow, toReservationRow, type PreorderRpcRow, type ReservationRpcRow } from './reservation-rows'

type BrowserClient = ReturnType<typeof createClient>

/** Sơ đồ bàn của quán người đang đăng nhập (pos_get_floor_layout tự xác định quán + kiểm chủ quán). */
export async function readFloorLayout(client: BrowserClient): Promise<FloorResult> {
  const { data, error } = await client.rpc('pos_get_floor_layout')
  if (error) return { ok: false, error: `Không tải được sơ đồ: ${error.message}` }
  if (!data) return { ok: false, error: 'Không tìm thấy sơ đồ của quán' }
  return { ok: true, snapshot: data as FloorSnapshot }
}

export async function readOpenSessions(client: BrowserClient, storeId: string): Promise<ListSessionsResult> {
  const [sessions, workflow] = await Promise.all([
    client.rpc('list_open_table_sessions', { p_store_id: storeId }),
    client.rpc('get_public_store_workflow', { p_store_id: storeId }),
  ])
  if (sessions.error) return { ok: false, error: sessions.error.message }
  // Cùng cách tính với listOpenTableSessions (server action) — giữ hai bản khớp nhau.
  const rawTimeout = (workflow.error ? null : workflow.data as { table_session_idle_timeout_minutes?: unknown } | null)
    ?.table_session_idle_timeout_minutes
  const idleTimeoutMinutes = typeof rawTimeout === 'number' && Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : null
  const rows = ((sessions.data ?? []) as unknown as Omit<OpenTableSession, 'idle_timeout_minutes'>[])
    .map((session) => ({ ...session, idle_timeout_minutes: idleTimeoutMinutes }))
  return { ok: true, sessions: rows }
}

export async function readServiceRequests(client: BrowserClient, storeId: string): Promise<
  { ok: true; requests: ServiceRequestRow[] } | { ok: false; error: string }
> {
  const { data, error } = await client.rpc('list_open_service_requests', { p_store_id: storeId })
  if (error) return { ok: false, error: error.message }
  return { ok: true, requests: (data ?? []) as unknown as ServiceRequestRow[] }
}

export async function readReservationQueue(client: BrowserClient, storeId: string, range: ReservationQueueRange): Promise<ListReservationsResult> {
  const { data, error } = await client.rpc('list_reservation_queue', {
    p_store_id: storeId,
    p_recent_since: range.recentSince,
    p_future_until: range.futureUntil,
  })
  if (error) return { ok: false, error: error.message }
  if (!Array.isArray(data)) return { ok: false, error: 'Dữ liệu phản hồi đặt bàn không hợp lệ' }
  return { ok: true, reservations: data.map((row) => toReservationRow(row as ReservationRpcRow)) }
}

export async function readPreorderQueue(client: BrowserClient, storeId: string): Promise<
  { ok: true; rows: ReservationPreorderRow[] } | { ok: false; error: string }
> {
  const { data, error } = await client.rpc('list_reservation_preorder_queue', { p_store_id: storeId })
  if (error || !Array.isArray(data)) return { ok: false, error: error?.message ?? 'Dữ liệu món đặt trước không hợp lệ' }
  return { ok: true, rows: data.map((row) => toPreorderRow(row as PreorderRpcRow)) }
}

export async function readCustomerCalls(client: BrowserClient, storeId: string): Promise<
  { ok: true; value: ReservationCustomerCallTask[] } | { ok: false; error: string }
> {
  const { data, error } = await client.rpc('list_reservation_customer_calls', { p_store_id: storeId })
  if (error || !Array.isArray(data)) return { ok: false, error: error?.message ?? 'Dữ liệu việc gọi nhắc khách không hợp lệ' }
  return { ok: true, value: data.map((item) => toCustomerCallTask(item as Record<string, unknown>)) }
}

export type PrintProblemJob = {
  id: string
  kind: string
  status: 'failed' | 'expired'
  error: string | null
  created_at: string
  label: string
  request: PrintRequest | null
}
export type PrintStatus = {
  mode: 'browser' | 'agent'
  agent_online: boolean
  last_seen_at: string | null
  queued_count: number
  problem_jobs: PrintProblemJob[]
}

/** Tài khoản nhận tiền hiện tại của quán (đọc lúc mở màn Thanh toán để QR không dùng tài khoản cũ khi máy khác vừa đổi). */
export async function readStoreBankAccount(client: BrowserClient, storeId: string): Promise<
  { ok: true; bank: BankAccountFields } | { ok: false; error: string }
> {
  const { data, error } = await client.from('stores').select('bank_bin, bank_account_number, bank_account_name').eq('id', storeId).maybeSingle()
  if (error || !data) return { ok: false, error: error?.message ?? 'Không đọc được tài khoản nhận tiền' }
  const d = data as Record<string, unknown>
  const s = (v: unknown) => (typeof v === 'string' ? v : null)
  return { ok: true, bank: { bank_bin: s(d.bank_bin), bank_account_number: s(d.bank_account_number), bank_account_name: s(d.bank_account_name) } }
}

const str = (v: unknown): v is string => typeof v === 'string'

// request từ DB là jsonb do lớp enqueue ghi; vẫn kiểm hình để nút "In bằng trình duyệt" không dựng URL từ rác.
function parsePrintRequest(v: unknown): PrintRequest | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const reprint = r.reprint === true ? { reprint: true } : {}
  if (r.kind === 'order' && str(r.orderId)) return { kind: 'order', orderId: r.orderId, ...reprint }
  if (r.kind === 'preorder_job' && str(r.jobId)) return { kind: 'preorder_job', jobId: r.jobId, ...reprint }
  if (r.kind === 'bill' && Array.isArray(r.sessionIds) && r.sessionIds.length > 0 && r.sessionIds.every(str)) {
    return { kind: 'bill', sessionIds: r.sessionIds as string[], ...reprint }
  }
  if (r.kind === 'day_report' && str(r.date)) return { kind: 'day_report', date: r.date, ...reprint }
  return null
}

function parseProblemJob(v: unknown): PrintProblemJob | null {
  if (!v || typeof v !== 'object') return null
  const j = v as Record<string, unknown>
  if (!str(j.id) || !str(j.kind) || !str(j.label) || !str(j.created_at)) return null
  if (j.status !== 'failed' && j.status !== 'expired') return null
  return { id: j.id, kind: j.kind, status: j.status, error: str(j.error) ? j.error : null, created_at: j.created_at, label: j.label, request: parsePrintRequest(j.request) }
}

/** Trạng thái phần mềm in + phiếu lỗi (get_print_status, mig 114). Chủ quán + thu ngân; RPC tự kiểm quyền. */
export async function readPrintStatus(client: BrowserClient, storeId: string): Promise<
  { ok: true; status: PrintStatus } | { ok: false; error: string }
> {
  const { data, error } = await client.rpc('get_print_status', { p_store_id: storeId })
  if (error || !data || typeof data !== 'object') return { ok: false, error: error?.message ?? 'Dữ liệu trạng thái in không hợp lệ' }
  const r = data as Partial<PrintStatus>
  return {
    ok: true,
    status: {
      mode: r.mode === 'agent' ? 'agent' : 'browser',
      agent_online: r.agent_online === true,
      last_seen_at: r.last_seen_at ?? null,
      queued_count: typeof r.queued_count === 'number' ? r.queued_count : 0,
      // Kiểm từng phần tử: một phần tử sai hình bị bỏ, không làm hỏng cả băng báo lỗi
      problem_jobs: Array.isArray(r.problem_jobs) ? r.problem_jobs.flatMap((j) => parseProblemJob(j) ?? []) : [],
    },
  }
}

// ---------------------------------------------------------------------------
// Ca thu ngân + sổ thu chi (mig 122). Đọc từ trình duyệt như mọi đọc POS khác (không poll qua server action).
// get_open_cash_shift / get_cash_shift_report tự kiểm quyền; ca đang mở không có tiền bán / dự kiến (server không trả).
// ---------------------------------------------------------------------------
export async function readCashShiftState(client: BrowserClient, storeId: string): Promise<
  { ok: true; state: CashShiftState } | { ok: false; error: string }
> {
  const { data, error } = await client.rpc('get_open_cash_shift', { p_store_id: storeId })
  if (error) return { ok: false, error: error.message }
  return { ok: true, state: parseCashShiftState(data) }
}

export async function readCashShiftReport(client: BrowserClient, shiftId: string): Promise<
  { ok: true; report: CashShiftReport } | { ok: false; error: string }
> {
  const { data, error } = await client.rpc('get_cash_shift_report', { p_shift_id: shiftId })
  if (error) return { ok: false, error: error.message }
  const report = parseCashShiftReport(data)
  if (!report) return { ok: false, error: 'Không đọc được ca' }
  return { ok: true, report }
}

/** Danh mục đang dùng cho hộp Thu/Chi két (RLS: ai có quyền POS của đúng quán). */
export async function readCashBookCategories(client: BrowserClient, storeId: string): Promise<
  { ok: true; categories: CashBookCategory[] } | { ok: false; error: string }
> {
  const { data, error } = await client
    .from('cash_book_categories')
    .select(CASH_BOOK_CATEGORY_COLUMNS)
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('kind')
    .order('sort_order')
  if (error) return { ok: false, error: error.message }
  return { ok: true, categories: parseCashBookCategories(data) }
}

// ---------------------------------------------------------------------------
// Công nợ (mig 123): danh sách khách nợ cho ô chọn "Ghi nợ" ở màn Thanh toán. Cả khách đã ngừng (lọc ở UI) để
// thấy số nợ cũ; RPC debt_list tự kiểm quyền (chủ quán, quản lý, thu ngân của đúng quán).
// ---------------------------------------------------------------------------
export async function readDebtCustomers(client: BrowserClient, storeId: string): Promise<
  { ok: true; customers: DebtCustomerSummary[] } | { ok: false; error: string }
> {
  const { data, error } = await client.rpc('debt_list', { p_store_id: storeId, p_only_open: false })
  if (error) return { ok: false, error: error.message }
  return { ok: true, customers: parseDebtList(data) }
}
