// Ca thu ngân (mig 122): kiểu + parse JSON của các RPC ca, đọc ô tiền, nhãn chênh lệch. Hàm thuần.
// Công thức két chỉ có ở server (cash_shift_totals) — KHÔNG tính lại ở đây. Ca đang mở: server không trả tiền bán /
// dự kiến / lệch, nên các trường đó là null và phải giữ null (không ép về 0, kẻo màn hình hiện "dự kiến 0đ").
import { parseVnd } from './cash-change'
import { formatVND } from './utils'
import { MAX_CASH_AMOUNT, isObj, kindOf, methodOf, num, sourceOf, str, type CashBookSource } from './cash-common'

export type CashShiftEntry = {
  id: string
  kind: 'receipt' | 'payment'
  method: 'cash' | 'bank'
  categoryName: string
  amount: number
  note: string | null
  counterparty: string | null
  source: CashBookSource
  createdAt: string
  createdByName: string | null
  voidedAt: string | null
}

export type OpenCashShift = {
  id: string
  openedAt: string
  openedByName: string | null
  openingCash: number
  openNote: string | null
  stale: boolean
  entries: CashShiftEntry[]
}

export type CashShiftState = { required: boolean; canManageEntries: boolean; shift: OpenCashShift | null }

export type CashShiftCloseResult = {
  shiftId: string
  already: boolean
  openingCash: number
  cashSales: number
  cashReceipts: number
  cashPayments: number
  debtCash: number
  expectedCash: number
  countedCash: number
  difference: number
}

export type CashShiftStatus = 'open' | 'closed'

export type CashShiftListItem = {
  id: string
  status: CashShiftStatus
  openedAt: string
  closedAt: string | null
  openedByName: string | null
  closedByName: string | null
  openingCash: number
  expectedCash: number | null
  countedCash: number | null
  difference: number | null
}

export type CashShiftReport = {
  id: string
  storeId: string
  status: CashShiftStatus
  openedAt: string
  closedAt: string | null
  openedByName: string | null
  closedByName: string | null
  openingCash: number
  openNote: string | null
  closeNote: string | null
  cashSales: number | null
  bankSales: number | null
  cashReceipts: number | null
  cashPayments: number | null
  debtCash: number | null
  expectedCash: number | null
  countedCash: number | null
  difference: number | null
  billsCount: number | null
  carriedDays: number
  continuedAt: string | null
  continuedByName: string | null
  entries: CashShiftEntry[]
}

/** Ô tiền đầu ca / tiền đếm được: kiểu Việt Nam ("500.000", "500k", "1.000.000đ"); 0 hợp lệ; quá 2 tỉ → null. */
export function parseShiftCash(text: string): number | null {
  const v = parseVnd(text)
  if (v === null || v > MAX_CASH_AMOUNT) return null
  return v
}

/** Câu server báo khi quán bật ca mà chưa có ca mở (require_open_cash_shift, mig 122). */
export const NO_OPEN_SHIFT_ERROR = 'Chưa mở ca'

export function isNoOpenShiftError(error: string | null | undefined): boolean {
  return !!error && error.includes(NO_OPEN_SHIFT_ERROR)
}

/** Phiếu nhập kho (mig 122b): câu báo thay "Chưa mở ca" khi lưu phiếu đã trả tiền mặt mà quán bật ca chưa mở ca. */
export const RECEIPT_NO_SHIFT = 'Chưa mở ca — mở ca trên POS hoặc chọn Chuyển khoản / Chưa trả'

/** Câu server khi huỷ phiếu chi tiền mặt mà ca của nó đã kết (cash_book_void_internal, mig 122). */
export const SHIFT_CLOSED_VOID_ERROR = 'Ca của phiếu này đã kết'
export function isShiftClosedVoidError(error: string | null | undefined): boolean {
  return !!error && error.includes(SHIFT_CLOSED_VOID_ERROR)
}
/** Phiếu nhập kho (mig 122b): câu báo khi huỷ phiếu nhập đã trả tiền mặt trong ca đã kết. */
export const RECEIPT_VOID_SHIFT_CLOSED = 'Phiếu nhập trả tiền mặt trong ca đã kết — không huỷ được (két đã chốt).'

/** POS: băng lỗi đang là "Chưa mở ca" mà trạng thái ca giờ đã có ca mở → bỏ băng. */
export function shouldClearNoShiftError(
  error: { message: string } | null,
  state: { shift: unknown | null } | null,
): boolean {
  return !!error && isNoOpenShiftError(error.message) && !!state?.shift
}

/** Giờ mở ca "HH:MM" theo giờ Việt Nam. */
export function shiftTimeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false })
}

