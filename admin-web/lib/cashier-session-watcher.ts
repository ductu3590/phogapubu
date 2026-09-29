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
  let stopped = false
  let running = false
  let pending = false
  const refresh = () => {
    if (stopped) return
    if (running) { pending = true; return }
    running = true
    const finish = () => {
      running = false
      if (pending && !stopped) {
        pending = false
        refresh()
      }
    }
    const result = reload()
    if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
      void Promise.resolve(result).finally(finish)
    } else finish()
  }
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
  const onFocus = () => refresh()
  const onOnline = () => refresh()
  const onVisibility = () => {
    if (typeof document === 'undefined' || !document.hidden) refresh()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)

  return {
    dispose() {
      stopped = true
      clearInterval(fallback)
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus)
        window.removeEventListener('online', onOnline)
      }
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
      void client.removeChannel(channel)
    },
  }
}
