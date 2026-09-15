import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchCashierSessions } from './cashier-session-watcher'

function setup() {
  let status!: (value: string) => void
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn((callback) => { status = callback; return channel }),
  }
  const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() }
  const reload = vi.fn()
  const onConnected = vi.fn()
  const watcher = watchCashierSessions({
    client: client as never,
    storeId: 'store-1',
    reload,
    onConnected,
    fallbackIntervalMs: 5_000,
  })
  return { watcher, channel, client, reload, onConnected, status: (value: string) => status(value) }
}

describe('cashier session watcher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('nghe ba bảng thay đổi của phiên/bill và tải lại khi đã kết nối', () => {
    const s = setup()
    s.status('SUBSCRIBED')

    expect(s.reload).toHaveBeenCalledTimes(1)
    expect(s.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'table_sessions', filter: 'store_id=eq.store-1' }),
      expect.any(Function),
    )
    expect(s.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'orders', filter: 'store_id=eq.store-1' }),
      expect.any(Function),
    )
    expect(s.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'session_tables' }),
      expect.any(Function),
    )
    expect(s.onConnected).toHaveBeenCalledWith(true)
    s.watcher.dispose()
  })

  it('tải snapshot dự phòng định kỳ nếu kênh realtime bỏ lỡ event', () => {
    const s = setup()
    vi.advanceTimersByTime(5_000)
    expect(s.reload).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5_000)
    expect(s.reload).toHaveBeenCalledTimes(2)
    s.watcher.dispose()
    vi.advanceTimersByTime(10_000)
    expect(s.reload).toHaveBeenCalledTimes(2)
  })
})
