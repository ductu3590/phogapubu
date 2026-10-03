import { describe, expect, it } from 'vitest'
import { buildTimeline, hourTicks, nextBookableSlot, percentOf, servingShiftEnd, timelineWindow, vnDayStart, type TimelineBar, type TimelineReservation, type TimelineSession } from './pos-timeline'

// 2026-10-03 19:15 giờ Việt Nam = 12:15 UTC
const NOW = Date.parse('2026-10-03T12:15:00Z')
const at = (vnClock: string, day = '2026-10-03') => Date.parse(`${day}T${vnClock}:00+07:00`)

const session = (over: Partial<TimelineSession> = {}): TimelineSession => ({
  session_id: 's1', status: 'open', opened_at: new Date(at('18:00')).toISOString(),
  order_count: 1, unpaid_total: 100_000, tables: [{ id: 't1' }], orders: [{ status: 'confirmed' }], ...over,
})
const booking = (over: Partial<TimelineReservation> = {}): TimelineReservation => ({
  reservationId: 'r1', status: 'confirmed', customerName: 'A. Nam', partySize: 4,
  arrivalAt: new Date(at('20:00')).toISOString(), planningHoldMinutes: 120, tableIds: ['t2'], sessionId: null, ...over,
})

describe('timelineWindow', () => {
  it('lấy theo ca phục vụ hôm nay, làm tròn giờ', () => {
    const w = timelineWindow([{ open: '17:00', close: '23:30' }], NOW)
    expect(w).toEqual({ start: at('17:00'), end: at('00:00', '2026-10-04') })
  })

  it('ca qua nửa đêm: 01:00 sáng vẫn thuộc ca tối hôm trước', () => {
    const now = at('01:00', '2026-10-04')
    const w = timelineWindow([{ open: '17:00', close: '02:00' }], now)
    expect(w.start).toBe(at('17:00'))
    // ca kết thúc 02:00 nhưng thước kéo tới 05:00 để còn 4 giờ phía trước "bây giờ"
    expect(w.end).toBe(at('05:00', '2026-10-04'))
  })

  it('chưa đặt giờ phục vụ → 10:00–24:00', () => {
    expect(timelineWindow([], NOW)).toEqual({ start: at('10:00'), end: at('00:00', '2026-10-04') })
  })

  it('luôn chừa 4 giờ sau "bây giờ" để vạch đỏ đứng được ở 1/4 khung', () => {
    const late = at('21:30')
    expect(timelineWindow([{ open: '08:00', close: '23:00' }], late).end).toBeGreaterThanOrEqual(late + 4 * 3_600_000)
  })

  it('ngoài ca vẫn chứa "bây giờ" để thấy phiên đang mở', () => {
    const now = at('07:20')
    const w = timelineWindow([{ open: '10:00', close: '14:00' }], now)
    expect(w.start).toBeLessThanOrEqual(now - 30 * 60_000)
  })

  it('vnDayStart là 0h giờ Việt Nam', () => {
    expect(vnDayStart(NOW)).toBe(at('00:00'))
  })
})

describe('hourTicks / percentOf', () => {
  it('mốc giờ tròn và vị trí phần trăm', () => {
    const w = { start: at('17:00'), end: at('21:00') }
    expect(hourTicks(w)).toHaveLength(5)
    expect(percentOf(w, at('19:00'))).toBe(50)
    expect(percentOf(w, at('16:00'))).toBe(0)
  })
})

