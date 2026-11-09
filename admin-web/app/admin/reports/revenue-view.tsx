import { EmptyState } from '@/components/ui/feedback'
import { formatVND } from '@/lib/utils'
import { avgPerBill, revenueRowLabel, type RevenueGrain, type RevenueReport, type RevenueRow } from '@/lib/reports/finance'
import { EMPTY_TEXT, formatQty } from './report-format'

// Tab "Doanh thu": mỗi ngày (hoặc mỗi tháng trong 12 tháng) một dòng, số = A04 ngày đó (report_day_totals, mig 125).

const W = 600
const H = 160
const PAD = 8

/** Biểu đồ đường SVG: viewBox cố định, giãn theo bề ngang khung (preserveAspectRatio none). Nhãn trục là HTML để không méo. */
export function RevenueLine({ rows, grain }: { rows: RevenueRow[]; grain: RevenueGrain }) {
  if (rows.length === 0) return null
  const max = Math.max(0, ...rows.map((r) => r.revenue))
  const x = (i: number) => (rows.length === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (rows.length - 1))
  const y = (v: number) => (max > 0 ? H - PAD - (v / max) * (H - 2 * PAD) : H - PAD)
  const pts = rows.map((r, i) => [Math.round(x(i) * 10) / 10, Math.round(y(r.revenue) * 10) / 10] as const)
  return (
    <figure className="space-y-1">
      <p className="text-[12px] tabular text-muted">Cao nhất {formatVND(max)}</p>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="160" role="img"
        aria-label="Doanh thu theo thời gian" className="block h-40 text-primary">
        <line x1={0} y1={H - PAD} x2={W} y2={H - PAD} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <polyline points={pts.map(([px, py]) => `${px},${py}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={2}
          strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {pts.map(([px, py], i) => <circle key={rows[i].date || i} cx={px} cy={py} r={3} fill="currentColor" />)}
      </svg>
      <figcaption className="flex justify-between text-[12px] tabular text-muted">
        <span>{revenueRowLabel(rows[0], grain)}</span>
        {rows.length > 1 ? <span>{revenueRowLabel(rows[rows.length - 1], grain)}</span> : null}
      </figcaption>
    </figure>
  )
}

const COLS = ['Doanh thu', 'Giảm giá', 'Tiền mặt', 'Chuyển khoản', 'Ghi nợ', 'Số bill', 'TB/bill'] as const

function cells(r: Omit<RevenueRow, 'date'>): string[] {
  return [
    formatVND(r.revenue), formatVND(r.discountTotal), formatVND(r.cash), formatVND(r.bank), formatVND(r.debt),
    formatQty(r.billsCount), formatVND(avgPerBill(r.revenue, r.billsCount)),
  ]
}

export default function RevenueView({ report }: { report: RevenueReport }) {
  const { rows, totals, grain } = report
  const unit = grain === 'month' ? 'Tháng' : 'Ngày'
  const hasRevenue = rows.some((r) => r.revenue !== 0 || r.billsCount !== 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Doanh thu" value={formatVND(totals.revenue)} />
        <Stat label="Số bill" value={formatQty(totals.billsCount)} />
        <Stat label="TB/bill" value={formatVND(avgPerBill(totals.revenue, totals.billsCount))} />
        <Stat label="Giảm giá" value={formatVND(totals.discountTotal)} />
      </div>

      {rows.length === 0 || !hasRevenue ? (
        <section className="rounded-xl border border-border bg-surface"><EmptyState>{EMPTY_TEXT}</EmptyState></section>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-surface p-4 md:p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              {grain === 'month'
                ? `Doanh thu 12 tháng, ${revenueRowLabel(rows[0], 'month')} – ${revenueRowLabel(rows[rows.length - 1], 'month')}`
                : 'Doanh thu theo ngày'}
            </h2>
            <RevenueLine rows={rows} grain={grain} />
          </section>

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
                    <td className="px-4 py-3 font-medium tabular text-foreground">{revenueRowLabel(r, grain)}</td>
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
                    <span className="font-medium tabular text-foreground">{revenueRowLabel(r, grain)}</span>
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
      {totals.other > 0 ? (
        <p className="text-[13px] text-muted">Có {formatVND(totals.other)} thu qua ví / phương thức khác (không nằm trong TM, CK, nợ).</p>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface p-3 md:p-4">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular text-foreground md:text-2xl">{value}</p>
    </div>
  )
}
