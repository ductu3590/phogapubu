import { requireStaffAreaOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { listOpenTableSessions } from '@/lib/actions/table-session'
import TablesClient from './tables-client'

export default async function StaffTablesPage() {
  const operator = await requireStaffAreaOrRedirect()
  const supabase = await createClient()

  const { data: store } = await supabase
    .from('stores')
    .select('payment_timing')
    .eq('id', operator.storeId)
    .single()

  const res = await listOpenTableSessions()

  return (
    <TablesClient
      storeId={operator.storeId}
      paymentTiming={(store?.payment_timing as 'prepay' | 'postpay' | null) ?? 'prepay'}
      initialSessions={res.ok ? res.sessions : []}
      initialError={res.ok ? null : res.error}
    />
  )
}
