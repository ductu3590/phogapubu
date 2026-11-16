import { ChevronDown, Percent, PiggyBank, ReceiptText, TrendingUp } from 'lucide-react'
import { Banner } from '@/components/ui/feedback'
import { cn, formatVND } from '@/lib/utils'
import { deltaPercent } from '@/lib/reports/compare'
import type { PnlCategoryRow, ProfitLossReport } from '@/lib/reports/finance'
import { marginPercent, opexShares, waterfallSteps } from '@/lib/reports/insights'
import { ChartLegend } from './charts/chart-legend'
import { CHART_COLORS } from './charts/palette'
import { Donut } from './charts/donut'
import { Waterfall } from './charts/waterfall'
import { KpiCard } from './kpi-card'
import { SectionCard } from './section-card'
import { VOID_LATER_NOTE, formatPercent, shortMoney } from './report-format'

// Tab "Lãi lỗ" (report_profit_loss, mig 125), bảng dọc theo spec §4.3:
// Doanh thu thuần − Giá vốn = Lãi gộp − Chi phí hoạt động − Hàng huỷ + Thu nhập khác = Lãi ròng.
// Nhập hàng / rút tiền / chuyển quỹ KHÔNG vào lãi lỗ (tiền hàng đã nằm trong giá vốn) — chỉ báo ở khối xám.

const amount = (v: number, strong = false, inherit = false) => (
  <span className={cn('tabular', strong && 'font-semibold', v < 0 ? 'text-critical' : !inherit && 'text-foreground')}>{formatVND(v)}</span>
)

function Line({ sign, label, value, strong = false, tone, children }: {
  sign?: '−' | '+' | '='; label: string; value: number; strong?: boolean; tone?: 'profit' | 'loss'; children?: React.ReactNode
}) {
  return (
    <div className={cn('px-4 py-3', strong && 'bg-background', tone === 'profit' && 'bg-success-bg text-success', tone === 'loss' && 'bg-critical-bg text-critical')}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn('min-w-0 text-sm', strong && 'font-semibold', !tone && 'text-foreground')}>
          {sign ? <span className="mr-1.5 inline-block w-3 text-muted">{sign}</span> : null}{label}
        </p>
        {amount(value, strong, tone === 'profit')}
      </div>
      {children}
    </div>
  )
}

function Sub({ rows }: { rows: { label: string; value: number }[] }) {
  return (
    <ul className="mt-1.5 space-y-1 pl-5 text-[13px] text-muted">
      {rows.map((r) => (
        <li key={r.label} className="flex justify-between gap-3"><span className="min-w-0">{r.label}</span><span className="tabular">{formatVND(r.value)}</span></li>
      ))}
    </ul>
  )
}

function CategoryDetails({ title, total, rows, sign }: { title: string; total: number; rows: PnlCategoryRow[]; sign: '−' | '+' }) {
  if (rows.length === 0) return <Line sign={sign} label={title} value={total} />
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 px-4 py-3 hover:bg-item-hover [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 text-sm text-foreground">
          <span className="mr-1.5 inline-block w-3 text-muted">{sign}</span>{title}
          <ChevronDown className="ml-1 inline size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
        </span>
        {amount(total)}
      </summary>
      <div className="px-4 pb-3"><Sub rows={rows.map((r) => ({ label: r.name, value: r.amount }))} /></div>
    </details>
  )
}

