import { Clock, Phone, Users } from 'lucide-react'
import type { ReservationRow } from '@/lib/actions/reservations'
import { reservationQueueState } from '@/lib/reservation-queue'
import { reservationCardView, reservationUiActions, type ReservationUiAction } from './reservation-ui'

const toneClasses = {
  normal: 'border-border bg-surface',
  attention: 'border-warning-border bg-warning-bg',
  critical: 'border-critical-border bg-critical-bg',
}

const badgeClasses = {
  normal: 'bg-secondary text-foreground/80',
  attention: 'bg-warning-bg text-warning',
  critical: 'bg-critical-bg text-critical',
}

export default function ReservationCard({
  reservation,
  now,
  onAction,
  onSnooze,
  snoozeBusy = false,
}: {
  reservation: ReservationRow
  now: Date
  onAction?: (action: ReservationUiAction, reservation: ReservationRow) => void
  onSnooze?: (reservation: ReservationRow) => void
  snoozeBusy?: boolean
}) {
  const view = reservationCardView(reservation, now)
  const actions = onAction ? reservationUiActions(reservation).filter((action) => action !== 'call') : []
  const reminderDue = reservationQueueState(reservation, now).reminderDue

  return (
    <article className={`rounded-xl border p-4 ${toneClasses[view.tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-foreground">{reservation.customerName}</h3>
          <p className="mt-1 text-sm font-medium text-foreground/80 flex items-center gap-1.5"><Clock className="size-4 shrink-0 text-muted" aria-hidden />{view.arrivalLabel}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${badgeClasses[view.tone]}`}>
          {view.statusLabel}
        </span>
      </div>

      <p className="mt-3 text-sm text-foreground/80 flex items-start gap-1.5"><Users className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /><span>{view.summary}</span></p>
      {reservation.note && (
        <p className="mt-2 rounded-lg bg-surface/70 px-3 py-2 text-sm text-muted">Ghi chú: {reservation.note}</p>
      )}
      {reservation.changeNote && (
        <p className="mt-2 rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning">
          Khách nhắn đổi: {reservation.changeNote}
        </p>
      )}

      {view.phoneHref && (
        <a
          href={view.phoneHref}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-4 text-sm font-bold text-foreground transition-colors hover:bg-item-hover"
        >
          <Phone className="size-4" aria-hidden />Gọi khách · {reservation.customerPhone}
        </a>
      )}
      {actions.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => onAction?.(action, reservation)}
              className="min-h-11 rounded-lg bg-foreground px-3 text-sm font-bold text-white hover:bg-foreground/90"
            >
              {actionLabel[action]}
            </button>
          ))}
        </div>
      )}
      {onSnooze && reminderDue && (
        <button
          type="button"
          disabled={snoozeBusy}
          onClick={() => onSnooze(reservation)}
          className="mt-2 min-h-11 w-full rounded-lg border border-warning-border bg-surface px-3 text-sm font-bold text-warning hover:bg-warning-bg disabled:opacity-50"
        >
          Nhắc lại 10 phút
        </button>
      )}
    </article>
  )
}

const actionLabel: Record<Exclude<ReservationUiAction, 'call'>, string> = {
  confirm: 'Xác nhận & chọn bàn',
  reject: 'Từ chối',
  resolve_change: 'Xử lý yêu cầu đổi',
  arrive: 'Khách đã đến',
  reschedule: 'Đổi lịch/bàn',
  no_show: 'Không đến',
  cancel_store: 'Hủy đặt bàn',
  open_session: 'Mở bill trên POS',
}
