import { describe, expect, it } from 'vitest'
import { laterReservationConfirmText, moveTargets, type ReservationLike } from './table-move'

const MIN = 60_000
// 2026-11-02 12:00 giờ VN (05:00 UTC)
const NOW = Date.UTC(2026, 10, 2, 5, 0, 0)
const iso = (t: number) => new Date(t).toISOString()

const tables = [
  { id: 't1', table_number: 'Bàn 1', area_id: null },
  { id: 't2', table_number: 'Bàn 2', area_id: 'a1' },
]
const res = (over: Partial<ReservationLike>): ReservationLike => ({
  status: 'confirmed',
  sessionId: null,
  arrivalAt: iso(NOW + 30 * MIN),
  planningHoldMinutes: 120,
  tableIds: ['t1'],
  ...over,
})

describe('moveTargets', () => {
  it('lists every free table with no reservation as plain target', () => {
    expect(moveTargets(tables, [], NOW)).toEqual([
      { id: 't1', table_number: 'Bàn 1', area_id: null, laterReservationAt: null },
      { id: 't2', table_number: 'Bàn 2', area_id: 'a1', laterReservationAt: null },
    ])
  })

  it('excludes tables inside hold window', () => {
    const out = moveTargets(tables, [res({ arrivalAt: iso(NOW + 30 * MIN) })], NOW)
    expect(out.map((t) => t.id)).toEqual(['t2'])
  })

  it('excludes tables whose reservation is overdue but still inside planning hold', () => {
    const out = moveTargets(tables, [res({ arrivalAt: iso(NOW - 30 * MIN) })], NOW)
    expect(out.map((t) => t.id)).toEqual(['t2'])
  })

  it('keeps a table once the planning hold has ended', () => {
    const out = moveTargets(tables, [res({ arrivalAt: iso(NOW - 121 * MIN) })], NOW)
    expect(out.map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('flags later reservation same day', () => {
    const arrival = iso(NOW + 3 * 60 * MIN)
    const out = moveTargets(tables, [res({ arrivalAt: arrival })], NOW)
    expect(out.find((t) => t.id === 't1')?.laterReservationAt).toBe(arrival)
  })

  it('picks the earliest later reservation', () => {
    const early = iso(NOW + 3 * 60 * MIN)
    const late = iso(NOW + 5 * 60 * MIN)
    const out = moveTargets(tables, [res({ arrivalAt: late }), res({ arrivalAt: early })], NOW)
    expect(out.find((t) => t.id === 't1')?.laterReservationAt).toBe(early)
  })

  it('ignores tomorrow reservation', () => {
    // ngày mai 19:00 giờ VN = 12:00 UTC
    const out = moveTargets(tables, [res({ arrivalAt: iso(Date.UTC(2026, 10, 3, 12, 0, 0)) })], NOW)
    expect(out.find((t) => t.id === 't1')?.laterReservationAt).toBeNull()
  })

  it('ignores arrived reservation', () => {
    const out = moveTargets(tables, [res({ sessionId: 's1' })], NOW)
    expect(out.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(out[0].laterReservationAt).toBeNull()
  })

  it('ignores reservations that are not confirmed', () => {
    const out = moveTargets(tables, [res({ status: 'pending', arrivalAt: iso(NOW + 3 * 60 * MIN) })], NOW)
    expect(out.find((t) => t.id === 't1')?.laterReservationAt).toBeNull()
  })
})

describe('laterReservationConfirmText', () => {
  it('nêu giờ hẹn và mốc 60 phút trước đó khách không tự gọi món được', () => {
    // 21:00 giờ VN = 14:00 UTC
    const text = laterReservationConfirmText('Bàn 16', iso(Date.UTC(2026, 10, 2, 14, 0, 0)))
    expect(text).toBe('Bàn 16 có khách đặt lúc 21:00. Từ 20:00 khách không tự gọi món qua QR được. Vẫn chuyển?')
  })
})
