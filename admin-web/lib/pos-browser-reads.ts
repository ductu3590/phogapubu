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