describe('buildTimeline', () => {
  const window = { start: at('17:00'), end: at('23:00') }

  it('phiên đang mở kéo từ giờ mở tới bây giờ, màu theo trạng thái bàn', () => {
    const old = session({ opened_at: new Date(at('17:30')).toISOString() })
    const { rows } = buildTimeline({ tableIds: ['t1'], sessions: [old], reservations: [], now: NOW, window })
    const [bar] = rows.get('t1')!
    expect(bar).toMatchObject({ kind: 'session', start: at('17:30'), end: NOW, state: 'serving' })
  })

  it('phiên vừa mở vẫn dài tối thiểu 80 phút để đọc được tên bàn', () => {
    const fresh = session({ opened_at: new Date(at('19:10')).toISOString() })
    const [bar] = buildTimeline({ tableIds: ['t1'], sessions: [fresh], reservations: [], now: NOW, window }).rows.get('t1')!
    expect(bar.end - bar.start).toBe(80 * 60_000)
  })

  it('phiên có đơn chờ duyệt → vàng; mâm thì mỗi bàn một thanh', () => {
    const tray = session({ tables: [{ id: 't1' }, { id: 't2' }], orders: [{ status: 'pending' }] })
    const { rows } = buildTimeline({ tableIds: ['t1', 't2'], sessions: [tray], reservations: [], now: NOW, window })
    expect(rows.get('t1')![0].state).toBe('pending')
    expect(rows.get('t2')![0].state).toBe('pending')
  })

  it('phiên mở từ ca trước bị cắt ở đầu khung', () => {
    const old = session({ opened_at: new Date(at('12:00')).toISOString(), needs_review: true })
    const [bar] = buildTimeline({ tableIds: ['t1'], sessions: [old], reservations: [], now: NOW, window }).rows.get('t1')!
    expect(bar.start).toBe(window.start)
    expect(bar.clippedStart).toBe(true)
    expect(bar.state).toBe('late')
  })

  it('đặt bàn đã xác nhận → xanh dương, dài bằng thời gian giữ bàn', () => {
    const [bar] = buildTimeline({ tableIds: ['t2'], sessions: [], reservations: [booking()], now: NOW, window }).rows.get('t2')!
    expect(bar).toMatchObject({ kind: 'reservation', state: 'booked', start: at('20:00'), end: at('22:00') })
  })

  it('quá giờ hẹn chưa đến → Trễ (đỏ) ngay', () => {
    const r = booking({ arrivalAt: new Date(at('18:50')).toISOString() })
    const out = buildTimeline({ tableIds: ['t2'], sessions: [], reservations: [r], now: NOW, window })
    expect(out.rows.get('t2')![0]).toMatchObject({ state: 'late', lateMinutes: 25 })
    expect(out.summary.lateReservations).toBe(1)
  })

  it('quá giờ hẹn 10 phút cũng đã là trễ; chưa tới giờ thì xanh dương', () => {
    const late = booking({ arrivalAt: new Date(at('19:05')).toISOString() })
    expect(buildTimeline({ tableIds: ['t2'], sessions: [], reservations: [late], now: NOW, window }).rows.get('t2')![0]).toMatchObject({ state: 'late', lateMinutes: 10 })
    const soon = booking({ arrivalAt: new Date(at('19:15')).toISOString() })
    expect(buildTimeline({ tableIds: ['t2'], sessions: [], reservations: [soon], now: NOW, window }).rows.get('t2')![0].state).toBe('booked')
  })

  it('sắp tới giờ giữ bàn mà bàn còn khách khác → xung đột, hai thanh tách hàng', () => {
    const r = booking({ arrivalAt: new Date(at('19:10')).toISOString(), tableIds: ['t1'] })
    const out = buildTimeline({ tableIds: ['t1'], sessions: [session()], reservations: [r], now: NOW, window })
    const bars = out.rows.get('t1')!
    const res = bars.find((b) => b.kind === 'reservation')!
    expect(res).toMatchObject({ state: 'late', conflict: true })
    expect(new Set(bars.map((b) => b.lane)).size).toBe(2)
    expect(out.summary.conflicts).toBe(1)
  })

  it('còn xa giờ hẹn thì chưa báo xung đột', () => {
    const r = booking({ arrivalAt: new Date(at('21:00')).toISOString(), tableIds: ['t1'] })
    const res = buildTimeline({ tableIds: ['t1'], sessions: [session()], reservations: [r], now: NOW, window })
      .rows.get('t1')!.find((b) => b.kind === 'reservation')!
    expect(res.conflict).toBe(false)
    expect(res.lane).toBe(0)
  })

  it('đặt bàn chờ duyệt chưa có bàn → hàng "Chưa xếp bàn"', () => {
    const r = booking({ status: 'pending', tableIds: [] })
    const out = buildTimeline({ tableIds: ['t1'], sessions: [], reservations: [r], now: NOW, window })
    expect(out.unassigned).toHaveLength(1)
    expect(out.unassigned[0].state).toBe('pending')
    expect(out.summary).toMatchObject({ pendingReservations: 1, unassignedReservations: 1 })
  })

  it('bỏ qua đặt bàn đã đến / đã huỷ / ngoài khung giờ', () => {
    const list = [
      booking({ reservationId: 'a', sessionId: 's9' }),
      booking({ reservationId: 'b', status: 'cancelled_by_customer' }),
      booking({ reservationId: 'c', arrivalAt: new Date(at('20:00', '2026-10-05')).toISOString() }),
    ]
    expect(buildTimeline({ tableIds: ['t2'], sessions: [], reservations: list, now: NOW, window }).rows.get('t2')).toEqual([])
  })
})

