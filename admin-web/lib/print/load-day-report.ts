import type { SupabaseClient } from '@supabase/supabase-js'
import type { DayReportSlipProps } from '@/app/print/day-report/day-report-slip'
import { daySummary, parseBillsReport } from '@/lib/bills-report'
import { clampReportDate } from '@/lib/daily-report'

// Dựng props phiếu báo cáo cuối ngày cho trang /print/agent (không có cookie → không dùng loadBillsReport).
// Cố ý chép vài dòng từ /print/day-report/page.tsx thay vì dùng chung: plan B sửa file đó cùng đợt.
export async function loadDayReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any>,
  storeId: string,
  date: string,
  printedBy: string,
  now: Date,
): Promise<{ ok: true; props: DayReportSlipProps } | { ok: false; error: string }> {
  const day = clampReportDate(date, now)
  const [{ data, error }, { data: store }] = await Promise.all([
    client.rpc('get_bills_report', { p_store_id: storeId, p_date: day }),
    client.from('stores').select('name').eq('id', storeId).maybeSingle(),
  ])
  if (error) return { ok: false, error: `Không lấy được báo cáo: ${error.message}` }
  const report = parseBillsReport(data)
  return {
    ok: true,
    props: {
      storeName: (store?.name as string | null) ?? '',
      date: day,
      printedAt: now.toISOString(),
      printedBy,
      totals: report.totals,
      summary: daySummary(report),
    },
  }
}
