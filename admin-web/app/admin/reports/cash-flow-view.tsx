import type { ReactNode } from 'react'
import { Coins, Landmark, type LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/ui/feedback'
import { cn, formatVND } from '@/lib/utils'
import { deltaPercent } from '@/lib/reports/compare'
import type { CashFlowLine, CashFlowReport, FundTotals } from '@/lib/reports/finance'
import { outflowBars } from '@/lib/reports/insights'
import { PAYMENT_COLORS } from './charts/palette'
import { SectionCard } from './section-card'
import { DeltaChip, LegendDot } from './report-bits'
import { EMPTY_TEXT, VOID_LATER_NOTE, shortMoney } from './report-format'

// Tab "Thu chi": hai quỹ Tiền mặt / Ngân hàng (report_cash_flow, mig 125). Ghi nợ không là tiền vào; tiền chỉ vào khi
// khách trả nợ. Không có số dư đầu kỳ: "Chênh lệch" là vào − ra trong kỳ.

const money = (v: number) => <span className={cn('tabular', v < 0 && 'text-critical')}>{formatVND(v)}</span>

function FundCard({ icon: Icon, tone, title, fund, prevNet, compareLabel, note }: {
  icon: LucideIcon; tone: string; title: string; fund: FundTotals; prevNet?: number; compareLabel?: string; note?: string
}) {
  const total = fund.in + fund.out
  const inRatio = total > 0 ? Math.min(Math.max(fund.in / total, 0), 1) : 0
  const delta = deltaPercent(fund.net, prevNet)
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface px-4 py-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
      <div className="flex items-center gap-2.5">
        <span className={`grid size-9 shrink-0 place-items-center rounded-[10px] ${tone}`}><Icon className="size-[18px]" aria-hidden /></span>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      <div>
        <p className="text-[12.5px] text-muted">Chênh lệch trong kỳ</p>
        <p className={cn('tabular text-xl font-bold leading-tight tracking-tight [overflow-wrap:anywhere] md:text-[28px]', fund.net < 0 ? 'text-critical' : 'text-success')}>{formatVND(fund.net)}</p>
      </div>
      {/* Chênh lệch quỹ: tăng là tốt. */}
      {delta !== null ? (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-muted">
          <DeltaChip delta={delta} label={compareLabel} />
        </div>
      ) : null}
      {/* Thanh tỉ lệ vào / ra trong kỳ */}
      <span className="flex h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <i className="block h-full" style={{ width: `${inRatio * 100}%`, background: 'var(--chart-3)' }} />
        <i className="block h-full" style={{ width: `${total > 0 ? (1 - inRatio) * 100 : 0}%`, background: 'var(--chart-1)' }} />
      </span>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted">Vào</dt><dd className="tabular text-foreground">{formatVND(fund.in)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Ra</dt><dd className="tabular text-foreground">{formatVND(fund.out)}</dd></div>
      </dl>
      {note ? <p className="text-[12px] text-muted">{note}</p> : null}
    </div>
  )
}

function FlowList({ title, rows, total }: { title: string; rows: CashFlowLine[]; total: { cash: number; bank: number } }) {
  const chip: ReactNode = <span className="tabular rounded-md bg-secondary px-2 py-0.5 text-[12.5px] font-semibold text-foreground">{shortMoney(total.cash + total.bank)}</span>
  return (
    <SectionCard title={title} action={chip}>
      <div className="mt-3 border-t border-border">
        {rows.length === 0 ? <EmptyState>{EMPTY_TEXT}</EmptyState> : (
          <>
            <table className="hidden md:table w-full text-left text-sm">
              <thead className="border-b border-border bg-background text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5">Khoản</th>
                  <th className="px-4 py-2.5 text-right">Tiền mặt</th>
                  <th className="px-4 py-2.5 text-right">Chuyển khoản</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="px-4 py-3 text-foreground">{r.label}</td>
                    <td className="px-4 py-3 text-right">{money(r.cash)}</td>
                    <td className="px-4 py-3 text-right">{money(r.bank)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border bg-background font-semibold text-foreground">
                <tr>
                  <td className="px-4 py-3">Tổng</td>
                  <td className="px-4 py-3 text-right">{money(total.cash)}</td>
                  <td className="px-4 py-3 text-right">{money(total.bank)}</td>
                </tr>
              </tfoot>
            </table>
            <ul className="divide-y divide-border md:hidden">
              {rows.map((r) => (
                <li key={r.key} className="flex items-start justify-between gap-3 px-4 py-3">
                  <p className="min-w-0 text-sm text-foreground">{r.label}</p>
                  <div className="shrink-0 text-right text-[13px]">
                    {r.cash ? <p className="text-muted">TM {money(r.cash)}</p> : null}
                    {r.bank ? <p className="text-muted">CK {money(r.bank)}</p> : null}
                    {!r.cash && !r.bank ? <p className="text-muted">{formatVND(0)}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </SectionCard>
  )
}

export default function CashFlowView({ report, prev, compareLabel }: {
  report: CashFlowReport; prev?: CashFlowReport['funds'] | null; compareLabel?: string
}) {
  const hasWallet = report.inflows.some((x) => x.key === 'wallet')
  const { cash, bank } = report.funds
  const bars = outflowBars(report.outflows)
  const maxTotal = bars.length ? bars[0].total : 0
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FundCard icon={Coins} tone="bg-success-bg text-success" title="Tiền mặt" fund={cash}
          prevNet={prev?.cash.net} compareLabel={compareLabel} />
        <FundCard icon={Landmark} tone="bg-sky-50 text-sky-700" title={hasWallet ? 'Ngân hàng / ví' : 'Ngân hàng'} fund={bank}
          prevNet={prev?.bank.net} compareLabel={compareLabel}
          note={hasWallet ? 'Tiền ví về tài khoản ngân hàng khi đối soát.' : undefined} />
      </div>

      {bars.length > 0 ? (
        <SectionCard title="Tiền ra đi đâu" hint="Không gồm chuyển quỹ">
          <div className="flex gap-4 px-5 pt-2.5 text-[12.5px] text-muted">
            <LegendDot color={PAYMENT_COLORS.cash}>Tiền mặt</LegendDot>
            <LegendDot color={PAYMENT_COLORS.bank}>Chuyển khoản</LegendDot>
          </div>
          <ul className="space-y-3.5 px-5 pb-5 pt-3">
            {bars.map((b) => (
              <li key={b.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[13.5px] font-medium text-foreground">{b.label}</span>
                  <span className="tabular shrink-0 text-[13px] font-semibold">{formatVND(b.total)}</span>
                </div>
                {/* Thanh xếp chồng TM + CK, độ dài theo hạng mục lớn nhất */}
                <span className="flex h-1.5 overflow-hidden rounded-full bg-secondary" style={{ width: `${maxTotal > 0 ? (b.total / maxTotal) * 100 : 0}%` }}>
                  <i className="block h-full" style={{ width: `${(b.cash / b.total) * 100}%`, background: PAYMENT_COLORS.cash }} />
                  <i className="block h-full" style={{ width: `${(b.bank / b.total) * 100}%`, background: PAYMENT_COLORS.bank }} />
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <FlowList title="Tiền vào" rows={report.inflows} total={{ cash: cash.in, bank: bank.in }} />
        <FlowList title="Tiền ra" rows={report.outflows} total={{ cash: cash.out, bank: bank.out }} />
      </div>
      <div className="space-y-0.5 text-[13px] text-muted">
        <p>Ghi nợ không tính là tiền vào. Không có số dư đầu kỳ.</p>
        <p>{VOID_LATER_NOTE}</p>
      </div>
    </div>
  )
}
