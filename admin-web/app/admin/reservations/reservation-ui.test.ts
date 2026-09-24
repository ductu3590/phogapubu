import { describe, expect, it } from 'vitest'
import type { ReservationRow } from '@/lib/actions/reservations'
import {
  filterReservationsForDate,
  formatReservationArrival,
  groupReservationsForDisplay,
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

  it('lọc ngày chỉ áp dụng lịch sử và booking sắp tới, không làm mất việc chưa xử lý', () => {
    const now = new Date('2026-09-20T12:00:00.000Z')
    const rows = [
      reservation({ reservationId: 'pending', status: 'pending', arrivalAt: '2026-09-22T12:00:00.000Z' }),
      reservation({ reservationId: 'overdue', arrivalAt: '2026-09-20T11:00:00.000Z' }),
      reservation({ reservationId: 'upcoming-other-day', arrivalAt: '2026-09-22T12:00:00.000Z' }),
      reservation({ reservationId: 'terminal-other-day', status: 'no_show', arrivalAt: '2026-09-22T12:00:00.000Z' }),
      reservation({ reservationId: 'terminal-selected-day', status: 'completed', arrivalAt: '2026-09-20T12:00:00.000Z' }),
    ]

    expect(filterReservationsForDate(rows, '2026-09-20', now).map((row) => row.reservationId)).toEqual([
      'pending', 'overdue', 'terminal-selected-day',
    ])
  })

  it('gom hàng đợi theo thứ tự việc cần xử lý trước, rồi tới lịch đã xác nhận và lịch sử', () => {
    const now = new Date('2026-09-20T12:00:00.000Z')
    const groups = groupReservationsForDisplay([
      reservation({ reservationId: 'arrived', status: 'arrived' }),
      reservation({ reservationId: 'terminal', status: 'no_show' }),
      reservation({ reservationId: 'upcoming', arrivalAt: '2026-09-20T13:00:00.000Z' }),
      reservation({ reservationId: 'pending', status: 'pending' }),
      reservation({ reservationId: 'overdue', arrivalAt: '2026-09-20T11:55:00.000Z' }),
      reservation({ reservationId: 'change', status: 'change_requested' }),
    ], now)

    expect(groups.map((group) => [group.title, group.reservations.map((row) => row.reservationId)])).toEqual([
      ['Chờ duyệt', ['pending']],
      ['Khách yêu cầu đổi', ['change']],
      ['Quá giờ chưa đến', ['overdue']],
      ['Sắp đến', ['upcoming']],
      ['Đã đến', ['arrived']],
      ['Lịch sử gần đây', ['terminal']],
    ])
  })

  it('yêu cầu đổi luôn cho chủ quán cả hai lựa chọn chấp nhận và từ chối', () => {
    expect(reservationChangeDecisionActions()).toEqual(['accept', 'reject'])
  })
})
