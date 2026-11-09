'use server'

import { revalidatePath } from 'next/cache'
import { requireBackOfficeStoreId, requirePosOperatorStoreId } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import {
  DEBT_NAME_MAX,
  DEBT_NOTE_MAX,
  DEBT_VOID_REASON_MAX,
  normalizeDebtPhone,
  parseDebtAllocations,
  parseDebtCustomerDetail,
  type DebtAllocation,
  type DebtCustomerDetail,
  type DebtCustomerKind,
} from '@/lib/debts'

// Công nợ khách hàng (mig 123). Gọi bằng phiên đăng nhập (createClient) vì RPC cần auth.uid() để ghi người thu /
// người huỷ và tự kiểm quyền theo quán. Guard ở đây báo lỗi sớm: thu nợ / xem = chủ quán, quản lý, thu ngân;
// huỷ lần trả, thêm / sửa / ngừng khách = chủ quán, quản lý. Lỗi người dùng trả { ok: false, error }, không ném.

type Fail = { ok: false; error: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_AMOUNT = 2_000_000_000
const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)
const trimOrNull = (s: string | null | undefined) => {
  const t = (s ?? '').trim()
  return t === '' ? null : t
}

export async function collectDebt(input: {
  customerId: string
  amount: number
  method: 'cash' | 'bank'
  billPaymentIds: string[] | null
  note: string | null
  clientRequestId: string
}): Promise<{ ok: true; already: boolean; debtPaymentId: string; allocations: DebtAllocation[]; remaining: number } | Fail> {
  if (typeof input.clientRequestId !== 'string' || !UUID.test(input.clientRequestId)) {
    return { ok: false, error: 'Mã thu nợ không hợp lệ' }
  }
  if (typeof input.customerId !== 'string' || !UUID.test(input.customerId)) return { ok: false, error: 'Mã khách không hợp lệ' }
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > MAX_AMOUNT) {
    return { ok: false, error: 'Số tiền không hợp lệ' }
  }
  if (input.method !== 'cash' && input.method !== 'bank') return { ok: false, error: 'Phương thức không hợp lệ' }
  if (input.billPaymentIds !== null) {
    if (!Array.isArray(input.billPaymentIds)) return { ok: false, error: 'Danh sách bill không hợp lệ' }
    if (input.billPaymentIds.length === 0) return { ok: false, error: 'Chọn ít nhất một bill' }
    if (!input.billPaymentIds.every((id) => typeof id === 'string' && UUID.test(id))) {
      return { ok: false, error: 'Danh sách bill không hợp lệ' }
    }
  }
  const note = trimOrNull(input.note)
  if (note !== null && note.length > DEBT_NOTE_MAX) return { ok: false, error: 'Ghi chú quá dài' }

  try {
    await requirePosOperatorStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('debt_collect', {
      p_customer_id: input.customerId,
      p_amount: input.amount,
      p_method: input.method,
      p_allocations: input.billPaymentIds,
      p_note: note,
      p_client_request_id: input.clientRequestId,
    })
    if (error) return { ok: false, error: error.message }
    // Không lỗi mà không có kết quả: không biết đã ghi hay chưa → bảo tải lại, đừng đoán.
    const d = data as { already?: unknown; debt_payment_id?: unknown; allocations?: unknown; remaining_debt?: unknown } | null
    if (!d || typeof d.debt_payment_id !== 'string') {
      return { ok: false, error: 'Không nhận được kết quả thu nợ, tải lại trang để kiểm tra' }
    }
    revalidatePath('/admin/debts')
    return {
      ok: true,
      already: d.already === true,
      debtPaymentId: d.debt_payment_id,
      allocations: parseDebtAllocations(d.allocations),
      remaining: Number(d.remaining_debt) || 0,
    }
  } catch (e) {
    return { ok: false, error: message(e, 'Không ghi được lần thu nợ') }
  }
}

