import { ArrowDownToLine, ArrowUpToLine, Receipt, Scale, Tag, Users, Wallet } from 'lucide-react'
import { EmptyState } from '@/components/ui/feedback'
import { formatVND } from '@/lib/utils'
import { deltaPercent } from '@/lib/reports/compare'
import { avgPerBill, revenueRowLabel, type RevenueReport, type RevenueRow, type RevenueTotals } from '@/lib/reports/finance'
import { revenueExtremes, paymentMix } from '@/lib/reports/insights'
import { percentOf } from '@/lib/reports/sales'
import { AreaChart } from './charts/area-chart'
import { ChartLegend } from './charts/chart-legend'
import { Donut } from './charts/donut'
import { PAYMENT_COLORS } from './charts/palette'
import { KpiCard } from './kpi-card'
import { SectionCard } from './section-card'
import { HighlightTag, LegendDot, StripCell } from './report-bits'
import { EMPTY_TEXT, formatPercent, formatQty, shortMoney } from './report-format'

// Tab "Doanh thu": mỗi ngày (hoặc mỗi tháng trong 12 tháng) một dòng, số = A04 ngày đó (report_day_totals, mig 125).

const ARIA = 'Doanh thu và số bill theo thời gian'

const COLS = ['Doanh thu', 'Giảm giá', 'Tiền mặt', 'Chuyển khoản', 'Ghi nợ', 'Số bill', 'TB/bill'] as const

function cells(r: Omit<RevenueRow, 'date'>): string[] {
  return [
    formatVND(r.revenue), formatVND(r.discountTotal), formatVND(r.cash), formatVND(r.bank), formatVND(r.debt),
    formatQty(r.billsCount), formatVND(avgPerBill(r.revenue, r.billsCount)),
  ]
}

