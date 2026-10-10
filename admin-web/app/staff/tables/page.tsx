import { requireStaffAreaOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { listOpenTableSessions } from '@/lib/actions/table-session'
import TablesClient from './tables-client'
import { isPosRole } from '@/lib/auth/roles'

export default async function StaffTablesPage() {
  const operator = await requireStaffAreaOrRedirect()
  const supabase = await createClient()

  const { data: store } = await supabase
    .from('stores')
    .select('payment_timing')
    .eq('id', operator.storeId)
    .single()

  // Toàn bộ bàn của quán — cần cho màn "Ghép mâm" (bàn trống = bàn không nằm trong phiên nào
  // đang mở, tính ở client từ danh sách phiên trả về).
  const { data: tableRows } = await supabase
    .from('tables')
    .select('id, table_number, area_id')
    .eq('store_id', operator.storeId)
    .eq('is_active', true)

  const allTables = (tableRows ?? [])
    .map((t) => ({ id: t.id as string, table_number: t.table_number as string, area_id: (t.area_id as string | null) ?? null }))
    .sort((a, b) =>
      a.table_number.localeCompare(b.table_number, 'vi', { numeric: true, sensitivity: 'base' }),
    )

  // Khu (mig 097 cho nhân viên đọc) — sheet Ghép mâm / Thêm bàn chia bàn theo khu. Lỗi → một lưới như cũ.
  const [res, { data: areaRows }] = await Promise.all([
    listOpenTableSessions(),
    supabase.from('table_areas').select('id, name, color').eq('store_id', operator.storeId).order('sort_order'),
  ])

  return (
    <TablesClient
      storeId={operator.storeId}
      canClose={isPosRole(operator.role)}
      areas={(areaRows ?? []).map((a) => ({ id: a.id as string, name: a.name as string, color: (a.color as string | null) ?? null }))}
      paymentTiming={(store?.payment_timing as 'prepay' | 'postpay' | null) ?? 'prepay'}
      allTables={allTables}
      initialSessions={res.ok ? res.sessions : []}
      initialError={res.ok ? null : res.error}
    />
  )
}
