// Kho nhập – xuất (mig 118): hàm thuần phía web — đọc JSON của RPC, đọc ô số lượng, tính thành tiền dòng phiếu.
// Không import gì phía server: trang client và server action dùng chung.
//
// Hai loại ô số KHÁC NHAU, đừng dùng lẫn:
//   • Số lượng kho (kg, lon, két): KHÔNG có dấu ngăn nghìn. "1,5" và "1.5" đều là một rưỡi → parseQty.
//   • Tiền (đơn giá): dấu chấm là ngăn nghìn, "80.000" là tám mươi nghìn → parseVnd (lib/money.ts).
// parseVnd lên ô số lượng biến "1.5" kg thành 15; Number() lên ô tiền biến "80.000" thành 80.
import { normalizeSearch } from '@/lib/bills-report'
import { parseVnd } from '@/lib/money'

export type InventoryKind = 'goods' | 'ingredient'
export type DocKind = 'receipt' | 'count' | 'writeoff'

export type StockRow = {
  id: string
  name: string
  unit: string
  kind: InventoryKind
  sku: string | null
  minStock: number | null
  isActive: boolean
  qty: number
  lastUnitCost: number | null
  stockValue: number
}

export type DocSummary = {
  id: string
  kind: DocKind
  docNo: string
  docDate: string
  effectiveAt: string
  supplierName: string | null
  note: string | null
  totalAmount: number
  paidStatus: 'paid' | 'unpaid' | null
  paidMethod: 'cash' | 'bank' | null
  status: 'posted' | 'voided'
  lineCount: number
  createdAt: string
  createdByName: string | null
  voidedAt: string | null
  voidReason: string | null
  /** Phiếu chi đi kèm trong sổ thu chi (mig 122b trở đi). Mig 118 không trả trường này → luôn null. */
  cashBookEntryId: string | null
}

export type DocLine = {
  inventoryItemId: string
  name: string
  unit: string
  qty: number | null
  unitCost: number | null
  countedQty: number | null
  systemQty: number | null
  lineAmount: number
}

export type DocDetail = DocSummary & { lines: DocLine[] }

export type LedgerRow = {
  at: string
  businessDate: string
  type: DocKind | 'sales'
  documentId: string | null
  docNo: string | null
  qtyChange: number
  countedQty: number | null
  balance: number
}

export type Ledger = {
  item: { id: string; name: string; unit: string; kind: InventoryKind }
  from: string
  to: string
  openingQty: number
  closingQty: number
  rows: LedgerRow[]
}

export type MenuStockData = {
  goods: { id: string; name: string; unit: string }[]
  links: { menuItemId: string; variantId: string | null; inventoryItemId: string; qtyPerSale: number }[]
}

// Một dòng đang gõ trong form phiếu: giữ nguyên chuỗi người dùng gõ, chỉ đọc ra số lúc lưu.
export type DraftLine = { inventoryItemId: string; qty: string; unitCost: string; countedQty: string }

export type DocumentLineInput = {
  inventoryItemId: string
  qty?: number
  unitCost?: number | null
  countedQty?: number
}

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  receipt: 'Nhập hàng',
  count: 'Kiểm kho',
  writeoff: 'Xuất huỷ',
}

export const KIND_LABEL: Record<InventoryKind, string> = {
  goods: 'Bán nguyên',
  ingredient: 'Nguyên liệu',
}

// Trần khớp SQL: 0 < SL < 1.000.000, tối đa 3 chữ số thập phân; đơn giá 0 … 100.000.000.
const QTY_MAX = 1_000_000
const UNIT_COST_MAX = 100_000_000
// Phần nguyên + (một dấu , hoặc . + 1–3 chữ số). Không dấu trừ, không mũ, không ngăn nghìn.
const QTY_PATTERN = /^\d+(?:[.,]\d{1,3})?$/

// ─── Ô số lượng ────────────────────────────────────────────────────────────────

/** Đọc ô SL đếm (phiếu kiểm): như parseQty nhưng cho phép 0. null khi sai định dạng hoặc ≥ 1.000.000. */
export function parseCountedQty(raw: string): number | null {
  const s = raw.replace(/\s+/g, '')
  if (!QTY_PATTERN.test(s)) return null
  const n = Number(s.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || n >= QTY_MAX) return null
  return n
}

