import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { listOpenTableSessions } from '@/lib/actions/table-session'
import type { LayoutTable } from '@/lib/table-layout'
import CashierClient from './cashier-client'

// Màn POS thu ngân — chỉ chủ quán. AdminLayout đã chặn, kiểm lại ở đây cho fail-closed
// theo tầng (page có thể bị render ngoài layout khi Next đổi cách nhóm route).
export default async function CashierPage() {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')

  const supabase = await createClient()

  const { data: store } = await supabase
    .from('stores')
    .select('payment_timing')
    .eq('id', operator.storeId)
    .single()

  const { data: tableRows } = await supabase
    .from('tables')
    .select('id, table_number, pos_x, pos_y')
    .eq('store_id', operator.storeId)
    .eq('is_active', true)

  const tables: LayoutTable[] = (tableRows ?? []).map((t) => ({
    id: t.id as string,
    table_number: t.table_number as string,
    pos_x: (t.pos_x as number | null) ?? null,
    pos_y: (t.pos_y as number | null) ?? null,
  }))

  const res = await listOpenTableSessions()

  return (
    <CashierClient
      storeId={operator.storeId}
      paymentTiming={(store?.payment_timing as 'prepay' | 'postpay' | null) ?? 'prepay'}
      initialTables={tables}
      initialSessions={res.ok ? res.sessions : []}
      initialError={res.ok ? null : res.error}
    />
  )
}
