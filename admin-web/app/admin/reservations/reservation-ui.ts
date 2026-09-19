import type { ReservationRow } from '@/lib/actions/reservations'
import { reservationQueueState, type ReservationQueueState } from '@/lib/reservation-queue'

export type ReservationUiAction =
  | 'call'
  | 'confirm'
  | 'reject'
  | 'resolve_change'
  | 'arrive'
  | 'reschedule'
  | 'no_show'
  | 'open_session'

export type ReservationCardView = {
  statusLabel: string
  tone: ReservationQueueState['severity']
  arrivalLabel: string
  summary: string
  phoneHref: string | null
}

export type ReservationDisplayGroup = {
  title: string
  reservations: ReservationRow[]
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
    case 'confirmed': return ['call', 'arrive', 'reschedule', 'no_show']
    case 'arrived': return reservation.sessionId ? ['open_session'] : []
    default: return []
  }
}

function statusLabel(reservation: ReservationRow, state: ReservationQueueState): string {
  switch (state.kind) {
    case 'pending': return 'Chờ duyệt'
    case 'change_requested': return 'Khách yêu cầu đổi'
    case 'upcoming': return 'Đã xác nhận'
    case 'overdue': return `Quá giờ ${state.minutesOverdue} phút`
    case 'arrived': return 'Khách đã đến'
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

export function reservationCardView(reservation: ReservationRow, now: Date): ReservationCardView {
  const state = reservationQueueState(reservation, now)
  const tables = reservation.tableNumbers.length ? reservation.tableNumbers.join(', ') : 'Chưa phân bàn'
  return {
    statusLabel: statusLabel(reservation, state),
    tone: state.severity,
    arrivalLabel: formatReservationArrival(reservation.arrivalAt),
    summary: `${reservation.partySize} khách · gợi ý ${reservation.suggestedTableCount} bàn · ${tables}`,
    phoneHref: phoneHref(reservation.customerPhone),
  }
}

export function filterReservationsForDate(
  reservations: ReservationRow[],
  selectedDate: string,
  now: Date,
): ReservationRow[] {
  if (!selectedDate) return reservations
  return reservations.filter((reservation) => {
    const kind = reservationQueueState(reservation, now).kind
    if (kind === 'pending' || kind === 'change_requested' || kind === 'overdue' || kind === 'arrived') {
      return true
    }
    return reservationLocalDate(reservation.arrivalAt) === selectedDate
  })
}

export function groupReservationsForDisplay(
  reservations: ReservationRow[],
  now: Date,
): ReservationDisplayGroup[] {
  const groups: Array<ReservationDisplayGroup & { kind: ReservationQueueState['kind'] }> = [
    { kind: 'pending', title: 'Chờ duyệt', reservations: [] },
    { kind: 'change_requested', title: 'Khách yêu cầu đổi', reservations: [] },
    { kind: 'overdue', title: 'Quá giờ chưa đến', reservations: [] },
    { kind: 'upcoming', title: 'Sắp đến', reservations: [] },
    { kind: 'arrived', title: 'Đã đến', reservations: [] },
    { kind: 'terminal', title: 'Lịch sử gần đây', reservations: [] },
  ]

  for (const reservation of reservations) {
    const group = groups.find((item) => item.kind === reservationQueueState(reservation, now).kind)
    group?.reservations.push(reservation)
  }

  return groups
    .filter((group) => group.reservations.length > 0)
    .map(({ title, reservations: rows }) => ({ title, reservations: rows }))
}