/**
 * Ô số lượng kho: "1,5" = "1.5" = "1.500" = 1,5 · "24" = 24. Rỗng, 0, âm, chữ, quá 3 số lẻ, hai dấu, ≥ 1.000.000
 * → null. Kho không có dấu ngăn nghìn (xem qtyWarning cho chữ cảnh báo dưới ô).
 */
export function parseQty(raw: string): number | null {
  const n = parseCountedQty(raw)
  return n !== null && n > 0 ? n : null
}

/**
 * Chữ cảnh báo dưới ô số lượng, null khi không cần. Hai ca dễ gõ nhầm vì người Việt quen dấu chấm ngăn nghìn:
 * dấu chấm/phẩy đứng trước đúng 3 chữ số ("1.500" — ta hiểu là 1,5) và số lượng ≥ 1.000.
 */
export function qtyWarning(raw: string): string | null {
  const s = raw.replace(/\s+/g, '')
  const n = parseQty(s)
  if (n === null) return null
  if (/^[1-9]\d{0,2}[.,]\d{3}$/.test(s)) {
    return `Đang hiểu là ${formatQty(n)} — số lượng kho không dùng dấu ngăn nghìn`
  }
  if (n >= 1000) return `Số lượng lớn: ${formatQty(n)} — kiểm lại trước khi lưu`
  return null
}

const QTY_FORMAT = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 })

/** 1,5 · 1.200 · -3 (kiểu vi-VN, tối đa 3 chữ số thập phân). */
export function formatQty(n: number): string {
  return QTY_FORMAT.format(n)
}

export function stockStatus(qty: number, minStock: number | null): 'negative' | 'low' | 'ok' {
  if (qty < 0) return 'negative'
  if (minStock !== null && qty < minStock) return 'low'
  return 'ok'
}

export function filterStockRows(
  rows: StockRow[],
  opts: { query: string; kind: 'all' | InventoryKind; showInactive: boolean },
): StockRow[] {
  const q = normalizeSearch(opts.query)
  return rows.filter((r) => {
    if (!opts.showInactive && !r.isActive) return false
    if (opts.kind !== 'all' && r.kind !== opts.kind) return false
    if (!q) return true
    return normalizeSearch(`${r.name} ${r.sku ?? ''}`).includes(q)
  })
}

// ─── Tiền dòng phiếu ──────────────────────────────────────────────────────────

/**
 * Thành tiền dòng = round(SL × đơn giá), nửa lên — khớp SQL `round(qty * unit_cost)` của inventory_post_document.
 * Tính trên số nguyên phần nghìn bằng BigInt: 0,1 × 3 dạng số thực ra 0,30000000000000004, còn trần
 * 999.999,999 × 100.000.000 vượt Number.MAX_SAFE_INTEGER.
 */
export function lineAmount(qty: number, unitCost: number): number {
  const milli = Math.round(qty * 1000)
  if (!Number.isInteger(unitCost)) return Math.round((milli * unitCost) / 1000)
  const product = BigInt(milli) * BigInt(unitCost)
  const negative = product < BigInt(0)
  const abs = negative ? -product : product
  const rounded = (abs + BigInt(500)) / BigInt(1000) // nửa lên, xa số 0 như SQL
  return Number(negative ? -rounded : rounded)
}

export function receiptTotal(lines: { qty: number; unitCost: number }[]): number {
  return lines.reduce((sum, l) => sum + lineAmount(l.qty, l.unitCost), 0)
}

/** Đơn giá trong ô tiền: parseVnd ("10.500" → 10500), 0 … 100.000.000. */
function parseUnitCost(raw: string): number | null {
  const n = parseVnd(raw.trim())
  return n !== null && n <= UNIT_COST_MAX ? n : null
}

/**
 * Đổi các dòng đang gõ thành dòng gửi RPC inventory_post_document. Dòng chưa chọn hàng bị bỏ; phiếu kiểm bỏ thêm
 * dòng để trống ô đếm (không kiểm hàng đó). Lỗi ghi số dòng như người dùng thấy (Dòng 1, 2, …).
 */
