import type { NextRequest } from 'next/server'
import { requireOperator } from '@/lib/auth/operator'
import { isPosRole, ROLE_LABEL } from '@/lib/auth/roles'
import { loadReport, resolveReportRange } from '@/lib/actions/reports'
import { parseReportTab } from '@/lib/reports/tabs'
import { buildReportWorkbook, reportWorkbookFileName } from '@/lib/reports/reports-xlsx'
import { createClient } from '@/lib/supabase/server'

// Xuất Excel trang Báo cáo: GET /admin/reports/export?tab=&period=&from=&to= → file .xlsx (một sheet theo tab).
// Part 1: 4 tab bán hàng, chủ quán + thu ngân (vai POS; quản lý vào khi nhánh QL thêm vai vào isPosRole).
// Kỳ kẹp theo ngày kinh doanh như trang; số liệu lấy từ RPC (tự kiểm quyền theo auth.uid()); tên quán đọc theo
// store của operator — KHÔNG nhận store_id từ URL. Part 2: tab tài chính mà vai không được xem thì 403, không đổi tab.
export async function GET(request: NextRequest) {
  let operator: Awaited<ReturnType<typeof requireOperator>>
  try {
    operator = await requireOperator()
  } catch {
    return new Response('Chưa đăng nhập', { status: 401 })
  }
  if (!isPosRole(operator.role) || !operator.storeId) return new Response('Không có quyền', { status: 403 })

  const sp = request.nextUrl.searchParams
  const now = new Date()
  const tab = parseReportTab(sp.get('tab') ?? undefined, false)
  let range: Awaited<ReturnType<typeof resolveReportRange>>
  try {
    range = await resolveReportRange(
      { period: sp.get('period') ?? undefined, from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined },
      now,
    )
  } catch {
    return new Response('Không xác định được kỳ báo cáo', { status: 400 })
  }
  const res = await loadReport(tab, range.from, range.to)
  if (!res.ok) return new Response(`Không tải được báo cáo: ${res.error}`, { status: 500 })

  const supabase = await createClient()
  const [{ data: store }, { data: auth }] = await Promise.all([
    supabase.from('stores').select('name').eq('id', operator.storeId).maybeSingle(),
    supabase.auth.getUser(),
  ])
  const storeName = (store?.name as string | null) ?? ''
  const meta = (auth.user?.user_metadata ?? {}) as { full_name?: string }
  const exportedBy = `${meta.full_name?.trim() || auth.user?.email || 'Không rõ'} · ${ROLE_LABEL[operator.role]}`

  const buffer = await buildReportWorkbook(res.report, { storeName, from: range.from, to: range.to, exportedAt: now, exportedBy }).xlsx.writeBuffer()
  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${reportWorkbookFileName(storeName, tab, range.from, range.to)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
