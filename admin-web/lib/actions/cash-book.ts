'use server'

import { revalidatePath } from 'next/cache'
import { requireBackOfficeStoreId, requireOperator } from '@/lib/auth/operator'
import { isBackOfficeRole, isPosRole } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import type { CashBookKind, CashBookMethod, ReportGroup } from '@/lib/cash-book'
import { MAX_CASH_AMOUNT } from '@/lib/cash-common'

// Sổ thu chi (mig 122). Gọi bằng phiên đăng nhập: RPC tự phân quyền (thu ngân chỉ ghi tiền mặt tại két, không huỷ;
// chủ quán + quản lý ghi TM/CK, huỷ, sửa danh mục). Guard ở đây chỉ để báo lỗi sớm; lỗi trả { ok: false, error }.

type Fail = { ok: false; error: string }
const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

export async function createCashBookEntry(input: {
  kind: CashBookKind
  method: CashBookMethod
  categoryId: string
  amount: number
  note: string | null
  counterparty: string | null
  source: 'manual' | 'pos_drawer'
  clientRequestId: string
}): Promise<{ ok: true; id: string; already: boolean } | Fail> {
  if (!input.clientRequestId?.trim()) return { ok: false, error: 'Thiếu mã chống ghi trùng' }
  if (!Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > MAX_CASH_AMOUNT) {
    return { ok: false, error: 'Số tiền phải từ 1đ đến 2.000.000.000đ' }
  }
  if (!input.categoryId) return { ok: false, error: 'Chọn danh mục' }
  try {
    // Ai có quyền POS mới vào được; ghi CK / nguồn manual chỉ chủ quán + quản lý. RPC chặn thật; chặn sớm ở đây chỉ
    // để câu báo rõ ràng, không tốn một lượt gọi DB.
    const operator = await requireOperator()
    if (!isPosRole(operator.role)) throw new Error('Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây')
    if (!isBackOfficeRole(operator.role) && (input.method !== 'cash' || input.source !== 'pos_drawer')) {
      return { ok: false, error: 'Thu ngân chỉ ghi thu/chi tiền mặt ở két' }
    }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('cash_book_create', {
      p_kind: input.kind,
      p_method: input.method,
      p_category_id: input.categoryId,
      p_amount: input.amount,
      p_note: input.note,
      p_counterparty: input.counterparty,
      p_client_request_id: input.clientRequestId,
      p_source: input.source,
    })
    if (error) return { ok: false, error: error.message }
    const d = (data ?? {}) as { id?: unknown; already?: unknown }
    if (typeof d.id !== 'string') return { ok: false, error: 'Không ghi được phiếu, tải lại trang' }
    revalidatePath('/admin/cashbook')
    return { ok: true, id: d.id, already: d.already === true }
  } catch (e) {
    return { ok: false, error: message(e, 'Không ghi được phiếu') }
  }
}

export async function voidCashBookEntry(input: { id: string; reason: string }): Promise<{ ok: true; already: boolean } | Fail> {
  const reason = input.reason?.trim() ?? ''
  if (!reason) return { ok: false, error: 'Cần ghi lý do huỷ' }
  try {
    await requireBackOfficeStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('cash_book_void', { p_id: input.id, p_reason: reason })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/cashbook')
    return { ok: true, already: (data as { already?: unknown } | null)?.already === true }
  } catch (e) {
    return { ok: false, error: message(e, 'Không huỷ được phiếu') }
  }
}

export async function saveCashBookCategory(input: {
  id: string | null
  kind: CashBookKind
  name: string
  reportGroup: ReportGroup | null
}): Promise<{ ok: true; id: string } | Fail> {
  const name = input.name?.trim() ?? ''
  if (!name || name.length > 60) return { ok: false, error: 'Tên danh mục từ 1 đến 60 ký tự' }
  try {
    const storeId = await requireBackOfficeStoreId()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('cash_book_save_category', {
      p_store_id: storeId, p_id: input.id, p_kind: input.kind, p_name: name, p_report_group: input.reportGroup,
    })
    if (error) return { ok: false, error: error.message }
    const id = (data as { id?: unknown } | null)?.id
    if (typeof id !== 'string') return { ok: false, error: 'Không lưu được danh mục, tải lại trang' }
    revalidatePath('/admin/cashbook')
    return { ok: true, id }
  } catch (e) {
    return { ok: false, error: message(e, 'Không lưu được danh mục') }
  }
}

export async function setCashBookCategoryActive(input: { id: string; active: boolean }): Promise<{ ok: true } | Fail> {
  try {
    await requireBackOfficeStoreId()
    const supabase = await createClient()
    const { error } = await supabase.rpc('cash_book_set_category_active', { p_id: input.id, p_active: input.active })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/cashbook')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: message(e, 'Không đổi được danh mục') }
  }
}