export default function RevenueView({ report, prev, compareLabel }: {
  report: RevenueReport; prev?: RevenueTotals | null; compareLabel?: string
}) {
  const { rows, totals, grain } = report
  const isMonth = grain === 'month'
  const unit = isMonth ? 'Tháng' : 'Ngày'
  const unitLower = isMonth ? 'tháng' : 'ngày'
  const hasRevenue = rows.some((r) => r.revenue !== 0 || r.billsCount !== 0)
  // Chế độ tháng luôn là 12 tháng gần nhất, không có kỳ trước tương ứng → không so sánh.
  const base = isMonth ? null : prev
  const d = (cur: number, p: number | undefined) => deltaPercent(cur, p)
  const cmp = isMonth ? undefined : compareLabel

  const showBody = rows.length > 0 && hasRevenue
  // Chỉ 1 điểm (Hôm nay/Hôm qua): không có đường để vẽ, dải cao nhất/thấp nhất sẽ chỉ lặp cùng một ngày.
  const multi = rows.length >= 2
  const ext = showBody && multi ? revenueExtremes(rows) : null
  const mix = paymentMix(totals)
  const mixTotal = mix.reduce((a, s) => a + s.value, 0)

  const labels = rows.map((r) => revenueRowLabel(r, grain))
  const series = [
    { name: 'Doanh thu', values: rows.map((r) => r.revenue), color: 'var(--chart-1)' },
    { name: 'Số bill', values: rows.map((r) => r.billsCount), color: 'var(--chart-3)', axis: 'right' as const },
  ]
  const chartProps = { labels, series, formatLeft: shortMoney, formatRight: (n: number) => String(Math.round(n)), ariaLabel: ARIA }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon={Receipt} tone="orange" label="Doanh thu" value={formatVND(totals.revenue)}
          delta={d(totals.revenue, base?.revenue)} compareLabel={cmp} />
        <KpiCard icon={Users} tone="sky" label="Số bill" value={formatQty(totals.billsCount)}
          delta={d(totals.billsCount, base?.billsCount)} compareLabel={cmp} />
        <KpiCard icon={Wallet} tone="green" label="TB/bill" value={formatVND(avgPerBill(totals.revenue, totals.billsCount))}
          delta={d(avgPerBill(totals.revenue, totals.billsCount), base ? avgPerBill(base.revenue, base.billsCount) : undefined)} compareLabel={cmp} />
        <KpiCard icon={Tag} tone="violet" label="Giảm giá" value={formatVND(totals.discountTotal)} inverse
          delta={d(totals.discountTotal, base?.discountTotal)} compareLabel={cmp}
          note={`${formatPercent(percentOf(totals.discountTotal, totals.revenue))} doanh thu`} />
      </div>

      {!showBody ? (
        <section className="rounded-xl border border-border bg-surface"><EmptyState>{EMPTY_TEXT}</EmptyState></section>
      ) : (
        <>
          <div className={multi ? 'grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]' : 'grid gap-4'}>
            {multi ? (
              <SectionCard
                title={`Doanh thu & số bill theo ${unitLower}`}
                hint={isMonth ? `12 tháng, ${labels[0]} – ${labels[labels.length - 1]}` : undefined}
              >
                <div className="flex gap-4 px-5 pt-2.5 text-[12.5px] text-muted">
                  {series.map((s) => <LegendDot key={s.name} color={s.color}>{s.name}</LegendDot>)}
                </div>
                {/* SVG co theo bề rộng nên chữ nhỏ đi trên điện thoại: hai bản, mobile vẽ khung hẹp hơn để chữ đọc được. */}
                <div className="hidden md:block px-3 pt-1"><AreaChart {...chartProps} width={720} /></div>
                <div className="px-1 pt-1 md:hidden"><AreaChart {...chartProps} width={420} height={280} /></div>
                {ext ? (
                  <div className="mx-5 mb-5 mt-1 grid grid-cols-1 overflow-hidden rounded-xl border border-orange-100 bg-orange-50/40 sm:grid-cols-3">
                    <StripCell icon={ArrowUpToLine} label={`${unit} cao nhất`}>{revenueRowLabel(ext.best, grain)} · {shortMoney(ext.best.revenue)}</StripCell>
                    <StripCell icon={Scale} label={`TB / ${unitLower}`}>{formatVND(ext.avg)}</StripCell>
                    <StripCell icon={ArrowDownToLine} label={`${unit} thấp nhất`}>{revenueRowLabel(ext.worst, grain)} · {shortMoney(ext.worst.revenue)}</StripCell>
                  </div>
                ) : null}
              </SectionCard>
            ) : null}

            <SectionCard title="Cơ cấu thanh toán" hint="Theo cách khách trả">
              {mix.length === 0 ? (
                <EmptyState>{EMPTY_TEXT}</EmptyState>
              ) : (
                <div className="flex flex-col items-center gap-5 px-5 pb-5 pt-4 sm:flex-row">
                  <Donut
                    slices={mix.map((s) => ({ label: s.label, value: s.value, color: PAYMENT_COLORS[s.key as keyof typeof PAYMENT_COLORS] }))}
                    center={shortMoney(totals.revenue)}
                    caption="DOANH THU"
                  />
                  <ChartLegend
                    items={mix.map((s) => ({
                      label: s.label,
                      sub: formatVND(s.value),
                      percent: percentOf(s.value, mixTotal),
                      color: PAYMENT_COLORS[s.key as keyof typeof PAYMENT_COLORS],
                    }))}
                  />
                </div>
              )}
            </SectionCard>
          </div>

          <section className="min-w-0 overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="hidden md:table w-full text-left text-sm">
              <thead className="border-b border-border bg-background text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5">{unit}</th>
                  {COLS.map((c) => <th key={c} className="px-4 py-2.5 text-right">{c}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.date}>
                    <td className="px-4 py-3 font-medium tabular text-foreground">
                      {revenueRowLabel(r, grain)}
                      {ext && r === ext.best ? <HighlightTag>Cao nhất</HighlightTag> : null}
                    </td>
                    {cells(r).map((v, i) => <td key={COLS[i]} className="px-4 py-3 text-right tabular">{v}</td>)}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border bg-background font-semibold text-foreground">
                <tr>
                  <td className="px-4 py-3">Tổng</td>
                  {cells(totals).map((v, i) => <td key={COLS[i]} className="px-4 py-3 text-right tabular">{v}</td>)}
                </tr>
              </tfoot>
            </table>

            <ul className="divide-y divide-border md:hidden">
              {rows.map((r) => (
                <li key={r.date} className="space-y-1 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium tabular text-foreground">
                      {revenueRowLabel(r, grain)}
                      {ext && r === ext.best ? <HighlightTag>Cao nhất</HighlightTag> : null}
                    </span>
                    <span className="font-semibold tabular text-foreground">{formatVND(r.revenue)}</span>
                  </div>
                  <p className="text-[13px] tabular text-muted">
                    TM {formatVND(r.cash)} · CK {formatVND(r.bank)} · Nợ {formatVND(r.debt)}
                  </p>
                  <p className="text-[13px] tabular text-muted">
                    {formatQty(r.billsCount)} bill · TB {formatVND(avgPerBill(r.revenue, r.billsCount))}
                    {r.discountTotal ? ` · Giảm ${formatVND(r.discountTotal)}` : ''}
                  </p>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 bg-background px-4 py-3 font-semibold text-foreground">
                <span>Tổng</span>
                <span className="tabular">{formatVND(totals.revenue)}</span>
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
