import { ChevronDown } from 'lucide-react'
import { Banner } from '@/components/ui/feedback'
import { cn, formatVND } from '@/lib/utils'
import type { PnlCategoryRow, ProfitLossReport } from '@/lib/reports/finance'
import { VOID_LATER_NOTE } from './report-format'

// Tab "Lãi lỗ" (report_profit_loss, mig 125), bảng dọc theo spec §4.3:
// Doanh thu thuần − Giá vốn = Lãi gộp − Chi phí hoạt động − Hàng huỷ + Thu nhập khác = Lãi ròng.
// Nhập hàng / rút tiền / chuyển quỹ KHÔNG vào lãi lỗ (tiền hàng đã nằm trong giá vốn) — chỉ báo ở khối xám.

const amount = (v: number, strong = false) => (
  <span className={cn('tabular', strong && 'font-semibold', v < 0 ? 'text-critical' : 'text-foreground')}>{formatVND(v)}</span>
)

function Line({ sign, label, value, strong = false, children }: {
  sign?: '−' | '+' | '='; label: string; value: number; strong?: boolean; children?: React.ReactNode
}) {
  return (
    <div className={cn('px-4 py-3', strong && 'bg-background')}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn('min-w-0 text-sm', strong ? 'font-semibold text-foreground' : 'text-foreground')}>
          {sign ? <span className="mr-1.5 inline-block w-3 text-muted">{sign}</span> : null}{label}
        </p>
        {amount(value, strong)}
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

export default function ProfitLossView({ report: p }: { report: ProfitLossReport }) {
  const missing = p.warnings.missingCostItems
  return (
    <div className="space-y-5">
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

      <section className="min-w-0 divide-y divide-border rounded-xl border border-border bg-surface">
        <Line label="Doanh thu thuần" value={p.revenue} strong />
        <Line sign="−" label="Giá vốn hàng bán" value={p.cogsTotal}>
          <Sub rows={[{ label: 'Hàng bán', value: p.cogsGoods }, { label: 'Nguyên liệu', value: p.cogsIngredient }]} />
        </Line>
        <Line sign="=" label="Lãi gộp" value={p.grossProfit} strong />
        <CategoryDetails sign="−" title="Chi phí hoạt động" total={p.operatingExpenses.total} rows={p.operatingExpenses.rows} />
        <Line sign="−" label="Hàng huỷ" value={p.writeoffCost} />
        <CategoryDetails sign="+" title="Thu nhập khác" total={p.otherIncome.total} rows={p.otherIncome.rows} />
        <Line sign="=" label="Lãi ròng" value={p.netProfit} strong />
      </section>

      <section className="rounded-xl bg-secondary p-4 text-sm">
        <p className="font-medium text-foreground">Không tính vào lãi lỗ</p>
        <ul className="mt-2 space-y-1 text-muted">
          <li className="flex justify-between gap-3"><span>Nhập hàng (đã nằm trong giá vốn)</span><span className="tabular">{formatVND(p.excluded.inventoryPurchase)}</span></li>
          <li className="flex justify-between gap-3"><span>Chủ quán rút</span><span className="tabular">{formatVND(p.excluded.ownerDraw)}</span></li>
          <li className="flex justify-between gap-3"><span>Chuyển quỹ (tổng phiếu, không tính)</span><span className="tabular">{formatVND(p.excluded.cashTransfer)}</span></li>
        </ul>
      </section>

      <p className="text-[13px] text-muted">{VOID_LATER_NOTE}</p>
    </div>
  )
}
