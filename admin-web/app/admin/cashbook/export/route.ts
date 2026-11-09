import type { NextRequest } from 'next/server'
import { requireOperator } from '@/lib/auth/operator'
import { isPosRole, ROLE_LABEL } from '@/lib/auth/roles'
import { resolveReportDay } from '@/lib/actions/bills-report'
import { loadCashBookList } from '@/lib/actions/cash-book-reads'
import { parseCashbookFilters } from '@/lib/cash-book'
import { buildCashbookWorkbook, cashbookWorkbookFileName } from '@/lib/cashbook-xlsx'
import { createClient } from '@/lib/supabase/server'

// Xuất Excel sổ thu chi: GET /admin/cashbook/export?from&to&kind&method&category → file .xlsx.
// Ai có quyền POS (chủ quán, quản lý, thu ngân) — như trang /admin/cashbook: số liệu từ cash_book_list (tự kiểm quyền theo
// auth.uid(), thu ngân chỉ nhận phiếu do mình ghi) nên file đúng bằng những gì người đó thấy trên màn hình.
// Quán lấy theo operator, KHÔNG nhận store_id từ URL. Lỗi quyền trả 401 / 403 dạng chữ (không chuyển hướng vào file tải về).
export async function GET(request: NextRequest) {
  let operator: Awaited<ReturnType<typeof requireOperator>>
  try {
    operator = await requireOperator()
  } catch {
    return new Response('Chưa đăng nhập', { status: 401 })
  }
  if (!isPosRole(operator.role) || !operator.storeId) return new Response('Không có quyền', { status: 403 })

  const now = new Date()
  // Cùng cách kẹp ngày với trang: "hôm nay" = ngày kinh doanh của quán (mig 111).
  const { today } = await resolveReportDay(undefined, now)
  const sp = request.nextUrl.searchParams
  const filters = parseCashbookFilters({
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    kind: sp.get('kind') ?? undefined,
    method: sp.get('method') ?? undefined,
    category: sp.get('category') ?? undefined,
  }, today)

  const res = await loadCashBookList(operator.storeId, filters)
  if (!res.ok) return new Response(`Không tải được sổ thu chi: ${res.error}`, { status: 500 })

  const supabase = await createClient()
  const [{ data: store }, { data: auth }] = await Promise.all([
    supabase.from('stores').select('name').eq('id', operator.storeId).maybeSingle(),
    supabase.auth.getUser(),
  ])
  const storeName = (store?.name as string | null) ?? ''
  const meta = (auth.user?.user_metadata ?? {}) as { full_name?: string }
  const exportedBy = `${meta.full_name?.trim() || auth.user?.email || 'Không rõ'} · ${ROLE_LABEL[operator.role]}`

  const buffer = await buildCashbookWorkbook(res, { storeName, filters, exportedAt: now, exportedBy }).xlsx.writeBuffer()
  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${cashbookWorkbookFileName(storeName, filters.from, filters.to)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
