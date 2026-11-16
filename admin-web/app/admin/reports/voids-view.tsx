'use client'

import type { ReactNode } from 'react'
import { Gift, ListOrdered, Undo2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/feedback'
import { cn, formatVND } from '@/lib/utils'
import { deltaPercent } from '@/lib/reports/compare'
import { voidReasons, voidTopItems } from '@/lib/reports/insights'
import { VOID_TYPE_LABEL, type VoidRow, type VoidTotals, type VoidType } from '@/lib/reports/sales'
import { ShareBar } from './charts/share-bar'
import { KpiCard } from './kpi-card'
import { SectionCard } from './section-card'
import { EMPTY_TEXT, formatClock, formatQty } from './report-format'

// Tab "Món huỷ": mỗi lần bỏ món / tặng món / giảm số lượng trong kỳ, theo GIỜ THAO TÁC (server đã sắp mới nhất trước).
// Cùng icon/màu với cột "Lịch sử điều chỉnh bill" của trang Hoá đơn.
const TYPE_STYLE: Record<VoidType, { icon: ReactNode; className: string }> = {
  cancelled: { icon: <Undo2 className="size-3.5" aria-hidden />, className: 'bg-critical-bg text-critical' },
  gift: { icon: <Gift className="size-3.5" aria-hidden />, className: 'bg-violet-50 text-violet-700' },
  quantity: { icon: <ListOrdered className="size-3.5" aria-hidden />, className: 'bg-warning-bg text-warning' },
}

function TypeTag({ type }: { type: VoidType }) {
  const s = TYPE_STYLE[type]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium whitespace-nowrap', s.className)}>
      {s.icon}<span>{VOID_TYPE_LABEL[type]}</span>
    </span>
  )
}

/** Hàng xếp hạng: tên + số + thanh tỉ trọng so với hàng đầu. */
function RankRow({ label, value, ratio, color }: { label: string; value: string; ratio: number; color: string }) {
  return (
    <li className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[13.5px] font-medium text-foreground">{label}</span>
        <span className="tabular shrink-0 text-[13px] font-semibold">{value}</span>
      </div>
      <ShareBar ratio={ratio} color={color} />
    </li>
  )
}

/** Kỳ nhiều ngày thì kèm ngày trước giờ. */
const spansDays = (rows: VoidRow[]) => new Set(rows.map((r) => formatClock(r.at, true).slice(0, 5))).size > 1

export default function VoidsView({ totals, rows: rawRows, prev, compareLabel }: {
  totals: VoidTotals; rows: VoidRow[]; prev?: VoidTotals | null; compareLabel?: string
}) {
  // Lý do chỉ có khoảng trắng coi như không ghi (voidReasons chỉ gom null) — chuẩn hoá một lần cho cả bảng lẫn xếp hạng.
  const rows = rawRows.map((r) => (r.reason !== null && !r.reason.trim() ? { ...r, reason: null } : r))
  const withDate = spansDays(rows)
  const countOf = (t: VoidType) => rows.filter((r) => r.type === t).length
  const d = (cur: number, p: number | undefined) => deltaPercent(cur, p)
  const topItems = voidTopItems(rows)
  const reasons = voidReasons(rows)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard icon={Undo2} tone="red" label="Tiền bỏ" value={formatVND(totals.cancelledAmount)} inverse
          delta={d(totals.cancelledAmount, prev?.cancelledAmount)} compareLabel={compareLabel} note={`${countOf('cancelled')} lần bỏ món`} />
        <KpiCard icon={Gift} tone="violet" label="Tiền tặng" value={formatVND(totals.giftAmount)} inverse
          delta={d(totals.giftAmount, prev?.giftAmount)} compareLabel={compareLabel} note={`${countOf('gift')} lần tặng món`} />
        <KpiCard icon={ListOrdered} tone="amber" label="Giảm SL" value={formatVND(totals.reducedAmount)} inverse
          delta={d(totals.reducedAmount, prev?.reducedAmount)} compareLabel={compareLabel} note={`${countOf('quantity')} lần giảm số lượng`} />
      </div>

      {rows.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Món bị huỷ nhiều nhất" hint="Gộp bỏ + tặng + giảm SL">
            <ul className="space-y-3.5 px-5 pb-5 pt-3">
              {topItems.map((it) => (
                <RankRow key={it.itemName} label={it.itemName} value={`${formatQty(it.quantity)} phần`}
                  ratio={topItems[0].quantity > 0 ? it.quantity / topItems[0].quantity : 0} color="var(--chart-1)" />
              ))}
            </ul>
          </SectionCard>
          <SectionCard title="Lý do hay gặp" hint="Số lần theo lý do ghi trên phiếu">
            <ul className="space-y-3.5 px-5 pb-5 pt-3">
              {reasons.map((r) => (
                <RankRow key={r.reason} label={r.reason} value={`${formatQty(r.count)} lần`}
                  ratio={reasons[0].count > 0 ? r.count / reasons[0].count : 0} color="var(--critical-dot)" />
              ))}
            </ul>
          </SectionCard>
        </div>
      ) : null}

      <section className="min-w-0 rounded-xl border border-border bg-surface">
        {rows.length === 0 ? <EmptyState>{EMPTY_TEXT}</EmptyState> : (
          <>
            <table className="hidden md:table w-full text-left text-sm">
              <thead className="border-b border-border bg-background text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5">Giờ</th>
                  <th className="px-4 py-2.5">Bàn</th>
                  <th className="px-4 py-2.5">Món</th>
                  <th className="px-4 py-2.5 text-right">SL</th>
                  <th className="px-4 py-2.5 text-right">Tiền</th>
                  <th className="px-4 py-2.5">Loại</th>
                  <th className="px-4 py-2.5">Lý do</th>
                  <th className="px-4 py-2.5">Người làm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => (
                  <tr key={`${r.at}|${r.type}|${i}`}>
                    <td className="px-4 py-3 whitespace-nowrap tabular text-muted">{formatClock(r.at, withDate)}</td>
                    <td className="px-4 py-3 text-foreground">{r.tableLabel}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{r.itemName}</td>
                    <td className="px-4 py-3 text-right tabular">{formatQty(r.quantity)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular text-foreground">{formatVND(r.amount)}</td>
                    <td className="px-4 py-3"><TypeTag type={r.type} /></td>
                    <td className="px-4 py-3 text-muted">{r.reason ?? '—'}</td>
                    <td className="px-4 py-3 text-muted">{r.byName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-border md:hidden">
              {rows.map((r, i) => (
                <li key={`${r.at}|${r.type}|${i}`} className="space-y-1 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] tabular text-muted">{formatClock(r.at, withDate)} · {r.tableLabel}</span>
                    <TypeTag type={r.type} />
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm text-foreground">{formatQty(r.quantity)} × <strong className="font-medium">{r.itemName}</strong></p>
                    <p className="shrink-0 font-semibold tabular text-foreground">{formatVND(r.amount)}</p>
                  </div>
                  <p className="text-[12px] text-muted">{r.reason ?? 'Không ghi lý do'}{r.byName ? ` · ${r.byName}` : ''}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
