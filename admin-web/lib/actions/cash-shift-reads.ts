import { createAdminClient, createClient } from '@/lib/supabase/server'
import {
  parseCashShiftList,
  parseCashShiftReport,
  type CashShiftListItem,
  type CashShiftReport,
} from '@/lib/cash-shift'

// Đọc ca cho server component (tab Ca ở /admin/bills, /print/shift-report, Cài đặt). KHÔNG 'use server': không gọi
// được từ client. RPC gọi bằng phiên đăng nhập và tự kiểm quyền (thu ngân chỉ ca mình mở hoặc kết). `storeId` phải
// lấy từ operator đã kiểm quyền ở nơi gọi.

export async function loadCashShiftList(storeId: string): Promise<
  { ok: true; required: boolean; shifts: CashShiftListItem[] } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_cash_shifts', { p_store_id: storeId, p_limit: 60 })
  if (error) return { ok: false, error: error.message }
  return { ok: true, ...parseCashShiftList(data) }
}

export async function loadCashShiftReport(shiftId: string): Promise<
  { ok: true; report: CashShiftReport } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_cash_shift_report', { p_shift_id: shiftId })
  if (error) return { ok: false, error: error.message }
  const report = parseCashShiftReport(data)
  if (!report) return { ok: false, error: 'Không đọc được ca' }
  return { ok: true, report }
}

/**
 * Công tắc "Bắt buộc mở ca". Đọc thẳng bảng bằng service key như loadBusinessDayStart (get_public_store_workflow lọc
 * quán is_active nên quán chưa bật luôn ra false). Lỗi / thiếu dòng → false (mặc định của cột).
 * ⚠️ Service key bỏ qua RLS: `storeId` PHẢI lấy từ guard đã kiểm operator (requireAdminPageOrRedirect /
 * require*StoreId), không bao giờ từ tham số URL hay input client.
 */
export async function loadCashShiftRequired(storeId: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient()
      .from('store_workflow_settings')
      .select('require_cash_shift')
      .eq('store_id', storeId)
      .maybeSingle()
    if (error || !data) return false
    return (data as { require_cash_shift?: unknown }).require_cash_shift === true
  } catch {
    return false
  }
}
