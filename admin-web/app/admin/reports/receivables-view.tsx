import { CircleDollarSign, HandCoins, TrendingUp, Wallet } from 'lucide-react'
import { EmptyState } from '@/components/ui/feedback'
import { cn, formatVND } from '@/lib/utils'
import { deltaPercent } from '@/lib/reports/compare'
import type { ReceivableAmounts, ReceivablesReport } from '@/lib/reports/finance'
import { collectedRate, debtAgeDays, topDebtors } from '@/lib/reports/insights'
import { ShareBar } from './charts/share-bar'
import { KpiCard } from './kpi-card'
import { SectionCard } from './section-card'
import { LegendDot } from './report-bits'
import { EMPTY_TEXT, formatPercent, formatYmd } from './report-format'

// Tab "Công nợ" (report_receivables, mig 125): nợ đầu kỳ + phát sinh − đã thu = nợ cuối kỳ cho từng khách; tuổi nợ
// tính trên phần còn nợ tại cuối kỳ. Tên khách mở trang Công nợ ở đúng khách đó (tải cứng: tránh chồng hộp thoại).

const customerHref = (id: string) => `/admin/debts?customer=${encodeURIComponent(id)}`

const AGE_COLORS = { ok: 'var(--chart-3)', warn: 'var(--chart-2)', bad: 'var(--critical-dot)' } as const

function AgeBox({ label, value, tone }: { label: string; value: number; tone: keyof typeof AGE_COLORS }) {
  return (
    <div className={cn('min-w-0 rounded-xl border bg-surface p-3',
      tone === 'bad' && value > 0 ? 'border-critical-border' : tone === 'warn' && value > 0 ? 'border-warning-border' : 'border-border')}>
      <div className="text-[13px] font-medium text-muted"><LegendDot color={AGE_COLORS[tone]}>{label}</LegendDot></div>
      <p className="mt-1 truncate text-lg font-semibold tabular text-foreground">{formatVND(value)}</p>
    </div>
  )
}

const COLS = ['Nợ đầu kỳ', 'Phát sinh', 'Đã thu', 'Nợ cuối kỳ'] as const
const nums = (r: ReceivableAmounts) => [r.opening, r.incurred, r.collected, r.closing]

/** Nhãn đỏ chỉ khi nợ cũ nhất quá 30 ngày (âm/null = chưa tới hạn hoặc không có bill nợ). */
function AgeTag({ days }: { days: number | null }) {
  if (days === null || days <= 30) return null
  return <span data-age-tag className="ml-1.5 rounded-md bg-critical-bg px-1.5 py-0.5 text-[12px] font-medium text-critical">{days} ngày</span>
}

export default function ReceivablesView({ report }: { report: ReceivablesReport }) {
  const { rows, totals } = report
  // Cuối kỳ để tính tuổi nợ: ngày kết thúc thật server trả, rơi về periodTo khi rỗng.
  const periodEnd = report.head.to || report.head.periodTo
  const ageOf = (d: string | null) => debtAgeDays(d, periodEnd)
  const debtors = topDebtors(rows)
  const debtorCount = rows.filter((r) => r.closing > 0).length
  // Không có kỳ trước cho công nợ: so cuối kỳ với đầu kỳ của chính báo cáo này.
  const closingDelta = deltaPercent(totals.closing, totals.opening)
  const rate = collectedRate(totals)
  const ageTotal = totals.age0to7 + totals.age8to30 + totals.ageOver30
  const seg = (v: number) => (ageTotal > 0 ? (v / ageTotal) * 100 : 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon={CircleDollarSign} tone="red" label="Nợ cuối kỳ" value={formatVND(totals.closing)} inverse
          delta={closingDelta} compareLabel="so với đầu kỳ" note={`${debtorCount} khách đang nợ`} />
        <KpiCard icon={Wallet} tone="slate" label="Nợ đầu kỳ" value={formatVND(totals.opening)} />
        <KpiCard icon={TrendingUp} tone="amber" label="Phát sinh" value={formatVND(totals.incurred)} />
        <KpiCard icon={HandCoins} tone="green" label="Đã thu" value={formatVND(totals.collected)}
          note={rate === null ? undefined : `Thu được ${formatPercent(rate)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Tuổi nợ" hint="Phần còn nợ tại cuối kỳ">
          <div className="px-5 pb-5 pt-3">
            <span className="flex h-2.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
              <i className="block h-full" style={{ width: `${seg(totals.age0to7)}%`, background: AGE_COLORS.ok }} />
              <i className="block h-full" style={{ width: `${seg(totals.age8to30)}%`, background: AGE_COLORS.warn }} />
              <i className="block h-full" style={{ width: `${seg(totals.ageOver30)}%`, background: AGE_COLORS.bad }} />
            </span>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <AgeBox label="0–7 ngày" value={totals.age0to7} tone="ok" />
              <AgeBox label="8–30 ngày" value={totals.age8to30} tone="warn" />
              <AgeBox label="Trên 30 ngày" value={totals.ageOver30} tone="bad" />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Nợ nhiều nhất" hint="Theo số còn nợ cuối kỳ">
          {debtors.length === 0 ? (
            <EmptyState>{EMPTY_TEXT}</EmptyState>
          ) : (
            <ul className="space-y-3.5 px-5 pb-5 pt-3">
              {debtors.map((r) => (
                <li key={r.customerId} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <a href={customerHref(r.customerId)} className="min-w-0 truncate text-[13.5px] font-medium text-primary hover:underline">{r.name}</a>
                    <span className="tabular shrink-0 text-[13px] font-semibold">{formatVND(r.closing)}</span>
                  </div>
                  <ShareBar ratio={debtors[0].closing > 0 ? r.closing / debtors[0].closing : 0} color="var(--critical-dot)" />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
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
                    <td className="px-4 py-3 tabular text-muted">
                      {formatYmd(r.oldestOpenDate)}<AgeTag days={ageOf(r.oldestOpenDate)} />
                    </td>
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
                  {r.oldestOpenDate ? <p className="text-[13px] text-muted">Bill nợ cũ nhất {formatYmd(r.oldestOpenDate)}<AgeTag days={ageOf(r.oldestOpenDate)} /></p> : null}
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
