// Sổ thu chi (mig 122): kiểu + parse JSON của RPC cash_book_list / bảng cash_book_categories, bộ lọc trang
// /admin/cashbook, gom theo danh mục cho phiếu bàn giao ca. Hàm thuần, không gọi mạng. Mọi con số tiền do server
// tính; ở đây chỉ cộng lại ba ô tổng (thu, chi, chênh lệch) từ bốn số server đã trả.
import type { CashShiftEntry } from './cash-shift'
import {
  isObj, kindOf, methodOf, num, oneOf, sourceOf, str,
  type CashBookKind, type CashBookMethod, type CashBookSource,
} from './cash-common'

export type { CashBookKind, CashBookMethod, CashBookSource } from './cash-common'
export type ReportGroup = 'operating_expense' | 'inventory_purchase' | 'owner_draw' | 'other_income' | 'cash_transfer'

export type CashBookCategory = {
  id: string
  kind: CashBookKind
  name: string
  reportGroup: ReportGroup
  isSystem: boolean
  isActive: boolean
  requiresNote: boolean
  sortOrder: number
}

export type CashBookEntry = {
  id: string
  kind: CashBookKind
  method: CashBookMethod
  categoryId: string
  categoryName: string
  reportGroup: ReportGroup
  amount: number
  note: string | null
  counterparty: string | null
  businessDate: string
  createdAt: string
  createdByName: string | null
  cashShiftId: string | null
  shiftOpenedAt: string | null
  source: CashBookSource
  sourceRef: string | null
  voidedAt: string | null
  voidedByName: string | null
  voidReason: string | null
}

export type CashBookTotals = {
  receiptCash: number
  receiptBank: number
  paymentCash: number
  paymentBank: number
  receiptTotal: number
  paymentTotal: number
  /** thu − chi (âm = chi nhiều hơn thu) */
  net: number
}

export type CashbookFilters = {
  from: string
  to: string
  kind: CashBookKind | null
  method: CashBookMethod | null
  categoryId: string | null
}

export const REPORT_GROUP_LABEL: Record<ReportGroup, string> = {
  operating_expense: 'Chi phí vận hành',
  inventory_purchase: 'Nhập hàng',
  owner_draw: 'Chủ quán rút',
  other_income: 'Thu khác',
  cash_transfer: 'Chuyển tiền quỹ',
}

/** Nhóm người dùng được chọn khi tạo / sửa danh mục. "Nhập hàng" chỉ dành cho danh mục hệ thống. */
export function userReportGroups(kind: CashBookKind): ReportGroup[] {
  return kind === 'payment' ? ['operating_expense', 'owner_draw', 'cash_transfer'] : ['other_income', 'cash_transfer']
}

const GROUPS = ['operating_expense', 'inventory_purchase', 'owner_draw', 'other_income', 'cash_transfer'] as const

function parseEntry(raw: unknown): CashBookEntry | null {
  if (!isObj(raw)) return null
  const id = str(raw.id)
  const kind = kindOf(raw.kind)
  const method = methodOf(raw.method)
  const categoryId = str(raw.category_id)
  const categoryName = str(raw.category_name)
  const reportGroup = oneOf(raw.report_group, GROUPS)
  const amount = num(raw.amount)
  const businessDate = str(raw.business_date)
  const createdAt = str(raw.created_at)
  const source = sourceOf(raw.source)
  if (!id || !kind || !method || !categoryId || categoryName === null || !reportGroup || amount === null
    || !businessDate || !createdAt || !source) return null
  return {
    id, kind, method, categoryId, categoryName, reportGroup, amount,
    note: str(raw.note),
    counterparty: str(raw.counterparty),
    businessDate,
    createdAt,
    createdByName: str(raw.created_by_name),
    cashShiftId: str(raw.cash_shift_id),
    shiftOpenedAt: str(raw.shift_opened_at),
    source,
    sourceRef: str(raw.source_ref),
    voidedAt: str(raw.voided_at),
    voidedByName: str(raw.voided_by_name),
    voidReason: str(raw.void_reason),
  }
}

