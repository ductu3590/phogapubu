import { describe, expect, it } from 'vitest'
import type { ReservationRow } from './actions/reservations'
import {
  dueReservationReminders,
  reservationQueueState,
  sortReservationQueue,
} from './reservation-queue'

const NOW = new Date('2026-09-20T12:00:00.000Z')

function reservation(overrides: Partial<ReservationRow> = {}): ReservationRow {
  return {
    reservationId: 'reservation-default',
    storeId: 'store-1',
    status: 'confirmed',
    customerName: 'Nguyễn Văn A',
    customerPhone: '0900000000',
    partySize: 6,
    arrivalAt: '2026-09-20T12:30:00.000Z',
    note: null,
    requestedArrivalAt: null,
    requestedPartySize: null,
    changeNote: null,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    tableIds: [],
    tableNumbers: [],
    suggestedTableCount: 1,
    planningHoldMinutes: 180,
    sessionId: null,
    already: false,
    reminderSnoozedUntil: null,
    reminderSnoozedBy: null,
    ...overrides,
  }
}

describe('reservation queue classifier', () => {
  it('đưa booking confirmed đã quá 30 phút vào cảnh báo đỏ và tính bucket 5 phút từ giờ đến', () => {
    const row = reservation({
      reservationId: 'late',
      arrivalAt: '2026-09-20T11:30:00.000Z',
    })

    expect(reservationQueueState(row, NOW)).toEqual({
      kind: 'overdue',
      severity: 'critical',
      minutesOverdue: 30,
      reminderBucket: 6,
      reminderDue: true,
    })
  })

  it('không nhắc booking đã Snooze, pending hoặc đã kết thúc dù giờ đến đã qua', () => {
    const late = '2026-09-20T11:45:00.000Z'
    const rows = [
      reservation({ reservationId: 'snoozed', arrivalAt: late, reminderSnoozedUntil: '2026-09-20T12:15:00.000Z' }),
      reservation({ reservationId: 'pending', status: 'pending', arrivalAt: late }),
      reservation({ reservationId: 'arrived', status: 'arrived', arrivalAt: late, sessionId: 'session-1' }),
      reservation({ reservationId: 'done', status: 'completed', arrivalAt: late }),
    ]

    expect(dueReservationReminders(rows, NOW)).toEqual([])
    expect(reservationQueueState(rows[0], NOW).reminderDue).toBe(false)
    expect(reservationQueueState(rows[1], NOW).kind).toBe('pending')
    expect(reservationQueueState(rows[2], NOW).kind).toBe('arrived')
    expect(reservationQueueState(rows[3], NOW).kind).toBe('terminal')
  })

  it('gộp mọi booking đến hạn chưa Snooze cho một banner, không theo thứ tự input', () => {
    const rows = [
      reservation({ reservationId: 'later', arrivalAt: '2026-09-20T11:55:00.000Z' }),
      reservation({ reservationId: 'snoozed', arrivalAt: '2026-09-20T11:50:00.000Z', reminderSnoozedUntil: '2026-09-20T12:10:00.000Z' }),
      reservation({ reservationId: 'early', arrivalAt: '2026-09-20T11:45:00.000Z' }),
    ]

    expect(dueReservationReminders(rows, NOW).map((row) => row.reservationId)).toEqual(['early', 'later'])
  })

  it('sắp queue theo việc cần xử lý rồi giờ đến, nhưng không mutate snapshot server', () => {
    const input = [
      reservation({ reservationId: 'arrived', status: 'arrived', arrivalAt: '2026-09-20T10:00:00.000Z' }),
      reservation({ reservationId: 'upcoming', arrivalAt: '2026-09-20T12:30:00.000Z' }),
      reservation({ reservationId: 'terminal', status: 'no_show', arrivalAt: '2026-09-20T09:00:00.000Z' }),
      reservation({ reservationId: 'pending', status: 'pending', arrivalAt: '2026-09-20T13:00:00.000Z' }),
      reservation({ reservationId: 'overdue', arrivalAt: '2026-09-20T11:55:00.000Z' }),
    ]

    expect(sortReservationQueue(input, NOW).map((row) => row.reservationId)).toEqual([
      'pending', 'overdue', 'upcoming', 'arrived', 'terminal',
    ])
    expect(input.map((row) => row.reservationId)).toEqual([
      'arrived', 'upcoming', 'terminal', 'pending', 'overdue',
    ])
  })
})
