import type { ReactNode } from 'react'
import { AlarmClockOff, ArrowLeftRight, Ban, CalendarClock, Check, Phone, PhoneOff, ReceiptText, UserCheck, UserX, X } from 'lucide-react'
import type { ReservationRow } from '@/lib/actions/reservations'
import { reservationQueueState } from '@/lib/reservation-queue'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { reservationCardView, reservationUiActions, type ReservationUiAction } from './reservation-ui'

// Một dòng của bảng "đang xử lý" (trang Đặt bàn, phương án B — 2026-10-13).
// Nút chỉ có icon, rê chuột hiện tên (title). Nút đầu tô đặc = việc chính của dòng; gọi khách đứng ngay sau.

/** Cột chung cho hàng tiêu đề và mọi dòng — mỗi dòng là một lưới riêng nên cột thao tác phải cố định bề rộng. */
export const RESERVATION_TABLE_COLS = '@3xl:grid-cols-[112px_minmax(0,1.6fr)_minmax(0,1fr)_150px_248px]'

const ACTION_META: Record<Exclude<ReservationUiAction, 'call'>, { label: string; icon: ReactNode }> = {
  confirm: { label: 'Duyệt & chọn bàn', icon: <Check /> },
  reject: { label: 'Từ chối', icon: <X /> },
  resolve_change: { label: 'Xử lý yêu cầu đổi', icon: <ArrowLeftRight /> },
  arrive: { label: 'Khách đã đến', icon: <UserCheck /> },
  reschedule: { label: 'Đổi lịch / bàn', icon: <CalendarClock /> },
  no_show: { label: 'Không đến', icon: <UserX /> },
  cancel_store: { label: 'Huỷ đặt bàn', icon: <Ban /> },
  open_session: { label: 'Mở bill trên POS', icon: <ReceiptText /> },
}

const ROW_TINT: Record<string, string> = {
  overdue: 'bg-critical-bg',
  pending: 'bg-warning-bg',
  change_requested: 'bg-warning-bg',
}

const iconButtonClass = (primary: boolean) => cn(
  'inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors outline-hidden',
  'focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:size-4',
  primary
    ? 'bg-primary text-primary-foreground hover:bg-primary-hover'
    : 'border border-border-strong bg-surface text-foreground hover:bg-button-hover',
)

export function ReservationTableHeader() {
  return (
    <div role="row" className={cn('hidden items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] font-medium text-muted @3xl:grid', RESERVATION_TABLE_COLS)}>
      <span role="columnheader">Thời gian</span>
      <span role="columnheader">Khách</span>
      <span role="columnheader">Bàn</span>
      <span role="columnheader">Trạng thái</span>
      <span role="columnheader" className="sr-only">Thao tác</span>
    </div>
  )
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
  const [primary, ...rest] = actions
  const note = reservation.changeNote ? `Khách nhắn đổi: ${reservation.changeNote}` : reservation.note
  const status = <Badge tone={view.badgeTone} withDot>{view.statusLabel}</Badge>

  const actionButton = (action: Exclude<ReservationUiAction, 'call'>, isPrimary: boolean) => (
    <button
      key={action}
      type="button"
      title={ACTION_META[action].label}
      aria-label={ACTION_META[action].label}
      onClick={() => onAction?.(action, reservation)}
      className={iconButtonClass(isPrimary)}
    >
      {ACTION_META[action].icon}
    </button>
  )

  return (
    <div role="row" className={cn('grid grid-cols-[minmax(0,1fr)] gap-2 border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface-hover @3xl:items-center @3xl:gap-3', RESERVATION_TABLE_COLS, ROW_TINT[view.kind])}>
      <div className="flex items-center justify-between gap-2 @3xl:block">
        <span className="text-sm font-semibold tabular">{view.dateTimeLabel}</span>
        <span className="@3xl:hidden">{status}</span>
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-foreground" title={reservation.customerName}>{reservation.customerName}</h3>
        <p className="text-[13px] text-muted">
          {reservation.partySize} khách
          {note ? <> · <span title={note} className="cursor-help underline decoration-dotted underline-offset-2">có ghi chú</span></> : null}
        </p>
      </div>
      <div className="text-sm text-foreground/80">
        {view.tablesLabel || <span className="text-muted italic">Chưa xếp bàn</span>}
      </div>
      <div className="hidden @3xl:block">{status}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {primary ? actionButton(primary, true) : null}
        {view.phoneHref ? (
          <a href={view.phoneHref} title={`Gọi khách · ${reservation.customerPhone}`} aria-label={`Gọi khách ${reservation.customerPhone}`} className={iconButtonClass(false)}>
            <Phone />
          </a>
        ) : (
          <span title="Chưa có số điện thoại" className="inline-flex size-9 shrink-0 items-center justify-center text-muted/50 [&>svg]:size-4"><PhoneOff aria-hidden /></span>
        )}
        {rest.map((action) => actionButton(action, false))}
        {onSnooze && reminderDue && (
          <button
            type="button"
            disabled={snoozeBusy}
            title="Nhắc lại sau 10 phút"
            aria-label="Nhắc lại sau 10 phút"
            onClick={() => onSnooze(reservation)}
            className={cn(iconButtonClass(false), 'border-warning-border text-warning hover:bg-warning-bg')}
          >
            <AlarmClockOff />
          </button>
        )}
      </div>
    </div>
  )
}
