import { createClient } from '@/lib/supabase/server'
import SettingsClient from './settings-client'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Lấy store của operator (giống các trang khác)
  const storeIdMeta: string | undefined = user.user_metadata?.store_id
  let storeId = storeIdMeta
  if (!storeId) {
    const { data } = await supabase.from('stores').select('id').eq('is_active', true).limit(1).single()
    storeId = data?.id
  }
  if (!storeId) return <p className="p-6 text-gray-400">Chưa có quán nào.</p>

  const { data: store } = await supabase
    .from('stores')
    .select('name, logo_url, payment_methods')
    .eq('id', storeId)
    .single()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">⚙️ Cài đặt quán</h1>
        <p className="text-sm text-gray-500">Tên hiển thị + logo (hiện trên mini-app của khách)</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <SettingsClient
          name={store?.name ?? ''}
          logoUrl={store?.logo_url ?? null}
          paymentMethods={(store?.payment_methods as string[] | null) ?? ['zalopay', 'cash']}
        />
      </div>
    </div>
  )
}
