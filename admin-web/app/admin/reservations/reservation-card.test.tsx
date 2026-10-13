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

describe('ReservationCard (dòng bảng đặt bàn)', () => {
  it('hiện thời gian, tên, số khách, bàn, trạng thái và link gọi; ghi chú nằm trong title', () => {
    const html = renderToStaticMarkup(
      <ReservationCard reservation={overdueReservation} now={new Date('2026-09-20T12:00:00.000Z')} />,
    )

    expect(html).toContain('20/09 · 18:25')
    expect(html).toContain('Nguyễn Văn A')
    expect(html).toContain('8 khách')
    expect(html).toContain('Bàn 1, Bàn 2')
    expect(html).toContain('Quá giờ 35 phút')
    expect(html).toContain('href="tel:0900123456"')
    expect(html).toContain('title="Ít cay"')
    expect(html).not.toContain('Duyệt')
  })

  it('nút chỉ có icon, tên nằm ở title + aria-label; chờ duyệt có Duyệt và Từ chối', () => {
    const html = renderToStaticMarkup(
      <ReservationCard
        reservation={{ ...overdueReservation, status: 'pending' }}
        now={new Date('2026-09-20T12:00:00.000Z')}
        onAction={() => undefined}
      />,
    )

    expect(html).toContain('title="Duyệt &amp; chọn bàn"')
    expect(html).toContain('aria-label="Từ chối"')
    expect(html).not.toContain('Huỷ đặt bàn')
    expect(html).not.toContain('Khách đã đến')
  })

  it('lịch đã xác nhận: Khách đã đến là nút chính, đứng trước nút gọi; có Huỷ đặt bàn', () => {
    const html = renderToStaticMarkup(
      <ReservationCard reservation={overdueReservation} now={new Date('2026-09-20T12:00:00.000Z')} onAction={() => undefined} />,
    )

    expect(html).toContain('title="Khách đã đến"')
    expect(html).toContain('title="Huỷ đặt bàn"')
    expect(html.indexOf('Khách đã đến')).toBeLessThan(html.indexOf('Gọi khách'))
  })

  it('chưa có SĐT thì không có link gọi', () => {
    const html = renderToStaticMarkup(
      <ReservationCard reservation={{ ...overdueReservation, customerPhone: '' }} now={new Date('2026-09-20T12:00:00.000Z')} />,
    )
    expect(html).not.toContain('href="tel:')
    expect(html).toContain('Chưa có số điện thoại')
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

    expect(actionable).toContain('Nhắc lại sau 10 phút')
    expect(snoozed).not.toContain('Nhắc lại sau 10 phút')

    const busy = renderToStaticMarkup(
      <ReservationCard reservation={overdueReservation} now={now} snoozeBusy onSnooze={() => undefined} />,
    )
    expect(busy).toContain('disabled=""')
  })
})
