'use client'

import { ChevronDown } from 'lucide-react'
import { EmptyState } from '@/components/ui/feedback'
import { formatVND } from '@/lib/utils'
import { percentOf, type SalesCategoryRow } from '@/lib/reports/sales'
import { EMPTY_TEXT, formatPercent, formatQty } from './report-format'

// Tab "Theo danh mục": mỗi danh mục một khối gập; mở ra 10 món đầu (server đã sắp theo tiền).
const TOP_ITEMS = 10

export default function SalesCategoryView({ rows, itemsAmount }: { rows: SalesCategoryRow[]; itemsAmount: number }) {
  if (rows.length === 0) return <section className="rounded-xl border border-border bg-surface"><EmptyState>{EMPTY_TEXT}</EmptyState></section>

  return (
    <section className="min-w-0 divide-y divide-border rounded-xl border border-border bg-surface">
      {rows.map((c) => {
        const rest = c.items.length - TOP_ITEMS
        return (
          <details key={c.categoryId ?? 'other'} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-item-hover [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{c.categoryName}</p>
                <p className="text-[13px] text-muted">
                  Bán {formatQty(c.qtySold)}{c.qtyGift ? ` · Tặng ${formatQty(c.qtyGift)}` : ''} · {c.items.length} món
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold tabular text-foreground">{formatVND(c.amount)}</p>
                <p className="text-[13px] tabular text-muted">{formatPercent(percentOf(c.amount, itemsAmount))}</p>
              </div>
            </summary>
            <ul className="divide-y divide-border border-t border-border bg-background">
              {c.items.slice(0, TOP_ITEMS).map((i) => (
                <li key={i.itemName} className="flex items-start justify-between gap-3 py-2.5 pl-11 pr-4 text-sm">
                  <div className="min-w-0">
                    <p className="text-foreground">{i.itemName}</p>
                    <p className="text-[13px] text-muted">Bán {formatQty(i.qtySold)}{i.qtyGift ? ` · Tặng ${formatQty(i.qtyGift)}` : ''}</p>
                  </div>
                  <p className="shrink-0 tabular text-foreground">{formatVND(i.amount)}</p>
                </li>
              ))}
              {rest > 0 ? <li className="py-2.5 pl-11 pr-4 text-[13px] text-muted">Còn {rest} món khác — xem đủ ở tab Theo món</li> : null}
            </ul>
          </details>
        )
      })}
    </section>
  )
}
