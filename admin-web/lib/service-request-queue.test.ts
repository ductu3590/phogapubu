import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serviceRequestSession, watchServiceRequests } from './service-request-queue'
import type { ServiceRequestRow } from './actions/service-requests'
import type { OpenTableSession } from './actions/table-session'

const row = (id = 'r1', patch: Partial<ServiceRequestRow> = {}): ServiceRequestRow => ({
  id, store_id: 's1', table_id: 't1', table_number: 'Bàn 1', type: 'call_staff', session_id: 'session1',
  created_at: '2026-09-14T01:00:00Z', last_ping_at: '2026-09-14T01:00:00Z', ping_count: 1,
  resolved_at: null, resolved_by: null, ...patch,
})

function setup(initial: ServiceRequestRow[] | null = []) {
  let event!: () => void
  let status!: (value: string) => void
  const channel = {
    on: vi.fn((_kind, _filter, callback) => { event = callback; return channel }),
    subscribe: vi.fn(callback => { status = callback; return channel }),
  }
  const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() }
  const load = vi.fn(async () => ({ ok: true as const, requests: [row()] }))
  const onRows = vi.fn(), onError = vi.fn(), onNew = vi.fn(), onConnected = vi.fn()
  const watcher = watchServiceRequests({ client: client as never, storeId: 's1', load, initial, onRows, onError, onNew, onConnected })
  return { watcher, client, channel, load, onRows, onError, onNew, onConnected, event: () => event(), status: (value: string) => status(value) }
}

describe('service request snapshots', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('nghe mọi event đúng store, debounce và chỉ báo một lần mỗi batch', async () => {
    const s = setup()
    s.load.mockResolvedValue({ ok: true, requests: [row(), row('r2')] })
    s.event(); s.event(); s.status('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(150)
    expect(s.channel.on).toHaveBeenCalledWith('postgres_changes', expect.objectContaining({ event: '*', filter: 'store_id=eq.s1' }), expect.any(Function))
    expect(s.load).toHaveBeenCalledTimes(1)
    expect(s.onNew).toHaveBeenCalledTimes(1)
    expect(s.onNew.mock.calls[0][0]).toHaveLength(2)
    s.watcher.dispose()
  })

  it('snapshot đầu im lặng; reconnect tải đủ và không báo trùng', async () => {
    const s = setup(null)
    await vi.advanceTimersByTimeAsync(150)
    expect(s.onNew).not.toHaveBeenCalled()
    s.status('CHANNEL_ERROR'); s.status('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(150)
    expect(s.load).toHaveBeenCalledTimes(2)
    expect(s.onNew).not.toHaveBeenCalled()
    s.load.mockResolvedValue({ ok: true, requests: [row(), row('missed')] })
    s.status('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(150)
    expect(s.onNew).toHaveBeenLastCalledWith([row('missed')])
    s.watcher.dispose()
  })

  it('ping lại đổi thời gian/số lần trên cùng card, resolve gỡ card qua snapshot', async () => {
    const s = setup([row()])
    const updated = row('r1', { last_ping_at: '2026-09-14T01:01:00Z', ping_count: 2 })
    s.load.mockResolvedValue({ ok: true, requests: [updated] })
    await vi.advanceTimersByTimeAsync(150)
    expect(s.onRows).toHaveBeenLastCalledWith([updated])
    expect(s.onNew).toHaveBeenCalledTimes(1)
    s.load.mockResolvedValue({ ok: true, requests: [] })
    s.event()
    await vi.advanceTimersByTimeAsync(150)
    expect(s.onRows).toHaveBeenLastCalledWith([])
    expect(s.onNew).toHaveBeenCalledTimes(1)
    s.watcher.dispose()
  })

  it('không áp snapshot cũ khi event tới lúc RPC đang chạy; tải lại sau đó', async () => {
    const s = setup()
    let finish!: (value: { ok: true; requests: ServiceRequestRow[] }) => void
    s.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await vi.advanceTimersByTimeAsync(150)
    s.event()
    await vi.advanceTimersByTimeAsync(150)
    expect(s.load).toHaveBeenCalledTimes(1)
    finish({ ok: true, requests: [row('stale')] })
    await vi.advanceTimersByTimeAsync(0)
    expect(s.load).toHaveBeenCalledTimes(2)
    expect(s.onRows).toHaveBeenCalledTimes(1)
    expect(s.onRows).toHaveBeenCalledWith([row()])
    s.watcher.dispose()
  })

  it('lỗi mạng giữ danh sách cũ và hồi phục khi tải lại', async () => {
    const s = setup([row()])
    s.load.mockRejectedValueOnce(new Error('network'))
    await vi.advanceTimersByTimeAsync(150)
    expect(s.onRows).not.toHaveBeenCalled()
    expect(s.onError).toHaveBeenCalledWith(expect.stringContaining('Kiểm tra mạng'))
    s.watcher.refresh()
    await vi.advanceTimersByTimeAsync(150)
    expect(s.onRows).toHaveBeenCalledWith([row()])
    expect(s.onError).toHaveBeenLastCalledWith(null)
    s.watcher.dispose()
  })

  it('tải lại mỗi 2 giây khi browser không nhận event realtime', async () => {
    const s = setup()
    await vi.advanceTimersByTimeAsync(150)
    expect(s.load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_999)
    expect(s.load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(s.load).toHaveBeenCalledTimes(2)
    s.watcher.dispose()
    await vi.advanceTimersByTimeAsync(4_000)
    expect(s.load).toHaveBeenCalledTimes(2)
  })

  it('bỏ row đã resolve hoặc khác quán', async () => {
    const s = setup()
    s.load.mockResolvedValue({ ok: true, requests: [row(), row('closed', { resolved_at: 'now' }), row('other', { store_id: 's2' })] })
    await vi.advanceTimersByTimeAsync(150)
    expect(s.onRows).toHaveBeenCalledWith([row()])
    s.watcher.dispose()
  })

  it('cleanup ngăn response cũ và hủy channel', async () => {
    const s = setup()
    let finish!: (value: { ok: true; requests: ServiceRequestRow[] }) => void
    s.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await vi.advanceTimersByTimeAsync(150)
    s.watcher.dispose()
    finish({ ok: true, requests: [row()] })
    await vi.advanceTimersByTimeAsync(0)
    expect(s.onRows).not.toHaveBeenCalled()
    expect(s.onNew).not.toHaveBeenCalled()
    expect(s.client.removeChannel).toHaveBeenCalledWith(s.channel)
  })
})

describe('mở đúng bàn/mâm của request', () => {
  const session = (id: string, tableIds: string[], status = 'open') => ({
    session_id: id, tables: tableIds.map(id => ({ id })), status,
  }) as OpenTableSession

  it('request ở bàn phụ mở cả mâm', () => {
    const tray = session('session1', ['t1', 't2'])
    expect(serviceRequestSession(row('r', { table_id: 't2' }), [tray])).toBe(tray)
  })
  it('phiên hết hạn còn nợ được ưu tiên hơn khách mới tại cùng bàn', () => {
    const old = session('session1', ['t1'], 'closed')
    expect(serviceRequestSession(row(), [session('new', ['t1']), old])).toBe(old)
    expect(serviceRequestSession(row(), [session('new', ['t1'])])).toBeNull()
  })
  it('request không có phiên tìm bàn trong phiên đang mở', () => {
    const current = session('new', ['t1'])
    expect(serviceRequestSession(row('r', { session_id: null }), [session('old', ['t1'], 'closed'), current])).toBe(current)
  })
})
