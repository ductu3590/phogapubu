import { createClient } from '@/lib/supabase/server'
import {
  parseDebtList,
  type DebtCustomerSummary,
  type DebtShiftSummary,
} from '@/lib/debts'
import { readDebtShiftSummary } from '@/lib/debt-shift-summary'

// Đọc công nợ cho server component (/admin/debts, phiếu bàn giao ca). KHÔNG 'use server': không gọi được từ client.
// RPC gọi bằng phiên đăng nhập và tự kiểm quyền theo quán. `storeId` phải lấy từ operator đã kiểm quyền ở nơi gọi
// (requireAdminPageOrRedirect / require*StoreId), không bao giờ từ URL hay input client.

export async function loadDebtList(storeId: string, onlyOpen: boolean): Promise<
  { ok: true; customers: DebtCustomerSummary[] } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('debt_list', { p_store_id: storeId, p_only_open: onlyOpen })
  if (error) return { ok: false, error: error.message }
  return { ok: true, customers: parseDebtList(data) }
}

/** Công nợ trong một ca (ghi nợ, thu nợ TM / CK). Không đọc được hoặc không có quyền → null (phiếu bỏ khối nợ). */
export async function loadDebtShiftSummary(shiftId: string): Promise<DebtShiftSummary | null> {
  return readDebtShiftSummary(await createClient(), shiftId)
}
