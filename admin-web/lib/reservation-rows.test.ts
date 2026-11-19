import { describe, expect, it } from 'vitest'
import { toReservationRow, type ReservationRpcRow } from './reservation-rows'

const row = (patch: Partial<ReservationRpcRow> = {}): ReservationRpcRow => ({
  reservation_id: 'r1', store_id: 's1', status: 'confirmed', customer_name: 'Tú', customer_phone: '0900000000',
  party_size: 6, arrival_at: '2026-11-19T10:00:00Z', note: null,
  requested_arrival_at: null, requested_party_size: null, change_note: null,
  created_at: '2026-11-19T03:44:00Z', updated_at: '2026-11-19T04:25:00Z',
  ...patch,
})

describe('toReservationRow — yêu cầu đổi của khách', () => {
  // DB (mig 053/065) đánh dấu "khách xin đổi" bằng requested_arrival_at, status vẫn giữ confirmed/pending.
  it('đơn đã xác nhận có yêu cầu đổi → change_requested để POS báo', () => {
    const r = toReservationRow(row({ requested_arrival_at: '2026-11-19T10:00:00Z', requested_party_size: 15 }))
    expect(r.status).toBe('change_requested')
    expect(r.requestedPartySize).toBe(15)
  })

  it('đơn chờ duyệt có yêu cầu đổi → change_requested', () => {
    const r = toReservationRow(row({ status: 'pending', requested_arrival_at: '2026-11-19T10:00:00Z', requested_party_size: 8 }))
    expect(r.status).toBe('change_requested')
  })

  it('không có yêu cầu đổi → giữ nguyên status', () => {
    expect(toReservationRow(row()).status).toBe('confirmed')
    expect(toReservationRow(row({ status: 'pending' })).status).toBe('pending')
  })

  it('đơn đã kết thúc còn sót requested_* → không báo đổi', () => {
    const r = toReservationRow(row({ status: 'cancelled_by_customer', requested_arrival_at: '2026-11-19T10:00:00Z', requested_party_size: 15 }))
    expect(r.status).toBe('cancelled_by_customer')
  })
})
