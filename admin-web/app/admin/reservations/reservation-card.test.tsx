import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ReservationRow } from '@/lib/actions/reservations'
import ReservationCard from './reservation-card'

const overdueReservation: ReservationRow = {
  reservationId: 'reservation-1',
  storeId: 'store-1',
  status: 'confirmed',
  customerName: 'Nguyễn Văn A',
  customerPhone: '0900 123 456',
  partySize: 8,
  arrivalAt: '2026-09-20T11:25:00.000Z',
  note: 'Ít cay',
  requestedArrivalAt: null,
  requestedPartySize: null,
  changeNote: null,
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
  tableIds: ['table-1', 'table-2'],
  tableNumbers: ['Bàn 1', 'Bàn 2'],
  suggestedTableCount: 2,
  planningHoldMinutes: 180,
  sessionId: null,
  already: false,
  reminderSnoozedUntil: null,
  reminderSnoozedBy: null,
}

describe('ReservationCard', () => {
  it('hiển thị đủ thông tin gọi khách nhưng chưa lộ button mutation của Task 4', () => {
    const html = renderToStaticMarkup(
      <ReservationCard reservation={overdueReservation} now={new Date('2026-09-20T12:00:00.000Z')} />,
    )

    expect(html).toContain('Nguyễn Văn A')
    expect(html).toContain('Quá giờ 35 phút')
    expect(html).toContain('8 khách · gợi ý 2 bàn · Bàn 1, Bàn 2')
    expect(html).toContain('href="tel:0900123456"')
    expect(html).toContain('Ít cay')
    expect(html).not.toContain('Xác nhận')
  })

  it('hiện đúng action owner theo lifecycle khi Task 4 bật thao tác', () => {
    const html = renderToStaticMarkup(
      <ReservationCard
        reservation={{ ...overdueReservation, status: 'pending' }}
        now={new Date('2026-09-20T12:00:00.000Z')}
        onAction={() => undefined}
      />,
    )

    expect(html).toContain('Xác nhận &amp; chọn bàn')
    expect(html).toContain('Từ chối')
    expect(html).not.toContain('Khách đã đến')
  })

  it('cho Snooze riêng booking quá giờ, nhưng ẩn nút khi Snooze còn hiệu lực', () => {
    const now = new Date('2026-09-20T12:00:00.000Z')
    const actionable = renderToStaticMarkup(
      <ReservationCard reservation={overdueReservation} now={now} onSnooze={() => undefined} />,
    )
    const snoozed = renderToStaticMarkup(
      <ReservationCard
        reservation={{ ...overdueReservation, reminderSnoozedUntil: '2026-09-20T12:15:00.000Z' }}
        now={now}
        onSnooze={() => undefined}
      />,
    )

    expect(actionable).toContain('Nhắc lại 10 phút')
    expect(snoozed).not.toContain('Nhắc lại 10 phút')

    const busy = renderToStaticMarkup(
      <ReservationCard reservation={overdueReservation} now={now} snoozeBusy onSnooze={() => undefined} />,
    )
    expect(busy).toContain('disabled=""')
  })
})
