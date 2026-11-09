import { EmptyState } from '@/components/ui/feedback'
import { cn, formatVND } from '@/lib/utils'
import type { ReceivableAmounts, ReceivablesReport } from '@/lib/reports/finance'
import { EMPTY_TEXT, formatYmd } from './report-format'

// Tab "Công nợ" (report_receivables, mig 125): nợ đầu kỳ + phát sinh − đã thu = nợ cuối kỳ cho từng khách; tuổi nợ
// tính trên phần còn nợ tại cuối kỳ. Tên khách mở trang Công nợ ở đúng khách đó (tải cứng: tránh chồng hộp thoại).

const customerHref = (id: string) => `/admin/debts?customer=${encodeURIComponent(id)}`

function AgeBox({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className={cn('min-w-0 rounded-xl border bg-surface p-3 md:p-4',
      tone === 'bad' && value > 0 ? 'border-critical-border' : tone === 'warn' && value > 0 ? 'border-warning-border' : 'border-border')}>
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular text-foreground md:text-2xl">{formatVND(value)}</p>
    </div>
  )
}

const COLS = ['Nợ đầu kỳ', 'Phát sinh', 'Đã thu', 'Nợ cuối kỳ'] as const
const nums = (r: ReceivableAmounts) => [r.opening, r.incurred, r.collected, r.closing]

export default function ReceivablesView({ report }: { report: ReceivablesReport }) {
  const { rows, totals } = report
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <AgeBox label="0–7 ngày" value={totals.age0to7} tone="ok" />
        <AgeBox label="8–30 ngày" value={totals.age8to30} tone="warn" />
        <AgeBox label="Trên 30 ngày" value={totals.ageOver30} tone="bad" />
      </div>

      <section className="min-w-0 overflow-x-auto rounded-xl border border-border bg-surface">
        {rows.length === 0 ? <EmptyState>{EMPTY_TEXT}</EmptyState> : (
          <>
            <table className="hidden md:table w-full text-left text-sm">
              <thead className="border-b border-border bg-background text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5">Tên</th>
                  {COLS.map((c) => <th key={c} className="px-4 py-2.5 text-right">{c}</th>)}
                  <th className="px-4 py-2.5">Bill nợ cũ nhất</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.customerId}>
                    <td className="px-4 py-3">
                      <a href={customerHref(r.customerId)} className="font-medium text-primary hover:underline">{r.name}</a>
                      {r.phone ? <span className="block text-[13px] tabular text-muted">{r.phone}</span> : null}
                    </td>
                    {nums(r).map((v, i) => (
                      <td key={COLS[i]} className={cn('px-4 py-3 text-right tabular', i === 3 && 'font-semibold text-foreground')}>{formatVND(v)}</td>
                    ))}
                    <td className="px-4 py-3 tabular text-muted">{formatYmd(r.oldestOpenDate)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border bg-background font-semibold text-foreground">
                <tr>
                  <td className="px-4 py-3">Tổng</td>
                  {nums(totals).map((v, i) => <td key={COLS[i]} className="px-4 py-3 text-right tabular">{formatVND(v)}</td>)}
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>

            <ul className="divide-y divide-border md:hidden">
              {rows.map((r) => (
                <li key={r.customerId} className="space-y-1 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <a href={customerHref(r.customerId)} className="min-w-0 font-medium text-primary">{r.name}</a>
                    <span className="shrink-0 font-semibold tabular text-foreground">{formatVND(r.closing)}</span>
                  </div>
                  <p className="text-[13px] tabular text-muted">
                    Đầu kỳ {formatVND(r.opening)} · Phát sinh {formatVND(r.incurred)} · Đã thu {formatVND(r.collected)}
                  </p>
                  {r.oldestOpenDate ? <p className="text-[13px] text-muted">Bill nợ cũ nhất {formatYmd(r.oldestOpenDate)}</p> : null}
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 bg-background px-4 py-3 font-semibold text-foreground">
                <span>Tổng</span>
                <span className="tabular">{formatVND(totals.closing)}</span>
              </li>
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
