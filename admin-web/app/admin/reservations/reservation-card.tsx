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
    <article className={`flex flex-col gap-3 border-l-4 px-4 py-3 @3xl:flex-row @3xl:items-center @3xl:gap-4 ${toneClasses[view.tone]}`}>
      {/* Giờ đến + tên khách */}
      <div className="min-w-0 @3xl:w-56 @3xl:shrink-0">
        <h3 className="truncate text-base font-bold text-foreground">{reservation.customerName}</h3>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-foreground/80"><Clock className="size-4 shrink-0 text-muted" aria-hidden />{view.arrivalLabel}</p>
      </div>

      {/* Số khách / bàn + ghi chú */}
      <div className="min-w-0 flex-1 text-sm">
        <p className="flex items-start gap-1.5 text-foreground/80"><Users className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /><span>{view.summary}</span></p>
        {reservation.note && (
          <p className="mt-1 line-clamp-2 text-muted">Ghi chú: {reservation.note}</p>
        )}
        {reservation.changeNote && (
          <p className="mt-1 line-clamp-2 font-medium text-warning">Khách nhắn đổi: {reservation.changeNote}</p>
        )}
      </div>

      <span className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${badgeClasses[view.tone]}`}>
        {view.statusLabel}
      </span>

      {/* Nút thao tác nằm cuối dòng */}
      <div className="flex flex-wrap items-center gap-2 @3xl:shrink-0 @3xl:justify-end">
        {view.phoneHref && (
          <a
            href={view.phoneHref}
            title={`Gọi khách · ${reservation.customerPhone}`}
            aria-label={`Gọi khách ${reservation.customerPhone}`}
            className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-border-strong bg-surface text-foreground transition-colors hover:bg-item-hover"
          >
            <Phone className="size-4" aria-hidden />
          </a>
        )}
        {actions.map((action, index) => (
          <button
            key={action}
            type="button"
            onClick={() => onAction?.(action, reservation)}
            className={`min-h-10 rounded-lg px-3 text-sm font-bold ${index === 0
              ? 'bg-foreground text-white hover:bg-foreground/90'
              : 'border border-border-strong bg-surface text-foreground hover:bg-item-hover'}`}
          >
            {actionLabel[action]}
          </button>
        ))}
        {onSnooze && reminderDue && (
          <button
            type="button"
            disabled={snoozeBusy}
            onClick={() => onSnooze(reservation)}
            className="min-h-10 rounded-lg border border-warning-border bg-surface px-3 text-sm font-bold text-warning hover:bg-warning-bg disabled:opacity-50"
          >
            Nhắc lại 10 phút
          </button>
        )}
      </div>
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
