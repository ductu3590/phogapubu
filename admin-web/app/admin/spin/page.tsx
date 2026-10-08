import { createClient } from '@/lib/supabase/server'
import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import SpinClient from './spin-client'

export default async function SpinPage() {
  const operator = await requireAdminPageOrRedirect('owner')
  const storeId = operator.storeId

  const supabase = await createClient()
  const { data: store } = await supabase
    .from('stores')
    .select('spin_enabled')
    .eq('id', storeId)
    .single()
  const { data: rewards } = await supabase
    .from('spin_rewards')
    .select('id, label, type, weight, is_active, sort_order, discount_type, discount_value, max_discount, voucher_days')
    .eq('store_id', storeId)
    .order('sort_order')

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface px-4 py-4 md:px-6">
        <h1 className="text-xl font-bold text-foreground">Vòng quay may mắn</h1>
        <p className="text-sm text-muted">
          Khách thanh toán xong được quay 1 lần/đơn. Tắt = khách không thấy gì.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <SpinClient
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          enabled={(store as any)?.spin_enabled ?? false}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          initialRewards={(rewards as any[]) ?? []}
        />
      </div>
    </div>
  )
}