export default function ProfitLossView({ report: p, prev, compareLabel }: {
  report: ProfitLossReport; prev?: ProfitLossReport | null; compareLabel?: string
}) {
  const missing = p.warnings.missingCostItems
  const d = (cur: number, before: number | undefined) => deltaPercent(cur, before)
  const grossMargin = marginPercent(p.grossProfit, p.revenue)
  const netMargin = marginPercent(p.netProfit, p.revenue)
  // Hạng mục ≤ 0 (hoàn chi) không vẽ được lát donut → bỏ trước khi gom.
  const opex = opexShares({ ...p, operatingExpenses: { ...p.operatingExpenses, rows: p.operatingExpenses.rows.filter((r) => r.amount > 0) } })
  const opexTotal = opex.reduce((a, s) => a + s.value, 0)
  return (
    <div className="space-y-4">
      {p.warnings.ingredientUncounted ? (
        <Banner tone="warning" title="Giá vốn nguyên liệu chưa tính — cần kiểm kho">
          Có nguyên liệu biến động trong kỳ mà chưa có phiếu kiểm kho, nên giá vốn nguyên liệu đang tính là 0đ.
        </Banner>
      ) : null}
      {missing.length > 0 ? (
        <Banner tone="warning" title={`Thiếu giá nhập: ${missing.map((m) => m.name).join(', ')}`}>
          Các hàng này chưa có giá nhập nên giá vốn của chúng đang tính là 0đ.
        </Banner>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon={ReceiptText} tone="orange" label="Doanh thu thuần" value={formatVND(p.revenue)}
          delta={d(p.revenue, prev?.revenue)} compareLabel={compareLabel} />
        <KpiCard icon={TrendingUp} tone="green" label="Lãi gộp" value={formatVND(p.grossProfit)}
          valueClassName={p.grossProfit < 0 ? 'text-critical' : ''}
          delta={d(p.grossProfit, prev?.grossProfit)} compareLabel={compareLabel}
          note={grossMargin === null ? undefined : `Biên ${formatPercent(grossMargin)}`} />
        <KpiCard icon={Percent} tone="amber" label="Chi phí hoạt động" value={formatVND(p.operatingExpenses.total)} inverse
          delta={d(p.operatingExpenses.total, prev?.operatingExpenses.total)} compareLabel={compareLabel} />
        <KpiCard icon={PiggyBank} tone={p.netProfit < 0 ? 'red' : 'sky'} label="Lãi ròng" value={formatVND(p.netProfit)}
          valueClassName={p.netProfit < 0 ? 'text-critical' : ''}
          delta={d(p.netProfit, prev?.netProfit)} compareLabel={compareLabel}
          note={netMargin === null ? undefined : `Biên ${formatPercent(netMargin)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <SectionCard title="Từ doanh thu đến lãi ròng" hint="Mỗi bước trừ / cộng dần">
          {/* Vẽ một lần ở bề rộng vừa phải; điện thoại cuộn ngang trong khung để chữ vẫn đọc được (trang không cuộn ngang). */}
          <div className="overflow-x-auto px-3 pb-4 pt-2">
            <div className="min-w-[560px]">
              <Waterfall steps={waterfallSteps(p)} formatValue={shortMoney} ariaLabel="Từ doanh thu đến lãi ròng" />
            </div>
          </div>
        </SectionCard>

        <section className="min-w-0 divide-y divide-border self-start overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
          <Line label="Doanh thu thuần" value={p.revenue} strong />
          <Line sign="−" label="Giá vốn hàng bán" value={p.cogsTotal}>
            <Sub rows={[{ label: 'Hàng bán', value: p.cogsGoods }, { label: 'Nguyên liệu', value: p.cogsIngredient }]} />
          </Line>
          <Line sign="=" label="Lãi gộp" value={p.grossProfit} strong />
          <CategoryDetails sign="−" title="Chi phí hoạt động" total={p.operatingExpenses.total} rows={p.operatingExpenses.rows} />
          <Line sign="−" label="Hàng huỷ" value={p.writeoffCost} />
          <CategoryDetails sign="+" title="Thu nhập khác" total={p.otherIncome.total} rows={p.otherIncome.rows} />
          <Line sign="=" label="Lãi ròng" value={p.netProfit} strong tone={p.netProfit >= 0 ? 'profit' : 'loss'} />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Chi phí hoạt động" hint="Theo hạng mục chi trong kỳ">
          {opex.length === 0 ? (
            <p className="px-5 pb-5 pt-3 text-sm text-muted">Chưa có chi phí hoạt động trong kỳ này.</p>
          ) : (
            <div className="flex flex-col items-center gap-5 px-5 pb-5 pt-4 sm:flex-row">
              <Donut
                slices={opex.map((s, i) => ({ label: s.label, value: s.value, color: CHART_COLORS[i] }))}
                center={shortMoney(opexTotal)}
                caption="CHI PHÍ"
              />
              <ChartLegend
                items={opex.map((s, i) => ({ label: s.label, sub: formatVND(s.value), percent: (s.value / opexTotal) * 100, color: CHART_COLORS[i] }))}
              />
            </div>
          )}
        </SectionCard>

        <section className="self-start rounded-2xl bg-secondary p-4 text-sm">
          <p className="font-medium text-foreground">Không tính vào lãi lỗ</p>
          <ul className="mt-2 space-y-1 text-muted">
            <li className="flex justify-between gap-3"><span>Nhập hàng (đã nằm trong giá vốn)</span><span className="tabular">{formatVND(p.excluded.inventoryPurchase)}</span></li>
            <li className="flex justify-between gap-3"><span>Chủ quán rút</span><span className="tabular">{formatVND(p.excluded.ownerDraw)}</span></li>
            <li className="flex justify-between gap-3"><span>Chuyển quỹ (tổng phiếu, không tính)</span><span className="tabular">{formatVND(p.excluded.cashTransfer)}</span></li>
          </ul>
        </section>
      </div>

      <p className="text-[13px] text-muted">{VOID_LATER_NOTE}</p>
    </div>
  )
}
