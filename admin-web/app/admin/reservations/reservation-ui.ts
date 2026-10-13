import type { ReservationRow } from '@/lib/actions/reservations'
import { reservationQueueState, type ReservationQueueKind, type ReservationQueueState } from '@/lib/reservation-queue'
import type { StatusTone } from '@/components/ui/status'

export type ReservationUiAction =
  | 'call'
  | 'confirm'
  | 'reject'
  | 'resolve_change'
  | 'arrive'
  | 'reschedule'
  | 'no_show'
  | 'cancel_store'
  | 'open_session'

export type ReservationCardView = {
  kind: ReservationQueueKind
  statusLabel: string
  tone: ReservationQueueState['severity']
  /** Màu badge theo bảng trạng thái chung: vàng chờ duyệt · đỏ trễ · cam đã đặt · xanh lá đang phục vụ. */
  badgeTone: StatusTone
  arrivalLabel: string
  /** "13/10 · 19:00" — cột Thời gian của bảng (ngày trước, vì bảng trộn 7 ngày). */
  dateTimeLabel: string
  summary: string
  tablesLabel: string
  phoneHref: string | null
}

export function formatReservationArrival(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Không rõ giờ đến'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? ''
  return `${part('hour')}:${part('minute')} · ${part('day')}/${part('month')}`
}

function localDateParts(value: string): { year: string; month: string; day: string } | null {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value
  const year = part('year')
  const month = part('month')
  const day = part('day')
  return year && month && day ? { year, month, day } : null
}

export function formatReservationDateTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Không rõ giờ đến'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? ''
  return `${part('day')}/${part('month')} · ${part('hour')}:${part('minute')}`
}

export function reservationLocalDate(value: string): string | null {
  const parts = localDateParts(value)
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : null
}

export function phoneHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return null
  return `tel:${phone.trim().startsWith('+') ? '+' : ''}${digits}`
}

export function reservationUiActions(reservation: ReservationRow): ReservationUiAction[] {
  switch (reservation.status) {
    case 'pending': return ['call', 'confirm', 'reject']
    case 'change_requested': return ['call', 'resolve_change']
    case 'confirmed': return ['call', 'arrive', 'reschedule', 'no_show', 'cancel_store']
    case 'arrived': return reservation.sessionId ? ['open_session'] : []
    default: return []
  }
}

export function reservationChangeDecisionActions(): Array<'accept' | 'reject'> {
  return ['accept', 'reject']
}

function statusLabel(reservation: ReservationRow, state: ReservationQueueState): string {
  switch (state.kind) {
    case 'pending': return 'Chờ duyệt'
    case 'change_requested': return 'Khách xin đổi'
    case 'upcoming': return 'Đã xác nhận'
    case 'overdue': return `Quá giờ ${state.minutesOverdue} phút`
    case 'arrived': return 'Đang ngồi'
    case 'terminal': {
      switch (reservation.status) {
        case 'rejected': return 'Đã từ chối'
        case 'cancelled_by_customer': return 'Khách đã hủy'
        case 'cancelled_by_store': return 'Quán đã hủy'
        case 'completed': return 'Đã hoàn tất'
        case 'no_show': return 'Không đến'
        default: return 'Đã xử lý'
      }
    }
  }
}

const BADGE_TONE: Record<ReservationQueueKind, StatusTone> = {
  pending: 'warning',
  change_requested: 'warning',
  overdue: 'critical',
  upcoming: 'accent',
  arrived: 'success',
  terminal: 'neutral',
}

export function reservationCardView(reservation: ReservationRow, now: Date): ReservationCardView {
  const state = reservationQueueState(reservation, now)
  const tables = reservation.tableNumbers.length ? reservation.tableNumbers.join(', ') : 'Chưa phân bàn'
  return {
    kind: state.kind,
    statusLabel: statusLabel(reservation, state),
    tone: state.severity,
    badgeTone: BADGE_TONE[state.kind],
    arrivalLabel: formatReservationArrival(reservation.arrivalAt),
    dateTimeLabel: formatReservationDateTime(reservation.arrivalAt),
    summary: `${reservation.partySize} khách · gợi ý ${reservation.suggestedTableCount} bàn · ${tables}`,
    tablesLabel: reservation.tableNumbers.length ? reservation.tableNumbers.join(', ') : '',
    phoneHref: phoneHref(reservation.customerPhone),
  }
}

export const ACTIVE_WINDOW_DAYS = 7

/**
 * Bảng "đang xử lý" (2026-10-13, phương án B): MỘT bảng phẳng xếp theo giờ đến.
 * - Việc cần làm (chờ duyệt, khách xin đổi, quá giờ, khách đang ngồi) luôn hiện, dù ngày nào.
 * - Lịch đã xác nhận chỉ hiện trong 7 ngày tới.
 * - Lượt đã xong (kể cả đã đến + bill đã đóng) KHÔNG hiện — sang cột "Đã qua".
 */
export function activeReservationRows(reservations: ReservationRow[], now: Date): ReservationRow[] {
  const until = now.getTime() + ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  return reservations
    .filter((reservation) => {
      const kind = reservationQueueState(reservation, now).kind
      if (kind === 'terminal') return false
      if (kind === 'upcoming') return new Date(reservation.arrivalAt).getTime() <= until
      return true
    })
    .sort((left, right) =>
      new Date(left.arrivalAt).getTime() - new Date(right.arrivalAt).getTime()
      || left.createdAt.localeCompare(right.createdAt))
}
