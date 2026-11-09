// Báo cáo tài chính (mig 125): kiểu dữ liệu + đọc JSON của 4 RPC report_revenue_series / report_cash_flow /
// report_profit_loss / report_receivables. Tiền đã tính ở server — ở đây chỉ đổi tên trường / ép kiểu.
import type { ReportHead } from './sales'

export type RevenueGrain = 'day' | 'month'
export type RevenueRow = {
  date: string; revenue: number; discountTotal: number; cash: number; bank: number; debt: number; other: number; billsCount: number
}
export type RevenueTotals = Omit<RevenueRow, 'date'>

export type FundTotals = { in: number; out: number; net: number }
export type CashFlowLine = { key: string; label: string; cash: number; bank: number }
export type CashFlowOutLine = CashFlowLine & { reportGroup: string }
export type CashFlowReport = {
  tab: 'cashflow'; head: ReportHead
  funds: { cash: FundTotals; bank: FundTotals }
  inflows: CashFlowLine[]
  outflows: CashFlowOutLine[]
}

export type PnlCategoryRow = { categoryId: string | null; name: string; amount: number }
export type ProfitLossReport = {
  tab: 'pnl'; head: ReportHead
  revenue: number; cogsGoods: number; cogsIngredient: number; cogsTotal: number; grossProfit: number
  operatingExpenses: { total: number; rows: PnlCategoryRow[] }
  writeoffCost: number
  otherIncome: { total: number; rows: PnlCategoryRow[] }
  netProfit: number
  excluded: { inventoryPurchase: number; ownerDraw: number; cashTransfer: number }
  warnings: { ingredientUncounted: boolean; missingCostItems: { inventoryItemId: string; name: string }[] }
}

export type ReceivableAmounts = {
  opening: number; incurred: number; collected: number; closing: number; age0to7: number; age8to30: number; ageOver30: number
}
export type ReceivableRow = ReceivableAmounts & {
  customerId: string; name: string; phone: string | null; kind: string; oldestOpenDate: string | null
}
export type ReceivablesReport = { tab: 'debts'; head: ReportHead; totals: ReceivableAmounts; rows: ReceivableRow[] }

export type RevenueReport = { tab: 'revenue'; grain: RevenueGrain; head: ReportHead; rows: RevenueRow[]; totals: RevenueTotals }

export type FinanceReport = RevenueReport | CashFlowReport | ProfitLossReport | ReceivablesReport

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const objs = (v: unknown): Obj[] =>
  (Array.isArray(v) ? v : []).filter((x) => x && typeof x === 'object' && !Array.isArray(x)) as Obj[]
// Cờ cảnh báo chỉ bật khi server trả đúng boolean true (chuỗi 'true' hay số không tính).
const flag = (v: unknown): boolean => v === true

const head = (o: Obj): ReportHead => ({ from: str(o.from), to: str(o.to), periodFrom: str(o.period_from), periodTo: str(o.period_to) })

const revenueAmounts = (r: Obj): RevenueTotals => ({
  revenue: num(r.revenue), discountTotal: num(r.discount_total), cash: num(r.cash), bank: num(r.bank),
  debt: num(r.debt), other: num(r.other), billsCount: num(r.bills_count),
})

const fund = (v: unknown): FundTotals => { const f = obj(v); return { in: num(f.in), out: num(f.out), net: num(f.net) } }
const flowLine = (r: Obj): CashFlowLine => ({ key: str(r.key), label: str(r.label), cash: num(r.cash), bank: num(r.bank) })
const pnlRows = (v: unknown): PnlCategoryRow[] =>
  objs(v).map((r) => ({ categoryId: strOrNull(r.category_id), name: str(r.name), amount: num(r.amount) }))
const receivableAmounts = (r: Obj): ReceivableAmounts => ({
  opening: num(r.opening), incurred: num(r.incurred), collected: num(r.collected), closing: num(r.closing),
  age0to7: num(r.age_0_7), age8to30: num(r.age_8_30), ageOver30: num(r.age_over_30),
})

export function parseFinanceReport(tab: FinanceReport['tab'], raw: unknown): FinanceReport {
  const o = obj(raw)
  switch (tab) {
    case 'revenue':
      return {
        tab, grain: o.grain === 'month' ? 'month' : 'day', head: head(o),
        rows: objs(o.rows).map((r) => ({ date: str(r.date), ...revenueAmounts(r) })),
        totals: revenueAmounts(obj(o.totals)),
      }
    case 'cashflow': {
      const f = obj(o.funds)
      return {
        tab, head: head(o), funds: { cash: fund(f.cash), bank: fund(f.bank) },
        inflows: objs(o.inflows).map(flowLine),
        outflows: objs(o.outflows).map((r) => ({ ...flowLine(r), reportGroup: str(r.report_group) })),
      }
    }
    case 'pnl': {
      const opex = obj(o.operating_expenses)
      const income = obj(o.other_income)
      const ex = obj(o.excluded)
      const w = obj(o.warnings)
      return {
        tab, head: head(o),
        revenue: num(o.revenue), cogsGoods: num(o.cogs_goods), cogsIngredient: num(o.cogs_ingredient),
        cogsTotal: num(o.cogs_total), grossProfit: num(o.gross_profit),
        operatingExpenses: { total: num(opex.total), rows: pnlRows(opex.rows) },
        writeoffCost: num(o.writeoff_cost),
        otherIncome: { total: num(income.total), rows: pnlRows(income.rows) },
        netProfit: num(o.net_profit),
        excluded: { inventoryPurchase: num(ex.inventory_purchase), ownerDraw: num(ex.owner_draw), cashTransfer: num(ex.cash_transfer) },
        warnings: {
          ingredientUncounted: flag(w.ingredient_uncounted),
          missingCostItems: objs(w.missing_cost_items).map((x) => ({ inventoryItemId: str(x.inventory_item_id), name: str(x.name) })),
        },
      }
    }
    case 'debts':
      return {
        tab, head: head(o), totals: receivableAmounts(obj(o.totals)),
        rows: objs(o.rows).map((r) => ({
          ...receivableAmounts(r), customerId: str(r.customer_id), name: str(r.name), phone: strOrNull(r.phone),
          kind: str(r.kind), oldestOpenDate: strOrNull(r.oldest_open_date),
        })),
      }
  }
}

/** Trung bình mỗi bill, làm tròn đồng; 0 bill ra 0. */
export function avgPerBill(revenue: number, billsCount: number): number {
  return billsCount > 0 ? Math.round(revenue / billsCount) : 0
}

/** '01/12' (ngày) hoặc '12/2026' (tháng). */
export function revenueRowLabel(row: RevenueRow, grain: RevenueGrain): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return '—'
  return grain === 'month' ? `${row.date.slice(5, 7)}/${row.date.slice(0, 4)}` : `${row.date.slice(8, 10)}/${row.date.slice(5, 7)}`
}
