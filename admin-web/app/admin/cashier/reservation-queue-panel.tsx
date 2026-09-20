'use client'

import type { ReservationRow } from '@/lib/actions/reservations'
import { reservationQueueState, sortReservationQueue } from '@/lib/reservation-queue'
import { formatReservationArrival } from '@/app/admin/reservations/reservation-ui'
import ReservationReminderBanner from '../reservations/reservation-reminder-banner'

const ATTENTION_WINDOW_MS = 3 * 60 * 60 * 1000

export function posReservationAttention(reservations: ReservationRow[], now: Date): ReservationRow[] {
  return sortReservationQueue(reservations.filter((reservation) => {
    if (reservation.status === 'pending') return true
    if (reservation.status !== 'confirmed') return false
    const state = reservationQueueState(reservation, now)
    if (state.kind === 'overdue') return true
    return state.kind === 'upcoming' && new Date(reservation.arrivalAt).getTime() - now.getTime() <= ATTENTION_WINDOW_MS
  }), now)
}

export default function ReservationQueuePanel({
  reservations,
  now,
  onConfirm,
  onArrive,
  reminderIds = [],
  reminderBusy = false,
  onSnooze,
}: {
  reservations: ReservationRow[]
  now: Date
  onConfirm: (reservation: ReservationRow) => void
  onArrive: (reservation: ReservationRow) => void
  reminderIds?: string[]
  reminderBusy?: boolean
  onSnooze?: (minutes: 10 | 15 | 30) => void
}) {
  const attention = posReservationAttention(reservations, now)
  if (attention.length === 0 && reminderIds.length === 0) return null

  return (
    <section className="border-b border-sky-200 bg-sky-50 px-5 py-3" aria-label="Đặt bàn cần xử lý">
      <ReservationReminderBanner
        reservationIds={reminderIds}
        busy={reminderBusy}
        onSnooze={(minutes) => onSnooze?.(minutes)}
      />
      {attention.length > 0 && <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-sky-950">📅 Đặt bàn cần xử lý ({attention.length})</h2>
        <a href="/admin/reservations" className="text-xs font-semibold text-sky-800 underline">Mở mọi đặt bàn</a>
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {attention.map((reservation) => {
          const state = reservationQueueState(reservation, now)
          const overdue = state.kind === 'overdue'
          return (
            <article key={reservation.reservationId} className={`min-w-60 rounded-lg border p-2 ${overdue ? 'border-red-300 bg-red-50' : 'border-sky-200 bg-white'}`}>
              <p className="truncate text-xs font-bold text-gray-900">{reservation.customerName} · {reservation.partySize} khách</p>
              <p className={`mt-0.5 text-[11px] ${overdue ? 'text-red-700' : 'text-gray-600'}`}>
                {formatReservationArrival(reservation.arrivalAt)}
                {overdue && ` · Quá giờ ${state.minutesOverdue} phút`}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-gray-500">
                {reservation.tableNumbers.length ? reservation.tableNumbers.join(', ') : 'Chưa phân bàn'}
              </p>
              {reservation.status === 'pending' ? (
                <button type="button" onClick={() => onConfirm(reservation)} className="mt-2 min-h-9 w-full rounded-md bg-sky-700 px-2 text-xs font-bold text-white hover:bg-sky-800">
                  Xác nhận &amp; chọn bàn
                </button>
              ) : (
                <button type="button" onClick={() => onArrive(reservation)} className="mt-2 min-h-9 w-full rounded-md bg-green-700 px-2 text-xs font-bold text-white hover:bg-green-800">
                  Khách đã đến
                </button>
              )}
            </article>
          )
        })}
      </div>
      </>}
    </section>
  )
}
