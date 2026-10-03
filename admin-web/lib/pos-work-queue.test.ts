import { describe, expect, it } from 'vitest'
import { buildWorkQueue, countByFilter, isReviewableOrder, orderRound, waitLabel } from './pos-work-queue'
import type { TimelineBar } from './pos-timeline'

const NOW = Date.parse('2026-10-03T12:15:00Z')
const ago = (m: number) => new Date(NOW - m * 60_000).toISOString()

const session = (orders: { id: string; status: string; created_at: string; order_source?: string }[], id = 's1') => ({
  session_id: id, status: 'open', table_number: 'Bàn 1',
  orders: orders.map((o) => ({ order_source: 'customer', ...o })),
})
const bar = (over: Partial<TimelineBar>): TimelineBar => ({ key: 'b', kind: 'reservation', start: 0, end: 0, clippedStart: false, state: 'booked', lane: 0, ...over })
const empty = { sessions: [], requests: [], reservations: [], reservationBars: new Map(), customerCalls: [], now: NOW }

describe('isReviewableOrder', () => {
  it('chỉ đơn khách/nhân viên đang chờ, bỏ ghi tay và món đặt trước', () => {
    expect(isReviewableOrder({ status: 'pending', order_source: 'customer' })).toBe(true)
    expect(isReviewableOrder({ status: 'pending', order_source: 'staff' })).toBe(true)
    expect(isReviewableOrder({ status: 'pending', order_source: 'pos' })).toBe(false)
    expect(isReviewableOrder({ status: 'pending', order_source: 'reservation_preorder' })).toBe(false)
    expect(isReviewableOrder({ status: 'confirmed', order_source: 'customer' })).toBe(false)
  })
})

describe('orderRound', () => {
  it('đánh số lượt theo giờ, tính cả lượt đã duyệt, bỏ ghi tay', () => {
    const s = session([
      { id: 'b', status: 'pending', created_at: ago(2) },
      { id: 'pos', status: 'confirmed', created_at: ago(5), order_source: 'pos' },
      { id: 'a', status: 'confirmed', created_at: ago(20) },
    ])
    expect(orderRound(s, 'a')).toBe(1)
    expect(orderRound(s, 'b')).toBe(2)
  })
})

describe('buildWorkQueue', () => {
  it('gọi nhân viên lên trước lượt món, cùng loại thì chờ lâu lên trước', () => {
    const items = buildWorkQueue({
      ...empty,
      sessions: [session([{ id: 'o1', status: 'pending', created_at: ago(1) }, { id: 'o2', status: 'pending', created_at: ago(8) }])],
      requests: [{ id: 'r1', table_id: 't1', session_id: 's1', table_number: 'Bàn 1', created_at: ago(3), last_ping_at: ago(1), ping_count: 2 }],
    })
    expect(items.map((i) => i.key)).toEqual(['call:r1', 'order:o2', 'order:o1'])
  })

  it('đặt bàn: xung đột > trễ > đến giờ > chờ duyệt > sắp đến; quá xa thì không vào', () => {
    const items = buildWorkQueue({
      ...empty,
      reservations: [
        { reservationId: 'far', status: 'confirmed', arrivalAt: new Date(NOW + 3 * 3_600_000).toISOString(), sessionId: null },
        { reservationId: 'soon', status: 'confirmed', arrivalAt: new Date(NOW + 30 * 60_000).toISOString(), sessionId: null },
        { reservationId: 'pend', status: 'pending', arrivalAt: new Date(NOW + 5 * 3_600_000).toISOString(), sessionId: null },
        { reservationId: 'due', status: 'confirmed', arrivalAt: ago(5), sessionId: null },
        { reservationId: 'late', status: 'confirmed', arrivalAt: ago(25), sessionId: null },
        { reservationId: 'clash', status: 'confirmed', arrivalAt: new Date(NOW + 10 * 60_000).toISOString(), sessionId: null },
        { reservationId: 'here', status: 'confirmed', arrivalAt: ago(40), sessionId: 's9' },
      ],
      reservationBars: new Map([
        ['late', bar({ state: 'late', lateMinutes: 25 })],
        ['clash', bar({ state: 'late', conflict: true })],
      ]),
    })
    expect(items.map((i) => i.key)).toEqual(['res:clash', 'res:late', 'res:due', 'res:pend', 'res:soon'])
    expect(items[0].tone).toBe('critical')
    expect(items.at(-1)!.tone).toBe('info')
  })

  it('đếm theo bộ lọc', () => {
    const items = buildWorkQueue({
      ...empty,
      sessions: [session([{ id: 'o1', status: 'pending', created_at: ago(1) }])],
      customerCalls: [{ taskId: 'c1', reservationId: 'x', arrivalAt: ago(-60), dueAt: ago(1) }],
    })
    expect(countByFilter(items)).toEqual({ all: 2, orders: 1, calls: 0, booking: 1 })
  })
})

describe('waitLabel', () => {
  it('ghi thời gian chờ dễ đọc', () => {
    expect(waitLabel(NOW - 20_000, NOW)).toBe('vừa xong')
    expect(waitLabel(NOW - 3 * 60_000, NOW)).toBe('3 phút')
    expect(waitLabel(NOW - 65 * 60_000, NOW)).toBe('1 giờ 5 phút')
  })
})
