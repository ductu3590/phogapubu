'use client'

import { TriangleAlert } from 'lucide-react'
import type { OpenTableSession } from '@/lib/actions/table-session'
import { formatVND } from '@/lib/utils'

/**
 * Phiên đã tự hết hạn nhưng CÒN tiền chưa thu. Bàn đã trống nên không có ô bàn / thanh Timeline nào
 * dẫn tới bill, mà POS là nơi DUY NHẤT thu tiền (quyết định 2026-11-11) — phải có lối vào ở đây.
 */
export function expiredUnpaidSessions(sessions: OpenTableSession[]): OpenTableSession[] {
  return sessions
    .filter((s) => s.status !== 'open' && s.needs_review && s.unpaid_total > 0)
    .sort((a, b) => a.opened_at.localeCompare(b.opened_at))
}

export function ExpiredSessions({
  sessions,
  selectedSessionId,
  onOpen,
}: {
  sessions: OpenTableSession[]
  selectedSessionId: string | null
  onOpen: (sessionId: string) => void
}) {
  const rows = expiredUnpaidSessions(sessions)
  if (rows.length === 0) return null
  return (
    <section aria-label="Bàn hết hạn còn tiền chưa thu" className="border-b border-red-200 bg-red-50 px-4 py-3">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-red-800">
        <TriangleAlert className="size-4" aria-hidden />
        Bàn hết hạn còn tiền chưa thu ({rows.length})
      </h3>
      <ul className="mt-2 space-y-1.5">
        {rows.map((s) => (
          <li key={s.session_id}>
            <button
              type="button"
              onClick={() => onOpen(s.session_id)}
              aria-pressed={s.session_id === selectedSessionId}
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-red-200 bg-white px-3 text-left text-sm hover:border-red-400 aria-pressed:border-red-500 aria-pressed:ring-1 aria-pressed:ring-red-500"
            >
              <span className="min-w-0 truncate font-medium text-slate-900">{s.table_number}</span>
              <span className="shrink-0 font-semibold text-red-700 tabular">{formatVND(s.unpaid_total)} · Thu tiền</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
