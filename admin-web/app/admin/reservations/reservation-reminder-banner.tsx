'use client'

import { AlarmClock } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getButtonClasses } from '@/components/ui/button-classes'

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
    <section className="mb-3 flex flex-col gap-3 rounded-xl border border-warning-border bg-warning-bg p-4 md:flex-row md:items-center" aria-label="Nhắc đặt bàn đến giờ">
      <p className="flex min-w-0 flex-1 items-start gap-2 text-sm font-medium text-warning">
        <AlarmClock className="mt-0.5 size-5 shrink-0" aria-hidden />
        <span>{reservationIds.length} đặt bàn đã tới giờ — kiểm tra khách đã đến chưa</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/reservations" className={getButtonClasses('outline')}>Xem</Link>
        <Button disabled={busy} onClick={() => onSnooze(10)}>Nhắc lại sau 10 phút</Button>
        <Button disabled={busy} onClick={() => onSnooze(15)}>15 phút</Button>
        <Button disabled={busy} onClick={() => onSnooze(30)}>30 phút</Button>
      </div>
    </section>
  )
}
