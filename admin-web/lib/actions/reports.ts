import { createClient } from '@/lib/supabase/server'
import { requirePosOperatorStoreId } from '@/lib/auth/operator'
import { businessToday } from '@/lib/daily-report'
import { loadBusinessDayStart } from '@/lib/actions/bills-report'
import { resolveReportPeriod, type ReportPreset } from '@/lib/reports/period'
import { parseSalesReport, type SalesReport } from '@/lib/reports/sales'
import type { ReportTab } from '@/lib/reports/tabs'

// Trang Báo cáo (/admin/reports): gọi RPC bằng phiên đăng nhập (không dùng service key) — RPC tự kiểm quyền
// theo auth.uid(). Chỉ dùng từ server component / route (KHÔNG 'use server': không mở endpoint cho client gọi thẳng).

export const REPORT_RPC: Record<ReportTab, string> = {
  item: 'report_sales_by_item',
  category: 'report_sales_by_category',
  hour: 'report_sales_by_hour',
  voids: 'report_voids',
}

/** Kỳ từ `?period=&from=&to=`, kẹp theo NGÀY KINH DOANH hiện tại của quán (không theo ngày lịch). Trang và Excel dùng chung. */
export async function resolveReportRange(
  sp: { period?: string; from?: string; to?: string },
  now: Date,
): Promise<{ preset: ReportPreset; from: string; to: string; today: string }> {
  const storeId = await requirePosOperatorStoreId()
  const today = businessToday(await loadBusinessDayStart(storeId), now)
  return { ...resolveReportPeriod(sp, today), today }
}

export async function loadReport(
  tab: ReportTab,
  from: string,
  to: string,
): Promise<{ ok: true; report: SalesReport } | { ok: false; error: string }> {
  const storeId = await requirePosOperatorStoreId()
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc(REPORT_RPC[tab], { p_store_id: storeId, p_from: from, p_to: to })
    if (error) return { ok: false, error: error.message }
    return { ok: true, report: parseSalesReport(tab, data) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không đọc được báo cáo' }
  }
}
