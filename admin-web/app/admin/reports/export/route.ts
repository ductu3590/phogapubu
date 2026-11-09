import type { NextRequest } from 'next/server'
import { requireOperator } from '@/lib/auth/operator'
import { isBackOfficeRole, isPosRole, ROLE_LABEL } from '@/lib/auth/roles'
import { loadReport, resolveReportRange } from '@/lib/actions/reports'
import { isFinanceTabName, parseReportTab } from '@/lib/reports/tabs'
import { shownPeriod } from '@/lib/reports/finance'
import { buildReportWorkbook, reportWorkbookFileName } from '@/lib/reports/reports-xlsx'
import { createClient } from '@/lib/supabase/server'

// Xuất Excel trang Báo cáo: GET /admin/reports/export?tab=&period=&from=&to=&grain= → file .xlsx (một sheet theo tab).
// 4 tab bán hàng: chủ quán + thu ngân + quản lý (isPosRole). 4 tab tài chính: chỉ chủ quán + quản lý
// (isBackOfficeRole) — tab tài chính ở vai khác trả 403, KHÔNG lặng lẽ kẹp về file Theo món.
// Kỳ kẹp theo ngày kinh doanh như trang; số liệu lấy từ RPC (tự kiểm quyền theo auth.uid()); tên quán đọc theo
// store của operator — KHÔNG nhận store_id từ URL. Lỗi trả chữ thường (401 / 403 / 400 / 500), không chuyển hướng.
const plain = (text: string, status: number) => new Response(text, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: NextRequest) {
  let operator: Awaited<ReturnType<typeof requireOperator>>
  try {
    operator = await requireOperator()
  } catch {
    return plain('Chưa đăng nhập', 401)
  }
  if (!isPosRole(operator.role) || !operator.storeId) return plain('Không có quyền', 403)

  const sp = request.nextUrl.searchParams
  const rawTab = sp.get('tab')
  const canSeeFinance = isBackOfficeRole(operator.role)
  // Kiểm trên chuỗi THÔ, trước khi parseReportTab kẹp tab tài chính về 'item'.
  if (isFinanceTabName(rawTab) && !canSeeFinance) return plain('Không có quyền xem báo cáo tài chính', 403)
  const tab = parseReportTab(rawTab ?? undefined, canSeeFinance)
  const grain = tab === 'revenue' && sp.get('grain') === 'month' ? 'month' : 'day'

  const now = new Date()
  let range: Awaited<ReturnType<typeof resolveReportRange>>
  try {
    range = await resolveReportRange(
      { period: sp.get('period') ?? undefined, from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined },
      now,
    )
  } catch {
    return plain('Không xác định được kỳ báo cáo', 400)
  }
  const res = await loadReport(tab, range.from, range.to, grain)
  if (!res.ok) return plain(`Không tải được báo cáo: ${res.error}`, 500)

  const supabase = await createClient()
  const [{ data: store }, { data: auth }] = await Promise.all([
    supabase.from('stores').select('name').eq('id', operator.storeId).maybeSingle(),
    supabase.auth.getUser(),
  ])
  const storeName = (store?.name as string | null) ?? ''
  const meta = (auth.user?.user_metadata ?? {}) as { full_name?: string }
  const exportedBy = `${meta.full_name?.trim() || auth.user?.email || 'Không rõ'} · ${ROLE_LABEL[operator.role]}`

  // Doanh thu chế độ tháng: tên file theo 12 tháng thật của báo cáo (như dòng Kỳ trong file).
  const period = shownPeriod(res.report, range)
  const buffer = await buildReportWorkbook(res.report, { storeName, from: range.from, to: range.to, exportedAt: now, exportedBy }).xlsx.writeBuffer()
  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${reportWorkbookFileName(storeName, tab, period.from, period.to)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
