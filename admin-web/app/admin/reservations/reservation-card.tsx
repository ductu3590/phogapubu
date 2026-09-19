import type { ReservationRow } from '@/lib/actions/reservations'
import { reservationCardView } from './reservation-ui'

const toneClasses = {
  normal: 'border-gray-200 bg-white',
  attention: 'border-amber-300 bg-amber-50/60',
  critical: 'border-red-300 bg-red-50/70',
}

const badgeClasses = {
  normal: 'bg-gray-100 text-gray-700',
  attention: 'bg-amber-100 text-amber-900',
  critical: 'bg-red-100 text-red-800',
}

export default function ReservationCard({
  reservation,
  now,
}: {
  reservation: ReservationRow
  now: Date
}) {
  const view = reservationCardView(reservation, now)

  return (
    <article className={`rounded-xl border p-4 shadow-sm ${toneClasses[view.tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-gray-900">{reservation.customerName}</h3>
          <p className="mt-1 text-sm font-medium text-gray-700">🕒 {view.arrivalLabel}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${badgeClasses[view.tone]}`}>
          {view.statusLabel}
        </span>
      </div>

      <p className="mt-3 text-sm text-gray-700">👥 {view.summary}</p>
      {reservation.note && (
        <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-sm text-gray-600">Ghi chú: {reservation.note}</p>
      )}
      {reservation.changeNote && (
        <p className="mt-2 rounded-lg bg-amber-100/80 px-3 py-2 text-sm text-amber-900">
          Khách nhắn đổi: {reservation.changeNote}
        </p>
      )}

      {view.phoneHref && (
        <a
          href={view.phoneHref}
          className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-bold text-gray-800 transition-colors hover:bg-gray-50"
        >
          📞 Gọi khách · {reservation.customerPhone}
        </a>
      )}
    </article>
  )
}
