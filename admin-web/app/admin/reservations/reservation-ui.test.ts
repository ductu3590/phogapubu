import { describe, expect, it } from 'vitest'
import type { ReservationRow } from '@/lib/actions/reservations'
import {
  activeReservationRows,
  formatReservationArrival,
  formatReservationDateTime,
  phoneHref,
  reservationChangeDecisionActions,
  reservationCardView,
  reservationUiActions,
} from './reservation-ui'

function reservation(overrides: Partial<ReservationRow> = {}): ReservationRow {
  return {
    reservationId: 'reservation-1',
    storeId: 'store-1',
    status: 'confirmed',
    customerName: 'Nguyễn Văn A',
    customerPhone: '0900000000',
    partySize: 8,
    arrivalAt: '2026-09-20T12:00:00.000Z',
    note: null,
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
    ...overrides,
  }
}

describe('reservation mobile view model', () => {
  it('định dạng giờ đến theo Asia/Ho_Chi_Minh, không theo timezone máy đang chạy', () => {
    expect(formatReservationArrival('2026-09-20T12:00:00.000Z')).toBe('19:00 · 20/09')
  })

  it('tạo link gọi điện chỉ từ dấu + và chữ số', () => {
    expect(phoneHref(' +84 (0) 900-123-456 ')).toBe('tel:+840900123456')
    expect(phoneHref('javascript:alert(1)')).toBeNull()
  })

  it('hiển thị card confirmed quá giờ với nhãn, mức cảnh báo và summary bàn đúng', () => {
    const view = reservationCardView(
      reservation({ arrivalAt: '2026-09-20T11:25:00.000Z' }),
      new Date('2026-09-20T12:00:00.000Z'),
    )

    expect(view).toMatchObject({
      statusLabel: 'Quá giờ 35 phút',
      tone: 'critical',
      arrivalLabel: '18:25 · 20/09',
      summary: '8 khách · gợi ý 2 bàn · Bàn 1, Bàn 2',
    })
  })

  it('chỉ mở đúng các action theo lifecycle, chưa làm button mutation trong Task 3', () => {
    expect(reservationUiActions(reservation({ status: 'pending' }))).toEqual(['call', 'confirm', 'reject'])
    expect(reservationUiActions(reservation({ status: 'change_requested' }))).toEqual(['call', 'resolve_change'])
    expect(reservationUiActions(reservation({ status: 'confirmed' }))).toEqual(['call', 'arrive', 'reschedule', 'no_show', 'cancel_store'])
    expect(reservationUiActions(reservation({ status: 'arrived', sessionId: 'session-1' }))).toEqual(['open_session'])
    expect(reservationUiActions(reservation({ status: 'no_show' }))).toEqual([])
  })

  it('cột Thời gian ghi ngày trước giờ, theo giờ Việt Nam', () => {
    expect(formatReservationDateTime('2026-09-20T12:00:00.000Z')).toBe('20/09 · 19:00')
  })

  it('bảng đang xử lý: việc cần làm luôn hiện, lịch đã xác nhận chỉ trong 7 ngày, lượt đã xong không hiện; xếp theo giờ', () => {
    const now = new Date('2026-09-20T12:00:00.000Z')
    const rows = [
      reservation({ reservationId: 'upcoming-8-days', arrivalAt: '2026-09-28T13:00:00.000Z' }),
      reservation({ reservationId: 'upcoming', arrivalAt: '2026-09-21T12:00:00.000Z' }),
      reservation({ reservationId: 'pending-far', status: 'pending', arrivalAt: '2026-10-05T12:00:00.000Z' }),
      reservation({ reservationId: 'overdue', arrivalAt: '2026-09-20T11:00:00.000Z' }),
      reservation({ reservationId: 'seated', status: 'arrived', sessionId: 's-1', arrivalAt: '2026-09-20T10:00:00.000Z' }),
      reservation({ reservationId: 'seated-bill-closed', status: 'arrived', sessionId: 's-2', sessionClosed: true }),
      reservation({ reservationId: 'no-show', status: 'no_show' }),
    ]

    expect(activeReservationRows(rows, now).map((row) => row.reservationId)).toEqual([
      'seated', 'overdue', 'upcoming', 'pending-far',
    ])
  })

  it('đã đến mà bill đã đóng (Bỏ bàn / hết hạn) là lượt đã xong', () => {
    const view = reservationCardView(
      reservation({ status: 'arrived', sessionId: 's-1', sessionClosed: true }),
      new Date('2026-09-20T12:00:00.000Z'),
    )
    expect(view.kind).toBe('terminal')
  })

  it('nhãn và màu trạng thái theo bảng màu chung', () => {
    const now = new Date('2026-09-20T12:00:00.000Z')
    expect(reservationCardView(reservation({ status: 'arrived', sessionId: 's-1' }), now)).toMatchObject({ statusLabel: 'Đang ngồi', badgeTone: 'success' })
    expect(reservationCardView(reservation({ status: 'pending' }), now)).toMatchObject({ statusLabel: 'Chờ duyệt', badgeTone: 'warning' })
    expect(reservationCardView(reservation({ arrivalAt: '2026-09-21T12:00:00.000Z' }), now)).toMatchObject({ statusLabel: 'Đã xác nhận', badgeTone: 'accent' })
    expect(reservationCardView(reservation({ tableNumbers: [] }), now).tablesLabel).toBe('')
  })

  it('yêu cầu đổi luôn cho chủ quán cả hai lựa chọn chấp nhận và từ chối', () => {
    expect(reservationChangeDecisionActions()).toEqual(['accept', 'reject'])
  })
})
