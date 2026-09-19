import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReservationRow } from './actions/reservations'
import { watchReservationQueue } from './reservation-queue-watcher'

function reservation(id: string): ReservationRow {
  return {
    reservationId: id,
    storeId: 'store-1',
    status: 'confirmed',
    customerName: 'Nguyễn Văn A',
    customerPhone: '0900000000',
    partySize: 2,
    arrivalAt: '2026-09-20T12:00:00.000Z',
    note: null,
    requestedArrivalAt: null,
    requestedPartySize: null,
    changeNote: null,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    tableIds: [],
    tableNumbers: [],
    suggestedTableCount: 1,
    sessionId: null,
    already: false,
    reminderSnoozedUntil: null,
    reminderSnoozedBy: null,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function fakeEvents() {
  const listeners = new Map<string, Set<() => void>>()
  return {
    addEventListener(type: string, listener: () => void) {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(type)?.delete(listener)
    },
    emit(type: string) {
      for (const listener of listeners.get(type) ?? []) listener()
    },
  }
}

function fakeClient() {
  let change: (() => void) | undefined
  let status: ((value: string) => void) | undefined
  const channel = {
    on: vi.fn((_event: string, _filter: unknown, callback: () => void) => {
      change = callback
      return channel
    }),
    subscribe: vi.fn((callback: (value: string) => void) => {
      status = callback
      return channel
    }),
  }
  return {
    client: {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => undefined),
    },
    emitChange: () => change?.(),
    emitStatus: (value: string) => status?.(value),
  }
}

afterEach(() => { vi.useRealTimers() })

describe('reservation queue watcher', () => {
  it('poll mỗi 2 giây dù realtime không phát event', async () => {
    vi.useFakeTimers()
    const socket = fakeClient()
    const events = fakeEvents()
    const load = vi.fn(async () => ({ ok: true as const, reservations: [reservation('from-poll')] }))
    const onRows = vi.fn()

    const watcher = watchReservationQueue({
      client: socket.client as never,
      storeId: 'store-1',
      load,
      onRows,
      onError: vi.fn(),
      onConnected: vi.fn(),
      eventTarget: events,
    })
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(2_000)

    expect(onRows).toHaveBeenCalledTimes(2)
    expect(onRows).toHaveBeenLastCalledWith([reservation('from-poll')])
    watcher.dispose()
  })

  it('refresh queue khi socket nối lại hoặc người vận hành quay về tab', async () => {
    vi.useFakeTimers()
    const socket = fakeClient()
    const events = fakeEvents()
    const load = vi.fn(async () => ({ ok: true as const, reservations: [] }))
    const onConnected = vi.fn()

    const watcher = watchReservationQueue({
      client: socket.client as never,
      storeId: 'store-1',
      load,
      onRows: vi.fn(),
      onError: vi.fn(),
      onConnected,
      eventTarget: events,
    })
    socket.emitStatus('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(100)
    events.emit('focus')
    await vi.advanceTimersByTimeAsync(100)

    expect(onConnected).toHaveBeenCalledWith(true)
    expect(load).toHaveBeenCalledTimes(2)
    watcher.dispose()
  })

  it('bỏ snapshot cũ khi event đến trong lúc request đang chạy', async () => {
    vi.useFakeTimers()
    const socket = fakeClient()
    const first = deferred<{ ok: true; reservations: ReservationRow[] }>()
    const load = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ ok: true as const, reservations: [reservation('fresh')] })
    const onRows = vi.fn()

    const watcher = watchReservationQueue({
      client: socket.client as never,
      storeId: 'store-1',
      load,
      onRows,
      onError: vi.fn(),
      onConnected: vi.fn(),
      eventTarget: fakeEvents(),
    })
    await vi.advanceTimersByTimeAsync(100)
    socket.emitChange()
    first.resolve({ ok: true, reservations: [reservation('stale')] })
    await vi.advanceTimersByTimeAsync(100)

    expect(onRows).toHaveBeenCalledTimes(1)
    expect(onRows).toHaveBeenCalledWith([reservation('fresh')])
    watcher.dispose()
  })

  it('dispose ngừng polling/listener và đóng channel', async () => {
    vi.useFakeTimers()
    const socket = fakeClient()
    const events = fakeEvents()
    const load = vi.fn(async () => ({ ok: true as const, reservations: [] }))

    const watcher = watchReservationQueue({
      client: socket.client as never,
      storeId: 'store-1',
      load,
      onRows: vi.fn(),
      onError: vi.fn(),
      onConnected: vi.fn(),
      eventTarget: events,
    })
    await vi.advanceTimersByTimeAsync(100)
    watcher.dispose()
    events.emit('focus')
    socket.emitChange()
    await vi.advanceTimersByTimeAsync(4_000)

    expect(load).toHaveBeenCalledTimes(1)
    expect(socket.client.removeChannel).toHaveBeenCalledTimes(1)
  })
})
