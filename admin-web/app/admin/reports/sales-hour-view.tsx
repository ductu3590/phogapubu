'use client'

import { EmptyState } from '@/components/ui/feedback'
import { formatVND } from '@/lib/utils'
import type { SalesHourRow } from '@/lib/reports/sales'
import { EMPTY_TEXT, formatQty, hourLabel } from './report-format'

// Tab "Theo giờ": giờ món VÀO BẾP, đã xếp theo ngày kinh doanh ở server (quán 05:00 → 18h đứng trước 04h).
// Giữ nguyên thứ tự server, không sắp lại theo đồng hồ.

/** Biểu đồ cột ngang bằng CSS: thanh rộng theo tiền / giờ đông nhất. */
export function HourBars({ rows }: { rows: SalesHourRow[] }) {
  const max = Math.max(0, ...rows.map((r) => r.amount))
  return (
    <ul className="space-y-2" aria-label="Tiền món theo giờ">
      {rows.map((r) => {
        const pct = max > 0 ? Math.round((r.amount / max) * 1000) / 10 : 0
        return (
          <li key={r.hour} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
            <span className="tabular text-muted">{hourLabel(r.hour)}</span>
            <span className="h-3 overflow-hidden rounded-full bg-secondary" aria-hidden>
              <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </span>
            <span className="min-w-24 text-right font-medium tabular text-foreground">{formatVND(r.amount)}</span>
          </li>
        )
      })}
    </ul>
  )
}

export default function SalesHourView({ rows }: { rows: SalesHourRow[] }) {
  if (rows.length === 0) return <section className="rounded-xl border border-border bg-surface"><EmptyState>{EMPTY_TEXT}</EmptyState></section>

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-surface p-4 md:p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Tiền món theo giờ vào bếp</h2>
        <HourBars rows={rows} />
      </section>

      <section className="min-w-0 rounded-xl border border-border bg-surface">
        <table className="hidden md:table w-full text-left text-sm">
          <thead className="border-b border-border bg-background text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5">Giờ</th>
              <th className="px-4 py-2.5 text-right">Lượt gọi</th>
              <th className="px-4 py-2.5 text-right">SL món</th>
              <th className="px-4 py-2.5 text-right">Tiền</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.hour}>
                <td className="px-4 py-3 font-medium tabular text-foreground">{hourLabel(r.hour)}</td>
                <td className="px-4 py-3 text-right tabular">{formatQty(r.ordersCount)}</td>
                <td className="px-4 py-3 text-right tabular">{formatQty(r.itemsQty)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular text-foreground">{formatVND(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="divide-y divide-border md:hidden">
          {rows.map((r) => (
            <li key={r.hour} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium tabular text-foreground">{hourLabel(r.hour)}</p>
                <p className="text-[13px] text-muted">{formatQty(r.ordersCount)} lượt gọi · {formatQty(r.itemsQty)} món</p>
              </div>
              <p className="shrink-0 font-semibold tabular text-foreground">{formatVND(r.amount)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
