import { createClient } from '@/lib/supabase/server'
import KitchenLinkClient from './kitchen-link-client'
import { requireAdminPageOrRedirect } from '@/lib/auth/operator'

// Trang quản lý link bếp: sinh / thu hồi token bếp theo quán (Plan 2 — 2b).
export default async function AdminKitchenPage() {
  const operator = await requireAdminPageOrRedirect('owner')
  const storeId = operator.storeId

  const supabase = await createClient()
  const { data } = await supabase.from('stores').select('name').eq('id', storeId).single()
  const storeName = data?.name ?? ''

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface px-4 py-4 md:px-6">
        <h1 className="text-xl font-bold text-foreground">Màn hình bếp</h1>
        <p className="text-sm text-muted">
          Lấy link mở màn hình bếp trên tablet. Mỗi link gắn riêng quán {storeName}.
        </p>
      </div>
      <KitchenLinkClient storeId={storeId} storeName={storeName} />
    </div>
  )
}
