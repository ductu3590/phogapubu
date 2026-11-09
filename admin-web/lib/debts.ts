// Công nợ khách hàng (mig 123): kiểu dữ liệu, đọc JSON các RPC debt_*, và hàm thuần cho POS / trang /admin/debts.
// Số nợ, phân bổ, quyền đều do SERVER quyết. Ở đây chỉ đổi tên trường / ép kiểu, kiểm đầu vào sớm cho câu báo thân
// thiện, và xem trước phân bổ (allocateDebt) đúng cách server làm.
import { normalizeSearch } from '@/lib/bills-report'
import { formatVND } from '@/lib/utils'

export type DebtCustomerKind = 'company' | 'person'

export type DebtCustomerSummary = {
  id: string
  name: string
  phone: string | null
  kind: DebtCustomerKind
  note: string | null
  isActive: boolean
  outstanding: number
  openBills: number
  oldestOpenAt: string | null
  lastPaymentAt: string | null
}

export type DebtBill = {
  billPaymentId: string
  collectedAt: string
  businessDate: string
  tableLabel: string
  sessionIds: string[]
  billTotal: number
  debtAmount: number
  paidAmount: number
  outstanding: number
}

export type DebtAllocation = { billPaymentId: string; amount: number }

export type DebtPaymentRow = {
  id: string
  amount: number
  method: 'cash' | 'bank'
  businessDate: string
  createdAt: string
  createdByName: string | null
  note: string | null
  /** Lần trả đã huỷ: vẫn liệt kê để đối chiếu, KHÔNG cộng vào đâu (server đã bỏ khỏi paid / outstanding). */
  voidedAt: string | null
  voidReason: string | null
  voidedByName: string | null
  allocations: DebtAllocation[]
}

export type DebtCustomerDetail = { customer: DebtCustomerSummary; bills: DebtBill[]; payments: DebtPaymentRow[] }

export type NewDebtCustomer = { name: string; phone: string | null; kind: DebtCustomerKind }

export type DebtCustomerChoice =
  | { kind: 'existing'; id: string; name: string }
  | { kind: 'new'; customer: NewDebtCustomer }

export type DebtShiftSummary = { debtRecorded: number; debtCash: number; debtBank: number }

/** Giới hạn khớp server (CHECK / RPC mig 123). */
export const DEBT_NAME_MAX = 120
export const DEBT_NOTE_MAX = 500
export const DEBT_VOID_REASON_MAX = 300

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const num = (v: unknown): number => { const n = Number(v); return v !== null && v !== '' && Number.isFinite(n) ? n : 0 }
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const kindOf = (v: unknown): DebtCustomerKind => (v === 'company' ? 'company' : 'person')
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function parseSummary(raw: unknown): DebtCustomerSummary | null {
  const c = obj(raw)
  const id = str(c.id)
  if (!id) return null
  return {
    id, name: str(c.name), phone: strOrNull(c.phone), kind: kindOf(c.kind), note: strOrNull(c.note),
    isActive: c.is_active !== false, outstanding: num(c.outstanding), openBills: num(c.open_bills),
    oldestOpenAt: strOrNull(c.oldest_open_at), lastPaymentAt: strOrNull(c.last_payment_at),
  }
}

function parseAllocations(raw: unknown): DebtAllocation[] {
  return arr(raw).flatMap((a0) => {
    const a = obj(a0)
    const billPaymentId = str(a.bill_payment_id)
    return billPaymentId ? [{ billPaymentId, amount: num(a.amount) }] : []
  })
}

/** debt_list → danh sách khách (bỏ dòng không có id). */
export function parseDebtList(raw: unknown): DebtCustomerSummary[] {
  return arr(obj(raw).customers).flatMap((c) => {
    const s = parseSummary(c)
    return s ? [s] : []
  })
}

/** debt_customer_detail → chi tiết; không có khách hợp lệ → null. */
export function parseDebtCustomerDetail(raw: unknown): DebtCustomerDetail | null {
  const r = obj(raw)
  const customer = parseSummary(r.customer)
  if (!customer) return null
  return {
    customer,
    // Dòng không có mã thì bỏ (như parseDebtList): không bấm / không phân bổ được vào một bill không có mã.
    bills: arr(r.bills).flatMap((b0): DebtBill[] => {
      const b = obj(b0)
      const billPaymentId = str(b.bill_payment_id)
      if (!billPaymentId) return []
      return [{
        billPaymentId, collectedAt: str(b.collected_at), businessDate: str(b.business_date),
        tableLabel: str(b.table_label) || '—', sessionIds: arr(b.session_ids).filter((x): x is string => typeof x === 'string'),
        billTotal: num(b.bill_total), debtAmount: num(b.debt_amount), paidAmount: num(b.paid_amount), outstanding: num(b.outstanding),
      }]
    }),
    payments: arr(r.payments).flatMap((p0): DebtPaymentRow[] => {
      const p = obj(p0)
      const id = str(p.id)
      if (!id) return []
      return [{
        id, amount: num(p.amount), method: p.method === 'bank' ? 'bank' : 'cash', businessDate: str(p.business_date),
        createdAt: str(p.created_at), createdByName: strOrNull(p.created_by_name), note: strOrNull(p.note),
        voidedAt: strOrNull(p.voided_at), voidReason: strOrNull(p.void_reason), voidedByName: strOrNull(p.voided_by_name),
        allocations: parseAllocations(p.allocations),
      }]
    }),
  }
}

