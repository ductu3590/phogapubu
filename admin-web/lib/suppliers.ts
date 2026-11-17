// Công nợ nhà cung cấp (mig 143–145): kiểu dữ liệu, đọc JSON các RPC supplier_*, và hàm thuần cho trang /admin/debts
// (tab Nhà cung cấp). Số nợ, phân bổ, quyền đều do SERVER quyết. Ở đây chỉ đổi tên trường / ép kiểu, cộng tổng các
// phiếu được tích để điền sẵn ô tiền, và xem trước phân bổ (allocateSupplierPayment) đúng cách supplier_pay làm.
import { normalizeSearch } from '@/lib/bills-report'
import { formatVND } from '@/lib/utils'

export type SupplierSummary = {
  id: string
  name: string
  phone: string | null
  note: string | null
  isActive: boolean
  outstanding: number
  openDocs: number
  /** Ngày phiếu ('YYYY-MM-DD') của phiếu còn nợ cũ nhất. */
  oldestOpenDate: string | null
}

/** Một phiếu nhập Chưa trả của NCC (kể cả đã trả hết qua công nợ). */
export type SupplierDoc = {
  id: string
  docNo: string
  docDate: string
  createdAt: string
  totalAmount: number
  paidAmount: number
  outstanding: number
}

export type SupplierAllocation = { documentId: string; amount: number }

export type SupplierPaymentRow = {
  id: string
  amount: number
  method: 'cash' | 'bank'
  note: string | null
  businessDate: string
  createdAt: string
  createdByName: string | null
  voidedAt: string | null
  voidedByName: string | null
  voidReason: string | null
  allocations: (SupplierAllocation & { docNo: string })[]
}

export type SupplierDetail = { supplier: SupplierSummary; documents: SupplierDoc[]; payments: SupplierPaymentRow[] }

export const SUPPLIER_NAME_MAX = 120
export const SUPPLIER_NOTE_MAX = 500
export const SUPPLIER_VOID_REASON_MAX = 500

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const num = (v: unknown): number => { const n = Number(v); return v !== null && v !== '' && Number.isFinite(n) ? n : 0 }
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function parseSummary(raw: unknown): SupplierSummary | null {
  const r = obj(raw)
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null
  return {
    id: r.id, name: r.name, phone: strOrNull(r.phone), note: strOrNull(r.note), isActive: r.is_active === true,
    outstanding: num(r.outstanding), openDocs: num(r.open_docs), oldestOpenDate: strOrNull(r.oldest_open_date),
  }
}

export function parseSupplierList(raw: unknown): SupplierSummary[] {
  return arr(raw).map(parseSummary).filter((s): s is SupplierSummary => s !== null)
}

export function parseSupplierDetail(raw: unknown): SupplierDetail | null {
  const r = obj(raw)
  const supplier = parseSummary(r.supplier)
  if (!supplier) return null
  const documents = arr(r.documents).flatMap((x): SupplierDoc[] => {
    const d = obj(x)
    if (typeof d.id !== 'string') return []
    return [{
      id: d.id, docNo: str(d.doc_no), docDate: str(d.doc_date), createdAt: str(d.created_at),
      totalAmount: num(d.total_amount), paidAmount: num(d.paid_amount), outstanding: num(d.outstanding),
    }]
  })
  const payments = arr(r.payments).flatMap((x): SupplierPaymentRow[] => {
    const p = obj(x)
    if (typeof p.id !== 'string') return []
    return [{
      id: p.id, amount: num(p.amount), method: p.method === 'cash' ? 'cash' : 'bank', note: strOrNull(p.note),
      businessDate: str(p.business_date), createdAt: str(p.created_at), createdByName: strOrNull(p.created_by_name),
      voidedAt: strOrNull(p.voided_at), voidedByName: strOrNull(p.voided_by_name), voidReason: strOrNull(p.void_reason),
      allocations: arr(p.allocations).flatMap((y) => {
        const a = obj(y)
        return typeof a.document_id === 'string' ? [{ documentId: a.document_id, docNo: str(a.doc_no), amount: num(a.amount) }] : []
      }),
    }]
  })
  return { supplier, documents, payments }
}

/** Tổng còn nợ của các phiếu được tích (điền sẵn ô "Số tiền trả"). */
export function selectedOutstanding(docs: SupplierDoc[], ids: string[]): number {
  const pick = new Set(ids)
  return docs.filter((d) => pick.has(d.id) && d.outstanding > 0).reduce((s, d) => s + d.outstanding, 0)
}

/**
 * Xem trước phân bổ — CÙNG cách supplier_pay (mig 145): phiếu còn nợ (trong các phiếu được tích; null = mọi phiếu),
 * ngày phiếu cũ nhất trước, cùng ngày theo giờ tạo rồi mã phiếu; mỗi phiếu tối đa phần còn nợ. Câu báo giống server.
 */
export function allocateSupplierPayment(
  docs: SupplierDoc[],
  amount: number,
  selected: string[] | null,
): { allocations: SupplierAllocation[]; error: string | null } {
  if (!Number.isSafeInteger(amount) || amount <= 0) return { allocations: [], error: 'Nhập số tiền trả' }
  if (selected !== null && selected.length === 0) return { allocations: [], error: 'Chọn ít nhất một phiếu' }
  const pick = selected === null ? null : new Set(selected)
  if (pick !== null) {
    const openIds = new Set(docs.filter((d) => d.outstanding > 0).map((d) => d.id))
    if ([...pick].some((id) => !openIds.has(id))) return { allocations: [], error: 'Danh sách phiếu đã thay đổi, tải lại trang' }
  }
  // createdAt so được như chuỗi: mọi dòng đến từ CÙNG một lần gọi supplier_detail (ISO 8601 cùng múi giờ phiên).
  const open = docs
    .filter((d) => d.outstanding > 0 && (pick === null || pick.has(d.id)))
    .sort((a, b) => cmp(a.docDate, b.docDate) || cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id))
  const total = open.reduce((s, d) => s + d.outstanding, 0)
  if (total === 0) return { allocations: [], error: 'Nhà cung cấp không còn nợ' }
  if (amount > total) return { allocations: [], error: `Số tiền vượt số còn nợ (${formatVND(total)})` }
  const allocations: SupplierAllocation[] = []
  let left = amount
  for (const d of open) {
    if (left <= 0) break
    const take = Math.min(d.outstanding, left)
    allocations.push({ documentId: d.id, amount: take })
    left -= take
  }
  return { allocations, error: null }
}

/** Lọc NCC: tìm không dấu theo tên, hoặc theo SĐT (gõ có dấu cách / +84 vẫn ra). onlyOpen = còn nợ. */
export function filterSuppliers(list: SupplierSummary[], query: string, opts: { onlyOpen: boolean }): SupplierSummary[] {
  const q = normalizeSearch(query)
  const digits = query.replace(/[^0-9]/g, '')
  const digitsVn = digits.startsWith('84') ? `0${digits.slice(2)}` : null
  return list.filter((s) => {
    if (opts.onlyOpen && !(s.outstanding > 0)) return false
    if (!q) return true
    if (normalizeSearch(s.name).includes(q)) return true
    if (!digits || !s.phone) return false
    return s.phone.includes(digits) || (digitsVn !== null && s.phone.includes(digitsVn))
  })
}

/** Link mở một phiếu nhập ở trang Kho. */
export function supplierDocHref(documentId: string): string {
  return `/admin/inventory?doc=${encodeURIComponent(documentId)}`
}