describe('nextBookableSlot', () => {
  const window = { start: at('17:00'), end: at('23:00') }
  const bar = (kind: 'session' | 'reservation', start: string, end: string): TimelineBar =>
    ({ key: start, kind, start: at(start), end: at(end), clippedStart: false, state: 'booked', lane: 0 })

  it('bàn trống: mốc tiếp theo theo bước đặt bàn của quán (30 phút), không cộng thêm giờ lạ', () => {
    expect(nextBookableSlot({ bars: [], now: NOW, window, slotMinutes: 30, holdMinutes: 120 })).toBe(at('19:30'))
    expect(nextBookableSlot({ bars: [], now: at('19:00'), window, slotMinutes: 30, holdMinutes: 120 })).toBe(at('19:00'))
  })

  it('bàn đang có khách: sau thanh phiên', () => {
    expect(nextBookableSlot({ bars: [bar('session', '18:00', '19:40')], now: NOW, window, slotMinutes: 30, holdMinutes: 120 })).toBe(at('20:00'))
  })

  it('không đè lên đặt bàn khác trong khoảng giữ bàn 2 giờ', () => {
    // 19:30 + 2h = 21:30 đè đặt bàn 20:30–22:30 → nhảy sau 22:30, không còn đủ chỗ trước 23:00
    expect(nextBookableSlot({ bars: [bar('reservation', '20:30', '22:30')], now: NOW, window, slotMinutes: 30, holdMinutes: 120 })).toBe(at('22:30'))
    expect(nextBookableSlot({ bars: [bar('reservation', '22:00', '23:00')], now: NOW, window, slotMinutes: 30, holdMinutes: 120 })).toBe(at('19:30'))
  })

  it('hết khung giờ thì không có nút', () => {
    expect(nextBookableSlot({ bars: [bar('session', '18:00', '22:50')], now: NOW, window, slotMinutes: 30, holdMinutes: 120 })).toBeNull()
  })
})

describe('servingShiftEnd + giới hạn nút đặt bàn', () => {
  it('giờ đóng ca đang chạy; chưa đặt giờ phục vụ thì không giới hạn', () => {
    expect(servingShiftEnd([{ open: '08:00', close: '23:00' }], NOW)).toBe(at('23:00'))
    expect(servingShiftEnd([], NOW)).toBeNull()
  })

  it('không gợi ý đặt bàn từ giờ đóng cửa trở đi', () => {
    const window = { start: at('17:00'), end: at('01:00', '2026-10-04') }
    const bars: TimelineBar[] = [{ key: 'r', kind: 'reservation', start: at('21:00'), end: at('23:00'), clippedStart: false, state: 'booked', lane: 0 }]
    expect(nextBookableSlot({ bars, now: at('20:21'), window, slotMinutes: 30, holdMinutes: 120, until: at('23:00') })).toBeNull()
  })
})