export async function voidDebtPayment(input: { paymentId: string; reason: string }): Promise<{ ok: true; already: boolean } | Fail> {
  const reason = (input.reason ?? '').trim()
  if (!reason) return { ok: false, error: 'Nhập lý do huỷ' }
  if (reason.length > DEBT_VOID_REASON_MAX) return { ok: false, error: 'Lý do quá dài' }
  if (typeof input.paymentId !== 'string' || !UUID.test(input.paymentId)) return { ok: false, error: 'Mã lần thu nợ không hợp lệ' }
  try {
    await requireBackOfficeStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('debt_payment_void', { p_id: input.paymentId, p_reason: reason })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/debts')
    return { ok: true, already: (data as { already?: unknown } | null)?.already === true }
  } catch (e) {
    return { ok: false, error: message(e, 'Không huỷ được lần thu nợ') }
  }
}

export async function saveDebtCustomer(input: {
  customerId: string | null
  name: string
  phone: string | null
  kind: DebtCustomerKind
  note: string | null
}): Promise<{ ok: true; customerId: string } | Fail> {
  if (input.customerId !== null && (typeof input.customerId !== 'string' || !UUID.test(input.customerId))) {
    return { ok: false, error: 'Mã khách không hợp lệ' }
  }
  const name = (input.name ?? '').trim()
  if (!name) return { ok: false, error: 'Nhập tên khách' }
  if (name.length > DEBT_NAME_MAX) return { ok: false, error: 'Tên khách nợ quá dài' }
  if (input.kind !== 'company' && input.kind !== 'person') return { ok: false, error: 'Loại khách không hợp lệ' }
  const { phone, error: phoneError } = normalizeDebtPhone(input.phone ?? '')
  if (phoneError) return { ok: false, error: phoneError }
  const note = trimOrNull(input.note)
  if (note !== null && note.length > DEBT_NOTE_MAX) return { ok: false, error: 'Ghi chú quá dài' }

  try {
    // Quán lấy từ operator đã kiểm quyền, KHÔNG nhận từ client.
    const storeId = await requireBackOfficeStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('debt_customer_upsert', {
      p_store_id: storeId,
      p_customer_id: input.customerId,
      p_name: name,
      p_phone: phone,
      p_kind: input.kind,
      p_note: note,
    })
    if (error) return { ok: false, error: error.message }
    const id = (data as { customer_id?: unknown } | null)?.customer_id
    if (typeof id !== 'string') return { ok: false, error: 'Không lưu được khách, tải lại trang' }
    revalidatePath('/admin/debts')
    return { ok: true, customerId: id }
  } catch (e) {
    return { ok: false, error: message(e, 'Không lưu được khách') }
  }
}

export async function setDebtCustomerActive(customerId: string, active: boolean): Promise<{ ok: true; isActive: boolean } | Fail> {
  if (typeof customerId !== 'string' || !UUID.test(customerId)) return { ok: false, error: 'Mã khách không hợp lệ' }
  try {
    await requireBackOfficeStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('debt_customer_set_active', { p_customer_id: customerId, p_active: active === true })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/debts')
    return { ok: true, isActive: (data as { is_active?: unknown } | null)?.is_active === true }
  } catch (e) {
    return { ok: false, error: message(e, 'Không đổi được trạng thái khách') }
  }
}

/** Chi tiết một khách: gọi MỘT lần khi mở (không poll bằng server action). */
export async function loadDebtCustomerDetail(customerId: string): Promise<{ ok: true; detail: DebtCustomerDetail } | Fail> {
  if (typeof customerId !== 'string' || !UUID.test(customerId)) return { ok: false, error: 'Mã khách không hợp lệ' }
  try {
    await requirePosOperatorStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('debt_customer_detail', { p_customer_id: customerId })
    if (error) return { ok: false, error: error.message }
    const detail = parseDebtCustomerDetail(data)
    if (!detail) return { ok: false, error: 'Không đọc được khách nợ' }
    return { ok: true, detail }
  } catch (e) {
    return { ok: false, error: message(e, 'Không đọc được khách nợ') }
  }
}
