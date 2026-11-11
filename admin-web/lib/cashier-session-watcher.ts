import type { createClient } from '@/lib/supabase/client'
import { watchRealtime } from './realtime-watch'

type CashierClient = ReturnType<typeof createClient>

// Phiên bàn + bill của POS: nghe ba bảng rồi tải lại snapshot (xem lib/realtime-watch.ts).
export function watchCashierSessions({
  client,
  storeId,
  reload,
  onConnected,
  fallbackIntervalMs = 5_000,
}: {
  client: CashierClient
  storeId: string
  reload: () => void | Promise<unknown>
  onConnected: (connected: boolean) => void
  fallbackIntervalMs?: number
}) {
  return watchRealtime({
    client,
    channel: `cashier-${storeId}`,
    sources: [
      { table: 'table_sessions', filter: `store_id=eq.${storeId}` },
      { table: 'orders', filter: `store_id=eq.${storeId}` },
      // session_tables không có cột store_id nên không lọc được — nghe hết rồi tải snapshot.
      { table: 'session_tables' },
    ],
    load: () => reload(),
    onConnected,
    debounceMs: 0,
    intervalMs: fallbackIntervalMs,
    loadOnStart: false,
  })
}
