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

/** Số bàn + tổng tiền chưa thu của phiên hết hạn — cùng bộ chọn expiredUnpaidSessions. null = không có. */
export function expiredDebtSummary(sessions: OpenTableSession[]): { count: number; total: number } | null {
  const rows = expiredUnpaidSessions(sessions)
  if (rows.length === 0) return null
  return { count: rows.length, total: rows.reduce((n, s) => n + s.unpaid_total, 0) }
}

/**
 * Dải đỏ gọn trên lưới tab Sơ đồ. Ở tab này Việc cần xử lý chỉ là ngăn kéo (bố cục A) nên khối ExpiredSessions
 * không còn hiện thường trực — dải này là lối vào thu nợ. Không có phiên nào thì không vẽ, không tốn chiều cao.
 */
export function ExpiredDebtBar({ sessions, onOpen }: { sessions: OpenTableSession[]; onOpen: () => void }) {
  const summary = expiredDebtSummary(sessions)
  if (!summary) return null
  return (
    <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-4 py-1.5 md:px-5">
      <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-red-800 tabular">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        {`${summary.count} bàn hết hạn còn tiền chưa thu · ${formatVND(summary.total)}`}
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="min-h-9 shrink-0 cursor-pointer rounded-lg border border-red-300 bg-white px-3 text-[13px] font-semibold text-red-700 hover:border-red-500 hover:bg-red-100"
      >
        Xem &amp; thu
      </button>
    </div>
  )
}