/** get_debt_shift_summary → số nợ trong ca; null khi không đọc được. */
export function parseDebtShiftSummary(raw: unknown): DebtShiftSummary | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Obj
  return { debtRecorded: num(r.debt_recorded), debtCash: num(r.debt_cash), debtBank: num(r.debt_bank) }
}

/** Phân bổ một lần trả (đọc từ JSON debt_collect). */
export function parseDebtAllocations(raw: unknown): DebtAllocation[] {
  return parseAllocations(raw)
}

/**
 * SĐT về dạng 0xxxxxxxxx — KHỚP debt_normalize_phone (mig 123): bỏ mọi ký tự không phải số, 84… → 0…, rỗng → null.
 * Sai dạng → error 'SĐT không hợp lệ' (cùng câu server).
 */
export function normalizeDebtPhone(input: string): { phone: string | null; error: string | null } {
  if (!input || input.trim() === '') return { phone: null, error: null }
  const digits = input.replace(/[^0-9]/g, '').replace(/^84([0-9]{9,10})$/, '0$1')
  return /^0[0-9]{8,10}$/.test(digits) ? { phone: digits, error: null } : { phone: null, error: 'SĐT không hợp lệ' }
}

/** Kiểm lựa chọn khách ở màn Thanh toán khi có phần ghi nợ. null = hợp lệ. */
export function debtChoiceError(choice: DebtCustomerChoice | null): string | null {
  if (!choice) return 'Chọn khách ghi nợ'
  if (choice.kind === 'existing') return choice.id ? null : 'Chọn khách ghi nợ'
  const name = choice.customer.name.trim()
  if (!name) return 'Nhập tên khách'
  if (name.length > DEBT_NAME_MAX) return 'Tên khách nợ quá dài'
  return normalizeDebtPhone(choice.customer.phone ?? '').error
}

/**
 * Lọc danh sách khách: tìm không dấu theo tên, hoặc theo SĐT (gõ có dấu cách / +84 vẫn ra). onlyOpen = còn nợ,
 * activeOnly = đang dùng.
 */
export function filterDebtCustomers(
  list: DebtCustomerSummary[],
  query: string,
  opts: { onlyOpen: boolean; activeOnly: boolean },
): DebtCustomerSummary[] {
  const q = normalizeSearch(query)
  const digits = query.replace(/[^0-9]/g, '')
  const digitsVn = digits.startsWith('84') ? `0${digits.slice(2)}` : null
  return list.filter((c) => {
    if (opts.onlyOpen && !(c.outstanding > 0)) return false
    if (opts.activeOnly && !c.isActive) return false
    if (!q) return true
    if (normalizeSearch(c.name).includes(q)) return true
    if (!digits || !c.phone) return false
    return c.phone.includes(digits) || (digitsVn !== null && c.phone.includes(digitsVn))
  })
}

/**
 * Xem trước phân bổ một lần trả — CÙNG cách debt_collect (mig 123): bill còn nợ, cũ nhất trước (collectedAt rồi mã
 * bill), mỗi bill tối đa phần còn nợ; selected = chỉ các bill được tick. Server vẫn tự phân bổ lại khi ghi.
 */
export function allocateDebt(
  bills: DebtBill[],
  amount: number,
  selected: string[] | null,
): { allocations: DebtAllocation[]; error: string | null } {
  if (!Number.isSafeInteger(amount) || amount <= 0) return { allocations: [], error: 'Nhập số tiền khách trả' }
  if (selected !== null && selected.length === 0) return { allocations: [], error: 'Chọn ít nhất một bill' }
  const pick = selected === null ? null : new Set(selected)
  // Bill được tick mà không còn trong danh sách còn nợ (mã lạ / đã trả hết): báo đúng câu server, không lặng lẽ bỏ.
  if (pick !== null) {
    const openIds = new Set(bills.filter((b) => b.outstanding > 0).map((b) => b.billPaymentId))
    if ([...pick].some((id) => !openIds.has(id))) return { allocations: [], error: 'Bill không thuộc khách này hoặc đã trả hết' }
  }
  const open = bills
    .filter((b) => b.outstanding > 0 && (pick === null || pick.has(b.billPaymentId)))
    // So chuỗi thô (không localeCompare): mã bill là uuid chữ thường, server so theo byte. collectedAt so được
    // như chuỗi vì mọi dòng đến từ to_jsonb(timestamptz) của CÙNG một lần gọi RPC: ISO 8601 cùng múi giờ phiên nên
    // thứ tự chữ = thứ tự thời gian (kể cả phần lẻ giây). Đọc từ nguồn khác thì phải đổi sang Date trước khi so.
    .sort((a, b) => cmp(a.collectedAt, b.collectedAt) || cmp(a.billPaymentId, b.billPaymentId))
  const total = open.reduce((s, b) => s + b.outstanding, 0)
  if (amount > total) return { allocations: [], error: 'Số tiền trả vượt số nợ: còn nợ ' + formatVND(total) }
  const allocations: DebtAllocation[] = []
  let left = amount
  for (const b of open) {
    if (left <= 0) break
    const take = Math.min(b.outstanding, left)
    allocations.push({ billPaymentId: b.billPaymentId, amount: take })
    left -= take
  }
  return { allocations, error: null }
}

export function debtKindLabel(kind: DebtCustomerKind): string {
  return kind === 'company' ? 'Cơ quan' : 'Cá nhân'
}
