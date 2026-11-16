// Rút xếp hạng / nhận xét từ dữ liệu RPC đã có (hàm thuần). Không tự nghĩ công thức tiền: chỉ gom, xếp, max-min, %.
import type { WaterfallStep } from './chart-geometry'
import type { CashFlowOutLine, ProfitLossReport, ReceivableAmounts, ReceivableRow, RevenueRow, RevenueTotals } from './finance'
import { daysBetween } from './period'
import { sortItemRows } from './sales'
import type { SalesCategoryRow, SalesHourRow, SalesItemRow, VoidRow } from './sales'

export type Share = { key: string; label: string; value: number; qty?: number }

const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * Sắp giảm dần; quá `max` lát thì giữ `max` lát đầu + 1 lát `__rest` gộp phần còn lại.
 * Lát 'other' (món mất danh mục) luôn rơi vào `__rest` khi có `__rest` — để không bao giờ có hai lát "Khác".
 */
export function topWithRest(items: Share[], max: number, restLabel = 'Khác'): Share[] {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  if (sorted.length <= max) return sorted
  const head = sorted.filter((s) => s.key !== 'other').slice(0, max)
  const rest = sorted.filter((s) => !head.includes(s))
  const hasQty = rest.some((s) => s.qty !== undefined)
  const merged: Share = { key: '__rest', label: restLabel, value: rest.reduce((a, s) => a + s.value, 0) }
  if (hasQty) merged.qty = rest.reduce((a, s) => a + (s.qty ?? 0), 0)
  return [...head, merged]
}

/** Gom theo danh mục (categoryId rỗng → 'other'), giữ thứ tự đầu tiên gặp để hoà thì ổn định. */
function groupShares(rows: { categoryId: string | null; categoryName: string; qty: number; amount: number }[]): Share[] {
  const map = new Map<string, Share>()
  for (const r of rows) {
    const key = r.categoryId ?? 'other'
    const cur = map.get(key)
    if (cur) { cur.value += r.amount; cur.qty = (cur.qty ?? 0) + r.qty }
    else map.set(key, { key, label: r.categoryId ? r.categoryName : 'Khác', value: r.amount, qty: r.qty })
  }
  return topWithRest([...map.values()], 5)
}

export const itemCategoryShares = (rows: SalesItemRow[]): Share[] =>
  groupShares(rows.map((r) => ({ categoryId: r.categoryId, categoryName: r.categoryName, qty: r.qtySold, amount: r.amount })))

export const categoryShares = (rows: SalesCategoryRow[]): Share[] =>
  groupShares(rows.map((r) => ({ categoryId: r.categoryId, categoryName: r.categoryName, qty: r.qtySold, amount: r.amount })))

export const topItems = (rows: SalesItemRow[], by: 'amount' | 'qty', n = 5): SalesItemRow[] => sortItemRows(rows, by).slice(0, n)

export function hourSummary(rows: SalesHourRow[]): {
  peakHour: number; peakAmount: number; busiestHour: number; busiestOrders: number; totalOrders: number; avgPerOrder: number
} | null {
  const totalAmount = rows.reduce((a, r) => a + r.amount, 0)
  const totalOrders = rows.reduce((a, r) => a + r.ordersCount, 0)
  if (rows.length === 0 || (totalAmount === 0 && totalOrders === 0)) return null
  // So sánh ">" chặt nên hoà thì giữ giờ đứng trước theo thứ tự server.
  let peak = rows[0]
  let busiest = rows[0]
  for (const r of rows) {
    if (r.amount > peak.amount) peak = r
    if (r.ordersCount > busiest.ordersCount) busiest = r
  }
  return {
    peakHour: peak.hour, peakAmount: peak.amount, busiestHour: busiest.hour, busiestOrders: busiest.ordersCount,
    totalOrders, avgPerOrder: totalOrders > 0 ? Math.round(totalAmount / totalOrders) : 0,
  }
}

/**
 * Chỉ dùng cho BIỂU ĐỒ: server chỉ trả giờ có hoạt động, nên giờ trống giữa hai dòng được lấp bằng dòng 0
 * (không thì đường cong nối thẳng 11h với 18h). Đi theo thứ tự ngày kinh doanh của server: từ giờ của dòng đầu
 * bước (h+1)%24 tới giờ của dòng cuối, nên 18,19,…,23,0,1 vẫn đúng. Bảng giữ nguyên dòng gốc.
 */