export function buildDocumentLines(
  kind: DocKind,
  drafts: DraftLine[],
  opts?: { withCost?: boolean },
): { ok: true; lines: DocumentLineInput[] } | { ok: false; error: string } {
  const lines: DocumentLineInput[] = []
  const seen = new Set<string>()
  for (const [i, d] of drafts.entries()) {
    const label = `Dòng ${i + 1}`
    const itemId = d.inventoryItemId.trim()
    if (!itemId) continue
    if (kind === 'count' && d.countedQty.trim() === '') continue
    if (seen.has(itemId)) return { ok: false, error: `${label}: Một hàng chỉ một dòng trong phiếu` }
    seen.add(itemId)

    if (kind === 'count') {
      const counted = parseCountedQty(d.countedQty)
      if (counted === null) return { ok: false, error: `${label}: Số lượng đếm phải từ 0, tối đa 3 chữ số thập phân` }
      if (!opts?.withCost) {
        lines.push({ inventoryItemId: itemId, countedQty: counted })
        continue
      }
      // Phiếu kiểm đầu kỳ: đơn giá tuỳ chọn, để trống là không có giá.
      let unitCost: number | null = null
      if (d.unitCost.trim() !== '') {
        unitCost = parseUnitCost(d.unitCost)
        if (unitCost === null) return { ok: false, error: `${label}: Đơn giá không hợp lệ` }
      }
      lines.push({ inventoryItemId: itemId, countedQty: counted, unitCost })
      continue
    }

    const qty = parseQty(d.qty)
    if (qty === null) return { ok: false, error: `${label}: Số lượng phải lớn hơn 0, tối đa 3 chữ số thập phân` }
    if (kind === 'writeoff') {
      lines.push({ inventoryItemId: itemId, qty })
      continue
    }
    const unitCost = parseUnitCost(d.unitCost)
    if (unitCost === null) return { ok: false, error: `${label}: Đơn giá không hợp lệ` }
    lines.push({ inventoryItemId: itemId, qty, unitCost })
  }
  if (lines.length === 0) return { ok: false, error: 'Phiếu cần ít nhất một dòng' }
  return { ok: true, lines }
}

// ─── Đọc JSON của RPC ─────────────────────────────────────────────────────────
// numeric có thể về dạng số hoặc chuỗi; dữ liệu hỏng thì bỏ dòng, không ném.

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Số từ JSON (số hoặc chuỗi số). null khi thiếu hoặc hỏng. */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v)
  return null
}

const oneOf = <T extends string>(v: unknown, values: readonly T[]): T | null =>
  typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : null

const INVENTORY_KINDS = ['goods', 'ingredient'] as const
const DOC_KINDS = ['receipt', 'count', 'writeoff'] as const

export function parseStockLevels(raw: unknown): StockRow[] {
  if (!isObj(raw)) return []
  const rows: StockRow[] = []
  for (const r of arr(raw.items)) {
    if (!isObj(r)) continue
    const id = str(r.id)
    const name = strOrNull(r.name)
    const kind = oneOf(r.kind, INVENTORY_KINDS)
    const qty = num(r.qty)
    if (!id || name === null || !kind || qty === null) continue
    rows.push({
      id,
      name,
      unit: strOrNull(r.unit) ?? '',
      kind,
      sku: str(r.sku),
      minStock: num(r.min_stock),
      isActive: r.is_active !== false,
      qty,
      lastUnitCost: num(r.last_unit_cost),
      stockValue: num(r.stock_value) ?? 0,
    })
  }
  return rows
}

