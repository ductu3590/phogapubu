import type { ReservationRow } from './actions/reservations'
import { watchRealtime, type WatchEventTarget } from './realtime-watch'
import type { createClient } from './supabase/client'

type ReservationQueueClient = ReturnType<typeof createClient>

export type ReservationQueueLoadResult =
  | { ok: true; reservations: ReservationRow[] }
  | { ok: false; error: string }

export type ReservationQueueEventTarget = WatchEventTarget

// Hàng đợi đặt bàn (POS + trang Đặt bàn): nghe bảng reservations rồi tải lại snapshot.
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
  return watchRealtime({
    client,
    channel: `reservation-queue-${storeId}`,
    sources: [{ table: 'reservations', filter: `store_id=eq.${storeId}` }],
    load: async (stopped) => {
      try {
        const result = await load()
        if (stopped()) return
        if (!result.ok) {
          onError(result.error)
        } else {
          onRows(result.reservations.filter((reservation) => reservation.storeId === storeId))
          onError(null)
        }
      } catch {
        if (!stopped()) onError('Không tải được hàng đợi đặt bàn. Kiểm tra mạng rồi thử lại.')
      }
    },
    onConnected,
    debounceMs: 100,
    intervalMs: fallbackIntervalMs,
    loadOnStart: true,
    eventTarget,
  })
}
