// Báo cáo bán hàng (mig 117): kiểu dữ liệu + đọc JSON của 4 RPC report_sales_by_item / _by_category / _by_hour /
// report_voids. Tiền đã tính ở server — ở đây chỉ đổi tên trường / ép kiểu, không cộng trừ lại (trừ % hiển thị).
import type { SalesTab } from './tabs'

export type SalesSummary = {
  itemsAmount: number; discountTotal: number; revenue: number; qtySold: number; qtyGift: number; openTablesCount: number
}
export type ReportHead = { from: string; to: string; periodFrom: string; periodTo: string }
export type SalesItemRow = {
  itemName: string; categoryId: string | null; categoryName: string; qtySold: number; qtyGift: number; amount: number
}
export type SalesCategoryRow = {
  categoryId: string | null; categoryName: string; qtySold: number; qtyGift: number; amount: number
  items: Omit<SalesItemRow, 'categoryId' | 'categoryName'>[]
}
export type SalesHourRow = { hour: number; ordersCount: number; itemsQty: number; amount: number }
export type VoidType = 'cancelled' | 'gift' | 'quantity'
export type VoidRow = {
  at: string; type: VoidType; tableLabel: string; itemName: string; quantity: number; amount: number
  reason: string | null; byName: string | null
}
export type VoidTotals = { cancelledAmount: number; giftAmount: number; reducedAmount: number; count: number }

export type SalesReport =
  | { tab: 'item'; head: ReportHead; summary: SalesSummary; rows: SalesItemRow[] }
  | { tab: 'category'; head: ReportHead; summary: SalesSummary; rows: SalesCategoryRow[] }
  | { tab: 'hour'; head: ReportHead; summary: SalesSummary; rows: SalesHourRow[] }
  | { tab: 'voids'; head: ReportHead; totals: VoidTotals; rows: VoidRow[] }

/** Giờ 18 → '18:00'. Một chỗ cho trang Theo giờ và Excel. */
export const hourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

/** Báo cáo bán hàng (khác báo cáo tài chính cùng trang). */
export const isSalesReport = (r: { tab: string }): r is SalesReport =>
  r.tab === 'item' || r.tab === 'category' || r.tab === 'hour' || r.tab === 'voids'

export const VOID_TYPE_LABEL: Record<VoidType, string> = { cancelled: 'Bỏ', gift: 'Tặng', quantity: 'Giảm SL' }

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
/** Bỏ phần tử không phải object (rác trong mảng). */
const objs = (v: unknown): Obj[] => arr(v).filter((x) => x && typeof x === 'object' && !Array.isArray(x)) as Obj[]

function head(o: Obj): ReportHead {
  return { from: str(o.from), to: str(o.to), periodFrom: str(o.period_from), periodTo: str(o.period_to) }
}

function summary(v: unknown): SalesSummary {
  const s = obj(v)
  return {
    itemsAmount: num(s.items_amount), discountTotal: num(s.discount_total), revenue: num(s.revenue),
    qtySold: num(s.qty_sold), qtyGift: num(s.qty_gift), openTablesCount: num(s.open_tables_count),
  }
}

const itemCore = (r: Obj) => ({ itemName: str(r.item_name), qtySold: num(r.qty_sold), qtyGift: num(r.qty_gift), amount: num(r.amount) })

function itemRow(r: Obj): SalesItemRow {
  const core = itemCore(r)
  return {
    itemName: core.itemName, categoryId: strOrNull(r.category_id), categoryName: str(r.category_name) || 'Khác',
    qtySold: core.qtySold, qtyGift: core.qtyGift, amount: core.amount,
  }
}

function categoryRow(r: Obj): SalesCategoryRow {
  return {
    categoryId: strOrNull(r.category_id), categoryName: str(r.category_name) || 'Khác',
    qtySold: num(r.qty_sold), qtyGift: num(r.qty_gift), amount: num(r.amount),
    items: objs(r.items).map(itemCore),
  }
}

const hourRow = (r: Obj): SalesHourRow =>
  ({ hour: num(r.hour), ordersCount: num(r.orders_count), itemsQty: num(r.items_qty), amount: num(r.amount) })

const isVoidType = (v: unknown): v is VoidType => v === 'cancelled' || v === 'gift' || v === 'quantity'

function voidRows(v: unknown): VoidRow[] {
  // Loại lạ không gắn được nhãn nên bỏ dòng; tổng vẫn lấy từ server.
  return objs(v).filter((r) => isVoidType(r.type)).map((r) => ({
    at: str(r.at), type: r.type as VoidType, tableLabel: str(r.table_label) || '—', itemName: str(r.item_name),
    quantity: num(r.quantity), amount: num(r.amount), reason: strOrNull(r.reason), byName: strOrNull(r.by_name),
  }))
}

export function parseSalesReport(tab: SalesTab, raw: unknown): SalesReport {
  const o = obj(raw)
  const h = head(o)
  switch (tab) {
    case 'item':
      return { tab, head: h, summary: summary(o.summary), rows: objs(o.rows).map(itemRow) }
    case 'category':
      return { tab, head: h, summary: summary(o.summary), rows: objs(o.rows).map(categoryRow) }
    case 'hour':
      return { tab, head: h, summary: summary(o.summary), rows: objs(o.rows).map(hourRow) }
    case 'voids': {
      const t = obj(o.totals)
      return {
        tab, head: h,
        totals: { cancelledAmount: num(t.cancelled_amount), giftAmount: num(t.gift_amount), reducedAmount: num(t.reduced_amount), count: num(t.count) },
        rows: voidRows(o.rows),
      }
    }
  }
}

/** % một chữ số thập phân; tổng 0 ra 0. */
export function percentOf(amount: number, total: number): number {
  if (!total) return 0
  return Math.round((amount / total) * 1000) / 10
}

/** Sắp lại ở client khi người xem đổi "theo tiền" / "theo SL". Không đổi mảng gốc. */
export function sortItemRows(rows: SalesItemRow[], by: 'amount' | 'qty'): SalesItemRow[] {
  return [...rows].sort((a, b) => {
    const primary = by === 'qty' ? b.qtySold - a.qtySold || b.amount - a.amount : b.amount - a.amount || b.qtySold - a.qtySold
    return primary || a.itemName.localeCompare(b.itemName, 'vi')
  })
}

/** Phải bằng 0: Σ tiền món − giảm giá = doanh thu A04. Khác 0 là dữ liệu đơn lệch (total_amount không khớp dòng món). */
export function discountGap(s: SalesSummary): number {
  return s.itemsAmount - s.discountTotal - s.revenue
}
