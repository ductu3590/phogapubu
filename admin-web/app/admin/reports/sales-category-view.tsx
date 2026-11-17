'use client'

import { ChevronDown } from 'lucide-react'
import { EmptyState } from '@/components/ui/feedback'
import { formatVND } from '@/lib/utils'
import { categoryShares } from '@/lib/reports/insights'
import { percentOf, type SalesCategoryRow } from '@/lib/reports/sales'
import { ChartLegend } from './charts/chart-legend'
import { Donut } from './charts/donut'
import { CHART_COLORS, shareColor } from './charts/palette'
import { ShareBar } from './charts/share-bar'
import { SectionCard } from './section-card'
import { EMPTY_TEXT, formatPercent, formatQty, shortMoney } from './report-format'

// Tab "Theo danh mục": mỗi danh mục một khối gập; mở ra 10 món đầu (server đã sắp theo tiền).
const TOP_ITEMS = 10

export default function SalesCategoryView({ rows, itemsAmount }: { rows: SalesCategoryRow[]; itemsAmount: number }) {
  if (rows.length === 0) return <section className="rounded-xl border border-border bg-surface"><EmptyState>{EMPTY_TEXT}</EmptyState></section>

  const shares = categoryShares(rows)
  const shareTotal = shares.reduce((a, s) => a + s.value, 0)
  // Danh mục nằm ngoài 5 lát đầu dùng màu lát "Khác" gộp.
  const colorOf = (key: string) => shareColor(shares, key)
  const maxAmount = Math.max(0, ...rows.map((r) => r.amount))

  return (
    <div className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
      <SectionCard title="Danh mục" hint="Bấm để xem món trong danh mục">
        <div className="mt-3 divide-y divide-border border-t border-border">
          {rows.map((c) => {
            const rest = c.items.length - TOP_ITEMS
            const color = colorOf(c.categoryId ?? 'other')
            return (
              <details key={c.categoryId ?? 'other'} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 hover:bg-item-hover [&::-webkit-details-marker]:hidden">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{c.categoryName}</p>
                    <p className="tabular text-[12.5px] text-muted">
                      Bán {formatQty(c.qtySold)}{c.qtyGift ? ` · Tặng ${formatQty(c.qtyGift)}` : ''} · {c.items.length} món
                    </p>
                  </div>
                  <ShareBar ratio={maxAmount > 0 ? c.amount / maxAmount : 0} color={color} className="hidden w-32 shrink-0 md:block" />
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular text-foreground">{formatVND(c.amount)}</p>
                    <p className="text-[12.5px] tabular text-muted">{formatPercent(percentOf(c.amount, itemsAmount))}</p>
                  </div>
                  <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <ul className="divide-y divide-border border-t border-border bg-background">
                  {c.items.slice(0, TOP_ITEMS).map((i) => (
                    <li key={i.itemName} className="flex items-start justify-between gap-3 py-2.5 pl-10 pr-5 text-sm">
                      <div className="min-w-0">
                        <p className="text-foreground">{i.itemName}</p>
                        <p className="text-[13px] text-muted">Bán {formatQty(i.qtySold)}{i.qtyGift ? ` · Tặng ${formatQty(i.qtyGift)}` : ''}</p>
                      </div>
                      <p className="shrink-0 tabular text-foreground">{formatVND(i.amount)}</p>
                    </li>
                  ))}
                  {rest > 0 ? <li className="py-2.5 pl-10 pr-5 text-[13px] text-muted">Còn {rest} món khác — xem đủ ở tab Theo món</li> : null}
                </ul>
              </details>
            )
          })}
        </div>
      </SectionCard>

      <SectionCard title="Tỉ trọng theo danh mục" hint="Theo tiền món">
        <div className="flex flex-col items-center gap-5 px-5 pb-5 pt-4">
          <Donut slices={shares.map((s, i) => ({ label: s.label, value: s.value, color: CHART_COLORS[i] }))}
            center={shortMoney(itemsAmount)} caption="TIỀN MÓN" size={200} />
          <div className="w-full">
            <ChartLegend items={shares.map((s, i) => ({
              label: s.label, color: CHART_COLORS[i], percent: percentOf(s.value, shareTotal),
              sub: `${formatQty(s.qty ?? 0)} món`,
            }))} />
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
