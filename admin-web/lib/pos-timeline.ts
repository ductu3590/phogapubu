// Dựng dữ liệu cho Timeline POS (/admin/pos): mỗi bàn một hàng, mỗi phiên / đặt bàn một thanh.
// Hàm thuần — không đọc đồng hồ, không gọi server — để test được mọi ca trễ / xung đột.
// Màu thanh đọc cùng bảng TABLE_STATE với sơ đồ bàn (components/ui/status.ts).

import type { TableVisualState } from '@/components/ui/status'
import { tableVisualState } from '@/lib/table-status'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
// Asia/Ho_Chi_Minh cố định UTC+7, không có giờ mùa hè.
const VN_OFFSET = 7 * HOUR

/** Qua giờ hẹn bao nhiêu phút thì tô đỏ "Trễ". Anh Tú chốt 2026-10-03: quá giờ là đỏ luôn, không chờ. */
export const LATE_GRACE_MINUTES = 0
/**
 * Trước giờ hẹn ngần này mà bàn còn khách khác ngồi thì báo xung đột. Bằng đúng khung giữ bàn
 * 60 phút của server (mig 075) và màn nhân viên (lib/staff-reserved-tables.ts): nhân viên chọn
 * "Vẫn dùng bàn này" thì POS phải thấy xung đột NGAY để chủ quán đổi bàn cho khách đặt.
 */
export const CONFLICT_LEAD_MINUTES = 60
/**
 * Phiên vừa mở vẫn vẽ dài tối thiểu ngần này (≈176px trên thước 132px/giờ) để đọc được tên bàn / mâm
 * và trạng thái. Chỉ là độ dài HIỂN THỊ: thanh có thể vượt vạch "bây giờ", không có nghĩa bàn đã đặt trước.
 */
export const MIN_SESSION_DISPLAY_MINUTES = 80
/** Đặt bàn không có thời gian giữ bàn (cấu hình cũ) thì vẽ tạm 2 giờ. */
const FALLBACK_HOLD_MINUTES = 120

export type ServingPeriod = { open: string; close: string }
export type TimelineWindow = { start: number; end: number }

export type TimelineSession = {
  session_id: string
  status: string
  opened_at: string
  needs_review?: boolean
  order_count: number
  unpaid_total: number
  tables: { id: string }[]
  orders: { status: string }[]
}

export type TimelineReservation = {
  reservationId: string
  status: string
  customerName: string
  partySize: number
  arrivalAt: string
  planningHoldMinutes: number
  tableIds: string[]
  sessionId: string | null
}

export type TimelineBar = {
  key: string
  kind: 'session' | 'reservation'
  start: number
  end: number
  /** Thanh bắt đầu trước khung giờ đang xem (phiên mở từ ca trước). */
  clippedStart: boolean
  state: TableVisualState
  /** Hàng phụ khi hai thanh chồng giờ trên cùng một bàn (0 = hàng chính). */
  lane: number
  sessionId?: string
  reservationId?: string
  /** Số phút trễ so với giờ hẹn (chỉ đặt bàn). */
  lateMinutes?: number
  /** Giờ giữ bàn đã tới mà bàn còn khách khác. */
  conflict?: boolean
}

export type TimelineSummary = {
  pendingReservations: number
  lateReservations: number
  conflicts: number
  unassignedReservations: number
}

const ACTIVE_RESERVATION = new Set(['pending', 'change_requested', 'confirmed'])

function parseClock(clock: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock.trim())
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (h > 24 || mm > 59) return null
  return h * HOUR + mm * MIN
}

/** 0h ngày hôm nay theo giờ Việt Nam, tính bằng epoch ms. */
export function vnDayStart(now: number): number {
  return Math.floor((now + VN_OFFSET) / DAY) * DAY - VN_OFFSET
}

function shiftsOfDay(periods: ServingPeriod[], dayStart: number): TimelineWindow[] {
  const out: TimelineWindow[] = []
  for (const p of periods) {
    const open = parseClock(p.open)
    const close = parseClock(p.close)
    if (open === null || close === null) continue
    // Ca qua nửa đêm ("17:00"–"02:00") hoặc ca 24h ("00:00"–"00:00").
    const end = close <= open ? close + DAY : close
    out.push({ start: dayStart + open, end: dayStart + end })
  }
  return out
}

