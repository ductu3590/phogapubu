import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ReservationPreorderPanel from './reservation-preorder-panel'
import type { ReservationPreorderRow } from '@/lib/actions/reservation-preorders'

const row: ReservationPreorderRow = {
  orderId: 'order-1', reservationId: 'reservation-1', customerName: 'Nguyễn Văn A', customerPhone: '0900000000',
  partySize: 6, arrivalAt: '2026-09-24T12:00:00Z', reservationStatus: 'confirmed', orderStatus: 'pending',
  revision: 2, releasedRevision: 1, needsPrint: false, needsReview: true, wasteReviewRequired: false,
  totalAmount: 240000, currentSnapshot: { revision: 2, total_amount: 240000, note: null, items: [{ name: 'Lẩu gà', quantity: 2, price: 120000 }] },
  releasedSnapshot: { revision: 1, total_amount: 120000, note: null, items: [{ name: 'Lẩu gà', quantity: 1, price: 120000 }] }, tableNumbers: [], createdAt: '2026-09-23T10:00:00Z',
}

describe('ReservationPreorderPanel', () => {
  it('nêu rõ review version và cảnh báo in sớm, không nằm trong queue booking', () => {
    const html = renderToStaticMarkup(<ReservationPreorderPanel rows={[row]} busy={false} onRelease={async () => ({ ok: true })} onPrint={async () => ({ ok: true })} onResolveWaste={async () => ({ ok: true })} />)
    expect(html).toContain('Món đặt trước cần xử lý')
    expect(html).toContain('In trước giờ đến chưa có cọc')
    expect(html).toContain('Nguyễn Văn A')
  })
})
