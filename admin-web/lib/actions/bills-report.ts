import { createClient, createAdminClient } from '@/lib/supabase/server'
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

// Giờ bắt đầu ngày kinh doanh: quyết định ngày mặc định, kẹp ngày, nhãn "Hôm nay", `max` của ô chọn ngày
// và giá trị hiện ở Cài đặt (mốc cắt thật của báo cáo do get_bills_report tính ở server).
// Đọc thẳng bảng bằng service key, KHÔNG qua get_public_store_workflow vì hàm đó lọc is_active = true
// nên quán chưa bật luôn ra 00:00 trong khi báo cáo cắt theo giờ thật. Hàm này không được gọi từ client
// (file không có 'use server'); `storeId` phải luôn lấy từ operator đã kiểm quyền ở nơi gọi.
// Lỗi hoặc thiếu dòng thì coi như 00:00.
export async function loadBusinessDayStart(storeId: string): Promise<string> {
  try {
    const { data, error } = await createAdminClient()
      .from('store_workflow_settings')
      .select('business_day_start')
      .eq('store_id', storeId)
      .maybeSingle()
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