const floorHour = (t: number) => Math.floor((t + VN_OFFSET) / HOUR) * HOUR - VN_OFFSET
const ceilHour = (t: number) => Math.ceil((t + VN_OFFSET) / HOUR) * HOUR - VN_OFFSET

/**
 * Khung giờ của Timeline = ca phục vụ đang chạy (hoặc mọi ca hôm nay), luôn chứa "bây giờ"
 * kèm 30 phút trước / 4 giờ sau, làm tròn theo giờ. Quán chưa đặt giờ phục vụ → 10:00–24:00.
 */
export function timelineWindow(periods: ServingPeriod[], now: number): TimelineWindow {
  const today = vnDayStart(now)
  const yesterdayShifts = shiftsOfDay(periods, today - DAY)
  const todayShifts = shiftsOfDay(periods, today)
  // Ca đêm qua nửa đêm: 01:00 sáng vẫn thuộc ca tối hôm trước.
  const running = [...yesterdayShifts, ...todayShifts].filter((s) => s.start <= now && now < s.end)
  const chosen = running.length > 0 ? running : todayShifts
  let start = chosen.length > 0 ? Math.min(...chosen.map((s) => s.start)) : today + 10 * HOUR
  let end = chosen.length > 0 ? Math.max(...chosen.map((s) => s.end)) : today + DAY
  start = Math.min(start, now - 30 * MIN)
  // Luôn chừa ≥4 giờ sau "bây giờ": vạch đỏ đứng ở 1/4 khung nhìn (ST-1), gần cuối ca mà hết thước
  // thì không cuộn tới được, vạch bị dồn về giữa.
  end = Math.max(end, now + 4 * HOUR)
  return { start: floorHour(start), end: ceilHour(end) }
}

/**
 * Giờ đóng của ca đang chạy (hoặc ca cuối hôm nay). Quán chưa đặt giờ phục vụ → null (không giới hạn).
 * Nút "+ Đặt lúc" không được rơi sau giờ này dù thước giờ kéo dài thêm cho dễ nhìn.
 */
export function servingShiftEnd(periods: ServingPeriod[], now: number): number | null {
  const today = vnDayStart(now)
  const running = [...shiftsOfDay(periods, today - DAY), ...shiftsOfDay(periods, today)].filter((s) => s.start <= now && now < s.end)
  const chosen = running.length > 0 ? running : shiftsOfDay(periods, today).filter((s) => s.end > now)
  return chosen.length > 0 ? Math.max(...chosen.map((s) => s.end)) : null
}

/** Các mốc giờ tròn trong khung để vẽ thước. */
export function hourTicks(window: TimelineWindow): number[] {
  const ticks: number[] = []
  for (let t = ceilHour(window.start); t <= window.end; t += HOUR) ticks.push(t)
  return ticks
}

/** Vị trí (0–100%) của một mốc thời gian trên thước. */
export function percentOf(window: TimelineWindow, t: number): number {
  const span = window.end - window.start
  if (span <= 0) return 0
  return Math.min(100, Math.max(0, ((t - window.start) / span) * 100))
}

function assignLanes(bars: TimelineBar[]): TimelineBar[] {
  const sorted = [...bars].sort((a, b) => a.start - b.start || (a.kind === 'session' ? -1 : 1))
  const laneEnds: number[] = []
  return sorted.map((bar) => {
    let lane = laneEnds.findIndex((end) => end <= bar.start)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = bar.end
    return { ...bar, lane }
  })
}

