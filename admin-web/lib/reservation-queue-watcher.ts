import type { ReservationRow } from './actions/reservations'
import type { createClient } from './supabase/client'

type ReservationQueueClient = ReturnType<typeof createClient>

export type ReservationQueueLoadResult =
  | { ok: true; reservations: ReservationRow[] }
  | { ok: false; error: string }

export type ReservationQueueEventTarget = {
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

export function watchReservationQueue({
  client,
  storeId,
  load,
  onRows,
  onError,
  onConnected,
  eventTarget,
  fallbackIntervalMs = 2_000,
}: {
  client: ReservationQueueClient
  storeId: string
  load: () => Promise<ReservationQueueLoadResult>
  onRows: (rows: ReservationRow[]) => void
  onError: (error: string | null) => void
  onConnected: (connected: boolean) => void
  eventTarget?: ReservationQueueEventTarget
  fallbackIntervalMs?: number
}) {
  let stopped = false
  let running = false
  let revision = 0
  let timer: ReturnType<typeof setTimeout> | undefined

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
          // Event mới đến trong lúc server action đang chạy: snapshot cũ không được ghi đè.
          if (ticket !== revision) continue
          if (!result.ok) {
            onError(result.error)
            continue
          }
          onRows(result.reservations.filter((reservation) => reservation.storeId === storeId))
          onError(null)
        } catch {
          if (!stopped && ticket === revision) {
            onError('Không tải được hàng đợi đặt bàn. Kiểm tra mạng rồi thử lại.')
          }
        }
      } while (!stopped && ticket !== revision)
    } finally {
      running = false
    }
  }

  function refresh() {
    if (stopped) return
    revision += 1
    clearTimeout(timer)
    timer = setTimeout(() => void drain(), 100)
  }

  const channel = client
    .channel(`reservation-queue-${storeId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'reservations', filter: `store_id=eq.${storeId}` },
      refresh,
    )
    .subscribe((status) => {
      if (stopped) return
      const connected = status === 'SUBSCRIBED'
      onConnected(connected)
      if (connected) refresh()
    })

  const target = eventTarget ?? (typeof window === 'undefined'
    ? null
    : {
        addEventListener: (type: string, listener: () => void) => window.addEventListener(type, listener),
        removeEventListener: (type: string, listener: () => void) => window.removeEventListener(type, listener),
      })
  const onFocus = () => refresh()
  const onOnline = () => refresh()
  target?.addEventListener('focus', onFocus)
  target?.addEventListener('online', onOnline)

  refresh()
  const fallback = setInterval(refresh, fallbackIntervalMs)

  return {
    refresh,
    dispose() {
      stopped = true
      clearTimeout(timer)
      clearInterval(fallback)
      target?.removeEventListener('focus', onFocus)
      target?.removeEventListener('online', onOnline)
      void client.removeChannel(channel)
    },
  }
}
