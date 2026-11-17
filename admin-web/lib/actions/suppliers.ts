'use server'

import { revalidatePath } from 'next/cache'
import { requireBackOfficeStoreId } from '@/lib/auth/operator'
import { normalizeDebtPhone } from '@/lib/debts'
import { createClient } from '@/lib/supabase/server'
import {
  parseSupplierDetail,
  SUPPLIER_NAME_MAX,
  SUPPLIER_NOTE_MAX,
  SUPPLIER_VOID_REASON_MAX,
  type SupplierDetail,
} from '@/lib/suppliers'

// Công nợ nhà cung cấp (mig 143–145). Gọi bằng phiên đăng nhập (createClient) vì RPC cần auth.uid() để ghi người trả /
// người huỷ và tự kiểm quyền theo quán. Mọi thao tác chỉ chủ quán + quản lý (guard ở đây báo sớm, RPC kiểm lại).
// Lỗi người dùng trả { ok: false, error }, không ném.

type Fail = { ok: false; error: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_AMOUNT = 2_000_000_000
const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)
const trimOrNull = (s: string | null | undefined) => {
  const t = typeof s === 'string' ? s.trim() : ''
  return t === '' ? null : t
}
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

export async function paySupplier(input: {
  supplierId: string
  amount: number
  method: 'cash' | 'bank'
  documentIds: string[] | null
  note: string | null
  clientRequestId: string
}): Promise<{ ok: true; already: boolean; supplierPaymentId: string; remaining: number } | Fail> {
  if (!isId(input.clientRequestId)) return { ok: false, error: 'Mã trả nợ không hợp lệ' }
  if (!isId(input.supplierId)) return { ok: false, error: 'Mã nhà cung cấp không hợp lệ' }
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > MAX_AMOUNT) {
    return { ok: false, error: 'Số tiền không hợp lệ' }
  }
  if (input.method !== 'cash' && input.method !== 'bank') return { ok: false, error: 'Phương thức không hợp lệ' }
  if (input.documentIds !== null) {
    if (!Array.isArray(input.documentIds)) return { ok: false, error: 'Danh sách phiếu không hợp lệ' }
    if (input.documentIds.length === 0) return { ok: false, error: 'Chọn ít nhất một phiếu' }
    if (!input.documentIds.every(isId)) return { ok: false, error: 'Danh sách phiếu không hợp lệ' }
  }
  const note = trimOrNull(input.note)
  if (note !== null && note.length > SUPPLIER_NOTE_MAX) return { ok: false, error: 'Ghi chú quá dài' }

  try {
    await requireBackOfficeStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('supplier_pay', {
      p_supplier_id: input.supplierId,
      p_amount: input.amount,
      p_method: input.method,
      p_document_ids: input.documentIds,
      p_note: note,
      p_client_request_id: input.clientRequestId,
    })
    if (error) return { ok: false, error: error.message }
    // Không lỗi mà không có kết quả: không biết đã ghi hay chưa → bảo tải lại, đừng đoán.
    const d = data as { already?: unknown; supplier_payment_id?: unknown; remaining?: unknown } | null
    if (!d || typeof d.supplier_payment_id !== 'string') {
      return { ok: false, error: 'Không nhận được kết quả trả nợ, tải lại trang để kiểm tra' }
    }
    revalidatePath('/admin/debts')
    return { ok: true, already: d.already === true, supplierPaymentId: d.supplier_payment_id, remaining: Number(d.remaining) || 0 }
  } catch (e) {
    return { ok: false, error: message(e, 'Không ghi được lần trả nợ') }
  }
}

export async function voidSupplierPayment(input: { paymentId: string; reason: string }): Promise<{ ok: true; already: boolean } | Fail> {
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (!reason) return { ok: false, error: 'Nhập lý do huỷ' }
  if (reason.length > SUPPLIER_VOID_REASON_MAX) return { ok: false, error: 'Lý do quá dài' }
  if (!isId(input.paymentId)) return { ok: false, error: 'Mã lần trả không hợp lệ' }
  try {
    await requireBackOfficeStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('supplier_payment_void', { p_id: input.paymentId, p_reason: reason })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/debts')
    return { ok: true, already: (data as { already?: unknown } | null)?.already === true }
  } catch (e) {
    return { ok: false, error: message(e, 'Không huỷ được lần trả nợ') }
  }
}

export async function saveSupplier(input: {
  supplierId: string | null
  name: string
  phone: string | null
  note: string | null
}): Promise<{ ok: true; supplierId: string } | Fail> {
  if (input.supplierId !== null && !isId(input.supplierId)) return { ok: false, error: 'Mã nhà cung cấp không hợp lệ' }
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : ''
  if (!name) return { ok: false, error: 'Nhập tên nhà cung cấp' }
  if (name.length > SUPPLIER_NAME_MAX) return { ok: false, error: 'Tên nhà cung cấp quá dài' }
  const { phone, error: phoneError } = normalizeDebtPhone(input.phone ?? '')
  if (phoneError) return { ok: false, error: phoneError }
  const note = trimOrNull(input.note)
  if (note !== null && note.length > SUPPLIER_NOTE_MAX) return { ok: false, error: 'Ghi chú quá dài' }

  try {
    // Quán lấy từ operator đã kiểm quyền, KHÔNG nhận từ client.
    const storeId = await requireBackOfficeStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('supplier_upsert', {
      p_store_id: storeId, p_supplier_id: input.supplierId, p_name: name, p_phone: phone, p_note: note,
    })
    if (error) return { ok: false, error: error.message }
    const id = (data as { supplier_id?: unknown } | null)?.supplier_id
    if (typeof id !== 'string') return { ok: false, error: 'Không lưu được nhà cung cấp, tải lại trang' }
    revalidatePath('/admin/debts')
    return { ok: true, supplierId: id }
  } catch (e) {
    return { ok: false, error: message(e, 'Không lưu được nhà cung cấp') }
  }
}

export async function setSupplierActive(supplierId: string, active: boolean): Promise<{ ok: true; isActive: boolean } | Fail> {
  if (!isId(supplierId)) return { ok: false, error: 'Mã nhà cung cấp không hợp lệ' }
  try {
    await requireBackOfficeStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('supplier_set_active', { p_supplier_id: supplierId, p_active: active === true })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/debts')
    return { ok: true, isActive: (data as { is_active?: unknown } | null)?.is_active === true }
  } catch (e) {
    return { ok: false, error: message(e, 'Không đổi được trạng thái nhà cung cấp') }
  }
}

/** Chi tiết một NCC: gọi MỘT lần khi mở ngăn kéo và sau mỗi thao tác (không poll bằng server action). */
export async function loadSupplierDetail(supplierId: string): Promise<{ ok: true; detail: SupplierDetail } | Fail> {
  if (!isId(supplierId)) return { ok: false, error: 'Mã nhà cung cấp không hợp lệ' }
  try {
    await requireBackOfficeStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('supplier_detail', { p_supplier_id: supplierId })
    if (error) return { ok: false, error: error.message }
    const detail = parseSupplierDetail(data)
    if (!detail) return { ok: false, error: 'Không đọc được nhà cung cấp' }
    return { ok: true, detail }
  } catch (e) {
    return { ok: false, error: message(e, 'Không đọc được nhà cung cấp') }
  }
}
