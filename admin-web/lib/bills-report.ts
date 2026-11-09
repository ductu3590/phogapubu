// Trang "Hoá đơn & Báo cáo" (A04-1): kiểu dữ liệu + đọc JSON của RPC get_bills_report (mig 100) + gom dòng,
// lọc chip, tìm kiếm, phân trang. Tiền đã tính ở server — ở đây chỉ đổi tên trường / ép kiểu, KHÔNG cộng trừ gì.
import type { ReportInstrument } from '@/lib/daily-report'
import { rejectReasonLabel } from '@/lib/pos-bill-history'
import { parsePaymentLines, type Instrument, type PaymentLine } from '@/lib/collect-payment'
import { instrumentLabel } from '@/lib/daily-report'

export type BillsReportBill = {
  key: string; paidAt: string; openedAt: string; sessionIds: string[]; orderIds: string[]; merged: boolean
  tablesCount: number; total: number; discountTotal: number
  /** Mig 108: phần giảm giá cả bill nằm trong discountTotal (tiền đã trừ sẵn trong total — KHÔNG trừ lại). */
  billDiscount: number
  instrument: ReportInstrument; orderType: string
  itemsCount: number; tableLabel: string; customerName: string | null; partySize: number | null
  adjustmentsCount: number; receivedByName: string | null
  /** Mig 112a: từng khoản của lần thu (tiền mặt là số RÒNG); bill thu trước 112a thì rỗng. */
  payments: PaymentLine[]
  /** Mig 112a: tiền khách đưa / tiền thối của lần thu; null khi không ghi. */
  cashGiven: number | null
  changeAmount: number | null
}

export type BillsReportWaiting = {
  key: string; sessionIds: string[]; orderIds: string[]; openedAt: string; isTray: boolean; expired: boolean
  tablesCount: number; tableLabel: string; orderType: string; customerName: string | null; partySize: number | null
  itemsCount: number; provisionalTotal: number
}

export type BillsReportCancelled = {
  orderId: string; sessionId: string | null; at: string; createdAt: string; kind: 'rejected' | 'cancelled'
  reasonCode: string | null; reasonNote: string | null; total: number; orderType: string; orderSource: string
  customerName: string | null; tableLabel: string
}

export type BillsReportAdjustment = {
  at: string; type: 'cancelled' | 'gift' | 'quantity'; itemName: string; quantity: number
  oldQuantity: number | null; newQuantity: number | null; amount: number; reason: string | null
  tableLabel: string; byName: string | null
}

export type BillsReport = {
  date: string
  /** Mig 111: mốc cắt của ngày kinh doanh. Rỗng khi server chưa áp mig. */
  dayFrom: string
  dayTo: string
  totals: { revenue: number; cash: number; bank: number; other: number; billsCount: number }
  open: { tablesCount: number; provisionalTotal: number }
  bills: BillsReportBill[]
  waiting: BillsReportWaiting[]
  cancelled: BillsReportCancelled[]
  adjustments: BillsReportAdjustment[]
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const strArr = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === 'string')
const label = (v: unknown): string => str(v) || '—'

function instrument(v: unknown): ReportInstrument {
  return v === 'cash' || v === 'bank' || v === 'mixed' ? v : 'other'
}