export function fillHourGaps(rows: SalesHourRow[]): SalesHourRow[] {
  if (rows.length < 2) return rows
  const byHour = new Map(rows.map((r) => [r.hour, r]))
  const last = rows[rows.length - 1].hour
  const out: SalesHourRow[] = []
  let h = rows[0].hour
  for (let guard = 0; guard < 24; guard++) {
    out.push(byHour.get(h) ?? { hour: h, ordersCount: 0, itemsQty: 0, amount: 0 })
    if (h === last) break
    h = (h + 1) % 24
  }
  return out
}

export function voidTopItems(rows: VoidRow[], n = 4): { itemName: string; quantity: number }[] {
  const map = new Map<string, number>()
  for (const r of rows) map.set(r.itemName, (map.get(r.itemName) ?? 0) + r.quantity)
  return [...map].map(([itemName, quantity]) => ({ itemName, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.itemName.localeCompare(b.itemName, 'vi')).slice(0, n)
}

export function voidReasons(rows: VoidRow[], n = 5): { reason: string; count: number }[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const reason = r.reason ?? 'Không ghi lý do'
    map.set(reason, (map.get(reason) ?? 0) + 1)
  }
  return [...map].map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, 'vi')).slice(0, n)
}

export function revenueExtremes(rows: RevenueRow[]): { best: RevenueRow; worst: RevenueRow; avg: number } | null {
  const withBills = rows.filter((r) => r.billsCount > 0)
  if (withBills.length === 0) return null
  let best = rows[0]
  for (const r of rows) if (r.revenue > best.revenue) best = r
  let worst = withBills[0]
  for (const r of withBills) if (r.revenue < worst.revenue) worst = r
  return { best, worst, avg: Math.round(rows.reduce((a, r) => a + r.revenue, 0) / rows.length) }
}

export function paymentMix(t: RevenueTotals): Share[] {
  const all: Share[] = [
    { key: 'cash', label: 'Tiền mặt', value: t.cash }, { key: 'bank', label: 'Chuyển khoản', value: t.bank },
    { key: 'debt', label: 'Ghi nợ', value: t.debt }, { key: 'other', label: 'Ví / khác', value: t.other },
  ]
  return all.filter((s) => s.value > 0)
}

export function outflowBars(lines: CashFlowOutLine[]): { key: string; label: string; cash: number; bank: number; total: number }[] {
  return lines
    .filter((l) => l.reportGroup !== 'cash_transfer') // chuyển quỹ chỉ đổi chỗ tiền, không phải chi thật
    .map((l) => {
      const cash = Math.max(0, l.cash)
      const bank = Math.max(0, l.bank)
      return { key: l.key, label: l.label, cash, bank, total: cash + bank }
    })
    .filter((l) => l.total > 0)
    .sort((a, b) => b.total - a.total)
}

/** Khớp SQL report_profit_loss: net = gross − chi phí − giá vốn huỷ + thu khác. */
export function waterfallSteps(p: ProfitLossReport): WaterfallStep[] {
  return [
    { label: 'Doanh thu', value: p.revenue, kind: 'total' },
    { label: 'Giá vốn', value: -p.cogsTotal, kind: 'delta' },
    { label: 'Lãi gộp', value: p.grossProfit, kind: 'total' },
    { label: 'Chi phí', value: -p.operatingExpenses.total, kind: 'delta' },
    { label: 'Huỷ + khác', value: -p.writeoffCost + p.otherIncome.total, kind: 'delta' },
    { label: 'Lãi ròng', value: p.netProfit, kind: 'total' },
  ]
}

export const marginPercent = (part: number, revenue: number): number | null => (revenue <= 0 ? null : round1((part / revenue) * 100))

export const opexShares = (p: ProfitLossReport): Share[] =>
  topWithRest(p.operatingExpenses.rows.map((r) => ({ key: r.categoryId ?? 'other', label: r.name, value: r.amount })), 4)

export const topDebtors = (rows: ReceivableRow[], n = 4): ReceivableRow[] =>
  rows.filter((r) => r.closing > 0).sort((a, b) => b.closing - a.closing).slice(0, n)

export function collectedRate(t: ReceivableAmounts): number | null {
  const base = t.opening + t.incurred
  return base <= 0 ? null : round1((t.collected / base) * 100)
}

export const debtAgeDays = (oldestOpenDate: string | null, periodTo: string): number | null =>
  oldestOpenDate ? daysBetween(oldestOpenDate, periodTo) : null