/** "HH:MM dd/MM" theo giờ Việt Nam (banner ca quên kết, panel ca). */
export function shiftDateTimeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // vi-VN với chỉ ngày + tháng ra "09-11" (gạch ngang) → ghép tay từ từng phần cho đúng "09/11".
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${shiftTimeLabel(iso)} ${get('day')}/${get('month')}`
}

/** Chênh lệch = đếm được − dự kiến (âm = thiếu). */
export function differenceLabel(difference: number): string {
  if (difference === 0) return 'Khớp'
  return difference < 0 ? `Thiếu ${formatVND(-difference)}` : `Thừa ${formatVND(difference)}`
}

const statusOf = (v: unknown): CashShiftStatus | null => (v === 'open' || v === 'closed' ? v : null)

function parseEntry(raw: unknown): CashShiftEntry | null {
  if (!isObj(raw)) return null
  const id = str(raw.id)
  const kind = kindOf(raw.kind)
  const method = methodOf(raw.method)
  const categoryName = str(raw.category_name)
  const amount = num(raw.amount)
  const source = sourceOf(raw.source)
  const createdAt = str(raw.created_at)
  if (!id || !kind || !method || categoryName === null || amount === null || !source || !createdAt) return null
  return {
    id, kind, method, categoryName, amount,
    note: str(raw.note),
    counterparty: str(raw.counterparty),
    source,
    createdAt,
    createdByName: str(raw.created_by_name),
    voidedAt: str(raw.voided_at),
  }
}

const parseEntries = (v: unknown): CashShiftEntry[] =>
  (Array.isArray(v) ? v : []).map(parseEntry).filter((e): e is CashShiftEntry => e !== null)

/** get_open_cash_shift → trạng thái ca cho POS. Rác → quán không bắt buộc, không có ca. */
export function parseCashShiftState(raw: unknown): CashShiftState {
  if (!isObj(raw)) return { required: false, canManageEntries: false, shift: null }
  let shift: OpenCashShift | null = null
  if (isObj(raw.shift)) {
    const s = raw.shift
    const id = str(s.id)
    const openedAt = str(s.opened_at)
    const openingCash = num(s.opening_cash)
    if (id && openedAt && openingCash !== null) {
      shift = {
        id, openedAt, openingCash,
        openedByName: str(s.opened_by_name),
        openNote: str(s.open_note),
        stale: s.stale === true,
        entries: parseEntries(s.entries),
      }
    }
  }
  return { required: raw.required === true, canManageEntries: raw.can_manage_entries === true, shift }
}

function parseListItem(raw: unknown): CashShiftListItem | null {
  if (!isObj(raw)) return null
  const id = str(raw.id)
  const status = statusOf(raw.status)
  const openedAt = str(raw.opened_at)
  const openingCash = num(raw.opening_cash)
  if (!id || !status || !openedAt || openingCash === null) return null
  return {
    id, status, openedAt, openingCash,
    closedAt: str(raw.closed_at),
    openedByName: str(raw.opened_by_name),
    closedByName: str(raw.closed_by_name),
    expectedCash: num(raw.expected_cash),
    countedCash: num(raw.counted_cash),
    difference: num(raw.difference),
  }
}

export function parseCashShiftList(raw: unknown): { required: boolean; shifts: CashShiftListItem[] } {
  if (!isObj(raw)) return { required: false, shifts: [] }
  return {
    required: raw.required === true,
    shifts: (Array.isArray(raw.shifts) ? raw.shifts : []).map(parseListItem).filter((s): s is CashShiftListItem => s !== null),
  }
}

/** get_cash_shift_report / cash_shift_report_json. Sai hình → null. */
export function parseCashShiftReport(raw: unknown): CashShiftReport | null {
  if (!isObj(raw)) return null
  const id = str(raw.id)
  const storeId = str(raw.store_id)
  const status = statusOf(raw.status)
  const openedAt = str(raw.opened_at)
  const openingCash = num(raw.opening_cash)
  if (!id || !storeId || !status || !openedAt || openingCash === null) return null
  return {
    id, storeId, status, openedAt, openingCash,
    closedAt: str(raw.closed_at),
    openedByName: str(raw.opened_by_name),
    closedByName: str(raw.closed_by_name),
    openNote: str(raw.open_note),
    closeNote: str(raw.close_note),
    cashSales: num(raw.cash_sales),
    bankSales: num(raw.bank_sales),
    cashReceipts: num(raw.cash_receipts),
    cashPayments: num(raw.cash_payments),
    debtCash: num(raw.debt_cash),
    expectedCash: num(raw.expected_cash),
    countedCash: num(raw.counted_cash),
    difference: num(raw.difference),
    billsCount: num(raw.bills_count),
    carriedDays: num(raw.carried_days) ?? 1,
    continuedAt: str(raw.continued_at),
    continuedByName: str(raw.continued_by_name),
    entries: parseEntries(raw.entries),
  }
}

/** close_cash_shift. Thiếu số → ném: không bịa số 0 lên màn kết quả / phiếu bàn giao. */
export function parseCashShiftCloseResult(raw: unknown): CashShiftCloseResult {
  const bad = new Error('Phản hồi kết ca không hợp lệ, mở lại phiếu ca để xem kết quả')
  if (!isObj(raw)) throw bad
  const shiftId = str(raw.shift_id)
  const fields = ['opening_cash', 'cash_sales', 'cash_receipts', 'cash_payments', 'debt_cash', 'expected_cash',
    'counted_cash', 'difference'] as const
  const n = Object.fromEntries(fields.map((f) => [f, num(raw[f])])) as Record<(typeof fields)[number], number | null>
  if (!shiftId || fields.some((f) => n[f] === null)) throw bad
  return {
    shiftId,
    already: raw.already === true,
    openingCash: n.opening_cash!,
    cashSales: n.cash_sales!,
    cashReceipts: n.cash_receipts!,
    cashPayments: n.cash_payments!,
    debtCash: n.debt_cash!,
    expectedCash: n.expected_cash!,
    countedCash: n.counted_cash!,
    difference: n.difference!,
  }
}
