'use client'

import { useMemo, useState } from 'react'
import { Crown } from 'lucide-react'
import { EmptyState } from '@/components/ui/feedback'
import { Tabs } from '@/components/ui/tabs'
import { formatVND } from '@/lib/utils'
import { itemCategoryShares, topItems } from '@/lib/reports/insights'
import { percentOf, sortItemRows, type SalesItemRow } from '@/lib/reports/sales'
import { ChartLegend } from './charts/chart-legend'
import { Donut } from './charts/donut'
import { CHART_COLORS } from './charts/palette'
import { ShareBar } from './charts/share-bar'
import { SectionCard } from './section-card'
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
const TOP_SORTS = [{ value: 'amount' as const, label: 'Theo tiền' }, { value: 'qty' as const, label: 'Theo SL' }]

// Màu nhạt cho ô chữ cái đầu: trộn màu lát với trắng, chữ theo màu lát.
const tint = (color: string) => ({ background: `color-mix(in srgb, ${color} 16%, white)`, color })

export default function SalesItemView({ rows, itemsAmount, qtySold }: { rows: SalesItemRow[]; itemsAmount: number; qtySold?: number }) {
  const [sortBy, setSortBy] = useState<SortBy>('amount')
  // Bộ chọn riêng của khối "Món bán chạy", không đụng sắp xếp của bảng.
  const [topBy, setTopBy] = useState<SortBy>('amount')
  const [category, setCategory] = useState<CategoryKey>('all')
  const options = useMemo(() => categoryOptions(rows), [rows])
  const visible = useMemo(() => sortItemRows(filterItemRows(rows, category), sortBy), [rows, category, sortBy])
  const shares = useMemo(() => itemCategoryShares(rows), [rows])
  const top = useMemo(() => topItems(rows, topBy, 5), [rows, topBy])

  if (rows.length === 0) return <section className="rounded-xl border border-border bg-surface"><EmptyState>{EMPTY_TEXT}</EmptyState></section>

  // Màu theo vị trí lát; món thuộc danh mục đã gộp vào "Khác" lấy màu lát gộp.
  const colorOfKey = (key: string): string => {
    let i = shares.findIndex((s) => s.key === key)
    if (i < 0) i = shares.findIndex((s) => s.key === '__rest')
    return CHART_COLORS[i >= 0 ? i : 5]
  }
  const shareTotal = shares.reduce((a, s) => a + s.value, 0)
  const totalQty = qtySold ?? rows.reduce((a, r) => a + r.qtySold, 0)
  const maxAmount = Math.max(0, ...visible.map((r) => r.amount))

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
        <SectionCard title="Món bán chạy" hint="5 món đứng đầu trong kỳ"
          action={<Tabs label="Xếp hạng theo" variant="segmented" items={TOP_SORTS} value={topBy} onValueChange={setTopBy} />}>
          <ol className="m-0 list-none px-5 pb-4 pt-2">
            {top.map((r, i) => {
              const key = keyOf(r)
              return (
                <li key={`${r.itemName}|${key}`} className="grid grid-cols-[24px_40px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-2.5 last:border-b-0">
                  <span data-rank={i + 1} className="grid size-6 place-items-center rounded-full text-xs font-bold text-white" style={{ background: CHART_COLORS[i] }}>{i + 1}</span>
                  <span className="grid size-10 place-items-center rounded-xl text-[15px] font-bold" style={tint(colorOfKey(key))} aria-hidden>{Array.from(r.itemName)[0]?.toUpperCase()}</span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{r.itemName}</p>
                    <p className="tabular text-[12.5px] text-muted">{formatQty(r.qtySold)} phần · {r.categoryName}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular font-bold text-foreground">{formatVND(r.amount)}</p>
                    <p className="tabular text-[12.5px] text-muted">{formatPercent(percentOf(r.amount, itemsAmount))}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </SectionCard>

        <SectionCard title="Tỉ trọng theo danh mục" hint="Theo tiền món">
          <div className="flex flex-wrap items-center gap-5 px-5 pb-1 pt-4">
            <Donut slices={shares.map((s, i) => ({ label: s.label, value: s.value, color: CHART_COLORS[i] }))} center={formatQty(totalQty)} caption="MÓN BÁN RA" />
            <ChartLegend items={shares.map((s, i) => ({
              label: s.label, color: CHART_COLORS[i], percent: percentOf(s.value, shareTotal),
              sub: `${formatQty(s.qty ?? 0)} món · ${formatVND(s.value)}`,
            }))} />
          </div>
          {shares[0] && shares[0].value > 0 ? (
            <div className="mx-5 mb-5 mt-3 flex items-start gap-2.5 rounded-xl bg-primary-light p-3 text-[13px]">
              <Crown className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <p><b>{shares[0].label}</b> mang lại nhiều tiền nhất kỳ này — {formatPercent(percentOf(shares[0].value, shareTotal))} tiền món.</p>
            </div>
          ) : <div className="pb-4" />}
        </SectionCard>
      </div>

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
                    <td className="px-4 py-3 text-right tabular text-muted">
                      <span className="flex items-center justify-end gap-2">
                        {/* Thanh so với dòng lớn nhất đang hiện */}
                        <ShareBar ratio={maxAmount > 0 ? r.amount / maxAmount : 0} className="w-24" />
                        <span className="w-12">{formatPercent(percentOf(r.amount, itemsAmount))}</span>
                      </span>
                    </td>
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
    </div>
  )
}
