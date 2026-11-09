'use server'

import { revalidatePath } from 'next/cache'
import { requireBackOfficeStoreId, requirePosOperatorStoreId } from '@/lib/auth/operator'
import {
  parseDocument,
  parseDocuments,
  parseLedger,
  type DocDetail,
  type DocKind,
  type DocSummary,
  type DocumentLineInput,
  type InventoryKind,
  type Ledger,
  type StockRow,
} from '@/lib/inventory'
import { readStockLevels } from '@/lib/inventory-server'
import { createClient } from '@/lib/supabase/server'

// Kho (mig 118). Mọi action gọi RPC bằng phiên người dùng (createClient): RPC kiểm lại is_store_back_office /
// is_store_pos_operator nên DB là khoá thật, guard ở đây chỉ để báo lỗi sớm + lấy store_id. store_id luôn lấy từ
// guard, không nhận từ client. Lỗi trả { ok:false, error } (Next production giấu nội dung lỗi ném), không ném.
type Fail = { ok: false; error: string }
const fail = (error: string): Fail => ({ ok: false, error })
const isFail = (v: unknown): v is Fail => !!v && typeof v === 'object' && (v as Fail).ok === false
const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DOC_KINDS: readonly DocKind[] = ['receipt', 'count', 'writeoff']
const BAD_ID = 'Mã không hợp lệ'
const BAD_DATE = 'Ngày không hợp lệ'

const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)
const isDate = (v: unknown): v is string => typeof v === 'string' && DATE_RE.test(v)

/** Chủ quán + quản lý (guard dùng chung của QL). */
async function backOffice(): Promise<string | Fail> {
  try {
    return await requireBackOfficeStoreId()
  } catch (e) {
    return fail(message(e, 'Không xác định được tài khoản'))
  }
}

/** Chủ quán + thu ngân + quản lý — chỉ để xem tồn. */
async function posOperator(): Promise<string | Fail> {
  try {
    return await requirePosOperatorStoreId()
  } catch (e) {
    return fail(message(e, 'Không xác định được tài khoản'))
  }
}

/** Gọi một RPC, gói mọi lỗi (lỗi RPC lẫn lỗi ném) thành Fail. */
async function rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown } | Fail> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc(name, args)
    if (error) return fail(error.message)
    return { data }
  } catch (e) {
    return fail(message(e, 'Không kết nối được máy chủ'))
  }
}

const field = (data: unknown, key: string): unknown =>
  data && typeof data === 'object' ? (data as Record<string, unknown>)[key] : undefined

const refreshInventory = () => revalidatePath('/admin/inventory')

// ─── Hàng hoá ─────────────────────────────────────────────────────────────────

export async function saveInventoryItem(input: {
  id: string | null
  name: string
  unit: string
  kind: InventoryKind
  sku: string | null
  minStock: number | null
}): Promise<{ ok: true; id: string } | Fail> {
  const storeId = await backOffice()
  if (isFail(storeId)) return storeId
  if (input.id !== null && !isUuid(input.id)) return fail(BAD_ID)
  // Tên, đơn vị, loại, mã, mức tối thiểu: RPC kiểm và báo lỗi tiếng Việt.
  const r = await rpc('inventory_upsert_item', {
    p_store_id: storeId,
    p_id: input.id,
    p_name: input.name,
    p_unit: input.unit,
    p_kind: input.kind,
    p_sku: input.sku,
    p_min_stock: input.minStock,
  })
  if (isFail(r)) return r
  const id = field(r.data, 'id')
  if (typeof id !== 'string') return fail('Không đọc được kết quả lưu hàng hoá')
  refreshInventory()
  return { ok: true, id }
}

export async function setInventoryItemActive(id: string, active: boolean): Promise<{ ok: true; linksClosed: number } | Fail> {
  const storeId = await backOffice()
  if (isFail(storeId)) return storeId
  if (!isUuid(id)) return fail(BAD_ID)
  if (typeof active !== 'boolean') return fail('Thiếu trạng thái hàng hoá')
  const r = await rpc('inventory_set_item_active', { p_id: id, p_active: active })
  if (isFail(r)) return r
  refreshInventory()
  revalidatePath('/admin/menu') // ngừng dùng đóng liên kết món
  return { ok: true, linksClosed: Number(field(r.data, 'links_closed')) || 0 }
}

// ─── Tồn kho (thu ngân xem được) ──────────────────────────────────────────────

export async function loadInventoryStock(): Promise<{ ok: true; rows: StockRow[] } | Fail> {
  const storeId = await posOperator()
  if (isFail(storeId)) return storeId
  // Giá vốn / giá trị tồn chỉ cho hậu cần: thử guard hậu cần dùng chung (không tự so vai); thu ngân → gỡ ở server.
  const withCost = !isFail(await backOffice())
  return readStockLevels(storeId, { withCost })
}

// ─── Phiếu ────────────────────────────────────────────────────────────────────

export async function loadInventoryDocuments(
  kind: DocKind,
  from: string,
  to: string,
): Promise<{ ok: true; documents: DocSummary[]; suppliers: string[] } | Fail> {
  const storeId = await backOffice()
  if (isFail(storeId)) return storeId
  if (!DOC_KINDS.includes(kind)) return fail('Loại phiếu không hợp lệ')
  if (!isDate(from) || !isDate(to)) return fail(BAD_DATE)
  const r = await rpc('inventory_list_documents', { p_store_id: storeId, p_kind: kind, p_from: from, p_to: to })
  if (isFail(r)) return r
  return { ok: true, ...parseDocuments(r.data) }
}

