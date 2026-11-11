import type { ServiceRequestRow } from './actions/service-requests'
import type { OpenTableSession } from './actions/table-session'
import { watchRealtime } from './realtime-watch'
import type { createClient } from './supabase/client'

export type ServiceRequestResult =
  | { ok: true; requests: ServiceRequestRow[] }
  | { ok: false; error: string }

// Ưu tiên phiên gốc, không mở nhầm bill khách mới vừa ngồi lại cùng bàn.
export function serviceRequestSession(request: ServiceRequestRow, sessions: OpenTableSession[]) {
  if (request.session_id) return sessions.find(s => s.session_id === request.session_id) ?? null
  return sessions.find(s => s.status === 'open' && s.tables.some(t => t.id === request.table_id)) ?? null
}

// Chuông gọi nhân viên (POS, màn bếp, màn nhân viên): nghe bảng service_requests rồi tải lại snapshot.
export function watchServiceRequests({ client, storeId, load, initial, onRows, onError, onNew, onConnected, fallbackIntervalMs = 2_000 }: {
  client: ReturnType<typeof createClient>
  storeId: string
  load: () => Promise<ServiceRequestResult>
  initial: ServiceRequestRow[] | null
  onRows: (rows: ServiceRequestRow[]) => void
  onError: (error: string | null) => void
  onNew: (rows: ServiceRequestRow[]) => void
  onConnected: (connected: boolean) => void
  fallbackIntervalMs?: number
}) {
  // id → last_ping_at của lần tải trước; null = chưa có snapshot nào nên lần đầu không kêu chuông.
  let known = initial === null ? null : new Map(initial.map(r => [r.id, r.last_ping_at]))

  return watchRealtime({
    client,
    channel: `call-staff-${storeId}`,
    sources: [{ table: 'service_requests', filter: `store_id=eq.${storeId}` }],
    load: async (stopped) => {
      try {
        const result = await load()
        if (stopped()) return
        if (!result.ok) { onError(result.error); return }
        const rows = result.requests.filter(r => r.store_id === storeId && r.resolved_at === null)
        const fresh = known === null ? [] : rows.filter(r => known!.get(r.id) !== r.last_ping_at)
        known = new Map(rows.map(r => [r.id, r.last_ping_at]))
        onRows(rows)
        onError(null)
        if (fresh.length) onNew(fresh)
      } catch {
        if (!stopped()) onError('Không tải được yêu cầu gọi nhân viên. Kiểm tra mạng rồi thử lại.')
      }
    },
    onConnected,
    debounceMs: 150,
    intervalMs: fallbackIntervalMs,
    loadOnStart: true,
  })
}
