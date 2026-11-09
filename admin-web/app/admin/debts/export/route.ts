import type { NextRequest } from 'next/server'
import { requireOperator } from '@/lib/auth/operator'
import { isPosRole, ROLE_LABEL } from '@/lib/auth/roles'
import { resolveReportDay } from '@/lib/actions/bills-report'
import { loadDebtList } from '@/lib/actions/debt-reads'
import { buildDebtsWorkbook, debtsWorkbookFileName } from '@/lib/debts-xlsx'
import { createClient } from '@/lib/supabase/server'

// Xuất Excel công nợ: GET /admin/debts/export[?open=1] → file .xlsx (open=1 = chỉ khách còn nợ, như công tắc trên trang).
// Ai có quyền POS (chủ quán, quản lý, thu ngân) — như trang /admin/debts: số liệu từ debt_list (tự kiểm quyền theo
// auth.uid()). Quán lấy theo operator, KHÔNG nhận store_id từ URL. Lỗi quyền trả 401 / 403 dạng chữ.
export async function GET(request: NextRequest) {
  let operator: Awaited<ReturnType<typeof requireOperator>>
  try {
    operator = await requireOperator()
  } catch {
    return new Response('Chưa đăng nhập', { status: 401 })
  }
  if (!isPosRole(operator.role) || !operator.storeId) return new Response('Không có quyền', { status: 403 })

  const now = new Date()
  const onlyOpen = request.nextUrl.searchParams.get('open') === '1'
  const res = await loadDebtList(operator.storeId, onlyOpen)
  if (!res.ok) return new Response(`Không tải được công nợ: ${res.error}`, { status: 500 })

  // Ngày trên tên file = ngày kinh doanh của quán (mig 111), như các file Excel khác.
  const { today } = await resolveReportDay(undefined, now)
  const supabase = await createClient()
  const [{ data: store }, { data: auth }] = await Promise.all([
    supabase.from('stores').select('name').eq('id', operator.storeId).maybeSingle(),
    supabase.auth.getUser(),
  ])
  const storeName = (store?.name as string | null) ?? ''
  const meta = (auth.user?.user_metadata ?? {}) as { full_name?: string }
  const exportedBy = `${meta.full_name?.trim() || auth.user?.email || 'Không rõ'} · ${ROLE_LABEL[operator.role]}`

  const buffer = await buildDebtsWorkbook(res.customers, { storeName, exportedAt: now, exportedBy }).xlsx.writeBuffer()
  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${debtsWorkbookFileName(storeName, today)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