function parseSummary(r: unknown): DocSummary | null {
  if (!isObj(r)) return null
  const id = str(r.id)
  const kind = oneOf(r.kind, DOC_KINDS)
  const docNo = str(r.doc_no)
  const status = oneOf(r.status, ['posted', 'voided'] as const)
  if (!id || !kind || !docNo || !status) return null
  return {
    id,
    kind,
    docNo,
    docDate: strOrNull(r.doc_date) ?? '',
    effectiveAt: strOrNull(r.effective_at) ?? '',
    supplierName: str(r.supplier_name),
    note: str(r.note),
    totalAmount: num(r.total_amount) ?? 0,
    paidStatus: oneOf(r.paid_status, ['paid', 'unpaid'] as const),
    paidMethod: oneOf(r.paid_method, ['cash', 'bank'] as const),
    status,
    lineCount: num(r.line_count) ?? 0,
    createdAt: strOrNull(r.created_at) ?? '',
    createdByName: str(r.created_by_name),
    voidedAt: str(r.voided_at),
    voidReason: str(r.void_reason),
    cashBookEntryId: str(r.cash_book_entry_id),
  }
}

export function parseDocuments(raw: unknown): { documents: DocSummary[]; suppliers: string[] } {
  if (!isObj(raw)) return { documents: [], suppliers: [] }
  return {
    documents: arr(raw.documents).map(parseSummary).filter((d): d is DocSummary => d !== null),
    suppliers: arr(raw.suppliers).filter((s): s is string => typeof s === 'string' && s !== ''),
  }
}

export function parseDocument(raw: unknown): DocDetail | null {
  const summary = parseSummary(raw)
  if (!summary || !isObj(raw)) return null
  const lines: DocLine[] = []
  for (const l of arr(raw.lines)) {
    if (!isObj(l)) continue
    const inventoryItemId = str(l.inventory_item_id)
    if (!inventoryItemId) continue
    lines.push({
      inventoryItemId,
      name: strOrNull(l.name) ?? '',
      unit: strOrNull(l.unit) ?? '',
      qty: num(l.qty),
      unitCost: num(l.unit_cost),
      countedQty: num(l.counted_qty),
      systemQty: num(l.system_qty),
      lineAmount: num(l.line_amount) ?? 0,
    })
  }
  return { ...summary, lines }
}

export function parseLedger(raw: unknown): Ledger | null {
  if (!isObj(raw) || !isObj(raw.item)) return null
  const item = raw.item
  const itemId = str(item.id)
  const itemKind = oneOf(item.kind, INVENTORY_KINDS)
  const openingQty = num(raw.opening_qty)
  const closingQty = num(raw.closing_qty)
  if (!itemId || !itemKind || openingQty === null || closingQty === null) return null
  const rows: LedgerRow[] = []
  for (const r of arr(raw.rows)) {
    if (!isObj(r)) continue
    const at = str(r.at)
    const type = oneOf(r.type, [...DOC_KINDS, 'sales'] as const)
    const qtyChange = num(r.qty_change)
    const balance = num(r.balance)
    if (!at || !type || qtyChange === null || balance === null) continue
    rows.push({
      at,
      businessDate: strOrNull(r.business_date) ?? '',
      type,
      documentId: str(r.document_id),
      docNo: str(r.doc_no),
      qtyChange,
      countedQty: num(r.counted_qty),
      balance,
    })
  }
  return {
    item: { id: itemId, name: strOrNull(item.name) ?? '', unit: strOrNull(item.unit) ?? '', kind: itemKind },
    from: strOrNull(raw.from) ?? '',
    to: strOrNull(raw.to) ?? '',
    openingQty,
    closingQty,
    rows,
  }
}

export function parseMenuStock(raw: unknown): MenuStockData | null {
  if (!isObj(raw)) return null
  const goods: MenuStockData['goods'] = []
  for (const g of arr(raw.goods)) {
    if (!isObj(g)) continue
    const id = str(g.id)
    if (!id) continue
    goods.push({ id, name: strOrNull(g.name) ?? '', unit: strOrNull(g.unit) ?? '' })
  }
  const links: MenuStockData['links'] = []
  for (const l of arr(raw.links)) {
    if (!isObj(l)) continue
    const menuItemId = str(l.menu_item_id)
    const inventoryItemId = str(l.inventory_item_id)
    const qtyPerSale = num(l.qty_per_sale)
    if (!menuItemId || !inventoryItemId || qtyPerSale === null) continue
    links.push({ menuItemId, variantId: str(l.variant_id), inventoryItemId, qtyPerSale })
  }
  return { goods, links }
}
