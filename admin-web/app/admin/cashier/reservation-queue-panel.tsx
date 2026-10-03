'use client'

import { CalendarDays } from 'lucide-react'
import Link from 'next/link'
import type { ReservationRow } from '@/lib/actions/reservations'
import { reservationQueueState, sortReservationQueue } from '@/lib/reservation-queue'
import { formatReservationArrival } from '@/app/admin/reservations/reservation-ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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
    <section className="border-b border-border bg-surface px-4 py-3 md:px-5" aria-label="Đặt bàn cần xử lý">
      <ReservationReminderBanner
        reservationIds={reminderIds}
        busy={reminderBusy}
        onSnooze={(minutes) => onSnooze?.(minutes)}
      />
      {attention.length > 0 && <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarDays className="size-4 text-info" aria-hidden />
          Đặt bàn cần xử lý <span className="font-normal text-muted tabular">({attention.length})</span>
        </h2>
        <Link href="/admin/reservations" className="text-[13px] font-medium text-foreground underline-offset-4 hover:underline">Mở mọi đặt bàn</Link>
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {attention.map((reservation) => {
          const state = reservationQueueState(reservation, now)
          const overdue = state.kind === 'overdue'
          return (
            <article key={reservation.reservationId} className={cn('flex w-64 shrink-0 flex-col rounded-xl border p-3', overdue ? 'border-critical-border bg-critical-bg' : 'border-border bg-surface')}>
              <p className="truncate text-sm font-semibold text-foreground">{reservation.customerName} · {reservation.partySize} khách</p>
              <p className="mt-0.5 text-[13px] text-muted">{formatReservationArrival(reservation.arrivalAt)}</p>
              <p className="mt-0.5 truncate text-[13px] text-muted">
                {reservation.tableNumbers.length ? reservation.tableNumbers.join(', ') : 'Chưa phân bàn'}
              </p>
              {overdue && <Badge tone="critical" className="mt-1.5 self-start">Quá giờ {state.minutesOverdue} phút</Badge>}
              {reservation.status === 'pending' ? (
                <Button variant="primary" onClick={() => onConfirm(reservation)} className="mt-3 w-full">
                  Xác nhận &amp; chọn bàn
                </Button>
              ) : (
                <Button onClick={() => onArrive(reservation)} className="mt-3 w-full">
                  Khách đã đến
                </Button>
              )}
            </article>
          )
        })}
      </div>
      </>}
    </section>
  )
}
