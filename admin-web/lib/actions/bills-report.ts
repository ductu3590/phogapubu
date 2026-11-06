import { createClient } from '@/lib/supabase/server'
import { requirePosOperatorStoreId } from '@/lib/auth/operator'
import { parseBillsReport, type BillsReport } from '@/lib/bills-report'
import { businessToday, clampReportDate, normalizeBusinessDayStart } from '@/lib/daily-report'

// Trang "Hoá đơn & Báo cáo" (A04-1): gọi bằng phiên đăng nhập (không dùng service key) — RPC tự kiểm quyền
// theo auth.uid() (chủ quán + thu ngân). Chỉ dùng từ server component (không 'use server').
export async function loadBillsReport(date: string): Promise<{ ok: true; report: BillsReport } | { ok: false; error: string }> {
  const storeId = await requirePosOperatorStoreId()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_bills_report', { p_store_id: storeId, p_date: date })
  if (error) return { ok: false, error: error.message }
  return { ok: true, report: parseBillsReport(data) }
}

// Đọc qua get_public_store_workflow vì thu ngân không gọi được get_store_workflow_settings.
// Lỗi thì coi như 00:00: giờ này chỉ dùng để chọn ngày mặc định, mốc cắt thật vẫn do server tính.
export async function loadBusinessDayStart(storeId: string): Promise<string> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_public_store_workflow', { p_store_id: storeId })
    if (error || !data) return '00:00'
    return normalizeBusinessDayStart((data as { business_day_start?: unknown }).business_day_start)
  } catch {
    return '00:00'
  }
}

/** Ngày báo cáo từ `?date=`: kẹp về ngày kinh doanh hiện tại, không theo ngày lịch. Trang, Excel, phiếu ngày dùng chung. */
export async function resolveReportDay(
  rawDate: string | undefined,
  now: Date,
): Promise<{ date: string; today: string; isToday: boolean }> {
  const storeId = await requirePosOperatorStoreId()
  const today = businessToday(await loadBusinessDayStart(storeId), now)
  const date = clampReportDate(rawDate, today)
  return { date, today, isToday: date === today }
}
