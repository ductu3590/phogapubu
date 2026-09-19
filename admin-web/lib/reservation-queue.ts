import type { ReservationRow, ReservationStatus } from './actions/reservations'

export type ReservationQueueKind =
  | 'pending'
  | 'change_requested'
  | 'upcoming'
  | 'overdue'
  | 'arrived'
  | 'terminal'

export type ReservationQueueState = {
  kind: ReservationQueueKind
  severity: 'normal' | 'attention' | 'critical'
  minutesOverdue: number
  reminderBucket: number | null
  reminderDue: boolean
}

const FIVE_MINUTES_MS = 5 * 60 * 1000
const CRITICAL_OVERDUE_MINUTES = 30

function terminalStatus(status: ReservationStatus) {
  return status === 'rejected'
    || status === 'cancelled_by_customer'
    || status === 'cancelled_by_store'
    || status === 'completed'
    || status === 'no_show'
}

export function reservationQueueState(
  reservation: ReservationRow,
  now: Date,
): ReservationQueueState {
  if (reservation.status === 'pending') {
    return { kind: 'pending', severity: 'normal', minutesOverdue: 0, reminderBucket: null, reminderDue: false }
  }
  if (reservation.status === 'change_requested') {
    return { kind: 'change_requested', severity: 'attention', minutesOverdue: 0, reminderBucket: null, reminderDue: false }
  }
  if (reservation.status === 'arrived') {
    return { kind: 'arrived', severity: 'normal', minutesOverdue: 0, reminderBucket: null, reminderDue: false }
  }
  if (terminalStatus(reservation.status)) {
    return { kind: 'terminal', severity: 'normal', minutesOverdue: 0, reminderBucket: null, reminderDue: false }
  }

  const elapsedMs = now.getTime() - new Date(reservation.arrivalAt).getTime()
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return { kind: 'upcoming', severity: 'normal', minutesOverdue: 0, reminderBucket: null, reminderDue: false }
  }

  const minutesOverdue = Math.floor(elapsedMs / 60_000)
  const snoozedUntil = reservation.reminderSnoozedUntil
    ? new Date(reservation.reminderSnoozedUntil).getTime()
    : null
  const reminderDue = snoozedUntil === null || !Number.isFinite(snoozedUntil) || snoozedUntil <= now.getTime()

  return {
    kind: 'overdue',
    severity: minutesOverdue >= CRITICAL_OVERDUE_MINUTES ? 'critical' : 'attention',
    minutesOverdue,
    reminderBucket: Math.floor(elapsedMs / FIVE_MINUTES_MS),
    reminderDue,
  }
}

export function dueReservationReminders(
  reservations: ReservationRow[],
  now: Date,
): ReservationRow[] {
  return sortReservationQueue(
    reservations.filter((reservation) => reservationQueueState(reservation, now).reminderDue),
    now,
  )
}

export function sortReservationQueue(
  reservations: ReservationRow[],
  now: Date,
): ReservationRow[] {
  const priority: Record<ReservationQueueKind, number> = {
    pending: 0,
    change_requested: 1,
    overdue: 2,
    upcoming: 3,
    arrived: 4,
    terminal: 5,
  }

  return [...reservations].sort((left, right) => {
    const leftState = reservationQueueState(left, now)
    const rightState = reservationQueueState(right, now)
    const priorityDifference = priority[leftState.kind] - priority[rightState.kind]
    if (priorityDifference !== 0) return priorityDifference

    const arrivalDifference = new Date(left.arrivalAt).getTime() - new Date(right.arrivalAt).getTime()
    if (arrivalDifference !== 0) return arrivalDifference
    return left.reservationId.localeCompare(right.reservationId)
  })
}
