import type { SupabaseClient } from '@supabase/supabase-js'
import type { DayReportSlipProps } from '@/app/print/day-report/day-report-slip'
import { businessDayRangeLabel, daySummary, parseBillsReport } from '@/lib/bills-report'

// Dựng props phiếu báo cáo cuối ngày cho trang /print/agent (không có cookie → không dùng loadBillsReport).
// Hai nơi dựng cùng một bộ props với /print/day-report/page.tsx: thêm dòng nào trên phiếu thì sửa cả hai\n// (vd. debtCollections của mig 123 truyền ở CẢ HAI nơi).
export async function loadDayReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any>,
  storeId: string,
  date: string,
  printedBy: string,
  now: Date,
): Promise<{ ok: true; props: DayReportSlipProps } | { ok: false; error: string; transient?: true }> {
  // Ngày đã được kiểm lúc xếp hàng (enqueuePrint). Ở đây chỉ kiểm định dạng: thiếu/sai thì BÁO LỖI, không âm thầm
  // in báo cáo hôm nay (phiếu in nhầm ngày là lỗi nặng hơn không in).
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? new Date(`${date}T00:00:00Z`) : null
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return { ok: false, error: 'Ngày báo cáo không hợp lệ' }
  }
  const day = date
  const [{ data, error }, { data: store, error: storeErr }] = await Promise.all([
    client.rpc('get_bills_report', { p_store_id: storeId, p_date: day }),
    client.from('stores').select('name').eq('id', storeId).maybeSingle(),
  ])
  if (error) return { ok: false, error: `Không lấy được báo cáo: ${error.message}`, transient: true }
  // Tên quán không đọc được thì báo lỗi (tạm thời), không in phiếu thiếu tên quán
  if (storeErr) return { ok: false, error: storeErr.message, transient: true }
  if (!store) return { ok: false, error: 'Không tìm thấy quán' }
  const report = parseBillsReport(data)
  return {
    ok: true,
    props: {
      storeName: (store.name as string | null) ?? '',
      date: day,
      rangeLabel: businessDayRangeLabel(report),
      printedAt: now.toISOString(),
      printedBy,
      totals: report.totals,
      debtCollections: report.debtCollections,
      summary: daySummary(report),
    },
  }
}
