import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ReservationReminderBanner from './reservation-reminder-banner'

describe('ReservationReminderBanner', () => {
  it('gộp booking đến hạn thành một banner với Snooze 10, 15, 30 phút', () => {
    const html = renderToStaticMarkup(
      <ReservationReminderBanner
        reservationIds={['reservation-1', 'reservation-2']}
        busy={false}
        onSnooze={() => undefined}
      />,
    )

    expect(html).toContain('2 đặt bàn đã tới giờ')
    expect(html).toContain('Nhắc lại sau 10 phút')
    expect(html).toContain('15 phút')
    expect(html).toContain('30 phút')
    expect(html).toContain('href="/admin/reservations"')
  })

  it('không render khi không còn booking nào đến hạn', () => {
    expect(renderToStaticMarkup(
      <ReservationReminderBanner reservationIds={[]} busy={false} onSnooze={() => undefined} />,
    )).toBe('')
  })
})