export function parseBillsReport(raw: unknown): BillsReport {
  const r = obj(raw)
  const t = obj(r.totals)
  const o = obj(r.open)
  return {
    date: str(r.date),
    dayFrom: str(r.day_from),
    dayTo: str(r.day_to),
    totals: { revenue: num(t.revenue), cash: num(t.cash), bank: num(t.bank), other: num(t.other), billsCount: num(t.bills_count) },
    open: { tablesCount: num(o.tables_count), provisionalTotal: num(o.provisional_total) },
    bills: arr(r.bills).map((b0) => {
      const b = obj(b0)
      return {
        key: str(b.key), paidAt: str(b.paid_at), openedAt: str(b.opened_at), sessionIds: strArr(b.session_ids),
        orderIds: strArr(b.order_ids), merged: b.merged === true, tablesCount: num(b.tables_count), total: num(b.total),
        discountTotal: num(b.discount_total), billDiscount: num(b.bill_discount), instrument: instrument(b.instrument), orderType: str(b.order_type) || 'dine_in',
        itemsCount: num(b.items_count), tableLabel: label(b.table_label), customerName: strOrNull(b.customer_name),
        partySize: numOrNull(b.party_size), adjustmentsCount: num(b.adjustments_count), receivedByName: strOrNull(b.received_by_name),
        payments: parsePaymentLines(b.payments), cashGiven: numOrNull(b.cash_given), changeAmount: numOrNull(b.change_amount),
      }
    }),
    waiting: arr(r.waiting).map((w0) => {
      const w = obj(w0)
      return {
        key: str(w.key), sessionIds: strArr(w.session_ids), orderIds: strArr(w.order_ids), openedAt: str(w.opened_at),
        isTray: w.is_tray === true, expired: w.expired === true, tablesCount: num(w.tables_count), tableLabel: label(w.table_label),
        orderType: str(w.order_type) || 'dine_in', customerName: strOrNull(w.customer_name), partySize: numOrNull(w.party_size),
        itemsCount: num(w.items_count), provisionalTotal: num(w.provisional_total),
      }
    }),
    cancelled: arr(r.cancelled).map((c0) => {
      const c = obj(c0)
      return {
        orderId: str(c.order_id), sessionId: strOrNull(c.session_id), at: str(c.at), createdAt: str(c.created_at),
        kind: c.kind === 'rejected' ? 'rejected' : 'cancelled', reasonCode: strOrNull(c.reason_code), reasonNote: strOrNull(c.reason_note),
        total: num(c.total), orderType: str(c.order_type) || 'dine_in', orderSource: str(c.order_source),
        customerName: strOrNull(c.customer_name), tableLabel: label(c.table_label),
      }
    }),
    adjustments: arr(r.adjustments).map((a0) => {
      const a = obj(a0)
      return {
        at: str(a.at), type: a.type === 'gift' ? 'gift' : a.type === 'quantity' ? 'quantity' : 'cancelled',
        itemName: str(a.item_name), quantity: num(a.quantity), oldQuantity: numOrNull(a.old_quantity),
        newQuantity: numOrNull(a.new_quantity), amount: num(a.amount), reason: strOrNull(a.reason),
        tableLabel: label(a.table_label), byName: strOrNull(a.by_name),
      }
    }),
  }
}

/**
 * Mã rút gọn của một dòng (CHƯA có số hoá đơn thật — hoãn 2026-10-12, xem spec §4.1).
 * Bill theo phiên: 6 ký tự cuối ID phiên nhỏ nhất (bill gộp N mâm ra một mã cố định).
 * Đơn không phiên: 6 ký tự cuối ID đơn — trùng kiểu mã "#DA5382" trang Đơn hàng cũ đang hiện.
 */
export function billCode(sessionIds: string[], orderIds: string[]): string {
  const src = [...sessionIds].sort()[0] ?? orderIds[0]
  return src ? `#${src.replace(/-/g, '').slice(-6).toUpperCase()}` : '—'
}

export type BillRowKind = 'paid' | 'waiting' | 'cancelled'

/** Một dòng của bảng — gộp 3 nguồn (bill đã thu, chờ thu, đơn huỷ) về cùng một hình. */
export type BillRow = {
  key: string
  kind: BillRowKind
  code: string
  tableLabel: string
  /** Bill gộp N mâm hoặc một mâm chiếm nhiều bàn → nhãn "Ghép". */
  grouped: boolean
  orderType: string
  customerName: string | null
  partySize: number | null
  /** Giờ khách vào (phiên mở / đơn tạo). */
  startedAt: string
  /** Giờ dùng để sắp xếp: giờ thu / giờ mở / giờ huỷ. */
  at: string
  itemsCount: number | null
  /** Tiền của dòng: tổng đã thu / tạm tính / giá trị đơn huỷ. */
  amount: number
  instrument: ReportInstrument | null
  /** Bill có Bỏ/Tặng/Sửa số lượng hoặc giảm giá voucher. */
  adjusted: boolean
  adjustmentsCount: number
  discountTotal: number
  /** Mig 108: phần giảm giá cả bill (đã nằm trong discountTotal). */
  billDiscount: number
  expired: boolean
  rejected: boolean
  reasonText: string | null
  receivedByName: string | null
  sessionIds: string[]
  orderIds: string[]
  /** Mig 112a: từng khoản của bill đã thu; dòng chờ thu / đơn huỷ thì rỗng. */
  payments: PaymentLine[]
  cashGiven: number | null
  changeAmount: number | null
}

