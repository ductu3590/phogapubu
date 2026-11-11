import type { createClient } from './supabase/client'

type BrowserClient = ReturnType<typeof createClient>

export type WatchEventTarget = {
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

export type WatchSource = { table: string; filter?: string }

let watcherSeq = 0

/**
 * Lõi chung cho mọi màn "nghe Realtime rồi tải lại snapshot" (POS, đặt bàn, gọi nhân viên).
 *
 * - Realtime là đường chính: đã đo trên prod 2026-11-11, sự kiện postgres_changes tới được tài khoản
 *   chủ quán / nhân viên đã đăng nhập (RLS chỉ chặn client chưa đăng nhập).
 * - Tải lại định kỳ là lưới an toàn cho lúc tab vừa nối lại mà sự kiện đã trôi qua.
 * - Chỉ MỘT lần tải chạy tại một thời điểm; sự kiện tới giữa chừng được gom thành một lần tải nữa.
 * - Tên kênh luôn có hậu tố riêng: client Supabase trình duyệt dùng chung một bản, channel() trùng tên
 *   trả lại kênh ĐANG chạy → gắn thêm .on() sau subscribe() là lỗi (POS và hộp thoại đè lên POS cùng nghe một quán).
 *
 * `load` tự xử lý lỗi và tự hiện kết quả; `stopped()` cho biết màn đã rời đi trong lúc đang tải.
 */
export function watchRealtime({
  client,
  channel: channelName,
  sources,
  load,
  onConnected,
  debounceMs,
  intervalMs,
  loadOnStart,
  eventTarget,
}: {
  client: BrowserClient
  channel: string
  sources: WatchSource[]
  load: (stopped: () => boolean) => void | Promise<unknown>
  onConnected: (connected: boolean) => void
  /** 0 = tải ngay trong cùng nhịp với sự kiện. */
  debounceMs: number
  intervalMs: number
  /** Tải một lần ngay khi bắt đầu, không chờ kênh nối xong. */
  loadOnStart: boolean
  eventTarget?: WatchEventTarget
}) {
  let stopped = false
  let running = false
  let dirty = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const isStopped = () => stopped

  // Không dùng async/await ở đây: `load` đồng bộ (POS gọi router.refresh) phải xong ngay trong cùng nhịp,
  // không thì nhịp tải lại kế tiếp bị coi là "đang chạy" và bị dồn sang sau.
  function drain() {
    if (stopped || running) return
    running = true
    const step = () => {
      for (;;) {
        dirty = false
        let result: void | Promise<unknown>
        try {
          result = load(isStopped)
        } catch {
          // load tự báo lỗi; nuốt ở đây để một lần tải hỏng không làm dừng cả bộ theo dõi.
          result = undefined
        }
        if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
          void Promise.resolve(result)
            .catch(() => {})
            .finally(() => {
              if (!stopped && dirty) step()
              else running = false
            })
          return
        }
        if (stopped || !dirty) break
      }
      running = false
    }
    step()
  }

  function refresh() {
    if (stopped) return
    dirty = true
    if (debounceMs <= 0) {
      void drain()
      return
    }
    clearTimeout(timer)
    timer = setTimeout(() => void drain(), debounceMs)
  }

  let channel = client.channel(`${channelName}-${++watcherSeq}`)
  for (const source of sources) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: source.table, ...(source.filter ? { filter: source.filter } : {}) },
      refresh,
    )
  }
  channel.subscribe((status) => {
    if (stopped) return
    const connected = status === 'SUBSCRIBED'
    onConnected(connected)
    // Nối lại sau khi rớt mạng có thể đã lỡ sự kiện → tải lại cho chắc.
    if (connected) refresh()
  })

  const target = eventTarget ?? (typeof window === 'undefined'
    ? null
    : {
        addEventListener: (type: string, listener: () => void) => window.addEventListener(type, listener),
        removeEventListener: (type: string, listener: () => void) => window.removeEventListener(type, listener),
      })
  const onWake = () => refresh()
  const onVisibility = () => {
    if (!document.hidden) refresh()
  }
  target?.addEventListener('focus', onWake)
  target?.addEventListener('online', onWake)
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)

  if (loadOnStart) refresh()
  const fallback = setInterval(refresh, intervalMs)

  return {
    refresh,
    dispose() {
      stopped = true
      clearTimeout(timer)
      clearInterval(fallback)
      target?.removeEventListener('focus', onWake)
      target?.removeEventListener('online', onWake)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
      void client.removeChannel(channel)
    },
  }
}
