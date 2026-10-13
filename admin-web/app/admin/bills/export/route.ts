import type { NextRequest } from 'next/server'
import { requireOperator } from '@/lib/auth/operator'
import { isPosRole, ROLE_LABEL } from '@/lib/auth/roles'
import { loadBillsReport } from '@/lib/actions/bills-report'
import { clampReportDate } from '@/lib/daily-report'
import { buildBillsWorkbook, billsWorkbookFileName } from '@/lib/bills-report-xlsx'
import { createClient } from '@/lib/supabase/server'

// Xuất Excel báo cáo ngày (A04-3): GET /admin/bills/export?date=YYYY-MM-DD → file .xlsx.
// Chủ quán + thu ngân. Số liệu lấy từ RPC get_bills_report (tự kiểm quyền theo auth.uid()), tên quán đọc
// theo store của operator — không nhận store_id từ URL.
export async function GET(request: NextRequest) {
  let operator: Awaited<ReturnType<typeof requireOperator>>
  try {
    operator = await requireOperator()
  } catch {
    return new Response('Chưa đăng nhập', { status: 401 })
  }
  if (!isPosRole(operator.role) || !operator.storeId) return new Response('Không có quyền', { status: 403 })

  const now = new Date()
  const date = clampReportDate(request.nextUrl.searchParams.get('date') ?? undefined, now)
  const res = await loadBillsReport(date)
  if (!res.ok) return new Response(`Không tải được báo cáo: ${res.error}`, { status: 500 })

  const supabase = await createClient()
  const [{ data: store }, { data: auth }] = await Promise.all([
    supabase.from('stores').select('name').eq('id', operator.storeId).maybeSingle(),
    supabase.auth.getUser(),
  ])
  const storeName = (store?.name as string | null) ?? ''
  const meta = (auth.user?.user_metadata ?? {}) as { full_name?: string }
  const exportedBy = `${meta.full_name?.trim() || auth.user?.email || 'Không rõ'} · ${ROLE_LABEL[operator.role]}`

  const buffer = await buildBillsWorkbook(res.report, { storeName, date, exportedAt: now, exportedBy }).xlsx.writeBuffer()
  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${billsWorkbookFileName(storeName, date)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
