'use client'

import type { ReservationCustomerCallTask } from '@/lib/actions/reservation-customer-calls'
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
    <section className="mb-4 rounded-xl border border-violet-200 bg-violet-50 p-4" aria-label="Gọi nhắc khách">
      <h2 className="text-sm font-bold text-violet-950">☎️ Gọi nhắc khách ({tasks.length})</h2>
      <p className="mt-1 text-xs text-violet-800">Đến hạn trước giờ khách đến 60 phút. Mở cuộc gọi không tự đánh dấu hoàn tất.</p>
      <div className="mt-3 space-y-2">
        {tasks.map((task) => {
          const href = phoneHref(task.customerPhone)
          return <article key={task.taskId} className="rounded-lg border border-violet-100 bg-white p-3">
            <p className="font-bold text-gray-900">{task.customerName} · {task.partySize} khách</p>
            <p className="mt-0.5 text-xs text-gray-600">Đến {formatReservationArrival(task.arrivalAt)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {href ? <a href={href} className="min-h-9 rounded-md bg-violet-700 px-3 py-2 text-xs font-bold text-white">Gọi nhắc khách</a> : <span className="text-xs text-red-700">Số điện thoại không hợp lệ</span>}
              <button type="button" disabled={busy} onClick={() => onResolve(task.taskId, 'called')} className="min-h-9 rounded-md border border-violet-300 bg-white px-3 py-2 text-xs font-bold text-violet-900 disabled:opacity-50">Đã gọi</button>
              <button type="button" disabled={busy} onClick={() => onResolve(task.taskId, 'unreachable')} className="min-h-9 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 disabled:opacity-50">Chưa liên hệ được</button>
            </div>
          </article>
        })}
      </div>
    </section>
  )
}
