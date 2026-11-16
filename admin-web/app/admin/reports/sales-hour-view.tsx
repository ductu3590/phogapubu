'use client'

import { Clock, Flame, Receipt, Wallet, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/ui/feedback'
import { formatVND } from '@/lib/utils'
import { fillHourGaps, hourSummary } from '@/lib/reports/insights'
import type { SalesHourRow } from '@/lib/reports/sales'
import { AreaChart } from './charts/area-chart'
import { ShareBar } from './charts/share-bar'
import { SectionCard } from './section-card'
import { EMPTY_TEXT, formatQty, hourLabel, shortMoney } from './report-format'

// Tab "Theo giờ": giờ món VÀO BẾP, đã xếp theo ngày kinh doanh ở server (quán 05:00 → 18h đứng trước 04h).
// Giữ nguyên thứ tự server, không sắp lại theo đồng hồ.

const ARIA = 'Tiền món và lượt gọi theo giờ'

function StripCell({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 px-3.5 py-3">
      <Icon className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <div className="text-xs text-muted">{label}</div>
        <div className="tabular truncate text-[14.5px] font-bold">{children}</div>
      </div>
    </div>
  )
}

export default function SalesHourView({ rows }: { rows: SalesHourRow[] }) {
  const sum = hourSummary(rows)
  // Không có dòng nào, hoặc mọi số đều 0 (hourSummary = null) → báo rỗng, khỏi vẽ biểu đồ phẳng.
  if (rows.length === 0 || !sum) return <section className="rounded-xl border border-border bg-surface"><EmptyState>{EMPTY_TEXT}</EmptyState></section>

  // Biểu đồ lấp giờ trống bằng 0 (đường không nối 11h với 18h); bảng bên dưới vẫn là các dòng gốc.
  const chartRows = fillHourGaps(rows)
  const labels = chartRows.map((r) => `${r.hour}h`)
  const series = [
    { name: 'Tiền món', values: chartRows.map((r) => r.amount), color: 'var(--chart-1)' },
    { name: 'Lượt gọi', values: chartRows.map((r) => r.ordersCount), color: 'var(--chart-3)', axis: 'right' as const },
  ]
  const chartProps = { labels, series, formatLeft: shortMoney, formatRight: (n: number) => String(Math.round(n)), ariaLabel: ARIA }
  // Có tiền mà 0 lượt gọi (dữ liệu lạ): chỉ giữ 2 ô có nghĩa, khỏi hiện "0 lượt" / chia 0.
  const hasOrders = sum.totalOrders > 0

  return (
    <div className="space-y-4">
      <SectionCard title="Tiền món & lượt gọi theo giờ" hint="Giờ món vào bếp, xếp theo ngày kinh doanh">
        <div className="flex gap-4 px-5 pt-2.5 text-[12.5px] text-muted">
          <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full" style={{ background: 'var(--chart-1)' }} />Tiền món</span>
          <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full" style={{ background: 'var(--chart-3)' }} />Lượt gọi</span>
        </div>
        {/* SVG co theo bề rộng nên chữ nhỏ đi trên điện thoại: hai bản, mobile vẽ khung hẹp hơn để chữ đọc được. */}
        <div className="hidden md:block px-3 pt-1"><AreaChart {...chartProps} /></div>
        <div className="px-1 pt-1 md:hidden"><AreaChart {...chartProps} width={420} height={280} /></div>
        <div
          className={`mx-5 mb-5 mt-1 grid overflow-hidden rounded-xl border border-orange-100 bg-orange-50/40 ${hasOrders ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1'}`}
        >
          <StripCell icon={Flame} label="Giờ cao điểm">{hourLabel(sum.peakHour)} · {shortMoney(sum.peakAmount)}</StripCell>
          {hasOrders ? <StripCell icon={Receipt} label="Lượt gọi đông nhất">{formatQty(sum.busiestOrders)} lượt · {hourLabel(sum.busiestHour)}</StripCell> : null}
          <StripCell icon={Clock} label="Tổng lượt gọi">{formatQty(sum.totalOrders)} lượt</StripCell>
          {hasOrders ? <StripCell icon={Wallet} label="TB / lượt gọi">{formatVND(sum.avgPerOrder)}</StripCell> : null}
        </div>
      </SectionCard>

      <section className="min-w-0 rounded-xl border border-border bg-surface">
        <table className="hidden md:table w-full text-left text-sm">
          <thead className="border-b border-border bg-background text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5">Giờ</th>
              <th className="px-4 py-2.5 text-right">Lượt gọi</th>
              <th className="px-4 py-2.5 text-right">SL món</th>
              <th className="px-4 py-2.5 text-right">Tiền</th>
              <th className="px-4 py-2.5 text-right"><span className="sr-only">So với giờ đông nhất</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.hour}>
                <td className="px-4 py-3 font-medium tabular text-foreground">
                  {hourLabel(r.hour)}
                  {r.hour === sum.peakHour ? <span className="ml-2 rounded-md bg-primary-light px-1.5 py-px text-[12px] font-semibold text-primary">Cao điểm</span> : null}
                </td>
                <td className="px-4 py-3 text-right tabular">{formatQty(r.ordersCount)}</td>
                <td className="px-4 py-3 text-right tabular">{formatQty(r.itemsQty)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular text-foreground">{formatVND(r.amount)}</td>
                <td className="px-4 py-3"><ShareBar ratio={sum.peakAmount > 0 ? r.amount / sum.peakAmount : 0} className="ml-auto w-40" /></td>
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
