import { describe, expect, it } from 'vitest'
import {
  beginReservationTablePick,
  cancelReservationTablePick,
  selectArrivedReservationSession,
  toggleReservationTable,
  type ReservationPosState,
} from './reservation-pos-state'

const initial: ReservationPosState = {
  selectedSessionId: 'session-dang-xem',
  pickedSessionIds: new Set(['session-gop-bill']),
  pickedTableIds: new Set(['ban-ghep-mam']),
  reservationPick: null,
}

describe('reservation POS state', () => {
  it('mở chọn bàn cho booking không làm mất bill hay lựa chọn ghép mâm đang có', () => {
    const next = beginReservationTablePick(initial, {
      reservationId: 'booking-1',
      tableIds: ['ban-da-giu'],
    })

    expect(next.selectedSessionId).toBe('session-dang-xem')
    expect(next.pickedSessionIds).toEqual(new Set(['session-gop-bill']))
    expect(next.pickedTableIds).toEqual(new Set(['ban-ghep-mam']))
    expect(next.reservationPick).toEqual({ reservationId: 'booking-1', tableIds: new Set(['ban-da-giu']) })
  })

  it('đổi bàn của booking chỉ sửa vùng chọn booking, không đụng lựa chọn ghép mâm', () => {
    const picking = beginReservationTablePick(initial, { reservationId: 'booking-1', tableIds: [] })
    const next = toggleReservationTable(picking, 'ban-2')

    expect(next.reservationPick).toEqual({ reservationId: 'booking-1', tableIds: new Set(['ban-2']) })
    expect(next.pickedTableIds).toEqual(new Set(['ban-ghep-mam']))
  })

  it('hủy chọn bàn trả POS về đúng ngữ cảnh bill trước đó', () => {
    const picking = beginReservationTablePick(initial, { reservationId: 'booking-1', tableIds: ['ban-1'] })

    expect(cancelReservationTablePick(picking)).toEqual(initial)
  })

  it('sau khi khách đến, chọn đúng phiên server trả về sau lần tải lại', () => {
    const picking = beginReservationTablePick(initial, { reservationId: 'booking-1', tableIds: ['ban-1'] })

    expect(selectArrivedReservationSession(picking, 'session-mam-moi')).toEqual({
      selectedSessionId: 'session-mam-moi',
      pickedSessionIds: new Set(),
      pickedTableIds: new Set(),
      reservationPick: null,
    })
  })
})
