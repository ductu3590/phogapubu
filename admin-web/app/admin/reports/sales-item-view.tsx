'use client'

import { useMemo, useState } from 'react'
import { EmptyState } from '@/components/ui/feedback'
import { Tabs } from '@/components/ui/tabs'
import { formatVND } from '@/lib/utils'
import { percentOf, sortItemRows, type SalesItemRow } from '@/lib/reports/sales'
import { EMPTY_TEXT, formatPercent, formatQty } from './report-format'

// Tab "Theo món": một dòng = một tên món đã chụp trong một danh mục hiện tại (server đã gom).
// Sắp và lọc chỉ làm ở client trên dữ liệu đã có — không gọi lại server.

/** Khoá lọc: id danh mục, 'other' = Khác (món mất danh mục), 'all' = tất cả. */
export type CategoryKey = string

const keyOf = (r: SalesItemRow): CategoryKey => r.categoryId ?? 'other'

/** 'Tất cả' + danh mục có trong dữ liệu (theo tên) + 'Khác' cuối cùng nếu có. */
export function categoryOptions(rows: SalesItemRow[]): { value: CategoryKey; label: string }[] {
  const seen = new Map<string, string>()
  for (const r of rows) if (r.categoryId && !seen.has(r.categoryId)) seen.set(r.categoryId, r.categoryName)
  const named = [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'vi'))
  return [
    { value: 'all', label: 'Tất cả' },
    ...named,
    ...(rows.some((r) => r.categoryId === null) ? [{ value: 'other', label: 'Khác' }] : []),
  ]
}

export function filterItemRows(rows: SalesItemRow[], key: CategoryKey): SalesItemRow[] {
  return key === 'all' ? rows : rows.filter((r) => keyOf(r) === key)
}

type SortBy = 'amount' | 'qty'
const SORTS = [{ value: 'amount' as const, label: 'Tiền' }, { value: 'qty' as const, label: 'Số lượng' }]

export default function SalesItemView({ rows, itemsAmount }: { rows: SalesItemRow[]; itemsAmount: number }) {
  const [sortBy, setSortBy] = useState<SortBy>('amount')
  const [category, setCategory] = useState<CategoryKey>('all')
  const options = useMemo(() => categoryOptions(rows), [rows])
  const visible = useMemo(() => sortItemRows(filterItemRows(rows, category), sortBy), [rows, category, sortBy])

  if (rows.length === 0) return <section className="rounded-xl border border-border bg-surface"><EmptyState>{EMPTY_TEXT}</EmptyState></section>

  return (
    <section className="min-w-0 rounded-xl border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <Tabs label="Sắp theo" variant="segmented" items={SORTS} value={sortBy} onValueChange={setSortBy} />
        <label className="flex min-w-0 items-center gap-2 text-sm text-muted">
          <span className="shrink-0">Danh mục</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="min-h-10 min-w-0 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-focus"
          >
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </header>

      {visible.length === 0 ? <EmptyState>{EMPTY_TEXT}</EmptyState> : (
        <>
          <table className="hidden md:table w-full text-left text-sm">
            <thead className="border-b border-border bg-background text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5">Món</th>
                <th className="px-4 py-2.5 text-right">SL bán</th>
                <th className="px-4 py-2.5 text-right">SL tặng</th>
                <th className="px-4 py-2.5 text-right">Tiền</th>
                <th className="px-4 py-2.5 text-right">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((r) => (
                <tr key={`${r.itemName}|${keyOf(r)}`}>
                  <td className="px-4 py-3">
                    <span className="block font-medium text-foreground">{r.itemName}</span>
                    <span className="block text-[13px] text-muted">{r.categoryName}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular">{formatQty(r.qtySold)}</td>
                  <td className="px-4 py-3 text-right tabular text-muted">{r.qtyGift ? formatQty(r.qtyGift) : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular text-foreground">{formatVND(r.amount)}</td>
                  <td className="px-4 py-3 text-right tabular text-muted">{formatPercent(percentOf(r.amount, itemsAmount))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="divide-y divide-border md:hidden">
            {visible.map((r) => (
              <li key={`${r.itemName}|${keyOf(r)}`} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{r.itemName}</p>
                  <p className="text-[13px] text-muted">
                    {r.categoryName} · Bán {formatQty(r.qtySold)}{r.qtyGift ? ` · Tặng ${formatQty(r.qtyGift)}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular text-foreground">{formatVND(r.amount)}</p>
                  <p className="text-[13px] tabular text-muted">{formatPercent(percentOf(r.amount, itemsAmount))}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