export function buildBillRows(report: BillsReport): BillRow[] {
  // Tiền tố 'W:': bàn đang mở mà đã có lượt nhận tiền thì CÙNG phiên nằm cả ở bills ('S:<phiên>') lẫn waiting
  // ('S:<phiên>') — trùng key React (lỗi 2026-10-13).
  const waiting: BillRow[] = report.waiting.map((w) => ({
    key: `W:${w.key}`, kind: 'waiting', code: billCode(w.sessionIds, w.orderIds), tableLabel: w.tableLabel,
    grouped: w.tablesCount > 1, orderType: w.orderType, customerName: w.customerName, partySize: w.partySize,
    startedAt: w.openedAt, at: w.openedAt, itemsCount: w.itemsCount, amount: w.provisionalTotal, instrument: null,
    adjusted: false, adjustmentsCount: 0, discountTotal: 0, billDiscount: 0, expired: w.expired, rejected: false, reasonText: null,
    receivedByName: null, sessionIds: w.sessionIds, orderIds: w.orderIds,
    payments: [], cashGiven: null, changeAmount: null,
  }))
  const paid: BillRow[] = report.bills.map((b) => ({
    key: b.key, kind: 'paid', code: billCode(b.sessionIds, b.orderIds), tableLabel: b.tableLabel,
    grouped: b.merged || b.tablesCount > 1, orderType: b.orderType, customerName: b.customerName, partySize: b.partySize,
    startedAt: b.openedAt, at: b.paidAt, itemsCount: b.itemsCount, amount: b.total, instrument: b.instrument,
    adjusted: b.adjustmentsCount > 0 || b.discountTotal > 0, adjustmentsCount: b.adjustmentsCount, discountTotal: b.discountTotal, billDiscount: b.billDiscount,
    expired: false, rejected: false, reasonText: null, receivedByName: b.receivedByName, sessionIds: b.sessionIds, orderIds: b.orderIds,
    payments: b.payments, cashGiven: b.cashGiven, changeAmount: b.changeAmount,
  }))
  const cancelled: BillRow[] = report.cancelled.map((c) => ({
    key: `X:${c.orderId}`, kind: 'cancelled', code: billCode([], [c.orderId]), tableLabel: c.tableLabel, grouped: false,
    orderType: c.orderType, customerName: c.customerName, partySize: null, startedAt: c.createdAt, at: c.at, itemsCount: null,
    amount: c.total, instrument: null, adjusted: false, adjustmentsCount: 0, discountTotal: 0, billDiscount: 0, expired: false,
    rejected: c.kind === 'rejected', reasonText: rejectReasonLabel(c.reasonCode, c.reasonNote), receivedByName: null,
    sessionIds: c.sessionId ? [c.sessionId] : [], orderIds: [c.orderId],
    payments: [], cashGiven: null, changeAmount: null,
  }))
  // Chờ thu lên đầu (việc cần làm), còn lại theo giờ mới nhất.
  const byTimeDesc = (a: BillRow, b: BillRow) => b.at.localeCompare(a.at)
  return [...waiting.sort(byTimeDesc), ...[...paid, ...cancelled].sort(byTimeDesc)]
}

/**
 * Tiền mặt / chuyển khoản của MỘT dòng bill đã thu (cột Excel, ngăn kéo). Có từng khoản (mig 112a) → cộng theo
 * phương tiện, phần không có → null. Bill thu trước 112a: một phương tiện thì đủ số vào đúng cột; ví / trộn
 * nhiều phương tiện thì không tách được → cả hai null (không đoán). Dòng chờ thu / huỷ → null.
 */
export function billCashBank(row: BillRow): { cash: number | null; bank: number | null } {
  if (row.kind !== 'paid') return { cash: null, bank: null }
  if (row.payments.length > 0) {
    const sum = (i: Instrument) => row.payments.filter((p) => p.instrument === i).reduce((s, p) => s + p.amount, 0)
    const has = (i: Instrument) => row.payments.some((p) => p.instrument === i)
    return { cash: has('cash') ? sum('cash') : null, bank: has('bank') ? sum('bank') : null }
  }
  if (row.instrument === 'cash') return { cash: row.amount, bank: null }
  if (row.instrument === 'bank') return { cash: null, bank: row.amount }
  return { cash: null, bank: null }
}

/**
 * Nhãn phương thức của một dòng: "Kết hợp" chỉ khi bill thu kết hợp có từng khoản (mig 112a); bill cũ trộn
 * nhiều phương tiện giữ "Nhiều phương thức". null khi dòng không có phương thức (chờ thu / huỷ).
 */
export function billInstrumentLabel(row: Pick<BillRow, 'instrument' | 'payments'>): string | null {
  if (!row.instrument) return null
  if (row.instrument === 'mixed' && row.payments.length > 0) return 'Kết hợp'
  return instrumentLabel(row.instrument)
}

/**
 * Phần của bill đã thu KHÔNG nằm ở cột Tiền mặt / Chuyển khoản (ví, bill cũ trộn nhiều phương tiện). Tính là phần
 * còn lại để mỗi dòng Tiền mặt + Chuyển khoản + Khác = Số tiền. 0 hoặc không phải dòng đã thu → null (ô trống).
 */
export function billOther(row: BillRow): number | null {
  if (row.kind !== 'paid') return null
  const { cash, bank } = billCashBank(row)
  const rest = row.amount - (cash ?? 0) - (bank ?? 0)
  return rest !== 0 ? rest : null
}

export type BillChip = 'all' | 'paid' | 'adjusted' | 'waiting'

