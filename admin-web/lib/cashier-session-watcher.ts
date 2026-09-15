import type { createClient } from '@/lib/supabase/client'

type CashierClient = ReturnType<typeof createClient>

// Realtime là đường chính. Snapshot định kỳ là lưới an toàn cho lúc tab vừa nối lại mà
// event INSERT/UPDATE đã trôi qua trước khi subscription sẵn sàng.
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
  const refresh = () => { void reload() }
  const channel = client
    .channel(`cashier-${storeId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'table_sessions', filter: `store_id=eq.${storeId}` },
      refresh,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
      refresh,
    )
    // session_tables không có cột store_id nên không lọc được — nghe hết rồi tải snapshot.
    .on('postgres_changes', { event: '*', schema: 'public', table: 'session_tables' }, refresh)
    .subscribe((status) => {
      const connected = status === 'SUBSCRIBED'
      onConnected(connected)
      // Nối lại sau khi rớt mạng có thể đã lỡ sự kiện → tải lại cho chắc.
      if (connected) refresh()
    })

  const fallback = setInterval(refresh, fallbackIntervalMs)

  return {
    dispose() {
      clearInterval(fallback)
      void client.removeChannel(channel)
    },
  }
}
