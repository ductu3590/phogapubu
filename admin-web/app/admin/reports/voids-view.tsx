'use client'

import type { ReactNode } from 'react'
import { Gift, ListOrdered, Undo2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/feedback'
import { cn, formatVND } from '@/lib/utils'
import { VOID_TYPE_LABEL, type VoidRow, type VoidTotals, type VoidType } from '@/lib/reports/sales'
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

function Total({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular text-foreground md:text-2xl">{formatVND(value)}</p>
      <p className="mt-0.5 text-[12px] text-muted">{note}</p>
    </div>
  )
}

/** Kỳ nhiều ngày thì kèm ngày trước giờ. */
const spansDays = (rows: VoidRow[]) => new Set(rows.map((r) => formatClock(r.at, true).slice(0, 5))).size > 1

export default function VoidsView({ totals, rows }: { totals: VoidTotals; rows: VoidRow[] }) {
  const withDate = spansDays(rows)
  const countOf = (t: VoidType) => rows.filter((r) => r.type === t).length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Total label="Tiền bỏ" value={totals.cancelledAmount} note={`${countOf('cancelled')} lần bỏ món`} />
        <Total label="Tiền tặng" value={totals.giftAmount} note={`${countOf('gift')} lần tặng món`} />
        <Total label="Giảm SL" value={totals.reducedAmount} note={`${countOf('quantity')} lần giảm số lượng`} />
      </div>

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