function inChip(row: BillRow, chip: BillChip): boolean {
  if (chip === 'all') return true
  if (chip === 'paid') return row.kind === 'paid'
  if (chip === 'waiting') return row.kind === 'waiting'
  return row.kind === 'cancelled' || (row.kind === 'paid' && row.adjusted)
}

export function chipCounts(rows: BillRow[]): Record<BillChip, number> {
  return {
    all: rows.length,
    paid: rows.filter((r) => inChip(r, 'paid')).length,
    adjusted: rows.filter((r) => inChip(r, 'adjusted')).length,
    waiting: rows.filter((r) => inChip(r, 'waiting')).length,
  }
}

/** Bỏ dấu tiếng Việt + chữ thường + gọn khoảng trắng — để gõ "ban 10" tìm ra "Bàn 10". */
export function normalizeSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

export function filterBillRows(rows: BillRow[], chip: BillChip, query: string): BillRow[] {
  const q = normalizeSearch(query).replace(/^#/, '')
  return rows.filter((r) => {
    if (!inChip(r, chip)) return false
    if (!q) return true
    const hay = normalizeSearch([r.code.replace(/^#/, ''), r.tableLabel, r.customerName ?? ''].join(' '))
    return hay.includes(q)
  })
}

export const BILLS_PAGE_SIZE = 20

export function paginate<T>(items: T[], page: number, size = BILLS_PAGE_SIZE) {
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / size))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount)
  const start = (current - 1) * size
  const slice = items.slice(start, start + size)
  return { items: slice, page: current, pageCount, total, from: total === 0 ? 0 : start + 1, to: start + slice.length }
}

const VN_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
const VN_TIME = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false })
const VN_OFFSET_MS = 7 * 3_600_000
const DAY_MS = 86_400_000

/** Giờ khách vào: chỉ HH:MM nếu cùng ngày đang xem (giờ VN), khác ngày thì "dd/mm HH:MM" — bill vào hôm trước, thu hôm nay. */
export function startedLabel(iso: string, reportDate: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const hm = VN_TIME.format(d)
  const ymd = VN_DATE.format(d)
  return ymd === reportDate ? hm : `${ymd.slice(8, 10)}/${ymd.slice(5, 7)} ${hm}`
}

/** "05:00 01/11 – 05:00 02/11" cho quán có giờ bắt đầu ngày; null ở quán 00:00 (ngày lịch, không cần giải thích) hoặc khi server chưa áp mig 111. */
export function businessDayRangeLabel(report: Pick<BillsReport, 'dayFrom' | 'dayTo'>): string | null {
  const from = new Date(report.dayFrom)
  const to = new Date(report.dayTo)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
  const isVnMidnight = (from.getTime() + VN_OFFSET_MS) % DAY_MS === 0
  if (isVnMidnight) return null
  const at = (d: Date) => {
    const ymd = VN_DATE.format(d)
    return `${VN_TIME.format(d)} ${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`
  }
  return `${at(from)} – ${at(to)}`
}

export type DaySummary = {
  waitingCount: number; waitingTotal: number
  cancelledCount: number; cancelledTotal: number
  giftCount: number; giftTotal: number
  voidCount: number; voidTotal: number
  quantityChangeCount: number
  /** Tổng giảm giá các bill đã thu (voucher + giảm giá bill, mig 108). Doanh thu đã là tiền SAU giảm — chỉ để đối chiếu. */
  discountTotal: number
  /** Phần giảm giá cả bill nằm trong discountTotal. */
  billDiscountTotal: number
}

/** Số liệu phụ cho phiếu cuối ngày + Excel (A04-3): chỉ ĐẾM và cộng các dòng server đã tính sẵn — doanh thu vẫn lấy `totals`. */
export function daySummary(report: BillsReport): DaySummary {
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
  const gifts = report.adjustments.filter((a) => a.type === 'gift')
  const voids = report.adjustments.filter((a) => a.type === 'cancelled')
  return {
    waitingCount: report.waiting.length,
    waitingTotal: sum(report.waiting.map((w) => w.provisionalTotal)),
    cancelledCount: report.cancelled.length,
    cancelledTotal: sum(report.cancelled.map((c) => c.total)),
    giftCount: gifts.length,
    giftTotal: sum(gifts.map((a) => a.amount)),
    voidCount: voids.length,
    voidTotal: sum(voids.map((a) => a.amount)),
    quantityChangeCount: report.adjustments.filter((a) => a.type === 'quantity').length,
    discountTotal: sum(report.bills.map((b) => b.discountTotal)),
    billDiscountTotal: sum(report.bills.map((b) => b.billDiscount)),
  }
}

/** "dd/mm/yyyy HH:MM" giờ VN — tự ghép, không phụ thuộc cách trình duyệt/Node xếp ngày giờ của locale vi-VN. */
export function vnDateTimeLabel(d: Date): string {
  const ymd = VN_DATE.format(d)
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)} ${VN_TIME.format(d)}`
}
