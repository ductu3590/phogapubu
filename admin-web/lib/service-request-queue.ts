import type { ServiceRequestRow } from './actions/service-requests'
import type { OpenTableSession } from './actions/table-session'
import type { createClient } from './supabase/client'

export type ServiceRequestResult =
  | { ok: true; requests: ServiceRequestRow[] }
  | { ok: false; error: string }

// Ưu tiên phiên gốc, không mở nhầm bill khách mới vừa ngồi lại cùng bàn.
export function serviceRequestSession(request: ServiceRequestRow, sessions: OpenTableSession[]) {
  if (request.session_id) return sessions.find(s => s.session_id === request.session_id) ?? null
  return sessions.find(s => s.status === 'open' && s.tables.some(t => t.id === request.table_id)) ?? null
}

export function watchServiceRequests({ client, storeId, load, initial, onRows, onError, onNew, onConnected }: {
  client: ReturnType<typeof createClient>
  storeId: string
  load: () => Promise<ServiceRequestResult>
  initial: ServiceRequestRow[] | null
  onRows: (rows: ServiceRequestRow[]) => void
  onError: (error: string | null) => void
  onNew: (rows: ServiceRequestRow[]) => void
  onConnected: (connected: boolean) => void
}) {
  let stopped = false
  let running = false
  let revision = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let known = initial === null ? null : new Map(initial.map(r => [r.id, r.last_ping_at]))

  async function drain() {
    if (stopped || running) return
    running = true
    try {
      let ticket: number
      do {
        ticket = revision
        try {
          const result = await load()
          if (stopped) return
          // Có sự kiện trong lúc RPC chạy: bỏ snapshot cũ và tải lại, không mất lượt mới.
          if (ticket !== revision) continue
          if (!result.ok) { onError(result.error); continue }
          const rows = result.requests.filter(r => r.store_id === storeId && r.resolved_at === null)
          const fresh = known === null ? [] : rows.filter(r => known!.get(r.id) !== r.last_ping_at)
          known = new Map(rows.map(r => [r.id, r.last_ping_at]))
          onRows(rows)
          onError(null)
          if (fresh.length) onNew(fresh)
        } catch {
          if (!stopped && ticket === revision) onError('Không tải được yêu cầu gọi nhân viên. Kiểm tra mạng rồi thử lại.')
        }
      } while (!stopped && ticket !== revision)
    } finally {
      running = false
    }
  }

  function refresh() {
    ++revision
    clearTimeout(timer)
    timer = setTimeout(() => void drain(), 150)
  }

  const channel = client.channel(`call-staff-${storeId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests', filter: `store_id=eq.${storeId}` }, refresh)
    .subscribe(status => {
      if (stopped) return
      onConnected(status === 'SUBSCRIBED')
      if (status === 'SUBSCRIBED') refresh()
    })
  refresh()
  return {
    refresh,
    dispose() {
      stopped = true
      clearTimeout(timer)
      void client.removeChannel(channel)
    },
  }
}
