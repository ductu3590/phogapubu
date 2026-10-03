'use client'

import { Phone } from 'lucide-react'
import type { ReservationCustomerCallTask } from '@/lib/actions/reservation-customer-calls'
import { Button } from '@/components/ui/button'
import { getButtonClasses } from '@/components/ui/button-classes'
import { phoneHref, formatReservationArrival } from './reservation-ui'

export function dueCustomerCallTasks(tasks: ReservationCustomerCallTask[], now = new Date()) {
  return tasks.filter((task) => new Date(task.dueAt).getTime() <= now.getTime())
}

export default function CustomerCallTasks({
  tasks, busy, onResolve,
}: {
  tasks: ReservationCustomerCallTask[]
  busy: boolean
  onResolve: (taskId: string, outcome: 'called' | 'unreachable') => void
}) {
  if (tasks.length === 0) return null
  return (
    <section className="mb-4 rounded-xl border border-border bg-surface p-4" aria-label="Gọi nhắc khách">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Phone className="size-4 text-info" aria-hidden />
        Gọi nhắc khách <span className="font-normal text-muted tabular">({tasks.length})</span>
      </h2>
      <p className="mt-1 text-[13px] text-muted">Đến hạn trước giờ khách đến 60 phút. Mở cuộc gọi không tự đánh dấu hoàn tất.</p>
      <ul className="mt-3 divide-y divide-border">
        {tasks.map((task) => {
          const href = phoneHref(task.customerPhone)
          return <li key={task.taskId} className="flex flex-col gap-2 py-3 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{task.customerName} · {task.partySize} khách</p>
              <p className="mt-0.5 text-[13px] text-muted">Đến {formatReservationArrival(task.arrivalAt)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {href ? (
                <a href={href} className={getButtonClasses('primary')}><Phone className="size-4" aria-hidden />Gọi nhắc khách</a>
              ) : (
                <span className="self-center text-[13px] text-error-text">Số điện thoại không hợp lệ</span>
              )}
              <Button disabled={busy} onClick={() => onResolve(task.taskId, 'called')}>Đã gọi</Button>
              <Button variant="ghost" disabled={busy} onClick={() => onResolve(task.taskId, 'unreachable')}>Chưa liên hệ được</Button>
            </div>
          </li>
        })}
      </ul>
    </section>
  )
}
