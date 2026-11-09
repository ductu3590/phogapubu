import { createClient } from '@/lib/supabase/server'
import { requireBackOfficeStoreId, requirePosOperatorStoreId } from '@/lib/auth/operator'
import { businessToday } from '@/lib/daily-report'
import { loadBusinessDayStart } from '@/lib/actions/bills-report'
import { resolveReportPeriod, type ReportPreset } from '@/lib/reports/period'
import { parseSalesReport, type SalesReport } from '@/lib/reports/sales'
import { parseFinanceReport, type FinanceReport, type RevenueGrain } from '@/lib/reports/finance'
import { isFinanceTab, type ReportTab } from '@/lib/reports/tabs'

// Trang Báo cáo (/admin/reports): gọi RPC bằng phiên đăng nhập (không dùng service key) — RPC tự kiểm quyền
// theo auth.uid(). Chỉ dùng từ server component / route (KHÔNG 'use server': không mở endpoint cho client gọi thẳng).
// Đọc MỘT lần mỗi lần điều hướng, không poll.

export type ReportData = SalesReport | FinanceReport

export const REPORT_RPC: Record<ReportTab, string> = {
  item: 'report_sales_by_item',
  category: 'report_sales_by_category',
  hour: 'report_sales_by_hour',
  voids: 'report_voids',
  revenue: 'report_revenue_series',
  cashflow: 'report_cash_flow',
  pnl: 'report_profit_loss',
  debts: 'report_receivables',
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
  grain: RevenueGrain = 'day',
): Promise<{ ok: true; report: ReportData } | { ok: false; error: string }> {
  let storeId = await requirePosOperatorStoreId()
  // Tab tài chính: chỉ chủ quán + quản lý. Kiểm ở đây trước (RPC cũng chặn bằng is_store_back_office) và TRẢ lỗi,
  // không ném: thu ngân gõ tay URL không được làm sập trang.
  if (isFinanceTab(tab)) {
    try {
      storeId = await requireBackOfficeStoreId()
    } catch {
      return { ok: false, error: 'Chỉ chủ quán hoặc quản lý mới xem được báo cáo tài chính' }
    }
  }
  try {
    const supabase = await createClient()
    const args: Record<string, string> = { p_store_id: storeId, p_from: from, p_to: to }
    if (tab === 'revenue') args.p_grain = grain
    const { data, error } = await supabase.rpc(REPORT_RPC[tab], args)
    if (error) return { ok: false, error: error.message }
    return { ok: true, report: isFinanceTab(tab) ? parseFinanceReport(tab, data) : parseSalesReport(tab, data) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không đọc được báo cáo' }
  }
}
