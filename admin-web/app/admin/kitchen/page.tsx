import { createClient } from '@/lib/supabase/server'
import KitchenLinkClient from './kitchen-link-client'
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { redirect } from 'next/navigation'

// Trang quản lý link bếp: sinh / thu hồi token bếp theo quán (Plan 2 — 2b).
export default async function AdminKitchenPage() {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')
  const storeId = operator.storeId

  const supabase = await createClient()
  const { data } = await supabase.from('stores').select('name').eq('id', storeId).single()
  const storeName = data?.name ?? ''

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">🍳 Màn hình bếp</h1>
        <p className="text-sm text-gray-500">
          Lấy link mở màn hình bếp trên tablet. Mỗi link gắn riêng quán {storeName}.
        </p>
      </div>
      <KitchenLinkClient storeId={storeId} storeName={storeName} />
    </div>
  )
}
