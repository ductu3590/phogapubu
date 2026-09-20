import { describe, expect, it, vi } from 'vitest'
import type { ReservationRow } from './actions/reservations'
import { createReservationReminderCoordinator, type ReminderStorage } from './reservation-reminders'

const START = Date.parse('2026-09-20T12:00:00.000Z')

function reservation(overrides: Partial<ReservationRow> = {}): ReservationRow {
  return {
    reservationId: 'reservation-1', storeId: 'store-1', status: 'confirmed',
    customerName: 'Nguyễn Văn A', customerPhone: '0900000000', partySize: 6,
    arrivalAt: '2026-09-20T11:55:00.000Z', note: null,
    requestedArrivalAt: null, requestedPartySize: null, changeNote: null,
    createdAt: '2026-09-19T00:00:00.000Z', updatedAt: '2026-09-19T00:00:00.000Z',
    tableIds: [], tableNumbers: [], suggestedTableCount: 1, planningHoldMinutes: 180,
    sessionId: null, already: false, reminderSnoozedUntil: null, reminderSnoozedBy: null,
    ...overrides,
  }
}

function memoryStorage(): ReminderStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe('reservation reminder coordinator', () => {
  it('gộp mọi booking đến hạn và chỉ kêu một lần trong cùng bucket 5 phút', () => {
    let now = START
    const playBell = vi.fn()
    const coordinator = createReservationReminderCoordinator({
      storeId: 'store-1', storage: memoryStorage(), now: () => now, playBell,
    })
    const rows = [reservation({ reservationId: 'a' }), reservation({ reservationId: 'b' })]

    expect(coordinator.sync(rows, false).reservationIds).toEqual(['a', 'b'])
    expect(playBell).not.toHaveBeenCalled()

    coordinator.sync(rows, true)
    coordinator.sync(rows, true)
    expect(playBell).toHaveBeenCalledTimes(1)

    now += 5 * 60_000
    coordinator.sync(rows, true)
    expect(playBell).toHaveBeenCalledTimes(2)
  })

  it('loại Snooze còn hiệu lực và nhắc lại khi hết Snooze', () => {
    let now = START
    const playBell = vi.fn()
    const coordinator = createReservationReminderCoordinator({
      storeId: 'store-1', now: () => now, playBell,
    })
    const row = reservation({ reminderSnoozedUntil: '2026-09-20T12:10:00.000Z' })

    expect(coordinator.sync([row], true).reservationIds).toEqual([])
    now += 10 * 60_000
    expect(coordinator.sync([row], true).reservationIds).toEqual(['reservation-1'])
    expect(playBell).toHaveBeenCalledTimes(1)
  })

  it('loại booking đã đến, no-show hoặc hủy khỏi nhắc ngay', () => {
    const playBell = vi.fn()
    const coordinator = createReservationReminderCoordinator({ storeId: 'store-1', now: () => START, playBell })

    expect(coordinator.sync([
      reservation({ reservationId: 'arrived', status: 'arrived', sessionId: 'session-1' }),
      reservation({ reservationId: 'no-show', status: 'no_show' }),
      reservation({ reservationId: 'cancelled', status: 'cancelled_by_customer' }),
    ], true).reservationIds).toEqual([])
    expect(playBell).not.toHaveBeenCalled()
  })

  it('tách khóa đã nhắc theo quán và vẫn chạy khi localStorage lỗi', () => {
    const storage = memoryStorage()
    const playA = vi.fn()
    const playB = vi.fn()
    const rows = [reservation()]
    createReservationReminderCoordinator({ storeId: 'store-a', storage, now: () => START, playBell: playA }).sync(rows, true)
    createReservationReminderCoordinator({ storeId: 'store-b', storage, now: () => START, playBell: playB }).sync(rows, true)
    expect(playA).toHaveBeenCalledTimes(1)
    expect(playB).toHaveBeenCalledTimes(1)

    const brokenStorage: ReminderStorage = {
      getItem: () => { throw new Error('disabled') },
      setItem: () => { throw new Error('disabled') },
    }
    const playBroken = vi.fn()
    const coordinator = createReservationReminderCoordinator({
      storeId: 'store-1', storage: brokenStorage, now: () => START, playBell: playBroken,
    })
    expect(() => coordinator.sync(rows, true)).not.toThrow()
    coordinator.sync(rows, true)
    expect(playBroken).toHaveBeenCalledTimes(1)
  })
})
