import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ReservationRow } from '@/lib/actions/reservations'
import ReservationQueuePanel, { posReservationAttention } from './reservation-queue-panel'

function reservation(overrides: Partial<ReservationRow> = {}): ReservationRow {
  return {
    reservationId: 'booking-1', storeId: 'store-1', status: 'pending',
    customerName: 'Nguyễn Văn A', customerPhone: '0900000000', partySize: 6,
    arrivalAt: '2026-09-20T12:00:00.000Z', note: null,
    requestedArrivalAt: null, requestedPartySize: null, changeNote: null,
    createdAt: '2026-09-19T00:00:00.000Z', updatedAt: '2026-09-19T00:00:00.000Z',
    tableIds: [], tableNumbers: [], suggestedTableCount: 1, planningHoldMinutes: 180,
    sessionId: null, already: false, reminderSnoozedUntil: null, reminderSnoozedBy: null,
    ...overrides,
  }
}

describe('ReservationQueuePanel', () => {
  it('chỉ ưu tiên booking pending, sắp đến hoặc quá giờ trong POS', () => {
    const rows = posReservationAttention([
      reservation({ reservationId: 'pending', status: 'pending' }),
      reservation({ reservationId: 'upcoming', status: 'confirmed', arrivalAt: '2026-09-20T12:30:00.000Z' }),
      reservation({ reservationId: 'far', status: 'confirmed', arrivalAt: '2026-09-20T16:00:00.000Z' }),
      reservation({ reservationId: 'overdue', status: 'confirmed', arrivalAt: '2026-09-20T11:00:00.000Z' }),
      reservation({ reservationId: 'history', status: 'no_show' }),
      reservation({ reservationId: 'arrived', status: 'arrived', sessionId: 'session-1' }),
    ], new Date('2026-09-20T12:00:00.000Z'))

    expect(rows.map((row) => row.reservationId)).toEqual(['pending', 'overdue', 'upcoming'])
  })

  it('hiển thị nút duyệt/khách đến và lối mở toàn bộ queue', () => {
    const html = renderToStaticMarkup(
      <ReservationQueuePanel
        reservations={[
          reservation({ reservationId: 'pending', status: 'pending' }),
          reservation({ reservationId: 'confirmed', status: 'confirmed' }),
        ]}
        now={new Date('2026-09-20T12:00:00.000Z')}
        onConfirm={() => undefined}
        onArrive={() => undefined}
      />,
    )

    expect(html).toContain('Đặt bàn cần xử lý')
    expect(html).toContain('Xác nhận &amp; chọn bàn')
    expect(html).toContain('Khách đã đến')
    expect(html).toContain('href="/admin/reservations"')
  })
})