export async function loadInventoryDocument(id: string): Promise<{ ok: true; document: DocDetail } | Fail> {
  const storeId = await backOffice()
  if (isFail(storeId)) return storeId
  if (!isUuid(id)) return fail(BAD_ID)
  const r = await rpc('inventory_get_document', { p_id: id })
  if (isFail(r)) return r
  const document = parseDocument(r.data)
  if (!document) return fail('Không đọc được phiếu')
  return { ok: true, document }
}

/** Dòng phiếu → JSON của RPC: chỉ gửi trường có giá trị (phiếu kiểm không có giá thì không gửi unit_cost). */
function toRpcLine(l: DocumentLineInput): Record<string, unknown> {
  const out: Record<string, unknown> = { inventory_item_id: l.inventoryItemId }
  if (l.qty !== undefined) out.qty = l.qty
  if (l.countedQty !== undefined) out.counted_qty = l.countedQty
  if (l.unitCost !== undefined && l.unitCost !== null) out.unit_cost = l.unitCost
  return out
}

export async function postInventoryDocument(input: {
  kind: DocKind
  docDate: string | null
  supplierName: string | null
  note: string | null
  paidStatus: 'paid' | 'unpaid' | null
  paidMethod: 'cash' | 'bank' | null
  lines: DocumentLineInput[]
  clientRequestId: string
}): Promise<{ ok: true; id: string; docNo: string; replayed: boolean; beforeCountDocNo: string | null } | Fail> {
  const storeId = await backOffice()
  if (isFail(storeId)) return storeId
  if (!DOC_KINDS.includes(input.kind)) return fail('Loại phiếu không hợp lệ')
  if (input.docDate !== null && !isDate(input.docDate)) return fail(BAD_DATE)
  if (!isUuid(input.clientRequestId)) return fail(BAD_ID)
  const lines = Array.isArray(input.lines) ? input.lines : []
  if (lines.some((l) => !isUuid(l?.inventoryItemId))) return fail(BAD_ID)

  const r = await rpc('inventory_post_document', {
    p_kind: input.kind,
    p_doc: {
      store_id: storeId, // luôn là quán của người đang đăng nhập
      doc_date: input.docDate,
      supplier_name: input.supplierName,
      note: input.note,
      paid_status: input.paidStatus,
      paid_method: input.paidMethod,
    },
    p_lines: lines.map(toRpcLine),
    p_client_request_id: input.clientRequestId,
  })
  if (isFail(r)) return r
  const id = field(r.data, 'id')
  const docNo = field(r.data, 'doc_no')
  if (typeof id !== 'string' || typeof docNo !== 'string') return fail('Không đọc được kết quả lưu phiếu')
  const before = field(r.data, 'before_count_doc_no')
  refreshInventory()
  return {
    ok: true,
    id,
    docNo,
    replayed: field(r.data, 'replayed') === true,
    beforeCountDocNo: typeof before === 'string' ? before : null,
  }
}

export async function voidInventoryDocument(id: string, reason: string): Promise<{ ok: true; already: boolean } | Fail> {
  const storeId = await backOffice()
  if (isFail(storeId)) return storeId
  if (!isUuid(id)) return fail(BAD_ID)
  const trimmed = (reason ?? '').trim()
  if (!trimmed) return fail('Cần lý do huỷ phiếu')
  const r = await rpc('inventory_void_document', { p_id: id, p_reason: trimmed })
  if (isFail(r)) return r
  refreshInventory()
  return { ok: true, already: field(r.data, 'already') === true }
}

// ─── Thẻ kho ──────────────────────────────────────────────────────────────────

export async function loadItemLedger(itemId: string, from: string, to: string): Promise<{ ok: true; ledger: Ledger } | Fail> {
  const storeId = await backOffice()
  if (isFail(storeId)) return storeId
  if (!isUuid(itemId)) return fail(BAD_ID)
  if (!isDate(from) || !isDate(to)) return fail(BAD_DATE)
  const r = await rpc('inventory_item_ledger', { p_item_id: itemId, p_from: from, p_to: to })
  if (isFail(r)) return r
  const ledger = parseLedger(r.data)
  if (!ledger) return fail('Không đọc được thẻ kho')
  return { ok: true, ledger }
}

// ─── Liên kết món (trang Món) ─────────────────────────────────────────────────

export async function setMenuStockLink(input: {
  menuItemId: string
  variantId: string | null
  inventoryItemId: string | null
  qty: number | null
}): Promise<{ ok: true } | Fail> {
  const storeId = await backOffice()
  if (isFail(storeId)) return storeId
  if (!isUuid(input.menuItemId)) return fail(BAD_ID)
  if (input.variantId !== null && !isUuid(input.variantId)) return fail(BAD_ID)
  if (input.inventoryItemId !== null && !isUuid(input.inventoryItemId)) return fail(BAD_ID)
  // Gỡ liên kết (không chọn hàng) thì không gửi số lượng. SL sai: RPC báo lỗi tiếng Việt.
  const r = await rpc('inventory_set_menu_link', {
    p_menu_item_id: input.menuItemId,
    p_variant_id: input.variantId,
    p_inventory_item_id: input.inventoryItemId,
    p_qty: input.inventoryItemId === null ? null : input.qty,
  })
  if (isFail(r)) return r
  revalidatePath('/admin/menu')
  refreshInventory()
  return { ok: true }
}
