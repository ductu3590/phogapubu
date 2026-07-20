import { requireStaffAreaOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import StaffOrdersClient from './staff-orders-client'
import { mapStaffOrderRow, STAFF_ORDER_SELECT, ACTIVE_STATUSES } from './types'

export default async function StaffOrdersPage() {
  const operator = await requireStaffAreaOrRedirect()
  const storeId = operator.storeId
  const supabase = await createClient()

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('orders')
    .select(STAFF_ORDER_SELECT)
    .eq('store_id', storeId)
    .in('status', ACTIVE_STATUSES)
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: false })

  const initialOrders = (data ?? []).map(mapStaffOrderRow)

  return <StaffOrdersClient storeId={storeId} initialOrders={initialOrders} />
}
