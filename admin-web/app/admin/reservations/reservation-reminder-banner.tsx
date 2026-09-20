'use client'

export default function ReservationReminderBanner({
  reservationIds,
  busy,
  onSnooze,
}: {
  reservationIds: string[]
  busy: boolean
  onSnooze: (minutes: 10 | 15 | 30) => void
}) {
  if (reservationIds.length === 0) return null

  return (
    <section className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm" aria-label="Nhắc đặt bàn đến giờ">
      <p className="text-sm font-bold">⏰ {reservationIds.length} đặt bàn đã tới giờ — kiểm tra khách đã đến chưa</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href="/admin/reservations" className="min-h-10 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-amber-900">Xem</a>
        <button type="button" disabled={busy} onClick={() => onSnooze(10)} className="min-h-10 rounded-lg bg-amber-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Nhắc lại sau 10 phút</button>
        <button type="button" disabled={busy} onClick={() => onSnooze(15)} className="min-h-10 rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-bold text-amber-900 disabled:opacity-50">15 phút</button>
        <button type="button" disabled={busy} onClick={() => onSnooze(30)} className="min-h-10 rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-bold text-amber-900 disabled:opacity-50">30 phút</button>
      </div>
    </section>
  )
}
