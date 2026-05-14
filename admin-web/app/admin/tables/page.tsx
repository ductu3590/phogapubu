import { createClient } from '@/lib/supabase/server'
import TablesClient from './tables-client'

export default async function TablesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const storeIdMeta: string | undefined = user.user_metadata?.store_id
  let storeId = storeIdMeta
  let storeSlug = ''
  const zaloAppId = process.env.NEXT_PUBLIC_ZALO_APP_ID ?? ''

  if (!storeId) {
    const { data } = await supabase.from('stores').select('id, slug').eq('is_active', true).limit(1).single()
    storeId = data?.id
    storeSlug = data?.slug ?? ''
  } else {
    const { data } = await supabase.from('stores').select('slug').eq('id', storeId).single()
    storeSlug = data?.slug ?? ''
  }

  if (!storeId) return <p className="p-6 text-gray-400">Chưa có quán nào.</p>

  const { data: tables } = await supabase
    .from('tables')
    .select('*')
    .eq('store_id', storeId)
    .order('table_number')

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">🪑 Quản lý bàn & QR</h1>
        <p className="text-sm text-gray-500">Tạo bàn, tải QR về in dán lên bàn</p>
      </div>
      <TablesClient
        tables={tables ?? []}
        storeId={storeId}
        storeSlug={storeSlug}
        zaloAppId={zaloAppId}
      />
    </div>
  )
}
