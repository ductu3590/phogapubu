import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { ROLE_LABEL } from '@/lib/auth/roles'
import { loadBillsReport } from '@/lib/actions/bills-report'
import { clampReportDate } from '@/lib/daily-report'
import { daySummary } from '@/lib/bills-report'
import { createClient } from '@/lib/supabase/server'
import DayReportSlip from './day-report-slip'

// Phiếu báo cáo cuối ngày 80mm (A04-3), mở từ trang Hoá đơn & Báo cáo bằng printInPlace (iframe ẩn).
// Nằm NGOÀI khung /admin (bài học PA-3 + 2026-10-12: trong khung sẽ in ra cả thanh bên / dựng cả realtime).
// Chủ quán + thu ngân. CHỈ ĐỌC.
export default async function PrintDayReportPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const operator = await requireAdminPageOrRedirect('pos')
  const now = new Date()
  const { date: rawDate } = await searchParams
  const date = clampReportDate(rawDate, now)

  const supabase = await createClient()
  const [res, { data: store }, { data: auth }] = await Promise.all([
    loadBillsReport(date),
    supabase.from('stores').select('name').eq('id', operator.storeId).maybeSingle(),
    supabase.auth.getUser(),
  ])
  if (!res.ok) return <div className="p-6 text-sm text-red-600">Không lấy được báo cáo: {res.error}</div>

  const meta = (auth.user?.user_metadata ?? {}) as { full_name?: string }
  return (
    <DayReportSlip
      storeName={(store?.name as string | null) ?? ''}
      date={date}
      printedAt={now.toISOString()}
      printedBy={`${meta.full_name?.trim() || auth.user?.email || 'Không rõ'} · ${ROLE_LABEL[operator.role]}`}
      totals={res.report.totals}
      summary={daySummary(res.report)}
    />
  )
}
