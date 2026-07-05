import { createClient } from '@/lib/supabase/server'
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { redirect } from 'next/navigation'
import SpinClient from './spin-client'

export default async function SpinPage() {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')
  const storeId = operator.storeId

  const supabase = await createClient()
  const { data: store } = await supabase
    .from('stores')
    .select('spin_enabled')
    .eq('id', storeId)
    .single()
  const { data: rewards } = await supabase
    .from('spin_rewards')
    .select('id, label, type, weight, is_active, sort_order')
    .eq('store_id', storeId)
    .order('sort_order')

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">🎁 Vòng quay may mắn</h1>
        <p className="text-sm text-gray-500">
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
