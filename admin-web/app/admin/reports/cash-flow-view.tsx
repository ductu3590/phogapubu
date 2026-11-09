import { EmptyState } from '@/components/ui/feedback'
import { cn, formatVND } from '@/lib/utils'
import type { CashFlowLine, CashFlowReport, FundTotals } from '@/lib/reports/finance'
import { EMPTY_TEXT, VOID_LATER_NOTE } from './report-format'

// Tab "Thu chi": hai quỹ Tiền mặt / Ngân hàng (report_cash_flow, mig 125). Ghi nợ không là tiền vào; tiền chỉ vào khi
// khách trả nợ. Không có số dư đầu kỳ: "Chênh lệch" là vào − ra trong kỳ.

const money = (v: number) => <span className={cn('tabular', v < 0 && 'text-critical')}>{formatVND(v)}</span>

function FundCard({ title, fund, note }: { title: string; fund: FundTotals; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted">Vào</dt><dd className="tabular text-foreground">{formatVND(fund.in)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Ra</dt><dd className="tabular text-foreground">{formatVND(fund.out)}</dd></div>
        <div className="flex justify-between gap-3 border-t border-border pt-1.5 font-semibold">
          <dt className="text-foreground">Chênh lệch</dt>
          <dd className={cn('tabular', fund.net < 0 ? 'text-critical' : 'text-foreground')}>{formatVND(fund.net)}</dd>
        </div>
      </dl>
      {note ? <p className="mt-2 text-[12px] text-muted">{note}</p> : null}
    </div>
  )
}

function FlowList({ title, rows, total }: { title: string; rows: CashFlowLine[]; total: { cash: number; bank: number } }) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-surface">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">{title}</h2>
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
    </section>
  )
}

export default function CashFlowView({ report }: { report: CashFlowReport }) {
  const hasWallet = report.inflows.some((x) => x.key === 'wallet')
  const { cash, bank } = report.funds
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FundCard title="Tiền mặt" fund={cash} />
        <FundCard
          title={hasWallet ? 'Ngân hàng / ví' : 'Ngân hàng'}
          fund={bank}
          note={hasWallet ? 'Tiền ví về tài khoản ngân hàng khi đối soát.' : undefined}
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
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