export function parseCashBookList(raw: unknown): { entries: CashBookEntry[]; totals: CashBookTotals; truncated: boolean } {
  const r = isObj(raw) ? raw : {}
  const t = isObj(r.totals) ? r.totals : {}
  const receiptCash = num(t.receipt_cash) ?? 0
  const receiptBank = num(t.receipt_bank) ?? 0
  const paymentCash = num(t.payment_cash) ?? 0
  const paymentBank = num(t.payment_bank) ?? 0
  const receiptTotal = receiptCash + receiptBank
  const paymentTotal = paymentCash + paymentBank
  return {
    entries: (Array.isArray(r.entries) ? r.entries : []).map(parseEntry).filter((e): e is CashBookEntry => e !== null),
    totals: { receiptCash, receiptBank, paymentCash, paymentBank, receiptTotal, paymentTotal, net: receiptTotal - paymentTotal },
    truncated: r.truncated === true,
  }
}

/** Cột đọc thẳng bảng cash_book_categories (server component lẫn trình duyệt dùng chung). */
export const CASH_BOOK_CATEGORY_COLUMNS = 'id, kind, name, report_group, is_system, is_active, requires_note, sort_order'

/** Hàng bảng cash_book_categories (snake_case). */
export function parseCashBookCategories(rows: unknown): CashBookCategory[] {
  if (!Array.isArray(rows)) return []
  const out: CashBookCategory[] = []
  for (const row of rows) {
    if (!isObj(row)) continue
    const id = str(row.id)
    const kind = kindOf(row.kind)
    const name = str(row.name)
    const reportGroup = oneOf(row.report_group, GROUPS)
    if (!id || !kind || !name || !reportGroup) continue
    out.push({
      id, kind, name, reportGroup,
      isSystem: row.is_system === true,
      isActive: row.is_active !== false,
      requiresNote: row.requires_note === true,
      sortOrder: num(row.sort_order) ?? 0,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Bộ lọc trang /admin/cashbook (?from=&to=&kind=&method=&category=)
// ---------------------------------------------------------------------------
const MAX_RANGE_DAYS = 92
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validDate(v: string | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const [y, m, d] = v.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? v : null
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  const ms = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((ms(to) - ms(from)) / 86_400_000)
}

/**
 * `today` = ngày kinh doanh hiện tại của quán (không phải ngày lịch). Không xem được ngày tương lai; from > to thì
 * đổi chỗ; khoảng dài quá 92 ngày thì cắt from (server cho tới 366, trang giữ gọn cho 2000 dòng).
 */
export function parseCashbookFilters(sp: Record<string, string | undefined>, today: string): CashbookFilters {
  const clamp = (d: string) => (d > today ? today : d)
  let from = clamp(validDate(sp.from) ?? today)
  let to = clamp(validDate(sp.to) ?? today)
  if (from > to) [from, to] = [to, from]
  if (daysBetween(from, to) > MAX_RANGE_DAYS) from = addDays(to, -MAX_RANGE_DAYS)
  return {
    from,
    to,
    kind: kindOf(sp.kind),
    method: methodOf(sp.method),
    categoryId: sp.category && UUID_RE.test(sp.category) ? sp.category : null,
  }
}

export function filtersToSearch(f: CashbookFilters): string {
  const p = new URLSearchParams({ from: f.from, to: f.to })
  if (f.kind) p.set('kind', f.kind)
  if (f.method) p.set('method', f.method)
  if (f.categoryId) p.set('category', f.categoryId)
  return p.toString()
}

/** p_filters của cash_book_list: chỉ khoá đang lọc. */
export function filtersToRpc(f: CashbookFilters): Record<string, string> {
  const out: Record<string, string> = {}
  if (f.kind) out.kind = f.kind
  if (f.method) out.method = f.method
  if (f.categoryId) out.category_id = f.categoryId
  return out
}

// ---------------------------------------------------------------------------
// Phiếu bàn giao ca: thu / chi theo danh mục, bỏ phiếu đã huỷ. Thu trước, chi sau; trong mỗi loại tiền lớn trước.
// ---------------------------------------------------------------------------
export function groupByCategory(
  entries: CashShiftEntry[],
): { kind: CashBookKind; categoryName: string; total: number; count: number }[] {
  const map = new Map<string, { kind: CashBookKind; categoryName: string; total: number; count: number }>()
  for (const e of entries) {
    if (e.voidedAt) continue
    const key = `${e.kind}\u0000${e.categoryName}`
    const g = map.get(key) ?? { kind: e.kind, categoryName: e.categoryName, total: 0, count: 0 }
    g.total += e.amount
    g.count += 1
    map.set(key, g)
  }
  return [...map.values()].sort((a, b) =>
    a.kind !== b.kind ? (a.kind === 'receipt' ? -1 : 1) : b.total - a.total || a.categoryName.localeCompare(b.categoryName, 'vi'))
}
