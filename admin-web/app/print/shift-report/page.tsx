import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { ROLE_LABEL } from '@/lib/auth/roles'
import { loadCashShiftReport } from '@/lib/actions/cash-shift-reads'
import { createClient } from '@/lib/supabase/server'
import ShiftReportSlip, { shiftReportPrintable } from './shift-report-slip'

// Phiếu bàn giao ca 80mm (mig 122), mở bằng printDocument({ kind: 'shift_report' }) → printInPlace (iframe ẩn).
// Nằm NGOÀI khung /admin (như /print/day-report: trong khung sẽ in ra cả thanh bên / dựng cả realtime).
// Chủ quán + quản lý + thu ngân; get_cash_shift_report tự chặn thu ngân xem ca không phải mình mở / kết. CHỈ ĐỌC.
export default async function PrintShiftReportPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const operator = await requireAdminPageOrRedirect('pos')
  const { id } = await searchParams
  if (!id) return <div className="p-6 text-sm text-red-600">Thiếu mã ca.</div>

  const now = new Date()
  const supabase = await createClient()
  const [res, { data: store }, { data: auth }] = await Promise.all([
    loadCashShiftReport(id),
    supabase.from('stores').select('name').eq('id', operator.storeId).maybeSingle(),
    supabase.auth.getUser(),
  ])
  if (!res.ok) return <div className="p-6 text-sm text-red-600">Không lấy được phiếu ca: {res.error}</div>
  // Ca đang mở: chưa có số kết ca (server không trả), không tự in.
  if (res.report.status === 'open') {
    return <div className="p-6 text-sm text-slate-700">Ca chưa kết, chưa có phiếu bàn giao</div>
  }
  // Ca đã kết mà thiếu số đã lưu: báo lỗi, KHÔNG in phiếu ghi 0đ (người nhận ca sẽ tưởng két rỗng).
  if (!shiftReportPrintable(res.report)) {
    return <div className="p-6 text-sm text-red-600">Phiếu ca thiếu số tiền đã chốt, không in được. Tải lại hoặc báo MEVO.</div>
  }

  const meta = (auth.user?.user_metadata ?? {}) as { full_name?: string }
  return (
    <ShiftReportSlip
      report={res.report}
      storeName={(store?.name as string | null) ?? ''}
      printedAt={now.toISOString()}
      printedBy={`${meta.full_name?.trim() || auth.user?.email || 'Không rõ'} · ${ROLE_LABEL[operator.role]}`}
    />
  )
}