export function buildTimeline(input: {
  tableIds: string[]
  sessions: TimelineSession[]
  reservations: TimelineReservation[]
  now: number
  window: TimelineWindow
}): { rows: Map<string, TimelineBar[]>; unassigned: TimelineBar[]; summary: TimelineSummary } {
  const { now, window } = input
  const raw = new Map<string, TimelineBar[]>(input.tableIds.map((id) => [id, []]))
  const occupiedBy = new Map<string, string>()
  const unassigned: TimelineBar[] = []
  const summary: TimelineSummary = { pendingReservations: 0, lateReservations: 0, conflicts: 0, unassignedReservations: 0 }

  for (const s of input.sessions) {
    if (s.status !== 'open') continue
    const opened = new Date(s.opened_at).getTime()
    const state = tableVisualState(s)
    for (const t of s.tables) {
      occupiedBy.set(t.id, s.session_id)
      raw.get(t.id)?.push({
        key: `s:${s.session_id}:${t.id}`,
        kind: 'session',
        start: Math.max(opened, window.start),
        // Phiên còn mở thì thanh kéo tới "bây giờ", nhưng không ngắn hơn MIN_SESSION_DISPLAY_MINUTES.
        end: Math.max(now, Math.max(opened, window.start) + MIN_SESSION_DISPLAY_MINUTES * MIN),
        clippedStart: opened < window.start,
        state,
        lane: 0,
        sessionId: s.session_id,
      })
    }
  }

  for (const r of input.reservations) {
    if (!ACTIVE_RESERVATION.has(r.status) || r.sessionId) continue
    const arrival = new Date(r.arrivalAt).getTime()
    const hold = r.planningHoldMinutes > 0 ? r.planningHoldMinutes : FALLBACK_HOLD_MINUTES
    const end = arrival + hold * MIN
    if (end < window.start || arrival > window.end) continue

    let state: TableVisualState = r.status === 'confirmed' ? 'booked' : 'pending'
    let lateMinutes: number | undefined
    let conflict = false
    if (r.status !== 'confirmed') summary.pendingReservations++
    if (r.status === 'confirmed') {
      const late = Math.floor((now - arrival) / MIN)
      if (late > LATE_GRACE_MINUTES && late >= 1) {
        state = 'late'
        lateMinutes = late
        summary.lateReservations++
      }
      if (now >= arrival - CONFLICT_LEAD_MINUTES * MIN && r.tableIds.some((id) => occupiedBy.has(id))) {
        state = 'late'
        conflict = true
        summary.conflicts++
      }
    }

    const bar = (tableId: string): TimelineBar => ({
      key: `r:${r.reservationId}:${tableId}`,
      kind: 'reservation',
      start: Math.max(arrival, window.start),
      end,
      clippedStart: arrival < window.start,
      state,
      lane: 0,
      reservationId: r.reservationId,
      lateMinutes,
      conflict,
    })

    const known = r.tableIds.filter((id) => raw.has(id))
    if (known.length === 0) {
      summary.unassignedReservations++
      unassigned.push(bar('none'))
      continue
    }
    for (const id of known) raw.get(id)!.push(bar(id))
  }

  const rows = new Map<string, TimelineBar[]>()
  for (const [id, bars] of raw) rows.set(id, assignLanes(bars))
  return { rows, unassigned: assignLanes(unassigned), summary }
}

/** "19:05" theo giờ Việt Nam. */
export function clock(t: number): string {
  return new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
}

/**
 * Mốc "+ Đặt lúc HH:MM" đầu tiên còn trống trên một bàn: từ bây giờ (làm tròn LÊN theo bước đặt bàn
 * của quán), sau thanh phiên đang mở, và đủ chỗ cho cả khoảng giữ bàn không đè lên đặt bàn khác.
 * Hết khung giờ đang xem mà chưa tìm được thì trả null (không vẽ nút).
 */
export function nextBookableSlot(input: {
  bars: TimelineBar[]
  now: number
  window: TimelineWindow
  slotMinutes: number
  holdMinutes: number
  /** Giờ đóng ca — không đặt bàn sau mốc này (null = không giới hạn). */
  until?: number | null
}): number | null {
  const slot = Math.max(5, input.slotMinutes) * MIN
  const hold = Math.max(15, input.holdMinutes) * MIN
  const up = (t: number) => Math.ceil(t / slot) * slot
  let t = up(input.now)
  for (const b of input.bars) if (b.kind === 'session') t = Math.max(t, up(b.end))
  const reservations = input.bars.filter((b) => b.kind === 'reservation').sort((a, b) => a.start - b.start)
  for (const r of reservations) {
    if (t + hold <= r.start || t >= r.end) continue
    t = up(r.end)
  }
  const limit = Math.min(input.window.end, input.until ?? Infinity)
  return t + slot <= limit ? t : null
}
