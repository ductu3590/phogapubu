import { createClient } from '@/lib/supabase/server'
import KitchenLinkClient from './kitchen-link-client'

// Trang quản lý link bếp: sinh / thu hồi token bếp theo quán (Plan 2 — 2b).
export default async function AdminKitchenPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const storeIdMeta: string | undefined = user.user_metadata?.store_id
  let storeId = storeIdMeta
  let storeName = ''

  if (!storeId) {
    const { data } = await supabase
      .from('stores')
      .select('id, name')
      .eq('is_active', true)
      .limit(1)
      .single()
    storeId = data?.id
    storeName = data?.name ?? ''
  } else {
    const { data } = await supabase.from('stores').select('name').eq('id', storeId).single()
    storeName = data?.name ?? ''
  }

  if (!storeId) return <p className="p-6 text-gray-400">Chưa có quán nào.</p>

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
